use crate::models::{
    Achievement, AppConfig, BackupInfo, ConfiguredConsole, EmulatorProfile, Game, GameAchievementSummary, GameLink, GameSaveConfig, GameTrailer, HunterProfile,
    LibraryIntegration, SaveLocationCacheEntry, SaveLocationRule, TombstoneRecord,
};
use rusqlite::{params, Connection, Result};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new() -> Result<Self, String> {
        if let Ok(path) = std::env::var("OPENPLAY_DB_PATH") {
            return Self::new_at_path(Path::new(&path));
        }

        let db_dir = dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("OpenPlay");

        fs::create_dir_all(&db_dir).map_err(|e| e.to_string())?;
        let db_path = db_dir.join("openplay.db");
        Self::new_at_path(&db_path)
    }

    pub fn new_at_path(db_path: &Path) -> Result<Self, String> {
        if let Some(parent) = db_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
        // Tune SQLite memory footprint & concurrency:
        // - WAL mode for non-blocking reads/writes
        // - 4 MiB page cache cap (-4096 KiB) to bound RSS
        // - temp_store = FILE & mmap_size = 0 to avoid ballooning process RSS on large queries
        let _ = conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA cache_size = -4096;
             PRAGMA temp_store = FILE;
             PRAGMA mmap_size = 0;
             PRAGMA busy_timeout = 5000;",
        );
        let db = Database {
            conn: Mutex::new(conn),
        };
        db.init_tables().map_err(|e| e.to_string())?;
        Ok(db)
    }

    fn init_tables(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "CREATE TABLE IF NOT EXISTS games (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                sorting_title TEXT,
                source TEXT NOT NULL,
                source_id TEXT,
                install_directory TEXT,
                executable_path TEXT,
                launch_arguments TEXT,
                is_installed INTEGER NOT NULL DEFAULT 1,
                is_favorite INTEGER NOT NULL DEFAULT 0,
                cover_image TEXT,
                background_image TEXT,
                logo_image TEXT,
                icon_image TEXT,
                developer TEXT,
                publisher TEXT,
                release_date TEXT,
                genres TEXT,
                features TEXT,
                platforms TEXT,
                community_score INTEGER,
                user_rating INTEGER,
                playtime_seconds INTEGER NOT NULL DEFAULT 0,
                last_played TEXT,
                date_added TEXT,
                completion_status TEXT,
                description TEXT,
                notes TEXT,
                links TEXT,
                screenshots TEXT,
                size_on_disk INTEGER,
                trailers TEXT,
                age_rating TEXT,
                critic_score INTEGER,
                series TEXT,
                hltb_main REAL,
                hltb_extra REAL,
                hltb_completionist REAL,
                tags TEXT,
                categories TEXT,
                region TEXT,
                play_count INTEGER
            )",
            [],
        )?;

        // Safe migrations for newly added columns if table previously existed
        let _ = conn.execute("ALTER TABLE games ADD COLUMN trailers TEXT", []);
        let _ = conn.execute("ALTER TABLE games ADD COLUMN age_rating TEXT", []);
        let _ = conn.execute("ALTER TABLE games ADD COLUMN critic_score INTEGER", []);
        let _ = conn.execute("ALTER TABLE games ADD COLUMN series TEXT", []);
        let _ = conn.execute("ALTER TABLE games ADD COLUMN hltb_main REAL", []);
        let _ = conn.execute("ALTER TABLE games ADD COLUMN hltb_extra REAL", []);
        let _ = conn.execute("ALTER TABLE games ADD COLUMN hltb_completionist REAL", []);
        let _ = conn.execute("ALTER TABLE games ADD COLUMN tags TEXT", []);
        let _ = conn.execute("ALTER TABLE games ADD COLUMN categories TEXT", []);
        let _ = conn.execute("ALTER TABLE games ADD COLUMN region TEXT", []);
        let _ = conn.execute("ALTER TABLE games ADD COLUMN play_count INTEGER", []);
        let _ = conn.execute("ALTER TABLE games ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0", []);
        let _ = conn.execute("ALTER TABLE games ADD COLUMN play_actions TEXT", []);
        let _ = conn.execute("ALTER TABLE games ADD COLUMN auto_beaten INTEGER NOT NULL DEFAULT 0", []);
        let _ = conn.execute("ALTER TABLE games ADD COLUMN beaten_prompt_playtime INTEGER", []);
        let _ = conn.execute("ALTER TABLE games ADD COLUMN emulator_id TEXT", []);
        let _ = conn.execute("ALTER TABLE games ADD COLUMN cloud_save_enabled INTEGER NOT NULL DEFAULT 0", []);
        let _ = conn.execute("ALTER TABLE games ADD COLUMN cloud_save_retention_override INTEGER", []);
        let _ = conn.execute("ALTER TABLE games ADD COLUMN last_played_device_id TEXT", []);

        // Normalize date_added formats to clean YYYY-MM-DD and strip broken replacement chars in titles
        let _ = conn.execute("UPDATE games SET date_added = SUBSTR(date_added, 1, 10) WHERE date_added LIKE '%T%'", []);
        let _ = conn.execute("UPDATE games SET title = REPLACE(title, char(65533), '') WHERE title LIKE '%' || char(65533) || '%'", []);
        let _ = conn.execute("UPDATE games SET completion_status = 'Auto' WHERE completion_status IN ('Not Played', 'Playing', 'Played') OR completion_status IS NULL", []);

        // Bug 008 Cleanup: Deduplicate legacy playnite_% records that duplicate native store games
        let _ = conn.execute(
            "DELETE FROM games WHERE id LIKE 'playnite_%' AND EXISTS (
                SELECT 1 FROM games g2
                WHERE g2.id NOT LIKE 'playnite_%'
                  AND g2.source = games.source
                  AND g2.source_id IS NOT NULL
                  AND g2.source_id != ''
                  AND g2.source_id = games.source_id
            )",
            [],
        );
        let _ = conn.execute(
            "DELETE FROM games WHERE id LIKE 'playnite_%' AND EXISTS (
                SELECT 1 FROM games g2
                WHERE g2.id NOT LIKE 'playnite_%'
                  AND LOWER(TRIM(g2.title)) = LOWER(TRIM(games.title))
                  AND LOWER(TRIM(g2.source)) = LOWER(TRIM(games.source))
            )",
            [],
        );

        // --- Schema Versioning & Migrations via PRAGMA user_version ---
        let user_version: i32 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap_or(0);

        if user_version < 3 {
            let _ = conn.execute("ALTER TABLE games ADD COLUMN updated_at TEXT", []);
            let _ = conn.execute("ALTER TABLE games ADD COLUMN playtime_by_device TEXT", []);
            let _ = conn.execute(
                "CREATE TABLE IF NOT EXISTS deleted_games (
                    id TEXT PRIMARY KEY,
                    title TEXT,
                    source TEXT,
                    deleted_at TEXT NOT NULL
                )",
                [],
            );

            // Populate updated_at for existing games if empty
            let now_utc = chrono::Utc::now().to_rfc3339();
            let _ = conn.execute(
                "UPDATE games SET updated_at = ?1 WHERE updated_at IS NULL OR updated_at = ''",
                params![&now_utc],
            );

            // Migrate legacy playtime into reserved "legacy" map key
            if let Ok(mut stmt) = conn.prepare("SELECT id, playtime_seconds FROM games WHERE playtime_seconds > 0 AND (playtime_by_device IS NULL OR playtime_by_device = '')") {
                let games_to_migrate: Vec<(String, u64)> = stmt
                    .query_map([], |row| Ok((row.get(0)?, row.get::<_, i64>(1)? as u64)))
                    .ok()
                    .map(|rows| rows.filter_map(|r| r.ok()).collect())
                    .unwrap_or_default();
                drop(stmt);

                for (gid, pt) in games_to_migrate {
                    let map_json = format!("{{\"legacy\":{}}}", pt);
                    let _ = conn.execute(
                        "UPDATE games SET playtime_by_device = ?1 WHERE id = ?2",
                        params![map_json, gid],
                    );
                }
            }

            let _ = conn.execute("PRAGMA user_version = 3", []);
        }

        if user_version < 4 {
            // Reset purely auto-scanned rows to epoch baseline so fresh scans never clobber curated peer edits,
            // while stamping now_utc on games with user-curated state (Beaten, auto_beaten, ratings, favorites, hidden, notes).
            let _ = conn.execute(
                "UPDATE games SET updated_at = '1970-01-01T00:00:00Z' WHERE
                    auto_beaten = 0
                    AND (completion_status IS NULL OR completion_status IN ('Auto', 'Not Played', 'Played', 'Playing'))
                    AND is_favorite = 0
                    AND is_hidden = 0
                    AND user_rating IS NULL
                    AND (notes IS NULL OR TRIM(notes) = '')
                    AND (cover_image IS NULL OR cover_image NOT LIKE '%custom_artwork%')
                    AND (background_image IS NULL OR background_image NOT LIKE '%custom_artwork%')
                    AND (logo_image IS NULL OR logo_image NOT LIKE '%custom_artwork%')",
                [],
            );
            let now_utc = chrono::Utc::now().to_rfc3339();
            let _ = conn.execute(
                "UPDATE games SET updated_at = ?1 WHERE
                    auto_beaten = 1
                    OR (completion_status IS NOT NULL AND completion_status NOT IN ('Auto', 'Not Played', 'Played', 'Playing'))
                    OR is_favorite = 1
                    OR is_hidden = 1
                    OR user_rating IS NOT NULL
                    OR (notes IS NOT NULL AND TRIM(notes) != '')",
                params![&now_utc],
            );
            let _ = conn.execute("PRAGMA user_version = 4", []);
        }

        if user_version < 5 {
            let _ = conn.execute("ALTER TABLE games ADD COLUMN cloud_save_enabled INTEGER NOT NULL DEFAULT 0", []);
            let _ = conn.execute("ALTER TABLE games ADD COLUMN cloud_save_retention_override INTEGER", []);
            let _ = conn.execute("PRAGMA user_version = 5", []);
        }

        if user_version < 6 {
            let _ = conn.execute("ALTER TABLE games ADD COLUMN last_played_device_id TEXT", []);
            let _ = conn.execute("PRAGMA user_version = 6", []);
        }

        conn.execute(
            "CREATE TABLE IF NOT EXISTS integrations (
                provider TEXT PRIMARY KEY,
                account_id TEXT,
                username TEXT,
                avatar_url TEXT,
                is_authenticated INTEGER NOT NULL DEFAULT 0,
                import_installed INTEGER NOT NULL DEFAULT 1,
                import_uninstalled INTEGER NOT NULL DEFAULT 1,
                sync_playtime INTEGER NOT NULL DEFAULT 1,
                last_sync TEXT,
                access_token TEXT,
                refresh_token TEXT
            )",
            [],
        )?;

        let _ = conn.execute("ALTER TABLE integrations ADD COLUMN access_token TEXT", []);
        let _ = conn.execute("ALTER TABLE integrations ADD COLUMN refresh_token TEXT", []);

        conn.execute(
            "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS achievements (
                game_id TEXT NOT NULL,
                api_name TEXT NOT NULL,
                display_name TEXT NOT NULL,
                description TEXT,
                icon_url TEXT NOT NULL,
                icon_gray_url TEXT,
                is_unlocked INTEGER NOT NULL DEFAULT 0,
                unlock_time TEXT,
                rarity_percentage REAL DEFAULT 0.0,
                is_secret INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (game_id, api_name)
            )",
            [],
        )?;

        let _ = conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_achievements_game_id ON achievements(game_id)",
            [],
        );

        conn.execute(
            "CREATE TABLE IF NOT EXISTS emulators (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                emulator_type TEXT NOT NULL,
                executable_path TEXT NOT NULL,
                arguments_template TEXT NOT NULL,
                selected_core TEXT,
                supported_platforms TEXT NOT NULL,
                is_installed INTEGER NOT NULL DEFAULT 1
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS configured_consoles (
                id TEXT PRIMARY KEY,
                console_id TEXT NOT NULL,
                name TEXT NOT NULL,
                manufacturer TEXT NOT NULL,
                emulator_name TEXT NOT NULL,
                emulator_type TEXT NOT NULL,
                executable_path TEXT NOT NULL,
                core_name TEXT,
                rom_directory TEXT NOT NULL,
                arguments_template TEXT NOT NULL,
                extensions TEXT NOT NULL,
                created_at TEXT NOT NULL
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS game_save_configs (
                game_id TEXT PRIMARY KEY,
                custom_save_paths TEXT NOT NULL DEFAULT '[]',
                custom_config_paths TEXT NOT NULL DEFAULT '[]',
                last_synced_save_hash TEXT,
                last_synced_snapshot_id TEXT,
                last_synced_at TEXT,
                updated_at TEXT NOT NULL
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS save_location_cache (
                cache_key TEXT PRIMARY KEY,
                pcgw_page TEXT,
                raw_rules_json TEXT NOT NULL,
                fetched_at TEXT NOT NULL
            )",
            [],
        )?;

        if user_version < 6 {
            let _ = conn.execute("DELETE FROM save_location_cache", []);
            let _ = conn.execute("PRAGMA user_version = 6", []);
        }

        if user_version < 7 {
            let _ = conn.execute(
                "DELETE FROM save_location_cache WHERE raw_rules_json = '[]' OR pcgw_page LIKE '%Sun Wukong%'",
                [],
            );
            let _ = conn.execute("PRAGMA user_version = 7", []);
        }

        Ok(())
    }

    fn row_to_game(row: &rusqlite::Row<'_>) -> Result<Game> {
        let genres_json: String = row.get(17).unwrap_or_else(|_| "[]".to_string());
        let features_json: String = row.get(18).unwrap_or_else(|_| "[]".to_string());
        let platforms_json: String = row.get(19).unwrap_or_else(|_| "[]".to_string());
        let links_json: String = row.get(28).unwrap_or_else(|_| "[]".to_string());
        let screenshots_json: String = row.get(29).unwrap_or_else(|_| "[]".to_string());
        let trailers_json: String = row.get(31).unwrap_or_else(|_| "[]".to_string());
        let tags_json: String = row.get(38).unwrap_or_else(|_| "[]".to_string());
        let categories_json: String = row.get(39).unwrap_or_else(|_| "[]".to_string());
        let play_actions_json: String = row.get(43).unwrap_or_else(|_| "[]".to_string());

        let genres: Vec<String> = serde_json::from_str(&genres_json).unwrap_or_default();
        let features: Vec<String> = serde_json::from_str(&features_json).unwrap_or_default();
        let platforms: Vec<String> = serde_json::from_str(&platforms_json).unwrap_or_default();
        let links: Vec<GameLink> = serde_json::from_str(&links_json).unwrap_or_default();
        let screenshots: Vec<String> = serde_json::from_str(&screenshots_json).unwrap_or_default();
        let trailers: Vec<GameTrailer> = serde_json::from_str(&trailers_json).unwrap_or_default();
        let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();
        let categories: Vec<String> = serde_json::from_str(&categories_json).unwrap_or_default();
        let play_actions: Vec<crate::models::GameAction> = serde_json::from_str(&play_actions_json).unwrap_or_default();

        let is_installed_int: i32 = row.get(8)?;
        let is_favorite_int: i32 = row.get(9)?;
        let is_hidden_int: i32 = row.get(42).unwrap_or(0);
        let auto_beaten_int: i32 = row.get(44).unwrap_or(0);
        let beaten_prompt_playtime: Option<u64> = row.get::<_, Option<i64>>(45).unwrap_or(None).map(|v| v as u64);

        Ok(Game {
            id: row.get(0)?,
            title: row.get(1)?,
            sorting_title: row.get(2)?,
            source: row.get(3)?,
            source_id: row.get(4)?,
            install_directory: row.get(5)?,
            executable_path: row.get(6)?,
            launch_arguments: row.get(7)?,
            is_installed: is_installed_int != 0,
            is_favorite: is_favorite_int != 0,
            cover_image: row.get(10)?,
            background_image: row.get(11)?,
            logo_image: row.get(12)?,
            icon_image: row.get(13)?,
            developer: row.get(14)?,
            publisher: row.get(15)?,
            release_date: row.get(16)?,
            genres,
            features,
            platforms,
            community_score: row.get(20)?,
            user_rating: row.get(21)?,
            playtime_seconds: row.get::<_, i64>(22)? as u64,
            last_played: row.get(23)?,
            date_added: row.get(24)?,
            completion_status: row.get(25)?,
            description: row.get(26)?,
            notes: row.get(27)?,
            links,
            screenshots,
            size_on_disk: row.get::<_, Option<i64>>(30)?.map(|v| v as u64),
            trailers,
            age_rating: row.get(32)?,
            critic_score: row.get(33)?,
            series: row.get(34)?,
            hltb_main: row.get(35)?,
            hltb_extra: row.get(36)?,
            hltb_completionist: row.get(37)?,
            tags,
            categories,
            region: row.get(40)?,
            play_count: row.get(41)?,
            is_hidden: is_hidden_int != 0,
            play_actions,
            auto_beaten: auto_beaten_int != 0,
            beaten_prompt_playtime,
            emulator_id: row.get(46)?,
            updated_at: row.get(47)?,
            playtime_by_device: row.get(48)?,
            cloud_save_enabled: row.get::<_, i32>(49).unwrap_or(0) != 0,
            cloud_save_retention_override: row.get::<_, Option<i64>>(50).unwrap_or(None).map(|v| v as u32),
            last_played_device_id: row.get(51).unwrap_or(None),
            played_on_other_device: false,
        })
    }

    const GAME_SELECT_COLUMNS: &'static str = "
        id, title, sorting_title, source, source_id, install_directory, executable_path,
        launch_arguments, is_installed, is_favorite, cover_image, background_image,
        logo_image, icon_image, developer, publisher, release_date, genres, features,
        platforms, community_score, user_rating, playtime_seconds, last_played,
        date_added, completion_status, description, notes, links, screenshots, size_on_disk,
        trailers, age_rating, critic_score, series, hltb_main, hltb_extra, hltb_completionist,
        tags, categories, region, play_count, is_hidden, play_actions,
        auto_beaten, beaten_prompt_playtime, emulator_id, updated_at, playtime_by_device,
        cloud_save_enabled, cloud_save_retention_override, last_played_device_id";

    /// Lean projection for library grids & listings: omits heavy detail-only columns
    /// (`description`, `notes`, `links`, `screenshots`, `trailers`, `play_actions`) so SQLite
    /// skips reading large overflow pages and RAM/IPC overhead stays minimal across 600+ games.
    const GAME_SUMMARY_SELECT_COLUMNS: &'static str = "
        id, title, sorting_title, source, source_id, install_directory, executable_path,
        launch_arguments, is_installed, is_favorite, cover_image, background_image,
        logo_image, icon_image, developer, publisher, release_date, genres, features,
        platforms, community_score, user_rating, playtime_seconds, last_played,
        date_added, completion_status, NULL, NULL, NULL, NULL, size_on_disk,
        NULL, age_rating, critic_score, series, hltb_main, hltb_extra, hltb_completionist,
        tags, categories, region, play_count, is_hidden, NULL,
        auto_beaten, beaten_prompt_playtime, emulator_id, updated_at, playtime_by_device,
        cloud_save_enabled, cloud_save_retention_override, last_played_device_id";

    pub fn is_other_device_id(last_played_device_id: Option<&str>, current_device_id: &str) -> bool {
        match last_played_device_id.map(str::trim).filter(|s| !s.is_empty()) {
            Some("external") => true,
            Some(dev_id) => dev_id != current_device_id,
            None => false,
        }
    }

    pub fn populate_other_device_flag(&self, game: &mut Game) {
        if let Ok(current_device_id) = self.get_or_create_device_id() {
            game.played_on_other_device =
                Self::is_other_device_id(game.last_played_device_id.as_deref(), &current_device_id);
        }
    }

    pub fn get_games_count(&self) -> Result<usize, String> {
        let conn = self.conn.lock().unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM games", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        Ok(count.max(0) as usize)
    }

    pub fn get_distinct_sources(&self) -> Result<Vec<String>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT DISTINCT LOWER(TRIM(source)) FROM games WHERE source IS NOT NULL AND TRIM(source) != ''")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub fn get_all_games_summary(&self) -> Result<Vec<Game>, String> {
        let conn = self.conn.lock().unwrap();
        let current_device_id = Self::get_or_create_device_id_conn(&conn)?;
        let sql = format!("SELECT {} FROM games ORDER BY title ASC", Self::GAME_SUMMARY_SELECT_COLUMNS);
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], Self::row_to_game)
            .map_err(|e| e.to_string())?;

        let mut games = Vec::new();
        for r in rows {
            if let Ok(mut g) = r {
                g.played_on_other_device =
                    Self::is_other_device_id(g.last_played_device_id.as_deref(), &current_device_id);
                games.push(g);
            }
        }
        Ok(games)
    }

    pub fn get_games_page(
        &self,
        limit: usize,
        offset: usize,
        include_heavy_fields: bool,
    ) -> Result<Vec<Game>, String> {
        let conn = self.conn.lock().unwrap();
        let current_device_id = Self::get_or_create_device_id_conn(&conn)?;
        let cols = if include_heavy_fields {
            Self::GAME_SELECT_COLUMNS
        } else {
            Self::GAME_SUMMARY_SELECT_COLUMNS
        };
        let sql = format!("SELECT {} FROM games ORDER BY title ASC LIMIT ?1 OFFSET ?2", cols);
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![limit as i64, offset as i64], Self::row_to_game)
            .map_err(|e| e.to_string())?;

        let mut games = Vec::with_capacity(limit.min(512));
        for r in rows {
            if let Ok(mut g) = r {
                g.played_on_other_device =
                    Self::is_other_device_id(g.last_played_device_id.as_deref(), &current_device_id);
                games.push(g);
            }
        }
        Ok(games)
    }

    pub fn update_game_artwork_paths(
        &self,
        game_id: &str,
        cover_image: Option<&str>,
        background_image: Option<&str>,
        logo_image: Option<&str>,
    ) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE games SET cover_image = ?1, background_image = ?2, logo_image = ?3 WHERE id = ?4",
            params![cover_image, background_image, logo_image, game_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_all_games(&self) -> Result<Vec<Game>, String> {
        let conn = self.conn.lock().unwrap();
        let current_device_id = Self::get_or_create_device_id_conn(&conn)?;
        let sql = format!("SELECT {} FROM games ORDER BY title ASC", Self::GAME_SELECT_COLUMNS);
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], Self::row_to_game)
            .map_err(|e| e.to_string())?;

        let mut games = Vec::new();
        for r in rows {
            if let Ok(mut g) = r {
                g.played_on_other_device =
                    Self::is_other_device_id(g.last_played_device_id.as_deref(), &current_device_id);
                games.push(g);
            }
        }
        Ok(games)
    }

    pub fn get_game_by_id(&self, game_id: &str) -> Result<Option<Game>, String> {
        let conn = self.conn.lock().unwrap();
        let current_device_id = Self::get_or_create_device_id_conn(&conn)?;
        let sql = format!("SELECT {} FROM games WHERE id = ?1", Self::GAME_SELECT_COLUMNS);
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        match stmt.query_row(params![game_id], Self::row_to_game) {
            Ok(mut g) => {
                g.played_on_other_device =
                    Self::is_other_device_id(g.last_played_device_id.as_deref(), &current_device_id);
                Ok(Some(g))
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    pub fn upsert_game(&self, game: &Game) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        let now_utc = chrono::Utc::now().to_rfc3339();
        let genres_json = serde_json::to_string(&game.genres).unwrap_or_else(|_| "[]".to_string());
        let features_json = serde_json::to_string(&game.features).unwrap_or_else(|_| "[]".to_string());
        let platforms_json = serde_json::to_string(&game.platforms).unwrap_or_else(|_| "[]".to_string());
        let links_json = serde_json::to_string(&game.links).unwrap_or_else(|_| "[]".to_string());
        let screenshots_json = serde_json::to_string(&game.screenshots).unwrap_or_else(|_| "[]".to_string());
        let trailers_json = serde_json::to_string(&game.trailers).unwrap_or_else(|_| "[]".to_string());
        let tags_json = serde_json::to_string(&game.tags).unwrap_or_else(|_| "[]".to_string());
        let categories_json = serde_json::to_string(&game.categories).unwrap_or_else(|_| "[]".to_string());
        let play_actions_json = serde_json::to_string(&game.play_actions).unwrap_or_else(|_| "[]".to_string());

        conn.execute(
            "INSERT INTO games (
                id, title, sorting_title, source, source_id, install_directory, executable_path,
                launch_arguments, is_installed, is_favorite, cover_image, background_image,
                logo_image, icon_image, developer, publisher, release_date, genres, features,
                platforms, community_score, user_rating, playtime_seconds, last_played,
                date_added, completion_status, description, notes, links, screenshots, size_on_disk,
                trailers, age_rating, critic_score, series, hltb_main, hltb_extra, hltb_completionist,
                tags, categories, region, play_count, is_hidden, play_actions,
                auto_beaten, beaten_prompt_playtime, emulator_id, updated_at, playtime_by_device,
                cloud_save_enabled, cloud_save_retention_override, last_played_device_id
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16,
                ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31,
                ?32, ?33, ?34, ?35, ?36, ?37, ?38, ?39, ?40, ?41, ?42, ?43, ?44, ?45, ?46, ?47,
                ?48, ?49, ?50, ?51, ?52
            ) ON CONFLICT(id) DO UPDATE SET
                title = CASE
                    WHEN games.title IS NOT NULL AND trim(games.title) != ''
                    THEN games.title
                    ELSE excluded.title
                END,
                sorting_title = COALESCE(games.sorting_title, excluded.sorting_title),
                source = excluded.source,
                source_id = COALESCE(excluded.source_id, games.source_id),
                install_directory = COALESCE(excluded.install_directory, games.install_directory),
                executable_path = COALESCE(excluded.executable_path, games.executable_path),
                launch_arguments = COALESCE(games.launch_arguments, excluded.launch_arguments),
                is_installed = excluded.is_installed,
                cover_image = CASE
                    WHEN games.cover_image IS NOT NULL AND trim(games.cover_image) != ''
                    THEN games.cover_image
                    ELSE excluded.cover_image
                END,
                background_image = CASE
                    WHEN games.background_image IS NOT NULL AND trim(games.background_image) != ''
                    THEN games.background_image
                    ELSE excluded.background_image
                END,
                logo_image = CASE
                    WHEN games.logo_image IS NOT NULL AND trim(games.logo_image) != ''
                    THEN games.logo_image
                    ELSE excluded.logo_image
                END,
                icon_image = CASE
                    WHEN games.icon_image IS NOT NULL AND trim(games.icon_image) != ''
                    THEN games.icon_image
                    ELSE excluded.icon_image
                END,
                developer = CASE
                    WHEN games.developer IS NOT NULL AND trim(games.developer) != ''
                    THEN games.developer
                    ELSE excluded.developer
                END,
                publisher = CASE
                    WHEN games.publisher IS NOT NULL AND trim(games.publisher) != ''
                    THEN games.publisher
                    ELSE excluded.publisher
                END,
                release_date = CASE
                    WHEN games.release_date IS NOT NULL AND trim(games.release_date) != ''
                    THEN games.release_date
                    ELSE excluded.release_date
                END,
                genres = CASE WHEN games.genres IS NOT NULL AND games.genres != '[]' THEN games.genres ELSE excluded.genres END,
                features = CASE WHEN games.features IS NOT NULL AND games.features != '[]' THEN games.features ELSE excluded.features END,
                platforms = CASE WHEN games.platforms IS NOT NULL AND games.platforms != '[]' THEN games.platforms ELSE excluded.platforms END,
                community_score = COALESCE(games.community_score, excluded.community_score),
                playtime_seconds = CASE WHEN excluded.playtime_seconds > games.playtime_seconds THEN excluded.playtime_seconds ELSE games.playtime_seconds END,
                last_played = COALESCE(excluded.last_played, games.last_played),
                date_added = COALESCE(games.date_added, excluded.date_added),
                completion_status = CASE
                    WHEN (games.completion_status IS NULL OR games.completion_status = 'Auto' OR games.completion_status = 'Not Played')
                         AND (excluded.playtime_seconds > 0 OR games.playtime_seconds > 0)
                    THEN 'Played'
                    ELSE COALESCE(games.completion_status, excluded.completion_status)
                END,
                description = CASE WHEN games.description IS NOT NULL AND trim(games.description) != '' THEN games.description ELSE excluded.description END,
                links = CASE WHEN games.links IS NOT NULL AND games.links != '[]' THEN games.links ELSE excluded.links END,
                screenshots = CASE WHEN games.screenshots IS NOT NULL AND games.screenshots != '[]' THEN games.screenshots ELSE excluded.screenshots END,
                size_on_disk = COALESCE(excluded.size_on_disk, games.size_on_disk),
                trailers = CASE WHEN games.trailers IS NOT NULL AND games.trailers != '[]' THEN games.trailers ELSE excluded.trailers END,
                age_rating = COALESCE(games.age_rating, excluded.age_rating),
                critic_score = COALESCE(games.critic_score, excluded.critic_score),
                series = COALESCE(games.series, excluded.series),
                hltb_main = COALESCE(games.hltb_main, excluded.hltb_main),
                hltb_extra = COALESCE(games.hltb_extra, excluded.hltb_extra),
                hltb_completionist = COALESCE(games.hltb_completionist, excluded.hltb_completionist),
                tags = CASE WHEN games.tags IS NOT NULL AND games.tags != '[]' THEN games.tags ELSE excluded.tags END,
                categories = CASE WHEN games.categories IS NOT NULL AND games.categories != '[]' THEN games.categories ELSE excluded.categories END,
                region = COALESCE(games.region, excluded.region),
                play_count = COALESCE(games.play_count, excluded.play_count),
                is_hidden = games.is_hidden,
                play_actions = CASE WHEN games.play_actions IS NOT NULL AND games.play_actions != '[]' THEN games.play_actions ELSE excluded.play_actions END,
                auto_beaten = games.auto_beaten,
                beaten_prompt_playtime = games.beaten_prompt_playtime,
                emulator_id = COALESCE(games.emulator_id, excluded.emulator_id),
                updated_at = COALESCE(games.updated_at, excluded.updated_at),
                playtime_by_device = COALESCE(games.playtime_by_device, excluded.playtime_by_device),
                last_played_device_id = COALESCE(excluded.last_played_device_id, games.last_played_device_id)",
            params![
                game.id,
                game.title,
                game.sorting_title,
                game.source,
                game.source_id,
                game.install_directory,
                game.executable_path,
                game.launch_arguments,
                if game.is_installed { 1 } else { 0 },
                if game.is_favorite { 1 } else { 0 },
                game.cover_image,
                game.background_image,
                game.logo_image,
                game.icon_image,
                game.developer,
                game.publisher,
                game.release_date,
                genres_json,
                features_json,
                platforms_json,
                game.community_score,
                game.user_rating,
                game.playtime_seconds as i64,
                game.last_played,
                game.date_added,
                game.completion_status,
                game.description,
                game.notes,
                links_json,
                screenshots_json,
                game.size_on_disk.map(|s| s as i64),
                trailers_json,
                game.age_rating,
                game.critic_score,
                game.series,
                game.hltb_main,
                game.hltb_extra,
                game.hltb_completionist,
                tags_json,
                categories_json,
                game.region,
                game.play_count,
                if game.is_hidden { 1 } else { 0 },
                play_actions_json,
                if game.auto_beaten { 1 } else { 0 },
                game.beaten_prompt_playtime.map(|v| v as i64),
                game.emulator_id,
                game.updated_at.as_deref().unwrap_or_else(|| {
                    let is_curated = game.auto_beaten
                        || game.is_favorite
                        || game.is_hidden
                        || game.user_rating.is_some()
                        || !game.notes.as_deref().unwrap_or("").trim().is_empty()
                        || matches!(
                            game.completion_status.as_deref().map(|s| s.trim()),
                            Some(s) if !s.is_empty() && !matches!(s, "Auto" | "Not Played" | "Played" | "Playing")
                        );
                    if is_curated {
                        now_utc.as_str()
                    } else {
                        "1970-01-01T00:00:00Z"
                    }
                }),
                game.playtime_by_device,
                if game.cloud_save_enabled { 1 } else { 0 },
                game.cloud_save_retention_override.map(|v| v as i64),
                game.last_played_device_id,
            ],
        ).map_err(|e| e.to_string())?;

        Ok(())
    }

    pub fn save_game_exact(&self, game: &Game) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        let genres_json = serde_json::to_string(&game.genres).unwrap_or_else(|_| "[]".to_string());
        let features_json = serde_json::to_string(&game.features).unwrap_or_else(|_| "[]".to_string());
        let platforms_json = serde_json::to_string(&game.platforms).unwrap_or_else(|_| "[]".to_string());
        let links_json = serde_json::to_string(&game.links).unwrap_or_else(|_| "[]".to_string());
        let screenshots_json = serde_json::to_string(&game.screenshots).unwrap_or_else(|_| "[]".to_string());
        let trailers_json = serde_json::to_string(&game.trailers).unwrap_or_else(|_| "[]".to_string());
        let tags_json = serde_json::to_string(&game.tags).unwrap_or_else(|_| "[]".to_string());
        let categories_json = serde_json::to_string(&game.categories).unwrap_or_else(|_| "[]".to_string());
        let play_actions_json = serde_json::to_string(&game.play_actions).unwrap_or_else(|_| "[]".to_string());

        let now_utc = chrono::Utc::now().to_rfc3339();
        let updated_at_val = game.updated_at.as_deref().unwrap_or(&now_utc);

        let rows_affected = conn.execute(
            "UPDATE games SET
                title = ?1,
                sorting_title = ?2,
                source = ?3,
                source_id = ?4,
                install_directory = ?5,
                executable_path = ?6,
                launch_arguments = ?7,
                is_installed = ?8,
                is_favorite = ?9,
                cover_image = ?10,
                background_image = ?11,
                logo_image = ?12,
                icon_image = ?13,
                developer = ?14,
                publisher = ?15,
                release_date = ?16,
                genres = ?17,
                features = ?18,
                platforms = ?19,
                community_score = ?20,
                user_rating = ?21,
                playtime_seconds = ?22,
                last_played = ?23,
                date_added = ?24,
                completion_status = ?25,
                description = ?26,
                notes = ?27,
                links = ?28,
                screenshots = ?29,
                size_on_disk = ?30,
                trailers = ?31,
                age_rating = ?32,
                critic_score = ?33,
                series = ?34,
                hltb_main = ?35,
                hltb_extra = ?36,
                hltb_completionist = ?37,
                tags = ?38,
                categories = ?39,
                region = ?40,
                play_count = ?41,
                is_hidden = ?42,
                play_actions = ?43,
                auto_beaten = ?44,
                beaten_prompt_playtime = ?45,
                emulator_id = ?46,
                updated_at = ?47,
                playtime_by_device = ?48,
                cloud_save_enabled = ?49,
                cloud_save_retention_override = ?50,
                last_played_device_id = ?51
            WHERE id = ?52",
            params![
                game.title,
                game.sorting_title,
                game.source,
                game.source_id,
                game.install_directory,
                game.executable_path,
                game.launch_arguments,
                if game.is_installed { 1 } else { 0 },
                if game.is_favorite { 1 } else { 0 },
                game.cover_image,
                game.background_image,
                game.logo_image,
                game.icon_image,
                game.developer,
                game.publisher,
                game.release_date,
                genres_json,
                features_json,
                platforms_json,
                game.community_score,
                game.user_rating,
                game.playtime_seconds as i64,
                game.last_played,
                game.date_added,
                game.completion_status,
                game.description,
                game.notes,
                links_json,
                screenshots_json,
                game.size_on_disk.map(|s| s as i64),
                trailers_json,
                game.age_rating,
                game.critic_score,
                game.series,
                game.hltb_main,
                game.hltb_extra,
                game.hltb_completionist,
                tags_json,
                categories_json,
                game.region,
                game.play_count,
                if game.is_hidden { 1 } else { 0 },
                play_actions_json,
                if game.auto_beaten { 1 } else { 0 },
                game.beaten_prompt_playtime.map(|v| v as i64),
                game.emulator_id,
                updated_at_val,
                game.playtime_by_device,
                if game.cloud_save_enabled { 1 } else { 0 },
                game.cloud_save_retention_override.map(|v| v as i64),
                game.last_played_device_id,
                game.id,
            ],
        ).map_err(|e| e.to_string())?;

        let _ = conn.execute("DELETE FROM deleted_games WHERE id = ?1", params![&game.id]);

        if rows_affected == 0 {
            drop(conn);
            return self.upsert_game(game);
        }

        Ok(())
    }

    pub fn update_game_installed(&self, game_id: &str, is_installed: bool) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE games SET is_installed = ?1 WHERE id = ?2",
            params![if is_installed { 1 } else { 0 }, game_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn batch_update_game_installed(&self, updates: &[(String, bool)]) -> Result<(), String> {
        if updates.is_empty() {
            return Ok(());
        }
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        {
            let mut stmt = tx
                .prepare("UPDATE games SET is_installed = ?1 WHERE id = ?2")
                .map_err(|e| e.to_string())?;
            for (id, is_installed) in updates {
                stmt.execute(params![if *is_installed { 1 } else { 0 }, id])
                    .map_err(|e| e.to_string())?;
            }
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn toggle_favorite(&self, id: &str) -> Result<bool, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT is_favorite FROM games WHERE id = ?1")
            .map_err(|e| e.to_string())?;

        let current: i32 = stmt
            .query_row(params![id], |row| row.get(0))
            .map_err(|e| e.to_string())?;

        let new_state = if current == 0 { 1 } else { 0 };
        let now_utc = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE games SET is_favorite = ?1, updated_at = ?2 WHERE id = ?3",
            params![new_state, &now_utc, id],
        )
        .map_err(|e| e.to_string())?;

        Ok(new_state == 1)
    }

    pub fn set_favorite(&self, id: &str, is_favorite: bool) -> Result<bool, String> {
        let conn = self.conn.lock().unwrap();
        let state_val = if is_favorite { 1 } else { 0 };
        let now_utc = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE games SET is_favorite = ?1, updated_at = ?2 WHERE id = ?3",
            params![state_val, &now_utc, id],
        )
        .map_err(|e| e.to_string())?;

        Ok(is_favorite)
    }

    pub fn update_playtime(&self, id: &str, add_seconds: u64, last_played_iso: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        let device_id = Self::get_or_create_device_id_conn(&conn)?;

        let (current_map_raw, current_playtime): (Option<String>, i64) = conn
            .query_row(
                "SELECT playtime_by_device, playtime_seconds FROM games WHERE id = ?1",
                params![id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap_or((None, 0));

        let mut pt_map: std::collections::HashMap<String, u64> = current_map_raw
            .as_deref()
            .and_then(|s| serde_json::from_str(s).ok())
            .unwrap_or_default();

        let entry = pt_map.entry(device_id.clone()).or_insert(0);
        *entry += add_seconds;

        let sum_map: u64 = pt_map.values().sum();
        let new_total = std::cmp::max(sum_map, (current_playtime as u64).saturating_add(add_seconds));
        let map_json = serde_json::to_string(&pt_map).unwrap_or_else(|_| "{}".to_string());

        conn.execute(
            "UPDATE games SET playtime_seconds = ?1, playtime_by_device = ?2, last_played = ?3, last_played_device_id = ?4 WHERE id = ?5",
            params![new_total as i64, map_json, last_played_iso, &device_id, id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_game(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        let game_info: Option<(String, String)> = conn
            .query_row("SELECT title, source FROM games WHERE id = ?1", params![id], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .ok();

        let now_utc = chrono::Utc::now().to_rfc3339();
        let (title, source) = game_info.unwrap_or_default();
        let _ = conn.execute(
            "INSERT OR REPLACE INTO deleted_games (id, title, source, deleted_at) VALUES (?1, ?2, ?3, ?4)",
            params![id, title, source, &now_utc],
        );

        conn.execute("DELETE FROM games WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_or_create_device_id(&self) -> Result<String, String> {
        let conn = self.conn.lock().unwrap();
        Self::get_or_create_device_id_conn(&conn)
    }

    pub fn get_or_create_device_id_conn(conn: &rusqlite::Connection) -> Result<String, String> {
        let existing: Option<String> = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'device_id'",
                [],
                |r| r.get(0),
            )
            .ok();

        if let Some(id) = existing {
            if !id.trim().is_empty() {
                return Ok(id);
            }
        }

        let new_id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('device_id', ?1)",
            params![&new_id],
        )
        .map_err(|e| e.to_string())?;

        Ok(new_id)
    }

    pub fn get_device_name(&self) -> String {
        let conn = self.conn.lock().unwrap();
        let existing: Option<String> = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'device_name'",
                [],
                |r| r.get(0),
            )
            .ok();

        if let Some(name) = existing {
            if !name.trim().is_empty() {
                return name;
            }
        }

        sysinfo::System::host_name().unwrap_or_else(|| "OpenPlay Device".to_string())
    }

    pub fn set_device_name(&self, name: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('device_name', ?1)",
            params![name],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn record_game_deletion(&self, id: &str, title: &str, source: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        let now_utc = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT OR REPLACE INTO deleted_games (id, title, source, deleted_at) VALUES (?1, ?2, ?3, ?4)",
            params![id, title, source, &now_utc],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_active_tombstones(&self) -> Result<Vec<TombstoneRecord>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT id, title, source, deleted_at FROM deleted_games")
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |r| {
                Ok(TombstoneRecord {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    source: r.get(2)?,
                    deleted_at: r.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for r in rows.flatten() {
            list.push(r);
        }
        Ok(list)
    }

    pub fn clear_tombstone(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM deleted_games WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn touch_game_metadata_updated(&self, id: &str) -> Result<String, String> {
        let conn = self.conn.lock().unwrap();
        let now_utc = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE games SET updated_at = ?1 WHERE id = ?2",
            params![&now_utc, id],
        )
        .map_err(|e| e.to_string())?;
        let _ = conn.execute("DELETE FROM deleted_games WHERE id = ?1", params![id]);
        Ok(now_utc)
    }

    pub fn clear_all_games(&self) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM games", [])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_integration(&self, provider: &str) -> Result<LibraryIntegration, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT provider, account_id, username, avatar_url, is_authenticated, import_installed, import_uninstalled, sync_playtime, last_sync, access_token, refresh_token FROM integrations WHERE provider = ?1")
            .map_err(|e| e.to_string())?;

        let row = stmt.query_row(params![provider], |row| {
            let is_auth: i32 = row.get(4)?;
            let imp_inst: i32 = row.get(5)?;
            let imp_uninst: i32 = row.get(6)?;
            let sync_pt: i32 = row.get(7)?;

            Ok(LibraryIntegration {
                provider: row.get(0)?,
                account_id: row.get(1)?,
                username: row.get(2)?,
                avatar_url: row.get(3)?,
                is_authenticated: is_auth != 0,
                import_installed: imp_inst != 0,
                import_uninstalled: imp_uninst != 0,
                sync_playtime: sync_pt != 0,
                last_sync: row.get(8)?,
                access_token: row.get(9)?,
                refresh_token: row.get(10)?,
            })
        });

        match row {
            Ok(integration) => Ok(integration),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(LibraryIntegration {
                provider: provider.to_string(),
                ..Default::default()
            }),
            Err(e) => Err(e.to_string()),
        }
    }

    pub fn save_integration(&self, integration: &LibraryIntegration) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO integrations (
                provider, account_id, username, avatar_url, is_authenticated,
                import_installed, import_uninstalled, sync_playtime, last_sync,
                access_token, refresh_token
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
            ON CONFLICT(provider) DO UPDATE SET
                account_id = excluded.account_id,
                username = excluded.username,
                avatar_url = excluded.avatar_url,
                is_authenticated = excluded.is_authenticated,
                import_installed = excluded.import_installed,
                import_uninstalled = excluded.import_uninstalled,
                sync_playtime = excluded.sync_playtime,
                last_sync = excluded.last_sync,
                access_token = excluded.access_token,
                refresh_token = excluded.refresh_token",
            params![
                integration.provider,
                integration.account_id,
                integration.username,
                integration.avatar_url,
                if integration.is_authenticated { 1 } else { 0 },
                if integration.import_installed { 1 } else { 0 },
                if integration.import_uninstalled { 1 } else { 0 },
                if integration.sync_playtime { 1 } else { 0 },
                integration.last_sync,
                integration.access_token,
                integration.refresh_token,
            ],
        )
        .map_err(|e| e.to_string())?;

        Ok(())
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT value FROM settings WHERE key = ?1")
            .map_err(|e| e.to_string())?;

        match stmt.query_row(params![key], |row| row.get(0)) {
            Ok(val) => Ok(Some(val)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_settings_by_prefix(&self, prefix: &str) -> Result<std::collections::HashMap<String, String>, String> {
        let conn = self.conn.lock().unwrap();
        let pattern = format!("{}%", prefix);
        let mut stmt = conn
            .prepare("SELECT key, value FROM settings WHERE key LIKE ?1")
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![pattern], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?;

        let mut map = std::collections::HashMap::new();
        for item in rows.flatten() {
            map.insert(item.0, item.1);
        }
        Ok(map)
    }

    pub fn has_portable_config_diff(a: &AppConfig, b: &AppConfig) -> bool {
        let f64_diff = |x: Option<f64>, y: Option<f64>| -> bool {
            match (x, y) {
                (Some(vx), Some(vy)) => (vx - vy).abs() > 1e-6,
                (None, None) => false,
                _ => true,
            }
        };
        let str_eq = |x: &Option<String>, y: &Option<String>| -> bool {
            let sx = x.as_deref().map(|s| s.trim()).unwrap_or("");
            let sy = y.as_deref().map(|s| s.trim()).unwrap_or("");
            sx == sy
        };
        let theme_id_eq = |x: &Option<String>, y: &Option<String>| -> bool {
            let sx = x.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty()).unwrap_or("default");
            let sy = y.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty()).unwrap_or("default");
            sx == sy
        };
        let vec_eq = |x: &Option<Vec<String>>, y: &Option<Vec<String>>| -> bool {
            let vx = x.as_deref().unwrap_or(&[]);
            let vy = y.as_deref().unwrap_or(&[]);
            vx == vy
        };

        !str_eq(&a.view_mode, &b.view_mode)
            || f64_diff(a.card_width, b.card_width)
            || f64_diff(a.grid_width_percent, b.grid_width_percent)
            || !str_eq(&a.status_filter, &b.status_filter)
            || !str_eq(&a.sort_by, &b.sort_by)
            || !str_eq(&a.sort_direction, &b.sort_direction)
            || !str_eq(&a.group_by, &b.group_by)
            || a.show_favorites_only != b.show_favorites_only
            || a.auto_scan_on_startup != b.auto_scan_on_startup
            || a.minimize_on_game_launch != b.minimize_on_game_launch
            || a.close_to_tray != b.close_to_tray
            || !str_eq(&a.last_played_date_format, &b.last_played_date_format)
            || !theme_id_eq(&a.active_theme_id, &b.active_theme_id)
            || !str_eq(&a.theme, &b.theme)
            || a.background_blur != b.background_blur
            || f64_diff(a.background_opacity, b.background_opacity)
            || f64_diff(a.modal_backdrop_opacity, b.modal_backdrop_opacity)
            || a.modal_backdrop_blur != b.modal_backdrop_blur
            || !str_eq(&a.card_border_radius, &b.card_border_radius)
            || a.enable_card_glow != b.enable_card_glow
            || !str_eq(&a.glass_intensity, &b.glass_intensity)
            || !str_eq(&a.accent_color, &b.accent_color)
            || !str_eq(&a.panel_tint, &b.panel_tint)
            || a.trailer_autoplay != b.trailer_autoplay
            || a.trailer_muted != b.trailer_muted
            || !str_eq(&a.steamgriddb_api_key, &b.steamgriddb_api_key)
            || a.steamgriddb_nsfw != b.steamgriddb_nsfw
            || !str_eq(&a.retroachievements_username, &b.retroachievements_username)
            || !str_eq(&a.retroachievements_api_key, &b.retroachievements_api_key)
            || !str_eq(&a.igdb_client_id, &b.igdb_client_id)
            || !str_eq(&a.igdb_client_secret, &b.igdb_client_secret)
            || a.merge_duplicates != b.merge_duplicates
            || !vec_eq(&a.unmerged_game_ids, &b.unmerged_game_ids)
            || a.sync_on_startup != b.sync_on_startup
            || a.periodic_playtime_sync_hours != b.periodic_playtime_sync_hours
            || !str_eq(&a.backup_frequency, &b.backup_frequency)
            || a.backup_retention_count != b.backup_retention_count
            || a.cloud_sync_interval_minutes != b.cloud_sync_interval_minutes
            || a.cloud_sync_on_startup != b.cloud_sync_on_startup
            || a.cloud_sync_on_game_exit != b.cloud_sync_on_game_exit
            || a.cloud_save_retention_count != b.cloud_save_retention_count
            || a.controller_enabled != b.controller_enabled
            || !str_eq(&a.controller_glyph_style, &b.controller_glyph_style)
            || a.controller_nintendo_swap != b.controller_nintendo_swap
            || f64_diff(a.controller_deadzone, b.controller_deadzone)
            || a.controller_suspend_in_game != b.controller_suspend_in_game
            || a.controller_bindings != b.controller_bindings
            || !str_eq(&a.active_console_theme_id, &b.active_console_theme_id)
            || a.start_in_console_mode != b.start_in_console_mode
            || a.console_boot_splash_enabled != b.console_boot_splash_enabled
            || a.console_auto_sign_in != b.console_auto_sign_in
            || a.console_ui_sounds != b.console_ui_sounds
            || f64_diff(a.console_ui_volume, b.console_ui_volume)
            || a.console_bg_music_enabled != b.console_bg_music_enabled
            || f64_diff(a.console_bg_music_volume, b.console_bg_music_volume)
            || a.console_profiles != b.console_profiles
    }

    pub fn get_app_config(&self) -> Result<AppConfig, String> {
        let raw = self.get_setting("app_config")?;
        let mut cfg: AppConfig = match raw {
            Some(json) => serde_json::from_str(&json).unwrap_or_default(),
            None => AppConfig::default(),
        };

        if cfg.steamgriddb_api_key.as_deref().unwrap_or("").trim().is_empty() {
            if let Ok(Some(k)) = self.get_setting("steamgriddb_key") {
                if !k.trim().is_empty() {
                    cfg.steamgriddb_api_key = Some(k);
                }
            }
        }
        if cfg.igdb_client_id.as_deref().unwrap_or("").trim().is_empty() {
            if let Ok(Some(cid)) = self.get_setting("igdb_client_id") {
                if !cid.trim().is_empty() {
                    cfg.igdb_client_id = Some(cid);
                }
            }
        }
        if cfg.igdb_client_secret.as_deref().unwrap_or("").trim().is_empty() {
            if let Ok(Some(csec)) = self.get_setting("igdb_client_secret") {
                if !csec.trim().is_empty() {
                    cfg.igdb_client_secret = Some(csec);
                }
            }
        }
        if cfg.active_theme_id.as_deref().unwrap_or("").trim().is_empty() {
            if let Ok(Some(tid)) = self.get_setting("active_theme_id") {
                if !tid.trim().is_empty() {
                    cfg.active_theme_id = Some(tid);
                }
            }
        }

        // Ensure user defaults are set if missing
        if cfg.auto_scan_on_startup.is_none() {
            cfg.auto_scan_on_startup = Some(true);
        }
        if cfg.trailer_autoplay.is_none() {
            cfg.trailer_autoplay = Some(true);
        }
        if cfg.trailer_muted.is_none() {
            cfg.trailer_muted = Some(true);
        }
        if cfg.merge_duplicates.is_none() {
            cfg.merge_duplicates = Some(true);
        }
        if cfg.unmerged_game_ids.is_none() {
            cfg.unmerged_game_ids = Some(Vec::new());
        }
        if cfg.sync_on_startup.is_none() {
            cfg.sync_on_startup = Some(true);
        }
        if cfg.periodic_playtime_sync_hours.is_none() {
            cfg.periodic_playtime_sync_hours = Some(0);
        }
        if cfg.cloud_save_retention_count.is_none() {
            cfg.cloud_save_retention_count = Some(5);
        }
        if cfg.controller_enabled.is_none() {
            cfg.controller_enabled = Some(true);
        }
        if cfg.controller_glyph_style.is_none() {
            cfg.controller_glyph_style = Some("auto".to_string());
        }
        if cfg.controller_nintendo_swap.is_none() {
            cfg.controller_nintendo_swap = Some(false);
        }
        if cfg.controller_deadzone.is_none() {
            cfg.controller_deadzone = Some(0.18);
        }
        if cfg.controller_suspend_in_game.is_none() {
            cfg.controller_suspend_in_game = Some(true);
        }
        if cfg.active_console_theme_id.as_deref().unwrap_or("").trim().is_empty() {
            if let Ok(Some(cid)) = self.get_setting("active_console_theme_id") {
                if !cid.trim().is_empty() {
                    cfg.active_console_theme_id = Some(cid);
                }
            }
        }
        if cfg.active_console_theme_id.is_none() {
            cfg.active_console_theme_id = Some("console-default".to_string());
        }
        if cfg.start_in_console_mode.is_none() {
            cfg.start_in_console_mode = Some(false);
        }
        if cfg.console_boot_splash_enabled.is_none() {
            cfg.console_boot_splash_enabled = Some(true);
        }
        if cfg.console_boot_video_path.as_deref().map(str::trim).unwrap_or("").is_empty() {
            cfg.console_boot_video_path = Some("/videos/splash boot/OpenPlay_Console_2K.mp4".to_string());
        }
        if cfg.console_auto_sign_in.is_none() {
            cfg.console_auto_sign_in = Some(false);
        }
        if cfg.console_login_bg_video_path.as_deref().map(str::trim).unwrap_or("").is_empty() {
            cfg.console_login_bg_video_path = Some("/videos/login loop/50632-464085910_medium.mp4".to_string());
        }
        if cfg.console_ui_sounds.is_none() {
            cfg.console_ui_sounds = Some(true);
        }
        if cfg.console_ui_volume.is_none() {
            cfg.console_ui_volume = Some(0.45);
        }
        if cfg.console_bg_music_enabled.is_none() {
            cfg.console_bg_music_enabled = Some(true);
        }
        if cfg.console_bg_music_volume.is_none() {
            cfg.console_bg_music_volume = Some(0.25);
        }
        if cfg.console_display_id.is_none() {
            cfg.console_display_id = Some("auto".to_string());
        }
        if cfg.console_audio_output_id.is_none() {
            cfg.console_audio_output_id = Some("auto".to_string());
        }

        Ok(cfg)
    }

    pub fn save_app_config(&self, config: &AppConfig) -> Result<(), String> {
        let baseline = self.get_app_config().unwrap_or_default();
        let portable_changed = Self::has_portable_config_diff(&baseline, config);

        let json = serde_json::to_string(config).map_err(|e| e.to_string())?;
        self.set_setting("app_config", &json)?;
        if let Some(ref key) = config.steamgriddb_api_key {
            let _ = self.set_setting("steamgriddb_key", key);
        }
        if let Some(ref cid) = config.igdb_client_id {
            let _ = self.set_setting("igdb_client_id", cid);
        }
        if let Some(ref csec) = config.igdb_client_secret {
            let _ = self.set_setting("igdb_client_secret", csec);
        }

        if portable_changed {
            let now_utc = chrono::Utc::now().to_rfc3339();
            let _ = self.set_setting("ui_updated_at", &now_utc);
        }
        Ok(())
    }

    pub fn save_app_config_from_sync(&self, config: &AppConfig, ui_updated_at: &str) -> Result<(), String> {
        let json = serde_json::to_string(config).map_err(|e| e.to_string())?;
        self.set_setting("app_config", &json)?;
        if let Some(ref key) = config.steamgriddb_api_key {
            if !key.trim().is_empty() {
                let _ = self.set_setting("steamgriddb_key", key);
            }
        }
        if let Some(ref cid) = config.igdb_client_id {
            if !cid.trim().is_empty() {
                let _ = self.set_setting("igdb_client_id", cid);
            }
        }
        if let Some(ref csec) = config.igdb_client_secret {
            if !csec.trim().is_empty() {
                let _ = self.set_setting("igdb_client_secret", csec);
            }
        }
        if !ui_updated_at.is_empty() {
            let _ = self.set_setting("ui_updated_at", ui_updated_at);
        }
        Ok(())
    }

    pub fn save_game_achievements(&self, game_id: &str, achievements: &[Achievement]) -> Result<(), String> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction().map_err(|e| e.to_string())?;

        for ach in achievements {
            tx.execute(
                "INSERT INTO achievements (
                    game_id, api_name, display_name, description, icon_url, icon_gray_url,
                    is_unlocked, unlock_time, rarity_percentage, is_secret
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                ON CONFLICT(game_id, api_name) DO UPDATE SET
                    display_name = excluded.display_name,
                    description = excluded.description,
                    icon_url = excluded.icon_url,
                    icon_gray_url = excluded.icon_gray_url,
                    is_unlocked = excluded.is_unlocked,
                    unlock_time = excluded.unlock_time,
                    rarity_percentage = excluded.rarity_percentage,
                    is_secret = excluded.is_secret",
                params![
                    game_id,
                    ach.api_name,
                    ach.display_name,
                    ach.description,
                    ach.icon_url,
                    ach.icon_gray_url,
                    ach.is_unlocked as i32,
                    ach.unlock_time,
                    ach.rarity_percentage,
                    ach.is_secret as i32,
                ],
            ).map_err(|e| e.to_string())?;
        }

        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_game_achievements(&self, game_id: &str) -> Result<Vec<Achievement>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT game_id, api_name, display_name, description, icon_url, icon_gray_url,
                    is_unlocked, unlock_time, rarity_percentage, is_secret
             FROM achievements
             WHERE game_id = ?1
             ORDER BY is_unlocked DESC, rarity_percentage ASC, display_name ASC"
        ).map_err(|e| e.to_string())?;

        let rows = stmt.query_map(params![game_id], |row| {
            Ok(Achievement {
                game_id: row.get(0)?,
                api_name: row.get(1)?,
                display_name: row.get(2)?,
                description: row.get(3)?,
                icon_url: row.get(4)?,
                icon_gray_url: row.get(5)?,
                is_unlocked: row.get::<_, i32>(6)? != 0,
                unlock_time: row.get(7)?,
                rarity_percentage: row.get(8)?,
                is_secret: row.get::<_, i32>(9)? != 0,
            })
        }).map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for item in rows {
            list.push(item.map_err(|e| e.to_string())?);
        }
        Ok(list)
    }

    pub fn get_all_achievements(&self) -> Result<Vec<Achievement>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT game_id, api_name, display_name, description, icon_url, icon_gray_url,
                    is_unlocked, unlock_time, rarity_percentage, is_secret
             FROM achievements
             ORDER BY game_id ASC, is_unlocked DESC, display_name ASC"
        ).map_err(|e| e.to_string())?;

        let rows = stmt.query_map([], |row| {
            Ok(Achievement {
                game_id: row.get(0)?,
                api_name: row.get(1)?,
                display_name: row.get(2)?,
                description: row.get(3)?,
                icon_url: row.get(4)?,
                icon_gray_url: row.get(5)?,
                is_unlocked: row.get::<_, i32>(6)? != 0,
                unlock_time: row.get(7)?,
                rarity_percentage: row.get(8)?,
                is_secret: row.get::<_, i32>(9)? != 0,
            })
        }).map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for item in rows {
            list.push(item.map_err(|e| e.to_string())?);
        }
        Ok(list)
    }

    pub fn get_game_achievement_summary(&self, game: &Game) -> Result<GameAchievementSummary, String> {
        let achievements = self.get_game_achievements(&game.id)?;
        let total = achievements.len();
        let mut unlocked_list: Vec<Achievement> = achievements.iter().filter(|a| a.is_unlocked).cloned().collect();
        let unlocked = unlocked_list.len();
        let completion_percentage = if total > 0 {
            (unlocked as f64 / total as f64) * 100.0
        } else {
            0.0
        };
        let is_perfect = total > 0 && unlocked == total;

        // Sort unlocked by unlock_time descending
        unlocked_list.sort_by(|a, b| b.unlock_time.cmp(&a.unlock_time));
        let latest_unlocked = unlocked_list.first().cloned();
        let recent_unlocked = if unlocked_list.len() > 1 {
            unlocked_list.into_iter().skip(1).take(4).collect()
        } else {
            Vec::new()
        };

        // Upcoming locked: sort locked achievements by rarity percentage descending (easiest next unlocks first)
        let mut locked_list: Vec<Achievement> = achievements.iter().filter(|a| !a.is_unlocked).cloned().collect();
        locked_list.sort_by(|a, b| b.rarity_percentage.partial_cmp(&a.rarity_percentage).unwrap_or(std::cmp::Ordering::Equal));
        let upcoming_locked = locked_list.into_iter().take(5).collect();

        Ok(GameAchievementSummary {
            game_id: game.id.clone(),
            game_title: game.title.clone(),
            cover_image: game.cover_image.clone(),
            total_achievements: total,
            unlocked_achievements: unlocked,
            completion_percentage,
            is_perfect,
            latest_unlocked,
            recent_unlocked,
            upcoming_locked,
        })
    }

    pub fn get_hunter_profile(&self, all_games: &[Game]) -> Result<HunterProfile, String> {
        let all_achs = self.get_all_achievements()?;
        let mut ach_map: std::collections::HashMap<String, Vec<Achievement>> = std::collections::HashMap::new();
        for ach in all_achs {
            ach_map.entry(ach.game_id.clone()).or_default().push(ach);
        }

        let mut total_score: u64 = 0;
        let mut total_achievements_count: usize = 0;
        let mut unlocked_achievements_count: usize = 0;
        let mut perfect_games_count: usize = 0;
        let mut all_unlocked_achievements: Vec<Achievement> = Vec::new();
        let mut games_summaries: Vec<GameAchievementSummary> = Vec::new();
        let mut games_with_achievements_count: usize = 0;
        let mut total_completion_sum: f64 = 0.0;

        for game in all_games {
            let Some(achievements) = ach_map.remove(&game.id) else {
                continue;
            };
            let total = achievements.len();
            if total == 0 {
                continue;
            }

            let mut unlocked_list: Vec<Achievement> = achievements.iter().filter(|a| a.is_unlocked).cloned().collect();
            let unlocked = unlocked_list.len();
            let completion_percentage = (unlocked as f64 / total as f64) * 100.0;
            let is_perfect = unlocked == total;

            unlocked_list.sort_by(|a, b| b.unlock_time.cmp(&a.unlock_time));
            let latest_unlocked = unlocked_list.first().cloned();
            let recent_unlocked = if unlocked_list.len() > 1 {
                unlocked_list.iter().skip(1).take(4).cloned().collect()
            } else {
                Vec::new()
            };

            let mut locked_list: Vec<Achievement> = achievements.iter().filter(|a| !a.is_unlocked).cloned().collect();
            locked_list.sort_by(|a, b| b.rarity_percentage.partial_cmp(&a.rarity_percentage).unwrap_or(std::cmp::Ordering::Equal));
            let upcoming_locked = locked_list.into_iter().take(5).collect();

            let summary = GameAchievementSummary {
                game_id: game.id.clone(),
                game_title: game.title.clone(),
                cover_image: game.cover_image.clone(),
                total_achievements: total,
                unlocked_achievements: unlocked,
                completion_percentage,
                is_perfect,
                latest_unlocked,
                recent_unlocked,
                upcoming_locked,
            };

            let is_untouched = unlocked == 0;
            if !is_untouched {
                games_with_achievements_count += 1;
                total_completion_sum += completion_percentage;
                total_achievements_count += total;
                unlocked_achievements_count += unlocked;

                if is_perfect {
                    perfect_games_count += 1;
                    total_score += 250;
                }

                for ach in unlocked_list {
                    let pts = if ach.rarity_percentage > 0.0 && ach.rarity_percentage < 10.0 {
                        100
                    } else if ach.rarity_percentage >= 10.0 && ach.rarity_percentage < 20.0 {
                        50
                    } else if ach.rarity_percentage >= 20.0 && ach.rarity_percentage < 50.0 {
                        25
                    } else {
                        10
                    };
                    total_score += pts;
                    all_unlocked_achievements.push(ach);
                }
            }

            games_summaries.push(summary);
        }

        // Sort unlocked achievements by global rarity percentage (rarest first).
        // Only consider achievements with genuine measured rarity (> 0.0).
        // Achievements with 0.0% have missing or unrated telemetry, and must never be prioritized as the rarest.
        let mut measured_unlocked: Vec<Achievement> = all_unlocked_achievements
            .iter()
            .filter(|a| a.rarity_percentage > 0.0)
            .cloned()
            .collect();
        measured_unlocked.sort_by(|a, b| {
            a.rarity_percentage
                .partial_cmp(&b.rarity_percentage)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        let rarest_achievements: Vec<Achievement> = if !measured_unlocked.is_empty() {
            measured_unlocked.into_iter().take(5).collect()
        } else {
            // Fallback: If no achievements have percentage data yet, show recently unlocked trophies
            let mut recent = all_unlocked_achievements;
            recent.sort_by(|a, b| {
                b.unlock_time
                    .as_deref()
                    .unwrap_or("")
                    .cmp(a.unlock_time.as_deref().unwrap_or(""))
            });
            recent.into_iter().take(5).collect()
        };

        // Almost there games: completion percentage between 70.0% and 99.9%
        let mut almost_there_games: Vec<GameAchievementSummary> = games_summaries
            .iter()
            .filter(|s| s.completion_percentage >= 70.0 && s.completion_percentage < 100.0)
            .cloned()
            .collect();
        almost_there_games.sort_by(|a, b| {
            b.completion_percentage
                .partial_cmp(&a.completion_percentage)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        // Calculate Level
        // Level curve: Level 1 = 0 pts. Level N requires (N - 1)^2 * 120 pts
        let level = ((total_score as f64 / 120.0).sqrt() as u32) + 1;
        let current_level_xp = ((level - 1) as f64).powi(2) as u64 * 120;
        let next_level_xp = (level as f64).powi(2) as u64 * 120;
        let level_progress_percent = if next_level_xp > current_level_xp {
            (((total_score.saturating_sub(current_level_xp)) as f64)
                / ((next_level_xp - current_level_xp) as f64)
                * 100.0)
                .clamp(0.0, 100.0)
        } else {
            100.0
        };

        let average_completion_percent = if games_with_achievements_count > 0 {
            total_completion_sum / games_with_achievements_count as f64
        } else {
            0.0
        };

        // Sort game summaries by completion_percentage descending
        games_summaries.sort_by(|a, b| {
            b.completion_percentage
                .partial_cmp(&a.completion_percentage)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        Ok(HunterProfile {
            level,
            total_score,
            current_level_xp,
            next_level_xp,
            level_progress_percent,
            total_achievements_count,
            unlocked_achievements_count,
            average_completion_percent,
            perfect_games_count,
            rarest_achievements,
            almost_there_games,
            games_summaries,
        })
    }

    pub fn get_emulator_profiles(&self) -> Result<Vec<EmulatorProfile>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT id, name, emulator_type, executable_path, arguments_template, selected_core, supported_platforms, is_installed FROM emulators ORDER BY name ASC")
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                let platforms_json: String = row.get(6).unwrap_or_else(|_| "[]".to_string());
                let supported_platforms: Vec<String> = serde_json::from_str(&platforms_json).unwrap_or_default();
                let is_installed_int: i32 = row.get(7).unwrap_or(1);

                Ok(EmulatorProfile {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    emulator_type: row.get(2)?,
                    executable_path: row.get(3)?,
                    arguments_template: row.get(4)?,
                    selected_core: row.get(5)?,
                    supported_platforms,
                    is_installed: is_installed_int != 0,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for r in rows {
            if let Ok(p) = r {
                list.push(p);
            }
        }
        Ok(list)
    }

    pub fn get_emulator_profile(&self, id: &str) -> Result<Option<EmulatorProfile>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT id, name, emulator_type, executable_path, arguments_template, selected_core, supported_platforms, is_installed FROM emulators WHERE id = ?1")
            .map_err(|e| e.to_string())?;

        let mut rows = stmt
            .query_map(params![id], |row| {
                let platforms_json: String = row.get(6).unwrap_or_else(|_| "[]".to_string());
                let supported_platforms: Vec<String> = serde_json::from_str(&platforms_json).unwrap_or_default();
                let is_installed_int: i32 = row.get(7).unwrap_or(1);

                Ok(EmulatorProfile {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    emulator_type: row.get(2)?,
                    executable_path: row.get(3)?,
                    arguments_template: row.get(4)?,
                    selected_core: row.get(5)?,
                    supported_platforms,
                    is_installed: is_installed_int != 0,
                })
            })
            .map_err(|e| e.to_string())?;

        if let Some(Ok(profile)) = rows.next() {
            Ok(Some(profile))
        } else {
            Ok(None)
        }
    }

    pub fn save_emulator_profile(&self, profile: &EmulatorProfile) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        let platforms_json = serde_json::to_string(&profile.supported_platforms).unwrap_or_else(|_| "[]".to_string());

        conn.execute(
            "INSERT INTO emulators (
                id, name, emulator_type, executable_path, arguments_template, selected_core, supported_platforms, is_installed
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                emulator_type = excluded.emulator_type,
                executable_path = excluded.executable_path,
                arguments_template = excluded.arguments_template,
                selected_core = excluded.selected_core,
                supported_platforms = excluded.supported_platforms,
                is_installed = excluded.is_installed",
            params![
                profile.id,
                profile.name,
                profile.emulator_type,
                profile.executable_path,
                profile.arguments_template,
                profile.selected_core,
                platforms_json,
                if profile.is_installed { 1 } else { 0 },
            ],
        ).map_err(|e| e.to_string())?;

        Ok(())
    }

    pub fn delete_emulator_profile(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM emulators WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_configured_consoles(&self) -> Result<Vec<ConfiguredConsole>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT id, console_id, name, manufacturer, emulator_name, emulator_type, executable_path, core_name, rom_directory, arguments_template, extensions, created_at FROM configured_consoles ORDER BY name ASC")
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                let extensions_json: String = row.get(10).unwrap_or_else(|_| "[]".to_string());
                let extensions: Vec<String> = serde_json::from_str(&extensions_json).unwrap_or_default();

                Ok(ConfiguredConsole {
                    id: row.get(0)?,
                    console_id: row.get(1)?,
                    name: row.get(2)?,
                    manufacturer: row.get(3)?,
                    emulator_name: row.get(4)?,
                    emulator_type: row.get(5)?,
                    executable_path: row.get(6)?,
                    core_name: row.get(7)?,
                    rom_directory: row.get(8)?,
                    arguments_template: row.get(9)?,
                    extensions,
                    created_at: row.get(11)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut consoles = Vec::new();
        for r in rows {
            if let Ok(c) = r {
                consoles.push(c);
            }
        }
        Ok(consoles)
    }

    pub fn get_configured_console(&self, id: &str) -> Result<Option<ConfiguredConsole>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT id, console_id, name, manufacturer, emulator_name, emulator_type, executable_path, core_name, rom_directory, arguments_template, extensions, created_at FROM configured_consoles WHERE id = ?1 LIMIT 1")
            .map_err(|e| e.to_string())?;

        let mut rows = stmt
            .query_map(params![id], |row| {
                let extensions_json: String = row.get(10).unwrap_or_else(|_| "[]".to_string());
                let extensions: Vec<String> = serde_json::from_str(&extensions_json).unwrap_or_default();

                Ok(ConfiguredConsole {
                    id: row.get(0)?,
                    console_id: row.get(1)?,
                    name: row.get(2)?,
                    manufacturer: row.get(3)?,
                    emulator_name: row.get(4)?,
                    emulator_type: row.get(5)?,
                    executable_path: row.get(6)?,
                    core_name: row.get(7)?,
                    rom_directory: row.get(8)?,
                    arguments_template: row.get(9)?,
                    extensions,
                    created_at: row.get(11)?,
                })
            })
            .map_err(|e| e.to_string())?;

        if let Some(Ok(c)) = rows.next() {
            Ok(Some(c))
        } else {
            Ok(None)
        }
    }

    pub fn save_configured_console(&self, console: &ConfiguredConsole) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        let extensions_json = serde_json::to_string(&console.extensions).unwrap_or_else(|_| "[]".to_string());

        conn.execute(
            "INSERT INTO configured_consoles (
                id, console_id, name, manufacturer, emulator_name, emulator_type, executable_path, core_name, rom_directory, arguments_template, extensions, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
            ON CONFLICT(id) DO UPDATE SET
                console_id = excluded.console_id,
                name = excluded.name,
                manufacturer = excluded.manufacturer,
                emulator_name = excluded.emulator_name,
                emulator_type = excluded.emulator_type,
                executable_path = excluded.executable_path,
                core_name = excluded.core_name,
                rom_directory = excluded.rom_directory,
                arguments_template = excluded.arguments_template,
                extensions = excluded.extensions,
                created_at = excluded.created_at",
            params![
                console.id,
                console.console_id,
                console.name,
                console.manufacturer,
                console.emulator_name,
                console.emulator_type,
                console.executable_path,
                console.core_name,
                console.rom_directory,
                console.arguments_template,
                extensions_json,
                console.created_at,
            ],
        ).map_err(|e| e.to_string())?;

        Ok(())
    }

    pub fn delete_configured_console(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM configured_consoles WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    // ==========================================
    // BACKUPS & SNAPSHOTS ENGINE (PHASE 1)
    // ==========================================

    pub fn get_backups_dir() -> PathBuf {
        let dir = dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("OpenPlay")
            .join("backups");
        let _ = fs::create_dir_all(&dir);
        dir
    }

    pub fn create_backup(&self, custom_name: Option<String>, is_automatic: bool) -> Result<BackupInfo, String> {
        let backups_dir = Self::get_backups_dir();
        let now = chrono::Local::now();
        let timestamp_str = now.format("%Y-%m-%d_%H-%M-%S").to_string();
        let display_created_at = now.format("%Y-%m-%d %H:%M").to_string();

        let filename = match custom_name {
            Some(name) if !name.trim().is_empty() => {
                let safe_name = name.trim().replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");
                format!("{}_{}.db", safe_name, timestamp_str)
            }
            _ => {
                if is_automatic {
                    format!("auto_backup_{}.db", timestamp_str)
                } else {
                    format!("manual_backup_{}.db", timestamp_str)
                }
            }
        };

        let target_path = backups_dir.join(&filename);
        let target_path_str = target_path.to_string_lossy().to_string();

        if target_path.exists() {
            let _ = fs::remove_file(&target_path);
        }

        let game_count = {
            let conn = self.conn.lock().unwrap();
            conn.execute("VACUUM INTO ?1", params![&target_path_str])
                .map_err(|e| format!("VACUUM INTO failed: {}", e))?;

            let count: u32 = conn
                .query_row("SELECT count(*) FROM games", [], |r| r.get(0))
                .unwrap_or(0);
            count
        };

        let size_bytes = fs::metadata(&target_path)
            .map(|m| m.len())
            .unwrap_or(0);

        Ok(BackupInfo {
            filename,
            file_path: target_path_str,
            size_bytes,
            created_at: display_created_at,
            game_count,
            is_automatic,
        })
    }

    pub fn list_backups(&self) -> Result<Vec<BackupInfo>, String> {
        let backups_dir = Self::get_backups_dir();
        let mut backups = Vec::new();

        if let Ok(entries) = fs::read_dir(backups_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                        if ext.eq_ignore_ascii_case("db") {
                            let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
                            let is_automatic = filename.starts_with("auto_");

                            let metadata = match fs::metadata(&path) {
                                Ok(m) => m,
                                Err(_) => continue,
                            };
                            let size_bytes = metadata.len();

                            let created_at = if let Ok(created) = metadata.created() {
                                let dt: chrono::DateTime<chrono::Local> = created.into();
                                dt.format("%Y-%m-%d %H:%M").to_string()
                            } else if let Ok(modified) = metadata.modified() {
                                let dt: chrono::DateTime<chrono::Local> = modified.into();
                                dt.format("%Y-%m-%d %H:%M").to_string()
                            } else {
                                "Unknown".to_string()
                            };

                            let game_count = if let Ok(test_conn) = Connection::open(&path) {
                                test_conn
                                    .query_row("SELECT count(*) FROM games", [], |r| r.get(0))
                                    .unwrap_or(0)
                            } else {
                                0
                            };

                            backups.push(BackupInfo {
                                filename,
                                file_path: path.to_string_lossy().to_string(),
                                size_bytes,
                                created_at,
                                game_count,
                                is_automatic,
                            });
                        }
                    }
                }
            }
        }

        backups.sort_by(|a, b| b.filename.cmp(&a.filename));
        Ok(backups)
    }

    pub fn delete_backup(&self, filename: &str) -> Result<(), String> {
        let backups_dir = Self::get_backups_dir();
        let safe_name = Path::new(filename).file_name().and_then(|n| n.to_str()).unwrap_or("");
        if safe_name.is_empty() {
            return Err("Invalid backup filename".to_string());
        }
        let target = backups_dir.join(safe_name);
        if target.exists() {
            fs::remove_file(target).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn prune_backups(&self, keep_count: usize) -> Result<usize, String> {
        if keep_count == 0 {
            return Ok(0);
        }
        let all = self.list_backups()?;
        let auto_backups: Vec<&BackupInfo> = all.iter().filter(|b| b.is_automatic).collect();
        if auto_backups.len() <= keep_count {
            return Ok(0);
        }

        let mut removed = 0;
        for old_backup in auto_backups.into_iter().skip(keep_count) {
            if self.delete_backup(&old_backup.filename).is_ok() {
                removed += 1;
            }
        }
        Ok(removed)
    }

    pub fn restore_backup(&self, filename_or_path: &str) -> Result<(), String> {
        let backups_dir = Self::get_backups_dir();
        let target_path = if Path::new(filename_or_path).is_absolute() {
            PathBuf::from(filename_or_path)
        } else {
            let safe_name = Path::new(filename_or_path).file_name().and_then(|n| n.to_str()).unwrap_or("");
            backups_dir.join(safe_name)
        };

        if !target_path.exists() {
            return Err(format!("Backup file not found: {}", target_path.display()));
        }

        let src_conn = Connection::open(&target_path)
            .map_err(|e| format!("Selected backup is not a valid SQLite database: {}", e))?;

        let valid_table: bool = src_conn
            .query_row(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='games'",
                [],
                |_| Ok(true),
            )
            .unwrap_or(false);

        if !valid_table {
            return Err("Backup file does not contain a valid 'games' table".to_string());
        }

        // Create safety pre-restore backup
        let _ = self.create_backup(Some("pre_restore_safety".to_string()), false);

        // Perform live online restore
        {
            let mut dst_conn = self.conn.lock().unwrap();
            let backup = rusqlite::backup::Backup::new(&src_conn, &mut dst_conn)
                .map_err(|e| format!("Failed to initiate restore backup: {}", e))?;

            backup
                .run_to_completion(10, std::time::Duration::from_millis(25), None)
                .map_err(|e| format!("Restore operation failed: {}", e))?;
        }

        // Apply any migrations
        self.init_tables().map_err(|e| format!("Post-restore migration check failed: {}", e))?;

        Ok(())
    }

    // --- Game Save Locations & Cloud Save State (Device-Local Config + Rule Cache) ---

    pub fn get_game_save_config(&self, game_id: &str) -> Result<GameSaveConfig, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare(
                "SELECT game_id, custom_save_paths, custom_config_paths, last_synced_save_hash,
                        last_synced_snapshot_id, last_synced_at, updated_at
                 FROM game_save_configs WHERE game_id = ?1",
            )
            .map_err(|e| e.to_string())?;

        match stmt.query_row(params![game_id], |row| {
            let save_json: String = row.get(1)?;
            let cfg_json: String = row.get(2)?;
            Ok(GameSaveConfig {
                game_id: row.get(0)?,
                custom_save_paths: serde_json::from_str(&save_json).unwrap_or_default(),
                custom_config_paths: serde_json::from_str(&cfg_json).unwrap_or_default(),
                last_synced_save_hash: row.get(3)?,
                last_synced_snapshot_id: row.get(4)?,
                last_synced_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        }) {
            Ok(cfg) => Ok(cfg),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(GameSaveConfig {
                game_id: game_id.to_string(),
                ..Default::default()
            }),
            Err(e) => Err(e.to_string()),
        }
    }

    pub fn save_game_save_config(&self, cfg: &GameSaveConfig) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        let save_json = serde_json::to_string(&cfg.custom_save_paths).unwrap_or_else(|_| "[]".to_string());
        let cfg_json = serde_json::to_string(&cfg.custom_config_paths).unwrap_or_else(|_| "[]".to_string());
        let now_utc = chrono::Utc::now().to_rfc3339();
        let updated = if cfg.updated_at.trim().is_empty() {
            now_utc
        } else {
            cfg.updated_at.clone()
        };

        conn.execute(
            "INSERT INTO game_save_configs (
                game_id, custom_save_paths, custom_config_paths, last_synced_save_hash,
                last_synced_snapshot_id, last_synced_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            ON CONFLICT(game_id) DO UPDATE SET
                custom_save_paths = excluded.custom_save_paths,
                custom_config_paths = excluded.custom_config_paths,
                last_synced_save_hash = excluded.last_synced_save_hash,
                last_synced_snapshot_id = excluded.last_synced_snapshot_id,
                last_synced_at = excluded.last_synced_at,
                updated_at = excluded.updated_at",
            params![
                cfg.game_id,
                save_json,
                cfg_json,
                cfg.last_synced_save_hash,
                cfg.last_synced_snapshot_id,
                cfg.last_synced_at,
                updated,
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn update_game_cloud_save_settings(
        &self,
        game_id: &str,
        enabled: bool,
        retention_override: Option<u32>,
    ) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        let now_utc = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE games
             SET cloud_save_enabled = ?1, cloud_save_retention_override = ?2, updated_at = ?3
             WHERE id = ?4",
            params![
                if enabled { 1 } else { 0 },
                retention_override.map(|v| v as i64),
                &now_utc,
                game_id,
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn update_game_last_synced_save(
        &self,
        game_id: &str,
        save_hash: &str,
        snapshot_id: &str,
    ) -> Result<(), String> {
        let mut cfg = self.get_game_save_config(game_id)?;
        let now_utc = chrono::Utc::now().to_rfc3339();
        cfg.last_synced_save_hash = Some(save_hash.to_string());
        cfg.last_synced_snapshot_id = Some(snapshot_id.to_string());
        cfg.last_synced_at = Some(now_utc.clone());
        cfg.updated_at = now_utc;
        self.save_game_save_config(&cfg)
    }

    pub fn get_save_location_cache(&self, cache_key: &str) -> Result<Option<SaveLocationCacheEntry>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT cache_key, pcgw_page, raw_rules_json, fetched_at FROM save_location_cache WHERE cache_key = ?1")
            .map_err(|e| e.to_string())?;

        match stmt.query_row(params![cache_key], |row| {
            let raw_json: String = row.get(2)?;
            let rules: Vec<SaveLocationRule> = serde_json::from_str(&raw_json).unwrap_or_default();
            Ok(SaveLocationCacheEntry {
                cache_key: row.get(0)?,
                pcgw_page: row.get(1)?,
                rules,
                fetched_at: row.get(3)?,
            })
        }) {
            Ok(entry) => Ok(Some(entry)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    pub fn upsert_save_location_cache(&self, entry: &SaveLocationCacheEntry) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        let raw_json = serde_json::to_string(&entry.rules).unwrap_or_else(|_| "[]".to_string());
        conn.execute(
            "INSERT INTO save_location_cache (cache_key, pcgw_page, raw_rules_json, fetched_at)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(cache_key) DO UPDATE SET
                 pcgw_page = excluded.pcgw_page,
                 raw_rules_json = excluded.raw_rules_json,
                 fetched_at = excluded.fetched_at",
            params![entry.cache_key, entry.pcgw_page, raw_json, entry.fetched_at],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }
}


