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
use metadata::epic::EpicMetadataFetcher;
use metadata::retroachievements::RetroAchievementsClient;
use models::{
    Achievement, AppConfig, Game, GameAchievementSummary, GameTrailer, HunterProfile,
    LibraryIntegration,
};
use scanner::steam::SteamScanner;
use scanner::epic::EpicScanner;
use serde::{Deserialize, Serialize};
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

#[tauri::command]
fn get_epic_integration(state: State<'_, AppState>) -> Result<LibraryIntegration, String> {
    state.db.get_integration("epic")
}

#[tauri::command]
fn save_epic_integration(integration: LibraryIntegration, state: State<'_, AppState>) -> Result<(), String> {
    state.db.save_integration(&integration)
}

#[tauri::command]
async fn open_epic_login_window(app_handle: AppHandle) -> Result<(), String> {
    if let Some(existing) = app_handle.get_webview_window("epic_login") {
        let _ = existing.set_focus();
        return Ok(());
    }

    let url: Url = "https://www.epicgames.com/id/login?redirectUrl=https%3A%2F%2Fwww.epicgames.com%2Fid%2Fapi%2Fredirect%3FclientId%3D34a02cf8f4414e29b15921876da36f9a%26responseType%3Dcode"
        .parse()
        .map_err(|e| format!("{:?}", e))?;
    let app_handle_clone = app_handle.clone();

    let init_script = r#"
        (function() {
            function check() {
                try {
                    const text = document.body ? (document.body.innerText || document.body.textContent) : "";
                    if (text && (text.includes("authorizationCode") || text.includes("exchangeCode") || text.includes("sid"))) {
                        const parsed = JSON.parse(text);
                        const code = parsed.authorizationCode || parsed.exchangeCode;
                        if (code && typeof code === 'string' && code.length >= 20) {
                            window.location.href = "https://localhost/openplay_auth?code=" + encodeURIComponent(code);
                        }
                    }
                } catch (e) {}
            }
            setInterval(check, 300);
            window.addEventListener("DOMContentLoaded", check);
        })();
    "#;

    WebviewWindowBuilder::new(
        &app_handle,
        "epic_login",
        WebviewUrl::External(url),
    )
    .title("Sign In to Epic Games")
    .inner_size(800.0, 680.0)
    .center()
    .resizable(true)
    .initialization_script(init_script)
    .on_navigation(move |nav_url| {
        let url_str = nav_url.as_str();
        if url_str.contains("code=") {
            if let Some(pos) = url_str.find("code=") {
                let code_part = &url_str[pos + 5..];
                let code = code_part.split('&').next().unwrap_or("").to_string();
                if !code.is_empty() && code.len() >= 20 {
                    let _ = app_handle_clone.emit("epic-code-detected", code);
                    if let Some(w) = app_handle_clone.get_webview_window("epic_login") {
                        let _ = w.close();
                    }
                    return false;
                }
            }
        }
        true
    })
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn authenticate_epic_code(
    code: String,
    state: State<'_, AppState>,
) -> Result<LibraryIntegration, String> {
    let mut integration = state.db.get_integration("epic").unwrap_or_default();
    let auth = EpicScanner::exchange_code_for_token(code.trim()).await?;

    integration.provider = "epic".to_string();
    integration.account_id = Some(auth.account_id);
    integration.username = Some(auth.display_name);
    integration.is_authenticated = true;
    integration.access_token = Some(auth.access_token);
    integration.refresh_token = auth.refresh_token;

    state.db.save_integration(&integration)?;
    Ok(integration)
}

#[tauri::command]
fn logout_epic(state: State<'_, AppState>) -> Result<LibraryIntegration, String> {
    let mut integration = state.db.get_integration("epic").unwrap_or_default();
    integration.is_authenticated = false;
    integration.account_id = None;
    integration.username = None;
    integration.avatar_url = None;
    integration.access_token = None;
    integration.refresh_token = None;
    state.db.save_integration(&integration)?;
    Ok(integration)
}

#[tauri::command]
async fn scan_epic_library(state: State<'_, AppState>) -> Result<ScanResult, String> {
    let integration = state.db.get_integration("epic").unwrap_or_default();

    // 0. Query live playtime map from Epic cloud if authenticated and sync_playtime is enabled
    let playtime_map = if integration.is_authenticated && integration.sync_playtime {
        if let (Some(ref acc_id), Some(ref token)) = (&integration.account_id, &integration.access_token) {
            EpicScanner::fetch_playtime(acc_id, token).await.unwrap_or_default()
        } else {
            std::collections::HashMap::new()
        }
    } else {
        std::collections::HashMap::new()
    };

    // 1. Scan installed games from local disk manifests
    let installed_games = EpicScanner::scan_installed_games()?;
    let mut installed_app_names = std::collections::HashSet::new();
    let installed_count = installed_games.len();
    let mut uninstalled_count = 0;
    let last_played_map = EpicScanner::get_user_last_played();

    for mut game in installed_games {
        if let Some(ref aname) = game.source_id {
            installed_app_names.insert(aname.clone());
            if let Some(&pt) = playtime_map.get(aname).or_else(|| playtime_map.get(&aname.to_lowercase())) {
                game.playtime_seconds = pt;
            }
            if game.last_played.is_none() {
                game.last_played = last_played_map.get(aname)
                    .or_else(|| last_played_map.get(&aname.to_lowercase()))
                    .cloned();
            }
        }

        // Enrich with metadata if missing cover or description
        if game.cover_image.is_none() || game.description.is_none() {
            if let Ok(meta) = EpicMetadataFetcher::fetch_metadata_by_title(&game.title).await {
                if game.cover_image.is_none() {
                    game.cover_image = meta.cover_image;
                }
                if game.background_image.is_none() {
                    game.background_image = meta.background_image;
                }
                if game.description.is_none() {
                    game.description = meta.description;
                }
                if game.developer.is_none() {
                    game.developer = meta.developer;
                }
                if game.publisher.is_none() {
                    game.publisher = meta.publisher;
                }
                if game.release_date.is_none() {
                    game.release_date = meta.release_date;
                }
                if game.tags.is_empty() {
                    game.tags = meta.tags;
                }
                if game.genres.is_empty() {
                    game.genres = meta.genres;
                }
            }
        }

        let _ = state.db.upsert_game(&game);
    }

    // 2. If authenticated and import_uninstalled is true, query owned cloud library
    if integration.is_authenticated && integration.import_uninstalled {
        let mut access_token = integration.access_token.clone().unwrap_or_default();

        let owned_result = EpicScanner::fetch_owned_library(&access_token).await;
        let owned_games = match owned_result {
            Ok(list) => list,
            Err(_) => {
                if let Some(ref rtoken) = integration.refresh_token {
                    if let Ok(new_auth) = EpicScanner::refresh_access_token(rtoken).await {
                        let mut updated = integration.clone();
                        updated.access_token = Some(new_auth.access_token.clone());
                        updated.refresh_token = new_auth.refresh_token;
                        let _ = state.db.save_integration(&updated);
                        access_token = new_auth.access_token;
                        EpicScanner::fetch_owned_library(&access_token).await.unwrap_or_default()
                    } else {
                        Vec::new()
                    }
                } else {
                    Vec::new()
                }
            }
        };

        for owned in owned_games {
            if !installed_app_names.contains(&owned.app_name) {
                let playtime = playtime_map.get(&owned.app_name)
                    .or_else(|| playtime_map.get(&owned.app_name.to_lowercase()))
                    .copied()
                    .unwrap_or(0);

                let uninstalled_game = Game {
                    id: format!("epic_{}", owned.app_name),
                    title: owned.title.clone(),
                    sorting_title: None,
                    source: "Epic".to_string(),
                    source_id: Some(owned.app_name.clone()),
                    install_directory: None,
                    executable_path: None,
                    launch_arguments: None,
                    is_installed: false,
                    is_favorite: false,
                    cover_image: owned.cover_image,
                    background_image: owned.background_image,
                    logo_image: None,
                    icon_image: None,
                    developer: owned.developer,
                    publisher: None,
                    release_date: owned.release_date,
                    genres: owned.genres,
                    features: Vec::new(),
                    platforms: vec!["Windows".to_string()],
                    community_score: None,
                    user_rating: None,
                    playtime_seconds: playtime,
                    last_played: last_played_map.get(&owned.app_name)
                        .or_else(|| last_played_map.get(&owned.app_name.to_lowercase()))
                        .or_else(|| last_played_map.get(&owned.catalog_item_id))
                        .or_else(|| last_played_map.get(&owned.namespace))
                        .cloned(),
                    date_added: Some(chrono::Local::now().format("%Y-%m-%d").to_string()),
                    completion_status: None,
                    description: owned.description,
                    notes: if !owned.namespace.is_empty() {
                        Some(format!("namespace:{};item_id:{}", owned.namespace, owned.catalog_item_id))
                    } else {
                        None
                    },
                    links: {
                        let slug = owned.title.chars().filter(|c| c.is_alphanumeric() || c.is_whitespace() || *c == '-').collect::<String>().split_whitespace().collect::<Vec<&str>>().join("-").to_lowercase();
                        vec![
                            crate::models::GameLink {
                                title: "Epic Games Store".to_string(),
                                url: format!("https://store.epicgames.com/p/{}", slug),
                            }
                        ]
                    },
                    screenshots: Vec::new(),
                    size_on_disk: None,
                    trailers: Vec::new(),
                    age_rating: None,
                    critic_score: None,
                    series: None,
                    hltb_main: None,
                    hltb_extra: None,
                    hltb_completionist: None,
                    tags: Vec::new(),
                    categories: Vec::new(),
                    region: None,
                    play_count: if playtime > 0 { Some(1) } else { Some(0) },
                    is_hidden: false,
                    play_actions: Vec::new(),
                };

                let _ = state.db.upsert_game(&uninstalled_game);
                uninstalled_count += 1;
            }
        }
    }

    let mut updated_integration = state.db.get_integration("epic").unwrap_or(integration);
    updated_integration.last_sync = Some(chrono::Local::now().format("%Y-%m-%d %H:%M").to_string());
    let _ = state.db.save_integration(&updated_integration);

    Ok(ScanResult {
        count: installed_count + uninstalled_count,
        installed: installed_count,
        uninstalled: uninstalled_count,
    })
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
    } else if game.source.to_lowercase() == "epic" {
        if let Ok(meta) = EpicMetadataFetcher::fetch_metadata_by_title(&game.title).await {
            if game.cover_image.is_none() || game.cover_image.as_deref().unwrap_or("").starts_with("data:") {
                game.cover_image = meta.cover_image;
            }
            if game.background_image.is_none() {
                game.background_image = meta.background_image;
            }
            if game.description.is_none() {
                game.description = meta.description;
            }
            if game.developer.is_none() {
                game.developer = meta.developer;
            }
            if game.publisher.is_none() {
                game.publisher = meta.publisher;
            }
            if game.release_date.is_none() {
                game.release_date = meta.release_date;
            }
            if game.tags.is_empty() {
                game.tags = meta.tags;
            }
            if game.genres.is_empty() {
                game.genres = meta.genres;
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
async fn get_game_news(
    game_id: Option<String>,
    title: Option<String>,
    appid: Option<serde_json::Value>,
) -> Result<Vec<SteamNewsItem>, String> {
    let _ = game_id;
    let resolved_appid = if let Some(ref val) = appid {
        if let Some(s) = val.as_str() {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                Some(trimmed.to_string())
            } else {
                None
            }
        } else if let Some(n) = val.as_u64() {
            Some(n.to_string())
        } else if let Some(n) = val.as_i64() {
            Some(n.to_string())
        } else {
            None
        }
    } else {
        None
    };

    let final_aid = match resolved_appid {
        Some(aid) => Some(aid),
        None => {
            if let Some(ref t) = title {
                SteamMetadataFetcher::search_appid_by_title(t).await
            } else {
                None
            }
        }
    };

    if let Some(aid) = final_aid {
        SteamMetadataFetcher::fetch_game_news(&aid).await
    } else {
        Ok(Vec::new())
    }
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
    appid: Option<String>,
    source: Option<String>,
    title: Option<String>,
    asset_type: String,
    state: State<'_, AppState>,
) -> Result<Vec<SteamGridDBAsset>, String> {
    let key = state.db.get_setting("steamgriddb_key")?
        .ok_or_else(|| "Please configure your SteamGridDB API key in Settings -> APIs & Services".to_string())?;

    if key.trim().is_empty() {
        return Err("SteamGridDB API key is empty. Configure it in Settings -> APIs & Services.".to_string());
    }

    let config = state.db.get_app_config().unwrap_or_default();
    let nsfw = config.steamgriddb_nsfw.unwrap_or(false);

    let game_id = SteamGridDBClient::resolve_game_id(
        &key,
        source.as_deref(),
        appid.as_deref(),
        title.as_deref(),
    )
    .await?;
    SteamGridDBClient::fetch_assets(&key, game_id, &asset_type, nsfw).await
}

#[tauri::command]
fn get_app_config(state: State<'_, AppState>) -> Result<AppConfig, String> {
    state.db.get_app_config()
}

#[tauri::command]
fn save_app_config(config: AppConfig, state: State<'_, AppState>) -> Result<(), String> {
    state.db.save_app_config(&config)
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
fn save_igdb_keys(client_id: String, client_secret: String, state: State<'_, AppState>) -> Result<(), String> {
    state.db.set_setting("igdb_client_id", client_id.trim())?;
    state.db.set_setting("igdb_client_secret", client_secret.trim())?;
    Ok(())
}

#[tauri::command]
fn get_igdb_keys(state: State<'_, AppState>) -> Result<(Option<String>, Option<String>), String> {
    let cid = state.db.get_setting("igdb_client_id")?;
    let csec = state.db.get_setting("igdb_client_secret")?;
    Ok((cid, csec))
}

#[tauri::command]
async fn fetch_metadata_from_source(
    title: String,
    provider: String,
    game_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<metadata::igdb::MetadataComparison, String> {
    let p_lower = provider.to_lowercase();
    match p_lower.as_str() {
        "steam" => {
            // Check if existing game in DB already has a valid numeric Steam AppID
            let mut resolved_appid: Option<String> = None;
            if let Some(ref gid) = game_id {
                if let Ok(all) = state.db.get_all_games() {
                    if let Some(g) = all.iter().find(|g| &g.id == gid) {
                        if g.source.eq_ignore_ascii_case("steam") {
                            if let Some(ref sid) = g.source_id {
                                if sid.chars().all(|c| c.is_ascii_digit()) && !sid.is_empty() {
                                    resolved_appid = Some(sid.clone());
                                }
                            }
                        }
                    }
                }
            }

            let appid = match resolved_appid {
                Some(id) if title.trim().is_empty() => id,
                _ => SteamMetadataFetcher::search_appid_by_title(&title)
                    .await
                    .or(resolved_appid)
                    .ok_or_else(|| format!("Could not find game '{}' on Steam Store", title))?,
            };
            let meta = SteamMetadataFetcher::fetch_metadata_for_appid(&appid).await?;

            let cover_image = meta.cover_image.clone().or_else(|| {
                Some(format!(
                    "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{}/library_600x900_2x.jpg",
                    appid
                ))
            });
            let background_image = meta.background_image.clone().or_else(|| {
                Some(format!(
                    "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{}/library_hero.jpg",
                    appid
                ))
            });

            let links = vec![
                crate::models::GameLink {
                    title: "Steam Store".to_string(),
                    url: format!("https://store.steampowered.com/app/{}", appid),
                },
                crate::models::GameLink {
                    title: "Community Discussions".to_string(),
                    url: format!("https://steamcommunity.com/app/{}/discussions/", appid),
                },
            ];

            Ok(metadata::igdb::MetadataComparison {
                provider: "Steam".to_string(),
                title: Some(title),
                description: meta.description,
                developer: meta.developer,
                publisher: meta.publisher,
                release_date: meta.release_date,
                genres: meta.genres.clone(),
                tags: meta.genres,
                features: meta.features,
                critic_score: meta.critic_score,
                community_score: meta.community_score,
                age_rating: meta.age_rating,
                series: None,
                cover_image,
                background_image,
                links,
            })
        }
        "epic" => {
            let meta = EpicMetadataFetcher::fetch_metadata_by_title(&title).await?;
            let slug = EpicMetadataFetcher::make_slug(&title);
            let links = vec![crate::models::GameLink {
                title: "Epic Games Store".to_string(),
                url: format!("https://store.epicgames.com/p/{}", slug),
            }];

            Ok(metadata::igdb::MetadataComparison {
                provider: "Epic Games".to_string(),
                title: Some(title),
                description: meta.description,
                developer: meta.developer,
                publisher: meta.publisher,
                release_date: meta.release_date,
                genres: meta.genres.clone(),
                tags: meta.tags,
                features: Vec::new(),
                critic_score: None,
                community_score: None,
                age_rating: None,
                series: None,
                cover_image: meta.cover_image,
                background_image: meta.background_image,
                links,
            })
        }
        "igdb" => {
            let config = state.db.get_app_config().unwrap_or_default();
            let client_id = config
                .igdb_client_id
                .or_else(|| state.db.get_setting("igdb_client_id").ok().flatten())
                .filter(|s| !s.trim().is_empty())
                .ok_or_else(|| {
                    "IGDB Client ID not configured. Please enter your Twitch Client ID in Settings -> APIs & Services."
                        .to_string()
                })?;

            let client_secret = config
                .igdb_client_secret
                .or_else(|| state.db.get_setting("igdb_client_secret").ok().flatten())
                .filter(|s| !s.trim().is_empty())
                .ok_or_else(|| {
                    "IGDB Client Secret not configured. Please enter your Twitch Client Secret in Settings -> APIs & Services."
                        .to_string()
                })?;

            metadata::igdb::IgdbFetcher::fetch_metadata(&client_id, &client_secret, &title).await
        }
        _ => Err(format!("Unsupported metadata provider: {}", provider)),
    }
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
async fn sync_all_metadata(
    installed_only: Option<bool>,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let only_installed = installed_only.unwrap_or(false);
    let all = state.db.get_all_games()?;
    let mut count = 0;
    for mut game in all {
        if only_installed && !game.is_installed {
            continue;
        }
        let needs_meta = game.description.is_none()
            || game.cover_image.is_none()
            || game.background_image.is_none()
            || game.genres.is_empty();
        let needs_hltb = game.hltb_main.is_none();

        let mut changed = false;
        if needs_meta {
            if game.source.to_lowercase() == "steam" {
                if let Some(ref appid) = game.source_id {
                    if let Ok(meta) = SteamMetadataFetcher::fetch_metadata_for_appid(appid).await {
                        if game.description.is_none() && meta.description.is_some() { game.description = meta.description; changed = true; }
                        if game.developer.is_none() && meta.developer.is_some() { game.developer = meta.developer; changed = true; }
                        if game.publisher.is_none() && meta.publisher.is_some() { game.publisher = meta.publisher; changed = true; }
                        if game.release_date.is_none() && meta.release_date.is_some() { game.release_date = meta.release_date; changed = true; }
                        if game.genres.is_empty() && !meta.genres.is_empty() { game.genres = meta.genres; changed = true; }
                        if game.features.is_empty() && !meta.features.is_empty() { game.features = meta.features; changed = true; }
                        if game.community_score.is_none() && meta.community_score.is_some() { game.community_score = meta.community_score; changed = true; }
                        if game.critic_score.is_none() && meta.critic_score.is_some() { game.critic_score = meta.critic_score; changed = true; }
                        if (game.cover_image.is_none() || game.cover_image.as_deref().unwrap_or("").starts_with("data:")) && meta.cover_image.is_some() { game.cover_image = meta.cover_image; changed = true; }
                        if game.background_image.is_none() && meta.background_image.is_some() { game.background_image = meta.background_image; changed = true; }
                    }
                }
            } else if game.source.to_lowercase() == "epic" {
                if let Ok(meta) = EpicMetadataFetcher::fetch_metadata_by_title(&game.title).await {
                    if game.cover_image.is_none() && meta.cover_image.is_some() { game.cover_image = meta.cover_image; changed = true; }
                    if game.background_image.is_none() && meta.background_image.is_some() { game.background_image = meta.background_image; changed = true; }
                    if game.description.is_none() && meta.description.is_some() { game.description = meta.description; changed = true; }
                    if game.developer.is_none() && meta.developer.is_some() { game.developer = meta.developer; changed = true; }
                    if game.publisher.is_none() && meta.publisher.is_some() { game.publisher = meta.publisher; changed = true; }
                    if game.release_date.is_none() && meta.release_date.is_some() { game.release_date = meta.release_date; changed = true; }
                    if game.tags.is_empty() && !meta.tags.is_empty() { game.tags = meta.tags; changed = true; }
                    if game.genres.is_empty() && !meta.genres.is_empty() { game.genres = meta.genres; changed = true; }
                }
            }
        }

        if needs_hltb {
            if let Some(hltb) = HltbFetcher::fetch_hltb(&game.title).await {
                game.hltb_main = Some(hltb.main_story_hours);
                game.hltb_extra = Some(hltb.main_extra_hours);
                game.hltb_completionist = Some(hltb.completionist_hours);
                changed = true;
            }
        }

        if changed {
            let _ = state.db.upsert_game(&game);
            let _ = app_handle.emit("game-updated", &game);
            count += 1;
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }
    }
    Ok(count)
}

#[tauri::command]
fn save_game(game: Game, app_handle: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    state.db.save_game_exact(&game)?;
    let _ = app_handle.emit("game-updated", &game);
    Ok(())
}

#[tauri::command]
fn delete_game(app_handle: AppHandle, game_id: String, state: State<'_, AppState>) -> Result<(), String> {
    state.db.delete_game(&game_id)?;
    let _ = app_handle.emit("game-deleted", &game_id);
    Ok(())
}

#[tauri::command]
fn toggle_favorite(game_id: String, state: State<'_, AppState>) -> Result<bool, String> {
    state.db.toggle_favorite(&game_id)
}

#[tauri::command]
fn launch_game(
    game_id: String,
    action_id: Option<String>,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let all = state.db.get_all_games()?;
    let game = all
        .into_iter()
        .find(|g| g.id == game_id)
        .ok_or_else(|| "Game not found".to_string())?;

    if let Some(ref aid) = action_id {
        if let Some(action) = game.play_actions.iter().find(|a| &a.id == aid) {
            return GameLauncher::launch_custom_action(
                app_handle,
                state.db.clone(),
                game.id,
                Some(action.path.clone()),
                action.arguments.clone(),
                action.working_dir.clone().or(game.install_directory.clone()),
            );
        }
    }

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
fn set_game_hidden(
    id: String,
    hidden: bool,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let all = state.db.get_all_games()?;
    if let Some(mut game) = all.into_iter().find(|g| g.id == id) {
        game.is_hidden = hidden;
        state.db.save_game_exact(&game)?;
        let _ = app_handle.emit("game-updated", &game);
    }
    Ok(())
}

#[tauri::command]
fn stop_game(game_id: String, app_handle: AppHandle) -> Result<(), String> {
    GameLauncher::stop_game(app_handle, &game_id)
}

#[tauri::command]
fn get_running_games(app_handle: AppHandle, state: State<'_, AppState>) -> Result<Vec<String>, String> {
    Ok(GameLauncher::get_running_games(Some(&app_handle), Some(&state.db)))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReleaseAssetInfo {
    pub name: String,
    pub download_url: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateCheckResult {
    pub current_version: String,
    pub latest_version: String,
    pub is_update_available: bool,
    pub release_name: Option<String>,
    pub release_notes: Option<String>,
    pub published_at: Option<String>,
    pub html_url: Option<String>,
    pub download_url: Option<String>,
    pub assets: Vec<ReleaseAssetInfo>,
}

fn parse_version_tuple(v: &str) -> (u64, u64, u64) {
    let clean = v.trim().trim_start_matches(|c| c == 'v' || c == 'V');
    let mut parts = clean.split('.');
    let major = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    let minor = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    let patch = parts.next().and_then(|s| s.split(|c: char| !c.is_numeric()).next().and_then(|p| p.parse().ok())).unwrap_or(0);
    (major, minor, patch)
}

fn is_version_newer(latest: &str, current: &str) -> bool {
    let l = parse_version_tuple(latest);
    let c = parse_version_tuple(current);
    l > c
}

#[tauri::command]
async fn check_for_app_updates() -> Result<UpdateCheckResult, String> {
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let url = "https://api.github.com/repos/Screamycat/OpenPlay/releases/latest";
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(url)
        .header("User-Agent", format!("OpenPlay/{}", current_version))
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await;

    match resp {
        Ok(res) => {
            if res.status() == reqwest::StatusCode::NOT_FOUND {
                return Ok(UpdateCheckResult {
                    current_version: current_version.clone(),
                    latest_version: current_version,
                    is_update_available: false,
                    release_name: None,
                    release_notes: Some("No releases published yet on GitHub. OpenPlay is up to date.".to_string()),
                    published_at: None,
                    html_url: Some("https://github.com/Screamycat/OpenPlay/releases".to_string()),
                    download_url: None,
                    assets: vec![],
                });
            }

            if !res.status().is_success() {
                return Err(format!("GitHub API responded with status {}", res.status()));
            }

            let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;

            let tag = json.get("tag_name").and_then(|v| v.as_str()).unwrap_or("0.1.0").to_string();
            let clean_tag = tag.trim_start_matches(|c| c == 'v' || c == 'V').to_string();
            let release_name = json.get("name").and_then(|v| v.as_str()).map(|s| s.to_string());
            let release_notes = json.get("body").and_then(|v| v.as_str()).map(|s| s.to_string());
            let published_at = json.get("published_at").and_then(|v| v.as_str()).map(|s| s.to_string());
            let html_url = json.get("html_url").and_then(|v| v.as_str()).map(|s| s.to_string());

            let mut assets = Vec::new();
            let mut download_url = None;

            if let Some(arr) = json.get("assets").and_then(|a| a.as_array()) {
                for a in arr {
                    let name = a.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let url = a.get("browser_download_url").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let size = a.get("size").and_then(|v| v.as_u64()).unwrap_or(0);
                    if !name.is_empty() && !url.is_empty() {
                        if name.ends_with(".exe") || name.ends_with(".msi") || name.ends_with(".zip") {
                            if download_url.is_none() {
                                download_url = Some(url.clone());
                            }
                        }
                        assets.push(ReleaseAssetInfo {
                            name,
                            download_url: url,
                            size,
                        });
                    }
                }
            }

            if download_url.is_none() {
                download_url = html_url.clone();
            }

            let is_newer = is_version_newer(&clean_tag, &current_version);

            Ok(UpdateCheckResult {
                current_version,
                latest_version: clean_tag,
                is_update_available: is_newer,
                release_name,
                release_notes,
                published_at,
                html_url,
                download_url,
                assets,
            })
        }
        Err(e) => Err(format!("Failed to connect to GitHub: {}", e)),
    }
}

#[tauri::command]
async fn select_file(filter: Option<String>) -> Result<Option<String>, String> {
    let mut dialog = rfd::AsyncFileDialog::new().set_title("Select File");
    if let Some(ref f) = filter {
        if f.contains(".exe") {
            dialog = dialog.add_filter("Executable (*.exe)", &["exe"]);
        } else if f.contains(".zip") {
            dialog = dialog.add_filter("ZIP Archive (*.zip)", &["zip"]);
        }
    }
    let handle = dialog.pick_file().await;
    Ok(handle.map(|h| h.path().to_string_lossy().to_string()))
}

#[tauri::command]
async fn select_directory() -> Result<Option<String>, String> {
    let handle = rfd::AsyncFileDialog::new()
        .set_title("Select Folder")
        .pick_folder()
        .await;
    Ok(handle.map(|h| h.path().to_string_lossy().to_string()))
}

#[tauri::command]
async fn select_multiple_files(filter: Option<String>) -> Result<Vec<String>, String> {
    let mut dialog = rfd::AsyncFileDialog::new().set_title("Select Files");
    if let Some(ref f) = filter {
        if f.contains(".exe") {
            dialog = dialog.add_filter("Executable (*.exe)", &["exe"]);
        } else if f.contains(".zip") {
            dialog = dialog.add_filter("ZIP Archive (*.zip)", &["zip"]);
        }
    }
    let handles = dialog.pick_files().await.unwrap_or_default();
    Ok(handles.into_iter().map(|h| h.path().to_string_lossy().to_string()).collect())
}

#[tauri::command]
fn auto_detect_playnite_backups() -> Result<Vec<String>, String> {
    Ok(scanner::playnite::PlayniteScanner::auto_detect_backups())
}

#[tauri::command]
fn get_playnite_backup_summary(zip_path: String) -> Result<scanner::playnite::PlayniteBackupSummary, String> {
    scanner::playnite::PlayniteScanner::scan_playnite_backup_summary(&zip_path)
}

#[tauri::command]
async fn import_playnite_backup(
    options: scanner::playnite::PlayniteImportOptions,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<scanner::playnite::PlayniteImportResult, String> {
    let dest_artwork = dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("OpenPlay")
        .join("artwork")
        .join("playnite");

    let (games, artwork_count) = scanner::playnite::PlayniteScanner::parse_playnite_games(
        &options,
        &dest_artwork,
        Some(&app_handle),
    )?;

    let total = games.len();
    let mut imported = 0;
    let mut updated = 0;
    let mut sources_set = std::collections::HashSet::new();

    for game in games {
        sources_set.insert(game.source.clone());
        let is_existing = state.db.get_all_games().map(|all| all.iter().any(|g| g.id == game.id)).unwrap_or(false);
        if is_existing {
            updated += 1;
        } else {
            imported += 1;
        }
        let _ = state.db.upsert_game(&game);
        let _ = app_handle.emit("game-updated", &game);
    }

    let mut sources: Vec<String> = sources_set.into_iter().collect();
    sources.sort();

    Ok(scanner::playnite::PlayniteImportResult {
        total,
        imported,
        updated,
        skipped: 0,
        artwork_extracted: artwork_count,
        sources,
    })
}

#[tauri::command]
fn open_in_explorer(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    let target = if p.is_file() {
        p.parent().unwrap_or(p)
    } else {
        p
    };

    if !target.exists() {
        return Err(format!("Path does not exist: {}", target.display()));
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(target)
            .spawn()
            .map_err(|e| format!("Failed to open Windows Explorer: {}", e))?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = open::that(target);
    }
    Ok(())
}

#[tauri::command]
fn scan_local_executable(path: String) -> Result<Game, String> {
    scanner::local::LocalScanner::scan_executable(&path)
}

#[tauri::command]
fn scan_local_folder(path: String) -> Result<Vec<Game>, String> {
    scanner::local::LocalScanner::scan_folder(&path)
}

#[tauri::command]
fn add_local_games(
    games: Vec<Game>,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let count = games.len();
    for game in games {
        let _ = state.db.upsert_game(&game);
        let _ = app_handle.emit("game-updated", &game);
    }
    Ok(count)
}

#[tauri::command]
fn get_game_achievements(
    game_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<Achievement>, String> {
    state.db.get_game_achievements(&game_id)
}

#[derive(Debug, Clone, Serialize)]
pub struct FullRefreshProgress {
    pub current: usize,
    pub total: usize,
    pub phase: String,
    pub message: String,
    pub game_title: Option<String>,
}

#[tauri::command]
async fn full_refresh_library(
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let mut all = state.db.get_all_games()?;
    let total_games = all.len();
    if total_games == 0 {
        return Ok(0);
    }

    // Phase 1: Playtime & Last Played Sync
    let _ = app_handle.emit("full-refresh-progress", FullRefreshProgress {
        current: 0,
        total: total_games,
        phase: "playtimes".to_string(),
        message: "Synchronizing playtimes and last played across library...".to_string(),
        game_title: None,
    });

    // Steam play history from localconfig.vdf
    let steam_history = if let Some(steam_dir) = SteamScanner::find_steam_install_dir() {
        SteamScanner::get_user_play_history(&steam_dir)
    } else {
        std::collections::HashMap::new()
    };

    // Epic playtimes from library-service and last_played from local launcher config
    let epic_integration = state.db.get_integration("epic").unwrap_or_default();
    let epic_playtimes = if epic_integration.is_authenticated {
        if let (Some(aid), Some(token)) = (epic_integration.account_id.as_deref(), epic_integration.access_token.as_deref()) {
            EpicScanner::fetch_playtime(aid, token).await.unwrap_or_default()
        } else {
            std::collections::HashMap::new()
        }
    } else {
        std::collections::HashMap::new()
    };
    let epic_last_played = EpicScanner::get_user_last_played();

    // Update playtimes & last played in DB
    for game in &mut all {
        let source_lower = game.source.to_lowercase();
        let mut changed = false;

        if source_lower == "steam" {
            if let Some(ref appid) = game.source_id {
                if let Some((pt, lp)) = steam_history.get(appid) {
                    if *pt > 0 && *pt != game.playtime_seconds {
                        game.playtime_seconds = *pt;
                        game.play_count = Some(1);
                        changed = true;
                    }
                    if lp.is_some() && *lp != game.last_played {
                        game.last_played = lp.clone();
                        changed = true;
                    }
                }
            }
        } else if source_lower == "epic" {
            if let Some(ref app_name) = game.source_id {
                if let Some(pt) = epic_playtimes.get(app_name).or_else(|| epic_playtimes.get(&app_name.to_lowercase())) {
                    if *pt > 0 && *pt != game.playtime_seconds {
                        game.playtime_seconds = *pt;
                        game.play_count = Some(1);
                        changed = true;
                    }
                }
                let lp = epic_last_played.get(app_name)
                    .or_else(|| epic_last_played.get(&app_name.to_lowercase()))
                    .or_else(|| {
                        game.notes.as_ref().and_then(|n| {
                            for part in n.split(';') {
                                let val = part.split(':').nth(1).unwrap_or("").trim();
                                if let Some(found) = epic_last_played.get(val) {
                                    return Some(found);
                                }
                            }
                            None
                        })
                    });
                if let Some(found_lp) = lp {
                    if game.last_played.as_deref() != Some(found_lp) {
                        game.last_played = Some(found_lp.clone());
                        changed = true;
                    }
                }
            }
        }

        if changed {
            let _ = state.db.upsert_game(game);
            let _ = app_handle.emit("game-updated", &game);
        }
    }

    // Phase 2: Metadata & HLTB enrichment across all games (installed & uninstalled)
    let mut refreshed_count = 0;
    for (idx, game) in all.iter_mut().enumerate() {
        let _ = app_handle.emit("full-refresh-progress", FullRefreshProgress {
            current: idx + 1,
            total: total_games,
            phase: "metadata".to_string(),
            message: format!("Refreshed metadata for {}", game.title),
            game_title: Some(game.title.clone()),
        });

        let mut modified = false;
        let source_lower = game.source.to_lowercase();
        let needs_meta = game.description.is_none() || game.tags.is_empty() || game.genres.is_empty() || game.cover_image.is_none() || game.background_image.is_none();
        let needs_hltb = game.hltb_main.is_none();

        if needs_meta {
            if source_lower == "steam" {
                if let Some(ref appid) = game.source_id {
                    if let Ok(meta) = SteamMetadataFetcher::fetch_metadata_for_appid(appid).await {
                        SteamMetadataFetcher::apply_metadata(game, meta);
                        modified = true;
                    }
                }
            } else if source_lower == "epic" {
                if let Ok(meta) = EpicMetadataFetcher::fetch_metadata_by_title(&game.title).await {
                    if game.cover_image.is_none() { game.cover_image = meta.cover_image; modified = true; }
                    if game.background_image.is_none() { game.background_image = meta.background_image; modified = true; }
                    if game.description.is_none() && meta.description.is_some() { game.description = meta.description; modified = true; }
                    if game.developer.is_none() && meta.developer.is_some() { game.developer = meta.developer; modified = true; }
                    if game.publisher.is_none() && meta.publisher.is_some() { game.publisher = meta.publisher; modified = true; }
                    if game.release_date.is_none() && meta.release_date.is_some() { game.release_date = meta.release_date; modified = true; }
                    if game.tags.is_empty() && !meta.tags.is_empty() { game.tags = meta.tags; modified = true; }
                    if game.genres.is_empty() && !meta.genres.is_empty() { game.genres = meta.genres; modified = true; }
                }

                // If Epic game still lacks rich description or genres, fallback to Steam store search
                if game.description.is_none() || game.genres.is_empty() {
                    if let Some(steam_appid) = SteamMetadataFetcher::search_appid_by_title(&game.title).await {
                        if let Ok(steam_meta) = SteamMetadataFetcher::fetch_metadata_for_appid(&steam_appid).await {
                            SteamMetadataFetcher::apply_metadata(game, steam_meta);
                            modified = true;
                        }
                    }
                }
            }
        }

        if needs_hltb {
            if let Some(hltb) = HltbFetcher::fetch_hltb(&game.title).await {
                game.hltb_main = Some(hltb.main_story_hours);
                game.hltb_extra = Some(hltb.main_extra_hours);
                game.hltb_completionist = Some(hltb.completionist_hours);
                modified = true;
            }
        }

        if modified {
            let _ = state.db.upsert_game(game);
            let _ = app_handle.emit("game-updated", &game);
            refreshed_count += 1;
            tokio::time::sleep(std::time::Duration::from_millis(60)).await;
        }
    }

    let _ = app_handle.emit("full-refresh-progress", FullRefreshProgress {
        current: total_games,
        total: total_games,
        phase: "completed".to_string(),
        message: format!("Full library refresh completed! {} games updated.", refreshed_count),
        game_title: None,
    });

    Ok(refreshed_count)
}

/// Extracts the latest YYYY-MM-DD unlock date from a list of unlocked achievements
fn extract_latest_unlock_date(achs: &[Achievement]) -> Option<String> {
    achs.iter()
        .filter(|a| a.is_unlocked)
        .filter_map(|a| a.unlock_time.as_deref())
        .filter_map(|ut| {
            if ut.len() >= 10 && ut.as_bytes()[4] == b'-' && ut.as_bytes()[7] == b'-' {
                Some(ut[..10].to_string())
            } else {
                None
            }
        })
        .max()
}

/// Returns (Option<account_id>, Option<access_token>) ensuring the Epic OAuth token is valid and fresh
async fn ensure_fresh_epic_auth(db: &Database) -> (Option<String>, Option<String>) {
    let integration = db.get_integration("epic").unwrap_or_default();
    if !integration.is_authenticated {
        return (None, None);
    }
    let acc_id = match integration.account_id.clone() {
        Some(id) if !id.is_empty() => id,
        _ => return (None, None),
    };
    let token = integration.access_token.clone().unwrap_or_default();

    // Verify token validity by testing playtime endpoint
    match EpicScanner::fetch_playtime(&acc_id, &token).await {
        Ok(_) => (Some(acc_id), Some(token)),
        Err(_) => {
            if let Some(ref rtoken) = integration.refresh_token {
                if let Ok(new_auth) = EpicScanner::refresh_access_token(rtoken).await {
                    let mut updated = integration.clone();
                    updated.access_token = Some(new_auth.access_token.clone());
                    if new_auth.refresh_token.is_some() {
                        updated.refresh_token = new_auth.refresh_token;
                    }
                    let _ = db.save_integration(&updated);
                    return (Some(acc_id), Some(new_auth.access_token));
                }
            }
            (Some(acc_id), Some(token))
        }
    }
}

/// Fetches Epic cloud playtimes, transparently refreshing expired OAuth tokens if refresh_token is saved
async fn fetch_epic_playtimes_fresh(db: &Database) -> std::collections::HashMap<String, u64> {
    let integration = db.get_integration("epic").unwrap_or_default();
    if !integration.is_authenticated || !integration.sync_playtime {
        return std::collections::HashMap::new();
    }
    let (acc_id, token) = ensure_fresh_epic_auth(db).await;
    match (acc_id, token) {
        (Some(aid), Some(tok)) => EpicScanner::fetch_playtime(&aid, &tok).await.unwrap_or_default(),
        _ => std::collections::HashMap::new(),
    }
}

fn parse_epic_sandbox_from_notes(notes: Option<&str>) -> Option<String> {
    notes.and_then(|n| {
        if n.contains("namespace:") {
            n.split("namespace:")
                .nth(1)
                .and_then(|s| s.split(';').next())
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
        } else {
            None
        }
    })
}

#[tauri::command]
async fn sync_game_achievements(
    game_id: String,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<Achievement>, String> {
    let all = state.db.get_all_games()?;
    let mut game = all
        .into_iter()
        .find(|g| g.id == game_id)
        .ok_or_else(|| "Game not found".to_string())?;

    let source_lower = game.source.to_lowercase();
    if source_lower == "steam" {
        if let Some(ref appid) = game.source_id {
            if !appid.is_empty() {
                let integration = state.db.get_integration("steam").unwrap_or_default();
                let steamid64 = if integration.is_authenticated {
                    integration.account_id.as_deref()
                } else {
                    None
                };

                let achievements = SteamMetadataFetcher::fetch_steam_achievements(&game_id, appid, steamid64).await?;
                if !achievements.is_empty() {
                    state.db.save_game_achievements(&game_id, &achievements)?;
                }
            }
        }
    } else if source_lower == "epic" {
        if let Some(ns) = parse_epic_sandbox_from_notes(game.notes.as_deref()) {
            let (epic_aid, epic_token) = ensure_fresh_epic_auth(&state.db).await;

            if let Ok(achievements) = EpicMetadataFetcher::fetch_epic_achievements(&game_id, &ns, epic_aid.as_deref(), epic_token.as_deref()).await {
                if !achievements.is_empty() {
                    state.db.save_game_achievements(&game_id, &achievements)?;
                    if let Some(latest_date) = extract_latest_unlock_date(&achievements) {
                        game.last_played = Some(latest_date);
                    }
                }
            }
        }
    } else if source_lower == "retroachievements" || source_lower.contains("retro") {
        let (username, api_key) = {
            let cfg = state.db.get_app_config()?;
            let u = cfg.retroachievements_username.as_deref().unwrap_or("").trim().to_string();
            let k = cfg.retroachievements_api_key.as_deref().unwrap_or("").trim().to_string();
            if u.is_empty() || k.is_empty() {
                return Err(
                    "RetroAchievements credentials not configured. Please enter your username and Web API key in Settings -> APIs & Services."
                        .to_string(),
                );
            }
            (u, k)
        };

        if let Some(ref sid) = game.source_id {
            if let Ok(ra_id) = sid.parse::<u64>() {
                if let Ok(detail) = RetroAchievementsClient::fetch_game_info_and_progress(ra_id, &username, &api_key).await {
                    let achievements = RetroAchievementsClient::extract_achievements(&game_id, &detail);
                    if !achievements.is_empty() {
                        state.db.save_game_achievements(&game_id, &achievements)?;
                        if let Some(playtime) = detail.user_total_playtime {
                            if playtime > game.playtime_seconds {
                                game.playtime_seconds = playtime;
                            }
                        }
                        if let Some(latest_date) = extract_latest_unlock_date(&achievements) {
                            if game.last_played.is_none() || game.last_played.as_deref() < Some(latest_date.as_str()) {
                                game.last_played = Some(latest_date);
                            }
                        }
                    }
                }
            }
        }
    }

    let _ = state.db.upsert_game(&game);
    let _ = app_handle.emit("game-updated", &game);

    let _ = app_handle.emit("achievements-updated", &game_id);
    state.db.get_game_achievements(&game_id)
}

#[tauri::command]
fn get_game_achievement_summary(
    game_id: String,
    state: State<'_, AppState>,
) -> Result<GameAchievementSummary, String> {
    let all = state.db.get_all_games()?;
    let game = all
        .into_iter()
        .find(|g| g.id == game_id)
        .ok_or_else(|| "Game not found".to_string())?;

    state.db.get_game_achievement_summary(&game)
}

#[tauri::command]
fn get_hunter_profile(state: State<'_, AppState>) -> Result<HunterProfile, String> {
    let all = state.db.get_all_games()?;
    state.db.get_hunter_profile(&all)
}

#[tauri::command]
async fn sync_all_achievements(
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<HunterProfile, String> {
    let all = state.db.get_all_games()?;
    let steam_integration = state.db.get_integration("steam").unwrap_or_default();
    let steamid64 = if steam_integration.is_authenticated {
        steam_integration.account_id.clone()
    } else {
        None
    };

    // Ensure Epic token is fresh if authenticated
    let (epic_aid, epic_token) = ensure_fresh_epic_auth(&state.db).await;

    let semaphore = Arc::new(tokio::sync::Semaphore::new(12));
    let mut join_set = tokio::task::JoinSet::new();

    for game in all.iter().cloned() {
        let sem = semaphore.clone();
        let sid_clone = steamid64.clone();
        let eaid_clone = epic_aid.clone();
        let etok_clone = epic_token.clone();

        join_set.spawn(async move {
            let _permit = sem.acquire_owned().await.ok()?;
            let source_lower = game.source.to_lowercase();
            if source_lower == "steam" {
                let appid = game.source_id.as_deref().filter(|s| !s.is_empty())?;
                let achs = SteamMetadataFetcher::fetch_steam_achievements(
                    &game.id,
                    appid,
                    sid_clone.as_deref(),
                )
                .await
                .ok()?;
                Some((game, achs))
            } else if source_lower == "epic" {
                let ns = parse_epic_sandbox_from_notes(game.notes.as_deref())?;
                let achs = EpicMetadataFetcher::fetch_epic_achievements(
                    &game.id,
                    &ns,
                    eaid_clone.as_deref(),
                    etok_clone.as_deref(),
                )
                .await
                .ok()?;
                Some((game, achs))
            } else {
                None
            }
        });
    }

    while let Some(res) = join_set.join_next().await {
        if let Ok(Some((mut game, achs))) = res {
            if !achs.is_empty() {
                let _ = state.db.save_game_achievements(&game.id, &achs);
                if let Some(latest_date) = extract_latest_unlock_date(&achs) {
                    game.last_played = Some(latest_date);
                    let _ = state.db.upsert_game(&game);
                    let _ = app_handle.emit("game-updated", &game);
                }
            }
        }
    }

    // Also sync RetroAchievements if credentials are configured
    let (ra_user, ra_key) = {
        let cfg = state.db.get_app_config()?;
        let u = cfg.retroachievements_username.as_deref().unwrap_or("").trim().to_string();
        let k = cfg.retroachievements_api_key.as_deref().unwrap_or("").trim().to_string();
        (u, k)
    };
    if !ra_user.is_empty() && !ra_key.is_empty() {
        let _ = sync_retroachievements_core(&app_handle, &state.db, &ra_user, &ra_key).await;
    }

    let updated_all = state.db.get_all_games()?;
    state.db.get_hunter_profile(&updated_all)
}

async fn sync_retroachievements_core(
    app_handle: &AppHandle,
    db: &Database,
    username: &str,
    api_key: &str,
) -> Result<(), String> {
    let progress_list = RetroAchievementsClient::fetch_user_completion_progress(username, api_key)
        .await
        .map_err(|e| format!("Failed to fetch RetroAchievements user progress: {}", e))?;

    let all_games = db.get_all_games()?;
    let mut game_map_by_source_id: std::collections::HashMap<String, Game> = std::collections::HashMap::new();
    let mut game_map_by_title: std::collections::HashMap<String, Game> = std::collections::HashMap::new();

    for g in all_games {
        let src_lower = g.source.to_lowercase();
        if src_lower.contains("retro") {
            if let Some(ref sid) = g.source_id {
                game_map_by_source_id.insert(sid.clone(), g.clone());
            }
        }
        game_map_by_title.insert(g.title.to_lowercase().trim().to_string(), g);
    }

    let semaphore = Arc::new(tokio::sync::Semaphore::new(4));
    let mut join_set = tokio::task::JoinSet::new();

    for prog in progress_list {
        let sem = semaphore.clone();
        let u = username.to_string();
        let k = api_key.to_string();
        let prog_clone = prog.clone();

        join_set.spawn(async move {
            let _permit = sem.acquire_owned().await.ok()?;
            let detail = RetroAchievementsClient::fetch_game_info_and_progress(prog_clone.game_id, &u, &k)
                .await
                .ok()?;
            Some((prog_clone, detail))
        });
    }

    while let Some(res) = join_set.join_next().await {
        if let Ok(Some((prog, detail))) = res {
            let game_id_str = prog.game_id.to_string();
            let title_key = detail.title.to_lowercase().trim().to_string();

            let mut game = if let Some(existing) = game_map_by_source_id.get(&game_id_str) {
                existing.clone()
            } else if let Some(existing) = game_map_by_title.get(&title_key) {
                existing.clone()
            } else {
                Game {
                    id: format!("ra_{}", prog.game_id),
                    title: detail.title.clone(),
                    source: "RetroAchievements".to_string(),
                    source_id: Some(game_id_str.clone()),
                    platforms: detail.console_name.as_ref().map(|c| vec![c.clone()]).unwrap_or_else(|| vec!["Retro".to_string()]),
                    is_installed: false,
                    date_added: Some(chrono::Utc::now().to_rfc3339()),
                    ..Default::default()
                }
            };

            if game.cover_image.is_none() || game.cover_image.as_deref().unwrap_or("").is_empty() {
                game.cover_image = RetroAchievementsClient::to_media_url(detail.image_box_art.as_deref());
            }
            if game.icon_image.is_none() || game.icon_image.as_deref().unwrap_or("").is_empty() {
                game.icon_image = RetroAchievementsClient::to_media_url(detail.image_icon.as_deref());
            }
            if game.background_image.is_none() || game.background_image.as_deref().unwrap_or("").is_empty() {
                game.background_image = RetroAchievementsClient::to_media_url(detail.image_title.as_deref());
            }
            if game.developer.is_none() {
                game.developer = detail.developer.clone();
            }
            if game.publisher.is_none() {
                game.publisher = detail.publisher.clone();
            }
            if let Some(playtime) = detail.user_total_playtime {
                if playtime > game.playtime_seconds {
                    game.playtime_seconds = playtime;
                }
            }
            if let Some(ref recent_date) = prog.most_recent_awarded_date {
                let date_str = if recent_date.len() >= 10 { &recent_date[..10] } else { recent_date.as_str() };
                if game.last_played.is_none() || game.last_played.as_deref() < Some(date_str) {
                    game.last_played = Some(date_str.to_string());
                }
            }

            if prog.highest_award_kind.as_deref() == Some("mastered") {
                game.completion_status = Some("Completed".to_string());
            } else if prog.highest_award_kind.is_some() {
                game.completion_status = Some("Completed".to_string());
            } else if game.playtime_seconds > 0 || prog.num_awarded.unwrap_or(0) > 0 {
                if game.completion_status.is_none() || game.completion_status.as_deref() == Some("Not Played") {
                    game.completion_status = Some("Played".to_string());
                }
            }

            let _ = db.upsert_game(&game);

            let achs = RetroAchievementsClient::extract_achievements(&game.id, &detail);
            if !achs.is_empty() {
                let _ = db.save_game_achievements(&game.id, &achs);
            }

            let _ = app_handle.emit("game-updated", &game);
            let _ = app_handle.emit("achievements-updated", &game.id);
        }
    }

    Ok(())
}

#[tauri::command]
async fn sync_retroachievements(
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<HunterProfile, String> {
    let (username, api_key) = {
        let cfg = state.db.get_app_config()?;
        let u = cfg.retroachievements_username.as_deref().unwrap_or("").trim().to_string();
        let k = cfg.retroachievements_api_key.as_deref().unwrap_or("").trim().to_string();
        if u.is_empty() || k.is_empty() {
            return Err(
                "RetroAchievements credentials not configured. Please enter your username and Web API key in Settings -> APIs & Services."
                    .to_string(),
            );
        }
        (u, k)
    };

    sync_retroachievements_core(&app_handle, &state.db, &username, &api_key).await?;

    let updated_all = state.db.get_all_games()?;
    state.db.get_hunter_profile(&updated_all)
}

/// Unified per-game Refresh command (Right-Click -> Refresh):
/// Refreshes live store playtime & last_played, Achievements, HowLongToBeat, and live store scores/missing metadata.
#[tauri::command]
async fn refresh_game_live_data(
    game_id: String,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<Game, String> {
    let all = state.db.get_all_games()?;
    let mut game = all
        .into_iter()
        .find(|g| g.id == game_id)
        .ok_or_else(|| "Game not found".to_string())?;

    let source_lower = game.source.to_lowercase();

    // 1. Live Store Playtime, Last Played, Live Scores & Missing Store Metadata
    if source_lower == "steam" {
        if let Some(steam_dir) = SteamScanner::find_steam_install_dir() {
            let history = SteamScanner::get_user_play_history(&steam_dir);
            if let Some(ref appid) = game.source_id {
                if let Some((pt, lp)) = history.get(appid) {
                    if *pt > 0 {
                        game.playtime_seconds = *pt;
                        game.play_count = Some(1);
                    }
                    if lp.is_some() {
                        game.last_played = lp.clone();
                    }
                }
            }
        }

        if let Some(ref appid) = game.source_id {
            if !appid.is_empty() {
                if let Ok(meta) = SteamMetadataFetcher::fetch_metadata_for_appid(appid).await {
                    if meta.community_score.is_some() {
                        game.community_score = meta.community_score;
                    }
                    if meta.critic_score.is_some() {
                        game.critic_score = meta.critic_score;
                    }
                    if game.description.is_none() && meta.description.is_some() {
                        game.description = meta.description;
                    }
                    if game.developer.is_none() && meta.developer.is_some() {
                        game.developer = meta.developer;
                    }
                    if game.publisher.is_none() && meta.publisher.is_some() {
                        game.publisher = meta.publisher;
                    }
                    if game.release_date.is_none() && meta.release_date.is_some() {
                        game.release_date = meta.release_date;
                    }
                    if game.genres.is_empty() && !meta.genres.is_empty() {
                        game.genres = meta.genres;
                    }
                    if game.features.is_empty() && !meta.features.is_empty() {
                        game.features = meta.features;
                    }
                    if game.age_rating.is_none() && meta.age_rating.is_some() {
                        game.age_rating = meta.age_rating;
                    }
                }
            }
        }
    } else if source_lower == "epic" {
        let epic_playtimes = fetch_epic_playtimes_fresh(&state.db).await;
        let epic_last_played = EpicScanner::get_user_last_played();

        if let Some(ref app_name) = game.source_id {
            if let Some(&pt) = epic_playtimes
                .get(app_name)
                .or_else(|| epic_playtimes.get(&app_name.to_lowercase()))
            {
                if pt > 0 {
                    game.playtime_seconds = pt;
                    game.play_count = Some(1);
                }
            }

            let lp = epic_last_played
                .get(app_name)
                .or_else(|| epic_last_played.get(&app_name.to_lowercase()))
                .or_else(|| {
                    game.notes.as_ref().and_then(|n| {
                        for part in n.split(';') {
                            let val = part.split(':').nth(1).unwrap_or("").trim();
                            if let Some(found) = epic_last_played.get(val) {
                                return Some(found);
                            }
                        }
                        None
                    })
                });
            if let Some(found_lp) = lp {
                game.last_played = Some(found_lp.clone());
            }
        }

        if game.description.is_none() || game.genres.is_empty() || game.cover_image.is_none() {
            if let Ok(meta) = EpicMetadataFetcher::fetch_metadata_by_title(&game.title).await {
                if game.cover_image.is_none() && meta.cover_image.is_some() {
                    game.cover_image = meta.cover_image;
                }
                if game.background_image.is_none() && meta.background_image.is_some() {
                    game.background_image = meta.background_image;
                }
                if game.description.is_none() && meta.description.is_some() {
                    game.description = meta.description;
                }
                if game.developer.is_none() && meta.developer.is_some() {
                    game.developer = meta.developer;
                }
                if game.publisher.is_none() && meta.publisher.is_some() {
                    game.publisher = meta.publisher;
                }
                if game.release_date.is_none() && meta.release_date.is_some() {
                    game.release_date = meta.release_date;
                }
                if game.tags.is_empty() && !meta.tags.is_empty() {
                    game.tags = meta.tags;
                }
                if game.genres.is_empty() && !meta.genres.is_empty() {
                    game.genres = meta.genres;
                }
            }
        }
    }

    // 2. Refresh Achievements
    if source_lower == "steam" {
        if let Some(ref appid) = game.source_id {
            if !appid.is_empty() {
                let integration = state.db.get_integration("steam").unwrap_or_default();
                let steamid64 = if integration.is_authenticated {
                    integration.account_id.as_deref()
                } else {
                    None
                };
                if let Ok(achs) = SteamMetadataFetcher::fetch_steam_achievements(&game.id, appid, steamid64).await {
                    if !achs.is_empty() {
                        let _ = state.db.save_game_achievements(&game.id, &achs);
                    }
                }
            }
        }
    } else if source_lower == "epic" {
        if let Some(ns) = parse_epic_sandbox_from_notes(game.notes.as_deref()) {
            let (aid, token) = ensure_fresh_epic_auth(&state.db).await;

            if let Ok(achs) = EpicMetadataFetcher::fetch_epic_achievements(&game.id, &ns, aid.as_deref(), token.as_deref()).await {
                if !achs.is_empty() {
                    let _ = state.db.save_game_achievements(&game.id, &achs);
                    if let Some(latest_date) = extract_latest_unlock_date(&achs) {
                        game.last_played = Some(latest_date);
                    }
                }
            }
        }
    } else if source_lower == "retroachievements" || source_lower.contains("retro") {
        let (username, api_key) = {
            let cfg = state.db.get_app_config()?;
            let u = cfg.retroachievements_username.as_deref().unwrap_or("").trim().to_string();
            let k = cfg.retroachievements_api_key.as_deref().unwrap_or("").trim().to_string();
            (u, k)
        };
        if !username.is_empty() && !api_key.is_empty() {
            if let Some(ref sid) = game.source_id {
                if let Ok(ra_id) = sid.parse::<u64>() {
                    if let Ok(detail) = RetroAchievementsClient::fetch_game_info_and_progress(ra_id, &username, &api_key).await {
                        if game.cover_image.is_none() || game.cover_image.as_deref().unwrap_or("").is_empty() {
                            game.cover_image = RetroAchievementsClient::to_media_url(detail.image_box_art.as_deref());
                        }
                        if game.icon_image.is_none() || game.icon_image.as_deref().unwrap_or("").is_empty() {
                            game.icon_image = RetroAchievementsClient::to_media_url(detail.image_icon.as_deref());
                        }
                        if game.background_image.is_none() || game.background_image.as_deref().unwrap_or("").is_empty() {
                            game.background_image = RetroAchievementsClient::to_media_url(detail.image_title.as_deref());
                        }
                        if let Some(playtime) = detail.user_total_playtime {
                            if playtime > game.playtime_seconds {
                                game.playtime_seconds = playtime;
                            }
                        }
                        let achs = RetroAchievementsClient::extract_achievements(&game.id, &detail);
                        if !achs.is_empty() {
                            let _ = state.db.save_game_achievements(&game.id, &achs);
                            if let Some(latest_date) = extract_latest_unlock_date(&achs) {
                                if game.last_played.is_none() || game.last_played.as_deref() < Some(latest_date.as_str()) {
                                    game.last_played = Some(latest_date);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    let _ = app_handle.emit("achievements-updated", &game.id);

    // 3. Refresh HowLongToBeat
    if let Some(hltb) = HltbFetcher::fetch_hltb(&game.title).await {
        game.hltb_main = Some(hltb.main_story_hours);
        game.hltb_extra = Some(hltb.main_extra_hours);
        game.hltb_completionist = Some(hltb.completionist_hours);
    }

    if game.playtime_seconds > 0 && (game.completion_status.as_deref() == Some("Not Played") || game.completion_status.is_none()) {
        game.completion_status = Some("Played".to_string());
    }

    // 4. Refresh Size on Disk if missing or unmeasured
    if game.size_on_disk.is_none() || game.size_on_disk == Some(0) {
        if let Some(ref inst_dir) = game.install_directory {
            let p = std::path::Path::new(inst_dir);
            if p.is_dir() {
                game.size_on_disk = scanner::playnite::PlayniteScanner::compute_folder_size(p);
            }
        }
        if game.size_on_disk.is_none() {
            if let Some(ref exe) = game.executable_path {
                let p = std::path::Path::new(exe);
                if p.is_file() {
                    game.size_on_disk = std::fs::metadata(p).map(|m| m.len()).ok();
                }
            }
        }
    }

    // 5. Ensure Date Added is not empty
    if game.date_added.is_none() || game.date_added.as_deref() == Some("") {
        game.date_added = Some(chrono::Local::now().format("%Y-%m-%d").to_string());
    }

    state.db.save_game_exact(&game)?;
    let _ = app_handle.emit("game-updated", &game);
    Ok(game)
}

/// Lightweight bulk live sync (<400ms): updates playtimes and last_played across all Steam & Epic games
#[tauri::command]
async fn sync_live_playtimes(
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let mut all = state.db.get_all_games()?;
    if all.is_empty() {
        return Ok(0);
    }

    let steam_history = if let Some(steam_dir) = SteamScanner::find_steam_install_dir() {
        SteamScanner::get_user_play_history(&steam_dir)
    } else {
        std::collections::HashMap::new()
    };

    let epic_playtimes = fetch_epic_playtimes_fresh(&state.db).await;
    let epic_last_played = EpicScanner::get_user_last_played();

    let mut updated_count = 0;

    for game in &mut all {
        let source_lower = game.source.to_lowercase();
        let mut changed = false;

        if source_lower == "steam" {
            if let Some(ref appid) = game.source_id {
                if let Some((pt, lp)) = steam_history.get(appid) {
                    if *pt > 0 && *pt != game.playtime_seconds {
                        game.playtime_seconds = *pt;
                        game.play_count = Some(1);
                        changed = true;
                    }
                    if lp.is_some() && *lp != game.last_played {
                        game.last_played = lp.clone();
                        changed = true;
                    }
                }
            }
        } else if source_lower == "epic" {
            if let Some(ref app_name) = game.source_id {
                if let Some(&pt) = epic_playtimes
                    .get(app_name)
                    .or_else(|| epic_playtimes.get(&app_name.to_lowercase()))
                {
                    if pt > 0 && pt != game.playtime_seconds {
                        game.playtime_seconds = pt;
                        game.play_count = Some(1);
                        changed = true;
                    }
                }

                let lp = epic_last_played
                    .get(app_name)
                    .or_else(|| epic_last_played.get(&app_name.to_lowercase()))
                    .or_else(|| {
                        game.notes.as_ref().and_then(|n| {
                            for part in n.split(';') {
                                let val = part.split(':').nth(1).unwrap_or("").trim();
                                if let Some(found) = epic_last_played.get(val) {
                                    return Some(found);
                                }
                            }
                            None
                        })
                    });

                if let Some(found_lp) = lp {
                    if game.last_played.as_deref() != Some(found_lp) {
                        game.last_played = Some(found_lp.clone());
                        changed = true;
                    }
                } else if game.last_played.is_none() {
                    if let Ok(cached_achs) = state.db.get_game_achievements(&game.id) {
                        if let Some(latest_date) = extract_latest_unlock_date(&cached_achs) {
                            game.last_played = Some(latest_date);
                            changed = true;
                        }
                    }
                }
            }
        }

        if game.playtime_seconds > 0 && (game.completion_status.as_deref() == Some("Not Played") || game.completion_status.is_none()) {
            game.completion_status = Some("Played".to_string());
            changed = true;
        }

        if changed {
            let _ = state.db.upsert_game(game);
            let _ = app_handle.emit("game-updated", &game);
            updated_count += 1;
        }
    }

    Ok(updated_count)
}

/// One-time background warmup for active (installed or played) games whose achievements haven't been indexed yet
#[tauri::command]
async fn warmup_active_achievements(
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let all = state.db.get_all_games()?;
    let checked_raw = state.db.get_setting("checked_achievement_games_v1")?.unwrap_or_else(|| "[]".to_string());
    let mut checked_set: std::collections::HashSet<String> =
        serde_json::from_str(&checked_raw).unwrap_or_default();

    let candidates: Vec<Game> = all
        .into_iter()
        .filter(|g| {
            let src = g.source.to_lowercase();
            (src == "steam" || src == "epic")
                && (g.is_installed || g.playtime_seconds > 0)
                && !checked_set.contains(&g.id)
        })
        .filter(|g| {
            // Skip if achievements are already in DB unless Epic game has 0 unlocked cached
            match state.db.get_game_achievements(&g.id) {
                Ok(existing) => {
                    existing.is_empty()
                        || (g.source.eq_ignore_ascii_case("epic")
                            && existing.iter().all(|a| !a.is_unlocked))
                }
                Err(_) => true,
            }
        })
        .collect();

    if candidates.is_empty() {
        return Ok(0);
    }

    let steam_integration = state.db.get_integration("steam").unwrap_or_default();
    let steamid64 = if steam_integration.is_authenticated {
        steam_integration.account_id
    } else {
        None
    };

    let epic_integration = state.db.get_integration("epic").unwrap_or_default();
    let epic_aid = if epic_integration.is_authenticated {
        epic_integration.account_id
    } else {
        None
    };
    let epic_token = if epic_integration.is_authenticated {
        epic_integration.access_token
    } else {
        None
    };

    let semaphore = Arc::new(tokio::sync::Semaphore::new(6));
    let mut join_set = tokio::task::JoinSet::new();

    for game in candidates {
        let sem = semaphore.clone();
        let sid_clone = steamid64.clone();
        let eaid_clone = epic_aid.clone();
        let etok_clone = epic_token.clone();

        join_set.spawn(async move {
            let _permit = sem.acquire_owned().await.ok()?;
            let src = game.source.to_lowercase();
            if src == "steam" {
                let appid = game.source_id.as_deref().filter(|s| !s.is_empty())?;
                let achs = SteamMetadataFetcher::fetch_steam_achievements(
                    &game.id,
                    appid,
                    sid_clone.as_deref(),
                )
                .await
                .ok()?;
                Some((game, achs))
            } else if src == "epic" {
                let ns = parse_epic_sandbox_from_notes(game.notes.as_deref())?;
                let achs = EpicMetadataFetcher::fetch_epic_achievements(
                    &game.id,
                    &ns,
                    eaid_clone.as_deref(),
                    etok_clone.as_deref(),
                )
                .await
                .ok()?;
                Some((game, achs))
            } else {
                None
            }
        });
    }

    let mut indexed = 0;
    while let Some(res) = join_set.join_next().await {
        if let Ok(Some((mut game, achs))) = res {
            checked_set.insert(game.id.clone());
            if !achs.is_empty() {
                let _ = state.db.save_game_achievements(&game.id, &achs);
                let _ = app_handle.emit("achievements-updated", &game.id);
                if game.source.eq_ignore_ascii_case("epic") && game.last_played.is_none() {
                    if let Some(latest_date) = extract_latest_unlock_date(&achs) {
                        game.last_played = Some(latest_date);
                        let _ = state.db.upsert_game(&game);
                        let _ = app_handle.emit("game-updated", &game);
                    }
                }
                indexed += 1;
            }
        }
    }

    if let Ok(serialized) = serde_json::to_string(&checked_set) {
        let _ = state.db.set_setting("checked_achievement_games_v1", &serialized);
    }

    Ok(indexed)
}

fn extract_sgdb_candidate_hash(url: &str) -> Option<String> {
    let trimmed = url.trim();
    let is_sgdb_raw = trimmed.starts_with("https://cdn2.steamgriddb.com/grid/")
        || trimmed.starts_with("https://cdn2.steamgriddb.com/hero/")
        || trimmed.starts_with("https://cdn2.steamgriddb.com/logo/")
        || trimmed.starts_with("https://cdn2.steamgriddb.com/icon/");
    if !is_sgdb_raw {
        return None;
    }

    let file_part = trimmed.rsplit('/').next()?.split('?').next()?;
    let (hash, ext) = file_part.rsplit_once('.')?;
    let ext_lower = ext.to_ascii_lowercase();
    if matches!(ext_lower.as_str(), "png" | "webp" | "gif") && !hash.is_empty() {
        Some(hash.to_string())
    } else {
        None
    }
}

/// Upgrades heavy raw SteamGridDB APNG / Animated WebP URLs (often 10–32 MB CPU-decoded)
/// to their official hardware-accelerated VP9 `.webm` stream (`cdn2.steamgriddb.com/thumb/<hash>.webm`)
/// while leaving static PNG/JPG covers untouched.
#[tauri::command]
async fn optimize_animated_artwork(
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let mut all = state.db.get_all_games()?;
    if all.is_empty() {
        return Ok(0);
    }

    let checked_raw = state
        .db
        .get_setting("checked_sgdb_webm_hashes_v1")?
        .unwrap_or_else(|| "{}".to_string());
    let mut checked_map: std::collections::HashMap<String, bool> =
        serde_json::from_str(&checked_raw).unwrap_or_default();

    let mut to_probe = std::collections::HashSet::new();
    for g in &all {
        for opt_url in [
            g.cover_image.as_deref(),
            g.background_image.as_deref(),
            g.logo_image.as_deref(),
            g.icon_image.as_deref(),
        ] {
            if let Some(h) = opt_url.and_then(extract_sgdb_candidate_hash) {
                if !checked_map.contains_key(&h) {
                    to_probe.insert(h);
                }
            }
        }
    }

    if !to_probe.is_empty() {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(6))
            .user_agent(format!("OpenPlay/{}", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(|e| e.to_string())?;

        let sem = Arc::new(tokio::sync::Semaphore::new(8));
        let mut join_set = tokio::task::JoinSet::new();

        for hash in to_probe {
            let client_clone = client.clone();
            let sem_clone = sem.clone();
            join_set.spawn(async move {
                let _permit = sem_clone.acquire_owned().await.ok()?;
                let webm_url = format!("https://cdn2.steamgriddb.com/thumb/{}.webm", hash);
                let resp = client_clone.head(&webm_url).send().await.ok()?;
                if resp.status().is_success() {
                    Some((hash, true))
                } else if resp.status() == reqwest::StatusCode::NOT_FOUND {
                    Some((hash, false))
                } else {
                    None
                }
            });
        }

        while let Some(res) = join_set.join_next().await {
            if let Ok(Some((hash, has_webm))) = res {
                checked_map.insert(hash, has_webm);
            }
        }

        if let Ok(serialized) = serde_json::to_string(&checked_map) {
            let _ = state.db.set_setting("checked_sgdb_webm_hashes_v1", &serialized);
        }
    }

    let mut upgraded_games = 0;
    for game in &mut all {
        let mut changed = false;

        let try_upgrade = |field: &mut Option<String>| -> bool {
            if let Some(ref current) = field {
                if let Some(hash) = extract_sgdb_candidate_hash(current) {
                    if checked_map.get(&hash).copied() == Some(true) {
                        *field = Some(format!("https://cdn2.steamgriddb.com/thumb/{}.webm", hash));
                        return true;
                    }
                }
            }
            false
        };

        if try_upgrade(&mut game.cover_image) {
            changed = true;
        }
        if try_upgrade(&mut game.background_image) {
            changed = true;
        }
        if try_upgrade(&mut game.logo_image) {
            changed = true;
        }
        if try_upgrade(&mut game.icon_image) {
            changed = true;
        }

        if changed {
            let _ = state.db.save_game_exact(game);
            let _ = app_handle.emit("game-updated", &game);
            upgraded_games += 1;
        }
    }

    Ok(upgraded_games)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let database = Arc::new(Database::new().expect("Failed to initialize OpenPlay SQLite database"));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState { db: database })
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                if let Some(icon) = app.default_window_icon() {
                    let _ = window.set_icon(icon.clone());
                }
                let win_clone = window.clone();
                // Ensure the window starts inside valid screen bounds
                if let Ok(pos) = window.outer_position() {
                    if pos.x < -10000 || pos.y < -10000 {
                        let _ = window.center();
                    }
                }
                // Safeguard against sudden off-screen cursor drops during dragging
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Moved(pos) = event {
                        if pos.x < -10000 || pos.y < -10000 {
                            let _ = win_clone.center();
                        }
                    }
                });
            }
            Ok(())
        })
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
            save_igdb_keys,
            get_igdb_keys,
            fetch_metadata_from_source,
            apply_custom_artwork,
            sync_all_metadata,
            full_refresh_library,
            get_steam_integration,
            save_steam_integration,
            open_steam_login_window,
            authenticate_steam_account,
            logout_steam,
            get_epic_integration,
            save_epic_integration,
            open_epic_login_window,
            authenticate_epic_code,
            logout_epic,
            scan_epic_library,
            clear_all_games,
            save_game,
            delete_game,
            toggle_favorite,
            launch_game,
            stop_game,
            get_running_games,
            select_file,
            select_multiple_files,
            select_directory,
            auto_detect_playnite_backups,
            get_playnite_backup_summary,
            import_playnite_backup,
            scan_local_executable,
            scan_local_folder,
            add_local_games,
            get_app_config,
            save_app_config,
            get_game_achievements,
            sync_game_achievements,
            sync_all_achievements,
            sync_retroachievements,
            refresh_game_live_data,
            sync_live_playtimes,
            warmup_active_achievements,
            get_game_achievement_summary,
            get_hunter_profile,
            open_in_explorer,
            get_game_news,
            set_game_hidden,
            check_for_app_updates,
            optimize_animated_artwork
        ])
        .run(tauri::generate_context!())
        .expect("error while running OpenPlay application");
}
