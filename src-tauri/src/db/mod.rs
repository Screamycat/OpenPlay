use crate::models::{Game, GameLink};
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
                size_on_disk INTEGER
            )",
            [],
        )?;
        Ok(())
    }

    pub fn get_all_games(&self) -> Result<Vec<Game>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT * FROM games ORDER BY title ASC")
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                let genres_json: String = row.get(17).unwrap_or_else(|_| "[]".to_string());
                let features_json: String = row.get(18).unwrap_or_else(|_| "[]".to_string());
                let platforms_json: String = row.get(19).unwrap_or_else(|_| "[]".to_string());
                let links_json: String = row.get(28).unwrap_or_else(|_| "[]".to_string());
                let screenshots_json: String = row.get(29).unwrap_or_else(|_| "[]".to_string());

                let genres: Vec<String> = serde_json::from_str(&genres_json).unwrap_or_default();
                let features: Vec<String> = serde_json::from_str(&features_json).unwrap_or_default();
                let platforms: Vec<String> = serde_json::from_str(&platforms_json).unwrap_or_default();
                let links: Vec<GameLink> = serde_json::from_str(&links_json).unwrap_or_default();
                let screenshots: Vec<String> = serde_json::from_str(&screenshots_json).unwrap_or_default();

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

        conn.execute(
            "INSERT INTO games (
                id, title, sorting_title, source, source_id, install_directory, executable_path,
                launch_arguments, is_installed, is_favorite, cover_image, background_image,
                logo_image, icon_image, developer, publisher, release_date, genres, features,
                platforms, community_score, user_rating, playtime_seconds, last_played,
                date_added, completion_status, description, notes, links, screenshots, size_on_disk
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16,
                ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31
            ) ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                sorting_title = COALESCE(excluded.sorting_title, games.sorting_title),
                source = excluded.source,
                source_id = COALESCE(excluded.source_id, games.source_id),
                install_directory = COALESCE(excluded.install_directory, games.install_directory),
                executable_path = COALESCE(excluded.executable_path, games.executable_path),
                launch_arguments = COALESCE(excluded.launch_arguments, games.launch_arguments),
                is_installed = excluded.is_installed,
                cover_image = COALESCE(excluded.cover_image, games.cover_image),
                background_image = COALESCE(excluded.background_image, games.background_image),
                logo_image = COALESCE(excluded.logo_image, games.logo_image),
                icon_image = COALESCE(excluded.icon_image, games.icon_image),
                developer = COALESCE(excluded.developer, games.developer),
                publisher = COALESCE(excluded.publisher, games.publisher),
                release_date = COALESCE(excluded.release_date, games.release_date),
                genres = CASE WHEN excluded.genres != '[]' THEN excluded.genres ELSE games.genres END,
                features = CASE WHEN excluded.features != '[]' THEN excluded.features ELSE games.features END,
                platforms = CASE WHEN excluded.platforms != '[]' THEN excluded.platforms ELSE games.platforms END,
                community_score = COALESCE(excluded.community_score, games.community_score),
                playtime_seconds = CASE WHEN excluded.playtime_seconds > 0 THEN excluded.playtime_seconds ELSE games.playtime_seconds END,
                last_played = COALESCE(excluded.last_played, games.last_played),
                description = COALESCE(excluded.description, games.description),
                links = CASE WHEN excluded.links != '[]' THEN excluded.links ELSE games.links END,
                screenshots = CASE WHEN excluded.screenshots != '[]' THEN excluded.screenshots ELSE games.screenshots END,
                size_on_disk = COALESCE(excluded.size_on_disk, games.size_on_disk)",
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
}
