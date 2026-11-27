# 🎮 OpenPlay — Development Roadmap, Backlog & Bug Tracker
Welcome to the central tracking document for **OpenPlay**. Use this document to easily add new feature ideas, plan architectural or design adjustments, log issues/bugs, and track completed milestones.

---

## ⚡ Quick Inbox (Jot & Dump)
> *For raw thoughts, ideas, or things noticed while working, before organizing them below.*

---

## 🚀 Features to Add

### 🔴 High Priority / Next Up

### 🟡 Medium Priority / Future Enhancements
- [ ] **Android Support**: An android apk, to view all data on mobile.

### 🟢 Backlog & Wishlist

### ⚙️ Implemented but Non-Tested Features
- [ ] **Dual launch**: Make it possible to choose on play what exe to launch. (for mod managers or something other) Much Like playnite actions.
- [ ] **Update in app**: Updating should not open a installer, it should update within the app.
- [ ] **Launch option on start up (Settings)**: An option in settings to enable start OpenPLay on device boot.
- [ ] **Extention / Theme support**: Open up the application for custom plugins (extention) and themes.

### ❓ Ignored Features at This Time
- [ ] **Stats & Analytics Dashboard**: Charts showing playtime trends, most played genres, and monthly play history.
- [ ] **Emulation backup support (Advanced)**: Roms imported from playnite backup appears as local games, once emulators is implemented, roms should be supported through backups as well.
- [ ] **Achievement system**: Optional native OpenPlay extention that makes it possible to track achivements for local games.

### 🎨 UI & Design Polish
- [ ] **Size on disk is wrong**: On linux the size on disk is clearly not calcualted based on teh folder, its too small.

---

## 🐛 Bug Tracker
| ID | Issue Description | Severity | Thoughts / Reproduce | Status |
|:---|:------------------|:--------:|:-------------------|:------:|
| 007 | *When importing a playnite backup, if chosen not to import example, artwork. All artwork for the already existing games gets removed and set to empty* | High | *When importing playnite backups it should never be destructive, it should on replace the data that was selected to be imported. Unless the existing data has already been modified by the user. User modification always goes first.* | Testing fix
| 008 | *When importing a playnite backup, if that game already exists, instad of merging or replacing data. It makes a new platform cell of the same platform.* | High | *When importing playnite backups, it should check the existing unique id from the import file and match it to the exists. This fix also need to fix the already broken library entries that now conissts of multiple libraries of the same platform.* | Testing fix
| 010 | *GOG is not saving metadata or artwork, or is simply overwriting metadata with its own useless metadata* | Medium | *It should not do this.* | Testing fix