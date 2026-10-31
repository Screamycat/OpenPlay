export interface BackupInfo {
  filename: string;
  file_path: string;
  size_bytes: number;
  created_at: string;
  game_count: number;
  is_automatic: boolean;
}

export interface ImportBackupSummary {
  total_games: number;
  imported_count: number;
  updated_count: number;
  created_at: string;
}

export interface ConnectedLibraryItem {
  id: string;
  name: string;
  category: "store" | "emulation";
  badge: string;
  is_authenticated: boolean;
  last_sync?: string | null;
}
