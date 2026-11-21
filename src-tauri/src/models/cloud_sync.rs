use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TombstoneRecord {
    pub id: String,
    pub title: Option<String>,
    pub source: Option<String>,
    pub deleted_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtensionTombstone {
    pub id: String,
    pub deleted_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncedExtensionPackage {
    pub id: String,
    pub version: String,
    pub sha256: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PortableApiKeys {
    #[serde(default)]
    pub steamgriddb_api_key: Option<String>,
    #[serde(default)]
    pub igdb_client_id: Option<String>,
    #[serde(default)]
    pub igdb_client_secret: Option<String>,
    #[serde(default)]
    pub retroachievements_username: Option<String>,
    #[serde(default)]
    pub retroachievements_api_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PortableExtensionsState {
    #[serde(default)]
    pub extensions_updated_at: String,
    #[serde(default)]
    pub active_theme_id: Option<String>,
    #[serde(default)]
    pub themes: Vec<SyncedExtensionPackage>,
    #[serde(default)]
    pub theme_configs: HashMap<String, HashMap<String, serde_json::Value>>,
    #[serde(default)]
    pub deleted_themes: Vec<ExtensionTombstone>,
    #[serde(default)]
    pub enabled_plugins: Option<Vec<String>>,
    #[serde(default)]
    pub plugins: Vec<SyncedExtensionPackage>,
    #[serde(default)]
    pub plugin_configs: HashMap<String, HashMap<String, serde_json::Value>>,
    #[serde(default)]
    pub deleted_plugins: Vec<ExtensionTombstone>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PortableUIConfig {
    #[serde(default)]
    pub ui_updated_at: String,
    #[serde(default)]
    pub active_theme_id: Option<String>,
    #[serde(default)]
    pub theme: Option<String>,
    #[serde(default)]
    pub accent_color: Option<String>,
    #[serde(default)]
    pub panel_tint: Option<String>,
    #[serde(default)]
    pub background_blur: Option<i32>,
    #[serde(default)]
    pub background_opacity: Option<f64>,
    #[serde(default)]
    pub modal_backdrop_opacity: Option<f64>,
    #[serde(default)]
    pub modal_backdrop_blur: Option<i32>,
    #[serde(default)]
    pub card_border_radius: Option<String>,
    #[serde(default)]
    pub enable_card_glow: Option<bool>,
    #[serde(default)]
    pub glass_intensity: Option<String>,
    #[serde(default)]
    pub view_mode: Option<String>,
    #[serde(default)]
    pub card_width: Option<f64>,
    #[serde(default)]
    pub grid_width_percent: Option<f64>,
    #[serde(default)]
    pub sort_by: Option<String>,
    #[serde(default)]
    pub sort_direction: Option<String>,
    #[serde(default)]
    pub group_by: Option<String>,
    #[serde(default)]
    pub status_filter: Option<String>,
    #[serde(default)]
    pub show_favorites_only: Option<bool>,
    #[serde(default)]
    pub last_played_date_format: Option<String>,
    #[serde(default)]
    pub auto_scan_on_startup: Option<bool>,
    #[serde(default)]
    pub minimize_on_game_launch: Option<bool>,
    #[serde(default)]
    pub close_to_tray: Option<bool>,
    #[serde(default)]
    pub trailer_autoplay: Option<bool>,
    #[serde(default)]
    pub trailer_muted: Option<bool>,
    #[serde(default)]
    pub merge_duplicates: Option<bool>,
    #[serde(default)]
    pub unmerged_game_ids: Option<Vec<String>>,
    #[serde(default)]
    pub steamgriddb_nsfw: Option<bool>,
    #[serde(default)]
    pub sync_on_startup: Option<bool>,
    #[serde(default)]
    pub periodic_playtime_sync_hours: Option<u32>,
    #[serde(default)]
    pub backup_frequency: Option<String>,
    #[serde(default)]
    pub backup_retention_count: Option<u32>,
    #[serde(default)]
    pub cloud_sync_interval_minutes: Option<u32>,
    #[serde(default)]
    pub cloud_sync_on_startup: Option<bool>,
    #[serde(default)]
    pub cloud_sync_on_game_exit: Option<bool>,
    #[serde(default)]
    pub cloud_save_retention_count: Option<u32>,
    #[serde(default)]
    pub default_theme_config: Option<HashMap<String, serde_json::Value>>,
    #[serde(default)]
    pub api_keys: Option<PortableApiKeys>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortableGameRecord {
    pub id: String,
    pub title: String,
    pub sorting_title: Option<String>,
    pub source: String,
    pub source_id: Option<String>,
    pub description: Option<String>,
    pub notes: Option<String>,
    pub user_rating: Option<u32>,
    pub critic_score: Option<u32>,
    pub community_score: Option<u32>,
    pub release_date: Option<String>,
    pub completion_status: Option<String>,
    #[serde(default)]
    pub auto_beaten: bool,
    #[serde(default)]
    pub beaten_prompt_playtime: Option<u64>,
    #[serde(default)]
    pub last_played: Option<String>,
    #[serde(default)]
    pub play_count: Option<u32>,
    pub is_favorite: bool,
    pub is_hidden: bool,
    pub cover_image: Option<String>,
    pub background_image: Option<String>,
    pub logo_image: Option<String>,
    pub icon_image: Option<String>,
    pub developer: Option<String>,
    pub publisher: Option<String>,
    pub genres: Vec<String>,
    pub features: Vec<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub categories: Vec<String>,
    pub platforms: Vec<String>,
    pub hltb_main: Option<f64>,
    pub hltb_extra: Option<f64>,
    pub hltb_completionist: Option<f64>,
    pub playtime_by_device: HashMap<String, u64>,
    #[serde(default)]
    pub cloud_save_enabled: bool,
    #[serde(default)]
    pub cloud_save_retention_override: Option<u32>,
    #[serde(default)]
    pub last_played_device_id: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceStatePayload {
    pub device_id: String,
    pub device_name: String,
    pub updated_at: String,
    pub games: Vec<PortableGameRecord>,
    #[serde(default)]
    pub ui_config: PortableUIConfig,
    #[serde(default)]
    pub extensions: Option<PortableExtensionsState>,
    #[serde(default)]
    pub tombstones: Vec<TombstoneRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncSummary {
    pub success: bool,
    pub games_pulled: usize,
    pub games_pushed: usize,
    pub games_deleted: usize,
    #[serde(default)]
    pub extensions_synced: usize,
    #[serde(default)]
    pub settings_synced: bool,
    pub peer_devices_count: usize,
    pub timestamp: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudSyncStatus {
    pub enabled: bool,
    pub folder_path: Option<String>,
    pub device_id: String,
    pub device_name: String,
    pub last_sync_time: Option<String>,
    pub peer_count: usize,
    pub is_folder_valid: bool,
    #[serde(default = "default_true")]
    pub sync_settings: bool,
    #[serde(default = "default_true")]
    pub sync_extensions: bool,
    #[serde(default)]
    pub sync_api_keys: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerDeviceInfo {
    pub device_id: String,
    pub device_name: String,
    pub last_active: String,
    pub games_count: usize,
    pub is_current_device: bool,
}
