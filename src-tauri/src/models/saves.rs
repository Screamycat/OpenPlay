use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SavePathKind {
    Save,
    Config,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SaveRuleOs {
    Windows,
    Linux,
    Macos,
    SteamCloud,
    Any,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SaveLocationRule {
    pub kind: SavePathKind,
    pub os: SaveRuleOs,
    pub raw_template: String,
    pub source_label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SaveLocationCacheEntry {
    pub cache_key: String,
    pub pcgw_page: Option<String>,
    pub rules: Vec<SaveLocationRule>,
    pub fetched_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolvedSavePath {
    pub path: String,
    pub kind: String,   // "save" | "config"
    pub origin: String, // "custom" | "emulator" | "steam_userdata" | "proton_prefix" | "wine_prefix" | "pcgamingwiki" | "heuristic"
    pub exists: bool,
    pub file_count: usize,
    pub total_bytes: u64,
    pub template_hint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GameSaveConfig {
    pub game_id: String,
    pub custom_save_paths: Vec<String>,
    pub custom_config_paths: Vec<String>,
    pub last_synced_save_hash: Option<String>,
    pub last_synced_snapshot_id: Option<String>,
    pub last_synced_at: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudSaveSnapshot {
    pub id: String,
    pub game_id: String,
    pub canonical_save_key: String,
    pub game_title: String,
    pub device_id: String,
    pub device_name: String,
    pub os: String,
    pub created_at: String,
    pub trigger: String, // "auto_exit" | "pre_launch" | "manual"
    pub sha256: String,
    pub size_bytes: u64,
    pub file_count: usize,
    pub slot_count: usize,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalSafetyBackup {
    pub id: String,
    pub game_id: String,
    pub created_at: String,
    pub reason: String,
    pub size_bytes: u64,
    pub file_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameSaveState {
    pub game_id: String,
    pub canonical_save_key: String,
    pub save_paths: Vec<ResolvedSavePath>,
    pub config_paths: Vec<ResolvedSavePath>,
    pub custom_save_paths: Vec<String>,
    pub custom_config_paths: Vec<String>,
    pub has_custom_save_paths: bool,
    pub pcgw_page: Option<String>,
    pub cloud_save_enabled: bool,
    pub cloud_save_retention_override: Option<u32>,
    pub global_retention_count: u32,
    pub effective_retention_count: u32,
    pub cloud_sync_enabled: bool,
    pub cloud_sync_folder_valid: bool,
    pub is_game_running: bool,
    pub local_save_hash: Option<String>,
    pub local_size_bytes: u64,
    pub local_file_count: usize,
    pub is_oversized: bool,
    pub max_auto_bytes: u64,
    pub sync_status: String,
    pub last_synced_at: Option<String>,
    pub last_synced_snapshot_id: Option<String>,
    pub snapshots: Vec<CloudSaveSnapshot>,
    pub safety_backups: Vec<LocalSafetyBackup>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreLaunchSaveCheck {
    pub status: String, // "ok" | "pushed_pre_launch" | "newer_peer_available" | "oversized_warning"
    pub latest_snapshot: Option<CloudSaveSnapshot>,
    pub local_size_bytes: u64,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudSaveActionResult {
    pub success: bool,
    pub skipped: bool,
    pub message: String,
    pub snapshot: Option<CloudSaveSnapshot>,
    pub state: GameSaveState,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CloudSavesOverview {
    pub opted_in_games: usize,
    pub total_snapshots: usize,
    pub total_bytes: u64,
}
