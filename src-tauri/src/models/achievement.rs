use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Achievement {
    pub game_id: String,
    pub api_name: String,
    pub display_name: String,
    pub description: Option<String>,
    pub icon_url: String,
    pub icon_gray_url: Option<String>,
    pub is_unlocked: bool,
    pub unlock_time: Option<String>,
    pub rarity_percentage: f64,
    pub is_secret: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameAchievementSummary {
    pub game_id: String,
    pub game_title: String,
    pub cover_image: Option<String>,
    pub total_achievements: usize,
    pub unlocked_achievements: usize,
    pub completion_percentage: f64,
    pub is_perfect: bool,
    pub latest_unlocked: Option<Achievement>,
    pub recent_unlocked: Vec<Achievement>,
    pub upcoming_locked: Vec<Achievement>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HunterProfile {
    pub level: u32,
    pub total_score: u64,
    pub current_level_xp: u64,
    pub next_level_xp: u64,
    pub level_progress_percent: f64,
    pub total_achievements_count: usize,
    pub unlocked_achievements_count: usize,
    pub average_completion_percent: f64,
    pub perfect_games_count: usize,
    pub rarest_achievements: Vec<Achievement>,
    pub almost_there_games: Vec<GameAchievementSummary>,
    pub games_summaries: Vec<GameAchievementSummary>,
}
