<div align="center">

# 🎮 OpenPlay

### *The next-generation open-source game launcher and library manager.*  
**Native Windows & Linux • Moving Cover Art • Built-in Superpowers • Zero Bloat**

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Electron](https://img.shields.io/badge/Desktop-Electron-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Rust](https://img.shields.io/badge/Backend-Rust-DEA584?logo=rust&logoColor=white)](https://www.rust-lang.org)
[![React 19](https://img.shields.io/badge/Frontend-React_19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Platform](https://img.shields.io/badge/Platforms-Windows_%7C_Linux-555555?logo=linux&logoColor=white)](#the-cross-platform--linux-advantage)

---

</div>

<br />

## 🌟 The Landscape: Where OpenPlay Fits

PC gaming has been shaped by outstanding open-source projects, and we hold deep respect for what each has pioneered:
- **Playnite** set the benchmark on Windows for library aggregation, detailed database customization, and extensible community plugins.
- **Lutris** has long been the Linux champion for deep Wine prefix tuning, custom runner management, and community installation scripts.
- **Heroic Games Launcher** established an indispensable cross-platform client for downloading and updating Epic Games and GOG titles without official store launchers.

However, as gaming setups evolve across Windows desktops and Linux handhelds (like the Steam Deck), players often find themselves caught between trade-offs:
- **Playnite is locked to Windows**: Built on Microsoft WPF/.NET, it cannot run natively on Linux, SteamOS, or the Steam Deck without cumbersome, brittle compatibility layers. It also suffers from heavy **extension setup fatigue**—requiring users to install, configure, and maintain 10+ separate plugins just for artwork, achievements, completion stats, and trailers.
- **Lutris is Linux-centric**: While unrivaled for low-level Wine configuration, it is not available on Windows and offers a utilitarian desktop interface without modern visual polish, animated covers, or unified achievement tracking.
- **Heroic is a store client, not a unified library aggregator**: Heroic is designed primarily for downloading and playing Epic, GOG, and Amazon titles. It does not aggregate full Steam libraries, emulated retro legacy, or unified multi-store collections.

**OpenPlay is engineered to bridge these worlds:**
A blazing-fast, cross-platform sanctuary for your entire game collection built on **Electron (Chromium GPU Skia)** and a high-performance **Rust Core Daemon** (`openplay-core`). It eliminates setup fatigue by delivering the features players care about most—animated video covers, an integrated achievement hub, live Steam player counts, HowLongToBeat completion metrics, YouTube trailers, duplicate collapsing, and full retro support—**built directly into its core with zero plugins required.**

---

## 📸 Visual Showcase

<div align="center">

### 🖥️ Desktop Split View
*A sleek split layout designed for responsive library exploration. Navigate an adaptive grid of animated cover art on the left, paired with an immersive glassmorphic hero backdrop on the right featuring transparent clear logos, live Steam player counts, HowLongToBeat completion metrics, user and critic review scores, community patch notes, and instant video trailers.*

<img src="https://i.imgur.com/3xwQqDW.gif">

---

### 🎨 Live SteamGridDB Asset Explorer
*Search, preview, and apply community-curated vertical covers, heroes, transparent clear logos, and animated WebM posters directly inside OpenPlay. Includes style categorization, and instant 1-click downloads with zero manual asset management.*

<img src="https://i.imgur.com/bVsgGNL.jpeg">

---

### 🏆 Achievements Hub
*Track your gaming legacy across modern storefronts and retro emulators in a single unified hall of fame. View global unlock rates, trophy rarity tiers, total gamerscore, and milestone completion percentages across Steam and RetroAchievements in real time.*

<img src="https://i.imgur.com/6NA0erk.png">

---

### 🕹️ Native Emulation & Smart ROM Scanner
*Seamlessly manage your retro collection alongside modern PC titles. OpenPlay automatically detects installed standalone emulators (Dolphin, PCSX2, DuckStation, RPCS3, mGBA, PPSSPP, Cemu, Ryujinx, Eden) and RetroArch Libretro cores. Point to any ROM directory: OpenPlay strips dump release tags, deduplicates multi-track `.bin` files, matches console platforms with dedicated hardware badges, and extracts local boxart or scrapes from SteamGridDB.*

---

### 🎨 Dual-Mode Theme Engine (Desktop & Console Themes)
*Personalize Desktop Mode and Console Mode independently with live stylesheet hot-reloading, dedicated Desktop & Console tabs in the Themes Manager, and an immutable built-in **OpenPlay Console** Theme (`console-default`). Tweak geometry (poster corner radius, card scale, ultrawide content safe-zone, background dim/blur), smoke tints, and accent colors with real-time CSS variable bindings, or drop in custom `.zip` Desktop or Console theme packages.*

---

### 🎮 Native Desktop Controller & Gamepad Navigation
*Full keyboard-and-mouse parity from your controller in Desktop Mode. Navigate the 2D game grid, details pane, top bar, context menus, and multi-tab modals using Spatial + Zone navigation with seamless edge-crossing. Includes auto-detected Xbox, PlayStation, and Nintendo button glyphs, an auto-hiding contextual prompt bar, a built-in On-Screen Virtual Keyboard, an in-app Controller File & Folder Browser, automatic input suspension during gameplay, and full button remapping in Settings.*

---

### 📺 Fullscreen Console Mode (`F12`)
*A dedicated fullscreen TV & ultrawide console interface built to look crisp on both standard 16:9 TVs and 32:9 ultrawide monitors. Toggle anytime with `F12` or from the Sidebar, or start directly into Console Mode:*
- **Custom Boot Splash & Local Profile Screen**: Built-in OpenPlay boot animation (swappable with any `.mp4`/`.webm` video), offline local profiles with an ambient moving backdrop (also customizable to any looping video), and a **Game-Aware Profile Icon Picker** pulling icons and covers from your installed games & ROMs.
- **Horizontal Carousel & Expanded 2:3 Cover Grid**: Full-bleed crossfading Hero Artwork paired with standard 2:3 vertical Steam-ratio game cards, `LB`/`RB` filter presets, cinematic fullscreen Game Details (`Overview`, `Achievements`, `Trailers`, `News`), subtle synthesized UI audio cues, and a Console System Menu (`Start`) with OS power controls.

</div>

---

## ⚔️ Head-to-Head Comparison: OpenPlay vs. Playnite vs. Lutris vs. Heroic

Every launcher has its own design philosophy and purpose. Here is how they compare across the capabilities that matter most to players looking for a dedicated library manager:

| Capability / Feature | **OpenPlay** | **Playnite** | **Lutris** | **Heroic Games Launcher** |
| :--- | :---: | :---: | :---: | :---: |
| *Platform & Architecture* | | | | |
| **Windows Support** | ✅ **Native** | ✅ **Native** | ❌ *No* | ✅ **Native** |
| **Linux & SteamOS / Steam Deck** | ✅ **Native** | ❌ *Windows Only* | ✅ **Native** | ✅ **Native** |
| **Technology Stack** | **Electron + Rust Core Daemon + React 19** | C# / WPF (.NET) | Python + GTK | Electron (Chromium + Node.js) |
| **Memory Footprint (Idle)** | 🟢 **Optimized (~180–240MB with Skia GPU)** | 🟡 Moderate (~180–300MB) | 🟢 Low (~120–200MB) | 🔴 Higher (~350–600MB) |
| **100% Offline-First (Local SQLite)** | ✅ **Yes (Zero Telemetry)** | ✅ **Yes** | ✅ **Yes** | ✅ **Yes** |
| **Setup Experience** | ⚡ **All-in-One Out of Box** | 🔌 Requires 10+ Plugins | ⚙️ Runner / Script Setup | ⚡ Store Login Out of Box |
| *Library Unification & Management* | | | | |
| **Universal Multi-Store Aggregator** | ✅ **All Stores + Local + Retro** | 🔌 Requires Store Plugins | ⚠️ Runner / Script Scraper | ❌ Epic, GOG & Amazon only |
| **Native Emulation & ROM Scanner** | ✅ **Built-in (RetroArch & Standalones)** | 🔌 Built-in / Plugins | 👑 Runner Engine | ❌ *No* |
| **Duplicate Merger across Stores** | ✅ **Built-in (Interactive Platform Tabs)** | 🔌 Requires Plugin | ❌ Separate entries | ❌ N/A |
| **Playnite Backup Importer (.zip)** | ✅ **Built-in (1-Click Migration)** | ✅ Native Export | ❌ N/A | ❌ N/A |
| **Zero-Downtime Snapshots & Backups** | ✅ **Built-in (Auto-rotation & portable .openplaybackup)** | 🔌 Extensions / Manual | ❌ Manual file copy | ❌ N/A |
| **Cross-Device Cloud Sync (Folder Sync)** | ✅ **Built-in (Multi-Leader CRDT & PN-Counter)** | 🔌 Third-party scripts | ❌ Manual rsync | ❌ N/A |
| **Save Location Discovery & Cloud Save Versioning** | ✅ **Built-in (Cross-OS Auto-Detect, Manual Routing & Latest-X Snapshots)** | 🔌 Third-party (Ludusavi plugin) | ❌ Manual | ✅ Built-in (Store Cloud Saves) |
| **Direct Store Downloading & Cloud Saves** | ⚠️ Directs to Store / Native Launch | ⚠️ Directs to Store Client | 🔌 Custom Scripts | 👑 **Built-in (Legendary/Nile)** |
| **Wine / Proton Prefix Tuning** | ⚠️ Direct Execution / Steam Proton | ❌ N/A | 👑 **Advanced Deep Runner Tuning** | ✅ Integrated Wine/Proton Tools |
| **Visuals, Media & Metadata** | | | | |
| **Animated & Moving Video Covers** | ✅ **Built-in (WebM, MP4, APNG, GIF)** | ❌ Static Only  | ❌ Static Only | ❌ Static Only |
| **In-App SteamGridDB Asset Explorer** | ✅ **Built-in (Animation support)** | 🔌 Requires Plugin  | ⚠️ Basic Scraper | ⚠️ Basic Image Selection |
| **In-App Video Trailers** | ✅ **Built-in (Store / YouTube / Video files)** | 🔌 Requires Plugin | ❌ *No* | ❌ *No* |
| **HowLongToBeat Completion Metrics** | ✅ **Built-in** | 🔌 Requires Plugin | ❌ *No* | ✅ Built-in (HLTB API) |
| **Live Concurrent Player Counts** | ✅ **Built-in (All platforms via title matching)** | 🔌 Requires Plugin | ❌ *No* | ❌ *No* |
| **Theme & Visual Customization** | ✅ **Built-in (Dual-Mode Desktop & Console Themes Manager, 3+ Screenshot Gallery, .zip Import & In-App Config)** | 🔌 Requires Custom Themes | ❌ GTK Theme only | ⚠️ Fixed Palettes |
| **Plugin & Extension Architecture** | ✅ **Built-in (Dedicated Plugins Manager, .zip Import & In-App Config)** | 🔌 Extensive Plugins | ⚠️ Community Scripts | ❌ *No* |
| **Critic & User Review Scores** | ✅ **Built-in (OpenCritic & Steam)** | 🔌 Requires Plugin | ❌ *No* | ❌ *No* |
| *Trophies & Achievements* | | | | |
| **Unified Achievement Hub** | ✅ **Built-in (Global Hall of Fame)** | 🔌 Requires Plugin | ❌ *No* | ❌ *No* |
| **RetroAchievements Integration** | ✅ **Built-in (Console Trophies & Rarity)** | ❌ *No* | ❌ *No* | ❌ *No* |
| **Cross-Store Achievement Switching** | ✅ **Built-in (Per-Platform Tabs)** | ❌ *No* | ❌ *No* | ❌ *No* |
| *Power Features* | | | | |
| **Dual Launch / Multi-Action Play** | ✅ **Built-in (Action Menu)** | ✅ Built-in (Play Actions) | ✅ Runner Arguments | ⚠️ Basic Alternate Exe |
| **Native Desktop Controller Navigation** | ✅ **Built-in (2D Spatial + Zone Nav, Auto Glyphs, Virtual Keyboard, File Browser & Keybind Remapping)** | ⚠️ Fullscreen Mode Only | ❌ *No* | ✅ Built-in (Gamepad UI) |
| **Fullscreen Console Mode (TV & Ultrawide)** | ✅ **Built-in (`F12` Toggle, Boot Video, Local Profiles, Horizontal Carousel + 2:3 Grid, Console Themes & Power Menu)** | ✅ Built-in (Windows Only) | ❌ *No* | ❌ *No* |
| **In-App Patch Notes & News Feed** | ✅ **Built-in** | 🔌 Requires Plugin | ❌ *No* | ❌ *No* |
| **Non-Intrusive Background Library Sync** | ✅ **Built-in (Startup & multi-device periodic sync with gameplay pause)** | 🔌 Requires Plugins / Scripts | ❌ Manual Refresh | ⚠️ Manual Store Refresh |

### 🧭 Which One Is Right For You?
- **Choose Playnite** if you game exclusively on Windows, love deep custom theme scripting (XAML), and enjoy curating a tailored library with dozens of community extensions.
- **Choose Lutris** if you game on Linux and your highest priority is low-level Wine prefix customization, manual DLL overrides, running retro installer scripts, and complex compatibility tuning.
- **Choose Heroic Games Launcher** if you specifically want a dedicated open-source client to download, update, and manage your Epic Games, GOG, and Amazon Prime libraries on Linux or macOS without the official store launchers.
- **Choose OpenPlay** if you want a **blazing-fast, unified gaming sanctuary across both Windows and Linux** that delivers a complete, visually stunning experience (animated covers, trailers, unified achievements, HowLongToBeat, and cross-platform store merging) **instantly out of the box without being bloated.**

---

## 🐧 The Cross-Platform & Linux Advantage

OpenPlay is powered by a high-performance **Rust Core Daemon** (`openplay-core`) communicating seamlessly with an **Electron** front-end shell utilizing Chromium's hardware-accelerated Skia 2D/3D rasterizer:

- **Stable, Predictable Memory Footprint**: Isolated GPU texture processing and native media streaming (<250MB RAM).
- **Flawless 144Hz Video & Artwork**: Smooth native playback for animated WebM, WebP, APNG, and MP4 cover art with zero external codecs or GStreamer configuration.
- **Native Wayland & X11 Compatibility**: Runs cleanly across Arch, Ubuntu, Fedora, Nobara, and SteamOS.
- **Standalone Linux Game Execution**: Run Windows (`.exe`) games directly via Wine or Proton with isolated per-game prefixes, DXVK/VKD3D translation, optional Feral GameMode (`gamemoderun`), and MangoHud overlay without requiring external frontends like Lutris or Heroic.
- **Seamless Steam Deck Experience**: Built to look stunning on both high-DPI desktop monitors and portable handheld screens.
- **Respects User Privacy**: 100% offline-first. Your library database (`SQLite`) lives strictly on your machine. Zero telemetry, zero tracking, zero mandatory accounts.

---

## 🔄 The Playnite Migration Vision

Switching library managers shouldn't mean losing years of playtime stats, custom tags, and curated artwork. 

We have developed a **1-click Playnite Backup Importer**:
1. Import Playnite's most recent backup file.
2. OpenPlay parses your categories, completion states, playtime records, and artwork links.
3. Your entire library is instantly ready on Windows or native Linux with zero setup friction.

> With more migration to come?
---

## ☁️ Cross-Device Cloud Sync & Zero-Downtime Backups

OpenPlay is designed from the ground up to respect user sovereignty and privacy:

### 🔄 Multi-Leader Offline-First Cloud Sync
- **Zero Proprietary Cloud Lock-In**: Sync seamlessly across your desktop PC, Steam Deck, or handheld using your own cloud folder (OneDrive, Syncthing, Dropbox, Google Drive, Nextcloud, or a local network NAS).
- **No SQLite File Corruption**: Avoids raw database file syncing over cloud drives. Each device writes exclusively to its own state file (`devices/<device_id>.json`) via atomic temporary writes.
- **PN-Counter Playtime & Monotonic Last Played CRDTs**: Tracks session playtimes as monotonic per-device maps and merges `last_played` dates monotonically across formats—retaining accurate play history even on devices without connected third-party store clients.
- **Two-Pass Tombstones & Curated Metadata LWW**: Deletions cleanly propagate across peer devices while completion states (`Beaten`, Auto Story Beaten), favorites, ratings, tags, and notes take precedence over uncurated local scanner passes.
- **Themes, Plugins & Portable Settings Sync**: Automatically packages and syncs custom installed `.zip` themes and plugins, active theme/plugin states, per-extension settings, and portable UI/app preferences (plus optional opt-in metadata API keys).
- **Content-Addressed Artwork Sync**: Local custom artwork is deduplicated and hashed using SHA-256 (`custom://<sha256>.<ext>`) so every device in the cluster shares artwork with zero duplicate bandwidth.
- **Physical vs. Logical Isolation**: Storefront OAuth logins, physical install directories, executable paths, and per-device custom save paths remain strictly device-local.
- **Cross-OS Save Discovery & Versioned Cloud Saves**: Automatically detects save & config directories across Windows, Linux XDG, Steam `userdata` / Proton `compatdata`, OpenPlay Wine prefixes, and configured emulators (with cached PCGamingWiki lookup and manual multi-folder routing). Games opted in per-title automatically push SHA-256 deduplicated `.zip` snapshots on Play and Exit while keeping the latest `X` versions, checking for newer peer saves before launch, and creating local pre-restore safety backups.

### 🛡️ Live Snapshots & Portable Bundles
- **Live `VACUUM INTO` Snapshots**: Creates consistent, zero-downtime database snapshots with configurable rotation and retention limits.
- **Portable `.openplaybackup` Bundles**: Export and import your entire collection—including custom configurations and achievement histories—in a single portable zip archive.

---

## 🏗️ Architecture & Tech Stack

```mermaid
graph TD
    UI[Frontend: React 19 + TypeScript + Tailwind CSS]
    SHELL[Desktop Shell: Electron + Hardware Skia 2D/3D]
    DAEMON[Backend Daemon: openplay-core Rust Engine]
    DB[(SQLite: Local Storage)]
    EXT[External APIs & Scanners: Steam / Epic / GOG / Xbox / Battle.net / EA / Ubisoft / Riot / Amazon / Google Play / Roblox / RetroAchievements / IGDB / SteamGridDB / HLTB]
    PROC[OS Process Lifecycle Monitor]

    UI <--> SHELL
    SHELL <-->|Fast JSON-RPC stdio| DAEMON
    DAEMON <--> DB
    DAEMON <--> EXT
    DAEMON <--> PROC
```

- **Runtime & Desktop Shell**: [Electron](https://www.electronjs.org/) with Chromium GPU hardware acceleration and zero-copy custom protocol streaming (`openplay://file/...`)
- **Backend Core**: [Rust](https://www.rust-lang.org/) daemon (`openplay-core`) managing multi-store scrapers, ChaCha20-Poly1305 sync, emulation engines, and background tasks
- **Database**: Embedded local SQLite via `rusqlite` with offline-first indexing
- **Frontend Framework**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) with decoupled custom themes and Anti-Softlock immunity safeguards
- **Media Pipeline**: Native hardware-accelerated video/animation pipeline for looping WebM, WebP, APNG, and YouTube trailers

---

## 🚀 Getting Started (Development)

### Prerequisites

Ensure you have the following installed on your machine:
- **Node.js** (v18+ recommended) & `npm`
- **Rust & Cargo** ([rustup.rs](https://rustup.rs/))
- **Windows**: [Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
- **Linux**: Standard build tools (`build-essential`, `curl`, `wget`, `file`, `libssl-dev`)

### Installation (Windows & Linux)

Download the latest release from **[GitHub Releases](https://github.com/Screamycat/OpenPlay/releases)**:
- **Windows**: Run `OpenPlay-Setup-<version>-win-x64.exe` (custom OpenPlay installer wizard with optional quick-setup for Cloud Sync & API keys).
- **Linux**: Run `OpenPlay-Setup-<version>-linux-x64.bin` (custom OpenPlay installer wizard), or grab the standalone `.AppImage` or `.deb` package.

### Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Screamycat/OpenPlay.git
   cd OpenPlay
   ```

2. **Install frontend dependencies:**
   ```bash
   npm install
   ```

3. **Launch in development mode (Vite + Electron + `openplay-core`):**
   ```bash
   npm run dev
   ```

4. **Build production frontend & Electron shell:**
   ```bash
   npm run build:all
   ```

---

## 📜 License & Open Source Philosophy

OpenPlay is proudly free and open source under the **[GNU General Public License v3.0 (GPLv3)](./LICENSE)**.

### Our Stance on Forks & Contributions:
- **Extensions & Themes**: We enthusiastically encourage community members to create custom themes, extensions, and integrations. Check out our **[Theme Creation Guide](./docs/THEMES.md)** and **[Plugin Creation Guide](./docs/PLUGINS.md)** with starter templates!
- **Copyleft Protection**: GPLv3 guarantees that OpenPlay and any derivative works remain **permanently open source and free**.
- **No Commercial Exploitation**: You may not take OpenPlay, close the source code, slap a new name on it, and sell or redistribute it as your own closed product.
- **Forks**: Legitimate forks created to fix critical issues, improve accessibility, or contribute upstream back to the community are warmly welcomed.

---

<div align="center">
  <sub>Built with passion for power gamers who love their collections.</sub>
</div>