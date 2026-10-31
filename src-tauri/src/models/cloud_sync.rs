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
pub struct PortableUIConfig {
    pub ui_updated_at: String,
    pub theme: Option<String>,
    pub accent_color: Option<String>,
    pub panel_tint: Option<String>,
    pub background_blur: Option<i32>,
    pub background_opacity: Option<f64>,
    pub view_mode: Option<String>,
    pub card_width: Option<f64>,
    pub grid_width_percent: Option<f64>,
    pub sort_by: Option<String>,
    pub sort_direction: Option<String>,
    pub group_by: Option<String>,
    pub status_filter: Option<String>,
    pub trailer_autoplay: Option<bool>,
    pub trailer_muted: Option<bool>,
    pub merge_duplicates: Option<bool>,
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
    pub tags: Vec<String>,
    pub categories: Vec<String>,
    pub platforms: Vec<String>,
    pub hltb_main: Option<f64>,
    pub hltb_extra: Option<f64>,
    pub hltb_completionist: Option<f64>,
    pub playtime_by_device: HashMap<String, u64>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceStatePayload {
    pub device_id: String,
    pub device_name: String,
    pub updated_at: String,
    pub games: Vec<PortableGameRecord>,
    pub ui_config: PortableUIConfig,
    pub tombstones: Vec<TombstoneRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncSummary {
    pub success: bool,
    pub games_pulled: usize,
    pub games_pushed: usize,
    pub games_deleted: usize,
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerDeviceInfo {
    pub device_id: String,
    pub device_name: String,
    pub last_active: String,
    pub games_count: usize,
    pub is_current_device: bool,
}
