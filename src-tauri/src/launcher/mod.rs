use crate::db::Database;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::process::Command;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Instant;
use tauri::{AppHandle, Emitter};

pub mod runners;
pub mod wine;

pub use runners::{RunnerInfo, RunnerManager};
pub use wine::LinuxWineEngine;

#[derive(Clone)]
pub enum LauncherEventSink {
    Tauri(AppHandle),
    Daemon(crate::daemon::DaemonEmitter),
    None,
}

impl LauncherEventSink {
    pub fn emit<T: serde::Serialize>(&self, event: &str, payload: &T) {
        match self {
            LauncherEventSink::Tauri(handle) => {
                let _ = handle.emit(event, payload);
            }
            LauncherEventSink::Daemon(emitter) => {
                emitter.emit(event, payload);
            }
            LauncherEventSink::None => {}
        }
    }
}

pub struct RunningGameInfo {
    pub game_id: String,
    pub pids: Vec<u32>,
    pub candidate_exes: Vec<String>,
    pub install_directory: Option<String>,
    pub prefix_path: Option<String>,
    pub runner_path: Option<String>,
    pub flatpak_app_id: Option<String>,
    pub start_time: Instant,
}

static RUNNING_GAMES: OnceLock<Mutex<HashMap<String, RunningGameInfo>>> = OnceLock::new();

fn running_games_map() -> &'static Mutex<HashMap<String, RunningGameInfo>> {
    RUNNING_GAMES.get_or_init(|| Mutex::new(HashMap::new()))
}

fn unregister_running_game(gid: &str) -> Option<RunningGameInfo> {
    let mut map = running_games_map().lock().unwrap();
    map.remove(gid)
}

fn finalize_game_session(
    sink: Option<&LauncherEventSink>,
    db: Option<&Arc<Database>>,
    gid: &str,
    elapsed: u64,
    end_str: &str,
) {
    if let Some(database) = db {
        let _ = database.update_playtime(gid, elapsed, end_str);
    }
    if let Some(s) = sink {
        s.emit(
            "game-stopped",
            &serde_json::json!({
                "id": gid,
                "elapsed_seconds": elapsed,
                "last_played": end_str
            }),
        );
    }
    if let Some(database) = db {
        let db_bg = database.clone();
        let sink_bg = sink.cloned();
        let gid_owned = gid.to_string();
        std::thread::spawn(move || {
            crate::saves::cloud::push_cloud_save_on_exit(&db_bg, &gid_owned, sink_bg.as_ref());

            let sync_on_exit = db_bg
                .get_app_config()
                .ok()
                .and_then(|c| c.cloud_sync_on_game_exit)
                .unwrap_or(true);
            if sync_on_exit {
                if let Ok(status) = crate::cloud_sync::get_cloud_sync_status(&db_bg) {
                    if status.enabled && status.is_folder_valid {
                        if let Some(folder) = status.folder_path {
                            let p = std::path::PathBuf::from(folder);
                            if let Ok(summary) = crate::cloud_sync::sync_cloud_directory(&db_bg, &p) {
                                if let Some(s) = sink_bg {
                                    s.emit("cloud-sync-completed", &summary);
                                    s.emit("library-updated", &serde_json::json!({}));
                                }
                            }
                            return;
                        }
                    }
                }
            }
            crate::cloud_sync::spawn_background_export(db_bg);
        });
    }
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

/// Returns true if a normalized path (`\`-separated, lowercase) is a shared system/user directory
/// rather than an isolated game installation folder. Never match or kill processes by directory prefix
/// if the directory is a shared system path!
fn is_unsafe_shared_directory(dir_clean: &str) -> bool {
    let trimmed = dir_clean.trim_matches('\\');
    if trimmed.is_empty() {
        return true;
    }

    // Reject root or top-level system directories on Linux (/usr, /usr/bin, /bin, /lib, /etc, /opt, /var, /tmp, /run, /proc, /sys, /dev)
    let linux_unsafe = [
        "usr",
        "usr\\bin",
        "usr\\local",
        "usr\\local\\bin",
        "usr\\lib",
        "usr\\lib64",
        "usr\\libexec",
        "usr\\share",
        "bin",
        "sbin",
        "lib",
        "lib64",
        "etc",
        "var",
        "tmp",
        "opt",
        "run",
        "proc",
        "sys",
        "dev",
        "home",
        "root",
        "app",
        "app\\bin",
        "snap",
        " snap\\bin",
    ];
    if linux_unsafe.contains(&trimmed) {
        return true;
    }

    // Reject if it's directly `/home/<user>` or `/home/<user>/.local/bin` or `/run/user/...`
    let parts: Vec<&str> = trimmed.split('\\').filter(|s| !s.is_empty()).collect();
    if parts.len() <= 2 && (parts.first() == Some(&"home") || parts.first() == Some(&"users") || parts.first() == Some(&"run")) {
        return true;
    }
    if parts.first() == Some(&"run") && parts.get(1) == Some(&"user") {
        return true;
    }
    if trimmed.ends_with("\\.local\\bin") || trimmed.ends_with("\\.cargo\\bin") {
        return true;
    }

    // Reject Windows system directories (C:, C:\Windows, C:\Windows\System32, C:\Program Files, C:\Users\<user>)
    if parts.len() == 1 && parts[0].ends_with(':') {
        return true;
    }
    if parts.len() >= 2 && parts[0].ends_with(':') {
        let second = parts[1];
        if second == "windows" || second == "program files" || second == "program files (x86)" || second == "programdata" {
            if parts.len() <= 3 {
                return true;
            }
        }
        if second == "users" && parts.len() <= 3 {
            return true;
        }
    }

    false
}

/// Returns true if a process name belongs to a critical desktop, display server, audio, session,
/// or system service that must NEVER be considered a game process or terminated.
fn is_protected_system_process(name_lower: &str) -> bool {
    let exact_protected = [
        "systemd",
        "init",
        "kwin_wayland",
        "kwin_x11",
        "mutter",
        "gnome-shell",
        "plasmashell",
        " Hyprland",
        "hyprland",
        "sway",
        "weston",
        "wlroots",
        "wayfire",
        "labwc",
        "niri",
        "cosmic-comp",
        "xorg",
        "xwayland",
        "sddm",
        "gdm",
        "lightdm",
        "greetd",
        "dbus-daemon",
        "dbus-broker",
        "pipewire",
        "pipewire-pulse",
        "wireplumber",
        "pulseaudio",
        "xdg-desktop-portal",
        "xdg-open",
        "bash",
        "sh",
        "zsh",
        "fish",
        "sudo",
        "pkexec",
        "polkitd",
        "networkmanager",
        "wpa_supplicant",
        "bluetoothd",
        "upowerd",
        "udisksd",
        " flatpak",
        "bwrap",
        "steam",
        "steamwebhelper",
        "openplay",
        "openplay-core",
        "electron",
        "explorer.exe",
        "dwm.exe",
        "csrss.exe",
        "wininit.exe",
        "winlogon.exe",
        "services.exe",
        "lsass.exe",
        "svchost.exe",
    ];
    if exact_protected.iter().any(|p| p.trim() == name_lower) {
        return true;
    }
    if name_lower.starts_with("systemd-")
        || name_lower.starts_with("xdg-desktop-portal")
        || name_lower.starts_with("kwin")
        || name_lower.starts_with("plasma-")
        || name_lower.starts_with("gnome-session")
        || name_lower.starts_with("gvfs")
        || name_lower.starts_with("ibus")
        || name_lower.starts_with("fcitx")
        || name_lower.starts_with("at-spi")
        || name_lower.starts_with("dconf")
    {
        return true;
    }
    false
}

/// Finds all running process PIDs matching candidate executables or install directory
fn find_active_pids_for_game(
    sys: &sysinfo::System,
    candidate_exes: &[String],
    install_dir: Option<&str>,
) -> Vec<u32> {
    let mut pids = Vec::new();
    let self_pid = std::process::id();

    let dir_clean = install_dir
        .map(|d| {
            let mut s = d.to_lowercase().replace('/', "\\");
            if s.starts_with(r"\\?\") {
                s = s[4..].to_string();
            }
            s.trim_end_matches('\\').to_string()
        })
        .filter(|d| !is_unsafe_shared_directory(d));

    for (pid, proc) in sys.processes() {
        let pid_u32 = pid.as_u32();
        if pid_u32 <= 1 || pid_u32 == self_pid {
            continue;
        }

        let name_str = proc.name().to_string_lossy().to_lowercase();
        if is_protected_system_process(&name_str) {
            continue;
        }

        // Check 1: Match by candidate executable name (always reliable on Windows)
        if !candidate_exes.is_empty()
            && candidate_exes.iter().any(|c| c.eq_ignore_ascii_case(&name_str))
        {
            pids.push(pid_u32);
            continue;
        }

        // Check 2: Match by install directory path prefix if exe path is available
        if let Some(ref dir_clean_str) = dir_clean {
            if let Some(exe_path) = proc.exe() {
                let mut exe_str = exe_path.to_string_lossy().to_lowercase().replace('/', "\\");
                if exe_str.starts_with(r"\\?\") {
                    exe_str = exe_str[4..].to_string();
                }
                // Ensure boundary match (exact directory prefix followed by '\')
                let prefix_with_sep = format!("{}\\", dir_clean_str);
                if exe_str.starts_with(&prefix_with_sep) {
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
                        pids.push(pid_u32);
                    }
                }
            }
        }
    }
    pids
}

pub struct GameLauncher;

fn split_cli_arguments(args: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut quote_char = '"';

    for c in args.chars() {
        if (c == '"' || c == '\'') && !in_quotes {
            in_quotes = true;
            quote_char = c;
        } else if in_quotes && c == quote_char {
            in_quotes = false;
        } else if c.is_whitespace() && !in_quotes {
            if !current.is_empty() {
                parts.push(current);
                current = String::new();
            }
        } else {
            current.push(c);
        }
    }
    if !current.is_empty() {
        parts.push(current);
    }
    parts
}

/// Resolves an executable command string (which could be an absolute path,
/// a command in PATH, or a command with arguments like "flatpak run ...")
pub fn resolve_executable_command(exe_str: &str) -> Option<(std::path::PathBuf, Vec<String>)> {
    let trimmed = exe_str.trim();
    if trimmed.is_empty() {
        return None;
    }

    // 1. Direct path exists
    let direct_path = std::path::PathBuf::from(trimmed);
    if direct_path.exists() && direct_path.is_file() {
        return Some((direct_path, Vec::new()));
    }

    // 2. Parse command arguments if command contains spaces (e.g. "flatpak run org.prismlauncher.PrismLauncher")
    let parts = split_cli_arguments(trimmed);
    if parts.is_empty() {
        return None;
    }
    let cmd_binary = &parts[0];
    let cmd_args = parts[1..].to_vec();

    let cmd_path = std::path::PathBuf::from(cmd_binary);
    if cmd_path.exists() && cmd_path.is_file() {
        return Some((cmd_path, cmd_args));
    }

    // 3. Search PATH
    if let Ok(paths) = std::env::var("PATH") {
        for dir in std::env::split_paths(&paths) {
            let candidate = dir.join(cmd_binary);
            if candidate.is_file() {
                return Some((candidate, cmd_args.clone()));
            }
            #[cfg(target_os = "windows")]
            {
                let candidate_exe = dir.join(format!("{}.exe", cmd_binary));
                if candidate_exe.is_file() {
                    return Some((candidate_exe, cmd_args.clone()));
                }
            }
        }
    }

    None
}

fn extract_flatpak_app_id(exe_path: &Path, args: &[String]) -> Option<String> {
    let bin_name = exe_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_lowercase();
    if bin_name != "flatpak" {
        return None;
    }
    let run_idx = args.iter().position(|a| a == "run")?;
    args[run_idx + 1..]
        .iter()
        .find(|a| !a.starts_with('-'))
        .cloned()
}

impl GameLauncher {
    pub fn is_game_running(game_id: &str) -> bool {
        let map = running_games_map().lock().unwrap();
        map.contains_key(game_id)
    }

    pub fn launch_game_by_id(
        sink: LauncherEventSink,
        db: Arc<Database>,
        game_id: &str,
        action_id: Option<&str>,
    ) -> Result<String, String> {
        let all = db.get_all_games()?;
        let game = all
            .into_iter()
            .find(|g| g.id == game_id)
            .ok_or_else(|| "Game not found".to_string())?;

        // Guard: Never update last_played or launch a playtime tracking session for uninstalled games.
        // Route to install_game_core safely instead.
        if !game.is_installed {
            crate::install_game_core(&db, game_id)?;
            return Ok(String::new());
        }

        if let Some(aid) = action_id {
            if let Some(action) = game.play_actions.iter().find(|a| a.id == aid) {
                return Self::launch_custom_action(
                    sink,
                    db.clone(),
                    game.id,
                    Some(action.path.clone()),
                    action.arguments.clone(),
                    action.working_dir.clone().or(game.install_directory.clone()),
                );
            }
        }

        Self::launch_game(
            sink,
            db,
            game.id,
            game.source,
            game.source_id,
            game.executable_path,
            game.install_directory,
            game.launch_arguments,
            game.emulator_id,
        )
    }

    pub fn launch_game(
        sink: LauncherEventSink,
        db: Arc<Database>,
        game_id: String,
        source: String,
        source_id: Option<String>,
        executable_path: Option<String>,
        install_directory: Option<String>,
        launch_arguments: Option<String>,
        emulator_id: Option<String>,
    ) -> Result<String, String> {
        let now_str = chrono::Local::now().format("%Y-%m-%d %H:%M").to_string();

        if source.eq_ignore_ascii_case("riot games") || source.eq_ignore_ascii_case("riot") {
            if let Some(ref dir) = install_directory {
                if !Path::new(dir).exists() {
                    let _ = db.update_game_installed(&game_id, false);
                    sink.emit("game-updated", &serde_json::json!({ "id": &game_id, "is_installed": false }));
                    return Err(format!("Riot game folder not found at '{}'. Please verify installation via Riot Client.", dir));
                }
            }
        }

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
                sink.emit(
                    "game-launched",
                    &serde_json::json!({
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
                            prefix_path: None,
                            runner_path: None,
                            flatpak_app_id: None,
                            start_time,
                        },
                    );
                }
                sink.emit("game-running", &serde_json::json!({ "id": &game_id }));

                // Monitor Steam process lifetime in background
                let sink_clone = sink.clone();
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
                    unregister_running_game(&gid);
                    let elapsed = start_time.elapsed().as_secs();
                    let end_str = chrono::Local::now().format("%Y-%m-%d %H:%M").to_string();
                    finalize_game_session(Some(&sink_clone), Some(&db_clone), &gid, elapsed, &end_str);
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
                    } else {
                        let _ = Command::new("xdg-open").arg(&epic_url).spawn();
                    }
                }

                let _ = db.update_playtime(&game_id, 0, &now_str);
                sink.emit(
                    "game-launched",
                    &serde_json::json!({
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
                            prefix_path: None,
                            runner_path: None,
                            flatpak_app_id: None,
                            start_time,
                        },
                    );
                }
                sink.emit("game-running", &serde_json::json!({ "id": &game_id }));

                let sink_clone = sink.clone();
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

                    unregister_running_game(&gid);
                    let elapsed = start_time.elapsed().as_secs();
                    let end_str = chrono::Local::now().format("%Y-%m-%d %H:%M").to_string();
                    finalize_game_session(Some(&sink_clone), Some(&db_clone), &gid, elapsed, &end_str);
                });

                return Ok(now_str);
            } else {
                return Err("Missing Epic App Name".to_string());
            }
        }

        // Emulated Game
        if source.to_lowercase() == "emulation" {
            let rom_path = executable_path.ok_or_else(|| "Missing ROM file path for emulated game".to_string())?;

            let configured_consoles = db.get_configured_consoles().unwrap_or_default();
            let configured = if let Some(ref emu_id) = emulator_id {
                configured_consoles.iter().find(|c| &c.id == emu_id).cloned()
            } else {
                None
            };

            let (raw_exe_path, mut args_template, emu_name, core_opt) = if let Some(conf) = configured {
                (conf.executable_path, conf.arguments_template, conf.name, conf.core_name)
            } else {
                let emulator_profiles = db.get_emulator_profiles().unwrap_or_default();
                let profile = if let Some(ref emu_id) = emulator_id {
                    emulator_profiles.iter().find(|e| &e.id == emu_id).cloned()
                } else {
                    None
                }
                .or_else(|| emulator_profiles.iter().find(|e| e.is_installed).cloned())
                .or_else(|| emulator_profiles.first().cloned())
                .ok_or_else(|| "No emulator or console configured. Please set up a console in Library Manager > Emulation.".to_string())?;

                if profile.executable_path.trim().is_empty() {
                    return Err(format!("Emulator '{}' has no executable path configured", profile.name));
                }

                (profile.executable_path, profile.arguments_template, profile.name, profile.selected_core)
            };

            if raw_exe_path.trim().is_empty() {
                return Err(format!("Console/Emulator '{}' has no executable path configured", emu_name));
            }

            // If user saved a Linux .desktop entry path, resolve it cleanly to its actual Exec command
            let effective_exe_path = crate::emulator::EmulatorService::resolve_emulator_target(&raw_exe_path).command;
            let is_flatpak_cmd = effective_exe_path.to_lowercase().contains("flatpak");

            // Resolve RetroArch {core} cleanly across Windows (cores/{core}.dll) and Linux (native/Flatpak/Snap .so paths)
            if let Some(ref core) = core_opt {
                let trimmed_core = core.trim();
                if !trimmed_core.is_empty() {
                    if let Some(resolved_core) =
                        crate::emulator::EmulatorService::resolve_retroarch_core_path(&effective_exe_path, trimmed_core)
                    {
                        let mut resolved_str = resolved_core.to_string_lossy().to_string();
                        // Inside Flatpak RetroArch sandbox, host .../org.libretro.RetroArch/current/active/files/... maps to /app/...
                        if is_flatpak_cmd {
                            if let Some(idx) = resolved_str.find("/current/active/files/") {
                                resolved_str = format!("/app/{}", &resolved_str[idx + "/current/active/files/".len()..]);
                            }
                        }
                        args_template = args_template
                            .replace("cores/{core}", &resolved_str)
                            .replace("cores\\{core}", &resolved_str)
                            .replace("{core}", &resolved_str);
                    } else {
                        #[cfg(target_os = "linux")]
                        let fallback_core = {
                            let is_win_exe = effective_exe_path.to_lowercase().ends_with(".exe");
                            if !is_win_exe && trimmed_core.to_lowercase().ends_with(".dll") {
                                format!("{}.so", &trimmed_core[..trimmed_core.len() - 4])
                            } else {
                                trimmed_core.to_string()
                            }
                        };
                        #[cfg(not(target_os = "linux"))]
                        let fallback_core = trimmed_core.to_string();

                        if Path::new(&fallback_core).is_absolute() {
                            args_template = args_template
                                .replace("cores/{core}", &fallback_core)
                                .replace("cores\\{core}", &fallback_core)
                                .replace("{core}", &fallback_core);
                        } else {
                            args_template = args_template.replace("{core}", &fallback_core);
                        }
                    }
                }
            }

            args_template = args_template.replace("{rom_path}", &rom_path);
            if let Some(ref custom_args) = launch_arguments {
                if !custom_args.trim().is_empty() {
                    args_template = format!("{} {}", args_template, custom_args.trim());
                }
            }

            let (emu_path_buf, mut all_args) = resolve_executable_command(&effective_exe_path).ok_or_else(|| {
                format!(
                    "Emulator executable not found for '{}' ('{}'). Please verify the binary path or Flatpak command in Library Manager > Emulation.",
                    emu_name, effective_exe_path
                )
            })?;

            let mut template_parts = split_cli_arguments(&args_template);
            all_args.append(&mut template_parts);

            let flatpak_app_id = extract_flatpak_app_id(&emu_path_buf, &all_args);

            let raw_parent = emu_path_buf
                .parent()
                .filter(|p| !p.as_os_str().is_empty() && p.is_dir())
                .map(|p| p.to_string_lossy().to_string());
            // Never use a shared system directory (like /usr/bin) as install_directory for process scanning or cwd
            let parent_dir = raw_parent.clone().filter(|d| {
                let norm = d.to_lowercase().replace('/', "\\");
                !is_unsafe_shared_directory(norm.trim_end_matches('\\'))
            });
            let emu_filename = emu_path_buf
                .file_name()
                .map(|f| f.to_string_lossy().to_lowercase())
                .unwrap_or_default();

            #[cfg(target_os = "linux")]
            let (mut cmd, prefix_path_opt, runner_path_opt) = {
                let is_windows_exe = emu_path_buf
                    .extension()
                    .map(|e| e.to_string_lossy().eq_ignore_ascii_case("exe"))
                    .unwrap_or(false);

                if is_windows_exe {
                    let config = db.get_app_config().unwrap_or_default();
                    let runner = RunnerManager::resolve_runner(
                        config.linux_preferred_runner_id.as_deref(),
                        config.linux_custom_runner_path.as_deref(),
                    )
                    .ok_or_else(|| {
                        "No Proton or Wine runner found on this system to run this Windows (.exe) emulator. Please install a native Linux emulator (Flatpak/AppImage) or configure a Proton/Wine runner in Settings > Linux.".to_string()
                    })?;

                    let prefix_dir = LinuxWineEngine::get_game_prefix_dir(&game_id);
                    let enable_gamemode = config.enable_gamemode.unwrap_or(true);
                    let enable_mangohud = config.enable_mangohud.unwrap_or(false);

                    let c = LinuxWineEngine::build_execution_command(
                        &emu_path_buf,
                        raw_parent.as_deref().map(Path::new),
                        &all_args,
                        &prefix_dir,
                        &runner,
                        enable_gamemode,
                        enable_mangohud,
                        &HashMap::new(),
                    )?;
                    (c, Some(prefix_dir.to_string_lossy().to_string()), Some(runner.path.clone()))
                } else {
                    #[cfg(unix)]
                    {
                        use std::os::unix::fs::PermissionsExt;
                        if let Ok(meta) = fs::metadata(&emu_path_buf) {
                            let mut perms = meta.permissions();
                            let mode = perms.mode();
                            if mode & 0o111 == 0 {
                                perms.set_mode(mode | 0o755);
                                let _ = fs::set_permissions(&emu_path_buf, perms);
                            }
                        }
                    }
                    let mut c = Command::new(&emu_path_buf);
                    if let Some(ref p) = parent_dir {
                        c.current_dir(p);
                    }
                    if !all_args.is_empty() {
                        c.args(&all_args);
                    }
                    (c, None, None)
                }
            };

            #[cfg(not(target_os = "linux"))]
            let (mut cmd, prefix_path_opt, runner_path_opt) = {
                let mut c = Command::new(&emu_path_buf);
                if let Some(ref p) = raw_parent {
                    c.current_dir(p);
                }
                if !all_args.is_empty() {
                    c.args(&all_args);
                }
                (c, None::<String>, None::<String>)
            };

            let start_time = Instant::now();
            let mut child = cmd
                .spawn()
                .map_err(|e| format!("Failed to execute emulator '{}' ({}): {}", emu_name, effective_exe_path, e))?;

            let child_pid = child.id();
            let candidate_exes = if !emu_filename.is_empty() && !is_protected_system_process(&emu_filename) {
                vec![emu_filename]
            } else {
                Vec::new()
            };

            let _ = db.update_playtime(&game_id, 0, &now_str);
            sink.emit(
                "game-launched",
                &serde_json::json!({
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
                        prefix_path: prefix_path_opt,
                        runner_path: runner_path_opt,
                        flatpak_app_id,
                        start_time,
                    },
                );
            }
            sink.emit("game-running", &serde_json::json!({ "id": &game_id }));

            let sink_clone = sink.clone();
            let db_clone = db.clone();
            let gid = game_id.clone();
            let inst_dir = parent_dir;
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
                        inst_dir.as_deref(),
                    );

                    if child_exited && active_pids.is_empty() {
                        consecutive_missing += 1;
                        if consecutive_missing >= 2 {
                            break;
                        }
                    } else {
                        consecutive_missing = 0;
                        let mut tracked = active_pids;
                        if !child_exited && !tracked.contains(&child_pid) {
                            tracked.push(child_pid);
                        }
                        let mut map = running_games_map().lock().unwrap();
                        if let Some(info) = map.get_mut(&gid) {
                            info.pids = tracked;
                        }
                    }
                }

                unregister_running_game(&gid);
                let elapsed = start_time.elapsed().as_secs();
                let end_str = chrono::Local::now().format("%Y-%m-%d %H:%M").to_string();
                finalize_game_session(Some(&sink_clone), Some(&db_clone), &gid, elapsed, &end_str);
            });

            return Ok(now_str);
        }

        // Resolve fallback URI for GOG if no direct executable_path is set
        let resolved_executable = if executable_path.is_none() && source.eq_ignore_ascii_case("gog") {
            source_id.as_ref().map(|sid| format!("goggalaxy://openGameView/{}", sid))
        } else if source.eq_ignore_ascii_case("roblox") {
            // Dynamically resolve latest Roblox binary if the old version hash folder was updated
            match executable_path {
                Some(ref p) if Path::new(p).exists() => Some(p.clone()),
                _ => crate::scanner::providers::RobloxScanner::find_latest_roblox_player()
                    .map(|(exe, _)| exe.to_string_lossy().to_string())
                    .or(executable_path),
            }
        } else {
            executable_path
        };

        // Custom / Manual / Storefront URI / Shortcut game
        if let Some(exe_path) = resolved_executable {
            let trimmed_exe = exe_path.trim();
            if trimmed_exe.is_empty() || trimmed_exe == r"\\" || trimmed_exe == "//" {
                let _ = db.update_game_installed(&game_id, false);
                sink.emit("game-updated", &serde_json::json!({ "id": &game_id, "is_installed": false }));
                return Err("Cannot launch game: executable path is invalid or empty.".to_string());
            }

            let is_protocol_uri = trimmed_exe.contains("://") || trimmed_exe.starts_with("roblox-player:");
            let is_shell_app = trimmed_exe.to_lowercase().starts_with("shell:appsfolder\\");
            let is_shortcut = trimmed_exe.to_lowercase().ends_with(".lnk")
                || trimmed_exe.to_lowercase().ends_with(".url");

            if is_protocol_uri || is_shell_app || is_shortcut {
                if is_shortcut && !Path::new(trimmed_exe).exists() {
                    let _ = db.update_game_installed(&game_id, false);
                    sink.emit("game-updated", &serde_json::json!({ "id": &game_id, "is_installed": false }));
                    return Err(format!("Shortcut file not found at '{}'. The file may have been moved or deleted.", trimmed_exe));
                }

                #[cfg(target_os = "windows")]
                {
                    if is_shell_app {
                        Command::new("explorer")
                            .arg(trimmed_exe)
                            .spawn()
                            .map_err(|e| format!("Failed to launch Xbox/Store app '{}': {}", trimmed_exe, e))?;
                    } else {
                        Command::new("cmd")
                            .args(["/C", "start", "", trimmed_exe])
                            .spawn()
                            .map_err(|e| format!("Failed to launch '{}' via system handler: {}", trimmed_exe, e))?;
                    }
                }

                #[cfg(not(target_os = "windows"))]
                {
                    Command::new("xdg-open")
                        .arg(trimmed_exe)
                        .spawn()
                        .map_err(|e| format!("Failed to launch '{}': {}", trimmed_exe, e))?;
                }

                let _ = db.update_playtime(&game_id, 0, &now_str);
                sink.emit(
                    "game-launched",
                    &serde_json::json!({
                        "id": &game_id,
                        "last_played": &now_str,
                    }),
                );

                // Monitor install_directory executables if available
                if let Some(ref dir) = install_directory {
                    let candidate_exes = get_candidate_executables(dir);
                    if !candidate_exes.is_empty() {
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
                                    prefix_path: None,
                                    runner_path: None,
                                    flatpak_app_id: None,
                                    start_time,
                                },
                            );
                        }
                        sink.emit("game-running", &serde_json::json!({ "id": &game_id }));

                        let sink_clone = sink.clone();
                        let db_clone = db.clone();
                        let gid = game_id.clone();
                        let inst_dir = install_directory.clone();

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
                                    &candidate_exes,
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
                                } else if tick >= 40 {
                                    break;
                                }
                            }

                            unregister_running_game(&gid);
                            let elapsed = start_time.elapsed().as_secs();
                            let end_str = chrono::Local::now().format("%Y-%m-%d %H:%M").to_string();
                            finalize_game_session(Some(&sink_clone), Some(&db_clone), &gid, elapsed, &end_str);
                        });
                        return Ok(now_str);
                    }
                }

                crate::cloud_sync::spawn_background_export(db.clone());
                return Ok(now_str);
            }

            let (exe_path_buf, extra_args) = resolve_executable_command(trimmed_exe).ok_or_else(|| {
                let _ = db.update_game_installed(&game_id, false);
                sink.emit("game-updated", &serde_json::json!({ "id": &game_id, "is_installed": false }));
                format!("Game executable not found at '{}'. The directory or command could not be resolved.", trimmed_exe)
            })?;

            let raw_parent = install_directory
                .clone()
                .or_else(|| exe_path_buf.parent().map(|p| p.to_string_lossy().to_string()));
            // Never use a shared system directory (like /usr/bin) as install_directory for process scanning!
            let parent_dir = raw_parent.clone().filter(|d| {
                let norm = d.to_lowercase().replace('/', "\\");
                !is_unsafe_shared_directory(norm.trim_end_matches('\\'))
            });
            let exe_filename = exe_path_buf
                .file_name()
                .map(|f| f.to_string_lossy().to_lowercase())
                .unwrap_or_default();

            let mut all_args = extra_args;
            if let Some(ref custom_args) = launch_arguments {
                let mut parts = split_cli_arguments(custom_args);
                all_args.append(&mut parts);
            }

            #[cfg(target_os = "linux")]
            let (mut cmd, prefix_path_opt, runner_path_opt) = {
                let is_windows_exe = exe_path_buf
                    .extension()
                    .map(|e| e.to_string_lossy().eq_ignore_ascii_case("exe"))
                    .unwrap_or(false);

                if is_windows_exe {
                    let config = db.get_app_config().unwrap_or_default();
                    let runner = RunnerManager::resolve_runner(
                        config.linux_preferred_runner_id.as_deref(),
                        config.linux_custom_runner_path.as_deref(),
                    ).ok_or_else(|| {
                        "No Proton or Wine runner found on this system. Please ensure Steam Proton or Wine is installed, or configure a runner path in Settings.".to_string()
                    })?;

                    let prefix_dir = LinuxWineEngine::get_game_prefix_dir(&game_id);
                    let enable_gamemode = config.enable_gamemode.unwrap_or(true);
                    let enable_mangohud = config.enable_mangohud.unwrap_or(false);

                    let c = LinuxWineEngine::build_execution_command(
                        &exe_path_buf,
                        raw_parent.as_deref().map(Path::new),
                        &all_args,
                        &prefix_dir,
                        &runner,
                        enable_gamemode,
                        enable_mangohud,
                        &HashMap::new(),
                    )?;
                    (c, Some(prefix_dir.to_string_lossy().to_string()), Some(runner.path.clone()))
                } else {
                    #[cfg(unix)]
                    {
                        use std::os::unix::fs::PermissionsExt;
                        if let Ok(meta) = fs::metadata(&exe_path_buf) {
                            let mut perms = meta.permissions();
                            let mode = perms.mode();
                            if mode & 0o111 == 0 {
                                perms.set_mode(mode | 0o755);
                                let _ = fs::set_permissions(&exe_path_buf, perms);
                            }
                        }
                    }
                    let mut c = Command::new(&exe_path_buf);
                    if let Some(ref p) = raw_parent {
                        c.current_dir(p);
                    }
                    if !all_args.is_empty() {
                        c.args(&all_args);
                    }
                    (c, None, None)
                }
            };

            #[cfg(not(target_os = "linux"))]
            let (mut cmd, prefix_path_opt, runner_path_opt) = {
                let mut c = Command::new(&exe_path_buf);
                if let Some(ref p) = raw_parent {
                    c.current_dir(p);
                }
                if !all_args.is_empty() {
                    c.args(&all_args);
                }
                (c, None::<String>, None::<String>)
            };

            let start_time = Instant::now();
            let mut child = cmd
                .spawn()
                .map_err(|e| format!("Failed to execute '{}': {}", exe_path, e))?;

            let child_pid = child.id();
            let candidate_exes = if !exe_filename.is_empty() && !is_protected_system_process(&exe_filename) {
                vec![exe_filename.clone()]
            } else {
                Vec::new()
            };

            let _ = db.update_playtime(&game_id, 0, &now_str);
            sink.emit(
                "game-launched",
                &serde_json::json!({
                    "id": &game_id,
                    "last_played": &now_str,
                }),
            );

            let local_flatpak_app_id = extract_flatpak_app_id(&exe_path_buf, &all_args);
            {
                let mut map = running_games_map().lock().unwrap();
                map.insert(
                    game_id.clone(),
                    RunningGameInfo {
                        game_id: game_id.clone(),
                        pids: vec![child_pid],
                        candidate_exes: candidate_exes.clone(),
                        install_directory: parent_dir.clone(),
                        prefix_path: prefix_path_opt.clone(),
                        runner_path: runner_path_opt.clone(),
                        flatpak_app_id: local_flatpak_app_id,
                        start_time,
                    },
                );
            }
            sink.emit("game-running", &serde_json::json!({ "id": &game_id }));

            let is_minecraft_or_prism = {
                let lower_exe = exe_filename.to_lowercase();
                let lower_gid = game_id.to_lowercase();
                let lower_raw = trimmed_exe.to_lowercase();
                lower_exe.contains("prism")
                    || lower_exe.contains("minecraft")
                    || lower_gid.contains("prism")
                    || lower_gid.contains("minecraft")
                    || lower_raw.contains("prism")
                    || lower_raw.contains("minecraft")
            };

            // Spawn background thread to monitor process lifetime
            let sink_clone = sink.clone();
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
                    let mut active_pids = find_active_pids_for_game(
                        &sys,
                        &candidate_exes_clone,
                        parent_dir.as_deref(),
                    );

                    if is_minecraft_or_prism {
                        for (pid, proc) in sys.processes() {
                            let p_name = proc.name().to_string_lossy().to_lowercase();
                            if p_name == "java" || p_name == "javaw" || p_name.contains("minecraft") || p_name.contains("prism") {
                                let matches_cmd = proc.cmd().iter().any(|arg| {
                                    let s = arg.to_string_lossy().to_lowercase();
                                    s.contains("minecraft") || s.contains("prism") || s.contains("mojang")
                                });
                                if matches_cmd {
                                    let u = pid.as_u32();
                                    if !active_pids.contains(&u) {
                                        active_pids.push(u);
                                    }
                                }
                            }
                        }
                    }

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

                unregister_running_game(&gid);
                let elapsed = start_time.elapsed().as_secs();
                let end_str = chrono::Local::now().format("%Y-%m-%d %H:%M").to_string();
                finalize_game_session(Some(&sink_clone), Some(&db_clone), &gid, elapsed, &end_str);
            });

            return Ok(now_str);
        }

        Err("No executable or launch method found for this game".to_string())
    }

    pub fn launch_custom_action(
        sink: LauncherEventSink,
        db: Arc<Database>,
        game_id: String,
        executable_path: Option<String>,
        launch_arguments: Option<String>,
        working_directory: Option<String>,
    ) -> Result<String, String> {
        let now_str = chrono::Local::now().format("%Y-%m-%d %H:%M").to_string();
        let target = executable_path.ok_or_else(|| "No target executable or URL provided for action".to_string())?;
        let trimmed_target = target.trim();
        if trimmed_target.is_empty() || trimmed_target == r"\\" || trimmed_target == "//" {
            return Err("Cannot execute action: target executable or path is invalid or empty.".to_string());
        }

        // If target is a protocol or web URL (e.g. steam://, ror2mm://, https://)
        if trimmed_target.contains("://") {
            #[cfg(target_os = "windows")]
            {
                Command::new("cmd")
                    .args(["/C", "start", "", trimmed_target])
                    .spawn()
                    .map_err(|e| format!("Failed to launch action URL '{}': {}", trimmed_target, e))?;
            }
            #[cfg(not(target_os = "windows"))]
            {
                Command::new("xdg-open")
                    .arg(trimmed_target)
                    .spawn()
                    .map_err(|e| format!("Failed to launch action URL '{}': {}", trimmed_target, e))?;
            }
            let _ = db.update_playtime(&game_id, 0, &now_str);
            sink.emit("game-launched", &serde_json::json!({ "id": &game_id, "last_played": &now_str }));
            crate::cloud_sync::spawn_background_export(db.clone());
            return Ok(now_str);
        }

        let path_buf = std::path::PathBuf::from(trimmed_target);
        if !path_buf.exists() {
            return Err(format!("Action target executable not found at '{}'.", trimmed_target));
        }

        let work_dir = working_directory
            .map(std::path::PathBuf::from)
            .or_else(|| path_buf.parent().map(|p| p.to_path_buf()));

        #[cfg(target_os = "linux")]
        let (mut cmd, prefix_path_opt, runner_path_opt) = {
            let is_windows_exe = path_buf
                .extension()
                .map(|e| e.to_string_lossy().eq_ignore_ascii_case("exe"))
                .unwrap_or(false);

            if is_windows_exe {
                let config = db.get_app_config().unwrap_or_default();
                let runner = RunnerManager::resolve_runner(
                    config.linux_preferred_runner_id.as_deref(),
                    config.linux_custom_runner_path.as_deref(),
                ).ok_or_else(|| "No Proton or Wine runner found on system.".to_string())?;

                let prefix_dir = LinuxWineEngine::get_game_prefix_dir(&game_id);
                let parts = launch_arguments
                    .as_deref()
                    .map(split_cli_arguments)
                    .unwrap_or_default();
                let enable_gamemode = config.enable_gamemode.unwrap_or(true);
                let enable_mangohud = config.enable_mangohud.unwrap_or(false);

                let c = LinuxWineEngine::build_execution_command(
                    &path_buf,
                    work_dir.as_deref(),
                    &parts,
                    &prefix_dir,
                    &runner,
                    enable_gamemode,
                    enable_mangohud,
                    &HashMap::new(),
                )?;
                (c, Some(prefix_dir.to_string_lossy().to_string()), Some(runner.path.clone()))
            } else {
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    if let Ok(meta) = fs::metadata(&path_buf) {
                        let mut perms = meta.permissions();
                        let mode = perms.mode();
                        if mode & 0o111 == 0 {
                            perms.set_mode(mode | 0o755);
                            let _ = fs::set_permissions(&path_buf, perms);
                        }
                    }
                }
                let mut c = Command::new(trimmed_target);
                if let Some(ref dir) = work_dir {
                    c.current_dir(dir);
                }
                if let Some(ref args_str) = launch_arguments {
                    let parts: Vec<&str> = args_str.split_whitespace().collect();
                    c.args(parts);
                }
                (c, None, None)
            }
        };

        #[cfg(not(target_os = "linux"))]
        let (mut cmd, prefix_path_opt, runner_path_opt) = {
            let mut c = Command::new(trimmed_target);
            if let Some(ref dir) = work_dir {
                c.current_dir(dir);
            }
            if let Some(ref args_str) = launch_arguments {
                let parts: Vec<&str> = args_str.split_whitespace().collect();
                c.args(parts);
            }
            (c, None::<String>, None::<String>)
        };

        let start_time = Instant::now();
        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to execute '{}': {}", target, e))?;

        let child_pid = child.id();
        let exe_filename = path_buf
            .file_name()
            .map(|f| f.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        let candidate_exes = if !exe_filename.is_empty() && !is_protected_system_process(&exe_filename) {
            vec![exe_filename]
        } else {
            Vec::new()
        };

        let safe_work_dir = work_dir
            .map(|p| p.to_string_lossy().to_string())
            .filter(|d| {
                let norm = d.to_lowercase().replace('/', "\\");
                !is_unsafe_shared_directory(norm.trim_end_matches('\\'))
            });

        let _ = db.update_playtime(&game_id, 0, &now_str);
        sink.emit("game-launched", &serde_json::json!({ "id": &game_id, "last_played": &now_str }));

        {
            let mut map = running_games_map().lock().unwrap();
            map.insert(
                game_id.clone(),
                RunningGameInfo {
                    game_id: game_id.clone(),
                    pids: vec![child_pid],
                    candidate_exes: candidate_exes.clone(),
                    install_directory: safe_work_dir.clone(),
                    prefix_path: prefix_path_opt.clone(),
                    runner_path: runner_path_opt.clone(),
                    flatpak_app_id: None,
                    start_time,
                },
            );
        }
        sink.emit("game-running", &serde_json::json!({ "id": &game_id }));

        let sink_clone = sink.clone();
        let db_clone = db.clone();
        let gid = game_id.clone();
        let parent_dir_str = safe_work_dir;
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
                    parent_dir_str.as_deref(),
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

            unregister_running_game(&gid);
            let elapsed = start_time.elapsed().as_secs();
            let end_str = chrono::Local::now().format("%Y-%m-%d %H:%M").to_string();
            finalize_game_session(Some(&sink_clone), Some(&db_clone), &gid, elapsed, &end_str);
        });

        Ok(now_str)
    }

    pub fn stop_game(sink: LauncherEventSink, db: Option<Arc<Database>>, game_id: &str) -> Result<(), String> {
        let mut pids_to_kill = Vec::new();
        let mut candidate_exes = Vec::new();
        let mut prefix_path_opt: Option<String> = None;
        let mut runner_path_opt: Option<String> = None;
        let mut flatpak_app_id_opt: Option<String> = None;
        let mut elapsed = 0u64;

        if let Some(info) = unregister_running_game(game_id) {
            pids_to_kill = info.pids;
            candidate_exes = info.candidate_exes;
            prefix_path_opt = info.prefix_path;
            runner_path_opt = info.runner_path;
            flatpak_app_id_opt = info.flatpak_app_id;
            elapsed = info.start_time.elapsed().as_secs();
        }

        let self_pid = std::process::id();

        #[cfg(target_os = "windows")]
        {
            let _ = &flatpak_app_id_opt;
            for pid in &pids_to_kill {
                if *pid > 4 && *pid != self_pid {
                    let _ = Command::new("taskkill")
                        .args(["/PID", &pid.to_string(), "/T", "/F"])
                        .spawn();
                }
            }
        }

        #[cfg(target_os = "linux")]
        {
            if let Some(ref pfx) = prefix_path_opt {
                LinuxWineEngine::shutdown_prefix(Path::new(pfx), runner_path_opt.as_deref());
            }
            if let Some(ref app_id) = flatpak_app_id_opt {
                let _ = Command::new("flatpak").args(["kill", app_id]).spawn();
            }
        }

        #[cfg(not(any(target_os = "windows", target_os = "linux")))]
        {
            let _ = (&prefix_path_opt, &runner_path_opt, &flatpak_app_id_opt);
        }

        let mut sys = sysinfo::System::new();
        sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

        let mut targets = Vec::new();
        for (pid, proc) in sys.processes() {
            let pid_u32 = pid.as_u32();
            if pid_u32 <= 1 || pid_u32 == self_pid {
                continue;
            }
            let name_str = proc.name().to_string_lossy().to_lowercase();
            if is_protected_system_process(&name_str) {
                continue;
            }
            let matches_candidate = !candidate_exes.is_empty()
                && candidate_exes.iter().any(|c| c.eq_ignore_ascii_case(&name_str));
            let is_in_pids = pids_to_kill.contains(&pid_u32);

            if is_in_pids || matches_candidate {
                targets.push(pid_u32);
            }
        }

        // First send polite SIGTERM so graphics drivers (Vulkan/DRM/Wayland) and audio release cleanly
        for pid_u32 in &targets {
            if let Some(proc) = sys.process(sysinfo::Pid::from_u32(*pid_u32)) {
                let _ = proc.kill_with(sysinfo::Signal::Term);
            }
            #[cfg(target_os = "windows")]
            {
                let _ = Command::new("taskkill")
                    .args(["/PID", &pid_u32.to_string(), "/T"])
                    .spawn();
            }
        }

        // Give processes a brief grace window (400ms) to release GPU/compositor contexts, then SIGKILL stragglers
        if !targets.is_empty() {
            let targets_bg = targets.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(400));
                let mut sys_after = sysinfo::System::new();
                sys_after.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
                for pid_u32 in targets_bg {
                    if let Some(proc) = sys_after.process(sysinfo::Pid::from_u32(pid_u32)) {
                        let name_str = proc.name().to_string_lossy().to_lowercase();
                        if !is_protected_system_process(&name_str) {
                            let _ = proc.kill();
                            #[cfg(target_os = "windows")]
                            let _ = Command::new("taskkill")
                                .args(["/PID", &pid_u32.to_string(), "/T", "/F"])
                                .spawn();
                        }
                    }
                }
            });
        }

        let end_str = chrono::Local::now().format("%Y-%m-%d %H:%M").to_string();
        finalize_game_session(Some(&sink), db.as_ref(), game_id, elapsed, &end_str);

        Ok(())
    }

    pub fn get_running_games(
        sink: Option<&LauncherEventSink>,
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

                let tracked_pid_alive = info
                    .pids
                    .iter()
                    .any(|&p| p > 1 && sys.process(sysinfo::Pid::from_u32(p)).is_some());

                let active_pids = find_active_pids_for_game(
                    &sys,
                    &info.candidate_exes,
                    info.install_directory.as_deref(),
                );

                if tracked_pid_alive || !active_pids.is_empty() {
                    alive_games.push(gid.clone());
                } else {
                    dead_games.push((gid.clone(), info.start_time));
                }
            }
        }

        if !dead_games.is_empty() {
            for (gid, start_time) in dead_games {
                unregister_running_game(&gid);
                let elapsed = start_time.elapsed().as_secs();
                let end_str = chrono::Local::now().format("%Y-%m-%d %H:%M").to_string();
                finalize_game_session(sink, db, &gid, elapsed, &end_str);
            }
        }

        alive_games
    }
}
