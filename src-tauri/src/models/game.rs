use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GameLink {
    pub title: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GameTrailer {
    pub name: String,
    pub thumbnail: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GameAction {
    pub id: String,
    pub name: String,
    pub path: String,
    pub arguments: Option<String>,
    pub working_dir: Option<String>,
    #[serde(default)]
    pub is_primary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
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
    pub cover_image: Option<String>,       // Vertical 600x900 poster (supports static and animated APNG/WebP/GIF)
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
    pub critic_score: Option<u32>,         // Metacritic / Professional critic score
    pub user_rating: Option<u32>,          // 0-5
    pub playtime_seconds: u64,
    pub last_played: Option<String>,
    pub date_added: Option<String>,
    pub completion_status: Option<String>, // "Played", "Playing", "Completed", "Plan to Play", "Not Played"
    pub description: Option<String>,       // Rich HTML description
    pub notes: Option<String>,
    pub links: Vec<GameLink>,
    pub screenshots: Vec<String>,
    pub trailers: Vec<GameTrailer>,
    pub age_rating: Option<String>,        // e.g. "PEGI 18", "ESRB M"
    pub series: Option<String>,
    pub hltb_main: Option<f32>,            // Hours
    pub hltb_extra: Option<f32>,           // Hours
    pub hltb_completionist: Option<f32>,   // Hours
    pub size_on_disk: Option<u64>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub categories: Vec<String>,
    #[serde(default)]
    pub region: Option<String>,
    #[serde(default)]
    pub play_count: Option<u32>,
    #[serde(default)]
    pub is_hidden: bool,
    #[serde(default)]
    pub play_actions: Vec<GameAction>,
    #[serde(default)]
    pub auto_beaten: bool,
    #[serde(default)]
    pub beaten_prompt_playtime: Option<u64>,
}
