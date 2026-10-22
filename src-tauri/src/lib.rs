pub mod db;
pub mod launcher;
pub mod metadata;
pub mod models;
pub mod scanner;

use db::Database;
use launcher::GameLauncher;
use metadata::steam::SteamMetadataFetcher;
use models::Game;
use scanner::steam::SteamScanner;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

struct AppState {
    db: Arc<Database>,
}

#[tauri::command]
fn get_games(state: State<'_, AppState>) -> Result<Vec<Game>, String> {
    state.db.get_all_games()
}

#[tauri::command]
async fn scan_steam_library(state: State<'_, AppState>) -> Result<usize, String> {
    let games = SteamScanner::scan_installed_games()?;
    let count = games.len();
    for game in games {
        let _ = state.db.upsert_game(&game);
    }
    Ok(count)
}

#[tauri::command]
async fn fetch_game_metadata(game_id: String, state: State<'_, AppState>) -> Result<Game, String> {
    let all = state.db.get_all_games()?;
    let mut game = all
        .into_iter()
        .find(|g| g.id == game_id)
        .ok_or_else(|| "Game not found".to_string())?;

    if game.source.to_lowercase() == "steam" {
        if let Some(ref appid) = game.source_id {
            if let Ok(meta) = SteamMetadataFetcher::fetch_metadata_for_appid(appid).await {
                SteamMetadataFetcher::apply_metadata(&mut game, meta);
                state.db.upsert_game(&game)?;
            }
        }
    }

    Ok(game)
}

#[tauri::command]
async fn sync_all_metadata(app_handle: AppHandle, state: State<'_, AppState>) -> Result<usize, String> {
    let all = state.db.get_all_games()?;
    let mut count = 0;
    for mut game in all {
        if game.source.to_lowercase() == "steam" && game.description.is_none() {
            if let Some(ref appid) = game.source_id {
                if let Ok(meta) = SteamMetadataFetcher::fetch_metadata_for_appid(appid).await {
                    SteamMetadataFetcher::apply_metadata(&mut game, meta);
                    let _ = state.db.upsert_game(&game);
                    let _ = app_handle.emit("game-updated", &game);
                    count += 1;
                    tokio::time::sleep(std::time::Duration::from_millis(250)).await;
                }
            }
        }
    }
    Ok(count)
}

#[tauri::command]
fn save_game(game: Game, state: State<'_, AppState>) -> Result<(), String> {
    state.db.upsert_game(&game)
}

#[tauri::command]
fn delete_game(game_id: String, state: State<'_, AppState>) -> Result<(), String> {
    state.db.delete_game(&game_id)
}

#[tauri::command]
fn toggle_favorite(game_id: String, state: State<'_, AppState>) -> Result<bool, String> {
    state.db.toggle_favorite(&game_id)
}

#[tauri::command]
fn launch_game(game_id: String, app_handle: AppHandle, state: State<'_, AppState>) -> Result<String, String> {
    let all = state.db.get_all_games()?;
    let game = all
        .into_iter()
        .find(|g| g.id == game_id)
        .ok_or_else(|| "Game not found".to_string())?;

    GameLauncher::launch_game(
        app_handle,
        state.db.clone(),
        game.id,
        game.source,
        game.source_id,
        game.executable_path,
        game.launch_arguments,
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let database = Arc::new(Database::new().expect("Failed to initialize OpenPlay SQLite database"));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState { db: database })
        .invoke_handler(tauri::generate_handler![
            get_games,
            scan_steam_library,
            fetch_game_metadata,
            sync_all_metadata,
            save_game,
            delete_game,
            toggle_favorite,
            launch_game
        ])
        .run(tauri::generate_context!())
        .expect("error while running OpenPlay application");
}
