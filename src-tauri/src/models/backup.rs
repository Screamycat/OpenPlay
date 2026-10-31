use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupInfo {
    pub filename: String,
    pub file_path: String,
    pub size_bytes: u64,
    pub created_at: String,
    pub game_count: u32,
    pub is_automatic: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportBackupSummary {
    pub total_games: usize,
    pub imported_count: usize,
    pub updated_count: usize,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectedLibraryItem {
    pub id: String,
    pub name: String,
    pub category: String, // "store" | "emulation"
    pub badge: String,
    pub is_authenticated: bool,
    pub last_sync: Option<String>,
}
