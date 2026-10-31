use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmulatorProfile {
    pub id: String,
    pub name: String,
    pub emulator_type: String, // "retroarch" | "standalone"
    pub executable_path: String,
    pub arguments_template: String, // e.g. "-b -e \"{rom_path}\"" or "-L \"cores/{core}\" \"{rom_path}\""
    pub selected_core: Option<String>,
    pub supported_platforms: Vec<String>,
    #[serde(default = "default_true")]
    pub is_installed: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfiguredConsole {
    pub id: String,
    pub console_id: String,
    pub name: String,
    pub manufacturer: String,
    pub emulator_name: String,
    pub emulator_type: String, // "retroarch" | "standalone"
    pub executable_path: String,
    pub core_name: Option<String>,
    pub rom_directory: String,
    pub arguments_template: String,
    pub extensions: Vec<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredRom {
    pub file_path: String,
    pub file_name: String,
    pub clean_title: String,
    pub platform: String,
    pub suggested_emulator_id: Option<String>,
    pub file_size_bytes: u64,
    pub local_cover_path: Option<String>,
}
