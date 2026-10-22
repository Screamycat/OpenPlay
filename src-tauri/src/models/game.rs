use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameLink {
    pub title: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Game {
    pub id: String,
    pub title: String,
    pub sorting_title: Option<String>,
    pub source: String,                   // "Steam", "Manual", "Epic", "GOG"
    pub source_id: Option<String>,         // e.g. "1118310"
    pub install_directory: Option<String>,
    pub executable_path: Option<String>,
    pub launch_arguments: Option<String>,
    pub is_installed: bool,
    pub is_favorite: bool,
    pub cover_image: Option<String>,       // Vertical 600x900 poster
    pub background_image: Option<String>,  // Hero backdrop
    pub logo_image: Option<String>,        // Transparent logo
    pub icon_image: Option<String>,
    pub developer: Option<String>,
    pub publisher: Option<String>,
    pub release_date: Option<String>,
    pub genres: Vec<String>,
    pub features: Vec<String>,
    pub platforms: Vec<String>,            // ["Windows", "Linux", "Macintosh"]
    pub community_score: Option<u32>,
    pub user_rating: Option<u32>,          // 0-5
    pub playtime_seconds: u64,
    pub last_played: Option<String>,
    pub date_added: Option<String>,
    pub completion_status: Option<String>, // "Played", "Playing", "Completed", "Plan to Play", "Not Played"
    pub description: Option<String>,
    pub notes: Option<String>,
    pub links: Vec<GameLink>,
    pub screenshots: Vec<String>,
    pub size_on_disk: Option<u64>,
}
