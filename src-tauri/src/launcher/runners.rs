use crate::scanner::steam::SteamScanner;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunnerInfo {
    pub id: String,
    pub name: String,
    pub runner_type: String, // "proton" | "wine"
    pub path: String,        // Directory containing proton script, or binary path for wine
    pub is_default: bool,
}

pub struct RunnerManager;

impl RunnerManager {
    /// Detects all installed Wine and Proton runners on the host machine.
    pub fn detect_available_runners(custom_runner_path: Option<&str>) -> Vec<RunnerInfo> {
        let mut runners = Vec::new();

        #[cfg(target_os = "linux")]
        {
            let home = dirs::home_dir();

            // 1. Scan Steam compatibility tools (GE-Proton, custom Proton builds)
            let mut compat_dirs: Vec<PathBuf> = Vec::new();
            if let Some(ref h) = home {
                compat_dirs.push(h.join(".local/share/Steam/compatibilitytools.d"));
                compat_dirs.push(h.join(".steam/root/compatibilitytools.d"));
                compat_dirs.push(h.join(".steam/steam/compatibilitytools.d"));
            }
            if let Some(steam_dir) = SteamScanner::find_steam_install_dir() {
                let steam_compat = steam_dir.join("compatibilitytools.d");
                if !compat_dirs.contains(&steam_compat) {
                    compat_dirs.push(steam_compat);
                }
            }

            for c_dir in compat_dirs {
                if c_dir.is_dir() {
                    if let Ok(entries) = fs::read_dir(&c_dir) {
                        for entry in entries.flatten() {
                            let path = entry.path();
                            if path.is_dir() {
                                let proton_script = path.join("proton");
                                if proton_script.exists() {
                                    let dir_name = path
                                        .file_name()
                                        .map(|f| f.to_string_lossy().to_string())
                                        .unwrap_or_else(|| "Custom Proton".to_string());
                                    
                                    let id = format!("steam-compat-{}", dir_name.to_lowercase().replace(' ', "-"));
                                    if !runners.iter().any(|r: &RunnerInfo| r.path == path.to_string_lossy()) {
                                        runners.push(RunnerInfo {
                                            id,
                                            name: dir_name,
                                            runner_type: "proton".to_string(),
                                            path: path.to_string_lossy().to_string(),
                                            is_default: false,
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // 2. Scan official Steam Proton installations in all library folders
            if let Some(steam_dir) = SteamScanner::find_steam_install_dir() {
                let library_folders = SteamScanner::get_library_folders(&steam_dir);
                for lib in library_folders {
                    let common = lib.join("steamapps/common");
                    if common.is_dir() {
                        if let Ok(entries) = fs::read_dir(&common) {
                            for entry in entries.flatten() {
                                let path = entry.path();
                                if path.is_dir() {
                                    let folder_name = path
                                        .file_name()
                                        .map(|f| f.to_string_lossy().to_string())
                                        .unwrap_or_default();
                                    
                                    if folder_name.to_lowercase().contains("proton") {
                                        let proton_script = path.join("proton");
                                        if proton_script.exists() {
                                            let id = format!("steam-common-{}", folder_name.to_lowercase().replace(' ', "-"));
                                            if !runners.iter().any(|r| r.path == path.to_string_lossy()) {
                                                runners.push(RunnerInfo {
                                                    id,
                                                    name: folder_name,
                                                    runner_type: "proton".to_string(),
                                                    path: path.to_string_lossy().to_string(),
                                                    is_default: false,
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // 3. Scan Heroic & Lutris runner paths if present
            if let Some(ref h) = home {
                let heroic_wine = h.join(".config/heroic/tools/wine");
                let heroic_proton = h.join(".config/heroic/tools/proton");
                let lutris_wine = h.join(".local/share/lutris/runners/wine");

                for tool_dir in [heroic_wine, heroic_proton, lutris_wine] {
                    if tool_dir.is_dir() {
                        if let Ok(entries) = fs::read_dir(&tool_dir) {
                            for entry in entries.flatten() {
                                let path = entry.path();
                                if path.is_dir() {
                                    let name = path
                                        .file_name()
                                        .map(|f| f.to_string_lossy().to_string())
                                        .unwrap_or_default();
                                    
                                    let is_proton = path.join("proton").exists();
                                    let is_wine = path.join("bin/wine").exists() || path.join("bin/wine64").exists();

                                    if is_proton || is_wine {
                                        let runner_type = if is_proton { "proton" } else { "wine" };
                                        let id = format!("{}-{}", runner_type, name.to_lowercase().replace(' ', "-"));
                                        if !runners.iter().any(|r| r.path == path.to_string_lossy()) {
                                            runners.push(RunnerInfo {
                                                id,
                                                name: format!("{} ({})", name, runner_type.to_uppercase()),
                                                runner_type: runner_type.to_string(),
                                                path: path.to_string_lossy().to_string(),
                                                is_default: false,
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // 4. Scan System Wine binary
            for wine_bin in ["/usr/bin/wine64", "/usr/bin/wine", "/usr/local/bin/wine"] {
                let p = Path::new(wine_bin);
                if p.is_file() {
                    runners.push(RunnerInfo {
                        id: "system-wine".to_string(),
                        name: "System Wine".to_string(),
                        runner_type: "wine".to_string(),
                        path: wine_bin.to_string(),
                        is_default: false,
                    });
                    break;
                }
            }
        }

        // 5. User-Configured Custom Runner Path
        if let Some(custom) = custom_runner_path {
            let trimmed = custom.trim();
            if !trimmed.is_empty() {
                let p = Path::new(trimmed);
                if p.exists() {
                    let is_proton = p.is_dir() && p.join("proton").exists();
                    runners.insert(0, RunnerInfo {
                        id: "custom-runner".to_string(),
                        name: format!("Custom Runner ({})", trimmed),
                        runner_type: if is_proton { "proton".to_string() } else { "wine".to_string() },
                        path: trimmed.to_string(),
                        is_default: true,
                    });
                }
            }
        }

        // Sort runners: GE-Proton first, then Proton Experimental / 9.0 / 8.0, then Wine
        runners.sort_by(|a, b| {
            let a_score = runner_priority_score(&a.name);
            let b_score = runner_priority_score(&b.name);
            b_score.cmp(&a_score)
        });

        // Set the top runner as default if none explicitly marked
        if !runners.is_empty() && !runners.iter().any(|r| r.is_default) {
            runners[0].is_default = true;
        }

        runners
    }

    /// Selects the best runner matching a requested ID or the top default runner
    pub fn resolve_runner(
        requested_id: Option<&str>,
        custom_path: Option<&str>,
    ) -> Option<RunnerInfo> {
        let all = Self::detect_available_runners(custom_path);
        if let Some(req_id) = requested_id {
            if let Some(found) = all.iter().find(|r| r.id == req_id) {
                return Some(found.clone());
            }
        }
        all.into_iter().find(|r| r.is_default).or_else(|| None)
    }
}

fn runner_priority_score(name: &str) -> i32 {
    let lower = name.to_lowercase();
    if lower.contains("ge-proton") {
        100
    } else if lower.contains("experimental") {
        90
    } else if lower.contains("proton 9") {
        80
    } else if lower.contains("proton 8") {
        70
    } else if lower.contains("proton") {
        60
    } else if lower.contains("wine") {
        30
    } else {
        10
    }
}
