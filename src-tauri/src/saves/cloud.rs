use super::{collect_save_target_paths, is_excluded_save_entry};
use crate::cloud_sync;
use crate::db::Database;
use crate::launcher::{GameLauncher, LauncherEventSink};
use crate::models::{
    CloudSaveSnapshot, CloudSavesOverview, Game, LocalSafetyBackup, PreLaunchSaveCheck,
    ResolvedSavePath,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};

pub const MAX_AUTO_SAVE_BYTES: u64 = 250 * 1024 * 1024;
const MAX_LOCAL_SAFETY_BACKUPS: usize = 3;
const MANIFEST_ENTRY_NAME: &str = ".openplay_save_manifest.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SaveSlotManifestItem {
    index: usize,
    name: String,
    is_file: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SaveArchiveManifest {
    slots: Vec<SaveSlotManifestItem>,
}

/// Deterministic cross-device bucket key for cloud save storage.
pub fn canonical_save_key(game: &Game) -> String {
    let src = slugify(&game.source);
    if let Some(ref sid) = game.source_id {
        let sid_clean = slugify(sid);
        if !sid_clean.is_empty() && !src.is_empty() {
            return format!("{}_{}", src, sid_clean);
        }
    }

    let is_emu = game.source.eq_ignore_ascii_case("Emulation")
        || game.id.starts_with("rom_")
        || game.emulator_id.is_some();

    let title_slug = slugify(&game.title);
    if is_emu {
        let plat_slug = game
            .platforms
            .first()
            .map(|p| slugify(p))
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "retro".to_string());
        if !title_slug.is_empty() {
            return format!("emu_{}_{}", plat_slug, title_slug);
        }
    }

    if !title_slug.is_empty() {
        let prefix = if src.is_empty() { "game" } else { &src };
        return format!("{}_{}", prefix, title_slug);
    }

    format!("game_{}", slugify(&game.id))
}

fn slugify(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut last_us = false;
    for ch in raw.trim().to_lowercase().chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
            last_us = false;
        } else if !last_us && !out.is_empty() {
            out.push('_');
            last_us = true;
        }
    }
    out.trim_matches('_').to_string()
}

pub fn get_local_safety_backups_root() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("OpenPlay")
        .join("save_safety_backups")
}

fn game_safety_dir(root: &Path, game_id: &str) -> PathBuf {
    root.join(slugify(game_id))
}

fn cloud_game_saves_dir(sync_dir: &Path, save_key: &str) -> PathBuf {
    sync_dir.join("saves").join(save_key)
}

#[derive(Debug)]
struct CollectedSaveFile {
    zip_rel_path: String,
    disk_path: PathBuf,
}

fn gather_files_from_save_paths(
    target_paths: &[PathBuf],
) -> Result<(Vec<CollectedSaveFile>, SaveArchiveManifest, u64), String> {
    let mut files = Vec::new();
    let mut slots = Vec::new();
    let mut total_bytes: u64 = 0;
    let multi_slot = target_paths.len() > 1;

    for (idx, root_path) in target_paths.iter().enumerate() {
        let slot_name = root_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("saves")
            .to_string();
        let is_file = root_path.is_file();
        slots.push(SaveSlotManifestItem {
            index: idx,
            name: slot_name.clone(),
            is_file,
        });

        if !root_path.exists() {
            continue;
        }

        if is_file {
            if is_excluded_save_entry(root_path, &slot_name) {
                continue;
            }
            let size = fs::metadata(root_path).map(|m| m.len()).unwrap_or(0);
            total_bytes = total_bytes.saturating_add(size);
            let rel = if multi_slot {
                format!("slot_{}/{}", idx, slot_name)
            } else {
                slot_name
            };
            files.push(CollectedSaveFile {
                zip_rel_path: rel,
                disk_path: root_path.clone(),
            });
        } else if root_path.is_dir() {
            let mut dir_files = Vec::new();
            collect_dir_save_files(root_path, root_path, &mut dir_files);
            for (rel_norm, full_path) in dir_files {
                let size = fs::metadata(&full_path).map(|m| m.len()).unwrap_or(0);
                total_bytes = total_bytes.saturating_add(size);
                let zip_rel = if multi_slot {
                    format!("slot_{}/{}", idx, rel_norm)
                } else {
                    rel_norm
                };
                files.push(CollectedSaveFile {
                    zip_rel_path: zip_rel,
                    disk_path: full_path,
                });
            }
        }
    }

    files.sort_by(|a, b| a.zip_rel_path.cmp(&b.zip_rel_path));
    Ok((files, SaveArchiveManifest { slots }, total_bytes))
}

fn collect_dir_save_files(base: &Path, current: &Path, out: &mut Vec<(String, PathBuf)>) {
    let Ok(entries) = fs::read_dir(current) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if is_excluded_save_entry(&path, name) {
            continue;
        }
        if path.is_dir() {
            collect_dir_save_files(base, &path, out);
        } else if path.is_file() {
            if let Ok(rel) = path.strip_prefix(base) {
                let rel_norm = rel
                    .components()
                    .map(|c| c.as_os_str().to_string_lossy().to_string())
                    .collect::<Vec<_>>()
                    .join("/");
                if !rel_norm.is_empty() {
                    out.push((rel_norm, path));
                }
            }
        }
    }
}

/// Computes deterministic SHA-256 hash, total byte count, and file count across save paths.
pub fn compute_save_paths_digest(paths: &[PathBuf]) -> Result<(Option<String>, u64, usize), String> {
    let (files, _, total_bytes) = gather_files_from_save_paths(paths)?;
    if files.is_empty() {
        return Ok((None, 0, 0));
    }
    let mut hasher = Sha256::new();
    for item in &files {
        let bytes = fs::read(&item.disk_path).map_err(|e| e.to_string())?;
        hasher.update(item.zip_rel_path.as_bytes());
        hasher.update(b"\0");
        hasher.update((bytes.len() as u64).to_le_bytes());
        hasher.update(&bytes);
    }
    Ok((Some(hex::encode(hasher.finalize())), total_bytes, files.len()))
}

fn write_save_zip_atomic(
    dest_zip: &Path,
    files: &[CollectedSaveFile],
    manifest: &SaveArchiveManifest,
    include_manifest: bool,
) -> Result<(String, u64), String> {
    if let Some(parent) = dest_zip.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let mut hasher = Sha256::new();
    let temp_zip = PathBuf::from(format!("{}.tmp.{}", dest_zip.to_string_lossy(), uuid::Uuid::new_v4()));

    {
        let file = fs::File::create(&temp_zip).map_err(|e| e.to_string())?;
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        if include_manifest {
            let manifest_bytes = serde_json::to_vec_pretty(manifest).map_err(|e| e.to_string())?;
            zip.start_file(MANIFEST_ENTRY_NAME, options)
                .map_err(|e| e.to_string())?;
            zip.write_all(&manifest_bytes).map_err(|e| e.to_string())?;
        }

        for item in files {
            let bytes = fs::read(&item.disk_path).map_err(|e| e.to_string())?;
            hasher.update(item.zip_rel_path.as_bytes());
            hasher.update(b"\0");
            hasher.update((bytes.len() as u64).to_le_bytes());
            hasher.update(&bytes);

            zip.start_file(&item.zip_rel_path, options)
                .map_err(|e| e.to_string())?;
            zip.write_all(&bytes).map_err(|e| e.to_string())?;
        }

        zip.finish().map_err(|e| e.to_string())?;
    }

    let zip_size = fs::metadata(&temp_zip).map(|m| m.len()).unwrap_or(0);

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
            return Err(format!("Failed to write save archive {:?}: {}", dest_zip, e));
        }
        let _ = fs::remove_file(&temp_zip);
    }

    Ok((hex::encode(hasher.finalize()), zip_size))
}

pub fn list_cloud_snapshots(sync_dir: &Path, save_key: &str) -> Vec<CloudSaveSnapshot> {
    let dir = cloud_game_saves_dir(sync_dir, save_key);
    if !dir.is_dir() {
        return Vec::new();
    }

    let mut snapshots = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                if let Ok(raw) = fs::read_to_string(&path) {
                    if let Ok(meta) = serde_json::from_str::<CloudSaveSnapshot>(&raw) {
                        let zip_path = dir.join(format!("{}.zip", meta.id));
                        if zip_path.is_file() {
                            snapshots.push(meta);
                        }
                    }
                }
            }
        }
    }

    snapshots.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    snapshots
}

pub fn list_local_safety_backups_in(safety_root: &Path, game_id: &str) -> Vec<LocalSafetyBackup> {
    let dir = game_safety_dir(safety_root, game_id);
    if !dir.is_dir() {
        return Vec::new();
    }

    let mut backups = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                if let Ok(raw) = fs::read_to_string(&path) {
                    if let Ok(meta) = serde_json::from_str::<LocalSafetyBackup>(&raw) {
                        if dir.join(format!("{}.zip", meta.id)).is_file() {
                            backups.push(meta);
                        }
                    }
                }
            }
        }
    }

    backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    backups
}

fn current_os_label() -> String {
    if cfg!(target_os = "windows") {
        "Windows".to_string()
    } else if cfg!(target_os = "linux") {
        "Linux".to_string()
    } else if cfg!(target_os = "macos") {
        "macOS".to_string()
    } else {
        std::env::consts::OS.to_string()
    }
}

fn effective_retention(db: &Database, game: &Game) -> u32 {
    let global = db
        .get_app_config()
        .ok()
        .and_then(|c| c.cloud_save_retention_count)
        .unwrap_or(5);
    game.cloud_save_retention_override.unwrap_or(global).max(1)
}

fn prune_cloud_snapshots(save_dir: &Path, keep_count: usize) {
    if !save_dir.is_dir() {
        return;
    }
    let mut metas = Vec::new();
    if let Ok(entries) = fs::read_dir(save_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                if let Ok(raw) = fs::read_to_string(&path) {
                    if let Ok(meta) = serde_json::from_str::<CloudSaveSnapshot>(&raw) {
                        metas.push(meta);
                    }
                }
            }
        }
    }
    metas.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    for old in metas.into_iter().skip(keep_count.max(1)) {
        let _ = fs::remove_file(save_dir.join(format!("{}.zip", old.id)));
        let _ = fs::remove_file(save_dir.join(format!("{}.json", old.id)));
    }
}

fn prune_local_safety_backups(dir: &Path, keep_count: usize) {
    if !dir.is_dir() {
        return;
    }
    let mut metas = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                if let Ok(raw) = fs::read_to_string(&path) {
                    if let Ok(meta) = serde_json::from_str::<LocalSafetyBackup>(&raw) {
                        metas.push(meta);
                    }
                }
            }
        }
    }
    metas.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    for old in metas.into_iter().skip(keep_count.max(1)) {
        let _ = fs::remove_file(dir.join(format!("{}.zip", old.id)));
        let _ = fs::remove_file(dir.join(format!("{}.json", old.id)));
    }
}

/// Pushes a new cloud save snapshot if local save content differs from the latest cloud snapshot.
pub fn push_cloud_save_in_dir(
    db: &Database,
    game: &Game,
    resolved_save_paths: &[ResolvedSavePath],
    sync_dir: &Path,
    trigger: &str,
    note: Option<String>,
    allow_oversized: bool,
) -> Result<(bool, Option<CloudSaveSnapshot>, String), String> {
    if !sync_dir.exists() || !sync_dir.is_dir() {
        return Err("Cloud sync folder is unmounted or does not exist".to_string());
    }

    let target_paths = collect_save_target_paths(resolved_save_paths, true);
    if target_paths.is_empty() {
        return Err("No existing local save files or folders found for this game".to_string());
    }

    let (files, manifest, total_raw_bytes) = gather_files_from_save_paths(&target_paths)?;
    if files.is_empty() {
        return Err("Save location contains no archivable save files".to_string());
    }

    if !allow_oversized && total_raw_bytes > MAX_AUTO_SAVE_BYTES {
        return Err(format!(
            "OVERSIZED:{}:Save folder size exceeds 250 MB auto-sync threshold",
            total_raw_bytes
        ));
    }

    let (local_sha, _, file_count) = compute_save_paths_digest(&target_paths)?;
    let Some(local_sha) = local_sha else {
        return Err("Save location contains no archivable save files".to_string());
    };

    let save_key = canonical_save_key(game);
    let existing = list_cloud_snapshots(sync_dir, &save_key);
    if let Some(latest) = existing.first() {
        if latest.sha256 == local_sha {
            let _ = db.update_game_last_synced_save(&game.id, &local_sha, &latest.id);
            return Ok((
                true,
                Some(latest.clone()),
                "Cloud save is already up to date with local files.".to_string(),
            ));
        }
    }

    let device_id = db.get_or_create_device_id()?;
    let device_name = db.get_device_name();
    let now_utc = chrono::Utc::now();
    let now_iso = now_utc.to_rfc3339();
    let short_dev: String = device_id.chars().filter(|c| c.is_ascii_alphanumeric()).take(8).collect();
    let uuid_part: String = uuid::Uuid::new_v4()
        .to_string()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(6)
        .collect();
    let snapshot_id = format!(
        "{}_{}_{}",
        now_utc.format("%Y%m%dT%H%M%SZ"),
        short_dev,
        uuid_part
    );

    let dest_dir = cloud_game_saves_dir(sync_dir, &save_key);
    let zip_path = dest_dir.join(format!("{}.zip", snapshot_id));
    let meta_path = dest_dir.join(format!("{}.json", snapshot_id));

    let include_manifest = target_paths.len() > 1;
    let (written_sha, zip_bytes) =
        write_save_zip_atomic(&zip_path, &files, &manifest, include_manifest)?;

    let snapshot = CloudSaveSnapshot {
        id: snapshot_id.clone(),
        game_id: game.id.clone(),
        canonical_save_key: save_key,
        game_title: game.title.clone(),
        device_id,
        device_name,
        os: current_os_label(),
        created_at: now_iso,
        trigger: trigger.to_string(),
        sha256: written_sha.clone(),
        size_bytes: zip_bytes,
        file_count,
        slot_count: target_paths.len(),
        note: note.filter(|s| !s.trim().is_empty()),
    };

    cloud_sync::atomic_write_json(&meta_path, &snapshot)?;

    let keep_count = effective_retention(db, game) as usize;
    prune_cloud_snapshots(&dest_dir, keep_count);

    let _ = db.update_game_last_synced_save(&game.id, &written_sha, &snapshot_id);

    Ok((
        false,
        Some(snapshot),
        "Saved snapshot to cloud.".to_string(),
    ))
}

fn create_local_safety_backup_in(
    safety_root: &Path,
    game: &Game,
    target_paths: &[PathBuf],
    reason: &str,
) -> Result<Option<LocalSafetyBackup>, String> {
    let (files, manifest, _) = gather_files_from_save_paths(target_paths)?;
    if files.is_empty() {
        return Ok(None);
    }

    let now_utc = chrono::Utc::now();
    let backup_id = format!(
        "safety_{}_{}",
        now_utc.format("%Y%m%dT%H%M%SZ"),
        &uuid::Uuid::new_v4().to_string()[..6]
    );

    let dir = game_safety_dir(safety_root, &game.id);
    let zip_path = dir.join(format!("{}.zip", backup_id));
    let meta_path = dir.join(format!("{}.json", backup_id));
    let include_manifest = target_paths.len() > 1;

    let (_, zip_bytes) = write_save_zip_atomic(&zip_path, &files, &manifest, include_manifest)?;
    let meta = LocalSafetyBackup {
        id: backup_id,
        game_id: game.id.clone(),
        created_at: now_utc.to_rfc3339(),
        reason: reason.to_string(),
        size_bytes: zip_bytes,
        file_count: files.len(),
    };

    cloud_sync::atomic_write_json(&meta_path, &meta)?;
    prune_local_safety_backups(&dir, MAX_LOCAL_SAFETY_BACKUPS);

    Ok(Some(meta))
}

fn is_safe_relative_zip_path(raw: &str) -> Option<PathBuf> {
    let mut clean = PathBuf::new();
    for comp in Path::new(raw).components() {
        match comp {
            Component::Normal(part) => {
                let s = part.to_string_lossy();
                if s.contains(':') {
                    return None;
                }
                clean.push(part);
            }
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => return None,
        }
    }
    if clean.as_os_str().is_empty() {
        None
    } else {
        Some(clean)
    }
}

fn extract_archive_to_targets(zip_path: &Path, target_paths: &[PathBuf]) -> Result<(), String> {
    if target_paths.is_empty() {
        return Err("No save location configured or detected for restore.".to_string());
    }

    let file = fs::File::open(zip_path).map_err(|e| format!("Failed to open archive: {}", e))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("Corrupt save archive: {}", e))?;

    // Check optional multi-slot manifest
    let manifest: Option<SaveArchiveManifest> = {
        if let Ok(mut entry) = archive.by_name(MANIFEST_ENTRY_NAME) {
            let mut raw = String::new();
            let _ = entry.read_to_string(&mut raw);
            serde_json::from_str(&raw).ok()
        } else {
            None
        }
    };

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        if entry.is_dir() {
            continue;
        }
        let name = entry.name().replace('\\', "/");
        if name == MANIFEST_ENTRY_NAME {
            continue;
        }
        let Some(rel_path) = is_safe_relative_zip_path(&name) else {
            continue;
        };

        let dest_path = if let Some(ref mf) = manifest {
            // Multi-slot path format: slot_<idx>/<rel>
            let mut comps = rel_path.components();
            let first = comps
                .next()
                .map(|c| c.as_os_str().to_string_lossy().to_string())
                .unwrap_or_default();
            if let Some(idx_str) = first.strip_prefix("slot_") {
                if let Ok(slot_idx) = idx_str.parse::<usize>() {
                    let sub_rel: PathBuf = comps.collect();
                    let target_slot = target_paths.get(slot_idx);
                    if let Some(target_root) = target_slot {
                        if target_root.is_file()
                            || mf
                                .slots
                                .get(slot_idx)
                                .map(|s| s.is_file)
                                .unwrap_or(false)
                                && target_root.extension().is_some()
                        {
                            target_root.clone()
                        } else {
                            target_root.join(&sub_rel)
                        }
                    } else {
                        let fallback_name = mf
                            .slots
                            .get(slot_idx)
                            .map(|s| s.name.as_str())
                            .unwrap_or(&first);
                        target_paths[0].join(fallback_name).join(&sub_rel)
                    }
                } else {
                    target_paths[0].join(&rel_path)
                }
            } else {
                target_paths[0].join(&rel_path)
            }
        } else {
            // Single-slot archive: if destination target is an explicit file path (e.g. .sav),
            // write directly to it when archive contains a single top-level file.
            let target_root = &target_paths[0];
            let is_target_file = target_root.is_file()
                || (!target_root.exists()
                    && target_root.extension().is_some()
                    && rel_path.components().count() == 1);
            if is_target_file {
                target_root.clone()
            } else {
                target_root.join(&rel_path)
            }
        };

        if let Some(parent) = dest_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut out_file = fs::File::create(&dest_path).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut out_file).map_err(|e| e.to_string())?;
    }

    Ok(())
}

pub fn restore_cloud_save_in_dir(
    db: &Database,
    game: &Game,
    resolved_save_paths: &[ResolvedSavePath],
    sync_dir: &Path,
    safety_root: &Path,
    snapshot_id: &str,
) -> Result<(CloudSaveSnapshot, Option<LocalSafetyBackup>), String> {
    if GameLauncher::is_game_running(&game.id) {
        return Err("Cannot restore save files while the game is currently running. Please close the game first.".to_string());
    }

    let save_key = canonical_save_key(game);
    let snapshots = list_cloud_snapshots(sync_dir, &save_key);
    let snapshot = snapshots
        .into_iter()
        .find(|s| s.id == snapshot_id)
        .ok_or_else(|| format!("Cloud save snapshot '{}' not found.", snapshot_id))?;

    let zip_path = cloud_game_saves_dir(sync_dir, &save_key).join(format!("{}.zip", snapshot_id));
    if !zip_path.is_file() {
        return Err(format!("Snapshot archive missing: {}", zip_path.display()));
    }

    let mut target_paths = collect_save_target_paths(resolved_save_paths, true);
    if target_paths.is_empty() {
        // Fallback to predicted save path(s) even if folder hasn't been created on disk yet
        target_paths = collect_save_target_paths(resolved_save_paths, false);
    }
    if target_paths.is_empty() {
        return Err("No save location detected or manually routed for this game. Set a Save Location first.".to_string());
    }

    let safety = create_local_safety_backup_in(
        safety_root,
        game,
        &target_paths,
        &format!("Before loading cloud save {}", snapshot.id),
    )?;

    extract_archive_to_targets(&zip_path, &target_paths)?;

    let _ = db.update_game_last_synced_save(&game.id, &snapshot.sha256, &snapshot.id);

    Ok((snapshot, safety))
}

pub fn restore_local_safety_backup_in(
    db: &Database,
    game: &Game,
    resolved_save_paths: &[ResolvedSavePath],
    safety_root: &Path,
    backup_id: &str,
) -> Result<(), String> {
    if GameLauncher::is_game_running(&game.id) {
        return Err("Cannot restore safety backup while the game is currently running.".to_string());
    }

    let dir = game_safety_dir(safety_root, &game.id);
    let zip_path = dir.join(format!("{}.zip", backup_id));
    if !zip_path.is_file() {
        return Err(format!("Safety backup '{}' not found.", backup_id));
    }

    let mut target_paths = collect_save_target_paths(resolved_save_paths, true);
    if target_paths.is_empty() {
        target_paths = collect_save_target_paths(resolved_save_paths, false);
    }
    if target_paths.is_empty() {
        return Err("No save location configured or detected for this game.".to_string());
    }

    extract_archive_to_targets(&zip_path, &target_paths)?;

    if let Ok((Some(new_hash), _, _)) = compute_save_paths_digest(&target_paths) {
        let _ = db.update_game_last_synced_save(&game.id, &new_hash, backup_id);
    }

    Ok(())
}

pub fn delete_cloud_snapshot_in_dir(
    sync_dir: &Path,
    game: &Game,
    snapshot_id: &str,
) -> Result<(), String> {
    let save_key = canonical_save_key(game);
    let dir = cloud_game_saves_dir(sync_dir, &save_key);
    let zip_path = dir.join(format!("{}.zip", snapshot_id));
    let meta_path = dir.join(format!("{}.json", snapshot_id));
    if zip_path.exists() {
        fs::remove_file(&zip_path).map_err(|e| e.to_string())?;
    }
    if meta_path.exists() {
        fs::remove_file(&meta_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Evaluates whether a newer peer cloud save exists or local changes should be pushed before launching.
pub fn check_pre_launch_in_dir(
    db: &Database,
    game: &Game,
    resolved_save_paths: &[ResolvedSavePath],
    sync_dir: Option<&Path>,
    cloud_enabled: bool,
) -> Result<PreLaunchSaveCheck, String> {
    if !game.cloud_save_enabled || !cloud_enabled {
        return Ok(PreLaunchSaveCheck {
            status: "ok".to_string(),
            latest_snapshot: None,
            local_size_bytes: 0,
            message: None,
        });
    }

    let Some(sdir) = sync_dir else {
        return Ok(PreLaunchSaveCheck {
            status: "ok".to_string(),
            latest_snapshot: None,
            local_size_bytes: 0,
            message: Some("Cloud sync folder unavailable; skipping pre-launch save sync.".to_string()),
        });
    };

    let current_device_id = db.get_or_create_device_id()?;
    let save_cfg = db.get_game_save_config(&game.id).unwrap_or_default();
    let save_key = canonical_save_key(game);
    let snapshots = list_cloud_snapshots(sdir, &save_key);
    let latest_cloud = snapshots.first().cloned();

    let target_paths = collect_save_target_paths(resolved_save_paths, true);
    let (local_hash_opt, local_bytes, file_count) = if target_paths.is_empty() {
        (None, 0, 0)
    } else {
        compute_save_paths_digest(&target_paths)?
    };

    // Detect newer peer snapshot that hasn't been synced onto this device yet!
    if let Some(ref latest) = latest_cloud {
        let from_other_device = latest.device_id != current_device_id;
        let unseen_snapshot = save_cfg.last_synced_snapshot_id.as_deref() != Some(latest.id.as_str());
        let differs_from_local = local_hash_opt.as_deref() != Some(latest.sha256.as_str());

        if from_other_device && unseen_snapshot && differs_from_local {
            return Ok(PreLaunchSaveCheck {
                status: "newer_peer_available".to_string(),
                latest_snapshot: Some(latest.clone()),
                local_size_bytes: local_bytes,
                message: Some(format!(
                    "Newer cloud save from {} ({}) is available.",
                    latest.device_name, latest.os
                )),
            });
        }
    }

    // Otherwise, if local saves exist and differ from last synced / cloud hash, push pre_launch snapshot
    if file_count > 0 {
        if let Some(ref lhash) = local_hash_opt {
            let differs_from_cloud = latest_cloud
                .as_ref()
                .map(|c| c.sha256 != *lhash)
                .unwrap_or(true);
            let local_changed_since_sync = save_cfg
                .last_synced_save_hash
                .as_deref()
                .map(|prev| prev != lhash.as_str())
                .unwrap_or(true);

            if differs_from_cloud && local_changed_since_sync {
                if local_bytes > MAX_AUTO_SAVE_BYTES {
                    return Ok(PreLaunchSaveCheck {
                        status: "oversized_warning".to_string(),
                        latest_snapshot: latest_cloud,
                        local_size_bytes: local_bytes,
                        message: Some(
                            "Auto-backup skipped: save folder exceeds 250 MB limit.".to_string(),
                        ),
                    });
                }

                let (skipped, pushed, _) = push_cloud_save_in_dir(
                    db,
                    game,
                    resolved_save_paths,
                    sdir,
                    "pre_launch",
                    None,
                    false,
                )?;
                return Ok(PreLaunchSaveCheck {
                    status: if skipped {
                        "ok".to_string()
                    } else {
                        "pushed_pre_launch".to_string()
                    },
                    latest_snapshot: pushed.or(latest_cloud),
                    local_size_bytes: local_bytes,
                    message: None,
                });
            }
        }
    }

    Ok(PreLaunchSaveCheck {
        status: "ok".to_string(),
        latest_snapshot: latest_cloud,
        local_size_bytes: local_bytes,
        message: None,
    })
}

/// Automatically pushes a cloud save snapshot on game exit if the game opted in and saves changed.
pub fn push_cloud_save_on_exit(
    db: &Database,
    game_id: &str,
    sink: Option<&LauncherEventSink>,
) {
    let Ok(Some(game)) = db.get_game_by_id(game_id) else {
        return;
    };
    if !game.cloud_save_enabled {
        return;
    }
    let Ok(status) = cloud_sync::get_cloud_sync_status(db) else {
        return;
    };
    if !status.enabled || !status.is_folder_valid {
        return;
    }
    let Some(folder) = status.folder_path else {
        return;
    };
    let sync_dir = PathBuf::from(folder);
    let resolved_paths = super::resolve_game_paths_offline(db, &game);

    match push_cloud_save_in_dir(db, &game, &resolved_paths, &sync_dir, "auto_exit", None, false) {
        Ok((false, Some(snapshot), _)) => {
            if let Some(s) = sink {
                s.emit(
                    "save-backup-completed",
                    &serde_json::json!({
                        "game_id": game_id,
                        "snapshot": snapshot,
                    }),
                );
            }
        }
        Ok(_) => {}
        Err(err) if err.starts_with("OVERSIZED:") => {
            if let Some(s) = sink {
                s.emit(
                    "save-backup-warning",
                    &serde_json::json!({
                        "game_id": game_id,
                        "message": "Auto-backup on exit skipped: save folder exceeds 250 MB limit.",
                    }),
                );
            }
        }
        Err(err) => {
            eprintln!("[SaveSync] Exit save backup skipped for {}: {}", game_id, err);
        }
    }
}

pub fn get_cloud_saves_overview(db: &Database) -> Result<CloudSavesOverview, String> {
    let games = db.get_all_games().unwrap_or_default();
    let opted_in_games = games.iter().filter(|g| g.cloud_save_enabled).count();

    let status = cloud_sync::get_cloud_sync_status(db)?;
    if !status.is_folder_valid {
        return Ok(CloudSavesOverview {
            opted_in_games,
            total_snapshots: 0,
            total_bytes: 0,
        });
    }
    let Some(folder) = status.folder_path else {
        return Ok(CloudSavesOverview {
            opted_in_games,
            total_snapshots: 0,
            total_bytes: 0,
        });
    };

    let saves_root = Path::new(&folder).join("saves");
    let mut total_snapshots = 0usize;
    let mut total_bytes = 0u64;

    if saves_root.is_dir() {
        if let Ok(buckets) = fs::read_dir(&saves_root) {
            for bucket in buckets.flatten() {
                let p = bucket.path();
                if p.is_dir() {
                    if let Ok(entries) = fs::read_dir(&p) {
                        for entry in entries.flatten() {
                            let ep = entry.path();
                            if ep.extension().and_then(|e| e.to_str()) == Some("zip") {
                                total_snapshots += 1;
                                total_bytes = total_bytes
                                    .saturating_add(fs::metadata(&ep).map(|m| m.len()).unwrap_or(0));
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(CloudSavesOverview {
        opted_in_games,
        total_snapshots,
        total_bytes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_env(label: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "openplay_cloud_save_test_{}_{}",
            label,
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn test_cloud_save_dedup_pruning_conflict_and_restore() {
        let root = test_env("lifecycle");
        let sync_dir = root.join("cloud");
        let save_dir_a = root.join("device_a_saves");
        let save_dir_b = root.join("device_b_saves");
        let safety_a = root.join("safety_a");
        let safety_b = root.join("safety_b");
        for d in [&sync_dir, &save_dir_a, &save_dir_b, &safety_a, &safety_b] {
            fs::create_dir_all(d).unwrap();
        }

        let db_a = Database::new_at_path(&root.join("a.db")).unwrap();
        let db_b = Database::new_at_path(&root.join("b.db")).unwrap();
        db_a.set_device_name("Desktop PC").unwrap();
        db_b.set_device_name("Steam Deck").unwrap();

        let game = Game {
            id: "gog_12345".to_string(),
            title: "Hollow Knight".to_string(),
            source: "GOG".to_string(),
            source_id: Some("12345".to_string()),
            cloud_save_enabled: true,
            cloud_save_retention_override: Some(2),
            ..Default::default()
        };
        db_a.save_game_exact(&game).unwrap();
        db_b.save_game_exact(&game).unwrap();

        let resolved_a = vec![ResolvedSavePath {
            path: save_dir_a.to_string_lossy().to_string(),
            kind: "save".to_string(),
            origin: "custom".to_string(),
            exists: true,
            file_count: 1,
            total_bytes: 5,
            template_hint: None,
        }];
        let resolved_b = vec![ResolvedSavePath {
            path: save_dir_b.to_string_lossy().to_string(),
            kind: "save".to_string(),
            origin: "custom".to_string(),
            exists: true,
            file_count: 1,
            total_bytes: 5,
            template_hint: None,
        }];

        // 1. Push v1 on Device A
        fs::write(save_dir_a.join("slot1.dat"), b"save-v1").unwrap();
        let (skipped1, snap1, _) =
            push_cloud_save_in_dir(&db_a, &game, &resolved_a, &sync_dir, "auto_exit", None, false)
                .unwrap();
        assert!(!skipped1);
        assert!(snap1.is_some());

        // 2. Deduplication check: identical save does not create a duplicate snapshot
        let (skipped_dup, _, _) =
            push_cloud_save_in_dir(&db_a, &game, &resolved_a, &sync_dir, "manual", None, false)
                .unwrap();
        assert!(skipped_dup);

        // 3. Push v2 & v3 on Device A with retention = 2 -> v1 pruned!
        std::thread::sleep(std::time::Duration::from_millis(20));
        fs::write(save_dir_a.join("slot1.dat"), b"save-v2").unwrap();
        push_cloud_save_in_dir(&db_a, &game, &resolved_a, &sync_dir, "auto_exit", None, false)
            .unwrap();

        std::thread::sleep(std::time::Duration::from_millis(20));
        fs::write(save_dir_a.join("slot1.dat"), b"save-v3").unwrap();
        let (_, snap3_opt, _) =
            push_cloud_save_in_dir(&db_a, &game, &resolved_a, &sync_dir, "auto_exit", None, false)
                .unwrap();
        let snap3 = snap3_opt.unwrap();

        let snaps = list_cloud_snapshots(&sync_dir, &canonical_save_key(&game));
        assert_eq!(snaps.len(), 2);
        assert_eq!(snaps[0].id, snap3.id);

        // 4. Device B has stale older save -> pre-launch guard warns instead of overwriting!
        fs::write(save_dir_b.join("slot1.dat"), b"old-local").unwrap();
        let pre =
            check_pre_launch_in_dir(&db_b, &game, &resolved_b, Some(&sync_dir), true).unwrap();
        assert_eq!(pre.status, "newer_peer_available");
        assert_eq!(pre.latest_snapshot.unwrap().id, snap3.id);

        // 5. Device B restores v3 manually -> creates safety backup of "old-local" and extracts v3
        let (_, safety) = restore_cloud_save_in_dir(
            &db_b,
            &game,
            &resolved_b,
            &sync_dir,
            &safety_b,
            &snap3.id,
        )
        .unwrap();
        assert!(safety.is_some());
        assert_eq!(
            fs::read(save_dir_b.join("slot1.dat")).unwrap(),
            b"save-v3"
        );

        // 6. After restore, Device B pre-launch check reports "ok"
        let pre_after =
            check_pre_launch_in_dir(&db_b, &game, &resolved_b, Some(&sync_dir), true).unwrap();
        assert_eq!(pre_after.status, "ok");

        // 7. Device B can undo restore via safety backup!
        let safety_id = safety.unwrap().id;
        restore_local_safety_backup_in(&db_b, &game, &resolved_b, &safety_b, &safety_id).unwrap();
        assert_eq!(
            fs::read(save_dir_b.join("slot1.dat")).unwrap(),
            b"old-local"
        );

        let _ = fs::remove_dir_all(&root);
    }
}
