use crate::db::Database;
use crate::models::{Game, SaveLocationCacheEntry, SaveLocationRule, SavePathKind, SaveRuleOs};
use regex::Regex;
use serde_json::Value;

const CACHE_TTL_DAYS: i64 = 30;
const EMPTY_CACHE_TTL_DAYS: i64 = 3;

pub fn extract_steam_appid_for_game(game: &Game) -> Option<String> {
    if game.source.eq_ignore_ascii_case("Steam") {
        if let Some(ref sid) = game.source_id {
            let clean = sid.trim();
            if !clean.is_empty() && clean.chars().all(|c| c.is_ascii_digit()) {
                return Some(clean.to_string());
            }
        }
    }
    if let Ok(re) = Regex::new(r#"(?i)store\.steampowered\.com/app/(\d+)"#) {
        for link in &game.links {
            if let Some(cap) = re.captures(&link.url) {
                if let Some(m) = cap.get(1) {
                    return Some(m.as_str().to_string());
                }
            }
        }
    }
    None
}

pub fn extract_pcgw_page_from_links(game: &Game) -> Option<String> {
    for link in &game.links {
        if link.url.to_lowercase().contains("pcgamingwiki.com/wiki/") {
            if let Some(page) = extract_wiki_page_from_url(&link.url) {
                return Some(page);
            }
        }
    }
    None
}

pub fn build_cache_key_for_game(game: &Game) -> String {
    if let Some(appid) = extract_steam_appid_for_game(game) {
        return format!("steam:{}", appid);
    }
    build_cache_key(&game.title, &game.source, game.source_id.as_deref())
}

pub fn build_cache_key(title: &str, source: &str, source_id: Option<&str>) -> String {
    if source.eq_ignore_ascii_case("Steam") {
        if let Some(sid) = source_id {
            let clean = sid.trim();
            if !clean.is_empty() && clean.chars().all(|c| c.is_ascii_digit()) {
                return format!("steam:{}", clean);
            }
        }
    }
    format!("title:{}", normalize_lookup_title(title))
}

pub fn has_fresh_cache_for_game(db: &Database, game: &Game) -> bool {
    let key = build_cache_key_for_game(game);
    match db.get_save_location_cache(&key) {
        Ok(Some(entry)) => is_cache_fresh(&entry),
        _ => false,
    }
}

pub fn has_fresh_cache(db: &Database, title: &str, source: &str, source_id: Option<&str>) -> bool {
    let key = build_cache_key(title, source, source_id);
    match db.get_save_location_cache(&key) {
        Ok(Some(entry)) => is_cache_fresh(&entry),
        _ => false,
    }
}

/// Returns cached PCGamingWiki rules for a Game struct (checking Steam links/AppIDs as well as title).
pub async fn get_or_fetch_pcgw_rules_for_game(
    db: &Database,
    game: &Game,
    force_refresh: bool,
) -> (Option<String>, Vec<SaveLocationRule>) {
    let steam_appid = extract_steam_appid_for_game(game);
    let link_page = extract_pcgw_page_from_links(game);
    let cache_key = build_cache_key_for_game(game);

    if !force_refresh {
        if let Ok(Some(cached)) = db.get_save_location_cache(&cache_key) {
            if is_cache_fresh(&cached) {
                return (cached.pcgw_page, cached.rules);
            }
        }
    }

    match fetch_from_pcgamingwiki(&game.title, steam_appid.as_deref(), link_page.as_deref()).await {
        Ok((page_opt, rules)) => {
            let entry = SaveLocationCacheEntry {
                cache_key,
                pcgw_page: page_opt.clone(),
                rules: rules.clone(),
                fetched_at: chrono::Utc::now().to_rfc3339(),
            };
            let _ = db.upsert_save_location_cache(&entry);
            (page_opt, rules)
        }
        Err(_) => {
            if let Ok(Some(cached)) = db.get_save_location_cache(&cache_key) {
                (cached.pcgw_page, cached.rules)
            } else {
                (None, Vec::new())
            }
        }
    }
}

/// Returns cached PCGamingWiki rules if valid, or fetches on-demand from PCGamingWiki's MediaWiki API.
pub async fn get_or_fetch_pcgw_rules(
    db: &Database,
    title: &str,
    source: &str,
    source_id: Option<&str>,
    force_refresh: bool,
) -> (Option<String>, Vec<SaveLocationRule>) {
    let steam_appid = if source.eq_ignore_ascii_case("Steam") {
        source_id
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty() && s.chars().all(|c| c.is_ascii_digit()))
    } else {
        None
    };

    let cache_key = build_cache_key(title, source, source_id);

    if !force_refresh {
        if let Ok(Some(cached)) = db.get_save_location_cache(&cache_key) {
            if is_cache_fresh(&cached) {
                return (cached.pcgw_page, cached.rules);
            }
        }
    }

    match fetch_from_pcgamingwiki(title, steam_appid.as_deref(), None).await {
        Ok((page_opt, rules)) => {
            let entry = SaveLocationCacheEntry {
                cache_key,
                pcgw_page: page_opt.clone(),
                rules: rules.clone(),
                fetched_at: chrono::Utc::now().to_rfc3339(),
            };
            let _ = db.upsert_save_location_cache(&entry);
            (page_opt, rules)
        }
        Err(_) => {
            if let Ok(Some(cached)) = db.get_save_location_cache(&cache_key) {
                (cached.pcgw_page, cached.rules)
            } else {
                (None, Vec::new())
            }
        }
    }
}

fn is_cache_fresh(entry: &SaveLocationCacheEntry) -> bool {
    let Ok(dt) = chrono::DateTime::parse_from_rfc3339(&entry.fetched_at) else {
        return false;
    };
    let age = chrono::Utc::now().signed_duration_since(dt.with_timezone(&chrono::Utc));
    let max_days = if entry.rules.is_empty() {
        EMPTY_CACHE_TTL_DAYS
    } else {
        CACHE_TTL_DAYS
    };
    age.num_days() < max_days
}

fn normalize_lookup_title(title: &str) -> String {
    title
        .trim()
        .to_lowercase()
        .replace(['™', '®', '©'], "")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

async fn fetch_from_pcgamingwiki(
    title: &str,
    steam_appid: Option<&str>,
    preferred_page: Option<&str>,
) -> Result<(Option<String>, Vec<SaveLocationRule>), String> {
    let client = crate::http::client();

    let mut candidates: Vec<String> = Vec::new();
    if let Some(pref) = preferred_page {
        if !pref.trim().is_empty() {
            candidates.push(pref.trim().to_string());
        }
    }
    if let Some(appid) = steam_appid {
        if let Some(page) = query_page_by_steam_appid(&client, appid).await {
            if !candidates.contains(&page) {
                candidates.push(page);
            }
        }
    }

    if candidates.is_empty() {
        candidates.extend(query_page_candidates_by_title(&client, title).await);
    }

    if candidates.is_empty() {
        return Ok((None, Vec::new()));
    }

    let mut fallback_title: Option<String> = None;
    for page in candidates.into_iter().take(2) {
        match fetch_and_parse_page(&client, &page).await {
            Ok((resolved_title, rules)) => {
                if fallback_title.is_none() {
                    fallback_title = resolved_title.clone();
                }
                if !rules.is_empty() {
                    return Ok((resolved_title, rules));
                }
            }
            Err(e) => {
                if fallback_title.is_none() {
                    return Err(e);
                }
            }
        }
    }

    Ok((fallback_title, Vec::new()))
}

async fn fetch_and_parse_page(
    client: &reqwest::Client,
    page: &str,
) -> Result<(Option<String>, Vec<SaveLocationRule>), String> {
    let parse_url = "https://www.pcgamingwiki.com/w/api.php";
    let resp = client
        .get(parse_url)
        .query(&[
            ("action", "parse"),
            ("page", page),
            ("prop", "wikitext|text"),
            ("format", "json"),
            ("redirects", "1"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("PCGamingWiki HTTP {}", resp.status()));
    }

    let json: Value = resp.json().await.map_err(|e| e.to_string())?;
    let resolved_title = json
        .get("parse")
        .and_then(|p| p.get("title"))
        .and_then(|t| t.as_str())
        .map(|s| s.to_string())
        .or_else(|| Some(page.to_string()));

    let wikitext = json
        .get("parse")
        .and_then(|p| p.get("wikitext"))
        .and_then(|w| w.get("*"))
        .and_then(|s| s.as_str())
        .unwrap_or("");

    let mut rules = parse_pcgw_wikitext(wikitext);
    if rules.is_empty() {
        let html = json
            .get("parse")
            .and_then(|p| p.get("text"))
            .and_then(|t| t.get("*"))
            .and_then(|s| s.as_str())
            .unwrap_or("");
        rules = parse_pcgw_rendered_html(html);
    }

    Ok((resolved_title, rules))
}

/// Resolves a Steam AppID directly to its PCGamingWiki page via `/api/appid.php` redirect
/// (since PCGamingWiki disabled public `action=cargoquery`).
async fn query_page_by_steam_appid(client: &reqwest::Client, appid: &str) -> Option<String> {
    let url = format!("https://www.pcgamingwiki.com/api/appid.php?appid={}", appid);
    let no_redirect_client = crate::http::no_redirect_client();

    if let Ok(resp) = no_redirect_client.get(&url).send().await {
        if let Some(loc) = resp.headers().get(reqwest::header::LOCATION).and_then(|v| v.to_str().ok()) {
            if let Some(page) = extract_wiki_page_from_url(loc) {
                return Some(page);
            }
        }
    }

    // Fallback: follow redirects and inspect final URL
    let resp = client.get(&url).send().await.ok()?;
    extract_wiki_page_from_url(resp.url().as_str())
}

fn extract_wiki_page_from_url(raw_url: &str) -> Option<String> {
    let idx = raw_url.find("/wiki/")?;
    let slug = &raw_url[idx + "/wiki/".len()..];
    let slug = slug.split(['?', '#']).next().unwrap_or(slug).trim();
    if slug.is_empty() || slug.starts_with("Special:") {
        return None;
    }
    let decoded = reqwest::Url::parse(&format!("https://pcgw.local/{}", slug))
        .ok()
        .and_then(|u| {
            let p = u.path().trim_start_matches('/');
            Some(percent_decode_lossy(p))
        })
        .unwrap_or_else(|| percent_decode_lossy(slug));
    Some(decoded.replace('_', " "))
}

fn percent_decode_lossy(input: &str) -> String {
    let mut bytes = Vec::with_capacity(input.len());
    let raw = input.as_bytes();
    let mut i = 0;
    while i < raw.len() {
        if raw[i] == b'%' && i + 2 < raw.len() {
            if let (Some(h1), Some(h2)) = (
                (raw[i + 1] as char).to_digit(16),
                (raw[i + 2] as char).to_digit(16),
            ) {
                bytes.push(((h1 << 4) | h2) as u8);
                i += 3;
                continue;
            }
        }
        bytes.push(raw[i]);
        i += 1;
    }
    String::from_utf8_lossy(&bytes).to_string()
}

async fn query_page_candidates_by_title(client: &reqwest::Client, title: &str) -> Vec<String> {
    let clean = title
        .replace(['™', '®', '©'], "")
        .trim()
        .to_string();
    if clean.is_empty() {
        return Vec::new();
    }

    let mut raw_candidates: Vec<String> = Vec::new();

    // 1. OpenSearch API
    if let Ok(resp) = client
        .get("https://www.pcgamingwiki.com/w/api.php")
        .query(&[
            ("action", "opensearch"),
            ("search", clean.as_str()),
            ("limit", "6"),
            ("namespace", "0"),
            ("format", "json"),
        ])
        .send()
        .await
    {
        if let Ok(arr) = resp.json::<Value>().await {
            if let Some(titles) = arr.as_array().and_then(|a| a.get(1)).and_then(|t| t.as_array()) {
                for t in titles {
                    if let Some(candidate) = t.as_str() {
                        if !raw_candidates.iter().any(|c| c.eq_ignore_ascii_case(candidate)) {
                            raw_candidates.push(candidate.to_string());
                        }
                    }
                }
            }
        }
    }

    // Check if OpenSearch already gave us an exact match
    let target_norm = alnum_norm(&clean);
    if raw_candidates.iter().any(|c| alnum_norm(c) == target_norm) {
        return rank_pcgw_candidates(&clean, raw_candidates);
    }

    // 2. Full-text title search fallback
    if let Ok(resp) = client
        .get("https://www.pcgamingwiki.com/w/api.php")
        .query(&[
            ("action", "query"),
            ("list", "search"),
            ("srsearch", clean.as_str()),
            ("srlimit", "6"),
            ("format", "json"),
        ])
        .send()
        .await
    {
        if let Ok(json) = resp.json::<Value>().await {
            if let Some(hits) = json
                .get("query")
                .and_then(|q| q.get("search"))
                .and_then(|s| s.as_array())
            {
                for h in hits {
                    if let Some(candidate) = h.get("title").and_then(|v| v.as_str()) {
                        if !raw_candidates.iter().any(|c| c.eq_ignore_ascii_case(candidate)) {
                            raw_candidates.push(candidate.to_string());
                        }
                    }
                }
            }
        }
    }

    rank_pcgw_candidates(&clean, raw_candidates)
}

/// Scores PCGamingWiki search candidates so subtitle/short queries ("Wukong", "Expedition 33")
/// resolve to the real game instead of unrelated foreign/compilation articles.
pub fn rank_pcgw_candidates(query: &str, candidates: Vec<String>) -> Vec<String> {
    let target_norm = alnum_norm(query);
    if target_norm.is_empty() {
        return candidates;
    }

    let query_words: Vec<String> = query
        .split(|c: char| !c.is_alphanumeric())
        .map(|w| w.to_lowercase())
        .filter(|w| !w.is_empty())
        .collect();
    let query_is_ascii = query.is_ascii();
    let query_has_demo = query_words.iter().any(|w| w == "demo");

    let mut scored: Vec<(i32, usize, String)> = candidates
        .into_iter()
        .enumerate()
        .map(|(idx, cand)| {
            let mut score = 0i32;
            let cand_norm = alnum_norm(&cand);
            let cand_words: Vec<String> = cand
                .split(|c: char| !c.is_alphanumeric())
                .map(|w| w.to_lowercase())
                .filter(|w| !w.is_empty())
                .collect();

            if cand_norm == target_norm {
                score += 1000;
            }

            // Subtitle match after `:` or `-` (e.g. "Black Myth: Wukong", "Clair Obscur: Expedition 33")
            for sep in [':', '-', '–'] {
                if let Some((_, rhs)) = cand.rsplit_once(sep) {
                    if alnum_norm(rhs) == target_norm {
                        score += 600;
                        break;
                    }
                }
            }

            if cand_norm.ends_with(&target_norm) && cand_norm != target_norm {
                score += 180;
            } else if cand_norm.contains(&target_norm) {
                score += 80;
            }

            let matched_words = query_words
                .iter()
                .filter(|qw| cand_words.iter().any(|cw| cw == *qw))
                .count();
            score += (matched_words as i32) * 100;

            if matched_words == query_words.len() && !query_words.is_empty() {
                score += 120;
            }

            let extra_words = cand_words.len().saturating_sub(matched_words);
            score -= (extra_words as i32) * 12;

            if query_is_ascii && !cand.is_ascii() {
                score -= 150;
            }
            if !query_has_demo && cand_words.iter().any(|w| w == "demo" || w == "soundtrack") {
                score -= 120;
            }

            (score, idx, cand)
        })
        .collect();

    scored.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
    scored.into_iter().map(|(_, _, c)| c).collect()
}

fn alnum_norm(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric())
        .collect()
}

/// Parses PCGamingWiki `{{Game data/saves|...}}` and `{{Game data/config|...}}` wikitext templates.
pub fn parse_pcgw_wikitext(wikitext: &str) -> Vec<SaveLocationRule> {
    let mut rules = Vec::new();
    let lower = wikitext.to_lowercase();
    let mut cursor = 0;

    while cursor < lower.len() {
        let next_saves = lower[cursor..].find("{{game data/saves");
        let next_config = lower[cursor..].find("{{game data/config");

        let (rel_pos, kind) = match (next_saves, next_config) {
            (Some(s), Some(c)) => {
                if s <= c {
                    (s, SavePathKind::Save)
                } else {
                    (c, SavePathKind::Config)
                }
            }
            (Some(s), None) => (s, SavePathKind::Save),
            (None, Some(c)) => (c, SavePathKind::Config),
            (None, None) => break,
        };

        let start = cursor + rel_pos;
        if let Some((block, end)) = extract_balanced_template(wikitext, start) {
            parse_gamedata_template_block(block, kind, &mut rules);
            cursor = end;
        } else {
            cursor = start + 18;
        }
    }

    dedup_rules(rules)
}

fn extract_balanced_template(text: &str, start: usize) -> Option<(&str, usize)> {
    let bytes = text.as_bytes();
    if !text[start..].starts_with("{{") {
        return None;
    }
    let mut depth = 0usize;
    let mut i = start;
    while i + 1 < bytes.len() {
        if bytes[i] == b'{' && bytes[i + 1] == b'{' {
            depth += 1;
            i += 2;
        } else if bytes[i] == b'}' && bytes[i + 1] == b'}' {
            depth = depth.saturating_sub(1);
            i += 2;
            if depth == 0 {
                return Some((&text[start..i], i));
            }
        } else {
            i += 1;
        }
    }
    None
}

fn split_top_level_pipes(inner: &str) -> Vec<&str> {
    let mut parts = Vec::new();
    let bytes = inner.as_bytes();
    let mut depth = 0usize;
    let mut start = 0usize;
    let mut i = 0usize;
    while i < bytes.len() {
        if i + 1 < bytes.len() && bytes[i] == b'{' && bytes[i + 1] == b'{' {
            depth += 1;
            i += 2;
            continue;
        }
        if i + 1 < bytes.len() && bytes[i] == b'}' && bytes[i + 1] == b'}' {
            depth = depth.saturating_sub(1);
            i += 2;
            continue;
        }
        if bytes[i] == b'|' && depth == 0 {
            parts.push(&inner[start..i]);
            start = i + 1;
        }
        i += 1;
    }
    parts.push(&inner[start..]);
    parts
}

fn parse_gamedata_template_block(block: &str, kind: SavePathKind, out: &mut Vec<SaveLocationRule>) {
    let inner = block
        .strip_prefix("{{")
        .and_then(|s| s.strip_suffix("}}"))
        .unwrap_or(block);
    let parts = split_top_level_pipes(inner);
    if parts.len() < 2 {
        return;
    }

    // Standard Cargo row syntax: {{Game data/saves|<Platform>|<Path1>|<Path2>|...}}
    if parts.len() >= 3 && !parts[1].contains('\n') && !parts[1].contains('*') {
        let os_label = parts[1].trim();
        let os = map_os_label(os_label);
        for raw_arg in &parts[2..] {
            let trimmed_arg = raw_arg.trim();
            if trimmed_arg.is_empty()
                || trimmed_arg.to_lowercase().starts_with("ref=")
                || trimmed_arg.to_lowercase().starts_with("note=")
            {
                continue;
            }
            for candidate in split_path_alternatives(trimmed_arg) {
                if let Some(normalized) = normalize_pcgw_path_template(&candidate) {
                    out.push(SaveLocationRule {
                        kind: kind.clone(),
                        os: os.clone(),
                        raw_template: normalized,
                        source_label: os_label.to_string(),
                    });
                }
            }
        }
        return;
    }

    // Multi-line bullet block fallback
    for line in parts[1..].join("|").lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let lower = trimmed.to_lowercase();
        let os = if lower.contains("windows") {
            SaveRuleOs::Windows
        } else if lower.contains("linux") {
            SaveRuleOs::Linux
        } else if lower.contains("mac") || lower.contains("os x") {
            SaveRuleOs::Macos
        } else if lower.contains("steam cloud") {
            SaveRuleOs::SteamCloud
        } else {
            continue;
        };

        let candidate_raw = trimmed
            .split_once('—')
            .or_else(|| trimmed.split_once(" - "))
            .map(|(_, rhs)| rhs)
            .unwrap_or(trimmed);

        for candidate in split_path_alternatives(candidate_raw) {
            if let Some(normalized) = normalize_pcgw_path_template(&candidate) {
                out.push(SaveLocationRule {
                    kind: kind.clone(),
                    os: os.clone(),
                    raw_template: normalized,
                    source_label: format!("{:?}", os),
                });
            }
        }
    }
}

fn parse_pcgw_rendered_html(html: &str) -> Vec<SaveLocationRule> {
    let mut rules = Vec::new();
    let row_re = match Regex::new(r#"(?is)<tr[^>]*class="[^"]*table-gamedata-body-row[^"]*"[^>]*>(.*?)</tr>"#) {
        Ok(r) => r,
        Err(_) => return rules,
    };
    let cell_re = Regex::new(r#"(?is)<t[hd][^>]*>(.*?)</t[hd]>"#).ok();
    let tag_re = Regex::new(r#"(?is)<[^>]+>"#).ok();

    for cap in row_re.captures_iter(html) {
        let row_html = cap.get(1).map(|m| m.as_str()).unwrap_or("");
        let row_lower = row_html.to_lowercase();
        let kind = if row_lower.contains("configuration") || row_lower.contains("config") {
            SavePathKind::Config
        } else {
            SavePathKind::Save
        };

        let Some(ref cre) = cell_re else { continue };
        let cells: Vec<String> = cre
            .captures_iter(row_html)
            .filter_map(|c| c.get(1).map(|m| m.as_str().to_string()))
            .collect();

        if cells.len() >= 2 {
            let strip = |s: &str| -> String {
                tag_re
                    .as_ref()
                    .map(|re| re.replace_all(s, "").to_string())
                    .unwrap_or_else(|| s.to_string())
                    .replace("&lt;", "<")
                    .replace("&gt;", ">")
                    .replace("&amp;", "&")
                    .trim()
                    .to_string()
            };
            let os_text = strip(&cells[0]);
            let path_text = strip(cells.last().unwrap_or(&cells[1]));
            let os = map_os_label(&os_text);
            for alt in split_path_alternatives(&path_text) {
                if let Some(norm) = normalize_pcgw_path_template(&alt) {
                    rules.push(SaveLocationRule {
                        kind: kind.clone(),
                        os: os.clone(),
                        raw_template: norm,
                        source_label: os_text.clone(),
                    });
                }
            }
        }
    }

    dedup_rules(rules)
}

fn map_os_label(label: &str) -> SaveRuleOs {
    let lower = label.to_lowercase();
    if lower.contains("steam cloud") {
        SaveRuleOs::SteamCloud
    } else if lower.contains("linux") || lower.contains("steamos") {
        SaveRuleOs::Linux
    } else if lower.contains("os x") || lower.contains("macos") || lower.contains("mac") {
        SaveRuleOs::Macos
    } else if lower.contains("windows")
        || lower.contains("microsoft")
        || lower.contains("gog")
        || lower.contains("epic")
        || lower.contains("steam")
        || lower.contains("ubisoft")
        || lower.contains("uplay")
        || lower.contains("ea")
        || lower.contains("origin")
    {
        SaveRuleOs::Windows
    } else {
        SaveRuleOs::Any
    }
}

fn split_path_alternatives(raw: &str) -> Vec<String> {
    let mut cleaned = raw
        .replace("<br />", "\n")
        .replace("<br/>", "\n")
        .replace("<br>", "\n");
    if let Ok(re) = Regex::new(r#"(?is)<ref[^>]*>.*?</ref>"#) {
        cleaned = re.replace_all(&cleaned, "").to_string();
    }
    if let Ok(re) = Regex::new(r#"(?is)<[^>]+>"#) {
        cleaned = re.replace_all(&cleaned, "").to_string();
    }

    let mut out = Vec::new();
    for line in cleaned.lines() {
        for part in line.split(" or ") {
            let trimmed = part.trim();
            if !trimmed.is_empty() {
                out.push(trimmed.to_string());
            }
        }
    }
    out
}

/// Replaces PCGamingWiki `{{p|...}}` templates and standard env tokens with canonical tokens.
pub fn normalize_pcgw_path_template(raw: &str) -> Option<String> {
    let mut s = raw.trim().to_string();
    if s.is_empty() || s.eq_ignore_ascii_case("n/a") || s.eq_ignore_ascii_case("none") {
        return None;
    }

    // Replace {{p|token}} macros (case-insensitive, normalizing backslashes to forward slashes)
    if let Ok(re) = Regex::new(r#"(?i)\{\{\s*p\s*\|\s*([^}|]+?)(?:\|[^}]*)?\s*\}\}"#) {
        s = re
            .replace_all(&s, |caps: &regex::Captures| {
                let tok = caps
                    .get(1)
                    .map(|m| m.as_str())
                    .unwrap_or("")
                    .trim()
                    .replace('\\', "/")
                    .to_lowercase();
                match tok.as_str() {
                    "appdata" => "<winAppData>",
                    "localappdata" => "<winLocalAppData>",
                    "locallow" | "userprofile/appdata/locallow" => "<winLocalLow>",
                    "userprofile" => "<winUserProfile>",
                    "userprofile/documents" | "documents" | "mydocuments" => "<winDocuments>",
                    "userprofile/savedgames" | "userprofile/saved games" | "savedgames" => "<winSavedGames>",
                    "programdata" | "allusersprofile" => "<winProgramData>",
                    "public" => "<winPublic>",
                    "programfiles" | "program files" => "<winProgramFiles>",
                    "programfilesx86" | "program files (x86)" => "<winProgramFilesX86>",
                    "game" => "<game>",
                    "steam" => "<steam>",
                    "uid" | "steamid3" | "user-id" => "<uid>",
                    "xdgdatahome" => "<xdgData>",
                    "xdgconfighome" => "<xdgConfig>",
                    "linuxhome" | "home" => "<home>",
                    "osxhome" => "<osxHome>",
                    "ubisoftconnect" | "uplay" | "ubisoft" => "<ubisoft>",
                    "hkcu" | "hklm" | "hkcr" => "__REGISTRY__",
                    _ => "",
                }
                .to_string()
            })
            .to_string();
    }

    if s.contains("__REGISTRY__") {
        return None;
    }

    // Strip any leftover wiki formatting like [[...|...]] or '''
    if let Ok(re) = Regex::new(r#"\[\[[^\]|]+\|([^\]]+)\]\]"#) {
        s = re.replace_all(&s, "$1").to_string();
    }
    s = s.replace("'''", "").replace("''", "");

    // Normalize common raw placeholders
    s = s
        .replace("%APPDATA%", "<winAppData>")
        .replace("%appdata%", "<winAppData>")
        .replace("%LOCALAPPDATA%", "<winLocalAppData>")
        .replace("%localappdata%", "<winLocalAppData>")
        .replace("%USERPROFILE%\\Documents", "<winDocuments>")
        .replace("%USERPROFILE%/Documents", "<winDocuments>")
        .replace("%USERPROFILE%\\Saved Games", "<winSavedGames>")
        .replace("%USERPROFILE%/Saved Games", "<winSavedGames>")
        .replace("%USERPROFILE%\\AppData\\LocalLow", "<winLocalLow>")
        .replace("%USERPROFILE%/AppData/LocalLow", "<winLocalLow>")
        .replace("%USERPROFILE%", "<winUserProfile>")
        .replace("%userprofile%", "<winUserProfile>")
        .replace("%PROGRAMDATA%", "<winProgramData>")
        .replace("%programdata%", "<winProgramData>")
        .replace("<path-to-game>", "<game>")
        .replace("<path-to-Steam>", "<steam>")
        .replace("<Steam-folder>", "<steam>")
        .replace("<path-to-ubisoft-game-launcher>", "<ubisoft>")
        .replace("<user-id>", "<uid>")
        .replace("$XDG_DATA_HOME", "<xdgData>")
        .replace("$XDG_CONFIG_HOME", "<xdgConfig>");

    // Collapse compound <winUserProfile>\... sub-roots into dedicated cross-OS prefix tokens
    for (pat, rep) in [
        (r"(?i)<winUserProfile>[\\/]AppData[\\/]LocalLow", "<winLocalLow>"),
        (r"(?i)<winUserProfile>[\\/]AppData[\\/]Local", "<winLocalAppData>"),
        (r"(?i)<winUserProfile>[\\/]AppData[\\/]Roaming", "<winAppData>"),
        (r"(?i)<winUserProfile>[\\/]Saved Games", "<winSavedGames>"),
        (r"(?i)<winUserProfile>[\\/]Documents", "<winDocuments>"),
    ] {
        if let Ok(re) = Regex::new(pat) {
            s = re.replace_all(&s, rep).to_string();
        }
    }

    if s.starts_with("~/") {
        s = format!("<home>/{}", &s[2..]);
    }

    let trimmed = s.trim().trim_end_matches(['\\', '/']).to_string();
    if trimmed.is_empty()
        || (!trimmed.contains('<') && !trimmed.contains('/') && !trimmed.contains('\\'))
    {
        return None;
    }

    let upper = trimmed.to_uppercase();
    if upper.starts_with("HKEY_") || upper.starts_with("HKCU\\") || upper.starts_with("HKLM\\") {
        return None;
    }

    Some(trimmed)
}

fn dedup_rules(rules: Vec<SaveLocationRule>) -> Vec<SaveLocationRule> {
    let mut out: Vec<SaveLocationRule> = Vec::new();
    for r in rules {
        if !out
            .iter()
            .any(|e| e.kind == r.kind && e.os == r.os && e.raw_template.eq_ignore_ascii_case(&r.raw_template))
        {
            out.push(r);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_pcgw_wikitext_real_games() {
        let ac_origins = r#"
===Configuration file(s) location===
{{Game data|
{{Game data/config|Windows|{{p|userprofile\Documents}}\Assassin's Creed Origins\ACO.ini|{{p|userprofile\Documents}}\Assassin's Creed Origins\ControlMappings.xml}}
}}
===Save game data location===
{{Game data|
{{Game data/saves|Windows|{{p|uplay}}\savegames\{{p|uid}}\3539\}}
{{Game data/saves|Steam|{{p|uplay}}\savegames\{{p|uid}}\4923\}}
}}
"#;

        let ac_rules = parse_pcgw_wikitext(ac_origins);
        assert!(ac_rules.iter().any(|r| {
            r.kind == SavePathKind::Save
                && r.source_label == "Steam"
                && r.raw_template == r"<ubisoft>\savegames\<uid>\4923"
        }));
        assert!(ac_rules.iter().any(|r| {
            r.kind == SavePathKind::Config
                && r.raw_template == r"<winDocuments>\Assassin's Creed Origins\ACO.ini"
        }));
        assert!(ac_rules.iter().any(|r| {
            r.kind == SavePathKind::Config
                && r.raw_template == r"<winDocuments>\Assassin's Creed Origins\ControlMappings.xml"
        }));

        let hollow_knight = r#"
{{Game data/config|Windows|{{p|hkcu}}\Software\Team Cherry\Hollow Knight\|{{p|game}}\hollow_knight_Data\Config.ini}}
{{Game data/saves|Windows|{{p|userprofile}}\AppData\LocalLow\Team Cherry\Hollow Knight\*.dat | {{p|userprofile}}\AppData\LocalLow\Team Cherry\Hollow Knight\*.bak}}
{{Game data/saves|Linux|{{p|xdgconfighome}}/unity3d/Team Cherry/Hollow Knight/*.dat}}
{{Game data/saves|Steam Cloud|{{p|steam}}\userdata\{{p|uid}}\367520\remote}}
"#;
        let hk_rules = parse_pcgw_wikitext(hollow_knight);
        // Registry key skipped, game Config.ini preserved
        assert!(!hk_rules.iter().any(|r| r.raw_template.contains("Software\\Team Cherry")));
        assert!(hk_rules.iter().any(|r| r.raw_template == r"<game>\hollow_knight_Data\Config.ini"));
        assert!(hk_rules.iter().any(|r| r.raw_template == r"<winLocalLow>\Team Cherry\Hollow Knight\*.dat"));
        assert!(hk_rules.iter().any(|r| r.raw_template == "<xdgConfig>/unity3d/Team Cherry/Hollow Knight/*.dat"));
        assert!(hk_rules.iter().any(|r| r.raw_template == r"<steam>\userdata\<uid>\367520\remote"));

        assert_eq!(
            extract_wiki_page_from_url("https://www.pcgamingwiki.com/wiki/Assassin%27s_Creed_Origins").as_deref(),
            Some("Assassin's Creed Origins")
        );

        let wukong_ranked = rank_pcgw_candidates(
            "Wukong",
            vec![
                "孙悟空大战机器金刚 / Sun Wukong VS Robot".to_string(),
                "Sun Wukong VS Robot".to_string(),
                "Black Myth: Wukong".to_string(),
            ],
        );
        assert_eq!(wukong_ranked.first().map(String::as_str), Some("Black Myth: Wukong"));

        let exp33 = rank_pcgw_candidates("Expedition 33", vec!["Clair Obscur: Expedition 33".to_string()]);
        assert_eq!(exp33.first().map(String::as_str), Some("Clair Obscur: Expedition 33"));

        let multi_real = r#"
{{Game data/saves|Windows|{{P|userprofile\appdata\locallow}}\Studio MDHR\Cuphead\|{{P|appdata}}\Cuphead\}}
{{Game data/saves|Steam|{{P|steam}}\userdata\{{P|uid}}\268910\}}
{{Game data/saves|Windows|{{p|game}}\b1\Saved\SaveGames\{{p|uid}}\*.sav|{{p|game}}\b1\Saved\SaveGamesBackup}}
{{Game data/saves|Windows|{{p|localappdata}}\ItTakesTwo\*.Nuts}}
{{Game data/saves|Windows|{{p|userprofile\appdata\locallow}}\Massive Monster\Cult Of The Lamb\saves\}}
"#;
        let multi_rules = parse_pcgw_wikitext(multi_real);
        assert!(multi_rules.iter().any(|r| r.raw_template == r"<winLocalLow>\Studio MDHR\Cuphead"));
        assert!(multi_rules.iter().any(|r| r.raw_template == r"<steam>\userdata\<uid>\268910"));
        assert!(multi_rules.iter().any(|r| r.raw_template == r"<game>\b1\Saved\SaveGames\<uid>\*.sav"));
        assert!(multi_rules.iter().any(|r| r.raw_template == r"<winLocalAppData>\ItTakesTwo\*.Nuts"));
        assert!(multi_rules.iter().any(|r| r.raw_template == r"<winLocalLow>\Massive Monster\Cult Of The Lamb\saves"));
    }
}
