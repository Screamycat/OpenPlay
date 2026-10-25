import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { Game, GameTrailer } from "./types/game";
import { LibraryIntegration } from "./types/integration";
import { AppConfig, DEFAULT_APP_CONFIG } from "./types/config";
import {
  TopNav,
  ViewMode,
  StatusFilter,
  SortOption,
  SortDirection,
  GroupByOption,
} from "./components/TopNav";
import { GameGrid } from "./components/GameGrid";
import { GameDetails } from "./components/GameDetails";
import { PosterZoomSlider } from "./components/PosterZoomSlider";
import { AddGameModal } from "./components/AddGameModal";
import { EditGameModal } from "./components/EditGameModal";
import { SettingsModal } from "./components/SettingsModal";
import { LeftDrawer } from "./components/LeftDrawer";
import { LibraryManagerModal, CategoryTab } from "./components/LibraryManagerModal";
import { GameContextMenu } from "./components/GameContextMenu";
import { SteamGridDBModal } from "./components/SteamGridDBModal";
import { TrailerModal } from "./components/TrailerModal";
import { DynamicBackground } from "./components/DynamicBackground";
import { AchievementHunterHub } from "./components/AchievementHunterHub";
import { HunterProfile } from "./types/achievement";
import { Gamepad2, Loader2, Sparkles, RefreshCw } from "lucide-react";
import { resolveImageSrc } from "./utils/image";
import "./App.css";

interface ScanResult {
  count: number;
  installed: number;
  uninstalled: number;
}

interface FullRefreshProgress {
  current: number;
  total: number;
  phase: string;
  message: string;
  game_title?: string;
}

export function App() {
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(() => {
    return typeof window !== "undefined"
      ? localStorage.getItem("openplay_last_selected_game_id")
      : null;
  });
  const selectedGameIdRef = useRef<string | null>(selectedGameId);

  const handleSelectGame = (gameId: string) => {
    setSelectedGameId(gameId);
    selectedGameIdRef.current = gameId;
    try {
      localStorage.setItem("openplay_last_selected_game_id", gameId);
    } catch {}

    setAppConfig((prev) => {
      const updated: AppConfig = { ...prev, last_selected_game_id: gameId };
      invoke("save_app_config", { config: updated }).catch((e) =>
        console.warn("Failed to persist last_selected_game_id:", e)
      );
      return updated;
    });
  };

  useEffect(() => {
    selectedGameIdRef.current = selectedGameId;
    if (selectedGameId) {
      try {
        localStorage.setItem("openplay_last_selected_game_id", selectedGameId);
      } catch {}
    }
  }, [selectedGameId]);

  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("playtime");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [groupBy, setGroupBy] = useState<GroupByOption>(() => {
    const saved = localStorage.getItem("openplay_group_by");
    return (saved as GroupByOption) || "none";
  });

  const handleGroupByChange = (newGroup: GroupByOption) => {
    setGroupBy(newGroup);
    localStorage.setItem("openplay_group_by", newGroup);
  };

  // Advanced Filters state (Tags, Developers, Libraries)
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedDevelopers, setSelectedDevelopers] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);

  // Application Config & Persistence
  const [appConfig, setAppConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG);
  const isConfigLoadedRef = useRef(false);
  const saveConfigTimeoutRef = useRef<number | null>(null);

  // Default cardWidth to 108 for 7 columns, persist in localStorage
  const [cardWidth, setCardWidth] = useState(() => {
    const saved = localStorage.getItem("openplay_card_width");
    return saved ? Number(saved) : 108;
  });

  // Fixed grid width proportion (defaults to 52% for 7 vertical columns)
  const [gridWidthPercent] = useState(() => {
    const saved = localStorage.getItem("openplay_grid_width");
    return saved ? Number(saved) : 52;
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [isSyncingMetadata, setIsSyncingMetadata] = useState(false);
  const [isFullRefreshing, setIsFullRefreshing] = useState(false);
  const [fullRefreshProgress, setFullRefreshProgress] = useState<FullRefreshProgress | null>(null);
  const [isLaunchingId, setIsLaunchingId] = useState<string | null>(null);
  const [runningGameIds, setRunningGameIds] = useState<string[]>([]);
  const [isFetchingMetaId, setIsFetchingMetaId] = useState<string | null>(null);
  const [refreshingGameIds, setRefreshingGameIds] = useState<string[]>([]);
  const lastLiveSyncRef = useRef<number>(0);
  const revalidatedGamesRef = useRef<Map<string, number>>(new Map());

  // Modals & Drawers
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isLibraryManagerOpen, setIsLibraryManagerOpen] = useState(false);
  const [libraryManagerTab, setLibraryManagerTab] = useState<CategoryTab>("steam");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Context Menu state
  const [contextMenu, setContextMenu] = useState<{
    game: Game;
    x: number;
    y: number;
  } | null>(null);

  // Modals triggered from context menu
  const [steamGridDBGame, setSteamGridDBGame] = useState<Game | null>(null);
  const [trailerGame, setTrailerGame] = useState<Game | null>(null);

  // Achievement Hunter Hub state
  const [isHunterHubOpen, setIsHunterHubOpen] = useState(false);
  const [hunterProfile, setHunterProfile] = useState<HunterProfile | null>(null);

  const loadHunterStats = async () => {
    try {
      const data = await invoke<HunterProfile>("get_hunter_profile");
      setHunterProfile(data);
    } catch (e) {}
  };

  // Steam Integration state
  const [steamIntegration, setSteamIntegration] = useState<LibraryIntegration>({
    provider: "steam",
    is_authenticated: false,
    import_installed: true,
    import_uninstalled: true,
    sync_playtime: true,
  });
  const [isAuthenticatingSteam, setIsAuthenticatingSteam] = useState(false);

  // Epic Games Integration state
  const [epicIntegration, setEpicIntegration] = useState<LibraryIntegration>({
    provider: "epic",
    is_authenticated: false,
    import_installed: true,
    import_uninstalled: true,
    sync_playtime: false,
  });
  const [isAuthenticatingEpic, setIsAuthenticatingEpic] = useState(false);
  const [isScanningEpic, setIsScanningEpic] = useState(false);
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
    try {
      const appWindow = getCurrentWindow();
      appWindow.isMaximized().then(setIsWindowMaximized).catch(() => {});
      const unlisten = appWindow.onResized(async () => {
        try {
          setIsWindowMaximized(await appWindow.isMaximized());
        } catch (e) {}
      });
      return () => {
        unlisten.then((fn) => fn());
      };
    } catch (e) {}
  }, []);

  const handleCardWidthChange = (val: number) => {
    setCardWidth(val);
    localStorage.setItem("openplay_card_width", String(val));
  };

  // Load games, application config and integration state on mount
  const loadInitialData = async () => {
    try {
      setIsLoading(true);

      // 1. Load Unified App Config from SQLite
      let loadedCfg: AppConfig = DEFAULT_APP_CONFIG;
      try {
        const cfg = await invoke<AppConfig>("get_app_config");
        if (cfg) {
          loadedCfg = { ...DEFAULT_APP_CONFIG, ...cfg };
          setAppConfig(loadedCfg);

          if (cfg.view_mode) setViewMode(cfg.view_mode as ViewMode);
          if (cfg.card_width) setCardWidth(cfg.card_width);
          if (cfg.status_filter) setStatusFilter(cfg.status_filter as StatusFilter);
          if (cfg.sort_by) setSortBy(cfg.sort_by as SortOption);
          if (cfg.sort_direction) setSortDirection(cfg.sort_direction as SortDirection);
          if (cfg.group_by) setGroupBy(cfg.group_by as GroupByOption);
          if (cfg.show_favorites_only !== undefined) setShowFavoritesOnly(cfg.show_favorites_only);
          if (cfg.selected_genres) setSelectedGenres(cfg.selected_genres);
          if (cfg.selected_developers) setSelectedDevelopers(cfg.selected_developers);
          if (cfg.selected_sources) setSelectedSources(cfg.selected_sources);
        }
      } catch (err) {
        console.warn("Could not load app config:", err);
      }

      // 2. Load Integrations & Games
      const integration = await invoke<LibraryIntegration>("get_steam_integration");
      if (integration) {
        setSteamIntegration(integration);
      }

      try {
        const epicInteg = await invoke<LibraryIntegration>("get_epic_integration");
        if (epicInteg) {
          setEpicIntegration(epicInteg);
        }
      } catch (e) {
        console.warn("Could not load Epic integration:", e);
      }

      const list = await invoke<Game[]>("get_games");
      setGames(list);

      // Re-select last selected game from config / localStorage if valid, or default to RetroArch / first
      const storedLastId =
        loadedCfg.last_selected_game_id ||
        (typeof window !== "undefined"
          ? localStorage.getItem("openplay_last_selected_game_id")
          : null);

      if (list.length > 0) {
        if (storedLastId && list.some((g) => g.id === storedLastId)) {
          setSelectedGameId(storedLastId);
          selectedGameIdRef.current = storedLastId;
        } else if (!selectedGameIdRef.current || !list.some((g) => g.id === selectedGameIdRef.current)) {
          const retro = list.find((g) => g.title.toLowerCase().includes("retroarch"));
          const fallback = retro ? retro.id : list[0].id;
          setSelectedGameId(fallback);
          selectedGameIdRef.current = fallback;
        }
      }

      // 3. Query currently running games
      try {
        const running = await invoke<string[]>("get_running_games");
        if (running && Array.isArray(running)) {
          setRunningGameIds(running);
        }
      } catch (e) {}

      // 4. Auto-scan on startup if enabled in settings
      if (loadedCfg.auto_scan_on_startup) {
        handleScanLibrary().catch(() => {});
      }

      // 5. Load Hunter Stats for TopNav trophy pill
      loadHunterStats().catch(() => {});
    } catch (err) {
      console.error("Failed to load initial data:", err);
    } finally {
      setIsLoading(false);
      isConfigLoadedRef.current = true;
    }
  };

  // Auto-persist session & layout state to SQLite config
  useEffect(() => {
    if (!isConfigLoadedRef.current) return;

    if (saveConfigTimeoutRef.current) clearTimeout(saveConfigTimeoutRef.current);
    saveConfigTimeoutRef.current = window.setTimeout(() => {
      setAppConfig((prev) => {
        const updated: AppConfig = {
          ...prev,
          last_selected_game_id: selectedGameId,
          view_mode: viewMode,
          card_width: cardWidth,
          grid_width_percent: gridWidthPercent,
          status_filter: statusFilter,
          sort_by: sortBy,
          sort_direction: sortDirection,
          group_by: groupBy,
          show_favorites_only: showFavoritesOnly,
          selected_genres: selectedGenres,
          selected_developers: selectedDevelopers,
          selected_sources: selectedSources,
        };
        invoke("save_app_config", { config: updated }).catch((e) =>
          console.warn("Failed to persist app config:", e)
        );
        return updated;
      });
    }, 500);

    return () => {
      if (saveConfigTimeoutRef.current) clearTimeout(saveConfigTimeoutRef.current);
    };
  }, [
    selectedGameId,
    viewMode,
    cardWidth,
    gridWidthPercent,
    statusFilter,
    sortBy,
    sortDirection,
    groupBy,
    showFavoritesOnly,
    selectedGenres,
    selectedDevelopers,
    selectedSources,
  ]);

  useEffect(() => {
    loadInitialData();

    const unlistenLaunched = listen<{ id: string; last_played: string } | string>(
      "game-launched",
      (event) => {
        const payload = event.payload;
        const id = typeof payload === "string" ? payload : payload.id;
        const lastPlayed = typeof payload === "string" ? undefined : payload.last_played;
        if (lastPlayed) {
          setGames((prev) =>
            prev.map((g) => (g.id === id ? { ...g, last_played: lastPlayed } : g))
          );
        }
      }
    );

    const unlistenRunning = listen<{ id: string } | string>("game-running", (event) => {
      const payload = event.payload;
      const id = typeof payload === "string" ? payload : payload.id;
      setRunningGameIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
      setIsLaunchingId(null);
    });

    const unlistenStopped = listen<{
      id: string;
      elapsed_seconds: number;
      last_played: string;
    }>("game-stopped", (event) => {
      const { id, elapsed_seconds, last_played } = event.payload;
      setRunningGameIds((prev) => prev.filter((gid) => gid !== id));
      setIsLaunchingId((curr) => (curr === id ? null : curr));
      setGames((prev) =>
        prev.map((g) => {
          if (g.id === id) {
            return {
              ...g,
              playtime_seconds: g.playtime_seconds + elapsed_seconds,
              last_played,
            };
          }
          return g;
        })
      );

      // Auto-sync live store playtime, achievements, and HLTB upon game exit (after launcher flushes state)
      window.setTimeout(() => {
        invoke<Game>("refresh_game_live_data", { gameId: id })
          .then((updated) => {
            setGames((prev) =>
              prev.map((g) => (g.id === id ? { ...g, ...updated } : g))
            );
            loadHunterStats();
          })
          .catch(() => {
            invoke("sync_game_achievements", { gameId: id })
              .then(() => loadHunterStats())
              .catch(() => {});
          });
      }, 2500);
    });

    const unlistenUpdated = listen<Game>("game-updated", (event) => {
      const updated = event.payload;
      setGames((prev) =>
        prev.map((g) => (g.id === updated.id ? { ...g, ...updated } : g))
      );
    });

    // Listen for Steam login webview success
    const unlistenSteamLogin = listen<string>("steam-login-detected", async (event) => {
      const extracted = event.payload;
      if (extracted) {
        await handleAuthenticateSteamManual(extracted);
      }
    });

    // Listen for Epic login webview code detection
    const unlistenEpicLogin = listen<string>("epic-code-detected", async (event) => {
      const code = event.payload;
      if (code) {
        await handleAuthenticateEpicManual(code);
      }
    });

    // Listen for Full Library Refresh progress
    const unlistenProgress = listen<FullRefreshProgress>("full-refresh-progress", (event) => {
      setFullRefreshProgress(event.payload);
      if (event.payload.phase === "completed") {
        setTimeout(() => {
          setFullRefreshProgress(null);
          setIsFullRefreshing(false);
        }, 3000);
      }
    });

    return () => {
      unlistenLaunched.then((f) => f());
      unlistenRunning.then((f) => f());
      unlistenStopped.then((f) => f());
      unlistenUpdated.then((f) => f());
      unlistenSteamLogin.then((f) => f());
      unlistenEpicLogin.then((f) => f());
      unlistenProgress.then((f) => f());
    };
  }, []);

  // Periodic sync of running games to guarantee immediate state reconciliation
  useEffect(() => {
    if (runningGameIds.length === 0) return;

    const interval = setInterval(async () => {
      try {
        const activeIds = await invoke<string[]>("get_running_games");
        setRunningGameIds((prev) => {
          const filtered = prev.filter((id) => activeIds.includes(id));
          if (filtered.length !== prev.length) {
            return filtered;
          }
          return prev;
        });
      } catch (err) {
        console.error("Failed to sync running games:", err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [runningGameIds]);

  // "Living Library" Smart Auto-Freshness (Zero 24/7 Polling)
  // 1) Startup + Window Focus Throttled Live Pulse (playtimes & last_played across Steam & Epic, 15m cooldown)
  // 2) One-Time Active Library Achievement Warmup (installed or played Steam/Epic games)
  useEffect(() => {
    if (isLoading) return;

    const LIVE_PULSE_COOLDOWN_MS = 15 * 60 * 1000;

    const pulseLivePlaytimes = async () => {
      const now = Date.now();
      if (now - lastLiveSyncRef.current < LIVE_PULSE_COOLDOWN_MS) return;
      lastLiveSyncRef.current = now;
      try {
        await invoke<number>("sync_live_playtimes");
      } catch (e) {
        // Non-fatal silent background pulse
      }
    };

    const startupPulseTimer = window.setTimeout(() => {
      pulseLivePlaytimes();
    }, 2500);

    const warmupTimer = window.setTimeout(() => {
      invoke<number>("warmup_active_achievements")
        .then((indexed) => {
          if (indexed > 0) {
            loadHunterStats();
          }
        })
        .catch(() => {});
    }, 3500);

    const handleWindowFocus = () => {
      if (document.visibilityState === "visible") {
        pulseLivePlaytimes();
      }
    };

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleWindowFocus);

    return () => {
      clearTimeout(startupPulseTimer);
      clearTimeout(warmupTimer);
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleWindowFocus);
    };
  }, [isLoading]);

  // 3) Debounced On-Select Stale-While-Revalidate (900ms settle, 30m TTL per game)
  const gamesRef = useRef<Game[]>(games);
  gamesRef.current = games;

  useEffect(() => {
    if (!selectedGameId || isLoading) return;
    const game = gamesRef.current.find((g) => g.id === selectedGameId);
    if (!game) return;

    const src = game.source.toLowerCase();
    if (src !== "steam" && src !== "epic") return;
    if (!game.is_installed && (game.playtime_seconds || 0) === 0) return;

    const REVALIDATE_TTL_MS = 30 * 60 * 1000;
    const lastChecked = revalidatedGamesRef.current.get(game.id) || 0;
    if (Date.now() - lastChecked < REVALIDATE_TTL_MS) return;

    const timer = window.setTimeout(() => {
      revalidatedGamesRef.current.set(game.id, Date.now());
      invoke("sync_game_achievements", { gameId: game.id })
        .then(() => loadHunterStats())
        .catch(() => {});
    }, 900);

    return () => clearTimeout(timer);
  }, [selectedGameId, isLoading]);

  // Scan Steam Library with return count
  const handleScanLibrary = async (): Promise<ScanResult> => {
    try {
      setIsScanning(true);
      const res = await invoke<ScanResult>("scan_steam_library");
      const list = await invoke<Game[]>("get_games");
      setGames(list);
      const integration = await invoke<LibraryIntegration>("get_steam_integration");
      if (integration) setSteamIntegration(integration);

      const currentSelected = selectedGameIdRef.current;
      if (list.length > 0 && (!currentSelected || !list.some((g) => g.id === currentSelected))) {
        const retro = list.find((g) => g.title.toLowerCase().includes("retroarch"));
        const fallbackId = retro ? retro.id : list[0].id;
        handleSelectGame(fallbackId);
      }
      return res;
    } catch (err) {
      console.error("Error scanning Steam library:", err);
      throw err;
    } finally {
      setIsScanning(false);
    }
  };

  // Clear all games from database
  const handleClearLibrary = async () => {
    try {
      await invoke("clear_all_games");
      setGames([]);
      setSelectedGameId(null);
      selectedGameIdRef.current = null;
      try {
        localStorage.removeItem("openplay_last_selected_game_id");
      } catch {}
    } catch (err) {
      console.error("Error clearing library:", err);
    }
  };

  // Steam Auth Handlers
  const handleOpenSteamLogin = async () => {
    try {
      setIsAuthenticatingSteam(true);
      await invoke("open_steam_login_window");
    } catch (err) {
      console.error("Failed to open Steam login window:", err);
      alert(`Steam login error: ${err}`);
    } finally {
      setIsAuthenticatingSteam(false);
    }
  };

  const handleAuthenticateSteamManual = async (idOrVanity: string) => {
    try {
      setIsAuthenticatingSteam(true);
      const updated = await invoke<LibraryIntegration>("authenticate_steam_account", { idOrVanity });
      setSteamIntegration(updated);
      await handleScanLibrary();
    } catch (err) {
      console.error("Failed to authenticate Steam:", err);
      alert(`Could not authenticate with Steam ID: ${err}`);
    } finally {
      setIsAuthenticatingSteam(false);
    }
  };

  const handleLogoutSteam = async () => {
    try {
      const updated = await invoke<LibraryIntegration>("logout_steam");
      setSteamIntegration(updated);
    } catch (err) {
      console.error("Failed to log out of Steam:", err);
    }
  };

  const handleSaveSteamIntegration = async (updated: LibraryIntegration) => {
    try {
      await invoke("save_steam_integration", { integration: updated });
      setSteamIntegration(updated);
    } catch (err) {
      console.error("Failed to save integration settings:", err);
    }
  };

  // Epic Games Auth & Sync Handlers
  const handleScanEpicLibrary = async (): Promise<ScanResult> => {
    try {
      setIsScanningEpic(true);
      const res = await invoke<ScanResult>("scan_epic_library");
      const list = await invoke<Game[]>("get_games");
      setGames(list);
      const integration = await invoke<LibraryIntegration>("get_epic_integration");
      if (integration) setEpicIntegration(integration);

      const currentSelected = selectedGameIdRef.current;
      if (list.length > 0 && (!currentSelected || !list.some((g) => g.id === currentSelected))) {
        const retro = list.find((g) => g.title.toLowerCase().includes("retroarch"));
        const fallbackId = retro ? retro.id : list[0].id;
        handleSelectGame(fallbackId);
      }
      return res;
    } catch (err) {
      console.error("Error scanning Epic library:", err);
      throw err;
    } finally {
      setIsScanningEpic(false);
    }
  };

  const handleOpenEpicLogin = async () => {
    try {
      setIsAuthenticatingEpic(true);
      await invoke("open_epic_login_window");
    } catch (err) {
      console.error("Failed to open Epic login window:", err);
      alert(`Epic login error: ${err}`);
    } finally {
      setIsAuthenticatingEpic(false);
    }
  };

  const handleAuthenticateEpicManual = async (code: string) => {
    try {
      setIsAuthenticatingEpic(true);
      const updated = await invoke<LibraryIntegration>("authenticate_epic_code", { code });
      setEpicIntegration(updated);
      await handleScanEpicLibrary();
    } catch (err) {
      console.error("Failed to authenticate Epic code:", err);
      alert(`Could not authenticate Epic authorization code: ${err}`);
    } finally {
      setIsAuthenticatingEpic(false);
    }
  };

  const handleLogoutEpic = async () => {
    try {
      const updated = await invoke<LibraryIntegration>("logout_epic");
      setEpicIntegration(updated);
    } catch (err) {
      console.error("Failed to log out of Epic:", err);
    }
  };

  const handleSaveEpicIntegration = async (updated: LibraryIntegration) => {
    try {
      await invoke("save_epic_integration", { integration: updated });
      setEpicIntegration(updated);
    } catch (err) {
      console.error("Failed to save Epic integration settings:", err);
    }
  };

  // Launch Game
  const handleLaunchGame = async (game: Game) => {
    try {
      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, "0");
      const nowStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

      handleSelectGame(game.id);
      setIsLaunchingId(game.id);

      // Immediately update last_played so UI and sorting reflect it without delay
      setGames((prev) =>
        prev.map((g) => (g.id === game.id ? { ...g, last_played: nowStr } : g))
      );

      const res = await invoke<string>("launch_game", { gameId: game.id });
      if (res && res.includes(":")) {
        setGames((prev) =>
          prev.map((g) => (g.id === game.id ? { ...g, last_played: res } : g))
        );
      }

      if (appConfig.minimize_on_game_launch) {
        try {
          await getCurrentWindow().minimize();
        } catch (e) {}
      }

      // Transition to running state
      setRunningGameIds((prev) => (prev.includes(game.id) ? prev : [...prev, game.id]));

      // Keep launching state active for 2.5s before showing Running state
      setTimeout(() => {
        setIsLaunchingId((current) => (current === game.id ? null : current));
      }, 2500);
    } catch (err) {
      console.error("Failed to launch game:", err);
      setIsLaunchingId(null);
      setRunningGameIds((prev) => prev.filter((id) => id !== game.id));
      alert(`Launch error: ${err}`);
    }
  };

  // Stop / Exit Running Game
  const handleStopGame = async (game: Game) => {
    try {
      await invoke("stop_game", { gameId: game.id });
      setRunningGameIds((prev) => prev.filter((id) => id !== game.id));
      setIsLaunchingId((curr) => (curr === game.id ? null : curr));
    } catch (err) {
      console.error("Failed to stop game:", err);
    }
  };

  // Refresh All (Does the two below: Refresh All libraries + Refresh All Metadata)
  const handleRefreshAll = async () => {
    try {
      setIsFullRefreshing(true);
      await Promise.allSettled([handleScanLibrary(), handleScanEpicLibrary()]);
      await invoke<number>("sync_all_metadata", { installedOnly: false });
      const list = await invoke<Game[]>("get_games");
      setGames(list);
    } catch (err) {
      console.error("Failed Refresh All:", err);
    } finally {
      setIsFullRefreshing(false);
    }
  };

  // Refresh All Libraries
  const handleRefreshAllLibraries = async () => {
    await Promise.allSettled([handleScanLibrary(), handleScanEpicLibrary()]);
  };

  // Refresh All Metadata (Replaces only empty fields from native stores)
  const handleRefreshAllMetadata = async () => {
    try {
      setIsSyncingMetadata(true);
      await invoke<number>("sync_all_metadata", { installedOnly: false });
      const list = await invoke<Game[]>("get_games");
      setGames(list);
    } catch (err) {
      console.error("Failed to refresh all metadata:", err);
    } finally {
      setIsSyncingMetadata(false);
    }
  };

  // Refresh Installed Metadata (Replaces only empty fields for installed games from native stores)
  const handleRefreshInstalledMetadata = async () => {
    try {
      setIsSyncingMetadata(true);
      await invoke<number>("sync_all_metadata", { installedOnly: true });
      const list = await invoke<Game[]>("get_games");
      setGames(list);
    } catch (err) {
      console.error("Failed to refresh installed metadata:", err);
    } finally {
      setIsSyncingMetadata(false);
    }
  };

  // Refresh Specific Library Provider
  const handleRefreshLibrary = async (provider: string) => {
    if (provider.toLowerCase() === "steam") {
      await handleScanLibrary();
    } else if (provider.toLowerCase() === "epic") {
      await handleScanEpicLibrary();
    }
  };

  // Toggle Favorite
  const handleToggleFavorite = async (gameId: string) => {
    try {
      const newState = await invoke<boolean>("toggle_favorite", { gameId });
      setGames((prev) =>
        prev.map((g) => (g.id === gameId ? { ...g, is_favorite: newState } : g))
      );
    } catch (err) {
      console.error("Failed to toggle favorite:", err);
    }
  };

  // Remove Game from Library (Local games)
  const handleRemoveGame = async (game: Game) => {
    const confirmed = window.confirm(
      `Are you sure you want to remove "${game.title}" from your library?\n\nThis will remove the game entry from OpenPlay. Your actual game files on disk will not be deleted.`
    );
    if (!confirmed) return;

    try {
      await invoke("delete_game", { gameId: game.id });
      setGames((prev) => prev.filter((g) => g.id !== game.id));
      if (selectedGameId === game.id) {
        setSelectedGameId(null);
      }
      if (editingGame?.id === game.id) {
        setEditingGame(null);
      }
    } catch (err) {
      console.error("Failed to remove game:", err);
      alert(`Could not remove game: ${err}`);
    }
  };

  // Fetch Steam metadata for game
  const handleFetchMetadata = async (gameId: string) => {
    try {
      setIsFetchingMetaId(gameId);
      const updated = await invoke<Game>("fetch_game_metadata", { gameId });
      setGames((prev) => prev.map((g) => (g.id === gameId ? updated : g)));
    } catch (err) {
      console.error("Failed to fetch metadata:", err);
    } finally {
      setIsFetchingMetaId(null);
    }
  };

  // Refresh live game data (HLTB, Achievements, Store Playtime & Last Played)
  const handleRefreshGameLive = useCallback(async (gameId: string) => {
    try {
      setRefreshingGameIds((prev) => (prev.includes(gameId) ? prev : [...prev, gameId]));
      const updated = await invoke<Game>("refresh_game_live_data", { gameId });
      setGames((prev) =>
        prev.map((g) => (g.id === gameId ? { ...g, ...updated } : g))
      );
      await loadHunterStats();
    } catch (err) {
      console.error("Failed to refresh game live data:", err);
    } finally {
      setRefreshingGameIds((prev) => prev.filter((id) => id !== gameId));
    }
  }, []);

  // Save edited game
  const handleSaveGame = async (updated: Game) => {
    try {
      await invoke("save_game", { game: updated });
      setGames((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
    } catch (err) {
      console.error("Failed to save game:", err);
    }
  };

  // Context Menu Handlers
  const handleOpenContextMenu = (game: Game, x: number, y: number) => {
    setContextMenu({ game, x, y });
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  const handleApplyArtworkGlobal = async (updates: any) => {
    if (!steamGridDBGame) return;
    try {
      const updated = await invoke<Game>("apply_custom_artwork", {
        gameId: steamGridDBGame.id,
        game_id: steamGridDBGame.id,
        coverImage: updates.coverImage ?? updates.cover_image,
        cover_image: updates.coverImage ?? updates.cover_image,
        backgroundImage: updates.backgroundImage ?? updates.background_image,
        background_image: updates.backgroundImage ?? updates.background_image,
        logoImage: updates.logoImage ?? updates.logo_image,
        logo_image: updates.logoImage ?? updates.logo_image,
        iconImage: updates.iconImage ?? updates.icon_image,
        icon_image: updates.iconImage ?? updates.icon_image,
      });
      setGames((prev) =>
        prev.map((g) => (g.id === updated.id ? { ...g, ...updated } : g))
      );
    } catch (err: any) {
      console.error("Failed to apply artwork:", err);
    }
  };

  const handleSaveTrailersGlobal = async (trailers: GameTrailer[]) => {
    if (!trailerGame) return;
    const updated = {
      ...trailerGame,
      trailers,
    };
    await handleSaveGame(updated);
    setTrailerGame(updated);
  };

  // Add manual game
  const handleAddGame = async (partialGame: Partial<Game>) => {
    try {
      const newGame: Game = {
        id: partialGame.id || `manual_${Date.now()}`,
        title: partialGame.title || "Untitled Game",
        source: partialGame.source || "Manual",
        is_installed: true,
        is_favorite: false,
        playtime_seconds: 0,
        platforms: ["Windows", "Linux"],
        genres: partialGame.genres || [],
        features: [],
        links: [],
        screenshots: [],
        ...partialGame,
      };
      await invoke("save_game", { game: newGame });
      setGames((prev) => [newGame, ...prev]);
      handleSelectGame(newGame.id);
    } catch (err) {
      console.error("Failed to add manual game:", err);
    }
  };

  const handleReloadGames = async () => {
    try {
      const list = await invoke<Game[]>("get_games");
      setGames(list);
      await loadHunterStats();
    } catch (err) {
      console.error("Failed to reload games:", err);
    }
  };

  // Auto-save user notes
  const handleSaveNotes = async (gameId: string, notes: string) => {
    const game = games.find((g) => g.id === gameId);
    if (!game) return;
    const updated = { ...game, notes };
    await handleSaveGame(updated);
  };

  // Calculate counts for badges and filters
  const totalCount = games.length;
  const installedCount = useMemo(() => games.filter((g) => g.is_installed).length, [games]);
  const uninstalledCount = useMemo(() => games.filter((g) => !g.is_installed).length, [games]);
  const favoritesCount = useMemo(() => games.filter((g) => g.is_favorite).length, [games]);

  // Aggregate available Genres / Tags with counts
  const availableGenres = useMemo(() => {
    const counts: Record<string, number> = {};
    games.forEach((g) => {
      g.genres.forEach((genre) => {
        const trimmed = genre.trim();
        if (trimmed) counts[trimmed] = (counts[trimmed] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [games]);

  // Aggregate available Developers with counts
  const availableDevelopers = useMemo(() => {
    const counts: Record<string, number> = {};
    games.forEach((g) => {
      const dev = g.developer?.trim();
      if (dev) counts[dev] = (counts[dev] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [games]);

  // Aggregate available Sources / Libraries with counts
  const availableSources = useMemo(() => {
    const counts: Record<string, number> = {};
    games.forEach((g) => {
      const src = g.source?.trim() || "Manual";
      counts[src] = (counts[src] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [games]);

  const handleToggleGenre = (genre: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  };

  const handleToggleDeveloper = (dev: string) => {
    setSelectedDevelopers((prev) =>
      prev.includes(dev) ? prev.filter((d) => d !== dev) : [...prev, dev]
    );
  };

  const handleToggleSource = (src: string) => {
    setSelectedSources((prev) =>
      prev.includes(src) ? prev.filter((s) => s !== src) : [...prev, src]
    );
  };

  const handleResetFilters = () => {
    setShowFavoritesOnly(false);
    setSelectedGenres([]);
    setSelectedDevelopers([]);
    setSelectedSources([]);
  };

  const activeFilterCount = useMemo(() => {
    return (
      (showFavoritesOnly ? 1 : 0) +
      selectedGenres.length +
      selectedDevelopers.length +
      selectedSources.length
    );
  }, [showFavoritesOnly, selectedGenres, selectedDevelopers, selectedSources]);

  // Filter and sort games
  const filteredGames = useMemo(() => {
    const list = games.filter((g) => {
      if (statusFilter === "installed" && !g.is_installed) return false;
      if (statusFilter === "uninstalled" && g.is_installed) return false;
      if (showFavoritesOnly && !g.is_favorite) return false;

      // Filter by Tags / Genres
      if (selectedGenres.length > 0) {
        const hasGenre = g.genres.some((genre) =>
          selectedGenres.includes(genre.trim())
        );
        if (!hasGenre) return false;
      }

      // Filter by Developer
      if (selectedDevelopers.length > 0) {
        const dev = g.developer?.trim() || "";
        if (!selectedDevelopers.includes(dev)) return false;
      }

      // Filter by Library / Source
      if (selectedSources.length > 0) {
        const src = g.source?.trim() || "Manual";
        if (!selectedSources.includes(src)) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = g.title.toLowerCase().includes(q);
        const matchesDev = g.developer?.toLowerCase().includes(q);
        const matchesGenre = g.genres.some((genre) =>
          genre.toLowerCase().includes(q)
        );
        if (!matchesTitle && !matchesDev && !matchesGenre) return false;
      }
      return true;
    });

    return list.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "title":
          cmp = (a.sorting_title || a.title).localeCompare(b.sorting_title || b.title, undefined, { sensitivity: "base" });
          break;
        case "playtime":
          cmp = (a.playtime_seconds || 0) - (b.playtime_seconds || 0);
          break;
        case "last_played": {
          const aHas = Boolean(a.last_played && a.last_played.trim());
          const bHas = Boolean(b.last_played && b.last_played.trim());
          if (aHas && bHas) {
            cmp = (a.last_played || "").localeCompare(b.last_played || "");
          } else if (aHas && !bHas) {
            cmp = 1;
          } else if (!aHas && bHas) {
            cmp = -1;
          } else {
            cmp = (a.playtime_seconds || 0) - (b.playtime_seconds || 0);
          }
          break;
        }
        case "release_date":
          cmp = (a.release_date || "").localeCompare(b.release_date || "");
          break;
        case "rating":
          cmp = (a.community_score || 0) - (b.community_score || 0);
          break;
        default:
          cmp = 0;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [
    games,
    statusFilter,
    showFavoritesOnly,
    selectedGenres,
    selectedDevelopers,
    selectedSources,
    searchQuery,
    sortBy,
    sortDirection,
  ]);

  // Keep selectedGame valid when filtered games change
  useEffect(() => {
    if (!isConfigLoadedRef.current || isLoading) return;
    if (filteredGames.length > 0) {
      const currentSelected = selectedGameIdRef.current || selectedGameId;
      if (!currentSelected || !filteredGames.some((g) => g.id === currentSelected)) {
        const nextId = filteredGames[0].id;
        handleSelectGame(nextId);
      }
    }
  }, [filteredGames, selectedGameId, isLoading]);

  const selectedGame = useMemo(() => {
    return games.find((g) => g.id === selectedGameId) || null;
  }, [games, selectedGameId]);

  const selectedHeroUrl = resolveImageSrc(selectedGame?.background_image);

  // Achievement Hunter Hub Cycling Background: Top 25 Most Finished Games
  const [hunterHeroUrl, setHunterHeroUrl] = useState<string | null>(null);

  const cycleHunterHero = useCallback(() => {
    if (!games || games.length === 0) return;

    let pool: Game[] = [];
    if (hunterProfile && hunterProfile.games_summaries && hunterProfile.games_summaries.length > 0) {
      // Top 25 finished games summaries
      const top25Summaries = hunterProfile.games_summaries
        .filter((s) => s.total_achievements > 0)
        .slice(0, 25);

      for (const sum of top25Summaries) {
        const found = games.find((g) => g.id === sum.game_id);
        if (found && (found.background_image || found.cover_image)) {
          pool.push(found);
        }
      }
    }

    // Fallback if no games with achievements or hero images yet
    if (pool.length === 0) {
      pool = games.filter((g) => !!(g.background_image || g.cover_image)).slice(0, 25);
    }

    if (pool.length === 0) return;

    // Pick a random game from pool different from current if possible
    setHunterHeroUrl((prev) => {
      const candidates = pool.filter((g) => {
        const src = resolveImageSrc(g.background_image || g.cover_image);
        return src !== prev;
      });
      const finalPool = candidates.length > 0 ? candidates : pool;
      const picked = finalPool[Math.floor(Math.random() * finalPool.length)];
      return resolveImageSrc(picked.background_image || picked.cover_image) || null;
    });
  }, [games, hunterProfile]);

  // 1. Pick a random top-25 hero whenever opening Hunter Hub
  useEffect(() => {
    if (isHunterHubOpen) {
      cycleHunterHero();
    }
  }, [isHunterHubOpen, cycleHunterHero]);

  // 2. Cycle background periodically while staying inside the Hunter Hub (every 25 seconds)
  useEffect(() => {
    if (!isHunterHubOpen) return;
    const timer = setInterval(() => {
      cycleHunterHero();
    }, 25000);
    return () => clearInterval(timer);
  }, [isHunterHubOpen, cycleHunterHero]);

  return (
    <div
      className={`h-screen w-screen flex flex-col bg-[#07080c] text-slate-100 overflow-hidden relative font-sans select-none ${
        isWindowMaximized ? "" : "border border-white/10 shadow-2xl"
      }`}
    >
      {/* Global Dynamic Blurred Game Background with Seamless Morphing Crossfade */}
      <DynamicBackground
        src={isHunterHubOpen ? hunterHeroUrl || selectedHeroUrl : selectedHeroUrl}
        blur={appConfig.background_blur}
        opacity={appConfig.background_opacity}
      />

      {/* Foreground UI */}
      <div className="relative z-10 flex flex-col h-full w-full">
        {/* Top Navigation Bar */}
        <TopNav
          onToggleDrawer={() => setIsDrawerOpen(true)}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          showFavoritesOnly={showFavoritesOnly}
          onToggleFavoritesOnly={() => setShowFavoritesOnly(!showFavoritesOnly)}
          favoritesCount={favoritesCount}
          availableGenres={availableGenres}
          selectedGenres={selectedGenres}
          onToggleGenre={handleToggleGenre}
          availableDevelopers={availableDevelopers}
          selectedDevelopers={selectedDevelopers}
          onToggleDeveloper={handleToggleDeveloper}
          availableSources={availableSources}
          selectedSources={selectedSources}
          onToggleSource={handleToggleSource}
          onResetFilters={handleResetFilters}
          activeFilterCount={activeFilterCount}
          sortBy={sortBy}
          onSortByChange={(newSort) => {
            setSortBy(newSort);
            setSortDirection(newSort === "title" ? "asc" : "desc");
          }}
          sortDirection={sortDirection}
          onToggleSortDirection={() =>
            setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))
          }
          groupBy={groupBy}
          onGroupByChange={handleGroupByChange}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenAchievementHub={() => setIsHunterHubOpen(true)}
          hunterLevel={hunterProfile?.level}
          hunterScore={hunterProfile?.total_score}
          totalCount={totalCount}
          installedCount={installedCount}
          uninstalledCount={uninstalledCount}
        />

        {/* Main Workspace Area */}
        {isHunterHubOpen ? (
          <AchievementHunterHub
            onBackToLibrary={() => {
              setIsHunterHubOpen(false);
              loadHunterStats();
            }}
            games={games}
            onCycleBackground={cycleHunterHero}
          />
        ) : (
          <main className="flex-1 flex overflow-hidden relative">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
              <p className="text-sm text-slate-400">Loading your game library...</p>
            </div>
          ) : filteredGames.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
              <Gamepad2 className="w-16 h-16 text-slate-600 mb-2" />
              <div className="max-w-md">
                <h3 className="text-lg font-bold text-slate-200">
                  {searchQuery
                    ? "No matching games found"
                    : "Your OpenPlay Library is empty"}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  {searchQuery
                    ? "Try adjusting your search query or clear active filters."
                    : "Open the Library Manager to connect your Steam account and scan your games."}
                </p>
              </div>
              {!searchQuery && (
                <div className="flex space-x-3">
                  <button
                    onClick={() => setIsLibraryManagerOpen(true)}
                    className="flex items-center space-x-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-xl text-xs transition-all shadow-md cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Open Library Manager</span>
                  </button>
                </div>
              )}
            </div>
          ) : viewMode === "split" ? (
            /* Split View: Fixed 7-Column Grid on Left + Details on Right */
            <div key="split" className="flex-1 flex overflow-hidden w-full h-full animate-view-fade">
              {/* Left Column: Poster Grid */}
              <div
                style={{ width: `${gridWidthPercent}%` }}
                className="flex flex-col h-full bg-transparent shrink-0 relative"
              >
                <GameGrid
                  games={filteredGames}
                  selectedGameId={selectedGame?.id}
                  onSelectGame={(g) => handleSelectGame(g.id)}
                  onLaunchGame={handleLaunchGame}
                  cardWidth={cardWidth}
                  isLaunchingId={isLaunchingId}
                  runningGameIds={runningGameIds}
                  onContextMenu={handleOpenContextMenu}
                  groupBy={groupBy}
                />
                <PosterZoomSlider
                  cardWidth={cardWidth}
                  minWidth={80}
                  maxWidth={220}
                  onChange={handleCardWidthChange}
                />
              </div>

              {/* Right Column: Game Details Pane */}
              <div className="flex-1 flex flex-col h-full bg-transparent overflow-hidden">
                {selectedGame ? (
                  <GameDetails
                    game={selectedGame}
                    onLaunch={handleLaunchGame}
                    onStop={handleStopGame}
                    onToggleFavorite={handleToggleFavorite}
                    onOpenEdit={(g) => setEditingGame(g)}
                    onRemoveGame={handleRemoveGame}
                    onFetchMetadata={handleFetchMetadata}
                    onRefreshGame={handleRefreshGameLive}
                    isRefreshing={refreshingGameIds.includes(selectedGame.id)}
                    isLaunching={isLaunchingId === selectedGame.id}
                    isRunning={runningGameIds.includes(selectedGame.id)}
                    isFetchingMeta={isFetchingMetaId === selectedGame.id}
                    onSaveNotes={handleSaveNotes}
                    onUpdateGame={handleSaveGame}
                    onOpenContextMenu={handleOpenContextMenu}
                    onOpenSteamGridDB={(g) => setSteamGridDBGame(g)}
                    onOpenTrailers={(g) => setTrailerGame(g)}
                    selectedGenres={selectedGenres}
                    onToggleGenre={handleToggleGenre}
                    selectedDevelopers={selectedDevelopers}
                    onToggleDeveloper={handleToggleDeveloper}
                    selectedSources={selectedSources}
                    onToggleSource={handleToggleSource}
                    trailerAutoplay={appConfig.trailer_autoplay ?? true}
                    trailerMuted={appConfig.trailer_muted ?? true}
                  />
                ) : (
                  <div className="flex-1 flex items-center justify-center text-slate-400 text-xs">
                    Select a game to view details
                  </div>
                )}
              </div>
            </div>
          ) : viewMode === "grid" ? (
            /* Full Grid View */
            <div key="grid" className="flex-1 flex flex-col h-full bg-transparent animate-view-fade">
              <GameGrid
                games={filteredGames}
                selectedGameId={selectedGame?.id}
                onSelectGame={(g) => handleSelectGame(g.id)}
                onLaunchGame={handleLaunchGame}
                cardWidth={cardWidth}
                isLaunchingId={isLaunchingId}
                runningGameIds={runningGameIds}
                onContextMenu={handleOpenContextMenu}
                groupBy={groupBy}
              />
              <PosterZoomSlider
                cardWidth={cardWidth}
                minWidth={80}
                maxWidth={220}
                onChange={handleCardWidthChange}
              />
            </div>
          ) : (
            /* List View */
            <div key="list" className="flex-1 overflow-y-auto p-4 bg-transparent animate-view-fade">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="text-[11px] uppercase tracking-wider text-slate-500 border-b border-[#1f2436]">
                <tr>
                  <th className="py-2.5 px-3">Title</th>
                  <th className="py-2.5 px-3">Source</th>
                  <th className="py-2.5 px-3">Developer</th>
                  <th className="py-2.5 px-3">Playtime</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#181c2a]">
                {filteredGames.map((g) => (
                  <tr
                    key={g.id}
                    onClick={() => {
                      handleSelectGame(g.id);
                      setViewMode("split");
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleSelectGame(g.id);
                      handleOpenContextMenu(g, e.clientX, e.clientY);
                    }}
                    className="hover:bg-[#151825] cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 px-3 font-semibold text-slate-100 flex items-center space-x-2">
                      <span>{g.title}</span>
                      {g.is_favorite && (
                        <span className="text-amber-400">★</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">{g.source}</td>
                    <td className="py-2.5 px-3 text-slate-400">
                      {g.developer || "—"}
                    </td>
                    <td className="py-2.5 px-3 text-cyan-300 font-mono">
                      {Math.round(g.playtime_seconds / 60)} min
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300">
                        {g.completion_status || "Not Played"}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLaunchGame(g);
                        }}
                        className="px-3 py-1 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 rounded text-xs font-semibold cursor-pointer"
                      >
                        Play
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
          </main>
        )}

      {/* Left Sliding Drawer */}
      <LeftDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onOpenLibraryManager={() => {
          setLibraryManagerTab("steam");
          setIsLibraryManagerOpen(true);
        }}
        onOpenSettings={() => setIsSettingsOpen(true)}
        gameCount={filteredGames.length}
        onRefreshAll={handleRefreshAll}
        onRefreshAllLibraries={handleRefreshAllLibraries}
        onRefreshAllMetadata={handleRefreshAllMetadata}
        onRefreshInstalledMetadata={handleRefreshInstalledMetadata}
        onRefreshLibrary={handleRefreshLibrary}
        isSyncingMetadata={isSyncingMetadata}
        isScanning={isScanning}
        isFullRefreshing={isFullRefreshing}
      />

      {/* Library Manager Modal (Categorized Manual, Emulation, Providers) */}
      <LibraryManagerModal
        isOpen={isLibraryManagerOpen}
        onClose={() => setIsLibraryManagerOpen(false)}
        initialTab={libraryManagerTab}
        onRefreshGames={handleReloadGames}
        onGameAdded={(newGame) => {
          setGames((prev) => [newGame, ...prev]);
          handleSelectGame(newGame.id);
        }}
        steamIntegration={steamIntegration}
        onOpenSteamLogin={handleOpenSteamLogin}
        onAuthenticateManual={handleAuthenticateSteamManual}
        onLogoutSteam={handleLogoutSteam}
        onSaveSteamIntegration={handleSaveSteamIntegration}
        onSyncSteamLibrary={handleScanLibrary}
        onClearLibrary={handleClearLibrary}
        isSyncing={isScanning}
        isAuthenticating={isAuthenticatingSteam}
        epicIntegration={epicIntegration}
        onOpenEpicLogin={handleOpenEpicLogin}
        onAuthenticateEpicManual={handleAuthenticateEpicManual}
        onLogoutEpic={handleLogoutEpic}
        onSaveEpicIntegration={handleSaveEpicIntegration}
        onSyncEpicLibrary={handleScanEpicLibrary}
        isSyncingEpic={isScanningEpic}
        isAuthenticatingEpic={isAuthenticatingEpic}
      />

      {/* Add Manual Game Modal */}
      <AddGameModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddGame={handleAddGame}
      />

      {/* Edit Game Modal */}
      <EditGameModal
        game={editingGame}
        isOpen={!!editingGame}
        onClose={() => setEditingGame(null)}
        onSave={handleSaveGame}
        onOpenSteamGridDB={(g) => setSteamGridDBGame(g)}
        onRemoveGame={handleRemoveGame}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onScanLibrary={handleScanLibrary}
        onReloadGames={handleReloadGames}
        isScanning={isScanning}
        totalGames={games.length}
        config={appConfig}
        onSaveConfig={(updated) => {
          setAppConfig(updated);
          invoke("save_app_config", { config: updated }).catch((e) =>
            console.warn("Failed to persist config:", e)
          );
          if (updated.view_mode) setViewMode(updated.view_mode as ViewMode);
        }}
      />

      {/* Right-Click Dots Context Menu at Point of Click */}
      {contextMenu && (
        <GameContextMenu
          game={contextMenu.game}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={handleCloseContextMenu}
          onLaunch={handleLaunchGame}
          onStop={handleStopGame}
          isRunning={runningGameIds.includes(contextMenu.game.id)}
          isLaunching={isLaunchingId === contextMenu.game.id}
          onOpenSteamGridDB={(g) => setSteamGridDBGame(g)}
          onOpenTrailers={(g) => setTrailerGame(g)}
          onToggleFavorite={handleToggleFavorite}
          onFetchMetadata={handleFetchMetadata}
          isFetchingMeta={isFetchingMetaId === contextMenu.game.id}
          onRefreshGame={handleRefreshGameLive}
          isRefreshing={refreshingGameIds.includes(contextMenu.game.id)}
          onOpenEdit={(g) => setEditingGame(g)}
          onRemoveGame={handleRemoveGame}
        />
      )}

      {/* SteamGridDB Artwork Selection Modal */}
      {steamGridDBGame && (
        <SteamGridDBModal
          isOpen={!!steamGridDBGame}
          onClose={() => setSteamGridDBGame(null)}
          game={steamGridDBGame}
          onApplyArtwork={handleApplyArtworkGlobal}
        />
      )}

      {/* Video Trailer Manager Modal */}
      {trailerGame && (
        <TrailerModal
          isOpen={!!trailerGame}
          onClose={() => setTrailerGame(null)}
          game={trailerGame}
          onSaveTrailers={handleSaveTrailersGlobal}
        />
      )}

      {/* Floating Full Library Refresh Progress Widget */}
      {fullRefreshProgress && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#12141c]/95 border border-purple-500/30 rounded-2xl p-4 shadow-2xl backdrop-blur-2xl max-w-sm w-full animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2.5">
              <RefreshCw
                className={`w-4 h-4 text-purple-400 ${
                  fullRefreshProgress.phase === "completed" ? "" : "animate-spin"
                }`}
              />
              <span className="text-xs font-bold text-zinc-100 uppercase tracking-wider">
                {fullRefreshProgress.phase === "completed" ? "Refresh Complete" : "Full Refresh"}
              </span>
            </div>
            <span className="text-xs font-mono text-purple-300">
              {fullRefreshProgress.current} / {fullRefreshProgress.total}
            </span>
          </div>
          <div className="text-xs text-zinc-300 truncate mb-2.5">
            {fullRefreshProgress.message}
          </div>
          <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-purple-500 via-indigo-500 to-cyan-400 h-1.5 rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(
                  100,
                  (fullRefreshProgress.current / Math.max(1, fullRefreshProgress.total)) * 100
                )}%`,
              }}
            />
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

export default App;
