# 🧩 OpenPlay — Plugin (Extension) Creation & Development Guide

Welcome to the official OpenPlay Plugin Guide! This document provides complete instructions for developing, testing, packaging, and distributing functional extensions and integrations for **OpenPlay**.

---

## 1. Overview & Scope

While **Themes** govern OpenPlay's visual presentation and layout, **Plugins (Extensions) add or change how the application functions**.

Common use cases for OpenPlay plugins:
- **Third-Party Store Integrations**: Import game libraries and playtime from emerging platforms, launchers, or emulators.
- **Metadata & Art Providers**: Fetch metadata, synopses, scores, reviews, or custom artwork from external APIs.
- **Game Lifecycle Automations**: Execute actions when games launch or terminate (e.g. Discord Rich Presence, save game backups, playtime sync).
- **Custom Game Actions**: Add right-click context menu actions (e.g. "Open Mod Directory", "Check PCGamingWiki").
- **Background Services**: Standalone monitoring, cloud syncing hooks, or notification providers.

---

## 2. Plugin Package File Structure

A plugin package is a directory (or compressed `.zip` archive) containing at minimum:

```text
my-plugin/
├── plugin.json         # Plugin manifest and settings schema (REQUIRED)
├── index.js            # Main JavaScript entrypoint (REQUIRED)
├── icon.svg (or .png)  # Plugin icon displayed in OpenPlay Plugins Manager (REQUIRED)
└── preview.png         # Optional screenshot or preview graphic (RECOMMENDED)
```

> [!IMPORTANT]
> **Strict Validation Rules**:
> 1. **`icon` is Mandatory**: You must supply an icon file (e.g. `icon.svg` or `icon.png`) and reference it in `plugin.json`.
> 2. **`entry` is Mandatory**: You must specify an entrypoint file (typically `index.js`) and that file must exist.
> 3. **Unique ID**: The `id` field must be lowercase alphanumeric with hyphens or underscores (e.g. `discord-rich-presence`, `local-achievements`).

---

## 3. The `plugin.json` Manifest Specification

Below is a complete `plugin.json` reference:

```json
{
  "id": "discord-rich-presence",
  "name": "Discord Rich Presence",
  "version": "1.0.0",
  "author": "OpenPlay Community",
  "description": "Displays your current game status, elapsed playtime, and cover art on Discord.",
  "icon": "icon.svg",
  "screenshots": ["preview.png"],
  "entry": "index.js",
  "permissions": [
    "game:read",
    "game:launch",
    "notifications",
    "network:fetch"
  ],
  "settings": [
    {
      "id": "show_elapsed_time",
      "label": "Show Elapsed Playtime",
      "type": "boolean",
      "default": true
    },
    {
      "id": "presence_detail_level",
      "label": "Presence Detail Level",
      "type": "select",
      "options": ["Game Title Only", "Title + Platform", "Full Details"],
      "default": "Full Details"
    },
    {
      "id": "client_id_override",
      "label": "Custom Discord Application Client ID",
      "type": "string",
      "placeholder": "Default application ID...",
      "default": ""
    }
  ]
}
```

### Manifest Fields Reference:
| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `id` | String | **Yes** | Unique identifier (lowercase alphanumeric, hyphens, underscores). |
| `name` | String | **Yes** | Display name shown in OpenPlay Plugins Manager. |
| `version` | String | **Yes** | SemVer string (e.g. `1.0.0`, `1.1.0`). |
| `author` | String | **Yes** | Your developer or team name. |
| `description` | String | **Yes** | Summary of what the plugin does and what features it adds. |
| `icon` | String | **Yes** | Relative path to the icon file (SVG, PNG, or JPG). |
| `entry` | String | **Yes** | Relative path to the entrypoint script (e.g. `"index.js"`). |
| `screenshots` | Array | No | Optional array of preview screenshots. |
| `permissions` | Array | No | List of declared capabilities for user transparency. |
| `settings` | Array | No | Declarative in-app configuration options. |

---

## 4. In-App User Configurable Settings (`settings`)

Plugins can declare in-app configuration options in `plugin.json`. When users click **"Configure"** in the Plugins Manager, OpenPlay automatically generates a clean UI modal where they can change options without editing code or config files.

Supported setting types:
- `boolean`: A toggle switch (e.g. `true` / `false`).
- `select`: A dropdown or segmented choice (requires `options` array).
- `string`: A text input field with optional `placeholder`.
- `number`: A numeric input field.

Settings are persisted in OpenPlay's SQLite database and available to your plugin.

---

## 5. Plugin Entrypoint (`index.js`) & Plugin API

Your entrypoint script runs when the plugin is loaded in OpenPlay via `OpenPlay.registerPlugin`:

```javascript
/**
 * Example OpenPlay Plugin Entrypoint
 */
(function () {
  if (typeof OpenPlay === 'undefined') return;

  OpenPlay.registerPlugin("my-plugin", (api) => {
    console.log("[MyPlugin] Initialized!");

    // 1. Contribute actions to UI slots (e.g. 'edit-game:identifiers')
    api.registerAction("edit-game:identifiers", {
      id: "my-custom-action",
      label: "Custom Action",
      icon: "sparkles", // 'sparkles' | 'trophy' | 'bell' | 'folder' | 'refresh'
      title: "Tool-tip description",
      onClick: async ({ game, installDirectory, sourceId, setSourceId, notify }) => {
        notify("Action triggered for " + game.title);
      }
    });

    // 2. Subscribe to application lifecycle events
    api.on("game:launch", async (game) => {
      console.log("Game launched:", game.title);
    });

    api.on("game:exit", async ({ game, durationSeconds }) => {
      console.log("Game stopped:", game.title, "Played for:", durationSeconds);
    });

    // 3. Managed polling (automatically cleared when plugin is toggled off)
    const timer = api.setInterval(() => {
      // background work
    }, 5000);
  });
})();
```

### Available `api` methods:
- `api.registerAction(slotName, actionDefinition)`: Adds dynamic buttons into OpenPlay UI slots (such as `"edit-game:identifiers"`). When the plugin is disabled, contributed actions are unmounted in real time.
- `api.on(eventName, handler)`: Listens to lifecycle events (`game:launch`, `game:exit`). Automatically unsubscribed on plugin unload.
- `api.setInterval(callback, ms)` / `api.clearInterval(id)`: Managed interval timers that clean up automatically when the plugin is disabled.
- `api.fs.detectSteamAppId(installDir?, gameTitle?)`: Recursively scans game directories for emulator files (`steam_emu.ini`, `steam_appid.txt`, etc.) or searches Steam store by game title.
- `api.achievements.sync(gameId, appId, installDir)`: Syncs local emulator save files with OpenPlay's SQLite database and schema.
- `api.achievements.showOverlay(gameTitle, achievement)`: Dispatches the transparent corner achievement overlay.
- `api.achievements.showTestOverlay(gameTitle, title, desc)`: Triggers a test in-game toast overlay with audio.

---

## 6. How to Package & Distribute Your Plugin

1. Place your files (`plugin.json`, `index.js`, `icon.svg`, and any optional assets) in a folder.
2. Select all files inside the folder and compress them to a `.zip` archive (e.g. `discord-rich-presence-v1.0.0.zip`).
3. In OpenPlay:
   - Open the **Sidebar**.
   - Click **Plugins** (directly under Themes).
   - Click **Import Plugin (.zip)** and select your archive.
   - OpenPlay extracts the plugin into `%APPDATA%/OpenPlay/plugins/<id>/`, validates it, and enables it immediately!

---

## 7. Safety & Isolation Guarantee

OpenPlay wraps plugin execution with React Error Boundaries. If a plugin throws an unhandled exception or encounters an error, it will never crash OpenPlay or produce a white screen. Users can simply toggle off or uninstall the plugin with one click in the Plugins Manager.

---

## 8. Bundled Native Plugins: Local Steam Achievements Watcher (`openplay-local-achievements`)

OpenPlay ships with **Local Steam Achievements Watcher** pre-installed and enabled out of the box:
- **Identifier**: `openplay-local-achievements`
- **Purpose**: Enables games installed outside of store clients (DRM-free copies, local standalone installations, scene emulators like Goldberg, CODEX, Rune, SmartSteamEmu) to track real Steam achievements.
- **Features**:
  - **Non-Invasive File Watcher**: Monitors local emulator save files (`%APPDATA%/Goldberg SteamEmu Saves/`, `%PUBLIC%/Documents/Steam/CODEX/`, etc.) with zero memory hooking or antivirus alerts.
  - **Steam-Style Corner Overlay**: Dedicated transparent desktop overlay window displaying the high-res badge, title, description, rarity percentage, and audio chime.
  - **Retroactive Backfilling**: Automatically discovers and records past unlocks from previous play sessions.
  - **Achievement Hunter Hub Integration**: Instantly updates player level, rarity scores, and game completion status in OpenPlay.
- **Settings**:
  - Enable Corner Overlay (Toggle)
  - Play Notification Chime (Toggle)
  - Display Duration (Seconds)
  - Scan Existing Saves on Startup (Toggle)
