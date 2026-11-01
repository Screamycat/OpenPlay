# 🎨 OpenPlay — Theme Creation & Customization Guide

Welcome to the official OpenPlay Theme Guide! This document provides everything you need to know to create, customize, package, and distribute themes for **OpenPlay**.

---

## 1. Overview & Philosophy

In OpenPlay, **Themes control the presentation, styling, and visual structure of the application**. 
With themes, you have full creative control to:
- **Color**: Override the color palette, background shades, borders, gradients, and interactive glow effects.
- **Move & Reposition**: Rearrange UI elements using modern CSS Flexbox and Grid layouts.
- **Size**: Change card proportions, sidebar dimensions, border radiuses, and font sizes.
- **Create & Decorate**: Inject custom decorative artwork, backdrop overlays, ambient effects, or scanlines.
- **Remove & Hide**: Conceal elements you don't want visible for minimal, distraction-free setups.

Themes are 100% safe, declarative, hot-reloadable, and can be imported directly into OpenPlay via a single `.zip` file.

---

## 2. Theme Package File Structure

A theme package is a directory (or compressed `.zip` archive) containing at minimum:

```text
my-cool-theme/
├── theme.json                          # Theme metadata and customizable settings schema (REQUIRED)
├── theme.css                           # Custom CSS stylesheet (REQUIRED)
├── icon.svg (or .png / .jpg / .gif)   # Theme icon displayed in OpenPlay Themes Manager (REQUIRED)
├── screenshot_1.gif (or .png / .jpg)   # Preview screenshot 1 (REQUIRED)
├── screenshot_2.jpg (or .png / .webp)  # Preview screenshot 2 (REQUIRED)
└── screenshot_3.png (or .jpg / .svg)   # Preview screenshot 3 (REQUIRED)
```

> [!IMPORTANT]
> **Strict Validation Rules**:
> 1. **`icon` is Mandatory**: You must supply an icon file (supporting `.svg`, `.png`, `.jpg`, `.jpeg`, `.webp`, or `.gif`) and reference it in `theme.json`.
> 2. **At Least 3 Screenshots**: OpenPlay's showcase carousel strictly requires **a minimum of 3 high-quality screenshots or animated GIFs** (supporting `.gif`, `.png`, `.jpg`, `.jpeg`, `.webp`, or `.svg`). Animated `.gif` screenshots are fully supported for moving showcase previews!
> 3. **Unique ID**: The `id` field must be lowercase alphanumeric with hyphens or underscores (e.g. `nord-frost`, `cyberpunk-neon`).

---

## 3. The `theme.json` Manifest Specification

Below is a complete, fully commented `theme.json` reference:

```json
{
  "id": "nord-frost",
  "name": "Nord Frost",
  "version": "1.0.0",
  "author": "Arctic Dev",
  "description": "An arctic, clean north-bluish palette with softened borders and glass card glows.",
  "icon": "icon.svg",
  "screenshots": [
    "screenshot_1.png",
    "screenshot_2.png",
    "screenshot_3.png"
  ],
  "css": "theme.css",
  "colors": {
    "accent": "#88c0d0",
    "panel_tint": "#2e3440",
    "background": "#242933"
  },
  "settings": [
    {
      "id": "card_border_radius",
      "label": "Game Card Corner Radius",
      "type": "select",
      "options": ["Sleek (8px)", "Rounded (16px)", "Ultra Rounded (24px)"],
      "default": "Rounded (16px)"
    },
    {
      "id": "enable_card_glow",
      "label": "Card Hover Glow",
      "type": "boolean",
      "default": true
    },
    {
      "id": "glass_intensity",
      "label": "Frosted Glass Blur",
      "type": "select",
      "options": ["Subtle (12px)", "Standard (24px)", "Intense (48px)"],
      "default": "Standard (24px)"
    },
    {
      "id": "custom_accent_override",
      "label": "Custom Accent Override",
      "type": "color",
      "default": "#88c0d0"
    }
  ]
}
```

### Manifest Fields Reference:
| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `id` | String | **Yes** | Unique identifier (lowercase alphanumeric, hyphens, underscores). |
| `name` | String | **Yes** | Display name shown in OpenPlay. |
| `version` | String | **Yes** | SemVer string (e.g. `1.0.0`, `1.2.1`). |
| `author` | String | **Yes** | Your developer or community name. |
| `description` | String | **Yes** | Summary of the theme's aesthetics and features. |
| `icon` | String | **Yes** | Relative path to the icon file (SVG, PNG, or JPG). |
| `screenshots` | Array | **Yes** | Array of relative image paths. **Must contain at least 3 entries.** |
| `css` | String | No | Stylesheet filename (defaults to `"theme.css"`). |
| `colors` | Object | No | Key-value mapping of color overrides (e.g. `accent`, `panel_tint`, `background`). |
| `settings` | Array | No | Declarative in-app configuration options. |

---

## 4. In-App User Configurable Settings (`settings`)

OpenPlay allows theme creators to declare configurable settings directly in `theme.json`. When users click **"Theme Settings"** in the OpenPlay Themes Manager, the app automatically generates a clean UI with toggles, sliders, color pickers, and dropdowns.

Supported setting types:
- `boolean`: A toggle switch (e.g. `true` / `false`).
- `select`: A segmented choice or dropdown (requires `options` array).
- `color`: An interactive hex color picker.
- `number`: A numeric input or slider (supports `min`, `max`, `step`).
- `text`: A text input field.

### How Settings Connect to CSS:
When a user changes a setting, OpenPlay automatically exposes it as a root CSS variable:
```css
/* Automatically generated for you */
:root {
  --theme-opt-enable_card_glow: 1; /* or 0 */
  --theme-opt-custom_accent_override: #88c0d0;
  --theme-card-radius: 16px;
  --theme-glass-blur: 24px;
}
```

You can reference these variables in your `theme.css`:
```css
.my-card {
  border-radius: var(--theme-card-radius, 16px);
  filter: blur(var(--theme-glass-blur, 24px));
}
```

---

## 5. Writing `theme.css`

When your theme is active, OpenPlay sets an attribute on the root HTML tag:
`[data-theme-id="<your-theme-id>"]`

### Built-in CSS Variables You Can Override:
```css
[data-theme-id="nord-frost"] {
  /* Primary Accent & Tinting */
  --app-accent-color: #88c0d0;
  --accent: #88c0d0;
  --app-panel-tint: #2e3440;

  /* Card Geometry & Spacing */
  --theme-card-radius: 16px;
  --theme-surface-glow: rgba(136, 192, 208, 0.25);
}
```

### Moving and Rearranging UI Elements:
You can use modern CSS Grid and Flexbox ordering to reposition elements:
```css
/* Move game details action bar to the top */
[data-theme-id="nord-frost"] .game-details-header {
  display: flex;
  flex-direction: column-reverse;
}

/* Swap side order in split view */
[data-theme-id="nord-frost"] .openplay-split-container {
  flex-direction: row-reverse;
}
```

### Semantic UI Part Selectors (`data-theme-part`):
OpenPlay provides semantic data attributes so themes can target and customize specific areas without brittle class dependencies:

| Selector | Targets |
| :--- | :--- |
| `[data-theme-part="modal-backdrop"]` | The backdrop overlay for all open dialogs and modals. |
| `[data-theme-part="modal-container"]` | The modal window container card. |
| `[data-theme-part="settings-modal"]` | The Settings dialog overlay. |
| `[data-theme-part="themes-modal"]` | The Themes Manager dialog overlay. |
| `[data-theme-part="plugins-modal"]` | The Plugins Manager dialog overlay. |
| `[data-theme-part="library-manager-modal"]` | The Library Manager dialog overlay. |
| `[data-theme-part="edit-game-modal"]` | The Edit Game metadata dialog overlay. |
| `[data-theme-part="sidebar"]` | The sliding navigation sidebar drawer. |
| `[data-theme-part="game-card"]` | Individual game poster cards in the grid. |

Example customization:
```css
/* Custom modal glass border and backdrop glow */
[data-theme-id="nord-frost"] [data-theme-part="modal-container"] {
  border: 1px solid rgba(136, 192, 208, 0.3) !important;
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.9), 0 0 30px rgba(136, 192, 208, 0.15) !important;
}
```

### Hiding Elements:
```css
/* Hide game count badges for an ultra-minimal look */
[data-theme-id="nord-frost"] .theme-game-counter {
  display: none !important;
}
```

---

## 6. How to Package & Distribute Your Theme

1. Put your files (`theme.json`, `theme.css`, `icon.svg`, and 3 screenshots) into a folder.
2. Select all the files inside the folder (or right-click the folder itself) and choose **Compress to ZIP file**.
3. Name your zip file (e.g. `nord-frost-v1.0.0.zip`).
4. In OpenPlay:
   - Open the **Sidebar**.
   - Click **Themes**.
   - Click **Import Theme (.zip)** and select your archive.
   - OpenPlay validates the package, extracts it into `%APPDATA%/OpenPlay/themes/<id>/`, and immediately displays it in the gallery!

---

## 7. Troubleshooting & Validation FAQ

**Q: Why was my theme import rejected?**
- Verify `screenshots` contains at least 3 image entries, and that all 3 files exist inside the zip.
- Verify `icon` is specified and the icon file exists.
- Ensure `theme.json` is valid JSON (no trailing commas).

**Q: Can I update an already installed theme?**
- Yes! If you import a zip with the same `id`, OpenPlay replaces the theme files while preserving the user's custom in-app configuration settings.
