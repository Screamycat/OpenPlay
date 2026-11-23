The first full stable release of **OpenPlay** — an open-source, offline-first game library manager and launcher built for **Windows** and **Linux**.

## Highlights

- **Cross-Platform Electron + Rust Core (`openplay-core`)**: Migrated the desktop shell to hardware-accelerated Electron (Chromium Skia) backed by a dedicated Rust daemon, bringing native Linux & SteamOS support (including Wine/Proton prefixes, DXVK/VKD3D, GameMode, and MangoHud) alongside Windows.
- **Fullscreen Console Mode (`F12`)**: A couch- and ultrawide-ready (`16:9`–`32:9`) big-picture experience with a customizable boot splash, local profiles with a game-aware avatar picker, horizontal carousel & 2:3 cover grid, `LB`/`RB` filter presets, fullscreen game details, synthesized UI sounds, and its own built-in **`console-default`** theme.
- **Save Location Discovery & Cloud Saves**: Automatic save/config detection across Windows, Linux XDG, Steam/Proton `compatdata`, Wine prefixes, and emulators (with cached PCGamingWiki lookups and manual routing), plus per-game opt-in SHA-256 deduplicated `.zip` save snapshots synced through your own cloud folder.
- **Custom Cross-Platform Installer Wizard**: A themed, offline-capable installer for Windows and Linux with Express or Custom setup, system menu/shortcut registration, and an optional Quick Setup step for Cloud Sync and metadata API keys.

## What's Changed Since `v0.1.4`

### Added
- **Fullscreen Console Mode & Dual-Mode Themes**: Independent Desktop and Console theme tabs in the Themes Manager with live hot-reloading and the protected built-in `console-default` theme.
- **Desktop Controller & Gamepad Support**: Full 2D spatial/zone navigation in Desktop Mode with automatic Xbox/PlayStation/Nintendo button glyphs, contextual prompt bar, on-screen virtual keyboard, controller file browser, custom keybind remapping, and automatic suspension while in-game.
- **Cross-OS Save Discovery & Versioned Cloud Saves**: Automatic backup/restore snapshots on Play & Exit with retention pruning, newer-peer detection before launch, and local pre-restore safety backups.
- **Other-Device Play Indicator**: Subtle indicator on recently played titles when the last session occurred on a different device.
- **Custom Installer Wizard & Linux Packages**: Self-extracting themed installers for Windows (`.exe`) and Linux (`.bin`), plus standalone Linux `.AppImage` and `.deb` builds.
- **Feedback & Bug Reports**: New feedback card under **Settings → About OpenPlay** that pre-fills GitHub bug reports and feature requests with opt-in OS/version diagnostics.
- **RetroAchievements Refresh**: Added RetroAchievements to the library refresh menu when signed in.

### Improved
- **In-App Auto-Updater (Windows & Linux)**: Coordinated Electron + `openplay-core` shutdown before applying updates, atomic `.part` download verification, and OS-aware asset selection (`.zip`/`.exe` on Windows; `.AppImage`/`.zip` on Linux).
- **Verified Cloud Sync & Store Integrations**: Validated Multi-Leader CRDT cloud sync across devices along with Epic Games, GOG, and Xbox integrations.
- **Linux Desktop Integration**: Proper application icon, `StartupWMClass`, and `.desktop` launcher registration so OpenPlay appears natively in system application search.

### Fixed
- Fixed window failing to restore after exiting a game when **Minimize OpenPlay on game launch** is enabled.
- Fixed taskbar restore issue where clicking the taskbar icon could fail to reopen the window.
- Fixed random blank covers occurring on selected artwork.
- Fixed double-clicking filter/sort dropdowns and UI panels accidentally maximizing the window.
- Fixed Linux showing a generic Wayland icon instead of the OpenPlay icon.
- Fixed Riot Games (League of Legends) installed-state detection and improved non-destructive Playnite backup & GOG metadata handling.

## Downloads

| Platform | Recommended Installer | Other Formats |
| :--- | :--- | :--- |
| **Windows (x64)** | `OpenPlay-Setup-1.0.0-win-x64.exe` | `OpenPlay-Update-1.0.0-win-x64.zip` *(portable / updater)* |
| **Linux (x64)** | `OpenPlay-Setup-1.0.0-linux-x64.bin` | `OpenPlay-1.0.0-linux-x64.AppImage` · `OpenPlay-1.0.0-linux-x64.deb` · `OpenPlay-Update-1.0.0-linux-x64.zip` |

> **Linux `.bin` quick start:** `chmod +x OpenPlay-Setup-1.0.0-linux-x64.bin && ./OpenPlay-Setup-1.0.0-linux-x64.bin`

**Full Changelog**: https://github.com/Screamycat/OpenPlay/compare/v0.1.4...v1.0.0
