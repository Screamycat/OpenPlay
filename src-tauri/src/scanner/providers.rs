use crate::models::Game;
use crate::scanner::playnite::PlayniteScanner;
use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderAuthResult {
    pub account_id: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub access_token: String,
    pub refresh_token: Option<String>,
}

pub fn url_encode(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for b in input.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => {
                out.push_str(&format!("%{:02X}", b));
            }
        }
    }
    out
}

pub fn url_decode(input: &str) -> String {
    let mut bytes = Vec::with_capacity(input.len());
    let raw = input.as_bytes();
    let mut i = 0;
    while i < raw.len() {
        if raw[i] == b'%' && i + 2 < raw.len() {
            if let Ok(hex_str) = std::str::from_utf8(&raw[i + 1..i + 3]) {
                if let Ok(val) = u8::from_str_radix(hex_str, 16) {
                    bytes.push(val);
                    i += 3;
                    continue;
                }
            }
        } else if raw[i] == b'+' {
            bytes.push(b' ');
            i += 1;
            continue;
        }
        bytes.push(raw[i]);
        i += 1;
    }
    String::from_utf8_lossy(&bytes).into_owned()
}

#[cfg(target_os = "windows")]
fn run_powershell_json(script: &str) -> Vec<Value> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    if let Ok(output) = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
    {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let trimmed = stdout.trim();
        if !trimmed.is_empty() {
            if let Ok(val) = serde_json::from_str::<Value>(trimmed) {
                if let Some(arr) = val.as_array() {
                    return arr.clone();
                } else if val.is_object() {
                    return vec![val];
                }
            }
        }
    }
    Vec::new()
}

// ============================================================================
// 1. GOG GALAXY SCANNER (Local Registry + Galaxy 2.0 DB + Cloud OAuth2)
// ============================================================================
pub struct GogScanner;

impl GogScanner {
    const CLIENT_ID: &'static str = "46899977096215655";
    const CLIENT_SECRET: &'static str = "9d85c43b1482497dbbce61f6e4aa173a433796eeae2ca8c5f6129f2dc4de46d9";
    const REDIRECT_URI: &'static str = "https://embed.gog.com/on_login_success?origin=client";

    pub async fn exchange_code_for_token(code: &str) -> Result<ProviderAuthResult, String> {
        let client = reqwest::Client::new();
        let token_url = format!(
            "https://auth.gog.com/token?client_id={}&client_secret={}&grant_type=authorization_code&code={}&redirect_uri={}",
            Self::CLIENT_ID,
            Self::CLIENT_SECRET,
            url_encode(code),
            url_encode(Self::REDIRECT_URI)
        );

        let resp = client
            .get(&token_url)
            .send()
            .await
            .map_err(|e| format!("GOG token request failed: {}", e))?;

        if !resp.status().is_success() {
            let err_txt = resp.text().await.unwrap_or_default();
            return Err(format!("GOG auth failed: {}", err_txt));
        }

        let json: Value = resp.json().await.map_err(|e| e.to_string())?;
        let access_token = json["access_token"]
            .as_str()
            .ok_or("Missing access_token from GOG")?
            .to_string();
        let refresh_token = json["refresh_token"].as_str().map(|s| s.to_string());
        let user_id = json["user_id"]
            .as_str()
            .unwrap_or("gog_user")
            .to_string();

        // Fetch username & avatar from embed.gog.com/userData.json
        let mut display_name = format!("GOG User ({})", user_id);
        let mut avatar_url = None;

        if let Ok(u_resp) = client
            .get("https://embed.gog.com/userData.json")
            .bearer_auth(&access_token)
            .send()
            .await
        {
            if let Ok(u_json) = u_resp.json::<Value>().await {
                if let Some(uname) = u_json["username"].as_str() {
                    if !uname.is_empty() {
                        display_name = uname.to_string();
                    }
                }
                if let Some(av) = u_json["avatar"]["medium"].as_str().or_else(|| u_json["avatar"]["small"].as_str()) {
                    if !av.is_empty() {
                        avatar_url = Some(if av.starts_with("http") {
                            av.to_string()
                        } else {
                            format!("https:{}", av)
                        });
                    }
                }
            }
        }

        // Fallback to users.gog.com/users/{user_id} if username was not returned
        if display_name.starts_with("GOG User") {
            let galaxy_url = format!("https://users.gog.com/users/{}", user_id);
            if let Ok(g_resp) = client.get(&galaxy_url).send().await {
                if let Ok(g_json) = g_resp.json::<Value>().await {
                    if let Some(uname) = g_json["username"].as_str() {
                        if !uname.trim().is_empty() {
                            display_name = uname.trim().to_string();
                        }
                    }
                    if avatar_url.is_none() {
                        if let Some(img_id) = g_json["avatar"]["gog_image_id"].as_str() {
                            if !img_id.is_empty() {
                                avatar_url = Some(format!("https://images.gog.com/{}.jpg", img_id));
                            }
                        }
                    }
                }
            }
        }

        Ok(ProviderAuthResult {
            account_id: user_id,
            display_name,
            avatar_url,
            access_token,
            refresh_token,
        })
    }

    pub async fn refresh_access_token(refresh_token: &str) -> Result<ProviderAuthResult, String> {
        let client = reqwest::Client::new();
        let token_url = format!(
            "https://auth.gog.com/token?client_id={}&client_secret={}&grant_type=refresh_token&refresh_token={}",
            Self::CLIENT_ID,
            Self::CLIENT_SECRET,
            url_encode(refresh_token)
        );

        let resp = client
            .get(&token_url)
            .send()
            .await
            .map_err(|e| format!("GOG refresh failed: {}", e))?;

        if !resp.status().is_success() {
            return Err("GOG token refresh rejected".to_string());
        }

        let json: Value = resp.json().await.map_err(|e| e.to_string())?;
        let access_token = json["access_token"]
            .as_str()
            .ok_or("Missing access_token")?
            .to_string();
        let new_refresh = json["refresh_token"]
            .as_str()
            .map(|s| s.to_string())
            .or_else(|| Some(refresh_token.to_string()));
        let user_id = json["user_id"].as_str().unwrap_or("gog_user").to_string();

        Ok(ProviderAuthResult {
            account_id: user_id,
            display_name: String::new(),
            avatar_url: None,
            access_token,
            refresh_token: new_refresh,
        })
    }

    /// Reads local playtimes (in seconds) from GOG Galaxy 2.0 SQLite DB if present,
    /// falling back to session playtime estimation from `UserAchievements` / `LastPlayedDates`
    /// when GOG Galaxy recorded `0` minutes despite unlocked achievements or play history.
    pub fn get_local_playtimes() -> HashMap<String, u64> {
        let mut map = HashMap::new();
        let db_path = PathBuf::from(r"C:\ProgramData\GOG.com\Galaxy\storage\galaxy-2.0.db");
        if !db_path.exists() {
            return map;
        }

        if let Ok(conn) = Connection::open_with_flags(&db_path, OpenFlags::SQLITE_OPEN_READ_ONLY) {
            if let Ok(mut stmt) = conn.prepare("SELECT releaseKey, minutesInGame FROM GameTimes") {
                if let Ok(rows) = stmt.query_map([], |row| {
                    let key: String = row.get(0)?;
                    let mins: i64 = row.get(1)?;
                    Ok((key, mins))
                }) {
                    for r in rows.flatten() {
                        if let Some(gog_id) = r.0.strip_prefix("gog_") {
                            if r.1 > 0 {
                                map.insert(gog_id.to_string(), (r.1 as u64) * 60);
                            }
                        }
                    }
                }
            }

            // Fallback: if Galaxy recorded 0 minutes in GameTimes for a played game (e.g. DREDGE),
            // estimate session playtime from UserAchievements unlock timestamps per day!
            if let Ok(mut stmt) = conn.prepare(
                "SELECT gameReleaseKey, unlockTime FROM UserAchievements WHERE isUnlocked = 1 AND unlockTime IS NOT NULL",
            ) {
                if let Ok(rows) = stmt.query_map([], |row| {
                    let key: String = row.get(0)?;
                    let unlock_time: String = row.get(1)?;
                    Ok((key, unlock_time))
                }) {
                    let mut by_game_day: HashMap<String, HashMap<String, Vec<i64>>> = HashMap::new();
                    for (key, unlock_time) in rows.flatten() {
                        if let Some(gog_id) = key.strip_prefix("gog_") {
                            if map.get(gog_id).copied().unwrap_or(0) > 0 {
                                continue;
                            }
                            let day = unlock_time.get(..10).unwrap_or(&unlock_time).to_string();
                            let ts = chrono::NaiveDateTime::parse_from_str(
                                unlock_time.get(..19).unwrap_or(&unlock_time),
                                "%Y-%m-%d %H:%M:%S",
                            )
                            .map(|dt| dt.and_utc().timestamp())
                            .unwrap_or(0);
                            by_game_day
                                .entry(gog_id.to_string())
                                .or_default()
                                .entry(day)
                                .or_default()
                                .push(ts);
                        }
                    }
                    for (gog_id, days_map) in by_game_day {
                        let mut total_secs: u64 = 0;
                        for (_day, mut timestamps) in days_map {
                            timestamps.sort_unstable();
                            let span = if timestamps.len() >= 2 {
                                let diff = (timestamps.last().unwrap() - timestamps.first().unwrap()).max(0) as u64;
                                diff.min(6 * 3600) + 2700 // span between first & last achievement that day + 45m buffer
                            } else {
                                3600 // ~1h session for a single-unlock day
                            };
                            total_secs += span;
                        }
                        if total_secs > 0 {
                            map.insert(gog_id, total_secs);
                        }
                    }
                }
            }
        }
        map
    }

    /// Reads local last played dates from GOG Galaxy 2.0 SQLite DB (`LastPlayedDates`)
    pub fn get_local_last_played() -> HashMap<String, String> {
        let mut map = HashMap::new();
        let db_path = PathBuf::from(r"C:\ProgramData\GOG.com\Galaxy\storage\galaxy-2.0.db");
        if !db_path.exists() {
            return map;
        }

        if let Ok(conn) = Connection::open_with_flags(&db_path, OpenFlags::SQLITE_OPEN_READ_ONLY) {
            if let Ok(mut stmt) = conn.prepare("SELECT gameReleaseKey, lastPlayedDate FROM LastPlayedDates") {
                if let Ok(rows) = stmt.query_map([], |row| {
                    let key: String = row.get(0)?;
                    let date_str: String = row.get(1)?;
                    Ok((key, date_str))
                }) {
                    for (key, date_str) in rows.flatten() {
                        let trimmed = date_str.trim();
                        if !trimmed.is_empty() {
                            if let Some(gog_id) = key.strip_prefix("gog_") {
                                let clean_date = trimmed.get(..10).unwrap_or(trimmed).to_string();
                                map.insert(gog_id.to_string(), clean_date);
                            }
                        }
                    }
                }
            }
        }
        map
    }

    /// Fetches cloud playtimes (in seconds) and last played dates from GOG User Stats API
    pub async fn fetch_cloud_stats(
        username: &str,
        user_id: &str,
        access_token: &str,
    ) -> (HashMap<String, u64>, HashMap<String, String>) {
        let mut playtimes = HashMap::new();
        let mut last_played = HashMap::new();
        let client = reqwest::Client::new();

        let mut resolved_username = username.trim().to_string();
        if (resolved_username.is_empty() || resolved_username.starts_with("GOG User"))
            && !user_id.trim().is_empty()
        {
            let galaxy_url = format!("https://users.gog.com/users/{}", user_id.trim());
            if let Ok(g_resp) = client.get(&galaxy_url).send().await {
                if let Ok(g_json) = g_resp.json::<Value>().await {
                    if let Some(uname) = g_json["username"].as_str() {
                        if !uname.trim().is_empty() {
                            resolved_username = uname.trim().to_string();
                        }
                    }
                }
            }
        }

        if resolved_username.is_empty() || access_token.trim().is_empty() {
            return (playtimes, last_played);
        }

        let mut page = 1;
        let mut total_pages = 1;

        while page <= total_pages && page <= 15 {
            let url = format!(
                "https://www.gog.com/u/{}/games/stats?sort=recent_playtime&limit=200&page={}",
                url_encode(&resolved_username),
                page
            );

            let Ok(resp) = client.get(&url).bearer_auth(access_token).send().await else {
                break;
            };
            if !resp.status().is_success() {
                break;
            }
            let Ok(json) = resp.json::<Value>().await else {
                break;
            };

            total_pages = json["pages"].as_u64().unwrap_or(1) as usize;
            if let Some(items) = json["_embedded"]["items"].as_array() {
                for item in items {
                    let gid = item["game"]["id"]
                        .as_str()
                        .map(|s| s.to_string())
                        .or_else(|| item["game"]["id"].as_i64().map(|n| n.to_string()))
                        .unwrap_or_default();
                    if gid.is_empty() {
                        continue;
                    }

                    // stats object is keyed by userId or contains first entry
                    let stat_obj = if !user_id.is_empty() && item["stats"][user_id].is_object() {
                        Some(&item["stats"][user_id])
                    } else {
                        item["stats"].as_object().and_then(|m| m.values().next())
                    };

                    if let Some(st) = stat_obj {
                        if let Some(mins) = st["playtime"].as_u64() {
                            if mins > 0 {
                                playtimes.insert(gid.clone(), mins * 60);
                            }
                        }
                        if let Some(ls) = st["last_session"].as_str().or_else(|| st["lastSession"].as_str()) {
                            if !ls.trim().is_empty() && !ls.starts_with("000") {
                                let clean_date = ls.get(..10).unwrap_or(ls).to_string();
                                last_played.insert(gid, clean_date);
                            }
                        }
                    }
                }
            }
            page += 1;
        }

        (playtimes, last_played)
    }

    /// Fetches GOG achievements for a game (`gog_product_id`) from local `galaxy-2.0.db` and/or GOG Cloud `gameplay.gog.com`
    pub async fn fetch_gog_achievements(
        game_id: &str,
        gog_product_id: &str,
        user_id: Option<&str>,
        access_token: Option<&str>,
    ) -> Result<Vec<crate::models::Achievement>, String> {
        let mut results: Vec<crate::models::Achievement> = Vec::new();
        let pid = gog_product_id.trim().trim_start_matches("gog_");
        if pid.is_empty() {
            return Ok(results);
        }

        // 1. Try GOG Cloud Gameplay API if user_id and access_token are available
        if let (Some(uid), Some(tok)) = (user_id, access_token) {
            if !uid.trim().is_empty() && !tok.trim().is_empty() {
                let url = format!(
                    "https://gameplay.gog.com/clients/{}/users/{}/achievements",
                    pid,
                    uid.trim()
                );
                let client = reqwest::Client::new();
                if let Ok(resp) = client
                    .get(&url)
                    .bearer_auth(tok.trim())
                    .header("Accept", "application/json")
                    .header("X-GOG-Lc", "en-US")
                    .send()
                    .await
                {
                    if resp.status().is_success() {
                        if let Ok(json) = resp.json::<Value>().await {
                            if let Some(items) = json["items"].as_array() {
                                for item in items {
                                    let api_name = item["achievement_key"]
                                        .as_str()
                                        .or_else(|| item["achievement_id"].as_str())
                                        .unwrap_or("")
                                        .to_string();
                                    let display_name = item["name"]
                                        .as_str()
                                        .unwrap_or(&api_name)
                                        .trim()
                                        .to_string();
                                    if api_name.is_empty() || display_name.is_empty() {
                                        continue;
                                    }
                                    let description = item["description"]
                                        .as_str()
                                        .map(|s| s.trim().to_string())
                                        .filter(|s| !s.is_empty());
                                    let icon_url = item["image_url_unlocked"]
                                        .as_str()
                                        .unwrap_or("")
                                        .to_string();
                                    let icon_gray_url = item["image_url_locked"]
                                        .as_str()
                                        .map(|s| s.to_string())
                                        .filter(|s| !s.is_empty());
                                    let date_unlocked = item["date_unlocked"]
                                        .as_str()
                                        .filter(|s| !s.trim().is_empty() && !s.starts_with("000"))
                                        .map(|s| s.get(..10).unwrap_or(s).to_string());
                                    let is_unlocked = date_unlocked.is_some();
                                    let rarity = item["rarity"].as_f64().unwrap_or(0.0);
                                    let is_secret = !item["visible"].as_bool().unwrap_or(true);

                                    results.push(crate::models::Achievement {
                                        game_id: game_id.to_string(),
                                        api_name,
                                        display_name,
                                        description,
                                        icon_url,
                                        icon_gray_url,
                                        is_unlocked,
                                        unlock_time: date_unlocked,
                                        rarity_percentage: (rarity * 10.0).round() / 10.0,
                                        is_secret,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        if !results.is_empty() {
            return Ok(results);
        }

        // 2. Fallback / Offline: Read directly from local GOG Galaxy 2.0 SQLite DB (`galaxy-2.0.db`)
        let db_path = PathBuf::from(r"C:\ProgramData\GOG.com\Galaxy\storage\galaxy-2.0.db");
        if db_path.exists() {
            if let Ok(conn) = Connection::open_with_flags(&db_path, OpenFlags::SQLITE_OPEN_READ_ONLY) {
                let release_key = format!("gog_{}", pid);
                let sql = "
                    SELECT
                        a.apikey,
                        COALESCE(la.name, a.apikey),
                        la.description,
                        a.imageUnlockedUrl,
                        a.imageLockedUrl,
                        a.isVisible,
                        a.rarity,
                        ua.isUnlocked,
                        ua.unlockTime
                    FROM Achievements a
                    LEFT JOIN LocalizedAchievements la
                        ON la.gameReleaseKey = a.gameReleaseKey AND la.apikey = a.apikey
                    LEFT JOIN UserAchievements ua
                        ON ua.gameReleaseKey = a.gameReleaseKey AND ua.apikey = a.apikey
                    WHERE a.gameReleaseKey = ?1
                    GROUP BY a.apikey
                ";
                if let Ok(mut stmt) = conn.prepare(sql) {
                    if let Ok(rows) = stmt.query_map([&release_key], |row| {
                        let api_name: String = row.get(0)?;
                        let name: String = row.get::<_, String>(1).unwrap_or_else(|_| api_name.clone());
                        let desc: Option<String> = row.get(2).ok();
                        let unlocked_url: String = row.get::<_, String>(3).unwrap_or_default();
                        let locked_url: Option<String> = row.get(4).ok();
                        let visible: i32 = row.get::<_, i32>(5).unwrap_or(1);
                        let rarity: f64 = row.get::<_, f64>(6).unwrap_or(0.0);
                        let is_unlocked_int: i32 = row.get::<_, i32>(7).unwrap_or(0);
                        let unlock_time_raw: Option<String> = row.get(8).ok();

                        let unlock_time = unlock_time_raw
                            .filter(|s| !s.trim().is_empty())
                            .map(|s| s.get(..10).unwrap_or(&s).to_string());

                        Ok(crate::models::Achievement {
                            game_id: game_id.to_string(),
                            api_name,
                            display_name: name,
                            description: desc.filter(|s| !s.trim().is_empty()),
                            icon_url: unlocked_url,
                            icon_gray_url: locked_url.filter(|s| !s.trim().is_empty()),
                            is_unlocked: is_unlocked_int != 0 || unlock_time.is_some(),
                            unlock_time,
                            rarity_percentage: (rarity * 10.0).round() / 10.0,
                            is_secret: visible == 0,
                        })
                    }) {
                        for r in rows.flatten() {
                            results.push(r);
                        }
                    }
                }
            }
        }

        Ok(results)
    }

    /// Scans locally installed GOG games via Windows Registry, `goggame-*.info` files, and Galaxy 2.0 DB
    pub fn scan_installed_games() -> Result<Vec<Game>, String> {
        let mut games = Vec::new();
        let mut seen_ids = HashSet::new();
        let now_str = chrono::Local::now().format("%Y-%m-%d").to_string();
        let playtimes = Self::get_local_playtimes();
        let last_played_map = Self::get_local_last_played();

        // Preload titles & artwork from galaxy-2.0.db LimitedDetails & GamePieces
        let mut db_titles: HashMap<String, String> = HashMap::new();
        let mut db_covers: HashMap<String, String> = HashMap::new();
        let mut db_backgrounds: HashMap<String, String> = HashMap::new();
        let db_path = PathBuf::from(r"C:\ProgramData\GOG.com\Galaxy\storage\galaxy-2.0.db");
        if db_path.exists() {
            if let Ok(conn) = Connection::open_with_flags(&db_path, OpenFlags::SQLITE_OPEN_READ_ONLY) {
                if let Ok(mut stmt) = conn.prepare("SELECT productId, title, images FROM LimitedDetails") {
                    if let Ok(rows) = stmt.query_map([], |row| {
                        let pid: i64 = row.get(0)?;
                        let title: String = row.get::<_, String>(1).unwrap_or_default();
                        let images: String = row.get::<_, String>(2).unwrap_or_default();
                        Ok((pid.to_string(), title, images))
                    }) {
                        for (pid, title, images_json) in rows.flatten() {
                            if !title.trim().is_empty() {
                                db_titles.insert(pid.clone(), title.trim().to_string());
                            }
                            if let Ok(img_val) = serde_json::from_str::<Value>(&images_json) {
                                if let Some(logo) = img_val["logo2x"].as_str().or_else(|| img_val["logo"].as_str()) {
                                    let url = if logo.starts_with("http") {
                                        logo.to_string()
                                    } else {
                                        format!("https:{}", logo)
                                    };
                                    db_covers.insert(pid.clone(), url);
                                }
                                if let Some(bg) = img_val["background"].as_str() {
                                    let url = if bg.starts_with("http") {
                                        bg.to_string()
                                    } else {
                                        format!("https:{}", bg)
                                    };
                                    db_backgrounds.insert(pid, url);
                                }
                            }
                        }
                    }
                }
            }
        }

        // 1. Scan Windows Registry (`HKLM:\SOFTWARE\WOW6432Node\GOG.com\Games`)
        #[cfg(target_os = "windows")]
        {
            let ps_script = r#"
$ErrorActionPreference = 'SilentlyContinue'
$paths = @('HKLM:\SOFTWARE\WOW6432Node\GOG.com\Games', 'HKLM:\SOFTWARE\GOG.com\Games')
$results = @()
foreach ($p in $paths) {
    if (Test-Path $p) {
        Get-ChildItem $p | ForEach-Object {
            $prop = Get-ItemProperty $_.PSPath
            $results += [PSCustomObject]@{
                gameID = if ($prop.gameID) { [string]$prop.gameID } else { [string]$_.PSChildName }
                gameName = [string]$prop.gameName
                path = [string]$prop.path
                exe = [string]$prop.exe
                launchParam = [string]$prop.launchParam
            }
        }
    }
}
$results | ConvertTo-Json -Compress
"#;
            for item in run_powershell_json(ps_script) {
                let game_id = item["gameID"].as_str().unwrap_or("").trim().to_string();
                let game_name = item["gameName"].as_str().unwrap_or("").trim().to_string();
                let install_path = item["path"].as_str().unwrap_or("").trim().to_string();

                if game_id.is_empty()
                    || game_name.is_empty()
                    || install_path.is_empty()
                    || seen_ids.contains(&game_id)
                    || !Path::new(&install_path).exists()
                {
                    continue;
                }

                let exe_path = item["exe"]
                    .as_str()
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty() && Path::new(s).exists());
                let launch_param = item["launchParam"]
                    .as_str()
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty());

                let size_on_disk = PlayniteScanner::compute_folder_size(Path::new(&install_path));
                let pt = playtimes.get(&game_id).copied().unwrap_or(0);
                let lp = last_played_map.get(&game_id).cloned();

                seen_ids.insert(game_id.clone());
                games.push(Game {
                    id: format!("gog_{}", game_id),
                    title: db_titles.get(&game_id).cloned().unwrap_or(game_name),
                    source: "GOG".to_string(),
                    source_id: Some(game_id.clone()),
                    install_directory: Some(install_path),
                    executable_path: exe_path,
                    launch_arguments: launch_param,
                    cover_image: db_covers.get(&game_id).cloned(),
                    background_image: db_backgrounds.get(&game_id).cloned(),
                    is_installed: true,
                    playtime_seconds: pt,
                    last_played: lp,
                    size_on_disk,
                    platforms: vec!["PC (Windows)".to_string()],
                    date_added: Some(now_str.clone()),
                    completion_status: Some("Auto".to_string()),
                    ..Default::default()
                });
            }
        }

        // 2. Scan GOG Galaxy 2.0 DB (`InstalledBaseProducts` AND `PlayTasks` + `PlayTaskLaunchParameters`)
        if db_path.exists() {
            if let Ok(conn) = Connection::open_with_flags(&db_path, OpenFlags::SQLITE_OPEN_READ_ONLY) {
                // 2a. InstalledBaseProducts
                if let Ok(mut stmt) = conn.prepare("SELECT productId, installationPath FROM InstalledBaseProducts") {
                    if let Ok(rows) = stmt.query_map([], |row| {
                        let pid: i64 = row.get(0)?;
                        let path: String = row.get(1)?;
                        Ok((pid.to_string(), path))
                    }) {
                        for (pid, install_path) in rows.flatten() {
                            if seen_ids.contains(&pid) || !Path::new(&install_path).exists() {
                                continue;
                            }
                            let title = db_titles.get(&pid).cloned().unwrap_or_else(|| {
                                Path::new(&install_path)
                                    .file_name()
                                    .map(|n| n.to_string_lossy().to_string())
                                    .unwrap_or_else(|| format!("GOG Game {}", pid))
                            });
                            let size_on_disk =
                                PlayniteScanner::compute_folder_size(Path::new(&install_path));
                            let pt = playtimes.get(&pid).copied().unwrap_or(0);
                            let lp = last_played_map.get(&pid).cloned();

                            seen_ids.insert(pid.clone());
                            games.push(Game {
                                id: format!("gog_{}", pid),
                                title,
                                source: "GOG".to_string(),
                                source_id: Some(pid.clone()),
                                install_directory: Some(install_path),
                                cover_image: db_covers.get(&pid).cloned(),
                                background_image: db_backgrounds.get(&pid).cloned(),
                                is_installed: true,
                                playtime_seconds: pt,
                                last_played: lp,
                                size_on_disk,
                                platforms: vec!["PC (Windows)".to_string()],
                                date_added: Some(now_str.clone()),
                                completion_status: Some("Auto".to_string()),
                                ..Default::default()
                            });
                        }
                    }
                }

                // 2b. PlayTasks + PlayTaskLaunchParameters (catches imported/linked GOG games like Parkitect!)
                let pt_query = "
                    SELECT pt.gameReleaseKey, ptlp.executablePath, ptlp.commandLineArgs, ptlp.label
                    FROM PlayTasks pt
                    JOIN PlayTaskLaunchParameters ptlp ON pt.id = ptlp.playTaskId
                    WHERE pt.isPrimary = 1 AND ptlp.executablePath IS NOT NULL
                ";
                if let Ok(mut stmt) = conn.prepare(pt_query) {
                    if let Ok(rows) = stmt.query_map([], |row| {
                        let key: String = row.get(0)?;
                        let exe: String = row.get(1)?;
                        let args: Option<String> = row.get(2).ok();
                        let label: Option<String> = row.get(3).ok();
                        Ok((key, exe, args, label))
                    }) {
                        for (rel_key, exe_str, args, label) in rows.flatten() {
                            let Some(gog_id) = rel_key.strip_prefix("gog_") else {
                                continue;
                            };
                            let pid = gog_id.to_string();
                            if seen_ids.contains(&pid) {
                                continue;
                            }
                            let exe_path = Path::new(&exe_str);
                            if !exe_path.exists() {
                                continue;
                            }
                            let install_dir = exe_path
                                .parent()
                                .map(|p| p.to_string_lossy().to_string())
                                .unwrap_or_default();

                            // Also check if there is a goggame-<id>.info in install_dir for accurate name
                            let info_title = Self::read_goggame_info_title(Path::new(&install_dir), &pid);
                            let title = db_titles
                                .get(&pid)
                                .cloned()
                                .or(info_title)
                                .or_else(|| label.filter(|s| !s.trim().is_empty()))
                                .unwrap_or_else(|| {
                                    Path::new(&install_dir)
                                        .file_name()
                                        .map(|n| n.to_string_lossy().to_string())
                                        .unwrap_or_else(|| format!("GOG Game {}", pid))
                                });

                            let size_on_disk = if !install_dir.is_empty() {
                                PlayniteScanner::compute_folder_size(Path::new(&install_dir))
                            } else {
                                None
                            };
                            let pt = playtimes.get(&pid).copied().unwrap_or(0);
                            let lp = last_played_map.get(&pid).cloned();

                            seen_ids.insert(pid.clone());
                            games.push(Game {
                                id: format!("gog_{}", pid),
                                title,
                                source: "GOG".to_string(),
                                source_id: Some(pid.clone()),
                                install_directory: if install_dir.is_empty() { None } else { Some(install_dir) },
                                executable_path: Some(exe_str),
                                launch_arguments: args.filter(|s| !s.trim().is_empty()),
                                cover_image: db_covers.get(&pid).cloned(),
                                background_image: db_backgrounds.get(&pid).cloned(),
                                is_installed: true,
                                playtime_seconds: pt,
                                last_played: lp,
                                size_on_disk,
                                platforms: vec!["PC (Windows)".to_string()],
                                date_added: Some(now_str.clone()),
                                completion_status: Some("Auto".to_string()),
                                ..Default::default()
                            });
                        }
                    }
                }
            }
        }

        // 3. Scan standard GOG Galaxy Games folders on disk for `goggame-*.info` manifests
        let mut gog_roots = vec![
            PathBuf::from(r"C:\Program Files\GOG Galaxy\Games"),
            PathBuf::from(r"C:\Program Files (x86)\GOG Galaxy\Games"),
            PathBuf::from(r"C:\Games"),
            PathBuf::from(r"D:\Games"),
            PathBuf::from(r"D:\GOG Games"),
        ];
        if let Ok(cfg_str) = fs::read_to_string(r"C:\ProgramData\GOG.com\Galaxy\config.json") {
            if let Ok(cfg_val) = serde_json::from_str::<Value>(&cfg_str) {
                if let Some(lib_path) = cfg_val["libraryPath"].as_str() {
                    let pb = PathBuf::from(lib_path);
                    if !gog_roots.contains(&pb) {
                        gog_roots.push(pb);
                    }
                }
            }
        }

        for root in gog_roots {
            if !root.is_dir() {
                continue;
            }
            if let Ok(entries) = fs::read_dir(&root) {
                for entry in entries.flatten() {
                    let game_dir = entry.path();
                    if !game_dir.is_dir() {
                        continue;
                    }
                    if let Ok(files) = fs::read_dir(&game_dir) {
                        for file in files.flatten() {
                            let fp = file.path();
                            let fname = fp
                                .file_name()
                                .map(|n| n.to_string_lossy().to_string())
                                .unwrap_or_default();
                            if fname.starts_with("goggame-") && fname.ends_with(".info") {
                                if let Ok(content) = fs::read_to_string(&fp) {
                                    if let Ok(info) = serde_json::from_str::<Value>(&content) {
                                        let gid = info["gameId"].as_str().unwrap_or("").trim().to_string();
                                        let root_gid = info["rootGameId"].as_str().unwrap_or(&gid).trim().to_string();
                                        // Skip DLCs where rootGameId != gameId
                                        if gid.is_empty() || gid != root_gid || seen_ids.contains(&gid) {
                                            continue;
                                        }
                                        let name = info["name"]
                                            .as_str()
                                            .map(|s| s.trim().to_string())
                                            .filter(|s| !s.is_empty())
                                            .or_else(|| db_titles.get(&gid).cloned())
                                            .unwrap_or_else(|| {
                                                game_dir
                                                    .file_name()
                                                    .map(|n| n.to_string_lossy().to_string())
                                                    .unwrap_or_else(|| format!("GOG Game {}", gid))
                                            });

                                        let mut exe_path = None;
                                        if let Some(tasks) = info["playTasks"].as_array() {
                                            for t in tasks {
                                                if t["isPrimary"].as_bool() == Some(true) || exe_path.is_none() {
                                                    if let Some(rel_p) = t["path"].as_str() {
                                                        let full_p = game_dir.join(rel_p);
                                                        if full_p.exists() {
                                                            exe_path = Some(full_p.to_string_lossy().to_string());
                                                        }
                                                    }
                                                }
                                            }
                                        }

                                        let size_on_disk = PlayniteScanner::compute_folder_size(&game_dir);
                                        let pt = playtimes.get(&gid).copied().unwrap_or(0);
                                        let lp = last_played_map.get(&gid).cloned();

                                        seen_ids.insert(gid.clone());
                                        games.push(Game {
                                            id: format!("gog_{}", gid),
                                            title: name,
                                            source: "GOG".to_string(),
                                            source_id: Some(gid.clone()),
                                            install_directory: Some(game_dir.to_string_lossy().to_string()),
                                            executable_path: exe_path,
                                            cover_image: db_covers.get(&gid).cloned(),
                                            background_image: db_backgrounds.get(&gid).cloned(),
                                            is_installed: true,
                                            playtime_seconds: pt,
                                            last_played: lp,
                                            size_on_disk,
                                            platforms: vec!["PC (Windows)".to_string()],
                                            date_added: Some(now_str.clone()),
                                            completion_status: Some("Auto".to_string()),
                                            ..Default::default()
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(games)
    }

    fn read_goggame_info_title(dir: &Path, gid: &str) -> Option<String> {
        let info_path = dir.join(format!("goggame-{}.info", gid));
        let content = fs::read_to_string(info_path).ok()?;
        let val: Value = serde_json::from_str(&content).ok()?;
        val["name"].as_str().map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
    }

    /// Fetches owned games from GOG Cloud API
    pub async fn fetch_owned_games(
        access_token: &str,
        username: Option<&str>,
        user_id: Option<&str>,
    ) -> Result<Vec<Game>, String> {
        let client = reqwest::Client::new();
        let mut owned_games = Vec::new();
        let now_str = chrono::Local::now().format("%Y-%m-%d").to_string();
        let mut playtimes = Self::get_local_playtimes();
        let mut last_played_map = Self::get_local_last_played();

        if let (Some(uname), Some(uid)) = (username, user_id) {
            let (cloud_pt, cloud_lp) = Self::fetch_cloud_stats(uname, uid, access_token).await;
            for (k, v) in cloud_pt {
                let entry = playtimes.entry(k).or_insert(0);
                if v > *entry {
                    *entry = v;
                }
            }
            for (k, v) in cloud_lp {
                last_played_map.entry(k).or_insert(v);
            }
        }

        let mut page = 1;
        let mut total_pages = 1;

        while page <= total_pages && page <= 50 {
            let url = format!(
                "https://embed.gog.com/account/getFilteredProducts?mediaType=1&page={}",
                page
            );
            let resp = client
                .get(&url)
                .bearer_auth(access_token)
                .send()
                .await
                .map_err(|e| format!("Failed to fetch GOG library page {}: {}", page, e))?;

            if !resp.status().is_success() {
                return Err(format!("GOG library API returned HTTP {}", resp.status()));
            }

            let json: Value = resp.json().await.map_err(|e| e.to_string())?;
            total_pages = json["totalPages"].as_u64().unwrap_or(1) as usize;

            if let Some(products) = json["products"].as_array() {
                for prod in products {
                    let id_num = prod["id"].as_i64().unwrap_or(0);
                    if id_num <= 0 {
                        continue;
                    }
                    let id_str = id_num.to_string();
                    let title = match prod["title"].as_str() {
                        Some(t) if !t.trim().is_empty() => t.trim().to_string(),
                        _ => continue,
                    };

                    // Skip DLCs or goodies if marked
                    if prod["isGame"].as_bool() == Some(false) {
                        continue;
                    }

                    let cover_image = prod["image"].as_str().map(|img| {
                        if img.starts_with("http") {
                            format!("{}_glx_logo.jpg", img)
                        } else {
                            format!("https:{}_glx_logo.jpg", img)
                        }
                    });

                    let category = prod["category"]
                        .as_str()
                        .filter(|s| !s.is_empty())
                        .map(|s| vec![s.to_string()])
                        .unwrap_or_default();

                    let pt = playtimes.get(&id_str).copied().unwrap_or(0);
                    let lp = last_played_map.get(&id_str).cloned();

                    owned_games.push(Game {
                        id: format!("gog_{}", id_str),
                        title,
                        source: "GOG".to_string(),
                        source_id: Some(id_str),
                        cover_image,
                        genres: category,
                        is_installed: false,
                        playtime_seconds: pt,
                        last_played: lp,
                        platforms: vec!["PC (Windows)".to_string()],
                        date_added: Some(now_str.clone()),
                        completion_status: Some("Auto".to_string()),
                        ..Default::default()
                    });
                }
            }
            page += 1;
        }

        Ok(owned_games)
    }
}

// ============================================================================
// 2. XBOX / PC GAME PASS SCANNER (Local Appx/GamingRoot + Xbox Live XSTS Cloud)
// ============================================================================
pub struct XboxScanner;

impl XboxScanner {
    const CLIENT_ID: &'static str = "38cd2fa8-66fd-4760-afb2-405eb65d5b0c";
    const REDIRECT_URI: &'static str = "https://login.live.com/oauth20_desktop.srf";

    /// Exchanges a Microsoft OAuth2 authorization `code` OR `access_token` for Xbox Live XBL + XSTS token and profile info
    pub async fn authenticate_with_ms_token(code_or_token: &str) -> Result<ProviderAuthResult, String> {
        let client = reqwest::Client::new();
        let trimmed = code_or_token.trim();

        // If this is an authorization code (typically ~36-60 chars starting with M. or similar, not an Ew... / t=... access token),
        // first try exchanging it at login.live.com/oauth20_token.srf just like Playnite's XboxAccountClient.cs!
        let mut ms_access_token = trimmed.to_string();
        let mut ms_refresh_token: Option<String> = None;

        let form_body = format!(
            "grant_type=authorization_code&client_id={}&scope=Xboxlive.signin%20Xboxlive.offline_access&code={}&redirect_uri={}",
            Self::CLIENT_ID,
            url_encode(trimmed),
            url_encode(Self::REDIRECT_URI)
        );

        if let Ok(tok_resp) = client
            .post("https://login.live.com/oauth20_token.srf")
            .header("Content-Type", "application/x-www-form-urlencoded")
            .body(form_body)
            .send()
            .await
        {
            if tok_resp.status().is_success() {
                if let Ok(tok_json) = tok_resp.json::<Value>().await {
                    if let Some(at) = tok_json["access_token"].as_str() {
                        ms_access_token = at.to_string();
                    }
                    if let Some(rt) = tok_json["refresh_token"].as_str() {
                        ms_refresh_token = Some(rt.to_string());
                    }
                }
            }
        }

        // Step 1: XBL User Authenticate (try `d={token}`, `{token}`, and `t={token}` to handle both OAuth2 tokens and MBI_SSL RPS tickets)
        let candidate_tickets = [
            format!("d={}", ms_access_token),
            ms_access_token.clone(),
            format!("t={}", ms_access_token),
        ];

        let mut xbl_json_opt: Option<Value> = None;
        let mut last_status = reqwest::StatusCode::FORBIDDEN;

        for ticket in &candidate_tickets {
            let xbl_body = serde_json::json!({
                "Properties": {
                    "AuthMethod": "RPS",
                    "SiteName": "user.auth.xboxlive.com",
                    "RpsTicket": ticket
                },
                "RelyingParty": "http://auth.xboxlive.com",
                "TokenType": "JWT"
            });

            let xbl_resp = client
                .post("https://user.auth.xboxlive.com/user/authenticate")
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .header("x-xbl-contract-version", "1")
                .json(&xbl_body)
                .send()
                .await
                .map_err(|e| format!("XBL auth failed: {}", e))?;

            last_status = xbl_resp.status();
            if last_status.is_success() {
                if let Ok(j) = xbl_resp.json::<Value>().await {
                    xbl_json_opt = Some(j);
                    break;
                }
            }
        }

        let xbl_json = xbl_json_opt
            .ok_or_else(|| format!("Xbox Live authentication failed ({})", last_status))?;

        let xbl_token = xbl_json["Token"]
            .as_str()
            .ok_or("Missing XBL Token")?
            .to_string();
        let uhs = xbl_json["DisplayClaims"]["xui"][0]["uhs"]
            .as_str()
            .ok_or("Missing Xbox UHS claim")?
            .to_string();

        // Step 2: XSTS Authorize
        let xsts_body = serde_json::json!({
            "Properties": {
                "SandboxId": "RETAIL",
                "UserTokens": [xbl_token]
            },
            "RelyingParty": "http://xboxlive.com",
            "TokenType": "JWT"
        });

        let xsts_resp = client
            .post("https://xsts.auth.xboxlive.com/xsts/authorize")
            .header("Content-Type", "application/json")
            .header("Accept", "application/json")
            .header("x-xbl-contract-version", "1")
            .json(&xsts_body)
            .send()
            .await
            .map_err(|e| format!("XSTS auth failed: {}", e))?;

        if !xsts_resp.status().is_success() {
            return Err(format!("XSTS authorization failed ({})", xsts_resp.status()));
        }

        let xsts_json: Value = xsts_resp.json().await.map_err(|e| e.to_string())?;
        let xsts_token = xsts_json["Token"]
            .as_str()
            .ok_or("Missing XSTS Token")?
            .to_string();
        let xui = &xsts_json["DisplayClaims"]["xui"][0];
        let xuid = xui["xid"]
            .as_str()
            .unwrap_or("xbox_user")
            .to_string();
        let gamertag = xui["gtg"]
            .as_str()
            .unwrap_or("Xbox Player")
            .to_string();

        // Store combined "XBL3.0 x={uhs};{xsts_token}" in access_token for TitleHub requests
        let auth_header_val = format!("XBL3.0 x={};{}", uhs, xsts_token);

        Ok(ProviderAuthResult {
            account_id: xuid,
            display_name: gamertag,
            avatar_url: None,
            access_token: auth_header_val,
            refresh_token: ms_refresh_token,
        })
    }

    pub async fn refresh_xbox_auth(refresh_token: &str) -> Result<ProviderAuthResult, String> {
        let client = reqwest::Client::new();
        let form_body = format!(
            "grant_type=refresh_token&client_id={}&scope=Xboxlive.signin%20Xboxlive.offline_access&refresh_token={}&redirect_uri={}",
            Self::CLIENT_ID,
            url_encode(refresh_token),
            url_encode(Self::REDIRECT_URI)
        );

        let resp = client
            .post("https://login.live.com/oauth20_token.srf")
            .header("Content-Type", "application/x-www-form-urlencoded")
            .body(form_body)
            .send()
            .await
            .map_err(|e| format!("Xbox refresh failed: {}", e))?;

        if !resp.status().is_success() {
            return Err("Xbox refresh token rejected".to_string());
        }

        let json: Value = resp.json().await.map_err(|e| e.to_string())?;
        let access_token = json["access_token"].as_str().ok_or("Missing access_token")?;
        let new_refresh = json["refresh_token"].as_str().map(|s| s.to_string());

        let mut auth = Self::authenticate_with_ms_token(access_token).await?;
        if new_refresh.is_some() {
            auth.refresh_token = new_refresh;
        }
        Ok(auth)
    }

    /// Queries `userstats.xboxlive.com/batch` for `MinutesPlayed` across all given `titleIds`
    pub async fn fetch_playtimes_batch(
        xuid: &str,
        auth_header: &str,
        title_ids: &[String],
    ) -> HashMap<String, u64> {
        let mut map = HashMap::new();
        if title_ids.is_empty() || xuid.is_empty() || auth_header.is_empty() {
            return map;
        }

        let client = reqwest::Client::new();
        for chunk in title_ids.chunks(60) {
            let stats_arr: Vec<Value> = chunk
                .iter()
                .map(|tid| {
                    serde_json::json!({
                        "name": "MinutesPlayed",
                        "titleId": tid
                    })
                })
                .collect();

            let body = serde_json::json!({
                "arrangebyfield": "xuid",
                "xuids": [xuid],
                "stats": stats_arr
            });

            if let Ok(resp) = client
                .post("https://userstats.xboxlive.com/batch")
                .header("Authorization", auth_header)
                .header("x-xbl-contract-version", "2")
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .json(&body)
                .send()
                .await
            {
                if resp.status().is_success() {
                    if let Ok(json) = resp.json::<Value>().await {
                        if let Some(colls) = json["statlistscollection"].as_array() {
                            for coll in colls {
                                if let Some(stats) = coll["stats"].as_array() {
                                    for st in stats {
                                        let tid = st["titleid"]
                                            .as_str()
                                            .map(|s| s.to_string())
                                            .or_else(|| st["titleid"].as_i64().map(|n| n.to_string()))
                                            .unwrap_or_default();
                                        let val_mins = st["value"]
                                            .as_str()
                                            .and_then(|s| s.parse::<u64>().ok())
                                            .or_else(|| st["value"].as_u64())
                                            .unwrap_or(0);
                                        if !tid.is_empty() && val_mins > 0 {
                                            map.insert(tid, val_mins * 60);
                                        }
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

    /// Scans locally installed Xbox / Microsoft Store PC games via PowerShell AppxPackage + MicrosoftGame.config
    pub fn scan_installed_games() -> Result<Vec<Game>, String> {
        let mut games = Vec::new();
        let mut seen_ids = HashSet::new();
        let now_str = chrono::Local::now().format("%Y-%m-%d").to_string();

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;

            // Query installed Store packages that have MicrosoftGame.config or are located in XboxGames/WindowsApps
            let ps_script = r#"
$ErrorActionPreference = 'SilentlyContinue'
$startApps = @{}
Get-StartApps | ForEach-Object { $startApps[$_.AppID] = $_.Name }
$pkgs = Get-AppxPackage | Where-Object {
    $_.IsFramework -eq $false -and
    $_.SignatureKind -eq 'Store' -and
    $_.InstallLocation -ne $null -and
    $_.Name -notmatch '^(Microsoft\.(Windows|NET|VCLibs|UI|DirectX|Services|DesktopAppInstaller|StorePurchaseApp|XboxApp|GamingApp|GamingServices|XboxIdentityProvider|XboxSpeechToTextOverlay|XboxGameOverlay|XboxGamingOverlay|XboxTCUI|ScreenSketch|Paint|WindowsCalculator|WindowsCamera|WindowsAlarms|WindowsMaps|WindowsSoundRecorder|Bing|Zune|People|Todos|YourPhone|PowerAutomate|Outlook|Office|OneNote|Whiteboard|MSPaint|Photos|WindowsTerminal|WebMediaExtensions|VP9VideoExtensions|HEIFImageExtension|HEVCVideoExtension|RawImageExtension|AV1VideoExtension|MPEG2VideoExtension|WebpImageExtension)|NVIDIACorp|Realtek|Dolby|Intel|AMD|Synaptics|AppUp|Clipchamp|Spotify|Disney|Netflix|PrimeVideo|TikTok|Instagram|WhatsApp|Facebook|Messenger)'
}
$results = @()
foreach ($p in $pkgs) {
    $loc = $p.InstallLocation
    $hasGameCfg = Test-Path (Join-Path $loc 'MicrosoftGame.config')
    $isXboxDir = $loc -match 'XboxGames|ModifiableWindowsApps'
    if ($hasGameCfg -or $isXboxDir) {
        $pfn = $p.PackageFamilyName
        $aumid = ($startApps.Keys | Where-Object { $_ -like "$pfn!*" } | Select-Object -First 1)
        $title = if ($aumid -and $startApps[$aumid]) { $startApps[$aumid] } else { $p.Name }
        $results += [PSCustomObject]@{
            Name = $p.Name
            Title = $title
            InstallLocation = $loc
            PackageFamilyName = $pfn
            Aumid = if ($aumid) { $aumid } else { "$pfn!App" }
        }
    }
}
$results | ConvertTo-Json -Compress
"#;

            if let Ok(output) = std::process::Command::new("powershell")
                .args(["-NoProfile", "-NonInteractive", "-Command", ps_script])
                .creation_flags(CREATE_NO_WINDOW)
                .output()
            {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let trimmed = stdout.trim();
                if !trimmed.is_empty() {
                    if let Ok(val) = serde_json::from_str::<Value>(trimmed) {
                        let arr = if let Some(a) = val.as_array() {
                            a.clone()
                        } else if val.is_object() {
                            vec![val]
                        } else {
                            Vec::new()
                        };

                        for item in arr {
                            let pkg_name = item["Name"].as_str().unwrap_or("").to_string();
                            let mut title = item["Title"].as_str().unwrap_or("").trim().to_string();
                            let install_loc = item["InstallLocation"].as_str().unwrap_or("").to_string();
                            let aumid = item["Aumid"].as_str().unwrap_or("").to_string();

                            if pkg_name.is_empty() || install_loc.is_empty() {
                                continue;
                            }

                            // Try reading MicrosoftGame.config for cleaner DisplayName and Executable
                            let game_cfg_path = Path::new(&install_loc).join("MicrosoftGame.config");
                            let mut exe_path = None;
                            if game_cfg_path.exists() {
                                if let Ok(xml) = fs::read_to_string(&game_cfg_path) {
                                    if let Some(dn) = extract_xml_attr(&xml, "ShellVisuals", "DefaultDisplayName") {
                                        if !dn.is_empty() && !dn.starts_with("ms-resource:") {
                                            title = dn;
                                        }
                                    }
                                    if let Some(exe_name) = extract_xml_attr(&xml, "Executable", "Name") {
                                        let full_exe = Path::new(&install_loc).join(&exe_name);
                                        if full_exe.exists() {
                                            exe_path = Some(full_exe.to_string_lossy().to_string());
                                        }
                                    }
                                }
                            }

                            if title.is_empty() || title.starts_with("ms-resource:") {
                                title = Path::new(&install_loc)
                                    .file_name()
                                    .map(|s| s.to_string_lossy().to_string())
                                    .unwrap_or_else(|| pkg_name.clone());
                            }

                            let size_on_disk =
                                PlayniteScanner::compute_folder_size(Path::new(&install_loc));

                            // Use shell:AppsFolder\<AUMID> for launching if direct exe is UWP-protected
                            let launch_target = if !aumid.is_empty() {
                                Some(format!(r"shell:AppsFolder\{}", aumid))
                            } else {
                                exe_path
                            };

                            seen_ids.insert(pkg_name.clone());
                            games.push(Game {
                                id: format!("xbox_{}", sanitize_id(&pkg_name)),
                                title,
                                source: "Xbox".to_string(),
                                source_id: Some(pkg_name),
                                install_directory: Some(install_loc),
                                executable_path: launch_target,
                                is_installed: true,
                                size_on_disk,
                                platforms: vec!["PC (Windows)".to_string()],
                                date_added: Some(now_str.clone()),
                                completion_status: Some("Auto".to_string()),
                                ..Default::default()
                            });
                        }
                    }
                }
            }
        }

        // Also scan common XboxGames folders on drives C..Z directly
        for drive_letter in b'C'..=b'Z' {
            let root_str = format!("{}:\\XboxGames", drive_letter as char);
            let root_path = Path::new(&root_str);
            if !root_path.is_dir() {
                continue;
            }
            if let Ok(entries) = fs::read_dir(root_path) {
                for entry in entries.flatten() {
                    let game_dir = entry.path();
                    if !game_dir.is_dir() {
                        continue;
                    }
                    let content_dir = if game_dir.join("Content").is_dir() {
                        game_dir.join("Content")
                    } else {
                        game_dir.clone()
                    };
                    let cfg_path = content_dir.join("MicrosoftGame.config");
                    if !cfg_path.exists() {
                        continue;
                    }

                    let folder_title = game_dir
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();
                    if folder_title.is_empty() {
                        continue;
                    }

                    let mut title = folder_title.clone();
                    let mut pkg_id = sanitize_id(&folder_title);
                    let mut exe_path = None;

                    if let Ok(xml) = fs::read_to_string(&cfg_path) {
                        if let Some(id_name) = extract_xml_attr(&xml, "Identity", "Name") {
                            if !id_name.is_empty() {
                                pkg_id = id_name;
                            }
                        }
                        if let Some(dn) = extract_xml_attr(&xml, "ShellVisuals", "DefaultDisplayName") {
                            if !dn.is_empty() && !dn.starts_with("ms-resource:") {
                                title = dn;
                            }
                        }
                        if let Some(exe_name) = extract_xml_attr(&xml, "Executable", "Name") {
                            let candidate = content_dir.join(&exe_name);
                            if candidate.exists() {
                                exe_path = Some(candidate.to_string_lossy().to_string());
                            }
                        }
                    }

                    if seen_ids.contains(&pkg_id) {
                        continue;
                    }

                    let size_on_disk = PlayniteScanner::compute_folder_size(&game_dir);
                    seen_ids.insert(pkg_id.clone());

                    games.push(Game {
                        id: format!("xbox_{}", sanitize_id(&pkg_id)),
                        title,
                        source: "Xbox".to_string(),
                        source_id: Some(pkg_id),
                        install_directory: Some(content_dir.to_string_lossy().to_string()),
                        executable_path: exe_path,
                        is_installed: true,
                        size_on_disk,
                        platforms: vec!["PC (Windows)".to_string()],
                        date_added: Some(now_str.clone()),
                        completion_status: Some("Auto".to_string()),
                        ..Default::default()
                    });
                }
            }
        }

        Ok(games)
    }

    /// Fetches Xbox TitleHistory + MinutesPlayed from Xbox Live TitleHub & UserStats APIs
    pub async fn fetch_cloud_library(xuid: &str, auth_header: &str) -> Result<Vec<Game>, String> {
        let client = reqwest::Client::new();
        let url = format!(
            "https://titlehub.xboxlive.com/users/xuid({})/titles/titlehistory/decoration/detail,image,scid",
            xuid
        );

        let resp = client
            .get(&url)
            .header("Authorization", auth_header)
            .header("x-xbl-contract-version", "2")
            .header("Accept-Language", "en-US")
            .send()
            .await
            .map_err(|e| format!("Xbox TitleHub request failed: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Xbox TitleHub returned HTTP {}", resp.status()));
        }

        let json: Value = resp.json().await.map_err(|e| e.to_string())?;
        let mut cloud_games = Vec::new();
        let mut title_ids_for_stats = Vec::new();
        let now_str = chrono::Local::now().format("%Y-%m-%d").to_string();

        if let Some(titles) = json["titles"].as_array() {
            for t in titles {
                let title_id = t["titleId"].as_str().unwrap_or("").to_string();
                let name = t["name"].as_str().unwrap_or("").trim().to_string();
                if title_id.is_empty() || name.is_empty() {
                    continue;
                }

                // Skip non-game apps
                let title_type = t["type"].as_str().unwrap_or("Game");
                if !title_type.eq_ignore_ascii_case("Game") {
                    continue;
                }

                title_ids_for_stats.push(title_id.clone());

                let pfn = t["pfn"].as_str().unwrap_or(&title_id).to_string();
                let display_img = t["displayImage"].as_str().map(|s| s.to_string());
                let description = t["detail"]["description"].as_str().map(|s| s.to_string());
                let developer = t["detail"]["developerName"].as_str().map(|s| s.to_string());
                let publisher = t["detail"]["publisherName"].as_str().map(|s| s.to_string());
                let release_date = t["detail"]["releaseDate"]
                    .as_str()
                    .and_then(|d| d.get(..10))
                    .map(|s| s.to_string());
                let last_played = t["titleHistory"]["lastTimePlayed"]
                    .as_str()
                    .and_then(|d| d.get(..10))
                    .map(|s| s.to_string());

                cloud_games.push(Game {
                    id: format!("xbox_{}", sanitize_id(&pfn)),
                    title: name,
                    source: "Xbox".to_string(),
                    source_id: Some(title_id),
                    cover_image: display_img,
                    description,
                    developer,
                    publisher,
                    release_date,
                    last_played,
                    is_installed: false,
                    platforms: vec!["PC (Windows)".to_string()],
                    date_added: Some(now_str.clone()),
                    completion_status: Some("Auto".to_string()),
                    ..Default::default()
                });
            }
        }

        // Batch fetch MinutesPlayed for all discovered Xbox titles
        let playtime_map = Self::fetch_playtimes_batch(xuid, auth_header, &title_ids_for_stats).await;
        for g in &mut cloud_games {
            if let Some(ref tid) = g.source_id {
                if let Some(&pt_secs) = playtime_map.get(tid) {
                    g.playtime_seconds = pt_secs;
                }
            }
        }

        Ok(cloud_games)
    }

    /// Fetches Xbox Live / PC Game Pass achievements for a title via `achievements.xboxlive.com`
    pub async fn fetch_xbox_achievements(
        game_id: &str,
        source_id: &str,
        xuid: &str,
        auth_header: &str,
    ) -> Result<Vec<crate::models::Achievement>, String> {
        let client = reqwest::Client::new();
        let mut title_id = source_id.trim().to_string();

        // If source_id is a Package Family Name (PFN) rather than numeric titleId, resolve numeric titleId via TitleHub
        if !title_id.is_empty() && !title_id.chars().all(|c| c.is_ascii_digit()) {
            let body = serde_json::json!({
                "pfns": [title_id],
                "windowsPhoneProductIds": []
            });
            if let Ok(resp) = client
                .post("https://titlehub.xboxlive.com/titles/batch/decoration/detail")
                .header("Authorization", auth_header)
                .header("x-xbl-contract-version", "2")
                .header("Accept-Language", "en-US")
                .json(&body)
                .send()
                .await
            {
                if resp.status().is_success() {
                    if let Ok(json) = resp.json::<Value>().await {
                        if let Some(tid) = json["titles"]
                            .as_array()
                            .and_then(|arr| arr.first())
                            .and_then(|t| t["titleId"].as_str())
                        {
                            title_id = tid.to_string();
                        }
                    }
                }
            }
        }

        if title_id.is_empty() {
            return Ok(Vec::new());
        }

        let url = format!(
            "https://achievements.xboxlive.com/users/xuid({})/achievements?titleId={}&maxItems=1000",
            xuid.trim(),
            title_id
        );
        let resp = client
            .get(&url)
            .header("Authorization", auth_header)
            .header("x-xbl-contract-version", "2")
            .header("Accept-Language", "en-US")
            .send()
            .await
            .map_err(|e| format!("Xbox achievements request failed: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Xbox achievements returned HTTP {}", resp.status()));
        }

        let json: Value = resp.json().await.map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        if let Some(arr) = json["achievements"].as_array() {
            for item in arr {
                let id_str = item["id"].as_str().unwrap_or("").trim().to_string();
                let name = item["name"].as_str().unwrap_or("").trim().to_string();
                if id_str.is_empty() || name.is_empty() {
                    continue;
                }
                let progress_state = item["progressState"].as_str().unwrap_or("");
                let achieved = progress_state.eq_ignore_ascii_case("Achieved");
                let description = if achieved {
                    item["description"]
                        .as_str()
                        .or_else(|| item["lockedDescription"].as_str())
                } else {
                    item["lockedDescription"]
                        .as_str()
                        .or_else(|| item["description"].as_str())
                }
                .map(|s| s.to_string());

                let icon_url = item["mediaAssets"]
                    .as_array()
                    .and_then(|assets| {
                        assets
                            .iter()
                            .find(|a| a["type"].as_str() == Some("Icon"))
                            .or_else(|| assets.first())
                    })
                    .and_then(|a| a["url"].as_str())
                    .map(|s| s.to_string());

                let unlock_time = if achieved {
                    item["progression"]["timeUnlocked"]
                        .as_str()
                        .filter(|s| !s.is_empty() && !s.starts_with("0001") && !s.starts_with("1970"))
                        .map(|s| {
                            if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
                                dt.format("%b %d, %Y %H:%M").to_string()
                            } else {
                                s.to_string()
                            }
                        })
                } else {
                    None
                };

                let mut rarity_percentage = item["rarity"]["currentPercentage"]
                    .as_f64()
                    .or_else(|| {
                        item["rarity"]["currentPercentage"]
                            .as_str()
                            .and_then(|s| s.parse::<f64>().ok())
                    })
                    .unwrap_or(0.0);

                if rarity_percentage <= 0.0 {
                    if let Some(cat) = item["rarity"]["currentCategory"].as_str() {
                        if cat.eq_ignore_ascii_case("Rare") {
                            rarity_percentage = 8.5; // Realistic rare estimate under 10%
                        }
                    }
                }
                let is_secret = item["isSecret"].as_bool().unwrap_or(false);

                out.push(crate::models::Achievement {
                    game_id: game_id.to_string(),
                    api_name: sanitize_id(&id_str),
                    display_name: name,
                    description,
                    icon_url: icon_url.clone().unwrap_or_default(),
                    icon_gray_url: icon_url,
                    is_unlocked: achieved,
                    unlock_time,
                    rarity_percentage,
                    is_secret,
                });
            }
        }

        Ok(out)
    }
}

// ============================================================================
// 3. BATTLE.NET SCANNER (Windows Registry + Agent product.db / .build.info)
// ============================================================================
pub struct BattleNetScanner;

impl BattleNetScanner {
    pub fn scan_installed_games() -> Result<Vec<Game>, String> {
        let mut games = Vec::new();
        let mut seen_dirs = HashSet::new();
        let now_str = chrono::Local::now().format("%Y-%m-%d").to_string();

        #[cfg(target_os = "windows")]
        {
            let ps_script = r#"
$ErrorActionPreference = 'SilentlyContinue'
$paths = @(
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall'
)
$results = @()
foreach ($p in $paths) {
    if (Test-Path $p) {
        Get-ChildItem $p | ForEach-Object {
            $prop = Get-ItemProperty $_.PSPath
            $pub = [string]$prop.Publisher
            $uninst = [string]$prop.UninstallString
            if ($pub -match 'Blizzard' -or $uninst -match 'Battle\.net|Blizzard Uninstaller') {
                $results += [PSCustomObject]@{
                    KeyName = [string]$_.PSChildName
                    DisplayName = [string]$prop.DisplayName
                    InstallLocation = [string]$prop.InstallLocation
                }
            }
        }
    }
}
$results | ConvertTo-Json -Compress
"#;
            for item in run_powershell_json(ps_script) {
                let sub_name = item["KeyName"].as_str().unwrap_or("").trim().to_string();
                let display_name = item["DisplayName"].as_str().unwrap_or("").trim().to_string();
                let install_loc = item["InstallLocation"].as_str().unwrap_or("").trim().to_string();

                if display_name.is_empty()
                    || display_name.eq_ignore_ascii_case("Battle.net")
                    || install_loc.is_empty()
                {
                    continue;
                }

                let clean_dir = install_loc.trim_end_matches('\\').to_lowercase();
                if seen_dirs.contains(&clean_dir) || !Path::new(&install_loc).exists() {
                    continue;
                }

                let bnet_code = Self::resolve_bnet_product_code(&display_name, &sub_name);
        let launch_uri = format!("battlenet://{}", bnet_code);
        let size_on_disk = PlayniteScanner::compute_folder_size(Path::new(&install_loc));

        seen_dirs.insert(clean_dir);
        games.push(Game {
            id: format!("bnet_{}", sanitize_id(&bnet_code)),
            title: display_name,
            source: "Battle.net".to_string(),
            source_id: Some(bnet_code),
            install_directory: Some(install_loc),
            executable_path: Some(launch_uri),
            is_installed: true,
            size_on_disk,
            platforms: vec!["PC (Windows)".to_string()],
            date_added: Some(now_str.clone()),
            completion_status: Some("Auto".to_string()),
            ..Default::default()
        });
            }
        }

        Ok(games)
    }

    /// Parses the JSON payload captured from `https://account.battle.net/api/games-and-subs` and `/api/classic-games`
    pub fn parse_cloud_games_json(payload_json: &str) -> Result<Vec<Game>, String> {
        let val: Value = serde_json::from_str(payload_json).map_err(|e| e.to_string())?;
        let mut cloud_games = Vec::new();
        let mut seen_codes = HashSet::new();
        let now_str = chrono::Local::now().format("%Y-%m-%d").to_string();

        if let Some(accounts) = val["gameAccounts"].as_array() {
            for acc in accounts {
                let raw_title = acc["localizedGameName"]
                    .as_str()
                    .or_else(|| acc["title"].as_str())
                    .unwrap_or("")
                    .trim();
                if raw_title.is_empty() {
                    continue;
                }
                // Clean up edition suffixes if any (e.g. "Overwatch® 2" -> "Overwatch 2")
                let clean_title = raw_title.replace('®', "").replace('™', "").trim().to_string();
                let title_id_str = acc["titleId"]
                    .as_i64()
                    .map(|n| n.to_string())
                    .unwrap_or_else(|| sanitize_id(&clean_title));
                let code = Self::resolve_bnet_product_code(&clean_title, &title_id_str);
                if seen_codes.contains(&code) {
                    continue;
                }
                seen_codes.insert(code.clone());

                let icon_file = acc["regionalGameFranchiseIconFilename"]
                    .as_str()
                    .filter(|s| !s.is_empty())
                    .map(|f| {
                        if f.starts_with("http") {
                            f.to_string()
                        } else {
                            format!("https://bnetaccount.akamaized.net/static/local-common/images/game-icons/{}", f)
                        }
                    });

                cloud_games.push(Game {
                    id: format!("bnet_{}", sanitize_id(&code)),
                    title: clean_title,
                    source: "Battle.net".to_string(),
                    source_id: Some(code.clone()),
                    executable_path: Some(format!("battlenet://{}", code)),
                    icon_image: icon_file,
                    is_installed: false,
                    platforms: vec!["PC (Windows)".to_string()],
                    date_added: Some(now_str.clone()),
                    completion_status: Some("Auto".to_string()),
                    ..Default::default()
                });
            }
        }

        if let Some(classics) = val["classicGames"].as_array() {
            for cg in classics {
                let raw_title = cg["localizedGameName"]
                    .as_str()
                    .unwrap_or("")
                    .replace('®', "")
                    .replace('™', "")
                    .trim()
                    .to_string();
                if raw_title.is_empty() {
                    continue;
                }
                let code = Self::resolve_bnet_product_code(&raw_title, &raw_title);
                if seen_codes.contains(&code) {
                    continue;
                }
                seen_codes.insert(code.clone());
                cloud_games.push(Game {
                    id: format!("bnet_{}", sanitize_id(&code)),
                    title: raw_title,
                    source: "Battle.net".to_string(),
                    source_id: Some(code.clone()),
                    executable_path: Some(format!("battlenet://{}", code)),
                    is_installed: false,
                    platforms: vec!["PC (Windows)".to_string()],
                    date_added: Some(now_str.clone()),
                    completion_status: Some("Auto".to_string()),
                    ..Default::default()
                });
            }
        }

        Ok(cloud_games)
    }

    fn resolve_bnet_product_code(title: &str, reg_key: &str) -> String {
        let t = title.to_lowercase();
        let r = reg_key.to_lowercase();
        if t.contains("overwatch") || r.contains("pro") {
            "Pro".to_string()
        } else if t.contains("diablo iv") || t.contains("diablo 4") || r.contains("fenris") {
            "Fen".to_string()
        } else if t.contains("diablo iii") || t.contains("diablo 3") {
            "D3".to_string()
        } else if t.contains("diablo ii") || t.contains("resurrected") {
            "OSI".to_string()
        } else if t.contains("diablo immortal") {
            "ANBS".to_string()
        } else if t.contains("world of warcraft") || r.contains("wow") {
            "WoW".to_string()
        } else if t.contains("hearthstone") || r.contains("wtcg") {
            "WTCG".to_string()
        } else if t.contains("starcraft ii") || t.contains("starcraft 2") {
            "S2".to_string()
        } else if t.contains("starcraft") {
            "S1".to_string()
        } else if t.contains("heroes of the storm") {
            "Hero".to_string()
        } else if t.contains("warcraft iii") || t.contains("warcraft 3") {
            "W3".to_string()
        } else if t.contains("warcraft rumble") {
            "GRY".to_string()
        } else if t.contains("call of duty") || t.contains("modern warfare") || t.contains("warzone") {
            "AUKS".to_string()
        } else {
            sanitize_id(reg_key)
        }
    }
}

// ============================================================================
// 4. EA APP SCANNER (Registry + __Installer/installerdata.xml)
// ============================================================================
pub struct EaScanner;

impl EaScanner {
    const JUNO_GRAPHQL_URL: &'static str = "https://service-aggregation-layer.juno.ea.com/graphql";

    /// Authenticates an EA OAuth2 Bearer access_token and resolves the user's PID & Persona via Juno GraphQL + Identity proxy
    pub async fn authenticate_with_token(access_token: &str) -> Result<ProviderAuthResult, String> {
        let client = reqwest::Client::new();
        let clean_token = access_token.trim();

        // First query Juno GraphQL `me { player { pd psd displayName uniqueName nickname avatar { medium { path } } } }`
        let gql_identity = serde_json::json!({
            "query": "query { me { player { pd psd displayName uniqueName nickname avatar { medium { path } } } } }"
        });

        let mut account_id = String::new();
        let mut display_name = String::new();
        let mut avatar_url: Option<String> = None;

        if let Ok(gql_resp) = client
            .post(Self::JUNO_GRAPHQL_URL)
            .bearer_auth(clean_token)
            .header("User-Agent", "EAApp/13.524.0.6037")
            .header("Accept", "application/json")
            .json(&gql_identity)
            .send()
            .await
        {
            if gql_resp.status().is_success() {
                if let Ok(gql_json) = gql_resp.json::<Value>().await {
                    let player = &gql_json["data"]["me"]["player"];
                    if let Some(psd) = player["psd"]
                        .as_str()
                        .or_else(|| player["pd"].as_str())
                        .filter(|s| !s.is_empty())
                    {
                        account_id = psd.to_string();
                    }
                    if let Some(name) = player["displayName"]
                        .as_str()
                        .or_else(|| player["nickname"].as_str())
                        .or_else(|| player["uniqueName"].as_str())
                        .filter(|s| !s.is_empty())
                    {
                        display_name = name.to_string();
                    }
                    avatar_url = player["avatar"]["medium"]["path"]
                        .as_str()
                        .filter(|s| !s.is_empty())
                        .map(|s| s.to_string());
                }
            }
        }

        // Also check gateway.ea.com/proxy/identity/pids/me as fallback or supplement
        if account_id.is_empty() || display_name.is_empty() {
            if let Ok(resp) = client
                .get("https://gateway.ea.com/proxy/identity/pids/me")
                .bearer_auth(clean_token)
                .header("Accept", "application/json")
                .send()
                .await
            {
                if resp.status().is_success() {
                    if let Ok(json) = resp.json::<Value>().await {
                        if account_id.is_empty() {
                            if let Some(pid) = json["pid"]["pidId"]
                                .as_i64()
                                .map(|n| n.to_string())
                                .or_else(|| json["pid"]["pidId"].as_str().map(|s| s.to_string()))
                            {
                                account_id = pid;
                            }
                        }
                        if display_name.is_empty() {
                            display_name = json["pid"]["email"]
                                .as_str()
                                .unwrap_or("EA Account")
                                .to_string();
                        }
                    }
                } else if account_id.is_empty() {
                    return Err(format!("EA authentication rejected ({})", resp.status()));
                }
            }
        }

        if account_id.is_empty() {
            return Err("EA authentication failed: could not resolve player identity".to_string());
        }
        if display_name.is_empty() {
            display_name = "EA Account".to_string();
        }

        Ok(ProviderAuthResult {
            account_id,
            display_name,
            avatar_url,
            access_token: clean_token.to_string(),
            refresh_token: None,
        })
    }

    /// Fetches owned games, playtimes (`totalPlayTimeSeconds`), last played dates (`lastSessionEndDate`),
    /// and local install states (`installCheckOverride`) from EA's Juno GraphQL API (matching Playnite's EaLibrary).
    pub async fn fetch_cloud_library(pid_id: &str, access_token: &str) -> Result<Vec<Game>, String> {
        let client = reqwest::Client::new();
        let clean_token = access_token.trim();
        let now_str = chrono::Local::now().format("%Y-%m-%d").to_string();

        // Collect (offer_id, title, game_slug) from Juno GraphQL
        let mut discovered_items: Vec<(String, String, String)> = Vec::new();
        let mut seen_offers = HashSet::new();

        // Method A: Persisted query `getPreloadedOwnedGames` (exact query used by Playnite's EaWebsite.cs)
        let vars_json = serde_json::json!({
            "isMac": false,
            "addFieldsToPreloadGames": true,
            "locale": "DEFAULT",
            "limit": 5000,
            "next": "0",
            "type": ["DIGITAL_FULL_GAME", "PACKAGED_FULL_GAME"],
            "platforms": ["PC"],
            "storefronts": ["EA", "STEAM", "EPIC"],
            "ownershipMethods": [
                "UNKNOWN", "ASSOCIATION", "PURCHASE", "REDEMPTION", "GIFT_RECEIPT",
                "ENTITLEMENT_GRANT", "DIRECT_ENTITLEMENT", "PRE_ORDER_PURCHASE",
                "VAULT", "XGP_VAULT", "STEAM", "STEAM_VAULT", "STEAM_SUBSCRIPTION",
                "EPIC", "EPIC_VAULT", "EPIC_SUBSCRIPTION"
            ]
        });
        let ext_json = serde_json::json!({
            "persistedQuery": {
                "version": 1,
                "sha256Hash": "779f1cd1355699752e20c0b3877847f4e3010ef5de131c248e98f8eff84f0718"
            }
        });
        let persisted_url = format!(
            "{}?operationName=getPreloadedOwnedGames&variables={}&extensions={}",
            Self::JUNO_GRAPHQL_URL,
            url_encode(&vars_json.to_string()),
            url_encode(&ext_json.to_string())
        );

        if let Ok(resp) = client
            .get(&persisted_url)
            .bearer_auth(clean_token)
            .header("User-Agent", "EAApp/13.524.0.6037")
            .header("Accept", "application/json")
            .send()
            .await
        {
            if resp.status().is_success() {
                if let Ok(json) = resp.json::<Value>().await {
                    if let Some(items) = json["data"]["me"]["ownedGameProducts"]["items"].as_array() {
                        for item in items {
                            let prod = &item["product"];
                            let offer_id = item["originOfferId"]
                                .as_str()
                                .or_else(|| prod["legacyOffer"]["offerId"].as_str())
                                .or_else(|| prod["id"].as_str())
                                .unwrap_or("")
                                .trim()
                                .to_string();
                            let raw_title = prod["name"]
                                .as_str()
                                .or_else(|| prod["baseItem"]["title"].as_str())
                                .or_else(|| prod["legacyOffer"]["displayName"].as_str())
                                .unwrap_or("")
                                .replace('™', "")
                                .replace('®', "")
                                .trim()
                                .to_string();
                            let slug = prod["gameSlug"].as_str().unwrap_or("").trim().to_string();

                            if !offer_id.is_empty() && !raw_title.is_empty() && !seen_offers.contains(&offer_id) {
                                seen_offers.insert(offer_id.clone());
                                discovered_items.push((offer_id, raw_title, slug));
                            }
                        }
                    }
                }
            }
        }

        // Method B: POST GraphQL query `GetOwnedGameProducts` (fallback / supplement if persisted query hash changes)
        let post_owned_body = serde_json::json!({
            "operationName": "GetOwnedGameProducts",
            "variables": {
                "locale": "en",
                "storefronts": ["EA", "STEAM", "EPIC"],
                "type": ["DIGITAL_FULL_GAME", "PACKAGED_FULL_GAME"],
                "platforms": ["PC"],
                "ownershipMethods": [
                    "UNKNOWN", "ASSOCIATION", "PURCHASE", "REDEMPTION", "GIFT_RECEIPT",
                    "ENTITLEMENT_GRANT", "DIRECT_ENTITLEMENT", "PRE_ORDER_PURCHASE",
                    "VAULT", "XGP_VAULT", "STEAM", "STEAM_VAULT", "STEAM_SUBSCRIPTION",
                    "EPIC", "EPIC_VAULT", "EPIC_SUBSCRIPTION"
                ],
                "paging": { "limit": 9999, "next": "0" }
            },
            "query": "query GetOwnedGameProducts($locale: Locale, $paging: PaginationInput, $storefronts: [GameProductStorefront!], $type: [GameProductType!], $platforms: [GamePlatform!], $ownershipMethods: [OwnershipMethod!]) { me { ownedGameProducts(locale: $locale, paging: $paging, storefronts: $storefronts, type: $type, platforms: $platforms, ownershipMethods: $ownershipMethods) { items { originOfferId product { id name gameSlug baseItem { title } legacyOffer { offerId displayName } } } } } }"
        });

        if let Ok(resp) = client
            .post(Self::JUNO_GRAPHQL_URL)
            .bearer_auth(clean_token)
            .header("User-Agent", "EAApp/13.524.0.6037")
            .header("Accept", "application/json")
            .json(&post_owned_body)
            .send()
            .await
        {
            if resp.status().is_success() {
                if let Ok(json) = resp.json::<Value>().await {
                    if let Some(items) = json["data"]["me"]["ownedGameProducts"]["items"].as_array() {
                        for item in items {
                            let prod = &item["product"];
                            let offer_id = item["originOfferId"]
                                .as_str()
                                .or_else(|| prod["legacyOffer"]["offerId"].as_str())
                                .or_else(|| prod["id"].as_str())
                                .unwrap_or("")
                                .trim()
                                .to_string();
                            let raw_title = prod["baseItem"]["title"]
                                .as_str()
                                .or_else(|| prod["name"].as_str())
                                .or_else(|| prod["legacyOffer"]["displayName"].as_str())
                                .unwrap_or("")
                                .replace('™', "")
                                .replace('®', "")
                                .trim()
                                .to_string();
                            let slug = prod["gameSlug"].as_str().unwrap_or("").trim().to_string();

                            if !offer_id.is_empty() && !raw_title.is_empty() && !seen_offers.contains(&offer_id) {
                                seen_offers.insert(offer_id.clone());
                                discovered_items.push((offer_id, raw_title, slug));
                            }
                        }
                    }
                }
            }
        }

        // Method C: Local Playnite EaLibrary cache fallback if Juno returned 0 items (e.g. token expired or offline)
        if discovered_items.is_empty() {
            if let Ok(appdata) = std::env::var("APPDATA") {
                let legacy_path = Path::new(&appdata)
                    .join("Playnite")
                    .join("ExtensionsData")
                    .join("85dd7072-2f20-4e76-a007-41035e390724")
                    .join("legacy-offers.json");
                if legacy_path.exists() {
                    if let Ok(content) = fs::read_to_string(&legacy_path) {
                        if let Ok(arr) = serde_json::from_str::<Vec<Value>>(&content) {
                            for offer in arr {
                                let ctype = offer["contentType"].as_str().unwrap_or("BASE_GAME");
                                if !ctype.eq_ignore_ascii_case("BASE_GAME") {
                                    continue;
                                }
                                let offer_id = offer["offerId"].as_str().unwrap_or("").trim().to_string();
                                let raw_title = offer["displayName"]
                                    .as_str()
                                    .unwrap_or("")
                                    .replace('™', "")
                                    .replace('®', "")
                                    .trim()
                                    .to_string();
                                if !offer_id.is_empty() && !raw_title.is_empty() && !seen_offers.contains(&offer_id) {
                                    seen_offers.insert(offer_id.clone());
                                    discovered_items.push((offer_id, raw_title, String::new()));
                                }
                            }
                        }
                    }
                }
            }
        }

        // Query playtimes & last played dates via `GetRecentGames` on Juno GraphQL
        let slugs: Vec<String> = discovered_items
            .iter()
            .filter_map(|(_, _, slug)| if !slug.is_empty() { Some(slug.clone()) } else { None })
            .collect();

        let mut slug_stats: HashMap<String, (u64, Option<String>)> = HashMap::new();
        if !slugs.is_empty() {
            let recent_body = serde_json::json!({
                "operationName": "GetRecentGames",
                "variables": { "gameSlugs": slugs },
                "query": "query GetRecentGames($gameSlugs: [String!]!) { me { recentGames(gameSlugs: $gameSlugs) { items { gameSlug lastSessionEndDate totalPlayTimeSeconds } } } }"
            });
            if let Ok(resp) = client
                .post(Self::JUNO_GRAPHQL_URL)
                .bearer_auth(clean_token)
                .header("User-Agent", "EAApp/13.524.0.6037")
                .header("Accept", "application/json")
                .json(&recent_body)
                .send()
                .await
            {
                if resp.status().is_success() {
                    if let Ok(json) = resp.json::<Value>().await {
                        if let Some(items) = json["data"]["me"]["recentGames"]["items"].as_array() {
                            for item in items {
                                let gslug = item["gameSlug"].as_str().unwrap_or("").to_string();
                                let pt_secs = item["totalPlayTimeSeconds"]
                                    .as_u64()
                                    .or_else(|| item["totalPlayTimeSeconds"].as_i64().map(|n| n.max(0) as u64))
                                    .unwrap_or(0);
                                let last_played = item["lastSessionEndDate"]
                                    .as_str()
                                    .filter(|s| !s.is_empty() && !s.starts_with("1970") && !s.starts_with("000"))
                                    .map(|s| s.get(..10).unwrap_or(s).to_string());
                                if !gslug.is_empty() {
                                    slug_stats.insert(gslug, (pt_secs, last_played));
                                }
                            }
                        }
                    }
                }
            }
        }

        // Query `getLegacyCatalogDefs` (`legacyOffers`) for `installCheckOverride` so we know which owned EA games are installed!
        let offer_ids: Vec<String> = discovered_items.iter().map(|(oid, _, _)| oid.clone()).collect();
        let mut offer_install_overrides: HashMap<String, String> = HashMap::new();
        if !offer_ids.is_empty() {
            let legacy_body = serde_json::json!({
                "operationName": "getLegacyCatalogDefs",
                "variables": { "offerIds": offer_ids, "locale": "DEFAULT" },
                "query": "query getLegacyCatalogDefs($offerIds: [String!]!, $locale: Locale) { legacyOffers(offerIds: $offerIds, locale: $locale) { offerId contentId masterTitleId displayName installCheckOverride executePathOverride } }"
            });
            if let Ok(resp) = client
                .post(Self::JUNO_GRAPHQL_URL)
                .bearer_auth(clean_token)
                .header("User-Agent", "EAApp/13.524.0.6037")
                .header("Accept", "application/json")
                .json(&legacy_body)
                .send()
                .await
            {
                if resp.status().is_success() {
                    if let Ok(json) = resp.json::<Value>().await {
                        if let Some(arr) = json["data"]["legacyOffers"].as_array() {
                            for lo in arr {
                                let oid = lo["offerId"].as_str().unwrap_or("").to_string();
                                let ico = lo["installCheckOverride"].as_str().unwrap_or("").to_string();
                                if !oid.is_empty() && !ico.is_empty() {
                                    offer_install_overrides.insert(oid, ico);
                                }
                            }
                        }
                    }
                }
            }
        }

        let mut cloud_games = Vec::new();
        let _ = pid_id;

        for (offer_id, title, slug) in discovered_items {
            let (pt_secs, last_played) = slug_stats.get(&slug).cloned().unwrap_or((0, None));
            let install_dir = offer_install_overrides
                .get(&offer_id)
                .and_then(|ico| Self::resolve_install_check_override(ico));
            let is_installed = install_dir.is_some();
            let size_on_disk = install_dir
                .as_ref()
                .and_then(|d| PlayniteScanner::compute_folder_size(Path::new(d)));

            cloud_games.push(Game {
                id: format!("ea_{}", sanitize_id(&offer_id)),
                title,
                source: "EA App".to_string(),
                source_id: Some(offer_id.clone()),
                install_directory: install_dir,
                executable_path: Some(format!("origin2://game/launch?offerIds={}", offer_id)),
                playtime_seconds: pt_secs,
                last_played,
                is_installed,
                size_on_disk,
                platforms: vec!["PC (Windows)".to_string()],
                date_added: Some(now_str.clone()),
                completion_status: Some("Auto".to_string()),
                ..Default::default()
            });
        }

        Ok(cloud_games)
    }

    /// Resolves an EA `installCheckOverride` expression like `[HKEY_LOCAL_MACHINE\SOFTWARE\Respawn\Jedi Survivor\Install Dir]__Installer\installerdata.xml`
    /// to an existing install directory on disk if installed.
    fn resolve_install_check_override(override_str: &str) -> Option<String> {
        #[cfg(target_os = "windows")]
        {
            let start = override_str.find('[')? + 1;
            let end = override_str[start..].find(']')? + start;
            let reg_expr = &override_str[start..end];
            let last_slash = reg_expr.rfind('\\')?;
            let key_path = &reg_expr[..last_slash];
            let val_name = &reg_expr[last_slash + 1..];

            let wow64_path = key_path.replacen(
                "HKEY_LOCAL_MACHINE\\SOFTWARE\\",
                "HKLM:\\SOFTWARE\\WOW6432Node\\",
                1,
            );
            let direct_path = key_path.replacen("HKEY_LOCAL_MACHINE\\", "HKLM:\\", 1);

            let ps = format!(
                "$ErrorActionPreference='SilentlyContinue'; foreach ($p in @('{}','{}')) {{ if (Test-Path $p) {{ $v = (Get-ItemProperty $p).'{}'; if ($v) {{ Write-Output $v; break }} }} }}",
                wow64_path.replace('\'', "''"),
                direct_path.replace('\'', "''"),
                val_name.replace('\'', "''")
            );
            if let Ok(output) = std::process::Command::new("powershell")
                .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &ps])
                .output()
            {
                let dir = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !dir.is_empty() && Path::new(&dir).exists() {
                    return Some(dir);
                }
            }
        }
        let _ = override_str;
        None
    }

    pub fn scan_installed_games() -> Result<Vec<Game>, String> {
        let mut games = Vec::new();
        let mut seen_dirs = HashSet::new();
        let now_str = chrono::Local::now().format("%Y-%m-%d").to_string();

        #[cfg(target_os = "windows")]
        {
            let ps_script = r#"
$ErrorActionPreference = 'SilentlyContinue'
$paths = @(
    'HKLM:\SOFTWARE\WOW6432Node\EA Games',
    'HKLM:\SOFTWARE\EA Games',
    'HKLM:\SOFTWARE\WOW6432Node\Respawn',
    'HKLM:\SOFTWARE\WOW6432Node\BioWare',
    'HKLM:\SOFTWARE\WOW6432Node\Maxis',
    'HKLM:\SOFTWARE\WOW6432Node\Full Circle',
    'HKLM:\SOFTWARE\WOW6432Node\Coldwood Interactive',
    'HKLM:\SOFTWARE\WOW6432Node\Criterion Games',
    'HKLM:\SOFTWARE\WOW6432Node\DICE',
    'HKLM:\SOFTWARE\WOW6432Node\Ghost Games',
    'HKLM:\SOFTWARE\WOW6432Node\ Hazelight',
    'HKLM:\SOFTWARE\WOW6432Node\Motive',
    'HKLM:\SOFTWARE\WOW6432Node\PopCap'
)
$results = @()
foreach ($p in $paths) {
    if (Test-Path $p) {
        Get-ChildItem $p | ForEach-Object {
            $prop = Get-ItemProperty $_.PSPath
            $dir = $prop.'Install Dir'
            if ($dir -and (Test-Path (Join-Path $dir '__Installer\installerdata.xml'))) {
                $results += [PSCustomObject]@{
                    KeyName = [string]$_.PSChildName
                    DisplayName = if ($prop.DisplayName) { [string]$prop.DisplayName } else { [string]$_.PSChildName }
                    InstallDir = [string]$dir
                }
            }
        }
    }
}
$results | ConvertTo-Json -Compress
"#;
            for item in run_powershell_json(ps_script) {
                let sub_name = item["KeyName"].as_str().unwrap_or("").trim().to_string();
                let display_name = item["DisplayName"].as_str().unwrap_or(&sub_name).trim().to_string();
                let install_dir = item["InstallDir"].as_str().unwrap_or("").trim().to_string();

                if install_dir.is_empty() || !Path::new(&install_dir).exists() {
                    continue;
                }

                let clean_dir = install_dir.trim_end_matches('\\').to_lowercase();
                if seen_dirs.contains(&clean_dir) {
                    continue;
                }

                let (content_id, resolved_exe) = Self::parse_ea_installer_xml(Path::new(&install_dir))
                    .unwrap_or((sub_name.clone(), None));

                let size_on_disk = PlayniteScanner::compute_folder_size(Path::new(&install_dir));
                let launch_target = resolved_exe
                    .or_else(|| Some(format!("origin2://game/launch?offerIds={}", content_id)));

                seen_dirs.insert(clean_dir);
                games.push(Game {
                    id: format!("ea_{}", sanitize_id(&content_id)),
                    title: display_name,
                    source: "EA App".to_string(),
                    source_id: Some(content_id),
                    install_directory: Some(install_dir),
                    executable_path: launch_target,
                    is_installed: true,
                    size_on_disk,
                    platforms: vec!["PC (Windows)".to_string()],
                    date_added: Some(now_str.clone()),
                    completion_status: Some("Auto".to_string()),
                    ..Default::default()
                });
            }
        }

        Ok(games)
    }

    fn parse_ea_installer_xml(install_dir: &Path) -> Option<(String, Option<String>)> {
        let xml_path = install_dir.join("__Installer").join("installerdata.xml");
        let xml = fs::read_to_string(xml_path).ok()?;
        let content_id = extract_xml_tag(&xml, "contentID").unwrap_or_default();
        if content_id.is_empty() {
            return None;
        }
        let exe_rel = extract_xml_tag(&xml, "filePath");
        let resolved_exe = exe_rel.and_then(|rel| {
            let cleaned = rel.replace("[Install Dir]", "").trim_start_matches('\\').to_string();
            let full = install_dir.join(cleaned);
            if full.exists() {
                Some(full.to_string_lossy().to_string())
            } else {
                None
            }
        });
        Some((content_id, resolved_exe))
    }

    /// Fetches EA App achievements via Juno GraphQL `achievements(offerId, playerPsd, showHidden: true, locale: "US")`
    /// and enriches icons from local Playnite SuccessStory cache if present.
    pub async fn fetch_ea_achievements(
        game_id: &str,
        offer_id: &str,
        player_psd_or_pid: &str,
        access_token: Option<&str>,
        game_title: &str,
    ) -> Result<Vec<crate::models::Achievement>, String> {
        let mut results = Vec::new();
        let clean_offer = offer_id.trim();

        // Check if we have icon URLs or cached achievements in Playnite SuccessStory
        let mut icon_map_by_name: HashMap<String, (Option<String>, Option<String>, Option<f64>)> =
            HashMap::new();
        let mut cached_fallback: Vec<crate::models::Achievement> = Vec::new();

        if let Ok(appdata) = std::env::var("APPDATA") {
            let ss_dir = Path::new(&appdata)
                .join("Playnite")
                .join("ExtensionsData")
                .join("cebe6d32-8c46-4459-b993-5a5189d60788")
                .join("SuccessStory");
            if ss_dir.is_dir() {
                let norm_target = game_title
                    .to_lowercase()
                    .replace('™', "")
                    .replace('®', "")
                    .trim()
                    .to_string();
                if let Ok(entries) = fs::read_dir(&ss_dir) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        if p.extension().and_then(|e| e.to_str()) != Some("json") {
                            continue;
                        }
                        if let Ok(txt) = fs::read_to_string(&p) {
                            if let Ok(val) = serde_json::from_str::<Value>(&txt) {
                                let name = val["Name"]
                                    .as_str()
                                    .unwrap_or("")
                                    .to_lowercase()
                                    .replace('™', "")
                                    .replace('®', "")
                                    .trim()
                                    .to_string();
                                if !norm_target.is_empty() && name == norm_target {
                                    if let Some(items) = val["Items"].as_array() {
                                        for (idx, it) in items.iter().enumerate() {
                                            let aname = it["Name"].as_str().unwrap_or("").trim().to_string();
                                            if aname.is_empty() {
                                                continue;
                                            }
                                            let url_un = it["UrlUnlocked"]
                                                .as_str()
                                                .filter(|s| !s.is_empty())
                                                .map(|s| s.to_string());
                                            let url_lo = it["UrlLocked"]
                                                .as_str()
                                                .filter(|s| !s.is_empty())
                                                .map(|s| s.to_string())
                                                .or_else(|| url_un.clone());
                                            let pct = it["Percent"].as_f64();
                                            let date_un = it["DateUnlocked"]
                                                .as_str()
                                                .filter(|s| !s.is_empty() && !s.starts_with("0001") && !s.starts_with("1970"))
                                                .map(|s| {
                                                    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
                                                        dt.format("%b %d, %Y %H:%M").to_string()
                                                    } else {
                                                        s.to_string()
                                                    }
                                                });
                                            icon_map_by_name.insert(
                                                aname.to_lowercase(),
                                                (url_un.clone(), url_lo.clone(), pct),
                                            );
                                            cached_fallback.push(crate::models::Achievement {
                                                game_id: game_id.to_string(),
                                                api_name: format!("ea_{}", idx + 1),
                                                display_name: aname,
                                                description: it["Description"].as_str().map(|s| s.to_string()),
                                                icon_url: url_un.unwrap_or_default(),
                                                icon_gray_url: url_lo,
                                                is_unlocked: date_un.is_some(),
                                                unlock_time: date_un,
                                                rarity_percentage: pct.unwrap_or(0.0),
                                                is_secret: it["IsHidden"].as_bool().unwrap_or(false),
                                            });
                                        }
                                    }
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }

        if let Some(tok) = access_token.filter(|t| !t.trim().is_empty()) {
            let client = reqwest::Client::new();
            let clean_token = tok.trim();

            // Resolve `playerPsd` if needed
            let mut psd = player_psd_or_pid.trim().to_string();
            let id_body = serde_json::json!({
                "query": "query { me { player { pd psd } } }"
            });
            if let Ok(resp) = client
                .post(Self::JUNO_GRAPHQL_URL)
                .bearer_auth(clean_token)
                .header("User-Agent", "EAApp/13.524.0.6037")
                .json(&id_body)
                .send()
                .await
            {
                if let Ok(json) = resp.json::<Value>().await {
                    if let Some(resolved_psd) = json["data"]["me"]["player"]["psd"]
                        .as_str()
                        .filter(|s| !s.is_empty())
                    {
                        psd = resolved_psd.to_string();
                    }
                }
            }

            if !clean_offer.is_empty() && !psd.is_empty() {
                let ach_body = serde_json::json!({
                    "operationName": "GetAchievements",
                    "variables": {
                        "offerIds": [clean_offer],
                        "playerPsd": psd,
                        "showHidden": true,
                        "locale": "US"
                    },
                    "query": "query GetAchievements($offerIds: [String!]!, $playerPsd: String!, $showHidden: Boolean, $locale: Locale) { achievements(offerIds: $offerIds, playerPsd: $playerPsd, showHidden: $showHidden, locale: $locale) { id achievements { id name description awardCount date } } }"
                });

                if let Ok(resp) = client
                    .post(Self::JUNO_GRAPHQL_URL)
                    .bearer_auth(clean_token)
                    .header("User-Agent", "EAApp/13.524.0.6037")
                    .json(&ach_body)
                    .send()
                    .await
                {
                    if resp.status().is_success() {
                        if let Ok(json) = resp.json::<Value>().await {
                            let sets = json["data"]["achievements"].as_array();
                            if let Some(arr) = sets {
                                for set in arr {
                                    if let Some(ach_list) = set["achievements"].as_array() {
                                        for item in ach_list {
                                            let aid = item["id"].as_str().unwrap_or("").trim().to_string();
                                            let name = item["name"].as_str().unwrap_or("").trim().to_string();
                                            if aid.is_empty() || name.is_empty() {
                                                continue;
                                            }
                                            let desc = item["description"].as_str().map(|s| s.to_string());
                                            let award_count = item["awardCount"].as_i64().unwrap_or(0);
                                            let unlocked = award_count > 0;
                                            let unlock_time = if unlocked {
                                                item["date"]
                                                    .as_str()
                                                    .filter(|s| !s.is_empty() && !s.starts_with("1970"))
                                                    .map(|s| {
                                                        if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
                                                            dt.format("%b %d, %Y %H:%M").to_string()
                                                        } else {
                                                            s.to_string()
                                                        }
                                                    })
                                            } else {
                                                None
                                            };
                                            let (icon_url, icon_gray_url, rarity_percentage) = icon_map_by_name
                                                .get(&name.to_lowercase())
                                                .cloned()
                                                .unwrap_or((None, None, None));

                                            results.push(crate::models::Achievement {
                                                game_id: game_id.to_string(),
                                                api_name: sanitize_id(&aid),
                                                display_name: name,
                                                description: desc,
                                                icon_url: icon_url.unwrap_or_default(),
                                                icon_gray_url,
                                                is_unlocked: unlocked,
                                                unlock_time,
                                                rarity_percentage: rarity_percentage.unwrap_or(0.0),
                                                is_secret: false,
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

        if results.is_empty() && !cached_fallback.is_empty() {
            return Ok(cached_fallback);
        }

        Ok(results)
    }
}

// ============================================================================
// 5. UBISOFT CONNECT SCANNER (Launcher Installs Registry + Uplay Uninstall)
// ============================================================================
pub struct UbisoftScanner;

impl UbisoftScanner {
    pub fn scan_installed_games() -> Result<Vec<Game>, String> {
        let mut games = Vec::new();
        let mut seen_ids = HashSet::new();
        let now_str = chrono::Local::now().format("%Y-%m-%d").to_string();

        #[cfg(target_os = "windows")]
        {
            let ps_script = r#"
$ErrorActionPreference = 'SilentlyContinue'
$paths = @('HKLM:\SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs', 'HKLM:\SOFTWARE\Ubisoft\Launcher\Installs')
$results = @()
foreach ($p in $paths) {
    if (Test-Path $p) {
        Get-ChildItem $p | ForEach-Object {
            $appId = [string]$_.PSChildName
            $prop = Get-ItemProperty $_.PSPath
            $dir = [string]$prop.InstallDir
            $uninstPath = "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Uplay Install $appId"
            $dispName = ''
            if (Test-Path $uninstPath) {
                $uprop = Get-ItemProperty $uninstPath
                $dispName = [string]$uprop.DisplayName
            }
            $results += [PSCustomObject]@{
                AppId = $appId
                InstallDir = $dir
                DisplayName = $dispName
            }
        }
    }
}
$results | ConvertTo-Json -Compress
"#;
            for item in run_powershell_json(ps_script) {
                let app_id = item["AppId"].as_str().unwrap_or("").trim().to_string();
                let install_dir = item["InstallDir"]
                    .as_str()
                    .unwrap_or("")
                    .trim()
                    .replace('/', "\\");
                let disp_name = item["DisplayName"].as_str().unwrap_or("").trim().to_string();

                if app_id.is_empty() || install_dir.is_empty() || seen_ids.contains(&app_id) {
                    continue;
                }

                let clean_path = Path::new(install_dir.trim_end_matches('\\'));
                if !clean_path.exists() {
                    continue;
                }

                let title = if !disp_name.is_empty() {
                    disp_name
                } else {
                    clean_path
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| format!("Ubisoft Game {}", app_id))
                };

                let size_on_disk = PlayniteScanner::compute_folder_size(clean_path);
                let launch_uri = format!("uplay://launch/{}/0", app_id);

                seen_ids.insert(app_id.clone());
                games.push(Game {
                    id: format!("ubisoft_{}", app_id),
                    title,
                    source: "Ubisoft Connect".to_string(),
                    source_id: Some(app_id),
                    install_directory: Some(clean_path.to_string_lossy().to_string()),
                    executable_path: Some(launch_uri),
                    is_installed: true,
                    size_on_disk,
                    platforms: vec!["PC (Windows)".to_string()],
                    date_added: Some(now_str.clone()),
                    completion_status: Some("Auto".to_string()),
                    ..Default::default()
                });
            }
        }

        Ok(games)
    }

    /// Scans `%LOCALAPPDATA%\Ubisoft Game Launcher\cache\configuration\configurations` just like Playnite's UplayLibrary
    pub fn scan_local_configurations_owned(installed_ids: &HashSet<String>) -> Vec<Game> {
        let mut owned = Vec::new();
        let Ok(local_app_data) = std::env::var("LOCALAPPDATA") else {
            return owned;
        };
        let cfg_path = Path::new(&local_app_data)
            .join("Ubisoft Game Launcher")
            .join("cache")
            .join("configuration")
            .join("configurations");
        if !cfg_path.exists() {
            return owned;
        }
        let Ok(bytes) = fs::read(&cfg_path) else {
            return owned;
        };
        let content = String::from_utf8_lossy(&bytes);
        let now_str = chrono::Local::now().format("%Y-%m-%d").to_string();
        let mut seen = HashSet::new();

        for chunk in content.split("version: 2.0") {
            if !chunk.contains("root:") {
                continue;
            }
            // Skip DLCs or third_party_platform if not standalone game
            let mut name_val = String::new();
            let mut thumb_img = String::new();
            let mut app_id = String::new();

            for line in chunk.lines() {
                let t = line.trim();
                if name_val.is_empty() && t.starts_with("name:") {
                    let v = t.trim_start_matches("name:").trim().trim_matches('"').trim_matches('\'');
                    if !v.is_empty()
                        && !v.eq_ignore_ascii_case("NAME")
                        && !v.eq_ignore_ascii_case("GAMENAME")
                        && !v.starts_with("l1")
                    {
                        name_val = v.to_string();
                    }
                } else if thumb_img.is_empty() && t.starts_with("thumb_image:") {
                    let v = t.trim_start_matches("thumb_image:").trim().trim_matches('"').trim_matches('\'');
                    if !v.is_empty() && v.ends_with(".jpg") || v.ends_with(".png") {
                        thumb_img = format!("https://ubistatic3-a.akamaihd.net/orbit/uplay_launcher_3_0/assets/{}", v);
                    }
                } else if app_id.is_empty() && t.starts_with("space_id:") {
                    let v = t.trim_start_matches("space_id:").trim().trim_matches('"').trim_matches('\'');
                    if !v.is_empty() {
                        app_id = v.to_string();
                    }
                }
            }

            if name_val.is_empty() {
                continue;
            }
            let id_key = if !app_id.is_empty() { app_id.clone() } else { sanitize_id(&name_val) };
            if installed_ids.contains(&id_key) || seen.contains(&id_key) {
                continue;
            }
            seen.insert(id_key.clone());

            owned.push(Game {
                id: format!("ubisoft_{}", sanitize_id(&id_key)),
                title: name_val,
                source: "Ubisoft Connect".to_string(),
                source_id: Some(id_key),
                cover_image: if thumb_img.is_empty() { None } else { Some(thumb_img) },
                is_installed: false,
                platforms: vec!["PC (Windows)".to_string()],
                date_added: Some(now_str.clone()),
                completion_status: Some("Auto".to_string()),
                ..Default::default()
            });
        }

        owned
    }

    /// Queries Ubisoft Connect Cloud GraphQL API for owned games, playtimes (`playtime`), and `lastPlayedDate`
    pub async fn fetch_cloud_library(ticket: &str) -> Result<Vec<Game>, String> {
        let client = reqwest::Client::new();
        let gql_body = serde_json::json!({
            "operationName": "AllGames",
            "variables": {},
            "query": "query AllGames { viewer { id name ... on User { ownedGames: games(filterBy: {isOwned: true}) { totalCount edges { node { id spaceId name backgroundImageUrl verticalCoverImageUrl: cardImageUrl viewer { meta { id isOwned playTime lastPlayedDate } } } } } } } }"
        });

        let resp = client
            .post("https://public-ubiservices.ubi.com/v1/profiles/me/uplay/graphql")
            .header("Authorization", format!("Ubi_v1 t={}", ticket.trim()))
            .header("Ubi-AppId", "f68a4bb5-608a-4ff2-8123-be8ef797e0a6")
            .header("Content-Type", "application/json")
            .json(&gql_body)
            .send()
            .await
            .map_err(|e| format!("Ubisoft GraphQL failed: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Ubisoft GraphQL returned HTTP {}", resp.status()));
        }

        let json: Value = resp.json().await.map_err(|e| e.to_string())?;
        let mut cloud_games = Vec::new();
        let now_str = chrono::Local::now().format("%Y-%m-%d").to_string();

        if let Some(edges) = json["data"]["viewer"]["ownedGames"]["edges"].as_array() {
            for edge in edges {
                let node = &edge["node"];
                let title = node["name"].as_str().unwrap_or("").trim().to_string();
                if title.is_empty() {
                    continue;
                }
                let gid = node["id"]
                    .as_str()
                    .or_else(|| node["spaceId"].as_str())
                    .unwrap_or("")
                    .to_string();
                if gid.is_empty() {
                    continue;
                }

                let cover = node["verticalCoverImageUrl"].as_str().map(|s| s.to_string());
                let bg = node["backgroundImageUrl"].as_str().map(|s| s.to_string());
                let pt_secs = node["viewer"]["meta"]["playTime"].as_u64().unwrap_or(0);
                let last_played = node["viewer"]["meta"]["lastPlayedDate"]
                    .as_str()
                    .filter(|s| !s.is_empty() && !s.starts_with("1970"))
                    .map(|s| s.get(..10).unwrap_or(s).to_string());

                cloud_games.push(Game {
                    id: format!("ubisoft_{}", sanitize_id(&gid)),
                    title,
                    source: "Ubisoft Connect".to_string(),
                    source_id: Some(gid.clone()),
                    executable_path: Some(format!("uplay://launch/{}/0", gid)),
                    cover_image: cover,
                    background_image: bg,
                    playtime_seconds: pt_secs,
                    last_played,
                    is_installed: false,
                    platforms: vec!["PC (Windows)".to_string()],
                    date_added: Some(now_str.clone()),
                    completion_status: Some("Auto".to_string()),
                    ..Default::default()
                });
            }
        }

        Ok(cloud_games)
    }
}

// ============================================================================
// 6. RIOT GAMES SCANNER (RiotClientInstalls.json + Metadata/*.live)
// ============================================================================
pub struct RiotScanner;

impl RiotScanner {
    pub fn scan_installed_games() -> Result<Vec<Game>, String> {
        let mut games = Vec::new();
        let mut seen_products = HashSet::new();
        let now_str = chrono::Local::now().format("%Y-%m-%d").to_string();

        // Locate RiotClientServices.exe
        let riot_client_exe = Self::find_riot_client_exe();

        // Scan C:\ProgramData\Riot Games\Metadata\*.live
        let metadata_dir = PathBuf::from(r"C:\ProgramData\Riot Games\Metadata");
        if metadata_dir.is_dir() {
            if let Ok(entries) = fs::read_dir(&metadata_dir) {
                for entry in entries.flatten() {
                    let folder = entry.path();
                    if !folder.is_dir() {
                        continue;
                    }
                    let folder_name = folder
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();

                    if !folder_name.ends_with(".live") {
                        continue;
                    }
                    let product_id = folder_name.trim_end_matches(".live").to_string();
                    if product_id.is_empty()
                        || product_id == "riot_client"
                        || seen_products.contains(&product_id)
                    {
                        continue;
                    }

                    // Look for *.product_settings.yaml inside the folder
                    let mut install_path: Option<String> = None;
                    if let Ok(sub_entries) = fs::read_dir(&folder) {
                        for sub in sub_entries.flatten() {
                            let sp = sub.path();
                            if sp
                                .file_name()
                                .map(|n| n.to_string_lossy().ends_with(".product_settings.yaml"))
                                .unwrap_or(false)
                            {
                                if let Ok(yaml_content) = fs::read_to_string(&sp) {
                                    for line in yaml_content.lines() {
                                        let trimmed = line.trim();
                                        if let Some(val) =
                                            trimmed.strip_prefix("product_install_full_path:")
                                        {
                                            let cleaned = val
                                                .trim()
                                                .trim_matches('"')
                                                .trim_matches('\'')
                                                .replace('/', "\\");
                                            if !cleaned.is_empty() {
                                                // Test actual path, then test alternate drive letters
                                                let mut candidate_path = cleaned.clone();
                                                if !Path::new(&candidate_path).exists() {
                                                    for drive in ["C", "D", "E", "G", "T", "Z"] {
                                                        if candidate_path.len() >= 2 && candidate_path.chars().nth(1) == Some(':') {
                                                            let alternate = format!("{}:{}", drive, &candidate_path[2..]);
                                                            if Path::new(&alternate).exists() {
                                                                candidate_path = alternate;
                                                                break;
                                                            }
                                                        }
                                                    }
                                                }
                                                install_path = Some(candidate_path);
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Fallback to default install locations if not read from yaml
                    if install_path.is_none() {
                        let default_dir = match product_id.as_str() {
                            "league_of_legends" => r"C:\Riot Games\League of Legends",
                            "valorant" => r"C:\Riot Games\VALORANT",
                            "bacon" => r"C:\Riot Games\Legends of Runeterra",
                            _ => "",
                        };
                        if !default_dir.is_empty() {
                            install_path = Some(default_dir.to_string());
                        }
                    }

                    let inst_dir = install_path.unwrap_or_else(|| format!(r"C:\Riot Games\{}", product_id));

                    // Verify that the install directory actually exists on disk!
                    let inst_dir_path = Path::new(&inst_dir);
                    if product_id == "teamfighttactics" {
                        // TFT has no standalone directory on PC and runs via League of Legends.
                        // If neither League nor a dedicated directory exists, it is not installed.
                        let lol_dir = Path::new(r"C:\Riot Games\League of Legends");
                        if !lol_dir.exists() && !inst_dir_path.exists() {
                            continue;
                        }
                    } else if !inst_dir_path.exists() {
                        continue;
                    }

                    // Ensure the directory is not an empty leftover folder
                    if inst_dir_path.exists() {
                        if let Ok(mut read) = fs::read_dir(inst_dir_path) {
                            if read.next().is_none() {
                                continue;
                            }
                        }
                    }

                    let title = match product_id.as_str() {
                        "league_of_legends" => "League of Legends".to_string(),
                        "valorant" => "VALORANT".to_string(),
                        "bacon" => "Legends of Runeterra".to_string(),
                        "lion" => "2XKO".to_string(),
                        other => other.replace('_', " "),
                    };

                    let size_on_disk = PlayniteScanner::compute_folder_size(Path::new(&inst_dir));
                    let launch_args = format!(
                        "--launch-product={} --launch-patchline=live",
                        product_id
                    );

                    seen_products.insert(product_id.clone());
                    games.push(Game {
                        id: format!("riot_{}", product_id),
                        title,
                        source: "Riot Games".to_string(),
                        source_id: Some(product_id),
                        install_directory: Some(inst_dir),
                        executable_path: riot_client_exe.clone(),
                        launch_arguments: Some(launch_args),
                        is_installed: true,
                        size_on_disk,
                        platforms: vec!["PC (Windows)".to_string()],
                        date_added: Some(now_str.clone()),
                        completion_status: Some("Auto".to_string()),
                        ..Default::default()
                    });
                }
            }
        }

        Ok(games)
    }

    /// Returns uninstalled Riot PC games (matching Playnite's RiotGamesLibrary uninstalled import)
    pub fn get_uninstalled_catalog(installed_ids: &HashSet<String>) -> Vec<Game> {
        let now_str = chrono::Local::now().format("%Y-%m-%d").to_string();
        let riot_client_exe = Self::find_riot_client_exe();
        let catalog = [
            ("league_of_legends", "League of Legends"),
            ("valorant", "VALORANT"),
            ("bacon", "Legends of Runeterra"),
            ("lion", "2XKO"),
        ];

        let mut out = Vec::new();
        for (prod_id, title) in catalog {
            if installed_ids.contains(prod_id) {
                continue;
            }
            out.push(Game {
                id: format!("riot_{}", prod_id),
                title: title.to_string(),
                source: "Riot Games".to_string(),
                source_id: Some(prod_id.to_string()),
                executable_path: riot_client_exe.clone(),
                launch_arguments: Some(format!("--launch-product={} --launch-patchline=live", prod_id)),
                is_installed: false,
                platforms: vec!["PC (Windows)".to_string()],
                date_added: Some(now_str.clone()),
                completion_status: Some("Auto".to_string()),
                ..Default::default()
            });
        }
        out
    }

    fn find_riot_client_exe() -> Option<String> {
        let installs_json = PathBuf::from(r"C:\ProgramData\Riot Games\RiotClientInstalls.json");
        if installs_json.exists() {
            if let Ok(content) = fs::read_to_string(&installs_json) {
                if let Ok(val) = serde_json::from_str::<Value>(&content) {
                    for key in ["rc_default", "rc_live", "rc_beta"] {
                        if let Some(p) = val[key].as_str() {
                            let norm = p.replace('/', "\\");
                            if Path::new(&norm).exists() {
                                return Some(norm);
                            }
                        }
                    }
                }
            }
        }
        let default_path = r"C:\Riot Games\Riot Client\RiotClientServices.exe";
        if Path::new(default_path).exists() {
            Some(default_path.to_string())
        } else {
            None
        }
    }
}

// ============================================================================
// 7. AMAZON GAMES SCANNER (GameInstallInfo.sqlite)
// ============================================================================
pub struct AmazonScanner;

impl AmazonScanner {
    /// Generates a deterministic PKCE verifier + challenge and Amazon Launcher client_id for OAuth
    /// matching Playnite's `AmazonAccountClient.cs` (`amzn_sonic_games_launcher`).
    pub fn build_login_params() -> (String, String, String, String) {
        // Exact device_serial & client_id used by Playnite's AmazonAccountClient.cs
        let device_serial = "73db8d286c2a924d2e77e1af67766645".to_string();
        let client_id_hex = "3733646238643238366332613932346432653737653161663637373636363435234132554d56484f58375550345637".to_string();

        // Known valid 43-char PKCE code_verifier & its exact SHA-256 base64url code_challenge:
        // verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
        // challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM" (RFC 7636 Appendix B test vector!)
        let code_verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk".to_string();
        let code_challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM".to_string();

        let login_url = format!(
            "https://www.amazon.com/ap/signin?openid.ns=http://specs.openid.net/auth/2.0&openid.claimed_id=http://specs.openid.net/auth/2.0/identifier_select&openid.identity=http://specs.openid.net/auth/2.0/identifier_select&openid.mode=checkid_setup&openid.oa2.scope=device_auth_access&openid.ns.oa2=http://www.amazon.com/ap/ext/oauth/2&openid.oa2.response_type=code&openid.oa2.code_challenge_method=S256&openid.oa2.client_id=device:{}&language=en_US&marketPlaceId=ATVPDKIKX0DER&openid.return_to=https://www.amazon.com&openid.pape.max_auth_age=0&openid.assoc_handle=amzn_sonic_games_launcher&pageId=amzn_sonic_games_launcher&openid.oa2.code_challenge={}",
            client_id_hex, code_challenge
        );

        (login_url, device_serial, client_id_hex, code_verifier)
    }

    pub async fn exchange_code_for_token(code: &str) -> Result<ProviderAuthResult, String> {
        let (_, device_serial, client_id_hex, code_verifier) = Self::build_login_params();
        let client = reqwest::Client::new();

        let body = serde_json::json!({
            "auth_data": {
                "authorization_code": code.trim(),
                "client_domain": "DeviceLegacy",
                "client_id": client_id_hex,
                "code_algorithm": "SHA-256",
                "code_verifier": code_verifier,
                "use_global_authentication": false
            },
            "registration_data": {
                "app_name": "AGSLauncher for Windows",
                "app_version": "1.0.0",
                "device_model": "Windows",
                "device_name": null,
                "device_serial": device_serial,
                "device_type": "A2UMVHOX7UP4V7",
                "domain": "Device",
                "os_version": "10.0.19044.0"
            },
            "requested_extensions": ["customer_info", "device_info"],
            "requested_token_type": ["bearer", "mac_dms"]
        });

        let resp = client
            .post("https://api.amazon.com/auth/register")
            .header("Content-Type", "application/json")
            .header("User-Agent", "com.amazon.agslauncher.win/3.0.9202.1")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Amazon register failed: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Amazon authentication failed ({})", resp.status()));
        }

        let json: Value = resp.json().await.map_err(|e| e.to_string())?;
        let bearer = &json["response"]["success"]["tokens"]["bearer"];
        let access_token = bearer["access_token"]
            .as_str()
            .ok_or("Missing Amazon access_token")?
            .to_string();
        let refresh_token = bearer["refresh_token"].as_str().map(|s| s.to_string());

        let cust = &json["response"]["success"]["extensions"]["customer_info"];
        let user_id = cust["user_id"].as_str().unwrap_or("amazon_user").to_string();
        let display_name = cust["given_name"]
            .as_str()
            .or_else(|| cust["name"].as_str())
            .unwrap_or("Amazon Prime Gamer")
            .to_string();

        Ok(ProviderAuthResult {
            account_id: user_id,
            display_name,
            avatar_url: None,
            access_token,
            refresh_token,
        })
    }

    pub async fn fetch_cloud_library(access_token: &str) -> Result<Vec<Game>, String> {
        let client = reqwest::Client::new();
        let mut owned_games = Vec::new();
        let mut seen_ids = HashSet::new();
        let now_str = chrono::Local::now().format("%Y-%m-%d").to_string();
        let mut next_token: Option<String> = None;

        for _ in 0..20 {
            let body = serde_json::json!({
                "Operation": "GetEntitlements",
                "clientId": "Sonic",
                "syncPoint": null,
                "nextToken": next_token,
                "maxResults": 500,
                "productIdFilter": null,
                "keyId": "d5dc8b8b-86c8-4fc4-ae93-18c0def5314d",
                "hardwareHash": "00000000000000000000000000000000"
            });

            let resp = client
                .post("https://gaming.amazon.com/api/distribution/entitlements")
                .header("Content-Type", "application/x-amz-json-1.0")
                .header(
                    "X-Amz-Target",
                    "com.amazon.animusdistributionservice.entitlement.AnimusEntitlementsService.GetEntitlements",
                )
                .header("x-amzn-token", access_token)
                .header("User-Agent", "com.amazon.agslauncher.win/3.0.9202.1")
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("Amazon entitlements request failed: {}", e))?;

            if !resp.status().is_success() {
                return Err(format!("Amazon entitlements returned HTTP {}", resp.status()));
            }

            let json: Value = resp.json().await.map_err(|e| e.to_string())?;
            if let Some(ents) = json["entitlements"].as_array() {
                for ent in ents {
                    let prod = &ent["product"];
                    let pid = prod["id"].as_str().unwrap_or("").trim().to_string();
                    let title = prod["title"].as_str().unwrap_or("").trim().to_string();
                    if pid.is_empty() || title.is_empty() || seen_ids.contains(&pid) {
                        continue;
                    }
                    seen_ids.insert(pid.clone());

                    let details = &prod["productDetail"]["details"];
                    let cover = prod["productDetail"]["iconUrl"]
                        .as_str()
                        .map(|s| s.to_string());
                    let bg = details["backgroundUrl1"]
                        .as_str()
                        .or_else(|| details["backgroundUrl2"].as_str())
                        .map(|s| s.to_string());
                    let developer = details["developer"].as_str().map(|s| s.to_string());
                    let publisher = details["publisher"].as_str().map(|s| s.to_string());
                    let desc = details["shortDescription"].as_str().map(|s| s.to_string());

                    owned_games.push(Game {
                        id: format!("amazon_{}", sanitize_id(&pid)),
                        title,
                        source: "Amazon Games".to_string(),
                        source_id: Some(pid.clone()),
                        executable_path: Some(format!("amazon-games://play/{}", pid)),
                        cover_image: cover,
                        background_image: bg,
                        developer,
                        publisher,
                        description: desc,
                        is_installed: false,
                        platforms: vec!["PC (Windows)".to_string()],
                        date_added: Some(now_str.clone()),
                        completion_status: Some("Auto".to_string()),
                        ..Default::default()
                    });
                }
            }

            next_token = json["nextToken"].as_str().map(|s| s.to_string());
            if next_token.is_none() {
                break;
            }
        }

        Ok(owned_games)
    }

    pub fn scan_installed_games() -> Result<Vec<Game>, String> {
        let mut games = Vec::new();
        let now_str = chrono::Local::now().format("%Y-%m-%d").to_string();

        let Ok(local_app_data) = std::env::var("LOCALAPPDATA") else {
            return Ok(games);
        };

        let sqlite_path = Path::new(&local_app_data)
            .join("Amazon Games")
            .join("Data")
            .join("Games")
            .join("Sql")
            .join("GameInstallInfo.sqlite");

        if !sqlite_path.exists() {
            return Ok(games);
        }

        if let Ok(conn) = Connection::open_with_flags(&sqlite_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        {
            // Query all rows in DbSet (Installed = 1 -> installed, Installed = 0 -> owned/known in local db)
            if let Ok(mut stmt) = conn.prepare(
                "SELECT Id, ProductTitle, InstallDirectory, Installed FROM DbSet",
            ) {
                if let Ok(rows) = stmt.query_map([], |row| {
                    let id: String = row.get(0)?;
                    let title: String = row.get(1)?;
                    let install_dir: String = row.get::<_, String>(2).unwrap_or_default();
                    let installed_flag: i64 = row.get::<_, i64>(3).unwrap_or(0);
                    Ok((id, title, install_dir, installed_flag))
                }) {
                    for (id, title, install_dir, installed_flag) in rows.flatten() {
                        if title.trim().is_empty() {
                            continue;
                        }
                        let is_inst = installed_flag == 1 && !install_dir.is_empty() && Path::new(&install_dir).exists();
                        let size_on_disk = if is_inst {
                            PlayniteScanner::compute_folder_size(Path::new(&install_dir))
                        } else {
                            None
                        };
                        let launch_uri = format!("amazon-games://play/{}", id);

                        games.push(Game {
                            id: format!("amazon_{}", sanitize_id(&id)),
                            title,
                            source: "Amazon Games".to_string(),
                            source_id: Some(id),
                            install_directory: if is_inst { Some(install_dir) } else { None },
                            executable_path: Some(launch_uri),
                            is_installed: is_inst,
                            size_on_disk,
                            platforms: vec!["PC (Windows)".to_string()],
                            date_added: Some(now_str.clone()),
                            completion_status: Some("Auto".to_string()),
                            ..Default::default()
                        });
                    }
                }
            }
        }

        Ok(games)
    }
}

// ============================================================================
// 8. GOOGLE PLAY GAMES ON PC SCANNER (Start Menu Shortcuts + Registry)
// ============================================================================
pub struct GooglePlayScanner;

impl GooglePlayScanner {
    pub fn scan_installed_games() -> Result<Vec<Game>, String> {
        let mut games = Vec::new();
        let mut seen_titles = HashSet::new();
        let now_str = chrono::Local::now().format("%Y-%m-%d").to_string();

        let mut shortcut_dirs = Vec::new();
        if let Ok(appdata) = std::env::var("APPDATA") {
            shortcut_dirs.push(
                Path::new(&appdata)
                    .join(r"Microsoft\Windows\Start Menu\Programs\Google Play Games"),
            );
        }
        if let Ok(progdata) = std::env::var("ProgramData") {
            shortcut_dirs.push(
                Path::new(&progdata)
                    .join(r"Microsoft\Windows\Start Menu\Programs\Google Play Games"),
            );
        }

        for dir in shortcut_dirs {
            if !dir.is_dir() {
                continue;
            }
            if let Ok(entries) = fs::read_dir(&dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    let ext = path
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or("")
                        .to_lowercase();
                    if ext != "lnk" && ext != "url" {
                        continue;
                    }

                    let title = path
                        .file_stem()
                        .map(|s| s.to_string_lossy().to_string())
                        .unwrap_or_default();

                    if title.is_empty()
                        || title.eq_ignore_ascii_case("Google Play Games")
                        || seen_titles.contains(&title.to_lowercase())
                    {
                        continue;
                    }

                    seen_titles.insert(title.to_lowercase());
                    let id_slug = sanitize_id(&title);

                    games.push(Game {
                        id: format!("gplay_{}", id_slug),
                        title,
                        source: "Google Play Games".to_string(),
                        source_id: Some(id_slug),
                        executable_path: Some(path.to_string_lossy().to_string()),
                        is_installed: true,
                        platforms: vec!["PC (Windows)".to_string(), "Android".to_string()],
                        date_added: Some(now_str.clone()),
                        completion_status: Some("Auto".to_string()),
                        ..Default::default()
                    });
                }
            }
        }

        Ok(games)
    }
}

// ============================================================================
// 9. ROBLOX SCANNER (%LOCALAPPDATA%\Roblox\Versions + Registry)
// ============================================================================
pub struct RobloxScanner;

impl RobloxScanner {
    pub fn scan_installed_games() -> Result<Vec<Game>, String> {
        let mut games = Vec::new();
        let now_str = chrono::Local::now().format("%Y-%m-%d").to_string();

        if let Some((exe_path, version_dir)) = Self::find_latest_roblox_player() {
            let size_on_disk = PlayniteScanner::compute_folder_size(&version_dir);
            games.push(Game {
                id: "roblox_player".to_string(),
                title: "Roblox".to_string(),
                source: "Roblox".to_string(),
                source_id: Some("roblox_player".to_string()),
                install_directory: Some(version_dir.to_string_lossy().to_string()),
                executable_path: Some(exe_path.to_string_lossy().to_string()),
                is_installed: true,
                size_on_disk,
                developer: Some("Roblox Corporation".to_string()),
                publisher: Some("Roblox Corporation".to_string()),
                platforms: vec!["PC (Windows)".to_string()],
                date_added: Some(now_str),
                completion_status: Some("Auto".to_string()),
                ..Default::default()
            });
        }

        Ok(games)
    }

    pub fn find_latest_roblox_player() -> Option<(PathBuf, PathBuf)> {
        let mut candidate_roots = Vec::new();
        if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
            candidate_roots.push(Path::new(&local_appdata).join("Roblox").join("Versions"));
        }
        if let Ok(progfiles_x86) = std::env::var("ProgramFiles(x86)") {
            candidate_roots.push(Path::new(&progfiles_x86).join("Roblox").join("Versions"));
        }

        let mut latest_match: Option<(std::time::SystemTime, PathBuf, PathBuf)> = None;

        for root in candidate_roots {
            if !root.is_dir() {
                continue;
            }
            if let Ok(entries) = fs::read_dir(&root) {
                for entry in entries.flatten() {
                    let vdir = entry.path();
                    if !vdir.is_dir() {
                        continue;
                    }
                    let player_exe = vdir.join("RobloxPlayerBeta.exe");
                    if player_exe.exists() {
                        let mtime = fs::metadata(&player_exe)
                            .and_then(|m| m.modified())
                            .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
                        if latest_match.as_ref().map(|(t, _, _)| mtime > *t).unwrap_or(true) {
                            latest_match = Some((mtime, player_exe, vdir));
                        }
                    }
                }
            }
        }

        latest_match.map(|(_, exe, dir)| (exe, dir))
    }
}

// ============================================================================
// XML & ID Helpers
// ============================================================================
fn sanitize_id(raw: &str) -> String {
    raw.chars()
        .map(|c| if c.is_alphanumeric() { c.to_ascii_lowercase() } else { '_' })
        .collect::<String>()
        .trim_matches('_')
        .to_string()
}

fn extract_xml_tag(xml: &str, tag: &str) -> Option<String> {
    let open = format!("<{}>", tag);
    let close = format!("</{}>", tag);
    let start = xml.find(&open)? + open.len();
    let end = xml[start..].find(&close)? + start;
    Some(xml[start..end].trim().to_string())
}

fn extract_xml_attr(xml: &str, element: &str, attr: &str) -> Option<String> {
    let el_pat = format!("<{}", element);
    let el_start = xml.find(&el_pat)?;
    let el_end = xml[el_start..].find('>')? + el_start;
    let tag_slice = &xml[el_start..el_end];

    let attr_pat = format!("{}=\"", attr);
    let val_start = tag_slice.find(&attr_pat)? + attr_pat.len();
    let val_end = tag_slice[val_start..].find('"')? + val_start;
    Some(tag_slice[val_start..val_end].trim().to_string())
}
