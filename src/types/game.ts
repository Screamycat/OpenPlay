export interface GameLink {
  title: string;
  url: string;
}

export interface Game {
  id: string;
  title: string;
  sorting_title?: string;
  source: string; // "Steam" | "Manual" | "Epic" | "GOG"
  source_id?: string;
  install_directory?: string;
  executable_path?: string;
  launch_arguments?: string;
  is_installed: boolean;
  is_favorite: boolean;
  cover_image?: string;
  background_image?: string;
  logo_image?: string;
  icon_image?: string;
  developer?: string;
  publisher?: string;
  release_date?: string;
  genres: string[];
  features: string[];
  platforms: string[];
  community_score?: number;
  user_rating?: number;
  playtime_seconds: number;
  last_played?: string;
  date_added?: string;
  completion_status?: string;
  description?: string;
  notes?: string;
  links: GameLink[];
  screenshots: string[];
  size_on_disk?: number;
}
