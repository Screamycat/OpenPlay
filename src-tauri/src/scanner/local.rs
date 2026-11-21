use crate::models::Game;
use regex::Regex;
use std::fs;
use std::path::{Path, PathBuf};

pub struct LocalScanner;

impl LocalScanner {
    /// Cleans and formats an executable filename or folder into a human-readable game title
    pub fn clean_title_from_path(path: &Path) -> String {
        let file_stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Unknown Game");

        let lower = file_stem.to_lowercase();
        // If the executable name is generic like "game", "launcher", "play", "start", "shipping", use the folder name instead
        let generic_names = [
            "game", "launcher", "start", "play", "main", "shipping", "win64",
            "win32", "app", "application", "client", "loader", "bootstrap",
        ];
        let is_short_codename = lower.len() <= 2;
        if is_short_codename
            || generic_names
                .iter()
                .any(|&g| lower == g || (lower.starts_with(g) && lower.len() <= g.len() + 3))
        {
            if let Some(parent) = path.parent() {
                let p_stem = parent.file_stem().and_then(|s| s.to_str()).unwrap_or("");
                let p_lower = p_stem.to_lowercase();
                // If parent is "bin" or "binaries" or "win64", go one higher
                let candidate_stem = if p_lower == "bin"
                    || p_lower == "binaries"
                    || p_lower == "win64"
                    || p_lower == "x64"
                    || p_lower == "win32"
                {
                    parent
                        .parent()
                        .and_then(|gp| gp.file_stem())
                        .and_then(|s| s.to_str())
                        .unwrap_or("")
                } else {
                    p_stem
                };

                let c_lower = candidate_stem.to_lowercase();
                let generic_folders = [
                    "", "games", "windows", "linux", "desktop", "downloads",
                    "program files", "program files (x86)", "common", "steamapps",
                ];
                if !generic_folders.contains(&c_lower.as_str()) {
                    return Self::format_raw_title(candidate_stem);
                }
            }
        }

        Self::format_raw_title(file_stem)
    }

    /// Formats a raw stem string into a clean title with spacing and capitalization
    fn format_raw_title(raw: &str) -> String {
        // Strip common suffixes like -Win64-Shipping, _x64, _x86, v1.0, etc.
        let re_strip = Regex::new(r"(?i)[-_](?:win64|win32|x64|x86|shipping|launcher|release|final|v\d+.*)$").unwrap();
        let stripped = re_strip.replace_all(raw, "").to_string();

        // Replace underscores and hyphens with spaces
        let spaced = stripped.replace(['_', '-'], " ");

        // Insert spaces before PascalCase words (e.g. "DeadCells" -> "Dead Cells")
        let re_pascal = Regex::new(r"([a-z0-9])([A-Z])").unwrap();
        let with_spaces = re_pascal.replace_all(&spaced, "$1 $2").to_string();

        // Collapse multiple spaces
        let words: Vec<&str> = with_spaces.split_whitespace().collect();
        if words.is_empty() {
            return raw.to_string();
        }

        // Capitalize words
        words
            .into_iter()
            .map(|w| {
                let mut c = w.chars();
                match c.next() {
                    None => String::new(),
                    Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                }
            })
            .collect::<Vec<String>>()
            .join(" ")
    }

    /// Scans a single executable and generates a candidate Game struct
    pub fn scan_executable(exe_path_str: &str) -> Result<Game, String> {
        let path = Path::new(exe_path_str);
        if !path.exists() {
            return Err(format!("File does not exist: {}", exe_path_str));
        }

        let title = Self::clean_title_from_path(path);
        let parent_dir = path
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();

        let file_size = fs::metadata(path).map(|m| m.len()).ok();

        // Look for any existing .ico or icon image in the same directory
        let icon_image = Self::find_adjacent_icon(path);

        let id = format!("local_{}", uuid::Uuid::new_v4().simple());
        let now = chrono::Local::now().format("%Y-%m-%d").to_string();

        Ok(Game {
            id,
            title,
            sorting_title: None,
            source: "Manual".to_string(),
            source_id: None,
            install_directory: if parent_dir.is_empty() { None } else { Some(parent_dir) },
            executable_path: Some(exe_path_str.to_string()),
            launch_arguments: None,
            is_installed: true,
            is_favorite: false,
            cover_image: None,
            background_image: None,
            logo_image: None,
            icon_image,
            developer: None,
            publisher: None,
            release_date: None,
            genres: Vec::new(),
            features: Vec::new(),
            platforms: {
                let is_windows = path
                    .extension()
                    .map(|e| e.to_string_lossy().eq_ignore_ascii_case("exe"))
                    .unwrap_or(false);
                if is_windows {
                    vec!["PC (Windows)".to_string()]
                } else {
                    vec!["PC (Linux)".to_string()]
                }
            },
            community_score: None,
            critic_score: None,
            user_rating: None,
            playtime_seconds: 0,
            last_played: None,
            date_added: Some(now),
            completion_status: Some("Auto".to_string()),
            description: None,
            notes: None,
            links: Vec::new(),
            screenshots: Vec::new(),
            trailers: Vec::new(),
            age_rating: None,
            series: None,
            hltb_main: None,
            hltb_extra: None,
            hltb_completionist: None,
            size_on_disk: file_size,
            tags: Vec::new(),
            categories: Vec::new(),
            region: None,
            play_count: Some(0),
            is_hidden: false,
            play_actions: Vec::new(),
            ..Default::default()
        })
    }

    /// Scans a directory for game executables, filtering out tools and crash reporters
    pub fn scan_folder(folder_path_str: &str) -> Result<Vec<Game>, String> {
        let root = Path::new(folder_path_str);
        if !root.exists() || !root.is_dir() {
            return Err(format!("Folder does not exist or is not a directory: {}", folder_path_str));
        }

        let mut candidate_exes = Vec::new();
        Self::collect_exes(root, 0, 3, &mut candidate_exes);

        if candidate_exes.is_empty() {
            return Err(format!("No game executables found in '{}'", folder_path_str));
        }

        // Rank and filter candidates
        let mut games = Vec::new();
        for exe in candidate_exes {
            if let Ok(game) = Self::scan_executable(&exe.to_string_lossy()) {
                games.push(game);
            }
        }

        Ok(games)
    }

    /// Helper that searches for an icon file (.ico or .png with "icon") in the game folder
    fn find_adjacent_icon(exe_path: &Path) -> Option<String> {
        let parent = exe_path.parent()?;
        if let Ok(entries) = fs::read_dir(parent) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_file() {
                    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
                    if ext == "ico" {
                        return Some(p.to_string_lossy().to_string());
                    }
                    let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
                    if ext == "png" && (stem == "icon" || stem == "app" || stem == "logo") {
                        return Some(p.to_string_lossy().to_string());
                    }
                }
            }
        }
        None
    }

    /// Recursively collects candidate executables up to max_depth
    fn collect_exes(dir: &Path, current_depth: usize, max_depth: usize, results: &mut Vec<PathBuf>) {
        if current_depth > max_depth {
            return;
        }

        let ignored_keywords = [
            "unins", "setup", "update", "patch", "crash", "reporter", "redist",
            "vcredist", "dxsetup", "directx", "dotnet", "cef", "browser",
            "helper", "config", "tool", "server", "dedicated", "benchmark",
            "eac", "easyanticheat", "battleye", "support",
        ];

        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    let mut is_candidate = false;
                    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                        if ext.eq_ignore_ascii_case("exe")
                            || ext.eq_ignore_ascii_case("appimage")
                            || ext.eq_ignore_ascii_case("sh")
                            || ext.eq_ignore_ascii_case("bin")
                        {
                            is_candidate = true;
                        }
                    }
                    #[cfg(unix)]
                    {
                        use std::os::unix::fs::PermissionsExt;
                        if !is_candidate {
                            if let Ok(meta) = fs::metadata(&path) {
                                if meta.permissions().mode() & 0o111 != 0 {
                                    is_candidate = true;
                                }
                            }
                        }
                    }

                    if is_candidate {
                        let name = path.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
                        if !ignored_keywords.iter().any(|&k| name.contains(k)) {
                            results.push(path);
                        }
                    }
                } else if path.is_dir() {
                    let dname = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_lowercase();
                    // Skip common dependency / asset subdirectories
                    if !["_redist", "redist", "support", "engine", "mono", "jre", "crashpad", "logs", "save", "saves"].contains(&dname.as_str()) {
                        Self::collect_exes(&path, current_depth + 1, max_depth, results);
                    }
                }
            }
        }
    }

    /// Scans installed Linux desktop applications (.desktop files) in standard system and user locations
    pub fn scan_installed_desktop_apps() -> Result<Vec<Game>, String> {
        let mut games = Vec::new();
        let mut seen_execs = std::collections::HashSet::new();
        let mut seen_titles = std::collections::HashSet::new();

        let mut app_dirs = vec![
            PathBuf::from("/usr/share/applications"),
            PathBuf::from("/usr/local/share/applications"),
            PathBuf::from("/var/lib/flatpak/exports/share/applications"),
        ];

        if let Some(data_dir) = dirs::data_dir() {
            app_dirs.push(data_dir.join("applications"));
            app_dirs.push(data_dir.join("flatpak/exports/share/applications"));
        }
        if let Some(home) = dirs::home_dir() {
            app_dirs.push(home.join(".local/share/applications"));
            app_dirs.push(home.join(".local/share/flatpak/exports/share/applications"));
        }

        let now = chrono::Local::now().format("%Y-%m-%d").to_string();

        for dir in app_dirs {
            if !dir.is_dir() {
                continue;
            }
            if let Ok(entries) = fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_file() && path.extension().map(|e| e == "desktop").unwrap_or(false) {
                        if let Some(game) = Self::parse_desktop_entry(&path, &now) {
                            let exec_key = game.executable_path.clone().unwrap_or_default();
                            let title_key = game.title.to_lowercase();
                            if !seen_execs.contains(&exec_key) && !seen_titles.contains(&title_key) {
                                seen_execs.insert(exec_key);
                                seen_titles.insert(title_key);
                                games.push(game);
                            }
                        }
                    }
                }
            }
        }

        games.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
        Ok(games)
    }

    /// Parses a single Linux .desktop file into a candidate Game struct if relevant
    fn parse_desktop_entry(path: &Path, now: &str) -> Option<Game> {
        let content = fs::read_to_string(path).ok()?;

        let mut in_desktop_entry = false;
        let mut name: Option<String> = None;
        let mut generic_name: Option<String> = None;
        let mut comment: Option<String> = None;
        let mut exec: Option<String> = None;
        let mut icon: Option<String> = None;
        let mut categories: Vec<String> = Vec::new();
        let mut entry_type: Option<String> = None;
        let mut no_display = false;
        let mut path_workdir: Option<String> = None;

        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with('#') {
                continue;
            }
            if trimmed.starts_with('[') && trimmed.ends_with(']') {
                in_desktop_entry = trimmed == "[Desktop Entry]";
                continue;
            }
            if !in_desktop_entry {
                continue;
            }
            if let Some((key, val)) = trimmed.split_once('=') {
                let k = key.trim();
                let v = val.trim();
                match k {
                    "Type" => entry_type = Some(v.to_string()),
                    "Name" => {
                        if name.is_none() {
                            name = Some(v.to_string());
                        }
                    }
                    "GenericName" => {
                        if generic_name.is_none() {
                            generic_name = Some(v.to_string());
                        }
                    }
                    "Comment" => {
                        if comment.is_none() {
                            comment = Some(v.to_string());
                        }
                    }
                    "Exec" => {
                        if exec.is_none() {
                            exec = Some(v.to_string());
                        }
                    }
                    "Icon" => {
                        if icon.is_none() {
                            icon = Some(v.to_string());
                        }
                    }
                    "Path" => {
                        if path_workdir.is_none() {
                            path_workdir = Some(v.to_string());
                        }
                    }
                    "NoDisplay" => no_display = v.eq_ignore_ascii_case("true"),
                    "Categories" => {
                        categories = v
                            .split(';')
                            .map(|s| s.trim().to_string())
                            .filter(|s| !s.is_empty())
                            .collect();
                    }
                    _ => {}
                }
            }
        }

        // Must be an Application
        if entry_type.as_deref() != Some("Application") {
            return None;
        }

        // Skip hidden/internal desktop entries (e.g. URL scheme handlers, KDE kcm settings modules)
        if no_display {
            return None;
        }

        let raw_name = name?;
        let raw_exec = exec?;

        // Filter: We prioritize games, launchers, emulators, and gaming utilities
        let lower_name = raw_name.to_lowercase();
        let lower_exec = raw_exec.to_lowercase();

        // Exclude system settings panels and file managers
        if lower_exec.starts_with("systemsettings")
            || lower_exec.contains("xwayland")
            || categories.iter().any(|c| c.eq_ignore_ascii_case("FileManager"))
        {
            return None;
        }

        let is_game_category = categories.iter().any(|c| {
            let cl = c.to_lowercase();
            cl.contains("game") || cl == "emulator" || cl == "simulation"
        });

        let known_gaming_keywords = [
            "prismlauncher", "prism launcher", "minecraft", "steam", "heroic",
            "lutris", "bottles", "retroarch", "rpcs3", "pcsx2", "dolphin-emu",
            "ryujinx", "yuzu", "cemu", "duckstation", "ppsspp", "itch",
            "minigalaxy", "openmw", "vinegar", "sober", "protonplus", "goverlay"
        ];
        let is_known_tool = known_gaming_keywords.iter().any(|&k| {
            lower_name.contains(k) || lower_exec.contains(k)
        });

        if !is_game_category && !is_known_tool {
            return None;
        }

        // Clean Exec command and resolve full path & working directory
        let cleaned_exec = Self::clean_desktop_exec(&raw_exec);
        if cleaned_exec.is_empty() {
            return None;
        }

        let (final_exec, final_workdir, final_args) =
            if let Some((resolved_bin, extra_args)) = crate::launcher::resolve_executable_command(&cleaned_exec) {
                let bin_str = resolved_bin.to_string_lossy().to_string();
                let dir_opt = path_workdir.or_else(|| {
                    resolved_bin.parent().map(|p| p.to_string_lossy().to_string())
                });
                let args_opt = if extra_args.is_empty() {
                    None
                } else {
                    Some(extra_args.join(" "))
                };
                (bin_str, dir_opt, args_opt)
            } else {
                (cleaned_exec, path_workdir, None)
            };

        // Resolve icon
        let resolved_icon = icon.as_deref().and_then(Self::resolve_system_icon);

        let id = format!("local_desktop_{}", uuid::Uuid::new_v4().simple());

        Some(Game {
            id,
            title: raw_name,
            source: "Local".to_string(),
            executable_path: Some(final_exec),
            install_directory: final_workdir,
            launch_arguments: final_args,
            icon_image: resolved_icon.clone(),
            cover_image: resolved_icon,
            description: comment.or(generic_name),
            is_installed: true,
            platforms: vec!["PC (Linux)".to_string()],
            genres: categories,
            date_added: Some(now.to_string()),
            completion_status: Some("Auto".to_string()),
            ..Default::default()
        })
    }

    /// Strips XDG field codes (%u, %U, %f, %F, %k, @@u %u @@, etc.) from an Exec string
    fn clean_desktop_exec(raw_exec: &str) -> String {
        let re_codes = Regex::new(r"@@[^@]*@@|%[a-zA-Z0-9]").unwrap();
        let cleaned = re_codes.replace_all(raw_exec, "").trim().to_string();
        // Collapse multiple spaces
        let words: Vec<&str> = cleaned.split_whitespace().collect();
        words.join(" ")
    }

    /// Resolves an XDG icon name into a readable image file path
    fn resolve_system_icon(icon_name: &str) -> Option<String> {
        let trimmed = icon_name.trim();
        if trimmed.is_empty() {
            return None;
        }
        // Direct absolute path
        if trimmed.starts_with('/') {
            let p = Path::new(trimmed);
            if p.is_file() {
                return Some(trimmed.to_string());
            }
        }

        let exts = ["png", "svg", "xpm"];

        let search_dirs = [
            "/usr/share/icons/hicolor/256x256/apps",
            "/usr/share/icons/hicolor/128x128/apps",
            "/usr/share/icons/hicolor/96x96/apps",
            "/usr/share/icons/hicolor/64x64/apps",
            "/usr/share/icons/hicolor/48x48/apps",
            "/usr/share/icons/hicolor/scalable/apps",
            "/usr/share/pixmaps",
            "/usr/share/icons/Papirus/64x64/apps",
            "/usr/share/icons/Papirus/48x48/apps",
            "/usr/share/icons/breeze/apps/48",
        ];

        for dir in &search_dirs {
            for ext in &exts {
                let candidate = PathBuf::from(dir).join(format!("{}.{}", trimmed, ext));
                if candidate.is_file() {
                    return Some(candidate.to_string_lossy().to_string());
                }
            }
            let direct = PathBuf::from(dir).join(trimmed);
            if direct.is_file() {
                return Some(direct.to_string_lossy().to_string());
            }
        }

        let flatpak_icon_dir = Path::new("/var/lib/flatpak/exports/share/icons/hicolor/256x256/apps");
        for ext in &exts {
            let candidate = flatpak_icon_dir.join(format!("{}.{}", trimmed, ext));
            if candidate.is_file() {
                return Some(candidate.to_string_lossy().to_string());
            }
        }

        None
    }
}
