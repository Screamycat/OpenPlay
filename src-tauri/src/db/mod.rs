use crate::models::{
    Achievement, AppConfig, Game, GameAchievementSummary, GameLink, GameTrailer, HunterProfile,
    LibraryIntegration,
};
use rusqlite::{params, Connection, Result};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new() -> Result<Self, String> {
        let db_dir = dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("OpenPlay");

        fs::create_dir_all(&db_dir).map_err(|e| e.to_string())?;
        let db_path = db_dir.join("openplay.db");

        let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
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

        // Normalize date_added formats to clean YYYY-MM-DD and strip broken replacement chars in titles
        let _ = conn.execute("UPDATE games SET date_added = SUBSTR(date_added, 1, 10) WHERE date_added LIKE '%T%'", []);
        let _ = conn.execute("UPDATE games SET title = REPLACE(title, char(65533), '') WHERE title LIKE '%' || char(65533) || '%'", []);

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

        Ok(())
    }

    pub fn get_all_games(&self) -> Result<Vec<Game>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT 
                id, title, sorting_title, source, source_id, install_directory, executable_path,
                launch_arguments, is_installed, is_favorite, cover_image, background_image,
                logo_image, icon_image, developer, publisher, release_date, genres, features,
                platforms, community_score, user_rating, playtime_seconds, last_played,
                date_added, completion_status, description, notes, links, screenshots, size_on_disk,
                trailers, age_rating, critic_score, series, hltb_main, hltb_extra, hltb_completionist,
                tags, categories, region, play_count, is_hidden, play_actions
            FROM games ORDER BY title ASC")
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
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
                })
            })
            .map_err(|e| e.to_string())?;

        let mut games = Vec::new();
        for r in rows {
            if let Ok(g) = r {
                games.push(g);
            }
        }
        Ok(games)
    }

    pub fn upsert_game(&self, game: &Game) -> Result<(), String> {
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

        conn.execute(
            "INSERT INTO games (
                id, title, sorting_title, source, source_id, install_directory, executable_path,
                launch_arguments, is_installed, is_favorite, cover_image, background_image,
                logo_image, icon_image, developer, publisher, release_date, genres, features,
                platforms, community_score, user_rating, playtime_seconds, last_played,
                date_added, completion_status, description, notes, links, screenshots, size_on_disk,
                trailers, age_rating, critic_score, series, hltb_main, hltb_extra, hltb_completionist,
                tags, categories, region, play_count, is_hidden, play_actions
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16,
                ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31,
                ?32, ?33, ?34, ?35, ?36, ?37, ?38, ?39, ?40, ?41, ?42, ?43, ?44
            ) ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                sorting_title = COALESCE(excluded.sorting_title, games.sorting_title),
                source = excluded.source,
                source_id = COALESCE(excluded.source_id, games.source_id),
                install_directory = COALESCE(excluded.install_directory, games.install_directory),
                executable_path = COALESCE(excluded.executable_path, games.executable_path),
                launch_arguments = COALESCE(excluded.launch_arguments, games.launch_arguments),
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
                developer = COALESCE(excluded.developer, games.developer),
                publisher = COALESCE(excluded.publisher, games.publisher),
                release_date = COALESCE(excluded.release_date, games.release_date),
                genres = CASE WHEN excluded.genres != '[]' THEN excluded.genres ELSE games.genres END,
                features = CASE WHEN excluded.features != '[]' THEN excluded.features ELSE games.features END,
                platforms = CASE WHEN excluded.platforms != '[]' THEN excluded.platforms ELSE games.platforms END,
                community_score = COALESCE(excluded.community_score, games.community_score),
                playtime_seconds = CASE WHEN excluded.playtime_seconds > 0 THEN excluded.playtime_seconds ELSE games.playtime_seconds END,
                last_played = COALESCE(excluded.last_played, games.last_played),
                date_added = COALESCE(games.date_added, excluded.date_added),
                description = CASE WHEN games.description IS NOT NULL AND trim(games.description) != '' THEN games.description ELSE excluded.description END,
                links = CASE WHEN excluded.links != '[]' THEN excluded.links ELSE games.links END,
                screenshots = CASE WHEN excluded.screenshots != '[]' THEN excluded.screenshots ELSE games.screenshots END,
                size_on_disk = COALESCE(excluded.size_on_disk, games.size_on_disk),
                trailers = CASE WHEN games.trailers IS NOT NULL AND games.trailers != '[]' THEN games.trailers ELSE excluded.trailers END,
                age_rating = COALESCE(excluded.age_rating, games.age_rating),
                critic_score = COALESCE(excluded.critic_score, games.critic_score),
                series = COALESCE(excluded.series, games.series),
                hltb_main = COALESCE(excluded.hltb_main, games.hltb_main),
                hltb_extra = COALESCE(excluded.hltb_extra, games.hltb_extra),
                hltb_completionist = COALESCE(excluded.hltb_completionist, games.hltb_completionist),
                tags = CASE WHEN excluded.tags != '[]' THEN excluded.tags ELSE games.tags END,
                categories = CASE WHEN excluded.categories != '[]' THEN excluded.categories ELSE games.categories END,
                region = COALESCE(excluded.region, games.region),
                play_count = COALESCE(excluded.play_count, games.play_count),
                is_hidden = COALESCE(excluded.is_hidden, games.is_hidden),
                play_actions = CASE WHEN excluded.play_actions != '[]' THEN excluded.play_actions ELSE games.play_actions END",
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
                play_actions = ?43
            WHERE id = ?44",
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
                game.id,
            ],
        ).map_err(|e| e.to_string())?;

        if rows_affected == 0 {
            drop(conn);
            return self.upsert_game(game);
        }

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
        conn.execute(
            "UPDATE games SET is_favorite = ?1 WHERE id = ?2",
            params![new_state, id],
        )
        .map_err(|e| e.to_string())?;

        Ok(new_state == 1)
    }

    pub fn update_playtime(&self, id: &str, add_seconds: u64, last_played_iso: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE games SET playtime_seconds = playtime_seconds + ?1, last_played = ?2 WHERE id = ?3",
            params![add_seconds as i64, last_played_iso, id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_game(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM games WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
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

    pub fn get_app_config(&self) -> Result<AppConfig, String> {
        let raw = self.get_setting("app_config")?;
        let mut cfg: AppConfig = match raw {
            Some(json) => serde_json::from_str(&json).unwrap_or_default(),
            None => {
                let sgdb_key = self.get_setting("steamgriddb_key")?;
                let mut c = AppConfig::default();
                c.steamgriddb_api_key = sgdb_key;
                c
            }
        };

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

        Ok(cfg)
    }

    pub fn save_app_config(&self, config: &AppConfig) -> Result<(), String> {
        let json = serde_json::to_string(config).map_err(|e| e.to_string())?;
        self.set_setting("app_config", &json)?;
        if let Some(ref key) = config.steamgriddb_api_key {
            let _ = self.set_setting("steamgriddb_key", key);
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
        let mut total_score: u64 = 0;
        let mut total_achievements_count: usize = 0;
        let mut unlocked_achievements_count: usize = 0;
        let mut perfect_games_count: usize = 0;
        let mut all_unlocked_achievements: Vec<Achievement> = Vec::new();
        let mut games_summaries: Vec<GameAchievementSummary> = Vec::new();
        let mut games_with_achievements_count: usize = 0;
        let mut total_completion_sum: f64 = 0.0;

        for game in all_games {
            let summary = self.get_game_achievement_summary(game)?;
            if summary.total_achievements > 0 {
                games_with_achievements_count += 1;
                total_completion_sum += summary.completion_percentage;
                total_achievements_count += summary.total_achievements;
                unlocked_achievements_count += summary.unlocked_achievements;

                if summary.is_perfect {
                    perfect_games_count += 1;
                    total_score += 250; // Perfect game bonus!
                }

                // Add points for each unlocked achievement based on rarity
                let achs = self.get_game_achievements(&game.id)?;
                for ach in achs {
                    if ach.is_unlocked {
                        let pts = if ach.rarity_percentage < 10.0 {
                            100 // Ultra Rare
                        } else if ach.rarity_percentage < 20.0 {
                            50  // Rare
                        } else if ach.rarity_percentage < 50.0 {
                            25  // Uncommon
                        } else {
                            10  // Common
                        };
                        total_score += pts;
                        all_unlocked_achievements.push(ach);
                    }
                }

                games_summaries.push(summary);
            }
        }

        // Sort all unlocked by global rarity percentage ascending (rarest first)
        all_unlocked_achievements.sort_by(|a, b| {
            a.rarity_percentage
                .partial_cmp(&b.rarity_percentage)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        let rarest_achievements = all_unlocked_achievements.into_iter().take(5).collect();

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
}
