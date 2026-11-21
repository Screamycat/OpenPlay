use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsRootEntry {
    pub name: String,
    pub path: String,
    pub kind: String, // "home" | "drive" | "folder"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size_bytes: Option<u64>,
    pub extension: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsDirectoryListing {
    pub current_path: String,
    pub parent_path: Option<String>,
    pub entries: Vec<FsEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeGamepadSnapshot {
    pub connected: bool,
    pub id: String,
    pub buttons: Vec<f32>, // 17 standard W3C buttons
    pub axes: Vec<f32>,    // 4 standard W3C axes [LX, LY, RX, RY]
    pub timestamp_ms: u64,
}

impl Default for NativeGamepadSnapshot {
    fn default() -> Self {
        Self {
            connected: false,
            id: String::new(),
            buttons: vec![0.0; 17],
            axes: vec![0.0; 4],
            timestamp_ms: 0,
        }
    }
}

pub fn get_filesystem_roots_core() -> Result<Vec<FsRootEntry>, String> {
    let mut roots = Vec::new();

    if let Some(home) = dirs::home_dir() {
        if home.exists() {
            roots.push(FsRootEntry {
                name: "Home".to_string(),
                path: home.to_string_lossy().to_string(),
                kind: "home".to_string(),
            });
        }

        #[cfg(target_os = "linux")]
        {
            let local_share = home.join(".local/share");
            if local_share.exists() {
                roots.push(FsRootEntry {
                    name: "Local Share (~/.local/share)".to_string(),
                    path: local_share.to_string_lossy().to_string(),
                    kind: "folder".to_string(),
                });
            }
            let games_dir = home.join("Games");
            if games_dir.exists() {
                roots.push(FsRootEntry {
                    name: "Games (~/Games)".to_string(),
                    path: games_dir.to_string_lossy().to_string(),
                    kind: "folder".to_string(),
                });
            }
        }
    }

    if let Some(desktop) = dirs::desktop_dir() {
        if desktop.exists() {
            roots.push(FsRootEntry {
                name: "Desktop".to_string(),
                path: desktop.to_string_lossy().to_string(),
                kind: "folder".to_string(),
            });
        }
    }

    if let Some(downloads) = dirs::download_dir() {
        if downloads.exists() {
            roots.push(FsRootEntry {
                name: "Downloads".to_string(),
                path: downloads.to_string_lossy().to_string(),
                kind: "folder".to_string(),
            });
        }
    }

    if let Some(docs) = dirs::document_dir() {
        if docs.exists() {
            roots.push(FsRootEntry {
                name: "Documents".to_string(),
                path: docs.to_string_lossy().to_string(),
                kind: "folder".to_string(),
            });
        }
    }

    #[cfg(target_os = "windows")]
    {
        for letter in b'A'..=b'Z' {
            let drive = format!("{}:\\", letter as char);
            if Path::new(&drive).exists() {
                roots.push(FsRootEntry {
                    name: format!("Local Disk ({}:)", letter as char),
                    path: drive,
                    kind: "drive".to_string(),
                });
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        roots.push(FsRootEntry {
            name: "Root (/)".to_string(),
            path: "/".to_string(),
            kind: "drive".to_string(),
        });

        for mount_parent in &["/run/media", "/media", "/mnt"] {
            let p = Path::new(mount_parent);
            if p.exists() && p.is_dir() {
                if let Ok(entries) = std::fs::read_dir(p) {
                    for entry in entries.flatten() {
                        let ep = entry.path();
                        if ep.is_dir() {
                            // Check if this is /run/media/<user> containing actual mounted drives
                            let mut added_sub = false;
                            if *mount_parent == "/run/media" || *mount_parent == "/media" {
                                if let Ok(sub_entries) = std::fs::read_dir(&ep) {
                                    for sub in sub_entries.flatten() {
                                        let sp = sub.path();
                                        if sp.is_dir() {
                                            let label = sp
                                                .file_name()
                                                .map(|n| n.to_string_lossy().to_string())
                                                .unwrap_or_else(|| sp.to_string_lossy().to_string());
                                            roots.push(FsRootEntry {
                                                name: format!("Drive: {}", label),
                                                path: sp.to_string_lossy().to_string(),
                                                kind: "drive".to_string(),
                                            });
                                            added_sub = true;
                                        }
                                    }
                                }
                            }
                            if !added_sub {
                                let label = ep
                                    .file_name()
                                    .map(|n| n.to_string_lossy().to_string())
                                    .unwrap_or_else(|| ep.to_string_lossy().to_string());
                                roots.push(FsRootEntry {
                                    name: format!("Mount: {}", label),
                                    path: ep.to_string_lossy().to_string(),
                                    kind: "drive".to_string(),
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(roots)
}

fn matches_file_filter(path: &Path, filter: Option<&str>) -> bool {
    let Some(raw_filter) = filter else {
        return true;
    };
    let trimmed = raw_filter.trim().to_lowercase();
    if trimmed.is_empty() || trimmed == "*" || trimmed == "*.*" {
        return true;
    }

    let ext = path
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    if trimmed.contains(".zip") && !trimmed.contains(".exe") {
        return ext == "zip";
    }

    if trimmed.contains(".exe") {
        #[cfg(target_os = "windows")]
        {
            return matches!(ext.as_str(), "exe" | "bat" | "cmd" | "lnk" | "url");
        }
        #[cfg(not(target_os = "windows"))]
        {
            if matches!(
                ext.as_str(),
                "appimage" | "sh" | "desktop" | "bin" | "run" | "exe" | "flatpakref" | "x86_64" | "x86"
            ) {
                return true;
            }
            // Also match extensionless executable binaries on Linux/macOS
            if ext.is_empty() {
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    if let Ok(meta) = path.metadata() {
                        if meta.permissions().mode() & 0o111 != 0 {
                            return true;
                        }
                    }
                }
            }
            return false;
        }
    }

    // Comma or space separated extension list
    let allowed: Vec<String> = trimmed
        .split(|c: char| c == ',' || c == ';' || c.is_whitespace())
        .map(|s| s.trim_start_matches("*.").trim_start_matches('.').to_lowercase())
        .filter(|s| !s.is_empty())
        .collect();

    if allowed.is_empty() {
        return true;
    }
    allowed.iter().any(|a| a == &ext || a == "*")
}

pub fn list_directory_entries_core(
    path: Option<String>,
    include_files: bool,
    filter: Option<String>,
    show_hidden: bool,
) -> Result<FsDirectoryListing, String> {
    let target_dir: PathBuf = match path.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        Some(p) => PathBuf::from(p),
        None => dirs::home_dir().unwrap_or_else(|| PathBuf::from("/")),
    };

    let resolved_dir = if target_dir.is_file() {
        target_dir
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or(target_dir)
    } else if target_dir.exists() {
        target_dir
    } else {
        dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"))
    };

    let parent_path = resolved_dir
        .parent()
        .filter(|p| *p != resolved_dir)
        .map(|p| p.to_string_lossy().to_string());

    let read_dir = std::fs::read_dir(&resolved_dir)
        .map_err(|e| format!("Unable to read directory {:?}: {}", resolved_dir, e))?;

    let mut entries = Vec::new();
    for item in read_dir.flatten() {
        let p = item.path();
        let name = item.file_name().to_string_lossy().to_string();
        if !show_hidden && name.starts_with('.') {
            continue;
        }

        let meta = std::fs::metadata(&p).ok();
        let is_dir = meta.as_ref().map(|m| m.is_dir()).unwrap_or_else(|| p.is_dir());

        if !is_dir {
            if !include_files {
                continue;
            }
            if !matches_file_filter(&p, filter.as_deref()) {
                continue;
            }
        }

        let size_bytes = if is_dir {
            None
        } else {
            meta.as_ref().map(|m| m.len())
        };
        let extension = if is_dir {
            None
        } else {
            p.extension().map(|e| e.to_string_lossy().to_string())
        };

        entries.push(FsEntry {
            name,
            path: p.to_string_lossy().to_string(),
            is_dir,
            size_bytes,
            extension,
        });
    }

    entries.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(FsDirectoryListing {
        current_path: resolved_dir.to_string_lossy().to_string(),
        parent_path,
        entries,
    })
}

/// Starts a lightweight background thread on Linux to read `/dev/input/js*` or `/dev/input/event*`
/// gamepads so controllers work even on Linux WebKitGTK builds compiled without `libmanette`.
pub fn start_native_gamepad_watcher(
    app_handle: AppHandle,
    shared_state: Arc<Mutex<NativeGamepadSnapshot>>,
) {
    start_native_gamepad_watcher_with_callback(shared_state, move |snap| {
        let _ = app_handle.emit("native-gamepad-state", snap);
    });
}

pub fn start_native_gamepad_watcher_with_callback<F>(
    shared_state: Arc<Mutex<NativeGamepadSnapshot>>,
    on_emit: F,
) where
    F: Fn(NativeGamepadSnapshot) + Send + 'static,
{
    #[cfg(target_os = "linux")]
    {
        std::thread::spawn(move || {
            linux_gamepad_loop(shared_state, on_emit);
        });
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (shared_state, on_emit);
    }
}

#[cfg(target_os = "linux")]
fn find_linux_gamepad_device() -> Option<(PathBuf, String, bool)> {
    // 1. Prefer /dev/input/js0..js3 if joydev module is loaded
    for idx in 0..4 {
        let js_path = PathBuf::from(format!("/dev/input/js{}", idx));
        if js_path.exists() {
            let name_path = format!("/sys/class/input/js{}/device/name", idx);
            let name = std::fs::read_to_string(name_path)
                .unwrap_or_else(|_| "Linux Gamepad".to_string())
                .trim()
                .to_string();
            return Some((js_path, name, true));
        }
    }

    // 2. Fallback: scan /sys/class/input/event* for devices supporting BTN_GAMEPAD / BTN_SOUTH (bit 0x130 = 304)
    if let Ok(entries) = std::fs::read_dir("/sys/class/input") {
        for entry in entries.flatten() {
            let fname = entry.file_name().to_string_lossy().to_string();
            if !fname.starts_with("event") {
                continue;
            }
            let cap_path = entry.path().join("device/capabilities/key");
            let Ok(cap_str) = std::fs::read_to_string(&cap_path) else {
                continue;
            };
            // Linux capabilities/key is space-separated 64-bit hex words from highest word to lowest word.
            // Bit 304 (0x130 BTN_SOUTH) is in word index 4 (304 / 64 = 4, bit 304 % 64 = 48 -> mask 1 << 48).
            let words: Vec<&str> = cap_str.split_whitespace().rev().collect();
            if words.len() > 4 {
                if let Ok(w4) = u64::from_str_radix(words[4], 16) {
                    if (w4 & (1u64 << 48)) != 0 {
                        let dev_path = PathBuf::from(format!("/dev/input/{}", fname));
                        if dev_path.exists() {
                            let name_path = entry.path().join("device/name");
                            let name = std::fs::read_to_string(name_path)
                                .unwrap_or_else(|_| "Linux Evdev Controller".to_string())
                                .trim()
                                .to_string();
                            return Some((dev_path, name, false));
                        }
                    }
                }
            }
        }
    }

    None
}

#[cfg(target_os = "linux")]
fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(target_os = "linux")]
fn linux_gamepad_loop<F>(shared_state: Arc<Mutex<NativeGamepadSnapshot>>, on_emit: F)
where
    F: Fn(NativeGamepadSnapshot),
{
    use std::io::Read;

    loop {
        let Some((dev_path, dev_name, is_joydev)) = find_linux_gamepad_device() else {
            {
                if let Ok(mut guard) = shared_state.lock() {
                    if guard.connected {
                        guard.connected = false;
                        guard.id.clear();
                        guard.buttons.fill(0.0);
                        guard.axes.fill(0.0);
                        guard.timestamp_ms = now_ms();
                        on_emit(guard.clone());
                    }
                }
            }
            std::thread::sleep(std::time::Duration::from_secs(2));
            continue;
        };

        let Ok(mut file) = std::fs::File::open(&dev_path) else {
            std::thread::sleep(std::time::Duration::from_secs(2));
            continue;
        };

        {
            if let Ok(mut guard) = shared_state.lock() {
                guard.connected = true;
                guard.id = dev_name.clone();
                guard.buttons.fill(0.0);
                guard.axes.fill(0.0);
                guard.timestamp_ms = now_ms();
                on_emit(guard.clone());
            }
        }

        if is_joydev {
            // struct js_event { u32 time; i16 value; u8 type; u8 number; } = 8 bytes
            let mut buf = [0u8; 8];
            while file.read_exact(&mut buf).is_ok() {
                let value = i16::from_ne_bytes([buf[4], buf[5]]);
                let ev_type = buf[6] & !0x80; // strip JS_EVENT_INIT
                let number = buf[7] as usize;

                let mut changed = false;
                if let Ok(mut guard) = shared_state.lock() {
                    if ev_type == 0x01 {
                        // JS_EVENT_BUTTON
                        let pressed = if value != 0 { 1.0 } else { 0.0 };
                        let mapped_idx = match number {
                            0 => Some(0),  // South (A)
                            1 => Some(1),  // East (B)
                            2 => Some(2),  // West (X)
                            3 => Some(3),  // North (Y)
                            4 => Some(4),  // LB
                            5 => Some(5),  // RB
                            6 => Some(8),  // Select/Back
                            7 => Some(9),  // Start
                            8 => Some(16), // Guide
                            9 => Some(10), // L3
                            10 => Some(11), // R3
                            _ => None,
                        };
                        if let Some(idx) = mapped_idx {
                            if (guard.buttons[idx] - pressed).abs() > 0.01 {
                                guard.buttons[idx] = pressed;
                                changed = true;
                            }
                        }
                    } else if ev_type == 0x02 {
                        // JS_EVENT_AXIS
                        let norm = (value as f32 / 32767.0).clamp(-1.0, 1.0);
                        match number {
                            0 => {
                                if (guard.axes[0] - norm).abs() > 0.02 {
                                    guard.axes[0] = norm;
                                    changed = true;
                                }
                            }
                            1 => {
                                if (guard.axes[1] - norm).abs() > 0.02 {
                                    guard.axes[1] = norm;
                                    changed = true;
                                }
                            }
                            2 => {
                                // LT (-1..1 -> 0..1)
                                let trig = ((norm + 1.0) * 0.5).clamp(0.0, 1.0);
                                if (guard.buttons[6] - trig).abs() > 0.05 {
                                    guard.buttons[6] = trig;
                                    changed = true;
                                }
                            }
                            3 => {
                                if (guard.axes[2] - norm).abs() > 0.02 {
                                    guard.axes[2] = norm;
                                    changed = true;
                                }
                            }
                            4 => {
                                if (guard.axes[3] - norm).abs() > 0.02 {
                                    guard.axes[3] = norm;
                                    changed = true;
                                }
                            }
                            5 => {
                                // RT (-1..1 -> 0..1)
                                let trig = ((norm + 1.0) * 0.5).clamp(0.0, 1.0);
                                if (guard.buttons[7] - trig).abs() > 0.05 {
                                    guard.buttons[7] = trig;
                                    changed = true;
                                }
                            }
                            6 => {
                                // DPad X
                                let left = if value < -16000 { 1.0 } else { 0.0 };
                                let right = if value > 16000 { 1.0 } else { 0.0 };
                                if guard.buttons[14] != left || guard.buttons[15] != right {
                                    guard.buttons[14] = left;
                                    guard.buttons[15] = right;
                                    changed = true;
                                }
                            }
                            7 => {
                                // DPad Y
                                let up = if value < -16000 { 1.0 } else { 0.0 };
                                let down = if value > 16000 { 1.0 } else { 0.0 };
                                if guard.buttons[12] != up || guard.buttons[13] != down {
                                    guard.buttons[12] = up;
                                    guard.buttons[13] = down;
                                    changed = true;
                                }
                            }
                            _ => {}
                        }
                    }

                    if changed {
                        guard.timestamp_ms = now_ms();
                        on_emit(guard.clone());
                    }
                }
            }
        } else {
            // 64-bit Linux struct input_event { u64 tv_sec; u64 tv_usec; u16 type; u16 code; i32 value; } = 24 bytes
            let mut buf = [0u8; 24];
            while file.read_exact(&mut buf).is_ok() {
                let ev_type = u16::from_ne_bytes([buf[16], buf[17]]);
                let code = u16::from_ne_bytes([buf[18], buf[19]]);
                let value = i32::from_ne_bytes([buf[20], buf[21], buf[22], buf[23]]);

                let mut changed = false;
                if let Ok(mut guard) = shared_state.lock() {
                    if ev_type == 0x01 {
                        // EV_KEY
                        let pressed = if value != 0 { 1.0 } else { 0.0 };
                        let mapped_idx = match code {
                            0x130 => Some(0),  // BTN_SOUTH (A)
                            0x131 => Some(1),  // BTN_EAST (B)
                            0x133 => Some(2),  // BTN_NORTH/X (West on Xbox/Linux evdev 0x133 is X)
                            0x134 => Some(3),  // BTN_WEST/Y (North on Xbox/Linux evdev 0x134 is Y)
                            0x136 => Some(4),  // BTN_TL (LB)
                            0x137 => Some(5),  // BTN_TR (RB)
                            0x138 => Some(6),  // BTN_TL2 (LT digital)
                            0x139 => Some(7),  // BTN_TR2 (RT digital)
                            0x13a => Some(8),  // BTN_SELECT
                            0x13b => Some(9),  // BTN_START
                            0x13c => Some(16), // BTN_MODE
                            0x13d => Some(10), // BTN_THUMBL
                            0x13e => Some(11), // BTN_THUMBR
                            0x220 => Some(12), // BTN_DPAD_UP
                            0x221 => Some(13), // BTN_DPAD_DOWN
                            0x222 => Some(14), // BTN_DPAD_LEFT
                            0x223 => Some(15), // BTN_DPAD_RIGHT
                            _ => None,
                        };
                        if let Some(idx) = mapped_idx {
                            if (guard.buttons[idx] - pressed).abs() > 0.01 {
                                guard.buttons[idx] = pressed;
                                changed = true;
                            }
                        }
                    } else if ev_type == 0x03 {
                        // EV_ABS
                        match code {
                            0x00 => {
                                // ABS_X
                                let norm = (value as f32 / 32767.0).clamp(-1.0, 1.0);
                                if (guard.axes[0] - norm).abs() > 0.02 {
                                    guard.axes[0] = norm;
                                    changed = true;
                                }
                            }
                            0x01 => {
                                // ABS_Y
                                let norm = (value as f32 / 32767.0).clamp(-1.0, 1.0);
                                if (guard.axes[1] - norm).abs() > 0.02 {
                                    guard.axes[1] = norm;
                                    changed = true;
                                }
                            }
                            0x03 => {
                                // ABS_RX
                                let norm = (value as f32 / 32767.0).clamp(-1.0, 1.0);
                                if (guard.axes[2] - norm).abs() > 0.02 {
                                    guard.axes[2] = norm;
                                    changed = true;
                                }
                            }
                            0x04 => {
                                // ABS_RY
                                let norm = (value as f32 / 32767.0).clamp(-1.0, 1.0);
                                if (guard.axes[3] - norm).abs() > 0.02 {
                                    guard.axes[3] = norm;
                                    changed = true;
                                }
                            }
                            0x02 | 0x0a => {
                                // ABS_Z / ABS_GAS (LT)
                                let trig = if value > 255 {
                                    (value as f32 / 1023.0).clamp(0.0, 1.0)
                                } else {
                                    (value as f32 / 255.0).clamp(0.0, 1.0)
                                };
                                if (guard.buttons[6] - trig).abs() > 0.05 {
                                    guard.buttons[6] = trig;
                                    changed = true;
                                }
                            }
                            0x05 | 0x09 => {
                                // ABS_RZ / ABS_BRAKE (RT)
                                let trig = if value > 255 {
                                    (value as f32 / 1023.0).clamp(0.0, 1.0)
                                } else {
                                    (value as f32 / 255.0).clamp(0.0, 1.0)
                                };
                                if (guard.buttons[7] - trig).abs() > 0.05 {
                                    guard.buttons[7] = trig;
                                    changed = true;
                                }
                            }
                            0x10 => {
                                // ABS_HAT0X (DPad Left/Right)
                                let left = if value < 0 { 1.0 } else { 0.0 };
                                let right = if value > 0 { 1.0 } else { 0.0 };
                                if guard.buttons[14] != left || guard.buttons[15] != right {
                                    guard.buttons[14] = left;
                                    guard.buttons[15] = right;
                                    changed = true;
                                }
                            }
                            0x11 => {
                                // ABS_HAT0Y (DPad Up/Down)
                                let up = if value < 0 { 1.0 } else { 0.0 };
                                let down = if value > 0 { 1.0 } else { 0.0 };
                                if guard.buttons[12] != up || guard.buttons[13] != down {
                                    guard.buttons[12] = up;
                                    guard.buttons[13] = down;
                                    changed = true;
                                }
                            }
                            _ => {}
                        }
                    }

                    if changed {
                        guard.timestamp_ms = now_ms();
                        on_emit(guard.clone());
                    }
                }
            }
        }

        std::thread::sleep(std::time::Duration::from_secs(1));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_filesystem_roots_core_returns_valid_roots() {
        let roots = get_filesystem_roots_core().expect("roots should succeed");
        assert!(!roots.is_empty(), "Must return at least one filesystem root");
        for r in &roots {
            assert!(!r.name.is_empty());
            assert!(!r.path.is_empty());
        }
    }

    #[test]
    fn test_list_directory_entries_core_filters_and_sorts() {
        let temp_dir = std::env::temp_dir().join(format!(
            "openplay_test_file_picker_{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(temp_dir.join("BetaFolder")).unwrap();
        std::fs::create_dir_all(temp_dir.join("AlphaFolder")).unwrap();
        std::fs::create_dir_all(temp_dir.join(".HiddenFolder")).unwrap();
        std::fs::write(temp_dir.join("game.AppImage"), b"binary").unwrap();
        std::fs::write(temp_dir.join("readme.txt"), b"notes").unwrap();
        std::fs::write(temp_dir.join("theme.zip"), b"zip").unwrap();

        // 1. Directory-only mode without hidden files
        let dir_only = list_directory_entries_core(
            Some(temp_dir.to_string_lossy().to_string()),
            false,
            None,
            false,
        )
        .expect("list dirs");
        assert_eq!(dir_only.entries.len(), 2);
        assert_eq!(dir_only.entries[0].name, "AlphaFolder");
        assert_eq!(dir_only.entries[1].name, "BetaFolder");

        // 2. Include hidden folders
        let with_hidden = list_directory_entries_core(
            Some(temp_dir.to_string_lossy().to_string()),
            false,
            None,
            true,
        )
        .expect("list dirs with hidden");
        assert_eq!(with_hidden.entries.len(), 3);

        // 3. Filter by .zip
        let zip_listing = list_directory_entries_core(
            Some(temp_dir.to_string_lossy().to_string()),
            true,
            Some(".zip".to_string()),
            false,
        )
        .expect("list zip");
        // 2 folders + 1 zip file
        assert_eq!(zip_listing.entries.len(), 3);
        assert!(zip_listing.entries.iter().any(|e| e.name == "theme.zip"));
        assert!(!zip_listing.entries.iter().any(|e| e.name == "readme.txt"));

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}

