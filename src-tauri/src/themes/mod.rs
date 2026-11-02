use crate::db::Database;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use zip::ZipArchive;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeSetting {
    pub id: String,
    pub label: String,
    #[serde(rename = "type")]
    pub setting_type: String, // "boolean", "select", "color", "number", "text"
    pub default: serde_json::Value,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub options: Option<Vec<String>>,
    #[serde(default)]
    pub min: Option<f64>,
    #[serde(default)]
    pub max: Option<f64>,
    #[serde(default)]
    pub step: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub author: String,
    pub description: String,
    pub icon: String, // MANDATORY
    pub screenshots: Vec<String>, // MANDATORY: >= 3
    #[serde(default)]
    pub css: Option<String>,
    #[serde(default)]
    pub colors: Option<HashMap<String, String>>,
    #[serde(default)]
    pub settings: Option<Vec<ThemeSetting>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeInfo {
    pub manifest: ThemeManifest,
    pub is_active: bool,
    pub is_builtin: bool,
    pub resolved_icon: Option<String>,
    pub resolved_screenshots: Vec<String>,
    pub config_values: HashMap<String, serde_json::Value>,
    pub css_content: Option<String>,
}

pub fn get_themes_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("OpenPlay")
        .join("themes")
}

pub fn seed_default_theme() -> Result<(), String> {
    let themes_dir = get_themes_dir();
    let default_dir = themes_dir.join("default");
    fs::create_dir_all(&default_dir).map_err(|e| e.to_string())?;

    let manifest_path = default_dir.join("theme.json");
    let manifest = r##"{
  "id": "default",
  "name": "OpenPlay Default",
  "version": "1.1.0",
  "author": "OpenPlay Developers",
  "description": "The official dark glassmorphic baseline theme for OpenPlay.",
  "icon": "icon.svg",
  "screenshots": [
    "screenshot_1.svg",
    "screenshot_2.svg",
    "screenshot_3.svg"
  ],
  "css": "theme.css",
  "colors": {
    "accent": "#783efe",
    "panel_tint": "#0e0e11",
    "background": "#07080c"
  },
  "settings": [
    {
      "id": "accent_color",
      "label": "Theme Accent Color",
      "type": "color",
      "default": "#783efe",
      "category": "Aesthetics & Colors",
      "description": "Primary highlight color for active buttons, badges, rings, and focus outlines."
    },
    {
      "id": "panel_tint",
      "label": "Panel Tint & Windows Background",
      "type": "color",
      "default": "#0e0e11",
      "category": "Aesthetics & Colors",
      "description": "Smoked neutral tint for side drawers, modals, cards, and floating containers."
    },
    {
      "id": "background_opacity",
      "label": "Background Dimming Opacity",
      "type": "number",
      "min": 0.2,
      "max": 1.0,
      "step": 0.05,
      "default": 0.75,
      "category": "Aesthetics & Colors",
      "description": "Opacity overlay for dynamic blurred game artwork in the application background."
    },
    {
      "id": "background_blur",
      "label": "Dynamic Background Blur",
      "type": "number",
      "min": 0,
      "max": 64,
      "step": 4,
      "default": 32,
      "category": "Aesthetics & Colors",
      "description": "Blur radius (px) applied to the game background behind the workspace."
    },
    {
      "id": "view_mode",
      "label": "Default View Mode",
      "type": "select",
      "options": ["Split View", "Full Grid", "Table List"],
      "default": "Split View",
      "category": "Layout & Sizing",
      "description": "Preferred default workspace layout on launch."
    },
    {
      "id": "hero_aspect_ratio",
      "label": "Hero Banner Aspect Ratio",
      "type": "select",
      "options": ["Panoramic (96:31)", "Widescreen (16:9)", "Ultrawide (21:9)", "Hidden"],
      "default": "Panoramic (96:31)",
      "category": "Layout & Sizing",
      "description": "Proportions of the hero artwork banner in the game details view."
    },
    {
      "id": "logo_max_width",
      "label": "Hero Title Logo Max Width (%)",
      "type": "number",
      "min": 20,
      "max": 100,
      "step": 5,
      "default": 50,
      "category": "Layout & Sizing",
      "description": "Maximum width constraint for the game logo relative to the hero banner."
    },
    {
      "id": "logo_max_height",
      "label": "Hero Title Logo Max Height (%)",
      "type": "number",
      "min": 20,
      "max": 90,
      "step": 5,
      "default": 65,
      "category": "Layout & Sizing",
      "description": "Maximum height constraint for the game logo relative to the hero banner."
    },
    {
      "id": "card_border_radius",
      "label": "Game Card Corner Radius",
      "type": "select",
      "options": ["Sleek (8px)", "Rounded (16px)", "Ultra Rounded (24px)"],
      "default": "Rounded (16px)",
      "category": "Game Cards & Posters",
      "description": "Corner roundness for game cover posters and thumbnails."
    },
    {
      "id": "card_aspect_ratio",
      "label": "Game Card Aspect Ratio",
      "type": "select",
      "options": ["Vertical Poster (2:3)", "Square Tile (1:1)", "Landscape Banner (16:9)"],
      "default": "Vertical Poster (2:3)",
      "category": "Game Cards & Posters",
      "description": "Shape of game cover cards in the grid (e.g. Switch-style 1:1 square tiles vs 2:3 vertical posters)."
    },
    {
      "id": "enable_card_glow",
      "label": "Card Hover Glow",
      "type": "boolean",
      "default": true,
      "category": "Game Cards & Posters",
      "description": "Luminous accent-colored ambient glow around hovered cards."
    },
    {
      "id": "modal_backdrop_opacity",
      "label": "Modal Backdrop Dimming Opacity",
      "type": "number",
      "min": 0.2,
      "max": 0.9,
      "step": 0.05,
      "default": 0.45,
      "category": "Windows & Modals",
      "description": "Darkening opacity for background behind open modal dialogs."
    },
    {
      "id": "modal_backdrop_blur",
      "label": "Modal Backdrop Blur Intensity",
      "type": "number",
      "min": 0,
      "max": 32,
      "step": 2,
      "default": 8,
      "category": "Windows & Modals",
      "description": "Backdrop blur intensity (px) for modal overlays."
    },
    {
      "id": "glass_intensity",
      "label": "Glassmorphism Blur",
      "type": "select",
      "options": ["Subtle (12px)", "Standard (24px)", "Intense (48px)"],
      "default": "Standard (24px)",
      "category": "Windows & Modals",
      "description": "Backdrop blur strength for modal containers, flyouts, and drawers."
    }
  ]
}"##;
    fs::write(&manifest_path, manifest).map_err(|e| e.to_string())?;

    let css_path = default_dir.join("theme.css");
    let default_css = r##"/* OpenPlay Default Theme CSS
 * High-performance dark glassmorphic styling
 */
:root {
  --openplay-theme-id: "default";
}

/* 1. Theme-Specific Surface & Accent Tokens */
[data-theme-id="default"] {
  --theme-surface-glow: color-mix(in srgb, var(--app-accent-color, #783efe) 20%, transparent);
}

/* 2. Game Grid & Card Styling */
[data-theme-part="game-card"] {
  border-radius: var(--theme-card-radius, 16px);
  aspect-ratio: var(--theme-card-aspect, 2 / 3);
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
}

[data-theme-part="game-card"]:hover {
  transform: translateY(-2px) scale(1.02);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.8), 0 0 20px color-mix(in srgb, var(--app-accent-color, #783efe) calc(var(--theme-card-glow, 1) * 35%), transparent);
}

/* 3. Navigation Bar Styling */
[data-theme-part="top-nav"] {
  background-color: color-mix(in srgb, #000000 35%, transparent);
  backdrop-filter: blur(var(--theme-glass-blur, 24px));
  -webkit-backdrop-filter: blur(var(--theme-glass-blur, 24px));
  border-bottom: 1px solid var(--theme-border-color, rgba(255, 255, 255, 0.08));
}

/* 4. Hero Banner & Details Styling */
[data-theme-part="hero-banner"] {
  aspect-ratio: var(--theme-hero-aspect, 96 / 31);
}

[data-theme-part="hero-title-logo"] {
  width: var(--theme-logo-max-w, 50%);
  max-width: var(--theme-logo-max-w, 50%);
  height: var(--theme-logo-max-h, 65%);
  max-height: var(--theme-logo-max-h, 65%);
}

/* 5. Modals & Dialogs */
[data-theme-part="modal-backdrop"] {
  background-color: color-mix(in srgb, #000000 var(--modal-backdrop-opacity, 45%), transparent);
  backdrop-filter: blur(var(--modal-backdrop-blur, 8px));
  -webkit-backdrop-filter: blur(var(--modal-backdrop-blur, 8px));
}

[data-theme-part="modal-container"] {
  background-color: color-mix(in srgb, var(--app-panel-tint, #0e0e11) 94%, transparent);
  backdrop-filter: blur(var(--theme-glass-blur, 24px));
  -webkit-backdrop-filter: blur(var(--theme-glass-blur, 24px));
  border: 1px solid var(--theme-border-color, rgba(255, 255, 255, 0.1));
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.85);
}

[data-theme-part="drawer"] {
  background-color: color-mix(in srgb, var(--app-panel-tint, #0e0e11) 92%, transparent);
  backdrop-filter: blur(var(--theme-glass-blur, 24px));
  -webkit-backdrop-filter: blur(var(--theme-glass-blur, 24px));
  border-right: 1px solid var(--theme-border-color, rgba(255, 255, 255, 0.1));
}
"##;
    fs::write(&css_path, default_css).map_err(|e| e.to_string())?;

    let icon_path = default_dir.join("icon.svg");
    if !icon_path.exists() {
        let icon_svg = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
  <defs>
    <linearGradient id="opDefaultGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#783efe" />
      <stop offset="100%" stop-color="#3b82f6" />
    </linearGradient>
  </defs>
  <rect width="100" height="100" rx="28" fill="#12141c" stroke="url(#opDefaultGrad)" stroke-width="4"/>
  <circle cx="50" cy="50" r="24" fill="url(#opDefaultGrad)" opacity="0.9"/>
  <path d="M44 38L62 50L44 62V38Z" fill="#ffffff"/>
</svg>"##;
        fs::write(&icon_path, icon_svg).map_err(|e| e.to_string())?;
    }

    let screen1_path = default_dir.join("screenshot_1.svg");
    let s1 = r##"<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" fill="none">
  <rect width="1200" height="675" fill="#090a0f"/>
  <!-- Left Navigation Bar -->
  <rect x="24" y="24" width="220" height="627" rx="16" fill="#12141c" stroke="#ffffff" stroke-opacity="0.1"/>
  <rect x="44" y="50" width="180" height="36" rx="10" fill="#783efe" fill-opacity="0.2" stroke="#783efe" stroke-opacity="0.5"/>
  <text x="90" y="73" font-family="Segoe UI, sans-serif" font-size="13" font-weight="bold" fill="#ffffff">All Games (128)</text>
  <rect x="44" y="96" width="180" height="32" rx="8" fill="#ffffff" fill-opacity="0.04"/>
  <text x="90" y="117" font-family="Segoe UI, sans-serif" font-size="12" fill="#a1a1aa">Steam (84)</text>
  <rect x="44" y="136" width="180" height="32" rx="8" fill="#ffffff" fill-opacity="0.04"/>
  <text x="90" y="157" font-family="Segoe UI, sans-serif" font-size="12" fill="#a1a1aa">Nintendo Switch (14)</text>
  <rect x="44" y="176" width="180" height="32" rx="8" fill="#ffffff" fill-opacity="0.04"/>
  <text x="90" y="197" font-family="Segoe UI, sans-serif" font-size="12" fill="#a1a1aa">Epic Games (18)</text>

  <!-- Main Library Grid -->
  <rect x="264" y="24" width="912" height="627" rx="16" fill="#12141c" stroke="#ffffff" stroke-opacity="0.1"/>
  <!-- Header / Search -->
  <rect x="288" y="46" width="340" height="38" rx="12" fill="#181b26" stroke="#ffffff" stroke-opacity="0.08"/>
  <text x="324" y="70" font-family="Segoe UI, sans-serif" font-size="13" fill="#71717a">Search games, genres, developers...</text>
  <rect x="1040" y="46" width="112" height="38" rx="12" fill="#783efe" stroke="#783efe"/>
  <text x="1096" y="69" font-family="Segoe UI, sans-serif" font-size="12" font-weight="bold" fill="#ffffff" text-anchor="middle">Scan All</text>

  <!-- Game Cards -->
  <!-- Card 1 (Active / Hovered) -->
  <rect x="288" y="108" width="160" height="240" rx="16" fill="#181b26" stroke="#783efe" stroke-width="2"/>
  <rect x="300" y="120" width="136" height="180" rx="12" fill="#783efe" fill-opacity="0.25"/>
  <text x="368" y="324" font-family="Segoe UI, sans-serif" font-size="12" font-weight="bold" fill="#ffffff" text-anchor="middle">Hades II</text>

  <!-- Card 2 -->
  <rect x="468" y="108" width="160" height="240" rx="16" fill="#181b26" stroke="#ffffff" stroke-opacity="0.08"/>
  <rect x="480" y="120" width="136" height="180" rx="12" fill="#3b82f6" fill-opacity="0.2"/>
  <text x="548" y="324" font-family="Segoe UI, sans-serif" font-size="12" font-weight="bold" fill="#ffffff" text-anchor="middle">Cyberpunk 2077</text>

  <!-- Card 3 -->
  <rect x="648" y="108" width="160" height="240" rx="16" fill="#181b26" stroke="#ffffff" stroke-opacity="0.08"/>
  <rect x="660" y="120" width="136" height="180" rx="12" fill="#10b981" fill-opacity="0.2"/>
  <text x="728" y="324" font-family="Segoe UI, sans-serif" font-size="12" font-weight="bold" fill="#ffffff" text-anchor="middle">Metroid Dread</text>

  <!-- Card 4 -->
  <rect x="828" y="108" width="160" height="240" rx="16" fill="#181b26" stroke="#ffffff" stroke-opacity="0.08"/>
  <rect x="840" y="120" width="136" height="180" rx="12" fill="#f59e0b" fill-opacity="0.2"/>
  <text x="908" y="324" font-family="Segoe UI, sans-serif" font-size="12" font-weight="bold" fill="#ffffff" text-anchor="middle">Elden Ring</text>

  <!-- Card 5 -->
  <rect x="1008" y="108" width="144" height="240" rx="16" fill="#181b26" stroke="#ffffff" stroke-opacity="0.08"/>
  <rect x="1020" y="120" width="120" height="180" rx="12" fill="#ec4899" fill-opacity="0.2"/>
  <text x="1080" y="324" font-family="Segoe UI, sans-serif" font-size="12" font-weight="bold" fill="#ffffff" text-anchor="middle">Chrono Trigger</text>

  <!-- Banner label -->
  <text x="720" y="480" font-family="Segoe UI, sans-serif" font-size="30" font-weight="bold" fill="#ffffff" text-anchor="middle">Unified Gaming Workspace</text>
  <text x="720" y="520" font-family="Segoe UI, sans-serif" font-size="15" fill="#a1a1aa" text-anchor="middle">Multi-storefront merging, real-time sync, and fluid glassmorphic styling</text>
</svg>"##;
    fs::write(&screen1_path, s1).map_err(|e| e.to_string())?;

    let screen2_path = default_dir.join("screenshot_2.svg");
    let s2 = r##"<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" fill="none">
  <rect width="1200" height="675" fill="#090a0f"/>
  <rect x="36" y="36" width="1128" height="603" rx="20" fill="#12141c" stroke="#ffffff" stroke-opacity="0.1"/>

  <!-- Hero Panoramic Artwork -->
  <rect x="56" y="56" width="1088" height="310" rx="16" fill="#1e2336" stroke="#ffffff" stroke-opacity="0.06"/>
  <rect x="56" y="246" width="1088" height="120" rx="16" fill="#090a0f" fill-opacity="0.8"/>

  <!-- Hero Logo & Launch Button -->
  <text x="86" y="316" font-family="Segoe UI, sans-serif" font-size="38" font-weight="900" fill="#ffffff">SUPER MARIO BROS. WONDER</text>
  <rect x="86" y="336" width="130" height="42" rx="12" fill="#783efe" stroke="#783efe"/>
  <text x="151" y="362" font-family="Segoe UI, sans-serif" font-size="14" font-weight="bold" fill="#ffffff" text-anchor="middle">PLAY GAME</text>

  <rect x="230" y="336" width="140" height="42" rx="12" fill="#ffffff" fill-opacity="0.06" stroke="#ffffff" stroke-opacity="0.1"/>
  <text x="300" y="362" font-family="Segoe UI, sans-serif" font-size="12" font-weight="semibold" fill="#e4e4e7" text-anchor="middle">Nintendo Switch</text>

  <rect x="382" y="336" width="120" height="42" rx="12" fill="#ffffff" fill-opacity="0.06" stroke="#ffffff" stroke-opacity="0.1"/>
  <text x="442" y="362" font-family="Segoe UI, sans-serif" font-size="12" font-weight="semibold" fill="#a1a1aa" text-anchor="middle">24.5 hrs played</text>

  <!-- Details Row & Achievements -->
  <rect x="56" y="400" width="680" height="216" rx="16" fill="#181b26" stroke="#ffffff" stroke-opacity="0.08"/>
  <text x="80" y="434" font-family="Segoe UI, sans-serif" font-size="16" font-weight="bold" fill="#ffffff">About this game</text>
  <text x="80" y="466" font-family="Segoe UI, sans-serif" font-size="13" fill="#a1a1aa">Classic side-scrolling Mario gameplay is turned on its head with the addition of Wonder Flowers.</text>
  <text x="80" y="490" font-family="Segoe UI, sans-serif" font-size="13" fill="#a1a1aa">These game-changing items trigger spectacular moments you have to see to believe.</text>

  <!-- Achievement Strip -->
  <rect x="756" y="400" width="388" height="216" rx="16" fill="#181b26" stroke="#ffffff" stroke-opacity="0.08"/>
  <text x="780" y="434" font-family="Segoe UI, sans-serif" font-size="16" font-weight="bold" fill="#ffffff">Achievements</text>
  <text x="1116" y="434" font-family="Segoe UI, sans-serif" font-size="13" font-weight="bold" fill="#783efe" text-anchor="end">85% Complete</text>

  <rect x="780" y="456" width="340" height="40" rx="10" fill="#ffffff" fill-opacity="0.04"/>
  <text x="830" y="481" font-family="Segoe UI, sans-serif" font-size="12" font-weight="bold" fill="#ffffff">Wonder Seed Collector</text>
  <rect x="780" y="506" width="340" height="40" rx="10" fill="#ffffff" fill-opacity="0.04"/>
  <text x="830" y="531" font-family="Segoe UI, sans-serif" font-size="12" font-weight="bold" fill="#ffffff">Castle Bowser Defeated</text>
</svg>"##;
    fs::write(&screen2_path, s2).map_err(|e| e.to_string())?;

    let screen3_path = default_dir.join("screenshot_3.svg");
    let s3 = r##"<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" fill="none">
  <rect width="1200" height="675" fill="#090a0f"/>
  <rect x="60" y="40" width="1080" height="595" rx="24" fill="#12141c" stroke="#783efe" stroke-opacity="0.4"/>

  <text x="600" y="110" font-family="Segoe UI, sans-serif" font-size="32" font-weight="bold" fill="#ffffff" text-anchor="middle">Themes &amp; Appearance Hub</text>
  <text x="600" y="145" font-family="Segoe UI, sans-serif" font-size="15" fill="#a1a1aa" text-anchor="middle">Live theme hot-reloading, customizable colors, and modular CSS variables</text>

  <!-- Theme Card 1 (Active) -->
  <rect x="120" y="190" width="280" height="340" rx="20" fill="#181b26" stroke="#783efe" stroke-width="2"/>
  <rect x="144" y="214" width="232" height="140" rx="14" fill="#783efe" fill-opacity="0.25"/>
  <text x="144" y="386" font-family="Segoe UI, sans-serif" font-size="18" font-weight="bold" fill="#ffffff">OpenPlay Default</text>
  <text x="144" y="412" font-family="Segoe UI, sans-serif" font-size="12" fill="#71717a">Official dark glassmorphic theme</text>
  <rect x="144" y="440" width="110" height="28" rx="8" fill="#10b981" fill-opacity="0.2" stroke="#10b981" stroke-opacity="0.4"/>
  <text x="199" y="458" font-family="Segoe UI, sans-serif" font-size="11" font-weight="bold" fill="#34d399" text-anchor="middle">CURRENTLY ACTIVE</text>

  <!-- Theme Card 2 -->
  <rect x="440" y="190" width="280" height="340" rx="20" fill="#181b26" stroke="#ffffff" stroke-opacity="0.08"/>
  <rect x="464" y="214" width="232" height="140" rx="14" fill="#e11d48" fill-opacity="0.2"/>
  <text x="464" y="386" font-family="Segoe UI, sans-serif" font-size="18" font-weight="bold" fill="#ffffff">Switch OLED Red</text>
  <text x="464" y="412" font-family="Segoe UI, sans-serif" font-size="12" fill="#71717a">Joy-Con crimson red aesthetic</text>
  <rect x="464" y="440" width="90" height="28" rx="8" fill="#ffffff" fill-opacity="0.06"/>
  <text x="509" y="458" font-family="Segoe UI, sans-serif" font-size="11" font-weight="semibold" fill="#e4e4e7" text-anchor="middle">Apply Theme</text>

  <!-- Theme Card 3 -->
  <rect x="760" y="190" width="280" height="340" rx="20" fill="#181b26" stroke="#ffffff" stroke-opacity="0.08"/>
  <rect x="784" y="214" width="232" height="140" rx="14" fill="#0284c7" fill-opacity="0.2"/>
  <text x="784" y="386" font-family="Segoe UI, sans-serif" font-size="18" font-weight="bold" fill="#ffffff">PlayStation Slate</text>
  <text x="784" y="412" font-family="Segoe UI, sans-serif" font-size="12" fill="#71717a">Clean console minimalism</text>
  <rect x="784" y="440" width="90" height="28" rx="8" fill="#ffffff" fill-opacity="0.06"/>
  <text x="829" y="458" font-family="Segoe UI, sans-serif" font-size="11" font-weight="semibold" fill="#e4e4e7" text-anchor="middle">Apply Theme</text>

  <text x="600" y="580" font-family="Segoe UI, sans-serif" font-size="13" font-mono="true" fill="#783efe" text-anchor="middle">Instant CSS Hot-Reload &bull; JSON Schema Guided &bull; Native .zip Import</text>
</svg>"##;
    fs::write(&screen3_path, s3).map_err(|e| e.to_string())?;

    Ok(())
}

pub fn list_themes(db: &Database) -> Result<Vec<ThemeInfo>, String> {
    let themes_dir = get_themes_dir();
    fs::create_dir_all(&themes_dir).map_err(|e| e.to_string())?;

    let active_theme_id = get_active_theme_id(db);

    let mut results = Vec::new();
    let entries = fs::read_dir(&themes_dir).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let manifest_path = path.join("theme.json");
            if manifest_path.exists() {
                if let Ok(manifest_content) = fs::read_to_string(&manifest_path) {
                    if let Ok(manifest) = serde_json::from_str::<ThemeManifest>(&manifest_content) {
                        let is_active = manifest.id == active_theme_id;
                        let is_builtin = manifest.id == "default";

                        // Resolve absolute path for icon (supporting .svg, .png, .jpg, .jpeg, .webp, .gif)
                        let resolved_icon = if path.join(&manifest.icon).exists() {
                            Some(path.join(&manifest.icon).to_string_lossy().to_string())
                        } else {
                            let stem = Path::new(&manifest.icon)
                                .file_stem()
                                .and_then(|s| s.to_str())
                                .unwrap_or("icon");
                            ["svg", "png", "jpg", "jpeg", "webp", "gif"].iter().find_map(|ext| {
                                let cand = path.join(format!("{}.{}", stem, ext));
                                if cand.exists() {
                                    Some(cand.to_string_lossy().to_string())
                                } else {
                                    None
                                }
                            })
                        };

                        // Resolve absolute paths for screenshots (supporting .gif, .png, .jpg, .jpeg, .webp, .svg)
                        let mut resolved_screenshots = Vec::new();
                        for s in &manifest.screenshots {
                            let s_path = path.join(s);
                            if s_path.exists() {
                                resolved_screenshots.push(s_path.to_string_lossy().to_string());
                            } else {
                                // Fallback check: look for alternate extension on disk (.gif, .png, .jpg, .jpeg, .webp, .svg)
                                let stem = Path::new(s).file_stem().and_then(|st| st.to_str()).unwrap_or("");
                                if !stem.is_empty() {
                                    for ext in &["gif", "png", "jpg", "jpeg", "webp", "svg"] {
                                        let candidate = path.join(format!("{}.{}", stem, ext));
                                        if candidate.exists() {
                                            resolved_screenshots.push(candidate.to_string_lossy().to_string());
                                            break;
                                        }
                                    }
                                }
                            }
                        }

                        // If screenshots array in manifest had missing files or was empty, also scan directory for any screenshot_* or preview_* images!
                        if resolved_screenshots.len() < 3 {
                            if let Ok(dir_entries) = fs::read_dir(&path) {
                                for file_entry in dir_entries.flatten() {
                                    let fpath = file_entry.path();
                                    if fpath.is_file() {
                                        if let Some(ext) = fpath.extension().and_then(|e| e.to_str()) {
                                            let ext_lower = ext.to_lowercase();
                                            if ["gif", "png", "jpg", "jpeg", "webp", "svg"].contains(&ext_lower.as_str()) {
                                                let fstr = fpath.to_string_lossy().to_string();
                                                if !resolved_screenshots.contains(&fstr) {
                                                    let fname = fpath.file_name().and_then(|n| n.to_str()).unwrap_or("");
                                                    if fname.starts_with("screenshot_") || fname.starts_with("preview_") {
                                                        resolved_screenshots.push(fstr);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        // Load user config from SQLite
                        let config_values = get_theme_config(db, &manifest.id).unwrap_or_default();

                        // Read custom CSS content
                        let css_content = manifest.css.as_ref().and_then(|css_name| {
                            let css_path = path.join(css_name);
                            fs::read_to_string(css_path).ok()
                        });

                        results.push(ThemeInfo {
                            manifest,
                            is_active,
                            is_builtin,
                            resolved_icon,
                            resolved_screenshots,
                            config_values,
                            css_content,
                        });
                    }
                }
            }
        }
    }

    // Sort: default first, then alphabetically by name
    results.sort_by(|a, b| {
        if a.manifest.id == "default" {
            std::cmp::Ordering::Less
        } else if b.manifest.id == "default" {
            std::cmp::Ordering::Greater
        } else {
            a.manifest.name.cmp(&b.manifest.name)
        }
    });

    Ok(results)
}

pub fn get_active_theme_id(db: &Database) -> String {
    db.get_setting("active_theme_id")
        .ok()
        .flatten()
        .unwrap_or_else(|| "default".to_string())
}

pub fn set_active_theme(db: &Database, theme_id: &str) -> Result<(), String> {
    db.set_setting("active_theme_id", theme_id)
}

pub fn get_theme_config(db: &Database, theme_id: &str) -> Result<HashMap<String, serde_json::Value>, String> {
    let key = format!("theme_config:{}", theme_id);
    if let Ok(Some(raw)) = db.get_setting(&key) {
        if let Ok(map) = serde_json::from_str::<HashMap<String, serde_json::Value>>(&raw) {
            return Ok(map);
        }
    }
    Ok(HashMap::new())
}

pub fn save_theme_config(db: &Database, theme_id: &str, config_json: &str) -> Result<(), String> {
    let key = format!("theme_config:{}", theme_id);
    db.set_setting(&key, config_json)
}

pub fn delete_theme(db: &Database, theme_id: &str) -> Result<(), String> {
    if theme_id == "default" {
        return Err("Cannot delete the official OpenPlay default theme.".to_string());
    }

    let themes_dir = get_themes_dir();
    let theme_dir = themes_dir.join(theme_id);
    if theme_dir.exists() {
        fs::remove_dir_all(&theme_dir).map_err(|e| format!("Failed to delete theme directory: {}", e))?;
    }

    // Clean up saved config
    let key = format!("theme_config:{}", theme_id);
    let _ = db.set_setting(&key, "{}");

    // If active theme was deleted, fallback to default
    if get_active_theme_id(db) == theme_id {
        set_active_theme(db, "default")?;
    }

    Ok(())
}

pub fn get_theme_css(theme_id: &str) -> Result<String, String> {
    let themes_dir = get_themes_dir();
    let theme_dir = themes_dir.join(theme_id);
    let manifest_path = theme_dir.join("theme.json");
    if !manifest_path.exists() {
        return Err("Theme manifest not found.".to_string());
    }

    let manifest_content = fs::read_to_string(&manifest_path).map_err(|e| e.to_string())?;
    let manifest: ThemeManifest = serde_json::from_str(&manifest_content).map_err(|e| e.to_string())?;

    let css_filename = manifest.css.unwrap_or_else(|| "theme.css".to_string());
    let css_path = theme_dir.join(&css_filename);
    if css_path.exists() {
        fs::read_to_string(&css_path).map_err(|e| e.to_string())
    } else {
        Ok(String::new())
    }
}

pub fn import_theme_zip(db: &Database, zip_path_str: &str) -> Result<ThemeInfo, String> {
    let zip_path = Path::new(zip_path_str);
    if !zip_path.exists() {
        return Err("Selected theme zip file does not exist.".to_string());
    }

    let file = fs::File::open(zip_path).map_err(|e| format!("Failed to open zip file: {}", e))?;
    let mut archive = ZipArchive::new(file).map_err(|e| format!("Invalid zip archive: {}", e))?;

    let temp_import_id = uuid::Uuid::new_v4().to_string();
    let temp_dir = get_themes_dir().join(format!(".temp_theme_{}", temp_import_id));
    fs::create_dir_all(&temp_dir).map_err(|e| format!("Failed to create temporary folder: {}", e))?;

    let canonical_temp = temp_dir.canonicalize().map_err(|e| e.to_string())?;

    // Safe extraction with Zip Slip prevention
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| format!("Corrupt zip entry: {}", e))?;
        let enclosed = match entry.enclosed_name() {
            Some(path) => path.to_owned(),
            None => continue,
        };
        let outpath = canonical_temp.join(enclosed);

        if entry.is_dir() {
            fs::create_dir_all(&outpath).map_err(|e| format!("Failed to create folder: {}", e))?;
        } else {
            if let Some(parent) = outpath.parent() {
                if !parent.exists() {
                    fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent folder: {}", e))?;
                }
            }
            let mut outfile = fs::File::create(&outpath).map_err(|e| format!("Failed to create file: {}", e))?;
            std::io::copy(&mut entry, &mut outfile).map_err(|e| format!("Failed to extract file: {}", e))?;
        }
    }

    // Locate theme.json: check root first, then single top-level directory if present
    let mut root_source = temp_dir.clone();
    let direct_manifest = temp_dir.join("theme.json");
    if !direct_manifest.exists() {
        if let Ok(entries) = fs::read_dir(&temp_dir) {
            let subdirs: Vec<_> = entries
                .flatten()
                .filter(|e| e.path().is_dir())
                .collect();
            if subdirs.len() == 1 {
                let candidate = subdirs[0].path();
                if candidate.join("theme.json").exists() {
                    root_source = candidate;
                }
            }
        }
    }

    let manifest_path = root_source.join("theme.json");
    if !manifest_path.exists() {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err("Theme package is invalid: 'theme.json' not found at root of zip.".to_string());
    }

    let manifest_raw = fs::read_to_string(&manifest_path).map_err(|e| {
        let _ = fs::remove_dir_all(&temp_dir);
        format!("Failed to read theme.json: {}", e)
    })?;

    let manifest: ThemeManifest = serde_json::from_str(&manifest_raw).map_err(|e| {
        let _ = fs::remove_dir_all(&temp_dir);
        format!("Failed to parse theme.json: {}. Please verify json formatting.", e)
    })?;

    // Validate ID
    let theme_id = manifest.id.trim().to_lowercase();
    if theme_id.is_empty() || theme_id == "default" {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err("Invalid theme ID: ID cannot be empty or 'default'.".to_string());
    }
    if !theme_id.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err("Theme ID may only contain lowercase alphanumeric letters, hyphens, and underscores.".to_string());
    }

    // Validate Name, Version, Author, Description
    if manifest.name.trim().is_empty() {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err("Theme manifest must have a non-empty 'name'.".to_string());
    }
    if manifest.version.trim().is_empty() {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err("Theme manifest must have a non-empty 'version'.".to_string());
    }
    if manifest.author.trim().is_empty() {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err("Theme manifest must have a non-empty 'author'.".to_string());
    }
    if manifest.description.trim().is_empty() {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err("Theme manifest must have a non-empty 'description'.".to_string());
    }

    // STRICT VALIDATION: Icon is mandatory and must exist on disk
    if manifest.icon.trim().is_empty() {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err("Theme manifest is missing mandatory 'icon' field.".to_string());
    }
    let icon_file = root_source.join(&manifest.icon);
    if !icon_file.exists() {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err(format!(
            "Theme icon file '{}' specified in theme.json was not found in the package.",
            manifest.icon
        ));
    }

    // STRICT VALIDATION: At least 3 screenshots required and must exist on disk
    if manifest.screenshots.len() < 3 {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err(format!(
            "Themes require at least 3 high-quality screenshots for the preview gallery. Found: {}.",
            manifest.screenshots.len()
        ));
    }
    for (idx, screen) in manifest.screenshots.iter().enumerate() {
        let screen_file = root_source.join(screen);
        if !screen_file.exists() {
            let _ = fs::remove_dir_all(&temp_dir);
            return Err(format!(
                "Screenshot #{}: '{}' specified in theme.json was not found in the package.",
                idx + 1,
                screen
            ));
        }
    }

    // Target destination
    let final_dest = get_themes_dir().join(&theme_id);
    if final_dest.exists() {
        // Replace existing version
        fs::remove_dir_all(&final_dest).map_err(|e| format!("Failed to update existing theme: {}", e))?;
    }

    // Move root_source to final_dest
    if root_source == temp_dir {
        fs::rename(&temp_dir, &final_dest).map_err(|e| format!("Failed to move theme directory: {}", e))?;
    } else {
        fs::rename(&root_source, &final_dest).map_err(|e| format!("Failed to move theme directory: {}", e))?;
        let _ = fs::remove_dir_all(&temp_dir);
    }

    // Return ThemeInfo
    let is_active = get_active_theme_id(db) == theme_id;
    let resolved_icon = Some(final_dest.join(&manifest.icon).to_string_lossy().to_string());
    let resolved_screenshots = manifest
        .screenshots
        .iter()
        .map(|s| final_dest.join(s).to_string_lossy().to_string())
        .collect();
    let config_values = get_theme_config(db, &theme_id).unwrap_or_default();
    let css_content = manifest.css.as_ref().and_then(|css_name| {
        let css_path = final_dest.join(css_name);
        fs::read_to_string(css_path).ok()
    });

    Ok(ThemeInfo {
        manifest,
        is_active,
        is_builtin: false,
        resolved_icon,
        resolved_screenshots,
        config_values,
        css_content,
    })
}
