pub mod db;
pub mod launcher;
pub mod metadata;
pub mod models;
pub mod scanner;

use db::Database;
use launcher::GameLauncher;
use metadata::hltb::{HltbData, HltbFetcher};
use metadata::steam::{SteamMetadataFetcher, SteamNewsItem};
use metadata::steamgriddb::{SteamGridDBAsset, SteamGridDBClient};
use models::{Game, GameTrailer, LibraryIntegration};
use scanner::steam::SteamScanner;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State, Url, WebviewUrl, WebviewWindowBuilder};

struct AppState {
    db: Arc<Database>,
}

#[tauri::command]
fn get_games(state: State<'_, AppState>) -> Result<Vec<Game>, String> {
    state.db.get_all_games()
}

#[tauri::command]
fn get_steam_integration(state: State<'_, AppState>) -> Result<LibraryIntegration, String> {
    state.db.get_integration("steam")
}

#[tauri::command]
fn save_steam_integration(integration: LibraryIntegration, state: State<'_, AppState>) -> Result<(), String> {
    state.db.save_integration(&integration)
}

#[tauri::command]
async fn authenticate_steam_account(
    id_or_vanity: String,
    state: State<'_, AppState>,
) -> Result<LibraryIntegration, String> {
    let mut integration = state.db.get_integration("steam").unwrap_or_default();
    let (steamid64, username, avatar_url) = SteamScanner::fetch_steam_profile(&id_or_vanity).await?;

    integration.is_authenticated = true;
    integration.account_id = Some(steamid64);
    integration.username = Some(username);
    integration.avatar_url = if avatar_url.is_empty() { None } else { Some(avatar_url) };

    state.db.save_integration(&integration)?;
    Ok(integration)
}

#[tauri::command]
fn logout_steam(state: State<'_, AppState>) -> Result<LibraryIntegration, String> {
    let mut integration = state.db.get_integration("steam").unwrap_or_default();
    integration.is_authenticated = false;
    integration.account_id = None;
    integration.username = None;
    integration.avatar_url = None;
    state.db.save_integration(&integration)?;
    Ok(integration)
}

#[tauri::command]
async fn open_steam_login_window(app_handle: AppHandle) -> Result<(), String> {
    if let Some(existing) = app_handle.get_webview_window("steam_login") {
        let _ = existing.set_focus();
        return Ok(());
    }

    let url: Url = "https://steamcommunity.com/login/home/?goto=".parse().map_err(|e| format!("{:?}", e))?;
    let app_handle_clone = app_handle.clone();

    WebviewWindowBuilder::new(
        &app_handle,
        "steam_login",
        WebviewUrl::External(url),
    )
    .title("Sign In to Steam")
    .inner_size(800.0, 640.0)
    .center()
    .resizable(true)
    .on_navigation(move |nav_url| {
        let url_str = nav_url.as_str();
        if url_str.contains("steamcommunity.com/id/") || url_str.contains("steamcommunity.com/profiles/") {
            let extracted = if let Some(pos) = url_str.find("steamcommunity.com/profiles/") {
                let rest = &url_str[pos + "steamcommunity.com/profiles/".len()..];
                rest.split('/').next().unwrap_or("").to_string()
            } else if let Some(pos) = url_str.find("steamcommunity.com/id/") {
                let rest = &url_str[pos + "steamcommunity.com/id/".len()..];
                rest.split('/').next().unwrap_or("").to_string()
            } else {
                String::new()
            };

            if !extracted.is_empty() {
                let _ = app_handle_clone.emit("steam-login-detected", extracted);
                if let Some(w) = app_handle_clone.get_webview_window("steam_login") {
                    let _ = w.close();
                }
            }
        }
        true
    })
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[derive(serde::Serialize)]
pub struct ScanResult {
    pub count: usize,
    pub installed: usize,
    pub uninstalled: usize,
}

#[tauri::command]
async fn scan_steam_library(state: State<'_, AppState>) -> Result<ScanResult, String> {
    let integration = state.db.get_integration("steam").unwrap_or_default();

    // 1. Scan installed games from local disk
    let installed_games = SteamScanner::scan_installed_games()?;
    let mut installed_ids = std::collections::HashSet::new();
    let installed_count = installed_games.len();
    let mut uninstalled_count = 0;

    for game in installed_games {
        if let Some(ref aid) = game.source_id {
            installed_ids.insert(aid.clone());
        }
        let _ = state.db.upsert_game(&game);
    }

    // 2. If uninstalled games enabled, scan uninstalled games from localconfig history
    if integration.import_uninstalled {
        if let Some(steam_dir) = SteamScanner::find_steam_install_dir() {
            let uninstalled_games = SteamScanner::scan_uninstalled_from_localconfig(&steam_dir, &installed_ids).await;
            for uninstalled in uninstalled_games {
                let _ = state.db.upsert_game(&uninstalled);
                uninstalled_count += 1;
            }
        }
    }

    let mut updated_integration = integration;
    updated_integration.last_sync = Some(chrono::Local::now().format("%Y-%m-%d %H:%M").to_string());
    let _ = state.db.save_integration(&updated_integration);

    Ok(ScanResult {
        count: installed_count + uninstalled_count,
        installed: installed_count,
        uninstalled: uninstalled_count,
    })
}

#[tauri::command]
fn clear_all_games(state: State<'_, AppState>) -> Result<(), String> {
    state.db.clear_all_games()
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
            }
        }
    }

    // Also enrich with HowLongToBeat if not already fetched
    if game.hltb_main.is_none() {
        if let Some(hltb) = HltbFetcher::fetch_hltb(&game.title).await {
            game.hltb_main = Some(hltb.main_story_hours);
            game.hltb_extra = Some(hltb.main_extra_hours);
            game.hltb_completionist = Some(hltb.completionist_hours);
        }
    }

    state.db.save_game_exact(&game)?;
    Ok(game)
}

#[tauri::command]
async fn get_steam_current_players(appid: String) -> Result<u32, String> {
    SteamMetadataFetcher::fetch_current_players(&appid).await
}

#[tauri::command]
async fn get_steam_news(appid: String) -> Result<Vec<SteamNewsItem>, String> {
    SteamMetadataFetcher::fetch_game_news(&appid).await
}

#[tauri::command]
async fn get_store_trailers(title: String, appid: Option<String>) -> Result<Vec<GameTrailer>, String> {
    SteamMetadataFetcher::fetch_store_trailers(&title, appid.as_deref()).await
}

#[tauri::command]
async fn get_game_hltb(
    game_id: Option<String>,
    title: String,
    state: State<'_, AppState>,
) -> Result<Option<HltbData>, String> {
    if let Some(hltb) = HltbFetcher::fetch_hltb(&title).await {
        if let Some(ref gid) = game_id {
            if let Ok(all) = state.db.get_all_games() {
                if let Some(mut game) = all.into_iter().find(|g| g.id == *gid) {
                    game.hltb_main = Some(hltb.main_story_hours);
                    game.hltb_extra = Some(hltb.main_extra_hours);
                    game.hltb_completionist = Some(hltb.completionist_hours);
                    let _ = state.db.upsert_game(&game);
                }
            }
        }
        Ok(Some(hltb))
    } else {
        Ok(None)
    }
}

#[tauri::command]
async fn search_steamgriddb(
    appid: String,
    asset_type: String,
    state: State<'_, AppState>,
) -> Result<Vec<SteamGridDBAsset>, String> {
    let key = state.db.get_setting("steamgriddb_key")?
        .ok_or_else(|| "Please configure your SteamGridDB API key in Settings".to_string())?;

    if key.trim().is_empty() {
        return Err("SteamGridDB API key is empty. Configure it in Settings.".to_string());
    }

    let game_id = SteamGridDBClient::get_game_id(&key, &appid).await?;
    SteamGridDBClient::fetch_assets(&key, game_id, &asset_type).await
}

#[tauri::command]
fn save_steamgriddb_key(key: String, state: State<'_, AppState>) -> Result<(), String> {
    state.db.set_setting("steamgriddb_key", key.trim())
}

#[tauri::command]
fn get_steamgriddb_key(state: State<'_, AppState>) -> Result<Option<String>, String> {
    state.db.get_setting("steamgriddb_key")
}

#[tauri::command]
fn apply_custom_artwork(
    game_id: String,
    cover_image: Option<String>,
    background_image: Option<String>,
    logo_image: Option<String>,
    icon_image: Option<String>,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<Game, String> {
    let all = state.db.get_all_games()?;
    let mut game = all
        .into_iter()
        .find(|g| g.id == game_id)
        .ok_or_else(|| "Game not found".to_string())?;

    if let Some(c) = cover_image {
        if !c.trim().is_empty() {
            game.cover_image = Some(c);
        }
    }
    if let Some(b) = background_image {
        if !b.trim().is_empty() {
            game.background_image = Some(b);
        }
    }
    if let Some(l) = logo_image {
        if !l.trim().is_empty() {
            game.logo_image = Some(l);
        }
    }
    if let Some(i) = icon_image {
        if !i.trim().is_empty() {
            game.icon_image = Some(i);
        }
    }

    state.db.save_game_exact(&game)?;
    let _ = app_handle.emit("game-updated", &game);
    Ok(game)
}

#[tauri::command]
async fn sync_all_metadata(app_handle: AppHandle, state: State<'_, AppState>) -> Result<usize, String> {
    let all = state.db.get_all_games()?;
    let mut count = 0;
    for mut game in all {
        if !game.is_installed {
            continue;
        }
        let needs_meta = game.description.is_none() || game.cover_image.is_none() || game.background_image.is_none();
        let needs_hltb = game.hltb_main.is_none();

        if needs_meta && game.source.to_lowercase() == "steam" {
            if let Some(ref appid) = game.source_id {
                if let Ok(meta) = SteamMetadataFetcher::fetch_metadata_for_appid(appid).await {
                    SteamMetadataFetcher::apply_metadata(&mut game, meta);
                }
            }
        }

        if needs_hltb {
            if let Some(hltb) = HltbFetcher::fetch_hltb(&game.title).await {
                game.hltb_main = Some(hltb.main_story_hours);
                game.hltb_extra = Some(hltb.main_extra_hours);
                game.hltb_completionist = Some(hltb.completionist_hours);
            }
        }

        if needs_meta || needs_hltb {
            let _ = state.db.upsert_game(&game);
            let _ = app_handle.emit("game-updated", &game);
            count += 1;
            tokio::time::sleep(std::time::Duration::from_millis(150)).await;
        }
    }
    Ok(count)
}

#[tauri::command]
fn save_game(game: Game, state: State<'_, AppState>) -> Result<(), String> {
    state.db.save_game_exact(&game)
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
        game.install_directory,
        game.launch_arguments,
    )
}

#[tauri::command]
fn stop_game(game_id: String, app_handle: AppHandle) -> Result<(), String> {
    GameLauncher::stop_game(app_handle, &game_id)
}

#[tauri::command]
fn get_running_games(app_handle: AppHandle, state: State<'_, AppState>) -> Result<Vec<String>, String> {
    Ok(GameLauncher::get_running_games(Some(&app_handle), Some(&state.db)))
}

#[tauri::command]
fn select_file(filter: Option<String>) -> Result<Option<String>, String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let filter_str = filter.unwrap_or_else(|| "Executable (*.exe)|*.exe|All files (*.*)|*.*".to_string());
        let ps_script = format!(
            "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.OpenFileDialog; $f.Filter = '{}'; $f.Title = 'Select File'; if($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){{ Write-Output $f.FileName }}",
            filter_str
        );
        let output = Command::new("powershell")
            .args(["-NoProfile", "-Command", &ps_script])
            .output()
            .map_err(|e| e.to_string())?;

        let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if result.is_empty() {
            Ok(None)
        } else {
            Ok(Some(result))
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = filter;
        Ok(None)
    }
}

#[tauri::command]
fn select_directory() -> Result<Option<String>, String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let ps_script = "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Select Installation Folder'; if($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){ Write-Output $f.SelectedPath }";
        let output = Command::new("powershell")
            .args(["-NoProfile", "-Command", ps_script])
            .output()
            .map_err(|e| e.to_string())?;

        let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if result.is_empty() {
            Ok(None)
        } else {
            Ok(Some(result))
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(None)
    }
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
            get_steam_current_players,
            get_steam_news,
            get_store_trailers,
            get_game_hltb,
            search_steamgriddb,
            save_steamgriddb_key,
            get_steamgriddb_key,
            apply_custom_artwork,
            sync_all_metadata,
            get_steam_integration,
            save_steam_integration,
            open_steam_login_window,
            authenticate_steam_account,
            logout_steam,
            clear_all_games,
            save_game,
            delete_game,
            toggle_favorite,
            launch_game,
            stop_game,
            get_running_games,
            select_file,
            select_directory
        ])
        .run(tauri::generate_context!())
        .expect("error while running OpenPlay application");
}
