import { invoke } from "@tauri-apps/api/core";
import { ConsolePreset } from "../types/emulator";

export const CONSOLE_PRESETS: ConsolePreset[] = [
  // NINTENDO
  {
    id: "nes",
    name: "Nintendo Entertainment System",
    manufacturer: "Nintendo",
    year: 1985,
    retroachievements: true,
    popular_rank: 6,
    extensions: ["nes", "unf", "fds", "zip", "7z"],
    emulators: [
      {
        name: "RetroArch (Mesen)",
        emulator_type: "retroarch",
        default_args: '-L "cores/{core}" "{rom_path}"',
        recommended_core: "mesen_libretro.dll",
        core_options: ["mesen_libretro.dll", "fceumm_libretro.dll", "nestopia_libretro.dll"],
      },
      {
        name: "Mesen (Standalone)",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
      {
        name: "FCEUX (Standalone)",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
      {
        name: "Custom Standalone",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
    ],
  },
  {
    id: "snes",
    name: "Super Nintendo Entertainment System",
    manufacturer: "Nintendo",
    year: 1990,
    retroachievements: true,
    popular_rank: 2,
    extensions: ["sfc", "smc", "fig", "swc", "zip", "7z"],
    emulators: [
      {
        name: "RetroArch (Snes9x)",
        emulator_type: "retroarch",
        default_args: '-L "cores/{core}" "{rom_path}"',
        recommended_core: "snes9x_libretro.dll",
        core_options: ["snes9x_libretro.dll", "bsnes_libretro.dll", "bsnes_hd_beta_libretro.dll"],
      },
      {
        name: "Snes9x (Standalone)",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
      {
        name: "bsnes (Standalone)",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
      {
        name: "Ares (Standalone)",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
      {
        name: "Custom Standalone",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
    ],
  },
  {
    id: "n64",
    name: "Nintendo 64",
    manufacturer: "Nintendo",
    year: 1996,
    retroachievements: true,
    popular_rank: 5,
    extensions: ["z64", "n64", "v64", "zip", "7z"],
    emulators: [
      {
        name: "RetroArch (Mupen64Plus-Next)",
        emulator_type: "retroarch",
        default_args: '-L "cores/{core}" "{rom_path}"',
        recommended_core: "mupen64plus_next_libretro.dll",
        core_options: ["mupen64plus_next_libretro.dll", "parallel_n64_libretro.dll"],
      },
      {
        name: "Project64 (Standalone)",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
      {
        name: "RMG - Rosalie's Mupen GUI (Standalone)",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
      {
        name: "simple64 (Standalone)",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
      {
        name: "Ares (Standalone)",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
      {
        name: "Custom Standalone",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
    ],
  },
  {
    id: "gamecube",
    name: "Nintendo GameCube",
    manufacturer: "Nintendo",
    year: 2001,
    retroachievements: true,
    popular_rank: 3,
    extensions: ["iso", "gcm", "rvz", "gcz", "cso", "chd"],
    emulators: [
      {
        name: "Dolphin (Standalone)",
        emulator_type: "standalone",
        default_args: '-b -e "{rom_path}"',
      },
      {
        name: "RetroArch (Dolphin)",
        emulator_type: "retroarch",
        default_args: '-L "cores/{core}" "{rom_path}"',
        recommended_core: "dolphin_libretro.dll",
        core_options: ["dolphin_libretro.dll"],
      },
      {
        name: "Custom Standalone",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
    ],
  },
  {
    id: "wii",
    name: "Nintendo Wii",
    manufacturer: "Nintendo",
    year: 2006,
    retroachievements: false,
    popular_rank: 8,
    extensions: ["iso", "wbfs", "rvz", "gcz", "cso"],
    emulators: [
      {
        name: "Dolphin (Standalone)",
        emulator_type: "standalone",
        default_args: '-b -e "{rom_path}"',
      },
      {
        name: "RetroArch (Dolphin)",
        emulator_type: "retroarch",
        default_args: '-L "cores/{core}" "{rom_path}"',
        recommended_core: "dolphin_libretro.dll",
        core_options: ["dolphin_libretro.dll"],
      },
      {
        name: "Custom Standalone",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
    ],
  },
  {
    id: "wiiu",
    name: "Nintendo Wii U",
    manufacturer: "Nintendo",
    year: 2012,
    retroachievements: false,
    popular_rank: 14,
    extensions: ["rpx", "wua", "wud", "wux", "iso"],
    emulators: [
      {
        name: "Cemu (Standalone)",
        emulator_type: "standalone",
        default_args: '-g "{rom_path}"',
      },
      {
        name: "Custom Standalone",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
    ],
  },
  {
    id: "switch",
    name: "Nintendo Switch",
    manufacturer: "Nintendo",
    year: 2017,
    retroachievements: false,
    popular_rank: 9,
    extensions: ["nsp", "xci", "nca"],
    emulators: [
      {
        name: "Ryujinx (Standalone)",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
      {
        name: "Yuzu (Standalone)",
        emulator_type: "standalone",
        default_args: '-f -g "{rom_path}"',
      },
      {
        name: "Suyu (Standalone)",
        emulator_type: "standalone",
        default_args: '-f -g "{rom_path}"',
      },
      {
        name: "Sudachi (Standalone)",
        emulator_type: "standalone",
        default_args: '-f -g "{rom_path}"',
      },
      {
        name: "Eden (Standalone)",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
      {
        name: "Citron (Standalone)",
        emulator_type: "standalone",
        default_args: '-f -g "{rom_path}"',
      },
      {
        name: "Custom Standalone",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
    ],
  },
  {
    id: "gb",
    name: "Game Boy / Game Boy Color",
    manufacturer: "Nintendo",
    year: 1989,
    retroachievements: true,
    popular_rank: 7,
    extensions: ["gb", "gbc", "zip", "7z"],
    emulators: [
      {
        name: "RetroArch (Gambatte)",
        emulator_type: "retroarch",
        default_args: '-L "cores/{core}" "{rom_path}"',
        recommended_core: "gambatte_libretro.dll",
        core_options: ["gambatte_libretro.dll", "mgba_libretro.dll", "sameboy_libretro.dll"],
      },
      {
        name: "mGBA (Standalone)",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
      {
        name: "SameBoy (Standalone)",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
      {
        name: "Custom Standalone",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
    ],
  },
  {
    id: "gba",
    name: "Game Boy Advance",
    manufacturer: "Nintendo",
    year: 2001,
    retroachievements: true,
    popular_rank: 4,
    extensions: ["gba", "zip", "7z"],
    emulators: [
      {
        name: "RetroArch (mGBA)",
        emulator_type: "retroarch",
        default_args: '-L "cores/{core}" "{rom_path}"',
        recommended_core: "mgba_libretro.dll",
        core_options: ["mgba_libretro.dll", "vba_next_libretro.dll"],
      },
      {
        name: "mGBA (Standalone)",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
      {
        name: "VisualBoyAdvance-M (Standalone)",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
      {
        name: "Custom Standalone",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
    ],
  },
  {
    id: "nds",
    name: "Nintendo DS",
    manufacturer: "Nintendo",
    year: 2004,
    retroachievements: true,
    popular_rank: 10,
    extensions: ["nds", "zip", "7z"],
    emulators: [
      {
        name: "melonDS (Standalone)",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
      {
        name: "DeSmuME (Standalone)",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
      {
        name: "RetroArch (melonDS)",
        emulator_type: "retroarch",
        default_args: '-L "cores/{core}" "{rom_path}"',
        recommended_core: "melonds_libretro.dll",
        core_options: ["melonds_libretro.dll", "desmume_libretro.dll"],
      },
      {
        name: "Custom Standalone",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
    ],
  },
  {
    id: "3ds",
    name: "Nintendo 3DS",
    manufacturer: "Nintendo",
    year: 2011,
    retroachievements: false,
    popular_rank: 12,
    extensions: ["3ds", "cia", "cxi", "app"],
    emulators: [
      {
        name: "Citra (Standalone)",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
      {
        name: "Lime3DS (Standalone)",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
      {
        name: "Panda3DS (Standalone)",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
      {
        name: "RetroArch (Citra)",
        emulator_type: "retroarch",
        default_args: '-L "cores/{core}" "{rom_path}"',
        recommended_core: "citra_libretro.dll",
        core_options: ["citra_libretro.dll"],
      },
      {
        name: "Custom Standalone",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
    ],
  },

  // SONY
  {
    id: "ps1",
    name: "Sony PlayStation",
    manufacturer: "Sony",
    year: 1994,
    retroachievements: true,
    popular_rank: 1,
    extensions: ["cue", "chd", "iso", "pbp", "m3u", "bin", "img"],
    emulators: [
      {
        name: "DuckStation (Standalone)",
        emulator_type: "standalone",
        default_args: '-batch "{rom_path}"',
      },
      {
        name: "RetroArch (SwanStation)",
        emulator_type: "retroarch",
        default_args: '-L "cores/{core}" "{rom_path}"',
        recommended_core: "swanstation_libretro.dll",
        core_options: ["swanstation_libretro.dll", "beetle_psx_hw_libretro.dll", "pcsx_rearmed_libretro.dll"],
      },
      {
        name: "ePSXe (Standalone)",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
      {
        name: "Custom Standalone",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
    ],
  },
  {
    id: "ps2",
    name: "Sony PlayStation 2",
    manufacturer: "Sony",
    year: 2000,
    retroachievements: true,
    popular_rank: 1,
    extensions: ["iso", "chd", "cso", "bin", "gz"],
    emulators: [
      {
        name: "PCSX2 (Standalone)",
        emulator_type: "standalone",
        default_args: '-batch -fullscreen "{rom_path}"',
      },
      {
        name: "RetroArch (LRPS2)",
        emulator_type: "retroarch",
        default_args: '-L "cores/{core}" "{rom_path}"',
        recommended_core: "pcsx2_libretro.dll",
        core_options: ["pcsx2_libretro.dll", "play_libretro.dll"],
      },
      {
        name: "Custom Standalone",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
    ],
  },
  {
    id: "ps3",
    name: "Sony PlayStation 3",
    manufacturer: "Sony",
    year: 2006,
    retroachievements: false,
    popular_rank: 11,
    extensions: ["iso", "pkg", "bin", "self"],
    emulators: [
      {
        name: "RPCS3 (Standalone)",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
      {
        name: "Custom Standalone",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
    ],
  },
  {
    id: "psp",
    name: "Sony PlayStation Portable",
    manufacturer: "Sony",
    year: 2004,
    retroachievements: true,
    popular_rank: 7,
    extensions: ["iso", "cso", "chd", "pbp"],
    emulators: [
      {
        name: "PPSSPP (Standalone)",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
      {
        name: "RetroArch (PPSSPP)",
        emulator_type: "retroarch",
        default_args: '-L "cores/{core}" "{rom_path}"',
        recommended_core: "ppsspp_libretro.dll",
        core_options: ["ppsspp_libretro.dll"],
      },
      {
        name: "Custom Standalone",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
    ],
  },
  {
    id: "psvita",
    name: "Sony PlayStation Vita",
    manufacturer: "Sony",
    year: 2011,
    retroachievements: false,
    popular_rank: 18,
    extensions: ["vpk", "zip", "pkg"],
    emulators: [
      {
        name: "Vita3K (Standalone)",
        emulator_type: "standalone",
        default_args: '-r "{rom_path}"',
      },
      {
        name: "Custom Standalone",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
    ],
  },

  // SEGA
  {
    id: "genesis",
    name: "Sega Genesis / Mega Drive",
    manufacturer: "Sega",
    year: 1988,
    retroachievements: true,
    popular_rank: 6,
    extensions: ["md", "gen", "smd", "bin", "zip", "7z"],
    emulators: [
      {
        name: "RetroArch (Genesis Plus GX)",
        emulator_type: "retroarch",
        default_args: '-L "cores/{core}" "{rom_path}"',
        recommended_core: "genesis_plus_gx_libretro.dll",
        core_options: ["genesis_plus_gx_libretro.dll", "picodrive_libretro.dll"],
      },
      {
        name: "BlastEm (Standalone)",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
      {
        name: "Kega Fusion (Standalone)",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
      {
        name: "Custom Standalone",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
    ],
  },
  {
    id: "saturn",
    name: "Sega Saturn",
    manufacturer: "Sega",
    year: 1994,
    retroachievements: true,
    popular_rank: 13,
    extensions: ["cue", "chd", "iso", "m3u"],
    emulators: [
      {
        name: "RetroArch (Beetle Saturn)",
        emulator_type: "retroarch",
        default_args: '-L "cores/{core}" "{rom_path}"',
        recommended_core: "mednafen_saturn_libretro.dll",
        core_options: ["mednafen_saturn_libretro.dll", "yabasanshiro_libretro.dll", "kronos_libretro.dll"],
      },
      {
        name: "Mednafen (Standalone)",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
      {
        name: "YabaSanshiro (Standalone)",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
      {
        name: "Custom Standalone",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
    ],
  },
  {
    id: "dreamcast",
    name: "Sega Dreamcast",
    manufacturer: "Sega",
    year: 1998,
    retroachievements: true,
    popular_rank: 9,
    extensions: ["gdi", "chd", "cdi", "cue"],
    emulators: [
      {
        name: "Flycast (Standalone)",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
      {
        name: "RetroArch (Flycast)",
        emulator_type: "retroarch",
        default_args: '-L "cores/{core}" "{rom_path}"',
        recommended_core: "flycast_libretro.dll",
        core_options: ["flycast_libretro.dll"],
      },
      {
        name: "Redream (Standalone)",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
      {
        name: "Custom Standalone",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
    ],
  },

  // MICROSOFT
  {
    id: "xbox",
    name: "Microsoft Xbox",
    manufacturer: "Microsoft",
    year: 2001,
    retroachievements: false,
    popular_rank: 15,
    extensions: ["iso", "xiso", "chd"],
    emulators: [
      {
        name: "xemu (Standalone)",
        emulator_type: "standalone",
        default_args: '-dvd_path "{rom_path}"',
      },
      {
        name: "Custom Standalone",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
    ],
  },
  {
    id: "xbox360",
    name: "Microsoft Xbox 360",
    manufacturer: "Microsoft",
    year: 2005,
    retroachievements: false,
    popular_rank: 16,
    extensions: ["iso", "xex"],
    emulators: [
      {
        name: "Xenia (Standalone)",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
      {
        name: "Xenia Canary (Standalone)",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
      {
        name: "Custom Standalone",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
    ],
  },

  // ARCADE & RETRO OTHERS
  {
    id: "arcade",
    name: "Arcade / MAME / Neo Geo",
    manufacturer: "SNK / Arcade",
    year: 1990,
    retroachievements: true,
    popular_rank: 8,
    extensions: ["zip", "7z", "chd"],
    emulators: [
      {
        name: "RetroArch (FBNeo)",
        emulator_type: "retroarch",
        default_args: '-L "cores/{core}" "{rom_path}"',
        recommended_core: "fbneo_libretro.dll",
        core_options: ["fbneo_libretro.dll", "mame_libretro.dll", "mame2003_plus_libretro.dll"],
      },
      {
        name: "MAME (Standalone)",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
      {
        name: "FinalBurn Neo (Standalone)",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
      {
        name: "Custom Standalone",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
    ],
  },
  {
    id: "atari2600",
    name: "Atari 2600",
    manufacturer: "Atari",
    year: 1977,
    retroachievements: true,
    popular_rank: 20,
    extensions: ["a26", "bin", "zip", "7z"],
    emulators: [
      {
        name: "RetroArch (Stella)",
        emulator_type: "retroarch",
        default_args: '-L "cores/{core}" "{rom_path}"',
        recommended_core: "stella_libretro.dll",
        core_options: ["stella_libretro.dll"],
      },
      {
        name: "Stella (Standalone)",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
      {
        name: "Custom Standalone",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
    ],
  },
  {
    id: "custom",
    name: "Custom / Other Console",
    manufacturer: "Other",
    year: 2000,
    retroachievements: false,
    popular_rank: 99,
    extensions: ["iso", "rom", "bin", "zip", "7z"],
    emulators: [
      {
        name: "RetroArch",
        emulator_type: "retroarch",
        default_args: '-L "cores/{core}" "{rom_path}"',
      },
      {
        name: "Custom Standalone Emulator",
        emulator_type: "standalone",
        default_args: '"{rom_path}"',
      },
    ],
  },
];

export const getMergedConsolePresets = async (): Promise<ConsolePreset[]> => {
  try {
    const raw = await invoke<string | null>("get_community_systems");
    if (raw) {
      const parsed: ConsolePreset[] = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const map = new Map<string, ConsolePreset>();
        for (const c of CONSOLE_PRESETS) {
          map.set(c.id, c);
        }
        for (const c of parsed) {
          map.set(c.id, c);
        }
        return Array.from(map.values());
      }
    }
  } catch (err) {
    console.warn("Failed to load community systems:", err);
  }
  return CONSOLE_PRESETS;
};
