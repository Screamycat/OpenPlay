use crate::models::{DiscoveredRom, EmulatorProfile, InstalledEmulatorApp, ResolvedEmulatorTarget};
use std::fs;
use std::path::{Path, PathBuf};

pub struct EmulatorService;

impl EmulatorService {
    /// Return standard built-in emulator presets
    pub fn get_presets() -> Vec<EmulatorProfile> {
        vec![
            EmulatorProfile {
                id: "retroarch".to_string(),
                name: "RetroArch".to_string(),
                emulator_type: "retroarch".to_string(),
                executable_path: String::new(),
                arguments_template: "-L \"cores/{core}\" \"{rom_path}\"".to_string(),
                selected_core: None,
                supported_platforms: vec![
                    "Super Nintendo".to_string(),
                    "Nintendo Entertainment System".to_string(),
                    "Game Boy Advance".to_string(),
                    "Game Boy Color".to_string(),
                    "Game Boy".to_string(),
                    "Nintendo 64".to_string(),
                    "Sega Genesis".to_string(),
                    "Sony PlayStation".to_string(),
                    "Nintendo DS".to_string(),
                    "Arcade".to_string(),
                ],
                is_installed: false,
            },
            EmulatorProfile {
                id: "dolphin".to_string(),
                name: "Dolphin Emulator".to_string(),
                emulator_type: "standalone".to_string(),
                executable_path: String::new(),
                arguments_template: "-b -e \"{rom_path}\"".to_string(),
                selected_core: None,
                supported_platforms: vec![
                    "Nintendo GameCube".to_string(),
                    "Nintendo Wii".to_string(),
                ],
                is_installed: false,
            },
            EmulatorProfile {
                id: "pcsx2".to_string(),
                name: "PCSX2".to_string(),
                emulator_type: "standalone".to_string(),
                executable_path: String::new(),
                arguments_template: "-batch -fullscreen \"{rom_path}\"".to_string(),
                selected_core: None,
                supported_platforms: vec!["Sony PlayStation 2".to_string()],
                is_installed: false,
            },
            EmulatorProfile {
                id: "duckstation".to_string(),
                name: "DuckStation".to_string(),
                emulator_type: "standalone".to_string(),
                executable_path: String::new(),
                arguments_template: "-batch \"{rom_path}\"".to_string(),
                selected_core: None,
                supported_platforms: vec!["Sony PlayStation".to_string()],
                is_installed: false,
            },
            EmulatorProfile {
                id: "rpcs3".to_string(),
                name: "RPCS3".to_string(),
                emulator_type: "standalone".to_string(),
                executable_path: String::new(),
                arguments_template: "\"{rom_path}\"".to_string(),
                selected_core: None,
                supported_platforms: vec!["Sony PlayStation 3".to_string()],
                is_installed: false,
            },
            EmulatorProfile {
                id: "ppsspp".to_string(),
                name: "PPSSPP".to_string(),
                emulator_type: "standalone".to_string(),
                executable_path: String::new(),
                arguments_template: "\"{rom_path}\"".to_string(),
                selected_core: None,
                supported_platforms: vec!["Sony PlayStation Portable".to_string()],
                is_installed: false,
            },
            EmulatorProfile {
                id: "mgba".to_string(),
                name: "mGBA".to_string(),
                emulator_type: "standalone".to_string(),
                executable_path: String::new(),
                arguments_template: "\"{rom_path}\"".to_string(),
                selected_core: None,
                supported_platforms: vec![
                    "Game Boy Advance".to_string(),
                    "Game Boy Color".to_string(),
                    "Game Boy".to_string(),
                ],
                is_installed: false,
            },
            EmulatorProfile {
                id: "cemu".to_string(),
                name: "Cemu".to_string(),
                emulator_type: "standalone".to_string(),
                executable_path: String::new(),
                arguments_template: "-g \"{rom_path}\"".to_string(),
                selected_core: None,
                supported_platforms: vec!["Nintendo Wii U".to_string()],
                is_installed: false,
            },
            EmulatorProfile {
                id: "ryujinx".to_string(),
                name: "Ryujinx".to_string(),
                emulator_type: "standalone".to_string(),
                executable_path: String::new(),
                arguments_template: "\"{rom_path}\"".to_string(),
                selected_core: None,
                supported_platforms: vec!["Nintendo Switch".to_string()],
                is_installed: false,
            },
            EmulatorProfile {
                id: "citra".to_string(),
                name: "Citra / Lime3DS".to_string(),
                emulator_type: "standalone".to_string(),
                executable_path: String::new(),
                arguments_template: "\"{rom_path}\"".to_string(),
                selected_core: None,
                supported_platforms: vec!["Nintendo 3DS".to_string()],
                is_installed: false,
            },
        ]
    }

    /// Scan a specific console's ROM directory for games matching its supported extensions
    pub fn scan_console_roms(
        dir_path: &str,
        console_id: &str,
        console_name: &str,
        extensions: &[String],
    ) -> Result<Vec<DiscoveredRom>, String> {
        let root = Path::new(dir_path);
        if !root.is_dir() {
            return Err(format!("Directory does not exist: {}", dir_path));
        }

        let mut discovered = Vec::new();
        Self::scan_console_recursive(root, 0, console_id, console_name, extensions, &mut discovered);

        discovered.sort_by(|a, b| a.clean_title.to_lowercase().cmp(&b.clean_title.to_lowercase()));
        Ok(discovered)
    }

    /// Detect if a file is an update file, DLC, patch, or non-base game asset
    pub fn is_update_or_dlc_file(path: &Path, file_name: &str) -> bool {
        let path_lower = path.to_string_lossy().to_lowercase();
        let name_lower = file_name.to_lowercase();

        // 1. Check folder path components for DLC, Update, or Patch folders
        if path_lower.contains(r"\dlc\")
            || path_lower.contains(r"\dlcs\")
            || path_lower.contains(r"\updates\")
            || path_lower.contains(r"\update\")
            || path_lower.contains(r"\patches\")
            || path_lower.contains(r"\patch\")
            || path_lower.contains("/dlc/")
            || path_lower.contains("/dlcs/")
            || path_lower.contains("/updates/")
            || path_lower.contains("/update/")
            || path_lower.contains("/patches/")
            || path_lower.contains("/patch/")
        {
            return true;
        }

        // 2. Explicit DLC or Update keywords in brackets or parentheses
        if name_lower.contains("[dlc")
            || name_lower.contains("(dlc")
            || name_lower.contains("[upd")
            || name_lower.contains("(upd")
            || name_lower.contains("[update")
            || name_lower.contains("(update")
            || name_lower.contains("[patch")
            || name_lower.contains("(patch")
        {
            return true;
        }

        // 3. Nintendo Switch Title ID convention:
        // Base games end in [0100...000]
        // Updates end in [0100...800]
        // DLCs end in [0100...XYZ] where XYZ != 000 and XYZ != 800
        if let Some(start_idx) = name_lower.find("[0100") {
            if let Some(end_idx) = name_lower[start_idx..].find(']') {
                let tid = &name_lower[start_idx + 1..start_idx + end_idx];
                if tid.len() == 16 {
                    if tid.ends_with("800") {
                        // Switch official update
                        return true;
                    } else if !tid.ends_with("000") && (name_lower.contains("[v") || name_lower.contains("dlc") || path_lower.contains("dlc")) {
                        // Switch official DLC
                        return true;
                    }
                }
            }
        }

        // 4. Switch version tag check: [vXXXXX] where XXXXX is a non-zero version number
        // (Base games are [v0] or [v1.0.0])
        if let Some(v_start) = name_lower.find("[v") {
            if let Some(v_end) = name_lower[v_start..].find(']') {
                let v_str = &name_lower[v_start + 2..v_start + v_end];
                if let Ok(ver) = v_str.parse::<u64>() {
                    if ver > 0 {
                        return true;
                    }
                }
            }
        }

        false
    }

    fn scan_console_recursive(
        dir: &Path,
        depth: usize,
        console_id: &str,
        console_name: &str,
        extensions: &[String],
        discovered: &mut Vec<DiscoveredRom>,
    ) {
        if depth > 12 {
            return;
        }

        let entries = match fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };

        let mut files = Vec::new();
        let mut subdirs = Vec::new();

        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                subdirs.push(p);
            } else if p.is_file() {
                files.push(p);
            }
        }

        // Check if directory contains .cue or .m3u playlist files
        let has_cue_or_m3u = files.iter().any(|f| {
            f.extension()
                .and_then(|e| e.to_str())
                .map(|ext| ext.eq_ignore_ascii_case("cue") || ext.eq_ignore_ascii_case("m3u"))
                .unwrap_or(false)
        });

        let ext_set: Vec<String> = extensions
            .iter()
            .map(|e| e.to_lowercase().trim_start_matches('.').to_string())
            .collect();

        for file in &files {
            let ext = file
                .extension()
                .and_then(|e| e.to_str())
                .map(|s| s.to_lowercase())
                .unwrap_or_default();

            // Suppress multi-track .bin files when .cue or .m3u exists
            if ext == "bin" && has_cue_or_m3u {
                continue;
            }

            // Check if extension is allowed
            let is_matched = if ext_set.is_empty() {
                matches!(
                    ext.as_str(),
                    "sfc"
                        | "smc"
                        | "nes"
                        | "gba"
                        | "gbc"
                        | "gb"
                        | "z64"
                        | "n64"
                        | "v64"
                        | "nds"
                        | "3ds"
                        | "cia"
                        | "nsp"
                        | "xci"
                        | "wbfs"
                        | "gcm"
                        | "rvz"
                        | "md"
                        | "gen"
                        | "smd"
                        | "iso"
                        | "cso"
                        | "chd"
                        | "cue"
                        | "m3u"
                        | "zip"
                        | "7z"
                )
            } else {
                ext_set.contains(&ext)
            };

            if !is_matched {
                continue;
            }

            let file_name = file
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();

            if file_name.starts_with('.')
                || file_name.ends_with(".log")
                || file_name.ends_with(".txt")
                || file_name.ends_with(".lua")
                || file_name.ends_with(".sav")
                || file_name.ends_with(".srm")
                || file_name.ends_with(".meta")
            {
                continue;
            }

            // Filter out update files and DLCs so only base games are added
            if Self::is_update_or_dlc_file(file, &file_name) {
                continue;
            }

            let clean_title = Self::clean_rom_title(&file_name);
            let file_size_bytes = fs::metadata(file).map(|m| m.len()).unwrap_or(0);
            let local_cover_path = Self::find_local_cover_art(file);

            discovered.push(DiscoveredRom {
                file_path: file.to_string_lossy().to_string(),
                file_name,
                clean_title,
                platform: console_name.to_string(),
                suggested_emulator_id: Some(console_id.to_string()),
                file_size_bytes,
                local_cover_path,
            });
        }

        for sub in subdirs {
            Self::scan_console_recursive(&sub, depth + 1, console_id, console_name, extensions, discovered);
        }
    }

    /// Parse `libretro_directory = "..."` from a `retroarch.cfg` file if present
    fn parse_retroarch_cfg_cores_dir(cfg_path: &Path, relative_base: Option<&Path>) -> Option<PathBuf> {
        let content = fs::read_to_string(cfg_path).ok()?;
        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with('#') {
                continue;
            }
            if let Some(rest) = trimmed.strip_prefix("libretro_directory") {
                let rest = rest.trim();
                if let Some(val_raw) = rest.strip_prefix('=') {
                    let val = val_raw.trim().trim_matches('"').trim_matches('\'').trim();
                    if val.is_empty() || val.eq_ignore_ascii_case("default") {
                        return None;
                    }
                    if let Some(stripped) = val.strip_prefix("~/") {
                        if let Some(home) = dirs::home_dir() {
                            return Some(home.join(stripped));
                        }
                    } else if let Some(stripped) = val.strip_prefix(":/") {
                        if let Some(base) = relative_base.or_else(|| cfg_path.parent()) {
                            return Some(base.join(stripped));
                        }
                    } else {
                        return Some(PathBuf::from(val));
                    }
                }
            }
        }
        None
    }

    /// Collect candidate RetroArch Libretro core directories in priority order for the given installation path/command
    pub fn get_retroarch_cores_dirs(retroarch_path: &str) -> Vec<PathBuf> {
        let mut cores_dirs: Vec<PathBuf> = Vec::new();
        let mut push_unique = |p: PathBuf| {
            if !cores_dirs.contains(&p) {
                cores_dirs.push(p);
            }
        };

        let trimmed = retroarch_path.trim();
        let path = Path::new(trimmed);
        if !trimmed.is_empty() {
            let base_dir = if path.is_file() {
                path.parent()
            } else if path.is_dir() {
                Some(path)
            } else {
                None
            };
            if let Some(b) = base_dir {
                if !b.as_os_str().is_empty() {
                    push_unique(b.join("cores"));
                    if let Some(cfg_dir) = Self::parse_retroarch_cfg_cores_dir(&b.join("retroarch.cfg"), Some(b)) {
                        push_unique(cfg_dir);
                    }
                }
            }
        }

        #[cfg(target_os = "windows")]
        {
            if let Ok(appdata) = std::env::var("APPDATA") {
                let ra_dir = PathBuf::from(appdata).join("RetroArch");
                if let Some(cfg_dir) = Self::parse_retroarch_cfg_cores_dir(&ra_dir.join("retroarch.cfg"), Some(&ra_dir)) {
                    push_unique(cfg_dir);
                }
                push_unique(ra_dir.join("cores"));
            }
        }

        #[cfg(target_os = "linux")]
        {
            let lower = trimmed.to_lowercase();
            let is_flatpak = lower.contains("org.libretro.retroarch") || lower.contains("flatpak");
            let is_snap = lower.contains("snap");

            if let Some(home) = dirs::home_dir() {
                let flatpak_cfg_dir = home.join(".var/app/org.libretro.RetroArch/config/retroarch");
                let native_cfg_dir = home.join(".config/retroarch");
                let snap_cfg_dir = home.join("snap/retroarch/current/.config/retroarch");

                if is_flatpak {
                    if let Some(cfg_dir) = Self::parse_retroarch_cfg_cores_dir(
                        &flatpak_cfg_dir.join("retroarch.cfg"),
                        Some(&flatpak_cfg_dir),
                    ) {
                        push_unique(cfg_dir);
                    }
                    push_unique(flatpak_cfg_dir.join("cores"));
                    push_unique(home.join(".local/share/flatpak/app/org.libretro.RetroArch/current/active/files/lib/libretro"));
                    push_unique(PathBuf::from("/var/lib/flatpak/app/org.libretro.RetroArch/current/active/files/lib/libretro"));
                }

                if is_snap {
                    if let Some(cfg_dir) = Self::parse_retroarch_cfg_cores_dir(
                        &snap_cfg_dir.join("retroarch.cfg"),
                        Some(&snap_cfg_dir),
                    ) {
                        push_unique(cfg_dir);
                    }
                    push_unique(snap_cfg_dir.join("cores"));
                }

                if let Some(cfg_dir) = Self::parse_retroarch_cfg_cores_dir(
                    &native_cfg_dir.join("retroarch.cfg"),
                    Some(&native_cfg_dir),
                ) {
                    push_unique(cfg_dir);
                }
                push_unique(native_cfg_dir.join("cores"));
                push_unique(home.join(".local/share/retroarch/cores"));

                // Also check Flatpak user cores as fallback if not already checked above
                if !is_flatpak {
                    push_unique(flatpak_cfg_dir.join("cores"));
                }
            }

            // System-installed libretro core packages (pacman, apt, dnf, zypper, etc.)
            for sys_dir in [
                "/usr/lib/libretro",
                "/usr/lib64/libretro",
                "/usr/lib/x86_64-linux-gnu/libretro",
                "/usr/lib/aarch64-linux-gnu/libretro",
                "/usr/local/lib/libretro",
                "/usr/share/libretro/cores",
            ] {
                push_unique(PathBuf::from(sys_dir));
            }
        }

        cores_dirs
    }

    /// Scan a RetroArch installation (portable, system, Flatpak, or Snap) for installed Libretro cores
    pub fn scan_retroarch_cores(retroarch_path: &str) -> Vec<String> {
        let mut cores = Vec::new();
        let is_windows_exe = retroarch_path.trim().to_lowercase().ends_with(".exe");
        let cores_dirs = Self::get_retroarch_cores_dirs(retroarch_path);

        for cdir in cores_dirs {
            if cdir.is_dir() {
                if let Ok(entries) = fs::read_dir(cdir) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        if p.is_file() {
                            let name = p.file_name().unwrap_or_default().to_string_lossy().to_string();
                            let lower = name.to_lowercase();
                            let valid_ext = if cfg!(target_os = "windows") || is_windows_exe {
                                lower.ends_with(".dll")
                            } else if cfg!(target_os = "macos") {
                                lower.ends_with(".dylib") || lower.ends_with(".so")
                            } else {
                                lower.ends_with(".so")
                            };
                            if lower.contains("_libretro") && valid_ext && !cores.contains(&name) {
                                cores.push(name);
                            }
                        }
                    }
                }
            }
        }

        cores.sort();
        cores
    }

    /// Resolve a Libretro core filename (or absolute path) to its actual file path on disk
    pub fn resolve_retroarch_core_path(retroarch_path: &str, core_name: &str) -> Option<PathBuf> {
        let trimmed = core_name.trim().trim_matches('"').trim_matches('\'');
        if trimmed.is_empty() {
            return None;
        }

        let direct = PathBuf::from(trimmed);
        if direct.is_file() {
            return Some(direct);
        }

        let is_windows_exe = retroarch_path.trim().to_lowercase().ends_with(".exe");
        let prefer_dll = cfg!(target_os = "windows") || is_windows_exe;
        let preferred_ext = if prefer_dll { "dll" } else { "so" };

        let mut candidates: Vec<String> = Vec::new();
        let file_only = Path::new(trimmed)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(trimmed);
        candidates.push(file_only.to_string());

        let lower = file_only.to_lowercase();
        if prefer_dll && lower.ends_with(".so") {
            let swapped = format!("{}.dll", &file_only[..file_only.len() - 3]);
            candidates.push(swapped);
        } else if !prefer_dll && lower.ends_with(".dll") {
            let swapped = format!("{}.so", &file_only[..file_only.len() - 4]);
            candidates.push(swapped);
        } else if !lower.ends_with(".so") && !lower.ends_with(".dll") && !lower.ends_with(".dylib") {
            candidates.push(format!("{}.{}", file_only, preferred_ext));
            if !lower.ends_with("_libretro") {
                candidates.push(format!("{}_libretro.{}", file_only, preferred_ext));
            }
        }

        let cores_dirs = Self::get_retroarch_cores_dirs(retroarch_path);
        for cdir in cores_dirs {
            if !cdir.is_dir() {
                continue;
            }
            for cand in &candidates {
                let full = cdir.join(cand);
                if full.is_file() {
                    return Some(full);
                }
            }
        }

        None
    }

    /// Tokenize a Linux .desktop Exec= line respecting single and double quotes
    fn tokenize_desktop_exec(raw: &str) -> Vec<String> {
        let mut tokens = Vec::new();
        let mut current = String::new();
        let mut in_quote: Option<char> = None;
        let mut chars = raw.chars().peekable();

        while let Some(c) = chars.next() {
            if let Some(q) = in_quote {
                if c == '\\' && q == '"' {
                    if let Some(next_c) = chars.next() {
                        current.push(next_c);
                    }
                } else if c == q {
                    in_quote = None;
                } else {
                    current.push(c);
                }
            } else if c == '"' || c == '\'' {
                in_quote = Some(c);
            } else if c.is_whitespace() {
                if !current.is_empty() {
                    tokens.push(std::mem::take(&mut current));
                }
            } else {
                current.push(c);
            }
        }
        if !current.is_empty() {
            tokens.push(current);
        }
        tokens
    }

    /// Parse a Linux `.desktop` file into `(display_name, clean_exec_command, optional_flatpak_app_id)`
    pub fn parse_desktop_exec_command(desktop_path: &Path) -> Option<(String, String, Option<String>)> {
        let content = fs::read_to_string(desktop_path).ok()?;
        let mut in_desktop_entry = false;
        let mut name: Option<String> = None;
        let mut exec: Option<String> = None;
        let mut x_flatpak: Option<String> = None;
        let mut entry_type: Option<String> = None;
        let mut no_display = false;

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
                    "Name" if name.is_none() => name = Some(v.to_string()),
                    "Exec" if exec.is_none() => exec = Some(v.to_string()),
                    "X-Flatpak" if x_flatpak.is_none() => x_flatpak = Some(v.to_string()),
                    "NoDisplay" => no_display = v.eq_ignore_ascii_case("true"),
                    _ => {}
                }
            }
        }

        if entry_type.as_deref() != Some("Application") || no_display {
            return None;
        }

        let display_name = name.unwrap_or_else(|| {
            desktop_path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Emulator")
                .to_string()
        });
        let raw_exec = exec?;
        let tokens = Self::tokenize_desktop_exec(&raw_exec);
        if tokens.is_empty() {
            return None;
        }

        let first_bin = Path::new(&tokens[0])
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(&tokens[0])
            .to_lowercase();

        // Normalize Flatpak desktop Exec lines into clean `flatpak run <app-id>`
        if first_bin == "flatpak" && tokens.iter().any(|t| t == "run") {
            let run_idx = tokens.iter().position(|t| t == "run").unwrap_or(0);
            let detected_app_id = x_flatpak.clone().or_else(|| {
                tokens[run_idx + 1..]
                    .iter()
                    .find(|t| !t.starts_with('-') && !t.starts_with("@@") && !t.starts_with('%'))
                    .cloned()
            });
            if let Some(app_id) = detected_app_id {
                return Some((display_name, format!("flatpak run {}", app_id), Some(app_id)));
            }
        }

        // Clean XDG field codes (%u, %U, %f, %F, %i, %c, %k, etc.) and @@ markers
        let mut clean_tokens: Vec<String> = Vec::new();
        for tok in tokens {
            if tok == "@@" || tok == "@@u" || tok.starts_with('%') {
                continue;
            }
            if tok.contains(' ') {
                clean_tokens.push(format!("\"{}\"", tok));
            } else {
                clean_tokens.push(tok);
            }
        }

        if clean_tokens.is_empty() {
            return None;
        }

        Some((display_name, clean_tokens.join(" "), x_flatpak))
    }

    /// Resolve a user-selected file path (converting Linux `.desktop` files into clean launch commands)
    pub fn resolve_emulator_target(path_str: &str) -> ResolvedEmulatorTarget {
        let trimmed = path_str.trim();
        if trimmed.to_lowercase().ends_with(".desktop") {
            let p = Path::new(trimmed);
            if p.is_file() {
                if let Some((name, cmd, _)) = Self::parse_desktop_exec_command(p) {
                    return ResolvedEmulatorTarget {
                        command: cmd,
                        name: Some(name),
                    };
                }
            }
        }
        ResolvedEmulatorTarget {
            command: trimmed.to_string(),
            name: None,
        }
    }

    /// List installed Linux emulators from Flatpak, Snap, and system `.desktop` entries (on-demand user picker)
    pub fn list_installed_linux_emulators() -> Vec<InstalledEmulatorApp> {
        #[cfg(not(target_os = "linux"))]
        {
            Vec::new()
        }

        #[cfg(target_os = "linux")]
        {
            use std::collections::HashSet;

            let mut results: Vec<InstalledEmulatorApp> = Vec::new();
            let mut seen_commands: HashSet<String> = HashSet::new();

            let mut app_dirs: Vec<(PathBuf, &str)> = vec![
                (PathBuf::from("/var/lib/flatpak/exports/share/applications"), "Flatpak"),
                (PathBuf::from("/var/lib/snapd/desktop/applications"), "Snap"),
                (PathBuf::from("/usr/local/share/applications"), "System"),
                (PathBuf::from("/usr/share/applications"), "System"),
            ];

            if let Some(home) = dirs::home_dir() {
                app_dirs.insert(1, (home.join(".local/share/flatpak/exports/share/applications"), "Flatpak"));
                app_dirs.push((home.join(".local/share/applications"), "System"));
            }

            if let Ok(xdg_dirs) = std::env::var("XDG_DATA_DIRS") {
                for base in xdg_dirs.split(':').filter(|s| !s.trim().is_empty()) {
                    let apps_dir = PathBuf::from(base).join("applications");
                    if !app_dirs.iter().any(|(existing, _)| existing == &apps_dir) {
                        let label = if base.contains("flatpak") {
                            "Flatpak"
                        } else if base.contains("snap") {
                            "Snap"
                        } else {
                            "System"
                        };
                        app_dirs.push((apps_dir, label));
                    }
                }
            }

            let emulator_keywords = [
                "retroarch", "dolphin-emu", "dolphin emulator", "org.dolphinemu",
                "pcsx2", "duckstation", "rpcs3", "ppsspp",
                "vita3k", "mgba", "melonds", "desmume", "citra", "lime3ds", "azahar",
                "panda3ds", "cemu", "ryujinx", "yuzu", "suyu", "sudachi", "eden",
                "citron", "snes9x", "bsnes", "ares", "mesen", "fceux", "rmg",
                "mupen", "simple64", "sameboy", "vbam", "visualboy", "flycast",
                "redream", "mednafen", "yabasanshiro", "blastem", "xemu", "xenia",
                "mame", "fbneo", "stella", "epsxe", "scummvm", "dosbox", "shadps4",
                "openmsx", "hatari", "vice", "fs-uae", "amiberry", "bizhawk",
                "gopher64", "project64", "kega", "emulator",
            ];

            for (dir, source_label) in app_dirs {
                if !dir.is_dir() {
                    continue;
                }
                let Ok(entries) = fs::read_dir(&dir) else {
                    continue;
                };
                for entry in entries.flatten() {
                    let p = entry.path();
                    if !p.is_file() || p.extension().and_then(|e| e.to_str()) != Some("desktop") {
                        continue;
                    }
                    let Ok(content) = fs::read_to_string(&p) else {
                        continue;
                    };

                    let mut categories_lower = String::new();
                    for line in content.lines() {
                        let t = line.trim();
                        if let Some(cats) = t.strip_prefix("Categories=") {
                            categories_lower = cats.to_lowercase();
                            break;
                        }
                    }

                    // Exclude file managers (e.g. KDE Dolphin File Manager) and system utilities
                    if categories_lower.contains("filemanager")
                        || categories_lower.contains("webbrowser")
                        || categories_lower.contains("texteditor")
                    {
                        continue;
                    }

                    let Some((name, command, app_id)) = Self::parse_desktop_exec_command(&p) else {
                        continue;
                    };

                    let hay = format!(
                        "{} {} {}",
                        name.to_lowercase(),
                        command.to_lowercase(),
                        app_id.as_deref().unwrap_or("").to_lowercase()
                    );

                    let is_emulator = categories_lower.contains("emulator")
                        || emulator_keywords.iter().any(|k| hay.contains(k));

                    if !is_emulator {
                        continue;
                    }

                    let cmd_key = command.to_lowercase();
                    if seen_commands.contains(&cmd_key) {
                        continue;
                    }
                    seen_commands.insert(cmd_key);

                    let effective_source = if app_id.is_some() || command.to_lowercase().starts_with("flatpak ") {
                        "Flatpak"
                    } else if command.to_lowercase().contains("snap") {
                        "Snap"
                    } else {
                        source_label
                    };

                    results.push(InstalledEmulatorApp {
                        name,
                        command,
                        source: effective_source.to_string(),
                        desktop_file: Some(p.to_string_lossy().to_string()),
                        app_id,
                    });
                }
            }

            // Fallback: also query `flatpak list --app` in case Flatpak .desktop exports are in a non-standard path
            if let Ok(output) = std::process::Command::new("flatpak")
                .args(["list", "--app", "--columns=application,name"])
                .output()
            {
                if output.status.success() {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    for line in stdout.lines() {
                        let mut parts = line.splitn(2, '\t');
                        let app_id = parts.next().unwrap_or("").trim();
                        let app_name = parts.next().unwrap_or(app_id).trim();
                        if app_id.is_empty() {
                            continue;
                        }
                        let hay = format!("{} {}", app_id.to_lowercase(), app_name.to_lowercase());
                        if !emulator_keywords.iter().any(|k| hay.contains(k)) {
                            continue;
                        }
                        let command = format!("flatpak run {}", app_id);
                        let cmd_key = command.to_lowercase();
                        if seen_commands.contains(&cmd_key) {
                            continue;
                        }
                        seen_commands.insert(cmd_key);
                        results.push(InstalledEmulatorApp {
                            name: app_name.to_string(),
                            command,
                            source: "Flatpak".to_string(),
                            desktop_file: None,
                            app_id: Some(app_id.to_string()),
                        });
                    }
                }
            }

            results.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
            results
        }
    }

    /// Best matching default RetroArch core for a given platform
    pub fn get_default_retroarch_core_for_platform(platform: &str, available_cores: &[String]) -> Option<String> {
        let p_lower = platform.to_lowercase();
        let desired_candidates = if p_lower.contains("super nintendo") || p_lower.contains("snes") {
            vec!["snes9x_libretro", "bsnes_libretro"]
        } else if p_lower.contains("game boy advance") || p_lower.contains("gba") {
            vec!["mgba_libretro", "vba_next_libretro"]
        } else if p_lower.contains("game boy") {
            vec!["gambatte_libretro", "mgba_libretro"]
        } else if p_lower.contains("nintendo 64") || p_lower.contains("n64") {
            vec!["mupen64plus_next_libretro", "parallel_n64_libretro"]
        } else if p_lower.contains("playstation") || p_lower.contains("ps1") || p_lower.contains("psx") {
            vec!["beetle_psx_hw_libretro", "swanstation_libretro", "pcsx_rearmed_libretro"]
        } else if p_lower.contains("genesis") || p_lower.contains("mega drive") || p_lower.contains("sega") {
            vec!["genesis_plus_gx_libretro", "picodrive_libretro"]
        } else if p_lower.contains("nes") || p_lower.contains("nintendo entertainment") {
            vec!["mesen_libretro", "fceumm_libretro", "nestopia_libretro"]
        } else if p_lower.contains("ds") {
            vec!["melonds_libretro", "desmume_libretro"]
        } else {
            vec![]
        };

        for candidate in desired_candidates {
            if let Some(found) = available_cores.iter().find(|c| c.to_lowercase().contains(candidate)) {
                return Some(found.clone());
            }
        }

        None
    }

    /// Clean ROM title by removing standard release / dumps tags like (USA), [!], (Rev 1)
    pub fn clean_rom_title(filename_with_ext: &str) -> String {
        let stem = Path::new(filename_with_ext)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(filename_with_ext);

        let mut cleaned = stem.to_string();

        // Remove bracketed and parenthesized tags: e.g. (USA), (En,Fr,De), [!], (Rev 1), (Beta), [T-En]
        let mut in_paren = 0;
        let mut in_bracket = 0;
        let mut result = String::with_capacity(cleaned.len());

        for c in cleaned.chars() {
            match c {
                '(' => in_paren += 1,
                ')' => {
                    if in_paren > 0 {
                        in_paren -= 1;
                    }
                }
                '[' => in_bracket += 1,
                ']' => {
                    if in_bracket > 0 {
                        in_bracket -= 1;
                    }
                }
                _ => {
                    if in_paren == 0 && in_bracket == 0 {
                        result.push(c);
                    }
                }
            }
        }

        cleaned = result;

        // Clean up multi-spaces, underscores to spaces, dashes at boundaries
        cleaned = cleaned.replace('_', " ");
        let words: Vec<&str> = cleaned.split_whitespace().collect();
        cleaned = words.join(" ");
        cleaned = cleaned.trim_end_matches('-').trim().to_string();

        if cleaned.is_empty() {
            stem.to_string()
        } else {
            cleaned
        }
    }

    /// Infer platform from file extension and directory context
    pub fn infer_platform(file_path: &Path) -> String {
        let ext = file_path
            .extension()
            .and_then(|e| e.to_str())
            .map(|s| s.to_lowercase())
            .unwrap_or_default();

        let parent_dir = file_path
            .parent()
            .and_then(|p| p.file_name())
            .and_then(|n| n.to_str())
            .map(|s| s.to_lowercase())
            .unwrap_or_default();

        match ext.as_str() {
            "sfc" | "smc" => "Super Nintendo".to_string(),
            "nes" => "Nintendo Entertainment System".to_string(),
            "gba" => "Game Boy Advance".to_string(),
            "gbc" => "Game Boy Color".to_string(),
            "gb" => "Game Boy".to_string(),
            "z64" | "n64" | "v64" => "Nintendo 64".to_string(),
            "nds" => "Nintendo DS".to_string(),
            "3ds" | "cia" => "Nintendo 3DS".to_string(),
            "nsp" | "xci" => "Nintendo Switch".to_string(),
            "wbfs" => "Nintendo Wii".to_string(),
            "gcm" => "Nintendo GameCube".to_string(),
            "rvz" => {
                if parent_dir.contains("wii") {
                    "Nintendo Wii".to_string()
                } else {
                    "Nintendo GameCube".to_string()
                }
            }
            "md" | "gen" | "smd" => "Sega Genesis".to_string(),
            "ps3" => "Sony PlayStation 3".to_string(),
            "iso" | "cso" => {
                if parent_dir.contains("ps2") || parent_dir.contains("playstation 2") {
                    "Sony PlayStation 2".to_string()
                } else if parent_dir.contains("psp") || parent_dir.contains("portable") {
                    "Sony PlayStation Portable".to_string()
                } else if parent_dir.contains("gamecube") || parent_dir.contains("gc") {
                    "Nintendo GameCube".to_string()
                } else if parent_dir.contains("wii") {
                    "Nintendo Wii".to_string()
                } else if parent_dir.contains("ps1") || parent_dir.contains("psx") || parent_dir.contains("playstation") {
                    "Sony PlayStation".to_string()
                } else {
                    "Sony PlayStation 2".to_string()
                }
            }
            "chd" | "cue" | "m3u" => {
                if parent_dir.contains("ps2") || parent_dir.contains("playstation 2") {
                    "Sony PlayStation 2".to_string()
                } else if parent_dir.contains("dreamcast") || parent_dir.contains("dc") {
                    "Sega Dreamcast".to_string()
                } else if parent_dir.contains("saturn") {
                    "Sega Saturn".to_string()
                } else {
                    "Sony PlayStation".to_string()
                }
            }
            _ => {
                // If zipped, check parent directory name
                if parent_dir.contains("snes") || parent_dir.contains("super nintendo") {
                    "Super Nintendo".to_string()
                } else if parent_dir.contains("gba") || parent_dir.contains("game boy advance") {
                    "Game Boy Advance".to_string()
                } else if parent_dir.contains("n64") || parent_dir.contains("nintendo 64") {
                    "Nintendo 64".to_string()
                } else if parent_dir.contains("nes") {
                    "Nintendo Entertainment System".to_string()
                } else if parent_dir.contains("genesis") || parent_dir.contains("megadrive") {
                    "Sega Genesis".to_string()
                } else {
                    "Retro".to_string()
                }
            }
        }
    }

    /// Smart scan of a ROM folder: ignores .bin multi-track junk, skips saves, extracts clean titles, and looks for local artwork
    pub fn scan_rom_directory(dir_path: &str, configured_emulators: &[EmulatorProfile]) -> Result<Vec<DiscoveredRom>, String> {
        let root = Path::new(dir_path);
        if !root.is_dir() {
            return Err(format!("Directory does not exist: {}", dir_path));
        }

        let mut discovered = Vec::new();
        Self::scan_recursive(root, 0, configured_emulators, &mut discovered);

        discovered.sort_by(|a, b| a.clean_title.to_lowercase().cmp(&b.clean_title.to_lowercase()));
        Ok(discovered)
    }

    fn scan_recursive(
        dir: &Path,
        depth: usize,
        configured_emulators: &[EmulatorProfile],
        discovered: &mut Vec<DiscoveredRom>,
    ) {
        if depth > 4 {
            return;
        }

        let entries = match fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };

        let mut files = Vec::new();
        let mut subdirs = Vec::new();

        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                subdirs.push(p);
            } else if p.is_file() {
                files.push(p);
            }
        }

        // Check if directory contains .cue or .m3u playlist files
        let has_cue_or_m3u = files.iter().any(|f| {
            f.extension()
                .and_then(|e| e.to_str())
                .map(|ext| ext.eq_ignore_ascii_case("cue") || ext.eq_ignore_ascii_case("m3u"))
                .unwrap_or(false)
        });

        for file in &files {
            let ext = file
                .extension()
                .and_then(|e| e.to_str())
                .map(|s| s.to_lowercase())
                .unwrap_or_default();

            // Ignore raw .bin tracks if .cue or .m3u exists
            if ext == "bin" && has_cue_or_m3u {
                continue;
            }

            // Valid ROM extensions
            let is_rom_ext = matches!(
                ext.as_str(),
                "sfc"
                    | "smc"
                    | "nes"
                    | "gba"
                    | "gbc"
                    | "gb"
                    | "z64"
                    | "n64"
                    | "v64"
                    | "nds"
                    | "3ds"
                    | "cia"
                    | "nsp"
                    | "xci"
                    | "wbfs"
                    | "gcm"
                    | "rvz"
                    | "md"
                    | "gen"
                    | "smd"
                    | "iso"
                    | "cso"
                    | "chd"
                    | "cue"
                    | "m3u"
                    | "zip"
                    | "7z"
            );

            if !is_rom_ext {
                continue;
            }

            let file_name = file
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();

            // Ignore system/hidden files and companion logs
            if file_name.starts_with('.') || file_name.ends_with(".log") || file_name.ends_with(".txt") {
                continue;
            }

            let clean_title = Self::clean_rom_title(&file_name);
            let platform = Self::infer_platform(file);
            let file_size_bytes = fs::metadata(file).map(|m| m.len()).unwrap_or(0);

            // Suggest matching emulator profile
            let suggested_emulator_id = configured_emulators
                .iter()
                .find(|e| {
                    e.supported_platforms
                        .iter()
                        .any(|p| p.eq_ignore_ascii_case(&platform))
                })
                .map(|e| e.id.clone());

            // Check for adjacent boxart
            let local_cover_path = Self::find_local_cover_art(file);

            discovered.push(DiscoveredRom {
                file_path: file.to_string_lossy().to_string(),
                file_name,
                clean_title,
                platform,
                suggested_emulator_id,
                file_size_bytes,
                local_cover_path,
            });
        }

        for sub in subdirs {
            Self::scan_recursive(&sub, depth + 1, configured_emulators, discovered);
        }
    }

    /// Search for adjacent boxart: <rom_stem>.png/.jpg or boxart/<rom_stem>.png
    fn find_local_cover_art(rom_file: &Path) -> Option<String> {
        let parent = rom_file.parent()?;
        let stem = rom_file.file_stem()?.to_str()?;

        let candidates = [
            parent.join(format!("{}.png", stem)),
            parent.join(format!("{}.jpg", stem)),
            parent.join(format!("{}.webp", stem)),
            parent.join("boxart").join(format!("{}.png", stem)),
            parent.join("boxart").join(format!("{}.jpg", stem)),
            parent.join("covers").join(format!("{}.png", stem)),
            parent.join("covers").join(format!("{}.jpg", stem)),
            parent.join("named_boxarts").join(format!("{}.png", stem)),
        ];

        for c in candidates {
            if c.is_file() {
                return Some(c.to_string_lossy().to_string());
            }
        }

        None
    }

    /// Return the path to the user's community / custom systems definition file: %APPDATA%/OpenPlay/custom_systems.json
    pub fn get_community_systems_path() -> PathBuf {
        let db_dir = dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("OpenPlay");
        db_dir.join("custom_systems.json")
    }

    /// Read community systems if present
    pub fn read_community_systems() -> Option<String> {
        let p = Self::get_community_systems_path();
        if p.is_file() {
            fs::read_to_string(p).ok()
        } else {
            None
        }
    }

    /// Save community systems to %APPDATA%/OpenPlay/custom_systems.json
    pub fn write_community_systems(content: &str) -> Result<(), String> {
        let p = Self::get_community_systems_path();
        if let Some(parent) = p.parent() {
            let _ = fs::create_dir_all(parent);
        }
        fs::write(p, content).map_err(|e| e.to_string())
    }
}
