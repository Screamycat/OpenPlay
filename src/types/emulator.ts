export interface EmulatorProfile {
  id: string;
  name: string;
  emulator_type: "retroarch" | "standalone";
  executable_path: string;
  arguments_template: string;
  selected_core?: string;
  supported_platforms: string[];
  is_installed?: boolean;
}

export interface DiscoveredRom {
  file_path: string;
  file_name: string;
  clean_title: string;
  platform: string;
  suggested_emulator_id?: string;
  file_size_bytes: number;
  local_cover_path?: string;
}

export interface ConfiguredConsole {
  id: string;
  console_id: string;
  name: string;
  manufacturer: string;
  emulator_name: string;
  emulator_type: "retroarch" | "standalone";
  executable_path: string;
  core_name?: string;
  rom_directory: string;
  arguments_template: string;
  extensions: string[];
  created_at: string;
}

export interface ConsoleEmulatorOption {
  name: string;
  emulator_type: "retroarch" | "standalone";
  default_args: string;
  recommended_core?: string;
  core_options?: string[];
}

export interface ConsolePreset {
  id: string;
  name: string;
  manufacturer: "Nintendo" | "Sony" | "Sega" | "Microsoft" | "Atari" | "SNK / Arcade" | "Other";
  year: number;
  retroachievements: boolean;
  popular_rank: number;
  extensions: string[];
  emulators: ConsoleEmulatorOption[];
}
