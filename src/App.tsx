import { useEffect, useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { Game, GameTrailer } from "./types/game";
import { LibraryIntegration } from "./types/integration";
import {
  TopNav,
  ViewMode,
  StatusFilter,
  SortOption,
  SortDirection,
} from "./components/TopNav";
import { GameGrid } from "./components/GameGrid";
import { GameDetails } from "./components/GameDetails";
import { PosterZoomSlider } from "./components/PosterZoomSlider";
import { AddGameModal } from "./components/AddGameModal";
import { EditGameModal } from "./components/EditGameModal";
import { SettingsModal } from "./components/SettingsModal";
import { LeftDrawer } from "./components/LeftDrawer";
import { LibraryManagerModal } from "./components/LibraryManagerModal";
import { GameContextMenu } from "./components/GameContextMenu";
import { SteamGridDBModal } from "./components/SteamGridDBModal";
import { TrailerModal } from "./components/TrailerModal";
import { Gamepad2, Loader2, Sparkles } from "lucide-react";
import { resolveImageSrc } from "./utils/image";
import "./App.css";

interface ScanResult {
  count: number;
  installed: number;
  uninstalled: number;
}

export function App() {
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("playtime");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Advanced Filters state (Tags, Developers, Libraries)
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedDevelopers, setSelectedDevelopers] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);

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
  const [isLaunchingId, setIsLaunchingId] = useState<string | null>(null);
  const [runningGameIds, setRunningGameIds] = useState<string[]>([]);
  const [isFetchingMetaId, setIsFetchingMetaId] = useState<string | null>(null);

  // Modals & Drawers
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isLibraryManagerOpen, setIsLibraryManagerOpen] = useState(false);
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

  // Steam Integration state
  const [steamIntegration, setSteamIntegration] = useState<LibraryIntegration>({
    provider: "steam",
    is_authenticated: false,
    import_installed: true,
    import_uninstalled: true,
    sync_playtime: true,
  });
  const [isAuthenticatingSteam, setIsAuthenticatingSteam] = useState(false);
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

  // Load games and integration state on mount
  const loadInitialData = async () => {
    try {
      setIsLoading(true);
      const integration = await invoke<LibraryIntegration>("get_steam_integration");
      if (integration) {
        setSteamIntegration(integration);
      }

      const list = await invoke<Game[]>("get_games");
      setGames(list);
      if (list.length > 0 && !selectedGameId) {
        const retro = list.find((g) => g.title.toLowerCase().includes("retroarch"));
        setSelectedGameId(retro ? retro.id : list[0].id);
      }

      // Query currently running games
      try {
        const running = await invoke<string[]>("get_running_games");
        if (running && Array.isArray(running)) {
          setRunningGameIds(running);
        }
      } catch (e) {}
    } catch (err) {
      console.error("Failed to load initial data:", err);
    } finally {
      setIsLoading(false);
    }
  };

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

    return () => {
      unlistenLaunched.then((f) => f());
      unlistenRunning.then((f) => f());
      unlistenStopped.then((f) => f());
      unlistenUpdated.then((f) => f());
      unlistenSteamLogin.then((f) => f());
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

  // Scan Steam Library with return count
  const handleScanLibrary = async (): Promise<ScanResult> => {
    try {
      setIsScanning(true);
      const res = await invoke<ScanResult>("scan_steam_library");
      const list = await invoke<Game[]>("get_games");
      setGames(list);
      const integration = await invoke<LibraryIntegration>("get_steam_integration");
      if (integration) setSteamIntegration(integration);

      if (list.length > 0 && (!selectedGameId || !list.find((g) => g.id === selectedGameId))) {
        const retro = list.find((g) => g.title.toLowerCase().includes("retroarch"));
        setSelectedGameId(retro ? retro.id : list[0].id);
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

  // Launch Game
  const handleLaunchGame = async (game: Game) => {
    try {
      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, "0");
      const nowStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

      setSelectedGameId(game.id);
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

  // Refresh All Metadata for Installed Games
  const handleRefreshAllMetadata = async () => {
    try {
      setIsSyncingMetadata(true);
      await invoke<number>("sync_all_metadata");
      const list = await invoke<Game[]>("get_games");
      setGames(list);
    } catch (err) {
      console.error("Failed to refresh all metadata:", err);
    } finally {
      setIsSyncingMetadata(false);
    }
  };

  // Refresh All Libraries
  const handleRefreshAllLibraries = async () => {
    await handleScanLibrary();
  };

  // Refresh Specific Library Provider
  const handleRefreshLibrary = async (provider: string) => {
    if (provider.toLowerCase() === "steam") {
      await handleScanLibrary();
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
      setSelectedGameId(newGame.id);
    } catch (err) {
      console.error("Failed to add manual game:", err);
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
        case "last_played":
          cmp = (a.last_played || "").localeCompare(b.last_played || "");
          break;
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
    if (filteredGames.length > 0) {
      if (!selectedGameId || !filteredGames.some((g) => g.id === selectedGameId)) {
        setSelectedGameId(filteredGames[0].id);
      }
    }
  }, [filteredGames, selectedGameId]);

  const selectedGame = useMemo(() => {
    return games.find((g) => g.id === selectedGameId) || null;
  }, [games, selectedGameId]);

  const selectedHeroUrl = resolveImageSrc(selectedGame?.background_image);

  return (
    <div
      className={`h-screen w-screen flex flex-col bg-[#07080c] text-slate-100 overflow-hidden relative font-sans select-none ${
        isWindowMaximized ? "" : "border border-white/10 shadow-2xl"
      }`}
    >
      {/* Global Dynamic Blurred Game Background matching Playnite FusionX */}
      {selectedHeroUrl ? (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
          {selectedHeroUrl.endsWith(".webm") || selectedHeroUrl.endsWith(".mp4") ? (
            <video
              key={selectedHeroUrl}
              src={selectedHeroUrl}
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-full object-cover scale-110 filter blur-[32px] opacity-75 transition-all duration-700 ease-out"
            />
          ) : (
            <img
              key={selectedHeroUrl}
              src={selectedHeroUrl}
              alt=""
              className="w-full h-full object-cover scale-110 filter blur-[32px] opacity-75 transition-all duration-700 ease-out"
            />
          )}
          <div className="absolute inset-0 bg-black/50 backdrop-brightness-85" />
        </div>
      ) : (
        <div className="absolute inset-0 bg-[#0c0e18] z-0" />
      )}

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
          onOpenSettings={() => setIsSettingsOpen(true)}
          totalCount={totalCount}
          installedCount={installedCount}
          uninstalledCount={uninstalledCount}
        />

        {/* Main Workspace Area */}
        <main className="flex-1 flex overflow-hidden relative">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
              <p className="text-sm text-slate-400">Loading your game library...</p>
            </div>
          ) : filteredGames.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
              <Gamepad2 className="w-16 h-16 text-slate-600" />
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
            <div className="flex-1 flex overflow-hidden w-full h-full">
              {/* Left Column: Poster Grid */}
              <div
                style={{ width: `${gridWidthPercent}%` }}
                className="flex flex-col h-full bg-transparent shrink-0 relative"
              >
                <GameGrid
                  games={filteredGames}
                  selectedGameId={selectedGame?.id}
                  onSelectGame={(g) => setSelectedGameId(g.id)}
                  onLaunchGame={handleLaunchGame}
                  cardWidth={cardWidth}
                  isLaunchingId={isLaunchingId}
                  runningGameIds={runningGameIds}
                  onContextMenu={handleOpenContextMenu}
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
                    onFetchMetadata={handleFetchMetadata}
                    isLaunching={isLaunchingId === selectedGame.id}
                    isRunning={runningGameIds.includes(selectedGame.id)}
                    isFetchingMeta={isFetchingMetaId === selectedGame.id}
                    onSaveNotes={handleSaveNotes}
                    onUpdateGame={handleSaveGame}
                    onOpenContextMenu={handleOpenContextMenu}
                    onOpenSteamGridDB={(g) => setSteamGridDBGame(g)}
                    onOpenTrailers={(g) => setTrailerGame(g)}
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
            <div className="flex-1 flex flex-col h-full bg-transparent">
              <GameGrid
                games={filteredGames}
                selectedGameId={selectedGame?.id}
                onSelectGame={(g) => setSelectedGameId(g.id)}
                onLaunchGame={handleLaunchGame}
                cardWidth={cardWidth}
                isLaunchingId={isLaunchingId}
                runningGameIds={runningGameIds}
                onContextMenu={handleOpenContextMenu}
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
            <div className="flex-1 overflow-y-auto p-4 bg-transparent">
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
                      setSelectedGameId(g.id);
                      setViewMode("split");
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedGameId(g.id);
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

      {/* Left Sliding Drawer */}
      <LeftDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onOpenLibraryManager={() => setIsLibraryManagerOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        gameCount={filteredGames.length}
        onRefreshAllMetadata={handleRefreshAllMetadata}
        onRefreshAllLibraries={handleRefreshAllLibraries}
        onRefreshLibrary={handleRefreshLibrary}
        isSyncingMetadata={isSyncingMetadata}
        isScanning={isScanning}
      />

      {/* Library Manager Modal (Categorized Manual, Emulation, Providers) */}
      <LibraryManagerModal
        isOpen={isLibraryManagerOpen}
        onClose={() => setIsLibraryManagerOpen(false)}
        steamIntegration={steamIntegration}
        onOpenSteamLogin={handleOpenSteamLogin}
        onAuthenticateManual={handleAuthenticateSteamManual}
        onLogoutSteam={handleLogoutSteam}
        onSaveSteamIntegration={handleSaveSteamIntegration}
        onSyncSteamLibrary={handleScanLibrary}
        onClearLibrary={handleClearLibrary}
        isSyncing={isScanning}
        isAuthenticating={isAuthenticatingSteam}
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
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onScanLibrary={handleScanLibrary}
        isScanning={isScanning}
        totalGames={games.length}
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
          onOpenEdit={(g) => setEditingGame(g)}
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
      </div>
    </div>
  );
}

export default App;
