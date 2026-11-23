use crate::autostart::AutostartManager;
use crate::cloud_sync;
use crate::db::Database;
use crate::emulator::EmulatorService;
use crate::launcher::GameLauncher;
use crate::metadata::hltb::HltbFetcher;
use crate::metadata::steam::SteamMetadataFetcher;
use crate::metadata::steamgriddb::SteamGridDBClient;
use crate::metadata::epic::EpicMetadataFetcher;
use crate::models::*;
use crate::plugins;
use crate::scanner::steam::SteamScanner;
use crate::scanner::epic::EpicScanner;
use crate::themes;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

#[derive(Clone)]
pub struct DaemonEmitter {
    sender: tokio::sync::mpsc::Sender<String>,
}

impl DaemonEmitter {
    pub fn new(sender: tokio::sync::mpsc::Sender<String>) -> Self {
        Self { sender }
    }

    pub fn emit<T: Serialize + ?Sized>(&self, event: &str, payload: &T) {
        #[derive(Serialize)]
        struct EventEnvelope<'a, P: Serialize + ?Sized> {
            event: &'a str,
            payload: &'a P,
        }
        if let Ok(json_line) = serde_json::to_string(&EventEnvelope { event, payload }) {
            let _ = self.sender.try_send(json_line);
        }
    }
}

#[derive(Deserialize)]
struct RpcRequest {
    id: Option<u64>,
    method: String,
    #[serde(default)]
    params: serde_json::Value,
}

#[derive(Serialize)]
struct RpcResponse {
    id: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

pub async fn run_daemon() {
    #[cfg(target_os = "linux")]
    {
        if std::env::var_os("__NV_DISABLE_EXPLICIT_SYNC").is_none() {
            std::env::set_var("__NV_DISABLE_EXPLICIT_SYNC", "1");
        }
    }

    eprintln!("[openplay-core] Initializing SQLite database...");
    let db = Arc::new(Database::new().expect("Failed to initialize OpenPlay SQLite database"));
    apply_installer_seed_if_present(&db);

    let (stdout_tx, mut stdout_rx) = tokio::sync::mpsc::channel::<String>(256);
    let emitter = DaemonEmitter::new(stdout_tx.clone());

    // 1. Spawn dedicated stdout line-writer task
    tokio::spawn(async move {
        let mut stdout = tokio::io::stdout();
        while let Some(line) = stdout_rx.recv().await {
            let _ = stdout.write_all(line.as_bytes()).await;
            let _ = stdout.write_all(b"\n").await;
            let _ = stdout.flush().await;
        }
    });

    // 2. Spawn background workers (library sync, periodic backups, cloud sync loop)
    spawn_background_workers(db.clone(), emitter.clone());

    // 2b. Spawn Linux native gamepad watcher
    let native_gamepad = Arc::new(std::sync::Mutex::new(
        crate::gamepad::NativeGamepadSnapshot::default(),
    ));
    {
        let em_gp = emitter.clone();
        crate::gamepad::start_native_gamepad_watcher_with_callback(
            native_gamepad.clone(),
            move |snap| {
                em_gp.emit("native-gamepad-state", &snap);
            },
        );
    }

    eprintln!("[openplay-core] Daemon ready. Listening for JSON-RPC requests on stdin...");

    // 3. Stdio request loop
    let stdin = tokio::io::stdin();
    let mut reader = BufReader::new(stdin).lines();

    while let Ok(Some(line)) = reader.next_line().await {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let req: RpcRequest = match serde_json::from_str(trimmed) {
            Ok(r) => r,
            Err(e) => {
                eprintln!("[openplay-core] Failed to parse RPC request: {} (input: {})", e, trimmed);
                continue;
            }
        };

        let db_clone = db.clone();
        let emitter_clone = emitter.clone();
        let stdout_tx_clone = stdout_tx.clone();
        let gp_clone = native_gamepad.clone();

        tokio::spawn(async move {
            // Fast-path direct JSON serialization for large library responses to avoid
            // allocating a huge intermediate serde_json::Value DOM tree in RAM.
            let direct_json: Option<Result<String, String>> = match req.method.as_str() {
                "get_games" | "get_all_games" => Some(
                    crate::sync_and_get_all_games_core(&db_clone)
                        .and_then(|games| serde_json::to_string(&games).map_err(|e| e.to_string())),
                ),
                "get_games_page" => {
                    let limit = req
                        .params
                        .get("limit")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(200) as usize;
                    let offset = req
                        .params
                        .get("offset")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0) as usize;
                    let include_heavy = req
                        .params
                        .get("includeHeavyFields")
                        .or_else(|| req.params.get("include_heavy_fields"))
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);
                    Some(
                        crate::sync_and_get_games_page_core(&db_clone, limit, offset, include_heavy)
                            .and_then(|page| serde_json::to_string(&page).map_err(|e| e.to_string())),
                    )
                }
                _ => None,
            };

            if let Some(raw_res) = direct_json {
                let json_line = match raw_res {
                    Ok(raw_result) => match req.id {
                        Some(id) => format!("{{\"id\":{},\"result\":{}}}", id, raw_result),
                        None => format!("{{\"id\":null,\"result\":{}}}", raw_result),
                    },
                    Err(err) => {
                        let resp = RpcResponse {
                            id: req.id,
                            result: None,
                            error: Some(err),
                        };
                        serde_json::to_string(&resp).unwrap_or_default()
                    }
                };
                if !json_line.is_empty() {
                    let _ = stdout_tx_clone.send(json_line).await;
                }
                return;
            }

            let res = handle_rpc_call(&req.method, req.params, &db_clone, &emitter_clone, &gp_clone).await;
            let resp = match res {
                Ok(val) => RpcResponse {
                    id: req.id,
                    result: Some(val),
                    error: None,
                },
                Err(err) => RpcResponse {
                    id: req.id,
                    result: None,
                    error: Some(err),
                },
            };

            if let Ok(json_line) = serde_json::to_string(&resp) {
                let _ = stdout_tx_clone.send(json_line).await;
            }
        });
    }

    eprintln!("[openplay-core] Stdin closed (EOF). Shutting down daemon gracefully...");
}

fn detect_os_pretty_name() -> String {
    #[cfg(target_os = "linux")]
    {
        if let Ok(content) = std::fs::read_to_string("/etc/os-release") {
            for line in content.lines() {
                if let Some(val) = line.strip_prefix("PRETTY_NAME=") {
                    let clean = val.trim().trim_matches('"').trim_matches('\'').trim();
                    if !clean.is_empty() {
                        return clean.to_string();
                    }
                }
            }
        }
        return "Linux".to_string();
    }
    #[cfg(target_os = "windows")]
    {
        return sysinfo::System::long_os_version().unwrap_or_else(|| "Windows".to_string());
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        return std::env::consts::OS.to_string();
    }
}

/// Applies optional initial settings written by the OpenPlay custom installer wizard
/// (`<data_dir>/OpenPlay/installer-seed.json`) non-destructively on first launch.
fn apply_installer_seed_if_present(db: &Database) {
    let seed_path = dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("OpenPlay")
        .join("installer-seed.json");

    if !seed_path.exists() {
        return;
    }

    let raw = match std::fs::read_to_string(&seed_path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[InstallerSeed] Failed to read seed file: {}", e);
            return;
        }
    };

    let seed: serde_json::Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("[InstallerSeed] Invalid JSON in seed file: {}", e);
            let _ = std::fs::remove_file(&seed_path);
            return;
        }
    };

    let mut cfg = db.get_app_config().unwrap_or_default();
    let mut changed = false;

    let opt_str = |key: &str| -> Option<String> {
        seed.get(key)
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
    };

    if let Some(v) = opt_str("steamgriddb_api_key") {
        cfg.steamgriddb_api_key = Some(v);
        changed = true;
    }
    if let Some(v) = opt_str("retroachievements_username") {
        cfg.retroachievements_username = Some(v);
        changed = true;
    }
    if let Some(v) = opt_str("retroachievements_api_key") {
        cfg.retroachievements_api_key = Some(v);
        changed = true;
    }
    if let Some(v) = opt_str("igdb_client_id") {
        cfg.igdb_client_id = Some(v);
        changed = true;
    }
    if let Some(v) = opt_str("igdb_client_secret") {
        cfg.igdb_client_secret = Some(v);
        changed = true;
    }
    if let Some(v) = opt_str("cloud_sync_folder") {
        cfg.cloud_sync_folder = Some(v);
        cfg.cloud_sync_enabled = Some(true);
        changed = true;
    }
    if let Some(b) = seed.get("start_in_console_mode").and_then(|v| v.as_bool()) {
        cfg.start_in_console_mode = Some(b);
        changed = true;
    }

    if changed {
        if let Err(e) = db.save_app_config(&cfg) {
            eprintln!("[InstallerSeed] Failed to save seeded config: {}", e);
            return;
        }
        eprintln!("[InstallerSeed] Applied initial installer configuration successfully.");
    }

    let _ = std::fs::remove_file(&seed_path);
}

fn spawn_background_workers(db: Arc<Database>, emitter: DaemonEmitter) {
    tokio::spawn(async move {
        // Initial grace period for UI startup
        tokio::time::sleep(tokio::time::Duration::from_secs(4)).await;

        // Startup library sync if enabled
        if let Ok(cfg) = db.get_app_config() {
            if cfg.sync_on_startup.unwrap_or(true) {
                eprintln!("[BackgroundSync] Running startup library sync across connected providers...");
                let _ = crate::sync_all_libraries_core(None, &db, false).await;
                emitter.emit("library-updated", &serde_json::json!({}));
            }
        }

        // Automated periodic database backup check
        if let Ok(mut cfg) = db.get_app_config() {
            let freq = cfg.backup_frequency.as_deref().unwrap_or("daily");
            if freq != "disabled" {
                let is_due = match cfg.last_backup_time.as_deref() {
                    None => true,
                    Some(t) => {
                        if let Ok(last_dt) = chrono::NaiveDateTime::parse_from_str(t, "%Y-%m-%d %H:%M:%S") {
                            let now = chrono::Local::now().naive_local();
                            let diff = now.signed_duration_since(last_dt);
                            if freq == "weekly" {
                                diff.num_days() >= 7
                            } else {
                                diff.num_days() >= 1
                            }
                        } else {
                            true
                        }
                    }
                };

                if is_due {
                    eprintln!("[AutoBackup] Creating periodic automated database backup...");
                    if let Ok(info) = db.create_backup(None, true) {
                        eprintln!("[AutoBackup] Snapshot saved: {} ({} bytes, {} games)", info.filename, info.size_bytes, info.game_count);
                        cfg.last_backup_time = Some(chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string());
                        let _ = db.save_app_config(&cfg);
                        let retention = cfg.backup_retention_count.unwrap_or(5) as usize;
                        let _ = db.prune_backups(retention);
                    }
                }
            }
        }

        // Startup Cloud Sync
        tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
        let run_cloud_on_startup = db.get_app_config().ok().and_then(|c| c.cloud_sync_on_startup).unwrap_or(true);
        if run_cloud_on_startup {
            if let Ok(status) = cloud_sync::get_cloud_sync_status(&db) {
                if status.enabled && status.is_folder_valid {
                    if let Some(folder) = status.folder_path {
                        eprintln!("[CloudSync] Executing startup cloud sync from {:?}", folder);
                        let p = PathBuf::from(folder);
                        if let Ok(summary) = cloud_sync::sync_cloud_directory(&db, &p) {
                            emitter.emit("cloud-sync-completed", &summary);
                            emitter.emit("library-updated", &serde_json::json!({}));
                        }
                    }
                }
            }
        }

        // Background Save Location Pre-Warmer (smartly caches uncached installed games without UI lag)
        {
            let db_save = db.clone();
            let em_save = emitter.clone();
            tokio::spawn(async move {
                tokio::time::sleep(tokio::time::Duration::from_secs(4)).await;
                let warmed = crate::saves::warm_installed_game_save_locations(&db_save, |gid| {
                    em_save.emit("save-locations-warmed", &serde_json::json!({ "game_id": gid }));
                })
                .await;
                if warmed > 0 {
                    eprintln!("[SaveDiscovery] Background pre-warmed save rules for {} installed games", warmed);
                }
            });
        }

        // Periodic loop (checks every 60s)
        let mut last_periodic_sync = std::time::Instant::now();
        let mut last_cloud_sync_tick = std::time::Instant::now();

        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;

            let cloud_interval_mins = db.get_app_config().ok().and_then(|c| c.cloud_sync_interval_minutes).unwrap_or(15);
            if cloud_interval_mins > 0 && last_cloud_sync_tick.elapsed().as_secs() >= (cloud_interval_mins as u64) * 60 {
                last_cloud_sync_tick = std::time::Instant::now();
                if let Ok(status) = cloud_sync::get_cloud_sync_status(&db) {
                    if status.enabled && status.is_folder_valid {
                        if let Some(folder) = status.folder_path {
                            let p = PathBuf::from(folder);
                            if let Ok(summary) = cloud_sync::sync_cloud_directory(&db, &p) {
                                emitter.emit("cloud-sync-completed", &summary);
                                emitter.emit("library-updated", &serde_json::json!({}));
                            }
                        }
                    }
                }
            }

            if let Ok(cfg) = db.get_app_config() {
                let interval_hours = cfg.periodic_playtime_sync_hours.unwrap_or(0);
                if interval_hours > 0 {
                    let required_secs = (interval_hours as u64) * 3600;
                    if last_periodic_sync.elapsed().as_secs() >= required_secs {
                        let running = GameLauncher::get_running_games(None, Some(&db));
                        if !running.is_empty() {
                            eprintln!("[BackgroundSync] Periodic sync deferred: active game running ({:?})", running);
                            continue;
                        }
                        eprintln!("[BackgroundSync] Executing periodic background playtime sync ({}h interval)...", interval_hours);
                        let _ = crate::sync_all_libraries_core(None, &db, true).await;
                        emitter.emit("library-updated", &serde_json::json!({}));
                        last_periodic_sync = std::time::Instant::now();
                    }
                }
            }
        }
    });
}

pub async fn handle_rpc_call(
    method: &str,
    params: serde_json::Value,
    db: &Arc<Database>,
    emitter: &DaemonEmitter,
    native_gamepad: &Arc<std::sync::Mutex<crate::gamepad::NativeGamepadSnapshot>>,
) -> Result<serde_json::Value, String> {
    match method {
        "get_app_version" => {
            let ver = std::env::var("OPENPLAY_DEBUG_APP_VERSION")
                .ok()
                .filter(|s| !s.trim().is_empty())
                .unwrap_or_else(|| env!("CARGO_PKG_VERSION").to_string());
            Ok(serde_json::to_value(ver).map_err(|e| e.to_string())?)
        }
        "get_system_info" => {
            let os_name = detect_os_pretty_name();
            let ver = std::env::var("OPENPLAY_DEBUG_APP_VERSION")
                .ok()
                .filter(|s| !s.trim().is_empty())
                .unwrap_or_else(|| env!("CARGO_PKG_VERSION").to_string());
            Ok(serde_json::json!({
                "version": ver,
                "os": std::env::consts::OS,
                "os_name": os_name,
                "arch": std::env::consts::ARCH,
                "family": std::env::consts::FAMILY,
                "is_appimage": std::env::var("APPIMAGE").is_ok(),
            }))
        }

        // --- 1. Games & Library ---
        "get_games" | "get_all_games" => {
            let games = crate::sync_and_get_all_games_core(db)?;
            Ok(serde_json::to_value(games).map_err(|e| e.to_string())?)
        }
        "get_games_page" => {
            let limit = params.get("limit").and_then(|v| v.as_u64()).unwrap_or(200) as usize;
            let offset = params.get("offset").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
            let include_heavy = params
                .get("includeHeavyFields")
                .or_else(|| params.get("include_heavy_fields"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let page = crate::sync_and_get_games_page_core(db, limit, offset, include_heavy)?;
            Ok(serde_json::to_value(page).map_err(|e| e.to_string())?)
        }
        "get_game_by_id" => {
            let game_id = get_str_param(&params, &["gameId", "game_id", "id"])
                .ok_or_else(|| "Missing gameId".to_string())?;
            let game = db.get_game_by_id(&game_id)?;
            Ok(serde_json::to_value(game).map_err(|e| e.to_string())?)
        }
        "launch_game" => {
            let game_id = get_str_param(&params, &["gameId", "game_id"])
                .ok_or_else(|| "Missing gameId".to_string())?;
            let action_id = get_str_param(&params, &["actionId", "action_id"]);
            let sink = crate::launcher::LauncherEventSink::Daemon(emitter.clone());
            let res = GameLauncher::launch_game_by_id(sink, db.clone(), &game_id, action_id.as_deref())?;
            Ok(serde_json::to_value(res).map_err(|e| e.to_string())?)
        }
        "stop_game" => {
            let game_id = get_str_param(&params, &["gameId", "game_id"])
                .ok_or_else(|| "Missing gameId".to_string())?;
            let sink = crate::launcher::LauncherEventSink::Daemon(emitter.clone());
            GameLauncher::stop_game(sink, Some(db.clone()), &game_id)?;
            Ok(serde_json::Value::Null)
        }
        "get_running_games" => {
            let sink = crate::launcher::LauncherEventSink::Daemon(emitter.clone());
            let running = GameLauncher::get_running_games(Some(&sink), Some(db));
            Ok(serde_json::to_value(running).map_err(|e| e.to_string())?)
        }
        "get_available_runners" => {
            let cfg = db.get_app_config().unwrap_or_default();
            let runners = crate::launcher::RunnerManager::detect_available_runners(cfg.linux_custom_runner_path.as_deref());
            Ok(serde_json::to_value(runners).map_err(|e| e.to_string())?)
        }
        "install_game" => {
            let game_id = get_str_param(&params, &["gameId", "game_id"])
                .ok_or_else(|| "Missing gameId".to_string())?;
            crate::install_game_core(db, &game_id)?;
            Ok(serde_json::Value::Null)
        }
        "clear_all_games" => {
            db.clear_all_games()?;
            emitter.emit("library-updated", &serde_json::json!({}));
            Ok(serde_json::Value::Null)
        }
        "save_game" => {
            let game: Game = serde_json::from_value(
                params.get("game").cloned().unwrap_or(params.clone())
            ).map_err(|e| format!("Invalid game payload: {}", e))?;

            let saved = crate::save_game_core(game, db)?;
            emitter.emit("game-updated", &saved);
            cloud_sync::spawn_background_export(db.clone());
            Ok(serde_json::to_value(&saved).map_err(|e| e.to_string())?)
        }
        "delete_game" => {
            let game_id = get_str_param(&params, &["gameId", "game_id"])
                .ok_or_else(|| "Missing gameId".to_string())?;
            db.delete_game(&game_id)?;
            emitter.emit("game-deleted", &game_id);
            cloud_sync::spawn_background_export(db.clone());
            Ok(serde_json::Value::Null)
        }
        "toggle_favorite" => {
            let game_id = get_str_param(&params, &["gameId", "game_id"])
                .ok_or_else(|| "Missing gameId".to_string())?;
            let next_fav = db.toggle_favorite(&game_id)?;
            if let Ok(Some(updated)) = db.get_game_by_id(&game_id) {
                emitter.emit("game-updated", &updated);
            }
            cloud_sync::spawn_background_export(db.clone());
            Ok(serde_json::Value::Bool(next_fav))
        }
        "set_game_favorite" => {
            let game_id = get_str_param(&params, &["gameId", "game_id"])
                .ok_or_else(|| "Missing gameId".to_string())?;
            let is_fav = params.get("isFavorite").or_else(|| params.get("is_favorite"))
                .and_then(|v| v.as_bool()).unwrap_or(false);
            let _ = db.set_favorite(&game_id, is_fav)?;
            if let Ok(Some(updated)) = db.get_game_by_id(&game_id) {
                emitter.emit("game-updated", &updated);
            }
            cloud_sync::spawn_background_export(db.clone());
            Ok(serde_json::Value::Null)
        }
        "set_game_hidden" => {
            let id = get_str_param(&params, &["id", "gameId", "game_id"])
                .ok_or_else(|| "Missing game id".to_string())?;
            let hidden = params.get("hidden").and_then(|v| v.as_bool()).unwrap_or(false);
            if let Some(mut game) = db.get_game_by_id(&id)? {
                game.is_hidden = hidden;
                game.updated_at = Some(chrono::Utc::now().to_rfc3339());
                db.save_game_exact(&game)?;
                emitter.emit("game-updated", &game);
                cloud_sync::spawn_background_export(db.clone());
            }
            Ok(serde_json::Value::Null)
        }
        "scan_local_executable" => {
            let path = get_str_param(&params, &["path"])
                .ok_or_else(|| "Missing path".to_string())?;
            let game = crate::scanner::local::LocalScanner::scan_executable(&path)?;
            Ok(serde_json::to_value(game).map_err(|e| e.to_string())?)
        }
        "scan_local_folder" => {
            let path = get_str_param(&params, &["path"])
                .ok_or_else(|| "Missing path".to_string())?;
            let games = crate::scanner::local::LocalScanner::scan_folder(&path)?;
            Ok(serde_json::to_value(games).map_err(|e| e.to_string())?)
        }
        "scan_installed_linux_apps" => {
            let games = crate::scanner::local::LocalScanner::scan_installed_desktop_apps()?;
            Ok(serde_json::to_value(games).map_err(|e| e.to_string())?)
        }
        "add_local_games" => {
            let games: Vec<Game> = serde_json::from_value(
                params.get("games").cloned().unwrap_or(params.clone())
            ).map_err(|e| format!("Invalid games payload: {}", e))?;
            let em = emitter.clone();
            let count = crate::add_local_games_core(games, db, move |g| {
                em.emit("game-updated", g);
            })?;
            emitter.emit("library-updated", &serde_json::json!({}));
            cloud_sync::spawn_background_export(db.clone());
            Ok(serde_json::json!(count))
        }

        // --- 2. Metadata & Media ---
        "fetch_game_metadata" => {
            let game_id = get_str_param(&params, &["gameId", "game_id"])
                .ok_or_else(|| "Missing gameId".to_string())?;
            let mut game = db.get_game_by_id(&game_id)?.ok_or_else(|| "Game not found".to_string())?;
            if game.source.eq_ignore_ascii_case("steam") {
                if let Some(ref appid) = game.source_id {
                    if let Ok(meta) = SteamMetadataFetcher::fetch_metadata_for_appid(appid).await {
                        SteamMetadataFetcher::apply_metadata(&mut game, meta);
                    }
                }
            } else if game.source.eq_ignore_ascii_case("epic") {
                if let Ok(meta) = EpicMetadataFetcher::fetch_metadata_by_title(&game.title).await {
                    if game.cover_image.is_none() { game.cover_image = meta.cover_image; }
                    if game.background_image.is_none() { game.background_image = meta.background_image; }
                    if game.description.is_none() { game.description = meta.description; }
                    if game.developer.is_none() { game.developer = meta.developer; }
                    if game.publisher.is_none() { game.publisher = meta.publisher; }
                }
            }
            db.save_game_exact(&game)?;
            emitter.emit("game-updated", &game);
            Ok(serde_json::to_value(game).map_err(|e| e.to_string())?)
        }
        "fetch_metadata_from_source" => {
            let title = get_str_param(&params, &["title"]).unwrap_or_default();
            let provider = get_str_param(&params, &["provider"]).unwrap_or_else(|| "steam".to_string());
            let game_id = get_str_param(&params, &["gameId", "game_id"]);
            let comparison = crate::fetch_metadata_from_source_core(
                &title,
                &provider,
                game_id.as_deref(),
                db,
            ).await?;
            Ok(serde_json::to_value(comparison).map_err(|e| e.to_string())?)
        }
        "search_steamgriddb" => {
            let key = db.get_setting("steamgriddb_key")?
                .ok_or_else(|| "Please configure your SteamGridDB API key in Settings -> APIs & Services".to_string())?;
            if key.trim().is_empty() {
                return Err("SteamGridDB API key is empty. Configure it in Settings -> APIs & Services.".to_string());
            }
            let config = db.get_app_config().unwrap_or_default();
            let nsfw = config.steamgriddb_nsfw.unwrap_or(false);
            let appid = get_str_param(&params, &["appid"]);
            let source = get_str_param(&params, &["source"]);
            let title = get_str_param(&params, &["title", "gameTitle", "game_title"]);
            let asset_type = get_str_param(&params, &["assetType", "asset_type"]).unwrap_or_else(|| "grid".to_string());
            let game_id = SteamGridDBClient::resolve_game_id(&key, source.as_deref(), appid.as_deref(), title.as_deref()).await?;
            let assets = SteamGridDBClient::fetch_assets(&key, game_id, &asset_type, nsfw).await?;
            Ok(serde_json::to_value(assets).map_err(|e| e.to_string())?)
        }
        "save_steamgriddb_key" => {
            let key = get_str_param(&params, &["key", "apiKey", "api_key"]).unwrap_or_default();
            db.set_setting("steamgriddb_key", &key)?;
            Ok(serde_json::Value::Null)
        }
        "get_steamgriddb_key" => {
            let key = db.get_setting("steamgriddb_key")?.unwrap_or_default();
            Ok(serde_json::json!(key))
        }
        "save_igdb_keys" => {
            let client_id = get_str_param(&params, &["clientId", "client_id"]).unwrap_or_default();
            let client_secret = get_str_param(&params, &["clientSecret", "client_secret"]).unwrap_or_default();
            db.set_setting("igdb_client_id", &client_id)?;
            db.set_setting("igdb_client_secret", &client_secret)?;
            Ok(serde_json::Value::Null)
        }
        "get_igdb_keys" => {
            let cid = db.get_setting("igdb_client_id")?.unwrap_or_default();
            let sec = db.get_setting("igdb_client_secret")?.unwrap_or_default();
            Ok(serde_json::json!({ "client_id": cid, "client_secret": sec }))
        }
        "apply_custom_artwork" => {
            let game_id = get_str_param(&params, &["gameId", "game_id"])
                .ok_or_else(|| "Missing gameId".to_string())?;
            let mut game = db.get_game_by_id(&game_id)?.ok_or_else(|| "Game not found".to_string())?;
            if let Some(c) = get_str_param(&params, &["coverImage", "cover_image"]) {
                if !c.trim().is_empty() { game.cover_image = Some(c); }
            }
            if let Some(b) = get_str_param(&params, &["backgroundImage", "background_image"]) {
                if !b.trim().is_empty() { game.background_image = Some(b); }
            }
            if let Some(l) = get_str_param(&params, &["logoImage", "logo_image"]) {
                if !l.trim().is_empty() { game.logo_image = Some(l); }
            }
            if let Some(i) = get_str_param(&params, &["iconImage", "icon_image"]) {
                if !i.trim().is_empty() { game.icon_image = Some(i); }
            }
            game.updated_at = Some(chrono::Utc::now().to_rfc3339());
            db.save_game_exact(&game)?;
            emitter.emit("game-updated", &game);
            cloud_sync::spawn_background_export(db.clone());
            Ok(serde_json::to_value(game).map_err(|e| e.to_string())?)
        }
        "get_game_hltb" => {
            let title = get_str_param(&params, &["title"])
                .ok_or_else(|| "Missing title".to_string())?;
            let res = HltbFetcher::fetch_hltb(&title).await;
            Ok(serde_json::to_value(res).map_err(|e| e.to_string())?)
        }
        "get_store_trailers" => {
            let title = get_str_param(&params, &["title"]).unwrap_or_default();
            let source_id = get_str_param(&params, &["sourceId", "source_id"]);
            let trailers = SteamMetadataFetcher::fetch_store_trailers(&title, source_id.as_deref()).await?;
            Ok(serde_json::to_value(trailers).map_err(|e| e.to_string())?)
        }
        "get_steam_current_players" | "get_game_current_players" => {
            let title = get_str_param(&params, &["title"]);
            let appid_val = params.get("appid").cloned();
            let count = crate::get_game_current_players_core(title, appid_val).await?;
            Ok(serde_json::json!(count))
        }
        "get_steam_news" | "get_game_news" => {
            let game_id = get_str_param(&params, &["gameId", "game_id"]);
            let title = get_str_param(&params, &["title"]);
            let appid_val = params.get("appid").cloned();
            let news = crate::get_game_news_core(game_id, title, appid_val).await?;
            Ok(serde_json::to_value(news).map_err(|e| e.to_string())?)
        }
        "sync_all_metadata" => {
            let installed_only = params.get("installedOnly").or_else(|| params.get("installed_only")).and_then(|v| v.as_bool());
            let em = emitter.clone();
            let count = crate::sync_all_metadata_core(db, installed_only, move |g| {
                em.emit("game-updated", g);
            }).await?;
            emitter.emit("library-updated", &serde_json::json!({}));
            Ok(serde_json::json!(count))
        }
        "refresh_game_live_data" => {
            let game_id = get_str_param(&params, &["gameId", "game_id"])
                .ok_or_else(|| "Missing gameId".to_string())?;
            let game = crate::refresh_game_live_data_core(db, &game_id).await?;
            emitter.emit("achievements-updated", &game.id);
            emitter.emit("game-updated", &game);
            cloud_sync::spawn_background_export(db.clone());
            Ok(serde_json::to_value(game).map_err(|e| e.to_string())?)
        }
        "sync_live_playtimes" => {
            let em = emitter.clone();
            let count = crate::sync_live_playtimes_core(db, move |g| {
                em.emit("game-updated", g);
            }).await?;
            Ok(serde_json::json!(count))
        }
        "warmup_active_achievements" => {
            let em1 = emitter.clone();
            let em2 = emitter.clone();
            let count = crate::warmup_active_achievements_core(db, move |gid, updated_g| {
                em1.emit("achievements-updated", gid);
                if let Some(ref g) = updated_g {
                    em2.emit("game-updated", g);
                }
            }).await?;
            Ok(serde_json::json!(count))
        }

        // --- 3. Storefronts & Providers ---
        "scan_steam_library" => {
            let res = crate::scan_steam_library_core(db).await?;
            emitter.emit("library-updated", &serde_json::json!({}));
            Ok(serde_json::to_value(res).map_err(|e| e.to_string())?)
        }
        "get_steam_integration" => {
            let integ = db.get_integration("steam")?;
            Ok(serde_json::to_value(integ).map_err(|e| e.to_string())?)
        }
        "save_steam_integration" => {
            let integ: LibraryIntegration = serde_json::from_value(
                params.get("integration").cloned().unwrap_or(params.clone())
            ).map_err(|e| format!("Invalid integration payload: {}", e))?;
            db.save_integration(&integ)?;
            Ok(serde_json::Value::Null)
        }
        "logout_steam" => {
            let mut integ = db.get_integration("steam").unwrap_or_default();
            integ.is_authenticated = false;
            integ.account_id = None;
            integ.username = None;
            integ.avatar_url = None;
            db.save_integration(&integ)?;
            Ok(serde_json::to_value(integ).map_err(|e| e.to_string())?)
        }
        "authenticate_steam_account" => {
            let id_or_vanity = get_str_param(&params, &["idOrVanity", "id_or_vanity", "id"])
                .ok_or_else(|| "Missing Steam ID".to_string())?;
            let mut integ = db.get_integration("steam").unwrap_or_default();
            let (steamid64, username, avatar_url) = SteamScanner::fetch_steam_profile(&id_or_vanity).await?;
            integ.is_authenticated = true;
            integ.account_id = Some(steamid64);
            integ.username = Some(username);
            integ.avatar_url = if avatar_url.is_empty() { None } else { Some(avatar_url) };
            db.save_integration(&integ)?;
            Ok(serde_json::to_value(integ).map_err(|e| e.to_string())?)
        }
        "scan_epic_library" => {
            let res = crate::scan_epic_library_core(db).await?;
            emitter.emit("library-updated", &serde_json::json!({}));
            Ok(serde_json::to_value(res).map_err(|e| e.to_string())?)
        }
        "get_epic_integration" => {
            let integ = db.get_integration("epic")?;
            Ok(serde_json::to_value(integ).map_err(|e| e.to_string())?)
        }
        "save_epic_integration" => {
            let integ: LibraryIntegration = serde_json::from_value(
                params.get("integration").cloned().unwrap_or(params.clone())
            ).map_err(|e| format!("Invalid integration payload: {}", e))?;
            db.save_integration(&integ)?;
            Ok(serde_json::Value::Null)
        }
        "logout_epic" => {
            let mut integ = db.get_integration("epic").unwrap_or_default();
            integ.is_authenticated = false;
            integ.account_id = None;
            integ.username = None;
            integ.avatar_url = None;
            integ.access_token = None;
            integ.refresh_token = None;
            db.save_integration(&integ)?;
            Ok(serde_json::to_value(integ).map_err(|e| e.to_string())?)
        }
        "authenticate_epic_code" => {
            let code = get_str_param(&params, &["code"])
                .ok_or_else(|| "Missing exchange code".to_string())?;
            let mut integ = db.get_integration("epic").unwrap_or_default();
            let auth = EpicScanner::exchange_code_for_token(code.trim()).await?;
            integ.provider = "epic".to_string();
            integ.account_id = Some(auth.account_id);
            integ.username = Some(auth.display_name);
            integ.is_authenticated = true;
            integ.access_token = Some(auth.access_token);
            integ.refresh_token = auth.refresh_token;
            db.save_integration(&integ)?;
            Ok(serde_json::to_value(integ).map_err(|e| e.to_string())?)
        }
        "authenticate_gog_code" => {
            let code = get_str_param(&params, &["code"])
                .ok_or_else(|| "Missing code".to_string())?;
            let integ = crate::authenticate_gog_code_core(db, &code).await?;
            Ok(serde_json::to_value(integ).map_err(|e| e.to_string())?)
        }
        "authenticate_xbox_token" => {
            let token = get_str_param(&params, &["token"])
                .ok_or_else(|| "Missing token".to_string())?;
            let integ = crate::authenticate_xbox_token_core(db, &token).await?;
            Ok(serde_json::to_value(integ).map_err(|e| e.to_string())?)
        }
        "authenticate_battlenet_payload" => {
            let payload = get_str_param(&params, &["payload"])
                .ok_or_else(|| "Missing payload".to_string())?;
            let integ = crate::authenticate_battlenet_payload_core(db, &payload).await?;
            Ok(serde_json::to_value(integ).map_err(|e| e.to_string())?)
        }
        "authenticate_ea_token" => {
            let token = get_str_param(&params, &["token"])
                .ok_or_else(|| "Missing token".to_string())?;
            let integ = crate::authenticate_ea_token_core(db, &token).await?;
            Ok(serde_json::to_value(integ).map_err(|e| e.to_string())?)
        }
        "authenticate_ubisoft_ticket" => {
            let payload = get_str_param(&params, &["payload", "ticket"])
                .ok_or_else(|| "Missing payload".to_string())?;
            let integ = crate::authenticate_ubisoft_ticket_core(db, &payload).await?;
            Ok(serde_json::to_value(integ).map_err(|e| e.to_string())?)
        }
        "authenticate_amazon_code" => {
            let code = get_str_param(&params, &["code"])
                .ok_or_else(|| "Missing code".to_string())?;
            let integ = crate::authenticate_amazon_code_core(db, &code).await?;
            Ok(serde_json::to_value(integ).map_err(|e| e.to_string())?)
        }
        "get_provider_integration" => {
            let provider = get_str_param(&params, &["provider"])
                .ok_or_else(|| "Missing provider".to_string())?;
            let integ = db.get_integration(&provider)?;
            Ok(serde_json::to_value(integ).map_err(|e| e.to_string())?)
        }
        "save_provider_integration" => {
            let integ: LibraryIntegration = serde_json::from_value(
                params.get("integration").cloned().unwrap_or(params.clone())
            ).map_err(|e| format!("Invalid integration payload: {}", e))?;
            db.save_integration(&integ)?;
            Ok(serde_json::Value::Null)
        }
        "logout_provider" => {
            let provider = get_str_param(&params, &["provider"])
                .ok_or_else(|| "Missing provider".to_string())?;
            let mut integ = db.get_integration(&provider).unwrap_or_default();
            integ.is_authenticated = false;
            integ.account_id = None;
            integ.username = None;
            integ.avatar_url = None;
            integ.access_token = None;
            integ.refresh_token = None;
            db.save_integration(&integ)?;
            Ok(serde_json::to_value(integ).map_err(|e| e.to_string())?)
        }
        "scan_provider_library" => {
            let provider = get_str_param(&params, &["provider"])
                .ok_or_else(|| "Missing provider".to_string())?;
            let res = crate::scan_provider_library_core(&provider, None, db).await?;
            emitter.emit("library-updated", &serde_json::json!({}));
            Ok(serde_json::to_value(res).map_err(|e| e.to_string())?)
        }
        "sync_all_libraries" => {
            let playtime_only = params.get("playtimeOnly").or_else(|| params.get("playtime_only"))
                .and_then(|v| v.as_bool()).unwrap_or(false);
            let summary = crate::sync_all_libraries_core(None, db, playtime_only).await?;
            emitter.emit("library-sync-complete", &serde_json::json!({ "playtime_only": playtime_only }));
            emitter.emit("library-updated", &serde_json::json!({}));
            Ok(serde_json::to_value(summary).map_err(|e| e.to_string())?)
        }
        "get_connected_libraries" => {
            let providers = [
                ("steam", "Steam", "STEAM"),
                ("epic", "Epic Games", "EPIC"),
                ("gog", "GOG Galaxy", "GOG"),
                ("xbox", "Xbox / Game Pass", "XBOX"),
                ("battlenet", "Battle.net", "BNET"),
                ("ea", "EA App", "EA"),
                ("ubisoft", "Ubisoft Connect", "UPLAY"),
                ("riot", "Riot Games", "RIOT"),
                ("amazon", "Amazon Games", "AMZN"),
            ];
            let sources_in_db: HashSet<String> = db.get_distinct_sources().unwrap_or_default().into_iter().collect();
            let mut items = Vec::new();
            for (p_id, p_name, p_badge) in providers {
                let integ = db.get_integration(p_id).unwrap_or_default();
                let has_games = sources_in_db.iter().any(|s| s.contains(p_id));
                let is_connected = if p_id == "steam" {
                    integ.is_authenticated || has_games || SteamScanner::find_steam_install_dir().is_some()
                } else if p_id == "epic" {
                    integ.is_authenticated || has_games || EpicScanner::find_epic_data_dir().is_some()
                } else {
                    integ.is_authenticated || (integ.import_installed && has_games)
                };

                if is_connected {
                    items.push(ConnectedLibraryItem {
                        id: p_id.to_string(),
                        name: p_name.to_string(),
                        category: "store".to_string(),
                        badge: p_badge.to_string(),
                        is_authenticated: integ.is_authenticated,
                        last_sync: integ.last_sync,
                    });
                }
            }

            let cfg = db.get_app_config().unwrap_or_default();
            if let Some(ref ra_user) = cfg.retroachievements_username {
                if !ra_user.trim().is_empty() {
                    items.push(ConnectedLibraryItem {
                        id: "retroachievements".to_string(),
                        name: "RetroAchievements".to_string(),
                        category: "emulation".to_string(),
                        badge: "RA".to_string(),
                        is_authenticated: true,
                        last_sync: None,
                    });
                }
            }

            if let Ok(consoles) = db.get_configured_consoles() {
                for c in consoles {
                    items.push(ConnectedLibraryItem {
                        id: format!("console:{}", c.id),
                        name: c.name,
                        category: "emulation".to_string(),
                        badge: c.manufacturer,
                        is_authenticated: true,
                        last_sync: None,
                    });
                }
            }

            Ok(serde_json::to_value(items).map_err(|e| e.to_string())?)
        }

        // --- 4. Achievements ---
        "get_game_achievements" => {
            let game_id = get_str_param(&params, &["gameId", "game_id"])
                .ok_or_else(|| "Missing gameId".to_string())?;
            let achievements = db.get_game_achievements(&game_id)?;
            Ok(serde_json::to_value(achievements).map_err(|e| e.to_string())?)
        }
        "sync_game_achievements" => {
            let game_id = get_str_param(&params, &["gameId", "game_id"])
                .ok_or_else(|| "Missing gameId".to_string())?;
            let em = emitter.clone();
            let achs = crate::sync_game_achievements_core(db, &game_id, move |g| {
                em.emit("game-updated", g);
            }).await?;
            emitter.emit("achievements-updated", &game_id);
            cloud_sync::spawn_background_export(db.clone());
            Ok(serde_json::to_value(achs).map_err(|e| e.to_string())?)
        }
        "sync_all_achievements" => {
            let profile = crate::sync_all_achievements_core(None, db).await?;
            emitter.emit("library-updated", &serde_json::json!({}));
            emitter.emit("hunter-profile-updated", &profile);
            Ok(serde_json::to_value(profile).map_err(|e| e.to_string())?)
        }
        "sync_retroachievements" => {
            let profile = crate::sync_retroachievements_core_wrapper(None, db).await?;
            emitter.emit("library-updated", &serde_json::json!({}));
            emitter.emit("hunter-profile-updated", &profile);
            Ok(serde_json::to_value(profile).map_err(|e| e.to_string())?)
        }
        "get_hunter_profile" => {
            let all = db.get_all_games_summary()?;
            let profile = db.get_hunter_profile(&all)?;
            Ok(serde_json::to_value(profile).map_err(|e| e.to_string())?)
        }
        "get_game_achievement_summary" => {
            let game_id = get_str_param(&params, &["gameId", "game_id"])
                .ok_or_else(|| "Missing gameId".to_string())?;
            let game = db.get_game_by_id(&game_id)?.ok_or_else(|| "Game not found".to_string())?;
            let summary = db.get_game_achievement_summary(&game)?;
            Ok(serde_json::to_value(summary).map_err(|e| e.to_string())?)
        }

        // --- 5. Themes & Plugins ---
        "get_installed_themes" => {
            let themes_list = themes::list_themes(db)?;
            Ok(serde_json::to_value(themes_list).map_err(|e| e.to_string())?)
        }
        "get_active_theme_id" => {
            let active = themes::get_active_theme_id(db);
            Ok(serde_json::json!(active))
        }
        "set_active_theme" => {
            let theme_id = get_str_param(&params, &["themeId", "theme_id"])
                .ok_or_else(|| "Missing themeId".to_string())?;
            themes::set_active_theme(db, &theme_id)?;
            cloud_sync::spawn_background_export(db.clone());
            Ok(serde_json::Value::Null)
        }
        "get_active_console_theme_id" => {
            let active = themes::get_active_console_theme_id(db);
            Ok(serde_json::json!(active))
        }
        "set_active_console_theme" => {
            let theme_id = get_str_param(&params, &["themeId", "theme_id"])
                .ok_or_else(|| "Missing themeId".to_string())?;
            themes::set_active_console_theme(db, &theme_id)?;
            cloud_sync::spawn_background_export(db.clone());
            Ok(serde_json::Value::Null)
        }
        "system_power_action" => {
            let action = get_str_param(&params, &["action"])
                .ok_or_else(|| "Missing action".to_string())?;
            crate::execute_system_power_action(&action)?;
            Ok(serde_json::Value::Null)
        }
        "get_theme_config" => {
            let theme_id = get_str_param(&params, &["themeId", "theme_id"])
                .ok_or_else(|| "Missing themeId".to_string())?;
            let cfg = themes::get_theme_config(db, &theme_id)?;
            Ok(serde_json::to_value(cfg).map_err(|e| e.to_string())?)
        }
        "save_theme_config" => {
            let theme_id = get_str_param(&params, &["themeId", "theme_id"])
                .ok_or_else(|| "Missing themeId".to_string())?;
            let json_str = if let Some(s) = get_str_param(&params, &["configJson", "config_json"]) {
                s
            } else {
                let config_val = params.get("config").cloned().unwrap_or(serde_json::json!({}));
                serde_json::to_string(&config_val).unwrap_or_else(|_| "{}".to_string())
            };
            themes::save_theme_config(db, &theme_id, &json_str)?;
            cloud_sync::spawn_background_export(db.clone());
            Ok(serde_json::Value::Null)
        }
        "get_theme_css" => {
            let theme_id = get_str_param(&params, &["themeId", "theme_id"])
                .unwrap_or_else(|| "default".to_string());
            let css = themes::get_theme_css(&theme_id)?;
            Ok(serde_json::json!(css))
        }
        "open_themes_folder" => {
            open_in_explorer_headless(&themes::get_themes_dir().to_string_lossy())?;
            Ok(serde_json::Value::Null)
        }
        "import_theme_zip" => {
            let zip_path = get_str_param(&params, &["zipPath", "zip_path"])
                .ok_or_else(|| "Missing zipPath".to_string())?;
            let info = themes::import_theme_zip(db, &zip_path)?;
            cloud_sync::spawn_background_export(db.clone());
            Ok(serde_json::to_value(info).map_err(|e| e.to_string())?)
        }
        "delete_theme" => {
            let theme_id = get_str_param(&params, &["themeId", "theme_id"])
                .ok_or_else(|| "Missing themeId".to_string())?;
            themes::delete_theme(db, &theme_id)?;
            cloud_sync::spawn_background_export(db.clone());
            Ok(serde_json::Value::Null)
        }
        "get_installed_plugins" => {
            let p_list = plugins::list_plugins(db)?;
            Ok(serde_json::to_value(p_list).map_err(|e| e.to_string())?)
        }
        "toggle_plugin" => {
            let plugin_id = get_str_param(&params, &["pluginId", "plugin_id"])
                .ok_or_else(|| "Missing pluginId".to_string())?;
            let enabled = params.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true);
            plugins::toggle_plugin(db, &plugin_id, enabled)?;
            cloud_sync::spawn_background_export(db.clone());
            Ok(serde_json::Value::Null)
        }
        "get_plugin_config" => {
            let plugin_id = get_str_param(&params, &["pluginId", "plugin_id"])
                .ok_or_else(|| "Missing pluginId".to_string())?;
            let cfg = plugins::get_plugin_config(db, &plugin_id)?;
            Ok(serde_json::to_value(cfg).map_err(|e| e.to_string())?)
        }
        "save_plugin_config" => {
            let plugin_id = get_str_param(&params, &["pluginId", "plugin_id"])
                .ok_or_else(|| "Missing pluginId".to_string())?;
            let json_str = if let Some(s) = get_str_param(&params, &["configJson", "config_json"]) {
                s
            } else {
                let config_val = params.get("config").cloned().unwrap_or(serde_json::json!({}));
                serde_json::to_string(&config_val).unwrap_or_else(|_| "{}".to_string())
            };
            plugins::save_plugin_config(db, &plugin_id, &json_str)?;
            cloud_sync::spawn_background_export(db.clone());
            Ok(serde_json::Value::Null)
        }
        "open_plugins_folder" => {
            open_in_explorer_headless(&plugins::get_plugins_dir().to_string_lossy())?;
            Ok(serde_json::Value::Null)
        }
        "delete_plugin" => {
            let plugin_id = get_str_param(&params, &["pluginId", "plugin_id"])
                .ok_or_else(|| "Missing pluginId".to_string())?;
            plugins::delete_plugin(db, &plugin_id)?;
            cloud_sync::spawn_background_export(db.clone());
            Ok(serde_json::Value::Null)
        }
        "import_plugin_zip" => {
            let zip_path = get_str_param(&params, &["zipPath", "zip_path"])
                .ok_or_else(|| "Missing zipPath".to_string())?;
            let info = plugins::import_plugin_zip(db, &zip_path)?;
            cloud_sync::spawn_background_export(db.clone());
            Ok(serde_json::to_value(info).map_err(|e| e.to_string())?)
        }

        // --- 6. Cloud Sync & Backups ---
        "get_cloud_sync_status" => {
            let status = cloud_sync::get_cloud_sync_status(db)?;
            Ok(serde_json::to_value(status).map_err(|e| e.to_string())?)
        }
        "configure_cloud_sync" => {
            let enabled = params.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false);
            let folder_path = get_str_param(&params, &["folderPath", "folder_path"]);
            let sync_settings = params.get("syncSettings").or_else(|| params.get("sync_settings")).and_then(|v| v.as_bool()).unwrap_or(true);
            let sync_extensions = params.get("syncExtensions").or_else(|| params.get("sync_extensions")).and_then(|v| v.as_bool()).unwrap_or(true);
            let sync_keys = params.get("syncKeys").or_else(|| params.get("sync_keys")).and_then(|v| v.as_bool()).unwrap_or(true);

            if let Some(ref path) = folder_path {
                db.set_setting("cloud_sync_folder_path", path.trim())?;
            }
            db.set_setting("cloud_sync_enabled", if enabled { "1" } else { "0" })?;
            let now_utc = chrono::Utc::now().to_rfc3339();
            db.set_setting("cloud_sync_settings_enabled", if sync_settings { "1" } else { "0" })?;
            if sync_settings {
                let _ = db.set_setting("ui_updated_at", &now_utc);
            }
            db.set_setting("cloud_sync_extensions_enabled", if sync_extensions { "1" } else { "0" })?;
            if sync_extensions {
                let _ = db.set_setting("extensions_updated_at", &now_utc);
            }
            db.set_setting("cloud_sync_keys_enabled", if sync_keys { "1" } else { "0" })?;
            if sync_keys {
                let _ = db.set_setting("keys_updated_at", &now_utc);
            }

            let status = cloud_sync::get_cloud_sync_status(db)?;
            Ok(serde_json::to_value(status).map_err(|e| e.to_string())?)
        }
        "set_sync_device_name" => {
            let name = get_str_param(&params, &["name", "deviceName", "device_name"])
                .ok_or_else(|| "Missing device name".to_string())?;
            db.set_device_name(name.trim())?;
            cloud_sync::spawn_background_export(db.clone());
            Ok(serde_json::Value::Null)
        }
        "get_sync_peer_devices" => {
            let status = cloud_sync::get_cloud_sync_status(db)?;
            let peers = if let Some(ref folder) = status.folder_path {
                cloud_sync::get_peer_devices(db, &PathBuf::from(folder))?
            } else {
                Vec::new()
            };
            Ok(serde_json::to_value(peers).map_err(|e| e.to_string())?)
        }
        "trigger_cloud_sync" => {
            let status = cloud_sync::get_cloud_sync_status(db)?;
            if !status.enabled || !status.is_folder_valid {
                return Err("Cloud sync is not enabled or folder is invalid".to_string());
            }
            let folder = status.folder_path.ok_or_else(|| "No sync folder configured".to_string())?;
            let summary = cloud_sync::sync_cloud_directory(db, &PathBuf::from(folder))?;
            emitter.emit("cloud-sync-completed", &summary);
            emitter.emit("library-updated", &serde_json::json!({}));
            Ok(serde_json::to_value(summary).map_err(|e| e.to_string())?)
        }
        "create_database_backup" => {
            let note = get_str_param(&params, &["note"]);
            let info = db.create_backup(note, false)?;
            Ok(serde_json::to_value(info).map_err(|e| e.to_string())?)
        }
        "list_database_backups" => {
            let list = db.list_backups()?;
            Ok(serde_json::to_value(list).map_err(|e| e.to_string())?)
        }
        "restore_database_backup" => {
            let filename = get_str_param(&params, &["filename"])
                .ok_or_else(|| "Missing filename".to_string())?;
            db.restore_backup(&filename)?;
            emitter.emit("library-updated", &serde_json::json!({}));
            Ok(serde_json::Value::Null)
        }
        "delete_database_backup" => {
            let filename = get_str_param(&params, &["filename"])
                .ok_or_else(|| "Missing filename".to_string())?;
            db.delete_backup(&filename)?;
            Ok(serde_json::Value::Null)
        }
        "auto_detect_playnite_backups" => {
            let backups = crate::scanner::playnite::PlayniteScanner::auto_detect_backups();
            Ok(serde_json::to_value(backups).map_err(|e| e.to_string())?)
        }
        "get_playnite_backup_summary" => {
            let path = get_str_param(&params, &["path"])
                .ok_or_else(|| "Missing path".to_string())?;
            let summary = crate::scanner::playnite::PlayniteScanner::scan_playnite_backup_summary(&path)?;
            Ok(serde_json::to_value(summary).map_err(|e| e.to_string())?)
        }
        "import_playnite_backup" => {
            let options: crate::scanner::playnite::PlayniteImportOptions = serde_json::from_value(
                params.get("options").cloned().unwrap_or(params.clone())
            ).map_err(|e| format!("Invalid playnite options: {}", e))?;
            let em = emitter.clone();
            let summary = crate::import_playnite_backup_core(&options, db, None, move |g| {
                em.emit("game-updated", g);
            })?;
            emitter.emit("library-updated", &serde_json::json!({}));
            cloud_sync::spawn_background_export(db.clone());
            Ok(serde_json::to_value(summary).map_err(|e| e.to_string())?)
        }
        "export_portable_backup" => {
            let target_path = get_str_param(&params, &["targetPath", "target_path", "path"])
                .ok_or_else(|| "Missing target_path".to_string())?;
            let path = crate::export_portable_backup_core(db, &target_path).await?;
            Ok(serde_json::json!(path))
        }
        "import_portable_backup" => {
            let file_path = get_str_param(&params, &["filePath", "file_path", "path"])
                .ok_or_else(|| "Missing file_path".to_string())?;
            let em = emitter.clone();
            let summary = crate::import_portable_backup_core(db, &file_path, move |g| {
                em.emit("game-updated", g);
            }).await?;
            emitter.emit("library-updated", &serde_json::json!({}));
            cloud_sync::spawn_background_export(db.clone());
            Ok(serde_json::to_value(summary).map_err(|e| e.to_string())?)
        }

        // --- 7. Emulation ---
        "get_emulator_profiles" => {
            let profiles = db.get_emulator_profiles()?;
            Ok(serde_json::to_value(profiles).map_err(|e| e.to_string())?)
        }
        "save_emulator_profile" => {
            let profile: EmulatorProfile = serde_json::from_value(
                params.get("profile").cloned().unwrap_or(params.clone())
            ).map_err(|e| format!("Invalid profile: {}", e))?;
            db.save_emulator_profile(&profile)?;
            Ok(serde_json::Value::Null)
        }
        "delete_emulator_profile" => {
            let id = get_str_param(&params, &["id"])
                .ok_or_else(|| "Missing id".to_string())?;
            db.delete_emulator_profile(&id)?;
            Ok(serde_json::Value::Null)
        }
        "get_configured_consoles" => {
            let consoles = db.get_configured_consoles()?;
            Ok(serde_json::to_value(consoles).map_err(|e| e.to_string())?)
        }
        "save_configured_console" => {
            let console: ConfiguredConsole = serde_json::from_value(
                params.get("console").cloned().unwrap_or(params.clone())
            ).map_err(|e| format!("Invalid console payload: {}", e))?;
            db.save_configured_console(&console)?;
            Ok(serde_json::Value::Null)
        }
        "delete_configured_console" => {
            let id = get_str_param(&params, &["id"])
                .ok_or_else(|| "Missing id".to_string())?;
            db.delete_configured_console(&id)?;
            Ok(serde_json::Value::Null)
        }
        "open_systems_folder" => {
            let p = EmulatorService::get_community_systems_path();
            let target = p.parent().unwrap_or(&p);
            let _ = std::fs::create_dir_all(target);
            open_in_explorer_headless(&target.to_string_lossy())?;
            Ok(serde_json::Value::Null)
        }
        "get_community_systems" => {
            let content = EmulatorService::read_community_systems();
            Ok(serde_json::to_value(content).map_err(|e| e.to_string())?)
        }
        "scan_retroarch_cores" => {
            let retroarch_path = get_str_param(&params, &["retroarchPath", "retroarch_path"]).unwrap_or_default();
            let cores = EmulatorService::scan_retroarch_cores(&retroarch_path);
            Ok(serde_json::to_value(cores).map_err(|e| e.to_string())?)
        }
        "scan_and_import_console_roms" => {
            let console_id = get_str_param(&params, &["consoleId", "console_id"])
                .ok_or_else(|| "Missing consoleId".to_string())?;
            let em = emitter.clone();
            let count = crate::scan_and_import_console_roms_core(db, &console_id, move |g| {
                em.emit("game-updated", g);
            }).await?;
            emitter.emit("library-updated", &serde_json::json!({}));
            cloud_sync::spawn_background_export(db.clone());
            Ok(serde_json::json!(count))
        }

        // --- 8. App Configuration & System ---
        "get_app_config" => {
            let cfg = db.get_app_config()?;
            Ok(serde_json::to_value(cfg).map_err(|e| e.to_string())?)
        }
        "save_app_config" => {
            let cfg: AppConfig = serde_json::from_value(
                params.get("config").cloned().unwrap_or(params.clone())
            ).map_err(|e| format!("Invalid app config: {}", e))?;
            db.save_app_config(&cfg)?;
            cloud_sync::spawn_background_export(db.clone());
            Ok(serde_json::Value::Null)
        }
        "get_autostart_status" => {
            let enabled = AutostartManager::is_enabled();
            Ok(serde_json::json!(enabled))
        }
        "set_autostart" => {
            let enabled = params.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false);
            AutostartManager::set_enabled(enabled)?;
            Ok(serde_json::Value::Null)
        }
        "open_in_explorer" => {
            let path = get_str_param(&params, &["path"])
                .ok_or_else(|| "Missing path".to_string())?;
            open_in_explorer_headless(&path)?;
            Ok(serde_json::Value::Null)
        }
        "open_external_url" => {
            let url = get_str_param(&params, &["url"])
                .ok_or_else(|| "Missing url".to_string())?;
            open_uri(&url)?;
            Ok(serde_json::Value::Null)
        }
        "select_file" => {
            let filter = get_str_param(&params, &["filter"]);
            let mut dialog = rfd::AsyncFileDialog::new().set_title("Select File");
            if let Some(ref f) = filter {
                if f.contains(".exe") {
                    #[cfg(target_os = "windows")]
                    {
                        dialog = dialog.add_filter("Executable (*.exe)", &["exe"]);
                    }
                    #[cfg(target_os = "linux")]
                    {
                        dialog = dialog
                            .add_filter("Linux Executables & Scripts (*, *.AppImage, *.sh, *.desktop, *.bin)", &["AppImage", "sh", "desktop", "bin", "run", "exe"])
                            .add_filter("All Files (*)", &["*"]);
                    }
                    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
                    {
                        dialog = dialog.add_filter("All Files (*)", &["*"]);
                    }
                } else if f.contains(".zip") {
                    dialog = dialog.add_filter("ZIP Archive (*.zip)", &["zip"]);
                }
            }
            let handle = dialog.pick_file().await;
            let path_opt = handle.map(|h| h.path().to_string_lossy().to_string());
            Ok(serde_json::to_value(path_opt).map_err(|e| e.to_string())?)
        }
        "select_directory" => {
            let handle = rfd::AsyncFileDialog::new()
                .set_title("Select Folder")
                .pick_folder()
                .await;
            let path_opt = handle.map(|h| h.path().to_string_lossy().to_string());
            Ok(serde_json::to_value(path_opt).map_err(|e| e.to_string())?)
        }
        "select_multiple_files" => {
            let filter = get_str_param(&params, &["filter"]);
            let mut dialog = rfd::AsyncFileDialog::new().set_title("Select Files");
            if let Some(ref f) = filter {
                if f.contains(".exe") {
                    #[cfg(target_os = "windows")]
                    {
                        dialog = dialog.add_filter("Executable (*.exe)", &["exe"]);
                    }
                    #[cfg(target_os = "linux")]
                    {
                        dialog = dialog
                            .add_filter("Linux Executables & Scripts (*, *.AppImage, *.sh, *.desktop, *.bin)", &["AppImage", "sh", "desktop", "bin", "run", "exe"])
                            .add_filter("All Files (*)", &["*"]);
                    }
                    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
                    {
                        dialog = dialog.add_filter("All Files (*)", &["*"]);
                    }
                } else if f.contains(".zip") {
                    dialog = dialog.add_filter("ZIP Archive (*.zip)", &["zip"]);
                }
            }
            let handles = dialog.pick_files().await;
            let paths: Vec<String> = handles
                .unwrap_or_default()
                .into_iter()
                .map(|h| h.path().to_string_lossy().to_string())
                .collect();
            Ok(serde_json::to_value(paths).map_err(|e| e.to_string())?)
        }
        "get_filesystem_roots" => {
            let roots = crate::gamepad::get_filesystem_roots_core()?;
            Ok(serde_json::to_value(roots).map_err(|e| e.to_string())?)
        }
        "list_directory_entries" => {
            let path = get_str_param(&params, &["path"]);
            let include_files = get_bool_param(&params, &["includeFiles", "include_files"]).unwrap_or(true);
            let filter = get_str_param(&params, &["filter"]);
            let show_hidden = get_bool_param(&params, &["showHidden", "show_hidden"]).unwrap_or(false);
            let listing = crate::gamepad::list_directory_entries_core(path, include_files, filter, show_hidden)?;
            Ok(serde_json::to_value(listing).map_err(|e| e.to_string())?)
        }
        "get_native_gamepad_state" => {
            let snap = native_gamepad
                .lock()
                .map(|g| g.clone())
                .unwrap_or_default();
            Ok(serde_json::to_value(snap).map_err(|e| e.to_string())?)
        }
        "optimize_animated_artwork" => {
            let em = emitter.clone();
            let count = crate::optimize_animated_artwork_core(db, move |g| {
                em.emit("game-updated", g);
            })?;
            Ok(serde_json::json!(count))
        }
        "check_for_app_updates" => {
            let res = crate::check_for_app_updates_core().await?;
            Ok(serde_json::to_value(res).map_err(|e| e.to_string())?)
        }
        "download_app_update" => {
            let download_url = get_str_param(&params, &["downloadUrl", "download_url"])
                .ok_or_else(|| "Missing downloadUrl".to_string())?;
            let target_version = get_str_param(&params, &["targetVersion", "target_version"])
                .unwrap_or_else(|| "latest".to_string());
            let em = emitter.clone();
            let path = crate::download_app_update_core(&download_url, &target_version, move |p| {
                em.emit("app-update-progress", &p);
            }).await?;
            Ok(serde_json::json!(path))
        }
        "apply_update_and_restart" => {
            let installer_path = get_str_param(&params, &["installerPath", "installer_path"])
                .ok_or_else(|| "Missing installerPath".to_string())?;
            crate::apply_update_and_restart_core(&installer_path)?;
            Ok(serde_json::Value::Null)
        }

        // --- 9. Save Location Discovery & Cloud Save Versioning ---
        "get_game_save_state" => {
            let game_id = get_str_param(&params, &["gameId", "game_id"])
                .ok_or_else(|| "Missing gameId".to_string())?;
            let force = params
                .get("forceRefreshDetection")
                .or_else(|| params.get("force_refresh_detection"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let res = crate::saves::get_game_save_state(db, &game_id, force).await?;
            Ok(serde_json::to_value(res).map_err(|e| e.to_string())?)
        }
        "save_custom_save_paths" => {
            let game_id = get_str_param(&params, &["gameId", "game_id"])
                .ok_or_else(|| "Missing gameId".to_string())?;
            let save_paths: Vec<String> = params
                .get("savePaths")
                .or_else(|| params.get("save_paths"))
                .cloned()
                .and_then(|v| serde_json::from_value(v).ok())
                .unwrap_or_default();
            let config_paths: Vec<String> = params
                .get("configPaths")
                .or_else(|| params.get("config_paths"))
                .cloned()
                .and_then(|v| serde_json::from_value(v).ok())
                .unwrap_or_default();
            let res = crate::saves::save_custom_save_paths(db, &game_id, save_paths, config_paths).await?;
            Ok(serde_json::to_value(res).map_err(|e| e.to_string())?)
        }
        "set_game_cloud_save_settings" => {
            let game_id = get_str_param(&params, &["gameId", "game_id"])
                .ok_or_else(|| "Missing gameId".to_string())?;
            let enabled = params.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false);
            let retention_override: Option<u32> = params
                .get("retentionOverride")
                .or_else(|| params.get("retention_override"))
                .and_then(|v| v.as_u64())
                .map(|v| v as u32);
            let res = crate::saves::set_game_cloud_save_settings(db, &game_id, enabled, retention_override).await?;
            if let Ok(Some(updated_game)) = db.get_game_by_id(&game_id) {
                emitter.emit("game-updated", &updated_game);
            }
            Ok(serde_json::to_value(res).map_err(|e| e.to_string())?)
        }
        "force_push_cloud_save" => {
            let game_id = get_str_param(&params, &["gameId", "game_id"])
                .ok_or_else(|| "Missing gameId".to_string())?;
            let note = get_str_param(&params, &["note"]);
            let allow_oversized = params
                .get("allowOversized")
                .or_else(|| params.get("allow_oversized"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let res = crate::saves::force_push_cloud_save(db, &game_id, note, allow_oversized).await?;
            if !res.skipped {
                emitter.emit("save-backup-completed", &serde_json::json!({ "game_id": game_id }));
            }
            Ok(serde_json::to_value(res).map_err(|e| e.to_string())?)
        }
        "restore_cloud_save_snapshot" => {
            let game_id = get_str_param(&params, &["gameId", "game_id"])
                .ok_or_else(|| "Missing gameId".to_string())?;
            let snapshot_id = get_str_param(&params, &["snapshotId", "snapshot_id"])
                .ok_or_else(|| "Missing snapshotId".to_string())?;
            let res = crate::saves::restore_cloud_save_snapshot(db, &game_id, &snapshot_id).await?;
            emitter.emit("save-backup-completed", &serde_json::json!({ "game_id": game_id }));
            Ok(serde_json::to_value(res).map_err(|e| e.to_string())?)
        }
        "delete_cloud_save_snapshot" => {
            let game_id = get_str_param(&params, &["gameId", "game_id"])
                .ok_or_else(|| "Missing gameId".to_string())?;
            let snapshot_id = get_str_param(&params, &["snapshotId", "snapshot_id"])
                .ok_or_else(|| "Missing snapshotId".to_string())?;
            let res = crate::saves::delete_cloud_save_snapshot(db, &game_id, &snapshot_id).await?;
            Ok(serde_json::to_value(res).map_err(|e| e.to_string())?)
        }
        "restore_local_safety_backup" => {
            let game_id = get_str_param(&params, &["gameId", "game_id"])
                .ok_or_else(|| "Missing gameId".to_string())?;
            let backup_id = get_str_param(&params, &["backupId", "backup_id"])
                .ok_or_else(|| "Missing backupId".to_string())?;
            let res = crate::saves::restore_local_safety_backup(db, &game_id, &backup_id).await?;
            emitter.emit("save-backup-completed", &serde_json::json!({ "game_id": game_id }));
            Ok(serde_json::to_value(res).map_err(|e| e.to_string())?)
        }
        "check_pre_launch_cloud_save" => {
            let game_id = get_str_param(&params, &["gameId", "game_id"])
                .ok_or_else(|| "Missing gameId".to_string())?;
            let res = crate::saves::check_pre_launch_cloud_save(db, &game_id).await?;
            Ok(serde_json::to_value(res).map_err(|e| e.to_string())?)
        }
        "get_cloud_saves_overview" => {
            let res = crate::saves::get_cloud_saves_overview(db)?;
            Ok(serde_json::to_value(res).map_err(|e| e.to_string())?)
        }

        unknown => {
            eprintln!("[openplay-core] Unknown method invoked: {}", unknown);
            Err(format!("Method '{}' is not recognized by openplay-core", unknown))
        }
    }
}

fn get_str_param(params: &serde_json::Value, keys: &[&str]) -> Option<String> {
    for k in keys {
        if let Some(val) = params.get(*k) {
            if let Some(s) = val.as_str() {
                return Some(s.to_string());
            }
        }
    }
    None
}

fn get_bool_param(params: &serde_json::Value, keys: &[&str]) -> Option<bool> {
    for k in keys {
        if let Some(val) = params.get(*k) {
            if let Some(b) = val.as_bool() {
                return Some(b);
            }
        }
    }
    None
}

fn open_in_explorer_headless(path: &str) -> Result<(), String> {
    let p = Path::new(path);
    let target = if p.is_file() {
        p.parent().unwrap_or(p)
    } else {
        p
    };

    if !target.exists() {
        return Err(format!("Path does not exist: {}", target.display()));
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(target)
            .spawn()
            .map_err(|e| format!("Failed to open Windows Explorer: {}", e))?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new("xdg-open")
            .arg(target)
            .spawn()
            .map_err(|e| format!("Failed to open file manager: {}", e))?;
    }
    Ok(())
}

#[allow(dead_code)]
fn open_uri(uri: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", uri])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new("xdg-open")
            .arg(uri)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
