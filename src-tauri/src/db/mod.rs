use crate::models::{Game, GameLink, GameTrailer, LibraryIntegration};
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
                last_sync TEXT
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )",
            [],
        )?;

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
                tags, categories, region, play_count
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

                let genres: Vec<String> = serde_json::from_str(&genres_json).unwrap_or_default();
                let features: Vec<String> = serde_json::from_str(&features_json).unwrap_or_default();
                let platforms: Vec<String> = serde_json::from_str(&platforms_json).unwrap_or_default();
                let links: Vec<GameLink> = serde_json::from_str(&links_json).unwrap_or_default();
                let screenshots: Vec<String> = serde_json::from_str(&screenshots_json).unwrap_or_default();
                let trailers: Vec<GameTrailer> = serde_json::from_str(&trailers_json).unwrap_or_default();
                let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();
                let categories: Vec<String> = serde_json::from_str(&categories_json).unwrap_or_default();

                let is_installed_int: i32 = row.get(8)?;
                let is_favorite_int: i32 = row.get(9)?;

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

        conn.execute(
            "INSERT INTO games (
                id, title, sorting_title, source, source_id, install_directory, executable_path,
                launch_arguments, is_installed, is_favorite, cover_image, background_image,
                logo_image, icon_image, developer, publisher, release_date, genres, features,
                platforms, community_score, user_rating, playtime_seconds, last_played,
                date_added, completion_status, description, notes, links, screenshots, size_on_disk,
                trailers, age_rating, critic_score, series, hltb_main, hltb_extra, hltb_completionist,
                tags, categories, region, play_count
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16,
                ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31,
                ?32, ?33, ?34, ?35, ?36, ?37, ?38, ?39, ?40, ?41, ?42
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
                play_count = COALESCE(excluded.play_count, games.play_count)",
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

        conn.execute(
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
                play_count = ?41
            WHERE id = ?42",
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
                game.id,
            ],
        ).map_err(|e| e.to_string())?;
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
            .prepare("SELECT provider, account_id, username, avatar_url, is_authenticated, import_installed, import_uninstalled, sync_playtime, last_sync FROM integrations WHERE provider = ?1")
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
                import_installed, import_uninstalled, sync_playtime, last_sync
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            ON CONFLICT(provider) DO UPDATE SET
                account_id = excluded.account_id,
                username = excluded.username,
                avatar_url = excluded.avatar_url,
                is_authenticated = excluded.is_authenticated,
                import_installed = excluded.import_installed,
                import_uninstalled = excluded.import_uninstalled,
                sync_playtime = excluded.sync_playtime,
                last_sync = excluded.last_sync",
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
}
