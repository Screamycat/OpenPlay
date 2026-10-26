# 🎮 OpenPlay v0.1.2 — In-App Auto Updater, Multi-Platform Merging & Bug Squashing

OpenPlay is an open-source, offline-first cross-platform game library manager and launcher engineered for modern PCs and handhelds. Built on **Tauri v2 + Rust + React 19**, OpenPlay provides a blazing-fast, lightweight sanctuary for your entire game collection without unnecessary bloat.

---

### ✨ What's New in v0.1.2

#### 🔄 In-App Auto-Updater
- **Zero-Manual-Installer Updating**: No more downloading setup files through the browser. OpenPlay can now download updates and silently apply them in-app (`/S`), restarting directly back into the updated version.
- **Top Bar Notification Pill**: A subtle pill appears directly to the left of the Achievement Hub button when a new version is detected, taking you directly to the release page.
- **Dynamic About Page**: Read full changelogs and release notes right inside Settings.
- **Interactive Progress Transformation**: The update button transforms into a live download progress bar with percentage and downloaded MB / total MB metrics, transitioning cleanly into a **`Restart Now`** action upon 100% completion.

#### 🔀 Multi-Platform Merging & Visual Status Differentiation
- **Merged Game Providers**: Titles owned on multiple stores or emulated platforms (e.g., *Banjo-Kazooie* across Local PC and RetroAchievements) now display all platforms simultaneously (`LOCAL PC` + `RETRO`).
- **Installed vs. Cloud Hierarchy**: Installed platforms are highlighted with a crisp, subtle white border and subtle ambient glow, while uninstalled or cloud platforms display translucent styling.

#### 🏆 RetroAchievements & Library Integrations Polish
- **Rate-Limiting & Full Sync**: Added automatic exponential backoff retry on HTTP 429 rate-limiting and paced requests, ensuring complete library and achievement imports without dropped titles.
- **Library Integrations Reorganization**: Moved RetroAchievements out of the generic API settings into the dedicated Library Integrations & Managers hub alongside Steam and Epic Games.
- **Epic Games Library**: Added dedicated "Sync Epic Games Library" flow and cleaned up redundant UI notices.

#### 🎯 Completion Status Overhaul
- **Claim Beaten**: Streamlined "Claim Beaten" flow housed directly in game properties under *Score & Playtime*.
- **Hunting Override**: Active achievement hunting dynamically overrides Beaten status.
- **Calm, Minimal UI**: Removed redundant status pills and "Privacy" labels for a cleaner, calmer design.

#### 🐛 Bug Fixes
- **Bug 001**: Resolved window disappearance bug on restart caused by mouse-down listeners colliding with Tauri v2 drag regions.
- **Bug 002**: Resolved null incoming Steam artwork in the metadata comparison modal.
- **Bug 003**: Resolved blank/black game cards caused by transient CDN errors; cards now gracefully render clean title + Gamepad icon fallbacks with error recovery.
- **Bug 004**: Resolved broken image icons on animated artwork covers across Game Settings, Achievement Hunter Hub, Achievement Details, and Metadata modals by adding universal `.webm` and `.mp4` hardware-accelerated video playback.

---

### 📦 Installation (Windows)

1. Download `OpenPlay_0.1.2_x64-setup.exe` below.
2. Run the installer to install or upgrade OpenPlay on your system (future updates will install automatically in-app!).
3. Enjoy an open, offline-first gaming experience!
