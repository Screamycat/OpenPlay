use crate::db::Database;
use crate::models::{
    CloudSyncStatus, DeviceStatePayload, Game, PeerDeviceInfo,
    PortableGameRecord, PortableUIConfig, SyncSummary, TombstoneRecord,
};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

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

fn get_local_artwork_cache_dir() -> PathBuf {
    dirs::data_local_dir()
        .map(|p| p.join("OpenPlay").join("custom_artwork"))
        .unwrap_or_else(|| PathBuf::from("OpenPlayCustomArtwork"))
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

    let bytes = fs::read(local_file).ok()?;
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let hash_hex = hex::encode(hasher.finalize());

    let ext = local_file
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();

    let art_filename = format!("{}.{}", hash_hex, ext);
    let art_dir = sync_dir.join("custom_artwork");
    let _ = fs::create_dir_all(&art_dir);
    let art_dest = art_dir.join(&art_filename);

    if !art_dest.exists() {
        let _ = fs::write(&art_dest, &bytes);
    }

    Some(format!("custom://{}", art_filename))
}

/// Resolves a peer artwork URI (`custom://<filename>` or `https://...`) into a local path.
fn resolve_peer_artwork(
    sync_dir: &Path,
    artwork_uri: Option<&str>,
) -> Option<String> {
    let uri = artwork_uri?.trim();
    if uri.is_empty() {
        return None;
    }

    if uri.starts_with("custom://") {
        let filename = &uri[9..];
        let sync_art_file = sync_dir.join("custom_artwork").join(filename);
        let local_cache_dir = get_local_artwork_cache_dir();
        let _ = fs::create_dir_all(&local_cache_dir);
        let local_cached_file = local_cache_dir.join(filename);

        if !local_cached_file.exists() && sync_art_file.exists() {
            let _ = fs::copy(&sync_art_file, &local_cached_file);
        }

        if local_cached_file.exists() {
            return Some(local_cached_file.to_string_lossy().to_string());
        }
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

    let now_utc = chrono::Utc::now().to_rfc3339();
    let updated_at = game.updated_at.clone().unwrap_or(now_utc);

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
        updated_at,
    }
}

/// Exports this device's complete state to <sync_dir>/devices/<device_id>.json
pub fn export_local_device_state(
    db: &Database,
    sync_dir: &Path,
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

    let app_cfg = db.get_app_config().unwrap_or_default();
    let ui_updated = db
        .get_setting("ui_updated_at")
        .ok()
        .flatten()
        .unwrap_or_else(|| now_utc.clone());

    let ui_config = PortableUIConfig {
        ui_updated_at: ui_updated,
        theme: app_cfg.theme,
        accent_color: app_cfg.accent_color,
        panel_tint: app_cfg.panel_tint,
        background_blur: app_cfg.background_blur,
        background_opacity: app_cfg.background_opacity,
        view_mode: app_cfg.view_mode,
        card_width: app_cfg.card_width,
        grid_width_percent: app_cfg.grid_width_percent,
        sort_by: app_cfg.sort_by,
        sort_direction: app_cfg.sort_direction,
        group_by: app_cfg.group_by,
        status_filter: app_cfg.status_filter,
        trailer_autoplay: app_cfg.trailer_autoplay,
        trailer_muted: app_cfg.trailer_muted,
        merge_duplicates: app_cfg.merge_duplicates,
    };

    let payload = DeviceStatePayload {
        device_id: device_id.clone(),
        device_name,
        updated_at: now_utc,
        games: portable_games,
        ui_config,
        tombstones,
    };

    let out_dir = sync_dir.join("devices");
    fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;
    let out_path = out_dir.join(format!("{}.json", device_id));

    atomic_write_json(&out_path, &payload)?;

    let _ = prune_orphan_cloud_artwork(sync_dir);

    Ok(device_id)
}

/// Synchronizes with the cloud directory using Two-Pass Tombstones and PN-Counter Playtime CRDT
pub fn sync_cloud_directory(
    db: &Database,
    sync_dir: &Path,
) -> Result<SyncSummary, String> {
    if !sync_dir.exists() || !sync_dir.is_dir() {
        return Err(format!("Cloud sync directory does not exist: {:?}", sync_dir));
    }

    let current_device_id = db.get_or_create_device_id()?;
    let now_utc = chrono::Utc::now().to_rfc3339();

    let devices_dir = sync_dir.join("devices");
    if !devices_dir.exists() {
        let _ = fs::create_dir_all(&devices_dir);
    }

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

    let mut local_games = db.get_all_games().unwrap_or_default();

    // 2. Pass 1: Tombstones Union
    let mut all_peer_tombstones: Vec<TombstoneRecord> = Vec::new();
    for peer in &peer_payloads {
        for t in &peer.tombstones {
            if !all_peer_tombstones.iter().any(|existing| existing.id == t.id) {
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
                    if !p_sid.is_empty() && !g_sid.is_empty() && g.source.eq_ignore_ascii_case(&peer_game.source) && g_sid.eq_ignore_ascii_case(p_sid) {
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
                local_game.playtime_by_device = Some(serde_json::to_string(&local_pt_map).unwrap_or_default());

                // Metadata LWW
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
                    local_game.updated_at = Some(peer_game.updated_at.clone());

                    // Resolve artwork
                    if let Some(art) = resolve_peer_artwork(sync_dir, peer_game.cover_image.as_deref()) {
                        local_game.cover_image = Some(art);
                    }
                    if let Some(art) = resolve_peer_artwork(sync_dir, peer_game.background_image.as_deref()) {
                        local_game.background_image = Some(art);
                    }
                    if let Some(art) = resolve_peer_artwork(sync_dir, peer_game.logo_image.as_deref()) {
                        local_game.logo_image = Some(art);
                    }
                    if let Some(art) = resolve_peer_artwork(sync_dir, peer_game.icon_image.as_deref()) {
                        local_game.icon_image = Some(art);
                    }
                }

                // Physical paths (is_installed, install_directory, executable_path) are preserved!
                let _ = db.save_game_exact(local_game);
                games_pulled += 1;
            } else {
                // New game from peer!
                let total_pt: u64 = peer_game.playtime_by_device.values().sum();
                let cover = resolve_peer_artwork(sync_dir, peer_game.cover_image.as_deref());
                let bg = resolve_peer_artwork(sync_dir, peer_game.background_image.as_deref());
                let logo = resolve_peer_artwork(sync_dir, peer_game.logo_image.as_deref());
                let icon = resolve_peer_artwork(sync_dir, peer_game.icon_image.as_deref());

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
                    last_played: None,
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
                    play_count: None,
                    is_hidden: peer_game.is_hidden,
                    play_actions: Vec::new(),
                    auto_beaten: false,
                    beaten_prompt_playtime: None,
                    emulator_id: None,
                    updated_at: Some(peer_game.updated_at.clone()),
                    playtime_by_device: Some(serde_json::to_string(&peer_game.playtime_by_device).unwrap_or_default()),
                };

                let _ = db.save_game_exact(&new_game);
                local_games.push(new_game);
                games_pulled += 1;
            }
        }
    }

    // 4. Pass 3: Portable UI Config Syncing
    let mut newest_peer_ui: Option<&PortableUIConfig> = None;
    for peer in &peer_payloads {
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

        if peer_ui.ui_updated_at > local_ui_updated {
            let mut cfg = db.get_app_config().unwrap_or_default();
            if peer_ui.theme.is_some() { cfg.theme = peer_ui.theme.clone(); }
            if peer_ui.accent_color.is_some() { cfg.accent_color = peer_ui.accent_color.clone(); }
            if peer_ui.panel_tint.is_some() { cfg.panel_tint = peer_ui.panel_tint.clone(); }
            if peer_ui.background_blur.is_some() { cfg.background_blur = peer_ui.background_blur; }
            if peer_ui.background_opacity.is_some() { cfg.background_opacity = peer_ui.background_opacity; }
            if peer_ui.view_mode.is_some() { cfg.view_mode = peer_ui.view_mode.clone(); }
            if peer_ui.card_width.is_some() { cfg.card_width = peer_ui.card_width; }
            if peer_ui.grid_width_percent.is_some() { cfg.grid_width_percent = peer_ui.grid_width_percent; }
            if peer_ui.sort_by.is_some() { cfg.sort_by = peer_ui.sort_by.clone(); }
            if peer_ui.sort_direction.is_some() { cfg.sort_direction = peer_ui.sort_direction.clone(); }
            if peer_ui.group_by.is_some() { cfg.group_by = peer_ui.group_by.clone(); }
            if peer_ui.status_filter.is_some() { cfg.status_filter = peer_ui.status_filter.clone(); }
            if peer_ui.trailer_autoplay.is_some() { cfg.trailer_autoplay = peer_ui.trailer_autoplay; }
            if peer_ui.trailer_muted.is_some() { cfg.trailer_muted = peer_ui.trailer_muted; }
            if peer_ui.merge_duplicates.is_some() { cfg.merge_duplicates = peer_ui.merge_duplicates; }

            let _ = db.save_app_config(&cfg);
            let _ = db.set_setting("ui_updated_at", &peer_ui.ui_updated_at);
        }
    }

    // 5. Export our updated state so peer devices discover our latest playtime & additions
    let _ = export_local_device_state(db, sync_dir);
    let games_pushed = db.get_all_games().unwrap_or_default().len();

    // 6. Record last sync timestamp
    let _ = db.set_setting("cloud_sync_last_time", &now_utc);

    Ok(SyncSummary {
        success: true,
        games_pulled,
        games_pushed,
        games_deleted,
        peer_devices_count,
        timestamp: now_utc,
        message: format!(
            "Sync complete. Pulled/merged {} games, pruned {} deletions across {} peer devices.",
            games_pulled, games_deleted, peer_devices_count
        ),
    })
}

/// Scans <sync_dir>/devices/*.json to gather all active custom:// URIs,
/// and deletes any unreferenced orphan files in <sync_dir>/custom_artwork/
pub fn prune_orphan_cloud_artwork(sync_dir: &Path) -> Result<usize, String> {
    let devices_dir = sync_dir.join("devices");
    let art_dir = sync_dir.join("custom_artwork");
    if !devices_dir.exists() || !art_dir.exists() {
        return Ok(0);
    }

    let mut active_custom_files = std::collections::HashSet::new();
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
                    }
                }
            }
        }
    }

    let mut pruned_count = 0;
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
    let enabled_str = db.get_setting("cloud_sync_enabled").ok().flatten().unwrap_or_else(|| "0".to_string());
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
    })
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
