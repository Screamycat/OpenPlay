use crate::db::Database;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use zip::ZipArchive;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeSetting {
    pub id: String,
    pub label: String,
    #[serde(rename = "type")]
    pub setting_type: String, // "boolean", "select", "color", "number", "text"
    pub default: serde_json::Value,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub options: Option<Vec<String>>,
    #[serde(default)]
    pub min: Option<f64>,
    #[serde(default)]
    pub max: Option<f64>,
    #[serde(default)]
    pub step: Option<f64>,
}

fn default_theme_mode() -> String {
    "desktop".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub author: String,
    pub description: String,
    #[serde(default = "default_theme_mode")]
    pub mode: String, // "desktop" | "console"
    pub icon: String, // MANDATORY
    pub screenshots: Vec<String>, // MANDATORY: >= 3
    #[serde(default)]
    pub css: Option<String>,
    #[serde(default)]
    pub colors: Option<HashMap<String, String>>,
    #[serde(default)]
    pub settings: Option<Vec<ThemeSetting>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeInfo {
    pub manifest: ThemeManifest,
    pub is_active: bool,
    pub is_builtin: bool,
    pub resolved_icon: Option<String>,
    pub resolved_screenshots: Vec<String>,
    pub config_values: HashMap<String, serde_json::Value>,
    pub css_content: Option<String>,
}

pub fn get_themes_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("OpenPlay")
        .join("themes")
}

pub fn resolve_bundled_theme_dir(resource_dir: Option<&Path>, folder_name: &str) -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(res) = resource_dir {
        candidates.push(res.join("resources").join("themes").join(folder_name));
        candidates.push(res.join("themes").join(folder_name));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            candidates.push(parent.join("resources").join("themes").join(folder_name));
            candidates.push(parent.join("themes").join(folder_name));
            if let Some(grandparent) = parent.parent() {
                candidates.push(grandparent.join("resources").join("themes").join(folder_name));
            }
        }
    }
    // App root resources directory (in dev or when run from project root)
    if let Some(parent) = Path::new(env!("CARGO_MANIFEST_DIR")).parent() {
        candidates.push(parent.join("resources").join("themes").join(folder_name));
    }
    candidates.push(
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("themes")
            .join(folder_name),
    );
    candidates.push(PathBuf::from("resources").join("themes").join(folder_name));

    candidates
        .into_iter()
        .find(|dir| dir.is_dir() && dir.join("theme.json").is_file())
}

pub fn resolve_bundled_default_theme_dir(resource_dir: Option<&Path>) -> Option<PathBuf> {
    resolve_bundled_theme_dir(resource_dir, "default")
}

pub fn resolve_bundled_console_default_theme_dir(resource_dir: Option<&Path>) -> Option<PathBuf> {
    resolve_bundled_theme_dir(resource_dir, "console-default")
}

pub fn get_default_theme_dir(resource_dir: Option<&Path>) -> PathBuf {
    if let Some(bundled) = resolve_bundled_default_theme_dir(resource_dir) {
        return bundled;
    }
    if let Some(parent) = Path::new(env!("CARGO_MANIFEST_DIR")).parent() {
        let cand = parent.join("resources").join("themes").join("default");
        if cand.is_dir() {
            return cand;
        }
    }
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("themes")
        .join("default")
}

pub fn get_console_default_theme_dir(resource_dir: Option<&Path>) -> PathBuf {
    if let Some(bundled) = resolve_bundled_console_default_theme_dir(resource_dir) {
        return bundled;
    }
    if let Some(parent) = Path::new(env!("CARGO_MANIFEST_DIR")).parent() {
        let cand = parent.join("resources").join("themes").join("console-default");
        if cand.is_dir() {
            return cand;
        }
    }
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("themes")
        .join("console-default")
}

pub fn seed_default_theme(resource_dir: Option<&Path>) -> Result<(), String> {
    // With decoupled app-root theming, the built-in default themes live permanently in the application root.
    // We only verify that bundled default theme files exist and avoid writing to user data folder.
    let _ = get_default_theme_dir(resource_dir);
    let _ = get_console_default_theme_dir(resource_dir);
    Ok(())
}

pub fn seed_default_theme_to(themes_dir: &Path, resource_dir: Option<&Path>) -> Result<(), String> {
    let default_dir = themes_dir.join("default");
    fs::create_dir_all(&default_dir).map_err(|e| e.to_string())?;

    if let Some(bundled_dir) = resolve_bundled_default_theme_dir(resource_dir) {
        let entries = fs::read_dir(&bundled_dir).map_err(|e| e.to_string())?;
        for entry in entries.flatten() {
            let src_path = entry.path();
            if !src_path.is_file() {
                continue;
            }
            let Some(file_name) = src_path.file_name() else {
                continue;
            };
            let dest_path = default_dir.join(file_name);
            let src_len = fs::metadata(&src_path).map(|m| m.len()).unwrap_or(0);

            let should_copy = if !dest_path.exists() {
                true
            } else if let Ok(dest_meta) = fs::metadata(&dest_path) {
                if dest_meta.len() != src_len {
                    true
                } else if src_len <= 65_536 {
                    match (fs::read(&src_path), fs::read(&dest_path)) {
                        (Ok(a), Ok(b)) => a != b,
                        _ => true,
                    }
                } else {
                    false
                }
            } else {
                true
            };

            if should_copy {
                fs::copy(&src_path, &dest_path).map_err(|e| e.to_string())?;
            }
        }

        // Remove legacy screenshots if superseded by bundled screenshots
        for legacy_file in [
            "screenshot_1.svg",
            "screenshot_2.svg",
            "screenshot_3.svg",
            "screenshot_1.gif",
            "screenshot_2.jpg",
            "screenshot_3.png",
        ] {
            if !bundled_dir.join(legacy_file).exists() {
                let stale = default_dir.join(legacy_file);
                if stale.exists() {
                    let _ = fs::remove_file(stale);
                }
            }
        }

        return Ok(());
    }

    // Fallback when running from an isolated binary without bundled resources
    let manifest_path = default_dir.join("theme.json");
    if !manifest_path.exists() {
        let manifest = include_str!("../../resources/themes/default/theme.json");
        fs::write(&manifest_path, manifest).map_err(|e| e.to_string())?;
    }

    let css_path = default_dir.join("theme.css");
    if !css_path.exists() {
        let default_css = include_str!("../../resources/themes/default/theme.css");
        fs::write(&css_path, default_css).map_err(|e| e.to_string())?;
    }

    let icon_path = default_dir.join("icon.svg");
    if !icon_path.exists() {
        let icon_svg = include_str!("../../resources/themes/default/icon.svg");
        fs::write(&icon_path, icon_svg).map_err(|e| e.to_string())?;
    }

    Ok(())
}


fn parse_theme_at_path(
    path: &Path,
    is_builtin: bool,
    active_desktop_id: &str,
    active_console_id: &str,
    db: &Database,
) -> Option<ThemeInfo> {
    let manifest_path = path.join("theme.json");
    if !manifest_path.exists() {
        return None;
    }
    let manifest_content = fs::read_to_string(&manifest_path).ok()?;
    let mut manifest = serde_json::from_str::<ThemeManifest>(&manifest_content).ok()?;
    let normalized_mode = manifest.mode.trim().to_lowercase();
    manifest.mode = if normalized_mode == "console" {
        "console".to_string()
    } else {
        "desktop".to_string()
    };
    let is_active = if manifest.mode == "console" {
        manifest.id == active_console_id
    } else {
        manifest.id == active_desktop_id
    };

    // Resolve path for icon (supporting .svg, .png, .jpg, .jpeg, .webp, .gif)
    let resolved_icon = if path.join(&manifest.icon).exists() {
        Some(path.join(&manifest.icon).to_string_lossy().to_string())
    } else {
        let stem = Path::new(&manifest.icon)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("icon");
        ["svg", "png", "jpg", "jpeg", "webp", "gif"].iter().find_map(|ext| {
            let cand = path.join(format!("{}.{}", stem, ext));
            if cand.exists() {
                Some(cand.to_string_lossy().to_string())
            } else {
                None
            }
        })
    };

    // Resolve paths for screenshots (supporting .gif, .png, .jpg, .jpeg, .webp, .svg)
    let mut resolved_screenshots = Vec::new();
    for s in &manifest.screenshots {
        let s_path = path.join(s);
        if s_path.exists() {
            resolved_screenshots.push(s_path.to_string_lossy().to_string());
        } else {
            // Fallback check: look for alternate extension on disk (.gif, .png, .jpg, .jpeg, .webp, .svg)
            let stem = Path::new(s).file_stem().and_then(|st| st.to_str()).unwrap_or("");
            if !stem.is_empty() {
                for ext in &["gif", "png", "jpg", "jpeg", "webp", "svg"] {
                    let candidate = path.join(format!("{}.{}", stem, ext));
                    if candidate.exists() {
                        resolved_screenshots.push(candidate.to_string_lossy().to_string());
                        break;
                    }
                }
            }
        }
    }

    // If screenshots array in manifest had missing files or was empty, also scan directory for any screenshot_* or preview_* images!
    if resolved_screenshots.len() < 3 {
        if let Ok(dir_entries) = fs::read_dir(path) {
            for file_entry in dir_entries.flatten() {
                let fpath = file_entry.path();
                if fpath.is_file() {
                    if let Some(ext) = fpath.extension().and_then(|e| e.to_str()) {
                        let ext_lower = ext.to_lowercase();
                        if ["gif", "png", "jpg", "jpeg", "webp", "svg"].contains(&ext_lower.as_str()) {
                            let fname = fpath.file_name().and_then(|n| n.to_str()).unwrap_or("");
                            if fname.starts_with("screenshot_") || fname.starts_with("preview_") {
                                let path_str = fpath.to_string_lossy().to_string();
                                if !resolved_screenshots.contains(&path_str) {
                                    resolved_screenshots.push(path_str);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Load user config from SQLite
    let config_values = get_theme_config(db, &manifest.id).unwrap_or_default();

    // Read custom CSS content
    let css_content = manifest.css.as_ref().and_then(|css_name| {
        let css_path = path.join(css_name);
        fs::read_to_string(css_path).ok()
    });

    Some(ThemeInfo {
        manifest,
        is_active,
        is_builtin,
        resolved_icon,
        resolved_screenshots,
        config_values,
        css_content,
    })
}

pub fn list_themes(db: &Database) -> Result<Vec<ThemeInfo>, String> {
    let themes_dir = get_themes_dir();
    let _ = fs::create_dir_all(&themes_dir);

    let active_desktop_id = get_active_theme_id(db);
    let active_console_id = get_active_console_theme_id(db);
    let mut results = Vec::new();
    let mut has_active_desktop = false;
    let mut has_active_console = false;

    // 1. Built-in default Desktop theme from immutable app root
    let default_theme_dir = get_default_theme_dir(None);
    if let Some(def_info) = parse_theme_at_path(
        &default_theme_dir,
        true,
        &active_desktop_id,
        &active_console_id,
        db,
    ) {
        if def_info.is_active {
            has_active_desktop = true;
        }
        results.push(def_info);
    }

    // 2. Built-in default Console theme from immutable app root
    let console_default_dir = get_console_default_theme_dir(None);
    if let Some(console_info) = parse_theme_at_path(
        &console_default_dir,
        true,
        &active_desktop_id,
        &active_console_id,
        db,
    ) {
        if console_info.is_active {
            has_active_console = true;
        }
        results.push(console_info);
    }

    // 3. Custom/imported themes from user data folder
    if let Ok(entries) = fs::read_dir(&themes_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let folder_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                if folder_name == "default" || folder_name == "console-default" {
                    continue; // Skip any shadowing built-in themes in user data
                }
                if let Some(custom_info) = parse_theme_at_path(
                    &path,
                    false,
                    &active_desktop_id,
                    &active_console_id,
                    db,
                ) {
                    if custom_info.is_active {
                        if custom_info.manifest.mode == "console" {
                            has_active_console = true;
                        } else {
                            has_active_desktop = true;
                        }
                    }
                    results.push(custom_info);
                }
            }
        }
    }

    // Fallback: If selected custom theme was deleted or corrupted, mark built-in default active per mode
    if !has_active_desktop {
        if let Some(first_desktop) = results.iter_mut().find(|t| t.manifest.mode != "console") {
            first_desktop.is_active = true;
        }
    }
    if !has_active_console {
        if let Some(first_console) = results.iter_mut().find(|t| t.manifest.mode == "console") {
            first_console.is_active = true;
        }
    }

    // Sort: built-in defaults first, then alphabetically by name
    results.sort_by(|a, b| {
        let rank = |id: &str| match id {
            "default" => 0,
            "console-default" => 1,
            _ => 2,
        };
        rank(&a.manifest.id)
            .cmp(&rank(&b.manifest.id))
            .then_with(|| a.manifest.name.cmp(&b.manifest.name))
    });

    Ok(results)
}

pub fn get_deleted_theme_tombstones(db: &Database) -> Vec<crate::models::ExtensionTombstone> {
    if let Ok(Some(raw)) = db.get_setting("deleted_themes_tombstones") {
        if let Ok(list) = serde_json::from_str::<Vec<crate::models::ExtensionTombstone>>(&raw) {
            return list;
        }
    }
    Vec::new()
}

pub fn record_theme_tombstone(db: &Database, theme_id: &str, deleted_at: &str) {
    let mut list = get_deleted_theme_tombstones(db);
    if let Some(existing) = list.iter_mut().find(|t| t.id == theme_id) {
        if deleted_at > existing.deleted_at.as_str() {
            existing.deleted_at = deleted_at.to_string();
        }
    } else {
        list.push(crate::models::ExtensionTombstone {
            id: theme_id.to_string(),
            deleted_at: deleted_at.to_string(),
        });
    }
    if let Ok(json) = serde_json::to_string(&list) {
        let _ = db.set_setting("deleted_themes_tombstones", &json);
    }
}

pub fn clear_theme_tombstone(db: &Database, theme_id: &str) {
    let mut list = get_deleted_theme_tombstones(db);
    let prev_len = list.len();
    list.retain(|t| t.id != theme_id);
    if list.len() != prev_len {
        if let Ok(json) = serde_json::to_string(&list) {
            let _ = db.set_setting("deleted_themes_tombstones", &json);
        }
    }
}

pub fn get_active_theme_id(db: &Database) -> String {
    db.get_setting("active_theme_id")
        .ok()
        .flatten()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "default".to_string())
}

pub fn get_active_console_theme_id(db: &Database) -> String {
    db.get_setting("active_console_theme_id")
        .ok()
        .flatten()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "console-default".to_string())
}

pub fn set_active_theme_from_sync(db: &Database, theme_id: &str) -> Result<(), String> {
    db.set_setting("active_theme_id", theme_id)?;
    if let Ok(mut cfg) = db.get_app_config() {
        cfg.active_theme_id = Some(theme_id.to_string());
        let _ = db.save_app_config_from_sync(&cfg, "");
    }
    Ok(())
}

pub fn set_active_theme(db: &Database, theme_id: &str) -> Result<(), String> {
    let now_utc = chrono::Utc::now().to_rfc3339();
    db.set_setting("active_theme_id", theme_id)?;
    if let Ok(mut cfg) = db.get_app_config() {
        cfg.active_theme_id = Some(theme_id.to_string());
        let _ = db.save_app_config_from_sync(&cfg, &now_utc);
    } else {
        let _ = db.set_setting("ui_updated_at", &now_utc);
    }
    let _ = db.set_setting("extensions_updated_at", &now_utc);
    Ok(())
}

pub fn set_active_console_theme_from_sync(db: &Database, theme_id: &str) -> Result<(), String> {
    db.set_setting("active_console_theme_id", theme_id)?;
    if let Ok(mut cfg) = db.get_app_config() {
        cfg.active_console_theme_id = Some(theme_id.to_string());
        let _ = db.save_app_config_from_sync(&cfg, "");
    }
    Ok(())
}

pub fn set_active_console_theme(db: &Database, theme_id: &str) -> Result<(), String> {
    let now_utc = chrono::Utc::now().to_rfc3339();
    db.set_setting("active_console_theme_id", theme_id)?;
    if let Ok(mut cfg) = db.get_app_config() {
        cfg.active_console_theme_id = Some(theme_id.to_string());
        let _ = db.save_app_config_from_sync(&cfg, &now_utc);
    } else {
        let _ = db.set_setting("ui_updated_at", &now_utc);
    }
    let _ = db.set_setting("extensions_updated_at", &now_utc);
    Ok(())
}

pub fn get_theme_config(db: &Database, theme_id: &str) -> Result<HashMap<String, serde_json::Value>, String> {
    let key = format!("theme_config:{}", theme_id);
    if let Ok(Some(raw)) = db.get_setting(&key) {
        if let Ok(map) = serde_json::from_str::<HashMap<String, serde_json::Value>>(&raw) {
            return Ok(map);
        }
    }
    Ok(HashMap::new())
}

pub fn save_theme_config_from_sync(db: &Database, theme_id: &str, config_json: &str) -> Result<(), String> {
    let key = format!("theme_config:{}", theme_id);
    db.set_setting(&key, config_json)
}

pub fn save_theme_config(db: &Database, theme_id: &str, config_json: &str) -> Result<(), String> {
    let key = format!("theme_config:{}", theme_id);
    db.set_setting(&key, config_json)?;
    let now_utc = chrono::Utc::now().to_rfc3339();
    let _ = db.set_setting("extensions_updated_at", &now_utc);
    if theme_id == "default" {
        let _ = db.set_setting("ui_updated_at", &now_utc);
    }
    Ok(())
}

pub fn delete_theme_from_sync(
    db: &Database,
    theme_id: &str,
    deleted_at: &str,
    themes_dir_override: Option<&Path>,
) -> Result<(), String> {
    if theme_id == "default" || theme_id == "console-default" {
        return Ok(());
    }

    let themes_dir = themes_dir_override
        .map(|p| p.to_path_buf())
        .unwrap_or_else(get_themes_dir);
    let theme_dir = themes_dir.join(theme_id);
    if theme_dir.exists() {
        fs::remove_dir_all(&theme_dir).map_err(|e| format!("Failed to delete theme directory: {}", e))?;
    }

    let key = format!("theme_config:{}", theme_id);
    let _ = db.set_setting(&key, "{}");
    record_theme_tombstone(db, theme_id, deleted_at);

    if get_active_theme_id(db) == theme_id {
        set_active_theme_from_sync(db, "default")?;
    }
    if get_active_console_theme_id(db) == theme_id {
        set_active_console_theme_from_sync(db, "console-default")?;
    }

    Ok(())
}

pub fn delete_theme(db: &Database, theme_id: &str) -> Result<(), String> {
    if theme_id == "default" || theme_id == "console-default" {
        return Err("Cannot delete an official built-in OpenPlay theme.".to_string());
    }

    let now_utc = chrono::Utc::now().to_rfc3339();
    let themes_dir = get_themes_dir();
    let theme_dir = themes_dir.join(theme_id);
    if theme_dir.exists() {
        fs::remove_dir_all(&theme_dir).map_err(|e| format!("Failed to delete theme directory: {}", e))?;
    }

    // Clean up saved config
    let key = format!("theme_config:{}", theme_id);
    let _ = db.set_setting(&key, "{}");

    record_theme_tombstone(db, theme_id, &now_utc);
    let _ = db.set_setting("extensions_updated_at", &now_utc);

    // If active theme was deleted, fallback to built-in default
    if get_active_theme_id(db) == theme_id {
        set_active_theme(db, "default")?;
    }
    if get_active_console_theme_id(db) == theme_id {
        set_active_console_theme(db, "console-default")?;
    }

    Ok(())
}

pub fn get_theme_css(theme_id: &str) -> Result<String, String> {
    let theme_dir = if theme_id == "default" {
        get_default_theme_dir(None)
    } else if theme_id == "console-default" {
        get_console_default_theme_dir(None)
    } else {
        let custom = get_themes_dir().join(theme_id);
        if custom.exists() {
            custom
        } else {
            get_default_theme_dir(None)
        }
    };

    let manifest_path = theme_dir.join("theme.json");
    if !manifest_path.exists() {
        // Fallback: try built-in default theme
        let def_dir = get_default_theme_dir(None);
        let def_css = def_dir.join("theme.css");
        if def_css.exists() {
            return fs::read_to_string(&def_css).map_err(|e| e.to_string());
        }
        return Ok(String::new());
    }

    let manifest_content = fs::read_to_string(&manifest_path).map_err(|e| e.to_string())?;
    let manifest: ThemeManifest = serde_json::from_str(&manifest_content).map_err(|e| e.to_string())?;

    let css_filename = manifest.css.unwrap_or_else(|| "theme.css".to_string());
    let css_path = theme_dir.join(&css_filename);
    if css_path.exists() {
        fs::read_to_string(&css_path).map_err(|e| e.to_string())
    } else {
        // Fallback to default theme css if custom file is missing
        let def_dir = get_default_theme_dir(None);
        let def_css = def_dir.join("theme.css");
        if def_css.exists() {
            fs::read_to_string(&def_css).map_err(|e| e.to_string())
        } else {
            Ok(String::new())
        }
    }
}

pub fn extract_and_install_theme_zip_to(
    zip_path: &Path,
    dest_themes_dir: &Path,
) -> Result<(String, PathBuf, ThemeManifest), String> {
    if !zip_path.exists() {
        return Err("Selected theme zip file does not exist.".to_string());
    }

    fs::create_dir_all(dest_themes_dir).map_err(|e| format!("Failed to create themes folder: {}", e))?;

    let file = fs::File::open(zip_path).map_err(|e| format!("Failed to open zip file: {}", e))?;
    let mut archive = ZipArchive::new(file).map_err(|e| format!("Invalid zip archive: {}", e))?;

    let temp_import_id = uuid::Uuid::new_v4().to_string();
    let temp_dir = dest_themes_dir.join(format!(".temp_theme_{}", temp_import_id));
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

    // Locate theme.json: check root first, then single top-level directory if present
    let mut root_source = temp_dir.clone();
    let direct_manifest = temp_dir.join("theme.json");
    if !direct_manifest.exists() {
        if let Ok(entries) = fs::read_dir(&temp_dir) {
            let subdirs: Vec<_> = entries
                .flatten()
                .filter(|e| e.path().is_dir())
                .collect();
            if subdirs.len() == 1 {
                let candidate = subdirs[0].path();
                if candidate.join("theme.json").exists() {
                    root_source = candidate;
                }
            }
        }
    }

    let manifest_path = root_source.join("theme.json");
    if !manifest_path.exists() {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err("Theme package is invalid: 'theme.json' not found at root of zip.".to_string());
    }

    let manifest_raw = fs::read_to_string(&manifest_path).map_err(|e| {
        let _ = fs::remove_dir_all(&temp_dir);
        format!("Failed to read theme.json: {}", e)
    })?;

    let manifest: ThemeManifest = serde_json::from_str(&manifest_raw).map_err(|e| {
        let _ = fs::remove_dir_all(&temp_dir);
        format!("Failed to parse theme.json: {}. Please verify json formatting.", e)
    })?;

    // Validate ID
    let theme_id = manifest.id.trim().to_lowercase();
    if theme_id.is_empty() || theme_id == "default" || theme_id == "console-default" {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err("Invalid theme ID: ID cannot be empty, 'default', or 'console-default'.".to_string());
    }
    if !theme_id.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err("Theme ID may only contain lowercase alphanumeric letters, hyphens, and underscores.".to_string());
    }

    // Validate Name, Version, Author, Description
    if manifest.name.trim().is_empty() {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err("Theme manifest must have a non-empty 'name'.".to_string());
    }
    if manifest.version.trim().is_empty() {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err("Theme manifest must have a non-empty 'version'.".to_string());
    }
    if manifest.author.trim().is_empty() {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err("Theme manifest must have a non-empty 'author'.".to_string());
    }
    if manifest.description.trim().is_empty() {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err("Theme manifest must have a non-empty 'description'.".to_string());
    }

    // STRICT VALIDATION: Icon is mandatory and must exist on disk
    if manifest.icon.trim().is_empty() {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err("Theme manifest is missing mandatory 'icon' field.".to_string());
    }
    let icon_file = root_source.join(&manifest.icon);
    if !icon_file.exists() {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err(format!(
            "Theme icon file '{}' specified in theme.json was not found in the package.",
            manifest.icon
        ));
    }

    // STRICT VALIDATION: At least 3 screenshots required and must exist on disk
    if manifest.screenshots.len() < 3 {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err(format!(
            "Themes require at least 3 high-quality screenshots for the preview gallery. Found: {}.",
            manifest.screenshots.len()
        ));
    }
    for (idx, screen) in manifest.screenshots.iter().enumerate() {
        let screen_file = root_source.join(screen);
        if !screen_file.exists() {
            let _ = fs::remove_dir_all(&temp_dir);
            return Err(format!(
                "Screenshot #{}: '{}' specified in theme.json was not found in the package.",
                idx + 1,
                screen
            ));
        }
    }

    // Target destination
    let final_dest = dest_themes_dir.join(&theme_id);
    if final_dest.exists() {
        // Replace existing version
        fs::remove_dir_all(&final_dest).map_err(|e| format!("Failed to update existing theme: {}", e))?;
    }

    // Move root_source to final_dest
    if root_source == temp_dir {
        fs::rename(&temp_dir, &final_dest).map_err(|e| format!("Failed to move theme directory: {}", e))?;
    } else {
        fs::rename(&root_source, &final_dest).map_err(|e| format!("Failed to move theme directory: {}", e))?;
        let _ = fs::remove_dir_all(&temp_dir);
    }

    Ok((theme_id, final_dest, manifest))
}

pub fn install_theme_zip_from_sync(
    db: &Database,
    zip_path: &Path,
    themes_dir_override: Option<&Path>,
) -> Result<String, String> {
    let dest_dir = themes_dir_override
        .map(|p| p.to_path_buf())
        .unwrap_or_else(get_themes_dir);
    let (theme_id, _, _) = extract_and_install_theme_zip_to(zip_path, &dest_dir)?;
    clear_theme_tombstone(db, &theme_id);
    Ok(theme_id)
}

pub fn import_theme_zip(db: &Database, zip_path_str: &str) -> Result<ThemeInfo, String> {
    let zip_path = Path::new(zip_path_str);
    let themes_dir = get_themes_dir();
    let (theme_id, final_dest, manifest) = extract_and_install_theme_zip_to(zip_path, &themes_dir)?;

    clear_theme_tombstone(db, &theme_id);
    let now_utc = chrono::Utc::now().to_rfc3339();
    let _ = db.set_setting("extensions_updated_at", &now_utc);

    // Return ThemeInfo
    let is_active = if manifest.mode.trim().eq_ignore_ascii_case("console") {
        get_active_console_theme_id(db) == theme_id
    } else {
        get_active_theme_id(db) == theme_id
    };
    let resolved_icon = if final_dest.join(&manifest.icon).exists() {
        Some(final_dest.join(&manifest.icon).to_string_lossy().to_string())
    } else {
        None
    };
    let resolved_screenshots = manifest
        .screenshots
        .iter()
        .filter_map(|s| {
            let p = final_dest.join(s);
            if p.exists() {
                Some(p.to_string_lossy().to_string())
            } else {
                None
            }
        })
        .collect();
    let config_values = get_theme_config(db, &theme_id).unwrap_or_default();
    let css_content = manifest.css.as_ref().and_then(|css_name| {
        let css_path = final_dest.join(css_name);
        fs::read_to_string(css_path).ok()
    });

    Ok(ThemeInfo {
        manifest,
        is_active,
        is_builtin: false,
        resolved_icon,
        resolved_screenshots,
        config_values,
        css_content,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_seed_default_theme_bundles_all_assets_and_cleans_legacy_svgs() {
        // 1. Verify bundled source resources exist in src-tauri/resources/themes/default/
        let real_bundled_dir = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("themes")
            .join("default");
        for expected in [
            "theme.json",
            "theme.css",
            "icon.svg",
            "screenshot_1.svg",
            "screenshot_2.svg",
            "screenshot_3.svg",
            "screenshot_4.svg",
            "screenshot_5.svg",
            "screenshot_6.svg",
        ] {
            let p = real_bundled_dir.join(expected);
            assert!(p.is_file(), "Missing bundled default theme file: {:?}", p);
            assert!(
                fs::metadata(&p).unwrap().len() > 0,
                "Bundled default theme file is empty: {:?}",
                p
            );
        }

        // 2. Verify seed_default_theme_to copies every asset from resource_dir and removes legacy screenshot files
        let temp_root = std::env::temp_dir().join(format!(
            "openplay_theme_seed_test_{}",
            uuid::Uuid::new_v4()
        ));
        let mock_res_dir = temp_root.join("res");
        let mock_bundled = mock_res_dir.join("resources").join("themes").join("default");
        let target_themes_dir = temp_root.join("appdata_themes");
        let target_default_dir = target_themes_dir.join("default");

        fs::create_dir_all(&mock_bundled).unwrap();
        fs::create_dir_all(&target_default_dir).unwrap();

        // Pre-populate stale screenshots from older OpenPlay installs
        fs::write(target_default_dir.join("screenshot_1.gif"), b"legacy").unwrap();
        fs::write(target_default_dir.join("screenshot_2.jpg"), b"legacy").unwrap();
        fs::write(target_default_dir.join("screenshot_3.png"), b"legacy").unwrap();

        // Populate mock resource bundle
        for asset in [
            "theme.json",
            "theme.css",
            "icon.svg",
            "screenshot_1.svg",
            "screenshot_2.svg",
            "screenshot_3.svg",
            "screenshot_4.svg",
            "screenshot_5.svg",
            "screenshot_6.svg",
        ] {
            fs::copy(real_bundled_dir.join(asset), mock_bundled.join(asset)).unwrap();
        }

        seed_default_theme_to(&target_themes_dir, Some(&mock_res_dir)).unwrap();

        for expected in [
            "theme.json",
            "theme.css",
            "icon.svg",
            "screenshot_1.svg",
            "screenshot_2.svg",
            "screenshot_3.svg",
            "screenshot_4.svg",
            "screenshot_5.svg",
            "screenshot_6.svg",
        ] {
            assert!(
                target_default_dir.join(expected).is_file(),
                "Expected seeded file {} to exist",
                expected
            );
        }
        for legacy in ["screenshot_1.gif", "screenshot_2.jpg", "screenshot_3.png"] {
            assert!(
                !target_default_dir.join(legacy).exists(),
                "Expected legacy screenshot {} to be cleaned up",
                legacy
            );
        }

        let _ = fs::remove_dir_all(&temp_root);
    }

    #[test]
    fn test_dual_mode_console_theme_bundled_and_protected() {
        let console_dir = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("themes")
            .join("console-default");
        for expected in [
            "theme.json",
            "theme.css",
            "icon.svg",
            "screenshot_1.svg",
            "screenshot_2.svg",
            "screenshot_3.svg",
        ] {
            let p = console_dir.join(expected);
            assert!(p.is_file(), "Missing bundled console-default theme file: {:?}", p);
        }

        let temp_root = std::env::temp_dir().join(format!(
            "openplay_console_theme_test_{}",
            uuid::Uuid::new_v4()
        ));
        let db = Database::new_at_path(&temp_root.join("test.db")).unwrap();

        assert_eq!(get_active_theme_id(&db), "default");
        assert_eq!(get_active_console_theme_id(&db), "console-default");

        let themes = list_themes(&db).unwrap();
        let desktop_def = themes.iter().find(|t| t.manifest.id == "default");
        let console_def = themes.iter().find(|t| t.manifest.id == "console-default");
        assert!(desktop_def.is_some(), "Expected built-in default desktop theme");
        assert!(console_def.is_some(), "Expected built-in console-default theme");
        assert_eq!(desktop_def.unwrap().manifest.mode, "desktop");
        assert!(desktop_def.unwrap().is_active);
        assert_eq!(console_def.unwrap().manifest.mode, "console");
        assert!(console_def.unwrap().is_active);

        // Independent switching
        set_active_console_theme(&db, "custom-console-theme").unwrap();
        assert_eq!(get_active_console_theme_id(&db), "custom-console-theme");
        assert_eq!(get_active_theme_id(&db), "default");

        // Built-in protection
        assert!(delete_theme(&db, "console-default").is_err());

        let _ = fs::remove_dir_all(&temp_root);
    }
}
