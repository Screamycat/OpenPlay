use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SteamGridDBAsset {
    pub id: u64,
    pub score: i64,
    pub style: Option<String>,
    pub width: u32,
    pub height: u32,
    pub url: String,
    pub thumb: String,
    pub mime: String,
    pub is_animated: bool,
    pub author: Option<String>,
}

pub struct SteamGridDBClient;

fn percent_encode_path_segment(input: &str) -> String {
    let mut out = String::with_capacity(input.len() * 2);
    for b in input.as_bytes() {
        match *b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*b as char);
            }
            _ => {
                out.push_str(&format!("%{:02X}", b));
            }
        }
    }
    out
}

fn sanitize_title_for_search(title: &str) -> String {
    title
        .chars()
        .filter(|c| !matches!(*c, '™' | '®' | '©' | '\u{FFFD}'))
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<&str>>()
        .join(" ")
}

fn normalize_compare(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_alphanumeric())
        .collect::<String>()
        .to_lowercase()
}

impl SteamGridDBClient {
    /// Resolves Steam App ID to SteamGridDB game ID
    pub async fn get_game_id(api_key: &str, steam_appid: &str) -> Result<u64, String> {
        let url = format!("https://www.steamgriddb.com/api/v2/games/steam/{}", steam_appid);
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(8))
            .build()
            .map_err(|e| e.to_string())?;

        let resp = client
            .get(&url)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("User-Agent", "OpenPlay/0.1.0")
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !resp.status().is_success() {
            return Err(format!("SteamGridDB API returned status: {}", resp.status()));
        }

        let json: Value = resp.json().await.map_err(|e| e.to_string())?;
        let id = json
            .get("data")
            .and_then(|d| d.get("id"))
            .and_then(|v| v.as_u64())
            .ok_or_else(|| "SteamGridDB game ID not found for this Steam app".to_string())?;

        Ok(id)
    }

    /// Searches SteamGridDB by game title (used for Epic Games, Manual games, or custom search queries)
    pub async fn search_game_id_by_title(api_key: &str, title: &str) -> Result<u64, String> {
        let clean = sanitize_title_for_search(title);
        if clean.is_empty() {
            return Err("Game title is empty; cannot search SteamGridDB".to_string());
        }

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(8))
            .build()
            .map_err(|e| e.to_string())?;

        // Build candidate search queries: full clean title first, then base title before ':' if edition suffix exists
        let mut candidates = vec![clean.clone()];
        if let Some((base, _)) = clean.split_once(':') {
            let trimmed_base = base.trim();
            if trimmed_base.len() >= 3 && trimmed_base != clean {
                candidates.push(trimmed_base.to_string());
            }
        }
        // Also try replacing ':' with space if present
        if clean.contains(':') {
            let no_colon = clean.replace(':', " ").split_whitespace().collect::<Vec<&str>>().join(" ");
            if !candidates.contains(&no_colon) {
                candidates.insert(1, no_colon);
            }
        }

        let target_norm = normalize_compare(&clean);
        let base_norm = clean
            .split_once(':')
            .map(|(b, _)| normalize_compare(b))
            .unwrap_or_else(|| target_norm.clone());

        for term in candidates {
            let encoded = percent_encode_path_segment(&term);
            let url = format!("https://www.steamgriddb.com/api/v2/search/autocomplete/{}", encoded);

            let resp = client
                .get(&url)
                .header("Authorization", format!("Bearer {}", api_key))
                .header("User-Agent", "OpenPlay/0.1.0")
                .send()
                .await
                .map_err(|e| e.to_string())?;

            if resp.status() == reqwest::StatusCode::UNAUTHORIZED || resp.status() == reqwest::StatusCode::FORBIDDEN {
                return Err(format!("SteamGridDB API key rejected ({}). Check your key in Settings -> APIs & Services.", resp.status()));
            }

            if !resp.status().is_success() {
                continue;
            }

            let json: Value = resp.json().await.map_err(|e| e.to_string())?;
            if let Some(arr) = json.get("data").and_then(|d| d.as_array()) {
                if arr.is_empty() {
                    continue;
                }

                // 1. Exact normalized match on full title
                if let Some(exact) = arr.iter().find(|item| {
                    item.get("name")
                        .and_then(|v| v.as_str())
                        .map(|n| normalize_compare(n) == target_norm)
                        .unwrap_or(false)
                }) {
                    if let Some(id) = exact.get("id").and_then(|v| v.as_u64()) {
                        return Ok(id);
                    }
                }

                // 2. Exact normalized match on base title (strips edition suffixes like ": Celebration Edition")
                if let Some(base_match) = arr.iter().find(|item| {
                    item.get("name")
                        .and_then(|v| v.as_str())
                        .map(|n| normalize_compare(n) == base_norm)
                        .unwrap_or(false)
                }) {
                    if let Some(id) = base_match.get("id").and_then(|v| v.as_u64()) {
                        return Ok(id);
                    }
                }

                // 3. Best top autocomplete match
                if let Some(first_id) = arr[0].get("id").and_then(|v| v.as_u64()) {
                    return Ok(first_id);
                }
            }
        }

        Err(format!("No matching game found on SteamGridDB for '{}'", clean))
    }

    /// Resolves SteamGridDB game ID intelligently across Steam, Epic Games, Manual games, or custom search
    pub async fn resolve_game_id(
        api_key: &str,
        source: Option<&str>,
        appid: Option<&str>,
        title: Option<&str>,
    ) -> Result<u64, String> {
        let is_steam = source
            .map(|s| s.trim().eq_ignore_ascii_case("steam"))
            .unwrap_or(false);

        if is_steam {
            if let Some(aid) = appid.map(|s| s.trim()).filter(|s| !s.is_empty() && s.chars().all(|c| c.is_ascii_digit())) {
                match Self::get_game_id(api_key, aid).await {
                    Ok(id) => return Ok(id),
                    Err(_) if title.is_some() => {
                        // Fall through to title search if Steam App ID wasn't linked on SteamGridDB yet
                    }
                    Err(e) => return Err(e),
                }
            }
        }

        if let Some(t) = title.map(|s| s.trim()).filter(|s| !s.is_empty()) {
            return Self::search_game_id_by_title(api_key, t).await;
        }

        // Legacy fallback if caller only supplied a numeric Steam appid
        if let Some(aid) = appid.map(|s| s.trim()).filter(|s| !s.is_empty() && s.chars().all(|c| c.is_ascii_digit())) {
            return Self::get_game_id(api_key, aid).await;
        }

        Err("Cannot resolve SteamGridDB game without a valid title or Steam App ID".to_string())
    }

    /// Fetches assets (grids, heroes, logos, icons) for a given game ID
    pub async fn fetch_assets(
        api_key: &str,
        game_id: u64,
        asset_type: &str, // "grids", "heroes", "logos", "icons"
        nsfw: bool,
    ) -> Result<Vec<SteamGridDBAsset>, String> {
        let endpoint = match asset_type {
            "heroes" => "heroes",
            "logos" => "logos",
            "icons" => "icons",
            _ => "grids",
        };

        let nsfw_param = if nsfw { "any" } else { "false" };

        // For grids, request 600x900 vertical posters with both animated and static types
        let url = if endpoint == "grids" {
            format!(
                "https://www.steamgriddb.com/api/v2/grids/game/{}?dimensions=600x900&types=animated,static&nsfw={}",
                game_id, nsfw_param
            )
        } else {
            format!(
                "https://www.steamgriddb.com/api/v2/{}/game/{}?types=animated,static&nsfw={}",
                endpoint, game_id, nsfw_param
            )
        };

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .map_err(|e| e.to_string())?;

        let resp = client
            .get(&url)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("User-Agent", "OpenPlay/0.1.0")
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !resp.status().is_success() {
            return Err(format!("SteamGridDB error: {}", resp.status()));
        }

        let json: Value = resp.json().await.map_err(|e| e.to_string())?;
        let data_arr = json
            .get("data")
            .and_then(|d| d.as_array())
            .ok_or_else(|| "Invalid SteamGridDB response data".to_string())?;

        let mut assets = Vec::new();
        for item in data_arr {
            let id = item.get("id").and_then(|v| v.as_u64()).unwrap_or(0);
            let score = item.get("score").and_then(|v| v.as_i64()).unwrap_or(0);
            let style = item.get("style").and_then(|v| v.as_str()).map(|s| s.to_string());
            let width = item.get("width").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
            let height = item.get("height").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
            let url = item.get("url").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let thumb = item.get("thumb").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let mime = item.get("mime").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let author = item
                .get("author")
                .and_then(|a| a.get("name"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            // Check if animated: SteamGridDB provides .webm video thumbnails for all animated items
            let is_animated = thumb.ends_with(".webm")
                || url.ends_with(".webm")
                || mime.contains("gif")
                || mime.contains("apng")
                || (mime.contains("webp") && thumb.ends_with(".webm"))
                || item.get("is_animated").and_then(|v| v.as_bool()).unwrap_or(false);

            if !url.is_empty() {
                let final_thumb = if thumb.is_empty() { url.clone() } else { thumb };
                assets.push(SteamGridDBAsset {
                    id,
                    score,
                    style,
                    width,
                    height,
                    url,
                    thumb: final_thumb,
                    mime,
                    is_animated,
                    author,
                });
            }
        }

        // Sort assets so animated and highest-scored assets appear at the top
        assets.sort_by(|a, b| {
            if a.is_animated != b.is_animated {
                b.is_animated.cmp(&a.is_animated)
            } else {
                b.score.cmp(&a.score)
            }
        });

        Ok(assets)
    }
}
