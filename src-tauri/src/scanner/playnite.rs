use crate::models::{Game, GameLink};
use chrono::TimeZone;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use tauri::Emitter;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayniteGamePreview {
    pub id: String,
    pub title: String,
    pub source: String,
    pub is_installed: bool,
    pub playtime_seconds: u64,
    pub last_played: Option<String>,
    pub cover_image_filename: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayniteBackupSummary {
    pub zip_path: String,
    pub total_games: usize,
    pub installed_games: usize,
    pub uninstalled_games: usize,
    pub sources_found: Vec<String>,
    pub platforms_found: Vec<String>,
    pub total_artwork_files: usize,
    pub games: Vec<PlayniteGamePreview>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayniteImportOptions {
    pub zip_path: String,
    pub extract_artwork: bool,
    pub import_uninstalled: bool,
    pub import_playtime: bool,
    pub import_last_played: bool,
    pub import_notes: bool,
    pub import_ratings: bool,
    pub import_tags: bool,
    pub selected_game_ids: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayniteImportResult {
    pub total: usize,
    pub imported: usize,
    pub updated: usize,
    pub skipped: usize,
    pub artwork_extracted: usize,
    pub sources: Vec<String>,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
enum BsonValue {
    Double(f64),
    String(String),
    Document(HashMap<String, BsonValue>),
    Array(Vec<BsonValue>),
    Binary(u8, Vec<u8>),
    Uuid(String),
    Boolean(bool),
    DateTime(i64),
    Null,
    Int32(i32),
    Int64(i64),
}

#[allow(dead_code)]
impl BsonValue {
    fn as_str(&self) -> Option<&str> {
        match self {
            BsonValue::String(s) => Some(s.as_str()),
            BsonValue::Uuid(s) => Some(s.as_str()),
            _ => None,
        }
    }

    fn as_string(&self) -> Option<String> {
        match self {
            BsonValue::String(s) => Some(s.clone()),
            BsonValue::Uuid(s) => Some(s.clone()),
            _ => None,
        }
    }

    fn as_i64(&self) -> Option<i64> {
        match self {
            BsonValue::Int64(v) => Some(*v),
            BsonValue::Int32(v) => Some(*v as i64),
            BsonValue::Double(v) => Some(*v as i64),
            BsonValue::DateTime(v) => Some(*v),
            _ => None,
        }
    }

    fn as_date_string(&self) -> Option<String> {
        match self {
            BsonValue::DateTime(ms) if *ms > 0 => {
                chrono::Utc.timestamp_millis_opt(*ms).single().map(|dt| dt.format("%Y-%m-%d").to_string())
            }
            BsonValue::Int64(ms) if *ms > 0 => {
                chrono::Utc.timestamp_millis_opt(*ms).single().map(|dt| dt.format("%Y-%m-%d").to_string())
            }
            BsonValue::String(s) if !s.trim().is_empty() => {
                let trimmed = s.trim();
                if trimmed.len() >= 10 && trimmed.chars().nth(4) == Some('-') && trimmed.chars().nth(7) == Some('-') {
                    Some(trimmed[..10].to_string())
                } else {
                    Some(trimmed.to_string())
                }
            }
            _ => None,
        }
    }

    fn as_u32(&self) -> Option<u32> {
        match self {
            BsonValue::Int32(v) if *v >= 0 => Some(*v as u32),
            BsonValue::Int64(v) if *v >= 0 => Some(*v as u32),
            BsonValue::Double(v) if *v >= 0.0 => Some(*v as u32),
            _ => None,
        }
    }

    fn as_bool(&self) -> Option<bool> {
        match self {
            BsonValue::Boolean(b) => Some(*b),
            _ => None,
        }
    }

    fn as_array(&self) -> Option<&Vec<BsonValue>> {
        match self {
            BsonValue::Array(a) => Some(a),
            _ => None,
        }
    }

    fn as_document(&self) -> Option<&HashMap<String, BsonValue>> {
        match self {
            BsonValue::Document(d) => Some(d),
            _ => None,
        }
    }
}

pub struct PlayniteScanner;

impl PlayniteScanner {
    /// Recursively computes total byte size of a directory on disk, capped at 50,000 files to avoid hanging
    pub fn compute_folder_size(dir: &Path) -> Option<u64> {
        if !dir.is_dir() {
            return None;
        }
        let mut total = 0u64;
        let mut stack = vec![dir.to_path_buf()];
        let mut file_count = 0;
        while let Some(current) = stack.pop() {
            if let Ok(entries) = std::fs::read_dir(&current) {
                for entry in entries.flatten() {
                    if let Ok(file_type) = entry.file_type() {
                        if file_type.is_dir() {
                            stack.push(entry.path());
                        } else if file_type.is_file() {
                            if let Ok(meta) = entry.metadata() {
                                total += meta.len();
                                file_count += 1;
                                if file_count > 50_000 {
                                    return Some(total);
                                }
                            }
                        }
                    }
                }
            }
        }
        if total > 0 {
            Some(total)
        } else {
            None
        }
    }

    /// Auto-detects Playnite backup zip files in standard backup locations
    pub fn auto_detect_backups() -> Vec<String> {
        let mut candidates = Vec::new();

        // 1. Check T:\Backups\Playnite if on T: drive
        candidates.push(PathBuf::from(r"T:\Backups\Playnite"));

        // 2. Check %APPDATA%\Playnite\Backup and user profile
        if let Some(appdata) = dirs::data_dir() {
            candidates.push(appdata.join("Playnite").join("Backup"));
            candidates.push(appdata.join("Playnite"));
        }

        if let Some(user_home) = dirs::home_dir() {
            candidates.push(user_home.join("Backups").join("Playnite"));
            candidates.push(user_home.join("Documents").join("PlayniteBackups"));
        }

        let mut found_zips = Vec::new();
        for dir in candidates {
            if dir.exists() && dir.is_dir() {
                if let Ok(entries) = std::fs::read_dir(dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.is_file() {
                            if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                                if ext.eq_ignore_ascii_case("zip") {
                                    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                                        if name.to_lowercase().contains("playnite") || name.to_lowercase().contains("backup") {
                                            found_zips.push(path.to_string_lossy().to_string());
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Sort descending so the latest backup is first
        found_zips.sort();
        found_zips.reverse();
        found_zips
    }

    /// Fast summary scanner: reads metadata and counts games without extracting assets
    pub fn scan_playnite_backup_summary(zip_path: &str) -> Result<PlayniteBackupSummary, String> {
        let file = File::open(zip_path).map_err(|e| format!("Failed to open zip file '{}': {}", zip_path, e))?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Invalid zip archive: {}", e))?;

        let sources_map = Self::read_lookup_db(&mut archive, "library/sources.db");
        let platforms_map = Self::read_lookup_db(&mut archive, "library/platforms.db");

        let games_bytes = Self::read_zip_entry_bytes(&mut archive, "library/games.db")
            .ok_or_else(|| "Backup archive does not contain 'library/games.db'".to_string())?;

        let raw_docs = Self::extract_litedb_documents(&games_bytes);
        let mut total_games = 0;
        let mut installed_games = 0;
        let mut uninstalled_games = 0;
        let mut sources_set = std::collections::HashSet::new();
        let mut platforms_set = std::collections::HashSet::new();
        let mut game_previews: Vec<PlayniteGamePreview> = Vec::new();

        let mut seen_ids = std::collections::HashSet::new();
        for doc in raw_docs {
            if let Some(gid) = doc.get("_id").and_then(|v| v.as_string()) {
                if seen_ids.contains(&gid) {
                    continue;
                }
                let name = match doc.get("Name").and_then(|v| v.as_string()) {
                    Some(n) if !n.trim().is_empty() => n.trim().to_string(),
                    _ => continue,
                };

                // Skip completion statuses or empty stubs
                if name == "Not Played" || name == "Played" || name == "Playing" || name == "Completed" || name == "On Hold" || name == "Dropped" {
                    continue;
                }

                seen_ids.insert(gid.clone());
                total_games += 1;

                let is_installed = doc.get("IsInstalled").and_then(|v| v.as_bool()).unwrap_or(false);
                if is_installed {
                    installed_games += 1;
                } else {
                    uninstalled_games += 1;
                }

                let src_name = doc
                    .get("SourceId")
                    .and_then(|v| v.as_string())
                    .filter(|s| s != "00000000-0000-0000-0000-000000000000")
                    .and_then(|sid| sources_map.get(&sid).cloned())
                    .or_else(|| {
                        doc.get("PluginId").and_then(|v| v.as_string()).and_then(|pid| {
                            match pid.to_lowercase().as_str() {
                                "cb91aec9-6843-41f9-ab81-e8568377ccee" | "cb91dfc9-b977-43bf-8e70-55f46e410fad" => Some("Steam".to_string()),
                                "00000002-dbd1-46c6-b5d0-b1ba559d10e4" | "00000002-dbd1-46c6-b5d0-b1cb55d48107" => Some("Epic".to_string()),
                                "aebe8b7c-6dc3-4a66-af31-e7375c6b5e9e" => Some("GOG".to_string()),
                                "00000001-bb07-432e-8a63-ec9b05c21820" | "e3c26a3d-d695-4cb7-a769-5ff7612c7ded" => Some("Battle.net".to_string()),
                                "00000000-0000-0000-0000-000000000000" => Some("Local".to_string()),
                                _ => None,
                            }
                        })
                    })
                    .unwrap_or_else(|| "Local".to_string());
                sources_set.insert(src_name.clone());

                    if let Some(plat_ids) = doc.get("PlatformIds").and_then(|v| v.as_array()) {
                        for p in plat_ids {
                            if let Some(pid) = p.as_string() {
                                if let Some(pname) = platforms_map.get(&pid) {
                                    platforms_set.insert(pname.clone());
                                }
                            }
                        }
                    }

                    let playtime_sec = doc.get("Playtime").and_then(|v| v.as_i64()).unwrap_or(0).max(0) as u64;
                    let last_pl = doc
                        .get("LastActivity")
                        .and_then(|v| v.as_date_string());
                    let cover_fn = doc.get("CoverImage").and_then(|v| v.as_string());

                    game_previews.push(PlayniteGamePreview {
                        id: gid,
                        title: name,
                        source: src_name,
                        is_installed,
                        playtime_seconds: playtime_sec,
                        last_played: last_pl,
                        cover_image_filename: cover_fn,
                    });
            }
        }

        // Count artwork files (normalize backslashes)
        let mut artwork_count = 0;
        for i in 0..archive.len() {
            if let Ok(entry) = archive.by_index(i) {
                let name = entry.name().replace('\\', "/").to_lowercase();
                if name.starts_with("libraryfiles/") && (name.ends_with(".jpg") || name.ends_with(".png") || name.ends_with(".ico") || name.ends_with(".webp")) {
                    artwork_count += 1;
                }
            }
        }

        let mut sources_found: Vec<String> = sources_set.into_iter().collect();
        sources_found.sort();

        let mut platforms_found: Vec<String> = platforms_set.into_iter().collect();
        platforms_found.sort();

        game_previews.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));

        Ok(PlayniteBackupSummary {
            zip_path: zip_path.to_string(),
            total_games,
            installed_games,
            uninstalled_games,
            sources_found,
            platforms_found,
            total_artwork_files: artwork_count,
            games: game_previews,
        })
    }

    /// Full importer: reads all Playnite games, maps lookups, extracts artwork to disk, and returns OpenPlay games
    pub fn parse_playnite_games(
        options: &PlayniteImportOptions,
        artwork_dest_dir: &Path,
        app_handle: Option<&tauri::AppHandle>,
    ) -> Result<(Vec<Game>, usize), String> {
        let file = File::open(&options.zip_path).map_err(|e| format!("Failed to open zip file '{}': {}", options.zip_path, e))?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Invalid zip archive: {}", e))?;

        let selected_set: Option<std::collections::HashSet<String>> = options
            .selected_game_ids
            .as_ref()
            .map(|ids| ids.iter().cloned().collect());

        // 1. Read lookup databases
        let genres_map = Self::read_lookup_db(&mut archive, "library/genres.db");
        let companies_map = Self::read_lookup_db(&mut archive, "library/companies.db");
        let platforms_map = Self::read_lookup_db(&mut archive, "library/platforms.db");
        let sources_map = Self::read_lookup_db(&mut archive, "library/sources.db");
        let tags_map = Self::read_lookup_db(&mut archive, "library/tags.db");
        let features_map = Self::read_lookup_db(&mut archive, "library/features.db");
        let categories_map = Self::read_lookup_db(&mut archive, "library/categories.db");
        let series_map = Self::read_lookup_db(&mut archive, "library/series.db");
        let ageratings_map = Self::read_lookup_db(&mut archive, "library/ageratings.db");
        let completion_map = Self::read_lookup_db(&mut archive, "library/completionstatuses.db");

        // 2. Read games database
        let games_bytes = Self::read_zip_entry_bytes(&mut archive, "library/games.db")
            .ok_or_else(|| "Backup archive does not contain 'library/games.db'".to_string())?;

        let raw_docs = Self::extract_litedb_documents(&games_bytes);

        // Pre-build index of artwork files in the zip for O(1) case-insensitive lookup
        let mut zip_entries_map: HashMap<String, usize> = HashMap::new();
        for i in 0..archive.len() {
            if let Ok(entry) = archive.by_index(i) {
                let norm = entry.name().replace('\\', "/").to_lowercase();
                zip_entries_map.insert(norm, i);
            }
        }

        if options.extract_artwork && !artwork_dest_dir.exists() {
            let _ = std::fs::create_dir_all(artwork_dest_dir);
        }

        let mut games: Vec<Game> = Vec::new();
        let mut seen_ids = std::collections::HashSet::new();
        let mut artwork_extracted = 0;

        let total_docs = raw_docs.len();
        for (doc_idx, doc) in raw_docs.into_iter().enumerate() {
            let gid = match doc.get("_id").and_then(|v| v.as_string()) {
                Some(id) => id,
                None => continue,
            };

            if seen_ids.contains(&gid) {
                continue;
            }

            if let Some(ref set) = selected_set {
                if !set.contains(&gid) {
                    continue;
                }
            }

            let name = match doc.get("Name").and_then(|v| v.as_string()) {
                Some(n) if !n.trim().is_empty() => n.trim().to_string(),
                _ => continue,
            };

            // Skip completion statuses or empty stubs
            if name == "Not Played" || name == "Played" || name == "Playing" || name == "Completed" || name == "On Hold" || name == "Dropped" {
                continue;
            }

            seen_ids.insert(gid.clone());

            let is_installed = doc.get("IsInstalled").and_then(|v| v.as_bool()).unwrap_or(false);
            if !options.import_uninstalled && !is_installed {
                continue;
            }

            let sorting_title = doc.get("SortingName").and_then(|v| v.as_string()).filter(|s| !s.trim().is_empty());
            let source_id = doc.get("GameId").and_then(|v| v.as_string()).filter(|s| !s.trim().is_empty());

            // Source mapping: map via sources.db GUID or fallback
            let source = doc
                .get("SourceId")
                .and_then(|v| v.as_string())
                .filter(|s| s != "00000000-0000-0000-0000-000000000000")
                .and_then(|sid| sources_map.get(&sid).cloned())
                .or_else(|| {
                    doc.get("PluginId").and_then(|v| v.as_string()).and_then(|pid| {
                        match pid.to_lowercase().as_str() {
                            "cb91aec9-6843-41f9-ab81-e8568377ccee" | "cb91dfc9-b977-43bf-8e70-55f46e410fad" => Some("Steam".to_string()),
                            "00000002-dbd1-46c6-b5d0-b1ba559d10e4" | "00000002-dbd1-46c6-b5d0-b1cb55d48107" => Some("Epic".to_string()),
                            "aebe8b7c-6dc3-4a66-af31-e7375c6b5e9e" => Some("GOG".to_string()),
                            "00000001-bb07-432e-8a63-ec9b05c21820" | "e3c26a3d-d695-4cb7-a769-5ff7612c7ded" => Some("Battle.net".to_string()),
                            "00000000-0000-0000-0000-000000000000" => Some("Local".to_string()),
                            _ => None,
                        }
                    })
                })
                .unwrap_or_else(|| "Local".to_string());

            let install_directory = doc.get("InstallDirectory").and_then(|v| v.as_string()).filter(|s| !s.trim().is_empty());

            // Executable path & launch arguments from GameActions
            let mut executable_path = None;
            let mut launch_arguments = None;
            if let Some(actions) = doc.get("GameActions").and_then(|v| v.as_array()) {
                for act in actions {
                    if let Some(adoc) = act.as_document() {
                        let is_play = adoc.get("IsPlayAction").and_then(|v| v.as_bool()).unwrap_or(true);
                        if is_play {
                            if let Some(raw_path) = adoc.get("Path").and_then(|v| v.as_string()) {
                                let mut p = raw_path.trim().to_string();
                                if let Some(ref inst_dir) = install_directory {
                                    p = p.replace("{InstallDir}", inst_dir).replace("{installDir}", inst_dir);
                                }
                                if !p.is_empty() {
                                    executable_path = Some(p);
                                }
                            }
                            if let Some(args) = adoc.get("Arguments").and_then(|v| v.as_string()) {
                                let a = args.trim().to_string();
                                if !a.is_empty() {
                                    launch_arguments = Some(a);
                                }
                            }
                            if executable_path.is_some() {
                                break;
                            }
                        }
                    }
                }
            }
            let is_favorite = doc.get("Favorite").and_then(|v| v.as_bool()).unwrap_or(false);
            let description = doc.get("Description").and_then(|v| v.as_string()).filter(|s| !s.trim().is_empty());
            let notes = if options.import_notes {
                doc.get("Notes").and_then(|v| v.as_string()).filter(|s| !s.trim().is_empty())
            } else {
                None
            };

            // Playtime and Playcount
            let playtime_seconds = if options.import_playtime {
                doc.get("Playtime").and_then(|v| v.as_i64()).unwrap_or(0).max(0) as u64
            } else {
                0
            };
            let play_count = if options.import_playtime {
                doc.get("PlayCount").and_then(|v| v.as_u32())
            } else {
                None
            };

            // Scores
            let critic_score = if options.import_ratings { doc.get("CriticScore").and_then(|v| v.as_u32()) } else { None };
            let community_score = if options.import_ratings { doc.get("CommunityScore").and_then(|v| v.as_u32()) } else { None };
            let user_rating = if options.import_ratings { doc.get("UserScore").and_then(|v| v.as_u32()) } else { None };

            // Dates
            let release_date = doc.get("ReleaseDate").and_then(|v| v.as_string()).filter(|s| !s.trim().is_empty());

            let date_added = doc
                .get("Added")
                .and_then(|v| v.as_date_string())
                .or_else(|| Some(chrono::Local::now().format("%Y-%m-%d").to_string()));

            let last_played = if options.import_last_played {
                doc.get("LastActivity").and_then(|v| v.as_date_string())
            } else {
                None
            };

            // Completion status
            let completion_status = doc
                .get("CompletionStatus")
                .and_then(|v| v.as_document())
                .and_then(|d| d.get("Name"))
                .and_then(|v| v.as_string())
                .or_else(|| {
                    doc.get("CompletionStatusId")
                        .and_then(|v| v.as_string())
                        .and_then(|cid| completion_map.get(&cid).cloned())
                })
                .or_else(|| {
                    if playtime_seconds > 0 {
                        Some("Played".to_string())
                    } else {
                        Some("Not Played".to_string())
                    }
                });

            // Genres
            let mut genres = Vec::new();
            if options.import_tags {
                if let Some(arr) = doc.get("GenreIds").and_then(|v| v.as_array()) {
                    for item in arr {
                        if let Some(id_str) = item.as_string() {
                            if let Some(name) = genres_map.get(&id_str) {
                                genres.push(name.clone());
                            }
                        }
                    }
                }
            }

            // Developers & Publishers
            let mut developer = None;
            if let Some(arr) = doc.get("DeveloperIds").and_then(|v| v.as_array()) {
                let devs: Vec<String> = arr.iter().filter_map(|i| i.as_string()).filter_map(|id| companies_map.get(&id).cloned()).collect();
                if !devs.is_empty() {
                    developer = Some(devs.join(", "));
                }
            }

            let mut publisher = None;
            if let Some(arr) = doc.get("PublisherIds").and_then(|v| v.as_array()) {
                let pubs: Vec<String> = arr.iter().filter_map(|i| i.as_string()).filter_map(|id| companies_map.get(&id).cloned()).collect();
                if !pubs.is_empty() {
                    publisher = Some(pubs.join(", "));
                }
            }

            // Platforms
            let mut platforms = Vec::new();
            if let Some(arr) = doc.get("PlatformIds").and_then(|v| v.as_array()) {
                for item in arr {
                    if let Some(id_str) = item.as_string() {
                        if let Some(pname) = platforms_map.get(&id_str) {
                            platforms.push(pname.clone());
                        }
                    }
                }
            }
            if platforms.is_empty() {
                platforms.push("Windows".to_string());
            }

            // Tags
            let mut tags = Vec::new();
            if options.import_tags {
                if let Some(arr) = doc.get("TagIds").and_then(|v| v.as_array()) {
                    for item in arr {
                        if let Some(id_str) = item.as_string() {
                            if let Some(tname) = tags_map.get(&id_str) {
                                tags.push(tname.clone());
                            }
                        }
                    }
                }
            }

            // Features
            let mut features = Vec::new();
            if options.import_tags {
                if let Some(arr) = doc.get("FeatureIds").and_then(|v| v.as_array()) {
                    for item in arr {
                        if let Some(id_str) = item.as_string() {
                            if let Some(fname) = features_map.get(&id_str) {
                                features.push(fname.clone());
                            }
                        }
                    }
                }
            }

            // Categories
            let mut categories = Vec::new();
            if options.import_tags {
                if let Some(arr) = doc.get("CategoryIds").and_then(|v| v.as_array()) {
                    for item in arr {
                        if let Some(id_str) = item.as_string() {
                            if let Some(cname) = categories_map.get(&id_str) {
                                categories.push(cname.clone());
                            }
                        }
                    }
                }
            }

            // Series
            let mut series = None;
            if let Some(arr) = doc.get("SeriesIds").and_then(|v| v.as_array()) {
                if let Some(first_id) = arr.first().and_then(|i| i.as_string()) {
                    series = series_map.get(&first_id).cloned();
                }
            }

            // Age Rating
            let mut age_rating = None;
            if let Some(arr) = doc.get("AgeRatingIds").and_then(|v| v.as_array()) {
                if let Some(first_id) = arr.first().and_then(|i| i.as_string()) {
                    age_rating = ageratings_map.get(&first_id).cloned();
                }
            }

            // Links
            let mut links = Vec::new();
            if let Some(arr) = doc.get("Links").and_then(|v| v.as_array()) {
                for item in arr {
                    if let Some(ldoc) = item.as_document() {
                        let ltitle = ldoc.get("Name").and_then(|v| v.as_string()).unwrap_or_else(|| "Web Link".to_string());
                        let lurl = ldoc.get("Url").and_then(|v| v.as_string()).unwrap_or_default();
                        if !lurl.is_empty() {
                            links.push(GameLink {
                                title: ltitle,
                                url: lurl,
                            });
                        }
                    }
                }
            }

            // Artwork Extraction
            let mut cover_image = None;
            let mut background_image = None;
            let mut icon_image = None;

            if options.extract_artwork {
                if let Some(cov_rel) = doc.get("CoverImage").and_then(|v| v.as_string()) {
                    if let Some(extracted_path) = Self::extract_artwork_file(&mut archive, &zip_entries_map, &cov_rel, artwork_dest_dir, &gid, "cover") {
                        cover_image = Some(extracted_path);
                        artwork_extracted += 1;
                    }
                }

                if let Some(bg_rel) = doc.get("BackgroundImage").and_then(|v| v.as_string()) {
                    if let Some(extracted_path) = Self::extract_artwork_file(&mut archive, &zip_entries_map, &bg_rel, artwork_dest_dir, &gid, "background") {
                        background_image = Some(extracted_path);
                        artwork_extracted += 1;
                    }
                }

                if let Some(icon_rel) = doc.get("Icon").and_then(|v| v.as_string()) {
                    if let Some(extracted_path) = Self::extract_artwork_file(&mut archive, &zip_entries_map, &icon_rel, artwork_dest_dir, &gid, "icon") {
                        icon_image = Some(extracted_path);
                        artwork_extracted += 1;
                    }
                }
            }

            // Size on disk: check InstallSize in Playnite doc first, then check directory or executable
            let mut size_on_disk = doc
                .get("InstallSize")
                .and_then(|v| v.as_i64())
                .filter(|s| *s > 0)
                .map(|s| s as u64);

            if size_on_disk.is_none() {
                if let Some(ref inst_dir) = install_directory {
                    let p = Path::new(inst_dir);
                    if p.is_dir() {
                        size_on_disk = Self::compute_folder_size(p);
                    }
                }
            }

            if size_on_disk.is_none() {
                if let Some(ref exe) = executable_path {
                    let p = Path::new(exe);
                    if p.is_file() {
                        size_on_disk = std::fs::metadata(p).map(|m| m.len()).ok();
                    }
                }
            }

            // Unique ID in OpenPlay: "playnite_{guid}"
            let openplay_id = format!("playnite_{}", gid.replace('-', ""));

            games.push(Game {
                id: openplay_id,
                title: name,
                sorting_title,
                source,
                source_id,
                install_directory,
                executable_path,
                launch_arguments,
                is_installed,
                is_favorite,
                cover_image,
                background_image,
                logo_image: None,
                icon_image,
                developer,
                publisher,
                release_date,
                genres,
                features,
                platforms,
                community_score,
                critic_score,
                user_rating,
                playtime_seconds,
                last_played,
                date_added,
                completion_status,
                description,
                notes,
                links,
                screenshots: Vec::new(),
                trailers: Vec::new(),
                age_rating,
                series,
                hltb_main: None,
                hltb_extra: None,
                hltb_completionist: None,
                size_on_disk,
                tags,
                categories,
                region: None,
                play_count,
            });

            if let Some(handle) = app_handle {
                if doc_idx % 25 == 0 || doc_idx == total_docs - 1 {
                    let _ = handle.emit("playnite-import-progress", serde_json::json!({
                        "current": doc_idx + 1,
                        "total": total_docs,
                        "gamesFound": games.len(),
                        "artworkExtracted": artwork_extracted
                    }));
                }
            }
        }

        Ok((games, artwork_extracted))
    }

    /// Extracts a single artwork image from the zip archive to disk
    fn extract_artwork_file(
        archive: &mut zip::ZipArchive<File>,
        zip_entries_map: &HashMap<String, usize>,
        rel_path: &str,
        dest_dir: &Path,
        game_id: &str,
        kind: &str,
    ) -> Option<String> {
        let norm_name = rel_path.replace('\\', "/").trim_start_matches('/').to_lowercase();
        // Check "libraryfiles/{rel}" or "{rel}"
        let candidate_a = format!("libraryfiles/{}", norm_name);
        let candidate_b = norm_name.clone();

        let zip_idx = zip_entries_map.get(&candidate_a).or_else(|| zip_entries_map.get(&candidate_b)).copied()?;

        let mut entry = archive.by_index(zip_idx).ok()?;
        let ext = Path::new(&norm_name).extension().and_then(|e| e.to_str()).unwrap_or("jpg");

        let dest_filename = format!("{}_{}.{}", game_id, kind, ext);
        let dest_path = dest_dir.join(dest_filename);

        let mut out_file = File::create(&dest_path).ok()?;
        std::io::copy(&mut entry, &mut out_file).ok()?;

        Some(dest_path.to_string_lossy().to_string())
    }

    /// Reads an entire entry from the zip into memory as a byte vector
    fn read_zip_entry_bytes(archive: &mut zip::ZipArchive<File>, entry_name: &str) -> Option<Vec<u8>> {
        // 1. Direct match
        if let Ok(mut entry) = archive.by_name(entry_name) {
            let mut buf = Vec::with_capacity(entry.size() as usize);
            if entry.read_to_end(&mut buf).is_ok() {
                return Some(buf);
            }
        }
        // 2. Windows backslash match (e.g. library\games.db)
        let backslash_name = entry_name.replace('/', "\\");
        if let Ok(mut entry) = archive.by_name(&backslash_name) {
            let mut buf = Vec::with_capacity(entry.size() as usize);
            if entry.read_to_end(&mut buf).is_ok() {
                return Some(buf);
            }
        }
        // 3. Unix forward slash match (e.g. library/games.db)
        let forward_name = entry_name.replace('\\', "/");
        if let Ok(mut entry) = archive.by_name(&forward_name) {
            let mut buf = Vec::with_capacity(entry.size() as usize);
            if entry.read_to_end(&mut buf).is_ok() {
                return Some(buf);
            }
        }
        // 4. Case-insensitive normalized scan across all zip entries
        let target_norm = entry_name.replace('\\', "/").to_lowercase();
        for i in 0..archive.len() {
            if let Ok(mut entry) = archive.by_index(i) {
                if entry.name().replace('\\', "/").to_lowercase() == target_norm {
                    let mut buf = Vec::with_capacity(entry.size() as usize);
                    if entry.read_to_end(&mut buf).is_ok() {
                        return Some(buf);
                    }
                }
            }
        }
        None
    }

    /// Reads a Playnite lookup database (`library/*.db`) and returns a map of GUID -> Name
    fn read_lookup_db(archive: &mut zip::ZipArchive<File>, db_name: &str) -> HashMap<String, String> {
        let mut map = HashMap::new();
        if let Some(bytes) = Self::read_zip_entry_bytes(archive, db_name) {
            let docs = Self::extract_litedb_documents(&bytes);
            for doc in docs {
                if let (Some(id_str), Some(name)) = (
                    doc.get("_id").and_then(|v| v.as_string()),
                    doc.get("Name").and_then(|v| v.as_string()),
                ) {
                    if !name.trim().is_empty() {
                        map.insert(id_str, name.trim().to_string());
                    }
                }
            }
        }
        map
    }

    /// Extracts all BSON documents from a LiteDB file buffer.
    /// Handles LiteDB v4 page architecture (DataPages and chained ExtendPages), with fallback to pattern scan.
    fn extract_litedb_documents(raw: &[u8]) -> Vec<HashMap<String, BsonValue>> {
        let page_size = 4096;
        if raw.len() >= page_size && raw.len() % page_size == 0 {
            let page_count = raw.len() / page_size;
            let mut extend_pages: HashMap<u32, Vec<u8>> = HashMap::new();
            let mut extend_next: HashMap<u32, u32> = HashMap::new();

            // 1. Index all ExtendPages (PageType = 5)
            for p in 0..page_count {
                let offset = p * page_size;
                if offset + 25 > raw.len() {
                    break;
                }
                let page_id = u32::from_le_bytes([raw[offset], raw[offset + 1], raw[offset + 2], raw[offset + 3]]);
                let page_type = raw[offset + 4];
                let next_page_id = u32::from_le_bytes([raw[offset + 9], raw[offset + 10], raw[offset + 11], raw[offset + 12]]);
                let item_count = u16::from_le_bytes([raw[offset + 13], raw[offset + 14]]) as usize;

                if page_type == 5 {
                    let data_len = item_count.min(page_size - 25);
                    let data = raw[offset + 25..offset + 25 + data_len].to_vec();
                    extend_pages.insert(page_id, data);
                    extend_next.insert(page_id, next_page_id);
                }
            }

            // 2. Read all DataPages (PageType = 4)
            let mut docs = Vec::new();
            for p in 0..page_count {
                let offset = p * page_size;
                if offset + 25 > raw.len() {
                    break;
                }
                let page_type = raw[offset + 4];
                let item_count = u16::from_le_bytes([raw[offset + 13], raw[offset + 14]]) as usize;

                if page_type == 4 {
                    let mut pos = offset + 25;
                    for _ in 0..item_count {
                        if pos + 8 > offset + page_size {
                            break;
                        }
                        let extend_page_id = u32::from_le_bytes([raw[pos + 2], raw[pos + 3], raw[pos + 4], raw[pos + 5]]);
                        let data_len = u16::from_le_bytes([raw[pos + 6], raw[pos + 7]]) as usize;
                        pos += 8;

                        if pos + data_len > offset + page_size {
                            break;
                        }
                        let block_data = &raw[pos..pos + data_len];
                        pos += data_len;

                        let doc_bytes = if extend_page_id == u32::MAX || extend_page_id == 0 {
                            block_data.to_vec()
                        } else {
                            let mut full = Vec::new();
                            let mut cur = extend_page_id;
                            let mut depth = 0;
                            while cur != u32::MAX && depth < 500 {
                                if let Some(chunk) = extend_pages.get(&cur) {
                                    full.extend_from_slice(chunk);
                                    cur = extend_next.get(&cur).copied().unwrap_or(u32::MAX);
                                    depth += 1;
                                } else {
                                    break;
                                }
                            }
                            full
                        };

                        if doc_bytes.len() >= 5 {
                            let doc_len = u32::from_le_bytes([doc_bytes[0], doc_bytes[1], doc_bytes[2], doc_bytes[3]]) as usize;
                            if doc_len >= 5 && doc_len <= doc_bytes.len() && doc_bytes[doc_len - 1] == 0 {
                                if let Some((parsed, _)) = Self::parse_bson_doc(&doc_bytes[..doc_len]) {
                                    docs.push(parsed);
                                }
                            }
                        }
                    }
                }
            }

            if !docs.is_empty() {
                return docs;
            }
        }

        // Fallback linear pattern scan (for standalone/raw dumps)
        let mut docs = Vec::new();
        let pattern = b"\x05_id\x00";
        let mut cursor = 0;

        while cursor + pattern.len() <= raw.len() {
            if let Some(pos) = raw[cursor..].windows(pattern.len()).position(|w| w == pattern) {
                let match_idx = cursor + pos;
                if match_idx >= 4 {
                    let doc_start = match_idx - 4;
                    let doc_len = u32::from_le_bytes([
                        raw[doc_start],
                        raw[doc_start + 1],
                        raw[doc_start + 2],
                        raw[doc_start + 3],
                    ]) as usize;

                    if doc_len >= 20 && doc_len <= 500_000 && doc_start + doc_len <= raw.len() {
                        let doc_slice = &raw[doc_start..doc_start + doc_len];
                        if doc_slice[doc_len - 1] == 0 {
                            if let Some((parsed, _)) = Self::parse_bson_doc(doc_slice) {
                                docs.push(parsed);
                            }
                        }
                    }
                }
                cursor = match_idx + pattern.len();
            } else {
                break;
            }
        }

        docs
    }

    /// Internal recursive BSON parser conforming to the standard BSON 1.1 specification
    fn parse_bson_doc(b: &[u8]) -> Option<(HashMap<String, BsonValue>, usize)> {
        if b.len() < 5 {
            return None;
        }

        let doc_len = u32::from_le_bytes([b[0], b[1], b[2], b[3]]) as usize;
        if doc_len > b.len() || doc_len < 5 || b[doc_len - 1] != 0 {
            return None;
        }

        let mut res = HashMap::new();
        let mut pos = 4;

        while pos < doc_len - 1 {
            let elem_type = b[pos];
            pos += 1;

            // Read cstring element name
            let name_start = pos;
            while pos < doc_len && b[pos] != 0 {
                pos += 1;
            }
            if pos >= doc_len {
                break;
            }
            let name = String::from_utf8_lossy(&b[name_start..pos]).to_string();
            pos += 1; // Skip null terminator

            match elem_type {
                0x01 => {
                    // Double (8 bytes)
                    if pos + 8 > doc_len { break; }
                    let val = f64::from_le_bytes([
                        b[pos], b[pos + 1], b[pos + 2], b[pos + 3],
                        b[pos + 4], b[pos + 5], b[pos + 6], b[pos + 7],
                    ]);
                    res.insert(name, BsonValue::Double(val));
                    pos += 8;
                }
                0x02 => {
                    // String (4 bytes length + UTF-8 + null)
                    if pos + 4 > doc_len { break; }
                    let slen = u32::from_le_bytes([b[pos], b[pos + 1], b[pos + 2], b[pos + 3]]) as usize;
                    pos += 4;
                    if pos + slen > doc_len || slen == 0 { break; }
                    let val = String::from_utf8_lossy(&b[pos..pos + slen - 1]).to_string();
                    res.insert(name, BsonValue::String(val));
                    pos += slen;
                }
                0x03 => {
                    // Embedded document
                    if let Some((subdoc, sublen)) = Self::parse_bson_doc(&b[pos..]) {
                        res.insert(name, BsonValue::Document(subdoc));
                        pos += sublen;
                    } else {
                        break;
                    }
                }
                0x04 => {
                    // Array (stored as a document with numeric keys)
                    if let Some((arr_doc, arr_len)) = Self::parse_bson_doc(&b[pos..]) {
                        let mut arr_items: Vec<(usize, BsonValue)> = arr_doc
                            .into_iter()
                            .filter_map(|(k, v)| k.parse::<usize>().ok().map(|idx| (idx, v)))
                            .collect();
                        arr_items.sort_by_key(|(idx, _)| *idx);
                        res.insert(name, BsonValue::Array(arr_items.into_iter().map(|(_, v)| v).collect()));
                        pos += arr_len;
                    } else {
                        break;
                    }
                }
                0x05 => {
                    // Binary
                    if pos + 5 > doc_len { break; }
                    let blen = u32::from_le_bytes([b[pos], b[pos + 1], b[pos + 2], b[pos + 3]]) as usize;
                    let subtype = b[pos + 4];
                    pos += 5;
                    if pos + blen > doc_len { break; }
                    let bin_slice = &b[pos..pos + blen];

                    if (subtype == 0x03 || subtype == 0x04) && blen == 16 {
                        // UUID (LiteDB stores GUID in little-endian byte ordering)
                        let guid = uuid::Uuid::from_slice_le(bin_slice).unwrap_or_else(|_| uuid::Uuid::nil());
                        res.insert(name, BsonValue::Uuid(guid.to_string()));
                    } else {
                        res.insert(name, BsonValue::Binary(subtype, bin_slice.to_vec()));
                    }
                    pos += blen;
                }
                0x08 => {
                    // Boolean
                    if pos >= doc_len { break; }
                    res.insert(name, BsonValue::Boolean(b[pos] != 0));
                    pos += 1;
                }
                0x09 => {
                    // UTC datetime (int64 milliseconds)
                    if pos + 8 > doc_len { break; }
                    let dt = i64::from_le_bytes([
                        b[pos], b[pos + 1], b[pos + 2], b[pos + 3],
                        b[pos + 4], b[pos + 5], b[pos + 6], b[pos + 7],
                    ]);
                    res.insert(name, BsonValue::DateTime(dt));
                    pos += 8;
                }
                0x0A => {
                    // Null
                    res.insert(name, BsonValue::Null);
                }
                0x10 => {
                    // 32-bit integer
                    if pos + 4 > doc_len { break; }
                    let val = i32::from_le_bytes([b[pos], b[pos + 1], b[pos + 2], b[pos + 3]]);
                    res.insert(name, BsonValue::Int32(val));
                    pos += 4;
                }
                0x12 => {
                    // 64-bit integer
                    if pos + 8 > doc_len { break; }
                    let val = i64::from_le_bytes([
                        b[pos], b[pos + 1], b[pos + 2], b[pos + 3],
                        b[pos + 4], b[pos + 5], b[pos + 6], b[pos + 7],
                    ]);
                    res.insert(name, BsonValue::Int64(val));
                    pos += 8;
                }
                _ => {
                    // Unknown or unsupported BSON type, stop parsing this document
                    break;
                }
            }
        }

        Some((res, doc_len))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_real_playnite_backup() {
        let zip_path = r"T:\Backups\Playnite\PlayniteBackup-2026-10-17-11-26-35.zip";
        if !std::path::Path::new(zip_path).exists() {
            return;
        }

        let summary = PlayniteScanner::scan_playnite_backup_summary(zip_path).expect("Failed to scan summary");
        assert!(summary.total_games > 500, "Expected >500 games, found {}", summary.total_games);

        let options = PlayniteImportOptions {
            zip_path: zip_path.to_string(),
            extract_artwork: false,
            import_uninstalled: true,
            import_playtime: true,
            import_last_played: true,
            import_notes: true,
            import_ratings: true,
            import_tags: true,
            selected_game_ids: None,
        };

        let temp_art = std::env::temp_dir().join("openplay_test_art");
        let (games, _) = PlayniteScanner::parse_playnite_games(&options, &temp_art, None).expect("Failed to parse games");

        let with_date_added = games.iter().filter(|g| g.date_added.is_some()).count();
        let with_last_played = games.iter().filter(|g| g.last_played.is_some()).count();
        let with_size = games.iter().filter(|g| g.size_on_disk.is_some()).count();

        println!("Total parsed games: {}", games.len());
        println!("Games with date_added: {}/{}", with_date_added, games.len());
        println!("Games with last_played: {}/{}", with_last_played, games.len());
        println!("Games with size_on_disk: {}/{}", with_size, games.len());

        assert_eq!(with_date_added, games.len(), "All games should have date_added populated");
        assert!(with_last_played > 100, "Games with playtime should have last_played populated");
        assert!(with_size > 100, "Games with InstallSize should have size_on_disk populated");

        // Verify a specific game like Overcooked! 2
        let overcooked = games.iter().find(|g| g.title == "Overcooked! 2");
        assert!(overcooked.is_some(), "Overcooked! 2 should be present");
        let oc = overcooked.unwrap();
        assert_eq!(oc.last_played.as_deref(), Some("2024-09-27"));
        assert_eq!(oc.date_added.as_deref(), Some("2023-11-26"));
        assert_eq!(oc.size_on_disk, Some(8547905536));
    }
}
