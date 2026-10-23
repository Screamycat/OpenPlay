import React, { useEffect, useRef } from "react";
import { Game } from "../types/game";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Play,
  Download,
  Square,
  Sparkles,
  Film,
  Star,
  Settings,
  HardDrive,
} from "lucide-react";

export interface GameContextMenuProps {
  game: Game;
  x: number;
  y: number;
  onClose: () => void;
  onLaunch?: (game: Game) => void;
  onStop?: (game: Game) => void;
  isRunning?: boolean;
  isLaunching?: boolean;
  onOpenSteamGridDB: (game: Game) => void;
  onOpenTrailers: (game: Game) => void;
  onToggleFavorite: (id: string) => void;
  onFetchMetadata: (id: string) => void;
  isFetchingMeta?: boolean;
  onOpenEdit: (game: Game) => void;
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
  onOpenSteamGridDB,
  onOpenTrailers,
  onToggleFavorite,
  onFetchMetadata,
  isFetchingMeta = false,
  onOpenEdit,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Keep menu within screen boundaries
  const menuWidth = 230;
  const menuHeight = 310;
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
      await openUrl(`file:///${path}`);
    } catch (e) {
      console.warn("Failed to open game folder:", e);
    }
  };

  const trailers = game.trailers || [];

  return (
    <div
      ref={menuRef}
      style={{ left: `${clampedX}px`, top: `${clampedY}px` }}
      className="fixed w-56 bg-[#131625]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-1.5 z-50 text-xs space-y-0.5 animate-in fade-in zoom-in-95 duration-100 select-none"
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

      <div className="my-1 border-t border-white/10" />

      {/* Change Artwork (SteamGridDB) */}
      <button
        onClick={() => {
          onClose();
          onOpenSteamGridDB(game);
        }}
        className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-left text-slate-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
      >
        <Sparkles className="w-4 h-4 text-white shrink-0" />
        <span>Change Artwork (SteamGridDB)</span>
      </button>

      {/* Manage Trailers */}
      <button
        onClick={() => {
          onClose();
          onOpenTrailers(game);
        }}
        className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-left text-slate-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
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
        className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-left text-slate-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
      >
        <Star
          className={`w-4 h-4 shrink-0 ${
            game.is_favorite ? "fill-amber-400 text-amber-400" : "text-slate-400"
          }`}
        />
        <span>{game.is_favorite ? "Remove from Favorites" : "Add to Favorites"}</span>
      </button>

      {/* Refresh Metadata & HLTB */}
      <button
        onClick={() => {
          onClose();
          onFetchMetadata(game.id);
        }}
        disabled={isFetchingMeta}
        className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-left text-slate-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50"
      >
        <Sparkles
          className={`w-4 h-4 text-emerald-400 shrink-0 ${
            isFetchingMeta ? "animate-spin" : ""
          }`}
        />
        <span>Refresh Store & HLTB</span>
      </button>

      <div className="my-1 border-t border-white/10" />

      {/* Game Properties */}
      <button
        onClick={() => {
          onClose();
          onOpenEdit(game);
        }}
        className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-left text-slate-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
      >
        <Settings className="w-4 h-4 text-slate-400 shrink-0" />
        <span>Game Properties</span>
      </button>

      {/* Open Game Folder */}
      {game.install_directory && (
        <button
          onClick={() => {
            onClose();
            handleOpenFolder(game.install_directory!);
          }}
          className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-left text-slate-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
        >
          <HardDrive className="w-4 h-4 text-slate-400 shrink-0" />
          <span>Open Game Folder</span>
        </button>
      )}
    </div>
  );
};
