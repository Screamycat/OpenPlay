# 🎮 OpenPlay — Development Roadmap, Backlog & Bug Tracker

Welcome to the central tracking document for **OpenPlay**. Use this document to easily add new feature ideas, plan architectural or design adjustments, log issues/bugs, and track completed milestones.

---

## ⚡ Quick Inbox (Jot & Dump)
> *For raw thoughts, ideas, or things noticed while working, before organizing them below.*
- [ ] 

---

## 🚀 Features to Add

### 🔴 High Priority / Next Up
- [ ] **Custom Game Integrations (Epic Games / GOG / Xbox)**: Connect accounts or import local installed libraries automatically.
- [ ] **Grid Multi-Select & Batch Actions**: Select multiple games in the grid (Ctrl/Shift-Click) to edit tags, bulk refresh metadata, or bulk categorize.
- [ ] **Trailer Autoplay Controls in Settings**: Option to toggle video trailer autoplay on/off or mute by default.
- [ ] **Custom Theme Tinting**: Option in Settings to choose primary accent color (Cyan, Violet, Emerald, Rose, Amber).

### 🟡 Medium Priority / Future Enhancements
- [ ] **Emulation Scanner & Launch Profiles**: Auto-detect emulator installations (RetroArch, RPCS3, Dolphin, PCSX2, Ryujinx) and ROM paths.
- [ ] **Steam Cloud Sync Status Indicator**: Show cloud save sync status before and after launching a game.
- [ ] **Achievements Showcase Tab**: Interactive visual achievement cards with unlock dates and rarity percentages.
- [ ] **Global Search Palette (Ctrl+K / Command Palette)**: Quick launcher dialog to jump to any game instantly by keyboard.

### 🟢 Backlog & Wishlist
- [ ] **Controller / Big Picture Navigation**: Full gamepad navigation support for couch gaming / handhelds.
- [ ] **Custom Soundtrack / Background Audio Player**: Play theme music when viewing game details (e.g. from Steam or custom mp3).
- [ ] **Stats & Analytics Dashboard**: Charts showing playtime trends, most played genres, and monthly play history.

---

## 🛠️ Changes & Refinements to Make

### 🎨 UI & Design Polish
- [ ] **Tag & Category Filters in Grid**: Expand the quick filter bar to dynamically filter games by clicked genre or category tags.
- [ ] **Smooth Transition Animations**: Add subtle spring view transitions when switching between Split View and Full Grid View.
- [ ] **Custom Scrollbar Aesthetics**: Further tune scrollbars to remain ultra-subtle and auto-hide when not scrolling.

### ⚙️ Performance & Architecture
- [ ] **Image Cache Optimization**: Cache downloaded SteamGridDB posters and logos locally in the application data folder for offline access.
- [ ] **Lazy Loading for Large Libraries**: Virtualize grid cards if libraries exceed 500+ installed games.

### 💡 Quality of Life (QoL)
- [ ] **Keyboard Shortcuts**:
  - `Space` or `Enter` to launch selected game
  - `F` to toggle favorite
  - `Ctrl+E` to open Game Properties
  - `F5` to refresh active library
- [ ] **Right-Click Context Menu Polish**: Add "Create Desktop Shortcut" option to the right-click cover menu.

---

## 🐛 Bug Tracker

### 🔴 Active / Investigating
| ID | Issue Description | Severity | Steps to Reproduce | Status |
|:---|:------------------|:--------:|:-------------------|:------:|
| *Example* | *Describe issue here* | Medium | *1. Step one...* | Investigating |

### 🟢 Recently Resolved
- [x] **Game Exit State Stuck on "Running"**: Process lifetime monitoring loop updated to track real-time Windows candidate executables, with a 2-second heartbeat sync to automatically return the button to "Play" when closed.
- [x] **Artwork Overwritten on Library Refresh**: SQLite queries hardened to protect manual and custom artwork (`cover_image`, `hero`, `logo`) during automated scans.
- [x] **Trailers Auto-Importing from Steam**: Disabled automatic background trailer downloads; trailers are now managed exclusively on-demand.
- [x] **Right-Click Cover Menu**: Added full glassmorphic context menu at point of click across grid cards, details poster, and table rows.
- [x] **Bottom Action Bar Order**: Reordered buttons to: `Star (Favorite) -> Dots (...) -> Settings -> Play`.
- [x] **Game Settings Overhaul**: Completely transformed the single-column edit modal into a 7-tabbed properties dialog with native Windows file/folder pickers.

---

## 📋 Quick Templates (Copy & Paste)

### ➕ New Feature Template
```markdown
- [ ] **Feature Name**: Brief description of the feature and how it improves OpenPlay.
  - *Details / Requirements*: Specific behaviors, UI placement, or API requirements.
```

### 🔄 Change Request Template
```markdown
- [ ] **Change Description**: What should change and why.
  - *Target Component / Area*: (e.g. GameDetails, TopNav, GameGrid)
  - *Expected Behavior*: How it should look or behave after the change.
```

### 🐞 Bug Report Template
```markdown
- [ ] **Bug Title**: What went wrong.
  - *Expected*: What should happen.
  - *Actual*: What actually happened.
  - *Steps to Reproduce*:
    1. ...
    2. ...
```
