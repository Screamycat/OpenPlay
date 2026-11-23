# 🎮 OpenPlay v1.0.0 — First Full Release

OpenPlay is now **v1.0.0** — an open-source, offline-first game library manager and launcher for **Windows** and **Linux**.

---

## ✨ What's New Since `v0.1.4`

### 📺 Fullscreen Console Mode (`F12`) & Console Themes
- Dedicated fullscreen TV and ultrawide (`16:9` → `32:9`) interface toggleable anytime with `F12`, from the sidebar, or at launch.
- Custom **OpenPlay Boot Splash** & **Local Profile Screen** with customizable looping video backdrops and a game-aware profile icon picker.
- **Horizontal Carousel & 2:3 Cover Grid**, `LB`/`RB` filter presets, cinematic game details (`Overview`, `Achievements`, `Trailers`, `News`), synthesized UI audio cues, and a Console System Menu (`Start`).
- Immutable built-in **`console-default`** theme alongside independent Desktop & Console tabs in the **Themes Manager**.

### 🎮 Native Desktop Controller & Gamepad Navigation
- Full 2D spatial + zone navigation across the desktop grid, details pane, top bar, context menus, and modals.
- Auto-detected Xbox, PlayStation, and Nintendo glyphs, contextual prompt bar, On-Screen Virtual Keyboard, Controller File & Folder Browser, automatic input suspension while in-game, and full keybind remapping in Settings.

### ☁️ Cross-OS Save Discovery & Versioned Cloud Saves
- Automatic save & config folder discovery across Windows, Linux XDG, Steam `userdata` / Proton `compatdata`, OpenPlay Wine prefixes, and emulators (with cached PCGamingWiki lookup and manual multi-folder routing).
- Per-game opt-in SHA-256 deduplicated `.zip` save snapshots on Play & Exit with retention pruning, newer-peer detection before launch, and pre-restore local safety backups.

### 🚀 Custom Cross-Platform Installer Wizard
- Modern, OpenPlay-themed installer for **Windows** (`OpenPlay-Setup-1.0.0-win-x64.exe`) and **Linux** (`OpenPlay-Setup-1.0.0-linux-x64.bin`), alongside standalone `.AppImage` and `.deb` packages.
- Supports **Express Install** or **Custom Setup**, user-local installation (keeping your library database untouched across updates), desktop/menu/startup shortcuts, and an optional **Quick Setup** step to pre-configure Cloud Sync and API keys (SteamGridDB, RetroAchievements, IGDB).

### 🔄 Reliable In-App Auto-Updater (Windows & Linux)
- Coordinated Electron + `openplay-core` shutdown before applying updates (eliminating file-lock and timing races), atomic `.part` download verification, and full support for Windows `.zip`/`.exe` and Linux `.AppImage`/`.zip` updates.

### 💬 Feedback & Bug Reports + Quality-of-Life Polish
- New **Feedback & Bug Reports** card under **Settings → About OpenPlay** with Bug/Feature templates and opt-in OS/version diagnostic info (including Linux distro detection).
- Auto completion status with **Story Beaten** detection, subtle other-device play indicators, updated `README.md` showcase, and `openplay-core` networking improvements.

---

## 📦 Downloads

- **Windows**: `OpenPlay-Setup-1.0.0-win-x64.exe` *(Custom Installer Wizard)* or `OpenPlay-Update-1.0.0-win-x64.zip`
- **Linux**: `OpenPlay-Setup-1.0.0-linux-x64.bin` *(Custom Installer Wizard)*, `OpenPlay-1.0.0-linux-x64.AppImage`, or `OpenPlay-1.0.0-linux-x64.deb`
