export interface LibraryIntegration {
  provider: string; // "steam" | "epic" | "gog" | "emulation" | "manual"
  account_id?: string;
  username?: string;
  avatar_url?: string;
  is_authenticated: boolean;
  import_installed: boolean;
  import_uninstalled: boolean;
  sync_playtime: boolean;
  last_sync?: string;
  access_token?: string;
  refresh_token?: string;
}
