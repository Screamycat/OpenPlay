export interface TombstoneRecord {
  id: string;
  title?: string | null;
  source?: string | null;
  deleted_at: string;
}

export interface SyncSummary {
  success: boolean;
  games_pulled: number;
  games_pushed: number;
  games_deleted: number;
  peer_devices_count: number;
  timestamp: string;
  message: string;
}

export interface CloudSyncStatus {
  enabled: boolean;
  folder_path?: string | null;
  device_id: string;
  device_name: string;
  last_sync_time?: string | null;
  peer_count: number;
  is_folder_valid: boolean;
}

export interface PeerDeviceInfo {
  device_id: string;
  device_name: string;
  last_active: string;
  games_count: number;
  is_current_device: boolean;
}
