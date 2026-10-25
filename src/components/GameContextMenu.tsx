import React, { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Game } from "../types/game";
import {
  Play,
  Download,
  Square,
  Film,
  Star,
  Settings,
  FolderOpen,
  RefreshCw,
  Trash2,
  ChevronRight,
  Eye,
  EyeOff,
  Layers,
} from "lucide-react";

export interface GameContextMenuProps {
  game: Game;
  x: number;
  y: number;
  onClose: () => void;
  onLaunch?: (game: Game, actionId?: string) => void;
  onStop?: (game: Game) => void;
  onToggleHide?: (game: Game) => void;
  isRunning?: boolean;
  isLaunching?: boolean;
  onOpenSteamGridDB?: (game: Game) => void;
  onOpenTrailers: (game: Game) => void;
  onToggleFavorite: (id: string) => void;
  onFetchMetadata?: (id: string) => void;
  isFetchingMeta?: boolean;
  onRefreshGame?: (id: string) => void;
  isRefreshing?: boolean;
  onOpenEdit: (game: Game) => void;
  onRemoveGame?: (game: Game) => void;
}

export const GameContextMenu: React.FC<GameContextMenuProps> = ({
  game,
  x,
  y,
  onClose,
  onLaunch,
  onStop,
  isRunning = false,
  isLaunching = false,
  onOpenTrailers,
  onToggleFavorite,
  onRefreshGame,
  isRefreshing = false,
  onOpenEdit,
  onRemoveGame,
  onToggleHide,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  const [showActionsSubmenu, setShowActionsSubmenu] = useState(false);

  // Keep menu within screen boundaries
  const menuWidth = 230;
  const menuHeight = 380;
  const clampedX = Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8));
  const clampedY = Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8));

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleScroll = () => {
      onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    const timer = setTimeout(() => {
      window.addEventListener("mousedown", handleMouseDown);
    }, 30);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [onClose]);

  const handleOpenFolder = async (path: string) => {
    try {
      await invoke("open_in_explorer", { path });
    } catch (e) {
      console.warn("Failed to open game folder:", e);
    }
  };

  const trailers = game.trailers || [];

  const folderPath =
    game.install_directory ||
    (game.executable_path
      ? game.executable_path.substring(
          0,
          Math.max(game.executable_path.lastIndexOf("\\"), game.executable_path.lastIndexOf("/"))
        )
      : null);

  return (
    <div
      ref={menuRef}
      style={{ left: `${clampedX}px`, top: `${clampedY}px` }}
      className="fixed w-56 theme-panel-surface backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl shadow-black/80 ring-1 ring-white/5 p-1.5 z-50 text-xs space-y-0.5 animate-in fade-in zoom-in-95 duration-100 select-none"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Primary Action: Play / Exit Game / Install */}
      {isRunning ? (
        <button
          onClick={() => {
            onClose();
            if (onStop) onStop(game);
          }}
          className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-left text-rose-300 hover:text-rose-100 hover:bg-rose-500/20 transition-colors cursor-pointer group"
        >
          <Square className="w-4 h-4 text-rose-400 fill-rose-400 group-hover:animate-pulse shrink-0" />
          <span className="font-bold">Exit Game</span>
        </button>
      ) : game.is_installed ? (
        <>
          <button
            onClick={() => {
              onClose();
              if (onLaunch) onLaunch(game);
            }}
            disabled={isLaunching}
            className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-left text-emerald-300 hover:text-white hover:bg-emerald-500/20 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Play className="w-4 h-4 text-emerald-400 fill-emerald-400 shrink-0" />
            <span className="font-bold">{isLaunching ? "Launching..." : "Play"}</span>
          </button>

          {/* Play Actions Submenu */}
          {game.play_actions && game.play_actions.length > 0 && (
            <div
              className="relative"
              onMouseEnter={() => setShowActionsSubmenu(true)}
              onMouseLeave={() => setShowActionsSubmenu(false)}
            >
              <button
                type="button"
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-zinc-300 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
              >
                <div className="flex items-center space-x-2.5">
                  <Layers className="w-4 h-4 text-purple-400 shrink-0" />
                  <span className="font-medium">Play Actions</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
              </button>

              {/* Submenu Popover */}
              {showActionsSubmenu && (
                <div className="absolute left-[calc(100%+4px)] top-0 w-56 theme-panel-surface backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl p-1.5 z-50 text-xs space-y-0.5 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider text-zinc-500">
                    Configurations
                  </div>
                  {game.play_actions.map((act) => (
                    <button
                      key={act.id}
                      onClick={() => {
                        onClose();
                        if (onLaunch) onLaunch(game, act.id);
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-left text-zinc-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center space-x-2 truncate pr-2">
                        <Play className="w-3.5 h-3.5 text-purple-400 shrink-0 group-hover:fill-purple-400" />
                        <span className="truncate font-semibold">{act.name}</span>
                      </div>
                      {act.is_primary && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono shrink-0">
                          Primary
                        </span>
                      )}
                    </button>
                  ))}
                  <div className="my-1 border-t border-white/[0.08]" />
                  <button
                    onClick={() => {
                      onClose();
                      onOpenEdit(game);
                    }}
                    className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-xl text-left text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer text-[11px]"
                  >
                    <Settings className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Manage Actions...</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <button
          onClick={() => {
            onClose();
            if (onLaunch) onLaunch(game);
          }}
          className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-left text-cyan-300 hover:text-white hover:bg-cyan-500/20 transition-colors cursor-pointer"
        >
          <Download className="w-4 h-4 text-cyan-400 shrink-0" />
          <span className="font-bold">Install</span>
        </button>
      )}

      <div className="my-1 border-t border-white/[0.08]" />

      {/* Manage Trailers */}
      <button
        onClick={() => {
          onClose();
          onOpenTrailers(game);
        }}
        className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-left text-zinc-200 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
      >
        <Film className="w-4 h-4 text-cyan-400 shrink-0" />
        <span>{trailers.length > 0 ? "Manage Trailers" : "Add Trailer"}</span>
      </button>

      {/* Favorites Toggle */}
      <button
        onClick={() => {
          onClose();
          onToggleFavorite(game.id);
        }}
        className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-left text-zinc-200 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
      >
        <Star
          className={`w-4 h-4 shrink-0 ${
            game.is_favorite ? "fill-amber-400 text-amber-400" : "text-zinc-400"
          }`}
        />
        <span>{game.is_favorite ? "Remove from Favorites" : "Add to Favorites"}</span>
      </button>

      {/* Refresh Live Data (HLTB, Achievements, Store Playtime & Stats) */}
      {onRefreshGame && (
        <button
          onClick={() => {
            onClose();
            onRefreshGame(game.id);
          }}
          disabled={isRefreshing}
          title="Refresh HLTB, achievements, playtime, and live store stats"
          className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-left text-zinc-200 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw
            className={`w-4 h-4 text-emerald-400 shrink-0 ${
              isRefreshing ? "animate-spin" : ""
            }`}
          />
          <span>{isRefreshing ? "Refreshing..." : "Refresh"}</span>
        </button>
      )}

      <div className="my-1 border-t border-white/[0.08]" />

      {/* Game Properties */}
      <button
        onClick={() => {
          onClose();
          onOpenEdit(game);
        }}
        className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-left text-zinc-200 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
      >
        <Settings className="w-4 h-4 text-zinc-400 shrink-0" />
        <span>Game Properties</span>
      </button>

      {/* Hide / Unhide Game */}
      {onToggleHide && (
        <button
          onClick={() => {
            onClose();
            onToggleHide(game);
          }}
          className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-left text-zinc-200 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
        >
          {game.is_hidden ? (
            <>
              <Eye className="w-4 h-4 text-purple-400 shrink-0" />
              <span>Unhide Game</span>
            </>
          ) : (
            <>
              <EyeOff className="w-4 h-4 text-zinc-400 shrink-0" />
              <span>Hide Game</span>
            </>
          )}
        </button>
      )}

      {/* Open Game Folder */}
      {folderPath && (
        <button
          onClick={() => {
            onClose();
            handleOpenFolder(folderPath);
          }}
          className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-left text-zinc-200 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
        >
          <FolderOpen className="w-4 h-4 text-zinc-400 shrink-0" />
          <span>Open Game Folder</span>
        </button>
      )}

      {/* Remove Local Game */}
      {(!["steam", "epic", "gog", "battle.net", "ea app", "ubisoft connect", "xbox"].includes(
        game.source.toLowerCase()
      ) ||
        game.source.toLowerCase() === "local" ||
        game.source.toLowerCase() === "manual") &&
        onRemoveGame && (
          <>
            <div className="my-1 border-t border-white/[0.08]" />
            <button
              onClick={() => {
                onClose();
                onRemoveGame(game);
              }}
              className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-left text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4 text-red-400 shrink-0" />
              <span>Remove Game</span>
            </button>
          </>
        )}
    </div>
  );
};
