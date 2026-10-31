use serde_json::Value;
use std::time::Duration;

#[derive(Debug, Clone, Default)]
pub struct EnrichedScores {
    pub critic_score: Option<u32>,
    pub community_score: Option<u32>,
}

pub struct ScoreEnrichmentEngine;

impl ScoreEnrichmentEngine {
    /// Normalizes a game title for safe, collision-free comparison:
    /// lowercases, strips special symbols/punctuation, and removes common edition subtitles.
    pub fn normalize_title(title: &str) -> String {
        let lower = title.to_lowercase();
        let without_edition = lower
            .replace("game of the year edition", "")
            .replace("game of the year", "")
            .replace("definitive edition", "")
            .replace("enhanced edition", "")
            .replace("remastered", "")
            .replace("digital deluxe edition", "")
            .replace("deluxe edition", "")
            .replace("standard edition", "")
            .replace("director's cut", "");

        without_edition
            .chars()
            .filter(|c| c.is_alphanumeric())
            .collect::<String>()
    }

    /// Strict matching guard: ensures we NEVER attach scores from another game by mistake.
    pub fn is_safe_title_match(query: &str, candidate: &str) -> bool {
        let norm_q = Self::normalize_title(query);
        let norm_c = Self::normalize_title(candidate);

        if norm_q.is_empty() || norm_c.is_empty() {
            return false;
        }

        // Exact normalized match required
        norm_q == norm_c
    }

    /// Queries OpenCritic's public, zero-auth API for critic score
    pub async fn fetch_opencritic_score(client: &reqwest::Client, title: &str) -> Option<u32> {
        let resp = client
            .get("https://api.opencritic.com/api/game/search")
            .query(&[("criteria", title.trim())])
            .header("User-Agent", "OpenPlay/0.1.2")
            .timeout(Duration::from_secs(6))
            .send()
            .await
            .ok()?;

        if !resp.status().is_success() {
            return None;
        }

        let json: Value = resp.json().await.ok()?;
        let arr = json.as_array()?;

        // Look for the first safely matching game in the search results
        let mut matched_id: Option<u64> = None;
        for item in arr {
            if let Some(candidate_name) = item.get("name").and_then(|v| v.as_str()) {
                if Self::is_safe_title_match(title, candidate_name) {
                    matched_id = item.get("id").and_then(|v| v.as_u64());
                    break;
                }
            }
        }

        let game_id = matched_id?;

        // Query detailed game score by ID
        let detail_url = format!("https://api.opencritic.com/api/game/{}", game_id);
        let detail_resp = client
            .get(&detail_url)
            .header("User-Agent", "OpenPlay/0.1.2")
            .timeout(Duration::from_secs(6))
            .send()
            .await
            .ok()?;

        if !detail_resp.status().is_success() {
            return None;
        }

        let detail_json: Value = detail_resp.json().await.ok()?;
        let top_critic = detail_json
            .get("topCriticScore")
            .and_then(|v| v.as_f64())
            .filter(|&s| s > 0.0)
            .map(|s| s.round() as u32);

        top_critic
    }

    /// Queries Steam User Reviews API for positive rating percentage
    pub async fn fetch_steam_community_score(client: &reqwest::Client, appid: &str) -> Option<u32> {
        let url = format!(
            "https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/?appid={}&num_per_page=0",
            appid
        );

        let resp = client
            .get(&url)
            .header("User-Agent", "OpenPlay/0.1.2")
            .timeout(Duration::from_secs(6))
            .send()
            .await
            .ok()?;

        if !resp.status().is_success() {
            return None;
        }

        let json: Value = resp.json().await.ok()?;
        let summary = json.get("response")?.get("query_summary")?;

        let pos = summary.get("total_positive")?.as_u64()?;
        let neg = summary.get("total_negative")?.as_u64()?;
        let total = pos + neg;

        if total > 0 {
            Some(((pos as f64 / total as f64) * 100.0).round() as u32)
        } else {
            None
        }
    }

    /// Queries Steam Store API for Metacritic score
    pub async fn fetch_steam_metacritic_score(client: &reqwest::Client, appid: &str) -> Option<u32> {
        let url = format!(
            "https://store.steampowered.com/api/appdetails?appids={}&filters=basic,metacritic",
            appid
        );

        let resp = client
            .get(&url)
            .header("User-Agent", "OpenPlay/0.1.2")
            .timeout(Duration::from_secs(6))
            .send()
            .await
            .ok()?;

        if !resp.status().is_success() {
            return None;
        }

        let json: Value = resp.json().await.ok()?;
        let data = json.get(appid)?.get("data")?;

        data.get("metacritic")
            .and_then(|m| m.get("score"))
            .and_then(|s| s.as_u64())
            .map(|s| s as u32)
    }

    /// Searches Steam store by title and returns the AppID only if it is a strict safe title match
    pub async fn search_safe_steam_appid(client: &reqwest::Client, title: &str) -> Option<String> {
        let trimmed = title.trim();
        if trimmed.is_empty() {
            return None;
        }

        // Clean query of trademark symbols
        let cleaned = trimmed
            .replace('®', "")
            .replace('™', "")
            .replace('©', "");

        let resp = client
            .get("https://store.steampowered.com/api/storesearch/")
            .query(&[("term", cleaned.as_str()), ("l", "english"), ("cc", "US")])
            .header("User-Agent", "OpenPlay/0.1.2")
            .timeout(Duration::from_secs(6))
            .send()
            .await
            .ok()?;

        if !resp.status().is_success() {
            return None;
        }

        let json: Value = resp.json().await.ok()?;
        let items = json.get("items")?.as_array()?;

        for item in items {
            if let Some(name) = item.get("name").and_then(|v| v.as_str()) {
                if Self::is_safe_title_match(title, name) {
                    if let Some(id) = item.get("id").and_then(|v| v.as_u64()) {
                        return Some(id.to_string());
                    }
                }
            }
        }

        None
    }

    /// Comprehensive multi-source score resolution with strict matching guards:
    /// Checks OpenCritic and Steam (AppReviews & Metacritic) safely without ever mixing titles.
    pub async fn resolve_scores_for_game(
        title: &str,
        source: &str,
        source_id: Option<&str>,
    ) -> EnrichedScores {
        let client = match reqwest::Client::builder()
            .timeout(Duration::from_secs(8))
            .build()
        {
            Ok(c) => c,
            Err(_) => return EnrichedScores::default(),
        };

        let mut critic_score: Option<u32> = None;
        let mut community_score: Option<u32> = None;

        // 1. Try OpenCritic for Critic Score (High accuracy for multiplatform & console releases)
        if let Some(cs) = Self::fetch_opencritic_score(&client, title).await {
            critic_score = Some(cs);
        }

        // 2. Identify corresponding Steam AppID safely
        let resolved_appid = if source.eq_ignore_ascii_case("steam") {
            source_id.map(|s| s.to_string())
        } else {
            Self::search_safe_steam_appid(&client, title).await
        };

        // 3. If a Steam AppID exists or was safely identified, pull Steam community & metacritic scores
        if let Some(ref appid) = resolved_appid {
            if community_score.is_none() {
                community_score = Self::fetch_steam_community_score(&client, appid).await;
            }
            if critic_score.is_none() {
                critic_score = Self::fetch_steam_metacritic_score(&client, appid).await;
            }
        }

        EnrichedScores {
            critic_score,
            community_score,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_safe_title_match() {
        // Exact matching
        assert!(ScoreEnrichmentEngine::is_safe_title_match("Portal 2", "Portal 2"));
        // Edition differences
        assert!(ScoreEnrichmentEngine::is_safe_title_match(
            "The Witcher 3: Wild Hunt",
            "The Witcher 3: Wild Hunt - Game of the Year Edition"
        ));
        assert!(ScoreEnrichmentEngine::is_safe_title_match(
            "NieR Replicant",
            "NieR Replicant ver.1.22474487139..."
        ) == false); // Should reject mismatched version numbers
        // Trademark and punctuation
        assert!(ScoreEnrichmentEngine::is_safe_title_match("God of War™", "God of War"));
        assert!(ScoreEnrichmentEngine::is_safe_title_match("Half-Life 2", "Half Life 2"));
        // Safety guard against different games or numbered sequels
        assert!(!ScoreEnrichmentEngine::is_safe_title_match("Portal", "Portal 2"));
        assert!(!ScoreEnrichmentEngine::is_safe_title_match("Halo", "Halo 2"));
        assert!(!ScoreEnrichmentEngine::is_safe_title_match("Cyberpunk 2077", "Cyberpunk 2077: Phantom Liberty"));
    }
}
