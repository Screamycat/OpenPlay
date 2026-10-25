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

    /// Reads user playtime (in seconds) from localconfig.vdf across all userdata profiles
    pub fn get_user_playtimes(steam_dir: &Path) -> std::collections::HashMap<String, u64> {
        let mut playtimes = std::collections::HashMap::new();
        let userdata_dir = steam_dir.join("userdata");
        if !userdata_dir.exists() {
            return playtimes;
        }

        let app_re = match Regex::new(r#"^"(\d+)"$"#) {
            Ok(r) => r,
            Err(_) => return playtimes,
        };
        let playtime_re = match Regex::new(r#"^"Playtime"\s+"(\d+)"$"#) {
            Ok(r) => r,
            Err(_) => return playtimes,
        };

        if let Ok(entries) = fs::read_dir(&userdata_dir) {
            for entry in entries.flatten() {
                let localconfig = entry.path().join("config").join("localconfig.vdf");
                if localconfig.exists() {
                    if let Ok(content) = fs::read_to_string(&localconfig) {
                        let mut current_appid: Option<String> = None;
                        let mut depth: usize = 0;

                        for line in content.lines() {
                            let trimmed = line.trim();
                            if trimmed.is_empty() {
                                continue;
                            }

                            if current_appid.is_none() {
                                if let Some(cap) = app_re.captures(trimmed) {
                                    if let Some(m) = cap.get(1) {
                                        current_appid = Some(m.as_str().to_string());
                                        depth = 0;
                                    }
                                }
                            } else {
                                if trimmed.contains('{') {
                                    depth += trimmed.matches('{').count();
                                }
                                if trimmed.contains('}') {
                                    let closes = trimmed.matches('}').count();
                                    if closes >= depth {
                                        depth = 0;
                                        current_appid = None;
                                        continue;
                                    } else {
                                        depth -= closes;
                                    }
                                }
                                if let Some(ref appid) = current_appid {
                                    if let Some(pt_cap) = playtime_re.captures(trimmed) {
                                        if let Some(pt_m) = pt_cap.get(1) {
                                            if let Ok(minutes) = pt_m.as_str().parse::<u64>() {
                                                playtimes.insert(appid.clone(), minutes * 60);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        playtimes
    }

    /// Reads user playtime (in seconds) and last_played timestamp from localconfig.vdf
    pub fn get_user_play_history(steam_dir: &Path) -> std::collections::HashMap<String, (u64, Option<String>)> {
        let mut history = std::collections::HashMap::new();
        let userdata_dir = steam_dir.join("userdata");
        if !userdata_dir.exists() {
            return history;
        }

        let app_re = match Regex::new(r#"^"(\d+)"$"#) {
            Ok(r) => r,
            Err(_) => return history,
        };
        let playtime_re = match Regex::new(r#"^"Playtime"\s+"(\d+)"$"#) {
            Ok(r) => r,
            Err(_) => return history,
        };
        let last_played_re = match Regex::new(r#"^"LastPlayed"\s+"(\d+)"$"#) {
            Ok(r) => r,
            Err(_) => return history,
        };

        if let Ok(entries) = fs::read_dir(&userdata_dir) {
            for entry in entries.flatten() {
                let localconfig = entry.path().join("config").join("localconfig.vdf");
                if localconfig.exists() {
                    if let Ok(content) = fs::read_to_string(&localconfig) {
                        let mut current_appid: Option<String> = None;
                        let mut depth: usize = 0;

                        for line in content.lines() {
                            let trimmed = line.trim();
                            if trimmed.is_empty() {
                                continue;
                            }

                            if current_appid.is_none() {
                                if let Some(cap) = app_re.captures(trimmed) {
                                    if let Some(m) = cap.get(1) {
                                        current_appid = Some(m.as_str().to_string());
                                        depth = 0;
                                    }
                                }
                            } else {
                                if trimmed.contains('{') {
                                    depth += trimmed.matches('{').count();
                                }
                                if trimmed.contains('}') {
                                    let closes = trimmed.matches('}').count();
                                    if closes >= depth {
                                        depth = 0;
                                        current_appid = None;
                                        continue;
                                    } else {
                                        depth -= closes;
                                    }
                                }
                                if let Some(ref appid) = current_appid {
                                    if let Some(pt_cap) = playtime_re.captures(trimmed) {
                                        if let Some(pt_m) = pt_cap.get(1) {
                                            if let Ok(minutes) = pt_m.as_str().parse::<u64>() {
                                                let entry = history.entry(appid.clone()).or_insert((0u64, None));
                                                entry.0 = minutes * 60;
                                            }
                                        }
                                    } else if let Some(lp_cap) = last_played_re.captures(trimmed) {
                                        if let Some(lp_m) = lp_cap.get(1) {
                                            if let Ok(ts) = lp_m.as_str().parse::<i64>() {
                                                if ts > 0 {
                                                    if let Some(dt) = chrono::DateTime::from_timestamp(ts, 0) {
                                                        let entry = history.entry(appid.clone()).or_insert((0u64, None));
                                                        entry.1 = Some(dt.format("%Y-%m-%d").to_string());
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        history
    }

    /// Fetches public Steam user profile information (avatar, username, steamid64) from Steam XML feed
    pub async fn fetch_steam_profile(id_or_vanity: &str) -> Result<(String, String, String), String> {
        let is_numeric = id_or_vanity.chars().all(|c| c.is_ascii_digit()) && id_or_vanity.len() >= 16;
        let url = if is_numeric {
            format!("https://steamcommunity.com/profiles/{}/?xml=1", id_or_vanity)
        } else {
            format!("https://steamcommunity.com/id/{}/?xml=1", id_or_vanity)
        };

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .map_err(|e| e.to_string())?;

        let text = client
            .get(&url)
            .header("User-Agent", "OpenPlay/0.1.0")
            .send()
            .await
            .map_err(|e| e.to_string())?
            .text()
            .await
            .map_err(|e| e.to_string())?;

        let id64_re = Regex::new(r#"<steamID64>(\d+)</steamID64>"#).map_err(|e| e.to_string())?;
        let name_re = Regex::new(r#"<steamID><!\[CDATA\[(.*?)\]\]></steamID>"#).map_err(|e| e.to_string())?;
        let avatar_re = Regex::new(r#"<avatarFull><!\[CDATA\[(.*?)\]\]></avatarFull>"#).map_err(|e| e.to_string())?;

        let steamid64 = id64_re
            .captures(&text)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().to_string())
            .unwrap_or_else(|| id_or_vanity.to_string());

        let username = name_re
            .captures(&text)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().to_string())
            .unwrap_or_else(|| "Steam User".to_string());

        let avatar_url = avatar_re
            .captures(&text)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().to_string())
            .unwrap_or_default();

        Ok((steamid64, username, avatar_url))
    }

    /// Fetches all owned games from Steam user account (including uninstalled games)
    pub async fn fetch_owned_games(steamid64: &str) -> Result<Vec<Game>, String> {
        let url = format!(
            "https://steamcommunity.com/profiles/{}/games/?tab=all&xml=1",
            steamid64
        );

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .map_err(|e| e.to_string())?;

        let text = client
            .get(&url)
            .header("User-Agent", "OpenPlay/0.1.0")
            .send()
            .await
            .map_err(|e| e.to_string())?
            .text()
            .await
            .map_err(|e| e.to_string())?;

        let game_block_re = Regex::new(r#"<game>([\s\S]*?)</game>"#).map_err(|e| e.to_string())?;
        let appid_re = Regex::new(r#"<appID>(\d+)</appID>"#).map_err(|e| e.to_string())?;
        let name_re = Regex::new(r#"<name><!\[CDATA\[(.*?)\]\]></name>"#).map_err(|e| e.to_string())?;
        let hours_re = Regex::new(r#"<hoursOnRecord>([\d.,]+)</hoursOnRecord>"#).map_err(|e| e.to_string())?;

        let mut games = Vec::new();

        for cap in game_block_re.captures_iter(&text) {
            if let Some(block) = cap.get(1) {
                let block_str = block.as_str();
                let appid = appid_re
                    .captures(block_str)
                    .and_then(|c| c.get(1))
                    .map(|m| m.as_str().to_string());
                let name = name_re
                    .captures(block_str)
                    .and_then(|c| c.get(1))
                    .map(|m| m.as_str().to_string());

                let hours = hours_re
                    .captures(block_str)
                    .and_then(|c| c.get(1))
                    .and_then(|m| m.as_str().replace(',', "").parse::<f64>().ok())
                    .unwrap_or(0.0);

                if let (Some(appid), Some(name)) = (appid, name) {
                    let cover = format!(
                        "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{}/library_600x900.jpg",
                        appid
                    );
                    let hero = format!(
                        "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{}/library_hero.jpg",
                        appid
                    );
                    let logo = format!(
                        "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{}/logo.png",
                        appid
                    );

                    let links = vec![
                        GameLink {
                            title: "Store Page".to_string(),
                            url: format!("https://store.steampowered.com/app/{}", appid),
                        },
                        GameLink {
                            title: "Community Hub".to_string(),
                            url: format!("https://steamcommunity.com/app/{}", appid),
                        },
                    ];

                    let game = Game {
                        id: format!("steam_{}", appid),
                        title: name.clone(),
                        sorting_title: Some(name),
                        source: "Steam".to_string(),
                        source_id: Some(appid),
                        install_directory: None,
                        executable_path: None,
                        launch_arguments: None,
                        is_installed: false,
                        is_favorite: false,
                        cover_image: Some(cover),
                        background_image: Some(hero),
                        logo_image: Some(logo),
                        icon_image: None,
                        developer: None,
                        publisher: None,
                        release_date: None,
                        genres: Vec::new(),
                        features: Vec::new(),
                        platforms: vec!["Windows".to_string(), "Linux".to_string()],
                        community_score: None,
                        user_rating: None,
                        playtime_seconds: (hours * 3600.0) as u64,
                        last_played: None,
                        date_added: Some(chrono::Local::now().format("%Y-%m-%d").to_string()),
                        completion_status: Some("Not Played".to_string()),
                        description: None,
                        notes: None,
                        links,
                        screenshots: Vec::new(),
                        trailers: Vec::new(),
                        age_rating: None,
                        critic_score: None,
                        series: None,
                        hltb_main: None,
                        hltb_extra: None,
                        hltb_completionist: None,
                        size_on_disk: None,
                        tags: Vec::new(),
                        categories: Vec::new(),
                        region: None,
                        play_count: Some(0),
                    };

                    games.push(game);
                }
            }
        }

        Ok(games)
    }

    pub fn is_blacklisted_app(appid: &str, name: &str) -> bool {
        let lower = name.to_lowercase();
        if lower.contains("dedicated server")
            || lower.contains("server")
            || lower.contains("redistributable")
            || lower.contains("steam linux runtime")
            || lower.contains("proton")
            || lower.contains("soundtrack")
            || lower.contains("benchmark")
            || lower.contains("playtest")
        {
            return true;
        }

        // Known non-game utility/software appids
        matches!(
            appid,
            "250820" // SteamVR
            | "365670" // Blender
            | "400040" // ShareX
            | "431960" // Wallpaper Engine
            | "228980" // Steamworks Common Redistributables
            | "3041230" // Windrose playtest
            | "1962700" // Subnautica 2 playtest
        )
    }

    /// Fetches game title directly from Steam Storefront API, ensuring it is a game
    pub async fn fetch_app_name(client: &reqwest::Client, appid: &str) -> Option<String> {
        let url = format!(
            "https://store.steampowered.com/api/appdetails?appids={}&filters=basic&l=english",
            appid
        );
        let resp = client
            .get(&url)
            .header("User-Agent", "OpenPlay/0.1.0")
            .send()
            .await
            .ok()?;

        let json: serde_json::Value = resp.json().await.ok()?;
        let app_obj = json.get(appid)?;
        if !app_obj.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
            return None;
        }
        let data = app_obj.get("data")?;
        if let Some(app_type) = data.get("type").and_then(|v| v.as_str()) {
            if app_type != "game" {
                return None;
            }
        }
        data.get("name").and_then(|v| v.as_str()).map(|s| s.to_string())
    }

    /// Scans uninstalled games from localconfig.vdf history
    pub async fn scan_uninstalled_from_localconfig(
        steam_dir: &Path,
        installed_appids: &std::collections::HashSet<String>,
    ) -> Vec<Game> {
        let playtimes = Self::get_user_playtimes(steam_dir);
        let mut uninstalled = Vec::new();

        // Sort candidates by playtime descending so most played uninstalled games come first
        let mut candidates: Vec<(String, u64)> = playtimes
            .into_iter()
            .filter(|(aid, _)| !installed_appids.contains(aid) && !Self::is_blacklisted_app(aid, ""))
            .collect();
        candidates.sort_by(|a, b| b.1.cmp(&a.1));

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(4))
            .build()
            .unwrap_or_default();

        // Process top 60 candidates in parallel chunks of 8
        for chunk in candidates.into_iter().take(60).collect::<Vec<_>>().chunks(8) {
            let mut join_set = tokio::task::JoinSet::new();
            for (appid, playtime_sec) in chunk {
                let client = client.clone();
                let aid = appid.clone();
                let pt = *playtime_sec;
                join_set.spawn(async move {
                    let maybe_name = Self::fetch_app_name(&client, &aid).await;
                    (aid, pt, maybe_name)
                });
            }

            while let Some(res) = join_set.join_next().await {
                if let Ok((appid, playtime_sec, Some(name))) = res {
                    if Self::is_blacklisted_app(&appid, &name) {
                        continue;
                    }

                    let (cover, hero, logo, icon) = Self::find_artwork(steam_dir, &appid);
                    let links = vec![
                        GameLink {
                            title: "Store Page".to_string(),
                            url: format!("https://store.steampowered.com/app/{}", appid),
                        },
                        GameLink {
                            title: "Community Hub".to_string(),
                            url: format!("https://steamcommunity.com/app/{}", appid),
                        },
                    ];

                    let game = Game {
                        id: format!("steam_{}", appid),
                        title: name.clone(),
                        sorting_title: Some(name),
                        source: "Steam".to_string(),
                        source_id: Some(appid),
                        install_directory: None,
                        executable_path: None,
                        launch_arguments: None,
                        is_installed: false,
                        is_favorite: false,
                        cover_image: cover,
                        background_image: hero,
                        logo_image: logo,
                        icon_image: icon,
                        developer: None,
                        publisher: None,
                        release_date: None,
                        genres: Vec::new(),
                        features: Vec::new(),
                        platforms: vec!["Windows".to_string(), "Linux".to_string()],
                        community_score: None,
                        user_rating: None,
                        playtime_seconds: playtime_sec,
                        last_played: None,
                        date_added: Some(chrono::Local::now().format("%Y-%m-%d").to_string()),
                        completion_status: Some("Not Played".to_string()),
                        description: None,
                        notes: None,
                        links,
                        screenshots: Vec::new(),
                        trailers: Vec::new(),
                        age_rating: None,
                        critic_score: None,
                        series: None,
                        hltb_main: None,
                        hltb_extra: None,
                        hltb_completionist: None,
                        size_on_disk: None,
                        tags: Vec::new(),
                        categories: Vec::new(),
                        region: None,
                        play_count: Some(0),
                    };

                    uninstalled.push(game);
                }
            }
        }

        uninstalled
    }

    /// Scans all libraries and returns discovered games
    pub fn scan_installed_games() -> Result<Vec<Game>, String> {
        let steam_dir = Self::find_steam_install_dir()
            .ok_or_else(|| "Steam installation directory not found".to_string())?;

        let library_folders = Self::get_library_folders(&steam_dir);
        let playtimes = Self::get_user_playtimes(&steam_dir);
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
                                if Self::is_blacklisted_app(&appid, &name) {
                                    continue;
                                }

                                let install_path = installdir.as_ref().map(|dir| {
                                    steamapps.join("common").join(dir).to_string_lossy().to_string()
                                });

                                let (cover, hero, logo, icon) = Self::find_artwork(&steam_dir, &appid);

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

                                let initial_playtime = playtimes.get(&appid).copied().unwrap_or(0);

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
                                    icon_image: icon,
                                    developer: None,
                                    publisher: None,
                                    release_date: None,
                                    genres: Vec::new(),
                                    features: Vec::new(),
                                    platforms: vec!["Windows".to_string(), "Linux".to_string()],
                                    community_score: None,
                                    user_rating: None,
                                    playtime_seconds: initial_playtime,
                                    last_played: last_played_str,
                                    date_added: Some(chrono::Local::now().format("%Y-%m-%d").to_string()),
                                    completion_status: Some("Not Played".to_string()),
                                    description: None,
                                    notes: None,
                                    links,
                                    screenshots: Vec::new(),
                                    trailers: Vec::new(),
                                    age_rating: None,
                                    critic_score: None,
                                    series: None,
                                    hltb_main: None,
                                    hltb_extra: None,
                                    hltb_completionist: None,
                                    size_on_disk,
                                    tags: Vec::new(),
                                    categories: Vec::new(),
                                    region: None,
                                    play_count: Some(0),
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
    fn find_artwork(steam_dir: &Path, appid: &str) -> (Option<String>, Option<String>, Option<String>, Option<String>) {
        let librarycache = steam_dir.join("appcache").join("librarycache");

        // 1. Try modern nested directory: librarycache/<appid>/
        let app_dir = librarycache.join(appid);
        let mut cover = None;
        let mut hero = None;
        let mut logo = None;
        let mut icon = None;

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

            // Look for client icon file in app_dir
            if let Ok(entries) = fs::read_dir(&app_dir) {
                for e in entries.flatten() {
                    let fn_str = e.file_name().to_string_lossy().to_string();
                    if (fn_str.ends_with(".jpg") || fn_str.ends_with(".png") || fn_str.ends_with(".ico"))
                        && !fn_str.starts_with("library_")
                        && !fn_str.starts_with("header")
                        && !fn_str.starts_with("logo")
                    {
                        icon = Some(e.path().to_string_lossy().to_string());
                        break;
                    }
                }
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
        if icon.is_none() {
            let p = librarycache.join(format!("{}_icon.jpg", appid));
            if p.exists() {
                icon = Some(p.to_string_lossy().to_string());
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

        (final_cover, final_hero, final_logo, icon)
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
            println!(" - {} (ID: {}, Playtime: {}m, Cover: {:?})", g.title, g.id, g.playtime_seconds / 60, g.cover_image);
        }
    }

    #[tokio::test]
    async fn test_scan_uninstalled_games() {
        let steam_dir = SteamScanner::find_steam_install_dir().unwrap();
        let installed = SteamScanner::scan_installed_games().unwrap();
        let installed_ids: std::collections::HashSet<String> = installed
            .into_iter()
            .filter_map(|g| g.source_id)
            .collect();
        let uninstalled = SteamScanner::scan_uninstalled_from_localconfig(&steam_dir, &installed_ids).await;
        println!("\n=== Discovered {} uninstalled Steam games ===", uninstalled.len());
        for g in uninstalled.iter().take(10) {
            println!(" - {} (ID: {}, Playtime: {}m, Installed: {})", g.title, g.id, g.playtime_seconds / 60, g.is_installed);
        }
    }
}
