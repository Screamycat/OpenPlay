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
        if generic_names.iter().any(|&g| lower == g || lower.starts_with(g) && lower.len() <= g.len() + 3) {
            if let Some(parent) = path.parent() {
                let p_stem = parent.file_stem().and_then(|s| s.to_str()).unwrap_or("");
                // If parent is "bin" or "binaries" or "win64", go one higher
                let p_lower = p_stem.to_lowercase();
                if p_lower == "bin" || p_lower == "binaries" || p_lower == "win64" || p_lower == "x64" || p_lower == "win32" {
                    if let Some(grandparent) = parent.parent() {
                        let gp_stem = grandparent.file_stem().and_then(|s| s.to_str()).unwrap_or(file_stem);
                        return Self::format_raw_title(gp_stem);
                    }
                }
                if !p_stem.is_empty() {
                    return Self::format_raw_title(p_stem);
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
            platforms: vec!["Windows".to_string()],
            community_score: None,
            critic_score: None,
            user_rating: None,
            playtime_seconds: 0,
            last_played: None,
            date_added: Some(now),
            completion_status: Some("Not Played".to_string()),
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
                    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                        if ext.eq_ignore_ascii_case("exe") {
                            let name = path.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
                            if !ignored_keywords.iter().any(|&k| name.contains(k)) {
                                results.push(path);
                            }
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
}
