use crate::models::{Game, GameTrailer};
use serde_json::Value;

pub struct SteamMetadataFetcher;

impl SteamMetadataFetcher {
    pub async fn fetch_metadata_for_appid(appid: &str) -> Result<PartialSteamMetadata, String> {
        let url = format!(
            "https://store.steampowered.com/api/appdetails?appids={}&l=english",
            appid
        );

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(12))
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

        // 1. Description (Steam Store rich HTML)
        // Prefer `about_the_game` because it contains the true rich game overview without
        // promotional sales pitches and edition comparison bundles (Deluxe, Gold, etc.)
        let about_desc = data
            .get("about_the_game")
            .and_then(|v| v.as_str())
            .filter(|s| !s.trim().is_empty())
            .map(|s| s.to_string());

        let detailed_desc = data
            .get("detailed_description")
            .and_then(|v| v.as_str())
            .filter(|s| !s.trim().is_empty())
            .map(|s| s.to_string());

        let short_desc = data
            .get("short_description")
            .and_then(|v| v.as_str())
            .filter(|s| !s.trim().is_empty())
            .map(|s| s.to_string());

        let description = about_desc.or(detailed_desc).or(short_desc);

        // 2. Developers & Publishers
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

        // 3. Release Date
        let release_date = data
            .get("release_date")
            .and_then(|v| v.get("date"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        // 4. Critic Score (Metacritic)
        let critic_score = data
            .get("metacritic")
            .and_then(|v| v.get("score"))
            .and_then(|v| v.as_u64())
            .map(|s| s as u32);

        // 4b. Community Score from Steam User Reviews API
        let reviews_url = format!(
            "https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/?appid={}&num_per_page=0",
            appid
        );
        let mut community_score: Option<u32> = None;
        if let Ok(rev_resp) = client.get(&reviews_url).header("User-Agent", "OpenPlay/0.1.0").send().await {
            if let Ok(rev_json) = rev_resp.json::<Value>().await {
                if let Some(summary) = rev_json.get("response").and_then(|r| r.get("query_summary")) {
                    let pos = summary.get("total_positive").and_then(|v| v.as_u64()).unwrap_or(0);
                    let neg = summary.get("total_negative").and_then(|v| v.as_u64()).unwrap_or(0);
                    let total = pos + neg;
                    if total > 0 {
                        community_score = Some(((pos as f64 / total as f64) * 100.0).round() as u32);
                    }
                }
            }
        }

        // 5. Genres
        let mut genres = Vec::new();
        if let Some(genre_arr) = data.get("genres").and_then(|v| v.as_array()) {
            for g in genre_arr {
                if let Some(desc) = g.get("description").and_then(|v| v.as_str()) {
                    genres.push(desc.to_string());
                }
            }
        }

        // 6. Features / Categories
        let mut features = Vec::new();
        if let Some(cat_arr) = data.get("categories").and_then(|v| v.as_array()) {
            for c in cat_arr {
                if let Some(desc) = c.get("description").and_then(|v| v.as_str()) {
                    features.push(desc.to_string());
                }
            }
        }

        // 7. Platforms
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

        // 8. Screenshots
        let mut screenshots = Vec::new();
        if let Some(screen_arr) = data.get("screenshots").and_then(|v| v.as_array()) {
            for s in screen_arr {
                if let Some(p) = s.get("path_full").and_then(|v| v.as_str()) {
                    screenshots.push(p.to_string());
                }
            }
        }

        // 9. Trailers are not auto-imported with metadata (only imported on-demand via fetch_store_trailers)
        let trailers = Vec::new();

        // 10. Age Rating
        let age_rating = if let Some(req_age) = data.get("required_age").and_then(|v| v.as_u64()) {
            if req_age > 0 {
                Some(format!("PEGI {}", req_age))
            } else {
                None
            }
        } else {
            None
        };

        Ok(PartialSteamMetadata {
            description,
            developer,
            publisher,
            release_date,
            community_score: community_score.or(critic_score),
            critic_score,
            genres,
            features,
            platforms,
            screenshots,
            trailers,
            age_rating,
        })
    }

    /// Fetches live player count directly from Steam Web API
    pub async fn fetch_current_players(appid: &str) -> Result<u32, String> {
        let url = format!(
            "https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid={}",
            appid
        );

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .map_err(|e| e.to_string())?;

        let resp = client
            .get(&url)
            .header("User-Agent", "OpenPlay/0.1.0")
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let json: Value = resp.json().await.map_err(|e| e.to_string())?;
        let count = json
            .get("response")
            .and_then(|r| r.get("player_count"))
            .and_then(|c| c.as_u64())
            .unwrap_or(0);

        Ok(count as u32)
    }

    /// Fetches latest news items and changelogs from Steam News API
    pub async fn fetch_game_news(appid: &str) -> Result<Vec<SteamNewsItem>, String> {
        let url = format!(
            "https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid={}&count=6&maxlength=600",
            appid
        );

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(6))
            .build()
            .map_err(|e| e.to_string())?;

        let resp = client
            .get(&url)
            .header("User-Agent", "OpenPlay/0.1.0")
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let json: Value = resp.json().await.map_err(|e| e.to_string())?;
        let items_arr = json
            .get("appnews")
            .and_then(|a| a.get("newsitems"))
            .and_then(|v| v.as_array())
            .ok_or_else(|| "No news items in response".to_string())?;

        let mut items = Vec::new();
        for item in items_arr {
            let gid = item.get("gid").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let title = item.get("title").and_then(|v| v.as_str()).unwrap_or("News Update").to_string();
            let url = item.get("url").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let author = item.get("author").and_then(|v| v.as_str()).unwrap_or("Steam").to_string();
            let contents = item.get("contents").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let date = item.get("date").and_then(|v| v.as_i64()).unwrap_or(0);
            let feedlabel = item.get("feedlabel").and_then(|v| v.as_str()).map(|s| s.to_string());

            items.push(SteamNewsItem {
                gid,
                title,
                url,
                author,
                contents,
                date,
                feedlabel,
            });
        }

        Ok(items)
    }

    /// Fetches trailers directly from Steam Store using an appid or by searching game title
    pub async fn fetch_store_trailers(title: &str, appid: Option<&str>) -> Result<Vec<GameTrailer>, String> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(8))
            .build()
            .map_err(|e| e.to_string())?;

        let resolved_appid = match appid {
            Some(id) if !id.trim().is_empty() && id.trim().chars().all(|c| c.is_ascii_digit()) => {
                id.trim().to_string()
            }
            _ => {
                // Search Steam store by title
                let resp = client
                    .get("https://store.steampowered.com/api/storesearch/")
                    .query(&[("term", title), ("l", "english"), ("cc", "US")])
                    .header("User-Agent", "OpenPlay/0.1.0")
                    .send()
                    .await
                    .map_err(|e| e.to_string())?;

                let json: Value = resp.json().await.map_err(|e| e.to_string())?;
                let found_id = json
                    .get("items")
                    .and_then(|items| items.as_array())
                    .and_then(|arr| arr.first())
                    .and_then(|first| first.get("id"))
                    .and_then(|id| id.as_u64())
                    .ok_or_else(|| format!("No Steam store listing found for '{}'", title))?;

                found_id.to_string()
            }
        };

        // Fetch appdetails
        let details_url = format!(
            "https://store.steampowered.com/api/appdetails?appids={}",
            resolved_appid
        );
        let resp = client
            .get(&details_url)
            .header("User-Agent", "OpenPlay/0.1.0")
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let json: Value = resp.json().await.map_err(|e| e.to_string())?;
        let data = json
            .get(&resolved_appid)
            .and_then(|v| v.get("data"))
            .ok_or_else(|| format!("Could not retrieve store details for appid {}", resolved_appid))?;

        let mut trailers = Vec::new();
        if let Some(movies) = data.get("movies").and_then(|v| v.as_array()) {
            for m in movies {
                let name = m.get("name").and_then(|v| v.as_str()).unwrap_or("Trailer").to_string();
                let mut thumb = m.get("thumbnail").and_then(|v| v.as_str()).unwrap_or("").to_string();
                if thumb.contains("movie.293x165.jpg") {
                    thumb = thumb.replace("movie.293x165.jpg", "movie_600x337.jpg");
                }

                let url = m.get("mp4")
                    .and_then(|v| v.get("max").or_else(|| v.get("480")))
                    .and_then(|v| v.as_str())
                    .or_else(|| {
                        m.get("webm")
                            .and_then(|v| v.get("max").or_else(|| v.get("480")))
                            .and_then(|v| v.as_str())
                    })
                    .or_else(|| m.get("hls_h264").and_then(|v| v.as_str()))
                    .or_else(|| m.get("dash_h264").and_then(|v| v.as_str()))
                    .unwrap_or("")
                    .to_string();

                if !url.is_empty() {
                    trailers.push(GameTrailer {
                        name,
                        thumbnail: thumb,
                        url,
                    });
                }
            }
        }

        Ok(trailers)
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
        if meta.critic_score.is_some() {
            game.critic_score = meta.critic_score;
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
        // Note: Trailers are NOT auto-imported with Steam metadata.
        // Trailers are only imported manually by the user through the trailer menu.
        if meta.age_rating.is_some() {
            game.age_rating = meta.age_rating;
        }
    }
}

pub struct PartialSteamMetadata {
    pub description: Option<String>,
    pub developer: Option<String>,
    pub publisher: Option<String>,
    pub release_date: Option<String>,
    pub community_score: Option<u32>,
    pub critic_score: Option<u32>,
    pub genres: Vec<String>,
    pub features: Vec<String>,
    pub platforms: Vec<String>,
    pub screenshots: Vec<String>,
    pub trailers: Vec<GameTrailer>,
    pub age_rating: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SteamNewsItem {
    pub gid: String,
    pub title: String,
    pub url: String,
    pub author: String,
    pub contents: String,
    pub date: i64,
    pub feedlabel: Option<String>,
}
