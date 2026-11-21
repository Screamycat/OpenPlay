use crate::db::Database;
use crate::models::{Game, ResolvedSavePath};
use std::path::{Path, PathBuf};

/// Resolves save and config directories for emulated titles across Windows and Linux.
pub fn resolve_emulator_paths(db: &Database, game: &Game) -> Vec<ResolvedSavePath> {
    let mut results = Vec::new();
    let is_emu = game.source.eq_ignore_ascii_case("Emulation")
        || game.id.starts_with("rom_")
        || game.emulator_id.is_some();

    if !is_emu {
        return results;
    }

    let consoles = db.get_configured_consoles().unwrap_or_default();
    let profiles = db.get_emulator_profiles().unwrap_or_default();

    let conf = game
        .emulator_id
        .as_deref()
        .and_then(|eid| consoles.iter().find(|c| c.id == eid));
    let prof = game
        .emulator_id
        .as_deref()
        .and_then(|eid| profiles.iter().find(|p| p.id == eid));

    let emu_hint = conf
        .map(|c| format!("{} {}", c.emulator_name, c.emulator_type))
        .or_else(|| prof.map(|p| format!("{} {}", p.name, p.emulator_type)))
        .or_else(|| game.emulator_id.clone())
        .unwrap_or_default()
        .to_lowercase();

    let emu_exe_dir = conf
        .map(|c| PathBuf::from(&c.executable_path))
        .or_else(|| prof.map(|p| PathBuf::from(&p.executable_path)))
        .and_then(|p| p.parent().map(|par| par.to_path_buf()));

    let rom_path = game.executable_path.as_deref().map(PathBuf::from);
    let platform_lower = game.platforms.join(" ").to_lowercase();

    let mut save_candidates: Vec<(PathBuf, String)> = Vec::new();
    let mut config_candidates: Vec<(PathBuf, String)> = Vec::new();

    if emu_hint.contains("retroarch") {
        if let Some(ref exe_dir) = emu_exe_dir {
            save_candidates.push((exe_dir.join("saves"), "RetroArch Saves".to_string()));
            config_candidates.push((exe_dir.join("config"), "RetroArch Config".to_string()));
        }
        if let Some(home) = dirs::home_dir() {
            save_candidates.push((home.join(".config/retroarch/saves"), "RetroArch Saves".to_string()));
            save_candidates.push((
                home.join(".var/app/org.libretro.RetroArch/config/retroarch/saves"),
                "RetroArch Flatpak Saves".to_string(),
            ));
            config_candidates.push((home.join(".config/retroarch"), "RetroArch Config".to_string()));
        }
        if let Some(appdata) = dirs::config_dir() {
            save_candidates.push((appdata.join("RetroArch").join("saves"), "RetroArch Saves".to_string()));
            config_candidates.push((appdata.join("RetroArch"), "RetroArch Config".to_string()));
        }
    }

    if emu_hint.contains("dolphin") || platform_lower.contains("gamecube") || platform_lower.contains("wii") && !platform_lower.contains("wii u") {
        if let Some(home) = dirs::home_dir() {
            let linux_base = home.join(".local/share/dolphin-emu");
            let flatpak_base = home.join(".var/app/org.DolphinEmu.dolphin-emu/data/dolphin-emu");
            for base in [&linux_base, &flatpak_base] {
                if platform_lower.contains("wii") {
                    save_candidates.push((base.join("Wii"), "Dolphin Wii NAND Saves".to_string()));
                } else {
                    save_candidates.push((base.join("GC"), "Dolphin GameCube Memory Cards".to_string()));
                }
            }
            config_candidates.push((home.join(".config/dolphin-emu"), "Dolphin Config".to_string()));
        }
        if let Some(docs) = dirs::document_dir() {
            let doc_base = docs.join("Dolphin Emulator");
            if platform_lower.contains("wii") {
                save_candidates.push((doc_base.join("Wii"), "Dolphin Wii NAND Saves".to_string()));
            } else {
                save_candidates.push((doc_base.join("GC"), "Dolphin GameCube Memory Cards".to_string()));
            }
            config_candidates.push((doc_base.join("Config"), "Dolphin Config".to_string()));
        }
    }

    if emu_hint.contains("pcsx2") || platform_lower.contains("playstation 2") || platform_lower.contains("ps2") {
        if let Some(ref exe_dir) = emu_exe_dir {
            save_candidates.push((exe_dir.join("memcards"), "PCSX2 Memory Cards".to_string()));
            config_candidates.push((exe_dir.join("inis"), "PCSX2 Config".to_string()));
        }
        if let Some(home) = dirs::home_dir() {
            save_candidates.push((home.join(".config/PCSX2/memcards"), "PCSX2 Memory Cards".to_string()));
            save_candidates.push((
                home.join(".var/app/net.pcsx2.PCSX2/config/PCSX2/memcards"),
                "PCSX2 Flatpak Memory Cards".to_string(),
            ));
            config_candidates.push((home.join(".config/PCSX2/inis"), "PCSX2 Config".to_string()));
        }
        if let Some(docs) = dirs::document_dir() {
            save_candidates.push((docs.join("PCSX2/memcards"), "PCSX2 Memory Cards".to_string()));
            config_candidates.push((docs.join("PCSX2/inis"), "PCSX2 Config".to_string()));
        }
    }

    if emu_hint.contains("duckstation") || platform_lower == "sony playstation" || platform_lower == "playstation" {
        if let Some(home) = dirs::home_dir() {
            save_candidates.push((home.join(".local/share/duckstation/memcards"), "DuckStation Memory Cards".to_string()));
            save_candidates.push((
                home.join(".var/app/org.duckstation.DuckStation/data/duckstation/memcards"),
                "DuckStation Flatpak Memory Cards".to_string(),
            ));
            config_candidates.push((home.join(".local/share/duckstation"), "DuckStation Config".to_string()));
        }
        if let Some(docs) = dirs::document_dir() {
            save_candidates.push((docs.join("DuckStation/memcards"), "DuckStation Memory Cards".to_string()));
            config_candidates.push((docs.join("DuckStation"), "DuckStation Config".to_string()));
        }
    }

    if emu_hint.contains("ppsspp") || platform_lower.contains("psp") || platform_lower.contains("portable") {
        if let Some(ref exe_dir) = emu_exe_dir {
            save_candidates.push((exe_dir.join("memstick/PSP/SAVEDATA"), "PPSSPP Save Data".to_string()));
        }
        if let Some(home) = dirs::home_dir() {
            save_candidates.push((home.join(".config/ppsspp/PSP/SAVEDATA"), "PPSSPP Save Data".to_string()));
            save_candidates.push((
                home.join(".var/app/org.ppsspp.PPSSPP/config/ppsspp/PSP/SAVEDATA"),
                "PPSSPP Flatpak Save Data".to_string(),
            ));
            config_candidates.push((home.join(".config/ppsspp/PSP/SYSTEM"), "PPSSPP Config".to_string()));
        }
        if let Some(docs) = dirs::document_dir() {
            save_candidates.push((docs.join("PPSSPP/PSP/SAVEDATA"), "PPSSPP Save Data".to_string()));
        }
    }

    if emu_hint.contains("rpcs3") || platform_lower.contains("playstation 3") || platform_lower.contains("ps3") {
        if let Some(ref exe_dir) = emu_exe_dir {
            save_candidates.push((exe_dir.join("dev_hdd0/home/00000001/savedata"), "RPCS3 Save Data".to_string()));
        }
        if let Some(home) = dirs::home_dir() {
            save_candidates.push((home.join(".config/rpcs3/dev_hdd0/home/00000001/savedata"), "RPCS3 Save Data".to_string()));
            config_candidates.push((home.join(".config/rpcs3"), "RPCS3 Config".to_string()));
        }
    }

    if emu_hint.contains("cemu") || platform_lower.contains("wii u") {
        if let Some(ref exe_dir) = emu_exe_dir {
            save_candidates.push((exe_dir.join("mlc01/usr/save"), "Cemu Save Data".to_string()));
        }
        if let Some(home) = dirs::home_dir() {
            save_candidates.push((home.join(".local/share/Cemu/mlc01/usr/save"), "Cemu Save Data".to_string()));
            config_candidates.push((home.join(".config/Cemu"), "Cemu Config".to_string()));
        }
    }

    if emu_hint.contains("ryujinx") || platform_lower.contains("switch") {
        if let Some(home) = dirs::home_dir() {
            save_candidates.push((home.join(".config/Ryujinx/bis/user/save"), "Ryujinx NAND Saves".to_string()));
            config_candidates.push((home.join(".config/Ryujinx"), "Ryujinx Config".to_string()));
        }
        if let Some(appdata) = dirs::config_dir() {
            save_candidates.push((appdata.join("Ryujinx/bis/user/save"), "Ryujinx NAND Saves".to_string()));
            config_candidates.push((appdata.join("Ryujinx"), "Ryujinx Config".to_string()));
        }
    }

    if emu_hint.contains("citra") || emu_hint.contains("lime3ds") || platform_lower.contains("3ds") {
        if let Some(home) = dirs::home_dir() {
            save_candidates.push((home.join(".local/share/citra-emu/sdmc"), "Citra SDMC Saves".to_string()));
            save_candidates.push((home.join(".local/share/lime3ds-emu/sdmc"), "Lime3DS SDMC Saves".to_string()));
            config_candidates.push((home.join(".config/citra-emu"), "Citra Config".to_string()));
        }
        if let Some(appdata) = dirs::config_dir() {
            save_candidates.push((appdata.join("Citra/sdmc"), "Citra SDMC Saves".to_string()));
            save_candidates.push((appdata.join("Lime3DS/sdmc"), "Lime3DS SDMC Saves".to_string()));
        }
    }

    if emu_hint.contains("mgba") || platform_lower.contains("game boy") {
        if let Some(ref rom) = rom_path {
            if let (Some(parent), Some(stem)) = (rom.parent(), rom.file_stem().and_then(|s| s.to_str())) {
                let sav_file = parent.join(format!("{}.sav", stem));
                if sav_file.exists() {
                    save_candidates.push((sav_file, "Adjacent .sav file".to_string()));
                }
            }
        }
        if let Some(home) = dirs::home_dir() {
            config_candidates.push((home.join(".config/mgba"), "mGBA Config".to_string()));
        }
        if let Some(appdata) = dirs::config_dir() {
            config_candidates.push((appdata.join("mGBA"), "mGBA Config".to_string()));
        }
    }

    // Prioritize existing paths first, otherwise preserve top predicted path
    push_candidate_list(&save_candidates, "save", "emulator", &mut results);
    push_candidate_list(&config_candidates, "config", "emulator", &mut results);

    results
}

fn push_candidate_list(
    candidates: &[(PathBuf, String)],
    kind: &str,
    origin: &str,
    out: &mut Vec<ResolvedSavePath>,
) {
    let mut existing = Vec::new();
    let mut predicted = Vec::new();

    for (path, hint) in candidates {
        let norm_str = path.to_string_lossy().to_string();
        if existing.iter().any(|p: &ResolvedSavePath| p.path.eq_ignore_ascii_case(&norm_str))
            || predicted.iter().any(|p: &ResolvedSavePath| p.path.eq_ignore_ascii_case(&norm_str))
        {
            continue;
        }
        let exists = path.exists();
        let (file_count, total_bytes) = if exists {
            super::measure_path_stats(path)
        } else {
            (0, 0)
        };
        let entry = ResolvedSavePath {
            path: norm_str,
            kind: kind.to_string(),
            origin: origin.to_string(),
            exists,
            file_count,
            total_bytes,
            template_hint: Some(hint.clone()),
        };
        if exists {
            existing.push(entry);
        } else {
            predicted.push(entry);
        }
    }

    if !existing.is_empty() {
        out.extend(existing);
    } else if let Some(first) = predicted.into_iter().next() {
        out.push(first);
    }
}

#[allow(dead_code)]
fn _unused_path_ref(_: &Path) {}
