# 🎮 OpenPlay v0.1.1 — Smooth Scrolling Overhaul & RetroAchievements

OpenPlay is an open-source, offline-first cross-platform game library manager and launcher engineered for modern PCs and handhelds. Built on **Tauri v2 + Rust + React 19**, OpenPlay provides a blazing-fast, lightweight sanctuary for your entire game collection without unnecessary bloat.

---

### ✨ What's New in v0.1.1

#### ⚡ Ultra-Smooth 60/120 FPS Grid & Details Scrolling ("Like Butter!")
- **Hardware-Accelerated Animated Artwork**: Added automatic background optimization that converts heavy 20MB–30MB SteamGridDB APNG and GIF animated covers into lightweight, hardware-decoded `.webm` video streams (`optimize_animated_artwork`).
- **CDN-Level Image Downscaling**: Optimized Epic Games and remote store covers with server-side sizing parameters (`?h=540&resize=1`), eliminating client-side image downsampling lags.
- **Pre-Rendered Backdrop Blur Caching**: Replaced live full-screen Gaussian blur recalculations on every scroll tick with an ultra-fast canvas LRU cache (`blurredCanvasCache`).
- **Grid Virtualization & Containment**: Cards below the fold leverage CSS `content-visibility: auto` and `contain-intrinsic-size`, and offscreen `<video>` elements pause automatically using `IntersectionObserver` to preserve GPU bandwidth.
- **Rendering Pipeline Polish**: Replaced scrolling CSS `backdrop-filter` passes with high-performance dark tint fills and replaced Gaussian drop-shadow card shine with pure GPU linear gradients.

#### 🏆 RetroAchievements Integration
- **Retro Achievements in Hunter Hub**: Retro console achievements, points, and unlock timestamps are now fully integrated and accounted for in the Achievement Hunter Hub and TopNav trophy level/score.
- **Live User Sync**: 1-Click "Sync RetroAchievements Now" in Settings -> APIs & Services, with automatic sync support in the unified Hunter Hub "Sync Achievements" workflow.
- **Retro Platform Badging**: RetroAchievements games feature dedicated platform badges (`RETRO`), rich metadata, box art, title screens, and unlock history.

#### 👤 Creator Attribution & Ownership
- Standardized **ScreamyCat** as author, creator, and lead developer across OpenPlay documentation, settings, and release manifests.

---

### 📦 Installation (Windows)

1. Download `OpenPlay_0.1.1_x64-setup.exe` below.
2. Run the installer to install or upgrade OpenPlay on your system.
3. Enjoy blazing-fast, buttery smooth game management!
