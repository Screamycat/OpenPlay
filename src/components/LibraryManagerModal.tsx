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
import { PlatformIcon } from "./icons/PlatformIcons";

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
  | "manual_local";

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

/**
 * Brand color classes for providers when active or highlighted in the sidebar.
 * Steam: blue/dark blue, Epic: grey/blackish, Xbox: green/dark green, etc.
 */
const getProviderBrandClasses = (id: string, active: boolean) => {
  if (!active) return "";
  switch (id) {
    case "steam":
      return "bg-sky-950/70 text-sky-300 border border-sky-500/50 font-semibold shadow-[0_0_12px_rgba(14,165,233,0.15)]";
    case "epic":
      return "bg-zinc-800/90 text-zinc-100 border border-zinc-400/50 font-semibold shadow-[0_0_12px_rgba(255,255,255,0.08)]";
    case "gog":
      return "bg-purple-950/70 text-purple-300 border border-purple-500/50 font-semibold shadow-[0_0_12px_rgba(168,85,247,0.15)]";
    case "xbox":
      return "bg-emerald-950/70 text-emerald-300 border border-emerald-500/50 font-semibold shadow-[0_0_12px_rgba(16,185,129,0.15)]";
    case "battlenet":
      return "bg-blue-950/70 text-blue-300 border border-blue-500/50 font-semibold shadow-[0_0_12px_rgba(59,130,246,0.15)]";
    case "ea":
      return "bg-rose-950/70 text-rose-300 border border-rose-500/50 font-semibold shadow-[0_0_12px_rgba(244,63,94,0.15)]";
    case "ubisoft":
      return "bg-cyan-950/70 text-cyan-300 border border-cyan-500/50 font-semibold shadow-[0_0_12px_rgba(6,182,212,0.15)]";
    case "riot":
      return "bg-red-950/70 text-red-300 border border-red-500/50 font-semibold shadow-[0_0_12px_rgba(239,68,68,0.15)]";
    case "amazon":
      return "bg-amber-950/70 text-amber-300 border border-amber-500/50 font-semibold shadow-[0_0_12px_rgba(245,158,11,0.15)]";
    case "retroachievements":
      return "bg-amber-950/70 text-amber-300 border border-amber-500/50 font-semibold shadow-[0_0_12px_rgba(245,158,11,0.15)]";
    case "googleplay":
      return "bg-emerald-950/70 text-emerald-300 border border-emerald-500/50 font-semibold";
    case "roblox":
      return "bg-zinc-800/80 text-zinc-200 border border-zinc-500/50 font-semibold";
    default:
      return "theme-accent-subtle-bg theme-accent-text border theme-accent-subtle-border font-semibold";
  }
};

/**
 * Header badge styling matching each provider's brand identity.
 */
const getProviderBadgeClasses = (id: string) => {
  switch (id) {
    case "steam":
      return "bg-sky-950/80 text-sky-300 border-sky-500/40";
    case "epic":
      return "bg-zinc-800 text-zinc-100 border-zinc-400/40";
    case "gog":
      return "bg-purple-950/80 text-purple-300 border-purple-500/40";
    case "xbox":
      return "bg-emerald-950/80 text-emerald-300 border-emerald-500/40";
    case "battlenet":
      return "bg-blue-950/80 text-blue-300 border-blue-500/40";
    case "ea":
      return "bg-rose-950/80 text-rose-300 border-rose-500/40";
    case "ubisoft":
      return "bg-cyan-950/80 text-cyan-300 border-cyan-500/40";
    case "riot":
      return "bg-red-950/80 text-red-300 border-red-500/40";
    case "amazon":
      return "bg-amber-950/80 text-amber-300 border-amber-500/40";
    case "retroachievements":
      return "bg-amber-950/80 text-amber-300 border-amber-500/40";
    default:
      return "theme-accent-subtle-bg theme-accent-text border-[var(--app-accent-color)]/30";
  }
};

/**
 * Action / Sync button styling matching each provider's brand identity.
 */
const getProviderButtonClasses = (id: string) => {
  switch (id) {
    case "steam":
      return "bg-gradient-to-r from-sky-600 to-sky-500 hover:from-sky-500 hover:to-sky-400 text-white shadow-sky-950/50";
    case "epic":
      return "bg-gradient-to-r from-zinc-200 to-white hover:from-white hover:to-zinc-100 text-zinc-950 font-bold shadow-zinc-950/50";
    case "gog":
      return "bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white shadow-purple-950/50";
    case "xbox":
      return "bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-emerald-950/50";
    case "battlenet":
      return "bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white shadow-blue-950/50";
    case "ea":
      return "bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white shadow-rose-950/50";
    case "ubisoft":
      return "bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-slate-950 font-bold shadow-cyan-950/50";
    case "riot":
      return "bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white shadow-red-950/50";
    case "amazon":
      return "bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-bold shadow-amber-950/50";
    case "retroachievements":
      return "bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-bold shadow-amber-950/50";
    default:
      return "theme-accent-btn";
  }
};

/**
 * Checkbox accent color matching each provider's brand.
 */
const getProviderCheckboxClasses = (id: string) => {
  switch (id) {
    case "steam":
      return "accent-sky-500";
    case "epic":
      return "accent-zinc-300";
    case "gog":
      return "accent-purple-500";
    case "xbox":
      return "accent-emerald-500";
    case "battlenet":
      return "accent-blue-500";
    case "ea":
      return "accent-rose-500";
    case "ubisoft":
      return "accent-cyan-400";
    case "riot":
      return "accent-red-500";
    case "amazon":
      return "accent-amber-500";
    case "retroachievements":
      return "accent-amber-500";
    default:
      return "accent-[var(--app-accent-color)]";
  }
};

/**
 * Input focus border matching provider brand.
 */
const getProviderFocusClasses = (id: string) => {
  switch (id) {
    case "steam":
      return "focus:border-sky-400";
    case "epic":
      return "focus:border-zinc-300";
    case "gog":
      return "focus:border-purple-400";
    case "xbox":
      return "focus:border-emerald-400";
    case "battlenet":
      return "focus:border-blue-400";
    case "ea":
      return "focus:border-rose-400";
    case "ubisoft":
      return "focus:border-cyan-400";
    case "riot":
      return "focus:border-red-400";
    case "amazon":
      return "focus:border-amber-400";
    default:
      return "theme-accent-focus";
  }
};

/**
 * Brand color for icons and accents in provider cards.
 */
const getProviderBrandText = (id: string) => {
  switch (id) {
    case "steam":
      return "text-sky-400";
    case "epic":
      return "text-zinc-300";
    case "gog":
      return "text-purple-400";
    case "xbox":
      return "text-emerald-400";
    case "battlenet":
      return "text-blue-400";
    case "ea":
      return "text-rose-400";
    case "ubisoft":
      return "text-cyan-400";
    case "riot":
      return "text-red-400";
    case "amazon":
      return "text-amber-400";
    default:
      return "theme-accent-text";
  }
};

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
      data-theme-part="library-manager-modal"
      className="fixed inset-0 z-50 theme-modal-backdrop flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-theme-part="modal-container"
        className="w-full max-w-5xl theme-modal-container rounded-2xl flex flex-col h-[88vh] max-h-[880px] min-h-[640px] overflow-hidden"
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 theme-modal-header shrink-0">
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
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Left Categorized Sidebar + Right Content Pane */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Categorized Navigation (Manual, Emulation, Providers) */}
          <div className="w-64 border-r theme-border bg-black/20 overflow-y-auto p-3 space-y-4 select-none">
            {/* 1. MANUAL & IMPORT */}
            <div>
              <div className="px-2 py-1 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                Manual & Import
              </div>
              <div className="space-y-0.5 mt-1">
                <button
                  onClick={() => setActiveTab("manual_local")}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                    activeTab === "manual_local"
                      ? "theme-accent-subtle-bg theme-accent-text border theme-accent-subtle-border font-semibold"
                      : "text-slate-300 hover:text-white hover:bg-white/[0.06]"
                  }`}
                >
                  <span className="flex items-center space-x-2">
                    <FolderOpen className="w-3.5 h-3.5 theme-accent-text" />
                    <span>Local Files & Folders</span>
                  </span>
                </button>
              </div>
            </div>

            <div className="border-t theme-border-subtle" />

            {/* 2. EMULATION */}
            <div>
              <div className="px-2 py-1 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                Emulation
              </div>
              <div className="space-y-0.5 mt-1">
                <button
                  onClick={() => setActiveTab("emulation")}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                    activeTab === "emulation"
                      ? "theme-accent-subtle-bg theme-accent-text border theme-accent-subtle-border font-semibold"
                      : "text-slate-300 hover:text-white hover:bg-white/[0.06]"
                  }`}
                >
                  <span className="flex items-center space-x-2">
                    <PlatformIcon platform="emulation" className="w-3.5 h-3.5" />
                    <span>Emulators & ROMs</span>
                  </span>
                </button>

                {/* RetroAchievements */}
                {(() => {
                  const isRaConnected = Boolean(config?.retroachievements_username && config?.retroachievements_api_key);
                  return (
                    <button
                      onClick={() => setActiveTab("retroachievements")}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                        activeTab === "retroachievements"
                          ? getProviderBrandClasses("retroachievements", true)
                          : isRaConnected
                          ? "text-slate-300 hover:text-white hover:bg-white/[0.06]"
                          : "text-slate-400 opacity-55 hover:opacity-100 hover:bg-white/[0.06]"
                      }`}
                    >
                      <span className="flex items-center space-x-2">
                        <PlatformIcon platform="retroachievements" className="w-3.5 h-3.5 shrink-0" />
                        <span>RetroAchievements</span>
                      </span>
                    </button>
                  );
                })()}
              </div>
            </div>

            <div className="border-t theme-border-subtle" />

            {/* 3. PROVIDERS */}
            <div>
              <div className="px-2 py-1 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                Providers
              </div>
              <div className="space-y-0.5 mt-1">
                {/* Steam */}
                <button
                  onClick={() => setActiveTab("steam")}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                    activeTab === "steam"
                      ? getProviderBrandClasses("steam", true)
                      : steamIntegration.is_authenticated
                      ? "text-slate-300 hover:text-white hover:bg-white/[0.06]"
                      : "text-slate-400 opacity-55 hover:opacity-100 hover:bg-white/[0.06]"
                  }`}
                >
                  <span className="flex items-center space-x-2">
                    <PlatformIcon platform="steam" className="w-3.5 h-3.5 shrink-0" />
                    <span>Steam</span>
                  </span>
                </button>

                {/* Epic Games */}
                <button
                  onClick={() => setActiveTab("epic")}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                    activeTab === "epic"
                      ? getProviderBrandClasses("epic", true)
                      : epicIntegration.is_authenticated
                      ? "text-slate-300 hover:text-white hover:bg-white/[0.06]"
                      : "text-slate-400 opacity-55 hover:opacity-100 hover:bg-white/[0.06]"
                  }`}
                >
                  <span className="flex items-center space-x-2">
                    <PlatformIcon platform="epic" className="w-3.5 h-3.5 shrink-0" />
                    <span>Epic Games</span>
                  </span>
                </button>

                {/* Additional 9 Providers */}
                {EXTRA_PROVIDERS.map((prov) => {
                  const integ = getProviderInteg(prov.id);
                  const isActive = activeTab === prov.id;
                  const isConnected = prov.hasCloudAuth ? integ.is_authenticated : false;

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
                          ? getProviderBrandClasses(prov.id, true)
                          : prov.isInactive
                          ? "text-slate-500 opacity-40 hover:opacity-80 hover:bg-white/[0.06]"
                          : isConnected
                          ? "text-slate-300 hover:text-white hover:bg-white/[0.06]"
                          : "text-slate-400 opacity-55 hover:opacity-100 hover:bg-white/[0.06]"
                      }`}
                    >
                      <span className="flex items-center space-x-2">
                        <PlatformIcon platform={prov.id} className="w-3.5 h-3.5 shrink-0" />
                        <span>{prov.name}</span>
                      </span>
                      {prov.isInactive && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/10 text-slate-400 font-medium">
                          Soon
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
                    <span className={`p-1 px-2 rounded text-xs font-mono font-bold border ${getProviderBadgeClasses("steam")}`}>
                      STEAM
                    </span>
                    <span>Steam Integration</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Connect your Steam account or import games directly from local drives.
                  </p>
                </div>

                {/* 1. Account Authentication Card */}
                <div className="theme-surface-card rounded-xl p-4 space-y-4">
                  <div className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">
                    Steam Account
                  </div>

                  {steamIntegration.is_authenticated ? (
                    <div className="flex items-center justify-between theme-surface-input p-3 rounded-lg">
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
                      <div className="p-3 theme-surface-input rounded-lg text-slate-400 leading-relaxed text-xs">
                        Sign in to connect your Steam account. OpenPlay uses an authentic embedded login window to securely identify your profile, enabling syncing of uninstalled library games and cloud playtime.
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={onOpenSteamLogin}
                          disabled={isAuthenticating}
                          className={`flex items-center space-x-2 px-5 py-2.5 ${getProviderButtonClasses("steam")} font-bold rounded-xl shadow-lg transition-all active:scale-[0.98] cursor-pointer`}
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
                            className={`flex-1 px-3 py-2 theme-surface-input rounded-lg text-xs text-white focus:outline-none ${getProviderFocusClasses("steam")} font-mono`}
                          />
                          <button
                            type="submit"
                            className={`px-4 py-2 ${getProviderButtonClasses("steam")} font-bold rounded-lg text-xs transition-all cursor-pointer`}
                          >
                            Verify & Connect
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </div>

                {/* 2. Library Import Settings */}
                <div className="theme-surface-card rounded-xl p-4 space-y-3">
                  <div className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">
                    Import Options
                  </div>

                  <div className="space-y-2.5">
                    {/* Import Installed */}
                    <label className="flex items-center justify-between p-2.5 rounded-lg theme-surface-card hover:bg-white/[0.06] cursor-pointer transition-colors">
                      <div className="flex items-center space-x-3">
                        <HardDrive className={`w-4 h-4 ${getProviderBrandText("steam")}`} />
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
                        className={`w-4 h-4 rounded cursor-pointer ${getProviderCheckboxClasses("steam")}`}
                      />
                    </label>

                    {/* Import Uninstalled */}
                    <label className="flex items-center justify-between p-2.5 rounded-lg theme-surface-card hover:bg-white/[0.06] cursor-pointer transition-colors">
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
                        className={`w-4 h-4 rounded cursor-pointer ${getProviderCheckboxClasses("steam")}`}
                      />
                    </label>

                    {/* Sync Playtime */}
                    <label className="flex items-center justify-between p-2.5 rounded-lg theme-surface-card hover:bg-white/[0.06] cursor-pointer transition-colors">
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
                        className={`w-4 h-4 rounded cursor-pointer ${getProviderCheckboxClasses("steam")}`}
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
                    className={`flex items-center space-x-2 px-6 py-2.5 ${getProviderButtonClasses("steam")} font-bold rounded-xl transition-all shadow-md active:scale-[0.98] disabled:opacity-50 cursor-pointer`}
                  >
                    <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
                    <span>{isSyncing ? "Scanning Steam Library..." : "Scan & Sync Steam Library"}</span>
                  </button>
                </div>
              </div>
            ) : activeTab === "epic" ? (
              /* EPIC GAMES INTEGRATION VIEW */
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                    <span className={`p-1 px-2 rounded text-xs font-mono font-bold border ${getProviderBadgeClasses("epic")}`}>
                      EPIC
                    </span>
                    <span>Epic Games Store</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Connect your Epic Games account to import your cloud library and locally installed titles.
                  </p>
                </div>

                {/* 1. Account Authentication Card */}
                <div className="theme-surface-card rounded-xl p-4 space-y-4">
                  <div className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">
                    Epic Games Account
                  </div>

                  {epicIntegration.is_authenticated ? (
                    <div className="flex items-center justify-between theme-surface-input p-3 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full theme-accent-btn flex items-center justify-center font-bold text-white shadow-md border border-white/20">
                          {epicIntegration.username?.[0]?.toUpperCase() || "E"}
                        </div>
                        <div>
                          <div className="font-bold text-white text-sm flex items-center space-x-2">
                            <span>{epicIntegration.username || "Epic User"}</span>
                            <span className="text-[9px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-400 rounded-full font-semibold border border-emerald-500/30">
                              Authenticated
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
                        <span>Log Out</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="p-3 theme-surface-input rounded-lg text-slate-400 leading-relaxed text-xs">
                        Sign in to connect your Epic Games account. OpenPlay uses an authentic embedded login window to securely identify your profile, enabling automatic importing of your claimed, purchased, and installed games with official artwork and metadata.
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={onOpenEpicLogin}
                          disabled={isAuthenticatingEpic}
                          className={`flex items-center space-x-2 px-5 py-2.5 ${getProviderButtonClasses("epic")} font-bold rounded-xl shadow-lg transition-all active:scale-[0.98] cursor-pointer`}
                        >
                          <LogIn className="w-4 h-4" />
                          <span>{isAuthenticatingEpic ? "Opening Login..." : "Log In with Epic Games"}</span>
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
                            className={`flex-1 px-3 py-2 theme-surface-input rounded-lg text-xs text-white focus:outline-none ${getProviderFocusClasses("epic")} font-mono`}
                          />
                          <button
                            type="submit"
                            className={`px-4 py-2 ${getProviderButtonClasses("epic")} font-bold rounded-lg text-xs transition-all cursor-pointer`}
                          >
                            Verify & Connect
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </div>

                {/* 2. Library Import Settings */}
                <div className="theme-surface-card rounded-xl p-4 space-y-3">
                  <div className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">
                    Import Options
                  </div>

                  <div className="space-y-2.5">
                    {/* Import Installed */}
                    <label className="flex items-center justify-between p-2.5 rounded-lg theme-surface-card hover:bg-white/[0.06] cursor-pointer transition-colors">
                      <div className="flex items-center space-x-3">
                        <HardDrive className={`w-4 h-4 ${getProviderBrandText("epic")}`} />
                        <div>
                          <div className="font-semibold text-slate-200">
                            Import installed games
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
                        className={`w-4 h-4 rounded cursor-pointer ${getProviderCheckboxClasses("epic")}`}
                      />
                    </label>

                    {/* Import Uninstalled */}
                    <label className="flex items-center justify-between p-2.5 rounded-lg theme-surface-card hover:bg-white/[0.06] cursor-pointer transition-colors">
                      <div className="flex items-center space-x-3">
                        <Cloud className="w-4 h-4 text-amber-400" />
                        <div>
                          <div className="font-semibold text-slate-200">
                            Import uninstalled / cloud-owned games
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
                        className={`w-4 h-4 rounded cursor-pointer ${getProviderCheckboxClasses("epic")}`}
                      />
                    </label>

                    {/* Sync Playtime */}
                    <label className="flex items-center justify-between p-2.5 rounded-lg theme-surface-card hover:bg-white/[0.06] cursor-pointer transition-colors">
                      <div className="flex items-center space-x-3">
                        <Clock className="w-4 h-4 text-emerald-400" />
                        <div>
                          <div className="font-semibold text-slate-200">
                            Sync lifetime playtime
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
                        className={`w-4 h-4 rounded cursor-pointer ${getProviderCheckboxClasses("epic")}`}
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
                    className={`flex items-center space-x-2 px-6 py-2.5 ${getProviderButtonClasses("epic")} font-bold rounded-xl transition-all shadow-md active:scale-[0.98] disabled:opacity-50 cursor-pointer`}
                  >
                    <RefreshCw className={`w-4 h-4 ${isSyncingEpic ? "animate-spin" : ""}`} />
                    <span>{isSyncingEpic ? "Scanning Epic Library..." : "Scan & Sync Epic Games Library"}</span>
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
                        <span className={`p-1 px-2 rounded text-xs font-mono font-bold border ${getProviderBadgeClasses(meta.id)}`}>
                          {meta.badge}
                        </span>
                        <span>{meta.name}</span>
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">{meta.description}</p>
                    </div>

                    {/* Cloud Authentication Card */}
                    {meta.hasCloudAuth && (
                      <div className="theme-surface-card rounded-xl p-4 space-y-4">
                        <div className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">
                          {meta.name} Account
                        </div>

                        {integ.is_authenticated ? (
                          <div className="flex items-center justify-between theme-surface-input p-3 rounded-lg">
                            <div className="flex items-center space-x-3">
                              {integ.avatar_url ? (
                                <img
                                  src={integ.avatar_url}
                                  alt={meta.name}
                                  className="w-10 h-10 rounded-full border border-[var(--app-accent-color)] shadow-md"
                                />
                              ) : (
                                <div className={`w-10 h-10 rounded-full ${getProviderButtonClasses(meta.id)} flex items-center justify-center font-bold text-white shadow-md border border-white/20`}>
                                  {integ.username?.[0]?.toUpperCase() || meta.badge[0]}
                                </div>
                              )}
                              <div>
                                <div className="font-bold text-white text-sm flex items-center space-x-2">
                                  <span>{integ.username || `${meta.name} User`}</span>
                                  <span className="text-[9px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-400 rounded-full font-semibold border border-emerald-500/30">
                                    Authenticated
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
                              <span>Log Out</span>
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="p-3 theme-surface-input rounded-lg text-slate-400 leading-relaxed text-xs">
                              {meta.cloudNote}
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                              <button
                                onClick={() => handleOpenProviderLogin(meta.id)}
                                disabled={isProviderAuth}
                                className={`flex items-center space-x-2 px-5 py-2.5 ${getProviderButtonClasses(meta.id)} font-bold rounded-xl shadow-lg transition-all active:scale-[0.98] cursor-pointer`}
                              >
                                <LogIn className="w-4 h-4" />
                                <span>
                                  {isProviderAuth ? "Opening Login..." : `Log In with ${meta.name}`}
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
                                  className={`flex-1 px-3 py-2 theme-surface-input rounded-lg text-xs text-white focus:outline-none ${getProviderFocusClasses(meta.id)} font-mono`}
                                />
                                <button
                                  type="submit"
                                  className={`px-4 py-2 ${getProviderButtonClasses(meta.id)} font-bold rounded-lg text-xs transition-all cursor-pointer`}
                                >
                                  Verify & Connect
                                </button>
                              </form>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Import Options Card */}
                    <div className="theme-surface-card rounded-xl p-4 space-y-3">
                      <div className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">
                        Import Options
                      </div>

                      <div className="space-y-2.5">
                        <label className="flex items-center justify-between p-2.5 rounded-lg theme-surface-card hover:bg-white/[0.06] cursor-pointer transition-colors">
                          <div className="flex items-center space-x-3">
                            <HardDrive className={`w-4 h-4 ${getProviderBrandText(meta.id)} shrink-0`} />
                            <div>
                              <div className="font-semibold text-slate-200">
                                Import installed games
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
                            className={`w-4 h-4 rounded cursor-pointer ${getProviderCheckboxClasses(meta.id)}`}
                          />
                        </label>

                        {(meta.hasCloudAuth || meta.id === "riot") && (
                          <label className="flex items-center justify-between p-2.5 rounded-lg theme-surface-card hover:bg-white/[0.06] cursor-pointer transition-colors">
                            <div className="flex items-center space-x-3">
                              <Cloud className="w-4 h-4 text-amber-400 shrink-0" />
                              <div>
                                <div className="font-semibold text-slate-200">
                                  Import uninstalled / cloud-owned games
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
                              className={`w-4 h-4 rounded cursor-pointer ${getProviderCheckboxClasses(meta.id)}`}
                            />
                          </label>
                        )}

                        {meta.hasPlaytimeSync && (
                          <label className="flex items-center justify-between p-2.5 rounded-lg theme-surface-card hover:bg-white/[0.06] cursor-pointer transition-colors">
                            <div className="flex items-center space-x-3">
                              <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
                              <div>
                                <div className="font-semibold text-slate-200">
                                  Sync lifetime playtime
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
                              className={`w-4 h-4 rounded cursor-pointer ${getProviderCheckboxClasses(meta.id)}`}
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
                        className={`flex items-center space-x-2 px-6 py-2.5 ${getProviderButtonClasses(meta.id)} font-bold rounded-xl transition-all shadow-md active:scale-[0.98] disabled:opacity-50 cursor-pointer`}
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
