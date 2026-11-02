# 🎮 OpenPlay v0.1.4 — Modular Theme Architecture, Live Customization & Visual Overhaul

OpenPlay is an open-source, offline-first cross-platform game library manager and launcher engineered for modern PCs and handhelds. Built on **Tauri v2 + Rust + React 19**, OpenPlay provides a blazing-fast, lightweight sanctuary for your entire game collection without unnecessary bloat.

---

### ✨ What's New in v0.1.4

#### 🎨 Modular Theme Engine & Live In-App Customization
- **Decoupled Extension Architecture**: The default visual aesthetic is now completely decoupled into a standalone theme extension. The core application provides foundational hooks (`[data-theme-part="..."]`) and CSS variable bindings (`--theme-*`, `--app-*`), unlocking full freedom to craft themes ranging from minimal clean interfaces to complete console OS conversions (e.g. Nintendo Switch UI).
- **Dynamic Settings & Appearance Tab**: The Appearance tab in OpenPlay Settings dynamically mirrors the active theme's `theme.json` configuration, organizing options into intuitive category tabs (*Aesthetics & Colors*, *Layout & Sizing*, *Game Cards & Posters*, *Windows & Modals*) with live preview synchronization and zero hardcoded settings.
- **Theme Manager & Hot-Reloading**: Full-featured in-app Themes Manager with multi-screenshot showcases, lightbox viewer, one-click theme application, native `.zip` theme import, and instant CSS hot-reloading.
- **Developer Theme Starter Template**: Includes [`docs/THEME_STARTER_TEMPLATE/`](./docs/THEME_STARTER_TEMPLATE/) with a documented `theme.json` schema, `theme.css` token reference, and vector preview assets.

#### 🕹️ Official Platform SVGs & Emulation Decoupling
- **35+ High-Fidelity Official Platform SVGs**: Completely replaced all generic gamepad/controller icons across the app with crisp official SVGs for Steam, Epic Games, GOG Galaxy, Xbox, Battle.net, EA App, Ubisoft Connect, Riot Games, Amazon Games, PlayStation (PS1, PS2, PS3, PSP, PS Vita), Nintendo (Switch, SNES, NES, N64, GameCube, Wii, Wii U, Game Boy, GBA, DS, 3DS), Sega (Genesis, Saturn, Dreamcast), Atari, and RetroAchievements.
- **Dedicated Console Cells for Emulation**: Emulated games are no longer clumped together under generic RetroAchievements labels. Nintendo Switch games (Eden, Yuzu, Ryujinx) display authentic Nintendo Switch platform cells and branding; PS2, SNES, and other consoles display their respective hardware identities.
- **Add Console Wizard & Emulators Polish**: Cleaned up the Add Console & ROMs dialog and Emulators & Consoles tabs with platform SVGs, consistent "Scan Folder" action buttons, and individual system directories.

#### 📐 Proportional Artwork Geometry & Hero Scaling
- **Fluid Logo Scaling**: Replaced static pixel limits on game title logos with responsive percentage constraints (max 50% width and 65% height of the hero banner), avoiding awkward cutoff across window sizes and ultra-wide displays.
- **Configurable Hero Aspect Ratios**: Choose between Panoramic (96:31), Widescreen (16:9), Ultrawide (21:9), or Hidden banners directly in theme settings.

#### 🏆 Achievement Hub & Progression Accuracy
- **Smart Level Calculations**: Games with 0 unlocks ("untouched games") are now intelligently excluded from average completion percentage and player level calculations, aligning with modern gaming platform standards.
- **Vertical Alignment Polish**: Achievement points, trophy icons, and unlock rarity badges have been vertically aligned and given clean typographic hierarchy.

#### ⚙️ Consistency & Polish Across Views
- **Library Integrations & Managers**: Standardized layout, terminology, and brand palettes across all providers (Steam blue, Xbox green, GOG purple, Epic dark, RetroAchievements gold). Removed redundant labels ("Active"/"Connected") and retired legacy custom shortcuts in favor of clean subtle active states.
- **Configurable Last Played Format**: Added a setting to display last played timestamps as clean Date Only (`YYYY-MM-DD`) or Date + Time (`YYYY-MM-DD • HH:mm`).
- **Sidebar Version Sync**: The Left Drawer footer dynamically reads the application version directly from the runtime package metadata.

---

### 📦 Installation (Windows)

1. Download `OpenPlay_0.1.4_x64-setup.exe` below.
2. Run the installer to install or upgrade OpenPlay on your system (future updates will install automatically in-app!).
3. Enjoy an open, offline-first gaming experience!

---

# 🎮 OpenPlay v0.1.3 — Offline-First Cloud Sync, CRDT Online Saving & Zero-Downtime Backups

OpenPlay is an open-source, offline-first cross-platform game library manager and launcher engineered for modern PCs and handhelds. Built on **Tauri v2 + Rust + React 19**, OpenPlay provides a blazing-fast, lightweight sanctuary for your entire game collection without unnecessary bloat.

---

### ✨ What's New in v0.1.3

#### ☁️ Offline-First Multi-Leader Cloud Sync & Online Saving
- **Zero Proprietary Cloud Lock-In**: Sync seamlessly across your desktop PC, Steam Deck, or gaming handheld using your own storage provider (OneDrive, Syncthing, Dropbox, Google Drive, Nextcloud, or a local network NAS).
- **Conflict-Free Per-Device Topology**: OpenPlay completely avoids raw database file syncing over cloud drives. Each device writes exclusively to its own atomic state file (`devices/<device_id>.json`), eliminating file collisions (`conflicted copy`) forever.
- **PN-Counter Playtime CRDT**: Monotonic per-device playtime tracking (`playtime_by_device`). Play offline on your Steam Deck and desktop simultaneously—sessions accumulate conflict-free without overwriting or losing hours. Pre-sync hours are migrated into a reserved `"legacy"` key to prevent double-counting.
- **Two-Pass Tombstone Deletion Engine**: Game deletions cleanly propagate across peer devices while user metadata edits take precedence over stale deletions.
- **Content-Addressed Artwork & Public CDN Optimization**: Local custom box art is SHA-256 hashed and exported to `custom_artwork/<sha256>.<ext>`, while standard store assets (Steam, Epic, GOG) resolve directly to high-speed public CDN URLs (e.g. Steam Akamai CDN) with zero cloud storage wasted. Automated orphan pruning cleans up obsolete assets automatically.
- **Physical vs. Logical Isolation**: Syncs ratings, tags, notes, playtimes, completion statuses, and UI themes across devices while keeping physical install directories and executable paths strictly device-local.
- **Dedicated Cloud Sync Settings**: Configure your shared sync folder, customize device identities, view all connected peer devices with real-time last-active timestamps, and trigger manual or automated background syncs.

#### 🛡️ Zero-Downtime Local Backups & Portable Bundles
- **Live SQLite Snapshots**: Automated `VACUUM INTO` backup engine creates consistent database snapshots without interrupting active gaming sessions.
- **Configurable Retention**: Automated backup frequency (daily, weekly, startup) with automated retention pruning.
- **Portable `.openplaybackup` Bundles**: 1-click export and import of your entire collection (games, achievements, configured consoles, and configurations) in a single portable zip archive.

#### 🧭 Dynamic Categorized Sidebar Refresh
- **Dynamic Storefront Detection**: The Refresh flyout now automatically categorizes authenticated stores (Steam, Epic, GOG, Xbox, Battle.net, EA, Ubisoft, Riot, Amazon) with individual rescan triggers.
- **Consoles & Retro Subheader**: Dedicated rescan triggers for RetroAchievements and configured console profiles (PS2, GameCube, SNES, etc.) to refresh ROM directories seamlessly.

---

### 📦 Installation (Windows)

1. Download `OpenPlay_0.1.3_x64-setup.exe` below.
2. Run the installer to install or upgrade OpenPlay on your system (future updates will install automatically in-app!).
3. Enjoy an open, offline-first gaming experience!
