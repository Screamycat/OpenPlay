# 🎮 OpenPlay — Development Roadmap, Backlog & Bug Tracker

Welcome to the central tracking document for **OpenPlay**. Use this document to easily add new feature ideas, plan architectural or design adjustments, log issues/bugs, and track completed milestones.

---

## ⚡ Quick Inbox (Jot & Dump)
> *For raw thoughts, ideas, or things noticed while working, before organizing them below.*
- [ ] A lot of games dont come with scores, this should be looked into if ther eeven is a fix.

---

## 🚀 Features to Add

### 🔴 High Priority / Next Up
- [x] **Achievements Showcase Tab**: Interactive visual achievement cards with unlock dates and rarity percentages. Should support all stores having and achivments for roms with correct hash.
- [x] **Application config**: A config that saves your settings, layout, last selected game, previous active filters, sorting, and so on. So it's a close, and open back to where you closed.
- [x] **Expanded settings**: Categorized settings that grants full control over OpenPlay. And a API tab for steamgriddb, retroachivements and so on.
- [ ] **Metadata**: It needs to fetch all the metadata and fill all the field in the game settings. It needs support for gathering metadata for non steam games and so on.
- [x] **SFW SteamGridDB**: A NSFW toggle when selecting artwork to show or hide NSFW content.
- [ ] **Playnite backup**: Make it possible to import data from a playnite backup file.
- [x] **Full refresh**: Have a way to fetch minimal data for all games, like description, time played, last played and much more.
- [ ] **Dual launch (Not tested)**: Make it possible to choose on play what exe to launhc. (for mod managers or something other) Much Like playnite actions.
- [ ] **Emulation backup support**: Roms imported from playnite backup appears as local games, once emulators is implemented, roms should be supported through backups as well.
- [ ] **Reocurring backups**: Settings, configs data, metadat and so on shuld be backed up from time to time.
- [ ] **Online saving**: Store all data online. So it's accessible from all devices.
- [ ] **Auto status**: In the completionist status it should feature statuses like,"Untouched", "Forgotten", "In Progress", "Hunting", "Beaten", "Mastered" and "Auto". Auto should auto assign these statuses based on time played and last played and achivements.

### 🟡 Medium Priority / Future Enhancements
- [ ] **Custom Game Integrations (Epic Games / GOG / Xbox)**: Connect accounts or import local installed libraries automatically.
- [ ] **Extention / Theme support**: Open up the application for custom plugins (extention) and themes.
- [ ] **Emulation Scanner & Launch Profiles**: Auto-detect emulator installations (RetroArch, RPCS3, Dolphin, PCSX2, Ryujinx) and ROM paths.
- [x] **Custom Theme Tinting**: Option in Settings to choose primary accent color
- [x] **Trailer Autoplay Controls in Settings**: Option to toggle video trailer autoplay on/off or mute by default.
- [ ] **Controller**: Full gamepad navigation support in desktop mode.
- [ ] **Duplicate merger**: owning the same game on different platforms should not create two slots. Rather, they should conbine and it should be notable by the user that they own it on those platforms. (like duplicate hider in playnite)
- [x] **Hide**: Be able to hide and unhide a game.
- [ ] **Achievement system**: Optional native OpenPlay extention that makes it possible to track achivements for local games?
- [ ] **Custom installer**: Replace the native wizard with a sleek and modern installer. A chance to prepare settings and so on.
- [ ] **Save location**: Add support for finding out where it stores save files and config files.

### 🟢 Backlog & Wishlist
- [ ] **Custom Soundtrack / Background Audio Player**: Play theme music when viewing game details (e.g. from Steam or custom mp3).
- [ ] **Stats & Analytics Dashboard**: Charts showing playtime trends, most played genres, and monthly play history.
- [ ] **Android Support**: An android apk, to view all data on mobile.
- [ ] **Console Mode**: Much like fullscreen mode, only that its main focus is making your pc into a console (big picture mode if you will).
- [ ] **Steam other device**: Right now if you play the a steam game on another device it will update your OpenPlay library to say you recently played it. To avoid confusion a indication could be implemented, like a subtle icon thats only visible o that game was not recently played on the device youre currently on. (Maybe its the same for other integrations like epic?)

### 🎨 UI & Design Polish
- [x] **Tag & Category Filters in Grid**: Expand the quick filter bar to dynamically filter games by clicked genre or category tags.
- [x] **Smooth Transition Animations**: Add smooth animations when switching between games. So it's not just a hard cut but a nice fade or so.
- [x] **Sort-Dropdown**: Have the sort-dropdown menu match the defualt theme, maybe support grouping?
- [x] **OpenPlay Icon**: A proper icon, blue and pruple and represent open game library. (Icon has been made "/public/OpenPlayIcon.svg")
- [x] **Sidebar menu**: The sidebar menu does not currently fit the overall theme with the rest of the application.
- [x] **(Game count)**: Remove the game count next to OpenPlay in the normal window as well as in the sidebar menu.
- [x] **Game settings themeing**: The edit game page does not fit the overall theme. No color icons. Artwork is not showin correctly, they show up asthe defualt iamge icon. Size on disk should not eb a changeable number.
- [x] **Scrollbars**: Hide the scrollbars when not actively scrolling.
- [x] **Installation folder**: Make the installation fodler directory in the details panel cliclable and have it open into file explorer.
- [x] **News**: Work on the News tab, it feels unfinished.
- [x] **Platform icon**: Epic games library games dont have a epic games icon. Rather it has a desktop icon with the text Platform, in the details window. The same goes for upcomming integrations.
- [x] **Description borders**: When companies have rich image in ther description it comes with a border in the OpenPlay details window. This should be removed as it destroys the imersion and intent of the developer. 
- [x] **Right CLick-menu**: Right click-menu does not fit the overall theme. it still on the old bluish tint theme.
- [x] **Scan Games folder old**: Scan games folder uses the super old way of scanning folders, it should be updated to the new explorer window (Windows).
- [x] **Covers sizing**: The covers size slider needs to be able to go larger.
- [x] **Trailer looping**: The trailer needs to loop once fnished.
- [ ] **Accent not dominant**: There are still places in the ui where the accent color is not the dominant color. There should be no "magic" colors.
- [ ] **In game counter for all**: Make in game counter not fixed for only steam games, and open to all platforms.
- [ ] **Launch option on start up (Settings)**: An option in settings to enable start OpenPLay on device boot.

### ⚙️ Performance & Architecture
- [ ] **Image Cache Optimization**: Cache downloaded SteamGridDB posters and logos locally in the application data folder for offline access.
- [ ] **Lazy Loading for Large Libraries**: Virtualize grid cards if libraries exceed 500+ installed games.

### 💡 Quality of Life (QoL)
- [ ]

---

## 🐛 Bug Tracker

### 🔴 Active / Investigating
| ID | Issue Description | Severity | Thoughts / Reproduce | Status |
|:---|:------------------|:--------:|:-------------------|:------:|
| *001* | *Window completely disappears sometimes after restarting the application and imeaditly try to move it.* | Medium | *This can be becasue of VITE or something with the window management?* | Resolved (Ready for Verification) |
| *002* | *Incomming artwork from steam is null in the metadata window* | Small | *Fetching manual steam emtadata* | Resolved
| *003* | *Random selected artwork covers can appear empty* | Small | *This issue  occurance is uknown but is easliy fixed buy restarting, or via VITE update.* | Needs attention

### 🟢 Recently Resolved
- [ ] **Bug 001**: Window completely disappears sometimes after restarting the application and immediately trying to move it. (Removed redundant startDragging mouse-down listeners that collided with Tauri v2 data-tauri-drag-region, and added window screen boundary safeguards in Rust setup).
- [x] **Bug 002**: Incoming artwork from Steam is null in the metadata window. (Added artwork extraction to PartialSteamMetadata, enabled numeric AppID matching and exact title searching, added fallback from vertical poster to header_image, and added full click-to-unselect and visual dimming support in MetadataDiffModal).