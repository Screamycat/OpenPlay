import React, { useState, useMemo } from "react";
import { Game } from "../types/game";
import { resolveImageSrc } from "../utils/image";
import { Star, Gamepad2, Cloud, Loader2 } from "lucide-react";
import { GroupByOption } from "./TopNav";

interface GameGridProps {
  games: Game[];
  selectedGameId?: string;
  onSelectGame: (game: Game) => void;
  onLaunchGame: (game: Game) => void;
  cardWidth: number;
  isLaunchingId?: string | null;
  runningGameIds?: string[];
  onContextMenu?: (game: Game, x: number, y: number) => void;
  groupBy?: GroupByOption;
}

interface GameGroup {
  name: string;
  games: Game[];
}

function getGroupKey(game: Game, groupBy: GroupByOption): string {
  switch (groupBy) {
    case "source":
      return game.source || "Manual";
    case "status":
      return game.is_installed ? "Installed" : "Uninstalled";
    case "first_letter": {
      const char = (game.sorting_title || game.title || "#")[0].toUpperCase();
      return /[A-Z]/.test(char) ? char : "#";
    }
    case "completion_status":
      return game.completion_status || "Not Played";
    default:
      return "";
  }
}

function buildGameGroups(games: Game[], groupBy: GroupByOption): GameGroup[] {
  if (groupBy === "none") {
    return [{ name: "", games }];
  }

  const map = new Map<string, Game[]>();
  for (const game of games) {
    const key = getGroupKey(game, groupBy);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(game);
  }

  return Array.from(map.entries())
    .map(([name, gList]) => ({ name, games: gList }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export const GameGrid: React.FC<GameGridProps> = ({
  games,
  selectedGameId,
  onSelectGame,
  onLaunchGame,
  cardWidth,
  isLaunchingId,
  runningGameIds = [],
  onContextMenu,
  groupBy = "none",
}) => {
  const [justLaunchedId, setJustLaunchedId] = useState<string | null>(null);

  const handleCardDoubleClick = (game: Game) => {
    if (runningGameIds.includes(game.id)) {
      onSelectGame(game);
      return;
    }
    setJustLaunchedId(game.id);
    setTimeout(() => {
      setJustLaunchedId((curr) => (curr === game.id ? null : curr));
    }, 600);
    onSelectGame(game);
    onLaunchGame(game);
  };

  const groups = useMemo(() => buildGameGroups(games, groupBy), [games, groupBy]);

  const renderGameCard = (game: Game) => {
    const isSelected = game.id === selectedGameId;
    const isLaunching = isLaunchingId === game.id;
    const isRunning = runningGameIds.includes(game.id);
    const isFlashActive = justLaunchedId === game.id;
    const coverSrc = resolveImageSrc(game.cover_image);

    return (
      <div
        key={game.id}
        onClick={() => onSelectGame(game)}
        onDoubleClick={() => handleCardDoubleClick(game)}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onSelectGame(game);
          if (onContextMenu) {
            onContextMenu(game, e.clientX, e.clientY);
          }
        }}
        style={{ minHeight: `${cardWidth * 1.5}px` }}
        className={`group relative rounded-lg overflow-hidden cursor-pointer transition-all duration-200 aspect-[2/3] bg-black/30 backdrop-blur-xs border-0 ${
          isLaunching
            ? "ring-2 ring-white shadow-[0_0_25px_rgba(255,255,255,0.7)] z-20 scale-[0.98]"
            : isRunning
            ? "ring-2 ring-emerald-500/70 shadow-[0_0_20px_rgba(16,185,129,0.35)] z-10"
            : isSelected
            ? "ring-2 ring-white shadow-2xl shadow-black/90 z-10"
            : "hover:ring-1 hover:ring-white/40 hover:shadow-2xl hover:shadow-black/70"
        } ${
          !game.is_installed
            ? "opacity-40 filter grayscale brightness-75 hover:grayscale-0 hover:opacity-100"
            : ""
        }`}
      >
        {/* Playnite FusionX Corner-to-Corner Card Shine Overlay */}
        <div className="card-shine-container">
          <div className="card-shine-beam" />
        </div>

        {/* Double-Click Launch Flash Animation Overlay */}
        {isFlashActive && (
          <div className="absolute inset-0 bg-white/50 pointer-events-none rounded-lg z-30 animate-launch-flash" />
        )}

        {/* Cover Art Image */}
        {coverSrc ? (
          coverSrc.endsWith(".webm") || coverSrc.endsWith(".mp4") ? (
            <video
              src={coverSrc}
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-full object-cover pointer-events-none"
            />
          ) : (
            <img
              src={coverSrc}
              alt={game.title}
              loading="lazy"
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLElement).style.display = "none";
              }}
            />
          )
        ) : (
          /* Fallback only if no cover artwork */
          <div className="absolute inset-0 flex flex-col justify-center items-center text-center p-3 bg-gradient-to-t from-black/80 to-black/40">
            <Gamepad2 className="w-8 h-8 text-zinc-500 mb-2" />
            <span className="text-xs font-bold text-zinc-100 line-clamp-2 leading-tight">
              {game.title}
            </span>
            {game.release_date && (
              <span className="text-[10px] text-zinc-400 mt-1">
                {game.release_date.slice(0, 4)}
              </span>
            )}
          </div>
        )}

        {/* Active Launching Indicator on Card */}
        {isLaunching && (
          <div className="absolute inset-x-2 bottom-2.5 py-1 px-2 rounded-md bg-black/85 backdrop-blur-md border border-white/20 flex items-center justify-center space-x-1.5 shadow-xl z-30 animate-pulse">
            <Loader2 className="w-3 h-3 text-white animate-spin" />
            <span className="text-[10px] font-black uppercase tracking-wider text-white">
              Launching...
            </span>
          </div>
        )}

        {/* Active Running Indicator on Card */}
        {isRunning && !isLaunching && (
          <div className="absolute inset-x-2 bottom-2.5 py-1 px-2 rounded-md bg-emerald-950/85 backdrop-blur-md border border-emerald-500/40 flex items-center justify-center space-x-1.5 shadow-xl z-30">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-200">
              Running
            </span>
          </div>
        )}

        {/* Uninstalled Cloud Indicator */}
        {!game.is_installed && (
          <div
            title="Not installed (Cloud Library)"
            className="absolute top-1.5 left-1.5 bg-black/75 backdrop-blur-sm p-1 rounded-full text-zinc-400 shadow-md z-10 border border-white/10"
          >
            <Cloud className="w-3 h-3" />
          </div>
        )}

        {/* Favorite Star Badge */}
        {game.is_favorite && (
          <div className="absolute top-1.5 right-1.5 bg-black/75 backdrop-blur-sm p-1 rounded-full shadow-md text-amber-400 z-10 border border-white/10">
            <Star className="w-3 h-3 fill-amber-400" />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto p-3 scroll-smooth bg-transparent select-none space-y-4">
      {groups.map((group) => (
        <div key={group.name || "all"} className="space-y-2.5">
          {/* Section Group Header (shown when grouping is active) */}
          {group.name && (
            <div className="sticky top-0 z-20 -mx-3 mb-1.5 select-none pointer-events-none">
              <div
                style={{
                  background:
                    "linear-gradient(to right, rgba(16, 16, 20, 0.55) 0%, rgba(16, 16, 20, 0.2) 60%, transparent calc(100% - 50px))",
                }}
                className="px-4 py-2 backdrop-blur-md flex items-center justify-between border-0 shadow-none"
              >
                <div className="flex items-center space-x-2.5">
                  <span className="text-xs font-bold text-white uppercase tracking-wider drop-shadow-sm">
                    {group.name}
                  </span>
                  <span className="px-1.5 py-0.2 rounded-full bg-white/10 text-zinc-300 font-mono text-[10px] border border-white/10">
                    {group.games.length}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div
            className="grid gap-2.5 justify-center"
            style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`,
            }}
          >
            {group.games.map((game) => renderGameCard(game))}
          </div>
        </div>
      ))}
    </div>
  );
};
