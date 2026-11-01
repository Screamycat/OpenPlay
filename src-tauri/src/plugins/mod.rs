use crate::db::Database;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use zip::ZipArchive;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginSetting {
    pub id: String,
    pub label: String,
    #[serde(rename = "type")]
    pub setting_type: String, // "boolean", "select", "string", "number"
    pub default: serde_json::Value,
    #[serde(default)]
    pub options: Option<Vec<String>>,
    #[serde(default)]
    pub placeholder: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub author: String,
    pub description: String,
    pub icon: String, // MANDATORY
    #[serde(default)]
    pub screenshots: Option<Vec<String>>,
    pub entry: String, // MANDATORY e.g. "index.js"
    #[serde(default)]
    pub permissions: Option<Vec<String>>,
    #[serde(default)]
    pub settings: Option<Vec<PluginSetting>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginInfo {
    pub manifest: PluginManifest,
    pub is_enabled: bool,
    pub resolved_icon: Option<String>,
    pub resolved_screenshots: Vec<String>,
    pub config_values: HashMap<String, serde_json::Value>,
    pub entry_content: Option<String>,
}

pub fn get_plugins_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("OpenPlay")
        .join("plugins")
}

pub fn is_plugin_enabled(db: &Database, plugin_id: &str) -> bool {
    if let Ok(Some(raw)) = db.get_setting("enabled_plugins") {
        if let Ok(list) = serde_json::from_str::<Vec<String>>(&raw) {
            return list.contains(&plugin_id.to_string());
        }
    }
    // By default, newly installed plugins are enabled
    true
}

pub fn toggle_plugin(db: &Database, plugin_id: &str, enabled: bool) -> Result<(), String> {
    let mut list = if let Ok(Some(raw)) = db.get_setting("enabled_plugins") {
        serde_json::from_str::<Vec<String>>(&raw).unwrap_or_default()
    } else {
        // If no preference stored yet, collect existing plugin IDs
        Vec::new()
    };

    if enabled {
        if !list.contains(&plugin_id.to_string()) {
            list.push(plugin_id.to_string());
        }
    } else {
        list.retain(|id| id != plugin_id);
    }

    let json = serde_json::to_string(&list).map_err(|e| e.to_string())?;
    db.set_setting("enabled_plugins", &json)
}

pub fn get_plugin_config(db: &Database, plugin_id: &str) -> Result<HashMap<String, serde_json::Value>, String> {
    let key = format!("plugin_config:{}", plugin_id);
    if let Ok(Some(raw)) = db.get_setting(&key) {
        if let Ok(map) = serde_json::from_str::<HashMap<String, serde_json::Value>>(&raw) {
            return Ok(map);
        }
    }
    Ok(HashMap::new())
}

pub fn save_plugin_config(db: &Database, plugin_id: &str, config_json: &str) -> Result<(), String> {
    let key = format!("plugin_config:{}", plugin_id);
    db.set_setting(&key, config_json)
}

pub fn list_plugins(db: &Database) -> Result<Vec<PluginInfo>, String> {
    let plugins_dir = get_plugins_dir();
    fs::create_dir_all(&plugins_dir).map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    let entries = fs::read_dir(&plugins_dir).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            // Check for plugin.json or manifest.json
            let manifest_path = if path.join("plugin.json").exists() {
                path.join("plugin.json")
            } else if path.join("manifest.json").exists() {
                path.join("manifest.json")
            } else {
                continue;
            };

            if let Ok(manifest_content) = fs::read_to_string(&manifest_path) {
                if let Ok(manifest) = serde_json::from_str::<PluginManifest>(&manifest_content) {
                    let is_enabled = is_plugin_enabled(db, &manifest.id);

                    // Resolve absolute path for icon
                    let icon_file = path.join(&manifest.icon);
                    let resolved_icon = if icon_file.exists() {
                        Some(icon_file.to_string_lossy().to_string())
                    } else {
                        None
                    };

                    // Resolve absolute paths for screenshots
                    let mut resolved_screenshots = Vec::new();
                    if let Some(ref screenshots) = manifest.screenshots {
                        for s in screenshots {
                            let s_path = path.join(s);
                            if s_path.exists() {
                                resolved_screenshots.push(s_path.to_string_lossy().to_string());
                            }
                        }
                    }

                    // Load user config from SQLite
                    let config_values = get_plugin_config(db, &manifest.id).unwrap_or_default();

                    // Read entry file content
                    let entry_content = {
                        let entry_path = path.join(&manifest.entry);
                        fs::read_to_string(entry_path).ok()
                    };

                    results.push(PluginInfo {
                        manifest,
                        is_enabled,
                        resolved_icon,
                        resolved_screenshots,
                        config_values,
                        entry_content,
                    });
                }
            }
        }
    }

    results.sort_by(|a, b| a.manifest.name.cmp(&b.manifest.name));
    Ok(results)
}

pub fn delete_plugin(db: &Database, plugin_id: &str) -> Result<(), String> {
    let plugins_dir = get_plugins_dir();
    let plugin_dir = plugins_dir.join(plugin_id);
    if plugin_dir.exists() {
        fs::remove_dir_all(&plugin_dir).map_err(|e| format!("Failed to delete plugin directory: {}", e))?;
    }

    // Clean up settings
    let key = format!("plugin_config:{}", plugin_id);
    let _ = db.set_setting(&key, "{}");

    // Remove from enabled list
    let _ = toggle_plugin(db, plugin_id, false);

    Ok(())
}

pub fn import_plugin_zip(db: &Database, zip_path_str: &str) -> Result<PluginInfo, String> {
    let zip_path = Path::new(zip_path_str);
    if !zip_path.exists() {
        return Err("Selected plugin zip file does not exist.".to_string());
    }

    let file = fs::File::open(zip_path).map_err(|e| format!("Failed to open zip file: {}", e))?;
    let mut archive = ZipArchive::new(file).map_err(|e| format!("Invalid zip archive: {}", e))?;

    let temp_import_id = uuid::Uuid::new_v4().to_string();
    let temp_dir = get_plugins_dir().join(format!(".temp_plugin_{}", temp_import_id));
    fs::create_dir_all(&temp_dir).map_err(|e| format!("Failed to create temporary folder: {}", e))?;

    let canonical_temp = temp_dir.canonicalize().map_err(|e| e.to_string())?;

    // Safe extraction with Zip Slip prevention
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| format!("Corrupt zip entry: {}", e))?;
        let enclosed = match entry.enclosed_name() {
            Some(path) => path.to_owned(),
            None => continue,
        };
        let outpath = canonical_temp.join(enclosed);

        if entry.is_dir() {
            fs::create_dir_all(&outpath).map_err(|e| format!("Failed to create folder: {}", e))?;
        } else {
            if let Some(parent) = outpath.parent() {
                if !parent.exists() {
                    fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent folder: {}", e))?;
                }
            }
            let mut outfile = fs::File::create(&outpath).map_err(|e| format!("Failed to create file: {}", e))?;
            std::io::copy(&mut entry, &mut outfile).map_err(|e| format!("Failed to extract file: {}", e))?;
        }
    }

    // Locate plugin.json or manifest.json: check root first, then single subfolder
    let mut root_source = temp_dir.clone();
    let has_direct = temp_dir.join("plugin.json").exists() || temp_dir.join("manifest.json").exists();
    if !has_direct {
        if let Ok(entries) = fs::read_dir(&temp_dir) {
            let subdirs: Vec<_> = entries
                .flatten()
                .filter(|e| e.path().is_dir())
                .collect();
            if subdirs.len() == 1 {
                let candidate = subdirs[0].path();
                if candidate.join("plugin.json").exists() || candidate.join("manifest.json").exists() {
                    root_source = candidate;
                }
            }
        }
    }

    let manifest_path = if root_source.join("plugin.json").exists() {
        root_source.join("plugin.json")
    } else if root_source.join("manifest.json").exists() {
        root_source.join("manifest.json")
    } else {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err("Plugin package is invalid: 'plugin.json' or 'manifest.json' not found.".to_string());
    };

    let manifest_raw = fs::read_to_string(&manifest_path).map_err(|e| {
        let _ = fs::remove_dir_all(&temp_dir);
        format!("Failed to read plugin manifest: {}", e)
    })?;

    let manifest: PluginManifest = serde_json::from_str(&manifest_raw).map_err(|e| {
        let _ = fs::remove_dir_all(&temp_dir);
        format!("Failed to parse plugin manifest: {}. Please verify json formatting.", e)
    })?;

    // Validate ID
    let plugin_id = manifest.id.trim().to_lowercase();
    if plugin_id.is_empty() {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err("Invalid plugin ID: ID cannot be empty.".to_string());
    }
    if !plugin_id.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err("Plugin ID may only contain lowercase alphanumeric letters, hyphens, and underscores.".to_string());
    }

    // Validate Name, Version, Author, Description
    if manifest.name.trim().is_empty() {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err("Plugin manifest must have a non-empty 'name'.".to_string());
    }
    if manifest.version.trim().is_empty() {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err("Plugin manifest must have a non-empty 'version'.".to_string());
    }
    if manifest.author.trim().is_empty() {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err("Plugin manifest must have a non-empty 'author'.".to_string());
    }
    if manifest.description.trim().is_empty() {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err("Plugin manifest must have a non-empty 'description'.".to_string());
    }

    // STRICT VALIDATION: Icon is mandatory and must exist on disk
    if manifest.icon.trim().is_empty() {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err("Plugin manifest is missing mandatory 'icon' field.".to_string());
    }
    let icon_file = root_source.join(&manifest.icon);
    if !icon_file.exists() {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err(format!(
            "Plugin icon file '{}' specified in manifest was not found in the package.",
            manifest.icon
        ));
    }

    // Validate Entrypoint
    if manifest.entry.trim().is_empty() {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err("Plugin manifest must specify an 'entry' script (e.g. 'index.js').".to_string());
    }
    let entry_file = root_source.join(&manifest.entry);
    if !entry_file.exists() {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err(format!(
            "Plugin entry file '{}' specified in manifest was not found in the package.",
            manifest.entry
        ));
    }

    // Target destination
    let final_dest = get_plugins_dir().join(&plugin_id);
    if final_dest.exists() {
        // Replace existing version
        fs::remove_dir_all(&final_dest).map_err(|e| format!("Failed to update existing plugin: {}", e))?;
    }

    // Move to final destination
    if root_source == temp_dir {
        fs::rename(&temp_dir, &final_dest).map_err(|e| format!("Failed to move plugin directory: {}", e))?;
    } else {
        fs::rename(&root_source, &final_dest).map_err(|e| format!("Failed to move plugin directory: {}", e))?;
        let _ = fs::remove_dir_all(&temp_dir);
    }

    // Ensure enabled by default
    let _ = toggle_plugin(db, &plugin_id, true);

    let is_enabled = true;
    let resolved_icon = Some(final_dest.join(&manifest.icon).to_string_lossy().to_string());
    let resolved_screenshots = manifest
        .screenshots
        .as_ref()
        .map(|list| {
            list.iter()
                .filter_map(|s| {
                    let p = final_dest.join(s);
                    if p.exists() {
                        Some(p.to_string_lossy().to_string())
                    } else {
                        None
                    }
                })
                .collect()
        })
        .unwrap_or_default();
    let config_values = get_plugin_config(db, &plugin_id).unwrap_or_default();
    let entry_content = {
        let entry_path = final_dest.join(&manifest.entry);
        fs::read_to_string(entry_path).ok()
    };

    Ok(PluginInfo {
        manifest,
        is_enabled,
        resolved_icon,
        resolved_screenshots,
        config_values,
        entry_content,
    })
}

pub fn seed_bundled_plugins() -> Result<(), String> {
    let plugins_dir = get_plugins_dir();
    fs::create_dir_all(&plugins_dir).map_err(|e| e.to_string())?;
    Ok(())
}
