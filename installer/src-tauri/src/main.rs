#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
const SFX_MAGIC: &[u8; 8] = b"OPSFX001";

/// Read+Seek slice over a sub-range of a File (for O(1) self-extracting ZIP payloads).
struct SubFile {
    file: File,
    start: u64,
    len: u64,
    pos: u64,
}

impl SubFile {
    fn open_sfx(exe_path: &Path) -> Option<Self> {
        let mut file = File::open(exe_path).ok()?;
        let total_len = file.metadata().ok()?.len();
        if total_len < 16 {
            return None;
        }
        file.seek(SeekFrom::End(-16)).ok()?;
        let mut trailer = [0u8; 16];
        file.read_exact(&mut trailer).ok()?;
        if &trailer[0..8] != SFX_MAGIC {
            return None;
        }
        let start = u64::from_le_bytes(trailer[8..16].try_into().ok()?);
        let zip_end = total_len.checked_sub(16)?;
        if start >= zip_end {
            return None;
        }
        let len = zip_end - start;
        file.seek(SeekFrom::Start(start)).ok()?;
        Some(Self {
            file,
            start,
            len,
            pos: 0,
        })
    }
}

impl Read for SubFile {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let remaining = self.len.saturating_sub(self.pos) as usize;
        if remaining == 0 {
            return Ok(0);
        }
        let to_read = buf.len().min(remaining);
        let n = self.file.read(&mut buf[..to_read])?;
        self.pos += n as u64;
        Ok(n)
    }
}

impl Seek for SubFile {
    fn seek(&mut self, style: SeekFrom) -> io::Result<u64> {
        let new_pos: i128 = match style {
            SeekFrom::Start(n) => n as i128,
            SeekFrom::End(n) => self.len as i128 + n as i128,
            SeekFrom::Current(n) => self.pos as i128 + n as i128,
        };
        if new_pos < 0 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "invalid seek to negative position",
            ));
        }
        let clamped = (new_pos as u64).min(self.len);
        self.file.seek(SeekFrom::Start(self.start + clamped))?;
        self.pos = clamped;
        Ok(self.pos)
    }
}

struct InstallerState {
    payload_override: Mutex<Option<PathBuf>>,
}

#[derive(Debug, Clone, Serialize)]
struct InstallerDefaults {
    version: String,
    os: String,
    default_install_dir: String,
    has_embedded_payload: bool,
}

#[derive(Debug, Clone, Deserialize)]
struct InstallRequest {
    install_dir: String,
    create_desktop_shortcut: bool,
    create_menu_shortcut: bool,
    launch_on_startup: bool,
    // Optional Quick Setup fields (all skippable)
    cloud_sync_folder: Option<String>,
    steamgriddb_api_key: Option<String>,
    retroachievements_username: Option<String>,
    retroachievements_api_key: Option<String>,
    igdb_client_id: Option<String>,
    igdb_client_secret: Option<String>,
    start_in_console_mode: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
struct InstallProgress {
    percent: u32,
    stage: String,
    detail: String,
}

#[derive(Debug, Clone, Serialize)]
struct InstallResult {
    installed_exe: String,
    install_dir: String,
}

fn default_install_directory() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        if let Some(local) = dirs::data_local_dir() {
            return local.join("Programs").join("OpenPlay");
        }
        PathBuf::from(r"C:\Program Files\OpenPlay")
    }
    #[cfg(not(target_os = "windows"))]
    {
        // Keep app binaries separate from ~/.local/share/OpenPlay (where openplay.db lives)
        if let Some(home) = dirs::home_dir() {
            return home.join(".local").join("opt").join("OpenPlay");
        }
        PathBuf::from("/opt/OpenPlay")
    }
}

fn has_embedded_zip_payload() -> bool {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(sub) = SubFile::open_sfx(&exe) {
            return zip::ZipArchive::new(sub).is_ok();
        }
    }
    false
}

fn emit_progress(app: Option<&AppHandle>, percent: u32, stage: &str, detail: &str) {
    if let Some(handle) = app {
        let _ = handle.emit(
            "installer-progress",
            InstallProgress {
                percent,
                stage: stage.to_string(),
                detail: detail.to_string(),
            },
        );
    }
}

async fn download_latest_release_payload(app: Option<&AppHandle>) -> Result<PathBuf, String> {
    emit_progress(app, 5, "Connecting to GitHub", "Checking latest OpenPlay release...");

    let client = reqwest::Client::builder()
        .user_agent(format!("OpenPlay-Installer/{}", APP_VERSION))
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("Failed to initialize HTTP client: {}", e))?;

    let resp = client
        .get("https://api.github.com/repos/Screamycat/OpenPlay/releases/latest")
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await
        .map_err(|e| format!("Failed to reach GitHub: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("GitHub API returned HTTP {}", resp.status()));
    }

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let assets = json
        .get("assets")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "No release assets found on GitHub.".to_string())?;

    let target_os_token = if cfg!(target_os = "windows") {
        "win"
    } else {
        "linux"
    };

    let mut download_url: Option<String> = None;
    for asset in assets {
        let name = asset
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_lowercase();
        let url = asset
            .get("browser_download_url")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if name.contains(target_os_token) && name.ends_with(".zip") && !url.is_empty() {
            download_url = Some(url.to_string());
            if name.contains("update") {
                break;
            }
        }
    }

    let url = download_url.ok_or_else(|| {
        format!(
            "Could not find an OpenPlay {} archive in the latest GitHub release.",
            target_os_token
        )
    })?;

    emit_progress(app, 10, "Downloading OpenPlay", "Fetching application package...");
    let mut dl = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Download failed: {}", e))?;

    if !dl.status().is_success() {
        return Err(format!("Download failed with HTTP {}", dl.status()));
    }

    let total = dl.content_length().unwrap_or(0);
    let temp_zip = std::env::temp_dir().join(format!("openplay-payload-{}.zip", APP_VERSION));
    let mut file = File::create(&temp_zip).map_err(|e| e.to_string())?;
    let mut downloaded: u64 = 0;

    while let Some(chunk) = dl.chunk().await.map_err(|e| e.to_string())? {
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
        if total > 0 {
            let pct = 10 + ((downloaded as f64 / total as f64) * 35.0) as u32;
            let mb_done = downloaded as f64 / (1024.0 * 1024.0);
            let mb_tot = total as f64 / (1024.0 * 1024.0);
            emit_progress(
                app,
                pct.min(45),
                "Downloading OpenPlay",
                &format!("{:.1} MB / {:.1} MB", mb_done, mb_tot),
            );
        }
    }
    file.flush().map_err(|e| e.to_string())?;
    Ok(temp_zip)
}

fn extract_zip_reader<R: Read + Seek>(
    reader: R,
    install_dir: &Path,
    app: Option<&AppHandle>,
    base_pct: u32,
    span_pct: u32,
) -> Result<(), String> {
    let mut archive = zip::ZipArchive::new(reader)
        .map_err(|e| format!("Invalid OpenPlay payload archive: {}", e))?;

    fs::create_dir_all(install_dir)
        .map_err(|e| format!("Failed to create install directory: {}", e))?;

    let total_files = archive.len().max(1);

    // Detect if all entries share a single top-level directory so we strip it cleanly
    let common_prefix: Option<String> = {
        let mut prefix: Option<String> = None;
        let mut all_match = true;
        for i in 0..archive.len() {
            if let Ok(entry) = archive.by_index(i) {
                let name = entry.name().replace('\\', "/");
                let first = name.split('/').next().unwrap_or("").to_string();
                if first.is_empty() {
                    continue;
                }
                match &prefix {
                    None => prefix = Some(first),
                    Some(p) if p != &first => {
                        all_match = false;
                        break;
                    }
                    _ => {}
                }
            }
        }
        if all_match && archive.len() > 1 {
            prefix.filter(|p| {
                // Only strip if the zip actually contains nested files under that folder
                archive
                    .by_index(0)
                    .map(|e| e.name().replace('\\', "/").contains('/'))
                    .unwrap_or(false)
                    && !p.eq_ignore_ascii_case("resources")
                    && !p.eq_ignore_ascii_case("locales")
            })
        } else {
            None
        }
    };

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let raw_name = entry.name().replace('\\', "/");
        let rel_str = if let Some(ref p) = common_prefix {
            raw_name
                .strip_prefix(&format!("{}/", p))
                .unwrap_or(&raw_name)
        } else {
            &raw_name
        };

        if rel_str.is_empty() || rel_str.contains("..") {
            continue;
        }

        let out_path = install_dir.join(rel_str);
        if entry.is_dir() {
            fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut outfile = File::create(&out_path)
                .map_err(|e| format!("Failed to write {}: {}", out_path.display(), e))?;
            io::copy(&mut entry, &mut outfile).map_err(|e| e.to_string())?;

            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if let Some(mode) = entry.unix_mode() {
                    let _ = fs::set_permissions(&out_path, fs::Permissions::from_mode(mode));
                }
            }
        }

        if i % 8 == 0 || i + 1 == total_files {
            let pct = base_pct + (((i + 1) as f64 / total_files as f64) * span_pct as f64) as u32;
            let short_name = Path::new(rel_str)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(rel_str);
            emit_progress(app, pct, "Installing OpenPlay", short_name);
        }
    }

    Ok(())
}

fn find_installed_executable(install_dir: &Path) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        for name in ["OpenPlay.exe", "openplay.exe"] {
            let p = install_dir.join(name);
            if p.exists() {
                return p;
            }
        }
        install_dir.join("OpenPlay.exe")
    }
    #[cfg(not(target_os = "windows"))]
    {
        for name in ["openplay", "OpenPlay"] {
            let p = install_dir.join(name);
            if p.exists() {
                return p;
            }
        }
        install_dir.join("openplay")
    }
}

fn write_installer_seed(req: &InstallRequest) -> Result<(), String> {
    let mut map = serde_json::Map::new();
    let mut insert_str = |k: &str, v: &Option<String>| {
        if let Some(s) = v {
            let t = s.trim();
            if !t.is_empty() {
                map.insert(k.to_string(), serde_json::Value::String(t.to_string()));
            }
        }
    };

    insert_str("cloud_sync_folder", &req.cloud_sync_folder);
    insert_str("steamgriddb_api_key", &req.steamgriddb_api_key);
    insert_str("retroachievements_username", &req.retroachievements_username);
    insert_str("retroachievements_api_key", &req.retroachievements_api_key);
    insert_str("igdb_client_id", &req.igdb_client_id);
    insert_str("igdb_client_secret", &req.igdb_client_secret);
    if let Some(true) = req.start_in_console_mode {
        map.insert(
            "start_in_console_mode".to_string(),
            serde_json::Value::Bool(true),
        );
    }

    if map.is_empty() {
        return Ok(());
    }

    let data_dir = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("OpenPlay");
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let seed_path = data_dir.join("installer-seed.json");
    let json = serde_json::to_string_pretty(&serde_json::Value::Object(map))
        .map_err(|e| e.to_string())?;
    fs::write(&seed_path, json).map_err(|e| format!("Failed to write initial settings: {}", e))?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn configure_os_integration(
    install_dir: &Path,
    exe_path: &Path,
    req: &InstallRequest,
) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let exe_str = exe_path.to_string_lossy().to_string();
    let dir_str = install_dir.to_string_lossy().to_string();
    let uninstall_cmd_path = install_dir.join("uninstall.cmd");

    // Create a clean uninstaller script that removes the app binaries & shortcuts (preserving user DB)
    let uninstall_script = format!(
        "@echo off\r\n\
         echo Uninstalling OpenPlay...\r\n\
         taskkill /F /IM OpenPlay.exe >nul 2>&1\r\n\
         taskkill /F /IM openplay-core.exe >nul 2>&1\r\n\
         reg delete \"HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\OpenPlay\" /f >nul 2>&1\r\n\
         reg delete \"HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\" /v \"OpenPlay\" /f >nul 2>&1\r\n\
         del /F /Q \"%USERPROFILE%\\Desktop\\OpenPlay.lnk\" >nul 2>&1\r\n\
         rmdir /S /Q \"%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\OpenPlay\" >nul 2>&1\r\n\
         start /B \"\" cmd /c \"ping 127.0.0.1 -n 2 >nul & rmdir /S /Q \\\"{dir}\\\"\"\r\n",
        dir = dir_str
    );
    let _ = fs::write(&uninstall_cmd_path, uninstall_script);

    let ps_escape = |s: &str| s.replace('\'', "''");
    let mut ps_lines = vec![
        "$ErrorActionPreference = 'SilentlyContinue'".to_string(),
        "$ws = New-Object -ComObject WScript.Shell".to_string(),
    ];

    if req.create_desktop_shortcut {
        ps_lines.push(format!(
            "$sc = $ws.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\\OpenPlay.lnk'); \
             $sc.TargetPath = '{exe}'; $sc.WorkingDirectory = '{dir}'; $sc.IconLocation = '{exe},0'; $sc.Save()",
            exe = ps_escape(&exe_str),
            dir = ps_escape(&dir_str),
        ));
    }

    if req.create_menu_shortcut {
        ps_lines.push(format!(
            "$smDir = [Environment]::GetFolderPath('Programs') + '\\OpenPlay'; \
             New-Item -ItemType Directory -Path $smDir -Force | Out-Null; \
             $sc = $ws.CreateShortcut($smDir + '\\OpenPlay.lnk'); \
             $sc.TargetPath = '{exe}'; $sc.WorkingDirectory = '{dir}'; $sc.IconLocation = '{exe},0'; $sc.Save()",
            exe = ps_escape(&exe_str),
            dir = ps_escape(&dir_str),
        ));
    }

    // Register in Windows Add/Remove Programs (HKCU - no admin required)
    ps_lines.push(format!(
        "$uKey = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\OpenPlay'; \
         New-Item -Path $uKey -Force | Out-Null; \
         Set-ItemProperty -Path $uKey -Name 'DisplayName' -Value 'OpenPlay'; \
         Set-ItemProperty -Path $uKey -Name 'DisplayVersion' -Value '{ver}'; \
         Set-ItemProperty -Path $uKey -Name 'Publisher' -Value 'ScreamyCat'; \
         Set-ItemProperty -Path $uKey -Name 'DisplayIcon' -Value '{exe}'; \
         Set-ItemProperty -Path $uKey -Name 'InstallLocation' -Value '{dir}'; \
         Set-ItemProperty -Path $uKey -Name 'UninstallString' -Value '\"{uninst}\"'; \
         Set-ItemProperty -Path $uKey -Name 'NoModify' -Value 1 -Type DWord; \
         Set-ItemProperty -Path $uKey -Name 'NoRepair' -Value 1 -Type DWord",
        ver = ps_escape(APP_VERSION),
        exe = ps_escape(&exe_str),
        dir = ps_escape(&dir_str),
        uninst = ps_escape(&uninstall_cmd_path.to_string_lossy()),
    ));

    if req.launch_on_startup {
        ps_lines.push(format!(
            "Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name 'OpenPlay' -Value '\"{exe}\"'",
            exe = ps_escape(&exe_str),
        ));
    }

    let ps_script = ps_lines.join("\n");
    let _ = std::process::Command::new("powershell.exe")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-Command", &ps_script])
        .creation_flags(CREATE_NO_WINDOW)
        .status();

    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn configure_os_integration(
    install_dir: &Path,
    exe_path: &Path,
    req: &InstallRequest,
) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;

    // Ensure executables have +x permission
    for rel in ["openplay", "OpenPlay", "chrome-sandbox", "resources/bin/openplay-core"] {
        let p = install_dir.join(rel);
        if p.exists() {
            let _ = fs::set_permissions(&p, fs::Permissions::from_mode(0o755));
        }
    }

    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));

    // Install icon into ~/.local/share/icons/hicolor/256x256/apps/openplay.png
    let icons_dir = home.join(".local/share/icons/hicolor/256x256/apps");
    let _ = fs::create_dir_all(&icons_dir);
    let installed_icon = icons_dir.join("openplay.png");
    for candidate in [
        install_dir.join("resources/icons/icon.png"),
        install_dir.join("resources/icon.png"),
    ] {
        if candidate.exists() {
            let _ = fs::copy(&candidate, &installed_icon);
            break;
        }
    }

    let icon_value = if installed_icon.exists() {
        installed_icon.to_string_lossy().to_string()
    } else {
        "openplay".to_string()
    };

    let desktop_entry = format!(
        "[Desktop Entry]\n\
         Version=1.0\n\
         Type=Application\n\
         Name=OpenPlay\n\
         GenericName=Game Library & Launcher\n\
         Comment=Open-source, offline-first cross-platform game launcher\n\
         Exec=\"{exe}\" %U\n\
         Icon={icon}\n\
         Terminal=false\n\
         Categories=Game;\n\
         Keywords=games;launcher;library;steam;epic;gog;retro;console;\n\
         StartupNotify=true\n\
         StartupWMClass=openplay\n",
        exe = exe_path.to_string_lossy(),
        icon = icon_value,
    );

    let apps_dir = home.join(".local/share/applications");
    if req.create_menu_shortcut {
        let _ = fs::create_dir_all(&apps_dir);
        let _ = fs::write(apps_dir.join("openplay.desktop"), &desktop_entry);
    }

    if req.create_desktop_shortcut {
        let desktop_dir = dirs::desktop_dir().unwrap_or_else(|| home.join("Desktop"));
        if desktop_dir.exists() {
            let desk_file = desktop_dir.join("OpenPlay.desktop");
            let _ = fs::write(&desk_file, &desktop_entry);
            let _ = fs::set_permissions(&desk_file, fs::Permissions::from_mode(0o755));
        }
    }

    if req.launch_on_startup {
        let autostart_dir = home.join(".config/autostart");
        let _ = fs::create_dir_all(&autostart_dir);
        let _ = fs::write(autostart_dir.join("openplay.desktop"), &desktop_entry);
    }

    // Refresh desktop & icon caches so Fedora/KDE/GNOME search indexes OpenPlay immediately
    let hicolor_dir = home.join(".local/share/icons/hicolor");
    let _ = std::process::Command::new("update-desktop-database")
        .arg(&apps_dir)
        .output();
    let _ = std::process::Command::new("gtk-update-icon-cache")
        .args(["-f", "-t"])
        .arg(&hicolor_dir)
        .output();
    let _ = std::process::Command::new("kbuildsycoca6").output();
    let _ = std::process::Command::new("kbuildsycoca5").output();

    // Create ~/.local/bin/openplay symlink for CLI convenience
    let bin_dir = home.join(".local/bin");
    let _ = fs::create_dir_all(&bin_dir);
    let link_path = bin_dir.join("openplay");
    let _ = fs::remove_file(&link_path);
    let _ = std::os::unix::fs::symlink(exe_path, &link_path);

    // Create clean uninstall script (preserves user database in ~/.local/share/OpenPlay)
    let uninstall_sh = install_dir.join("uninstall.sh");
    let script = format!(
        "#!/usr/bin/env sh\n\
         set -e\n\
         echo \"Uninstalling OpenPlay...\"\n\
         rm -f \"$HOME/.local/share/applications/openplay.desktop\"\n\
         rm -f \"$HOME/.config/autostart/openplay.desktop\"\n\
         rm -f \"$HOME/Desktop/OpenPlay.desktop\"\n\
         rm -f \"$HOME/.local/bin/openplay\"\n\
         command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database \"$HOME/.local/share/applications\" || true\n\
         command -v kbuildsycoca6 >/dev/null 2>&1 && kbuildsycoca6 >/dev/null 2>&1 || true\n\
         rm -rf \"{dir}\"\n\
         echo \"OpenPlay has been uninstalled. Your library data in ~/.local/share/OpenPlay was preserved.\"\n",
        dir = install_dir.to_string_lossy(),
    );
    let _ = fs::write(&uninstall_sh, script);
    let _ = fs::set_permissions(&uninstall_sh, fs::Permissions::from_mode(0o755));

    Ok(())
}

async fn perform_install(
    req: InstallRequest,
    payload_override: Option<PathBuf>,
    app: Option<&AppHandle>,
) -> Result<InstallResult, String> {
    let install_dir = PathBuf::from(req.install_dir.trim());
    if install_dir.as_os_str().is_empty() {
        return Err("Please choose a valid installation directory.".to_string());
    }

    let mut temp_downloaded: Option<PathBuf> = None;
    let extract_res = if let Some(ov) = payload_override {
        emit_progress(app, 10, "Installing OpenPlay", "Extracting application files...");
        let file = File::open(&ov)
            .map_err(|e| format!("Failed to open payload archive: {}", e))?;
        extract_zip_reader(file, &install_dir, app, 10, 72)
    } else if let Some(sub) = std::env::current_exe().ok().and_then(|e| SubFile::open_sfx(&e)) {
        emit_progress(app, 10, "Installing OpenPlay", "Extracting embedded OpenPlay package...");
        extract_zip_reader(sub, &install_dir, app, 10, 72)
    } else {
        let dl = download_latest_release_payload(app).await?;
        temp_downloaded = Some(dl.clone());
        emit_progress(app, 45, "Installing OpenPlay", "Extracting application files...");
        let file = File::open(&dl)
            .map_err(|e| format!("Failed to open downloaded archive: {}", e))?;
        extract_zip_reader(file, &install_dir, app, 45, 37)
    };

    if let Some(tmp) = temp_downloaded {
        let _ = fs::remove_file(tmp);
    }
    extract_res?;

    emit_progress(app, 86, "Saving Preferences", "Applying your optional setup configuration...");
    write_installer_seed(&req)?;

    let installed_exe = find_installed_executable(&install_dir);

    emit_progress(app, 93, "Finishing Setup", "Creating shortcuts and system integration...");
    configure_os_integration(&install_dir, &installed_exe, &req)?;

    emit_progress(app, 100, "Complete", "OpenPlay is ready to launch!");

    Ok(InstallResult {
        installed_exe: installed_exe.to_string_lossy().to_string(),
        install_dir: install_dir.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn get_installer_defaults(state: State<InstallerState>) -> InstallerDefaults {
    let has_override = state.payload_override.lock().ok().and_then(|g| g.clone()).is_some();
    InstallerDefaults {
        version: APP_VERSION.to_string(),
        os: std::env::consts::OS.to_string(),
        default_install_dir: default_install_directory().to_string_lossy().to_string(),
        has_embedded_payload: has_override || has_embedded_zip_payload(),
    }
}

#[tauri::command]
async fn pick_folder(initial_path: Option<String>) -> Option<String> {
    let mut dialog = rfd::AsyncFileDialog::new().set_title("Choose Folder");
    if let Some(p) = initial_path {
        let path = PathBuf::from(p);
        if path.exists() {
            dialog = dialog.set_directory(path);
        }
    }
    dialog
        .pick_folder()
        .await
        .map(|h| h.path().to_string_lossy().to_string())
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err("Invalid URL".to_string());
    }
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open").arg(&url).spawn();
    }
    Ok(())
}

#[tauri::command]
async fn start_install(
    request: InstallRequest,
    state: State<'_, InstallerState>,
    app: AppHandle,
) -> Result<InstallResult, String> {
    let payload_override = state.payload_override.lock().ok().and_then(|g| g.clone());
    perform_install(request, payload_override, Some(&app)).await
}

#[tauri::command]
fn launch_installed_app(exe_path: String, app: AppHandle) -> Result<(), String> {
    let path = PathBuf::from(&exe_path);
    if path.exists() {
        let mut cmd = std::process::Command::new(&path);
        if let Some(dir) = path.parent() {
            cmd.current_dir(dir);
        }
        cmd.spawn()
            .map_err(|e| format!("Failed to launch OpenPlay: {}", e))?;
    }
    app.exit(0);
    Ok(())
}

fn main() {
    #[cfg(target_os = "linux")]
    {
        // Prevent WebKitGTK + NVIDIA/Wayland "Error 71 (Protocol error) dispatching to Wayland display"
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
        if std::env::var_os("__NV_DISABLE_EXPLICIT_SYNC").is_none() {
            std::env::set_var("__NV_DISABLE_EXPLICIT_SYNC", "1");
        }
    }

    let args: Vec<String> = std::env::args().collect();
    let silent = args.iter().any(|a| a == "--silent" || a == "/S");

    let mut dir_arg: Option<String> = None;
    let mut payload_arg: Option<PathBuf> = None;

    for (idx, a) in args.iter().enumerate() {
        if let Some(v) = a.strip_prefix("--dir=") {
            dir_arg = Some(v.trim_matches('"').to_string());
        } else if let Some(v) = a.strip_prefix("/D=") {
            dir_arg = Some(v.trim_matches('"').to_string());
        } else if a == "--dir" {
            if let Some(next) = args.get(idx + 1) {
                dir_arg = Some(next.clone());
            }
        } else if let Some(v) = a.strip_prefix("--payload=") {
            payload_arg = Some(PathBuf::from(v.trim_matches('"')));
        } else if a == "--payload" {
            if let Some(next) = args.get(idx + 1) {
                payload_arg = Some(PathBuf::from(next));
            }
        }
    }

    if silent {
        let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
        let req = InstallRequest {
            install_dir: dir_arg.unwrap_or_else(|| {
                default_install_directory().to_string_lossy().to_string()
            }),
            create_desktop_shortcut: false,
            create_menu_shortcut: true,
            launch_on_startup: false,
            cloud_sync_folder: None,
            steamgriddb_api_key: None,
            retroachievements_username: None,
            retroachievements_api_key: None,
            igdb_client_id: None,
            igdb_client_secret: None,
            start_in_console_mode: None,
        };
        match rt.block_on(perform_install(req, payload_arg, None)) {
            Ok(_) => std::process::exit(0),
            Err(e) => {
                eprintln!("OpenPlay silent install failed: {}", e);
                std::process::exit(1);
            }
        }
    }

    tauri::Builder::default()
        .manage(InstallerState {
            payload_override: Mutex::new(payload_arg),
        })
        .invoke_handler(tauri::generate_handler![
            get_installer_defaults,
            pick_folder,
            open_url,
            start_install,
            launch_installed_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running OpenPlay installer");
}
