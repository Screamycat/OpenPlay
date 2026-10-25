use crate::db::Database;
use std::collections::HashMap;
use std::path::Path;
use std::process::Command;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Instant;
use tauri::{AppHandle, Emitter};

pub struct RunningGameInfo {
    pub game_id: String,
    pub pids: Vec<u32>,
    pub candidate_exes: Vec<String>,
    pub install_directory: Option<String>,
    pub start_time: Instant,
}

static RUNNING_GAMES: OnceLock<Mutex<HashMap<String, RunningGameInfo>>> = OnceLock::new();

fn running_games_map() -> &'static Mutex<HashMap<String, RunningGameInfo>> {
    RUNNING_GAMES.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Recursively scans an installation folder (up to depth 2) to collect legitimate game executable filenames
fn get_candidate_executables(install_dir: &str) -> Vec<String> {
    let mut exes = Vec::new();
    let root = Path::new(install_dir);
    if !root.exists() {
        return exes;
    }

    fn scan_dir(dir: &Path, depth: usize, max_depth: usize, exes: &mut Vec<String>) {
        if depth > max_depth {
            return;
        }
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Some(ext) = path.extension() {
                        if ext.to_string_lossy().eq_ignore_ascii_case("exe") {
                            if let Some(name) = path.file_name() {
                                let name_str = name.to_string_lossy().to_lowercase();
                                let is_ignored = name_str.contains("unins")
                                    || name_str.contains("installer")
                                    || name_str.contains("setup")
                                    || name_str.contains("crashreport")
                                    || name_str.contains("crashhandler")
                                    || name_str.contains("unitycrashhandler")
                                    || name_str.contains("steamerrorreporter")
                                    || name_str.contains("vcredist")
                                    || name_str.contains("dxsetup")
                                    || name_str.contains("touchup")
                                    || name_str.contains("createdump")
                                    || name_str.starts_with("dotnetfx")
                                    || name_str.ends_with("tool.exe");
                                if !is_ignored && !exes.contains(&name_str) {
                                    exes.push(name_str);
                                }
                            }
                        }
                    }
                } else if path.is_dir() && depth < max_depth {
                    scan_dir(&path, depth + 1, max_depth, exes);
                }
            }
        }
    }

    scan_dir(root, 0, 2, &mut exes);
    exes
}

/// Finds all running process PIDs matching candidate executables or install directory
fn find_active_pids_for_game(
    sys: &sysinfo::System,
    candidate_exes: &[String],
    install_dir: Option<&str>,
) -> Vec<u32> {
    let mut pids = Vec::new();
    let dir_clean = install_dir.map(|d| {
        let mut s = d.to_lowercase().replace('/', "\\");
        if s.starts_with(r"\\?\") {
            s = s[4..].to_string();
        }
        s.trim_end_matches('\\').to_string()
    });

    for (pid, proc) in sys.processes() {
        let name_str = proc.name().to_string_lossy().to_lowercase();

        // Check 1: Match by candidate executable name (always reliable on Windows)
        if !candidate_exes.is_empty()
            && candidate_exes.iter().any(|c| c.eq_ignore_ascii_case(&name_str))
        {
            pids.push(pid.as_u32());
            continue;
        }

        // Check 2: Match by install directory path prefix if exe path is available
        if let Some(ref dir_clean_str) = dir_clean {
            if let Some(exe_path) = proc.exe() {
                let mut exe_str = exe_path.to_string_lossy().to_lowercase().replace('/', "\\");
                if exe_str.starts_with(r"\\?\") {
                    exe_str = exe_str[4..].to_string();
                }
                if exe_str.starts_with(dir_clean_str) {
                    let is_ignored = name_str.contains("unins")
                        || name_str.contains("installer")
                        || name_str.contains("setup")
                        || name_str.contains("crashreport")
                        || name_str.contains("crashhandler")
                        || name_str.contains("steamerrorreporter")
                        || name_str.contains("vcredist")
                        || name_str.contains("dxsetup")
                        || name_str.contains("createdump");
                    if !is_ignored {
                        pids.push(pid.as_u32());
                    }
                }
            }
        }
    }
    pids
}

pub struct GameLauncher;

impl GameLauncher {
    pub fn launch_game(
        app_handle: AppHandle,
        db: Arc<Database>,
        game_id: String,
        source: String,
        source_id: Option<String>,
        executable_path: Option<String>,
        install_directory: Option<String>,
        launch_arguments: Option<String>,
    ) -> Result<String, String> {
        let now_str = chrono::Local::now().format("%Y-%m-%d %H:%M").to_string();

        if source.to_lowercase() == "steam" {
            if let Some(appid) = source_id {
                let steam_url = format!("steam://run/{}", appid);

                #[cfg(target_os = "windows")]
                {
                    Command::new("cmd")
                        .args(["/C", "start", "", &steam_url])
                        .spawn()
                        .map_err(|e| format!("Failed to launch Steam game: {}", e))?;
                }

                #[cfg(target_os = "linux")]
                {
                    Command::new("xdg-open")
                        .arg(&steam_url)
                        .spawn()
                        .map_err(|e| format!("Failed to launch Steam game: {}", e))?;
                }

                // Update last played timestamp in database
                let _ = db.update_playtime(&game_id, 0, &now_str);
                let _ = app_handle.emit(
                    "game-launched",
                    serde_json::json!({
                        "id": &game_id,
                        "last_played": &now_str,
                    }),
                );

                // Collect candidate executables from install_directory
                let mut candidate_exes = Vec::new();
                if let Some(ref dir) = install_directory {
                    candidate_exes = get_candidate_executables(dir);
                }
                if let Some(ref exe) = executable_path {
                    if let Some(name) = Path::new(exe).file_name() {
                        let name_str = name.to_string_lossy().to_lowercase();
                        if !candidate_exes.contains(&name_str) {
                            candidate_exes.push(name_str);
                        }
                    }
                }

                let start_time = Instant::now();

                // Register as running
                {
                    let mut map = running_games_map().lock().unwrap();
                    map.insert(
                        game_id.clone(),
                        RunningGameInfo {
                            game_id: game_id.clone(),
                            pids: Vec::new(),
                            candidate_exes: candidate_exes.clone(),
                            install_directory: install_directory.clone(),
                            start_time,
                        },
                    );
                }
                let _ = app_handle.emit("game-running", serde_json::json!({ "id": &game_id }));

                // Monitor Steam process lifetime in background
                let app_handle_clone = app_handle.clone();
                let db_clone = db.clone();
                let gid = game_id.clone();
                let inst_dir = install_directory.clone();
                let candidate_exes_clone = candidate_exes.clone();

                std::thread::spawn(move || {
                    let mut sys = sysinfo::System::new();
                    let mut has_started = false;
                    let mut consecutive_missing = 0;

                    // Monitor loop: poll every 1.5 seconds
                    for tick in 0..1000000 {
                        std::thread::sleep(std::time::Duration::from_millis(1500));

                        // If user closed/stopped game via OpenPlay UI, exit thread
                        {
                            let map = running_games_map().lock().unwrap();
                            if !map.contains_key(&gid) {
                                return;
                            }
                        }

                        sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
                        let active_pids = find_active_pids_for_game(
                            &sys,
                            &candidate_exes_clone,
                            inst_dir.as_deref(),
                        );

                        if !active_pids.is_empty() {
                            has_started = true;
                            consecutive_missing = 0;
                            let mut map = running_games_map().lock().unwrap();
                            if let Some(info) = map.get_mut(&gid) {
                                info.pids = active_pids;
                            }
                        } else if has_started {
                            consecutive_missing += 1;
                            // If process not found for 2 consecutive polls (~3s), game has terminated
                            if consecutive_missing >= 2 {
                                break;
                            }
                        } else if tick >= 30 {
                            // If game never started after 45s, timeout
                            break;
                        }
                    }

                    // Unregister running state
                    {
                        let mut map = running_games_map().lock().unwrap();
                        map.remove(&gid);
                    }
                    let elapsed = start_time.elapsed().as_secs();
                    let end_str = chrono::Local::now().format("%Y-%m-%d %H:%M").to_string();
                    let _ = db_clone.update_playtime(&gid, elapsed, &end_str);
                    let _ = app_handle_clone.emit(
                        "game-stopped",
                        serde_json::json!({
                            "id": gid,
                            "elapsed_seconds": elapsed,
                            "last_played": end_str
                        }),
                    );
                });

                return Ok(now_str);
            } else {
                return Err("Missing Steam App ID".to_string());
            }
        }

        if source.to_lowercase() == "epic" {
            if let Some(app_name) = source_id {
                let epic_url = format!("com.epicgames.launcher://apps/{}?action=launch&silent=true", app_name);

                #[cfg(target_os = "windows")]
                {
                    Command::new("cmd")
                        .args(["/C", "start", "", &epic_url])
                        .spawn()
                        .map_err(|e| format!("Failed to launch Epic game: {}", e))?;
                }

                #[cfg(not(target_os = "windows"))]
                {
                    if let Some(ref exe) = executable_path {
                        Command::new(exe).spawn().map_err(|e| e.to_string())?;
                    }
                }

                let _ = db.update_playtime(&game_id, 0, &now_str);
                let _ = app_handle.emit(
                    "game-launched",
                    serde_json::json!({
                        "id": &game_id,
                        "last_played": &now_str,
                    }),
                );

                let mut candidate_exes = Vec::new();
                if let Some(ref dir) = install_directory {
                    candidate_exes = get_candidate_executables(dir);
                }
                if let Some(ref exe) = executable_path {
                    if let Some(name) = Path::new(exe).file_name() {
                        let name_str = name.to_string_lossy().to_lowercase();
                        if !candidate_exes.contains(&name_str) {
                            candidate_exes.push(name_str);
                        }
                    }
                }

                let start_time = Instant::now();

                {
                    let mut map = running_games_map().lock().unwrap();
                    map.insert(
                        game_id.clone(),
                        RunningGameInfo {
                            game_id: game_id.clone(),
                            pids: Vec::new(),
                            candidate_exes: candidate_exes.clone(),
                            install_directory: install_directory.clone(),
                            start_time,
                        },
                    );
                }
                let _ = app_handle.emit("game-running", serde_json::json!({ "id": &game_id }));

                let app_handle_clone = app_handle.clone();
                let db_clone = db.clone();
                let gid = game_id.clone();
                let inst_dir = install_directory.clone();
                let candidate_exes_clone = candidate_exes.clone();

                std::thread::spawn(move || {
                    let mut sys = sysinfo::System::new();
                    let mut has_started = false;
                    let mut consecutive_missing = 0;

                    for tick in 0..1000000 {
                        std::thread::sleep(std::time::Duration::from_millis(1500));

                        {
                            let map = running_games_map().lock().unwrap();
                            if !map.contains_key(&gid) {
                                return;
                            }
                        }

                        sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
                        let active_pids = find_active_pids_for_game(
                            &sys,
                            &candidate_exes_clone,
                            inst_dir.as_deref(),
                        );

                        if !active_pids.is_empty() {
                            has_started = true;
                            consecutive_missing = 0;
                            let mut map = running_games_map().lock().unwrap();
                            if let Some(info) = map.get_mut(&gid) {
                                info.pids = active_pids;
                            }
                        } else if has_started {
                            consecutive_missing += 1;
                            if consecutive_missing >= 2 {
                                break;
                            }
                        } else if tick >= 30 {
                            break;
                        }
                    }

                    {
                        let mut map = running_games_map().lock().unwrap();
                        map.remove(&gid);
                    }
                    let elapsed = start_time.elapsed().as_secs();
                    let end_str = chrono::Local::now().format("%Y-%m-%d %H:%M").to_string();
                    let _ = db_clone.update_playtime(&gid, elapsed, &end_str);
                    let _ = app_handle_clone.emit(
                        "game-stopped",
                        serde_json::json!({
                            "id": gid,
                            "elapsed_seconds": elapsed,
                            "last_played": end_str
                        }),
                    );
                });

                return Ok(now_str);
            } else {
                return Err("Missing Epic App Name".to_string());
            }
        }

        // Custom / Manual game
        if let Some(exe_path) = executable_path {
            let mut cmd = Command::new(&exe_path);
            let exe_path_buf = std::path::PathBuf::from(&exe_path);
            let parent_dir = exe_path_buf.parent().map(|p| p.to_string_lossy().to_string());
            let exe_filename = exe_path_buf
                .file_name()
                .map(|f| f.to_string_lossy().to_lowercase())
                .unwrap_or_default();

            if let Some(parent) = exe_path_buf.parent() {
                cmd.current_dir(parent);
            }

            if let Some(args_str) = launch_arguments {
                let parts: Vec<&str> = args_str.split_whitespace().collect();
                cmd.args(parts);
            }

            let start_time = Instant::now();
            let mut child = cmd
                .spawn()
                .map_err(|e| format!("Failed to execute '{}': {}", exe_path, e))?;

            let child_pid = child.id();
            let candidate_exes = if !exe_filename.is_empty() {
                vec![exe_filename]
            } else {
                Vec::new()
            };

            let _ = db.update_playtime(&game_id, 0, &now_str);
            let _ = app_handle.emit(
                "game-launched",
                serde_json::json!({
                    "id": &game_id,
                    "last_played": &now_str,
                }),
            );

            {
                let mut map = running_games_map().lock().unwrap();
                map.insert(
                    game_id.clone(),
                    RunningGameInfo {
                        game_id: game_id.clone(),
                        pids: vec![child_pid],
                        candidate_exes: candidate_exes.clone(),
                        install_directory: parent_dir.clone(),
                        start_time,
                    },
                );
            }
            let _ = app_handle.emit("game-running", serde_json::json!({ "id": &game_id }));

            // Spawn background thread to monitor process lifetime
            let app_handle_clone = app_handle.clone();
            let db_clone = db.clone();
            let gid = game_id.clone();
            let candidate_exes_clone = candidate_exes.clone();

            std::thread::spawn(move || {
                let mut sys = sysinfo::System::new();
                let mut consecutive_missing = 0;

                loop {
                    std::thread::sleep(std::time::Duration::from_millis(1500));

                    {
                        let map = running_games_map().lock().unwrap();
                        if !map.contains_key(&gid) {
                            return;
                        }
                    }

                    let child_exited = match child.try_wait() {
                        Ok(Some(_)) => true,
                        Ok(None) => false,
                        Err(_) => true,
                    };

                    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
                    let active_pids = find_active_pids_for_game(
                        &sys,
                        &candidate_exes_clone,
                        parent_dir.as_deref(),
                    );

                    if child_exited && active_pids.is_empty() {
                        consecutive_missing += 1;
                        if consecutive_missing >= 2 {
                            break;
                        }
                    } else if !active_pids.is_empty() {
                        consecutive_missing = 0;
                        let mut map = running_games_map().lock().unwrap();
                        if let Some(info) = map.get_mut(&gid) {
                            info.pids = active_pids;
                        }
                    }
                }

                {
                    let mut map = running_games_map().lock().unwrap();
                    map.remove(&gid);
                }
                let elapsed = start_time.elapsed().as_secs();
                let end_str = chrono::Local::now().format("%Y-%m-%d %H:%M").to_string();
                let _ = db_clone.update_playtime(&gid, elapsed, &end_str);
                let _ = app_handle_clone.emit(
                    "game-stopped",
                    serde_json::json!({
                        "id": gid,
                        "elapsed_seconds": elapsed,
                        "last_played": end_str
                    }),
                );
            });

            return Ok(now_str);
        }

        Err("No executable or launch method found for this game".to_string())
    }

    pub fn stop_game(app_handle: AppHandle, game_id: &str) -> Result<(), String> {
        let mut pids_to_kill = Vec::new();
        let mut candidate_exes = Vec::new();

        {
            let mut map = running_games_map().lock().unwrap();
            if let Some(info) = map.remove(game_id) {
                pids_to_kill = info.pids;
                candidate_exes = info.candidate_exes;
            }
        }

        #[cfg(target_os = "windows")]
        {
            for pid in &pids_to_kill {
                let _ = Command::new("taskkill")
                    .args(["/PID", &pid.to_string(), "/T", "/F"])
                    .spawn();
            }
        }

        let mut sys = sysinfo::System::new();
        sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

        for (pid, proc) in sys.processes() {
            let name_str = proc.name().to_string_lossy().to_lowercase();
            let matches_candidate = candidate_exes.iter().any(|c| c.eq_ignore_ascii_case(&name_str));
            let is_in_pids = pids_to_kill.contains(&pid.as_u32());

            if is_in_pids || matches_candidate {
                let _ = proc.kill();
                #[cfg(target_os = "windows")]
                let _ = Command::new("taskkill")
                    .args(["/PID", &pid.as_u32().to_string(), "/T", "/F"])
                    .spawn();
            }
        }

        let end_str = chrono::Local::now().format("%Y-%m-%d %H:%M").to_string();
        let _ = app_handle.emit(
            "game-stopped",
            serde_json::json!({
                "id": game_id,
                "elapsed_seconds": 0,
                "last_played": end_str
            }),
        );

        Ok(())
    }

    pub fn get_running_games(
        app_handle: Option<&AppHandle>,
        db: Option<&Arc<Database>>,
    ) -> Vec<String> {
        let mut dead_games = Vec::new();
        let mut alive_games = Vec::new();

        {
            let map = running_games_map().lock().unwrap();
            if map.is_empty() {
                return Vec::new();
            }

            let mut sys = sysinfo::System::new();
            sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

            for (gid, info) in map.iter() {
                // If game was launched less than 5 seconds ago, allow launch window
                if info.start_time.elapsed().as_secs() < 5 {
                    alive_games.push(gid.clone());
                    continue;
                }

                let active_pids = find_active_pids_for_game(
                    &sys,
                    &info.candidate_exes,
                    info.install_directory.as_deref(),
                );

                if !active_pids.is_empty() {
                    alive_games.push(gid.clone());
                } else {
                    dead_games.push((gid.clone(), info.start_time));
                }
            }
        }

        if !dead_games.is_empty() {
            let mut map = running_games_map().lock().unwrap();
            for (gid, start_time) in dead_games {
                map.remove(&gid);
                let elapsed = start_time.elapsed().as_secs();
                let end_str = chrono::Local::now().format("%Y-%m-%d %H:%M").to_string();
                if let Some(database) = db {
                    let _ = database.update_playtime(&gid, elapsed, &end_str);
                }
                if let Some(handle) = app_handle {
                    let _ = handle.emit(
                        "game-stopped",
                        serde_json::json!({
                            "id": gid,
                            "elapsed_seconds": elapsed,
                            "last_played": end_str
                        }),
                    );
                }
            }
        }

        alive_games
    }
}
