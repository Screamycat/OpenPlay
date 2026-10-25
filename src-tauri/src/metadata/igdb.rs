use crate::models::GameLink;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetadataComparison {
    pub provider: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub developer: Option<String>,
    pub publisher: Option<String>,
    pub release_date: Option<String>,
    pub genres: Vec<String>,
    pub tags: Vec<String>,
    pub features: Vec<String>,
    pub critic_score: Option<u32>,
    pub community_score: Option<u32>,
    pub age_rating: Option<String>,
    pub series: Option<String>,
    pub cover_image: Option<String>,
    pub background_image: Option<String>,
    pub links: Vec<GameLink>,
}

pub struct IgdbFetcher;

impl IgdbFetcher {
    /// Obtains an OAuth Bearer token from Twitch using Client ID and Client Secret
    pub async fn get_access_token(
        client: &reqwest::Client,
        client_id: &str,
        client_secret: &str,
    ) -> Result<String, String> {
        let url = format!(
            "https://id.twitch.tv/oauth2/token?client_id={}&client_secret={}&grant_type=client_credentials",
            client_id, client_secret
        );

        let resp = client
            .post(&url)
            .send()
            .await
            .map_err(|e| format!("Twitch OAuth request failed: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Twitch authentication failed (HTTP {})", resp.status()));
        }

        let json: Value = resp.json().await.map_err(|e| e.to_string())?;
        json.get("access_token")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| "No access_token in Twitch response".to_string())
    }

    /// Queries IGDB for a game by title and returns standardized metadata
    pub async fn fetch_metadata(
        client_id: &str,
        client_secret: &str,
        title: &str,
    ) -> Result<MetadataComparison, String> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(12))
            .build()
            .map_err(|e| e.to_string())?;

        let token = Self::get_access_token(&client, client_id, client_secret).await?;

        // Sanitize search title for Apicalypse query syntax
        let sanitized = title.replace('\"', "\\\"").replace(';', " ");

        let body = format!(
            r#"search "{}";
fields name, summary, storyline, first_release_date, genres.name, themes.name, game_modes.name, player_perspectives.name, aggregated_rating, rating, involved_companies.company.name, involved_companies.developer, involved_companies.publisher, age_ratings.rating, age_ratings.category, collection.name, cover.image_id, artworks.image_id, screenshots.image_id, websites.url, websites.category;
limit 1;
"#,
            sanitized
        );

        let resp = client
            .post("https://api.igdb.com/v4/games")
            .header("Client-ID", client_id)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "text/plain")
            .body(body)
            .send()
            .await
            .map_err(|e| format!("IGDB API request failed: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("IGDB API returned status {}", resp.status()));
        }

        let json: Value = resp.json().await.map_err(|e| e.to_string())?;
        let games_arr = json
            .as_array()
            .ok_or_else(|| "Invalid IGDB response format".to_string())?;

        let game_obj = games_arr
            .first()
            .ok_or_else(|| format!("No game found on IGDB for '{}'", title))?;

        let game_name = game_obj.get("name").and_then(|v| v.as_str()).map(|s| s.to_string());

        let summary = game_obj.get("summary").and_then(|v| v.as_str());
        let storyline = game_obj.get("storyline").and_then(|v| v.as_str());
        let description = match (summary, storyline) {
            (Some(s), Some(st)) if s != st => Some(format!("{}\n\n{}", s, st)),
            (Some(s), _) => Some(s.to_string()),
            (_, Some(st)) => Some(st.to_string()),
            _ => None,
        };

        // Developer & Publisher
        let mut developer = None;
        let mut publisher = None;
        if let Some(comps) = game_obj.get("involved_companies").and_then(|v| v.as_array()) {
            for comp in comps {
                let is_dev = comp.get("developer").and_then(|v| v.as_bool()).unwrap_or(false);
                let is_pub = comp.get("publisher").and_then(|v| v.as_bool()).unwrap_or(false);
                let name = comp.get("company").and_then(|c| c.get("name")).and_then(|v| v.as_str());
                if let Some(cname) = name {
                    if is_dev && developer.is_none() {
                        developer = Some(cname.to_string());
                    }
                    if is_pub && publisher.is_none() {
                        publisher = Some(cname.to_string());
                    }
                }
            }
        }

        // Release Date
        let release_date = game_obj.get("first_release_date").and_then(|v| v.as_i64()).and_then(|ts| {
            chrono::DateTime::from_timestamp(ts, 0).map(|dt| dt.format("%Y-%m-%d").to_string())
        });

        // Genres
        let mut genres = Vec::new();
        if let Some(garr) = game_obj.get("genres").and_then(|v| v.as_array()) {
            for g in garr {
                if let Some(gname) = g.get("name").and_then(|v| v.as_str()) {
                    genres.push(gname.to_string());
                }
            }
        }

        // Features & Tags (themes, game_modes, player_perspectives)
        let mut features = Vec::new();
        if let Some(tarr) = game_obj.get("themes").and_then(|v| v.as_array()) {
            for t in tarr {
                if let Some(tname) = t.get("name").and_then(|v| v.as_str()) {
                    features.push(tname.to_string());
                }
            }
        }
        if let Some(marr) = game_obj.get("game_modes").and_then(|v| v.as_array()) {
            for m in marr {
                if let Some(mname) = m.get("name").and_then(|v| v.as_str()) {
                    features.push(mname.to_string());
                }
            }
        }
        if let Some(parr) = game_obj.get("player_perspectives").and_then(|v| v.as_array()) {
            for p in parr {
                if let Some(pname) = p.get("name").and_then(|v| v.as_str()) {
                    features.push(pname.to_string());
                }
            }
        }

        // Scores
        let critic_score = game_obj
            .get("aggregated_rating")
            .and_then(|v| v.as_f64())
            .map(|s| s.round() as u32);

        let community_score = game_obj
            .get("rating")
            .and_then(|v| v.as_f64())
            .map(|s| s.round() as u32);

        // Franchise / Series
        let series = game_obj
            .get("collection")
            .and_then(|c| c.get("name"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        // Age Rating (PEGI / ESRB)
        let mut age_rating = None;
        if let Some(ar_arr) = game_obj.get("age_ratings").and_then(|v| v.as_array()) {
            for ar in ar_arr {
                let cat = ar.get("category").and_then(|v| v.as_u64()).unwrap_or(0);
                let rating = ar.get("rating").and_then(|v| v.as_u64()).unwrap_or(0);
                // 1 = ESRB, 2 = PEGI
                if cat == 1 {
                    let rstr = match rating {
                        1 => "ESRB: Three",
                        2 => "ESRB: Seven",
                        3 => "ESRB: Twelve",
                        4 => "ESRB: Sixteen",
                        5 => "ESRB: Eighteen",
                        6 => "ESRB: Everyone (E)",
                        7 => "ESRB: Everyone 10+ (E10+)",
                        8 => "ESRB: Teen (T)",
                        9 => "ESRB: Mature 17+ (M)",
                        10 => "ESRB: Adults Only 18+ (AO)",
                        11 => "ESRB: Rating Pending (RP)",
                        _ => "ESRB Rated",
                    };
                    age_rating = Some(rstr.to_string());
                    break;
                } else if cat == 2 && age_rating.is_none() {
                    let rstr = match rating {
                        1 => "PEGI 3",
                        2 => "PEGI 7",
                        3 => "PEGI 12",
                        4 => "PEGI 16",
                        5 => "PEGI 18",
                        _ => "PEGI Rated",
                    };
                    age_rating = Some(rstr.to_string());
                }
            }
        }

        // Cover (1080p high-resolution)
        let cover_image = game_obj
            .get("cover")
            .and_then(|c| c.get("image_id"))
            .and_then(|v| v.as_str())
            .map(|img_id| format!("https://images.igdb.com/igdb/image/upload/t_1080p/{}.jpg", img_id));

        // Background hero
        let background_image = game_obj
            .get("artworks")
            .and_then(|v| v.as_array())
            .and_then(|arr| arr.first())
            .or_else(|| {
                game_obj
                    .get("screenshots")
                    .and_then(|v| v.as_array())
                    .and_then(|arr| arr.first())
            })
            .and_then(|item| item.get("image_id"))
            .and_then(|v| v.as_str())
            .map(|img_id| format!("https://images.igdb.com/igdb/image/upload/t_1080p/{}.jpg", img_id));

        // Websites / Links
        let mut links = Vec::new();
        if let Some(warr) = game_obj.get("websites").and_then(|v| v.as_array()) {
            for w in warr {
                if let Some(url) = w.get("url").and_then(|v| v.as_str()) {
                    let cat = w.get("category").and_then(|v| v.as_u64()).unwrap_or(0);
                    let title = match cat {
                        1 => "Official Website",
                        2 => "Wikia",
                        3 => "Wikipedia",
                        4 => "Facebook",
                        5 => "Twitter / X",
                        6 => "Twitch",
                        8 => "Instagram",
                        9 => "YouTube",
                        13 => "Steam Store",
                        14 => "Reddit",
                        15 => "Itch.io",
                        16 => "Epic Games Store",
                        17 => "GOG",
                        18 => "Discord",
                        _ => "Web Link",
                    };
                    links.push(GameLink {
                        title: title.to_string(),
                        url: url.to_string(),
                    });
                }
            }
        }

        Ok(MetadataComparison {
            provider: "IGDB".to_string(),
            title: game_name,
            description,
            developer,
            publisher,
            release_date,
            genres,
            tags: features.clone(),
            features,
            critic_score,
            community_score,
            age_rating,
            series,
            cover_image,
            background_image,
            links,
        })
    }
}
