export interface ReleaseAssetInfo {
  name: string;
  download_url: string;
  size: number;
}

export interface UpdateCheckResult {
  current_version: string;
  latest_version: string;
  is_update_available: boolean;
  release_name?: string | null;
  release_notes?: string | null;
  published_at?: string | null;
  html_url?: string | null;
  download_url?: string | null;
  assets?: ReleaseAssetInfo[];
}

export interface UpdateProgressPayload {
  downloaded: number;
  total: number;
  percentage: number;
}
