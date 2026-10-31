pub struct AutostartManager;

impl AutostartManager {
    /// Checks whether autostart is currently enabled for OpenPlay on the current platform.
    pub fn is_enabled() -> bool {
        #[cfg(target_os = "windows")]
        {
            // Query Windows Run registry in HKCU (zero elevation needed)
            let output = std::process::Command::new("reg")
                .args(["query", r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run", "/v", "OpenPlay"])
                .output();

            if let Ok(out) = output {
                if out.status.success() {
                    let text = String::from_utf8_lossy(&out.stdout);
                    return text.contains("OpenPlay");
                }
            }
            false
        }

        #[cfg(target_os = "linux")]
        {
            // Check standard XDG Autostart specification: ~/.config/autostart/openplay.desktop
            if let Some(config_dir) = dirs::config_dir() {
                let desktop_file = config_dir.join("autostart").join("openplay.desktop");
                return desktop_file.exists();
            }
            false
        }

        #[cfg(not(any(target_os = "windows", target_os = "linux")))]
        {
            false
        }
    }

    /// Enables or disables autostart on system boot for the current platform.
    pub fn set_enabled(enabled: bool) -> Result<(), String> {
        let current_exe = std::env::current_exe().map_err(|e| e.to_string())?;

        #[cfg(target_os = "windows")]
        {
            if enabled {
                let exe_str = current_exe.to_string_lossy().to_string();
                let reg_val = format!("\"{}\"", exe_str);
                let status = std::process::Command::new("reg")
                    .args([
                        "add",
                        r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                        "/v",
                        "OpenPlay",
                        "/t",
                        "REG_SZ",
                        "/d",
                        &reg_val,
                        "/f",
                    ])
                    .status()
                    .map_err(|e| format!("Failed to execute reg.exe: {}", e))?;

                if !status.success() {
                    return Err("Failed to register OpenPlay in Windows Run registry".to_string());
                }
            } else {
                let _ = std::process::Command::new("reg")
                    .args([
                        "delete",
                        r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                        "/v",
                        "OpenPlay",
                        "/f",
                    ])
                    .status();
            }
            Ok(())
        }

        #[cfg(target_os = "linux")]
        {
            let config_dir = dirs::config_dir().ok_or_else(|| "Could not locate ~/.config directory".to_string())?;
            let autostart_dir = config_dir.join("autostart");
            let desktop_file = autostart_dir.join("openplay.desktop");

            if enabled {
                if !autostart_dir.exists() {
                    std::fs::create_dir_all(&autostart_dir).map_err(|e| e.to_string())?;
                }

                let exe_str = current_exe.to_string_lossy();
                let desktop_content = format!(
                    "[Desktop Entry]\n\
                    Type=Application\n\
                    Name=OpenPlay\n\
                    GenericName=Game Launcher\n\
                    Comment=Open-source offline-first cross-platform game library\n\
                    Exec=\"{}\"\n\
                    Terminal=false\n\
                    Categories=Game;Utility;\n\
                    X-GNOME-Autostart-enabled=true\n",
                    exe_str
                );

                std::fs::write(&desktop_file, desktop_content).map_err(|e| e.to_string())?;
            } else {
                if desktop_file.exists() {
                    let _ = std::fs::remove_file(&desktop_file);
                }
            }
            Ok(())
        }

        #[cfg(not(any(target_os = "windows", target_os = "linux")))]
        {
            Err("Autostart is currently supported on Windows and Linux".to_string())
        }
    }
}
