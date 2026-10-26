use reqwest::header::USER_AGENT;
use serde::{Deserialize, Serialize};
use std::time::Duration;

use crate::models::Achievement;

const RA_API_BASE: &str = "https://retroachievements.org/API";
const USER_AGENT_STR: &str = "OpenPlay/0.1.1";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RaGameProgress {
    #[serde(rename = "GameID")]
    pub game_id: u64,
    #[serde(rename = "Title")]
    pub title: String,
    #[serde(rename = "ImageIcon")]
    pub image_icon: Option<String>,
    #[serde(rename = "ConsoleID")]
    pub console_id: Option<u64>,
    #[serde(rename = "ConsoleName")]
    pub console_name: Option<String>,
    #[serde(rename = "MaxPossible")]
    pub max_possible: Option<u64>,
    #[serde(rename = "NumAwarded")]
    pub num_awarded: Option<u64>,
    #[serde(rename = "NumAwardedHardcore")]
    pub num_awarded_hardcore: Option<u64>,
    #[serde(rename = "MostRecentAwardedDate")]
    pub most_recent_awarded_date: Option<String>,
    #[serde(rename = "HighestAwardKind")]
    pub highest_award_kind: Option<String>,
    #[serde(rename = "HighestAwardDate")]
    pub highest_award_date: Option<String>,
    #[serde(rename = "LastPlayed", default)]
    pub last_played: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RaRecentlyPlayedGame {
    #[serde(rename = "GameID")]
    pub game_id: u64,
    #[serde(rename = "ConsoleID")]
    pub console_id: Option<u64>,
    #[serde(rename = "ConsoleName")]
    pub console_name: Option<String>,
    #[serde(rename = "Title")]
    pub title: String,
    #[serde(rename = "ImageIcon")]
    pub image_icon: Option<String>,
    #[serde(rename = "ImageTitle")]
    pub image_title: Option<String>,
    #[serde(rename = "ImageIngame")]
    pub image_ingame: Option<String>,
    #[serde(rename = "ImageBoxArt")]
    pub image_box_art: Option<String>,
    #[serde(rename = "LastPlayed")]
    pub last_played: Option<String>,
    #[serde(rename = "AchievementsTotal")]
    pub achievements_total: Option<u64>,
    #[serde(rename = "NumPossibleAchievements")]
    pub num_possible_achievements: Option<u64>,
    #[serde(rename = "PossibleScore")]
    pub possible_score: Option<u64>,
    #[serde(rename = "NumAchieved")]
    pub num_achieved: Option<u64>,
    #[serde(rename = "ScoreAchieved")]
    pub score_achieved: Option<u64>,
    #[serde(rename = "NumAchievedHardcore")]
    pub num_achieved_hardcore: Option<u64>,
    #[serde(rename = "ScoreAchievedHardcore")]
    pub score_achieved_hardcore: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RaCompletionProgressResponse {
    #[serde(rename = "Count")]
    pub count: Option<u64>,
    #[serde(rename = "Total")]
    pub total: Option<u64>,
    #[serde(rename = "Results", default)]
    pub results: Vec<RaGameProgress>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RaAchievementItem {
    #[serde(rename = "ID")]
    pub id: u64,
    #[serde(rename = "Title")]
    pub title: String,
    #[serde(rename = "Description")]
    pub description: Option<String>,
    #[serde(rename = "Points")]
    pub points: Option<u64>,
    #[serde(rename = "TrueRatio")]
    pub true_ratio: Option<u64>,
    #[serde(rename = "BadgeName")]
    pub badge_name: Option<String>,
    #[serde(rename = "NumAwarded")]
    pub num_awarded: Option<u64>,
    #[serde(rename = "NumAwardedHardcore")]
    pub num_awarded_hardcore: Option<u64>,
    #[serde(rename = "DateEarned")]
    pub date_earned: Option<String>,
    #[serde(rename = "DateEarnedHardcore")]
    pub date_earned_hardcore: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RaGameDetail {
    #[serde(rename = "ID")]
    pub id: u64,
    #[serde(rename = "Title")]
    pub title: String,
    #[serde(rename = "ConsoleName")]
    pub console_name: Option<String>,
    #[serde(rename = "Publisher")]
    pub publisher: Option<String>,
    #[serde(rename = "Developer")]
    pub developer: Option<String>,
    #[serde(rename = "ImageBoxArt")]
    pub image_box_art: Option<String>,
    #[serde(rename = "ImageIcon")]
    pub image_icon: Option<String>,
    #[serde(rename = "ImageTitle")]
    pub image_title: Option<String>,
    #[serde(rename = "NumDistinctPlayers")]
    pub num_distinct_players: Option<u64>,
    #[serde(rename = "NumAchievements")]
    pub num_achievements: Option<u64>,
    #[serde(rename = "NumAwardedToUser")]
    pub num_awarded_to_user: Option<u64>,
    #[serde(rename = "NumAwardedToUserHardcore")]
    pub num_awarded_to_user_hardcore: Option<u64>,
    #[serde(rename = "UserTotalPlaytime")]
    pub user_total_playtime: Option<u64>,
    #[serde(rename = "Achievements")]
    pub achievements: Option<serde_json::Value>,
}

pub struct RetroAchievementsClient;

impl RetroAchievementsClient {
    fn build_client() -> Result<reqwest::Client, String> {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(12))
            .build()
            .map_err(|e| e.to_string())
    }

    pub fn to_media_url(path: Option<&str>) -> Option<String> {
        path.filter(|s| !s.trim().is_empty()).map(|s| {
            if s.starts_with("http://") || s.starts_with("https://") {
                s.to_string()
            } else if s.starts_with('/') {
                format!("https://media.retroachievements.org{}", s)
            } else {
                format!("https://media.retroachievements.org/{}", s)
            }
        })
    }

    pub fn to_badge_url(badge_name: &str, locked: bool) -> String {
        if locked {
            format!("https://media.retroachievements.org/Badge/{}_lock.png", badge_name)
        } else {
            format!("https://media.retroachievements.org/Badge/{}.png", badge_name)
        }
    }

    /// Fetches all games user has completion progress on RetroAchievements.
    pub async fn fetch_user_completion_progress(
        username: &str,
        api_key: &str,
    ) -> Result<Vec<RaGameProgress>, String> {
        let client = Self::build_client()?;
        // Fetch up to 500 played games
        let url = format!(
            "{}/API_GetUserCompletionProgress.php?u={}&y={}&c=500",
            RA_API_BASE, username, api_key
        );

        let resp = client
            .get(&url)
            .header(USER_AGENT, USER_AGENT_STR)
            .send()
            .await
            .map_err(|e| format!("RetroAchievements network error: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!(
                "RetroAchievements API returned HTTP error {}",
                resp.status()
            ));
        }

        let body: RaCompletionProgressResponse = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse completion progress: {}", e))?;

        Ok(body.results)
    }

    /// Fetches games recently played by user (up to count, with offset).
    /// This captures games the user booted up or played even if they have 0 achievements.
    pub async fn fetch_user_recently_played_games(
        username: &str,
        api_key: &str,
        count: u32,
        offset: u32,
    ) -> Result<Vec<RaRecentlyPlayedGame>, String> {
        let client = Self::build_client()?;
        let url = format!(
            "{}/API_GetUserRecentlyPlayedGames.php?u={}&y={}&c={}&o={}",
            RA_API_BASE, username, api_key, count, offset
        );

        let resp = client
            .get(&url)
            .header(USER_AGENT, USER_AGENT_STR)
            .send()
            .await
            .map_err(|e| format!("RetroAchievements network error: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!(
                "RetroAchievements API returned HTTP error {}",
                resp.status()
            ));
        }

        let body: Vec<RaRecentlyPlayedGame> = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse recently played games: {}", e))?;

        Ok(body)
    }

    /// Fetches all games the user has a track record of playing (both with achievements and 0 achievements).
    pub async fn fetch_all_user_played_games(
        username: &str,
        api_key: &str,
    ) -> Result<Vec<RaGameProgress>, String> {
        let mut progress_map: std::collections::HashMap<u64, RaGameProgress> = std::collections::HashMap::new();

        // 1. Fetch completion progress (games with awards/achievements)
        match Self::fetch_user_completion_progress(username, api_key).await {
            Ok(list) => {
                for item in list {
                    progress_map.insert(item.game_id, item);
                }
            }
            Err(e) => {
                eprintln!("[RetroAchievements] Could not fetch completion progress: {}", e);
            }
        }

        // 2. Fetch recently played games (captures games played with 0 achievements)
        let mut offset = 0;
        let page_size = 50;
        while offset < 500 {
            match Self::fetch_user_recently_played_games(username, api_key, page_size, offset).await {
                Ok(recent_games) => {
                    if recent_games.is_empty() {
                        break;
                    }
                    let count = recent_games.len();
                    for rg in recent_games {
                        let entry = progress_map.entry(rg.game_id).or_insert_with(|| RaGameProgress {
                            game_id: rg.game_id,
                            title: rg.title.clone(),
                            image_icon: rg.image_icon.clone(),
                            console_id: rg.console_id,
                            console_name: rg.console_name.clone(),
                            max_possible: rg.num_possible_achievements.or(rg.achievements_total),
                            num_awarded: rg.num_achieved,
                            num_awarded_hardcore: rg.num_achieved_hardcore,
                            most_recent_awarded_date: None,
                            highest_award_kind: None,
                            highest_award_date: None,
                            last_played: rg.last_played.clone(),
                        });
                        if entry.last_played.is_none() && rg.last_played.is_some() {
                            entry.last_played = rg.last_played;
                        }
                    }
                    if count < page_size as usize {
                        break;
                    }
                    offset += page_size;
                }
                Err(e) => {
                    eprintln!("[RetroAchievements] Could not fetch recently played page at offset {}: {}", offset, e);
                    break;
                }
            }
        }

        if progress_map.is_empty() {
            return Err("No played games or achievements found on RetroAchievements for this account.".to_string());
        }

        Ok(progress_map.into_values().collect())
    }

    /// Fetches detailed game metadata & achievements for a specific user and game.
    pub async fn fetch_game_info_and_progress(
        game_id: u64,
        username: &str,
        api_key: &str,
    ) -> Result<RaGameDetail, String> {
        let client = Self::build_client()?;
        let url = format!(
            "{}/API_GetGameInfoAndUserProgress.php?u={}&y={}&g={}",
            RA_API_BASE, username, api_key, game_id
        );

        let mut attempts = 0;
        loop {
            attempts += 1;
            let resp = client
                .get(&url)
                .header(USER_AGENT, USER_AGENT_STR)
                .send()
                .await
                .map_err(|e| format!("RetroAchievements network error: {}", e))?;

            if resp.status().as_u16() == 429 && attempts <= 3 {
                eprintln!("[RetroAchievements] Rate limited (429) for game {}, retrying after backoff (attempt {})...", game_id, attempts);
                tokio::time::sleep(Duration::from_millis(600 * attempts)).await;
                continue;
            }

            if !resp.status().is_success() {
                return Err(format!(
                    "RetroAchievements API returned HTTP error {}",
                    resp.status()
                ));
            }

            let detail: RaGameDetail = resp
                .json()
                .await
                .map_err(|e| format!("Failed to parse game info & user progress: {}", e))?;

            return Ok(detail);
        }
    }

    /// Extracts achievements from `RaGameDetail` into OpenPlay's standard `Achievement` models.
    pub fn extract_achievements(game_id: &str, detail: &RaGameDetail) -> Vec<Achievement> {
        let players = detail.num_distinct_players.unwrap_or(0).max(1) as f64;
        let mut result = Vec::new();

        let raw_val = match &detail.achievements {
            Some(v) => v,
            None => return result,
        };

        let items: Vec<RaAchievementItem> = match raw_val {
            serde_json::Value::Object(map) => map
                .values()
                .filter_map(|val| serde_json::from_value::<RaAchievementItem>(val.clone()).ok())
                .collect(),
            serde_json::Value::Array(arr) => arr
                .iter()
                .filter_map(|val| serde_json::from_value::<RaAchievementItem>(val.clone()).ok())
                .collect(),
            _ => Vec::new(),
        };

        for item in items {
            let badge_name = item.badge_name.unwrap_or_default();
            let icon_url = Self::to_badge_url(&badge_name, false);
            let icon_gray_url = Some(Self::to_badge_url(&badge_name, true));
            let is_unlocked = item.date_earned.is_some() || item.date_earned_hardcore.is_some();
            let unlock_time = item.date_earned_hardcore.or(item.date_earned);
            let awarded = item.num_awarded.unwrap_or(0) as f64;
            let rarity_raw = (awarded / players) * 100.0;
            let rarity_percentage = ((rarity_raw * 100.0).round()) / 100.0;

            result.push(Achievement {
                game_id: game_id.to_string(),
                api_name: item.id.to_string(),
                display_name: item.title,
                description: item.description,
                icon_url,
                icon_gray_url,
                is_unlocked,
                unlock_time,
                rarity_percentage,
                is_secret: false,
            });
        }

        result
    }
}
