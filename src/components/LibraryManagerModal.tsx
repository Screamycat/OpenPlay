import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { LibraryIntegration } from "../types/integration";
import { Game } from "../types/game";
import {
  X,
  RefreshCw,
  LogIn,
  LogOut,
  FolderOpen,
  Gamepad,
  HardDrive,
  Cloud,
  Clock,
  Layers,
  Sparkles,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import { LocalGamesTab } from "./library/LocalGamesTab";
import { RetroAchievementsTab } from "./library/RetroAchievementsTab";
import { EmulationTab } from "./library/EmulationTab";
import { AppConfig } from "../types/config";

interface ScanResult {
  count: number;
  installed: number;
  uninstalled: number;
}

export type CategoryTab =
  | "steam"
  | "epic"
  | "retroachievements"
  | "gog"
  | "xbox"
  | "battlenet"
  | "ea"
  | "ubisoft"
  | "riot"
  | "amazon"
  | "googleplay"
  | "roblox"
  | "emulation"
  | "retroarch"
  | "standalone_emulators"
  | "manual_local"
  | "manual_shortcuts";

export type ProviderId =
  | "gog"
  | "xbox"
  | "battlenet"
  | "ea"
  | "ubisoft"
  | "riot"
  | "amazon"
  | "googleplay"
  | "roblox";

interface ProviderMeta {
  id: ProviderId;
  name: string;
  badge: string;
  description: string;
  localNote: string;
  hasCloudAuth: boolean;
  hasPlaytimeSync: boolean;
  isInactive?: boolean;
  cloudNote?: string;
}

const EXTRA_PROVIDERS: ProviderMeta[] = [
  {
    id: "gog",
    name: "GOG Galaxy",
    badge: "GOG",
    description:
      "Connect your GOG.com account or scan locally installed GOG Galaxy titles, playtimes, and last played dates.",
    localNote:
      "Reads Windows Registry (GOG.com\\Games), goggame-*.info manifests, and local Galaxy 2.0 DB (GameTimes, LastPlayedDates, PlayTasks).",
    hasCloudAuth: true,
    hasPlaytimeSync: true,
    cloudNote:
      "Sign in to GOG.com to import your entire owned DRM-free catalog, cloud playtime stats, and last played dates.",
  },
  {
    id: "xbox",
    name: "Xbox / PC Game Pass",
    badge: "XBOX",
    description:
      "Connect Xbox Live for full TitleHub owned history, MinutesPlayed stats, and last played timestamps alongside local PC Game Pass installs.",
    localNote:
      "Detects UWP / Appx packages, MicrosoftGame.config manifests, and XboxGames directories across all drives.",
    hasCloudAuth: true,
    hasPlaytimeSync: true,
    cloudNote:
      "Sign in with Microsoft / Xbox Live (OAuth2 + XSTS) to import your Xbox TitleHub library, MinutesPlayed playtime, and last played dates.",
  },
  {
    id: "battlenet",
    name: "Battle.net",
    badge: "BNET",
    description:
      "Connect your Battle.net account to import owned Blizzard & classic titles, or scan locally installed Battle.net games.",
    localNote:
      "Scans Windows Uninstall Registry entries and maps Blizzard product codes (battlenet:// launch protocol).",
    hasCloudAuth: true,
    hasPlaytimeSync: false,
    cloudNote:
      "Sign in to Battle.net to query your owned games and classic titles directly from your Blizzard account.",
  },
  {
    id: "ea",
    name: "EA App",
    badge: "EA",
    description:
      "Connect your EA Account to import owned games, total playtime, and last played dates, or scan local EA App installs.",
    localNote:
      "Scans EA Games registry keys and parses __Installer\\installerdata.xml manifests for direct launch binaries.",
    hasCloudAuth: true,
    hasPlaytimeSync: true,
    cloudNote:
      "Sign in to EA to import your consolidated entitlements catalog, cloud usage playtime (seconds), and last played timestamps.",
  },
  {
    id: "ubisoft",
    name: "Ubisoft Connect",
    badge: "UBI",
    description:
      "Connect Ubisoft Connect or read local configuration cache for owned games, playtime, and last played dates.",
    localNote:
      "Reads Ubisoft\\Launcher\\Installs registry keys and %LOCALAPPDATA%\\Ubisoft Game Launcher\\cache\\configuration\\configurations.",
    hasCloudAuth: true,
    hasPlaytimeSync: true,
    cloudNote:
      "Sign in to Ubisoft Connect via official WebAuth to sync your cloud entitlements, playtime, and last played dates. Alternatively, syncing also works offline directly from your local Ubisoft Connect installation.",
  },
  {
    id: "amazon",
    name: "Amazon Games",
    badge: "AMZN",
    description:
      "Connect your Amazon Prime Gaming account to import all claimed entitlements, or scan local Amazon Games installs.",
    localNote:
      "Reads %LOCALAPPDATA%\\Amazon Games\\Data\\Games\\Sql\\GameInstallInfo.sqlite for installed and cached titles.",
    hasCloudAuth: true,
    hasPlaytimeSync: false,
    cloudNote:
      "Sign in with Amazon to register OpenPlay with Amazon Distribution Service and import all claimed Prime Gaming titles.",
  },
  {
    id: "riot",
    name: "Riot Games",
    badge: "RIOT",
    description:
      "Import Valorant, League of Legends, Teamfight Tactics, Legends of Runeterra, and 2XKO.",
    localNote:
      "Parses RiotClientInstalls.json and C:\\ProgramData\\Riot Games\\Metadata\\*.product_settings.yaml.",
    hasCloudAuth: false,
    hasPlaytimeSync: false,
  },
  {
    id: "googleplay",
    name: "Google Play Games",
    badge: "GPLAY",
    description:
      "Import Android & PC games installed through Google Play Games on PC.",
    localNote:
      "Scans Start Menu Programs\\Google Play Games shortcuts and launch targets.",
    hasCloudAuth: false,
    hasPlaytimeSync: false,
    isInactive: true,
  },
  {
    id: "roblox",
    name: "Roblox",
    badge: "RBLX",
    description:
      "Detect the local Roblox Player installation and launch directly from OpenPlay.",
    localNote:
      "Locates the latest RobloxPlayerBeta.exe inside %LOCALAPPDATA%\\Roblox\\Versions automatically.",
    hasCloudAuth: false,
    hasPlaytimeSync: false,
    isInactive: true,
  },
];

interface LibraryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: CategoryTab;
  onRefreshGames?: () => Promise<void>;
  onGameAdded?: (game: Game) => void;
  // Steam
  steamIntegration: LibraryIntegration;
  onOpenSteamLogin: () => void;
  onAuthenticateManual: (idOrVanity: string) => void;
  onLogoutSteam: () => void;
  onSaveSteamIntegration: (updated: LibraryIntegration) => void;
  onSyncSteamLibrary: () => Promise<ScanResult | number | void>;
  onClearLibrary: () => Promise<void>;
  isSyncing: boolean;
  isAuthenticating: boolean;
  // Epic
  epicIntegration: LibraryIntegration;
  onOpenEpicLogin: () => void;
  onAuthenticateEpicManual: (code: string) => void;
  onLogoutEpic: () => void;
  onSaveEpicIntegration: (updated: LibraryIntegration) => void;
  onSyncEpicLibrary: () => Promise<ScanResult | number | void>;
  isSyncingEpic: boolean;
  isAuthenticatingEpic: boolean;
  // RetroAchievements
  config?: AppConfig;
  onSaveConfig?: (updated: AppConfig) => void;
  onSyncRetroAchievements?: () => Promise<void>;
  isSyncingRa?: boolean;
}

export const LibraryManagerModal: React.FC<LibraryManagerModalProps> = ({
  isOpen,
  onClose,
  initialTab = "steam",
  onRefreshGames,
  onGameAdded,
  steamIntegration,
  onOpenSteamLogin,
  onAuthenticateManual,
  onLogoutSteam,
  onSaveSteamIntegration,
  onSyncSteamLibrary,
  onClearLibrary,
  isSyncing,
  isAuthenticating,
  epicIntegration,
  onOpenEpicLogin,
  onAuthenticateEpicManual,
  onLogoutEpic,
  onSaveEpicIntegration,
  onSyncEpicLibrary,
  isSyncingEpic,
  isAuthenticatingEpic,
  config,
  onSaveConfig,
  onSyncRetroAchievements,
  isSyncingRa,
}) => {
  const [activeTab, setActiveTab] = useState<CategoryTab>(initialTab);
  const [manualInput, setManualInput] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);
  const [epicManualInput, setEpicManualInput] = useState("");
  const [showEpicManualInput, setShowEpicManualInput] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);

  // Extra 9 Providers state
  const [providerIntegrations, setProviderIntegrations] = useState<Record<string, LibraryIntegration>>({});
  const [syncingProvider, setSyncingProvider] = useState<string | null>(null);
  const [authProvider, setAuthProvider] = useState<string | null>(null);
  const [providerManualInput, setProviderManualInput] = useState("");
  const [showProviderManualInput, setShowProviderManualInput] = useState(false);

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen) return;
    EXTRA_PROVIDERS.forEach(async (p) => {
      try {
        const integ = await invoke<LibraryIntegration>("get_provider_integration", { provider: p.id });
        setProviderIntegrations((prev) => ({ ...prev, [p.id]: integ }));
      } catch {}
    });
  }, [isOpen]);

  useEffect(() => {
    const unlistenGog = listen<string>("gog-code-detected", async (event) => {
      if (event.payload) {
        setAuthProvider("gog");
        try {
          const updated = await invoke<LibraryIntegration>("authenticate_gog_code", { code: event.payload });
          setProviderIntegrations((prev) => ({ ...prev, gog: updated }));
          setSyncStatusMsg(`Connected GOG Galaxy account: ${updated.username || "Authenticated"}`);
        } catch (err) {
          setSyncStatusMsg(`GOG login failed: ${err}`);
        } finally {
          setAuthProvider(null);
        }
      }
    });

    const unlistenXbox = listen<string>("xbox-token-detected", async (event) => {
      if (event.payload) {
        setAuthProvider("xbox");
        try {
          const updated = await invoke<LibraryIntegration>("authenticate_xbox_token", { token: event.payload });
          setProviderIntegrations((prev) => ({ ...prev, xbox: updated }));
          setSyncStatusMsg(`Connected Xbox Live account: ${updated.username || "Authenticated"}`);
        } catch (err) {
          setSyncStatusMsg(`Xbox login failed: ${err}`);
        } finally {
          setAuthProvider(null);
        }
      }
    });

    const unlistenBnet = listen<string>("battlenet-payload-detected", async (event) => {
      if (event.payload) {
        setAuthProvider("battlenet");
        try {
          const updated = await invoke<LibraryIntegration>("authenticate_battlenet_payload", { payload: event.payload });
          setProviderIntegrations((prev) => ({ ...prev, battlenet: updated }));
          setSyncStatusMsg(`Connected Battle.net account: ${updated.username || "Authenticated"}`);
        } catch (err) {
          setSyncStatusMsg(`Battle.net login failed: ${err}`);
        } finally {
          setAuthProvider(null);
        }
      }
    });

    const unlistenEa = listen<string>("ea-token-detected", async (event) => {
      if (event.payload) {
        setAuthProvider("ea");
        try {
          const updated = await invoke<LibraryIntegration>("authenticate_ea_token", { token: event.payload });
          setProviderIntegrations((prev) => ({ ...prev, ea: updated }));
          setSyncStatusMsg(`Connected EA account: ${updated.username || "Authenticated"}`);
        } catch (err) {
          setSyncStatusMsg(`EA login failed: ${err}`);
        } finally {
          setAuthProvider(null);
        }
      }
    });

    const unlistenUbi = listen<string>("ubisoft-ticket-detected", async (event) => {
      if (event.payload) {
        setAuthProvider("ubisoft");
        try {
          const updated = await invoke<LibraryIntegration>("authenticate_ubisoft_ticket", { payload: event.payload });
          setProviderIntegrations((prev) => ({ ...prev, ubisoft: updated }));
          setSyncStatusMsg(`Connected Ubisoft Connect account: ${updated.username || "Authenticated"}`);
        } catch (err) {
          setSyncStatusMsg(`Ubisoft login failed: ${err}`);
        } finally {
          setAuthProvider(null);
        }
      }
    });

    const unlistenAmazon = listen<string>("amazon-code-detected", async (event) => {
      if (event.payload) {
        setAuthProvider("amazon");
        try {
          const updated = await invoke<LibraryIntegration>("authenticate_amazon_code", { code: event.payload });
          setProviderIntegrations((prev) => ({ ...prev, amazon: updated }));
          setSyncStatusMsg(`Connected Amazon Games account: ${updated.username || "Authenticated"}`);
        } catch (err) {
          setSyncStatusMsg(`Amazon login failed: ${err}`);
        } finally {
          setAuthProvider(null);
        }
      }
    });

    return () => {
      unlistenGog.then((f) => f());
      unlistenXbox.then((f) => f());
      unlistenBnet.then((f) => f());
      unlistenEa.then((f) => f());
      unlistenUbi.then((f) => f());
      unlistenAmazon.then((f) => f());
    };
  }, []);

  if (!isOpen) return null;

  const getActiveProviderMeta = (): ProviderMeta | undefined =>
    EXTRA_PROVIDERS.find((p) => p.id === activeTab);

  const getProviderInteg = (id: ProviderId): LibraryIntegration =>
    providerIntegrations[id] || {
      provider: id,
      account_id: null,
      username: null,
      avatar_url: null,
      api_key: null,
      is_authenticated: false,
      import_installed: true,
      import_uninstalled: true,
      sync_playtime: true,
      last_sync: null,
    };

  const handleSaveProviderInteg = async (updated: LibraryIntegration) => {
    setProviderIntegrations((prev) => ({ ...prev, [updated.provider]: updated }));
    try {
      await invoke("save_provider_integration", { integration: updated });
    } catch (err) {
      setSyncStatusMsg(`Failed to save ${updated.provider} settings: ${err}`);
    }
  };

  const handleOpenProviderLogin = async (id: ProviderId) => {
    setSyncStatusMsg(null);
    setAuthProvider(id);
    try {
      if (id === "gog") {
        await invoke("open_gog_login_window");
      } else if (id === "xbox") {
        await invoke("open_xbox_login_window");
      } else if (id === "battlenet") {
        await invoke("open_battlenet_login_window");
      } else if (id === "ea") {
        await invoke("open_ea_login_window");
      } else if (id === "ubisoft") {
        await invoke("open_ubisoft_login_window");
      } else if (id === "amazon") {
        await invoke("open_amazon_login_window");
      }
    } catch (err) {
      setSyncStatusMsg(`Failed to open login window: ${err}`);
    } finally {
      setAuthProvider(null);
    }
  };

  const handleProviderManualSubmit = async (e: React.FormEvent, id: ProviderId) => {
    e.preventDefault();
    const raw = providerManualInput.trim();
    if (!raw) return;
    setAuthProvider(id);
    setSyncStatusMsg(null);
    try {
      let updated: LibraryIntegration;
      if (id === "gog") {
        updated = await invoke<LibraryIntegration>("authenticate_gog_code", { code: raw });
      } else if (id === "xbox") {
        updated = await invoke<LibraryIntegration>("authenticate_xbox_token", { token: raw });
      } else if (id === "battlenet") {
        updated = await invoke<LibraryIntegration>("authenticate_battlenet_payload", { payload: raw });
      } else if (id === "ea") {
        updated = await invoke<LibraryIntegration>("authenticate_ea_token", { token: raw });
      } else if (id === "ubisoft") {
        updated = await invoke<LibraryIntegration>("authenticate_ubisoft_ticket", { payload: raw });
      } else if (id === "amazon") {
        updated = await invoke<LibraryIntegration>("authenticate_amazon_code", { code: raw });
      } else {
        return;
      }
      setProviderIntegrations((prev) => ({ ...prev, [id]: updated }));
      setProviderManualInput("");
      setShowProviderManualInput(false);
      setSyncStatusMsg(`Connected ${id.toUpperCase()} account: ${updated.username || "Authenticated"}`);
    } catch (err) {
      setSyncStatusMsg(`Authentication error: ${err}`);
    } finally {
      setAuthProvider(null);
    }
  };

  const handleLogoutProvider = async (id: ProviderId) => {
    try {
      const updated = await invoke<LibraryIntegration>("logout_provider", { provider: id });
      setProviderIntegrations((prev) => ({ ...prev, [id]: updated }));
      setSyncStatusMsg(`Disconnected ${id.toUpperCase()} account.`);
    } catch (err) {
      setSyncStatusMsg(`Logout failed: ${err}`);
    }
  };

  const handleSyncProviderLibrary = async (meta: ProviderMeta) => {
    setSyncStatusMsg(null);
    setSyncingProvider(meta.id);
    try {
      const res = await invoke<ScanResult>("scan_provider_library", { provider: meta.id });
      const updatedInteg = await invoke<LibraryIntegration>("get_provider_integration", { provider: meta.id });
      setProviderIntegrations((prev) => ({ ...prev, [meta.id]: updatedInteg }));
      await onRefreshGames?.();
      setSyncStatusMsg(
        `${meta.name} Sync Complete! Found ${res.installed} installed${
          meta.hasCloudAuth || meta.id === "riot" ? ` and ${res.uninstalled} uninstalled` : ""
        } games (${res.count} total).`
      );
      setTimeout(() => setSyncStatusMsg(null), 6000);
    } catch (err) {
      setSyncStatusMsg(`${meta.name} sync error: ${err}`);
    } finally {
      setSyncingProvider(null);
    }
  };

  // Steam Toggles
  const handleToggleInstalled = () => {
    onSaveSteamIntegration({
      ...steamIntegration,
      import_installed: !steamIntegration.import_installed,
    });
  };

  const handleToggleUninstalled = () => {
    onSaveSteamIntegration({
      ...steamIntegration,
      import_uninstalled: !steamIntegration.import_uninstalled,
    });
  };

  const handleTogglePlaytime = () => {
    onSaveSteamIntegration({
      ...steamIntegration,
      sync_playtime: !steamIntegration.sync_playtime,
    });
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualInput.trim()) {
      onAuthenticateManual(manualInput.trim());
      setManualInput("");
      setShowManualInput(false);
    }
  };

  const handleSyncClick = async () => {
    setSyncStatusMsg(null);
    try {
      const res = await onSyncSteamLibrary();
      if (res && typeof res === "object" && "installed" in res) {
        setSyncStatusMsg(
          `Sync Complete! Found ${res.installed} installed and ${res.uninstalled} uninstalled games (${res.count} total).`
        );
      } else if (typeof res === "number") {
        setSyncStatusMsg(`Sync Complete! ${res} games imported into library.`);
      } else {
        setSyncStatusMsg("Sync Complete! Library refreshed.");
      }
      setTimeout(() => setSyncStatusMsg(null), 6000);
    } catch (err) {
      setSyncStatusMsg(`Sync error: ${err}`);
    }
  };

  // Epic Toggles
  const handleToggleEpicInstalled = () => {
    onSaveEpicIntegration({
      ...epicIntegration,
      import_installed: !epicIntegration.import_installed,
    });
  };

  const handleToggleEpicUninstalled = () => {
    onSaveEpicIntegration({
      ...epicIntegration,
      import_uninstalled: !epicIntegration.import_uninstalled,
    });
  };

  const handleToggleEpicPlaytime = () => {
    onSaveEpicIntegration({
      ...epicIntegration,
      sync_playtime: !epicIntegration.sync_playtime,
    });
  };

  const handleEpicManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let raw = epicManualInput.trim();
    if (raw) {
      if (raw.startsWith("{")) {
        try {
          const json = JSON.parse(raw);
          raw = json.authorizationCode || json.exchangeCode || json.sid || raw;
        } catch {}
      } else if (raw.includes("code=")) {
        const match = raw.match(/code=([^&]+)/);
        if (match) raw = match[1];
      }
      onAuthenticateEpicManual(raw.trim());
      setEpicManualInput("");
      setShowEpicManualInput(false);
    }
  };

  const handleSyncEpicClick = async () => {
    setSyncStatusMsg(null);
    try {
      const res = await onSyncEpicLibrary();
      if (res && typeof res === "object" && "installed" in res) {
        setSyncStatusMsg(
          `Epic Sync Complete! Found ${res.installed} installed and ${res.uninstalled} uninstalled games (${res.count} total).`
        );
      } else if (typeof res === "number") {
        setSyncStatusMsg(`Epic Sync Complete! ${res} games imported into library.`);
      } else {
        setSyncStatusMsg("Epic Sync Complete! Library refreshed.");
      }
      setTimeout(() => setSyncStatusMsg(null), 6000);
    } catch (err) {
      setSyncStatusMsg(`Epic sync error: ${err}`);
    }
  };

  const handleClearClick = async () => {
    if (confirm("Are you sure you want to clear all imported games from OpenPlay? You can re-sync anytime.")) {
      await onClearLibrary();
      setSyncStatusMsg("All library games have been removed.");
      setTimeout(() => setSyncStatusMsg(null), 4000);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl theme-panel-surface border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[88vh] max-h-[880px] min-h-[640px]"
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e2333] bg-[#121520]">
          <div className="flex items-center space-x-3">
            <div className="p-2 theme-accent-subtle-bg border theme-accent-subtle-border rounded-xl theme-accent-text">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">
                Library Integrations & Managers
              </h2>
              <p className="text-xs text-slate-400">
                Configure game platforms, emulation cores, and local disk scanners
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Left Categorized Sidebar + Right Content Pane */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Categorized Navigation (Manual, Emulation, Providers) */}
          <div className="w-64 border-r border-white/10 bg-black/20 overflow-y-auto p-3 space-y-4 select-none">
            {/* 1. MANUAL & IMPORT */}
            <div>
              <div className="px-2 py-1 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                Manual & Import
              </div>
              <div className="space-y-0.5 mt-1">
                <button
                  onClick={() => setActiveTab("manual_local")}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                    activeTab === "manual_local"
                      ? "theme-accent-subtle-bg theme-accent-text border theme-accent-subtle-border font-semibold"
                      : "text-slate-300 hover:text-white hover:bg-[#141824]"
                  }`}
                >
                  <span className="flex items-center space-x-2">
                    <FolderOpen className="w-3.5 h-3.5 theme-accent-text" />
                    <span>Local Files & Folders</span>
                  </span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded theme-accent-pill font-medium">
                    Active
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab("manual_shortcuts")}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                    activeTab === "manual_shortcuts"
                      ? "theme-accent-subtle-bg theme-accent-text font-semibold"
                      : "text-slate-400 hover:text-slate-200 hover:bg-[#141824]"
                  }`}
                >
                  <span className="flex items-center space-x-2">
                    <HardDrive className="w-3.5 h-3.5" />
                    <span>Custom Shortcuts</span>
                  </span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-500">
                    Soon
                  </span>
                </button>
              </div>
            </div>

            <div className="border-t border-[#1a1f2e]" />

            {/* 2. EMULATION */}
            <div>
              <div className="px-2 py-1 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                Emulation
              </div>
              <div className="space-y-0.5 mt-1">
                <button
                  onClick={() => setActiveTab("emulation")}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                    activeTab === "emulation"
                      ? "theme-accent-subtle-bg theme-accent-text border theme-accent-subtle-border font-semibold"
                      : "text-slate-300 hover:text-white hover:bg-[#141824]"
                  }`}
                >
                  <span className="flex items-center space-x-2">
                    <Gamepad className="w-3.5 h-3.5" />
                    <span>Emulators & ROMs</span>
                  </span>
                </button>

                {/* RetroAchievements (Moved under Emulation) */}
                <button
                  onClick={() => setActiveTab("retroachievements")}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                    activeTab === "retroachievements"
                      ? "bg-amber-950/60 text-amber-300 border border-amber-500/40 font-semibold"
                      : "text-slate-300 hover:text-white hover:bg-[#141824]"
                  }`}
                >
                  <span className="flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span>RetroAchievements</span>
                  </span>
                  {config?.retroachievements_username && config?.retroachievements_api_key ? (
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-bold">
                      Connected
                    </span>
                  ) : (
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 font-medium">
                      Active
                    </span>
                  )}
                </button>
              </div>
            </div>

            <div className="border-t border-[#1a1f2e]" />

            {/* 3. PROVIDERS */}
            <div>
              <div className="px-2 py-1 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                Providers
              </div>
              <div className="space-y-0.5 mt-1">
                {/* Steam (Active) */}
                <button
                  onClick={() => setActiveTab("steam")}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                    activeTab === "steam"
                      ? "theme-accent-subtle-bg theme-accent-text border theme-accent-subtle-border font-semibold"
                      : "text-slate-300 hover:text-white hover:bg-[#141824]"
                  }`}
                >
                  <span className="flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full theme-accent-bg" />
                    <span>Steam</span>
                  </span>
                  {steamIntegration.is_authenticated ? (
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-bold">
                      Connected
                    </span>
                  ) : (
                    <span className="text-[9px] px-1.5 py-0.2 rounded theme-accent-pill font-medium">
                      Active
                    </span>
                  )}
                </button>

                {/* Epic Games (Active) */}
                <button
                  onClick={() => setActiveTab("epic")}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                    activeTab === "epic"
                      ? "theme-accent-subtle-bg theme-accent-text border theme-accent-subtle-border font-semibold"
                      : "text-slate-300 hover:text-white hover:bg-[#141824]"
                  }`}
                >
                  <span className="flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full theme-accent-bg" />
                    <span>Epic Games</span>
                  </span>
                  {epicIntegration.is_authenticated ? (
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-bold">
                      Connected
                    </span>
                  ) : (
                    <span className="text-[9px] px-1.5 py-0.2 rounded theme-accent-pill font-medium">
                      Active
                    </span>
                  )}
                </button>

                {/* Additional 9 Providers */}
                {EXTRA_PROVIDERS.map((prov) => {
                  const integ = getProviderInteg(prov.id);
                  const isActive = activeTab === prov.id;
                  return (
                    <button
                      key={prov.id}
                      onClick={() => {
                        setActiveTab(prov.id);
                        setShowProviderManualInput(false);
                        setProviderManualInput("");
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                        isActive
                          ? "theme-accent-subtle-bg theme-accent-text border theme-accent-subtle-border font-semibold"
                          : prov.isInactive
                          ? "text-slate-500 hover:text-slate-300 hover:bg-[#141824]"
                          : "text-slate-300 hover:text-white hover:bg-[#141824]"
                      }`}
                    >
                      <span className="flex items-center space-x-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            prov.isInactive ? "bg-slate-600" : "theme-accent-bg"
                          }`}
                        />
                        <span>{prov.name}</span>
                      </span>
                      {prov.isInactive ? (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-500">
                          Soon
                        </span>
                      ) : prov.hasCloudAuth && integ.is_authenticated ? (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-bold">
                          Connected
                        </span>
                      ) : (
                        <span className="text-[9px] px-1.5 py-0.2 rounded theme-accent-pill font-medium">
                          Active
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick Action: Clear Library */}
            <div className="pt-4">
              <button
                onClick={handleClearClick}
                className="w-full flex items-center justify-center space-x-1.5 px-3 py-2 bg-rose-950/20 hover:bg-rose-950/40 text-rose-400/80 hover:text-rose-300 border border-rose-900/30 rounded-lg text-xs transition-all cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear All Games</span>
              </button>
            </div>
          </div>

          {/* Right Pane: Dynamic based on Active Tab */}
          <div className="flex-1 p-6 overflow-y-auto bg-transparent">
            {/* Status Feedback Toast / Banner */}
            {syncStatusMsg && (
              <div className="mb-4 p-3 theme-accent-subtle-bg border theme-accent-subtle-border rounded-xl theme-accent-text text-xs flex items-center space-x-2 animate-in fade-in duration-200">
                <CheckCircle2 className="w-4 h-4 theme-accent-text shrink-0" />
                <span>{syncStatusMsg}</span>
              </div>
            )}

            {activeTab === "steam" ? (
              /* STEAM INTEGRATION VIEW */
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                    <span>Steam Integration</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Connect your Steam account or import games directly from local drives.
                  </p>
                </div>

                {/* 1. Account Authentication Card */}
                <div className="bg-[#151926] border border-[#23293e] rounded-xl p-4 space-y-4">
                  <div className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">
                    Steam Account
                  </div>

                  {steamIntegration.is_authenticated ? (
                    <div className="flex items-center justify-between bg-[#111420] border border-[#1e2333] p-3 rounded-lg">
                      <div className="flex items-center space-x-3">
                        {steamIntegration.avatar_url ? (
                          <img
                            src={steamIntegration.avatar_url}
                            alt="Steam Avatar"
                            className="w-10 h-10 rounded-full border border-[var(--app-accent-color)] shadow-md"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center font-bold text-slate-300">
                            {steamIntegration.username?.[0] || "S"}
                          </div>
                        )}
                        <div>
                          <div className="font-bold text-white text-sm flex items-center space-x-2">
                            <span>{steamIntegration.username || "Steam User"}</span>
                            <span className="text-[9px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-400 rounded-full font-semibold border border-emerald-500/30">
                              Authenticated
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            SteamID: {steamIntegration.account_id}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={onLogoutSteam}
                        className="flex items-center space-x-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg transition-all font-medium cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Log Out</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="p-3 bg-[#121520] rounded-lg border border-[#1e2333] text-slate-400 leading-relaxed text-xs">
                        Sign in to connect your Steam account. OpenPlay uses an authentic embedded login window to securely identify your profile, enabling syncing of uninstalled library games and cloud playtime.
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={onOpenSteamLogin}
                          disabled={isAuthenticating}
                          className="flex items-center space-x-2 px-5 py-2.5 theme-accent-btn font-bold rounded-xl shadow-lg transition-all active:scale-[0.98] cursor-pointer"
                        >
                          <LogIn className="w-4 h-4" />
                          <span>{isAuthenticating ? "Opening Login..." : "Log In with Steam"}</span>
                        </button>

                        <button
                          onClick={() => setShowManualInput(!showManualInput)}
                          className="text-xs text-slate-400 hover:text-slate-200 underline cursor-pointer"
                        >
                          {showManualInput ? "Hide manual entry" : "Enter SteamID / Vanity URL manually"}
                        </button>
                      </div>

                      {showManualInput && (
                        <form
                          onSubmit={handleManualSubmit}
                          className="pt-2 flex items-center space-x-2"
                        >
                          <input
                            type="text"
                            value={manualInput}
                            onChange={(e) => setManualInput(e.target.value)}
                            placeholder="e.g. 76561198333189713 or custom_url"
                            className="flex-1 px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-xs text-white focus:outline-none theme-accent-focus font-mono"
                          />
                          <button
                            type="submit"
                            className="px-4 py-2 theme-accent-btn font-bold rounded-lg text-xs transition-all cursor-pointer"
                          >
                            Verify & Connect
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </div>

                {/* 2. Library Import Settings */}
                <div className="bg-[#151926] border border-[#23293e] rounded-xl p-4 space-y-3">
                  <div className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">
                    Import Options
                  </div>

                  <div className="space-y-2.5">
                    {/* Import Installed */}
                    <label className="flex items-center justify-between p-2.5 rounded-lg bg-[#111420] border border-[#1d2232] cursor-pointer hover:bg-[#151928] transition-colors">
                      <div className="flex items-center space-x-3">
                        <HardDrive className="w-4 h-4 theme-accent-text" />
                        <div>
                          <div className="font-semibold text-slate-200">
                            Import installed games
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Scans local storage drives for installed Steam game manifests (filters out software & tools).
                          </div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={steamIntegration.import_installed}
                        onChange={handleToggleInstalled}
                        className="w-4 h-4 rounded bg-[#1e2335] border-[#2c344d] focus:ring-0 cursor-pointer accent-[var(--app-accent-color)]"
                      />
                    </label>

                    {/* Import Uninstalled */}
                    <label className="flex items-center justify-between p-2.5 rounded-lg bg-[#111420] border border-[#1d2232] cursor-pointer hover:bg-[#151928] transition-colors">
                      <div className="flex items-center space-x-3">
                        <Cloud className="w-4 h-4 text-amber-400" />
                        <div>
                          <div className="font-semibold text-slate-200">
                            Import uninstalled / cloud-owned games
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Pulls your full game catalog from your connected Steam profile.
                          </div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={steamIntegration.import_uninstalled}
                        onChange={handleToggleUninstalled}
                        className="w-4 h-4 rounded bg-[#1e2335] border-[#2c344d] focus:ring-0 cursor-pointer accent-[var(--app-accent-color)]"
                      />
                    </label>

                    {/* Sync Playtime */}
                    <label className="flex items-center justify-between p-2.5 rounded-lg bg-[#111420] border border-[#1d2232] cursor-pointer hover:bg-[#151928] transition-colors">
                      <div className="flex items-center space-x-3">
                        <Clock className="w-4 h-4 text-emerald-400" />
                        <div>
                          <div className="font-semibold text-slate-200">
                            Sync lifetime playtime
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Imports playtime recorded in Steam userdata and cloud stats.
                          </div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={steamIntegration.sync_playtime}
                        onChange={handleTogglePlaytime}
                        className="w-4 h-4 rounded bg-[#1e2335] border-[#2c344d] focus:ring-0 cursor-pointer accent-[var(--app-accent-color)]"
                      />
                    </label>
                  </div>
                </div>

                {/* 3. Sync Action Row */}
                <div className="pt-2 flex items-center justify-between">
                  <div className="text-[11px] text-slate-400">
                    {steamIntegration.last_sync ? (
                      <span>Last Synced: <strong className="text-slate-200">{steamIntegration.last_sync}</strong></span>
                    ) : (
                      <span>Ready to sync</span>
                    )}
                  </div>

                  <button
                    onClick={handleSyncClick}
                    disabled={isSyncing}
                    className="flex items-center space-x-2 px-6 py-2.5 theme-accent-btn font-bold rounded-xl transition-all shadow-md active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
                    <span>{isSyncing ? "Scanning Steam Library..." : "Sync Steam Library"}</span>
                  </button>
                </div>
              </div>
            ) : activeTab === "epic" ? (
              /* EPIC GAMES INTEGRATION VIEW */
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                    <span className="p-1 px-2 rounded theme-accent-subtle-bg theme-accent-text text-xs font-mono font-bold border border-[var(--app-accent-color)]/30">
                      EPIC
                    </span>
                    <span>Epic Games Store</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Connect your Epic Games account to import your cloud library and locally installed titles.
                  </p>
                </div>

                {/* 1. Account Authentication Card */}
                <div className="bg-[#151926] border border-[#23293e] rounded-xl p-4 space-y-4">
                  <div className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">
                    Epic Games Account
                  </div>

                  {epicIntegration.is_authenticated ? (
                    <div className="flex items-center justify-between bg-[#111420] border border-[#1e2333] p-3 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full theme-accent-btn flex items-center justify-center font-bold text-white shadow-md border border-white/20">
                          {epicIntegration.username?.[0]?.toUpperCase() || "E"}
                        </div>
                        <div>
                          <div className="font-bold text-white text-sm flex items-center space-x-2">
                            <span>{epicIntegration.username || "Epic User"}</span>
                            <span className="text-[9px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-400 rounded-full font-semibold border border-emerald-500/30">
                              Connected
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            Account ID: {epicIntegration.account_id}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={onLogoutEpic}
                        className="flex items-center space-x-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg transition-all font-medium cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Disconnect</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="p-3 bg-[#121520] rounded-lg border border-[#1e2333] text-slate-400 leading-relaxed text-xs">
                        Sign in to connect your Epic Games account. OpenPlay uses an authentic embedded login window to securely identify your profile, enabling automatic importing of your claimed, purchased, and installed games with official artwork and metadata.
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={onOpenEpicLogin}
                          disabled={isAuthenticatingEpic}
                          className="flex items-center space-x-2 px-5 py-2.5 theme-accent-btn font-bold rounded-xl shadow-lg transition-all active:scale-[0.98] cursor-pointer"
                        >
                          <LogIn className="w-4 h-4" />
                          <span>{isAuthenticatingEpic ? "Opening Login..." : "Connect Epic Games"}</span>
                        </button>

                        <button
                          onClick={() => setShowEpicManualInput(!showEpicManualInput)}
                          className="text-xs text-slate-400 hover:text-slate-200 underline cursor-pointer"
                        >
                          {showEpicManualInput ? "Hide manual entry" : "Enter authorization code manually"}
                        </button>
                      </div>

                      {showEpicManualInput && (
                        <form
                          onSubmit={handleEpicManualSubmit}
                          className="pt-2 flex items-center space-x-2"
                        >
                          <input
                            type="text"
                            value={epicManualInput}
                            onChange={(e) => setEpicManualInput(e.target.value)}
                            placeholder="Paste 32-character authorization code here"
                            className="flex-1 px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-xs text-white focus:outline-none theme-accent-focus font-mono"
                          />
                          <button
                            type="submit"
                            className="px-4 py-2 theme-accent-btn font-bold rounded-lg text-xs transition-all cursor-pointer"
                          >
                            Authenticate
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </div>

                {/* 2. Library Import Settings */}
                <div className="bg-[#151926] border border-[#23293e] rounded-xl p-4 space-y-3">
                  <div className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">
                    Import Options
                  </div>

                  <div className="space-y-2.5">
                    {/* Import Installed */}
                    <label className="flex items-center justify-between p-2.5 rounded-lg bg-[#111420] border border-[#1d2232] cursor-pointer hover:bg-[#151928] transition-colors">
                      <div className="flex items-center space-x-3">
                        <HardDrive className="w-4 h-4 theme-accent-text" />
                        <div>
                          <div className="font-semibold text-slate-200">
                            Import locally installed games
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Reads local installation manifests (%ProgramData%\Epic) to locate launch executables and disk sizes.
                          </div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={epicIntegration.import_installed}
                        onChange={handleToggleEpicInstalled}
                        className="w-4 h-4 rounded bg-[#1e2335] border-[#2c344d] focus:ring-0 cursor-pointer accent-[var(--app-accent-color)]"
                      />
                    </label>

                    {/* Import Uninstalled */}
                    <label className="flex items-center justify-between p-2.5 rounded-lg bg-[#111420] border border-[#1d2232] cursor-pointer hover:bg-[#151928] transition-colors">
                      <div className="flex items-center space-x-3">
                        <Cloud className="w-4 h-4 text-amber-400" />
                        <div>
                          <div className="font-semibold text-slate-200">
                            Import uninstalled / cloud-owned catalog
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Queries your connected Epic account for claimed, gifted, and purchased games in your library.
                          </div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={epicIntegration.import_uninstalled}
                        onChange={handleToggleEpicUninstalled}
                        className="w-4 h-4 rounded bg-[#1e2335] border-[#2c344d] focus:ring-0 cursor-pointer accent-[var(--app-accent-color)]"
                      />
                    </label>

                    {/* Sync Playtime */}
                    <label className="flex items-center justify-between p-2.5 rounded-lg bg-[#111420] border border-[#1d2232] cursor-pointer hover:bg-[#151928] transition-colors">
                      <div className="flex items-center space-x-3">
                        <Clock className="w-4 h-4 text-emerald-400" />
                        <div>
                          <div className="font-semibold text-slate-200">
                            Sync recorded playtime
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Pulls official playtime statistics from Epic's live cloud library service.
                          </div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={epicIntegration.sync_playtime}
                        onChange={handleToggleEpicPlaytime}
                        className="w-4 h-4 rounded bg-[#1e2335] border-[#2c344d] focus:ring-0 cursor-pointer accent-[var(--app-accent-color)]"
                      />
                    </label>
                  </div>
                </div>

                {/* 3. Sync Action Row */}
                <div className="pt-2 flex items-center justify-between">
                  <div className="text-[11px] text-slate-400">
                    {epicIntegration.last_sync ? (
                      <span>Last Synced: <strong className="text-slate-200">{epicIntegration.last_sync}</strong></span>
                    ) : (
                      <span>Ready to sync</span>
                    )}
                  </div>

                  <button
                    onClick={handleSyncEpicClick}
                    disabled={isSyncingEpic}
                    className="flex items-center space-x-2 px-6 py-2.5 theme-accent-btn font-bold rounded-xl transition-all shadow-md active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`w-4 h-4 ${isSyncingEpic ? "animate-spin" : ""}`} />
                    <span>{isSyncingEpic ? "Scanning Epic Library..." : "Sync Epic Games Library"}</span>
                  </button>
                </div>
              </div>
            ) : activeTab === "retroachievements" && config && onSaveConfig && onSyncRetroAchievements ? (
              <RetroAchievementsTab
                config={config}
                onSaveConfig={onSaveConfig}
                onSync={onSyncRetroAchievements}
                isSyncing={!!isSyncingRa}
              />
            ) : activeTab === "emulation" ? (
              <EmulationTab
                onGameAdded={(game) => {
                  onGameAdded?.(game);
                  onRefreshGames?.();
                }}
                onRefreshGames={() => {
                  onRefreshGames?.();
                }}
              />
            ) : activeTab === "manual_local" ? (
              <LocalGamesTab
                onGameAdded={(game) => {
                  onGameAdded?.(game);
                  onRefreshGames?.();
                }}
                onBatchAdded={() => {
                  onRefreshGames?.();
                }}
              />
            ) : getActiveProviderMeta() && !getActiveProviderMeta()?.isInactive ? (
              (() => {
                const meta = getActiveProviderMeta()!;
                const integ = getProviderInteg(meta.id);
                const isProviderSyncing = syncingProvider === meta.id;
                const isProviderAuth = authProvider === meta.id;

                return (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                        <span className="p-1 px-2 rounded theme-accent-subtle-bg theme-accent-text text-xs font-mono font-bold border border-[var(--app-accent-color)]/30">
                          {meta.badge}
                        </span>
                        <span>{meta.name}</span>
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">{meta.description}</p>
                    </div>

                    {/* Cloud Authentication Card */}
                    {meta.hasCloudAuth && (
                      <div className="bg-[#151926] border border-[#23293e] rounded-xl p-4 space-y-4">
                        <div className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">
                          {meta.name} Account
                        </div>

                        {integ.is_authenticated ? (
                          <div className="flex items-center justify-between bg-[#111420] border border-[#1e2333] p-3 rounded-lg">
                            <div className="flex items-center space-x-3">
                              {integ.avatar_url ? (
                                <img
                                  src={integ.avatar_url}
                                  alt={meta.name}
                                  className="w-10 h-10 rounded-full border border-[var(--app-accent-color)] shadow-md"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-full theme-accent-btn flex items-center justify-center font-bold text-white shadow-md border border-white/20">
                                  {integ.username?.[0]?.toUpperCase() || meta.badge[0]}
                                </div>
                              )}
                              <div>
                                <div className="font-bold text-white text-sm flex items-center space-x-2">
                                  <span>{integ.username || `${meta.name} User`}</span>
                                  <span className="text-[9px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-400 rounded-full font-semibold border border-emerald-500/30">
                                    Connected
                                  </span>
                                </div>
                                {integ.account_id && (
                                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                    Account ID: {integ.account_id}
                                  </div>
                                )}
                              </div>
                            </div>

                            <button
                              onClick={() => handleLogoutProvider(meta.id)}
                              className="flex items-center space-x-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg transition-all font-medium cursor-pointer"
                            >
                              <LogOut className="w-3.5 h-3.5" />
                              <span>Disconnect</span>
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="p-3 bg-[#121520] rounded-lg border border-[#1e2333] text-slate-400 leading-relaxed text-xs">
                              {meta.cloudNote}
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                              <button
                                onClick={() => handleOpenProviderLogin(meta.id)}
                                disabled={isProviderAuth}
                                className="flex items-center space-x-2 px-5 py-2.5 theme-accent-btn font-bold rounded-xl shadow-lg transition-all active:scale-[0.98] cursor-pointer"
                              >
                                <LogIn className="w-4 h-4" />
                                <span>
                                  {isProviderAuth ? "Opening Login..." : `Connect ${meta.name}`}
                                </span>
                              </button>

                              <button
                                onClick={() => setShowProviderManualInput(!showProviderManualInput)}
                                className="text-xs text-slate-400 hover:text-slate-200 underline cursor-pointer"
                              >
                                {showProviderManualInput
                                  ? "Hide manual entry"
                                  : "Enter redirect URL / token manually"}
                              </button>
                            </div>

                            {showProviderManualInput && (
                              <form
                                onSubmit={(e) => handleProviderManualSubmit(e, meta.id)}
                                className="pt-2 flex items-center space-x-2"
                              >
                                <input
                                  type="text"
                                  value={providerManualInput}
                                  onChange={(e) => setProviderManualInput(e.target.value)}
                                  placeholder="Paste redirect URL, code, or token parameter"
                                  className="flex-1 px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-xs text-white focus:outline-none theme-accent-focus font-mono"
                                />
                                <button
                                  type="submit"
                                  className="px-4 py-2 theme-accent-btn font-bold rounded-lg text-xs transition-all cursor-pointer"
                                >
                                  Authenticate
                                </button>
                              </form>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Import Options Card */}
                    <div className="bg-[#151926] border border-[#23293e] rounded-xl p-4 space-y-3">
                      <div className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">
                        Scanner & Import Options
                      </div>

                      <div className="space-y-2.5">
                        <label className="flex items-center justify-between p-2.5 rounded-lg bg-[#111420] border border-[#1d2232] cursor-pointer hover:bg-[#151928] transition-colors">
                          <div className="flex items-center space-x-3">
                            <HardDrive className="w-4 h-4 theme-accent-text shrink-0" />
                            <div>
                              <div className="font-semibold text-slate-200">
                                Import locally installed {meta.name} games
                              </div>
                              <div className="text-[10px] text-slate-400">{meta.localNote}</div>
                            </div>
                          </div>
                          <input
                            type="checkbox"
                            checked={integ.import_installed}
                            onChange={() =>
                              handleSaveProviderInteg({
                                ...integ,
                                import_installed: !integ.import_installed,
                              })
                            }
                            className="w-4 h-4 rounded bg-[#1e2335] border-[#2c344d] focus:ring-0 cursor-pointer accent-[var(--app-accent-color)]"
                          />
                        </label>

                        {(meta.hasCloudAuth || meta.id === "riot") && (
                          <label className="flex items-center justify-between p-2.5 rounded-lg bg-[#111420] border border-[#1d2232] cursor-pointer hover:bg-[#151928] transition-colors">
                            <div className="flex items-center space-x-3">
                              <Cloud className="w-4 h-4 text-amber-400 shrink-0" />
                              <div>
                                <div className="font-semibold text-slate-200">
                                  Import uninstalled / cloud-owned catalog
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {meta.id === "riot"
                                    ? "Imports Riot's PC catalog (League of Legends, VALORANT, Legends of Runeterra, 2XKO) even if not currently installed."
                                    : `Queries your connected ${meta.name} account for owned titles not currently installed.`}
                                </div>
                              </div>
                            </div>
                            <input
                              type="checkbox"
                              checked={integ.import_uninstalled}
                              onChange={() =>
                                handleSaveProviderInteg({
                                  ...integ,
                                  import_uninstalled: !integ.import_uninstalled,
                                })
                              }
                              className="w-4 h-4 rounded bg-[#1e2335] border-[#2c344d] focus:ring-0 cursor-pointer accent-[var(--app-accent-color)]"
                            />
                          </label>
                        )}

                        {meta.hasPlaytimeSync && (
                          <label className="flex items-center justify-between p-2.5 rounded-lg bg-[#111420] border border-[#1d2232] cursor-pointer hover:bg-[#151928] transition-colors">
                            <div className="flex items-center space-x-3">
                              <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
                              <div>
                                <div className="font-semibold text-slate-200">
                                  Sync recorded playtime & last played date
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  Imports playtime statistics and last session timestamps from {meta.name}.
                                </div>
                              </div>
                            </div>
                            <input
                              type="checkbox"
                              checked={integ.sync_playtime}
                              onChange={() =>
                                handleSaveProviderInteg({
                                  ...integ,
                                  sync_playtime: !integ.sync_playtime,
                                })
                              }
                              className="w-4 h-4 rounded bg-[#1e2335] border-[#2c344d] focus:ring-0 cursor-pointer accent-[var(--app-accent-color)]"
                            />
                          </label>
                        )}
                      </div>
                    </div>

                    {/* Sync Action Row */}
                    <div className="pt-2 flex items-center justify-between">
                      <div className="text-[11px] text-slate-400">
                        {integ.last_sync ? (
                          <span>
                            Last Synced: <strong className="text-slate-200">{integ.last_sync}</strong>
                          </span>
                        ) : (
                          <span>Ready to scan</span>
                        )}
                      </div>

                      <button
                        onClick={() => handleSyncProviderLibrary(meta)}
                        disabled={isProviderSyncing}
                        className="flex items-center space-x-2 px-6 py-2.5 theme-accent-btn font-bold rounded-xl transition-all shadow-md active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                      >
                        <RefreshCw className={`w-4 h-4 ${isProviderSyncing ? "animate-spin" : ""}`} />
                        <span>
                          {isProviderSyncing
                            ? `Scanning ${meta.name}...`
                            : `Scan & Sync ${meta.name}`}
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })()
            ) : (
              /* Coming Soon Placeholder for other categories */
              <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3">
                <Sparkles className="w-12 h-12 text-slate-600" />
                <h3 className="text-base font-bold text-slate-200 capitalize">
                  {activeTab.replace("_", " ")} Integration
                </h3>
                <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
                  Support for this category is planned in upcoming phases. The library architecture is already modularized to plug in scanners and store manifests seamlessly.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
