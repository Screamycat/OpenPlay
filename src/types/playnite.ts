export interface PlayniteGamePreview {
  id: string;
  title: string;
  source: string;
  is_installed: boolean;
  playtime_seconds: number;
  last_played?: string;
  cover_image_filename?: string;
}

export interface PlayniteBackupSummary {
  zip_path: string;
  total_games: number;
  installed_games: number;
  uninstalled_games: number;
  sources_found: string[];
  platforms_found: string[];
  total_artwork_files: number;
  games: PlayniteGamePreview[];
}

export interface PlayniteImportOptions {
  zip_path: string;
  extract_artwork: boolean;
  import_uninstalled: boolean;
  import_playtime: boolean;
  import_last_played: boolean;
  import_notes: boolean;
  import_ratings: boolean;
  import_tags: boolean;
  selected_game_ids?: string[];
}

export interface PlayniteImportResult {
  total: number;
  imported: number;
  updated: number;
  skipped: number;
  artwork_extracted: number;
  sources: string[];
}
