A quality-of-life & Linux emulation update for **OpenPlay**, bringing Console Mode display/audio switching, Flatpak/Snap emulator discovery, and merged-library parity.

## What's Changed Since `v1.0.0`

### Added
- **Console Mode Display & Audio Output Routing**: Automatically switch to a configured target display (TV / secondary monitor) and audio output sink when entering Console Mode, and cleanly restore your previous display and audio device when exiting or quitting.
- **Linux Emulator App Discovery (Flatpak / Snap / System)**: Automatically detects installed standalone emulators and RetroArch installations on Linux (including Flatpak & Snap `.desktop` entries) inside the Add Console Wizard and Emulation settings.
- **RetroArch Core Directory & `.so` Resolution**: Parses `retroarch.cfg` (`libretro_directory`) to locate installed `.so` Libretro cores across native and sandboxed RetroArch setups.

### Improved
- **Console Mode Merged Game Parity**: Selecting a specific platform copy of a merged game in Console Mode now preserves shared artwork, descriptions, scores, and HowLongToBeat metadata across siblings just like Desktop Mode.
- **Linux File Pickers**: Added `.so` Libretro core filter support and expanded Linux package/executable filter extensions.
- **Gamepad & Launcher Refinements**: Improved emulator launch argument resolution, controller context handling, and fullscreen restore behavior on target displays.

## Downloads

| Platform | Recommended Installer | Other Formats |
| :--- | :--- | :--- |
| **Windows (x64)** | `OpenPlay-Setup-1.0.1-win-x64.exe` | `OpenPlay-Update-1.0.1-win-x64.zip` *(portable / updater)* |
| **Linux (x64)** | `OpenPlay-Setup-1.0.1-linux-x64.bin` | `OpenPlay-1.0.1-linux-x64.AppImage` · `OpenPlay-1.0.1-linux-x64.deb` · `OpenPlay-Update-1.0.1-linux-x64.zip` |

> **Linux `.bin` quick start:** `chmod +x OpenPlay-Setup-1.0.1-linux-x64.bin && ./OpenPlay-Setup-1.0.1-linux-x64.bin`

**Full Changelog**: https://github.com/Screamycat/OpenPlay/compare/v1.0.0...v1.0.1
