import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Game } from "../types/game";
import { GameAchievementSummary } from "../types/achievement";
import { Trophy, Lock, ChevronRight, Loader2 } from "lucide-react";

const sessionCheckedGames = new Set<string>();

interface AchievementsQuickWidgetProps {
  game: Game;
  onOpenFullAchievements?: () => void;
}

export const AchievementsQuickWidget: React.FC<AchievementsQuickWidgetProps> = ({
  game,
  onOpenFullAchievements,
}) => {
  const [summary, setSummary] = useState<GameAchievementSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const srcLower = game.source.toLowerCase();
  const supportsAchievements = srcLower === "steam" || srcLower === "epic";

  useEffect(() => {
    let isMounted = true;
    setSummary(null);

    const loadSummary = async () => {
      try {
        setIsLoading(true);
        let res = await invoke<GameAchievementSummary>(
          "get_game_achievement_summary",
          { gameId: game.id }
        );
        // If 0 achievements cached and it's a Steam or Epic game not yet checked this session, auto-sync once
        if (
          res.total_achievements === 0 &&
          supportsAchievements &&
          !sessionCheckedGames.has(game.id)
        ) {
          sessionCheckedGames.add(game.id);
          try {
            await invoke("sync_game_achievements", { gameId: game.id });
            res = await invoke<GameAchievementSummary>(
              "get_game_achievement_summary",
              { gameId: game.id }
            );
          } catch {}
        }
        if (isMounted) {
          setSummary(res);
        }
      } catch (err) {
        console.warn("Could not load achievement summary:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadSummary();

    const unlisten = listen<string>("achievements-updated", (event) => {
      if (event.payload === game.id && isMounted) {
        invoke<GameAchievementSummary>("get_game_achievement_summary", {
          gameId: game.id,
        })
          .then((res) => {
            if (isMounted) setSummary(res);
          })
          .catch(() => {});
      }
    });

    return () => {
      isMounted = false;
      unlisten.then((fn) => fn());
    };
  }, [game.id]);

  if (isLoading && !summary) {
    return (
      <div className="bg-black/15 backdrop-blur-md border border-white/10 rounded-xl p-4 shadow-xl flex items-center justify-center space-x-2 py-6 text-xs text-zinc-400">
        <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
        <span>Loading achievements...</span>
      </div>
    );
  }

  // If game has 0 achievements recorded and isn't loading, return null
  if (!summary || summary.total_achievements === 0) {
    return null;
  }

  const {
    total_achievements,
    unlocked_achievements,
    completion_percentage,
    latest_unlocked,
    recent_unlocked,
    upcoming_locked,
  } = summary;

  const remainingLockedCount = Math.max(
    0,
    total_achievements - unlocked_achievements - upcoming_locked.length
  );

  const getRarityBadgeColor = (pct: number) => {
    if (pct < 10.0) return "bg-amber-400/20 text-amber-300 border-amber-400/40"; // Ultra Rare
    if (pct < 20.0) return "bg-purple-500/20 text-purple-300 border-purple-500/40"; // Rare
    if (pct < 50.0) return "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"; // Uncommon
    return "bg-blue-600/30 text-blue-300 border-blue-500/30"; // Common
  };

  return (
    <div
      onClick={onOpenFullAchievements}
      className="bg-black/15 backdrop-blur-md border border-white/10 hover:border-white/25 transition-all rounded-xl p-4 shadow-xl space-y-3.5 cursor-pointer group select-none text-xs"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
        <div className="flex items-center space-x-2">
          <Trophy className="w-3.5 h-3.5 text-zinc-300 group-hover:text-white transition-colors" />
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">
            Achievements
          </h3>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-[11px] font-semibold text-zinc-300">
            {unlocked_achievements}/{total_achievements}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 font-bold text-zinc-200">
            {Math.round(completion_percentage)}%
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-white transition-colors ml-1" />
        </div>
      </div>

      {/* Featured Latest Unlocked Card */}
      {latest_unlocked && (
        <div className="flex items-start space-x-3 bg-white/[0.02] border border-white/5 rounded-lg p-2.5">
          <div className="flex flex-col items-center shrink-0">
            <div className="w-12 h-12 rounded-lg bg-black/60 border border-white/10 overflow-hidden relative">
              <img
                src={latest_unlocked.icon_url}
                alt={latest_unlocked.display_name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            </div>
            <span
              className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded mt-1 border leading-tight ${getRarityBadgeColor(
                latest_unlocked.rarity_percentage
              )}`}
            >
              {latest_unlocked.rarity_percentage > 0
                ? `${latest_unlocked.rarity_percentage}%`
                : "Unlocked"}
            </span>
          </div>

          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-baseline justify-between gap-1">
              <div className="font-bold text-white text-xs truncate">
                {latest_unlocked.display_name}
              </div>
              {latest_unlocked.unlock_time && (
                <div className="text-[10px] text-zinc-400 shrink-0 font-mono">
                  {latest_unlocked.unlock_time}
                </div>
              )}
            </div>
            {latest_unlocked.description && (
              <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                {latest_unlocked.description}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Horizontal Strip of Recent Unlocked Badges */}
      {recent_unlocked.length > 0 && (
        <div className="flex items-center space-x-2 pt-0.5 overflow-x-auto">
          {recent_unlocked.map((ach) => (
            <div
              key={ach.api_name}
              className="flex flex-col items-center shrink-0"
              title={`${ach.display_name} (${ach.rarity_percentage}%)`}
            >
              <div className="w-9 h-9 rounded-md bg-black/50 border border-white/10 overflow-hidden">
                <img
                  src={ach.icon_url}
                  alt={ach.display_name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
              </div>
              <span
                className={`text-[8px] font-extrabold px-1 py-0.2 rounded mt-0.5 border leading-tight ${getRarityBadgeColor(
                  ach.rarity_percentage
                )}`}
              >
                {ach.rarity_percentage}%
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Divider */}
      {upcoming_locked.length > 0 && <div className="border-t border-white/10" />}

      {/* Locked Achievements Section */}
      {upcoming_locked.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <span>
              Locked Achievements ({upcoming_locked.length}
              {remainingLockedCount > 0 ? `/${total_achievements - unlocked_achievements}` : ""})
            </span>
          </div>

          <div className="flex items-center space-x-2 overflow-x-auto">
            {upcoming_locked.map((ach) => {
              const isUltraRare = ach.rarity_percentage < 10.0 && ach.rarity_percentage > 0;
              const isRare = ach.rarity_percentage < 20.0 && ach.rarity_percentage >= 10.0;

              return (
                <div
                  key={ach.api_name}
                  className="flex flex-col items-center shrink-0 relative group/icon"
                  title={ach.is_secret ? "Hidden Achievement" : `${ach.display_name} (${ach.rarity_percentage}%)`}
                >
                  <div
                    className={`w-9 h-9 rounded-md bg-black/70 border overflow-hidden relative ${
                      isUltraRare
                        ? "border-amber-400/50 shadow-[0_0_8px_rgba(251,191,36,0.3)]"
                        : isRare
                        ? "border-purple-500/50 shadow-[0_0_8px_rgba(168,85,247,0.3)]"
                        : "border-white/10"
                    }`}
                  >
                    <img
                      src={ach.icon_gray_url || ach.icon_url}
                      alt={ach.display_name}
                      className={`w-full h-full object-cover grayscale opacity-40 ${
                        ach.is_secret ? "blur-xs scale-110" : ""
                      }`}
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = "none";
                      }}
                    />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <Lock className="w-3 h-3 text-zinc-400" />
                    </div>
                  </div>
                  <span
                    className={`text-[8px] font-extrabold px-1 py-0.2 rounded mt-0.5 border leading-tight ${
                      isUltraRare
                        ? "bg-amber-400/20 text-amber-300 border-amber-400/40"
                        : isRare
                        ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                        : "bg-zinc-800 text-zinc-400 border-zinc-700"
                    }`}
                  >
                    {ach.rarity_percentage > 0 ? `${ach.rarity_percentage}%` : "--"}
                  </span>
                </div>
              );
            })}

            {remainingLockedCount > 0 && (
              <div
                className="w-9 h-9 rounded-md bg-white/[0.03] border border-white/10 flex items-center justify-center shrink-0 text-[11px] font-bold text-zinc-400 hover:text-white transition-colors"
                title={`+${remainingLockedCount} more locked achievements`}
              >
                +{remainingLockedCount}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
