use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    // Layout & Session State (Reopen right where you left off)
    pub view_mode: Option<String>,
    pub card_width: Option<f64>,
    pub grid_width_percent: Option<f64>,
    pub last_selected_game_id: Option<String>,

    // Filters & Sorting
    pub status_filter: Option<String>,
    pub sort_by: Option<String>,
    pub sort_direction: Option<String>,
    pub group_by: Option<String>,
    pub show_favorites_only: Option<bool>,
    pub selected_genres: Option<Vec<String>>,
    pub selected_developers: Option<Vec<String>>,
    pub selected_sources: Option<Vec<String>>,

    // General App Behavior
    pub auto_scan_on_startup: Option<bool>,
    pub minimize_on_game_launch: Option<bool>,
    pub close_to_tray: Option<bool>,

    // Appearance
    pub theme: Option<String>,
    pub background_blur: Option<i32>,
    pub background_opacity: Option<f64>,
    pub accent_color: Option<String>,
    pub panel_tint: Option<String>,

    // Playback & Media
    pub trailer_autoplay: Option<bool>,
    pub trailer_muted: Option<bool>,

    // APIs & Services
    pub steamgriddb_api_key: Option<String>,
    pub steamgriddb_nsfw: Option<bool>,
    pub retroachievements_username: Option<String>,
    pub retroachievements_api_key: Option<String>,
    pub igdb_client_id: Option<String>,
    pub igdb_client_secret: Option<String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            view_mode: Some("split".to_string()),
            card_width: Some(108.0),
            grid_width_percent: Some(52.0),
            last_selected_game_id: None,
            status_filter: Some("all".to_string()),
            sort_by: Some("playtime".to_string()),
            sort_direction: Some("desc".to_string()),
            group_by: Some("none".to_string()),
            show_favorites_only: Some(false),
            selected_genres: Some(Vec::new()),
            selected_developers: Some(Vec::new()),
            selected_sources: Some(Vec::new()),
            auto_scan_on_startup: Some(true),
            minimize_on_game_launch: Some(false),
            close_to_tray: Some(false),
            theme: Some("dark".to_string()),
            background_blur: Some(32),
            background_opacity: Some(0.75),
            accent_color: Some("#a855f7".to_string()),
            panel_tint: Some("#0e0e11".to_string()),
            trailer_autoplay: Some(true),
            trailer_muted: Some(true),
            steamgriddb_api_key: None,
            steamgriddb_nsfw: Some(false),
            retroachievements_username: None,
            retroachievements_api_key: None,
            igdb_client_id: None,
            igdb_client_secret: None,
        }
    }
}

