pub mod cloud;
pub mod emulators;
pub mod pcgw;
pub mod resolver;

use crate::cloud_sync;
use crate::db::Database;
use crate::launcher::GameLauncher;
use crate::models::{
    CloudSaveActionResult, CloudSaveSnapshot, CloudSavesOverview, Game, GameSaveState,
    PreLaunchSaveCheck, ResolvedSavePath, SaveLocationRule,
};
use std::fs;
use std::path::{Path, PathBuf};

/// Returns true for transient/cache/ROM files that must never be hashed or uploaded as game saves.
pub fn is_excluded_save_entry(path: &Path, name: &str) -> bool {
    let lower = name.to_lowercase();
    if lower.starts_with(".temp_")
        || lower == ".ds_store"
        || lower == "thumbs.db"
        || lower == "desktop.ini"
        || lower.ends_with(".tmp")
        || lower.ends_with(".log")
        || lower.ends_with(".bak_openplay")
    {
        return true;
    }

    if path.is_dir() {
        return matches!(
            lower.as_str(),
            "crashreports" | "shadercache" | "cache" | "logs" | "temp" | "tmp"
        );
    }

    if let Some(ext) = path.extension().and_then(|e| e.to_str()).map(|s| s.to_lowercase()) {
        if matches!(
            ext.as_str(),
            "iso"
                | "chd"
                | "nsp"
                | "xci"
                | "rvz"
                | "wbfs"
                | "gcm"
                | "cso"
                | "gba"
                | "gbc"
                | "gb"
                | "sfc"
                | "smc"
                | "nes"
                | "z64"
                | "n64"
                | "v64"
                | "nds"
                | "3ds"
                | "cia"
        ) {
            return true;
        }
    }

    false
}

/// Counts archivable files and total bytes for a given file or directory path.
pub fn measure_path_stats(path: &Path) -> (usize, u64) {
    if path.is_file() {
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if is_excluded_save_entry(path, name) {
            return (0, 0);
        }
        return (1, fs::metadata(path).map(|m| m.len()).unwrap_or(0));
    }
    if !path.is_dir() {
        return (0, 0);
    }

    let mut count = 0usize;
    let mut bytes = 0u64;
    let mut stack = vec![path.to_path_buf()];
    let mut visited = 0usize;

    while let Some(cur) = stack.pop() {
        if visited > 10_000 {
            break;
        }
        let Ok(entries) = fs::read_dir(&cur) else {
            continue;
        };
        for entry in entries.flatten() {
            visited += 1;
            let ep = entry.path();
            let name = ep.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if is_excluded_save_entry(&ep, name) {
                continue;
            }
            if ep.is_dir() {
                stack.push(ep);
            } else if ep.is_file() {
                count += 1;
                bytes = bytes.saturating_add(fs::metadata(&ep).map(|m| m.len()).unwrap_or(0));
            }
        }
    }

    (count, bytes)
}

pub fn collect_save_target_paths(
    resolved_save_paths: &[ResolvedSavePath],
    only_existing: bool,
) -> Vec<PathBuf> {
    resolved_save_paths
        .iter()
        .filter(|p| p.kind == "save" && (!only_existing || p.exists))
        .map(|p| PathBuf::from(&p.path))
        .collect()
}

fn build_custom_resolved_entries(paths: &[String], kind: &str) -> Vec<ResolvedSavePath> {
    paths
        .iter()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|p_str| {
            let pb = PathBuf::from(p_str);
            let exists = pb.exists();
            let (file_count, total_bytes) = if exists { measure_path_stats(&pb) } else { (0, 0) };
            ResolvedSavePath {
                path: p_str.to_string(),
                kind: kind.to_string(),
                origin: "custom".to_string(),
                exists,
                file_count,
                total_bytes,
                template_hint: None,
            }
        })
        .collect()
}

/// Resolves save and config paths offline using custom overrides, emulator presets, cached PCGW rules, and heuristics.
pub fn resolve_game_paths_offline(db: &Database, game: &Game) -> Vec<ResolvedSavePath> {
    let save_cfg = db.get_game_save_config(&game.id).unwrap_or_default();
    let is_emu = game.source.eq_ignore_ascii_case("Emulation")
        || game.id.starts_with("rom_")
        || game.emulator_id.is_some();

    let need_auto_saves = save_cfg.custom_save_paths.is_empty();
    let need_auto_configs = save_cfg.custom_config_paths.is_empty();

    let auto_pool: Vec<ResolvedSavePath> = if need_auto_saves || need_auto_configs {
        let mut pool = if is_emu {
            emulators::resolve_emulator_paths(db, game)
        } else {
            Vec::new()
        };
        if pool.is_empty() {
            let cached_rules = get_cached_pcgw_rules_only(db, game);
            let env = resolver::ResolutionEnv::detect_for_game(game);
            pool = resolver::resolve_paths_for_game(game, &cached_rules, &env);
        }
        pool
    } else {
        Vec::new()
    };

    let mut out = Vec::new();
    if need_auto_saves {
        out.extend(auto_pool.iter().filter(|p| p.kind == "save").cloned());
    } else {
        out.extend(build_custom_resolved_entries(&save_cfg.custom_save_paths, "save"));
    }

    if need_auto_configs {
        out.extend(auto_pool.iter().filter(|p| p.kind == "config").cloned());
    } else {
        out.extend(build_custom_resolved_entries(&save_cfg.custom_config_paths, "config"));
    }

    out
}

fn get_cached_pcgw_rules_only(db: &Database, game: &Game) -> Vec<SaveLocationRule> {
    let key = pcgw::build_cache_key_for_game(game);
    db.get_save_location_cache(&key)
        .ok()
        .flatten()
        .map(|c| c.rules)
        .unwrap_or_default()
}

/// Smartly pre-warms save & config rules in SQLite for all uncached installed games
/// without blocking UI or hammering PCGamingWiki.
pub async fn warm_installed_game_save_locations<F>(db: &Database, on_warmed: F) -> usize
where
    F: Fn(&str),
{
    let games = match db.get_all_games() {
        Ok(g) => g,
        Err(_) => return 0,
    };

    let mut targets: Vec<Game> = games
        .into_iter()
        .filter(|g| {
            if !g.is_installed {
                return false;
            }
            let is_emu = g.source.eq_ignore_ascii_case("Emulation")
                || g.id.starts_with("rom_")
                || g.emulator_id.is_some();
            if is_emu {
                return false;
            }
            let has_custom = db
                .get_game_save_config(&g.id)
                .map(|c| !c.custom_save_paths.is_empty())
                .unwrap_or(false);
            if has_custom {
                return false;
            }
            !pcgw::has_fresh_cache_for_game(db, g)
        })
        .collect();

    if targets.is_empty() {
        return 0;
    }

    let mut warmed = 0usize;
    for game in targets.drain(..) {
        let (_, rules) = pcgw::get_or_fetch_pcgw_rules_for_game(db, &game, false).await;
        if !rules.is_empty() || !resolve_game_paths_offline(db, &game).is_empty() {
            warmed += 1;
            on_warmed(&game.id);
        }
        tokio::time::sleep(tokio::time::Duration::from_millis(350)).await;
    }

    warmed
}

/// Resolves complete Save & Cloud Save state for a game (with on-demand PCGamingWiki lookup).
pub async fn get_game_save_state(
    db: &Database,
    game_id: &str,
    force_refresh_detection: bool,
) -> Result<GameSaveState, String> {
    let game = db
        .get_game_by_id(game_id)?
        .ok_or_else(|| format!("Game '{}' not found", game_id))?;

    let save_cfg = db.get_game_save_config(&game.id).unwrap_or_default();
    let is_emu = game.source.eq_ignore_ascii_case("Emulation")
        || game.id.starts_with("rom_")
        || game.emulator_id.is_some();

    let (pcgw_page, pcgw_rules) = if is_emu {
        (None, Vec::new())
    } else {
        pcgw::get_or_fetch_pcgw_rules_for_game(db, &game, force_refresh_detection).await
    };

    let emu_resolved = if is_emu {
        emulators::resolve_emulator_paths(db, &game)
    } else {
        Vec::new()
    };

    let env = resolver::ResolutionEnv::detect_for_game(&game);
    let rule_resolved = if !is_emu {
        resolver::resolve_paths_for_game(&game, &pcgw_rules, &env)
    } else {
        Vec::new()
    };

    let save_paths: Vec<ResolvedSavePath> = if !save_cfg.custom_save_paths.is_empty() {
        build_custom_resolved_entries(&save_cfg.custom_save_paths, "save")
    } else if !emu_resolved.is_empty() {
        let list: Vec<_> = emu_resolved
            .iter()
            .filter(|p| p.kind == "save")
            .cloned()
            .collect();
        if list.is_empty() {
            rule_resolved
                .iter()
                .filter(|p| p.kind == "save")
                .cloned()
                .collect()
        } else {
            list
        }
    } else {
        rule_resolved
            .iter()
            .filter(|p| p.kind == "save")
            .cloned()
            .collect()
    };

    let config_paths: Vec<ResolvedSavePath> = if !save_cfg.custom_config_paths.is_empty() {
        build_custom_resolved_entries(&save_cfg.custom_config_paths, "config")
    } else if !emu_resolved.is_empty() {
        let list: Vec<_> = emu_resolved
            .iter()
            .filter(|p| p.kind == "config")
            .cloned()
            .collect();
        if list.is_empty() {
            rule_resolved
                .iter()
                .filter(|p| p.kind == "config")
                .cloned()
                .collect()
        } else {
            list
        }
    } else {
        rule_resolved
            .iter()
            .filter(|p| p.kind == "config")
            .cloned()
            .collect()
    };

    let target_paths = collect_save_target_paths(&save_paths, true);
    let (local_save_hash, local_size_bytes, local_file_count) = if target_paths.is_empty() {
        (None, 0, 0)
    } else {
        cloud::compute_save_paths_digest(&target_paths)?
    };

    let global_retention_count = db
        .get_app_config()
        .ok()
        .and_then(|c| c.cloud_save_retention_count)
        .unwrap_or(5)
        .max(1);
    let effective_retention_count = game
        .cloud_save_retention_override
        .unwrap_or(global_retention_count)
        .max(1);

    let cloud_status = cloud_sync::get_cloud_sync_status(db)?;
    let save_key = cloud::canonical_save_key(&game);
    let snapshots = if cloud_status.enabled && cloud_status.is_folder_valid {
        cloud_status
            .folder_path
            .as_deref()
            .map(|f| cloud::list_cloud_snapshots(Path::new(f), &save_key))
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    let safety_backups =
        cloud::list_local_safety_backups_in(&cloud::get_local_safety_backups_root(), &game.id);

    let sync_status = compute_sync_status(
        &cloud_status.device_id,
        cloud_status.enabled && cloud_status.is_folder_valid,
        &save_paths,
        local_save_hash.as_deref(),
        &save_cfg.last_synced_snapshot_id,
        snapshots.first(),
    );

    Ok(GameSaveState {
        game_id: game.id.clone(),
        canonical_save_key: save_key,
        save_paths,
        config_paths,
        custom_save_paths: save_cfg.custom_save_paths.clone(),
        custom_config_paths: save_cfg.custom_config_paths.clone(),
        has_custom_save_paths: !save_cfg.custom_save_paths.is_empty(),
        pcgw_page,
        cloud_save_enabled: game.cloud_save_enabled,
        cloud_save_retention_override: game.cloud_save_retention_override,
        global_retention_count,
        effective_retention_count,
        cloud_sync_enabled: cloud_status.enabled,
        cloud_sync_folder_valid: cloud_status.is_folder_valid,
        is_game_running: GameLauncher::is_game_running(&game.id),
        local_save_hash,
        local_size_bytes,
        local_file_count,
        is_oversized: local_size_bytes > cloud::MAX_AUTO_SAVE_BYTES,
        max_auto_bytes: cloud::MAX_AUTO_SAVE_BYTES,
        sync_status,
        last_synced_at: save_cfg.last_synced_at,
        last_synced_snapshot_id: save_cfg.last_synced_snapshot_id,
        snapshots,
        safety_backups,
    })
}

fn compute_sync_status(
    current_device_id: &str,
    cloud_available: bool,
    save_paths: &[ResolvedSavePath],
    local_hash: Option<&str>,
    last_synced_snapshot_id: &Option<String>,
    latest_snapshot: Option<&CloudSaveSnapshot>,
) -> String {
    if save_paths.is_empty() {
        return "no_save_path".to_string();
    }
    if !cloud_available {
        return "cloud_disabled".to_string();
    }
    let Some(latest) = latest_snapshot else {
        return "not_synced".to_string();
    };

    if let Some(lh) = local_hash {
        if lh == latest.sha256 {
            return "in_sync".to_string();
        }
    }

    if latest.device_id != current_device_id
        && last_synced_snapshot_id.as_deref() != Some(latest.id.as_str())
    {
        return "peer_ahead".to_string();
    }

    "local_ahead".to_string()
}

pub async fn save_custom_save_paths(
    db: &Database,
    game_id: &str,
    save_paths: Vec<String>,
    config_paths: Vec<String>,
) -> Result<GameSaveState, String> {
    let mut cfg = db.get_game_save_config(game_id)?;
    cfg.custom_save_paths = clean_path_list(save_paths);
    cfg.custom_config_paths = clean_path_list(config_paths);
    cfg.updated_at = chrono::Utc::now().to_rfc3339();
    db.save_game_save_config(&cfg)?;
    get_game_save_state(db, game_id, false).await
}

fn clean_path_list(items: Vec<String>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for raw in items {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            continue;
        }
        if !out.iter().any(|x| x.eq_ignore_ascii_case(trimmed)) {
            out.push(trimmed.to_string());
        }
    }
    out
}

pub async fn set_game_cloud_save_settings(
    db: &std::sync::Arc<Database>,
    game_id: &str,
    enabled: bool,
    retention_override: Option<u32>,
) -> Result<GameSaveState, String> {
    let cleaned_override = retention_override.map(|v| v.clamp(1, 50));
    db.update_game_cloud_save_settings(game_id, enabled, cleaned_override)?;
    cloud_sync::spawn_background_export(db.clone());
    get_game_save_state(db, game_id, false).await
}

pub async fn force_push_cloud_save(
    db: &Database,
    game_id: &str,
    note: Option<String>,
    allow_oversized: bool,
) -> Result<CloudSaveActionResult, String> {
    let game = db
        .get_game_by_id(game_id)?
        .ok_or_else(|| format!("Game '{}' not found", game_id))?;
    let status = cloud_sync::get_cloud_sync_status(db)?;
    if !status.enabled || !status.is_folder_valid {
        return Err("Cloud Sync must be enabled with a valid shared folder before saving to the cloud.".to_string());
    }
    let sync_dir = status
        .folder_path
        .map(PathBuf::from)
        .ok_or_else(|| "Cloud Sync folder is not configured.".to_string())?;

    let state_before = get_game_save_state(db, game_id, false).await?;
    let (skipped, snapshot, message) = cloud::push_cloud_save_in_dir(
        db,
        &game,
        &state_before.save_paths,
        &sync_dir,
        "manual",
        note,
        allow_oversized,
    )?;

    let state = get_game_save_state(db, game_id, false).await?;
    Ok(CloudSaveActionResult {
        success: true,
        skipped,
        message,
        snapshot,
        state,
    })
}

pub async fn restore_cloud_save_snapshot(
    db: &Database,
    game_id: &str,
    snapshot_id: &str,
) -> Result<CloudSaveActionResult, String> {
    let game = db
        .get_game_by_id(game_id)?
        .ok_or_else(|| format!("Game '{}' not found", game_id))?;
    let status = cloud_sync::get_cloud_sync_status(db)?;
    if !status.enabled || !status.is_folder_valid {
        return Err("Cloud Sync folder is unavailable.".to_string());
    }
    let sync_dir = status
        .folder_path
        .map(PathBuf::from)
        .ok_or_else(|| "Cloud Sync folder is not configured.".to_string())?;

    let state_before = get_game_save_state(db, game_id, false).await?;
    let (snapshot, _) = cloud::restore_cloud_save_in_dir(
        db,
        &game,
        &state_before.save_paths,
        &sync_dir,
        &cloud::get_local_safety_backups_root(),
        snapshot_id,
    )?;

    let state = get_game_save_state(db, game_id, false).await?;
    Ok(CloudSaveActionResult {
        success: true,
        skipped: false,
        message: format!("Restored cloud save from {} ({}).", snapshot.device_name, snapshot.os),
        snapshot: Some(snapshot),
        state,
    })
}

pub async fn delete_cloud_save_snapshot(
    db: &Database,
    game_id: &str,
    snapshot_id: &str,
) -> Result<GameSaveState, String> {
    let game = db
        .get_game_by_id(game_id)?
        .ok_or_else(|| format!("Game '{}' not found", game_id))?;
    let status = cloud_sync::get_cloud_sync_status(db)?;
    let sync_dir = status
        .folder_path
        .map(PathBuf::from)
        .ok_or_else(|| "Cloud Sync folder is not configured.".to_string())?;
    cloud::delete_cloud_snapshot_in_dir(&sync_dir, &game, snapshot_id)?;
    get_game_save_state(db, game_id, false).await
}

pub async fn restore_local_safety_backup(
    db: &Database,
    game_id: &str,
    backup_id: &str,
) -> Result<GameSaveState, String> {
    let game = db
        .get_game_by_id(game_id)?
        .ok_or_else(|| format!("Game '{}' not found", game_id))?;
    let state_before = get_game_save_state(db, game_id, false).await?;
    cloud::restore_local_safety_backup_in(
        db,
        &game,
        &state_before.save_paths,
        &cloud::get_local_safety_backups_root(),
        backup_id,
    )?;
    get_game_save_state(db, game_id, false).await
}

pub async fn check_pre_launch_cloud_save(
    db: &Database,
    game_id: &str,
) -> Result<PreLaunchSaveCheck, String> {
    let game = db
        .get_game_by_id(game_id)?
        .ok_or_else(|| format!("Game '{}' not found", game_id))?;
    if !game.cloud_save_enabled {
        return Ok(PreLaunchSaveCheck {
            status: "ok".to_string(),
            latest_snapshot: None,
            local_size_bytes: 0,
            message: None,
        });
    }

    let status = cloud_sync::get_cloud_sync_status(db)?;
    let cloud_available = status.enabled && status.is_folder_valid;
    let sync_dir = status.folder_path.map(PathBuf::from);
    let resolved_paths = resolve_game_paths_offline(db, &game);

    cloud::check_pre_launch_in_dir(
        db,
        &game,
        &resolved_paths,
        sync_dir.as_deref(),
        cloud_available,
    )
}

pub fn get_cloud_saves_overview(db: &Database) -> Result<CloudSavesOverview, String> {
    cloud::get_cloud_saves_overview(db)
}
