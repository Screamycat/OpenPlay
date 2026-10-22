import { useEffect, useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Game } from "./types/game";
import { TopNav, ViewMode } from "./components/TopNav";
import { GameGrid } from "./components/GameGrid";
import { GameDetails } from "./components/GameDetails";
import { PosterZoomSlider } from "./components/PosterZoomSlider";
import { AddGameModal } from "./components/AddGameModal";
import { EditGameModal } from "./components/EditGameModal";
import { SettingsModal } from "./components/SettingsModal";
import { Gamepad2, Loader2, Sparkles } from "lucide-react";
import "./App.css";

export function App() {
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [showInstalledOnly, setShowInstalledOnly] = useState(false);
  const [cardWidth, setCardWidth] = useState(140);

  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [isLaunchingId, setIsLaunchingId] = useState<string | null>(null);
  const [isFetchingMetaId, setIsFetchingMetaId] = useState<string | null>(null);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Load games on initial mount
  const loadGames = async (autoScanIfEmpty = true) => {
    try {
      setIsLoading(true);
      const list = await invoke<Game[]>("get_games");
      if (list.length === 0 && autoScanIfEmpty) {
        // Auto scan on first run!
        await handleScanLibrary();
      } else {
        setGames(list);
        if (list.length > 0 && !selectedGameId) {
          // Prefer RetroArch if installed, otherwise first game
          const retro = list.find((g) => g.title.toLowerCase().includes("retroarch"));
          setSelectedGameId(retro ? retro.id : list[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to load games from database:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadGames(true);

    // Listen to background process events from Tauri
    const unlistenLaunched = listen<string>("game-launched", () => {
      setIsLaunchingId(null);
    });

    const unlistenStopped = listen<{
      id: string;
      elapsed_seconds: number;
      last_played: string;
    }>("game-stopped", (event) => {
      const { id, elapsed_seconds, last_played } = event.payload;
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

    return () => {
      unlistenLaunched.then((f) => f());
      unlistenStopped.then((f) => f());
    };
  }, []);

  // Scan Steam Library
  const handleScanLibrary = async () => {
    try {
      setIsScanning(true);
      await invoke("scan_steam_library");
      const list = await invoke<Game[]>("get_games");
      setGames(list);
      if (list.length > 0 && (!selectedGameId || !list.find((g) => g.id === selectedGameId))) {
        const retro = list.find((g) => g.title.toLowerCase().includes("retroarch"));
        setSelectedGameId(retro ? retro.id : list[0].id);
      }
    } catch (err) {
      console.error("Error scanning Steam library:", err);
    } finally {
      setIsScanning(false);
    }
  };

  // Launch Game
  const handleLaunchGame = async (game: Game) => {
    try {
      setIsLaunchingId(game.id);
      await invoke("launch_game", { gameId: game.id });
      setTimeout(() => setIsLaunchingId(null), 2000);
    } catch (err) {
      console.error("Failed to launch game:", err);
      setIsLaunchingId(null);
      alert(`Launch error: ${err}`);
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

  // Filter games based on search, favorites, installed
  const filteredGames = useMemo(() => {
    return games.filter((g) => {
      if (showFavoritesOnly && !g.is_favorite) return false;
      if (showInstalledOnly && !g.is_installed) return false;
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
  }, [games, searchQuery, showFavoritesOnly, showInstalledOnly]);

  const selectedGame = useMemo(() => {
    return games.find((g) => g.id === selectedGameId) || null;
  }, [games, selectedGameId]);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0a0b10] text-slate-100 overflow-hidden">
      {/* Top Navigation Bar */}
      <TopNav
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        showFavoritesOnly={showFavoritesOnly}
        onToggleFavoritesOnly={() => setShowFavoritesOnly(!showFavoritesOnly)}
        showInstalledOnly={showInstalledOnly}
        onToggleInstalledOnly={() => setShowInstalledOnly(!showInstalledOnly)}
        onScanLibrary={handleScanLibrary}
        isScanning={isScanning}
        onOpenAddModal={() => setIsAddModalOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        gameCount={filteredGames.length}
      />

      {/* Main Workspace Area */}
      <main className="flex-1 flex overflow-hidden">
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
                  : "Scan your local Steam library to automatically populate games, or add your games manually."}
              </p>
            </div>
            {!searchQuery && (
              <div className="flex space-x-3">
                <button
                  onClick={handleScanLibrary}
                  disabled={isScanning}
                  className="flex items-center space-x-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-lg text-xs transition-all shadow-md"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Scan Local Steam</span>
                </button>
                <button
                  onClick={() => setIsAddModalOpen(true)}
                  className="px-4 py-2 bg-[#161a26] hover:bg-[#202638] text-slate-200 border border-[#272e44] rounded-lg text-xs font-medium transition-all"
                >
                  Add Manually
                </button>
              </div>
            )}
          </div>
        ) : viewMode === "split" ? (
          /* Split View (Grid on Left, Details on Right) */
          <>
            {/* Left Column: Poster Grid + Zoom Slider */}
            <div className="w-[38%] min-w-[320px] max-w-[620px] border-r border-[#1e2230] flex flex-col h-full bg-[#0d0e15]">
              <GameGrid
                games={filteredGames}
                selectedGameId={selectedGame?.id}
                onSelectGame={(g) => setSelectedGameId(g.id)}
                onLaunchGame={handleLaunchGame}
                cardWidth={cardWidth}
              />
              <PosterZoomSlider
                cardWidth={cardWidth}
                onChange={setCardWidth}
              />
            </div>

            {/* Right Column: Game Details */}
            {selectedGame ? (
              <GameDetails
                game={selectedGame}
                onLaunch={handleLaunchGame}
                onToggleFavorite={handleToggleFavorite}
                onOpenEdit={(g) => setEditingGame(g)}
                onFetchMetadata={handleFetchMetadata}
                isLaunching={isLaunchingId === selectedGame.id}
                isFetchingMeta={isFetchingMetaId === selectedGame.id}
                onSaveNotes={handleSaveNotes}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
                Select a game to view details
              </div>
            )}
          </>
        ) : viewMode === "grid" ? (
          /* Full Grid View */
          <div className="flex-1 flex flex-col h-full bg-[#0d0e15]">
            <GameGrid
              games={filteredGames}
              selectedGameId={selectedGame?.id}
              onSelectGame={(g) => {
                setSelectedGameId(g.id);
                // When in full grid, selecting or clicking can also view
              }}
              onLaunchGame={handleLaunchGame}
              cardWidth={cardWidth}
            />
            <PosterZoomSlider
              cardWidth={cardWidth}
              onChange={setCardWidth}
            />
          </div>
        ) : (
          /* List View */
          <div className="flex-1 overflow-y-auto p-4 bg-[#0d0e15]">
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
                        className="px-3 py-1 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 rounded text-xs font-semibold"
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

      {/* Modals */}
      <AddGameModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddGame={handleAddGame}
      />

      <EditGameModal
        game={editingGame}
        isOpen={!!editingGame}
        onClose={() => setEditingGame(null)}
        onSave={handleSaveGame}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onScanLibrary={handleScanLibrary}
        isScanning={isScanning}
        totalGames={games.length}
      />
    </div>
  );
}

export default App;
