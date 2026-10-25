import React, { useState, useEffect, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Game } from "../types/game";
import { Achievement } from "../types/achievement";
import { AchievementDetailModal } from "./AchievementDetailModal";
import {
  Trophy,
  RefreshCw,
  Search,
  Lock,
  Eye,
  EyeOff,
  Sparkles,
  Loader2,
  CheckCircle2,
} from "lucide-react";

interface AchievementsTabProps {
  game: Game;
  onOpenSteamLogin?: () => void;
}

type StatusFilter = "all" | "unlocked" | "locked";
type SortOption = "default" | "rarity_asc" | "rarity_desc" | "date" | "alpha";

export const AchievementsTab: React.FC<AchievementsTabProps> = ({
  game,
}) => {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("default");
  const [revealSpoilers, setRevealSpoilers] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null);
  const syncedGameIdsRef = useRef<Set<string>>(new Set());

  const srcLower = game.source.toLowerCase();
  const supportsAchievements =
    (srcLower === "steam" && !!game.source_id) ||
    (srcLower === "epic" && (!!game.source_id || !!game.notes?.includes("namespace:")));
  const storeLabel = srcLower === "epic" ? "Epic Games" : "Steam";

  // 1. Initial Load from Local SQLite Cache
  const loadCachedAchievements = async (autoSyncIfEmpty = true) => {
    try {
      setIsLoading(true);
      const list = await invoke<Achievement[]>("get_game_achievements", {
        gameId: game.id,
      });
      setAchievements(list);

      // If cache is empty and platform supports achievements, auto-sync once per game
      if (
        autoSyncIfEmpty &&
        list.length === 0 &&
        supportsAchievements &&
        !syncedGameIdsRef.current.has(game.id)
      ) {
        syncedGameIdsRef.current.add(game.id);
        await handleSync();
      }
    } catch (err) {
      console.warn("Failed to load cached achievements:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCachedAchievements(true);

    const unlisten = listen<string>("achievements-updated", (event) => {
      if (event.payload === game.id) {
        invoke<Achievement[]>("get_game_achievements", { gameId: game.id })
          .then((list) => setAchievements(list))
          .catch(() => {});
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [game.id]);

  // 2. Sync with Store (Steam / Epic Games)
  const handleSync = async () => {
    if (!supportsAchievements) return;
    try {
      setIsSyncing(true);
      setSyncError(null);
      const updated = await invoke<Achievement[]>("sync_game_achievements", {
        gameId: game.id,
      });
      setAchievements(updated);
    } catch (err: any) {
      console.error("Failed to sync achievements:", err);
      setSyncError(typeof err === "string" ? err : "Sync failed");
    } finally {
      setIsSyncing(false);
    }
  };

  // 3. Stats & Metrics
  const totalCount = achievements.length;
  const unlockedCount = useMemo(
    () => achievements.filter((a) => a.is_unlocked).length,
    [achievements]
  );
  const lockedCount = totalCount - unlockedCount;
  const completionPercentage =
    totalCount > 0 ? (unlockedCount / totalCount) * 100 : 0;
  const isPerfectGame = totalCount > 0 && unlockedCount === totalCount;

  // 4. Filtering & Sorting
  const filteredAndSorted = useMemo(() => {
    return achievements
      .filter((ach) => {
        // Status filter
        if (statusFilter === "unlocked" && !ach.is_unlocked) return false;
        if (statusFilter === "locked" && ach.is_unlocked) return false;

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchTitle = ach.display_name.toLowerCase().includes(q);
          const matchDesc = ach.description
            ? ach.description.toLowerCase().includes(q)
            : false;
          if (!matchTitle && !matchDesc) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "rarity_asc") {
          // Rarest first
          return (
            a.rarity_percentage - b.rarity_percentage ||
            a.display_name.localeCompare(b.display_name)
          );
        }
        if (sortBy === "rarity_desc") {
          // Most common first
          return (
            b.rarity_percentage - a.rarity_percentage ||
            a.display_name.localeCompare(b.display_name)
          );
        }
        if (sortBy === "date") {
          // Most recently unlocked first
          if (a.is_unlocked && !b.is_unlocked) return -1;
          if (!a.is_unlocked && b.is_unlocked) return 1;
          return (b.unlock_time || "").localeCompare(a.unlock_time || "");
        }
        if (sortBy === "alpha") {
          return a.display_name.localeCompare(b.display_name);
        }
        // Default: unlocked first, then rarest
        if (a.is_unlocked !== b.is_unlocked) {
          return a.is_unlocked ? -1 : 1;
        }
        return (
          a.rarity_percentage - b.rarity_percentage ||
          a.display_name.localeCompare(b.display_name)
        );
      });
  }, [achievements, statusFilter, searchQuery, sortBy]);

  const getRarityBadge = (pct: number) => {
    if (pct < 10.0 && pct > 0) {
      return {
        label: "Ultra Rare",
        className:
          "bg-amber-400/15 text-amber-300 border-amber-400/40 shadow-[0_0_10px_rgba(251,191,36,0.15)]",
      };
    }
    if (pct < 20.0 && pct >= 10.0) {
      return {
        label: "Rare",
        className: "bg-purple-500/15 text-purple-300 border-purple-500/40",
      };
    }
    if (pct < 50.0 && pct >= 20.0) {
      return {
        label: "Uncommon",
        className: "bg-cyan-500/15 text-cyan-300 border-cyan-500/40",
      };
    }
    return {
      label: "Common",
      className: "bg-zinc-800 text-zinc-300 border-zinc-700",
    };
  };

  // Empty State: Unsupported Manual / Local Source without cached achievements
  if (!supportsAchievements && achievements.length === 0) {
    return (
      <div className="p-8 bg-black/25 backdrop-blur-md border border-white/10 rounded-2xl text-center space-y-3">
        <div className="w-12 h-12 mx-auto rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400">
          <Trophy className="w-6 h-6" />
        </div>
        <h4 className="text-sm font-bold text-white tracking-wide">
          Achievements Unavailable
        </h4>
        <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
          Achievement synchronization is supported for Steam and Epic Games titles.
          RetroAchievements for ROMs and emulation will be supported in an upcoming update!
        </p>
      </div>
    );
  }

  // Loading State
  if ((isLoading || isSyncing) && achievements.length === 0) {
    return (
      <div className="py-16 flex flex-col items-center justify-center space-y-3 text-zinc-400 text-xs">
        <Loader2 className="w-6 h-6 animate-spin text-white" />
        <span>Loading {storeLabel} achievements...</span>
      </div>
    );
  }

  // Empty State: Game has 0 achievements registered on its store
  if (!isLoading && achievements.length === 0) {
    return (
      <div className="p-8 bg-black/25 backdrop-blur-md border border-white/10 rounded-2xl text-center space-y-3">
        <div className="w-12 h-12 mx-auto rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400">
          <Trophy className="w-6 h-6" />
        </div>
        <h4 className="text-sm font-bold text-white tracking-wide">
          No Store Achievements Registered
        </h4>
        <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
          {storeLabel} does not publish an achievement list for this title{srcLower === "epic" ? " (some older or third-party launcher titles on Epic Games do not use Epic XP Achievements)" : ""}.
        </p>
        <button
          onClick={handleSync}
          disabled={isSyncing}
          className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs transition-all cursor-pointer inline-flex items-center space-x-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
          <span>{isSyncing ? `Checking ${storeLabel}...` : "Check Again"}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-view-fade">
      {/* 1. Header Progress & Perfect Game Banner */}
      <div className="bg-black/20 backdrop-blur-md border border-white/10 rounded-2xl p-5 shadow-xl space-y-4">
        {/* Perfect Game Trophy Banner */}
        {isPerfectGame && (
          <div className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-amber-500/20 via-yellow-500/10 to-amber-500/20 border border-amber-400/40 shadow-[0_0_20px_rgba(251,191,36,0.15)]">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-lg bg-amber-400/20 border border-amber-400/40 flex items-center justify-center text-amber-300">
                <Trophy className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-black tracking-wider uppercase text-amber-300 flex items-center space-x-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                  <span>Perfect Game Achieved</span>
                </div>
                <div className="text-[11px] text-amber-100/80">
                  You have unlocked 100% of all achievements in {game.title}!
                </div>
              </div>
            </div>
            <div className="text-xs font-mono font-bold text-amber-300 px-2.5 py-1 rounded bg-amber-400/20 border border-amber-400/30 shrink-0">
              +250 Hunter Pts
            </div>
          </div>
        )}

        {/* Progress Bar & Header Stats */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <Trophy className="w-4 h-4 text-zinc-300" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Achievements Progress
              </h3>
            </div>
            <div className="text-sm font-bold text-white">
              {unlockedCount} of {totalCount} Unlocked{" "}
              <span className="text-zinc-400 font-normal text-xs">
                ({Math.round(completionPercentage)}%)
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleSync}
              disabled={isSyncing}
              title={`Refresh achievements from ${storeLabel}`}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-zinc-200 hover:text-white transition-all cursor-pointer flex items-center space-x-1.5 disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`}
              />
              <span>{isSyncing ? "Syncing..." : "Refresh"}</span>
            </button>
          </div>
        </div>

        {/* Visual Progress Bar */}
        <div className="w-full bg-zinc-800/80 h-2.5 rounded-full overflow-hidden border border-white/5">
          <div
            className={`h-full transition-all duration-700 rounded-full ${
              isPerfectGame
                ? "bg-gradient-to-r from-amber-400 to-yellow-300 shadow-[0_0_12px_rgba(251,191,36,0.6)]"
                : "bg-white shadow-[0_0_8px_rgba(255,255,255,0.4)]"
            }`}
            style={{ width: `${completionPercentage}%` }}
          />
        </div>

        {syncError && (
          <div className="text-[11px] text-red-400 pt-1">
            Sync note: {syncError}
          </div>
        )}
      </div>

      {/* 2. Controls Toolbar (Status Pills, Sort, Search, Spoilers) */}
      <div className="bg-black/15 backdrop-blur-md border border-white/10 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Status Pills */}
        <div className="flex items-center space-x-1 bg-white/[0.03] p-1 rounded-lg border border-white/5">
          <button
            onClick={() => setStatusFilter("all")}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
              statusFilter === "all"
                ? "bg-white/15 text-white shadow-xs font-bold"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            All ({totalCount})
          </button>
          <button
            onClick={() => setStatusFilter("unlocked")}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
              statusFilter === "unlocked"
                ? "bg-white/15 text-white shadow-xs font-bold"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Unlocked ({unlockedCount})
          </button>
          <button
            onClick={() => setStatusFilter("locked")}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
              statusFilter === "locked"
                ? "bg-white/15 text-white shadow-xs font-bold"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Locked ({lockedCount})
          </button>
        </div>

        {/* Right Side Tools: Search, Sort, Spoilers */}
        <div className="flex items-center space-x-2 flex-1 sm:flex-initial justify-end">
          {/* Search Box */}
          <div className="relative flex-1 sm:w-44">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-full pl-8 pr-3 py-1.5 bg-black/40 border border-white/10 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white/30"
            />
          </div>

          {/* Sort Select */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="bg-black/40 border border-white/10 text-zinc-300 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-white/30 cursor-pointer"
          >
            <option value="default">Default Order</option>
            <option value="rarity_asc">Rarest First</option>
            <option value="rarity_desc">Most Common First</option>
            <option value="date">Unlock Date</option>
            <option value="alpha">Alphabetical</option>
          </select>

          {/* Reveal Spoilers Toggle */}
          <button
            onClick={() => setRevealSpoilers(!revealSpoilers)}
            title={revealSpoilers ? "Hide secret achievements" : "Reveal secret achievements"}
            className={`p-1.5 rounded-lg border text-xs transition-colors cursor-pointer flex items-center space-x-1 ${
              revealSpoilers
                ? "bg-white/15 text-white border-white/30"
                : "bg-black/40 text-zinc-400 hover:text-white border-white/10"
            }`}
          >
            {revealSpoilers ? (
              <EyeOff className="w-3.5 h-3.5" />
            ) : (
              <Eye className="w-3.5 h-3.5" />
            )}
            <span className="hidden md:inline text-[11px]">
              {revealSpoilers ? "Spoilers Shown" : "Reveal Spoilers"}
            </span>
          </button>
        </div>
      </div>

      {/* 3. Achievements List Grid */}
      {filteredAndSorted.length === 0 ? (
        <div className="p-8 text-center text-zinc-400 text-xs">
          No achievements match your active filter or search query.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredAndSorted.map((ach) => {
            const isSecretLocked =
              !ach.is_unlocked && ach.is_secret && !revealSpoilers;
            const rarity = getRarityBadge(ach.rarity_percentage);

            return (
              <div
                key={ach.api_name}
                onClick={() => setSelectedAchievement(ach)}
                className={`flex items-start space-x-3.5 p-3 rounded-xl border transition-all cursor-pointer group select-none ${
                  ach.is_unlocked
                    ? "bg-white/[0.025] border-white/10 hover:border-white/30 hover:bg-white/[0.05]"
                    : "bg-black/20 border-white/5 opacity-75 hover:opacity-100 hover:border-white/20 hover:bg-white/[0.02]"
                }`}
              >
                {/* Achievement Icon */}
                <div className="relative shrink-0">
                  <div
                    className={`w-14 h-14 rounded-xl overflow-hidden bg-black/60 border ${
                      ach.is_unlocked
                        ? "border-white/15 shadow-md"
                        : "border-white/5 grayscale"
                    }`}
                  >
                    <img
                      src={
                        ach.is_unlocked
                          ? ach.icon_url
                          : ach.icon_gray_url || ach.icon_url
                      }
                      alt={ach.display_name}
                      className={`w-full h-full object-cover ${
                        isSecretLocked ? "blur-sm opacity-20 scale-125" : ""
                      }`}
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = "none";
                      }}
                    />
                    {!ach.is_unlocked && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <Lock className="w-4 h-4 text-zinc-400" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Details Text & Rarity */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-start justify-between gap-1.5">
                    <div className="font-bold text-white text-xs leading-snug truncate">
                      {isSecretLocked ? "Hidden Achievement" : ach.display_name}
                    </div>

                    {/* Rarity Badge */}
                    <div
                      className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded border shrink-0 leading-none ${rarity.className}`}
                    >
                      {ach.rarity_percentage > 0
                        ? `${ach.rarity_percentage}%`
                        : "Rare"}
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                    {isSecretLocked
                      ? "Details for this achievement will be revealed once unlocked in-game."
                      : ach.description || "No description available."}
                  </p>

                  {/* Unlock Time or Status */}
                  <div className="flex items-center space-x-2 pt-0.5">
                    {ach.is_unlocked ? (
                      <div className="flex items-center space-x-1 text-[10px] text-zinc-300 font-mono">
                        <CheckCircle2 className="w-3 h-3 text-white" />
                        <span>
                          {ach.unlock_time
                            ? `Unlocked ${ach.unlock_time}`
                            : "Unlocked"}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-1 text-[10px] text-zinc-500 font-mono">
                        <Lock className="w-3 h-3 text-zinc-500" />
                        <span>Locked</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Achievement Detail Modal */}
      {selectedAchievement && (
        <AchievementDetailModal
          achievement={selectedAchievement}
          gameTitle={game.title}
          gameCover={game.cover_image}
          onClose={() => setSelectedAchievement(null)}
        />
      )}
    </div>
  );
};
