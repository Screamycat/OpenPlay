use crate::db::Database;
use std::process::Command;
use std::sync::Arc;
use std::time::Instant;
use tauri::{AppHandle, Emitter};

pub struct GameLauncher;

impl GameLauncher {
    pub fn launch_game(
        app_handle: AppHandle,
        db: Arc<Database>,
        game_id: String,
        source: String,
        source_id: Option<String>,
        executable_path: Option<String>,
        launch_arguments: Option<String>,
    ) -> Result<String, String> {
        let now_str = chrono::Local::now().format("%Y-%m-%d %H:%M").to_string();

        if source.to_lowercase() == "steam" {
            if let Some(appid) = source_id {
                let steam_url = format!("steam://run/{}", appid);

                #[cfg(target_os = "windows")]
                {
                    Command::new("cmd")
                        .args(["/C", "start", "", &steam_url])
                        .spawn()
                        .map_err(|e| format!("Failed to launch Steam game: {}", e))?;
                }

                #[cfg(target_os = "linux")]
                {
                    Command::new("xdg-open")
                        .arg(&steam_url)
                        .spawn()
                        .map_err(|e| format!("Failed to launch Steam game: {}", e))?;
                }

                // Update last played timestamp
                let _ = db.update_playtime(&game_id, 0, &now_str);
                let _ = app_handle.emit("game-launched", &game_id);

                return Ok("Steam game launch command triggered".to_string());
            } else {
                return Err("Missing Steam App ID".to_string());
            }
        }

        // Custom / Manual game
        if let Some(exe_path) = executable_path {
            let mut cmd = Command::new(&exe_path);

            if let Some(parent) = std::path::Path::new(&exe_path).parent() {
                cmd.current_dir(parent);
            }

            if let Some(args_str) = launch_arguments {
                let parts: Vec<&str> = args_str.split_whitespace().collect();
                cmd.args(parts);
            }

            let start_time = Instant::now();
            let mut child = cmd
                .spawn()
                .map_err(|e| format!("Failed to execute '{}': {}", exe_path, e))?;

            let _ = db.update_playtime(&game_id, 0, &now_str);
            let _ = app_handle.emit("game-launched", &game_id);

            // Spawn background thread to monitor process lifetime
            let app_handle_clone = app_handle.clone();
            let db_clone = db.clone();
            let gid = game_id.clone();

            std::thread::spawn(move || {
                let _ = child.wait();
                let elapsed = start_time.elapsed().as_secs();
                let end_str = chrono::Local::now().format("%Y-%m-%d %H:%M").to_string();
                let _ = db_clone.update_playtime(&gid, elapsed, &end_str);
                let _ = app_handle_clone.emit("game-stopped", serde_json::json!({
                    "id": gid,
                    "elapsed_seconds": elapsed,
                    "last_played": end_str
                }));
            });

            return Ok("Game launched successfully".to_string());
        }

        Err("No executable or launch method found for this game".to_string())
    }
}
