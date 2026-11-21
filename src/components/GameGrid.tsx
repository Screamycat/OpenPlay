import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Game } from "../types/game";
import { resolveGridCoverSrc, isVideoSrc, getStaticFallbackCover } from "../utils/image";
import { Star, Cloud, Loader2, MonitorSmartphone } from "lucide-react";
import { PlatformIcon } from "./icons/PlatformIcons";
import { GroupByOption } from "./TopNav";
import { getEffectiveCompletionStatus } from "../utils/completionStatus";
import { formatReleaseYear, parseLastPlayedMs } from "../utils/date";

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
  achievementSummaryMap?: Record<string, { total_achievements: number; unlocked_achievements: number; is_perfect: boolean }>;
  statusFilter?: "all" | "installed" | "uninstalled";
}

interface GameGroup {
  name: string;
  games: Game[];
}

// Keep first ~5 rows (7 cols x 5 rows = 35 cards) eagerly rendered above the initial fold
const ABOVE_FOLD_CARD_COUNT = 35;

function getGroupKey(
  game: Game,
  groupBy: GroupByOption,
  summary?: { total_achievements: number; unlocked_achievements: number; is_perfect: boolean }
): string {
  switch (groupBy) {
    case "source":
      return game.source || "Manual";
    case "status": {
      const hasInstalled = game.is_installed || (game.sibling_games && game.sibling_games.some((s) => s.is_installed));
      return hasInstalled ? "Installed" : "Uninstalled";
    }
    case "first_letter": {
      const char = (game.sorting_title || game.title || "#")[0].toUpperCase();
      return /[A-Z]/.test(char) ? char : "#";
    }
    case "completion_status":
      return getEffectiveCompletionStatus(game, summary).status;
    default:
      return "";
  }
}

function buildGameGroups(
  games: Game[],
  groupBy: GroupByOption,
  summaryMap?: Record<string, { total_achievements: number; unlocked_achievements: number; is_perfect: boolean }>
): GameGroup[] {
  if (groupBy === "none") {
    return [{ name: "", games }];
  }

  const map = new Map<string, Game[]>();
  for (const game of games) {
    const key = getGroupKey(game, groupBy, summaryMap?.[game.id]);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(game);
  }

  if (groupBy === "completion_status") {
    const order = ["Mastered", "Hunting", "Beaten", "In Progress", "Forgotten", "Untouched"];
    return Array.from(map.entries())
      .map(([name, gList]) => ({ name, games: gList }))
      .sort((a, b) => {
        const ia = order.indexOf(a.name);
        const ib = order.indexOf(b.name);
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
        return a.name.localeCompare(b.name);
      });
  }

  return Array.from(map.entries())
    .map(([name, gList]) => ({ name, games: gList }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

interface GameCardProps {
  game: Game;
  cardWidth: number;
  isSelected: boolean;
  isLaunching: boolean;
  isRunning: boolean;
  isFlashActive: boolean;
  isBelowFold: boolean;
  statusFilter?: "all" | "installed" | "uninstalled";
  onSelect: (game: Game) => void;
  onDoubleClick: (game: Game) => void;
  onContextMenu: (game: Game, x: number, y: number) => void;
  registerVideoCard?: (cardEl: HTMLDivElement, videoEl: HTMLVideoElement | null) => void;
}

const GameCard = React.memo<GameCardProps>(
  ({
    game,
    cardWidth,
    isSelected,
    isLaunching,
    isRunning,
    isFlashActive,
    isBelowFold,
    statusFilter = "all",
    onSelect,
    onDoubleClick,
    onContextMenu,
    registerVideoCard,
  }) => {
    const cardRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const cardHeight = Math.round(cardWidth * 1.5);

    const hasInstalled = game.is_installed || (game.sibling_games && game.sibling_games.some((s) => s.is_installed));
    const hasUninstalled = !game.is_installed || (game.sibling_games && game.sibling_games.some((s) => !s.is_installed));
    const isCardUninstalled = statusFilter === "uninstalled" ? hasUninstalled : !hasInstalled;

    const isOtherDevice = useMemo(() => {
      const candidates = game.sibling_games?.length ? [game, ...game.sibling_games] : [game];
      let latest = game;
      let latestMs = parseLastPlayedMs(game.last_played);
      for (const candidate of candidates) {
        const ms = parseLastPlayedMs(candidate.last_played);
        if (ms > latestMs || (ms === latestMs && candidate.played_on_other_device && !latest.played_on_other_device)) {
          latest = candidate;
          latestMs = ms;
        }
      }
      return Boolean(latest.played_on_other_device);
    }, [game]);

    const [imgError, setImgError] = useState(false);
    const [videoFailed, setVideoFailed] = useState(false);

    const coverSrc = resolveGridCoverSrc(
      game.cover_image,
      cardWidth > 220 ? 720 : 540
    );
    const isVideoCover = Boolean(coverSrc && isVideoSrc(coverSrc));

    const staticPosterSrc = useMemo(
      () => (isVideoCover ? getStaticFallbackCover(coverSrc) : undefined),
      [isVideoCover, coverSrc]
    );
    const [staticSrc, setStaticSrc] = useState<string | undefined>(staticPosterSrc);

    useEffect(() => {
      setImgError(false);
      setVideoFailed(false);
      setStaticSrc(staticPosterSrc);
    }, [coverSrc, staticPosterSrc]);

    // Shared IntersectionObserver (with viewport root) to pause offscreen <video> covers
    // and resume only visible cards, preventing GPU hardware decoder exhaustion.
    useEffect(() => {
      if (!isVideoCover || videoFailed) return;
      const cardEl = cardRef.current;
      const videoEl = videoRef.current;
      if (!cardEl || !videoEl) return;

      registerVideoCard?.(cardEl, videoEl);

      return () => {
        registerVideoCard?.(cardEl, null);
      };
    }, [isVideoCover, videoFailed, registerVideoCard]);

    return (
      <div
        ref={cardRef}
        data-theme-part="game-card"
        data-gamepad-card-id={game.id}
        data-gamepad-atomic="true"
        onClick={() => onSelect(game)}
        onDoubleClick={() => onDoubleClick(game)}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onContextMenu(game, e.clientX, e.clientY);
        }}
        style={
          isBelowFold && !isVideoCover
            ? {
                minHeight: `${cardHeight}px`,
                containIntrinsicSize: `auto ${cardWidth}px auto ${cardHeight}px`,
                borderRadius: "var(--theme-card-radius, 16px)",
                aspectRatio: "var(--theme-card-aspect, 2 / 3)",
              }
            : {
                minHeight: `${cardHeight}px`,
                borderRadius: "var(--theme-card-radius, 16px)",
                aspectRatio: "var(--theme-card-aspect, 2 / 3)",
              }
        }
        className={`group relative overflow-hidden cursor-pointer transition-[box-shadow,opacity,transform] duration-200 bg-black/30 border-0 ${
          isBelowFold && !isVideoCover ? "game-card-deferred" : "game-card-isolated"
        } ${
          isLaunching
            ? "ring-2 ring-white shadow-[0_0_25px_rgba(255,255,255,0.7)] z-20 scale-[0.98]"
            : isRunning
            ? "ring-2 ring-emerald-500/70 shadow-[0_0_20px_rgba(16,185,129,0.35)] z-10"
            : isSelected
            ? "ring-2 ring-white shadow-2xl shadow-black/90 z-10"
            : "hover:ring-1 hover:ring-white/40 hover:shadow-2xl hover:shadow-black/70"
        } ${isCardUninstalled ? "opacity-50 hover:opacity-100" : ""}`}
      >
        {/* Playnite FusionX Corner-to-Corner Card Shine Overlay */}
        <div className="card-shine-container">
          <div className="card-shine-beam" />
        </div>

        {/* Double-Click Launch Flash Animation Overlay */}
        {isFlashActive && (
          <div className="absolute inset-0 bg-white/50 pointer-events-none rounded-lg z-30 animate-launch-flash" />
        )}

        {/* Cover Art Image or Hardware-Decoded WebM/MP4 Video */}
        {coverSrc && !imgError ? (
          isVideoCover && !videoFailed ? (
            <video
              ref={(el) => {
                videoRef.current = el;
                if (el) {
                  el.defaultMuted = true;
                  el.muted = true;
                  if (!isBelowFold && el.paused) {
                    el.play().catch(() => {});
                  }
                }
              }}
              src={coverSrc}
              poster={staticSrc}
              autoPlay={!isBelowFold}
              preload={isBelowFold ? "none" : "metadata"}
              loop
              muted
              playsInline
              width={600}
              height={900}
              onLoadedData={(e) => {
                const el = e.currentTarget;
                el.defaultMuted = true;
                el.muted = true;
                if (el.dataset.inView !== "false" && el.paused) {
                  el.play().catch(() => {});
                }
              }}
              onError={(e) => {
                const mediaErr = e.currentTarget.error;
                // Ignore MEDIA_ERR_ABORTED (code 1)
                if (!mediaErr || mediaErr.code === 1) return;
                setVideoFailed(true);
              }}
              className={`w-full h-full object-cover pointer-events-none ${
                isCardUninstalled ? "grayscale brightness-75" : ""
              }`}
            />
          ) : (
            <img
              src={
                videoFailed
                  ? (game.cover_image && !isVideoSrc(game.cover_image)
                      ? game.cover_image
                      : game.cover_image?.replace(/\.webm$/i, ".webp") || staticSrc || coverSrc)
                  : (isVideoCover ? (staticSrc || game.cover_image || coverSrc) : coverSrc)
              }
              alt={game.title}
              width={600}
              height={900}
              loading={isBelowFold ? "lazy" : "eager"}
              decoding="async"
              className={`w-full h-full object-cover ${
                isCardUninstalled ? "grayscale brightness-75" : ""
              }`}
              onError={(e) => {
                const target = e.currentTarget;
                if (target.src.includes(".webp")) {
                  target.src = target.src.replace(/\.webp$/i, ".png");
                  return;
                }
                if (target.src.includes(".png") && !target.src.includes(".jpg")) {
                  target.src = target.src.replace(/\.png$/i, ".jpg");
                  return;
                }
                setImgError(true);
              }}
            />
          )
        ) : (
          /* Fallback only if no cover artwork */
          <div className="absolute inset-0 flex flex-col justify-center items-center text-center p-3 bg-gradient-to-t from-black/80 to-black/40">
            <PlatformIcon platform={game.platforms?.[0] || game.source} className="w-8 h-8 text-zinc-500 mb-2" />
            <span className="text-xs font-bold text-zinc-100 line-clamp-2 leading-tight">
              {game.title}
            </span>
            {formatReleaseYear(game.release_date) && (
              <span className="text-[10px] text-zinc-400 mt-1">
                {formatReleaseYear(game.release_date)}
              </span>
            )}
          </div>
        )}

        {/* Active Launching Indicator on Card */}
        {isLaunching && (
          <div className="absolute inset-x-2 bottom-2.5 py-1 px-2 rounded-md bg-black/95 border border-white/20 flex items-center justify-center space-x-1.5 shadow-xl z-30 animate-pulse">
            <Loader2 className="w-3 h-3 text-white animate-spin" />
            <span className="text-[10px] font-black uppercase tracking-wider text-white">
              Launching...
            </span>
          </div>
        )}

        {/* Active Running Indicator on Card */}
        {isRunning && !isLaunching && (
          <div className="absolute inset-x-2 bottom-2.5 py-1 px-2 rounded-md bg-emerald-950/95 border border-emerald-500/40 flex items-center justify-center space-x-1.5 shadow-xl z-30">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-200">
              Running
            </span>
          </div>
        )}

        {/* Uninstalled Cloud & Other-Device Indicators */}
        {(isCardUninstalled || isOtherDevice) && (
          <div className="absolute top-1.5 left-1.5 flex items-center gap-1 z-10">
            {isCardUninstalled && (
              <div
                title="Not installed (Cloud Library)"
                className="bg-[#0a0c12]/90 p-1 rounded-full text-zinc-400 shadow-md border border-white/10"
              >
                <Cloud className="w-3 h-3" />
              </div>
            )}
            {isOtherDevice && (
              <div
                title="Last played on another device"
                className="bg-[#0a0c12]/90 p-1 rounded-full text-zinc-300 shadow-md border border-white/10"
              >
                <MonitorSmartphone className="w-3 h-3" />
              </div>
            )}
          </div>
        )}

        {/* Favorite Star Badge */}
        {game.is_favorite && (
          <div className="absolute top-1.5 right-1.5 bg-[#0a0c12]/90 p-1 rounded-full shadow-md text-white z-10 border border-white/10">
            <Star className="w-3 h-3 fill-white" />
          </div>
        )}
      </div>
    );
  }
);

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
  achievementSummaryMap,
  statusFilter = "all",
}) => {
  const [justLaunchedId, setJustLaunchedId] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollIdleTimerRef = useRef<number | null>(null);

  // Shared IntersectionObserver to pause any <video> covers (including above-the-fold ones) when scrolled out of view
  const videoMapRef = useRef<Map<Element, HTMLVideoElement>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;

    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const video = videoMapRef.current.get(entry.target);
          if (!video) continue;
          if (entry.isIntersecting) {
            video.dataset.inView = "true";
            video.defaultMuted = true;
            video.muted = true;
            if (video.paused) {
              video.play().catch(() => {});
            }
          } else {
            video.dataset.inView = "false";
            if (!video.paused) {
              video.pause();
            }
          }
        }
      },
      {
        root: null,
        rootMargin: "250px 0px",
      }
    );

    observerRef.current = obs;
    for (const el of videoMapRef.current.keys()) {
      obs.observe(el);
    }

    return () => {
      obs.disconnect();
      observerRef.current = null;
    };
  }, []);

  const registerVideoCard = useCallback(
    (cardEl: HTMLDivElement, videoEl: HTMLVideoElement | null) => {
      if (videoEl) {
        videoMapRef.current.set(cardEl, videoEl);
        observerRef.current?.observe(cardEl);
      } else {
        videoMapRef.current.delete(cardEl);
        observerRef.current?.unobserve(cardEl);
      }
    },
    []
  );

  // Keep latest handlers in a ref so memoized GameCard callbacks never change identity
  const handlersRef = useRef({
    onSelectGame,
    onLaunchGame,
    onContextMenu,
    runningGameIds,
  });
  handlersRef.current = {
    onSelectGame,
    onLaunchGame,
    onContextMenu,
    runningGameIds,
  };

  const handleSelectStable = useCallback((game: Game) => {
    handlersRef.current.onSelectGame(game);
  }, []);

  const handleDoubleClickStable = useCallback((game: Game) => {
    if (handlersRef.current.runningGameIds.includes(game.id)) {
      handlersRef.current.onSelectGame(game);
      return;
    }
    setJustLaunchedId(game.id);
    window.setTimeout(() => {
      setJustLaunchedId((curr) => (curr === game.id ? null : curr));
    }, 600);
    handlersRef.current.onSelectGame(game);
    handlersRef.current.onLaunchGame(game);
  }, []);

  const handleContextMenuStable = useCallback(
    (game: Game, x: number, y: number) => {
      handlersRef.current.onSelectGame(game);
      handlersRef.current.onContextMenu?.(game, x, y);
    },
    []
  );

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (el.dataset.scrolling !== "true") {
      el.dataset.scrolling = "true";
    }
    if (scrollIdleTimerRef.current !== null) {
      window.clearTimeout(scrollIdleTimerRef.current);
    }
    scrollIdleTimerRef.current = window.setTimeout(() => {
      if (scrollContainerRef.current) {
        delete scrollContainerRef.current.dataset.scrolling;
      }
      scrollIdleTimerRef.current = null;
    }, 120);
  }, []);

  useEffect(() => {
    return () => {
      if (scrollIdleTimerRef.current !== null) {
        window.clearTimeout(scrollIdleTimerRef.current);
      }
    };
  }, []);

  const runningSet = useMemo(() => new Set(runningGameIds), [runningGameIds]);
  const groups = useMemo(
    () => buildGameGroups(games, groupBy, achievementSummaryMap),
    [games, groupBy, achievementSummaryMap]
  );

  let flatIndex = 0;

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      data-theme-part="game-grid-container"
      data-gamepad-zone="game-grid"
      data-gamepad-scroll="game-grid"
      className="game-grid-scroll flex-1 overflow-y-auto p-3 bg-transparent select-none space-y-4"
    >
      {groups.map((group) => (
        <div key={group.name || "all"} className="space-y-2.5">
          {/* Section Group Header (shown when grouping is active) */}
          {group.name && (
            <div className="sticky top-0 z-20 -mx-3 mb-1.5 select-none pointer-events-none">
              <div
                style={{
                  background:
                    "linear-gradient(to right, rgba(16, 16, 20, 0.95) 0%, rgba(16, 16, 20, 0.8) 60%, transparent calc(100% - 50px))",
                }}
                className="px-4 py-2 flex items-center justify-between border-0 shadow-none"
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
            data-theme-part="game-grid"
            className="grid gap-2.5 justify-center"
            style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`,
            }}
          >
            {group.games.map((game) => {
              const currentIdx = flatIndex++;
              return (
                <GameCard
                  key={game.id}
                  game={game}
                  cardWidth={cardWidth}
                  isSelected={game.id === selectedGameId}
                  isLaunching={isLaunchingId === game.id}
                  isRunning={runningSet.has(game.id)}
                  isFlashActive={justLaunchedId === game.id}
                  isBelowFold={currentIdx >= ABOVE_FOLD_CARD_COUNT}
                  statusFilter={statusFilter}
                  onSelect={handleSelectStable}
                  onDoubleClick={handleDoubleClickStable}
                  onContextMenu={handleContextMenuStable}
                  registerVideoCard={registerVideoCard}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
