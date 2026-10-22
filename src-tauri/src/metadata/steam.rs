use crate::models::Game;
use serde_json::Value;

pub struct SteamMetadataFetcher;

impl SteamMetadataFetcher {
    pub async fn fetch_metadata_for_appid(appid: &str) -> Result<PartialSteamMetadata, String> {
        let url = format!(
            "https://store.steampowered.com/api/appdetails?appids={}&l=english",
            appid
        );

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .map_err(|e| e.to_string())?;

        let resp = client
            .get(&url)
            .header("User-Agent", "OpenPlay/0.1.0")
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let json: Value = resp.json().await.map_err(|e| e.to_string())?;

        let app_obj = json
            .get(appid)
            .ok_or_else(|| "Appid not found in response".to_string())?;

        if !app_obj.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
            return Err("Steam API reported success: false".to_string());
        }

        let data = app_obj
            .get("data")
            .ok_or_else(|| "Data field missing".to_string())?;

        let description = data
            .get("short_description")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let developer = data
            .get("developers")
            .and_then(|v| v.as_array())
            .and_then(|arr| arr.first())
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let publisher = data
            .get("publishers")
            .and_then(|v| v.as_array())
            .and_then(|arr| arr.first())
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let release_date = data
            .get("release_date")
            .and_then(|v| v.get("date"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let community_score = data
            .get("metacritic")
            .and_then(|v| v.get("score"))
            .and_then(|v| v.as_u64())
            .map(|s| s as u32);

        let mut genres = Vec::new();
        if let Some(genre_arr) = data.get("genres").and_then(|v| v.as_array()) {
            for g in genre_arr {
                if let Some(desc) = g.get("description").and_then(|v| v.as_str()) {
                    genres.push(desc.to_string());
                }
            }
        }

        let mut features = Vec::new();
        if let Some(cat_arr) = data.get("categories").and_then(|v| v.as_array()) {
            for c in cat_arr {
                if let Some(desc) = c.get("description").and_then(|v| v.as_str()) {
                    features.push(desc.to_string());
                }
            }
        }

        let mut platforms = Vec::new();
        if let Some(p_obj) = data.get("platforms") {
            if p_obj.get("windows").and_then(|v| v.as_bool()).unwrap_or(false) {
                platforms.push("Windows".to_string());
            }
            if p_obj.get("linux").and_then(|v| v.as_bool()).unwrap_or(false) {
                platforms.push("Linux".to_string());
            }
            if p_obj.get("mac").and_then(|v| v.as_bool()).unwrap_or(false) {
                platforms.push("Macintosh".to_string());
            }
        }

        let mut screenshots = Vec::new();
        if let Some(screen_arr) = data.get("screenshots").and_then(|v| v.as_array()) {
            for s in screen_arr {
                if let Some(p) = s.get("path_full").and_then(|v| v.as_str()) {
                    screenshots.push(p.to_string());
                }
            }
        }

        Ok(PartialSteamMetadata {
            description,
            developer,
            publisher,
            release_date,
            community_score,
            genres,
            features,
            platforms,
            screenshots,
        })
    }

    pub fn apply_metadata(game: &mut Game, meta: PartialSteamMetadata) {
        if meta.description.is_some() {
            game.description = meta.description;
        }
        if meta.developer.is_some() {
            game.developer = meta.developer;
        }
        if meta.publisher.is_some() {
            game.publisher = meta.publisher;
        }
        if meta.release_date.is_some() {
            game.release_date = meta.release_date;
        }
        if meta.community_score.is_some() {
            game.community_score = meta.community_score;
        }
        if !meta.genres.is_empty() {
            game.genres = meta.genres;
        }
        if !meta.features.is_empty() {
            game.features = meta.features;
        }
        if !meta.platforms.is_empty() {
            game.platforms = meta.platforms;
        }
        if !meta.screenshots.is_empty() {
            game.screenshots = meta.screenshots;
        }
    }
}

pub struct PartialSteamMetadata {
    pub description: Option<String>,
    pub developer: Option<String>,
    pub publisher: Option<String>,
    pub release_date: Option<String>,
    pub community_score: Option<u32>,
    pub genres: Vec<String>,
    pub features: Vec<String>,
    pub platforms: Vec<String>,
    pub screenshots: Vec<String>,
}
