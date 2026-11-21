use super::runners::RunnerInfo;
use crate::scanner::steam::SteamScanner;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

pub struct LinuxWineEngine;

impl LinuxWineEngine {
    /// Returns the dedicated isolated Wine prefix directory for a given game ID.
    pub fn get_game_prefix_dir(game_id: &str) -> PathBuf {
        let base = dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("OpenPlay")
            .join("prefixes");
        base.join(game_id)
    }

    /// Prepares and validates the game's prefix directory
    pub fn prepare_prefix(prefix_dir: &Path) -> Result<(), String> {
        if !prefix_dir.exists() {
            fs::create_dir_all(prefix_dir)
                .map_err(|e| format!("Failed to create prefix directory '{}': {}", prefix_dir.display(), e))?;
        }
        Ok(())
    }

    /// Builds a Command to execute a Windows .exe through the selected Proton or Wine runner on Linux
    pub fn build_execution_command(
        exe_path: &Path,
        install_dir: Option<&Path>,
        launch_args: &[String],
        prefix_dir: &Path,
        runner: &RunnerInfo,
        enable_gamemode: bool,
        enable_mangohud: bool,
        custom_env: &HashMap<String, String>,
    ) -> Result<Command, String> {
        Self::prepare_prefix(prefix_dir)?;

        let has_gamemode = enable_gamemode && (Path::new("/usr/bin/gamemoderun").exists() || Path::new("/usr/local/bin/gamemoderun").exists());
        let has_mangohud = enable_mangohud && (Path::new("/usr/bin/mangohud").exists() || Path::new("/usr/local/bin/mangohud").exists());

        // We prepare the base binary and initial arguments
        let mut base_cmd_bin = String::new();
        let mut base_cmd_args: Vec<String> = Vec::new();

        // Wrap with mangohud / gamemoderun if requested and available
        if has_mangohud {
            base_cmd_bin = "mangohud".to_string();
            if has_gamemode {
                base_cmd_args.push("gamemoderun".to_string());
            }
        } else if has_gamemode {
            base_cmd_bin = "gamemoderun".to_string();
        }

        let steam_dir = SteamScanner::find_steam_install_dir().unwrap_or_else(|| {
            dirs::home_dir()
                .map(|h| h.join(".local/share/Steam"))
                .unwrap_or_else(|| PathBuf::from("/tmp"))
        });

        if runner.runner_type == "proton" {
            let runner_dir = Path::new(&runner.path);
            let proton_script = runner_dir.join("proton");
            if !proton_script.exists() {
                return Err(format!("Proton runner script not found at '{}'", proton_script.display()));
            }

            // Determine command binary
            let final_bin = if base_cmd_bin.is_empty() {
                proton_script.to_string_lossy().to_string()
            } else {
                base_cmd_bin
            };

            let mut cmd = Command::new(&final_bin);

            if !final_bin.ends_with("proton") {
                for a in &base_cmd_args {
                    cmd.arg(a);
                }
                cmd.arg(proton_script.to_string_lossy().to_string());
            }

            cmd.arg("run");
            cmd.arg(exe_path.to_string_lossy().to_string());
            for arg in launch_args {
                cmd.arg(arg);
            }

            // Required Proton environment variables
            cmd.env("STEAM_COMPAT_CLIENT_INSTALL_PATH", steam_dir.to_string_lossy().to_string());
            cmd.env("STEAM_COMPAT_DATA_PATH", prefix_dir.to_string_lossy().to_string());
            cmd.env("PROTON_LOG", "1");
            cmd.env("DXVK_ASYNC", "1");

            if enable_mangohud {
                cmd.env("MANGOHUD", "1");
            }

            for (k, v) in custom_env {
                cmd.env(k, v);
            }

            if let Some(dir) = install_dir {
                cmd.current_dir(dir);
            } else if let Some(parent) = exe_path.parent() {
                cmd.current_dir(parent);
            }

            return Ok(cmd);
        } else {
            // Standard Wine execution
            let wine_bin = if runner.path.ends_with(".exe") || runner.path.ends_with("wine") || runner.path.ends_with("wine64") {
                runner.path.clone()
            } else {
                let bin = Path::new(&runner.path).join("bin/wine");
                if bin.exists() {
                    bin.to_string_lossy().to_string()
                } else {
                    "wine".to_string()
                }
            };

            let final_bin = if base_cmd_bin.is_empty() {
                wine_bin.clone()
            } else {
                base_cmd_bin
            };

            let mut cmd = Command::new(&final_bin);

            if final_bin != wine_bin {
                for a in &base_cmd_args {
                    cmd.arg(a);
                }
                cmd.arg(&wine_bin);
            }

            cmd.arg(exe_path.to_string_lossy().to_string());
            for arg in launch_args {
                cmd.arg(arg);
            }

            cmd.env("WINEPREFIX", prefix_dir.to_string_lossy().to_string());
            cmd.env("DXVK_ASYNC", "1");

            if enable_mangohud {
                cmd.env("MANGOHUD", "1");
            }

            for (k, v) in custom_env {
                cmd.env(k, v);
            }

            if let Some(dir) = install_dir {
                cmd.current_dir(dir);
            } else if let Some(parent) = exe_path.parent() {
                cmd.current_dir(parent);
            }

            return Ok(cmd);
        }
    }

    /// Shuts down the Wine/Proton prefix cleanly using wineserver -k
    pub fn shutdown_prefix(prefix_dir: &Path, runner_path: Option<&str>) {
        let pfx_candidate = prefix_dir.join("pfx");
        let active_pfx = if pfx_candidate.exists() {
            pfx_candidate
        } else {
            prefix_dir.to_path_buf()
        };

        let mut wineserver_bins = Vec::new();
        if let Some(rp) = runner_path {
            let rp_path = Path::new(rp);
            for rel in ["files/bin/wineserver", "dist/bin/wineserver", "bin/wineserver"] {
                let candidate = rp_path.join(rel);
                if candidate.exists() {
                    wineserver_bins.push(candidate.to_string_lossy().to_string());
                }
            }
        }
        wineserver_bins.push("wineserver".to_string());

        for bin in wineserver_bins {
            if let Ok(mut child) = Command::new(&bin)
                .arg("-k")
                .env("WINEPREFIX", active_pfx.to_string_lossy().to_string())
                .spawn()
            {
                let _ = child.wait();
                break;
            }
        }
    }
}
