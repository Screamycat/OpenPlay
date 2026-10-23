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

    /// Fetches assets (grids, heroes, logos, icons) for a given game ID
    pub async fn fetch_assets(
        api_key: &str,
        game_id: u64,
        asset_type: &str, // "grids", "heroes", "logos", "icons"
    ) -> Result<Vec<SteamGridDBAsset>, String> {
        let endpoint = match asset_type {
            "heroes" => "heroes",
            "logos" => "logos",
            "icons" => "icons",
            _ => "grids",
        };

        // For grids, request 600x900 vertical posters with both animated and static types
        let url = if endpoint == "grids" {
            format!(
                "https://www.steamgriddb.com/api/v2/grids/game/{}?dimensions=600x900&types=animated,static",
                game_id
            )
        } else {
            format!(
                "https://www.steamgriddb.com/api/v2/{}/game/{}?types=animated,static",
                endpoint, game_id
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
