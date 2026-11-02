# 🎮 OpenPlay — Development Roadmap, Backlog & Bug Tracker
Welcome to the central tracking document for **OpenPlay**. Use this document to easily add new feature ideas, plan architectural or design adjustments, log issues/bugs, and track completed milestones.

---

## ⚡ Quick Inbox (Jot & Dump)
> *For raw thoughts, ideas, or things noticed while working, before organizing them below.*
- League of legends from riot games library says uninstalled even when on disk. 

---

## 🚀 Features to Add

### 🔴 High Priority / Next Up
- [x] **Achievements Showcase Tab**: Interactive visual achievement cards with unlock dates and rarity percentages. Should support all stores having and achivments for roms with correct hash.
- [x] **Application config**: A config that saves your settings, layout, last selected game, previous active filters, sorting, and so on. So it's a close, and open back to where you closed.
- [x] **Expanded settings**: Categorized settings that grants full control over OpenPlay. And a API tab for steamgriddb, retroachivements and so on.
- [x] **Metadata**: It needs to fetch all the metadata and fill all the field in the game settings. It needs support for gathering metadata for non steam games and so on.
- [x] **SFW SteamGridDB**: A NSFW toggle when selecting artwork to show or hide NSFW content.
- [x] **Playnite backup**: Make it possible to import data from a playnite backup file.
- [x] **Full refresh**: Have a way to fetch minimal data for all games, like description, time played, last played and much more.
- [x] **Auto status**: In the completionist status it should feature statuses like,"Untouched", "Forgotten", "In Progress", "Hunting", "Beaten", "Mastered" and "Auto". Auto should auto assign these statuses based on time played and last played and achivements.
- [x] **Duplicate merger**: owning the same game on differ,0ent platforms should not create two slots. Rather, they should conbine and it should be notable by the user that they own it on those platforms. (like duplicate hider in playnite)
- [x] **Side menu refresh** All connected libraries should appear in this menu.

### 🟡 Medium Priority / Future Enhancements
- [x] **Custom Theme Tinting**: Option in Settings to choose primary accent color
- [x] **Trailer Autoplay Controls in Settings**: Option to toggle video trailer autoplay on/off or mute by default.
- [x] **Hide**: Be able to hide and unhide a game.
- [ ] **Controller**: Full gamepad navigation support in desktop mode.
- [ ] **Custom installer**: Replace the native wizard with a sleek and modern installer. A chance to prepare settings and so on.

### 🟢 Backlog & Wishlist
- [ ] **Save location**: Add support for finding out where it stores save files and config files.
- [ ] **Console Mode**: Much like fullscreen mode, only that its main focus is making your pc into a console (big picture mode if you will).
- [ ] **Steam other device**: Right now if you play the a steam game on another device it will update your OpenPlay library to say you recently played it. To avoid confusion an indication could be implemented, like a subtle icon thats only visible o that game was not recently played on the device youre currently on. (Maybe its the same for other integrations like epic?)
- [ ] **Feedback button**: A button that lets users send feedback.
- [ ] **Android Support**: An android apk, to view all data on mobile.
- [ ] **Stats & Analytics Dashboard**: Charts showing playtime trends, most played genres, and monthly play history.

### ⚙️ Implemented but Non-Tested Features
- [ ] **Dual launch**: Make it possible to choose on play what exe to launch. (for mod managers or something other) Much Like playnite actions.
- [ ] **Update in app**: Updating should not open a installer, it should update within the app.
- [ ] **Launch option on start up (Settings)**: An option in settings to enable start OpenPLay on device boot.
- [x] **Custom Game Integrations (Epic Games / GOG / Xbox)**: Connect accounts or import local installed libraries automatically.
- [ ] **Online saving**: Store all configs, metadata and settnigs online. So it's accessible from all devices.
- [ ] **Extention / Theme support**: Open up the application for custom plugins (extention) and themes.

### ❓ Ignored Features at This Time
- [ ] **Emulation backup support (Advanced)**: Roms imported from playnite backup appears as local games, once emulators is implemented, roms should be supported through backups as well.
- [ ] **Achievement system**: Optional native OpenPlay extention that makes it possible to track achivements for local games.

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
- [x] **Accent not dominant**: There are still places in the ui where the accent color is not the dominant color. There should be no "magic" colors.
- [x] **In game counter for all**: Make in game counter not fixed for only steam games, and open to all platforms.
- [x] **Cover favorite icon**: The yellow star icon in the top right corner of game covers should be white instead of yellow.
- [x] **Platform Icons**: Xbox, Epic, GOG, Battle.net are in need of a upgraded, high res icon. Ubisoft, EA, Riot Games all says Local PC with defualt icon, they should recive similar treatment.
- [x] **Title image percentage**: Instead of the title image being confined  to pixels, it should be confiend to a max of 50% of the heros width and 65% of the heros height.
- [x] **Ontouched games in hub**: Untouched games in the achivement hub should not be in calcualtion for things like avarege completion and unlocked count etc.
- [x] **Sidebar version number** The version number in the bottom sidebar is not automatically synced.
---

## 🐛 Bug Tracker
| ID | Issue Description | Severity | Thoughts / Reproduce | Status |
|:---|:------------------|:--------:|:-------------------|:------:|
| 001 | *Window completely disappears sometimes after restarting the application and imeaditly try to move it.* | Medium | *This can be becasue of VITE or something with the window management?* | Resolved |
| 002 | *Incomming artwork from steam is null in the metadata window* | Small | *Fetching manual steam emtadata* | Resolved
| 003 | *Random selected artwork covers can appear empty* | Small | *This issue  occurance is uknown but is easliy fixed buy restarting, or via VITE update.* | Testing fix
| 004 | *Animated artwork covers are null (with the iamge icon) in places like game settings and achivement hub* | Medium | *This happens only with animated covers, which should be animated in these instances* | Resolved
| 005 | *Animated covers in the grid view that is not installed is not grey like static covers are* | Medium | *Animated covers should match the grayscale affect of the static covers when not installed* | Resolved
| 006 | *More often than usual the window refuses top open. Its icon is visible in the task bar, only a click apon it does nothing.* | High | *When this happens OpenPlay is still running in the background, and a restart is required to open the window again.* | Testing fix
| 007 | *When importing a playnite backup, if chosen not to import example, artwork. All artwork for the already existing games gets removed and set to empty* | High | *When importing playnite backups it should never be destructive, it should on replace the data that was selected to be imported. Unless the existing data has already been modified by the user. User modification always goes first.* | Testing fix
| 008 | *When importing a playnite backup, if that game already exists, instad of merging or replacing data. It makes a new platform cell of the same platform.* | High | *When importing playnite backups, it should check the existing unique id from the import file and match it to the exists. This fix also need to fix the already broken library entries that now conissts of multiple libraries of the same platform.* | Testing fix
| 009 | *When having "minimize openplay" active it dose not appear again when game is closed* | Medium | *If this option is active it should also open openplay backup when the game is no longer running.* | Needs attention
| 010 | *GOG is not saving metadata or artwork, or is simply overwriting metadata with its own useless metadata* | Medium | *It should not do this.* | Needs attention