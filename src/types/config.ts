export interface AppConfig {
  // Layout & Session State (Reopen right where you left off)
  view_mode?: "split" | "grid" | "list";
  card_width?: number;
  grid_width_percent?: number;
  last_selected_game_id?: string | null;

  // Filters & Sorting
  status_filter?: "all" | "installed" | "uninstalled";
  sort_by?: "playtime" | "title" | "last_played" | "release_date" | "rating";
  sort_direction?: "asc" | "desc";
  group_by?: "none" | "source" | "status" | "first_letter" | "completion_status";
  show_favorites_only?: boolean;
  selected_genres?: string[];
  selected_developers?: string[];
  selected_sources?: string[];

  // General App Behavior
  auto_scan_on_startup?: boolean;
  launch_on_startup?: boolean;
  minimize_on_game_launch?: boolean;
  close_to_tray?: boolean;
  merge_duplicates?: boolean;
  unmerged_game_ids?: string[];

  // Appearance
  active_theme_id?: string;
  theme?: "dark" | "oled" | "midnight";
  background_blur?: number; // 0 to 64
  background_opacity?: number; // 0 to 1
  modal_backdrop_opacity?: number; // 0.2 to 0.95
  modal_backdrop_blur?: number; // 0 to 32
  card_border_radius?: string; // e.g. "Rounded (16px)"
  enable_card_glow?: boolean;
  glass_intensity?: string; // e.g. "Standard (24px)"
  accent_color?: string; // hex color e.g. #a855f7
  panel_tint?: string; // hex color e.g. #0e0e11

  // Playback & Media
  trailer_autoplay?: boolean;
  trailer_muted?: boolean;

  // APIs & Services
  steamgriddb_api_key?: string;
  steamgriddb_nsfw?: boolean;
  retroachievements_username?: string;
  retroachievements_api_key?: string;
  igdb_client_id?: string;
  igdb_client_secret?: string;

  // Background Library Sync
  sync_on_startup?: boolean;
  periodic_playtime_sync_hours?: number;

  // Backup & Snapshots
  backup_frequency?: "disabled" | "daily" | "weekly" | "on_exit";
  backup_retention_count?: number;
  last_backup_time?: string;

  // Cloud Sync & Online Saving (CRDT)
  cloud_sync_enabled?: boolean;
  cloud_sync_folder?: string | null;
  cloud_sync_interval_minutes?: number;
  cloud_sync_on_startup?: boolean;
  cloud_sync_on_game_exit?: boolean;
  last_cloud_sync_time?: string | null;
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  view_mode: "split",
  card_width: 108,
  grid_width_percent: 52,
  status_filter: "all",
  sort_by: "playtime",
  sort_direction: "desc",
  group_by: "none",
  show_favorites_only: false,
  selected_genres: [],
  selected_developers: [],
  selected_sources: [],
  auto_scan_on_startup: true,
  sync_on_startup: true,
  periodic_playtime_sync_hours: 0,
  backup_frequency: "daily",
  backup_retention_count: 5,
  cloud_sync_enabled: false,
  cloud_sync_folder: null,
  cloud_sync_interval_minutes: 15,
  cloud_sync_on_startup: true,
  cloud_sync_on_game_exit: true,
  last_cloud_sync_time: null,
  launch_on_startup: false,
  minimize_on_game_launch: false,
  close_to_tray: false,
  merge_duplicates: true,
  unmerged_game_ids: [],
  theme: "dark",
  background_blur: 32,
  background_opacity: 0.75,
  modal_backdrop_opacity: 0.45,
  modal_backdrop_blur: 8,
  card_border_radius: "Rounded (16px)",
  enable_card_glow: true,
  glass_intensity: "Standard (24px)",
  accent_color: "#a855f7",
  panel_tint: "#0e0e11",
  trailer_autoplay: true,
  trailer_muted: true,
  steamgriddb_nsfw: false,
};
