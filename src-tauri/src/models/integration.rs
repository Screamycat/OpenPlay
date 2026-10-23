use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryIntegration {
    pub provider: String, // "steam", "epic", "gog", "emulation", "manual"
    pub account_id: Option<String>,
    pub username: Option<String>,
    pub avatar_url: Option<String>,
    pub is_authenticated: bool,
    pub import_installed: bool,
    pub import_uninstalled: bool,
    pub sync_playtime: bool,
    pub last_sync: Option<String>,
}

impl Default for LibraryIntegration {
    fn default() -> Self {
        Self {
            provider: "steam".to_string(),
            account_id: None,
            username: None,
            avatar_url: None,
            is_authenticated: false,
            import_installed: true,
            import_uninstalled: true,
            sync_playtime: true,
            last_sync: None,
        }
    }
}
