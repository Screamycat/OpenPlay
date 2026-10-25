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
  minimize_on_game_launch?: boolean;
  close_to_tray?: boolean;

  // Appearance
  theme?: "dark" | "oled" | "midnight";
  background_blur?: number; // 0 to 64
  background_opacity?: number; // 0 to 1

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
  minimize_on_game_launch: false,
  close_to_tray: false,
  theme: "dark",
  background_blur: 32,
  background_opacity: 0.75,
  trailer_autoplay: true,
  trailer_muted: true,
  steamgriddb_nsfw: false,
};
