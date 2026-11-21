use crate::launcher::LinuxWineEngine;
use crate::models::{Game, ResolvedSavePath, SaveLocationRule, SavePathKind, SaveRuleOs};
use crate::scanner::steam::SteamScanner;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Default)]
pub struct PrefixRoots {
    pub origin: String, // "pcgamingwiki" | "proton_prefix" | "wine_prefix"
    pub app_data: Option<PathBuf>,
    pub local_app_data: Option<PathBuf>,
    pub local_low: Option<PathBuf>,
    pub user_profile: Option<PathBuf>,
    pub documents: Option<PathBuf>,
    pub saved_games: Option<PathBuf>,
    pub program_data: Option<PathBuf>,
    pub public_dir: Option<PathBuf>,
    pub program_files: Option<PathBuf>,
    pub program_files_x86: Option<PathBuf>,
    pub ubisoft_dir: Option<PathBuf>,
}

#[derive(Debug, Clone, Default)]
pub struct ResolutionEnv {
    pub home: Option<PathBuf>,
    pub xdg_data: Option<PathBuf>,
    pub xdg_config: Option<PathBuf>,
    pub steam_dir: Option<PathBuf>,
    pub steam_userdata_dirs: Vec<PathBuf>,
    pub game_install_dir: Option<PathBuf>,
    pub windows_roots: Vec<PrefixRoots>,
    pub is_linux: bool,
    pub is_windows: bool,
    pub is_macos: bool,
}

impl ResolutionEnv {
    pub fn detect_for_game(game: &Game) -> Self {
        let mut env = Self {
            home: dirs::home_dir(),
            xdg_data: dirs::data_dir(),
            xdg_config: dirs::config_dir(),
            steam_dir: SteamScanner::find_steam_install_dir(),
            steam_userdata_dirs: Vec::new(),
            game_install_dir: game
                .install_directory
                .as_deref()
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .map(PathBuf::from),
            windows_roots: Vec::new(),
            is_linux: cfg!(target_os = "linux"),
            is_windows: cfg!(target_os = "windows"),
            is_macos: cfg!(target_os = "macos"),
        };

        if let Some(ref sdir) = env.steam_dir {
            let ud = sdir.join("userdata");
            if ud.is_dir() {
                if let Ok(entries) = std::fs::read_dir(&ud) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        if p.is_dir() {
                            if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
                                if name.chars().all(|c| c.is_ascii_digit()) && name != "0" {
                                    env.steam_userdata_dirs.push(p);
                                }
                            }
                        }
                    }
                }
            }
        }

        #[cfg(target_os = "windows")]
        {
            let user_profile = dirs::home_dir();
            let app_data = dirs::config_dir();
            let local_app_data = dirs::data_local_dir();
            let local_low = user_profile
                .as_ref()
                .map(|h| h.join("AppData").join("LocalLow"));
            let documents = dirs::document_dir()
                .or_else(|| user_profile.as_ref().map(|h| h.join("Documents")));
            let saved_games = user_profile.as_ref().map(|h| h.join("Saved Games"));
            let program_data = std::env::var_os("PROGRAMDATA").map(PathBuf::from);
            let public_dir = std::env::var_os("PUBLIC").map(PathBuf::from);
            let program_files = std::env::var_os("PROGRAMFILES").map(PathBuf::from);
            let program_files_x86 = std::env::var_os("PROGRAMFILES(X86)")
                .map(PathBuf::from)
                .or_else(|| Some(PathBuf::from(r"C:\Program Files (x86)")));
            let ubisoft_dir = program_files_x86
                .as_ref()
                .map(|p| p.join("Ubisoft").join("Ubisoft Game Launcher"))
                .filter(|p| p.exists())
                .or_else(|| {
                    program_files
                        .as_ref()
                        .map(|p| p.join("Ubisoft").join("Ubisoft Game Launcher"))
                        .filter(|p| p.exists())
                });

            env.windows_roots.push(PrefixRoots {
                origin: "pcgamingwiki".to_string(),
                app_data,
                local_app_data,
                local_low,
                user_profile,
                documents,
                saved_games,
                program_data,
                public_dir,
                program_files,
                program_files_x86,
                ubisoft_dir,
            });
        }

        #[cfg(target_os = "linux")]
        {
            let mut seen_pfx: HashSet<PathBuf> = HashSet::new();

            // 1. Steam Proton compatdata prefix (via libraryfolders.vdf AND directly from install_directory)
            if game.source.eq_ignore_ascii_case("Steam") {
                if let Some(ref appid) = game.source_id {
                    let appid_clean = appid.trim();
                    if !appid_clean.is_empty() && appid_clean.chars().all(|c| c.is_ascii_digit()) {
                        if let Some(ref sdir) = env.steam_dir {
                            for lib in SteamScanner::get_library_folders(sdir) {
                                let pfx = lib
                                    .join("steamapps")
                                    .join("compatdata")
                                    .join(appid_clean)
                                    .join("pfx");
                                if seen_pfx.insert(pfx.clone()) {
                                    if let Some(roots) = prefix_roots_from_wine_pfx(&pfx, "proton_prefix") {
                                        env.windows_roots.push(roots);
                                    }
                                }
                            }
                        }

                        // Direct fallback relative to install_directory (.../steamapps/common/<Game>)
                        if let Some(ref inst) = env.game_install_dir {
                            for anc in inst.ancestors() {
                                if anc.file_name().and_then(|n| n.to_str()) == Some("steamapps") {
                                    let pfx = anc.join("compatdata").join(appid_clean).join("pfx");
                                    if seen_pfx.insert(pfx.clone()) {
                                        if let Some(roots) = prefix_roots_from_wine_pfx(&pfx, "proton_prefix") {
                                            env.windows_roots.push(roots);
                                        }
                                    }
                                    break;
                                }
                            }
                        }
                    }
                }
            }

            // 2. OpenPlay managed Wine/Proton prefix for Windows binaries on Linux
            let openplay_pfx = LinuxWineEngine::get_game_prefix_dir(&game.id);
            if openplay_pfx.is_dir() {
                for cand in [openplay_pfx.join("pfx"), openplay_pfx] {
                    if seen_pfx.insert(cand.clone()) {
                        if let Some(roots) = prefix_roots_from_wine_pfx(&cand, "wine_prefix") {
                            env.windows_roots.push(roots);
                        }
                    }
                }
            }

            // 3. Any ancestor Wine/Proton/Heroic/Bottles prefix containing install_directory or executable_path
            for p_opt in [
                env.game_install_dir.as_deref(),
                game.executable_path.as_deref().map(Path::new),
            ] {
                if let Some(path) = p_opt {
                    for anc in path.ancestors() {
                        if anc.file_name().and_then(|n| n.to_str()) == Some("drive_c") {
                            if let Some(pfx_parent) = anc.parent() {
                                let pfx_buf = pfx_parent.to_path_buf();
                                if seen_pfx.insert(pfx_buf.clone()) {
                                    if let Some(roots) = prefix_roots_from_wine_pfx(&pfx_buf, "wine_prefix") {
                                        env.windows_roots.push(roots);
                                    }
                                }
                            }
                            break;
                        }
                    }
                }
            }

            // 4. Heroic / Lutris external Wine/Proton prefixes on Linux (where game files sit outside drive_c)
            for pfx in discover_external_linux_prefixes(game, env.home.as_deref(), env.xdg_config.as_deref()) {
                for cand in [pfx.join("pfx"), pfx] {
                    if seen_pfx.insert(cand.clone()) {
                        if let Some(roots) = prefix_roots_from_wine_pfx(&cand, "wine_prefix") {
                            env.windows_roots.push(roots);
                        }
                    }
                }
            }
        }

        env
    }
}

#[cfg(target_os = "linux")]
fn discover_external_linux_prefixes(
    game: &Game,
    home: Option<&Path>,
    xdg_config: Option<&Path>,
) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let title_norm = alnum_norm_local(&game.title);

    // Check Heroic GamesConfig JSON if source_id is present (e.g. Epic app name or GOG id)
    if let Some(ref sid) = game.source_id {
        let sid_clean = sid.trim();
        if !sid_clean.is_empty() {
            let mut heroic_cfg_dirs = Vec::new();
            if let Some(cfg) = xdg_config {
                heroic_cfg_dirs.push(cfg.join("heroic").join("GamesConfig"));
            }
            if let Some(h) = home {
                heroic_cfg_dirs.push(
                    h.join(".var/app/com.heroicgameslauncher.hgl/config/heroic/GamesConfig"),
                );
            }
            for dir in heroic_cfg_dirs {
                let cfg_file = dir.join(format!("{}.json", sid_clean));
                if let Ok(content) = std::fs::read_to_string(&cfg_file) {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                        if let Some(pfx_str) = json
                            .get(sid_clean)
                            .and_then(|v| v.get("winePrefix"))
                            .and_then(|v| v.as_str())
                        {
                            let pb = PathBuf::from(pfx_str);
                            if pb.is_dir() {
                                out.push(pb);
                            }
                        }
                    }
                }
            }
        }
    }

    // Check common ~/Games/Heroic/Prefixes/<Game> and ~/Games/<slug> (Lutris)
    if let Some(h) = home {
        for base in [
            h.join("Games").join("Heroic").join("Prefixes"),
            h.join("Games"),
        ] {
            if let Ok(entries) = std::fs::read_dir(&base) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_dir() && (p.join("drive_c").is_dir() || p.join("pfx/drive_c").is_dir()) {
                        let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
                        if !title_norm.is_empty() && alnum_norm_local(name) == title_norm {
                            out.push(p);
                        }
                    }
                }
            }
        }
    }

    out
}

pub fn prefix_roots_from_wine_pfx(pfx_dir: &Path, origin: &str) -> Option<PrefixRoots> {
    let drive_c = pfx_dir.join("drive_c");
    if !drive_c.is_dir() {
        return None;
    }

    let users_dir = drive_c.join("users");
    let mut candidate_user_dir = users_dir.join("steamuser");
    if !candidate_user_dir.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&users_dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    let name = p
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("")
                        .to_lowercase();
                    if name != "public" && name != "default" {
                        candidate_user_dir = p;
                        break;
                    }
                }
            }
        }
    }

    if !candidate_user_dir.is_dir() {
        return None;
    }

    let program_files = drive_c.join("Program Files");
    let program_files_x86 = drive_c.join("Program Files (x86)");
    let ubisoft_x86 = program_files_x86.join("Ubisoft").join("Ubisoft Game Launcher");
    let ubisoft_64 = program_files.join("Ubisoft").join("Ubisoft Game Launcher");
    let ubisoft_dir = if ubisoft_x86.exists() {
        Some(ubisoft_x86)
    } else if ubisoft_64.exists() {
        Some(ubisoft_64)
    } else {
        Some(ubisoft_x86)
    };

    Some(PrefixRoots {
        origin: origin.to_string(),
        app_data: Some(candidate_user_dir.join("AppData").join("Roaming")),
        local_app_data: Some(candidate_user_dir.join("AppData").join("Local")),
        local_low: Some(candidate_user_dir.join("AppData").join("LocalLow")),
        user_profile: Some(candidate_user_dir.clone()),
        documents: Some(candidate_user_dir.join("Documents")),
        saved_games: Some(candidate_user_dir.join("Saved Games")),
        program_data: Some(drive_c.join("ProgramData")),
        public_dir: Some(users_dir.join("Public")),
        program_files: Some(program_files),
        program_files_x86: Some(program_files_x86),
        ubisoft_dir,
    })
}

/// Expands PCGamingWiki rules + built-in Steam userdata + local heuristics into concrete paths.
pub fn resolve_paths_for_game(
    game: &Game,
    rules: &[SaveLocationRule],
    env: &ResolutionEnv,
) -> Vec<ResolvedSavePath> {
    let mut raw_candidates: Vec<(PathBuf, String, String, String, i32)> = Vec::new(); // (path, kind, origin, hint, priority)

    let is_steam = game.source.eq_ignore_ascii_case("Steam");

    for rule in rules {
        let kind_str = match rule.kind {
            SavePathKind::Save => "save",
            SavePathKind::Config => "config",
        };
        let label_lower = rule.source_label.to_lowercase();
        let store_prio = if is_steam && label_lower.contains("steam") {
            10
        } else if label_lower.contains(&game.source.to_lowercase()) {
            10
        } else {
            0
        };

        // Collapse trailing wildcard file patterns (e.g. `...\Hollow Knight\*.dat`) to parent folder
        let cleaned_template = collapse_trailing_wildcard_filename(&rule.raw_template);

        match rule.os {
            SaveRuleOs::SteamCloud => {
                for p in expand_steam_template(&cleaned_template, env) {
                    raw_candidates.push((
                        p,
                        kind_str.to_string(),
                        "steam_userdata".to_string(),
                        rule.raw_template.clone(),
                        store_prio + 5,
                    ));
                }
            }
            SaveRuleOs::Linux => {
                if env.is_linux {
                    for p in expand_unix_template(&cleaned_template, env) {
                        raw_candidates.push((
                            p,
                            kind_str.to_string(),
                            "pcgamingwiki".to_string(),
                            rule.raw_template.clone(),
                            store_prio + 4,
                        ));
                    }
                }
            }
            SaveRuleOs::Macos => {
                if env.is_macos {
                    for p in expand_unix_template(&cleaned_template, env) {
                        raw_candidates.push((
                            p,
                            kind_str.to_string(),
                            "pcgamingwiki".to_string(),
                            rule.raw_template.clone(),
                            store_prio + 4,
                        ));
                    }
                }
            }
            SaveRuleOs::Windows | SaveRuleOs::Any => {
                if cleaned_template.starts_with("<game>") {
                    if let Some(ref gdir) = env.game_install_dir {
                        let rest = cleaned_template
                            .strip_prefix("<game>")
                            .unwrap_or("")
                            .replace("<uid>", "*");
                        for p in expand_wildcards(join_platform_segments(gdir, &rest)) {
                            raw_candidates.push((
                                p,
                                kind_str.to_string(),
                                "pcgamingwiki".to_string(),
                                rule.raw_template.clone(),
                                store_prio + 2,
                            ));
                        }
                    }
                } else if cleaned_template.starts_with("<steam>") {
                    for p in expand_steam_template(&cleaned_template, env) {
                        raw_candidates.push((
                            p,
                            kind_str.to_string(),
                            "steam_userdata".to_string(),
                            rule.raw_template.clone(),
                            store_prio + 3,
                        ));
                    }
                } else {
                    for win in &env.windows_roots {
                        for p in expand_windows_template(&cleaned_template, env, win) {
                            raw_candidates.push((
                                p,
                                kind_str.to_string(),
                                win.origin.clone(),
                                rule.raw_template.clone(),
                                store_prio,
                            ));
                        }
                    }
                    if rule.os == SaveRuleOs::Any && !env.is_windows {
                        for p in expand_unix_template(&cleaned_template, env) {
                            raw_candidates.push((
                                p,
                                kind_str.to_string(),
                                "pcgamingwiki".to_string(),
                                rule.raw_template.clone(),
                                store_prio,
                            ));
                        }
                    }
                }
            }
        }
    }

    // Built-in Steam userdata/<uid>/<appid>/remote check even if PCGW lookup failed or was offline
    if is_steam {
        if let Some(ref appid) = game.source_id {
            let aid = appid.trim();
            if !aid.is_empty() && aid.chars().all(|c| c.is_ascii_digit()) {
                for ud in &env.steam_userdata_dirs {
                    let remote = ud.join(aid).join("remote");
                    if remote.exists() {
                        raw_candidates.push((
                            remote,
                            "save".to_string(),
                            "steam_userdata".to_string(),
                            format!("<steam>/userdata/<uid>/{}/remote", aid),
                            8,
                        ));
                    }
                }
            }
        }
    }

    // Offline heuristics inside game installation folder & common engine folders
    add_offline_heuristics(game, env, &mut raw_candidates);

    finalize_resolved_paths(raw_candidates, env)
}

fn collapse_trailing_wildcard_filename(template: &str) -> String {
    let trimmed = template.trim().trim_end_matches(['\\', '/']);
    let last_sep = trimmed.rfind(['\\', '/']);
    if let Some(idx) = last_sep {
        let leaf = &trimmed[idx + 1..];
        if leaf.contains('*') || leaf.contains('?') {
            return trimmed[..idx].to_string();
        }
    }
    trimmed.to_string()
}

fn expand_steam_template(template: &str, env: &ResolutionEnv) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let Some(ref steam_dir) = env.steam_dir else {
        return out;
    };

    if template.contains("<uid>") {
        for ud in &env.steam_userdata_dirs {
            let uid = ud.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if uid.is_empty() {
                continue;
            }
            let replaced = template
                .replace("<steam>", &steam_dir.to_string_lossy())
                .replace("<uid>", uid);
            out.extend(expand_wildcards(join_platform_segments(Path::new(""), &replaced)));
        }
    } else {
        let replaced = template.replace("<steam>", &steam_dir.to_string_lossy());
        out.extend(expand_wildcards(join_platform_segments(Path::new(""), &replaced)));
    }
    out
}

fn expand_unix_template(template: &str, env: &ResolutionEnv) -> Vec<PathBuf> {
    let mut s = template.to_string();
    if s.contains("<home>") {
        let Some(ref h) = env.home else { return Vec::new() };
        s = s.replace("<home>", &h.to_string_lossy());
    }
    if s.contains("<osxHome>") {
        let Some(ref h) = env.home else { return Vec::new() };
        s = s.replace("<osxHome>", &h.to_string_lossy());
    }
    if s.contains("<xdgData>") {
        let Some(ref d) = env.xdg_data else { return Vec::new() };
        s = s.replace("<xdgData>", &d.to_string_lossy());
    }
    if s.contains("<xdgConfig>") {
        let Some(ref c) = env.xdg_config else { return Vec::new() };
        s = s.replace("<xdgConfig>", &c.to_string_lossy());
    }
    if s.contains("<game>") {
        let Some(ref g) = env.game_install_dir else { return Vec::new() };
        s = s.replace("<game>", &g.to_string_lossy());
    }
    if s.contains("<steam>") {
        return expand_steam_template(&s, env);
    }
    s = s.replace("<uid>", "*");
    if s.contains('<') {
        return Vec::new();
    }
    expand_wildcards(PathBuf::from(s))
}

fn expand_windows_template(
    template: &str,
    env: &ResolutionEnv,
    win: &PrefixRoots,
) -> Vec<PathBuf> {
    let mut base_and_rest: Option<(&Path, &str)> = None;

    let tokens: [(&str, Option<&PathBuf>); 11] = [
        ("<winAppData>", win.app_data.as_ref()),
        ("<winLocalAppData>", win.local_app_data.as_ref()),
        ("<winLocalLow>", win.local_low.as_ref()),
        ("<winDocuments>", win.documents.as_ref()),
        ("<winSavedGames>", win.saved_games.as_ref()),
        ("<winUserProfile>", win.user_profile.as_ref()),
        ("<winProgramData>", win.program_data.as_ref()),
        ("<winPublic>", win.public_dir.as_ref()),
        ("<winProgramFilesX86>", win.program_files_x86.as_ref()),
        ("<winProgramFiles>", win.program_files.as_ref()),
        ("<ubisoft>", win.ubisoft_dir.as_ref()),
    ];

    for (tok, root_opt) in tokens {
        if let Some(rest) = template.strip_prefix(tok) {
            let Some(root) = root_opt else { return Vec::new() };
            base_and_rest = Some((root.as_path(), rest));
            break;
        }
    }

    if let Some((base, rest)) = base_and_rest {
        let expanded_rest = rest.replace("<uid>", "*");
        let full = join_platform_segments(base, &expanded_rest);
        return expand_wildcards(full);
    }

    if let Some(rest) = template.strip_prefix("<game>") {
        let Some(ref gdir) = env.game_install_dir else { return Vec::new() };
        let expanded_rest = rest.replace("<uid>", "*");
        return expand_wildcards(join_platform_segments(gdir, &expanded_rest));
    }

    if template.starts_with("<steam>") {
        return expand_steam_template(template, env);
    }

    Vec::new()
}

fn join_platform_segments(base: &Path, rest: &str) -> PathBuf {
    let trimmed = rest.trim_start_matches(['\\', '/']);
    if trimmed.is_empty() {
        return base.to_path_buf();
    }
    if base.as_os_str().is_empty() && rest.starts_with('/') {
        let mut p = PathBuf::from("/");
        for seg in trimmed.split(['\\', '/']).filter(|s| !s.is_empty()) {
            p.push(seg);
        }
        return p;
    }
    let mut out = base.to_path_buf();
    for seg in trimmed.split(['\\', '/']).filter(|s| !s.is_empty()) {
        out.push(seg);
    }
    out
}

fn alnum_norm_local(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric())
        .collect()
}

/// On case-sensitive filesystems (Linux), maps an exact template path to a case-insensitive
/// match on disk when exact case fails (e.g. `Cult Of The Lamb` -> `Cult of the Lamb`).
fn resolve_case_insensitive_path(path: PathBuf) -> PathBuf {
    if path.exists() {
        return path;
    }

    let comps: Vec<String> = path
        .components()
        .map(|c| c.as_os_str().to_string_lossy().to_string())
        .collect();
    if comps.is_empty() {
        return path;
    }

    let mut cur = PathBuf::from(&comps[0]);
    for comp in comps.into_iter().skip(1) {
        let exact = cur.join(&comp);
        if exact.exists() {
            cur = exact;
            continue;
        }
        let mut matched = None;
        if let Ok(entries) = std::fs::read_dir(&cur) {
            for entry in entries.flatten() {
                if let Some(name) = entry.file_name().to_str() {
                    if name.eq_ignore_ascii_case(&comp) {
                        matched = Some(entry.path());
                        break;
                    }
                }
            }
        }
        if let Some(m) = matched {
            cur = m;
        } else {
            cur = exact;
        }
    }
    cur
}

fn expand_wildcards(path: PathBuf) -> Vec<PathBuf> {
    let raw = path.to_string_lossy();
    if !raw.contains('*') && !raw.contains("<uid>") {
        return vec![resolve_case_insensitive_path(path)];
    }

    let comps: Vec<String> = path
        .components()
        .map(|c| c.as_os_str().to_string_lossy().to_string())
        .collect();

    let mut current: Vec<PathBuf> = vec![PathBuf::new()];
    for comp in comps {
        let mut next = Vec::new();
        if comp.contains('*') || comp == "<uid>" {
            let pattern = comp.replace("<uid>", "*");
            for parent in &current {
                let resolved_parent = resolve_case_insensitive_path(parent.clone());
                if let Ok(entries) = std::fs::read_dir(&resolved_parent) {
                    for entry in entries.flatten() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        if glob_match_simple(&pattern, &name) {
                            next.push(entry.path());
                        }
                    }
                }
            }
        } else {
            for parent in &current {
                next.push(resolve_case_insensitive_path(parent.join(&comp)));
            }
        }
        current = next;
        if current.is_empty() {
            break;
        }
    }
    current
}

fn glob_match_simple(pattern: &str, text: &str) -> bool {
    if pattern == "*" {
        return !text.is_empty();
    }
    if let Some((prefix, suffix)) = pattern.split_once('*') {
        let t = text.to_lowercase();
        t.starts_with(&prefix.to_lowercase()) && t.ends_with(&suffix.to_lowercase())
    } else {
        pattern.eq_ignore_ascii_case(text)
    }
}

fn match_normalized_child_dirs(
    parent: &Path,
    target_norm: &str,
    hint_prefix: &str,
    origin: &str,
    out: &mut Vec<(PathBuf, String, String, String, i32)>,
) {
    if target_norm.len() < 3 || !parent.is_dir() {
        return;
    }
    let Ok(entries) = std::fs::read_dir(parent) else {
        return;
    };
    for entry in entries.flatten() {
        let p = entry.path();
        if !p.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if alnum_norm_local(&name) == target_norm {
            out.push((
                p,
                "save".to_string(),
                origin.to_string(),
                format!("{}/{}", hint_prefix, name),
                2,
            ));
        }
    }
}

fn match_unity_root_dirs(
    unity_root: &Path,
    target_norm: &str,
    hint_prefix: &str,
    origin: &str,
    out: &mut Vec<(PathBuf, String, String, String, i32)>,
) {
    if target_norm.len() < 3 || !unity_root.is_dir() {
        return;
    }
    let Ok(studios) = std::fs::read_dir(unity_root) else {
        return;
    };
    for studio in studios.flatten() {
        let studio_path = studio.path();
        if !studio_path.is_dir() {
            continue;
        }
        let studio_name = studio.file_name().to_string_lossy().to_string();
        let Ok(games) = std::fs::read_dir(&studio_path) else {
            continue;
        };
        for g_entry in games.flatten() {
            let gp = g_entry.path();
            if !gp.is_dir() {
                continue;
            }
            let g_name = g_entry.file_name().to_string_lossy().to_string();
            if alnum_norm_local(&g_name) == target_norm {
                out.push((
                    gp,
                    "save".to_string(),
                    origin.to_string(),
                    format!("{}/{}/{}", hint_prefix, studio_name, g_name),
                    3,
                ));
            }
        }
    }
}

fn add_offline_heuristics(
    game: &Game,
    env: &ResolutionEnv,
    out: &mut Vec<(PathBuf, String, String, String, i32)>,
) {
    // 1. Portable save folders & Unreal Engine `<game>/*/Saved/SaveGames` inside install_directory
    if let Some(ref inst) = env.game_install_dir {
        if inst.is_dir() {
            for folder in ["saves", "save", "SaveData", "Saves", "SaveGames"] {
                let candidate = inst.join(folder);
                if candidate.is_dir() {
                    out.push((
                        candidate,
                        "save".to_string(),
                        "heuristic".to_string(),
                        format!("<game>/{}", folder),
                        1,
                    ));
                }
            }
            let direct_ue = inst.join("Saved").join("SaveGames");
            if direct_ue.is_dir() {
                out.push((
                    direct_ue,
                    "save".to_string(),
                    "heuristic".to_string(),
                    "<game>/Saved/SaveGames".to_string(),
                    2,
                ));
            }
            if let Ok(entries) = std::fs::read_dir(inst) {
                for entry in entries.flatten() {
                    let sub = entry.path();
                    if sub.is_dir() {
                        let sub_ue = sub.join("Saved").join("SaveGames");
                        if sub_ue.is_dir() {
                            let sname = entry.file_name().to_string_lossy().to_string();
                            out.push((
                                sub_ue,
                                "save".to_string(),
                                "heuristic".to_string(),
                                format!("<game>/{}/Saved/SaveGames", sname),
                                2,
                            ));
                        }
                    }
                }
            }
        }
    }

    let clean_title = game.title.trim();
    if clean_title.is_empty() {
        return;
    }
    let title_norm = alnum_norm_local(clean_title);

    // 2. Native Linux Unity saves (`~/.config/unity3d/<Studio>/<Title>`, resilient to studio name mismatch)
    if env.is_linux {
        if let Some(ref xdg_cfg) = env.xdg_config {
            match_unity_root_dirs(
                &xdg_cfg.join("unity3d"),
                &title_norm,
                "<xdgConfig>/unity3d",
                "heuristic",
                out,
            );
        }
    }

    // 3. Windows / Wine / Proton prefix Unity (`LocalLow/*/<Title>`) & AppData/Documents fuzzy title checks
    for win in &env.windows_roots {
        let origin_str = if win.origin == "pcgamingwiki" {
            "heuristic".to_string()
        } else {
            win.origin.clone()
        };

        if let Some(ref ll) = win.local_low {
            match_unity_root_dirs(ll, &title_norm, "<winLocalLow>", &origin_str, out);
        }
        if let Some(ref lad) = win.local_app_data {
            match_normalized_child_dirs(lad, &title_norm, "<winLocalAppData>", &origin_str, out);
        }
        if let Some(ref ad) = win.app_data {
            match_normalized_child_dirs(ad, &title_norm, "<winAppData>", &origin_str, out);
        }
        if let Some(ref docs) = win.documents {
            match_normalized_child_dirs(
                &docs.join("My Games"),
                &title_norm,
                "<winDocuments>/My Games",
                &origin_str,
                out,
            );
            match_normalized_child_dirs(docs, &title_norm, "<winDocuments>", &origin_str, out);
        }
        if let Some(ref sg) = win.saved_games {
            match_normalized_child_dirs(sg, &title_norm, "<winSavedGames>", &origin_str, out);
        }
    }
}

fn is_too_broad_root(path: &Path, env: &ResolutionEnv) -> bool {
    let norm = path.to_string_lossy().trim().to_lowercase();
    if norm.is_empty() || norm == "/" || norm == "\\" {
        return true;
    }
    let broad: Vec<&PathBuf> = [
        env.home.as_ref(),
        env.xdg_data.as_ref(),
        env.xdg_config.as_ref(),
        env.steam_dir.as_ref(),
    ]
    .into_iter()
    .flatten()
    .collect();
    if broad.iter().any(|b| b.as_path() == path) {
        return true;
    }
    for win in &env.windows_roots {
        for r in [
            win.app_data.as_ref(),
            win.local_app_data.as_ref(),
            win.local_low.as_ref(),
            win.user_profile.as_ref(),
            win.documents.as_ref(),
            win.saved_games.as_ref(),
            win.program_data.as_ref(),
            win.public_dir.as_ref(),
            win.program_files.as_ref(),
            win.program_files_x86.as_ref(),
            win.ubisoft_dir.as_ref(),
        ]
        .into_iter()
        .flatten()
        {
            if r.as_path() == path {
                return true;
            }
        }
    }
    false
}

fn finalize_resolved_paths(
    mut candidates: Vec<(PathBuf, String, String, String, i32)>,
    env: &ResolutionEnv,
) -> Vec<ResolvedSavePath> {
    candidates.sort_by(|a, b| b.4.cmp(&a.4));

    let mut seen: HashSet<(String, String)> = HashSet::new();
    let mut existing_saves = Vec::new();
    let mut existing_configs = Vec::new();
    let mut predicted_saves = Vec::new();
    let mut predicted_configs = Vec::new();

    for (path, kind, origin, hint, _) in candidates {
        if is_too_broad_root(&path, env) {
            continue;
        }
        let path_str = path.to_string_lossy().to_string();
        let key = (kind.clone(), path_str.to_lowercase());
        if !seen.insert(key) {
            continue;
        }

        let exists = path.exists();
        let (file_count, total_bytes) = if exists {
            super::measure_path_stats(&path)
        } else {
            (0, 0)
        };

        let entry = ResolvedSavePath {
            path: path_str,
            kind: kind.clone(),
            origin,
            exists,
            file_count,
            total_bytes,
            template_hint: Some(hint),
        };

        match (kind.as_str(), exists) {
            ("save", true) => existing_saves.push(entry),
            ("config", true) => existing_configs.push(entry),
            ("save", false) => predicted_saves.push(entry),
            ("config", false) => predicted_configs.push(entry),
            _ => {}
        }
    }

    let mut out = Vec::new();
    if !existing_saves.is_empty() {
        out.extend(existing_saves);
    } else if let Some(first_pred) = predicted_saves.into_iter().next() {
        out.push(first_pred);
    }

    if !existing_configs.is_empty() {
        out.extend(existing_configs);
    } else if let Some(first_pred) = predicted_configs.into_iter().next() {
        out.push(first_pred);
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cross_os_proton_and_ubisoft_uid_expansion() {
        let root = std::env::temp_dir().join(format!("openplay_res_test_{}", uuid::Uuid::new_v4()));
        let pfx = root.join("steamapps/compatdata/582160/pfx");
        let ubi_save = pfx.join("drive_c/Program Files (x86)/Ubisoft/Ubisoft Game Launcher/savegames/user-uuid-123/4923");
        let ac_docs = pfx.join("drive_c/users/steamuser/Documents/Assassin's Creed Origins");
        std::fs::create_dir_all(&ubi_save).unwrap();
        std::fs::create_dir_all(&ac_docs).unwrap();
        std::fs::write(ubi_save.join("1.save"), b"save-bytes").unwrap();
        std::fs::write(ac_docs.join("ACO.ini"), b"[Video]").unwrap();

        let win_roots = prefix_roots_from_wine_pfx(&pfx, "proton_prefix").unwrap();
        let env = ResolutionEnv {
            is_linux: true,
            windows_roots: vec![win_roots],
            ..Default::default()
        };

        let game = Game {
            id: "steam_582160".to_string(),
            title: "Assassin's Creed Origins".to_string(),
            source: "Steam".to_string(),
            source_id: Some("582160".to_string()),
            ..Default::default()
        };

        let rules = vec![
            SaveLocationRule {
                kind: SavePathKind::Save,
                os: SaveRuleOs::Windows,
                raw_template: r"<ubisoft>\savegames\<uid>\4923".to_string(),
                source_label: "Steam".to_string(),
            },
            SaveLocationRule {
                kind: SavePathKind::Config,
                os: SaveRuleOs::Windows,
                raw_template: r"<winDocuments>\Assassin's Creed Origins\ACO.ini".to_string(),
                source_label: "Windows".to_string(),
            },
        ];

        let resolved = resolve_paths_for_game(&game, &rules, &env);
        assert!(resolved.iter().any(|r| {
            r.kind == "save"
                && r.origin == "proton_prefix"
                && r.exists
                && r.path.ends_with("4923")
                && r.file_count == 1
        }));
        assert!(resolved.iter().any(|r| {
            r.kind == "config"
                && r.origin == "proton_prefix"
                && r.exists
                && r.path.ends_with("ACO.ini")
        }));

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn test_game_root_empty_windows_roots_case_insensitive_and_unity_heuristics() {
        let root = std::env::temp_dir().join(format!("openplay_res_edge_{}", uuid::Uuid::new_v4()));

        // 1. `<game>\b1\Saved\SaveGames\<uid>\*.sav` with empty windows_roots (Black Myth: Wukong)
        let wukong_install = root.join("BlackMythWukong");
        let wukong_save = wukong_install.join("b1/Saved/SaveGames/76561198000000001");
        std::fs::create_dir_all(&wukong_save).unwrap();
        std::fs::write(wukong_save.join("ArchiveSaveFile.0.sav"), b"wukong").unwrap();

        let wukong_game = Game {
            id: "wukong".to_string(),
            title: "Black Myth: Wukong".to_string(),
            source: "Manual".to_string(),
            install_directory: Some(wukong_install.to_string_lossy().to_string()),
            ..Default::default()
        };
        let wukong_env = ResolutionEnv {
            is_linux: true,
            game_install_dir: Some(wukong_install.clone()),
            ..Default::default()
        };
        let wukong_rules = vec![SaveLocationRule {
            kind: SavePathKind::Save,
            os: SaveRuleOs::Windows,
            raw_template: r"<game>\b1\Saved\SaveGames\<uid>\*.sav".to_string(),
            source_label: "Windows".to_string(),
        }];
        let wukong_resolved = resolve_paths_for_game(&wukong_game, &wukong_rules, &wukong_env);
        assert!(wukong_resolved.iter().any(|r| {
            r.kind == "save" && r.exists && r.path.ends_with("76561198000000001") && r.file_count == 1
        }));

        // 2. Case-insensitive Proton path (`Cult Of The Lamb` rule vs `Cult of the Lamb` disk dir)
        let pfx = root.join("pfx");
        let cult_disk = pfx.join("drive_c/users/steamuser/AppData/LocalLow/Massive Monster/Cult of the Lamb/saves");
        std::fs::create_dir_all(&cult_disk).unwrap();
        std::fs::write(cult_disk.join("slot_0.json"), b"{}").unwrap();
        let cult_roots = prefix_roots_from_wine_pfx(&pfx, "proton_prefix").unwrap();
        let cult_env = ResolutionEnv {
            is_linux: true,
            windows_roots: vec![cult_roots],
            ..Default::default()
        };
        let cult_game = Game {
            id: "cult".to_string(),
            title: "Cult of the Lamb".to_string(),
            source: "Steam".to_string(),
            ..Default::default()
        };
        let cult_rules = vec![SaveLocationRule {
            kind: SavePathKind::Save,
            os: SaveRuleOs::Windows,
            raw_template: r"<winLocalLow>\Massive Monster\Cult Of The Lamb\saves".to_string(),
            source_label: "Windows".to_string(),
        }];
        let cult_resolved = resolve_paths_for_game(&cult_game, &cult_rules, &cult_env);
        assert!(cult_resolved.iter().any(|r| {
            r.kind == "save" && r.exists && r.path.ends_with("Cult of the Lamb/saves") && r.file_count == 1
        }));

        // 3. Native Linux Unity heuristic even when developer name ("Team Wood Games") != studio folder ("Team Wood")
        let xdg_cfg = root.join("xdg_config");
        let sap_dir = xdg_cfg.join("unity3d/Team Wood/Super Auto Pets");
        std::fs::create_dir_all(&sap_dir).unwrap();
        std::fs::write(sap_dir.join("prefs"), b"1").unwrap();
        let sap_game = Game {
            id: "sap".to_string(),
            title: "Super Auto Pets".to_string(),
            developer: Some("Team Wood Games".to_string()),
            source: "Steam".to_string(),
            ..Default::default()
        };
        let sap_env = ResolutionEnv {
            is_linux: true,
            xdg_config: Some(xdg_cfg),
            ..Default::default()
        };
        let sap_resolved = resolve_paths_for_game(&sap_game, &[], &sap_env);
        assert!(sap_resolved.iter().any(|r| {
            r.kind == "save" && r.exists && r.path.ends_with("Team Wood/Super Auto Pets")
        }));

        let _ = std::fs::remove_dir_all(&root);
    }
}
