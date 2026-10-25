use crate::models::{Achievement, Game, GameTrailer};
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

        // 11. Artwork (Vertical library poster with fallback to header_image/capsule, and high-res background_raw)
        let header_image = data
            .get("header_image")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let capsule_image = data
            .get("capsule_image")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let background_raw = data
            .get("background_raw")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let background = data
            .get("background")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let library_600 = format!(
            "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{}/library_600x900_2x.jpg",
            appid
        );
        let library_hero = format!(
            "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{}/library_hero.jpg",
            appid
        );

        // Fast probe vertical poster with 1.5s timeout
        let cover_image = if client
            .head(&library_600)
            .timeout(std::time::Duration::from_millis(1500))
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false)
        {
            Some(library_600)
        } else {
            header_image.or(capsule_image)
        };

        let background_image = background_raw
            .or(background)
            .or_else(|| Some(library_hero));

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
            cover_image,
            background_image,
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

    /// Searches Steam store by game title and returns the best matching appid if found
    pub async fn search_appid_by_title(title: &str) -> Option<String> {
        let trimmed = title.trim();
        if trimmed.is_empty() {
            return None;
        }

        // If the query is already a numeric AppID (e.g. "629820")
        if trimmed.chars().all(|c| c.is_ascii_digit()) {
            return Some(trimmed.to_string());
        }

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(6))
            .build()
            .ok()?;

        // Clean title of trademark / copyright / curly quotes
        let cleaned = trimmed
            .replace('®', "")
            .replace('™', "")
            .replace('©', "")
            .replace('\u{2019}', "'")
            .replace('\u{2018}', "'")
            .trim()
            .to_string();

        let resp = client
            .get("https://store.steampowered.com/api/storesearch/")
            .query(&[("term", cleaned.as_str()), ("l", "english"), ("cc", "US")])
            .header("User-Agent", "OpenPlay/0.1.0")
            .send()
            .await
            .ok()?;

        let json: Value = resp.json().await.ok()?;
        let items = json.get("items").and_then(|i| i.as_array())?;
        if items.is_empty() {
            return None;
        }

        let clean_search = cleaned.to_lowercase();

        // 1. Exact title match (case-insensitive)
        for it in items {
            if let Some(name) = it.get("name").and_then(|v| v.as_str()) {
                let clean_name = name
                    .replace('®', "")
                    .replace('™', "")
                    .replace('©', "")
                    .replace('\u{2019}', "'")
                    .replace('\u{2018}', "'")
                    .trim()
                    .to_lowercase();
                if clean_name == clean_search {
                    if let Some(id) = it.get("id").and_then(|v| v.as_u64()) {
                        return Some(id.to_string());
                    }
                }
            }
        }

        // 2. Fallback to first item in results
        let first = items.first()?;
        let id = first.get("id").and_then(|v| v.as_u64())?;
        Some(id.to_string())
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
        if meta.cover_image.is_some() && (game.cover_image.is_none() || game.cover_image.as_deref().unwrap_or("").starts_with("data:")) {
            game.cover_image = meta.cover_image;
        }
        if meta.background_image.is_some() && game.background_image.is_none() {
            game.background_image = meta.background_image;
        }
    }

    pub async fn fetch_steam_achievements(
        game_id: &str,
        appid: &str,
        steamid64: Option<&str>,
    ) -> Result<Vec<Achievement>, String> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(12))
            .build()
            .map_err(|e| e.to_string())?;

        // 1. Fetch Global Achievement Percentages
        let global_url = format!(
            "https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/?gameid={}",
            appid
        );

        let mut rarity_map: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
        if let Ok(resp) = client
            .get(&global_url)
            .header("User-Agent", "OpenPlay/0.1.0")
            .send()
            .await
        {
            if let Ok(json) = resp.json::<Value>().await {
                if let Some(list) = json
                    .get("achievementpercentages")
                    .and_then(|ap| ap.get("achievements"))
                    .and_then(|a| a.as_array())
                {
                    for item in list {
                        let name_opt = item.get("name").and_then(|v| v.as_str());
                        let pct_opt = item.get("percent").and_then(|v| {
                            if let Some(f) = v.as_f64() {
                                Some(f)
                            } else if let Some(s) = v.as_str() {
                                s.parse::<f64>().ok()
                            } else {
                                None
                            }
                        });

                        if let (Some(name), Some(pct)) = (name_opt, pct_opt) {
                            let rounded = (pct * 10.0).round() / 10.0;
                            rarity_map.insert(name.to_lowercase(), rounded);
                            rarity_map.insert(name.to_string(), rounded);
                        }
                    }
                }
            }
        }

        // 2. Fetch Personal Achievement XML
        let xml_url = if let Some(sid) = steamid64 {
            format!("https://steamcommunity.com/profiles/{}/stats/{}/?xml=1", sid, appid)
        } else {
            format!("https://steamcommunity.com/stats/{}/achievements/?xml=1", appid)
        };

        let xml_text = client
            .get(&xml_url)
            .header("User-Agent", "OpenPlay/0.1.0")
            .send()
            .await
            .map_err(|e| format!("Failed to fetch achievements XML: {}", e))?
            .text()
            .await
            .map_err(|e| format!("Failed to read achievements XML body: {}", e))?;

        // 3. Parse <achievement ...>...</achievement> blocks
        let ach_re = regex::Regex::new(r#"(?s)<achievement(?:\s+(?P<attrs>[^>]*))?>(?P<content>.*?)</achievement>"#)
            .map_err(|e| e.to_string())?;

        let mut achievements: Vec<Achievement> = Vec::new();

        for cap in ach_re.captures_iter(&xml_text) {
            let attrs = cap.name("attrs").map(|m| m.as_str()).unwrap_or("");
            let content = cap.name("content").map(|m| m.as_str()).unwrap_or("");

            let apiname = extract_tag_value(content, "apiname")
                .or_else(|| extract_tag_value(content, "name"))
                .unwrap_or_default();
            if apiname.is_empty() {
                continue;
            }

            let display_name = extract_tag_value(content, "name").unwrap_or_else(|| apiname.clone());
            let description = extract_tag_value(content, "description");
            // In Steam Community XML:
            // <iconClosed> contains the EARNED / UNLOCKED full-color artwork!
            // <iconOpen> contains the UNEARNED / LOCKED grayscale artwork!
            let icon_unlocked = extract_tag_value(content, "iconClosed").unwrap_or_default();
            let icon_locked = extract_tag_value(content, "iconOpen");

            let is_unlocked = attrs.contains(r#"closed="1""#)
                || attrs.contains(r#"closed='1'"#)
                || attrs.contains("closed=1");

            let unlock_time = if is_unlocked {
                if let Some(ts_str) = extract_tag_value(content, "unlockTimestamp") {
                    if let Ok(ts) = ts_str.parse::<i64>() {
                        if ts > 0 {
                            chrono::DateTime::from_timestamp(ts, 0)
                                .map(|dt| dt.format("%b %d, %Y %H:%M").to_string())
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                } else {
                    None
                }
            } else {
                None
            };

            let rarity = rarity_map
                .get(&apiname)
                .or_else(|| rarity_map.get(&apiname.to_lowercase()))
                .copied()
                .unwrap_or(0.0);

            let is_secret = content.contains("<hidden>1</hidden>")
                || description.as_ref().map(|d| d.trim().is_empty()).unwrap_or(false);

            achievements.push(Achievement {
                game_id: game_id.to_string(),
                api_name: apiname,
                display_name,
                description,
                icon_url: icon_unlocked,
                icon_gray_url: icon_locked,
                is_unlocked,
                unlock_time,
                rarity_percentage: rarity,
                is_secret,
            });
        }

        // Sort: Unlocked first, then by rarity ascending (rarest first), then display_name
        achievements.sort_by(|a, b| {
            b.is_unlocked
                .cmp(&a.is_unlocked)
                .then_with(|| a.rarity_percentage.partial_cmp(&b.rarity_percentage).unwrap_or(std::cmp::Ordering::Equal))
                .then_with(|| a.display_name.cmp(&b.display_name))
        });

        Ok(achievements)
    }
}

fn extract_tag_value(block: &str, tag: &str) -> Option<String> {
    let open_tag = format!("<{}>", tag);
    let close_tag = format!("</{}>", tag);

    if let Some(start) = block.find(&open_tag) {
        let after_open = &block[start + open_tag.len()..];
        if let Some(end) = after_open.find(&close_tag) {
            let inner = after_open[..end].trim();
            if inner.starts_with("<![CDATA[") && inner.ends_with("]]>") && inner.len() >= 12 {
                return Some(inner[9..inner.len() - 3].trim().to_string());
            } else {
                return Some(inner.to_string());
            }
        }
    }
    None
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
    pub cover_image: Option<String>,
    pub background_image: Option<String>,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_tag_value() {
        let sample = r#"<name><![CDATA[First Steps]]></name><apiname>001</apiname><description><![CDATA[Complete the Prologue.]]></description>"#;
        assert_eq!(extract_tag_value(sample, "name"), Some("First Steps".to_string()));
        assert_eq!(extract_tag_value(sample, "apiname"), Some("001".to_string()));
        assert_eq!(extract_tag_value(sample, "description"), Some("Complete the Prologue.".to_string()));
    }

    #[test]
    fn test_achievement_regex_parsing() {
        let sample_xml = r#"
        <achievements>
            <achievement closed="1">
                <iconClosed><![CDATA[https://closed.jpg]]></iconClosed>
                <iconOpen><![CDATA[https://open.jpg]]></iconOpen>
                <name><![CDATA[First Steps]]></name>
                <apiname><![CDATA[001]]></apiname>
                <description><![CDATA[Complete the Prologue.]]></description>
                <unlockTimestamp>1791127975</unlockTimestamp>
            </achievement>
            <achievement closed="0">
                <iconClosed><![CDATA[https://closed2.jpg]]></iconClosed>
                <iconOpen><![CDATA[https://open2.jpg]]></iconOpen>
                <name><![CDATA[Master]]></name>
                <apiname><![CDATA[002]]></apiname>
            </achievement>
        </achievements>
        "#;

        let ach_re = regex::Regex::new(r#"(?s)<achievement(?:\s+(?P<attrs>[^>]*))?>(?P<content>.*?)</achievement>"#).unwrap();
        let matches: Vec<_> = ach_re.captures_iter(sample_xml).collect();
        assert_eq!(matches.len(), 2);

        let m1 = &matches[0];
        let attrs1 = m1.name("attrs").map(|m| m.as_str()).unwrap_or("");
        assert!(attrs1.contains(r#"closed="1""#));
        let content1 = m1.name("content").map(|m| m.as_str()).unwrap_or("");
        assert_eq!(extract_tag_value(content1, "name"), Some("First Steps".to_string()));
    }
}
