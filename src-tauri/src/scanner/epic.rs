use crate::models::Game;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

const EPIC_BASIC_AUTH: &str = "basic MzRhMDJjZjhmNDQxNGUyOWIxNTkyMTg3NmRhMzZmOWE6ZGFhZmJjY2M3Mzc3NDUwMzlkZmZlNTNkOTRmYzc2Y2Y=";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EpicAuthResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub account_id: String,
    #[serde(rename = "displayName")]
    pub display_name: String,
    pub expires_in: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EpicOwnedGame {
    pub app_name: String,
    pub title: String,
    pub namespace: String,
    pub catalog_item_id: String,
    pub cover_image: Option<String>,
    pub background_image: Option<String>,
    pub description: Option<String>,
    pub developer: Option<String>,
    pub release_date: Option<String>,
    pub genres: Vec<String>,
}

pub struct EpicScanner;

impl EpicScanner {
    /// 1. Find local Epic data directory (e.g. C:\ProgramData\Epic\EpicGamesLauncher\Data)
    pub fn find_epic_data_dir() -> Option<PathBuf> {
        let program_data = std::env::var("ProgramData").unwrap_or_else(|_| r"C:\ProgramData".to_string());
        let data_path = PathBuf::from(program_data)
            .join("Epic")
            .join("EpicGamesLauncher")
            .join("Data");

        if data_path.exists() && data_path.is_dir() {
            Some(data_path)
        } else {
            None
        }
    }

    /// Helper to read a string value from HKEY_LOCAL_MACHINE on Windows via `reg query`
    pub fn read_hklm_registry_string(subkey: &str, value_name: &str) -> Option<String> {
        #[cfg(target_os = "windows")]
        {
            use std::process::Command;
            let output = Command::new("reg")
                .args(["query", &format!("HKLM\\{}", subkey), "/v", value_name])
                .output()
                .ok()?;

            if output.status.success() {
                let out_str = String::from_utf8_lossy(&output.stdout);
                for line in out_str.lines() {
                    if line.contains("REG_SZ") {
                        let parts: Vec<&str> = line.split("REG_SZ").collect();
                        if parts.len() > 1 {
                            return Some(parts[1].trim().to_string());
                        }
                    } else if line.contains("REG_EXPAND_SZ") {
                        let parts: Vec<&str> = line.split("REG_EXPAND_SZ").collect();
                        if parts.len() > 1 {
                            return Some(parts[1].trim().to_string());
                        }
                    }
                }
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = (subkey, value_name);
        }
        None
    }

    /// Helper to decode JSON bytes that may be UTF-8 or UTF-16 (BOM)
    pub fn decode_json_bytes(bytes: &[u8]) -> Option<Value> {
        if bytes.len() >= 2 && bytes[0] == 0xff && bytes[1] == 0xfe {
            let u16_slice: Vec<u16> = bytes[2..]
                .chunks_exact(2)
                .map(|c| u16::from_le_bytes([c[0], c[1]]))
                .collect();
            let s = String::from_utf16_lossy(&u16_slice);
            serde_json::from_str::<Value>(&s).ok()
        } else {
            let s = String::from_utf8_lossy(bytes);
            serde_json::from_str::<Value>(&s).ok()
        }
    }

    /// Reads recorded last_played dates from Epic Games Launcher's GameUserSettings.ini and CloudCache manifests
    pub fn get_user_last_played() -> HashMap<String, String> {
        let mut map: HashMap<String, String> = HashMap::new();
        let local_app_data = match std::env::var("LOCALAPPDATA") {
            Ok(v) => PathBuf::from(v),
            Err(_) => return map,
        };

        let mut insert_latest = |key: String, date_str: String| {
            let should_update = match map.get(&key) {
                Some(existing) => date_str > *existing,
                None => true,
            };
            if should_update {
                map.insert(key, date_str);
            }
        };

        // 1. Scan CloudCache save manifests (%LOCALAPPDATA%\EpicGamesLauncher\Saved\Saves\<account_id>\<AppName>\CloudCache\YYYY.MM.DD-*.manifest)
        let saves_root = local_app_data.join("EpicGamesLauncher").join("Saved").join("Saves");
        if saves_root.exists() && saves_root.is_dir() {
            if let Ok(acct_entries) = fs::read_dir(&saves_root) {
                for acct in acct_entries.flatten() {
                    if let Ok(app_entries) = fs::read_dir(acct.path()) {
                        for app_dir in app_entries.flatten() {
                            let app_name = app_dir.file_name().to_string_lossy().to_string();
                            let cloud_cache = app_dir.path().join("CloudCache");
                            if cloud_cache.is_dir() {
                                if let Ok(manifests) = fs::read_dir(&cloud_cache) {
                                    for mf in manifests.flatten() {
                                        let fname = mf.file_name().to_string_lossy().to_string();
                                        // Format: 2026.09.27-01.06.59.manifest
                                        if fname.len() >= 10 && fname.ends_with(".manifest") {
                                            let prefix = &fname[..10];
                                            if prefix.chars().enumerate().all(|(i, c)| {
                                                if i == 4 || i == 7 { c == '.' } else { c.is_ascii_digit() }
                                            }) {
                                                let normalized = prefix.replace('.', "-");
                                                insert_latest(app_name.clone(), normalized.clone());
                                                insert_latest(app_name.to_lowercase(), normalized);
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

        // 2. Scan GameUserSettings.ini LastPlayedGame entries
        let candidate_dirs = [
            local_app_data.join("EpicGamesLauncher").join("Saved").join("Config").join("WindowsEditor"),
            local_app_data.join("EpicGamesLauncher").join("Saved").join("Config").join("Windows"),
        ];

        for dir in candidate_dirs {
            let ini_path = dir.join("GameUserSettings.ini");
            if ini_path.exists() {
                if let Ok(content) = fs::read_to_string(&ini_path) {
                    for line in content.lines() {
                        let trimmed = line.trim();
                        // Format: LastPlayedGame=<namespace>:<item_id>:<app_name>,<timestamp>
                        if let Some(rest) = trimmed.strip_prefix("LastPlayedGame=") {
                            let parts: Vec<&str> = rest.split(',').collect();
                            if parts.len() >= 2 {
                                let id_part = parts[0];
                                let timestamp = parts[1];
                                let date_str = if timestamp.len() >= 10 {
                                    timestamp[..10].replace('.', "-")
                                } else {
                                    continue;
                                };

                                for sub in id_part.split(':') {
                                    let clean = sub.trim();
                                    if !clean.is_empty() {
                                        insert_latest(clean.to_string(), date_str.clone());
                                        insert_latest(clean.to_lowercase(), date_str.clone());
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        map
    }

    /// 2. Scan locally installed Epic games from:
    ///    a) .item manifest files (direct Epic games)
    ///    b) ThirPartyManagedApps/*.json (Ubisoft, EA/Origin, etc. managed through Epic)
    pub fn scan_installed_games() -> Result<Vec<Game>, String> {
        let data_dir = match Self::find_epic_data_dir() {
            Some(dir) => dir,
            None => return Ok(Vec::new()),
        };

        let last_played_map = Self::get_user_last_played();
        let mut games = Vec::new();
        let mut seen_ids = HashSet::new();

        // 2a. Scan standard .item manifests
        let manifests_dir = data_dir.join("Manifests");
        if manifests_dir.exists() && manifests_dir.is_dir() {
            if let Ok(entries) = fs::read_dir(&manifests_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().and_then(|ext| ext.to_str()) == Some("item") {
                        if let Ok(content) = fs::read_to_string(&path) {
                            if let Ok(json) = serde_json::from_str::<Value>(&content) {
                                // Skip DLCs and add-ons
                                if let Some(main_app) = json.get("MainGameAppName").and_then(|v| v.as_str()) {
                                    if !main_app.trim().is_empty() {
                                        continue;
                                    }
                                }

                                let is_incomplete = json.get("bIsIncompleteInstall").and_then(|v| v.as_bool()).unwrap_or(false);
                                if is_incomplete {
                                    continue;
                                }

                                let app_name = match json.get("AppName").and_then(|v| v.as_str()) {
                                    Some(s) if !s.trim().is_empty() => s.to_string(),
                                    _ => continue,
                                };

                                let display_name = json.get("DisplayName")
                                    .and_then(|v| v.as_str())
                                    .filter(|s| !s.trim().is_empty())
                                    .unwrap_or(&app_name)
                                    .to_string();

                                let install_location = json.get("InstallLocation")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string();

                                let launch_executable = json.get("LaunchExecutable")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string();

                                let install_size = json.get("InstallSize").and_then(|v| v.as_u64());

                                let full_exe_path = if !install_location.is_empty() && !launch_executable.is_empty() {
                                    let p = Path::new(&install_location).join(&launch_executable);
                                    if p.exists() {
                                        p.to_string_lossy().to_string()
                                    } else {
                                        launch_executable.clone()
                                    }
                                } else {
                                    launch_executable.clone()
                                };

                                let namespace = json.get("CatalogNamespace").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                let item_id = json.get("CatalogItemId").and_then(|v| v.as_str()).unwrap_or("").to_string();

                                let game = Game {
                                    id: format!("epic_{}", app_name),
                                    title: display_name.clone(),
                                    sorting_title: None,
                                    source: "Epic".to_string(),
                                    source_id: Some(app_name.clone()),
                                    install_directory: if install_location.is_empty() { None } else { Some(install_location) },
                                    executable_path: if full_exe_path.is_empty() { None } else { Some(full_exe_path) },
                                    launch_arguments: None,
                                    is_installed: true,
                                    is_favorite: false,
                                    cover_image: None,
                                    background_image: None,
                                    logo_image: None,
                                    icon_image: None,
                                    developer: None,
                                    publisher: None,
                                    release_date: None,
                                    genres: Vec::new(),
                                    features: Vec::new(),
                                    platforms: vec!["Windows".to_string()],
                                    community_score: None,
                                    user_rating: None,
                                    playtime_seconds: 0,
                                    last_played: last_played_map.get(&app_name)
                                        .or_else(|| last_played_map.get(&app_name.to_lowercase()))
                                        .or_else(|| last_played_map.get(&item_id))
                                        .or_else(|| last_played_map.get(&namespace))
                                        .cloned(),
                                    date_added: Some(chrono::Local::now().format("%Y-%m-%d").to_string()),
                                    completion_status: None,
                                    description: None,
                                    notes: if !namespace.is_empty() && !item_id.is_empty() {
                                        Some(format!("namespace:{};item_id:{}", namespace, item_id))
                                    } else {
                                        None
                                    },
                                    links: {
                                        let slug = display_name.chars().filter(|c| c.is_alphanumeric() || c.is_whitespace() || *c == '-').collect::<String>().split_whitespace().collect::<Vec<&str>>().join("-").to_lowercase();
                                        vec![
                                            crate::models::GameLink {
                                                title: "Epic Games Store".to_string(),
                                                url: format!("https://store.epicgames.com/p/{}", slug),
                                            }
                                        ]
                                    },
                                    screenshots: Vec::new(),
                                    size_on_disk: install_size,
                                    trailers: Vec::new(),
                                    age_rating: None,
                                    critic_score: None,
                                    series: None,
                                    hltb_main: None,
                                    hltb_extra: None,
                                    hltb_completionist: None,
                                    tags: Vec::new(),
                                    categories: Vec::new(),
                                    region: None,
                                    play_count: Some(0),
                                };

                                seen_ids.insert(game.id.clone());
                                games.push(game);
                            }
                        }
                    }
                }
            }
        }

        // 2b. Scan third-party managed apps (Ubisoft, EA/Origin, etc.)
        let third_party_dir = data_dir.join("ThirPartyManagedApps");
        if third_party_dir.exists() && third_party_dir.is_dir() {
            if let Ok(entries) = fs::read_dir(&third_party_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().and_then(|ext| ext.to_str()) == Some("json") {
                        if let Ok(bytes) = fs::read(&path) {
                            if let Some(json) = Self::decode_json_bytes(&bytes) {
                                let app_name = match json.get("AppName").and_then(|v| v.as_str()) {
                                    Some(s) if !s.trim().is_empty() => s.to_string(),
                                    _ => continue,
                                };

                                let game_id = format!("epic_{}", app_name);
                                if seen_ids.contains(&game_id) {
                                    continue;
                                }

                                let title = json.get("Title")
                                    .and_then(|v| v.as_str())
                                    .filter(|s| !s.trim().is_empty())
                                    .unwrap_or(&app_name)
                                    .to_string();

                                let reg_path = json.get("RegistryPath").and_then(|v| v.as_str()).unwrap_or("");
                                let reg_key = json.get("RegistryKey").and_then(|v| v.as_str()).unwrap_or("");

                                let mut install_location = None;
                                if !reg_path.is_empty() && !reg_key.is_empty() {
                                    if let Some(val) = Self::read_hklm_registry_string(reg_path, reg_key) {
                                        let p = PathBuf::from(&val);
                                        if p.exists() {
                                            install_location = Some(val);
                                        }
                                    }
                                }

                                // If the install directory is present on this machine, it is installed!
                                if let Some(install_dir) = install_location {
                                    let mut full_exe_path = None;
                                    let dir_path = Path::new(&install_dir);
                                    if dir_path.exists() {
                                        if let Ok(dir_entries) = fs::read_dir(dir_path) {
                                            for de in dir_entries.flatten() {
                                                let ep = de.path();
                                                if ep.is_file() && ep.extension().and_then(|ext| ext.to_str()).map(|e| e.eq_ignore_ascii_case("exe")).unwrap_or(false) {
                                                    let name = ep.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
                                                    if !name.contains("unins") && !name.contains("crash") && !name.contains("setup") && !name.contains("report") {
                                                        full_exe_path = Some(ep.to_string_lossy().to_string());
                                                        break;
                                                    }
                                                }
                                            }
                                        }
                                    }

                                    let namespace = json.get("Namespace").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                    let item_id = json.get("CatalogID").and_then(|v| v.as_str()).unwrap_or("").to_string();

                                    let game = Game {
                                        id: game_id.clone(),
                                        title: title.clone(),
                                        sorting_title: None,
                                        source: "Epic".to_string(),
                                        source_id: Some(app_name.clone()),
                                        install_directory: Some(install_dir),
                                        executable_path: full_exe_path,
                                        launch_arguments: None,
                                        is_installed: true,
                                        is_favorite: false,
                                        cover_image: None,
                                        background_image: None,
                                        logo_image: None,
                                        icon_image: None,
                                        developer: None,
                                        publisher: None,
                                        release_date: None,
                                        genres: Vec::new(),
                                        features: Vec::new(),
                                        platforms: vec!["Windows".to_string()],
                                        community_score: None,
                                        user_rating: None,
                                        playtime_seconds: 0,
                                        last_played: last_played_map.get(&app_name)
                                            .or_else(|| last_played_map.get(&app_name.to_lowercase()))
                                            .or_else(|| last_played_map.get(&item_id))
                                            .or_else(|| last_played_map.get(&namespace))
                                            .cloned(),
                                        date_added: Some(chrono::Local::now().format("%Y-%m-%d").to_string()),
                                        completion_status: None,
                                        description: None,
                                        notes: if !namespace.is_empty() && !item_id.is_empty() {
                                            Some(format!("namespace:{};item_id:{}", namespace, item_id))
                                        } else {
                                            None
                                        },
                                        links: {
                                            let slug = title.chars().filter(|c| c.is_alphanumeric() || c.is_whitespace() || *c == '-').collect::<String>().split_whitespace().collect::<Vec<&str>>().join("-").to_lowercase();
                                            vec![
                                                crate::models::GameLink {
                                                    title: "Epic Games Store".to_string(),
                                                    url: format!("https://store.epicgames.com/p/{}", slug),
                                                }
                                            ]
                                        },
                                        screenshots: Vec::new(),
                                        size_on_disk: None,
                                        trailers: Vec::new(),
                                        age_rating: None,
                                        critic_score: None,
                                        series: None,
                                        hltb_main: None,
                                        hltb_extra: None,
                                        hltb_completionist: None,
                                        tags: Vec::new(),
                                        categories: Vec::new(),
                                        region: None,
                                        play_count: Some(0),
                                    };

                                    seen_ids.insert(game_id);
                                    games.push(game);
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(games)
    }

    /// 3. Exchange an authorization code or exchange code for OAuth2 tokens
    pub async fn exchange_code_for_token(code: &str) -> Result<EpicAuthResponse, String> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .map_err(|e| e.to_string())?;

        let url = "https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/token";

        // Try authorization_code first
        let mut params = HashMap::new();
        params.insert("grant_type", "authorization_code");
        params.insert("code", code);
        params.insert("token_type", "eg1");

        let resp = client.post(url)
            .header("Authorization", EPIC_BASIC_AUTH)
            .header("User-Agent", "OpenPlay/0.1.0")
            .form(&params)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if resp.status().is_success() {
            return resp.json::<EpicAuthResponse>().await.map_err(|e| e.to_string());
        }

        // Fallback to exchange_code
        let mut exchange_params = HashMap::new();
        exchange_params.insert("grant_type", "exchange_code");
        exchange_params.insert("exchange_code", code);
        exchange_params.insert("token_type", "eg1");

        let resp2 = client.post(url)
            .header("Authorization", EPIC_BASIC_AUTH)
            .header("User-Agent", "OpenPlay/0.1.0")
            .form(&exchange_params)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if resp2.status().is_success() {
            resp2.json::<EpicAuthResponse>().await.map_err(|e| e.to_string())
        } else {
            let err_body = resp2.text().await.unwrap_or_default();
            Err(format!("Epic authentication failed: {}", err_body))
        }
    }

    /// 4. Refresh token
    pub async fn refresh_access_token(refresh_token: &str) -> Result<EpicAuthResponse, String> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .map_err(|e| e.to_string())?;

        let url = "https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/token";

        let mut params = HashMap::new();
        params.insert("grant_type", "refresh_token");
        params.insert("refresh_token", refresh_token);
        params.insert("token_type", "eg1");

        let resp = client.post(url)
            .header("Authorization", EPIC_BASIC_AUTH)
            .header("User-Agent", "OpenPlay/0.1.0")
            .form(&params)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if resp.status().is_success() {
            resp.json::<EpicAuthResponse>().await.map_err(|e| e.to_string())
        } else {
            let err_body = resp.text().await.unwrap_or_default();
            Err(format!("Epic token refresh failed: {}", err_body))
        }
    }

    /// 5. Fetch user's owned games list from Epic's live cloud library service with cursor pagination
    pub async fn fetch_owned_library(access_token: &str) -> Result<Vec<EpicOwnedGame>, String> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(25))
            .build()
            .map_err(|e| e.to_string())?;

        let mut raw_records = Vec::new();
        let mut cursor: Option<String> = None;

        // Step 1: Paginate through library-service items
        for _page in 0..30 {
            let mut url = "https://library-service.live.use1a.on.epicgames.com/library/api/public/items?includeMetadata=true".to_string();
            if let Some(ref c) = cursor {
                url.push_str(&format!("&cursor={}", c));
            }

            let resp = client.get(&url)
                .header("Authorization", format!("bearer {}", access_token))
                .header("User-Agent", "OpenPlay/0.1.0")
                .send()
                .await
                .map_err(|e| e.to_string())?;

            if !resp.status().is_success() {
                break;
            }

            let json: Value = resp.json().await.map_err(|e| e.to_string())?;
            let records = if let Some(arr) = json.as_array() {
                arr.clone()
            } else if let Some(rec) = json.get("records").and_then(|v| v.as_array()) {
                rec.clone()
            } else {
                Vec::new()
            };

            for item in records {
                let sandbox_name = item.get("sandboxName").and_then(|v| v.as_str()).unwrap_or("");
                let sb_lower = sandbox_name.to_lowercase();
                // Filter out non-game marketplace asset packages
                if sb_lower == "fab-listing-live" || sb_lower == "ue marketplace" {
                    continue;
                }
                raw_records.push(item);
            }

            cursor = json.get("responseMetadata")
                .and_then(|m| m.get("nextCursor"))
                .and_then(|v| v.as_str())
                .filter(|s| !s.trim().is_empty())
                .map(|s| s.to_string());

            if cursor.is_none() {
                break;
            }
        }

        // Step 2: Extract distinct catalog item IDs
        let mut catalog_ids = Vec::new();
        let mut seen_cat_ids = HashSet::new();
        for r in &raw_records {
            if let Some(cid) = r.get("catalogItemId").and_then(|v| v.as_str()) {
                if !cid.is_empty() && seen_cat_ids.insert(cid.to_string()) {
                    catalog_ids.push(cid.to_string());
                }
            }
        }

        // Step 3: Query catalog-public-service in bulk (chunks of 60 IDs)
        let mut catalog_map: HashMap<String, Value> = HashMap::new();
        for chunk in catalog_ids.chunks(60) {
            let bulk_url = format!(
                "https://catalog-public-service-prod06.ol.epicgames.com/catalog/api/shared/bulk/items?id={}",
                chunk.join("&id=")
            );
            if let Ok(c_resp) = client.get(&bulk_url)
                .header("Authorization", format!("bearer {}", access_token))
                .header("User-Agent", "OpenPlay/0.1.0")
                .send()
                .await
            {
                if c_resp.status().is_success() {
                    if let Ok(c_json) = c_resp.json::<HashMap<String, Value>>().await {
                        catalog_map.extend(c_json);
                    }
                }
            }
        }

        // Step 4: Assemble owned games with rich metadata
        let mut all_owned = Vec::new();
        let mut seen_titles = HashSet::new();

        for item in raw_records {
            let app_name = match item.get("appName").and_then(|v| v.as_str()) {
                Some(s) if !s.trim().is_empty() => s.to_string(),
                _ => continue,
            };

            let catalog_item_id = item.get("catalogItemId")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let namespace = item.get("namespace")
                .or_else(|| item.get("catalogNamespace"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let sandbox_name = item.get("sandboxName").and_then(|v| v.as_str()).unwrap_or("");
            let cat_info = catalog_map.get(&catalog_item_id);

            // Determine title and strip broken replacement chars
            let mut title = cat_info
                .and_then(|c| c.get("title"))
                .and_then(|v| v.as_str())
                .unwrap_or(sandbox_name)
                .replace('\u{FFFD}', "")
                .trim()
                .to_string();

            if title.is_empty() || title.to_lowercase() == "live" {
                title = app_name.clone();
            }

            let title_lower = title.to_lowercase();
            // Filter non-game marketplace / engine listings
            if title_lower == "fab-listing-live"
                || title_lower == "ue marketplace"
                || title_lower == "twinmotion"
                || title_lower == "unreal engine"
            {
                continue;
            }

            // Filter standalone DLCs / Addons if categories indicate addon without base game
            if let Some(cats) = cat_info.and_then(|c| c.get("categories")).and_then(|v| v.as_array()) {
                let paths: Vec<String> = cats.iter()
                    .filter_map(|c| c.get("path").and_then(|v| v.as_str()))
                    .map(|s| s.to_lowercase())
                    .collect();
                if paths.iter().any(|p| p == "addons" || p == "dlc")
                    && !paths.iter().any(|p| p == "games" || p == "applications" || p == "games/edition/base")
                {
                    continue;
                }
            }

            if seen_titles.contains(&title_lower) {
                continue;
            }
            seen_titles.insert(title_lower);

            // Extract cover and background artwork
            let mut cover_image = None;
            let mut background_image = None;

            if let Some(images) = cat_info.and_then(|c| c.get("keyImages")).and_then(|v| v.as_array()) {
                for img in images {
                    let itype = img.get("type").and_then(|v| v.as_str()).unwrap_or("");
                    let url = img.get("url").and_then(|v| v.as_str()).unwrap_or("");
                    if url.is_empty() {
                        continue;
                    }
                    if cover_image.is_none() && (itype == "DieselGameBoxTall" || itype == "OfferImageTall" || itype == "Thumbnail") {
                        cover_image = Some(url.to_string());
                    }
                    if background_image.is_none() && (itype == "DieselGameBox" || itype == "OfferImageWide" || itype == "Landscape") {
                        background_image = Some(url.to_string());
                    }
                }
            }

            let description = cat_info
                .and_then(|c| c.get("description"))
                .and_then(|v| v.as_str())
                .filter(|s| !s.trim().is_empty())
                .map(|s| s.trim().to_string());

            let developer = cat_info
                .and_then(|c| c.get("developer"))
                .and_then(|v| v.as_str())
                .filter(|s| !s.trim().is_empty())
                .map(|s| s.trim().to_string());

            let release_date = cat_info
                .and_then(|c| c.get("creationDate"))
                .and_then(|v| v.as_str())
                .map(|s| if let Some(pos) = s.find('T') { s[..pos].to_string() } else { s.to_string() });

            let mut genres = Vec::new();
            if let Some(cats) = cat_info.and_then(|c| c.get("categories")).and_then(|v| v.as_array()) {
                for c in cats {
                    if let Some(p) = c.get("path").and_then(|v| v.as_str()) {
                        let lower = p.to_lowercase();
                        if lower == "games"
                            || lower == "applications"
                            || lower == "public"
                            || lower == "software"
                            || lower == "freegames"
                            || lower == "dlc"
                            || lower == "addons"
                            || lower.starts_with("games/edition")
                        {
                            continue;
                        }
                        let tag = lower.split('/').last().unwrap_or(&lower).trim();
                        if !tag.is_empty() && !genres.iter().any(|g: &String| g.eq_ignore_ascii_case(tag)) {
                            let mut chars = tag.chars();
                            let capitalized = match chars.next() {
                                None => String::new(),
                                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                            };
                            genres.push(capitalized);
                        }
                    }
                }
            }

            all_owned.push(EpicOwnedGame {
                app_name,
                title,
                namespace,
                catalog_item_id,
                cover_image,
                background_image,
                description,
                developer,
                release_date,
                genres,
            });
        }

        Ok(all_owned)
    }

    /// 6. Fetch user's recorded playtime across all Epic titles from Epic's live library service
    pub async fn fetch_playtime(account_id: &str, access_token: &str) -> Result<HashMap<String, u64>, String> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .map_err(|e| e.to_string())?;

        let url = format!(
            "https://library-service.live.use1a.on.epicgames.com/library/api/public/playtime/account/{}/all",
            account_id
        );

        let resp = client.get(&url)
            .header("Authorization", format!("bearer {}", access_token))
            .header("User-Agent", "OpenPlay/0.1.0")
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if resp.status() == reqwest::StatusCode::UNAUTHORIZED || resp.status() == reqwest::StatusCode::FORBIDDEN {
            return Err("Epic access token expired".to_string());
        }
        if !resp.status().is_success() {
            return Ok(HashMap::new());
        }

        let items: Vec<Value> = resp.json().await.unwrap_or_default();
        let mut map = HashMap::new();

        for item in items {
            if let Some(artifact_id) = item.get("artifactId").and_then(|v| v.as_str()) {
                let total_time = item.get("totalTime").and_then(|v| v.as_u64()).unwrap_or(0);
                if total_time > 0 {
                    map.insert(artifact_id.to_string(), total_time);
                    map.insert(artifact_id.to_lowercase(), total_time);
                }
            }
        }

        Ok(map)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_find_epic_data_dir() {
        let dir = EpicScanner::find_epic_data_dir();
        assert!(dir.is_some());
    }

    #[test]
    fn test_scan_installed_epic_games() {
        let games = EpicScanner::scan_installed_games().expect("Scanning installed Epic games failed");
        assert!(games.len() >= 2, "Expected at least two installed Epic games (Maneater + Assassin's Creed Valhalla), found {}", games.len());
        let maneater = games.iter().find(|g| g.title.to_lowercase().contains("maneater"));
        assert!(maneater.is_some(), "Expected Maneater to be detected from .item manifest");
        let ac = games.iter().find(|g| g.title.to_lowercase().contains("assassin"));
        assert!(ac.is_some(), "Expected Assassin's Creed to be detected from ThirPartyManagedApps");
    }
}
