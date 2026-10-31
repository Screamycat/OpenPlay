pub mod autostart;
pub mod db;
pub mod emulator;
pub mod launcher;
pub mod metadata;
pub mod models;
pub mod scanner;

use autostart::AutostartManager;
use db::Database;
use emulator::EmulatorService;
use launcher::GameLauncher;
use metadata::hltb::{HltbData, HltbFetcher};
use metadata::steam::{SteamMetadataFetcher, SteamNewsItem};
use metadata::steamgriddb::{SteamGridDBAsset, SteamGridDBClient};
use metadata::epic::EpicMetadataFetcher;
use metadata::retroachievements::RetroAchievementsClient;
use metadata::scores::ScoreEnrichmentEngine;
use models::{
    Achievement, AppConfig, ConfiguredConsole, DiscoveredRom, EmulatorProfile, Game,
    GameAchievementSummary, GameTrailer, HunterProfile, LibraryIntegration,
};
use scanner::steam::SteamScanner;
use scanner::epic::EpicScanner;
use scanner::providers::{
    AmazonScanner, BattleNetScanner, EaScanner, GogScanner, GooglePlayScanner, RiotScanner,
    RobloxScanner, UbisoftScanner, XboxScanner,
};
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
fn get_all_games(state: State<'_, AppState>) -> Result<Vec<Game>, String> {
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
    scan_epic_library_core(&state.db).await
}

pub async fn scan_epic_library_core(db: &Arc<Database>) -> Result<ScanResult, String> {
    let integration = db.get_integration("epic").unwrap_or_default();

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

        let _ = db.upsert_game(&game);
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
                        let _ = db.save_integration(&updated);
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
                    ..Default::default()
                };

                let _ = db.upsert_game(&uninstalled_game);
                uninstalled_count += 1;
            }
        }
    }

    let mut updated_integration = db.get_integration("epic").unwrap_or(integration);
    updated_integration.last_sync = Some(chrono::Local::now().format("%Y-%m-%d %H:%M").to_string());
    let _ = db.save_integration(&updated_integration);

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
    scan_steam_library_core(&state.db).await
}

pub async fn scan_steam_library_core(db: &Arc<Database>) -> Result<ScanResult, String> {
    let integration = db.get_integration("steam").unwrap_or_default();

    // 1. Scan installed games from local disk
    let installed_games = SteamScanner::scan_installed_games()?;
    let mut installed_ids = std::collections::HashSet::new();
    let installed_count = installed_games.len();
    let mut uninstalled_count = 0;

    for game in installed_games {
        if let Some(ref aid) = game.source_id {
            installed_ids.insert(aid.clone());
        }
        let _ = db.upsert_game(&game);
    }

    // 2. If uninstalled games enabled, scan uninstalled games from localconfig history
    if integration.import_uninstalled {
        if let Some(steam_dir) = SteamScanner::find_steam_install_dir() {
            let uninstalled_games = SteamScanner::scan_uninstalled_from_localconfig(&steam_dir, &installed_ids).await;
            for uninstalled in uninstalled_games {
                let _ = db.upsert_game(&uninstalled);
                uninstalled_count += 1;
            }
        }
    }

    let mut updated_integration = integration;
    updated_integration.last_sync = Some(chrono::Local::now().format("%Y-%m-%d %H:%M").to_string());
    let _ = db.save_integration(&updated_integration);

    Ok(ScanResult {
        count: installed_count + uninstalled_count,
        installed: installed_count,
        uninstalled: uninstalled_count,
    })
}

#[tauri::command]
fn get_provider_integration(provider: String, state: State<'_, AppState>) -> Result<LibraryIntegration, String> {
    state.db.get_integration(&provider)
}

#[tauri::command]
fn save_provider_integration(integration: LibraryIntegration, state: State<'_, AppState>) -> Result<(), String> {
    state.db.save_integration(&integration)
}

#[tauri::command]
fn logout_provider(provider: String, state: State<'_, AppState>) -> Result<LibraryIntegration, String> {
    let mut integration = state.db.get_integration(&provider).unwrap_or_default();
    integration.provider = provider;
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
async fn open_gog_login_window(app_handle: AppHandle) -> Result<(), String> {
    if let Some(existing) = app_handle.get_webview_window("gog_login") {
        let _ = existing.set_focus();
        return Ok(());
    }

    let url: Url = "https://auth.gog.com/auth?client_id=46899977096215655&redirect_uri=https%3A%2F%2Fembed.gog.com%2Fon_login_success%3Forigin%3Dclient&response_type=code&layout=client2"
        .parse()
        .map_err(|e| format!("{:?}", e))?;
    let app_handle_clone = app_handle.clone();

    WebviewWindowBuilder::new(
        &app_handle,
        "gog_login",
        WebviewUrl::External(url),
    )
    .title("Sign In to GOG Galaxy")
    .inner_size(760.0, 660.0)
    .center()
    .resizable(true)
    .on_navigation(move |nav_url| {
        let url_str = nav_url.as_str();
        if url_str.contains("code=") {
            if let Some(pos) = url_str.find("code=") {
                let code_part = &url_str[pos + 5..];
                let code = code_part.split('&').next().unwrap_or("").to_string();
                if !code.is_empty() {
                    let _ = app_handle_clone.emit("gog-code-detected", code);
                    if let Some(w) = app_handle_clone.get_webview_window("gog_login") {
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
async fn authenticate_gog_code(
    code: String,
    state: State<'_, AppState>,
) -> Result<LibraryIntegration, String> {
    let mut integration = state.db.get_integration("gog").unwrap_or_default();
    let clean_code = if let Some(pos) = code.find("code=") {
        let rest = &code[pos + 5..];
        rest.split('&').next().unwrap_or(code.trim()).to_string()
    } else {
        code.trim().to_string()
    };

    let auth = GogScanner::exchange_code_for_token(&clean_code).await?;

    integration.provider = "gog".to_string();
    integration.account_id = Some(auth.account_id);
    integration.username = Some(auth.display_name);
    integration.avatar_url = auth.avatar_url;
    integration.is_authenticated = true;
    integration.access_token = Some(auth.access_token);
    integration.refresh_token = auth.refresh_token;

    state.db.save_integration(&integration)?;
    Ok(integration)
}

#[tauri::command]
async fn open_xbox_login_window(app_handle: AppHandle) -> Result<(), String> {
    if let Some(existing) = app_handle.get_webview_window("xbox_login") {
        let _ = existing.set_focus();
        return Ok(());
    }

    let url: Url = "https://login.live.com/oauth20_authorize.srf?client_id=38cd2fa8-66fd-4760-afb2-405eb65d5b0c&response_type=code&approval_prompt=auto&scope=Xboxlive.signin%20Xboxlive.offline_access&redirect_uri=https://login.live.com/oauth20_desktop.srf"
        .parse()
        .map_err(|e| format!("{:?}", e))?;
    let app_handle_clone = app_handle.clone();

    let init_script = r#"
        (function() {
            function checkUrl() {
                try {
                    const href = window.location.href || "";
                    const hash = window.location.hash || "";
                    const combined = href + "&" + hash;
                    if (combined.includes("code=")) {
                        const match = combined.match(/[?&]code=([^&]+)/);
                        if (match && match[1]) {
                            window.location.href = "https://localhost/openplay_xbox_auth?code=" + match[1];
                        }
                    } else if (combined.includes("access_token=")) {
                        const match = combined.match(/access_token=([^&]+)/);
                        if (match && match[1]) {
                            window.location.href = "https://localhost/openplay_xbox_auth?access_token=" + match[1];
                        }
                    }
                } catch (e) {}
            }
            setInterval(checkUrl, 250);
            window.addEventListener("DOMContentLoaded", checkUrl);
        })();
    "#;

    WebviewWindowBuilder::new(
        &app_handle,
        "xbox_login",
        WebviewUrl::External(url),
    )
    .title("Sign In to Xbox Live")
    .inner_size(760.0, 680.0)
    .center()
    .resizable(true)
    .initialization_script(init_script)
    .on_navigation(move |nav_url| {
        let url_str = nav_url.as_str();
        if url_str.contains("code=") {
            if let Some(pos) = url_str.find("code=") {
                let code_part = &url_str[pos + "code=".len()..];
                let code = code_part.split('&').next().unwrap_or("").to_string();
                if !code.is_empty() {
                    let decoded = scanner::providers::url_decode(&code);
                    let _ = app_handle_clone.emit("xbox-token-detected", decoded);
                    if let Some(w) = app_handle_clone.get_webview_window("xbox_login") {
                        let _ = w.close();
                    }
                    return false;
                }
            }
        } else if url_str.contains("access_token=") {
            if let Some(pos) = url_str.find("access_token=") {
                let token_part = &url_str[pos + "access_token=".len()..];
                let token = token_part.split('&').next().unwrap_or("").to_string();
                if !token.is_empty() {
                    let decoded = scanner::providers::url_decode(&token);
                    let _ = app_handle_clone.emit("xbox-token-detected", decoded);
                    if let Some(w) = app_handle_clone.get_webview_window("xbox_login") {
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
async fn authenticate_xbox_token(
    token: String,
    state: State<'_, AppState>,
) -> Result<LibraryIntegration, String> {
    let mut integration = state.db.get_integration("xbox").unwrap_or_default();
    let clean_token = if let Some(pos) = token.find("code=") {
        let rest = &token[pos + "code=".len()..];
        let raw = rest.split('&').next().unwrap_or(token.trim());
        scanner::providers::url_decode(raw)
    } else if let Some(pos) = token.find("access_token=") {
        let rest = &token[pos + "access_token=".len()..];
        let raw = rest.split('&').next().unwrap_or(token.trim());
        scanner::providers::url_decode(raw)
    } else {
        token.trim().to_string()
    };

    let auth = XboxScanner::authenticate_with_ms_token(&clean_token).await?;

    integration.provider = "xbox".to_string();
    integration.account_id = Some(auth.account_id);
    integration.username = Some(auth.display_name);
    integration.avatar_url = auth.avatar_url;
    integration.is_authenticated = true;
    integration.access_token = Some(auth.access_token);
    integration.refresh_token = auth.refresh_token.or(Some(clean_token));

    state.db.save_integration(&integration)?;
    Ok(integration)
}

#[tauri::command]
async fn open_battlenet_login_window(app_handle: AppHandle) -> Result<(), String> {
    if let Some(existing) = app_handle.get_webview_window("battlenet_login") {
        let _ = existing.set_focus();
        return Ok(());
    }

    let url: Url = "https://account.battle.net/overview"
        .parse()
        .map_err(|e| format!("{:?}", e))?;
    let app_handle_clone = app_handle.clone();

    let init_script = r#"
        (function() {
            let captured = false;
            async function checkBnet() {
                if (captured) return;
                try {
                    const host = window.location.hostname || "";
                    const path = window.location.pathname || "";
                    if (host.includes("account.battle.net") && !path.includes("login")) {
                        const r1 = await fetch("https://account.battle.net/api/games-and-subs", {
                            headers: { "Accept": "application/json" },
                            credentials: "include"
                        });
                        if (!r1.ok) return;
                        const gamesAndSubs = await r1.json();
                        if (!gamesAndSubs || !Array.isArray(gamesAndSubs.gameAccounts)) return;

                        let classicGames = [];
                        try {
                            const r2 = await fetch("https://account.battle.net/api/classic-games", {
                                headers: { "Accept": "application/json" },
                                credentials: "include"
                            });
                            if (r2.ok) {
                                const cj = await r2.json();
                                if (cj && Array.isArray(cj.classicGames)) {
                                    classicGames = cj.classicGames;
                                }
                            }
                        } catch (e) {}

                        let battleTag = "Battle.net User";
                        try {
                            const r3 = await fetch("https://account.battle.net/api/overview", {
                                headers: { "Accept": "application/json" },
                                credentials: "include"
                            });
                            if (r3.ok) {
                                const oj = await r3.json();
                                battleTag = (oj && oj.accountDetails && (oj.accountDetails.battleTag || oj.accountDetails.email)) || battleTag;
                            }
                        } catch (e) {}

                        captured = true;
                        const payload = JSON.stringify({
                            battleTag: battleTag,
                            gameAccounts: gamesAndSubs.gameAccounts,
                            classicGames: classicGames
                        });
                        window.location.href = "https://localhost/openplay_bnet_auth?payload=" + encodeURIComponent(payload);
                    }
                } catch (e) {}
            }
            setInterval(checkBnet, 600);
            window.addEventListener("DOMContentLoaded", checkBnet);
        })();
    "#;

    WebviewWindowBuilder::new(
        &app_handle,
        "battlenet_login",
        WebviewUrl::External(url),
    )
    .title("Sign In to Battle.net")
    .inner_size(800.0, 680.0)
    .center()
    .resizable(true)
    .initialization_script(init_script)
    .on_navigation(move |nav_url| {
        let url_str = nav_url.as_str();
        if url_str.contains("openplay_bnet_auth?payload=") {
            if let Some(pos) = url_str.find("payload=") {
                let raw = &url_str[pos + "payload=".len()..];
                let encoded = raw.split('&').next().unwrap_or("");
                if !encoded.is_empty() {
                    let decoded = scanner::providers::url_decode(encoded);
                    let _ = app_handle_clone.emit("battlenet-payload-detected", decoded);
                    if let Some(w) = app_handle_clone.get_webview_window("battlenet_login") {
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
async fn authenticate_battlenet_payload(
    payload: String,
    state: State<'_, AppState>,
) -> Result<LibraryIntegration, String> {
    let mut integration = state.db.get_integration("battlenet").unwrap_or_default();
    let val: serde_json::Value = serde_json::from_str(&payload)
        .map_err(|e| format!("Invalid Battle.net JSON payload: {}", e))?;

    let battle_tag = val["battleTag"]
        .as_str()
        .unwrap_or("Battle.net Account")
        .to_string();

    integration.provider = "battlenet".to_string();
    integration.account_id = Some(battle_tag.clone());
    integration.username = Some(battle_tag);
    integration.is_authenticated = true;
    integration.access_token = Some(payload);

    state.db.save_integration(&integration)?;
    Ok(integration)
}

#[tauri::command]
async fn open_ea_login_window(app_handle: AppHandle) -> Result<(), String> {
    if let Some(existing) = app_handle.get_webview_window("ea_login") {
        let _ = existing.set_focus();
        return Ok(());
    }

    let url: Url = "https://www.ea.com/login"
        .parse()
        .map_err(|e| format!("{:?}", e))?;
    let app_handle_clone = app_handle.clone();

    let init_script = r#"
        (function() {
            let captured = false;
            async function checkEa() {
                if (captured) return;
                try {
                    const href = window.location.href || "";
                    if (href.includes("access_token=")) {
                        const m = href.match(/access_token=([^&]+)/);
                        if (m && m[1]) {
                            captured = true;
                            window.location.href = "https://localhost/openplay_ea_auth?access_token=" + m[1];
                            return;
                        }
                    }
                    const host = window.location.hostname || "";
                    if (host.endsWith("ea.com") && !href.includes("signin.ea.com") && !href.includes("/login")) {
                        const r = await fetch("https://accounts.ea.com/connect/auth?client_id=ORIGIN_JS_SDK&response_type=token&redirect_uri=nucleus:rest&prompt=none", {
                            credentials: "include"
                        });
                        if (r.ok) {
                            const j = await r.json();
                            if (j && j.access_token) {
                                captured = true;
                                window.location.href = "https://localhost/openplay_ea_auth?access_token=" + encodeURIComponent(j.access_token);
                            }
                        }
                    }
                } catch (e) {}
            }
            setInterval(checkEa, 700);
            window.addEventListener("DOMContentLoaded", checkEa);
        })();
    "#;

    WebviewWindowBuilder::new(
        &app_handle,
        "ea_login",
        WebviewUrl::External(url),
    )
    .title("Sign In to EA Account")
    .inner_size(780.0, 680.0)
    .center()
    .resizable(true)
    .initialization_script(init_script)
    .on_navigation(move |nav_url| {
        let url_str = nav_url.as_str();
        if url_str.contains("access_token=") {
            if let Some(pos) = url_str.find("access_token=") {
                let raw = &url_str[pos + "access_token=".len()..];
                let tok = raw.split('&').next().unwrap_or("");
                if !tok.is_empty() {
                    let decoded = scanner::providers::url_decode(tok);
                    let _ = app_handle_clone.emit("ea-token-detected", decoded);
                    if let Some(w) = app_handle_clone.get_webview_window("ea_login") {
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
async fn authenticate_ea_token(
    token: String,
    state: State<'_, AppState>,
) -> Result<LibraryIntegration, String> {
    let mut integration = state.db.get_integration("ea").unwrap_or_default();
    let clean_token = if token.trim().starts_with('{') {
        if let Ok(j) = serde_json::from_str::<serde_json::Value>(token.trim()) {
            j["access_token"].as_str().unwrap_or(token.trim()).to_string()
        } else {
            token.trim().to_string()
        }
    } else if let Some(pos) = token.find("access_token=") {
        let rest = &token[pos + "access_token=".len()..];
        let raw = rest.split('&').next().unwrap_or(token.trim());
        scanner::providers::url_decode(raw)
    } else {
        token.trim().to_string()
    };

    let auth = EaScanner::authenticate_with_token(&clean_token).await?;

    integration.provider = "ea".to_string();
    integration.account_id = Some(auth.account_id);
    integration.username = Some(auth.display_name);
    integration.is_authenticated = true;
    integration.access_token = Some(auth.access_token);

    state.db.save_integration(&integration)?;
    Ok(integration)
}

#[tauri::command]
async fn open_ubisoft_login_window(app_handle: AppHandle) -> Result<(), String> {
    if let Some(existing) = app_handle.get_webview_window("ubisoft_login") {
        let _ = existing.set_focus();
        return Ok(());
    }

    // Official Ubisoft Connect WebAuth portal URL with dark theme and redirect callback
    let url: Url = "https://connect.ubisoft.com/login?appId=74e71609-1ddf-47da-9073-71ac3aa8c90c&lang=en-US&nextUrl=https:%2F%2Fconnect.ubisoft.com%2Fready"
        .parse()
        .map_err(|e| format!("{:?}", e))?;
    let app_handle_clone = app_handle.clone();

    let init_script = r#"
        (function() {
            let captured = false;

            function extractAndSend(ticket, userId, name) {
                if (captured || !ticket) return;
                captured = true;
                const payload = JSON.stringify({
                    ticket: ticket,
                    userId: userId || "ubisoft_user",
                    name: name || "Ubisoft User"
                });
                window.location.href = "https://localhost/openplay_ubi_auth?payload=" + encodeURIComponent(payload);
            }

            function checkStorage() {
                if (captured) return;
                try {
                    for (const storage of [window.localStorage, window.sessionStorage]) {
                        if (!storage) continue;
                        const direct = storage.getItem("PRODloginData") || storage.getItem("loginData") || storage.getItem("PRODrememberMeToken");
                        if (direct) {
                            try {
                                const parsed = JSON.parse(direct);
                                const t = parsed.ticket || parsed.rememberMeTicket;
                                if (t) {
                                    extractAndSend(t, parsed.userId || parsed.profileId, parsed.nameOnPlatform || parsed.username);
                                    return;
                                }
                            } catch (_) {}
                        }

                        for (let i = 0; i < storage.length; i++) {
                            const k = storage.key(i);
                            const v = storage.getItem(k);
                            if (v && (v.includes('"ticket"') || v.includes('"rememberMeTicket"'))) {
                                try {
                                    const parsed = JSON.parse(v);
                                    const t = parsed.ticket || parsed.rememberMeTicket;
                                    if (t) {
                                        extractAndSend(t, parsed.userId || parsed.profileId, parsed.nameOnPlatform || parsed.username);
                                        return;
                                    }
                                } catch (_) {}
                            }
                        }
                    }
                } catch (e) {}
            }

            function checkUrl() {
                if (captured) return;
                try {
                    const href = window.location.href;
                    if (href.includes("rememberMeTicket=") || href.includes("ticket=")) {
                        const urlObj = new URL(href);
                        const hashClean = (urlObj.hash || "").replace(/^#/, "");
                        const hashParams = new URLSearchParams(hashClean);
                        const searchParams = urlObj.searchParams;

                        const ticket = searchParams.get("rememberMeTicket")
                            || hashParams.get("rememberMeTicket")
                            || searchParams.get("ticket")
                            || hashParams.get("ticket");

                        if (ticket) {
                            const userId = searchParams.get("userId")
                                || hashParams.get("userId")
                                || searchParams.get("profileId")
                                || hashParams.get("profileId");
                            const name = searchParams.get("username")
                                || hashParams.get("username")
                                || searchParams.get("name")
                                || hashParams.get("name");

                            extractAndSend(ticket, userId, name);
                            return;
                        }
                    }
                } catch (e) {}
            }

            function runChecks() {
                checkUrl();
                checkStorage();
            }

            setInterval(runChecks, 400);
            window.addEventListener("DOMContentLoaded", runChecks);
            window.addEventListener("load", runChecks);
        })();
    "#;

    WebviewWindowBuilder::new(
        &app_handle,
        "ubisoft_login",
        WebviewUrl::External(url),
    )
    .title("Sign In to Ubisoft Connect")
    .inner_size(480.0, 700.0)
    .center()
    .resizable(true)
    .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
    .initialization_script(init_script)
    .on_navigation(move |nav_url| {
        let url_str = nav_url.as_str();

        // 1. Intercepted via local redirect scheme from init_script
        if url_str.contains("openplay_ubi_auth?payload=") {
            if let Some(pos) = url_str.find("payload=") {
                let raw = &url_str[pos + "payload=".len()..];
                let encoded = raw.split('&').next().unwrap_or("");
                if !encoded.is_empty() {
                    let decoded = scanner::providers::url_decode(encoded);
                    let _ = app_handle_clone.emit("ubisoft-ticket-detected", decoded);
                    if let Some(w) = app_handle_clone.get_webview_window("ubisoft_login") {
                        let _ = w.close();
                    }
                    return false;
                }
            }
        }

        // 2. Intercepted directly from URL parameters or hash upon redirect
        if url_str.contains("rememberMeTicket=") || (url_str.contains("/ready") && url_str.contains("ticket=")) {
            let find_val = |key: &str| -> Option<String> {
                let pattern = format!("{}=", key);
                if let Some(idx) = url_str.find(&pattern) {
                    let slice = &url_str[idx + pattern.len()..];
                    let val = slice.split(|c| c == '&' || c == '#' || c == ' ').next().unwrap_or("");
                    if !val.is_empty() {
                        return Some(scanner::providers::url_decode(val));
                    }
                }
                None
            };

            let ticket = find_val("rememberMeTicket").or_else(|| find_val("ticket"));
            if let Some(t) = ticket {
                let user_id = find_val("userId")
                    .or_else(|| find_val("profileId"))
                    .unwrap_or_else(|| "ubisoft_user".to_string());
                let name = find_val("username")
                    .or_else(|| find_val("name"))
                    .unwrap_or_else(|| "Ubisoft User".to_string());
                let payload = serde_json::json!({
                    "ticket": t,
                    "userId": user_id,
                    "name": name,
                }).to_string();
                let _ = app_handle_clone.emit("ubisoft-ticket-detected", payload);
                if let Some(w) = app_handle_clone.get_webview_window("ubisoft_login") {
                    let _ = w.close();
                }
                return false;
            }
        }

        true
    })
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn authenticate_ubisoft_ticket(
    payload: String,
    state: State<'_, AppState>,
) -> Result<LibraryIntegration, String> {
    let mut integration = state.db.get_integration("ubisoft").unwrap_or_default();
    let (ticket, user_id, username) = if payload.trim().starts_with('{') {
        let j: serde_json::Value = serde_json::from_str(payload.trim()).map_err(|e| e.to_string())?;
        (
            j["ticket"]
                .as_str()
                .or_else(|| j["rememberMeTicket"].as_str())
                .unwrap_or("")
                .to_string(),
            j["userId"]
                .as_str()
                .or_else(|| j["profileId"].as_str())
                .unwrap_or("ubisoft_user")
                .to_string(),
            j["name"]
                .as_str()
                .or_else(|| j["username"].as_str())
                .unwrap_or("Ubisoft User")
                .to_string(),
        )
    } else {
        (
            payload.trim().to_string(),
            "ubisoft_user".to_string(),
            "Ubisoft User".to_string(),
        )
    };

    if ticket.is_empty() {
        return Err("Missing Ubisoft authentication ticket".to_string());
    }

    integration.provider = "ubisoft".to_string();
    integration.account_id = Some(user_id);
    integration.username = Some(username);
    integration.is_authenticated = true;
    integration.access_token = Some(ticket);

    state.db.save_integration(&integration)?;
    Ok(integration)
}

#[tauri::command]
async fn open_amazon_login_window(app_handle: AppHandle) -> Result<(), String> {
    if let Some(existing) = app_handle.get_webview_window("amazon_login") {
        let _ = existing.set_focus();
        return Ok(());
    }

    let (login_url, _, _, _) = AmazonScanner::build_login_params();
    let url: Url = login_url.parse().map_err(|e| format!("{:?}", e))?;
    let app_handle_clone = app_handle.clone();

    WebviewWindowBuilder::new(
        &app_handle,
        "amazon_login",
        WebviewUrl::External(url),
    )
    .title("Sign In to Amazon Games")
    .inner_size(760.0, 680.0)
    .center()
    .resizable(true)
    .user_agent("Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) @amzn/aga-electron-platform/1.0.0 Chrome/78.0.3904.130 Electron/7.1.9 Safari/537.36")
    .on_navigation(move |nav_url| {
        let url_str = nav_url.as_str();
        if url_str.contains("openid.oa2.authorization_code=") {
            if let Some(pos) = url_str.find("openid.oa2.authorization_code=") {
                let raw = &url_str[pos + "openid.oa2.authorization_code=".len()..];
                let code = raw.split('&').next().unwrap_or("").to_string();
                if !code.is_empty() {
                    let decoded = scanner::providers::url_decode(&code);
                    let _ = app_handle_clone.emit("amazon-code-detected", decoded);
                    if let Some(w) = app_handle_clone.get_webview_window("amazon_login") {
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
async fn authenticate_amazon_code(
    code: String,
    state: State<'_, AppState>,
) -> Result<LibraryIntegration, String> {
    let mut integration = state.db.get_integration("amazon").unwrap_or_default();
    let clean_code = if let Some(pos) = code.find("openid.oa2.authorization_code=") {
        let rest = &code[pos + "openid.oa2.authorization_code=".len()..];
        let raw = rest.split('&').next().unwrap_or(code.trim());
        scanner::providers::url_decode(raw)
    } else {
        code.trim().to_string()
    };

    let auth = AmazonScanner::exchange_code_for_token(&clean_code).await?;

    integration.provider = "amazon".to_string();
    integration.account_id = Some(auth.account_id);
    integration.username = Some(auth.display_name);
    integration.is_authenticated = true;
    integration.access_token = Some(auth.access_token);
    integration.refresh_token = auth.refresh_token;

    state.db.save_integration(&integration)?;
    Ok(integration)
}

async fn enrich_scanned_provider_game(
    game: &mut Game,
    igdb_creds: &Option<(String, String)>,
) {
    let current_status = game.completion_status.as_deref().unwrap_or("Auto");
    if game.playtime_seconds > 0 && (current_status == "Auto" || current_status == "Not Played") {
        game.completion_status = Some("Played".to_string());
    }

    if let Some((ref cid, ref csec)) = igdb_creds {
        if game.cover_image.is_none() || game.description.is_none() || game.background_image.is_none() {
            if let Ok(meta) = metadata::igdb::IgdbFetcher::fetch_metadata(
                cid,
                csec,
                &game.title,
                Some(&["PC (Microsoft Windows)".to_string()]),
            )
            .await
            {
                apply_igdb_meta(game, meta);
            }
        }
    }

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

    if game.hltb_main.is_none() {
        if let Some(hltb) = HltbFetcher::fetch_hltb(&game.title).await {
            game.hltb_main = Some(hltb.main_story_hours);
            game.hltb_extra = Some(hltb.main_extra_hours);
            game.hltb_completionist = Some(hltb.completionist_hours);
        }
    }

    if game.critic_score.is_none() || game.community_score.is_none() {
        let scores = ScoreEnrichmentEngine::resolve_scores_for_game(
            &game.title,
            &game.source,
            game.source_id.as_deref(),
        )
        .await;

        if game.critic_score.is_none() && scores.critic_score.is_some() {
            game.critic_score = scores.critic_score;
        }
        if game.community_score.is_none() && scores.community_score.is_some() {
            game.community_score = scores.community_score;
        }
    }
}

#[tauri::command]
async fn scan_provider_library(
    provider: String,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<ScanResult, String> {
    scan_provider_library_core(&provider, &app_handle, &state.db).await
}

pub async fn scan_provider_library_core(
    provider: &str,
    app_handle: &AppHandle,
    db: &Arc<Database>,
) -> Result<ScanResult, String> {
    let prov = provider.to_lowercase();
    if prov == "steam" {
        return scan_steam_library_core(db).await;
    }
    if prov == "epic" {
        return scan_epic_library_core(db).await;
    }

    let integration = db.get_integration(&prov).unwrap_or_default();
    let app_cfg = db.get_app_config().unwrap_or_default();
    let igdb_creds = match (app_cfg.igdb_client_id, app_cfg.igdb_client_secret) {
        (Some(cid), Some(sec)) if !cid.trim().is_empty() && !sec.trim().is_empty() => {
            Some((cid.trim().to_string(), sec.trim().to_string()))
        }
        _ => None,
    };

    let mut installed_games: Vec<Game> = Vec::new();
    let mut uninstalled_games: Vec<Game> = Vec::new();

    match prov.as_str() {
        "gog" => {
            if integration.import_installed {
                installed_games = GogScanner::scan_installed_games()?;
            }
            let installed_ids: std::collections::HashSet<String> = installed_games
                .iter()
                .filter_map(|g| g.source_id.clone())
                .collect();

            if integration.is_authenticated {
                let mut token = integration.access_token.clone().unwrap_or_default();
                let uname = integration.username.as_deref();
                let uid = integration.account_id.as_deref();

                // Also merge cloud stats into installed games if authenticated
                if let (Some(u), Some(id)) = (uname, uid) {
                    let (cloud_pt, cloud_lp) = GogScanner::fetch_cloud_stats(u, id, &token).await;
                    for g in &mut installed_games {
                        if let Some(ref sid) = g.source_id {
                            if let Some(&cpt) = cloud_pt.get(sid) {
                                if cpt > g.playtime_seconds {
                                    g.playtime_seconds = cpt;
                                }
                            }
                            if g.last_played.is_none() {
                                g.last_played = cloud_lp.get(sid).cloned();
                            }
                        }
                    }
                }

                if integration.import_uninstalled {
                    let owned_res = GogScanner::fetch_owned_games(&token, uname, uid).await;
                    let all_owned = match owned_res {
                        Ok(list) => list,
                        Err(_) => {
                            if let Some(ref rtok) = integration.refresh_token {
                                if let Ok(new_auth) = GogScanner::refresh_access_token(rtok).await {
                                    let mut upd = integration.clone();
                                    upd.access_token = Some(new_auth.access_token.clone());
                                    upd.refresh_token = new_auth.refresh_token;
                                    let _ = db.save_integration(&upd);
                                    token = new_auth.access_token;
                                    GogScanner::fetch_owned_games(&token, uname, uid).await.unwrap_or_default()
                                } else {
                                    Vec::new()
                                }
                            } else {
                                Vec::new()
                            }
                        }
                    };
                    uninstalled_games = all_owned
                        .into_iter()
                        .filter(|g| {
                            g.source_id
                                .as_ref()
                                .map(|id| !installed_ids.contains(id))
                                .unwrap_or(true)
                        })
                        .collect();
                }
            }
        }
        "xbox" => {
            if integration.import_installed {
                installed_games = XboxScanner::scan_installed_games()?;
            }
            if integration.is_authenticated {
                let mut xuid = integration.account_id.clone().unwrap_or_default();
                let mut auth_header = integration.access_token.clone().unwrap_or_default();

                let mut cloud_res = XboxScanner::fetch_cloud_library(&xuid, &auth_header).await;
                if cloud_res.is_err() {
                    if let Some(ref rtok) = integration.refresh_token {
                        if let Ok(new_auth) = XboxScanner::refresh_xbox_auth(rtok).await {
                            let mut upd = integration.clone();
                            upd.account_id = Some(new_auth.account_id.clone());
                            upd.access_token = Some(new_auth.access_token.clone());
                            if new_auth.refresh_token.is_some() {
                                upd.refresh_token = new_auth.refresh_token;
                            }
                            let _ = db.save_integration(&upd);
                            xuid = new_auth.account_id;
                            auth_header = new_auth.access_token;
                            cloud_res = XboxScanner::fetch_cloud_library(&xuid, &auth_header).await;
                        }
                    }
                }

                if let Ok(cloud) = cloud_res {
                    // Merge cloud playtime & last_played into installed Xbox games by title match
                    for inst in &mut installed_games {
                        if let Some(cg) = cloud.iter().find(|c| c.title.eq_ignore_ascii_case(&inst.title)) {
                            if cg.playtime_seconds > inst.playtime_seconds {
                                inst.playtime_seconds = cg.playtime_seconds;
                            }
                            if inst.last_played.is_none() && cg.last_played.is_some() {
                                inst.last_played = cg.last_played.clone();
                            }
                            if inst.cover_image.is_none() && cg.cover_image.is_some() {
                                inst.cover_image = cg.cover_image.clone();
                            }
                            if inst.description.is_none() && cg.description.is_some() {
                                inst.description = cg.description.clone();
                            }
                        }
                    }

                    if integration.import_uninstalled {
                        let installed_titles: std::collections::HashSet<String> = installed_games
                            .iter()
                            .map(|g| g.title.to_lowercase())
                            .collect();
                        uninstalled_games = cloud
                            .into_iter()
                            .filter(|g| !installed_titles.contains(&g.title.to_lowercase()))
                            .collect();
                    }
                }
            }
        }
        "battlenet" => {
            if integration.import_installed {
                installed_games = BattleNetScanner::scan_installed_games()?;
            }
            if integration.is_authenticated && integration.import_uninstalled {
                if let Some(ref payload) = integration.access_token {
                    if let Ok(cloud) = BattleNetScanner::parse_cloud_games_json(payload) {
                        let installed_codes: std::collections::HashSet<String> = installed_games
                            .iter()
                            .filter_map(|g| g.source_id.clone())
                            .collect();
                        let installed_titles: std::collections::HashSet<String> = installed_games
                            .iter()
                            .map(|g| g.title.to_lowercase())
                            .collect();
                        uninstalled_games = cloud
                            .into_iter()
                            .filter(|g| {
                                let code_ok = g.source_id.as_ref().map(|c| !installed_codes.contains(c)).unwrap_or(true);
                                code_ok && !installed_titles.contains(&g.title.to_lowercase())
                            })
                            .collect();
                    }
                }
            }
        }
        "ea" => {
            if integration.import_installed {
                installed_games = EaScanner::scan_installed_games()?;
            }
            if integration.is_authenticated {
                if let (Some(ref pid), Some(ref token)) = (&integration.account_id, &integration.access_token) {
                    if let Ok(cloud) = EaScanner::fetch_cloud_library(pid, token).await {
                        // Merge cloud playtime & last_played into installed EA games, or promote cloud games detected as installed via installCheckOverride!
                        for cg in cloud {
                            if let Some(inst) = installed_games.iter_mut().find(|i| {
                                i.source_id == cg.source_id || i.title.eq_ignore_ascii_case(&cg.title)
                            }) {
                                if cg.playtime_seconds > inst.playtime_seconds {
                                    inst.playtime_seconds = cg.playtime_seconds;
                                }
                                if inst.last_played.is_none() && cg.last_played.is_some() {
                                    inst.last_played = cg.last_played.clone();
                                }
                                if inst.cover_image.is_none() && cg.cover_image.is_some() {
                                    inst.cover_image = cg.cover_image.clone();
                                }
                                if cg.source_id.is_some() {
                                    inst.source_id = cg.source_id.clone();
                                }
                            } else if cg.is_installed {
                                if integration.import_installed {
                                    installed_games.push(cg);
                                }
                            } else if integration.import_uninstalled {
                                uninstalled_games.push(cg);
                            }
                        }
                    }
                }
            }
        }
        "ubisoft" => {
            if integration.import_installed {
                installed_games = UbisoftScanner::scan_installed_games()?;
            }
            let installed_ids: std::collections::HashSet<String> = installed_games
                .iter()
                .filter_map(|g| g.source_id.clone())
                .collect();

            if integration.is_authenticated {
                if let Some(ref ticket) = integration.access_token {
                    if let Ok(cloud) = UbisoftScanner::fetch_cloud_library(ticket).await {
                        for inst in &mut installed_games {
                            if let Some(cg) = cloud.iter().find(|c| c.title.eq_ignore_ascii_case(&inst.title)) {
                                if cg.playtime_seconds > inst.playtime_seconds {
                                    inst.playtime_seconds = cg.playtime_seconds;
                                }
                                if inst.last_played.is_none() && cg.last_played.is_some() {
                                    inst.last_played = cg.last_played.clone();
                                }
                                if inst.cover_image.is_none() && cg.cover_image.is_some() {
                                    inst.cover_image = cg.cover_image.clone();
                                }
                            }
                        }

                        if integration.import_uninstalled {
                            let installed_titles: std::collections::HashSet<String> = installed_games
                                .iter()
                                .map(|g| g.title.to_lowercase())
                                .collect();
                            uninstalled_games = cloud
                                .into_iter()
                                .filter(|g| !installed_titles.contains(&g.title.to_lowercase()))
                                .collect();
                        }
                    }
                }
            }

            if integration.import_uninstalled && uninstalled_games.is_empty() {
                uninstalled_games = UbisoftScanner::scan_local_configurations_owned(&installed_ids);
            }
        }
        "riot" => {
            if integration.import_installed {
                installed_games = RiotScanner::scan_installed_games()?;
            }
            if integration.import_uninstalled {
                let installed_ids: std::collections::HashSet<String> = installed_games
                    .iter()
                    .filter_map(|g| g.source_id.clone())
                    .collect();
                uninstalled_games = RiotScanner::get_uninstalled_catalog(&installed_ids);
            }
        }
        "amazon" => {
            let local_all = AmazonScanner::scan_installed_games()?;
            if integration.import_installed {
                installed_games = local_all.iter().filter(|g| g.is_installed).cloned().collect();
            }
            let installed_titles: std::collections::HashSet<String> = installed_games
                .iter()
                .map(|g| g.title.to_lowercase())
                .collect();

            if integration.import_uninstalled {
                if integration.is_authenticated {
                    if let Some(ref token) = integration.access_token {
                        if let Ok(cloud) = AmazonScanner::fetch_cloud_library(token).await {
                            uninstalled_games = cloud
                                .into_iter()
                                .filter(|g| !installed_titles.contains(&g.title.to_lowercase()))
                                .collect();
                        }
                    }
                }
                if uninstalled_games.is_empty() {
                    uninstalled_games = local_all
                        .into_iter()
                        .filter(|g| !g.is_installed && !installed_titles.contains(&g.title.to_lowercase()))
                        .collect();
                }
            }
        }
        "googleplay" => {
            if integration.import_installed {
                installed_games = GooglePlayScanner::scan_installed_games()?;
            }
        }
        "roblox" => {
            if integration.import_installed {
                installed_games = RobloxScanner::scan_installed_games()?;
            }
        }
        _ => return Err(format!("Unsupported provider: {}", provider)),
    }

    let installed_count = installed_games.len();
    let uninstalled_count = uninstalled_games.len();

    for mut game in installed_games {
        enrich_scanned_provider_game(&mut game, &igdb_creds).await;
        let _ = db.upsert_game(&game);
        let _ = app_handle.emit("game-updated", &game);
    }

    for mut game in uninstalled_games {
        enrich_scanned_provider_game(&mut game, &igdb_creds).await;
        let _ = db.upsert_game(&game);
        let _ = app_handle.emit("game-updated", &game);
    }

    let mut updated_integration = db.get_integration(&prov).unwrap_or(integration);
    updated_integration.provider = prov;
    updated_integration.last_sync = Some(chrono::Local::now().format("%Y-%m-%d %H:%M").to_string());
    let _ = db.save_integration(&updated_integration);

    Ok(ScanResult {
        count: installed_count + uninstalled_count,
        installed: installed_count,
        uninstalled: uninstalled_count,
    })
}

#[tauri::command]
async fn sync_all_libraries(
    playtime_only: Option<bool>,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<ScanResult, String> {
    sync_all_libraries_core(&app_handle, &state.db, playtime_only.unwrap_or(false)).await
}

pub async fn sync_all_libraries_core(
    app_handle: &AppHandle,
    db: &Arc<Database>,
    playtime_only: bool,
) -> Result<ScanResult, String> {
    // 1. Gaming-aware guard: if any game launched via OpenPlay is running, pause/defer immediately
    let running = GameLauncher::get_running_games(Some(app_handle), Some(db));
    if !running.is_empty() {
        eprintln!("[BackgroundSync] Deferred: active game process running: {:?}", running);
        return Ok(ScanResult { count: 0, installed: 0, uninstalled: 0 });
    }

    let _ = app_handle.emit("library-sync-started", serde_json::json!({ "playtime_only": playtime_only }));

    if playtime_only {
        // Fast periodic playtime/recency sync (only updates timestamps, zero disk/metadata overhead)
        let mut total_updated = 0usize;

        // A. Steam: read localconfig.vdf in milliseconds
        if let Some(steam_dir) = SteamScanner::find_steam_install_dir() {
            let history = SteamScanner::get_user_play_history(&steam_dir);
            if let Ok(mut all_games) = db.get_all_games() {
                for g in &mut all_games {
                    if g.source.eq_ignore_ascii_case("steam") {
                        if let Some(ref sid) = g.source_id {
                            if let Some((pt, lp)) = history.get(sid) {
                                let mut changed = false;
                                if *pt > 0 && *pt != g.playtime_seconds {
                                    g.playtime_seconds = *pt;
                                    changed = true;
                                }
                                if lp.is_some() && *lp != g.last_played {
                                    g.last_played = lp.clone();
                                    changed = true;
                                }
                                if changed {
                                    let _ = db.upsert_game(g);
                                    let _ = app_handle.emit("game-updated", &g);
                                    total_updated += 1;
                                }
                            }
                        }
                    }
                }
            }
        }

        // B. Epic: fetch live cloud playtimes if authenticated
        let epic_int = db.get_integration("epic").unwrap_or_default();
        if epic_int.is_authenticated && epic_int.sync_playtime {
            if let (Some(aid), Some(tok)) = (epic_int.account_id.as_deref(), epic_int.access_token.as_deref()) {
                if let Ok(pts) = EpicScanner::fetch_playtime(aid, tok).await {
                    let last_played_map = EpicScanner::get_user_last_played();
                    if let Ok(mut all_games) = db.get_all_games() {
                        for g in &mut all_games {
                            if g.source.eq_ignore_ascii_case("epic") {
                                if let Some(ref sid) = g.source_id {
                                    let mut changed = false;
                                    if let Some(&pt) = pts.get(sid).or_else(|| pts.get(&sid.to_lowercase())) {
                                        if pt > 0 && pt != g.playtime_seconds {
                                            g.playtime_seconds = pt;
                                            changed = true;
                                        }
                                    }
                                    if let Some(lp) = last_played_map.get(sid).or_else(|| last_played_map.get(&sid.to_lowercase())) {
                                        if g.last_played.as_deref() != Some(lp) {
                                            g.last_played = Some(lp.clone());
                                            changed = true;
                                        }
                                    }
                                    if changed {
                                        let _ = db.upsert_game(g);
                                        let _ = app_handle.emit("game-updated", &g);
                                        total_updated += 1;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // C. GOG: fetch cloud stats if authenticated
        let gog_int = db.get_integration("gog").unwrap_or_default();
        if gog_int.is_authenticated {
            if let (Some(u), Some(id), Some(tok)) = (gog_int.username.as_deref(), gog_int.account_id.as_deref(), gog_int.access_token.as_deref()) {
                let (cloud_pt, cloud_lp) = GogScanner::fetch_cloud_stats(u, id, tok).await;
                if let Ok(mut all_games) = db.get_all_games() {
                    for g in &mut all_games {
                        if g.source.eq_ignore_ascii_case("gog") {
                            if let Some(ref sid) = g.source_id {
                                let mut changed = false;
                                if let Some(&cpt) = cloud_pt.get(sid) {
                                    if cpt > g.playtime_seconds {
                                        g.playtime_seconds = cpt;
                                        changed = true;
                                    }
                                }
                                if let Some(clp) = cloud_lp.get(sid) {
                                    if g.last_played.as_ref() != Some(clp) {
                                        g.last_played = Some(clp.clone());
                                        changed = true;
                                    }
                                }
                                if changed {
                                    let _ = db.upsert_game(g);
                                    let _ = app_handle.emit("game-updated", &g);
                                    total_updated += 1;
                                }
                            }
                        }
                    }
                }
            }
        }

        // D. Xbox: fetch cloud stats if authenticated
        let xbox_int = db.get_integration("xbox").unwrap_or_default();
        if xbox_int.is_authenticated {
            if let (Some(xuid), Some(tok)) = (xbox_int.account_id.as_deref(), xbox_int.access_token.as_deref()) {
                if let Ok(cloud) = XboxScanner::fetch_cloud_library(xuid, tok).await {
                    if let Ok(mut all_games) = db.get_all_games() {
                        for g in &mut all_games {
                            if g.source.eq_ignore_ascii_case("xbox") {
                                if let Some(cg) = cloud.iter().find(|c| c.title.eq_ignore_ascii_case(&g.title)) {
                                    let mut changed = false;
                                    if cg.playtime_seconds > g.playtime_seconds {
                                        g.playtime_seconds = cg.playtime_seconds;
                                        changed = true;
                                    }
                                    if g.last_played.is_none() && cg.last_played.is_some() {
                                        g.last_played = cg.last_played.clone();
                                        changed = true;
                                    }
                                    if changed {
                                        let _ = db.upsert_game(g);
                                        let _ = app_handle.emit("game-updated", &g);
                                        total_updated += 1;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        let _ = app_handle.emit("library-sync-complete", serde_json::json!({
            "playtime_only": true,
            "updated": total_updated
        }));

        return Ok(ScanResult {
            count: total_updated,
            installed: total_updated,
            uninstalled: 0,
        });
    }

    // Full Library Scan (on startup or manual refresh across all providers)
    let providers = ["steam", "epic", "gog", "xbox", "battlenet", "ea", "ubisoft", "riot", "amazon"];
    let mut total_res = ScanResult { count: 0, installed: 0, uninstalled: 0 };

    for p in providers {
        // Gaming guard check before each provider
        let running = GameLauncher::get_running_games(Some(app_handle), Some(db));
        if !running.is_empty() {
            eprintln!("[BackgroundSync] Aborting remaining sync: game launched ({:?})", running);
            break;
        }

        match scan_provider_library_core(p, app_handle, db).await {
            Ok(res) => {
                total_res.count += res.count;
                total_res.installed += res.installed;
                total_res.uninstalled += res.uninstalled;
            }
            Err(e) => {
                // Silent logging, never interrupt the user
                eprintln!("[BackgroundSync] Notice while scanning provider '{}': {}", p, e);
            }
        }
    }

    let _ = app_handle.emit("library-sync-complete", serde_json::json!({
        "playtime_only": false,
        "count": total_res.count,
        "installed": total_res.installed,
        "uninstalled": total_res.uninstalled
    }));

    Ok(total_res)
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

    // Also enrich with critic & community scores if missing
    if game.critic_score.is_none() || game.community_score.is_none() {
        let scores = ScoreEnrichmentEngine::resolve_scores_for_game(
            &game.title,
            &game.source,
            game.source_id.as_deref(),
        ).await;

        if game.critic_score.is_none() && scores.critic_score.is_some() {
            game.critic_score = scores.critic_score;
        }
        if game.community_score.is_none() && scores.community_score.is_some() {
            game.community_score = scores.community_score;
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
async fn get_game_current_players(
    title: Option<String>,
    appid: Option<serde_json::Value>,
) -> Result<u32, String> {
    let resolved_appid = if let Some(ref val) = appid {
        if let Some(s) = val.as_str() {
            let trimmed = s.trim();
            if !trimmed.is_empty() && trimmed.chars().all(|c| c.is_ascii_digit()) {
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
        SteamMetadataFetcher::fetch_current_players(&aid).await
    } else {
        Err("Could not resolve Steam App ID for player count".to_string())
    }
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

            let scores = ScoreEnrichmentEngine::resolve_scores_for_game(&title, "epic", None).await;

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
                critic_score: scores.critic_score,
                community_score: scores.community_score,
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

            let platform_hint = if let Some(ref gid) = game_id {
                state.db.get_all_games().ok().and_then(|all| {
                    all.into_iter().find(|g| &g.id == gid).map(|g| g.platforms)
                })
            } else {
                None
            };

            metadata::igdb::IgdbFetcher::fetch_metadata(
                &client_id,
                &client_secret,
                &title,
                platform_hint.as_deref(),
            ).await
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
            } else if game.source.to_lowercase() == "emulation" || game.source.to_lowercase() == "local" || game.source.to_lowercase().contains("retro") {
                let config = state.db.get_app_config().unwrap_or_default();
                if let (Some(ref client_id), Some(ref client_secret)) = (&config.igdb_client_id, &config.igdb_client_secret) {
                    if !client_id.trim().is_empty() && !client_secret.trim().is_empty() {
                        let hint = if !game.platforms.is_empty() { Some(game.platforms.as_slice()) } else { None };
                        if let Ok(meta) = metadata::igdb::IgdbFetcher::fetch_metadata(client_id, client_secret, &game.title, hint).await {
                            apply_igdb_meta(&mut game, meta);
                            changed = true;
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
fn set_game_favorite(game_id: String, is_favorite: bool, state: State<'_, AppState>) -> Result<bool, String> {
    state.db.set_favorite(&game_id, is_favorite)
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
        game.emulator_id,
    )
}

#[tauri::command]
fn install_game(game_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let all = state.db.get_all_games()?;
    let game = all
        .into_iter()
        .find(|g| g.id == game_id)
        .ok_or_else(|| "Game not found".to_string())?;

    let src = game.source.to_lowercase();
    if src == "steam" {
        if let Some(ref appid) = game.source_id {
            let url = format!("steam://install/{}", appid);
            #[cfg(target_os = "windows")]
            {
                std::process::Command::new("cmd")
                    .args(["/C", "start", "", &url])
                    .spawn()
                    .map_err(|e| e.to_string())?;
            }
            #[cfg(target_os = "linux")]
            {
                std::process::Command::new("xdg-open")
                    .arg(&url)
                    .spawn()
                    .map_err(|e| e.to_string())?;
            }
            return Ok(());
        }
    } else if src == "epic" {
        if let Some(ref app_name) = game.source_id {
            let url = format!("com.epicgames.launcher://apps/{}?action=install", app_name);
            #[cfg(target_os = "windows")]
            {
                std::process::Command::new("cmd")
                    .args(["/C", "start", "", &url])
                    .spawn()
                    .map_err(|e| e.to_string())?;
            }
            return Ok(());
        }
    }

    Err("Direct store installation is not supported for this source".to_string())
}

#[tauri::command]
fn get_emulator_profiles(state: State<'_, AppState>) -> Result<Vec<EmulatorProfile>, String> {
    state.db.get_emulator_profiles()
}

#[tauri::command]
fn save_emulator_profile(profile: EmulatorProfile, state: State<'_, AppState>) -> Result<(), String> {
    state.db.save_emulator_profile(&profile)
}

#[tauri::command]
fn delete_emulator_profile(id: String, state: State<'_, AppState>) -> Result<(), String> {
    state.db.delete_emulator_profile(&id)
}

#[tauri::command]
fn get_configured_consoles(state: State<'_, AppState>) -> Result<Vec<ConfiguredConsole>, String> {
    state.db.get_configured_consoles()
}

#[tauri::command]
fn save_configured_console(console: ConfiguredConsole, state: State<'_, AppState>) -> Result<(), String> {
    state.db.save_configured_console(&console)
}

#[tauri::command]
fn delete_configured_console(id: String, state: State<'_, AppState>) -> Result<(), String> {
    state.db.delete_configured_console(&id)
}

#[tauri::command]
fn scan_console_roms(
    dir_path: String,
    console_id: String,
    console_name: String,
    extensions: Vec<String>,
) -> Result<Vec<DiscoveredRom>, String> {
    EmulatorService::scan_console_roms(&dir_path, &console_id, &console_name, &extensions)
}

fn apply_igdb_meta(game: &mut Game, meta: metadata::igdb::MetadataComparison) {
    if (game.cover_image.is_none() || game.cover_image.as_deref().unwrap_or("").is_empty()) && meta.cover_image.is_some() {
        game.cover_image = meta.cover_image;
    }
    if (game.background_image.is_none() || game.background_image.as_deref().unwrap_or("").is_empty()) && meta.background_image.is_some() {
        game.background_image = meta.background_image;
    }
    if (game.description.is_none() || game.description.as_deref().unwrap_or("").is_empty()) && meta.description.is_some() {
        game.description = meta.description;
    }
    if (game.developer.is_none() || game.developer.as_deref().unwrap_or("").is_empty()) && meta.developer.is_some() {
        game.developer = meta.developer;
    }
    if (game.publisher.is_none() || game.publisher.as_deref().unwrap_or("").is_empty()) && meta.publisher.is_some() {
        game.publisher = meta.publisher;
    }
    if game.release_date.is_none() && meta.release_date.is_some() {
        game.release_date = meta.release_date;
    }
    if game.genres.is_empty() && !meta.genres.is_empty() {
        game.genres = meta.genres;
    }
    if game.tags.is_empty() && !meta.tags.is_empty() {
        game.tags = meta.tags;
    }
    if game.features.is_empty() && !meta.features.is_empty() {
        game.features = meta.features;
    }
    if game.critic_score.is_none() && meta.critic_score.is_some() {
        game.critic_score = meta.critic_score;
    }
    if game.community_score.is_none() && meta.community_score.is_some() {
        game.community_score = meta.community_score;
    }
    if game.age_rating.is_none() && meta.age_rating.is_some() {
        game.age_rating = meta.age_rating;
    }
    if game.series.is_none() && meta.series.is_some() {
        game.series = meta.series;
    }
    if game.links.is_empty() && !meta.links.is_empty() {
        game.links = meta.links;
    }
}

#[tauri::command]
async fn scan_and_import_console_roms(
    console_id: String,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> Result<u32, String> {
    let conf = state.db.get_configured_console(&console_id)?
        .ok_or_else(|| format!("Console '{}' not found", console_id))?;

    let discovered = EmulatorService::scan_console_roms(
        &conf.rom_directory,
        &conf.id,
        &conf.name,
        &conf.extensions,
    )?;

    let mut existing_games = state.db.get_all_games().unwrap_or_default();
    let now_date = chrono::Local::now().format("%Y-%m-%d").to_string();

    let app_cfg = state.db.get_app_config().unwrap_or_default();
    let igdb_creds = match (app_cfg.igdb_client_id, app_cfg.igdb_client_secret) {
        (Some(cid), Some(sec)) if !cid.trim().is_empty() && !sec.trim().is_empty() => {
            Some((cid.trim().to_string(), sec.trim().to_string()))
        }
        _ => None,
    };

    let mut added_count: u32 = 0;

    for rom in discovered {
        let norm_rom = ScoreEnrichmentEngine::normalize_title(&rom.clean_title);

        let existing_by_path_idx = existing_games.iter().position(|g| {
            g.executable_path.as_deref().unwrap_or("").eq_ignore_ascii_case(&rom.file_path)
        });

        let existing_by_title_idx = if existing_by_path_idx.is_none() {
            existing_games.iter().position(|g| {
                ScoreEnrichmentEngine::normalize_title(&g.title) == norm_rom
            })
        } else {
            None
        };

        if let Some(idx) = existing_by_path_idx {
            // Already in DB with this exact file path; ensure emulator and platform linkage, and enrich metadata if missing
            let game = &mut existing_games[idx];
            let mut modified = false;
            if game.emulator_id.is_none() {
                game.emulator_id = Some(conf.id.clone());
                modified = true;
            }
            if !game.platforms.iter().any(|p| p.eq_ignore_ascii_case(&conf.name)) {
                game.platforms.push(conf.name.clone());
                modified = true;
            }
            if !game.is_installed {
                game.is_installed = true;
                modified = true;
            }
            if let Some((ref cid, ref csec)) = igdb_creds {
                if game.description.is_none() || game.cover_image.is_none() || game.background_image.is_none() {
                    if let Ok(meta) = metadata::igdb::IgdbFetcher::fetch_metadata(
                        cid,
                        csec,
                        &rom.clean_title,
                        Some(&[conf.name.clone()]),
                    ).await {
                        apply_igdb_meta(game, meta);
                        modified = true;
                    }
                }
            }
            if modified {
                let _ = state.db.upsert_game(game);
                let _ = app_handle.emit("game-updated", &game);
            }
        } else if let Some(idx) = existing_by_title_idx {
            // Merging local ROM into existing matching title (e.g. from RetroAchievements cloud sync ra_XXXX)
            let game = &mut existing_games[idx];
            game.executable_path = Some(rom.file_path.clone());
            game.is_installed = true;
            game.emulator_id = Some(conf.id.clone());
            if game.size_on_disk.is_none() || game.size_on_disk == Some(0) {
                game.size_on_disk = Some(rom.file_size_bytes);
            }
            if !game.platforms.iter().any(|p| p.eq_ignore_ascii_case(&conf.name)) {
                game.platforms.push(conf.name.clone());
            }
            if game.cover_image.is_none() && rom.local_cover_path.is_some() {
                game.cover_image = rom.local_cover_path.clone();
            }

            if let Some((ref cid, ref csec)) = igdb_creds {
                if game.description.is_none() || game.cover_image.is_none() || game.background_image.is_none() {
                    if let Ok(meta) = metadata::igdb::IgdbFetcher::fetch_metadata(
                        cid,
                        csec,
                        &rom.clean_title,
                        Some(&[conf.name.clone()]),
                    ).await {
                        apply_igdb_meta(game, meta);
                    }
                }
            }

            let _ = state.db.upsert_game(game);
            let _ = app_handle.emit("game-updated", &game);
            added_count += 1;
        } else {
            // New local ROM title
            let mut new_game = Game {
                id: format!("rom_{}_{}", chrono::Utc::now().timestamp_millis(), &rom.clean_title.chars().filter(|c| c.is_alphanumeric()).take(8).collect::<String>()),
                title: rom.clean_title.clone(),
                source: "Emulation".to_string(),
                executable_path: Some(rom.file_path.clone()),
                emulator_id: Some(conf.id.clone()),
                platforms: vec![conf.name.clone()],
                is_installed: true,
                is_favorite: false,
                size_on_disk: Some(rom.file_size_bytes),
                date_added: Some(now_date.clone()),
                cover_image: rom.local_cover_path.clone(),
                completion_status: Some("Auto".to_string()),
                ..Default::default()
            };

            // Fetch rich IGDB store metadata if credentials are configured
            if let Some((ref cid, ref csec)) = igdb_creds {
                if let Ok(meta) = metadata::igdb::IgdbFetcher::fetch_metadata(
                    cid,
                    csec,
                    &rom.clean_title,
                    Some(&[conf.name.clone()]),
                ).await {
                    apply_igdb_meta(&mut new_game, meta);
                }
            }

            // Also check HowLongToBeat
            if let Some(hltb) = HltbFetcher::fetch_hltb(&new_game.title).await {
                new_game.hltb_main = Some(hltb.main_story_hours);
                new_game.hltb_extra = Some(hltb.main_extra_hours);
                new_game.hltb_completionist = Some(hltb.completionist_hours);
            }

            if let Ok(()) = state.db.upsert_game(&new_game) {
                added_count += 1;
                let _ = app_handle.emit("game-updated", &new_game);
                existing_games.push(new_game);
            }
        }
    }

    Ok(added_count)
}

#[tauri::command]
fn get_community_systems() -> Result<Option<String>, String> {
    Ok(EmulatorService::read_community_systems())
}

#[tauri::command]
fn save_community_systems(content: String) -> Result<(), String> {
    EmulatorService::write_community_systems(&content)
}

#[tauri::command]
fn open_systems_folder() -> Result<(), String> {
    let p = EmulatorService::get_community_systems_path();
    let target = p.parent().unwrap_or(&p);
    let _ = std::fs::create_dir_all(target);
    open_in_explorer(target.to_string_lossy().to_string())
}

#[tauri::command]
fn scan_retroarch_cores(retroarch_path: String) -> Result<Vec<String>, String> {
    Ok(EmulatorService::scan_retroarch_cores(&retroarch_path))
}

#[tauri::command]
fn scan_rom_directory(dir_path: String, state: State<'_, AppState>) -> Result<Vec<DiscoveredRom>, String> {
    let configured = state.db.get_emulator_profiles().unwrap_or_default();
    EmulatorService::scan_rom_directory(&dir_path, &configured)
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateProgressPayload {
    pub downloaded: u64,
    pub total: u64,
    pub percentage: u32,
}

#[tauri::command]
async fn download_app_update(
    download_url: String,
    target_version: String,
    app_handle: AppHandle,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())?;

    let mut resp = client
        .get(&download_url)
        .header("User-Agent", format!("OpenPlay/{}", env!("CARGO_PKG_VERSION")))
        .send()
        .await
        .map_err(|e| format!("Failed to connect to download URL: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Download failed with status HTTP {}", resp.status()));
    }

    let total = resp.content_length().unwrap_or(0);
    let temp_dir = std::env::temp_dir();
    let clean_version = target_version.trim_start_matches(|c| c == 'v' || c == 'V');
    let file_name = format!("OpenPlay-Setup-{}.exe", clean_version);
    let dest_path = temp_dir.join(file_name);

    let mut file = std::fs::File::create(&dest_path)
        .map_err(|e| format!("Failed to create destination file: {}", e))?;

    use std::io::Write;
    let mut downloaded: u64 = 0;
    let mut last_percentage: u32 = 0;

    let _ = app_handle.emit(
        "app-update-progress",
        UpdateProgressPayload {
            downloaded: 0,
            total,
            percentage: 0,
        },
    );

    while let Some(chunk) = resp.chunk().await.map_err(|e| format!("Error receiving chunk: {}", e))? {
        file.write_all(&chunk)
            .map_err(|e| format!("Error writing chunk to file: {}", e))?;
        downloaded += chunk.len() as u64;

        let percentage = if total > 0 {
            ((downloaded as f64 / total as f64) * 100.0).round() as u32
        } else {
            0
        };

        if percentage != last_percentage || downloaded == total {
            last_percentage = percentage;
            let _ = app_handle.emit(
                "app-update-progress",
                UpdateProgressPayload {
                    downloaded,
                    total,
                    percentage,
                },
            );
        }
    }

    file.flush().map_err(|e| e.to_string())?;

    let _ = app_handle.emit(
        "app-update-progress",
        UpdateProgressPayload {
            downloaded,
            total: downloaded,
            percentage: 100,
        },
    );

    Ok(dest_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn apply_update_and_restart(
    installer_path: String,
    app_handle: AppHandle,
) -> Result<(), String> {
    let path = std::path::PathBuf::from(&installer_path);
    if !path.exists() {
        return Err("Installer file not found on disk".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        const DETACHED_PROCESS: u32 = 0x00000008;

        let current_exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let current_exe_str = current_exe.to_string_lossy().to_string();
        let installer_str = path.to_string_lossy().to_string();

        let script = format!(
            "timeout /t 2 /nobreak >nul & start \"\" /wait \"{}\" /S & timeout /t 1 /nobreak >nul & start \"\" \"{}\"",
            installer_str, current_exe_str
        );

        std::process::Command::new("cmd")
            .args(["/C", &script])
            .creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS)
            .spawn()
            .map_err(|e| format!("Failed to launch updater: {}", e))?;

        app_handle.exit(0);
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("In-app update restart is currently supported on Windows".to_string())
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

    // Cache existing games once for fast, accurate matching & non-destructive preservation
    let mut all_existing = state.db.get_all_games().unwrap_or_default();

    for mut game in games {
        sources_set.insert(game.source.clone());

        // Find existing match by ID, (source, source_id), or normalized (title, source)
        let existing_idx = all_existing.iter().position(|eg| {
            eg.id == game.id
                || (!eg.source.is_empty()
                    && eg.source.eq_ignore_ascii_case(&game.source)
                    && eg.source_id.is_some()
                    && eg.source_id == game.source_id)
                || (eg.title.trim().eq_ignore_ascii_case(game.title.trim())
                    && eg.source.trim().eq_ignore_ascii_case(game.source.trim()))
        });

        if let Some(idx) = existing_idx {
            let existing = &all_existing[idx];
            updated += 1;

            // If the existing game was stored under an older ID (e.g. legacy playnite_{guid})
            // and the imported game now has canonical native ID (or vice versa), remove the old duplicate
            if existing.id != game.id {
                let _ = state.db.delete_game(&existing.id);
            }

            // --- BUG 007 FIX: Selective Non-Destructive Field Preservation ---
            // 1. Artwork preservation: If artwork was not extracted or new game has none, preserve existing artwork
            if !options.extract_artwork || game.cover_image.is_none() {
                if existing.cover_image.as_ref().map(|s| !s.trim().is_empty()).unwrap_or(false) {
                    game.cover_image = existing.cover_image.clone();
                }
            }
            if !options.extract_artwork || game.background_image.is_none() {
                if existing.background_image.as_ref().map(|s| !s.trim().is_empty()).unwrap_or(false) {
                    game.background_image = existing.background_image.clone();
                }
            }
            if !options.extract_artwork || game.icon_image.is_none() {
                if existing.icon_image.as_ref().map(|s| !s.trim().is_empty()).unwrap_or(false) {
                    game.icon_image = existing.icon_image.clone();
                }
            }
            if game.logo_image.is_none() {
                game.logo_image = existing.logo_image.clone();
            }

            // 2. Installation preservation: Never mark an installed game uninstalled
            if existing.is_installed && !game.is_installed {
                game.is_installed = true;
                if game.install_directory.is_none() {
                    game.install_directory = existing.install_directory.clone();
                }
                if game.executable_path.is_none() {
                    game.executable_path = existing.executable_path.clone();
                }
            }

            // 3. User modifications / selective options preservation
            if !options.import_playtime {
                game.playtime_seconds = existing.playtime_seconds;
                game.play_count = existing.play_count;
            } else if existing.playtime_seconds > game.playtime_seconds {
                // If local playtime is higher than backup, preserve higher playtime
                game.playtime_seconds = existing.playtime_seconds;
            }

            if !options.import_last_played {
                game.last_played = existing.last_played.clone();
            }

            if !options.import_notes {
                game.notes = existing.notes.clone();
            } else if game.notes.is_none() || game.notes.as_deref().unwrap_or("").trim().is_empty() {
                game.notes = existing.notes.clone();
            }

            if !options.import_ratings {
                game.user_rating = existing.user_rating;
                game.community_score = existing.community_score;
                game.critic_score = existing.critic_score;
            }

            if !options.import_tags {
                if !existing.genres.is_empty() {
                    game.genres = existing.genres.clone();
                }
                if !existing.tags.is_empty() {
                    game.tags = existing.tags.clone();
                }
                if !existing.categories.is_empty() {
                    game.categories = existing.categories.clone();
                }
                if !existing.features.is_empty() {
                    game.features = existing.features.clone();
                }
            }

            if existing.is_favorite {
                game.is_favorite = true;
            }

            // Update in-memory cache
            all_existing[idx] = game.clone();
        } else {
            imported += 1;
            all_existing.push(game.clone());
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

        let needs_scores = game.critic_score.is_none() || game.community_score.is_none();
        if needs_scores {
            let scores = ScoreEnrichmentEngine::resolve_scores_for_game(
                &game.title,
                &game.source,
                game.source_id.as_deref(),
            ).await;

            if game.critic_score.is_none() && scores.critic_score.is_some() {
                game.critic_score = scores.critic_score;
                modified = true;
            }
            if game.community_score.is_none() && scores.community_score.is_some() {
                game.community_score = scores.community_score;
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
    } else if source_lower == "gog" {
        if let Some(ref pid) = game.source_id {
            if !pid.is_empty() {
                let integration = state.db.get_integration("gog").unwrap_or_default();
                let uid = integration.account_id.as_deref();
                let tok = integration.access_token.as_deref();
                if let Ok(achievements) = GogScanner::fetch_gog_achievements(&game_id, pid, uid, tok).await {
                    if !achievements.is_empty() {
                        state.db.save_game_achievements(&game_id, &achievements)?;
                        if let Some(latest_date) = extract_latest_unlock_date(&achievements) {
                            if game.last_played.is_none() || game.last_played.as_deref() < Some(latest_date.as_str()) {
                                game.last_played = Some(latest_date);
                            }
                        }
                    }
                }
            }
        }
    } else if source_lower == "xbox" {
        if let Some(ref sid) = game.source_id {
            if !sid.is_empty() {
                let integration = state.db.get_integration("xbox").unwrap_or_default();
                if integration.is_authenticated {
                    if let (Some(ref xuid), Some(ref auth_header)) = (&integration.account_id, &integration.access_token) {
                        if let Ok(achievements) = XboxScanner::fetch_xbox_achievements(&game_id, sid, xuid, auth_header).await {
                            if !achievements.is_empty() {
                                state.db.save_game_achievements(&game_id, &achievements)?;
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
        }
    } else if source_lower == "ea app" || source_lower == "ea" {
        if let Some(ref offer_id) = game.source_id {
            if !offer_id.is_empty() {
                let integration = state.db.get_integration("ea").unwrap_or_default();
                let pid = integration.account_id.as_deref().unwrap_or("");
                let tok = integration.access_token.as_deref();
                if let Ok(achs) = EaScanner::fetch_ea_achievements(&game.id, offer_id, pid, tok, &game.title).await {
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

    let gog_int = state.db.get_integration("gog").unwrap_or_default();
    let gog_uid = gog_int.account_id.clone();
    let gog_tok = gog_int.access_token.clone();

    let xbox_int = state.db.get_integration("xbox").unwrap_or_default();
    let xbox_xuid = if xbox_int.is_authenticated { xbox_int.account_id.clone() } else { None };
    let xbox_tok = if xbox_int.is_authenticated { xbox_int.access_token.clone() } else { None };

    let ea_int = state.db.get_integration("ea").unwrap_or_default();
    let ea_pid = ea_int.account_id.clone().unwrap_or_default();
    let ea_tok = ea_int.access_token.clone();

    let semaphore = Arc::new(tokio::sync::Semaphore::new(12));
    let mut join_set = tokio::task::JoinSet::new();

    for game in all.iter().cloned() {
        let sem = semaphore.clone();
        let sid_clone = steamid64.clone();
        let eaid_clone = epic_aid.clone();
        let etok_clone = epic_token.clone();
        let guid_clone = gog_uid.clone();
        let gtok_clone = gog_tok.clone();
        let xxuid_clone = xbox_xuid.clone();
        let xtok_clone = xbox_tok.clone();
        let epid_clone = ea_pid.clone();
        let eatok_clone = ea_tok.clone();

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
            } else if source_lower == "gog" {
                let pid = game.source_id.as_deref().filter(|s| !s.is_empty())?;
                let achs = GogScanner::fetch_gog_achievements(
                    &game.id,
                    pid,
                    guid_clone.as_deref(),
                    gtok_clone.as_deref(),
                )
                .await
                .ok()?;
                Some((game, achs))
            } else if source_lower == "xbox" {
                let sid = game.source_id.as_deref().filter(|s| !s.is_empty())?;
                let xuid = xxuid_clone.as_deref()?;
                let xtok = xtok_clone.as_deref()?;
                let achs = XboxScanner::fetch_xbox_achievements(&game.id, sid, xuid, xtok)
                    .await
                    .ok()?;
                Some((game, achs))
            } else if source_lower == "ea app" || source_lower == "ea" {
                let oid = game.source_id.as_deref().filter(|s| !s.is_empty())?;
                let achs = EaScanner::fetch_ea_achievements(
                    &game.id,
                    oid,
                    &epid_clone,
                    eatok_clone.as_deref(),
                    &game.title,
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
    let progress_list = RetroAchievementsClient::fetch_all_user_played_games(username, api_key)
        .await
        .map_err(|e| format!("Failed to fetch RetroAchievements user games: {}", e))?;

    let all_games = db.get_all_games()?;
    let mut game_map_by_source_id: std::collections::HashMap<String, Game> = std::collections::HashMap::new();
    let mut game_map_by_title: std::collections::HashMap<String, Game> = std::collections::HashMap::new();
    let mut game_map_by_norm: std::collections::HashMap<String, Game> = std::collections::HashMap::new();

    for g in all_games {
        let src_lower = g.source.to_lowercase();
        if src_lower.contains("retro") {
            if let Some(ref sid) = g.source_id {
                game_map_by_source_id.insert(sid.clone(), g.clone());
            }
        }
        game_map_by_title.insert(g.title.to_lowercase().trim().to_string(), g.clone());
        game_map_by_norm.insert(ScoreEnrichmentEngine::normalize_title(&g.title), g);
    }

    for prog in progress_list {
        let detail = match RetroAchievementsClient::fetch_game_info_and_progress(prog.game_id, username, api_key).await {
            Ok(d) => d,
            Err(e) => {
                eprintln!("[RetroAchievements] Failed to fetch game {} ({}): {}", prog.game_id, prog.title, e);
                tokio::time::sleep(std::time::Duration::from_millis(300)).await;
                continue;
            }
        };

        let game_id_str = prog.game_id.to_string();
        let title_key = detail.title.to_lowercase().trim().to_string();
        let norm_key = ScoreEnrichmentEngine::normalize_title(&detail.title);

        let mut game = if let Some(existing) = game_map_by_source_id.get(&game_id_str) {
            existing.clone()
        } else if let Some(existing) = game_map_by_title.get(&title_key) {
            existing.clone()
        } else if let Some(existing) = game_map_by_norm.get(&norm_key) {
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

        if game.source_id.is_none() {
            game.source_id = Some(game_id_str.clone());
        }

        if let Some(ref console) = detail.console_name {
            if !game.platforms.iter().any(|p| p.eq_ignore_ascii_case(console)) {
                game.platforms.push(console.clone());
            }
        }
        if !game.platforms.iter().any(|p| p.eq_ignore_ascii_case("Retro")) {
            game.platforms.push("Retro".to_string());
        }

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
        if let Some(ref lp) = prog.last_played {
            let date_str = if lp.len() >= 10 { &lp[..10] } else { lp.as_str() };
            if game.last_played.is_none() || game.last_played.as_deref() < Some(date_str) {
                game.last_played = Some(date_str.to_string());
            }
        } else if let Some(ref recent_date) = prog.most_recent_awarded_date {
            let date_str = if recent_date.len() >= 10 { &recent_date[..10] } else { recent_date.as_str() };
            if game.last_played.is_none() || game.last_played.as_deref() < Some(date_str) {
                game.last_played = Some(date_str.to_string());
            }
        }

        if let Some(ref award) = prog.highest_award_kind {
            let award_lower = award.to_lowercase();
            if award_lower.contains("mastered") {
                if game.completion_status.is_none() || game.completion_status.as_deref() == Some("Auto") {
                    game.completion_status = Some("Mastered".to_string());
                }
            } else if award_lower.contains("beaten") || award_lower == "completed" {
                if game.completion_status.is_none() || game.completion_status.as_deref() == Some("Auto") {
                    game.completion_status = Some("Beaten".to_string());
                }
            }
        }
        if game.completion_status.is_none() {
            game.completion_status = Some("Auto".to_string());
        }

        let _ = db.upsert_game(&game);
        game_map_by_source_id.insert(game_id_str, game.clone());
        game_map_by_title.insert(title_key, game.clone());

        let achs = RetroAchievementsClient::extract_achievements(&game.id, &detail);
        if !achs.is_empty() {
            let _ = db.save_game_achievements(&game.id, &achs);
        }

        let _ = app_handle.emit("game-updated", &game);
        let _ = app_handle.emit("achievements-updated", &game.id);

        // Polite pace between requests to prevent HTTP 429 rate limiting
        tokio::time::sleep(std::time::Duration::from_millis(250)).await;
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
                "RetroAchievements credentials not configured. Please enter your username and Web API key in Library Integrations & Managers."
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
    } else if source_lower == "gog" {
        let local_pt = GogScanner::get_local_playtimes();
        let local_lp = GogScanner::get_local_last_played();
        if let Some(ref pid) = game.source_id {
            if let Some(&pt) = local_pt.get(pid) {
                if pt > game.playtime_seconds {
                    game.playtime_seconds = pt;
                    game.play_count = Some(1);
                }
            }
            if let Some(lp) = local_lp.get(pid) {
                game.last_played = Some(lp.clone());
            }
            let integration = state.db.get_integration("gog").unwrap_or_default();
            if integration.is_authenticated {
                if let (Some(u), Some(id), Some(tok)) = (
                    integration.username.as_deref(),
                    integration.account_id.as_deref(),
                    integration.access_token.as_deref(),
                ) {
                    let (cloud_pt, cloud_lp) = GogScanner::fetch_cloud_stats(u, id, tok).await;
                    if let Some(&cpt) = cloud_pt.get(pid) {
                        if cpt > game.playtime_seconds {
                            game.playtime_seconds = cpt;
                            game.play_count = Some(1);
                        }
                    }
                    if let Some(clp) = cloud_lp.get(pid) {
                        if game.last_played.is_none() {
                            game.last_played = Some(clp.clone());
                        }
                    }
                }
            }
        }
    } else if source_lower == "emulation" || source_lower == "local" || source_lower.contains("retro") {
        let (client_id, client_secret) = {
            let cfg = state.db.get_app_config()?;
            let c = cfg.igdb_client_id.as_deref().unwrap_or("").trim().to_string();
            let s = cfg.igdb_client_secret.as_deref().unwrap_or("").trim().to_string();
            (c, s)
        };
        if !client_id.is_empty() && !client_secret.is_empty() {
            let hint = if !game.platforms.is_empty() { Some(game.platforms.as_slice()) } else { None };
            if let Ok(meta) = metadata::igdb::IgdbFetcher::fetch_metadata(&client_id, &client_secret, &game.title, hint).await {
                apply_igdb_meta(&mut game, meta);
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
    } else if source_lower == "gog" {
        if let Some(ref pid) = game.source_id {
            if !pid.is_empty() {
                let integration = state.db.get_integration("gog").unwrap_or_default();
                let uid = integration.account_id.as_deref();
                let tok = integration.access_token.as_deref();
                if let Ok(achievements) = GogScanner::fetch_gog_achievements(&game_id, pid, uid, tok).await {
                    if !achievements.is_empty() {
                        state.db.save_game_achievements(&game_id, &achievements)?;
                        if let Some(latest_date) = extract_latest_unlock_date(&achievements) {
                            if game.last_played.is_none() || game.last_played.as_deref() < Some(latest_date.as_str()) {
                                game.last_played = Some(latest_date);
                            }
                        }
                    }
                }
            }
        }
    } else if source_lower == "xbox" {
        if let Some(ref sid) = game.source_id {
            if !sid.is_empty() {
                let integration = state.db.get_integration("xbox").unwrap_or_default();
                if integration.is_authenticated {
                    if let (Some(ref xuid), Some(ref auth_header)) = (&integration.account_id, &integration.access_token) {
                        if let Ok(achievements) = XboxScanner::fetch_xbox_achievements(&game_id, sid, xuid, auth_header).await {
                            if !achievements.is_empty() {
                                state.db.save_game_achievements(&game_id, &achievements)?;
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
        }
    } else if source_lower == "ea app" || source_lower == "ea" {
        if let Some(ref offer_id) = game.source_id {
            if !offer_id.is_empty() {
                let integration = state.db.get_integration("ea").unwrap_or_default();
                let pid = integration.account_id.as_deref().unwrap_or("");
                let tok = integration.access_token.as_deref();
                if let Ok(achs) = EaScanner::fetch_ea_achievements(&game.id, offer_id, pid, tok, &game.title).await {
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

    if game.completion_status.is_none() || game.completion_status.as_deref() == Some("Not Played") || game.completion_status.as_deref() == Some("Played") {
        game.completion_status = Some("Auto".to_string());
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
    let gog_playtimes = GogScanner::get_local_playtimes();
    let gog_last_played = GogScanner::get_local_last_played();

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
        } else if source_lower == "gog" {
            if let Some(ref pid) = game.source_id {
                if let Some(&pt) = gog_playtimes.get(pid) {
                    if pt > 0 && pt != game.playtime_seconds {
                        game.playtime_seconds = pt;
                        game.play_count = Some(1);
                        changed = true;
                    }
                }
                if let Some(lp) = gog_last_played.get(pid) {
                    if game.last_played.as_deref() != Some(lp.as_str()) {
                        game.last_played = Some(lp.clone());
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

        if game.completion_status.is_none() || game.completion_status.as_deref() == Some("Not Played") || game.completion_status.as_deref() == Some("Played") {
            game.completion_status = Some("Auto".to_string());
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
            (src == "steam" || src == "epic" || src == "gog" || src == "xbox" || src == "ea app" || src == "ea")
                && (g.is_installed || g.playtime_seconds > 0 || g.last_played.is_some())
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

    let gog_int = state.db.get_integration("gog").unwrap_or_default();
    let gog_uid = gog_int.account_id;
    let gog_tok = gog_int.access_token;

    let xbox_int = state.db.get_integration("xbox").unwrap_or_default();
    let xbox_xuid = if xbox_int.is_authenticated { xbox_int.account_id } else { None };
    let xbox_tok = if xbox_int.is_authenticated { xbox_int.access_token } else { None };

    let ea_int = state.db.get_integration("ea").unwrap_or_default();
    let ea_pid = ea_int.account_id.unwrap_or_default();
    let ea_tok = ea_int.access_token;

    let semaphore = Arc::new(tokio::sync::Semaphore::new(6));
    let mut join_set = tokio::task::JoinSet::new();

    for game in candidates {
        let sem = semaphore.clone();
        let sid_clone = steamid64.clone();
        let eaid_clone = epic_aid.clone();
        let etok_clone = epic_token.clone();
        let guid_clone = gog_uid.clone();
        let gtok_clone = gog_tok.clone();
        let xxuid_clone = xbox_xuid.clone();
        let xtok_clone = xbox_tok.clone();
        let epid_clone = ea_pid.clone();
        let eatok_clone = ea_tok.clone();

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
            } else if src == "gog" {
                let pid = game.source_id.as_deref().filter(|s| !s.is_empty())?;
                let achs = GogScanner::fetch_gog_achievements(
                    &game.id,
                    pid,
                    guid_clone.as_deref(),
                    gtok_clone.as_deref(),
                )
                .await
                .ok()?;
                Some((game, achs))
            } else if src == "xbox" {
                let sid = game.source_id.as_deref().filter(|s| !s.is_empty())?;
                let xuid = xxuid_clone.as_deref()?;
                let xtok = xtok_clone.as_deref()?;
                let achs = XboxScanner::fetch_xbox_achievements(&game.id, sid, xuid, xtok)
                    .await
                    .ok()?;
                Some((game, achs))
            } else if src == "ea app" || src == "ea" {
                let oid = game.source_id.as_deref().filter(|s| !s.is_empty())?;
                let achs = EaScanner::fetch_ea_achievements(
                    &game.id,
                    oid,
                    &epid_clone,
                    eatok_clone.as_deref(),
                    &game.title,
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

#[tauri::command]
fn get_autostart_status() -> Result<bool, String> {
    Ok(AutostartManager::is_enabled())
}

#[tauri::command]
fn set_autostart(enabled: bool) -> Result<(), String> {
    AutostartManager::set_enabled(enabled)
}

#[tauri::command]
async fn enrich_missing_scores(
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let mut all = state.db.get_all_games().map_err(|e| e.to_string())?;
    let mut updated_count = 0;
    for game in &mut all {
        if game.critic_score.is_none() || game.community_score.is_none() {
            let scores = ScoreEnrichmentEngine::resolve_scores_for_game(
                &game.title,
                &game.source,
                game.source_id.as_deref(),
            ).await;
            let mut changed = false;
            if game.critic_score.is_none() && scores.critic_score.is_some() {
                game.critic_score = scores.critic_score;
                changed = true;
            }
            if game.community_score.is_none() && scores.community_score.is_some() {
                game.community_score = scores.community_score;
                changed = true;
            }
            if changed {
                let _ = state.db.save_game_exact(game);
                let _ = app_handle.emit("game-updated", &*game);
                updated_count += 1;
            }
        }
    }
    Ok(updated_count)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let database = Arc::new(Database::new().expect("Failed to initialize OpenPlay SQLite database"));
    let db_for_setup = database.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState { db: database })
        .setup(move |app| {
            if let Some(window) = app.get_webview_window("main") {
                if let Some(icon) = app.default_window_icon() {
                    let _ = window.set_icon(icon.clone());
                }
                let win_clone = window.clone();
                // Ensure the window starts inside valid screen bounds (only if not minimized)
                if let Ok(pos) = window.outer_position() {
                    let is_minimized = window.is_minimized().unwrap_or(false);
                    if !is_minimized && (pos.x < -10000 || pos.y < -10000) {
                        let _ = window.center();
                    }
                }
                // Safeguard against sudden off-screen cursor drops during dragging
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Moved(pos) = event {
                        // On Windows, minimized windows are parked at (-32000, -32000).
                        // Calling center() while minimized corrupts Win32 placement and
                        // prevents the taskbar icon from restoring the window!
                        if win_clone.is_minimized().unwrap_or(false) {
                            return;
                        }
                        if pos.x < -10000 || pos.y < -10000 {
                            let _ = win_clone.center();
                        }
                    }
                });
            }

            let app_handle_bg = app.handle().clone();
            let db_bg = db_for_setup.clone();

            tauri::async_runtime::spawn(async move {
                // 1. Initial 5-second grace period so the UI window displays instantly
                tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;

                // 2. Check if startup sync is enabled in config
                if let Ok(cfg) = db_bg.get_app_config() {
                    let should_sync = cfg.sync_on_startup.unwrap_or(true);
                    if should_sync {
                        eprintln!("[BackgroundSync] Running startup library sync across connected providers...");
                        let _ = sync_all_libraries_core(&app_handle_bg, &db_bg, false).await;
                    }
                }

                // 3. Periodic playtime & recency loop (polls every 10 minutes)
                let mut last_periodic_sync = std::time::Instant::now();
                loop {
                    tokio::time::sleep(tokio::time::Duration::from_secs(600)).await;

                    if let Ok(cfg) = db_bg.get_app_config() {
                        let interval_hours = cfg.periodic_playtime_sync_hours.unwrap_or(0);
                        if interval_hours > 0 {
                            let required_secs = (interval_hours as u64) * 3600;
                            if last_periodic_sync.elapsed().as_secs() >= required_secs {
                                // Gaming-aware check: don't sync if user is currently playing
                                let running = GameLauncher::get_running_games(Some(&app_handle_bg), Some(&db_bg));
                                if !running.is_empty() {
                                    eprintln!("[BackgroundSync] Periodic sync deferred: active game running ({:?})", running);
                                    continue;
                                }

                                eprintln!("[BackgroundSync] Executing periodic background playtime sync ({}h interval)...", interval_hours);
                                let _ = sync_all_libraries_core(&app_handle_bg, &db_bg, true).await;
                                last_periodic_sync = std::time::Instant::now();
                            }
                        }
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_games,
            get_all_games,
            scan_steam_library,
            fetch_game_metadata,
            get_steam_current_players,
            get_game_current_players,
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
            set_game_favorite,
            launch_game,
            install_game,
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
            download_app_update,
            apply_update_and_restart,
            optimize_animated_artwork,
            get_autostart_status,
            set_autostart,
            enrich_missing_scores,
            get_emulator_profiles,
            save_emulator_profile,
            delete_emulator_profile,
            get_configured_consoles,
            save_configured_console,
            delete_configured_console,
            scan_console_roms,
            scan_and_import_console_roms,
            get_community_systems,
            save_community_systems,
            open_systems_folder,
            scan_retroarch_cores,
            scan_rom_directory,
            get_provider_integration,
            save_provider_integration,
            logout_provider,
            open_gog_login_window,
            authenticate_gog_code,
            open_xbox_login_window,
            authenticate_xbox_token,
            open_battlenet_login_window,
            authenticate_battlenet_payload,
            open_ea_login_window,
            authenticate_ea_token,
            open_ubisoft_login_window,
            authenticate_ubisoft_ticket,
            open_amazon_login_window,
            authenticate_amazon_code,
            scan_provider_library,
            sync_all_libraries
        ])
        .run(tauri::generate_context!())
        .expect("error while running OpenPlay application");
}
