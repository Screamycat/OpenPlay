import React, { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowLeft,
  Play,
  Download,
  Star,
  MoreHorizontal,
  Save,
  Clock,
  HardDrive,
  Trophy,
  Film,
  Newspaper,
  Info,
  Calendar,
  Building2,
  User,
  Tag,
  Layers,
  Loader2,
  Users,
  ShieldAlert,
  Crown,
  ShieldCheck,
  Target,
  Flame,
  CircleDot,
  Sparkles,
  FolderOpen,
} from "lucide-react";
import { Game } from "../../types/game";
import {
  formatFileSize,
  formatPlaytime,
  isVideoSrc,
  resolveGridCoverSrc,
  resolveImageSrc,
} from "../../utils/image";
import { formatLastPlayed, formatReleaseYear } from "../../utils/date";
import {
  ALL_COMPLETION_STATUSES,
  CompletionStatus,
  getEffectiveCompletionStatus,
} from "../../utils/completionStatus";
import { SteamDescription } from "../SteamDescription";
import { HowLongToBeatWidget } from "../HowLongToBeatWidget";
import { AchievementsQuickWidget } from "../AchievementsQuickWidget";
import { AchievementsTab } from "../AchievementsTab";
import { VideoPlayer } from "../VideoPlayer";
import { NewsArticleModal, SteamNewsItem } from "../NewsArticleModal";
import { PlatformIcon } from "../icons/PlatformIcons";
import { UltrawideMediaStage } from "./UltrawideMediaStage";
import { useGamepad } from "../../contexts/GamepadContext";
import { ControllerGlyph } from "../gamepad/ControllerGlyph";
import {
  playBack,
  playConfirm,
  playLaunch,
  playTabSwitch,
} from "../../utils/consoleSounds";

type DetailTab = "overview" | "achievements" | "trailers" | "news";

interface AchievementSummaryLite {
  total_achievements: number;
  unlocked_achievements: number;
  is_perfect: boolean;
}

interface ConsoleGameDetailsProps {
  game: Game;
  runningGameId: string | null;
  launchingGameId: string | null;
  achievementSummary?: AchievementSummaryLite | null;
  lastPlayedDateFormat?: "date_and_time" | "date_only";
  onBack: () => void;
  onLaunchGame: (game: Game) => void;
  onInstallGame: (game: Game) => void;
  onToggleFavorite: (game: Game) => void;
  onUpdateGame?: (updated: Game) => void;
  onOpenOptions: (game: Game) => void;
  onOpenSaveManager: (game: Game) => void;
  onSelectSiblingGame?: (sibling: Game) => void;
  onTrailerActiveChange?: (active: boolean) => void;
  onRequestHydrateGame?: (gameId: string, siblingIds?: string[]) => void;
  isOverlayActive: boolean;
}

const TAB_ORDER: DetailTab[] = ["overview", "achievements", "trailers", "news"];

function renderStatusIcon(iconName: string, className = "w-3.5 h-3.5") {
  switch (iconName) {
    case "Crown":
      return <Crown className={className} />;
    case "ShieldCheck":
      return <ShieldCheck className={className} />;
    case "Target":
      return <Target className={className} />;
    case "Flame":
      return <Flame className={className} />;
    case "Clock":
      return <Clock className={className} />;
    case "Sparkles":
      return <Sparkles className={className} />;
    default:
      return <CircleDot className={className} />;
  }
}

export const ConsoleGameDetails: React.FC<ConsoleGameDetailsProps> = ({
  game,
  runningGameId,
  launchingGameId,
  achievementSummary,
  lastPlayedDateFormat = "date_and_time",
  onBack,
  onLaunchGame,
  onInstallGame,
  onToggleFavorite,
  onUpdateGame,
  onOpenOptions,
  onOpenSaveManager,
  onSelectSiblingGame,
  onTrailerActiveChange,
  onRequestHydrateGame,
  isOverlayActive,
}) => {
  const { glyphProfile, isControllerActive, customBindings, nintendoSwap } = useGamepad();
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
  const [newsItems, setNewsItems] = useState<SteamNewsItem[]>([]);
  const [isLoadingNews, setIsLoadingNews] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<SteamNewsItem | null>(null);
  const [activeTrailerIdx, setActiveTrailerIdx] = useState(0);
  const [playerCount, setPlayerCount] = useState<number | null>(null);
  const [liveAchSummary, setLiveAchSummary] = useState<AchievementSummaryLite | null>(
    achievementSummary || null
  );
  const [isLoadingHltb, setIsLoadingHltb] = useState(false);
  const [hltbData, setHltbData] = useState<{
    main?: number;
    extra?: number;
    completionist?: number;
  }>({
    main: game.hltb_main,
    extra: game.hltb_extra,
    completionist: game.hltb_completionist,
  });
  const scrollPaneRef = useRef<HTMLDivElement>(null);

  // Notify parent when trailer tab is active so ambient console music pauses automatically
  useEffect(() => {
    const trailerActive = activeTab === "trailers" && (game.trailers?.length || 0) > 0;
    onTrailerActiveChange?.(trailerActive);
    return () => onTrailerActiveChange?.(false);
  }, [activeTab, game.trailers?.length, onTrailerActiveChange]);

  // Reset & load Desktop-parity live metadata (Hydration + Live Players + Achievements + HLTB)
  useEffect(() => {
    setActiveTab("overview");
    setActiveTrailerIdx(0);
    setSelectedArticle(null);
    setPlayerCount(null);
    setLiveAchSummary(achievementSummary || null);
    setHltbData({
      main: game.hltb_main,
      extra: game.hltb_extra,
      completionist: game.hltb_completionist,
    });
    if (scrollPaneRef.current) scrollPaneRef.current.scrollTop = 0;

    if (onRequestHydrateGame) {
      onRequestHydrateGame(
        game.id,
        game.sibling_games?.map((s) => s.id)
      );
    }

    let cancelled = false;
    const steamAppId =
      game.source.toLowerCase() === "steam"
        ? game.source_id || null
        : game.sibling_games?.find((s) => s.source.toLowerCase() === "steam")?.source_id || null;

    invoke<any>("get_game_achievement_summary", { gameId: game.id })
      .then((res) => {
        if (!cancelled && res) {
          setLiveAchSummary({
            total_achievements: res.total_achievements,
            unlocked_achievements: res.unlocked_achievements,
            is_perfect: res.is_perfect,
          });
        }
      })
      .catch(() => {});

    invoke<number>("get_game_current_players", {
      title: game.title,
      appid: steamAppId,
    })
      .then((count) => {
        if (!cancelled && typeof count === "number" && count > 0) {
          setPlayerCount(count);
        }
      })
      .catch(() => {});

    if (game.hltb_main === undefined || game.hltb_main === null) {
      setIsLoadingHltb(true);
      invoke<any>("get_game_hltb", { gameId: game.id, title: game.title })
        .then((res) => {
          if (!cancelled && res) {
            setHltbData({
              main: res.main_story_hours,
              extra: res.main_extra_hours,
              completionist: res.completionist_hours,
            });
          }
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setIsLoadingHltb(false);
        });
    } else {
      setIsLoadingHltb(false);
    }

    return () => {
      cancelled = true;
    };
  }, [game.id, onRequestHydrateGame]);

  // Keep HLTB synced if game prop updates
  useEffect(() => {
    setHltbData({
      main: game.hltb_main,
      extra: game.hltb_extra,
      completionist: game.hltb_completionist,
    });
  }, [game.hltb_main, game.hltb_extra, game.hltb_completionist]);

  // Fetch news lazily when News tab is opened (same parameter contract as Desktop GameDetails)
  useEffect(() => {
    if (activeTab !== "news") return;
    let cancelled = false;
    const steamAppId =
      game.source.toLowerCase() === "steam"
        ? game.source_id || null
        : game.sibling_games?.find((s) => s.source.toLowerCase() === "steam")?.source_id || null;

    const loadNews = async () => {
      setIsLoadingNews(true);
      try {
        const items = await invoke<SteamNewsItem[]>("get_game_news", {
          gameId: game.id,
          title: game.title,
          appid: steamAppId ? String(steamAppId) : null,
        });
        if (!cancelled) {
          setNewsItems(Array.isArray(items) ? items : []);
        }
      } catch {
        if (!cancelled) setNewsItems([]);
      } finally {
        if (!cancelled) setIsLoadingNews(false);
      }
    };
    loadNews();
    return () => {
      cancelled = true;
    };
  }, [activeTab, game.id, game.source, game.source_id, game.title]);

  const siblingVersions = useMemo(() => {
    if (!game.sibling_games || game.sibling_games.length === 0) return [game];
    const map = new Map<string, Game>();
    map.set(game.id, game);
    for (const s of game.sibling_games) {
      map.set(s.id, s);
    }
    return Array.from(map.values());
  }, [game]);

  const resolvedAchSummary = liveAchSummary || achievementSummary || null;
  const effectiveStatus = useMemo(
    () => getEffectiveCompletionStatus(game, resolvedAchSummary),
    [game, resolvedAchSummary]
  );

  const isRunning = runningGameId === game.id;
  const isLaunching = launchingGameId === game.id;

  const triggerPrimaryPlay = () => {
    if (isRunning || isLaunching) return;
    playLaunch();
    if (game.is_installed) {
      onLaunchGame(game);
    } else {
      onInstallGame(game);
    }
  };

  const handleCycleCompletionStatus = () => {
    if (!onUpdateGame) return;
    const raw = (game.completion_status || "Auto") as CompletionStatus;
    const idx = ALL_COMPLETION_STATUSES.indexOf(raw);
    const next = ALL_COMPLETION_STATUSES[(idx + 1) % ALL_COMPLETION_STATUSES.length];
    playTabSwitch();
    onUpdateGame({
      ...game,
      completion_status: next,
    });
  };

  const cycleTab = (dir: -1 | 1) => {
    const idx = TAB_ORDER.indexOf(activeTab);
    const next = TAB_ORDER[(idx + dir + TAB_ORDER.length) % TAB_ORDER.length];
    playTabSwitch();
    setActiveTab(next);
    if (scrollPaneRef.current) scrollPaneRef.current.scrollTop = 0;
  };

  useEffect(() => {
    if (isOverlayActive || selectedArticle) return;

    const handleConsoleAction = (e: Event) => {
      const detail = (e as CustomEvent).detail as { action: string } | undefined;
      if (!detail) return;
      switch (detail.action) {
        case "back":
          playBack();
          onBack();
          break;
        case "prev_tab":
          cycleTab(-1);
          break;
        case "next_tab":
          cycleTab(1);
          break;
        case "play":
          triggerPrimaryPlay();
          break;
        case "options":
          playConfirm();
          onOpenOptions(game);
          break;
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isOverlayActive || selectedArticle) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }
      if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        playBack();
        onBack();
      } else if (e.key === "q" || e.key === "Q") {
        e.preventDefault();
        cycleTab(-1);
      } else if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        cycleTab(1);
      }
    };

    window.addEventListener("openplay-console-action", handleConsoleAction);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("openplay-console-action", handleConsoleAction);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOverlayActive, selectedArticle, activeTab, game, isRunning, isLaunching]);

  const heroBgRaw =
    game.background_image || game.screenshots?.[0] || game.cover_image;
  const heroBgSrc = resolveImageSrc(heroBgRaw);
  const heroBgIsVideo = isVideoSrc(heroBgRaw);
  const coverSrc = resolveGridCoverSrc(game.cover_image, 600);
  const coverIsVideo = isVideoSrc(game.cover_image);
  const logoSrc = resolveImageSrc(game.logo_image);
  const logoIsVideo = isVideoSrc(game.logo_image);

  const trailers = game.trailers || [];
  const activeTrailer = trailers[activeTrailerIdx] || null;
  const releaseYear = formatReleaseYear(game.release_date);
  const lastPlayedLabel = formatLastPlayed(game.last_played, lastPlayedDateFormat);

  return (
    <div
      data-console-part="details"
      data-gamepad-zone="console-details"
      className="fixed inset-0 z-25 bg-[#05070e] text-white overflow-hidden select-none flex flex-col animate-in fade-in duration-200"
    >
      {/* Full-Bleed Hero Artwork (Edge-to-edge for 32:9 & 16:9) */}
      <div className="console-diagonal-backdrop absolute inset-0 pointer-events-none overflow-hidden">
        {heroBgSrc ? (
          <UltrawideMediaStage
            key={heroBgSrc}
            src={heroBgSrc}
            isVideo={heroBgIsVideo}
            loop
            muted
            centerFilter="blur(var(--console-bg-blur, 6px)) saturate(1.1)"
          />
        ) : (
          <div className="console-ambient-mesh absolute inset-0" />
        )}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(5,7,14,0.68) 0%, rgba(5,7,14,0.82) 38%, rgba(5,7,14,0.97) 100%)",
          }}
        />
      </div>

      {/* Tighter Centered Reading Layout (Balanced on both 16:9 TVs and 32:9 Odyssey G9 Neo) */}
      <div
        className="relative z-10 flex-1 min-h-0 flex flex-col w-full mx-auto px-6 sm:px-10 md:px-12 pt-5 pb-4 max-w-[1440px]"
      >
        {/* Top Navigation Row */}
        <header className="flex items-center justify-between gap-4 pb-4 shrink-0">
          <button
            type="button"
            data-gamepad-focusable="true"
            onClick={() => {
              playBack();
              onBack();
            }}
            className="flex items-center space-x-2 px-4 py-2 rounded-full bg-white/[0.08] hover:bg-white/[0.16] border border-white/10 backdrop-blur-xl text-xs font-semibold text-white cursor-pointer transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Library</span>
          </button>

          {/* Tab Switcher (LB / RB) */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/45 border border-white/10 backdrop-blur-xl">
            {isControllerActive && (
              <span className="px-1 opacity-70">
                <ControllerGlyph
                  button="LB"
                  profile={glyphProfile}
                  nintendoSwap={nintendoSwap}
                  size="xs"
                />
              </span>
            )}
            {(
              [
                { id: "overview", label: "Overview", icon: Info },
                { id: "achievements", label: "Achievements", icon: Trophy },
                { id: "trailers", label: `Trailers (${trailers.length})`, icon: Film },
                { id: "news", label: "News", icon: Newspaper },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  data-gamepad-focusable="true"
                  onClick={() => {
                    playTabSwitch();
                    setActiveTab(tab.id);
                  }}
                  className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? "bg-white text-slate-950 shadow-md"
                      : "text-white/65 hover:text-white hover:bg-white/10"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
            {isControllerActive && (
              <span className="px-1 opacity-70">
                <ControllerGlyph
                  button="RB"
                  profile={glyphProfile}
                  nintendoSwap={nintendoSwap}
                  size="xs"
                />
              </span>
            )}
          </div>

          <button
            type="button"
            data-gamepad-focusable="true"
            onClick={() => {
              playConfirm();
              onOpenOptions(game);
            }}
            className="flex items-center space-x-2 px-4 py-2 rounded-full bg-white/[0.08] hover:bg-white/[0.16] border border-white/10 backdrop-blur-xl text-xs font-semibold text-white cursor-pointer transition-all"
          >
            <MoreHorizontal className="w-4 h-4" />
            <span>Options</span>
          </button>
        </header>

        {/* Scrollable Details Body */}
        <div
          ref={scrollPaneRef}
          data-gamepad-scroll="true"
          className="flex-1 min-h-0 overflow-y-auto pr-2 space-y-6 pb-6"
        >
          {/* HERO SUMMARY HEADER */}
          <section className="flex flex-col md:flex-row items-start md:items-end gap-7 pt-1">
            {/* 2:3 Steam Vertical Cover Poster (Animated supported) */}
            <div
              className="w-40 sm:w-48 aspect-[2/3] shrink-0 overflow-hidden bg-zinc-900 border border-white/15 shadow-2xl"
              style={{ borderRadius: "var(--console-card-radius, 14px)" }}
            >
              {coverSrc ? (
                coverIsVideo ? (
                  <video
                    src={coverSrc}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className={`w-full h-full object-cover ${
                      !game.is_installed ? "grayscale-[40%] opacity-80" : ""
                    }`}
                  />
                ) : (
                  <img
                    src={coverSrc}
                    alt={game.title}
                    className={`w-full h-full object-cover ${
                      !game.is_installed ? "grayscale-[40%] opacity-80" : ""
                    }`}
                  />
                )
              ) : (
                <div className="w-full h-full flex items-center justify-center p-4 bg-slate-900 text-center text-sm font-bold">
                  {game.title}
                </div>
              )}
            </div>

            {/* Identity + Metadata Strip + Primary Actions */}
            <div className="flex-1 min-w-0 space-y-3.5">
              {logoSrc ? (
                logoIsVideo ? (
                  <video
                    src={logoSrc}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="max-h-[15vh] max-w-[460px] w-auto object-contain object-left drop-shadow-[0_10px_28px_rgba(0,0,0,0.85)]"
                  />
                ) : (
                  <img
                    src={logoSrc}
                    alt={game.title}
                    className="max-h-[15vh] max-w-[460px] w-auto object-contain object-left drop-shadow-[0_10px_28px_rgba(0,0,0,0.85)]"
                  />
                )
              ) : (
                <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white">
                  {game.title}
                </h1>
              )}

              {/* Desktop-Parity Inline Scores, Year, Platforms & Live Players */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-white/85">
                {game.user_rating ? (
                  <span className="flex items-center gap-1 text-amber-300" title="User Score">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    <span>{game.user_rating}</span>
                    <span className="text-[10px] text-white/45 font-normal">User</span>
                  </span>
                ) : null}
                {game.community_score ? (
                  <span className="flex items-center gap-1 text-sky-300" title="Community Score">
                    <Star className="w-3.5 h-3.5 fill-sky-400 text-sky-400" />
                    <span>{game.community_score}</span>
                    <span className="text-[10px] text-white/45 font-normal">Community</span>
                  </span>
                ) : null}
                {game.critic_score ? (
                  <span className="flex items-center gap-1 text-emerald-300" title="Critic Score">
                    <Star className="w-3.5 h-3.5 fill-emerald-400 text-emerald-400" />
                    <span>{game.critic_score}</span>
                    <span className="text-[10px] text-white/45 font-normal">Critic</span>
                  </span>
                ) : null}
                {releaseYear && (
                  <span className="text-white/75 font-mono">{releaseYear}</span>
                )}
                {playerCount !== null && playerCount > 0 && (
                  <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/25 text-emerald-300 text-[11px]">
                    <Users className="w-3 h-3" />
                    <span>{playerCount.toLocaleString()} playing now</span>
                  </span>
                )}
                {game.platforms && game.platforms.length > 0 && (
                  <span className="text-[11px] text-white/55 uppercase tracking-wider truncate max-w-md">
                    {game.platforms.slice(0, 4).join(" • ")}
                  </span>
                )}
              </div>

              {/* Multi-Platform Sibling Switcher */}
              {siblingVersions.length > 1 && onSelectSiblingGame && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] uppercase tracking-wider text-white/45 flex items-center gap-1 mr-1">
                    <Layers className="w-3.5 h-3.5" />
                    Version:
                  </span>
                  {siblingVersions.map((ver) => {
                    const active = ver.id === game.id;
                    return (
                      <button
                        key={ver.id}
                        type="button"
                        data-gamepad-focusable="true"
                        onClick={() => {
                          if (!active) {
                            playTabSwitch();
                            onSelectSiblingGame(ver);
                          }
                        }}
                        className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                          active
                            ? "bg-white text-slate-950 border-white"
                            : "bg-white/8 text-white/75 border-white/15 hover:bg-white/15"
                        }`}
                      >
                        <PlatformIcon platform={ver.source} className="w-3.5 h-3.5" />
                        <span>{ver.source}</span>
                        {ver.is_installed && <span className="opacity-75">• Installed</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  data-gamepad-focusable="true"
                  data-console-default-focus="true"
                  onClick={triggerPrimaryPlay}
                  disabled={isRunning || isLaunching}
                  className="px-8 py-3.5 rounded-full font-extrabold text-sm flex items-center space-x-2.5 transition-all cursor-pointer shadow-xl hover:scale-[1.03] disabled:opacity-70"
                  style={{
                    backgroundColor: isRunning
                      ? "#10b981"
                      : "var(--console-accent, #783efe)",
                    color: "#ffffff",
                  }}
                >
                  {game.is_installed ? (
                    <Play className="w-4 h-4 fill-current" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <span>
                    {isRunning
                      ? "Running"
                      : isLaunching
                      ? "Launching..."
                      : game.is_installed
                      ? "Play Game"
                      : "Install Game"}
                  </span>
                </button>

                <button
                  type="button"
                  data-gamepad-focusable="true"
                  onClick={() => {
                    playConfirm();
                    onToggleFavorite(game);
                  }}
                  className={`px-4 py-3.5 rounded-full border backdrop-blur-xl text-xs font-bold flex items-center space-x-2 transition-all cursor-pointer ${
                    game.is_favorite
                      ? "bg-amber-400/20 border-amber-400/40 text-amber-200"
                      : "bg-white/10 hover:bg-white/18 border-white/15 text-white"
                  }`}
                >
                  <Star
                    className={`w-4 h-4 ${
                      game.is_favorite ? "fill-amber-400 text-amber-400" : ""
                    }`}
                  />
                  <span>{game.is_favorite ? "Favorited" : "Favorite"}</span>
                </button>

                <button
                  type="button"
                  data-gamepad-focusable="true"
                  onClick={() => {
                    playConfirm();
                    onOpenSaveManager(game);
                  }}
                  className="px-4 py-3.5 rounded-full bg-white/10 hover:bg-white/18 border border-white/15 backdrop-blur-xl text-xs font-bold text-white flex items-center space-x-2 transition-all cursor-pointer"
                >
                  <Save className="w-4 h-4 text-sky-300" />
                  <span>Saves</span>
                </button>

                {/* Resolved Completion Status Button (Click to cycle Auto / Manual statuses) */}
                <button
                  type="button"
                  data-gamepad-focusable="true"
                  onClick={handleCycleCompletionStatus}
                  title="Click to cycle Completion Status"
                  className={`px-4 py-3.5 rounded-full border backdrop-blur-xl text-xs font-bold flex items-center space-x-2 transition-all cursor-pointer ${effectiveStatus.badgeClass}`}
                >
                  {renderStatusIcon(effectiveStatus.iconName)}
                  <span>{effectiveStatus.status}</span>
                  {effectiveStatus.isAuto && (
                    <span className="text-[10px] opacity-65 font-mono uppercase">Auto</span>
                  )}
                </button>
              </div>
            </div>
          </section>

          {/* TAB CONTENT */}
          {activeTab === "overview" && (
            <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_410px] gap-6 items-start">
              {/* Left Column: Rich HTML Description (SteamDescription) + Screenshots */}
              <div className="min-w-0 space-y-6">
                <div className="console-diagonal-surface rounded-2xl bg-black/30 border border-white/10 backdrop-blur-xl p-6">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-white/50 mb-4 pb-2 border-b border-white/10">
                    About This Game
                  </h3>
                  <SteamDescription html={game.description} />
                </div>

                {game.screenshots && game.screenshots.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-white/50 px-1">
                      Screenshots
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {game.screenshots.slice(0, 6).map((shot, i) => {
                        const src = resolveImageSrc(shot);
                        if (!src) return null;
                        return (
                          <div
                            key={`${shot}-${i}`}
                            className="aspect-video rounded-2xl overflow-hidden border border-white/10 bg-black/40"
                          >
                            <img
                              src={src}
                              alt={`${game.title} screenshot ${i + 1}`}
                              loading="lazy"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Desktop-Parity Playtime/Last Played + Achievements Quick Widget + HLTB Widget + Full Details Card */}
              <div className="min-w-0 space-y-5">
                {/* Playtime, Last Played & Effective Completion Status */}
                <div className="console-diagonal-surface rounded-xl bg-black/30 border border-white/10 backdrop-blur-xl p-4 grid grid-cols-2 gap-3.5">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      Time Played
                    </div>
                    <div className="text-sm font-bold text-white mt-1">
                      {formatPlaytime(game.playtime_seconds)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      Last Played
                    </div>
                    <div className="text-sm font-bold text-white mt-1 truncate">
                      {lastPlayedLabel || "Never"}
                    </div>
                  </div>
                  <div className="col-span-2 pt-2 border-t border-white/10 flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-slate-400">
                      Completion Status
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${effectiveStatus.badgeClass}`}
                    >
                      {renderStatusIcon(effectiveStatus.iconName, "w-3 h-3")}
                      <span>{effectiveStatus.status}</span>
                      {effectiveStatus.isAuto && (
                        <span className="text-[9px] opacity-65 font-mono">AUTO</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Desktop HowLongToBeat Widget (Proper 30h 12m formatting + bar!) */}
                <HowLongToBeatWidget
                  mainStoryHours={hltbData.main}
                  mainExtraHours={hltbData.extra}
                  completionistHours={hltbData.completionist}
                  isLoading={isLoadingHltb}
                />

                {/* Desktop Achievements Quick Progress Widget */}
                <AchievementsQuickWidget
                  game={game}
                  onOpenFullAchievements={() => {
                    playTabSwitch();
                    setActiveTab("achievements");
                  }}
                />

                {/* Full Desktop-Parity Metadata Details Card */}
                <div className="console-diagonal-surface rounded-xl bg-black/30 border border-white/10 backdrop-blur-xl p-4 space-y-2.5 text-xs">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white border-b border-white/10 pb-2">
                    Details
                  </h3>

                  <DetailRow
                    icon={<Tag className="w-3 h-3" />}
                    label="Series"
                    value={game.series || game.title}
                  />
                  <DetailRow
                    icon={<User className="w-3 h-3" />}
                    label="Developer"
                    value={game.developer}
                  />
                  <DetailRow
                    icon={<Building2 className="w-3 h-3" />}
                    label="Publisher"
                    value={game.publisher}
                  />
                  <DetailRow
                    icon={<Calendar className="w-3 h-3" />}
                    label="Release Date"
                    value={game.release_date}
                  />
                  <DetailRow
                    icon={<ShieldAlert className="w-3 h-3" />}
                    label="Age Rating"
                    value={game.age_rating || "All Ages"}
                  />
                  <DetailRow
                    icon={<Calendar className="w-3 h-3" />}
                    label="Date Added"
                    value={game.date_added ? game.date_added.slice(0, 10) : undefined}
                  />
                  <DetailRow
                    icon={<HardDrive className="w-3 h-3" />}
                    label="Size on Disk"
                    value={game.size_on_disk ? formatFileSize(game.size_on_disk) : undefined}
                  />
                  <DetailRow
                    icon={<PlatformIcon platform={game.source} className="w-3 h-3" />}
                    label="Source"
                    value={game.source}
                  />
                  {game.install_directory && (
                    <div className="pt-2 border-t border-white/10 space-y-1">
                      <div className="text-[10px] text-slate-400 flex items-center gap-1">
                        <FolderOpen className="w-3 h-3" />
                        <span>Installation Folder</span>
                      </div>
                      <div className="text-[10px] font-mono text-slate-300 truncate bg-black/30 px-2 py-1 rounded border border-white/5">
                        {game.install_directory}
                      </div>
                    </div>
                  )}

                  {game.genres && game.genres.length > 0 && (
                    <div className="pt-2 border-t border-white/10 space-y-1.5">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">
                        Genres &amp; Tags
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {game.genres.map((g) => (
                          <span
                            key={g}
                            className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[11px] text-slate-200"
                          >
                            {g}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {activeTab === "achievements" && (
            <section className="rounded-2xl bg-black/30 border border-white/10 backdrop-blur-xl p-6">
              <AchievementsTab game={game} />
            </section>
          )}

          {activeTab === "trailers" && (
            <section className="space-y-5">
              {trailers.length === 0 ? (
                <div className="rounded-2xl bg-black/30 border border-white/10 p-10 text-center text-sm text-white/55">
                  No trailers available for this game yet.
                </div>
              ) : (
                <>
                  {activeTrailer && (
                    <div className="aspect-video max-h-[58vh] w-full rounded-2xl overflow-hidden border border-white/15 bg-black shadow-2xl">
                      {activeTrailer.url.includes("youtube.com") ||
                      activeTrailer.url.includes("youtu.be") ? (
                        <iframe
                          src={toYouTubeEmbed(activeTrailer.url)}
                          title={activeTrailer.name}
                          allowFullScreen
                          className="w-full h-full border-0"
                        />
                      ) : (
                        <VideoPlayer
                          src={activeTrailer.url}
                          poster={activeTrailer.thumbnail}
                          autoPlay
                          controls
                          muted={false}
                          loop={false}
                        />
                      )}
                    </div>
                  )}

                  {trailers.length > 1 && (
                    <div className="flex items-center gap-3 overflow-x-auto pb-2">
                      {trailers.map((tr, i) => (
                        <button
                          key={`${tr.url}-${i}`}
                          type="button"
                          data-gamepad-focusable="true"
                          onClick={() => {
                            playConfirm();
                            setActiveTrailerIdx(i);
                          }}
                          className={`w-52 shrink-0 rounded-2xl overflow-hidden border text-left transition-all cursor-pointer ${
                            i === activeTrailerIdx
                              ? "border-white scale-[1.03]"
                              : "border-white/10 opacity-70 hover:opacity-100"
                          }`}
                        >
                          <div className="aspect-video bg-black">
                            {tr.thumbnail && (
                              <img
                                src={tr.thumbnail}
                                alt={tr.name}
                                className="w-full h-full object-cover"
                              />
                            )}
                          </div>
                          <div className="p-2.5 bg-black/70 text-xs font-semibold truncate">
                            {tr.name}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {activeTab === "news" && (
            <section className="space-y-4">
              {isLoadingNews ? (
                <div className="py-12 flex items-center justify-center text-white/60 space-x-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Loading recent news...</span>
                </div>
              ) : newsItems.length === 0 ? (
                <div className="rounded-2xl bg-black/30 border border-white/10 p-10 text-center text-sm text-white/55">
                  No recent news articles found for this title.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {newsItems.slice(0, 10).map((item) => (
                    <button
                      key={item.gid}
                      type="button"
                      data-gamepad-focusable="true"
                      onClick={() => {
                        playConfirm();
                        setSelectedArticle(item);
                      }}
                      className="rounded-2xl bg-black/35 hover:bg-black/55 border border-white/10 p-5 text-left transition-all cursor-pointer space-y-2"
                    >
                      <div className="text-xs text-white/45">
                        {item.feedlabel || "News"} •{" "}
                        {new Date(item.date * 1000).toLocaleDateString()}
                      </div>
                      <h4 className="text-base font-bold text-white line-clamp-2">
                        {item.title}
                      </h4>
                      <p className="text-xs text-white/65 line-clamp-3">
                        {item.contents.replace(/\[[^\]]+\]/g, "").replace(/<[^>]*>/g, "")}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>

        {/* Bottom Hints */}
        <footer className="shrink-0 pt-2 flex items-center justify-center">
          <div className="inline-flex items-center gap-5 px-5 py-2 rounded-full bg-black/55 border border-white/10 backdrop-blur-xl text-xs text-white/80">
            <span className="flex items-center gap-1.5">
              {isControllerActive ? (
                <ControllerGlyph
                  action="launch"
                  profile={glyphProfile}
                  customBindings={customBindings}
                  nintendoSwap={nintendoSwap}
                  size="xs"
                />
              ) : (
                <kbd className="px-1.5 py-0.5 rounded bg-white/15 font-mono text-[10px]">
                  Play
                </kbd>
              )}
              <span>{game.is_installed ? "Play" : "Install"}</span>
            </span>
            <span className="flex items-center gap-1.5">
              {isControllerActive ? (
                <ControllerGlyph
                  action="context_menu"
                  profile={glyphProfile}
                  customBindings={customBindings}
                  nintendoSwap={nintendoSwap}
                  size="xs"
                />
              ) : (
                <kbd className="px-1.5 py-0.5 rounded bg-white/15 font-mono text-[10px]">
                  Options
                </kbd>
              )}
              <span>Options</span>
            </span>
            <span className="flex items-center gap-1.5">
              {isControllerActive ? (
                <ControllerGlyph
                  button="RS"
                  profile={glyphProfile}
                  nintendoSwap={nintendoSwap}
                  size="xs"
                />
              ) : (
                <kbd className="px-1.5 py-0.5 rounded bg-white/15 font-mono text-[10px]">
                  Scroll
                </kbd>
              )}
              <span>Scroll</span>
            </span>
            <span className="flex items-center gap-1.5">
              {isControllerActive ? (
                <ControllerGlyph
                  action="back"
                  profile={glyphProfile}
                  customBindings={customBindings}
                  nintendoSwap={nintendoSwap}
                  size="xs"
                />
              ) : (
                <kbd className="px-1.5 py-0.5 rounded bg-white/15 font-mono text-[10px]">
                  Esc
                </kbd>
              )}
              <span>Back</span>
            </span>
          </div>
        </footer>
      </div>

      {/* News Article Reader */}
      <NewsArticleModal
        article={selectedArticle}
        gameTitle={game.title}
        onClose={() => setSelectedArticle(null)}
      />
    </div>
  );
};

const DetailRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  value?: string | null;
}> = ({ icon, label, value }) => {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <span className="text-slate-400 flex items-center gap-1.5 shrink-0">
        {icon}
        <span>{label}</span>
      </span>
      <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-200 font-semibold truncate text-right max-w-[180px]">
        {value}
      </span>
    </div>
  );
};

function toYouTubeEmbed(url: string): string {
  const match = url.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/);
  if (match && match[1]) {
    return `https://www.youtube.com/embed/${match[1]}?autoplay=1`;
  }
  return url;
}
