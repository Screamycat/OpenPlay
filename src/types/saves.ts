export interface ResolvedSavePath {
  path: string;
  kind: "save" | "config";
  origin:
    | "custom"
    | "emulator"
    | "steam_userdata"
    | "proton_prefix"
    | "wine_prefix"
    | "pcgamingwiki"
    | "heuristic";
  exists: boolean;
  file_count: number;
  total_bytes: number;
  template_hint?: string | null;
}

export interface CloudSaveSnapshot {
  id: string;
  game_id: string;
  canonical_save_key: string;
  game_title: string;
  device_id: string;
  device_name: string;
  os: string;
  created_at: string;
  trigger: "auto_exit" | "pre_launch" | "manual" | string;
  sha256: string;
  size_bytes: number;
  file_count: number;
  slot_count: number;
  note?: string | null;
}

export interface LocalSafetyBackup {
  id: string;
  game_id: string;
  created_at: string;
  reason: string;
  size_bytes: number;
  file_count: number;
}

export type SaveSyncStatus =
  | "in_sync"
  | "local_ahead"
  | "peer_ahead"
  | "not_synced"
  | "no_save_path"
  | "cloud_disabled";

export interface GameSaveState {
  game_id: string;
  canonical_save_key: string;
  save_paths: ResolvedSavePath[];
  config_paths: ResolvedSavePath[];
  custom_save_paths: string[];
  custom_config_paths: string[];
  has_custom_save_paths: boolean;
  pcgw_page?: string | null;
  cloud_save_enabled: boolean;
  cloud_save_retention_override?: number | null;
  global_retention_count: number;
  effective_retention_count: number;
  cloud_sync_enabled: boolean;
  cloud_sync_folder_valid: boolean;
  is_game_running: boolean;
  local_save_hash?: string | null;
  local_size_bytes: number;
  local_file_count: number;
  is_oversized: boolean;
  max_auto_bytes: number;
  sync_status: SaveSyncStatus | string;
  last_synced_at?: string | null;
  last_synced_snapshot_id?: string | null;
  snapshots: CloudSaveSnapshot[];
  safety_backups: LocalSafetyBackup[];
}

export interface PreLaunchSaveCheck {
  status: "ok" | "pushed_pre_launch" | "newer_peer_available" | "oversized_warning";
  latest_snapshot?: CloudSaveSnapshot | null;
  local_size_bytes: number;
  message?: string | null;
}

export interface CloudSaveActionResult {
  success: boolean;
  skipped: boolean;
  message: string;
  snapshot?: CloudSaveSnapshot | null;
  state: GameSaveState;
}

export interface CloudSavesOverview {
  opted_in_games: number;
  total_snapshots: number;
  total_bytes: number;
}
