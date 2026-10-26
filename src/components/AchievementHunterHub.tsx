import React, { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Game } from "../types/game";
import { Achievement, HunterProfile } from "../types/achievement";
import { AchievementsTab } from "./AchievementsTab";
import { AchievementDetailModal } from "./AchievementDetailModal";
import {
  Trophy,
  Sparkles,
  ArrowLeft,
  Search,
  CheckCircle2,
  ChevronRight,
  Flame,
  Target,
  Crown,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { resolveImageSrc, isVideoSrc } from "../utils/image";

interface AchievementHunterHubProps {
  onBackToLibrary: () => void;
  games: Game[];
  onCycleBackground?: () => void;
}

type TierFilter = "all" | "perfect" | "master" | "dedicated" | "progress" | "untouched";

export const AchievementHunterHub: React.FC<AchievementHunterHubProps> = ({
  onBackToLibrary,
  games,
  onCycleBackground,
}) => {
  const [profile, setProfile] = useState<HunterProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [inspectGame, setInspectGame] = useState<Game | null>(null);
  const [selectedAchievement, setSelectedAchievement] = useState<{
    achievement: Achievement;
    gameTitle?: string;
    gameCover?: string | null;
  } | null>(null);

  const loadHunterProfile = async (forceSync = false) => {
    try {
      if (forceSync) {
        setIsSyncingAll(true);
        const synced = await invoke<HunterProfile>("sync_all_achievements");
        setProfile(synced);
        return;
      }

      setIsLoading(true);
      let data = await invoke<HunterProfile>("get_hunter_profile");
      setProfile(data);

      // If library has Steam, Epic, or RetroAchievements games but no achievements cached yet, trigger background sync
      if (
        data.total_achievements_count === 0 &&
        games.some((g) => ["steam", "epic", "retroachievements"].includes(g.source.toLowerCase()))
      ) {
        setIsSyncingAll(true);
        const synced = await invoke<HunterProfile>("sync_all_achievements");
        setProfile(synced);
      }
    } catch (err) {
      console.error("Failed to load hunter profile:", err);
    } finally {
      setIsLoading(false);
      setIsSyncingAll(false);
    }
  };

  useEffect(() => {
    loadHunterProfile();
  }, [games]);

  // Tier filtering for catalog
  const filteredGames = useMemo(() => {
    if (!profile) return [];
    return profile.games_summaries.filter((s) => {
      // Search query
      if (searchQuery.trim()) {
        if (!s.game_title.toLowerCase().includes(searchQuery.toLowerCase())) {
          return false;
        }
      }

      // Tier filter
      if (tierFilter === "perfect") return s.is_perfect;
      if (tierFilter === "master")
        return s.completion_percentage >= 75.0 && !s.is_perfect;
      if (tierFilter === "dedicated")
        return (
          s.completion_percentage >= 50.0 && s.completion_percentage < 75.0
        );
      if (tierFilter === "progress")
        return (
          s.completion_percentage > 0.0 && s.completion_percentage < 50.0
        );
      if (tierFilter === "untouched")
        return s.completion_percentage === 0.0;

      return true;
    });
  }, [profile, searchQuery, tierFilter]);

  const getHunterRankTitle = (lvl: number) => {
    if (lvl >= 50) return "Grandmaster Legend";
    if (lvl >= 30) return "Master Hunter";
    if (lvl >= 20) return "Diamond Hunter";
    if (lvl >= 10) return "Veteran Hunter";
    if (lvl >= 5) return "Adept Hunter";
    return "Apprentice Hunter";
  };

  const getRarityBadge = (pct: number) => {
    if (pct < 10.0 && pct > 0) {
      return "bg-amber-400/20 text-amber-300 border-amber-400/50 shadow-[0_0_10px_rgba(251,191,36,0.2)]";
    }
    if (pct < 20.0 && pct >= 10.0) {
      return "bg-purple-500/20 text-purple-300 border-purple-500/40";
    }
    if (pct < 50.0 && pct >= 20.0) {
      return "bg-cyan-500/20 text-cyan-300 border-cyan-500/40";
    }
    return "bg-zinc-800 text-zinc-300 border-zinc-700";
  };

  if (isLoading && !profile) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center space-y-3 text-zinc-400 text-xs">
        <Loader2 className="w-8 h-8 animate-spin text-white" />
        <span className="text-sm font-semibold text-zinc-300">
          Calculating Achievement Hunter metrics...
        </span>
      </div>
    );
  }

  const {
    level = 1,
    total_score = 0,
    next_level_xp = 120,
    level_progress_percent = 0,
    total_achievements_count = 0,
    unlocked_achievements_count = 0,
    average_completion_percent = 0,
    perfect_games_count = 0,
    rarest_achievements = [],
    almost_there_games = [],
    games_summaries = [],
  } = profile || {};

  return (
    <div className="flex-1 flex flex-col h-full bg-transparent overflow-y-auto animate-view-fade relative">
      {/* Top Header Bar */}
      <div className="sticky top-0 z-30 bg-[#07080c]/60 backdrop-blur-xl border-b border-white/10 px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBackToLibrary}
            className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs transition-all cursor-pointer shadow-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Library</span>
          </button>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex items-center space-x-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            <h1 className="text-sm font-black uppercase tracking-wider text-white">
              Achievement Hub
            </h1>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {onCycleBackground && (
            <button
              onClick={onCycleBackground}
              title="Cycle to another random hero backdrop from top 25 finished games"
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition-all cursor-pointer text-xs font-medium border border-white/5"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Cycle Backdrop</span>
            </button>
          )}

          <button
            onClick={() => loadHunterProfile(true)}
            disabled={isSyncingAll}
            title="Refresh and sync all achievements"
            className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition-all cursor-pointer text-xs font-medium border border-white/5 disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${
                isSyncingAll ? "animate-spin text-amber-400" : ""
              }`}
            />
            <span>{isSyncingAll ? "Syncing Library..." : "Sync Achievements"}</span>
          </button>
        </div>
      </div>

      <div className="p-8 max-w-7xl mx-auto w-full space-y-8">
        {/* 1. Hunter Hero Dashboard Card */}
        <div className="bg-gradient-to-br from-black/50 via-zinc-950/40 to-black/30 border border-white/10 rounded-2xl p-6 shadow-2xl relative overflow-hidden backdrop-blur-xl">
          <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            {/* Level & Rank Badge (Left Col) */}
            <div className="lg:col-span-5 flex items-center space-x-5">
              <div className="relative">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-amber-500/20 via-yellow-400/10 to-amber-300/30 border-2 border-amber-400/50 flex flex-col items-center justify-center shadow-[0_0_25px_rgba(251,191,36,0.25)]">
                  <Crown className="w-6 h-6 text-amber-300 mb-0.5" />
                  <span className="text-xl font-black text-white leading-none">
                    {level}
                  </span>
                  <span className="text-[9px] uppercase font-bold text-amber-300/80 tracking-wider">
                    Level
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 min-w-0 flex-1">
                <div className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center space-x-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{getHunterRankTitle(level)}</span>
                </div>
                <div className="text-2xl font-black text-white tracking-tight">
                  {total_score.toLocaleString()}{" "}
                  <span className="text-xs font-normal text-zinc-400 uppercase">
                    Hunter Pts
                  </span>
                </div>

                {/* Level Progress Bar */}
                <div className="space-y-1 pt-1">
                  <div className="w-full bg-zinc-800/80 h-2 rounded-full overflow-hidden border border-white/5">
                    <div
                      className="bg-gradient-to-r from-amber-400 to-yellow-300 h-full rounded-full transition-all duration-700"
                      style={{ width: `${level_progress_percent}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-zinc-400 font-mono">
                    <span>{total_score} XP</span>
                    <span>{next_level_xp} XP for Lv {level + 1}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Global Stats Counter Cards (Right Col) */}
            <div className="lg:col-span-7 grid grid-cols-3 gap-3">
              <div className="bg-black/30 border border-white/5 rounded-xl p-3.5 space-y-1">
                <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center space-x-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-zinc-300" />
                  <span>Unlocked</span>
                </div>
                <div className="text-lg font-bold text-white">
                  {unlocked_achievements_count.toLocaleString()}{" "}
                  <span className="text-xs text-zinc-500 font-normal">
                    / {total_achievements_count.toLocaleString()}
                  </span>
                </div>
                <div className="text-[10px] text-zinc-400">Total library trophies</div>
              </div>

              <div className="bg-black/30 border border-white/5 rounded-xl p-3.5 space-y-1">
                <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center space-x-1.5">
                  <Target className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Avg Completion</span>
                </div>
                <div className="text-lg font-bold text-white">
                  {Math.round(average_completion_percent)}%
                </div>
                <div className="text-[10px] text-zinc-400">Across games with stats</div>
              </div>

              <div className="bg-black/30 border border-white/5 rounded-xl p-3.5 space-y-1">
                <div className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider flex items-center space-x-1.5">
                  <Trophy className="w-3.5 h-3.5 text-amber-400" />
                  <span>Perfect Games</span>
                </div>
                <div className="text-lg font-bold text-amber-300">
                  {perfect_games_count}
                </div>
                <div className="text-[10px] text-amber-200/60">100% completed titles</div>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Top 5 Rarest Trophy Showcase */}
        {rarest_achievements.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                Rarest Unlocked Trophies
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {rarest_achievements.map((ach) => (
                <div
                  key={`${ach.game_id}-${ach.api_name}`}
                  onClick={() => {
                    const matched = games.find((g) => g.id === ach.game_id);
                    setSelectedAchievement({
                      achievement: ach,
                      gameTitle: matched?.title,
                      gameCover: matched?.cover_image,
                    });
                  }}
                  className="bg-black/40 backdrop-blur-md border border-white/10 hover:border-amber-400/40 hover:bg-black/60 transition-all rounded-xl p-3 space-y-2 flex flex-col justify-between shadow-lg cursor-pointer group select-none"
                >
                  <div className="flex items-start space-x-3">
                    <div className="w-11 h-11 rounded-lg bg-black/60 border border-white/10 overflow-hidden shrink-0">
                      <img
                        src={ach.icon_url}
                        alt={ach.display_name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = "none";
                        }}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-white truncate">
                        {ach.display_name}
                      </div>
                      <p className="text-[10px] text-zinc-400 line-clamp-2 mt-0.5">
                        {ach.description || "Unlocked rarity milestone"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-white/5">
                    <span
                      className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded border leading-none ${getRarityBadge(
                        ach.rarity_percentage
                      )}`}
                    >
                      {ach.rarity_percentage}% Rarity
                    </span>
                    {ach.unlock_time && (
                      <span className="text-[9px] text-zinc-400 font-mono">
                        {ach.unlock_time.split(" ")[0]}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3. 'Almost There' Carousel (Close to 100%) */}
        {almost_there_games.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Flame className="w-4 h-4 text-amber-500" />
              <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                Almost There — Close to 100%
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {almost_there_games.map((g) => {
                const remaining = g.total_achievements - g.unlocked_achievements;
                return (
                  <div
                    key={g.game_id}
                    onClick={() => {
                      const matched = games.find((item) => item.id === g.game_id);
                      if (matched) setInspectGame(matched);
                    }}
                    className="bg-black/40 backdrop-blur-md border border-amber-500/25 hover:border-amber-400/50 transition-all rounded-xl p-3.5 space-y-3 cursor-pointer group shadow-lg"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-16 rounded-md bg-black/60 border border-white/10 overflow-hidden shrink-0">
                        {g.cover_image && (
                          isVideoSrc(g.cover_image) ? (
                            <video
                              src={resolveImageSrc(g.cover_image)}
                              autoPlay
                              loop
                              muted
                              playsInline
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform pointer-events-none"
                            />
                          ) : (
                            <img
                              src={resolveImageSrc(g.cover_image)}
                              alt={g.game_title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                          )
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-white truncate group-hover:text-amber-300 transition-colors">
                          {g.game_title}
                        </div>
                        <div className="text-[11px] text-amber-300 font-semibold mt-0.5">
                          Only {remaining} {remaining === 1 ? "trophy" : "trophies"} left!
                        </div>
                        <div className="text-[10px] text-zinc-400">
                          {g.unlocked_achievements}/{g.total_achievements} unlocked
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-amber-400 h-full rounded-full"
                        style={{ width: `${g.completion_percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 4. Tiered Game Catalog (Searchable & Filterable) */}
        <div className="space-y-4 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Games Achievement Catalog
              </h2>
              <p className="text-xs text-zinc-400">
                Browse and filter your games by completion tier.
              </p>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search games..."
                className="w-full pl-8 pr-3 py-1.5 bg-black/50 border border-white/10 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white/30 backdrop-blur-md"
              />
            </div>
          </div>

          {/* Tier Filter Tabs */}
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1">
            {[
              { id: "all", label: `All (${games_summaries.length})` },
              { id: "perfect", label: `🏆 Perfect (${perfect_games_count})` },
              {
                id: "master",
                label: `🥇 Master (${
                  games_summaries.filter(
                    (s) => s.completion_percentage >= 75 && !s.is_perfect
                  ).length
                })`,
              },
              {
                id: "dedicated",
                label: `🥈 Dedicated (${
                  games_summaries.filter(
                    (s) =>
                      s.completion_percentage >= 50 &&
                      s.completion_percentage < 75
                  ).length
                })`,
              },
              {
                id: "progress",
                label: `🥉 In Progress (${
                  games_summaries.filter(
                    (s) =>
                      s.completion_percentage > 0 &&
                      s.completion_percentage < 50
                  ).length
                })`,
              },
              {
                id: "untouched",
                label: `⚪ Untouched (${
                  games_summaries.filter((s) => s.completion_percentage === 0)
                    .length
                })`,
              },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTierFilter(t.id as TierFilter)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer backdrop-blur-md ${
                  tierFilter === t.id
                    ? "bg-white/20 text-white shadow-sm font-bold border border-white/25"
                    : "bg-black/40 text-zinc-400 hover:text-white border border-white/10 hover:border-white/20"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Catalog Grid */}
          {filteredGames.length === 0 ? (
            <div className="p-12 text-center text-zinc-400 text-xs">
              No games found matching your active filter.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredGames.map((g) => {
                const matchedGame = games.find((item) => item.id === g.game_id);

                return (
                  <div
                    key={g.game_id}
                    onClick={() => {
                      if (matchedGame) setInspectGame(matchedGame);
                    }}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer group flex flex-col justify-between space-y-3 backdrop-blur-md shadow-lg ${
                      g.is_perfect
                        ? "bg-amber-400/[0.08] border-amber-400/30 hover:border-amber-400/60 shadow-[0_0_15px_rgba(251,191,36,0.12)]"
                        : "bg-black/40 border-white/10 hover:border-white/25 hover:bg-black/50"
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      <div className="w-12 h-16 rounded-md bg-black/60 border border-white/10 overflow-hidden shrink-0">
                        {g.cover_image && (
                          isVideoSrc(g.cover_image) ? (
                            <video
                              src={resolveImageSrc(g.cover_image)}
                              autoPlay
                              loop
                              muted
                              playsInline
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform pointer-events-none"
                            />
                          ) : (
                            <img
                              src={resolveImageSrc(g.cover_image)}
                              alt={g.game_title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                          )
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="text-xs font-bold text-white truncate group-hover:text-amber-300 transition-colors">
                          {g.game_title}
                        </div>
                        <div className="flex items-center space-x-1.5 text-[11px] text-zinc-400">
                          <span>
                            {g.unlocked_achievements} / {g.total_achievements} unlocked
                          </span>
                          {matchedGame?.source && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/10 text-zinc-300 font-semibold uppercase">
                              {matchedGame.source}
                            </span>
                          )}
                        </div>
                        {g.is_perfect && (
                          <div className="text-[10px] font-bold text-amber-300 flex items-center space-x-1 pt-0.5">
                            <Sparkles className="w-3 h-3 text-amber-400" />
                            <span>100% Perfect Game</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-1">
                      <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            g.is_perfect ? "bg-amber-400" : "bg-white"
                          }`}
                          style={{ width: `${g.completion_percentage}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-zinc-400">
                        <span>{Math.round(g.completion_percentage)}% Completed</span>
                        <ChevronRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-white transition-colors" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 5. In-Hub Game Achievement Inspector Modal */}
      {inspectGame && (
        <div
          className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setInspectGame(null)}
        >
          <div
            className="theme-panel-surface border border-white/10 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden backdrop-blur-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Trophy className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">
                  {inspectGame.title} Achievements
                </h3>
              </div>
              <button
                onClick={() => setInspectGame(null)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              <AchievementsTab game={inspectGame} />
            </div>
          </div>
        </div>
      )}

      {/* 6. Achievement Detail Modal */}
      {selectedAchievement && (
        <AchievementDetailModal
          achievement={selectedAchievement.achievement}
          gameTitle={selectedAchievement.gameTitle}
          gameCover={selectedAchievement.gameCover}
          onClose={() => setSelectedAchievement(null)}
        />
      )}
    </div>
  );
};
