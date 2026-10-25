use crate::models::Achievement;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::time::Duration;

pub struct PartialEpicMetadata {
    pub description: Option<String>,
    pub developer: Option<String>,
    pub publisher: Option<String>,
    pub release_date: Option<String>,
    pub cover_image: Option<String>,
    pub background_image: Option<String>,
    pub genres: Vec<String>,
    pub tags: Vec<String>,
    pub screenshots: Vec<String>,
}

pub struct EpicMetadataFetcher;

impl EpicMetadataFetcher {
    /// Attempts to fetch metadata by slug directly from Epic's CDN content service
    pub async fn fetch_by_slug(client: &reqwest::Client, slug: &str) -> Option<PartialEpicMetadata> {
        let content_url = format!("https://store-content.ak.epicgames.com/api/en-US/content/products/{}", slug);
        let resp = client
            .get(&content_url)
            .header("User-Agent", "OpenPlay/0.1.0")
            .send()
            .await
            .ok()?;

        if !resp.status().is_success() {
            return None;
        }

        let json = resp.json::<Value>().await.ok()?;
        let pages = json.get("pages").and_then(|v| v.as_array())?;
        let p0 = pages.first().and_then(|p| p.get("data"))?;

        let hero = p0.get("hero");
        let about = p0.get("about");
        let gallery = p0.get("gallery");

        let cover_image = hero
            .and_then(|h| h.get("portraitBackgroundImageUrl"))
            .and_then(|v| v.as_str())
            .filter(|s| !s.trim().is_empty())
            .map(|s| s.to_string());

        let background_image = hero
            .and_then(|h| h.get("backgroundImageUrl"))
            .and_then(|v| v.as_str())
            .filter(|s| !s.trim().is_empty())
            .map(|s| s.to_string());

        let description = about
            .and_then(|a| {
                let desc = a.get("description").and_then(|v| v.as_str()).filter(|s| !s.trim().is_empty());
                let short_desc = a.get("shortDescription").and_then(|v| v.as_str()).filter(|s| !s.trim().is_empty());
                match (desc, short_desc) {
                    (Some(d), Some(sd)) => {
                        if d.len() >= sd.len() { Some(d) } else { Some(sd) }
                    }
                    (Some(d), None) => Some(d),
                    (None, Some(sd)) => Some(sd),
                    (None, None) => None,
                }
            })
            .map(|s| s.trim().to_string());

        let developer = about
            .and_then(|a| a.get("developerAttribution"))
            .and_then(|v| v.as_str())
            .filter(|s| !s.trim().is_empty())
            .map(|s| s.trim().to_string());

        let publisher = about
            .and_then(|a| a.get("publisherAttribution"))
            .and_then(|v| v.as_str())
            .filter(|s| !s.trim().is_empty())
            .map(|s| s.trim().to_string());

        let mut screenshots = Vec::new();
        if let Some(imgs) = gallery.and_then(|g| g.get("galleryImages")).and_then(|v| v.as_array()) {
            for item in imgs {
                if let Some(src) = item.get("src").and_then(|v| v.as_str()) {
                    if !screenshots.contains(&src.to_string()) {
                        screenshots.push(src.to_string());
                    }
                }
            }
        }

        let release_date = json
            .get("_activeDate")
            .and_then(|v| v.as_str())
            .map(|s| if let Some(pos) = s.find('T') { s[..pos].to_string() } else { s.to_string() });

        Some(PartialEpicMetadata {
            description,
            developer,
            publisher,
            release_date,
            cover_image,
            background_image,
            genres: Vec::new(),
            tags: Vec::new(),
            screenshots,
        })
    }

    pub fn make_slug(title: &str) -> String {
        title
            .chars()
            .filter(|c| *c != '\u{FFFD}' && (c.is_alphanumeric() || c.is_whitespace() || *c == '-'))
            .collect::<String>()
            .split_whitespace()
            .collect::<Vec<&str>>()
            .join("-")
            .to_lowercase()
    }

    pub async fn fetch_metadata_by_title(title: &str) -> Result<PartialEpicMetadata, String> {
        let client = reqwest::Client::builder()
            .http1_only()
            .timeout(Duration::from_secs(12))
            .build()
            .map_err(|e| e.to_string())?;

        // 1. Try store-content CDN first via slug (extremely fast, unauthenticated, rich 4K covers & heroes)
        let primary_slug = Self::make_slug(title);
        if let Some(meta) = Self::fetch_by_slug(&client, &primary_slug).await {
            if meta.cover_image.is_some() || meta.description.is_some() {
                return Ok(meta);
            }
        }

        // 2. Fall back to GraphQL catalog search
        let query = r#"
            query searchStoreQuery($keywords: String, $locale: String) {
              Catalog {
                searchStore(keywords: $keywords, locale: $locale) {
                  elements {
                    id
                    title
                    description
                    namespace
                    keyImages {
                      type
                      url
                    }
                    seller {
                      name
                    }
                    releaseDate
                    categories {
                      path
                    }
                    tags {
                      id
                      name
                    }
                    customAttributes {
                      key
                      value
                    }
                  }
                }
              }
            }
        "#;

        let clean_keywords: String = title
            .chars()
            .map(|c| match c {
                ':' | '-' | '–' | '—' | '™' | '®' | '\'' | '’' | '\u{FFFD}' => ' ',
                _ => c,
            })
            .collect::<String>()
            .split_whitespace()
            .collect::<Vec<&str>>()
            .join(" ");

        let payload = json!({
            "query": query,
            "variables": {
                "keywords": if clean_keywords.is_empty() { title } else { &clean_keywords },
                "locale": "en-US"
            }
        });

        let resp_res = client
            .post("https://store.epicgames.com/graphql")
            .header("Content-Type", "application/json")
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) EpicGamesLauncher")
            .json(&payload)
            .send()
            .await;

        let resp = match resp_res {
            Ok(r) => r,
            Err(_) => {
                return Self::fetch_by_slug(&client, &primary_slug)
                    .await
                    .ok_or_else(|| format!("Could not fetch metadata for {}", title));
            }
        };

        let json: Value = match resp.json().await {
            Ok(j) => j,
            Err(_) => {
                return Self::fetch_by_slug(&client, &primary_slug)
                    .await
                    .ok_or_else(|| format!("Could not parse metadata for {}", title));
            }
        };

        let elements = json
            .get("data")
            .and_then(|d| d.get("Catalog"))
            .and_then(|c| c.get("searchStore"))
            .and_then(|s| s.get("elements"))
            .and_then(|e| e.as_array());

        let elements = match elements {
            Some(els) if !els.is_empty() => els,
            _ => {
                return Self::fetch_by_slug(&client, &primary_slug)
                    .await
                    .ok_or_else(|| format!("No Epic store elements found for {}", title));
            }
        };

        // Find closest match or default to first
        let title_lower = title.to_lowercase();
        let target = elements
            .iter()
            .find(|el| {
                el.get("title")
                    .and_then(|v| v.as_str())
                    .map(|t| t.to_lowercase() == title_lower)
                    .unwrap_or(false)
            })
            .unwrap_or(&elements[0]);

        let description = target
            .get("description")
            .and_then(|v| v.as_str())
            .filter(|s| !s.trim().is_empty())
            .map(|s| s.to_string());

        let release_date = target
            .get("releaseDate")
            .and_then(|v| v.as_str())
            .map(|s| {
                if let Some(pos) = s.find('T') {
                    s[..pos].to_string()
                } else {
                    s.to_string()
                }
            });

        // KeyImages extraction
        let mut cover_image: Option<String> = None;
        let mut background_image: Option<String> = None;

        if let Some(images) = target.get("keyImages").and_then(|v| v.as_array()) {
            for img in images {
                let img_type = img.get("type").and_then(|v| v.as_str()).unwrap_or("");
                let img_url = img.get("url").and_then(|v| v.as_str()).unwrap_or("");

                if img_url.is_empty() {
                    continue;
                }

                // 2:3 vertical cover: DieselStoreFrontTall, OfferImageTall, Thumbnail
                if cover_image.is_none() && (img_type.contains("Tall") || img_type == "Thumbnail") {
                    cover_image = Some(img_url.to_string());
                }

                // 16:9 hero: DieselStoreFrontWide, OfferImageWide, Landscape
                if background_image.is_none() && (img_type.contains("Wide") || img_type == "Landscape") {
                    background_image = Some(img_url.to_string());
                }
            }
        }

        // Tags & Categories
        let mut tags = Vec::new();
        let mut genres = Vec::new();

        if let Some(tags_arr) = target.get("tags").and_then(|v| v.as_array()) {
            for t in tags_arr {
                if let Some(name) = t.get("name").and_then(|v| v.as_str()) {
                    let trimmed = name.trim();
                    if !trimmed.is_empty() && !tags.contains(&trimmed.to_string()) {
                        tags.push(trimmed.to_string());
                        if ["action", "rpg", "adventure", "strategy", "shooter", "puzzle", "simulation", "indie"]
                            .contains(&trimmed.to_lowercase().as_str())
                        {
                            genres.push(trimmed.to_string());
                        }
                    }
                }
            }
        }

        // CustomAttributes for Developer, Publisher, ProductSlug
        let mut developer: Option<String> = None;
        let mut publisher: Option<String> = None;
        let mut product_slug: Option<String> = None;

        if let Some(seller_name) = target.get("seller").and_then(|s| s.get("name")).and_then(|v| v.as_str()) {
            developer = Some(seller_name.to_string());
            publisher = Some(seller_name.to_string());
        }

        if let Some(attrs) = target.get("customAttributes").and_then(|v| v.as_array()) {
            for attr in attrs {
                let key = attr.get("key").and_then(|v| v.as_str()).unwrap_or("");
                let val = attr.get("value").and_then(|v| v.as_str()).unwrap_or("");

                if key == "developerName" && !val.trim().is_empty() {
                    developer = Some(val.trim().to_string());
                } else if key == "publisherName" && !val.trim().is_empty() {
                    publisher = Some(val.trim().to_string());
                } else if key == "com.epicgames.app.productSlug" && !val.trim().is_empty() {
                    product_slug = Some(val.trim().to_string());
                }
            }
        }

        // If product slug exists, attempt to pull rich gallery screenshots and about description
        let mut screenshots = Vec::new();
        let mut rich_description = description;

        if let Some(ref slug) = product_slug {
            if let Some(slug_meta) = Self::fetch_by_slug(&client, slug).await {
                if cover_image.is_none() {
                    cover_image = slug_meta.cover_image;
                }
                if background_image.is_none() {
                    background_image = slug_meta.background_image;
                }
                if rich_description.is_none() {
                    rich_description = slug_meta.description;
                }
                if developer.is_none() {
                    developer = slug_meta.developer;
                }
                if publisher.is_none() {
                    publisher = slug_meta.publisher;
                }
                screenshots = slug_meta.screenshots;
            }
        }

        Ok(PartialEpicMetadata {
            description: rich_description,
            developer,
            publisher,
            release_date,
            cover_image,
            background_image,
            genres,
            tags,
            screenshots,
        })
    }

    /// Fetches all achievements for an Epic game by its sandboxId (namespace), and player unlocked states if authenticated.
    pub async fn fetch_epic_achievements(
        game_id: &str,
        sandbox_id: &str,
        account_id: Option<&str>,
        access_token: Option<&str>,
    ) -> Result<Vec<Achievement>, String> {
        let client = reqwest::Client::builder()
            .http1_only()
            .timeout(Duration::from_secs(12))
            .build()
            .map_err(|e| e.to_string())?;

        // 1. Fetch master achievements schema & productId from Epic Store GraphQL
        let store_query = r#"
            query Achievement($sandboxId: String!, $locale: String!) {
              Achievement {
                productAchievementsRecordBySandbox(sandboxId: $sandboxId, locale: $locale) {
                  productId
                  totalAchievements
                  totalProductXP
                  achievements {
                    achievement {
                      name
                      hidden
                      unlockedDisplayName
                      lockedDisplayName
                      unlockedDescription
                      lockedDescription
                      unlockedIconLink
                      lockedIconLink
                      XP
                      rarity {
                        percent
                      }
                    }
                  }
                }
              }
            }
        "#;

        let store_payload = json!({
            "query": store_query,
            "variables": {
                "sandboxId": sandbox_id,
                "locale": "en-US"
            }
        });

        let mut post_step1 = client
            .post("https://store.epicgames.com/graphql")
            .header("Content-Type", "application/json")
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) EpicGamesLauncher")
            .json(&store_payload);

        if let Some(token) = access_token.filter(|t| !t.trim().is_empty()) {
            post_step1 = post_step1.header("Authorization", format!("Bearer {}", token));
        }

        let body: Value = match post_step1.send().await {
            Ok(r) if r.status().is_success() => r.json().await.unwrap_or(Value::Null),
            _ => {
                // Fallback to launcher GET query
                let vars_str = json!({
                    "sandboxId": sandbox_id,
                    "locale": "en-US"
                }).to_string();

                let mut req_step1 = client
                    .get("https://launcher.store.epicgames.com/graphql")
                    .query(&[("query", store_query), ("variables", &vars_str)])
                    .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) EpicGamesLauncher");

                if let Some(token) = access_token.filter(|t| !t.trim().is_empty()) {
                    req_step1 = req_step1.header("Authorization", format!("Bearer {}", token));
                }

                if let Ok(r) = req_step1.send().await {
                    if r.status().is_success() {
                        r.json().await.unwrap_or(Value::Null)
                    } else {
                        Value::Null
                    }
                } else {
                    Value::Null
                }
            }
        };

        let rec = body
            .get("data")
            .and_then(|d| d.get("Achievement"))
            .and_then(|a| a.get("productAchievementsRecordBySandbox"));

        let ach_list = match rec.and_then(|r| r.get("achievements")).and_then(|v| v.as_array()) {
            Some(list) if !list.is_empty() => list,
            _ => return Ok(Vec::new()),
        };

        let product_id = rec
            .and_then(|r| r.get("productId"))
            .and_then(|v| v.as_str())
            .filter(|s| !s.trim().is_empty());

        // 2. If account_id and productId exist, fetch player unlocked status & unlock timestamps via PlayerProfile
        let mut player_map: HashMap<String, (bool, Option<String>)> = HashMap::new();

        if let (Some(aid), Some(pid)) = (account_id.filter(|s| !s.trim().is_empty()), product_id) {
            let player_query = r#"
                query PlayerProfileAchievements($epicAccountId: String!, $productId: String!) {
                  PlayerProfile {
                    playerProfile(epicAccountId: $epicAccountId) {
                      productAchievements(productId: $productId) {
                        __typename
                        ... on PlayerProductAchievementsResponseSuccess {
                          data {
                            totalUnlocked
                            playerAchievements {
                              playerAchievement {
                                achievementName
                                unlocked
                                unlockDate
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
            "#;

            let player_payload = json!({
                "query": player_query,
                "variables": {
                    "epicAccountId": aid,
                    "productId": pid
                }
            });

            let mut req_builder = client
                .post("https://store.epicgames.com/graphql")
                .header("Content-Type", "application/json")
                .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) EpicGamesLauncher");

            if let Some(token) = access_token.filter(|t| !t.trim().is_empty()) {
                req_builder = req_builder.header("Authorization", format!("Bearer {}", token));
            }

            if let Ok(p_resp) = req_builder.json(&player_payload).send().await {
                if p_resp.status().is_success() {
                    if let Ok(p_body) = p_resp.json::<Value>().await {
                        if let Some(p_achs) = p_body
                            .get("data")
                            .and_then(|d| d.get("PlayerProfile"))
                            .and_then(|p| p.get("playerProfile"))
                            .and_then(|p| p.get("productAchievements"))
                            .and_then(|pa| pa.get("data"))
                            .and_then(|d| d.get("playerAchievements"))
                            .and_then(|v| v.as_array())
                        {
                            for item in p_achs {
                                if let Some(p_ach) = item.get("playerAchievement") {
                                    if let Some(aname) = p_ach.get("achievementName").and_then(|v| v.as_str()) {
                                        let unlocked = p_ach.get("unlocked").and_then(|v| v.as_bool()).unwrap_or(false);
                                        let unlock_date = p_ach
                                            .get("unlockDate")
                                            .and_then(|v| v.as_str())
                                            .filter(|s| !s.trim().is_empty() && !s.starts_with("1970-01-01"))
                                            .map(|s| {
                                                // Convert ISO 2026-03-20T18:59:11.279Z -> 2026-03-20 18:59
                                                if s.len() >= 16 && s.as_bytes()[10] == b'T' {
                                                    format!("{} {}", &s[..10], &s[11..16])
                                                } else if s.len() >= 10 {
                                                    s[..10].to_string()
                                                } else {
                                                    s.to_string()
                                                }
                                            });
                                        player_map.insert(aname.to_string(), (unlocked, unlock_date));
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // 3. Assemble unified achievements
        let mut results = Vec::new();
        for item in ach_list {
            if let Some(raw) = item.get("achievement") {
                let api_name = raw.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                if api_name.is_empty() {
                    continue;
                }

                let (is_unlocked, unlock_time) = player_map.get(&api_name).cloned().unwrap_or((false, None));

                let unlocked_name = raw.get("unlockedDisplayName").and_then(|v| v.as_str()).unwrap_or("");
                let locked_name = raw.get("lockedDisplayName").and_then(|v| v.as_str()).unwrap_or("");
                let display_name = if !unlocked_name.is_empty() {
                    unlocked_name.to_string()
                } else if !locked_name.is_empty() {
                    locked_name.to_string()
                } else {
                    api_name.clone()
                };

                let unlocked_desc = raw.get("unlockedDescription").and_then(|v| v.as_str()).filter(|s| !s.is_empty());
                let locked_desc = raw.get("lockedDescription").and_then(|v| v.as_str()).filter(|s| !s.is_empty());
                let description = if is_unlocked {
                    unlocked_desc.or(locked_desc).map(|s| s.to_string())
                } else {
                    locked_desc.or(unlocked_desc).map(|s| s.to_string())
                };

                let unlocked_icon = raw.get("unlockedIconLink").and_then(|v| v.as_str()).unwrap_or("");
                let locked_icon = raw.get("lockedIconLink").and_then(|v| v.as_str()).unwrap_or("");

                let icon_url = if !unlocked_icon.is_empty() {
                    unlocked_icon.to_string()
                } else {
                    locked_icon.to_string()
                };

                let icon_gray_url = if !locked_icon.is_empty() {
                    Some(locked_icon.to_string())
                } else {
                    None
                };

                let rarity_percentage = raw
                    .get("rarity")
                    .and_then(|r| r.get("percent"))
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.0);

                let is_secret = raw.get("hidden").and_then(|v| v.as_bool()).unwrap_or(false)
                    || locked_name.eq_ignore_ascii_case("hidden");

                results.push(Achievement {
                    game_id: game_id.to_string(),
                    api_name,
                    display_name,
                    description,
                    icon_url,
                    icon_gray_url,
                    is_unlocked,
                    unlock_time,
                    rarity_percentage,
                    is_secret,
                });
            }
        }

        Ok(results)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_make_slug() {
        assert_eq!(EpicMetadataFetcher::make_slug("Maneater"), "maneater");
        assert_eq!(EpicMetadataFetcher::make_slug("Cyberpunk 2077"), "cyberpunk-2077");
        assert_eq!(EpicMetadataFetcher::make_slug("Grand Theft Auto V: Premium Edition"), "grand-theft-auto-v-premium-edition");
    }

    #[tokio::test]
    async fn test_fetch_epic_metadata_maneater() {
        let meta = EpicMetadataFetcher::fetch_metadata_by_title("Maneater").await;
        assert!(meta.is_ok(), "Expected metadata fetch to succeed for Maneater");
        let m = meta.unwrap();
        assert!(m.cover_image.is_some(), "Expected cover image for Maneater");
        assert!(m.background_image.is_some(), "Expected hero background image for Maneater");
        assert!(m.description.is_some(), "Expected description for Maneater");
    }

    #[tokio::test]
    async fn test_fetch_epic_achievements_live() {
        use crate::scanner::epic::EpicScanner;
        let (aid, rtoken) = {
            let conn = rusqlite::Connection::open(
                dirs::data_dir().unwrap().join("OpenPlay").join("openplay.db")
            ).unwrap();
            let mut stmt = conn.prepare("SELECT account_id, refresh_token FROM integrations WHERE provider='epic'").unwrap();
            stmt.query_row([], |r| Ok((r.get::<_, Option<String>>(0)?, r.get::<_, Option<String>>(1)?))).unwrap_or((None, None))
        };
        eprintln!("[TEST DEBUG] aid: {:?}, rtoken is_some: {}", aid, rtoken.is_some());

        let fresh_token = if let Some(ref rt) = rtoken {
            match EpicScanner::refresh_access_token(rt).await {
                Ok(auth) => {
                    eprintln!("[TEST DEBUG] Refreshed token successfully!");
                    Some(auth.access_token)
                }
                Err(e) => {
                    eprintln!("[TEST DEBUG] Token refresh failed: {}", e);
                    None
                }
            }
        } else {
            None
        };

        let achs = EpicMetadataFetcher::fetch_epic_achievements(
            "epic_boxes",
            "abc34708e5a0420287f52302582e3fec",
            aid.as_deref(),
            fresh_token.as_deref(),
        ).await;
        assert!(achs.is_ok());
        let list = achs.unwrap();
        eprintln!("[TEST DEBUG] list len: {}", list.len());
        let unlocked_count = list.iter().filter(|a| a.is_unlocked).count();
        eprintln!("[TEST DEBUG] unlocked count: {}", unlocked_count);
        for a in &list {
            if a.is_unlocked {
                eprintln!("[TEST DEBUG] unlocked: {} at {:?}", a.display_name, a.unlock_time);
            }
        }
        assert_eq!(list.len(), 12, "Expected Boxes: Lost Fragments to return 12 achievements");
        assert_eq!(unlocked_count, 12, "Expected all 12 achievements to be unlocked");
    }
}

