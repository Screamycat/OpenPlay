use crate::models::{Game, GameLink};
use regex::Regex;
use std::fs;
use std::path::{Path, PathBuf};

pub struct SteamScanner;

impl SteamScanner {
    /// Detects Steam install path across Windows and Linux
    pub fn find_steam_install_dir() -> Option<PathBuf> {
        #[cfg(target_os = "windows")]
        {
            let common_paths = [
                r"C:\Program Files (x86)\Steam",
                r"C:\Program Files\Steam",
                r"D:\Steam",
                r"E:\Steam",
                r"F:\Steam",
                r"T:\Steam",
            ];
            for p in &common_paths {
                let path = PathBuf::from(p);
                if path.exists() && path.join("steamapps").exists() {
                    return Some(path);
                }
            }
        }

        #[cfg(target_os = "linux")]
        {
            if let Some(home) = dirs::home_dir() {
                let candidates = [
                    home.join(".local/share/Steam"),
                    home.join(".steam/steam"),
                    home.join(".steam/root"),
                    home.join(".var/app/com.valvesoftware.Steam/.local/share/Steam"),
                ];
                for c in &candidates {
                    if c.exists() && c.join("steamapps").exists() {
                        return Some(c.clone());
                    }
                }
            }
        }

        None
    }

    /// Finds all library paths configured in libraryfolders.vdf
    pub fn get_library_folders(steam_dir: &Path) -> Vec<PathBuf> {
        let mut folders = Vec::new();
        folders.push(steam_dir.to_path_buf());

        let vdf_path = steam_dir.join("steamapps").join("libraryfolders.vdf");
        if let Ok(content) = fs::read_to_string(&vdf_path) {
            // Regex match `"path"\s+"([^"]+)"`
            if let Ok(re) = Regex::new(r#""path"\s+"([^"]+)""#) {
                for cap in re.captures_iter(&content) {
                    if let Some(p) = cap.get(1) {
                        let clean_path = p.as_str().replace(r"\\", r"\");
                        let path_buf = PathBuf::from(&clean_path);
                        if path_buf.exists() && !folders.contains(&path_buf) {
                            folders.push(path_buf);
                        }
                    }
                }
            }
        }

        folders
    }

    /// Scans all libraries and returns discovered games
    pub fn scan_installed_games() -> Result<Vec<Game>, String> {
        let steam_dir = Self::find_steam_install_dir()
            .ok_or_else(|| "Steam installation directory not found".to_string())?;

        let library_folders = Self::get_library_folders(&steam_dir);
        let mut games = Vec::new();

        let appid_re = Regex::new(r#""appid"\s+"(\d+)""#).map_err(|e| e.to_string())?;
        let name_re = Regex::new(r#""name"\s+"([^"]+)""#).map_err(|e| e.to_string())?;
        let installdir_re = Regex::new(r#""installdir"\s+"([^"]+)""#).map_err(|e| e.to_string())?;
        let last_played_re = Regex::new(r#""LastPlayed"\s+"(\d+)""#).map_err(|e| e.to_string())?;
        let size_re = Regex::new(r#""SizeOnDisk"\s+"(\d+)""#).map_err(|e| e.to_string())?;

        for lib in library_folders {
            let steamapps = lib.join("steamapps");
            if !steamapps.exists() {
                continue;
            }

            if let Ok(entries) = fs::read_dir(&steamapps) {
                for entry in entries.flatten() {
                    let file_name = entry.file_name().to_string_lossy().to_string();
                    if file_name.starts_with("appmanifest_") && file_name.ends_with(".acf") {
                        if let Ok(content) = fs::read_to_string(entry.path()) {
                            let appid = appid_re
                                .captures(&content)
                                .and_then(|c| c.get(1))
                                .map(|m| m.as_str().to_string());
                            let name = name_re
                                .captures(&content)
                                .and_then(|c| c.get(1))
                                .map(|m| m.as_str().to_string());
                            let installdir = installdir_re
                                .captures(&content)
                                .and_then(|c| c.get(1))
                                .map(|m| m.as_str().to_string());
                            let last_played_raw = last_played_re
                                .captures(&content)
                                .and_then(|c| c.get(1))
                                .and_then(|m| m.as_str().parse::<i64>().ok());
                            let size_on_disk = size_re
                                .captures(&content)
                                .and_then(|c| c.get(1))
                                .and_then(|m| m.as_str().parse::<u64>().ok());

                            if let (Some(appid), Some(name)) = (appid, name) {
                                // Ignore common Steam utility tool appids (Steamworks Common Redistributables, Proton, etc.)
                                if appid == "228980" || appid == "105600" && name.contains("Terraria Server") {
                                    continue;
                                }

                                let install_path = installdir.as_ref().map(|dir| {
                                    steamapps.join("common").join(dir).to_string_lossy().to_string()
                                });

                                let (cover, hero, logo) = Self::find_artwork(&steam_dir, &appid);

                                let links = vec![
                                    GameLink {
                                        title: "Community Hub".to_string(),
                                        url: format!("https://steamcommunity.com/app/{}", appid),
                                    },
                                    GameLink {
                                        title: "Discussions".to_string(),
                                        url: format!("https://steamcommunity.com/app/{}/discussions/", appid),
                                    },
                                    GameLink {
                                        title: "Guides".to_string(),
                                        url: format!("https://steamcommunity.com/app/{}/guides/", appid),
                                    },
                                    GameLink {
                                        title: "News".to_string(),
                                        url: format!("https://store.steampowered.com/news/app/{}", appid),
                                    },
                                    GameLink {
                                        title: "Store Page".to_string(),
                                        url: format!("https://store.steampowered.com/app/{}", appid),
                                    },
                                    GameLink {
                                        title: "PCGamingWiki".to_string(),
                                        url: format!("https://www.pcgamingwiki.com/api/appid.php?appid={}", appid),
                                    },
                                ];

                                let last_played_str = last_played_raw.and_then(|ts| {
                                    if ts > 0 {
                                        chrono::DateTime::from_timestamp(ts, 0)
                                            .map(|dt| dt.format("%Y-%m-%d").to_string())
                                    } else {
                                        None
                                    }
                                });

                                let game = Game {
                                    id: format!("steam_{}", appid),
                                    title: name.clone(),
                                    sorting_title: Some(name),
                                    source: "Steam".to_string(),
                                    source_id: Some(appid.clone()),
                                    install_directory: install_path,
                                    executable_path: None,
                                    launch_arguments: None,
                                    is_installed: true,
                                    is_favorite: false,
                                    cover_image: cover,
                                    background_image: hero,
                                    logo_image: logo,
                                    icon_image: None,
                                    developer: None,
                                    publisher: None,
                                    release_date: None,
                                    genres: Vec::new(),
                                    features: Vec::new(),
                                    platforms: vec!["Windows".to_string(), "Linux".to_string()],
                                    community_score: None,
                                    user_rating: None,
                                    playtime_seconds: 0,
                                    last_played: last_played_str,
                                    date_added: Some(chrono::Local::now().format("%Y-%m-%d").to_string()),
                                    completion_status: Some("Not Played".to_string()),
                                    description: None,
                                    notes: None,
                                    links,
                                    screenshots: Vec::new(),
                                    size_on_disk,
                                };

                                games.push(game);
                            }
                        }
                    }
                }
            }
        }

        Ok(games)
    }

    /// Finds artwork locally in appcache/librarycache or falls back to official Steam CDN
    fn find_artwork(steam_dir: &Path, appid: &str) -> (Option<String>, Option<String>, Option<String>) {
        let librarycache = steam_dir.join("appcache").join("librarycache");

        // 1. Try modern nested directory: librarycache/<appid>/
        let app_dir = librarycache.join(appid);
        let mut cover = None;
        let mut hero = None;
        let mut logo = None;

        if app_dir.exists() {
            let p_cover = app_dir.join("library_600x900.jpg");
            if p_cover.exists() {
                cover = Some(p_cover.to_string_lossy().to_string());
            }

            let p_hero = app_dir.join("library_hero.jpg");
            if p_hero.exists() {
                hero = Some(p_hero.to_string_lossy().to_string());
            }

            let p_logo = app_dir.join("logo.png");
            if p_logo.exists() {
                logo = Some(p_logo.to_string_lossy().to_string());
            }
        }

        // 2. Try legacy flat naming: librarycache/<appid>_library_600x900.jpg
        if cover.is_none() {
            let p = librarycache.join(format!("{}_library_600x900.jpg", appid));
            if p.exists() {
                cover = Some(p.to_string_lossy().to_string());
            }
        }
        if hero.is_none() {
            let p = librarycache.join(format!("{}_library_hero.jpg", appid));
            if p.exists() {
                hero = Some(p.to_string_lossy().to_string());
            }
        }
        if logo.is_none() {
            let p = librarycache.join(format!("{}_logo.png", appid));
            if p.exists() {
                logo = Some(p.to_string_lossy().to_string());
            }
        }

        // 3. Fallback to official Steam CDN URLs so covers are ALWAYS visible even if cache was cleared
        let final_cover = cover.or_else(|| {
            Some(format!(
                "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{}/library_600x900.jpg",
                appid
            ))
        });
        let final_hero = hero.or_else(|| {
            Some(format!(
                "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{}/library_hero.jpg",
                appid
            ))
        });
        let final_logo = logo.or_else(|| {
            Some(format!(
                "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{}/logo.png",
                appid
            ))
        });

        (final_cover, final_hero, final_logo)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_steam_detection() {
        let dir = SteamScanner::find_steam_install_dir();
        assert!(dir.is_some(), "Steam install directory should be detected");
    }

    #[test]
    fn test_scan_installed_games() {
        let games = SteamScanner::scan_installed_games().expect("Should scan installed games");
        assert!(!games.is_empty(), "Should discover at least one installed game");
        println!("\n=== Discovered {} Steam games ===", games.len());
        for g in games.iter().take(5) {
            println!(" - {} (ID: {}, Cover: {:?})", g.title, g.id, g.cover_image);
        }
    }
}

