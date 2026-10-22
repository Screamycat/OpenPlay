import React from "react";
import { Game } from "../types/game";
import { resolveImageSrc } from "../utils/image";
import { Star, Gamepad2 } from "lucide-react";

interface GameGridProps {
  games: Game[];
  selectedGameId?: string;
  onSelectGame: (game: Game) => void;
  onLaunchGame: (game: Game) => void;
  cardWidth: number;
}

export const GameGrid: React.FC<GameGridProps> = ({
  games,
  selectedGameId,
  onSelectGame,
  onLaunchGame,
  cardWidth,
}) => {
  return (
    <div className="flex-1 overflow-y-auto p-3 scroll-smooth">
      <div
        className="grid gap-2.5 justify-center"
        style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`,
        }}
      >
        {games.map((game) => {
          const isSelected = game.id === selectedGameId;
          const coverSrc = resolveImageSrc(game.cover_image);

          return (
            <div
              key={game.id}
              onClick={() => onSelectGame(game)}
              onDoubleClick={() => onLaunchGame(game)}
              style={{ minHeight: `${cardWidth * 1.45}px` }}
              className={`group relative rounded-md overflow-hidden cursor-pointer transition-all duration-150 select-none aspect-[2/3] bg-[#141722] border ${
                isSelected
                  ? "border-cyan-400 ring-2 ring-cyan-400/70 shadow-lg shadow-cyan-950/50 scale-[1.01] z-10"
                  : "border-[#202538] hover:border-slate-500 hover:scale-[1.02]"
              }`}
            >
              {/* Cover Art Image */}
              {coverSrc ? (
                <img
                  src={coverSrc}
                  alt={game.title}
                  loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-200 group-hover:brightness-105"
                  onError={(e) => {
                    // Fallback to title placeholder if image fails
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
              ) : null}

              {/* Title & Fallback text (shown always if no image, or subtle overlay on hover) */}
              <div
                className={`absolute inset-0 flex flex-col justify-end p-2 transition-opacity ${
                  coverSrc
                    ? "opacity-0 group-hover:opacity-100 bg-gradient-to-t from-black/90 via-black/40 to-transparent"
                    : "opacity-100 bg-gradient-to-t from-[#161a29] to-[#0f111a] justify-center items-center text-center p-3"
                }`}
              >
                {!coverSrc && (
                  <Gamepad2 className="w-8 h-8 text-slate-600 mb-2" />
                )}
                <span className="text-xs font-semibold text-slate-100 line-clamp-2 leading-tight drop-shadow-md">
                  {game.title}
                </span>
                {game.release_date && (
                  <span className="text-[10px] text-slate-400 mt-0.5">
                    {game.release_date.slice(0, 4)}
                  </span>
                )}
              </div>

              {/* Favorite Star Badge */}
              {game.is_favorite && (
                <div className="absolute top-1.5 right-1.5 bg-black/60 backdrop-blur-sm p-1 rounded-full shadow-sm text-amber-400">
                  <Star className="w-3 h-3 fill-amber-400" />
                </div>
              )}

              {/* Source Pill (e.g. Steam or Custom) */}
              <div className="absolute top-1.5 left-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded text-[9px] font-medium text-slate-300">
                {game.source}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
