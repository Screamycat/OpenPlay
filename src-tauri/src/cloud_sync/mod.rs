use crate::db::Database;
use crate::models::{
    AppConfig, CloudSyncStatus, DeviceStatePayload, ExtensionTombstone, Game, PeerDeviceInfo,
    PortableApiKeys, PortableExtensionsState, PortableGameRecord, PortableUIConfig,
    SyncSummary, SyncedExtensionPackage, TombstoneRecord,
};
use chrono::{Local, TimeZone};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

static EXPORT_RUNNING: AtomicBool = AtomicBool::new(false);
static EXPORT_QUEUED: AtomicBool = AtomicBool::new(false);

pub fn is_sync_settings_enabled(db: &Database) -> bool {
    match db.get_setting("cloud_sync_settings_enabled").ok().flatten() {
        None => true,
        Some(v) => v == "1" || v.eq_ignore_ascii_case("true"),
    }
}

pub fn is_sync_extensions_enabled(db: &Database) -> bool {
    match db.get_setting("cloud_sync_extensions_enabled").ok().flatten() {
        None => true,
        Some(v) => v == "1" || v.eq_ignore_ascii_case("true"),
    }
}

pub fn is_sync_api_keys_enabled(db: &Database) -> bool {
    match db.get_setting("cloud_sync_api_keys_enabled").ok().flatten() {
        None => false,
        Some(v) => v == "1" || v.eq_ignore_ascii_case("true"),
    }
}

/// Coalesces rapid local state mutations into a single debounced background cloud export.
pub fn spawn_background_export(db: Arc<Database>) {
    EXPORT_QUEUED.store(true, Ordering::SeqCst);
    if EXPORT_RUNNING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_ok()
    {
        std::thread::spawn(move || {
            loop {
                std::thread::sleep(std::time::Duration::from_millis(1500));
                if !EXPORT_QUEUED.swap(false, Ordering::SeqCst) {
                    break;
                }
                if let Ok(status) = get_cloud_sync_status(&db) {
                    if status.enabled && status.is_folder_valid {
                        if let Some(folder) = status.folder_path {
                            let p = PathBuf::from(folder);
                            let _ = export_local_device_state(&db, &p);
                        }
                    }
                }
            }
            EXPORT_RUNNING.store(false, Ordering::SeqCst);
            if EXPORT_QUEUED.load(Ordering::SeqCst) {
                spawn_background_export(db);
            }
        });
    }
}

pub fn atomic_write_json<T: serde::Serialize>(path: &Path, data: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let temp_name = format!("{}.tmp.{}", path.to_string_lossy(), uuid::Uuid::new_v4());
    let temp_path = PathBuf::from(temp_name);

    let json_bytes = serde_json::to_vec_pretty(data).map_err(|e| e.to_string())?;
    fs::write(&temp_path, json_bytes).map_err(|e| e.to_string())?;

    let mut renamed = false;
    for _ in 0..3 {
        if fs::rename(&temp_path, path).is_ok() {
            renamed = true;
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }

    if !renamed {
        if let Err(e) = fs::copy(&temp_path, path) {
            let _ = fs::remove_file(&temp_path);
            return Err(format!("Failed to write file {:?}: {}", path, e));
        }
        let _ = fs::remove_file(&temp_path);
    }

    Ok(())
}

pub fn get_local_artwork_cache_dir() -> PathBuf {
    dirs::data_local_dir()
        .map(|p| p.join("OpenPlay").join("custom_artwork"))
        .unwrap_or_else(|| PathBuf::from("OpenPlayCustomArtwork"))
}

/// Parses heterogeneous `last_played` date strings into Unix epoch seconds for monotonic CRDT comparison.
pub fn parse_last_played_epoch(raw: &str) -> Option<i64> {
    let s = raw.trim();
    if s.is_empty() || s.eq_ignore_ascii_case("never") || s == "0" {
        return None;
    }

    if s.chars().all(|c| c.is_ascii_digit()) {
        if let Ok(val) = s.parse::<i64>() {
            if val <= 0 {
                return None;
            }
            if val > 1_000_000_000_000 {
                return Some(val / 1000);
            }
            return Some(val);
        }
    }

    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
        return Some(dt.timestamp());
    }

    for fmt in [
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M",
        "%Y-%m-%dT%H:%M:%S%.f",
    ] {
        if let Ok(ndt) = chrono::NaiveDateTime::parse_from_str(s, fmt) {
            let ts = Local
                .from_local_datetime(&ndt)
                .earliest()
                .map(|dt| dt.timestamp())
                .unwrap_or_else(|| ndt.and_utc().timestamp());
            return Some(ts);
        }
    }

    if let Ok(nd) = chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d") {
        if let Some(ndt) = nd.and_hms_opt(0, 0, 0) {
            let ts = Local
                .from_local_datetime(&ndt)
                .earliest()
                .map(|dt| dt.timestamp())
                .unwrap_or_else(|| ndt.and_utc().timestamp());
            return Some(ts);
        }
    }

    None
}

/// Monotonically merges `last_played` across devices (Max-Timestamp CRDT).
pub fn merge_last_played(local: Option<&str>, peer: Option<&str>) -> Option<String> {
    merge_last_played_with_device(local, None, peer, None).0
}

/// Monotonically merges `last_played` and its originating `last_played_device_id`.
pub fn merge_last_played_with_device(
    local: Option<&str>,
    local_device_id: Option<&str>,
    peer: Option<&str>,
    peer_device_id: Option<&str>,
) -> (Option<String>, Option<String>) {
    let clean_local = local
        .map(|s| s.trim())
        .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("never") && *s != "0");
    let clean_peer = peer
        .map(|s| s.trim())
        .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("never") && *s != "0");

    let clean_local_dev = local_device_id
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let clean_peer_dev = peer_device_id
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    match (clean_local, clean_peer) {
        (None, None) => (None, clean_local_dev),
        (Some(l), None) => (Some(l.to_string()), clean_local_dev),
        (None, Some(p)) => (Some(p.to_string()), clean_peer_dev),
        (Some(l), Some(p)) => match (parse_last_played_epoch(l), parse_last_played_epoch(p)) {
            (Some(le), Some(pe)) => {
                if pe > le {
                    (Some(p.to_string()), clean_peer_dev)
                } else if le > pe {
                    (Some(l.to_string()), clean_local_dev)
                } else if p.len() > l.len() {
                    (Some(p.to_string()), clean_local_dev.or(clean_peer_dev))
                } else {
                    (Some(l.to_string()), clean_local_dev.or(clean_peer_dev))
                }
            }
            (None, Some(_)) => (Some(p.to_string()), clean_peer_dev),
            (Some(_), None) => (Some(l.to_string()), clean_local_dev),
            (None, None) => {
                if p > l {
                    (Some(p.to_string()), clean_peer_dev)
                } else {
                    (Some(l.to_string()), clean_local_dev)
                }
            }
        },
    }
}

fn is_curated_completion_status(status: Option<&str>) -> bool {
    match status.map(|s| s.trim()) {
        Some(s) if !s.is_empty() => !matches!(s, "Auto" | "Not Played" | "Played" | "Playing"),
        _ => false,
    }
}

fn collect_sorted_files(base: &Path, current: &Path, out: &mut Vec<(String, PathBuf)>) {
    let Ok(entries) = fs::read_dir(current) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if name.starts_with(".temp_") {
            continue;
        }
        if path.is_dir() {
            collect_sorted_files(base, &path, out);
        } else if path.is_file() {
            if let Ok(rel) = path.strip_prefix(base) {
                let rel_norm = rel
                    .components()
                    .map(|c| c.as_os_str().to_string_lossy().to_string())
                    .collect::<Vec<_>>()
                    .join("/");
                out.push((rel_norm, path));
            }
        }
    }
}

/// Computes a deterministic SHA-256 digest and latest modification RFC3339 timestamp of a directory's contents.
fn hash_directory(dir: &Path) -> Result<(String, String), String> {
    let mut files = Vec::new();
    collect_sorted_files(dir, dir, &mut files);
    files.sort_by(|a, b| a.0.cmp(&b.0));

    let mut hasher = Sha256::new();
    let mut latest_mtime: Option<std::time::SystemTime> = None;
    let mut buf = [0u8; 64 * 1024];

    for (rel_path, full_path) in &files {
        let meta = fs::metadata(full_path).map_err(|e| e.to_string())?;
        hasher.update(rel_path.as_bytes());
        hasher.update(b"\0");
        hasher.update(meta.len().to_le_bytes());

        let mut file = fs::File::open(full_path).map_err(|e| e.to_string())?;
        loop {
            let n = std::io::Read::read(&mut file, &mut buf).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            hasher.update(&buf[..n]);
        }

        if let Ok(modified) = meta.modified() {
            latest_mtime = Some(match latest_mtime {
                Some(prev) => std::cmp::max(prev, modified),
                None => modified,
            });
        }
    }

    let updated_at = latest_mtime
        .map(|st| chrono::DateTime::<chrono::Utc>::from(st).to_rfc3339())
        .unwrap_or_else(|| "2026-01-01T00:00:00Z".to_string());

    Ok((hex::encode(hasher.finalize()), updated_at))
}

/// Packages an extension directory into an atomic `.zip` file inside `<sync_dir>/<subdir>/<id>.zip`.
fn export_directory_to_zip(src_dir: &Path, dest_zip: &Path) -> Result<(), String> {
    if let Some(parent) = dest_zip.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let mut files = Vec::new();
    collect_sorted_files(src_dir, src_dir, &mut files);
    files.sort_by(|a, b| a.0.cmp(&b.0));

    let temp_zip = PathBuf::from(format!("{}.tmp.{}", dest_zip.to_string_lossy(), uuid::Uuid::new_v4()));
    {
        let file = fs::File::create(&temp_zip).map_err(|e| e.to_string())?;
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        for (rel_path, full_path) in &files {
            zip.start_file(rel_path, options).map_err(|e| e.to_string())?;
            let mut src_file = fs::File::open(full_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut src_file, &mut zip).map_err(|e| e.to_string())?;
        }

        zip.finish().map_err(|e| e.to_string())?;
    }

    let mut renamed = false;
    for _ in 0..3 {
        if fs::rename(&temp_zip, dest_zip).is_ok() {
            renamed = true;
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }

    if !renamed {
        if let Err(e) = fs::copy(&temp_zip, dest_zip) {
            let _ = fs::remove_file(&temp_zip);
            return Err(format!("Failed to write extension zip {:?}: {}", dest_zip, e));
        }
        let _ = fs::remove_file(&temp_zip);
    }

    Ok(())
}

/// Maps a local Steam client appcache image path to its official public Akamai CDN URL.
fn convert_steam_cache_to_cdn(path_str: &str, appid_fallback: Option<&str>) -> Option<String> {
    let normalized = path_str.replace('\\', "/");
    let lower = normalized.to_lowercase();

    if !lower.contains("appcache/librarycache") {
        return None;
    }

    let mut appid = None;
    if let Some(pos) = lower.find("appcache/librarycache/") {
        let remainder = &normalized[pos + "appcache/librarycache/".len()..];
        if let Some(slash_idx) = remainder.find('/') {
            let candidate = &remainder[..slash_idx];
            if candidate.chars().all(|c| c.is_ascii_digit()) && !candidate.is_empty() {
                appid = Some(candidate.to_string());
            }
        } else if let Some(us_idx) = remainder.find('_') {
            let candidate = &remainder[..us_idx];
            if candidate.chars().all(|c| c.is_ascii_digit()) && !candidate.is_empty() {
                appid = Some(candidate.to_string());
            }
        }
    }

    let final_appid = appid.or_else(|| appid_fallback.map(|s| s.to_string()))?;

    if lower.ends_with("library_600x900.jpg") {
        Some(format!(
            "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{}/library_600x900.jpg",
            final_appid
        ))
    } else if lower.ends_with("library_hero.jpg") {
        Some(format!(
            "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{}/library_hero.jpg",
            final_appid
        ))
    } else if lower.ends_with("logo.png") {
        Some(format!(
            "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{}/logo.png",
            final_appid
        ))
    } else if lower.ends_with("header.jpg") {
        Some(format!(
            "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{}/header.jpg",
            final_appid
        ))
    } else {
        None
    }
}

/// Hashes and exports a local artwork file to <sync_dir>/custom_artwork/<sha256>.<ext>
/// and returns the canonical custom URI `custom://<sha256>.<ext>`.
fn export_artwork_if_local(
    sync_dir: &Path,
    image_val: Option<&str>,
    appid_fallback: Option<&str>,
) -> Option<String> {
    let raw = image_val?.trim();
    if raw.is_empty() {
        return None;
    }

    // Remote URLs or data URLs stay as-is
    if raw.starts_with("http://") || raw.starts_with("https://") || raw.starts_with("data:") {
        return Some(raw.to_string());
    }

    // Already a custom:// URI scheme
    if raw.starts_with("custom://") {
        return Some(raw.to_string());
    }

    // If it points into Steam's local client disk cache, convert directly to official public Akamai CDN URL
    if let Some(cdn_url) = convert_steam_cache_to_cdn(raw, appid_fallback) {
        return Some(cdn_url);
    }

    // Check if it's a valid local file path
    let local_file = Path::new(raw);
    if !local_file.exists() || !local_file.is_file() {
        return Some(raw.to_string());
    }

    let stem = local_file.file_stem().and_then(|e| e.to_str()).unwrap_or("");
    let ext = local_file
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();

    let is_already_hex_hash = stem.len() == 64 && stem.chars().all(|c| c.is_ascii_hexdigit());

    let art_filename = if is_already_hex_hash {
        format!("{}.{}", stem, ext)
    } else {
        let mut file = fs::File::open(local_file).ok()?;
        let mut hasher = Sha256::new();
        let mut buf = [0u8; 64 * 1024];
        loop {
            let n = std::io::Read::read(&mut file, &mut buf).ok()?;
            if n == 0 {
                break;
            }
            hasher.update(&buf[..n]);
        }
        let hash_hex = hex::encode(hasher.finalize());
        format!("{}.{}", hash_hex, ext)
    };

    let art_dir = sync_dir.join("custom_artwork");
    let art_dest = art_dir.join(&art_filename);

    if !art_dest.exists() {
        let _ = fs::create_dir_all(&art_dir);
        let _ = fs::copy(local_file, &art_dest);
    }

    Some(format!("custom://{}", art_filename))
}

/// Resolves a peer artwork URI (`custom://<filename>`, Windows path, Steam cache, or `https://...`) into a valid local or CDN path.
pub fn resolve_peer_artwork(
    sync_dir: &Path,
    artwork_uri: Option<&str>,
    appid_fallback: Option<&str>,
    kind: &str,
) -> Option<String> {
    let uri = artwork_uri?.trim();
    if uri.is_empty() {
        // If empty but this is a Steam game, provide official Steam CDN default
        if let Some(aid) = appid_fallback {
            return match kind {
                "hero" => Some(format!("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{}/library_hero.jpg", aid)),
                "logo" => Some(format!("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{}/logo.png", aid)),
                "header" => Some(format!("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{}/header.jpg", aid)),
                _ => Some(format!("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{}/library_600x900.jpg", aid)),
            };
        }
        return None;
    }

    // 1. If it's already an HTTP/HTTPS or data URL, it's portable across all platforms
    if uri.starts_with("http://") || uri.starts_with("https://") || uri.starts_with("data:") {
        return Some(uri.to_string());
    }

    // 2. Extract custom artwork filename if it's custom:// or a path containing custom_artwork
    let custom_filename = if uri.starts_with("custom://") {
        Some(uri["custom://".len()..].to_string())
    } else {
        let norm = uri.replace('\\', "/");
        if norm.to_lowercase().contains("custom_artwork/") {
            norm.split('/').last().map(|s| s.to_string())
        } else {
            None
        }
    };

    if let Some(ref filename) = custom_filename {
        let clean = filename.trim();
        if !clean.is_empty() {
            let local_cache_dir = get_local_artwork_cache_dir();
            let _ = fs::create_dir_all(&local_cache_dir);
            let local_cached_file = local_cache_dir.join(clean);

            if !local_cached_file.exists() {
                let sync_art_file = sync_dir.join("custom_artwork").join(clean);
                if sync_art_file.exists() {
                    let _ = fs::copy(&sync_art_file, &local_cached_file);
                }
            }

            if local_cached_file.exists() {
                return Some(local_cached_file.to_string_lossy().to_string());
            }
        }
    }

    // 3. If it points to Steam client disk cache, convert directly to official public Akamai CDN URL
    if let Some(cdn_url) = convert_steam_cache_to_cdn(uri, appid_fallback) {
        return Some(cdn_url);
    }

    // 4. If this is a Steam game and the URI is a dead Windows path or unresolvable custom URI
    let is_windows_drive_path = uri.len() >= 3 && uri.chars().nth(1) == Some(':') && (uri.chars().nth(2) == Some('\\') || uri.chars().nth(2) == Some('/'));
    if (is_windows_drive_path || uri.starts_with("custom://")) && appid_fallback.is_some() {
        if let Some(aid) = appid_fallback {
            return match kind {
                "hero" => Some(format!("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{}/library_hero.jpg", aid)),
                "logo" => Some(format!("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{}/logo.png", aid)),
                "header" => Some(format!("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{}/header.jpg", aid)),
                _ => Some(format!("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{}/library_600x900.jpg", aid)),
            };
        }
    }

    // 5. Valid local file on current OS
    let local_file = Path::new(uri);
    if local_file.exists() && local_file.is_file() {
        return Some(uri.to_string());
    }

    // If it's a Windows drive path on a non-Windows OS, drop the dead path
    #[cfg(not(target_os = "windows"))]
    if is_windows_drive_path {
        return None;
    }

    Some(uri.to_string())
}

/// Converts local Game model to portable cloud record
fn to_portable_game(sync_dir: &Path, game: &Game) -> PortableGameRecord {
    let pt_map: HashMap<String, u64> = game
        .playtime_by_device
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_else(|| {
            let mut m = HashMap::new();
            if game.playtime_seconds > 0 {
                m.insert("legacy".to_string(), game.playtime_seconds);
            }
            m
        });

    let updated_at = game
        .updated_at
        .clone()
        .unwrap_or_else(|| "1970-01-01T00:00:00Z".to_string());

    let appid = if game.source.eq_ignore_ascii_case("Steam") {
        game.source_id.as_deref()
    } else {
        None
    };

    PortableGameRecord {
        id: game.id.clone(),
        title: game.title.clone(),
        sorting_title: game.sorting_title.clone(),
        source: game.source.clone(),
        source_id: game.source_id.clone(),
        description: game.description.clone(),
        notes: game.notes.clone(),
        user_rating: game.user_rating,
        critic_score: game.critic_score,
        community_score: game.community_score,
        release_date: game.release_date.clone(),
        completion_status: game.completion_status.clone(),
        auto_beaten: game.auto_beaten,
        beaten_prompt_playtime: game.beaten_prompt_playtime,
        last_played: game.last_played.clone(),
        play_count: game.play_count,
        is_favorite: game.is_favorite,
        is_hidden: game.is_hidden,
        cover_image: export_artwork_if_local(sync_dir, game.cover_image.as_deref(), appid),
        background_image: export_artwork_if_local(sync_dir, game.background_image.as_deref(), appid),
        logo_image: export_artwork_if_local(sync_dir, game.logo_image.as_deref(), appid),
        icon_image: export_artwork_if_local(sync_dir, game.icon_image.as_deref(), appid),
        developer: game.developer.clone(),
        publisher: game.publisher.clone(),
        genres: game.genres.clone(),
        features: game.features.clone(),
        tags: game.tags.clone(),
        categories: game.categories.clone(),
        platforms: game.platforms.clone(),
        hltb_main: game.hltb_main.map(|v| v as f64),
        hltb_extra: game.hltb_extra.map(|v| v as f64),
        hltb_completionist: game.hltb_completionist.map(|v| v as f64),
        playtime_by_device: pt_map,
        cloud_save_enabled: game.cloud_save_enabled,
        cloud_save_retention_override: game.cloud_save_retention_override,
        last_played_device_id: game.last_played_device_id.clone(),
        updated_at,
    }
}

fn build_portable_extensions_state(
    db: &Database,
    sync_dir: &Path,
    themes_dir: &Path,
    plugins_dir: &Path,
) -> PortableExtensionsState {
    let active_theme_id = crate::themes::get_active_theme_id(db);
    let mut synced_themes = Vec::new();

    if let Ok(entries) = fs::read_dir(themes_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let manifest_path = path.join("theme.json");
            if !manifest_path.is_file() {
                continue;
            }
            let Ok(raw) = fs::read_to_string(&manifest_path) else {
                continue;
            };
            let Ok(manifest) = serde_json::from_str::<crate::themes::ThemeManifest>(&raw) else {
                continue;
            };
            let theme_id = manifest.id.trim().to_lowercase();
            if theme_id.is_empty() || theme_id == "default" {
                continue;
            }
            if let Ok((sha256, updated_at)) = hash_directory(&path) {
                let dest_zip = sync_dir.join("themes").join(format!("{}.zip", theme_id));
                let hash_key = format!("cloud_ext_hash:theme:{}", theme_id);
                let prev_hash = db.get_setting(&hash_key).ok().flatten();
                if !dest_zip.exists() || prev_hash.as_deref() != Some(sha256.as_str()) {
                    if export_directory_to_zip(&path, &dest_zip).is_ok() {
                        let _ = db.set_setting(&hash_key, &sha256);
                    }
                }
                synced_themes.push(SyncedExtensionPackage {
                    id: theme_id,
                    version: manifest.version,
                    sha256,
                    updated_at,
                });
            }
        }
    }
    synced_themes.sort_by(|a, b| a.id.cmp(&b.id));

    let mut theme_configs = HashMap::new();
    if let Ok(raw_map) = db.get_settings_by_prefix("theme_config:") {
        for (full_key, raw_json) in raw_map {
            if let Some(tid) = full_key.strip_prefix("theme_config:") {
                if let Ok(parsed) = serde_json::from_str::<HashMap<String, serde_json::Value>>(&raw_json) {
                    if !parsed.is_empty() {
                        theme_configs.insert(tid.to_string(), parsed);
                    }
                }
            }
        }
    }

    let mut synced_plugins = Vec::new();
    if let Ok(entries) = fs::read_dir(plugins_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let manifest_path = if path.join("plugin.json").is_file() {
                path.join("plugin.json")
            } else if path.join("manifest.json").is_file() {
                path.join("manifest.json")
            } else {
                continue;
            };
            let Ok(raw) = fs::read_to_string(&manifest_path) else {
                continue;
            };
            let Ok(manifest) = serde_json::from_str::<crate::plugins::PluginManifest>(&raw) else {
                continue;
            };
            let plugin_id = manifest.id.trim().to_lowercase();
            if plugin_id.is_empty() {
                continue;
            }
            if let Ok((sha256, updated_at)) = hash_directory(&path) {
                let dest_zip = sync_dir.join("plugins").join(format!("{}.zip", plugin_id));
                let hash_key = format!("cloud_ext_hash:plugin:{}", plugin_id);
                let prev_hash = db.get_setting(&hash_key).ok().flatten();
                if !dest_zip.exists() || prev_hash.as_deref() != Some(sha256.as_str()) {
                    if export_directory_to_zip(&path, &dest_zip).is_ok() {
                        let _ = db.set_setting(&hash_key, &sha256);
                    }
                }
                synced_plugins.push(SyncedExtensionPackage {
                    id: plugin_id,
                    version: manifest.version,
                    sha256,
                    updated_at,
                });
            }
        }
    }
    synced_plugins.sort_by(|a, b| a.id.cmp(&b.id));

    let mut plugin_configs = HashMap::new();
    if let Ok(raw_map) = db.get_settings_by_prefix("plugin_config:") {
        for (full_key, raw_json) in raw_map {
            if let Some(pid) = full_key.strip_prefix("plugin_config:") {
                if let Ok(parsed) = serde_json::from_str::<HashMap<String, serde_json::Value>>(&raw_json) {
                    if !parsed.is_empty() {
                        plugin_configs.insert(pid.to_string(), parsed);
                    }
                }
            }
        }
    }

    let enabled_plugins = Some(crate::plugins::get_effective_enabled_plugins_in(db, plugins_dir));
    let deleted_themes = crate::themes::get_deleted_theme_tombstones(db);
    let deleted_plugins = crate::plugins::get_deleted_plugin_tombstones(db);

    let has_any_custom_extension_state = active_theme_id != "default"
        || !synced_themes.is_empty()
        || !theme_configs.is_empty()
        || !deleted_themes.is_empty()
        || !synced_plugins.is_empty()
        || !plugin_configs.is_empty()
        || !deleted_plugins.is_empty()
        || db.get_setting("enabled_plugins").ok().flatten().is_some();

    let extensions_updated_at = match db.get_setting("extensions_updated_at").ok().flatten() {
        Some(ts) if !ts.trim().is_empty() => ts,
        _ => {
            if has_any_custom_extension_state {
                let baseline_ts = "2026-01-01T00:00:00Z".to_string();
                let _ = db.set_setting("extensions_updated_at", &baseline_ts);
                baseline_ts
            } else {
                String::new()
            }
        }
    };

    PortableExtensionsState {
        extensions_updated_at,
        active_theme_id: Some(active_theme_id),
        themes: synced_themes,
        theme_configs,
        deleted_themes,
        enabled_plugins,
        plugins: synced_plugins,
        plugin_configs,
        deleted_plugins,
    }
}

fn has_any_api_key(keys: &PortableApiKeys) -> bool {
    keys.steamgriddb_api_key.as_deref().map(|s| !s.trim().is_empty()).unwrap_or(false)
        || keys.igdb_client_id.as_deref().map(|s| !s.trim().is_empty()).unwrap_or(false)
        || keys.igdb_client_secret.as_deref().map(|s| !s.trim().is_empty()).unwrap_or(false)
        || keys.retroachievements_username.as_deref().map(|s| !s.trim().is_empty()).unwrap_or(false)
        || keys.retroachievements_api_key.as_deref().map(|s| !s.trim().is_empty()).unwrap_or(false)
}

/// Exports this device's complete state to <sync_dir>/devices/<device_id>.json
pub fn export_local_device_state(
    db: &Database,
    sync_dir: &Path,
) -> Result<String, String> {
    export_local_device_state_with_dirs(db, sync_dir, None, None)
}

pub fn export_local_device_state_with_dirs(
    db: &Database,
    sync_dir: &Path,
    themes_dir_override: Option<&Path>,
    plugins_dir_override: Option<&Path>,
) -> Result<String, String> {
    let device_id = db.get_or_create_device_id()?;
    let device_name = db.get_device_name();
    let now_utc = chrono::Utc::now().to_rfc3339();

    let games = db.get_all_games().unwrap_or_default();
    let portable_games: Vec<PortableGameRecord> = games
        .iter()
        .map(|g| to_portable_game(sync_dir, g))
        .collect();

    let tombstones = db.get_active_tombstones().unwrap_or_default();

    let sync_settings = is_sync_settings_enabled(db);
    let sync_extensions = is_sync_extensions_enabled(db);
    let sync_api_keys = is_sync_api_keys_enabled(db);

    let app_cfg = db.get_app_config().unwrap_or_default();
    let default_theme_cfg = crate::themes::get_theme_config(db, "default").unwrap_or_default();

    let ui_updated_at = if !sync_settings && !sync_api_keys {
        String::new()
    } else {
        match db.get_setting("ui_updated_at").ok().flatten() {
            Some(ts) if !ts.trim().is_empty() => ts,
            _ => {
                let is_customized = Database::has_portable_config_diff(&AppConfig::default(), &app_cfg)
                    || !default_theme_cfg.is_empty();
                if is_customized {
                    let baseline_ts = "2026-01-01T00:00:00Z".to_string();
                    let _ = db.set_setting("ui_updated_at", &baseline_ts);
                    baseline_ts
                } else {
                    String::new()
                }
            }
        }
    };

    let api_keys = if sync_api_keys {
        let candidate = PortableApiKeys {
            steamgriddb_api_key: app_cfg.steamgriddb_api_key.clone().filter(|s| !s.trim().is_empty()),
            igdb_client_id: app_cfg.igdb_client_id.clone().filter(|s| !s.trim().is_empty()),
            igdb_client_secret: app_cfg.igdb_client_secret.clone().filter(|s| !s.trim().is_empty()),
            retroachievements_username: app_cfg
                .retroachievements_username
                .clone()
                .filter(|s| !s.trim().is_empty()),
            retroachievements_api_key: app_cfg
                .retroachievements_api_key
                .clone()
                .filter(|s| !s.trim().is_empty()),
        };
        if has_any_api_key(&candidate) {
            Some(candidate)
        } else {
            None
        }
    } else {
        None
    };

    let ui_config = if sync_settings {
        PortableUIConfig {
            ui_updated_at,
            active_theme_id: Some(crate::themes::get_active_theme_id(db)),
            theme: app_cfg.theme,
            accent_color: app_cfg.accent_color,
            panel_tint: app_cfg.panel_tint,
            background_blur: app_cfg.background_blur,
            background_opacity: app_cfg.background_opacity,
            modal_backdrop_opacity: app_cfg.modal_backdrop_opacity,
            modal_backdrop_blur: app_cfg.modal_backdrop_blur,
            card_border_radius: app_cfg.card_border_radius,
            enable_card_glow: app_cfg.enable_card_glow,
            glass_intensity: app_cfg.glass_intensity,
            view_mode: app_cfg.view_mode,
            card_width: app_cfg.card_width,
            grid_width_percent: app_cfg.grid_width_percent,
            sort_by: app_cfg.sort_by,
            sort_direction: app_cfg.sort_direction,
            group_by: app_cfg.group_by,
            status_filter: app_cfg.status_filter,
            show_favorites_only: app_cfg.show_favorites_only,
            last_played_date_format: app_cfg.last_played_date_format,
            auto_scan_on_startup: app_cfg.auto_scan_on_startup,
            minimize_on_game_launch: app_cfg.minimize_on_game_launch,
            close_to_tray: app_cfg.close_to_tray,
            trailer_autoplay: app_cfg.trailer_autoplay,
            trailer_muted: app_cfg.trailer_muted,
            merge_duplicates: app_cfg.merge_duplicates,
            unmerged_game_ids: app_cfg.unmerged_game_ids,
            steamgriddb_nsfw: app_cfg.steamgriddb_nsfw,
            sync_on_startup: app_cfg.sync_on_startup,
            periodic_playtime_sync_hours: app_cfg.periodic_playtime_sync_hours,
            backup_frequency: app_cfg.backup_frequency,
            backup_retention_count: app_cfg.backup_retention_count,
            cloud_sync_interval_minutes: app_cfg.cloud_sync_interval_minutes,
            cloud_sync_on_startup: app_cfg.cloud_sync_on_startup,
            cloud_sync_on_game_exit: app_cfg.cloud_sync_on_game_exit,
            cloud_save_retention_count: app_cfg.cloud_save_retention_count,
            default_theme_config: if default_theme_cfg.is_empty() {
                None
            } else {
                Some(default_theme_cfg)
            },
            api_keys,
        }
    } else {
        PortableUIConfig {
            ui_updated_at,
            api_keys,
            ..Default::default()
        }
    };

    let extensions = if sync_extensions {
        let themes_dir = themes_dir_override
            .map(|p| p.to_path_buf())
            .unwrap_or_else(crate::themes::get_themes_dir);
        let plugins_dir = plugins_dir_override
            .map(|p| p.to_path_buf())
            .unwrap_or_else(crate::plugins::get_plugins_dir);
        Some(build_portable_extensions_state(
            db,
            sync_dir,
            &themes_dir,
            &plugins_dir,
        ))
    } else {
        None
    };

    let payload = DeviceStatePayload {
        device_id: device_id.clone(),
        device_name,
        updated_at: now_utc,
        games: portable_games,
        ui_config,
        extensions,
        tombstones,
    };

    let out_dir = sync_dir.join("devices");
    fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;
    let out_path = out_dir.join(format!("{}.json", device_id));

    atomic_write_json(&out_path, &payload)?;

    let _ = prune_orphan_cloud_artwork(sync_dir);

    Ok(device_id)
}

/// Synchronizes with the cloud directory using Two-Pass Tombstones, PN-Counter Playtime,
/// Max-Timestamp `last_played`, Portable Settings LWW, and Theme/Plugin package syncing.
pub fn sync_cloud_directory(
    db: &Database,
    sync_dir: &Path,
) -> Result<SyncSummary, String> {
    sync_cloud_directory_with_dirs(db, sync_dir, None, None)
}

pub fn sync_cloud_directory_with_dirs(
    db: &Database,
    sync_dir: &Path,
    themes_dir_override: Option<&Path>,
    plugins_dir_override: Option<&Path>,
) -> Result<SyncSummary, String> {
    if !sync_dir.exists() || !sync_dir.is_dir() {
        return Err(format!("Cloud sync directory does not exist: {:?}", sync_dir));
    }

    let themes_dir = themes_dir_override
        .map(|p| p.to_path_buf())
        .unwrap_or_else(crate::themes::get_themes_dir);
    let plugins_dir = plugins_dir_override
        .map(|p| p.to_path_buf())
        .unwrap_or_else(crate::plugins::get_plugins_dir);

    let current_device_id = db.get_or_create_device_id()?;
    let now_utc = chrono::Utc::now().to_rfc3339();

    let devices_dir = sync_dir.join("devices");
    if !devices_dir.exists() {
        let _ = fs::create_dir_all(&devices_dir);
    }

    // Ensure local baseline timestamps are initialized before comparing against peers
    let _ = export_local_device_state_with_dirs(
        db,
        sync_dir,
        Some(&themes_dir),
        Some(&plugins_dir),
    );

    // 1. Read all peer device payloads from devices/*.json
    let mut peer_payloads: Vec<DeviceStatePayload> = Vec::new();
    if let Ok(entries) = fs::read_dir(&devices_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(payload) = serde_json::from_str::<DeviceStatePayload>(&content) {
                        if payload.device_id != current_device_id {
                            peer_payloads.push(payload);
                        }
                    }
                }
            }
        }
    }

    let peer_devices_count = peer_payloads.len();
    let mut games_pulled = 0;
    let mut games_deleted = 0;
    let mut extensions_synced = 0;
    let mut settings_synced = false;

    let mut local_games = db.get_all_games().unwrap_or_default();

    // 2. Pass 1: Tombstones Union
    let mut all_peer_tombstones: Vec<TombstoneRecord> = Vec::new();
    for peer in &peer_payloads {
        for t in &peer.tombstones {
            if let Some(existing) = all_peer_tombstones.iter_mut().find(|e| e.id == t.id) {
                if t.deleted_at > existing.deleted_at {
                    *existing = t.clone();
                }
            } else {
                all_peer_tombstones.push(t.clone());
            }
        }
    }

    for t in all_peer_tombstones {
        if let Some(pos) = local_games.iter().position(|g| g.id == t.id) {
            let local_game = &local_games[pos];
            let local_updated = local_game.updated_at.as_deref().unwrap_or("");
            if local_updated > t.deleted_at.as_str() {
                // Local resurrection wins: local metadata edit occurred after deletion
                let _ = db.clear_tombstone(&t.id);
            } else {
                // Tombstone wins: delete local game
                let _ = db.delete_game(&t.id);
                local_games.remove(pos);
                games_deleted += 1;
            }
        } else {
            // Record tombstone locally so future peer scans or rescans don't resurrect it
            let _ = db.record_game_deletion(
                &t.id,
                t.title.as_deref().unwrap_or(""),
                t.source.as_deref().unwrap_or(""),
            );
        }
    }

    // Query active local tombstones after Pass 1
    let local_tombstones = db.get_active_tombstones().unwrap_or_default();

    // 3. Pass 2: CRDT Game Merging
    for peer in &peer_payloads {
        for peer_game in &peer.games {
            // Check tombstone suppression
            if let Some(t) = local_tombstones.iter().find(|t| t.id == peer_game.id) {
                if peer_game.updated_at.as_str() <= t.deleted_at.as_str() {
                    // Suppressed by tombstone
                    continue;
                } else {
                    // Peer update occurred after deletion: clear tombstone
                    let _ = db.clear_tombstone(&peer_game.id);
                }
            }

            // Find matching game locally: Natural Key -> ID -> Title+Source
            let matched_idx = local_games.iter().position(|g| {
                if let (Some(ref p_sid), Some(ref g_sid)) = (&peer_game.source_id, &g.source_id) {
                    if !p_sid.is_empty()
                        && !g_sid.is_empty()
                        && g.source.eq_ignore_ascii_case(&peer_game.source)
                        && g_sid.eq_ignore_ascii_case(p_sid)
                    {
                        return true;
                    }
                }
                if g.id == peer_game.id {
                    return true;
                }
                if g.source.eq_ignore_ascii_case(&peer_game.source)
                    && g.title.trim().eq_ignore_ascii_case(peer_game.title.trim())
                {
                    return true;
                }
                false
            });

            if let Some(idx) = matched_idx {
                let local_game = &mut local_games[idx];

                // Merge Playtime (PN-Counter CRDT)
                let mut local_pt_map: HashMap<String, u64> = local_game
                    .playtime_by_device
                    .as_deref()
                    .and_then(|s| serde_json::from_str(s).ok())
                    .unwrap_or_default();

                if local_pt_map.is_empty() && local_game.playtime_seconds > 0 {
                    local_pt_map.insert("legacy".to_string(), local_game.playtime_seconds);
                }

                for (dev, &pt) in &peer_game.playtime_by_device {
                    let e = local_pt_map.entry(dev.clone()).or_insert(0);
                    *e = std::cmp::max(*e, pt);
                }

                let merged_total_pt: u64 = local_pt_map.values().sum();
                local_game.playtime_seconds = std::cmp::max(local_game.playtime_seconds, merged_total_pt);
                local_game.playtime_by_device =
                    Some(serde_json::to_string(&local_pt_map).unwrap_or_default());

                // Merge Last Played (Max-Timestamp CRDT across formats) + originating device ID
                let (merged_lp, merged_dev_id) = merge_last_played_with_device(
                    local_game.last_played.as_deref(),
                    local_game.last_played_device_id.as_deref(),
                    peer_game.last_played.as_deref(),
                    peer_game.last_played_device_id.as_deref(),
                );
                local_game.last_played = merged_lp;
                local_game.last_played_device_id = merged_dev_id;
                local_game.played_on_other_device = Database::is_other_device_id(
                    local_game.last_played_device_id.as_deref(),
                    &current_device_id,
                );

                // Merge Play Count monotonically
                local_game.play_count = match (local_game.play_count, peer_game.play_count) {
                    (Some(a), Some(b)) => Some(std::cmp::max(a, b)),
                    (Some(a), None) => Some(a),
                    (None, Some(b)) => Some(b),
                    (None, None) => None,
                };

                // Metadata & Completion Status LWW
                let local_updated = local_game.updated_at.as_deref().unwrap_or("");
                if peer_game.updated_at.as_str() > local_updated {
                    local_game.title = peer_game.title.clone();
                    local_game.sorting_title = peer_game.sorting_title.clone();
                    local_game.description = peer_game.description.clone();
                    local_game.notes = peer_game.notes.clone();
                    local_game.user_rating = peer_game.user_rating;
                    local_game.critic_score = peer_game.critic_score;
                    local_game.community_score = peer_game.community_score;
                    local_game.release_date = peer_game.release_date.clone();
                    local_game.completion_status = peer_game.completion_status.clone();
                    local_game.auto_beaten = peer_game.auto_beaten;
                    local_game.beaten_prompt_playtime = peer_game.beaten_prompt_playtime;
                    local_game.is_favorite = peer_game.is_favorite;
                    local_game.is_hidden = peer_game.is_hidden;
                    local_game.developer = peer_game.developer.clone();
                    local_game.publisher = peer_game.publisher.clone();
                    local_game.genres = peer_game.genres.clone();
                    local_game.features = peer_game.features.clone();
                    local_game.tags = peer_game.tags.clone();
                    local_game.categories = peer_game.categories.clone();
                    local_game.platforms = peer_game.platforms.clone();
                    local_game.hltb_main = peer_game.hltb_main.map(|v| v as f32);
                    local_game.hltb_extra = peer_game.hltb_extra.map(|v| v as f32);
                    local_game.hltb_completionist = peer_game.hltb_completionist.map(|v| v as f32);
                    local_game.cloud_save_enabled = peer_game.cloud_save_enabled;
                    local_game.cloud_save_retention_override = peer_game.cloud_save_retention_override;
                    local_game.updated_at = Some(peer_game.updated_at.clone());

                    // Resolve artwork
                    let is_peer_steam = peer_game.source.eq_ignore_ascii_case("Steam");
                    let peer_appid = if is_peer_steam { peer_game.source_id.as_deref() } else { None };

                    if let Some(art) = resolve_peer_artwork(sync_dir, peer_game.cover_image.as_deref(), peer_appid, "cover") {
                        local_game.cover_image = Some(art);
                    }
                    if let Some(art) = resolve_peer_artwork(sync_dir, peer_game.background_image.as_deref(), peer_appid, "hero") {
                        local_game.background_image = Some(art);
                    }
                    if let Some(art) = resolve_peer_artwork(sync_dir, peer_game.logo_image.as_deref(), peer_appid, "logo") {
                        local_game.logo_image = Some(art);
                    }
                    if let Some(art) = resolve_peer_artwork(sync_dir, peer_game.icon_image.as_deref(), peer_appid, "icon") {
                        local_game.icon_image = Some(art);
                    }
                } else if peer_game.updated_at.as_str() == local_updated {
                    // Deterministic tie-breaker when timestamps match: prefer curated completion/beaten state
                    if !is_curated_completion_status(local_game.completion_status.as_deref())
                        && is_curated_completion_status(peer_game.completion_status.as_deref())
                    {
                        local_game.completion_status = peer_game.completion_status.clone();
                    }
                    if !local_game.auto_beaten && peer_game.auto_beaten {
                        local_game.auto_beaten = true;
                        if local_game.beaten_prompt_playtime.is_none() {
                            local_game.beaten_prompt_playtime = peer_game.beaten_prompt_playtime;
                        }
                    }
                    if !local_game.cloud_save_enabled && peer_game.cloud_save_enabled {
                        local_game.cloud_save_enabled = true;
                        if local_game.cloud_save_retention_override.is_none() {
                            local_game.cloud_save_retention_override = peer_game.cloud_save_retention_override;
                        }
                    }
                }

                // Physical paths (is_installed, install_directory, executable_path) are preserved!
                let _ = db.save_game_exact(local_game);
                games_pulled += 1;
            } else {
                // New game from peer!
                let total_pt: u64 = peer_game.playtime_by_device.values().sum();
                let is_peer_steam = peer_game.source.eq_ignore_ascii_case("Steam");
                let peer_appid = if is_peer_steam { peer_game.source_id.as_deref() } else { None };

                let cover = resolve_peer_artwork(sync_dir, peer_game.cover_image.as_deref(), peer_appid, "cover");
                let bg = resolve_peer_artwork(sync_dir, peer_game.background_image.as_deref(), peer_appid, "hero");
                let logo = resolve_peer_artwork(sync_dir, peer_game.logo_image.as_deref(), peer_appid, "logo");
                let icon = resolve_peer_artwork(sync_dir, peer_game.icon_image.as_deref(), peer_appid, "icon");

                let new_game = Game {
                    id: peer_game.id.clone(),
                    title: peer_game.title.clone(),
                    sorting_title: peer_game.sorting_title.clone(),
                    source: peer_game.source.clone(),
                    source_id: peer_game.source_id.clone(),
                    install_directory: None,
                    executable_path: None,
                    launch_arguments: None,
                    is_installed: false, // Discovered from cloud, not locally installed yet
                    is_favorite: peer_game.is_favorite,
                    cover_image: cover,
                    background_image: bg,
                    logo_image: logo,
                    icon_image: icon,
                    developer: peer_game.developer.clone(),
                    publisher: peer_game.publisher.clone(),
                    release_date: peer_game.release_date.clone(),
                    genres: peer_game.genres.clone(),
                    features: peer_game.features.clone(),
                    platforms: peer_game.platforms.clone(),
                    community_score: peer_game.community_score,
                    critic_score: peer_game.critic_score,
                    user_rating: peer_game.user_rating,
                    playtime_seconds: total_pt,
                    last_played: peer_game.last_played.clone(),
                    date_added: Some(now_utc[..10].to_string()),
                    completion_status: peer_game.completion_status.clone(),
                    description: peer_game.description.clone(),
                    notes: peer_game.notes.clone(),
                    links: Vec::new(),
                    screenshots: Vec::new(),
                    trailers: Vec::new(),
                    age_rating: None,
                    series: None,
                    hltb_main: peer_game.hltb_main.map(|v| v as f32),
                    hltb_extra: peer_game.hltb_extra.map(|v| v as f32),
                    hltb_completionist: peer_game.hltb_completionist.map(|v| v as f32),
                    size_on_disk: None,
                    tags: peer_game.tags.clone(),
                    categories: peer_game.categories.clone(),
                    region: None,
                    play_count: peer_game.play_count,
                    is_hidden: peer_game.is_hidden,
                    play_actions: Vec::new(),
                    auto_beaten: peer_game.auto_beaten,
                    beaten_prompt_playtime: peer_game.beaten_prompt_playtime,
                    emulator_id: None,
                    updated_at: Some(peer_game.updated_at.clone()),
                    playtime_by_device: Some(
                        serde_json::to_string(&peer_game.playtime_by_device).unwrap_or_default(),
                    ),
                    cloud_save_enabled: peer_game.cloud_save_enabled,
                    cloud_save_retention_override: peer_game.cloud_save_retention_override,
                    last_played_device_id: peer_game.last_played_device_id.clone(),
                    played_on_other_device: Database::is_other_device_id(
                        peer_game.last_played_device_id.as_deref(),
                        &current_device_id,
                    ),
                };

                let _ = db.save_game_exact(&new_game);
                local_games.push(new_game);
                games_pulled += 1;
            }
        }
    }

    // 4. Pass 3: Themes & Plugins Package + Configuration Sync (run BEFORE UI config so active_theme_id exists on disk)
    if is_sync_extensions_enabled(db) {
        let mut peer_ext_states: Vec<&PortableExtensionsState> = peer_payloads
            .iter()
            .filter_map(|p| p.extensions.as_ref())
            .collect();

        if !peer_ext_states.is_empty() {
            // 4a. Collect union of theme & plugin tombstones across peers
            let mut merged_theme_tombstones: HashMap<String, String> = crate::themes::get_deleted_theme_tombstones(db)
                .into_iter()
                .map(|t| (t.id, t.deleted_at))
                .collect();
            let mut merged_plugin_tombstones: HashMap<String, String> = crate::plugins::get_deleted_plugin_tombstones(db)
                .into_iter()
                .map(|t| (t.id, t.deleted_at))
                .collect();

            for ext in &peer_ext_states {
                for t in &ext.deleted_themes {
                    merged_theme_tombstones
                        .entry(t.id.clone())
                        .and_modify(|curr| {
                            if t.deleted_at > *curr {
                                *curr = t.deleted_at.clone();
                            }
                        })
                        .or_insert_with(|| t.deleted_at.clone());
                }
                for t in &ext.deleted_plugins {
                    merged_plugin_tombstones
                        .entry(t.id.clone())
                        .and_modify(|curr| {
                            if t.deleted_at > *curr {
                                *curr = t.deleted_at.clone();
                            }
                        })
                        .or_insert_with(|| t.deleted_at.clone());
                }
            }

            // Apply theme tombstones locally unless local or a peer has a newer package
            for (tid, del_at) in &merged_theme_tombstones {
                if tid == "default" {
                    continue;
                }
                let newer_peer_exists = peer_ext_states.iter().any(|ext| {
                    ext.themes
                        .iter()
                        .any(|pkg| &pkg.id == tid && pkg.updated_at > *del_at)
                });
                if newer_peer_exists {
                    continue;
                }
                let local_dir = themes_dir.join(tid);
                if local_dir.is_dir() {
                    let local_newer = hash_directory(&local_dir)
                        .map(|(_, mtime)| mtime > *del_at)
                        .unwrap_or(false);
                    if !local_newer {
                        let _ = crate::themes::delete_theme_from_sync(
                            db,
                            tid,
                            del_at,
                            Some(&themes_dir),
                        );
                        extensions_synced += 1;
                    }
                } else {
                    crate::themes::record_theme_tombstone(db, tid, del_at);
                }
            }

            // Apply plugin tombstones locally unless local or a peer has a newer package
            for (pid, del_at) in &merged_plugin_tombstones {
                let newer_peer_exists = peer_ext_states.iter().any(|ext| {
                    ext.plugins
                        .iter()
                        .any(|pkg| &pkg.id == pid && pkg.updated_at > *del_at)
                });
                if newer_peer_exists {
                    continue;
                }
                let local_dir = plugins_dir.join(pid);
                if local_dir.is_dir() {
                    let local_newer = hash_directory(&local_dir)
                        .map(|(_, mtime)| mtime > *del_at)
                        .unwrap_or(false);
                    if !local_newer {
                        let _ = crate::plugins::delete_plugin_from_sync(
                            db,
                            pid,
                            del_at,
                            Some(&plugins_dir),
                        );
                        extensions_synced += 1;
                    }
                } else {
                    crate::plugins::record_plugin_tombstone(db, pid, del_at);
                }
            }

            // 4b. Install new or updated theme packages from <sync_dir>/themes/<id>.zip
            let mut newest_theme_pkgs: HashMap<String, &SyncedExtensionPackage> = HashMap::new();
            for ext in &peer_ext_states {
                for pkg in &ext.themes {
                    if pkg.id == "default" {
                        continue;
                    }
                    newest_theme_pkgs
                        .entry(pkg.id.clone())
                        .and_modify(|curr| {
                            if pkg.updated_at > curr.updated_at {
                                *curr = pkg;
                            }
                        })
                        .or_insert(pkg);
                }
            }

            for (tid, pkg) in newest_theme_pkgs {
                if let Some(del_at) = merged_theme_tombstones.get(&tid) {
                    if pkg.updated_at <= *del_at {
                        continue;
                    }
                }
                let zip_path = sync_dir.join("themes").join(format!("{}.zip", tid));
                if !zip_path.is_file() {
                    continue;
                }
                let local_dir = themes_dir.join(&tid);
                let should_install = if !local_dir.is_dir() {
                    true
                } else if let Ok((local_sha, local_mtime)) = hash_directory(&local_dir) {
                    local_sha != pkg.sha256 && pkg.updated_at > local_mtime
                } else {
                    true
                };

                if should_install {
                    if crate::themes::install_theme_zip_from_sync(db, &zip_path, Some(&themes_dir)).is_ok() {
                        let _ = db.set_setting(&format!("cloud_ext_hash:theme:{}", tid), &pkg.sha256);
                        extensions_synced += 1;
                    }
                }
            }

            // 4c. Install new or updated plugin packages from <sync_dir>/plugins/<id>.zip
            let mut newest_plugin_pkgs: HashMap<String, &SyncedExtensionPackage> = HashMap::new();
            for ext in &peer_ext_states {
                for pkg in &ext.plugins {
                    newest_plugin_pkgs
                        .entry(pkg.id.clone())
                        .and_modify(|curr| {
                            if pkg.updated_at > curr.updated_at {
                                *curr = pkg;
                            }
                        })
                        .or_insert(pkg);
                }
            }

            for (pid, pkg) in newest_plugin_pkgs {
                if let Some(del_at) = merged_plugin_tombstones.get(&pid) {
                    if pkg.updated_at <= *del_at {
                        continue;
                    }
                }
                let zip_path = sync_dir.join("plugins").join(format!("{}.zip", pid));
                if !zip_path.is_file() {
                    continue;
                }
                let local_dir = plugins_dir.join(&pid);
                let should_install = if !local_dir.is_dir() {
                    true
                } else if let Ok((local_sha, local_mtime)) = hash_directory(&local_dir) {
                    local_sha != pkg.sha256 && pkg.updated_at > local_mtime
                } else {
                    true
                };

                if should_install {
                    if crate::plugins::install_plugin_zip_from_sync(db, &zip_path, Some(&plugins_dir)).is_ok() {
                        let _ = db.set_setting(&format!("cloud_ext_hash:plugin:{}", pid), &pkg.sha256);
                        extensions_synced += 1;
                    }
                }
            }

            // 4d. Apply LWW extension state (active theme, theme configs, enabled plugins, plugin configs)
            peer_ext_states.sort_by(|a, b| b.extensions_updated_at.cmp(&a.extensions_updated_at));
            if let Some(newest_ext) = peer_ext_states.first() {
                let local_ext_updated = db
                    .get_setting("extensions_updated_at")
                    .ok()
                    .flatten()
                    .unwrap_or_default();

                if !newest_ext.extensions_updated_at.is_empty()
                    && newest_ext.extensions_updated_at > local_ext_updated
                {
                    if let Some(ref active_id) = newest_ext.active_theme_id {
                        if active_id == "default" || themes_dir.join(active_id).is_dir() {
                            let _ = crate::themes::set_active_theme_from_sync(db, active_id);
                        }
                    }

                    for (tid, cfg_map) in &newest_ext.theme_configs {
                        if let Ok(json) = serde_json::to_string(cfg_map) {
                            let _ = crate::themes::save_theme_config_from_sync(db, tid, &json);
                        }
                    }

                    if let Some(ref enabled_list) = newest_ext.enabled_plugins {
                        let _ = crate::plugins::set_enabled_plugins_from_sync(db, enabled_list);
                    }

                    for (pid, cfg_map) in &newest_ext.plugin_configs {
                        if let Ok(json) = serde_json::to_string(cfg_map) {
                            let _ = crate::plugins::save_plugin_config_from_sync(db, pid, &json);
                        }
                    }

                    let _ = db.set_setting("extensions_updated_at", &newest_ext.extensions_updated_at);
                } else {
                    // Even when local extensions timestamp is newer/equal, adopt configs for newly installed extensions that have no local config yet
                    for (tid, cfg_map) in &newest_ext.theme_configs {
                        if crate::themes::get_theme_config(db, tid).unwrap_or_default().is_empty() && !cfg_map.is_empty() {
                            if let Ok(json) = serde_json::to_string(cfg_map) {
                                let _ = crate::themes::save_theme_config_from_sync(db, tid, &json);
                            }
                        }
                    }
                    for (pid, cfg_map) in &newest_ext.plugin_configs {
                        if crate::plugins::get_plugin_config(db, pid).unwrap_or_default().is_empty() && !cfg_map.is_empty() {
                            if let Ok(json) = serde_json::to_string(cfg_map) {
                                let _ = crate::plugins::save_plugin_config_from_sync(db, pid, &json);
                            }
                        }
                    }
                }
            }
        }
    }

    // 5. Pass 4: Portable Settings & Optional API Keys Syncing
    // If this device has never explicitly set `cloud_sync_api_keys_enabled` and a peer opted into sharing API keys,
    // automatically adopt the opt-in on this device for seamless Device A -> Device B onboarding.
    if db.get_setting("cloud_sync_api_keys_enabled").ok().flatten().is_none() {
        let peer_shared_keys = peer_payloads
            .iter()
            .any(|p| p.ui_config.api_keys.as_ref().map(has_any_api_key).unwrap_or(false));
        if peer_shared_keys {
            let _ = db.set_setting("cloud_sync_api_keys_enabled", "1");
        }
    }

    let sync_settings = is_sync_settings_enabled(db);
    let sync_api_keys = is_sync_api_keys_enabled(db);

    let mut newest_peer_ui: Option<&PortableUIConfig> = None;
    for peer in &peer_payloads {
        if peer.ui_config.ui_updated_at.trim().is_empty() {
            continue;
        }
        if let Some(current_newest) = newest_peer_ui {
            if peer.ui_config.ui_updated_at > current_newest.ui_updated_at {
                newest_peer_ui = Some(&peer.ui_config);
            }
        } else {
            newest_peer_ui = Some(&peer.ui_config);
        }
    }

    if let Some(peer_ui) = newest_peer_ui {
        let local_ui_updated = db
            .get_setting("ui_updated_at")
            .ok()
            .flatten()
            .unwrap_or_default();

        if sync_settings && peer_ui.ui_updated_at > local_ui_updated {
            let mut cfg = db.get_app_config().unwrap_or_default();

            if let Some(ref tid) = peer_ui.active_theme_id {
                if tid == "default" || themes_dir.join(tid).is_dir() {
                    cfg.active_theme_id = Some(tid.clone());
                    let _ = crate::themes::set_active_theme_from_sync(db, tid);
                }
            }
            if peer_ui.theme.is_some() { cfg.theme = peer_ui.theme.clone(); }
            if peer_ui.accent_color.is_some() { cfg.accent_color = peer_ui.accent_color.clone(); }
            if peer_ui.panel_tint.is_some() { cfg.panel_tint = peer_ui.panel_tint.clone(); }
            if peer_ui.background_blur.is_some() { cfg.background_blur = peer_ui.background_blur; }
            if peer_ui.background_opacity.is_some() { cfg.background_opacity = peer_ui.background_opacity; }
            if peer_ui.modal_backdrop_opacity.is_some() { cfg.modal_backdrop_opacity = peer_ui.modal_backdrop_opacity; }
            if peer_ui.modal_backdrop_blur.is_some() { cfg.modal_backdrop_blur = peer_ui.modal_backdrop_blur; }
            if peer_ui.card_border_radius.is_some() { cfg.card_border_radius = peer_ui.card_border_radius.clone(); }
            if peer_ui.enable_card_glow.is_some() { cfg.enable_card_glow = peer_ui.enable_card_glow; }
            if peer_ui.glass_intensity.is_some() { cfg.glass_intensity = peer_ui.glass_intensity.clone(); }
            if peer_ui.view_mode.is_some() { cfg.view_mode = peer_ui.view_mode.clone(); }
            if peer_ui.card_width.is_some() { cfg.card_width = peer_ui.card_width; }
            if peer_ui.grid_width_percent.is_some() { cfg.grid_width_percent = peer_ui.grid_width_percent; }
            if peer_ui.sort_by.is_some() { cfg.sort_by = peer_ui.sort_by.clone(); }
            if peer_ui.sort_direction.is_some() { cfg.sort_direction = peer_ui.sort_direction.clone(); }
            if peer_ui.group_by.is_some() { cfg.group_by = peer_ui.group_by.clone(); }
            if peer_ui.status_filter.is_some() { cfg.status_filter = peer_ui.status_filter.clone(); }
            if peer_ui.show_favorites_only.is_some() { cfg.show_favorites_only = peer_ui.show_favorites_only; }
            if peer_ui.last_played_date_format.is_some() { cfg.last_played_date_format = peer_ui.last_played_date_format.clone(); }
            if peer_ui.auto_scan_on_startup.is_some() { cfg.auto_scan_on_startup = peer_ui.auto_scan_on_startup; }
            if peer_ui.minimize_on_game_launch.is_some() { cfg.minimize_on_game_launch = peer_ui.minimize_on_game_launch; }
            if peer_ui.close_to_tray.is_some() { cfg.close_to_tray = peer_ui.close_to_tray; }
            if peer_ui.trailer_autoplay.is_some() { cfg.trailer_autoplay = peer_ui.trailer_autoplay; }
            if peer_ui.trailer_muted.is_some() { cfg.trailer_muted = peer_ui.trailer_muted; }
            if peer_ui.merge_duplicates.is_some() { cfg.merge_duplicates = peer_ui.merge_duplicates; }
            if peer_ui.unmerged_game_ids.is_some() { cfg.unmerged_game_ids = peer_ui.unmerged_game_ids.clone(); }
            if peer_ui.steamgriddb_nsfw.is_some() { cfg.steamgriddb_nsfw = peer_ui.steamgriddb_nsfw; }
            if peer_ui.sync_on_startup.is_some() { cfg.sync_on_startup = peer_ui.sync_on_startup; }
            if peer_ui.periodic_playtime_sync_hours.is_some() { cfg.periodic_playtime_sync_hours = peer_ui.periodic_playtime_sync_hours; }
            if peer_ui.backup_frequency.is_some() { cfg.backup_frequency = peer_ui.backup_frequency.clone(); }
            if peer_ui.backup_retention_count.is_some() { cfg.backup_retention_count = peer_ui.backup_retention_count; }
            if peer_ui.cloud_sync_interval_minutes.is_some() { cfg.cloud_sync_interval_minutes = peer_ui.cloud_sync_interval_minutes; }
            if peer_ui.cloud_sync_on_startup.is_some() { cfg.cloud_sync_on_startup = peer_ui.cloud_sync_on_startup; }
            if peer_ui.cloud_sync_on_game_exit.is_some() { cfg.cloud_sync_on_game_exit = peer_ui.cloud_sync_on_game_exit; }
            if peer_ui.cloud_save_retention_count.is_some() { cfg.cloud_save_retention_count = peer_ui.cloud_save_retention_count; }

            if let Some(ref def_theme_cfg) = peer_ui.default_theme_config {
                if let Ok(json) = serde_json::to_string(def_theme_cfg) {
                    let _ = crate::themes::save_theme_config_from_sync(db, "default", &json);
                }
            }

            if sync_api_keys {
                if let Some(ref keys) = peer_ui.api_keys {
                    if let Some(ref v) = keys.steamgriddb_api_key {
                        if !v.trim().is_empty() { cfg.steamgriddb_api_key = Some(v.clone()); }
                    }
                    if let Some(ref v) = keys.igdb_client_id {
                        if !v.trim().is_empty() { cfg.igdb_client_id = Some(v.clone()); }
                    }
                    if let Some(ref v) = keys.igdb_client_secret {
                        if !v.trim().is_empty() { cfg.igdb_client_secret = Some(v.clone()); }
                    }
                    if let Some(ref v) = keys.retroachievements_username {
                        if !v.trim().is_empty() { cfg.retroachievements_username = Some(v.clone()); }
                    }
                    if let Some(ref v) = keys.retroachievements_api_key {
                        if !v.trim().is_empty() { cfg.retroachievements_api_key = Some(v.clone()); }
                    }
                }
            }

            let _ = db.save_app_config_from_sync(&cfg, &peer_ui.ui_updated_at);
            settings_synced = true;
        }
    }

    // Backfill missing API keys from any opted-in peer when `sync_api_keys` is enabled
    if sync_api_keys {
        let mut cfg = db.get_app_config().unwrap_or_default();
        let mut keys_updated = false;
        for peer in &peer_payloads {
            if let Some(ref keys) = peer.ui_config.api_keys {
                if cfg.steamgriddb_api_key.as_deref().unwrap_or("").trim().is_empty() {
                    if let Some(ref v) = keys.steamgriddb_api_key {
                        if !v.trim().is_empty() {
                            cfg.steamgriddb_api_key = Some(v.clone());
                            keys_updated = true;
                        }
                    }
                }
                if cfg.igdb_client_id.as_deref().unwrap_or("").trim().is_empty() {
                    if let Some(ref v) = keys.igdb_client_id {
                        if !v.trim().is_empty() {
                            cfg.igdb_client_id = Some(v.clone());
                            keys_updated = true;
                        }
                    }
                }
                if cfg.igdb_client_secret.as_deref().unwrap_or("").trim().is_empty() {
                    if let Some(ref v) = keys.igdb_client_secret {
                        if !v.trim().is_empty() {
                            cfg.igdb_client_secret = Some(v.clone());
                            keys_updated = true;
                        }
                    }
                }
                if cfg.retroachievements_username.as_deref().unwrap_or("").trim().is_empty() {
                    if let Some(ref v) = keys.retroachievements_username {
                        if !v.trim().is_empty() {
                            cfg.retroachievements_username = Some(v.clone());
                            keys_updated = true;
                        }
                    }
                }
                if cfg.retroachievements_api_key.as_deref().unwrap_or("").trim().is_empty() {
                    if let Some(ref v) = keys.retroachievements_api_key {
                        if !v.trim().is_empty() {
                            cfg.retroachievements_api_key = Some(v.clone());
                            keys_updated = true;
                        }
                    }
                }
            }
        }
        if keys_updated {
            let _ = db.save_app_config_from_sync(&cfg, "");
            settings_synced = true;
        }
    }

    // 6. Export our updated state so peer devices discover our latest playtime, settings & extensions
    let _ = export_local_device_state_with_dirs(
        db,
        sync_dir,
        Some(&themes_dir),
        Some(&plugins_dir),
    );
    let games_pushed = db.get_all_games().unwrap_or_default().len();

    // 7. Record last sync timestamp
    let _ = db.set_setting("cloud_sync_last_time", &now_utc);

    let mut details = vec![format!("{} games merged", games_pulled)];
    if games_deleted > 0 {
        details.push(format!("{} deletions pruned", games_deleted));
    }
    if settings_synced {
        details.push("settings synced".to_string());
    }
    if extensions_synced > 0 {
        details.push(format!("{} extensions synced", extensions_synced));
    }

    Ok(SyncSummary {
        success: true,
        games_pulled,
        games_pushed,
        games_deleted,
        extensions_synced,
        settings_synced,
        peer_devices_count,
        timestamp: now_utc,
        message: format!(
            "Sync complete ({}) across {} peer device{}.",
            details.join(", "),
            peer_devices_count,
            if peer_devices_count == 1 { "" } else { "s" }
        ),
    })
}

/// Scans <sync_dir>/devices/*.json to gather all active custom:// URIs and tombstoned extension packages,
/// deleting unreferenced orphan artwork and explicitly deleted extension `.zip` archives.
pub fn prune_orphan_cloud_artwork(sync_dir: &Path) -> Result<usize, String> {
    let devices_dir = sync_dir.join("devices");
    if !devices_dir.exists() {
        return Ok(0);
    }

    let mut active_custom_files = std::collections::HashSet::new();
    let mut live_themes = std::collections::HashSet::new();
    let mut live_plugins = std::collections::HashSet::new();
    let mut tombstoned_themes: HashMap<String, String> = HashMap::new();
    let mut tombstoned_plugins: HashMap<String, String> = HashMap::new();

    if let Ok(entries) = fs::read_dir(&devices_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(payload) = serde_json::from_str::<DeviceStatePayload>(&content) {
                        for g in payload.games {
                            for opt in [&g.cover_image, &g.background_image, &g.logo_image, &g.icon_image] {
                                if let Some(uri) = opt {
                                    if uri.starts_with("custom://") {
                                        active_custom_files.insert(uri[9..].to_string());
                                    }
                                }
                            }
                        }
                        if let Some(ext) = payload.extensions {
                            for pkg in ext.themes {
                                live_themes.insert(pkg.id);
                            }
                            for pkg in ext.plugins {
                                live_plugins.insert(pkg.id);
                            }
                            for ExtensionTombstone { id, deleted_at } in ext.deleted_themes {
                                tombstoned_themes.insert(id, deleted_at);
                            }
                            for ExtensionTombstone { id, deleted_at } in ext.deleted_plugins {
                                tombstoned_plugins.insert(id, deleted_at);
                            }
                        }
                    }
                }
            }
        }
    }

    let mut pruned_count = 0;
    let art_dir = sync_dir.join("custom_artwork");
    if art_dir.exists() {
        if let Ok(entries) = fs::read_dir(&art_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                        if !active_custom_files.contains(name) {
                            let _ = fs::remove_file(&path);
                            pruned_count += 1;
                        }
                    }
                }
            }
        }
    }

    let sync_themes_dir = sync_dir.join("themes");
    if sync_themes_dir.exists() {
        for (tid, _) in &tombstoned_themes {
            if !live_themes.contains(tid) {
                let zip_file = sync_themes_dir.join(format!("{}.zip", tid));
                if zip_file.is_file() {
                    let _ = fs::remove_file(&zip_file);
                    pruned_count += 1;
                }
            }
        }
    }

    let sync_plugins_dir = sync_dir.join("plugins");
    if sync_plugins_dir.exists() {
        for (pid, _) in &tombstoned_plugins {
            if !live_plugins.contains(pid) {
                let zip_file = sync_plugins_dir.join(format!("{}.zip", pid));
                if zip_file.is_file() {
                    let _ = fs::remove_file(&zip_file);
                    pruned_count += 1;
                }
            }
        }
    }

    Ok(pruned_count)
}

/// Lists all peer devices discovered in <sync_dir>/devices/
pub fn get_peer_devices(
    db: &Database,
    sync_dir: &Path,
) -> Result<Vec<PeerDeviceInfo>, String> {
    if !sync_dir.exists() {
        return Ok(Vec::new());
    }

    let current_device_id = db.get_or_create_device_id()?;
    let devices_dir = sync_dir.join("devices");
    if !devices_dir.exists() {
        return Ok(Vec::new());
    }

    let mut peers = Vec::new();
    if let Ok(entries) = fs::read_dir(devices_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(payload) = serde_json::from_str::<DeviceStatePayload>(&content) {
                        let is_current = payload.device_id == current_device_id;
                        peers.push(PeerDeviceInfo {
                            device_id: payload.device_id,
                            device_name: payload.device_name,
                            last_active: payload.updated_at,
                            games_count: payload.games.len(),
                            is_current_device: is_current,
                        });
                    }
                }
            }
        }
    }

    peers.sort_by(|a, b| {
        if a.is_current_device && !b.is_current_device {
            std::cmp::Ordering::Less
        } else if !a.is_current_device && b.is_current_device {
            std::cmp::Ordering::Greater
        } else {
            b.last_active.cmp(&a.last_active)
        }
    });

    Ok(peers)
}

/// Retrieves the current cloud sync status
pub fn get_cloud_sync_status(
    db: &Database,
) -> Result<CloudSyncStatus, String> {
    let device_id = db.get_or_create_device_id()?;
    let device_name = db.get_device_name();
    let enabled_str = db
        .get_setting("cloud_sync_enabled")
        .ok()
        .flatten()
        .unwrap_or_else(|| "0".to_string());
    let enabled = enabled_str == "1" || enabled_str.eq_ignore_ascii_case("true");
    let folder_path = db.get_setting("cloud_sync_folder_path").ok().flatten();
    let last_sync_time = db.get_setting("cloud_sync_last_time").ok().flatten();

    let mut peer_count = 0;
    let mut is_folder_valid = false;

    if let Some(ref path_str) = folder_path {
        let p = Path::new(path_str);
        if p.exists() && p.is_dir() {
            is_folder_valid = true;
            if let Ok(peers) = get_peer_devices(db, p) {
                peer_count = peers.iter().filter(|peer| !peer.is_current_device).count();
            }
        }
    }

    Ok(CloudSyncStatus {
        enabled,
        folder_path,
        device_id,
        device_name,
        last_sync_time,
        peer_count,
        is_folder_valid,
        sync_settings: is_sync_settings_enabled(db),
        sync_extensions: is_sync_extensions_enabled(db),
        sync_api_keys: is_sync_api_keys_enabled(db),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_temp_test_env(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("openplay_sync_test_{}_{}", label, uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn test_steam_cache_conversion() {
        let p1 = r"C:\Program Files (x86)\Steam\appcache\librarycache\812140\library_600x900.jpg";
        let cdn = convert_steam_cache_to_cdn(p1, None);
        assert_eq!(
            cdn.as_deref(),
            Some("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/812140/library_600x900.jpg")
        );

        let p2 = r"C:\Program Files (x86)\Steam\appcache\librarycache\730_library_hero.jpg";
        let cdn2 = convert_steam_cache_to_cdn(p2, None);
        assert_eq!(
            cdn2.as_deref(),
            Some("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/730/library_hero.jpg")
        );
    }

    #[test]
    fn test_merge_last_played_across_formats() {
        assert_eq!(
            merge_last_played(Some("2026-10-01 12:00"), Some("2026-11-02 09:30")),
            Some("2026-11-02 09:30".to_string())
        );
        assert_eq!(
            merge_last_played(None, Some("2026-11-02 09:30")),
            Some("2026-11-02 09:30".to_string())
        );
        assert_eq!(
            merge_last_played(Some("Never"), Some("2026-05-10")),
            Some("2026-05-10".to_string())
        );
        assert_eq!(
            merge_last_played(Some("2026-11-03T18:00:00Z"), Some("2026-01-01 00:00")),
            Some("2026-11-03T18:00:00Z".to_string())
        );
    }

    #[test]
    fn test_full_device_a_to_device_b_parity_sync() {
        let root = create_temp_test_env("parity");
        let sync_dir = root.join("cloud");
        let themes_a = root.join("themes_a");
        let plugins_a = root.join("plugins_a");
        let themes_b = root.join("themes_b");
        let plugins_b = root.join("plugins_b");
        for d in [&sync_dir, &themes_a, &plugins_a, &themes_b, &plugins_b] {
            fs::create_dir_all(d).unwrap();
        }

        let db_a = Database::new_at_path(&root.join("device_a.db")).unwrap();
        let db_b = Database::new_at_path(&root.join("device_b.db")).unwrap();

        // 1. Seed a custom theme and custom plugin on Device A
        let custom_theme_dir = themes_a.join("oled-crimson");
        fs::create_dir_all(&custom_theme_dir).unwrap();
        fs::write(
            custom_theme_dir.join("theme.json"),
            r#"{
                "id": "oled-crimson",
                "name": "OLED Crimson",
                "version": "1.0.0",
                "author": "Tester",
                "description": "High contrast crimson theme",
                "icon": "icon.svg",
                "screenshots": ["s1.png", "s2.png", "s3.png"],
                "css": "theme.css"
            }"#,
        )
        .unwrap();
        fs::write(custom_theme_dir.join("icon.svg"), "<svg/>").unwrap();
        fs::write(custom_theme_dir.join("s1.png"), b"png1").unwrap();
        fs::write(custom_theme_dir.join("s2.png"), b"png2").unwrap();
        fs::write(custom_theme_dir.join("s3.png"), b"png3").unwrap();
        fs::write(custom_theme_dir.join("theme.css"), ":root { --accent: red; }").unwrap();

        let custom_plugin_dir = plugins_a.join("discord-rpc");
        fs::create_dir_all(&custom_plugin_dir).unwrap();
        fs::write(
            custom_plugin_dir.join("plugin.json"),
            r#"{
                "id": "discord-rpc",
                "name": "Discord Presence",
                "version": "1.2.0",
                "author": "Tester",
                "description": "Rich presence plugin",
                "icon": "icon.svg",
                "entry": "index.js"
            }"#,
        )
        .unwrap();
        fs::write(custom_plugin_dir.join("icon.svg"), "<svg/>").unwrap();
        fs::write(custom_plugin_dir.join("index.js"), "console.log('loaded');").unwrap();

        crate::themes::set_active_theme(&db_a, "oled-crimson").unwrap();
        crate::themes::save_theme_config(&db_a, "oled-crimson", r#"{"glow":true}"#).unwrap();
        crate::plugins::save_plugin_config(&db_a, "discord-rpc", r#"{"showTimer":true}"#).unwrap();
        db_a.set_setting("enabled_plugins", r#"["discord-rpc"]"#).unwrap();

        // 2. Customize settings on Device A (API keys OFF by default)
        let mut cfg_a = db_a.get_app_config().unwrap();
        cfg_a.accent_color = Some("#ff2255".to_string());
        cfg_a.last_played_date_format = Some("date_only".to_string());
        cfg_a.steamgriddb_api_key = Some("secret_sgdb_key".to_string());
        db_a.save_app_config(&cfg_a).unwrap();

        // 3. Add a manually Beaten game and an Auto-Beaten game with last_played on Device A
        let g1 = Game {
            id: "steam_367520".to_string(),
            title: "Hollow Knight".to_string(),
            source: "Steam".to_string(),
            source_id: Some("367520".to_string()),
            completion_status: Some("Beaten".to_string()),
            last_played: Some("2026-11-01 21:45".to_string()),
            playtime_seconds: 144_000,
            play_count: Some(42),
            updated_at: Some("2026-11-02T10:00:00Z".to_string()),
            ..Default::default()
        };
        let g2 = Game {
            id: "emu_metroid".to_string(),
            title: "Metroid Dread".to_string(),
            source: "Emulation".to_string(),
            completion_status: Some("Auto".to_string()),
            auto_beaten: true,
            beaten_prompt_playtime: Some(36_000),
            last_played: Some("2026-11-03 19:15".to_string()),
            playtime_seconds: 38_000,
            updated_at: Some("2026-11-03T19:15:00Z".to_string()),
            ..Default::default()
        };
        db_a.save_game_exact(&g1).unwrap();
        db_a.save_game_exact(&g2).unwrap();

        // Simulate Device B auto-scanning Hollow Knight locally BEFORE syncing (with uncurated state)
        let g1_scanned_on_b = Game {
            id: "steam_367520".to_string(),
            title: "Hollow Knight".to_string(),
            source: "Steam".to_string(),
            source_id: Some("367520".to_string()),
            is_installed: true,
            completion_status: Some("Auto".to_string()),
            ..Default::default()
        };
        db_b.upsert_game(&g1_scanned_on_b).unwrap();

        // 4. Export Device A -> Sync on untouched Device B
        export_local_device_state_with_dirs(&db_a, &sync_dir, Some(&themes_a), Some(&plugins_a)).unwrap();
        let summary = sync_cloud_directory_with_dirs(&db_b, &sync_dir, Some(&themes_b), Some(&plugins_b)).unwrap();

        assert!(summary.success);
        assert!(summary.settings_synced);
        assert!(summary.extensions_synced >= 2);

        // Verify games on Device B
        let b_games = db_b.get_all_games().unwrap();
        let b_hk = b_games.iter().find(|g| g.title == "Hollow Knight").unwrap();
        assert_eq!(b_hk.completion_status.as_deref(), Some("Beaten"));
        assert_eq!(b_hk.last_played.as_deref(), Some("2026-11-01 21:45"));
        assert_eq!(b_hk.play_count, Some(42));
        assert!(b_hk.is_installed); // Local install state preserved!

        let b_md = b_games.iter().find(|g| g.title == "Metroid Dread").unwrap();
        assert!(b_md.auto_beaten);
        assert_eq!(b_md.beaten_prompt_playtime, Some(36_000));
        assert_eq!(b_md.last_played.as_deref(), Some("2026-11-03 19:15"));

        // Verify settings on Device B (and API key NOT leaked while opt-in is off)
        let cfg_b = db_b.get_app_config().unwrap();
        assert_eq!(cfg_b.accent_color.as_deref(), Some("#ff2255"));
        assert_eq!(cfg_b.last_played_date_format.as_deref(), Some("date_only"));
        assert!(cfg_b.steamgriddb_api_key.is_none());

        // Verify custom theme & plugin installed and configured on Device B
        assert!(themes_b.join("oled-crimson").join("theme.css").is_file());
        assert_eq!(crate::themes::get_active_theme_id(&db_b), "oled-crimson");
        assert_eq!(
            crate::themes::get_theme_config(&db_b, "oled-crimson")
                .unwrap()
                .get("glow"),
            Some(&serde_json::Value::Bool(true))
        );
        assert!(plugins_b.join("discord-rpc").join("index.js").is_file());
        assert!(crate::plugins::is_plugin_enabled(&db_b, "discord-rpc"));
        assert_eq!(
            crate::plugins::get_plugin_config(&db_b, "discord-rpc")
                .unwrap()
                .get("showTimer"),
            Some(&serde_json::Value::Bool(true))
        );

        // 5. Opt into API Keys on Device A -> verify Device B receives API key seamlessly
        db_a.set_setting("cloud_sync_api_keys_enabled", "1").unwrap();
        db_a.set_setting("ui_updated_at", &chrono::Utc::now().to_rfc3339()).unwrap();
        export_local_device_state_with_dirs(&db_a, &sync_dir, Some(&themes_a), Some(&plugins_a)).unwrap();
        sync_cloud_directory_with_dirs(&db_b, &sync_dir, Some(&themes_b), Some(&plugins_b)).unwrap();

        let cfg_b_after = db_b.get_app_config().unwrap();
        assert_eq!(cfg_b_after.steamgriddb_api_key.as_deref(), Some("secret_sgdb_key"));

        // 6. Verify per-game cloud_save_enabled & retention sync via CRDT while local custom paths stay device-local
        db_a.set_setting("ui_updated_at", &chrono::Utc::now().to_rfc3339()).unwrap();
        let mut cfg_a2 = db_a.get_app_config().unwrap();
        cfg_a2.cloud_save_retention_count = Some(7);
        db_a.save_app_config(&cfg_a2).unwrap();
        db_a.update_game_cloud_save_settings("steam_367520", true, Some(4)).unwrap();
        db_a.save_game_save_config(&crate::models::GameSaveConfig {
            game_id: "steam_367520".to_string(),
            custom_save_paths: vec![r"C:\Windows\CustomSavePath".to_string()],
            custom_config_paths: Vec::new(),
            ..Default::default()
        })
        .unwrap();

        export_local_device_state_with_dirs(&db_a, &sync_dir, Some(&themes_a), Some(&plugins_a)).unwrap();
        sync_cloud_directory_with_dirs(&db_b, &sync_dir, Some(&themes_b), Some(&plugins_b)).unwrap();

        let b_hk_after = db_b.get_game_by_id("steam_367520").unwrap().unwrap();
        assert!(b_hk_after.cloud_save_enabled);
        assert_eq!(b_hk_after.cloud_save_retention_override, Some(4));
        assert_eq!(db_b.get_app_config().unwrap().cloud_save_retention_count, Some(7));
        assert!(db_b.get_game_save_config("steam_367520").unwrap().custom_save_paths.is_empty());

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn test_cross_device_last_played_provenance_sync() {
        let root = create_temp_test_env("other_dev_sync");
        let sync_dir = root.join("sync");
        let themes_a = root.join("themes_a");
        let plugins_a = root.join("plugins_a");
        let themes_b = root.join("themes_b");
        let plugins_b = root.join("plugins_b");
        fs::create_dir_all(&sync_dir).unwrap();
        fs::create_dir_all(&themes_a).unwrap();
        fs::create_dir_all(&plugins_a).unwrap();
        fs::create_dir_all(&themes_b).unwrap();
        fs::create_dir_all(&plugins_b).unwrap();

        let db_a = Database::new_at_path(&root.join("a.db")).unwrap();
        let db_b = Database::new_at_path(&root.join("b.db")).unwrap();
        let dev_a = db_a.get_or_create_device_id().unwrap();
        let dev_b = db_b.get_or_create_device_id().unwrap();
        assert_ne!(dev_a, dev_b);

        // Seed shared game on both devices, played earlier on Device B
        let seed_b = Game {
            id: "local_celeste".to_string(),
            title: "Celeste".to_string(),
            source: "Manual".to_string(),
            is_installed: true,
            ..Default::default()
        };
        db_a.save_game_exact(&seed_b).unwrap();
        db_b.save_game_exact(&seed_b).unwrap();
        db_b.update_playtime("local_celeste", 600, "2026-11-18 18:00").unwrap();

        // Device A plays more recently
        db_a.update_playtime("local_celeste", 1200, "2026-11-19 20:30").unwrap();
        export_local_device_state_with_dirs(&db_a, &sync_dir, Some(&themes_a), Some(&plugins_a)).unwrap();
        sync_cloud_directory_with_dirs(&db_b, &sync_dir, Some(&themes_b), Some(&plugins_b)).unwrap();

        // Device B now sees played_on_other_device = true
        let b_after_peer = db_b.get_game_by_id("local_celeste").unwrap().unwrap();
        assert_eq!(b_after_peer.last_played.as_deref(), Some("2026-11-19 20:30"));
        assert_eq!(b_after_peer.last_played_device_id.as_deref(), Some(dev_a.as_str()));
        assert!(b_after_peer.played_on_other_device);

        // Device B plays locally -> clears played_on_other_device
        db_b.update_playtime("local_celeste", 300, "2026-11-19 22:00").unwrap();
        let b_after_local = db_b.get_game_by_id("local_celeste").unwrap().unwrap();
        assert!(!b_after_local.played_on_other_device);
        assert_eq!(b_after_local.last_played_device_id.as_deref(), Some(dev_b.as_str()));

        let _ = fs::remove_dir_all(&root);
    }
}
