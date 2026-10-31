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
