import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Game } from "../types/game";
import { resolveImageSrc, formatPlaytime, formatFileSize } from "../utils/image";
import { SteamDescription } from "./SteamDescription";
import { HowLongToBeatWidget } from "./HowLongToBeatWidget";
import { SteamGridDBModal } from "./SteamGridDBModal";
import { TrailerModal, getYouTubeEmbedUrl } from "./TrailerModal";
import { VideoPlayer } from "./VideoPlayer";
import { AchievementsTab } from "./AchievementsTab";
import { AchievementsQuickWidget } from "./AchievementsQuickWidget";
import {
  Play,
  Download,
  Cloud,
  ExternalLink,
  Sparkles,
  Monitor,
  Loader2,
  Calendar,
  Clock,
  User,
  Building,
  HardDrive,
  MoreHorizontal,
  Settings,
  Gamepad2,
  Award,
  Tag,
  ShieldAlert,
  Star,
  Newspaper,
  CheckCircle2,
  Film,
  Plus,
  Square,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";

interface SteamNewsItem {
  gid: string;
  title: string;
  url: string;
  author: string;
  contents: string;
  date: number;
  feedlabel?: string;
}

const SteamIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 496 512" fill="currentColor" className={className} aria-hidden="true">
    <path d="M496 256c0 137-111.2 248-248.4 248-113.8 0-209.6-76.3-239-180.4l95.2 39.3c6.4 32.1 34.9 56.4 68.9 56.4 39.2 0 71.9-32.4 70.2-73.5l84.5-60.2c52.1 1.3 95.8-40.9 95.8-93.5 0-51.6-42-93.5-93.7-93.5s-93.7 42-93.7 93.5v1.2L176.6 279c-15.5-.9-30.7 3.4-43.5 12.1L0 236.1C10.2 108.4 117.1 8 247.6 8 384.8 8 496 119 496 256zM155.7 384.3l-30.5-12.6a52.79 52.79 0 0 0 27.2 25.8c26.9 11.2 57.8-1.6 69-28.4 5.4-13 5.5-27.3.1-40.3-5.4-13-15.5-23.2-28.5-28.6-12.9-5.4-26.7-5.2-38.9-.6l31.5 13c19.8 8.2 29.2 30.9 20.9 50.7-8.3 19.9-31 29.2-50.8 21zm173.8-129.9c-34.4 0-62.4-28-62.4-62.3s28-62.3 62.4-62.3 62.4 28 62.4 62.3-27.9 62.3-62.4 62.3zm.1-15.6c25.9 0 46.9-21 46.9-46.8 0-25.9-21-46.8-46.9-46.8s-46.9 21-46.9 46.8c.1 25.8 21.1 46.8 46.9 46.8z" />
  </svg>
);

interface GameDetailsProps {
  game: Game;
  onLaunch: (game: Game) => void;
  onStop?: (game: Game) => void;
  onToggleFavorite: (id: string) => void;
  onOpenEdit: (game: Game) => void;
  onRemoveGame?: (game: Game) => void;
  onFetchMetadata: (id: string) => void;
  onRefreshGame?: (id: string) => void;
  isRefreshing?: boolean;
  isLaunching: boolean;
  isRunning?: boolean;
  isFetchingMeta: boolean;
  onSaveNotes?: (id: string, notes: string) => void;
  onUpdateGame?: (updated: Game) => void;
  onOpenContextMenu?: (game: Game, x: number, y: number) => void;
  onOpenSteamGridDB?: (game: Game) => void;
  onOpenTrailers?: (game: Game) => void;
  selectedGenres?: string[];
  onToggleGenre?: (genre: string) => void;
  selectedDevelopers?: string[];
  onToggleDeveloper?: (dev: string) => void;
  selectedSources?: string[];
  onToggleSource?: (source: string) => void;
  trailerAutoplay?: boolean;
  trailerMuted?: boolean;
}

export const GameDetails: React.FC<GameDetailsProps> = ({
  game,
  onLaunch,
  onStop,
  onToggleFavorite,
  onOpenEdit,
  onRemoveGame,
  onFetchMetadata,
  onRefreshGame,
  isRefreshing = false,
  isLaunching,
  isRunning = false,
  isFetchingMeta,
  onUpdateGame,
  onOpenContextMenu,
  onOpenSteamGridDB,
  onOpenTrailers,
  selectedGenres,
  onToggleGenre,
  selectedDevelopers,
  onToggleDeveloper,
  selectedSources,
  onToggleSource,
  trailerAutoplay = true,
  trailerMuted = true,
}) => {
  const [activeTab, setActiveTab] = useState<"overview" | "achievements" | "news">("overview");
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);

  // Live in-game player count
  const [playerCount, setPlayerCount] = useState<number | null>(null);

  // Video trailer state
  const [isTrailerModalOpen, setIsTrailerModalOpen] = useState(false);
  const [selectedTrailerIndex, setSelectedTrailerIndex] = useState(0);

  // HowLongToBeat state
  const [hltbData, setHltbData] = useState<{
    main?: number;
    extra?: number;
    completionist?: number;
  }>({
    main: game.hltb_main,
    extra: game.hltb_extra,
    completionist: game.hltb_completionist,
  });
  const [isLoadingHltb, setIsLoadingHltb] = useState(false);

  // Steam news state
  const [newsItems, setNewsItems] = useState<SteamNewsItem[]>([]);
  const [isLoadingNews, setIsLoadingNews] = useState(false);

  // SteamGridDB Modal state
  const [isSteamGridDBOpen, setIsSteamGridDBOpen] = useState(false);

  // Context Menu state for "..." button
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const actionMenuRef = useRef<HTMLDivElement>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const heroSrc = resolveImageSrc(game.background_image);
  const logoSrc = resolveImageSrc(game.logo_image);
  const coverSrc = resolveImageSrc(game.cover_image);
  const iconSrc = resolveImageSrc(game.icon_image);

  // Smooth Morphing Hero Crossfade
  const targetHero = heroSrc ?? null;
  const [currentHero, setCurrentHero] = useState<string | null>(targetHero);
  const [prevHero, setPrevHero] = useState<string | null>(null);
  const [isHeroFading, setIsHeroFading] = useState(false);
  const settledHeroRef = useRef<string | null>(targetHero);
  const heroTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (targetHero === settledHeroRef.current) return;

    const outgoing = settledHeroRef.current;
    settledHeroRef.current = targetHero;

    if (!targetHero) {
      setPrevHero(outgoing);
      setCurrentHero(null);
      setIsHeroFading(true);
    } else {
      setPrevHero(outgoing);
      setCurrentHero(targetHero);
      setIsHeroFading(false);

      const isVideo = targetHero.endsWith(".webm") || targetHero.endsWith(".mp4");
      if (!isVideo) {
        const img = new Image();
        img.src = targetHero;
        const start = () => {
          requestAnimationFrame(() => setIsHeroFading(true));
        };
        if (img.complete) {
          start();
        } else {
          img.onload = start;
          img.onerror = start;
        }
      } else {
        requestAnimationFrame(() => setIsHeroFading(true));
      }
    }

    if (heroTimeoutRef.current) clearTimeout(heroTimeoutRef.current);
    heroTimeoutRef.current = window.setTimeout(() => {
      setPrevHero(null);
      setIsHeroFading(false);
    }, 800);

    return () => {
      if (heroTimeoutRef.current) clearTimeout(heroTimeoutRef.current);
    };
  }, [targetHero]);

  // Active trailer
  const trailers = game.trailers || [];
  const activeTrailer = trailers[selectedTrailerIndex] || trailers[0] || null;
  const steamAppId = game.source.toLowerCase() === "steam" ? game.source_id : null;

  const handleSaveTrailers = (updatedTrailers: any[]) => {
    const updated = {
      ...game,
      trailers: updatedTrailers,
    };
    if (onUpdateGame) {
      onUpdateGame(updated);
    }
  };

  // Sync state when game changes
  useEffect(() => {
    setSelectedTrailerIndex(0);
    setIsActionMenuOpen(false);
    setHltbData({
      main: game.hltb_main,
      extra: game.hltb_extra,
      completionist: game.hltb_completionist,
    });

    // 1. Fetch live player count if Steam game
    if (steamAppId) {
      invoke<number>("get_steam_current_players", { appid: steamAppId })
        .then((count) => setPlayerCount(count))
        .catch(() => setPlayerCount(null));
    } else {
      setPlayerCount(null);
    }

    // 2. Fetch HLTB if missing
    if (game.hltb_main === undefined || game.hltb_main === null) {
      setIsLoadingHltb(true);
      invoke<any>("get_game_hltb", { gameId: game.id, title: game.title })
        .then((res) => {
          if (res) {
            setHltbData({
              main: res.main_story_hours,
              extra: res.main_extra_hours,
              completionist: res.completionist_hours,
            });
          }
        })
        .catch((e) => console.warn("HLTB fetch error:", e))
        .finally(() => setIsLoadingHltb(false));
    }

    // 3. Fetch News if Steam game
    if (steamAppId) {
      setIsLoadingNews(true);
      invoke<SteamNewsItem[]>("get_steam_news", { appid: steamAppId })
        .then((items) => setNewsItems(items))
        .catch((e) => {
          console.warn("Steam news fetch error:", e);
          setNewsItems([]);
        })
        .finally(() => setIsLoadingNews(false));
    } else {
      setNewsItems([]);
    }
  }, [game.id, game.source_id, game.title]);

  // Keep HLTB widget synced when live refresh updates props on the same game
  useEffect(() => {
    setHltbData({
      main: game.hltb_main,
      extra: game.hltb_extra,
      completionist: game.hltb_completionist,
    });
  }, [game.hltb_main, game.hltb_extra, game.hltb_completionist]);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setIsActionMenuOpen(false);
      }
    };
    if (isActionMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isActionMenuOpen]);

  const handleOpenLink = async (url: string) => {
    try {
      await openUrl(url);
    } catch (e) {
      console.warn("Failed to open link:", url, e);
    }
  };

  const handleApplyArtwork = async (updates: any) => {
    try {
      const updated = await invoke<Game>("apply_custom_artwork", {
        gameId: game.id,
        game_id: game.id,
        coverImage: updates.coverImage ?? updates.cover_image,
        cover_image: updates.coverImage ?? updates.cover_image,
        backgroundImage: updates.backgroundImage ?? updates.background_image,
        background_image: updates.backgroundImage ?? updates.background_image,
        logoImage: updates.logoImage ?? updates.logo_image,
        logo_image: updates.logoImage ?? updates.logo_image,
        iconImage: updates.iconImage ?? updates.icon_image,
        icon_image: updates.iconImage ?? updates.icon_image,
      });
      if (onUpdateGame) onUpdateGame(updated);
    } catch (err: any) {
      console.error("Failed to apply artwork:", err);
    }
  };

  // Helper to format BBCode/HTML excerpt in news feed
  const formatNewsExcerpt = (content: string) => {
    const clean = content
      .replace(/\[\/?(b|i|u|h[1-6]|quote|list|\*|code|spoiler)[^\]]*\]/gi, "")
      .replace(/\[url=[^\]]*\](.*?)\[\/url\]/gi, "$1")
      .replace(/\[img\].*?\[\/img\]/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
    return clean.length > 280 ? clean.slice(0, 280) + "..." : clean;
  };

  return (
    <div className="relative flex-1 w-full h-full bg-transparent overflow-hidden select-text font-sans">
      {/* Scrollable details container stopping above bottom bar, matching Playnite FusionX's Margin="0,0,0,64" */}
      <div
        ref={scrollContainerRef}
        className="w-full h-[calc(100%-80px)] overflow-y-auto pb-10 scroll-smooth"
        style={{
          WebkitMaskImage:
            "linear-gradient(to bottom, black 0px, black calc(100% - 65px), rgba(0,0,0,0.8) calc(100% - 45px), rgba(0,0,0,0.35) calc(100% - 25px), rgba(0,0,0,0.08) calc(100% - 10px), transparent 100%)",
          maskImage:
            "linear-gradient(to bottom, black 0px, black calc(100% - 65px), rgba(0,0,0,0.8) calc(100% - 45px), rgba(0,0,0,0.35) calc(100% - 25px), rgba(0,0,0,0.08) calc(100% - 10px), transparent 100%)",
        }}
      >
        {/* Top Hero Header - Strictly 96/31 Aspect Ratio & 50% Opacity Mask Fading */}
        <div className="relative w-full aspect-[96/31] select-none mb-[100px]">
          {/* Background Hero Art with Pure Alpha Mask Fading & Seamless Dual-Layer Morphing */}
          {(currentHero || prevHero) ? (
            <div
              className="absolute inset-0 translate-y-[10px] pointer-events-none overflow-hidden"
              style={{
                WebkitMaskImage:
                  "linear-gradient(to right, transparent 0px, rgba(0,0,0,0.05) 15px, rgba(0,0,0,0.2) 35px, rgba(0,0,0,0.5) 55px, rgba(0,0,0,0.8) 80px, black 100px, black calc(100% - 100px), rgba(0,0,0,0.8) calc(100% - 80px), rgba(0,0,0,0.5) calc(100% - 55px), rgba(0,0,0,0.2) calc(100% - 35px), rgba(0,0,0,0.05) calc(100% - 15px), transparent 100%)",
                maskImage:
                  "linear-gradient(to right, transparent 0px, rgba(0,0,0,0.05) 15px, rgba(0,0,0,0.2) 35px, rgba(0,0,0,0.5) 55px, rgba(0,0,0,0.8) 80px, black 100px, black calc(100% - 100px), rgba(0,0,0,0.8) calc(100% - 80px), rgba(0,0,0,0.5) calc(100% - 55px), rgba(0,0,0,0.2) calc(100% - 35px), rgba(0,0,0,0.05) calc(100% - 15px), transparent 100%)",
              }}
            >
              <div
                className="w-full h-full relative"
                style={{
                  WebkitMaskImage:
                    "linear-gradient(to bottom, transparent 0px, rgba(0,0,0,0.05) 8px, rgba(0,0,0,0.2) 18px, rgba(0,0,0,0.5) 28px, rgba(0,0,0,0.8) 40px, black 50px, black calc(100% - 100px), rgba(0,0,0,0.8) calc(100% - 80px), rgba(0,0,0,0.5) calc(100% - 55px), rgba(0,0,0,0.2) calc(100% - 35px), rgba(0,0,0,0.05) calc(100% - 15px), transparent 100%)",
                  maskImage:
                    "linear-gradient(to bottom, transparent 0px, rgba(0,0,0,0.05) 8px, rgba(0,0,0,0.2) 18px, rgba(0,0,0,0.5) 28px, rgba(0,0,0,0.8) 40px, black 50px, black calc(100% - 100px), rgba(0,0,0,0.8) calc(100% - 80px), rgba(0,0,0,0.5) calc(100% - 55px), rgba(0,0,0,0.2) calc(100% - 35px), rgba(0,0,0,0.05) calc(100% - 15px), transparent 100%)",
                }}
              >
                {/* Secondary (Previous Hero Image) underneath - Fades out completely to 0 */}
                {prevHero && (
                  <div
                    className={`absolute inset-0 transition-opacity duration-700 ease-out pointer-events-none ${
                      isHeroFading ? "opacity-0" : "opacity-100"
                    }`}
                  >
                    {prevHero.endsWith(".webm") || prevHero.endsWith(".mp4") ? (
                      <video
                        src={prevHero}
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="w-full h-full object-cover opacity-50"
                      />
                    ) : (
                      <img
                        src={prevHero}
                        alt=""
                        className="w-full h-full object-cover opacity-50"
                      />
                    )}
                  </div>
                )}

                {/* Primary (Incoming Hero Image) morphs in on top */}
                {currentHero && (
                  <div
                    className={`absolute inset-0 transition-opacity duration-700 ease-out pointer-events-none ${
                      prevHero ? (isHeroFading ? "opacity-100" : "opacity-0") : "opacity-100"
                    }`}
                  >
                    {currentHero.endsWith(".webm") || currentHero.endsWith(".mp4") ? (
                      <video
                        src={currentHero}
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="w-full h-full object-cover opacity-50"
                      />
                    ) : (
                      <img
                        src={currentHero}
                        alt={game.title}
                        className="w-full h-full object-cover opacity-50"
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {/* Prominent Title Logo Positioned in Top-Left (Target 500px wide, max 200px tall) */}
          {logoSrc ? (
            <div
              key={`logo_${game.id}`}
              className="absolute top-[30px] left-6 lg:top-[38px] lg:left-8 z-20 pointer-events-auto w-[500px] max-w-[calc(100%-48px)] max-h-[200px] flex items-start animate-game-switch"
            >
              {logoSrc.endsWith(".webm") || logoSrc.endsWith(".mp4") ? (
                <video
                  src={logoSrc}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-[500px] max-w-full max-h-[200px] h-auto object-contain object-left drop-shadow-[0_6px_24px_rgba(0,0,0,0.95)]"
                />
              ) : (
                <img
                  src={logoSrc}
                  alt={game.title}
                  className="w-[500px] max-w-full max-h-[200px] h-auto object-contain object-left drop-shadow-[0_6px_24px_rgba(0,0,0,0.95)]"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
              )}
            </div>
          ) : null}

          {/* Foreground Header Content: Shifted ~100px Down from Bottom of Hero */}
          <div
            key={`header_${game.id}`}
            className="absolute inset-0 translate-y-[100px] px-6 lg:px-8 pb-4 flex items-end justify-between gap-6 z-10 pointer-events-none animate-game-switch"
          >
            {/* Left Column: Title + Ratings + Genres */}
            <div className="flex-1 min-w-0 space-y-2 pointer-events-auto">
              {/* Game Title with Client Icon */}
              <div className="flex items-center space-x-2">
                {iconSrc ? (
                  <img
                    src={iconSrc}
                    alt=""
                    className="w-4 h-4 rounded object-contain shrink-0 drop-shadow"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                ) : (
                  <Gamepad2 className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                )}
                <h1 className="text-sm sm:text-base font-bold uppercase tracking-wider text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] truncate">
                  {game.title}
                </h1>
              </div>

              {/* Ratings, Year, Platform Row - Clean Playnite aesthetic */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-200 font-semibold drop-shadow">
                {/* Community Score / Star Rating */}
                {game.community_score ? (
                  <div className="flex items-center space-x-1 text-white">
                    <span className="text-white tracking-tighter text-xs">★★★★★</span>
                    <span className="font-bold text-white text-xs">{game.community_score}</span>
                  </div>
                ) : null}

                {/* Critic Score / Metacritic */}
                {game.critic_score ? (
                  <div className="flex items-center space-x-1 text-white">
                    <span className="text-white tracking-tighter text-xs">★★★★★</span>
                    <span className="font-bold text-white text-xs">{game.critic_score}</span>
                  </div>
                ) : null}

                {/* Release Year */}
                {game.release_date && (
                  <span className="text-slate-300 font-semibold text-xs">
                    {game.release_date.slice(0, 4)}
                  </span>
                )}

                {/* Platform */}
                <span className="text-slate-400">·</span>
                <span className="text-slate-300 font-semibold text-[11px] uppercase tracking-wide">
                  PC (WINDOWS)
                </span>

                {/* Not Installed Cloud Badge */}
                {!game.is_installed && (
                  <span className="px-2 py-0.5 rounded bg-black/60 border border-slate-700 text-slate-300 text-[10px] font-bold flex items-center space-x-1 shadow-sm">
                    <Cloud className="w-3 h-3 text-slate-400" />
                    <span>NOT INSTALLED</span>
                  </span>
                )}
              </div>

              {/* Genre Pills Row - Translucent with subtle line border & click-to-filter */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {game.genres.slice(0, 4).map((g) => {
                  const isSelected = selectedGenres?.includes(g);
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => onToggleGenre?.(g)}
                      title={`Filter by ${g}`}
                      className={`px-2.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider shadow-sm transition-all cursor-pointer ${
                        isSelected
                          ? "bg-white text-zinc-950 font-black ring-1 ring-white"
                          : "bg-black/25 backdrop-blur-md border border-white/15 text-white hover:bg-white/15 hover:border-white/30"
                      }`}
                    >
                      {g}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right Column: Action Widgets (Horizontal) + Anchored Cover Poster (200px wide, no line border) */}
            <div className="flex items-end space-x-3 shrink-0 pointer-events-auto">
              {/* Horizontal Widget Action Buttons (IN-GAME, PLATFORMS, VIDEO ON side-by-side with subtle line border & opacity) */}
              <div className="flex items-center space-x-2 justify-end pb-0.5">
                {/* Live In-Game Player Count Box */}
                {playerCount !== null && (
                  <div
                    title="Live current players on Steam"
                    className="w-14 h-12 bg-black/25 backdrop-blur-md border border-white/15 hover:border-white/25 rounded-xl flex flex-col items-center justify-center p-1 shadow-lg text-center transition-all"
                  >
                    <div className="text-[11px] font-bold text-white font-mono leading-none">
                      {playerCount > 9999 ? `${Math.round(playerCount / 1000)}k` : playerCount}
                    </div>
                    <div className="text-[7px] font-bold text-emerald-400 tracking-wider uppercase mt-1">
                      IN-GAME
                    </div>
                  </div>
                )}

                {/* Platform / Source Button */}
                <div
                  title={game.source?.toLowerCase() === "steam" ? "Platform: Steam" : "Supported Platforms"}
                  className="w-14 h-12 bg-black/25 backdrop-blur-md border border-white/15 hover:border-white/25 rounded-xl flex flex-col items-center justify-center p-1 shadow-lg text-center transition-all"
                >
                  {game.source?.toLowerCase() === "steam" ? (
                    <SteamIcon className="w-4 h-4 mx-auto text-slate-200" />
                  ) : (
                    <Monitor className="w-4 h-4 mx-auto text-slate-200" />
                  )}
                  <div className="text-[7px] font-bold text-slate-400 tracking-wider uppercase mt-1">
                    {game.source?.toLowerCase() === "steam" ? "STEAM" : "PLATFORMS"}
                  </div>
                </div>
              </div>

              {/* Anchored Vertical Cover Poster - 200px wide, no line border */}
              <div
                onClick={() => {
                  if (onOpenSteamGridDB) {
                    onOpenSteamGridDB(game);
                  } else {
                    setIsSteamGridDBOpen(true);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (onOpenContextMenu) {
                    onOpenContextMenu(game, e.clientX, e.clientY);
                  } else {
                    setIsActionMenuOpen(true);
                  }
                }}
                title="Left click to change artwork, right click for options"
                className="group relative w-[170px] sm:w-[185px] lg:w-[200px] aspect-[2/3] rounded-xl overflow-hidden shadow-2xl transition-all cursor-pointer hover:ring-1 hover:ring-white/40 hover:shadow-black/80 bg-black/40 shrink-0 border-0"
              >
                {/* FusionX Corner-to-Corner Shine Overlay */}
                <div className="card-shine-container">
                  <div className="card-shine-beam" />
                </div>

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
                      className="w-full h-full object-cover"
                    />
                  )
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 p-2 text-center">
                    <Gamepad2 className="w-8 h-8 mb-1" />
                    <span className="text-[10px]">No Poster</span>
                  </div>
                )}

                {/* Hover overlay hint */}
                <div className="absolute inset-0 bg-black/75 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2 text-center">
                  <Sparkles className="w-4 h-4 text-white mb-1" />
                  <span className="text-[10px] font-bold text-white leading-tight">
                    Change Artwork
                  </span>
                  <span className="text-[8px] text-slate-300 mt-0.5">SteamGridDB</span>
                </div>
              </div>
            </div>
          </div>
        </div>



        {/* Main Workspace: 2-Column Layout (Gap to Top Section: 24px) */}
        <div className="px-6 pt-2 pb-5 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Media Showcase + 3 Tabs (Overview, Achievements, News) (~65%) */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-5">
            {/* Media Showcase: Video Trailer (NO still image fallback, hidden completely when no trailer) */}
            {activeTrailer && (
              <div className="space-y-2">
                {/* Video Trailer Container */}
                <div className="relative rounded-xl overflow-hidden border border-white/10 shadow-xl bg-black/60 backdrop-blur-sm aspect-video flex items-center justify-center group">
                  {(() => {
                    const ytEmbed = getYouTubeEmbedUrl(
                      activeTrailer.url,
                      trailerAutoplay,
                      trailerMuted
                    );
                    if (ytEmbed) {
                      return (
                        <iframe
                          src={ytEmbed}
                          title={activeTrailer.name || "Game Trailer"}
                          className="w-full h-full border-0 rounded-xl"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      );
                    }
                    return (
                      <VideoPlayer
                        key={activeTrailer.url}
                        src={activeTrailer.url}
                        poster={activeTrailer.thumbnail}
                        controls
                        autoPlay={trailerAutoplay}
                        muted={trailerMuted}
                        className="w-full h-full object-cover rounded-xl"
                      />
                    );
                  })()}

                  {/* Watermark Badges */}
                  {game.age_rating && (
                    <div className="absolute bottom-3 left-3 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-sm border border-white/10 text-slate-200 font-extrabold text-[11px] shadow-md flex items-center space-x-1 pointer-events-none">
                      <ShieldAlert className="w-3 h-3 text-slate-400" />
                      <span>{game.age_rating}</span>
                    </div>
                  )}

                  {/* Edit Trailer Button Overlay (Hover) */}
                  <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                    <button
                      onClick={() => (onOpenTrailers ? onOpenTrailers(game) : setIsTrailerModalOpen(true))}
                      title="Manage Trailers"
                      className="px-2.5 py-1 rounded-lg bg-black/80 hover:bg-black text-white text-[10px] font-bold border border-white/20 backdrop-blur-md shadow-md flex items-center space-x-1 cursor-pointer"
                    >
                      <Film className="w-3 h-3 text-cyan-400" />
                      <span>Manage Trailers</span>
                    </button>
                  </div>
                </div>

                {/* Multiple Trailers Switcher Tabs (if more than 1 trailer) */}
                {trailers.length > 1 && (
                  <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 text-xs">
                    {trailers.map((t, i) => (
                      <button
                        key={i}
                        onClick={() => setSelectedTrailerIndex(i)}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                          selectedTrailerIndex === i
                            ? "bg-white/20 text-white border border-white/30"
                            : "bg-black/30 text-slate-400 hover:text-slate-200 border border-white/5"
                        }`}
                      >
                        {t.name || `Trailer ${i + 1}`}
                      </button>
                    ))}
                    <button
                      onClick={() => (onOpenTrailers ? onOpenTrailers(game) : setIsTrailerModalOpen(true))}
                      title="Add or edit trailers"
                      className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Content Tabs Navigation: Clean Playnite Style with White Underline */}
            <div className="border-b border-white/10 flex items-center space-x-8 select-none sticky top-0 bg-transparent backdrop-blur-xs z-20 pt-2">
              <button
                onClick={() => setActiveTab("overview")}
                className={`pb-3 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer relative ${
                  activeTab === "overview"
                    ? "text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Overview
                {activeTab === "overview" && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white rounded-full shadow-sm" />
                )}
              </button>

              <button
                onClick={() => setActiveTab("achievements")}
                className={`pb-3 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer relative ${
                  activeTab === "achievements"
                    ? "text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Achievements
                {activeTab === "achievements" && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white rounded-full shadow-sm" />
                )}
              </button>

              <button
                onClick={() => setActiveTab("news")}
                className={`pb-3 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer relative flex items-center space-x-2 ${
                  activeTab === "news"
                    ? "text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <span>News</span>
                {newsItems.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/15 text-white font-mono">
                    {newsItems.length}
                  </span>
                )}
                {activeTab === "news" && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white rounded-full shadow-sm" />
                )}
              </button>
            </div>

            {/* Tab Body */}
            <div>
              {/* Tab 1: Overview */}
              {activeTab === "overview" && (
                <div className="space-y-4">
                  <SteamDescription
                    html={game.description}
                    fallbackText="No description available yet. Open Game Properties -> Download Metadata to fetch rich store details."
                  />
                </div>
              )}

              {/* Tab 2: Achievements (Full Showcase) */}
              {activeTab === "achievements" && (
                <AchievementsTab game={game} />
              )}

              {/* Tab 3: News & Changelogs */}
              {activeTab === "news" && (
                <div className="space-y-4">
                  {isLoadingNews ? (
                    <div className="flex items-center justify-center py-12 space-x-2 text-slate-400 text-xs">
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Loading latest news and changelogs...</span>
                    </div>
                  ) : newsItems.length === 0 ? (
                    <div className="p-8 bg-black/30 backdrop-blur-md border border-white/10 rounded-2xl text-center space-y-2">
                      <Newspaper className="w-8 h-8 text-slate-600 mx-auto" />
                      <p className="text-xs text-slate-400">
                        No news articles or changelogs found for this game.
                      </p>
                      {steamAppId && (
                        <button
                          onClick={() =>
                            handleOpenLink(`https://store.steampowered.com/news/app/${steamAppId}`)
                          }
                          className="text-xs text-slate-300 hover:text-white underline inline-flex items-center space-x-1 cursor-pointer"
                        >
                          <span>Open Steam News Hub</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {newsItems.map((item) => (
                        <div
                          key={item.gid}
                          className="p-5 bg-black/30 backdrop-blur-md border border-white/10 hover:border-white/20 rounded-2xl space-y-2.5 transition-all shadow-md group"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="px-2 py-0.5 rounded-full bg-white/10 text-slate-200 font-bold border border-white/10 text-[10px] uppercase tracking-wider">
                              {item.feedlabel || item.author || "Update"}
                            </span>
                            <span className="text-slate-400 font-mono text-[11px]">
                              {new Date(item.date * 1000).toLocaleDateString(undefined, {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          </div>
                          <h4
                            onClick={() => handleOpenLink(item.url)}
                            className="text-sm font-bold text-white group-hover:text-slate-200 transition-colors cursor-pointer line-clamp-2"
                          >
                            {item.title}
                          </h4>
                          <p className="text-xs text-slate-300 leading-relaxed line-clamp-3">
                            {formatNewsExcerpt(item.contents)}
                          </p>
                          <div className="pt-1 flex items-center justify-between">
                            <span className="text-[11px] text-slate-500">By {item.author}</span>
                            <button
                              onClick={() => handleOpenLink(item.url)}
                              className="text-xs font-semibold text-slate-300 hover:text-white flex items-center space-x-1 cursor-pointer"
                            >
                              <span>Read Full Article</span>
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: HowLongToBeat + Details Table (~35%) */}
          <div className="lg:col-span-5 xl:col-span-4 space-y-6">
            {/* 1. HowLongToBeat Widget */}
            <HowLongToBeatWidget
              mainStoryHours={hltbData.main}
              mainExtraHours={hltbData.extra}
              completionistHours={hltbData.completionist}
              isLoading={isLoadingHltb}
            />

            {/* 2. Details Card - Matches Playnite FusionX reference (No Text Clipping) */}
            <div className="bg-black/12 backdrop-blur-md border border-white/10 rounded-xl p-4 shadow-xl space-y-3 select-none text-xs">
              <h3 className="text-xs font-bold text-white border-b border-white/10 pb-2 uppercase tracking-wider">
                Details
              </h3>

              <div className="space-y-2 text-[11px]">
                {/* Series */}
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <span className="text-slate-400 flex items-center space-x-1.5 shrink-0">
                    <Tag className="w-3 h-3 text-slate-400" />
                    <span>Series</span>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-200 font-semibold truncate text-right max-w-[140px]">
                    {game.series || game.title}
                  </span>
                </div>

                {/* Developer */}
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <span className="text-slate-400 flex items-center space-x-1.5 shrink-0">
                    <User className="w-3 h-3 text-slate-400" />
                    <span>Developer</span>
                  </span>
                  {game.developer ? (
                    <button
                      type="button"
                      onClick={() => onToggleDeveloper?.(game.developer!)}
                      title={`Filter by ${game.developer}`}
                      className={`px-2 py-0.5 rounded border text-[11px] truncate text-right max-w-[140px] transition-all cursor-pointer ${
                        selectedDevelopers?.includes(game.developer)
                          ? "bg-white text-zinc-950 font-bold border-white"
                          : "bg-white/5 border-white/10 text-slate-200 hover:bg-white/15 hover:text-white"
                      }`}
                    >
                      {game.developer}
                    </button>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-400 truncate text-right max-w-[140px]">
                      —
                    </span>
                  )}
                </div>

                {/* Publisher */}
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <span className="text-slate-400 flex items-center space-x-1.5 shrink-0">
                    <Building className="w-3 h-3 text-slate-400" />
                    <span>Publisher</span>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-200 font-semibold truncate text-right max-w-[140px]">
                    {game.publisher || "—"}
                  </span>
                </div>

                {/* Age Rating */}
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <span className="text-slate-400 flex items-center space-x-1.5 shrink-0">
                    <ShieldAlert className="w-3 h-3 text-slate-400" />
                    <span>Age Rating</span>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-200 font-bold text-right">
                    {game.age_rating || "All Ages"}
                  </span>
                </div>

                {/* Date Added */}
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <span className="text-slate-400 flex items-center space-x-1.5 shrink-0">
                    <Calendar className="w-3 h-3 text-slate-400" />
                    <span>Date Added</span>
                  </span>
                  <span className="text-slate-300 font-mono text-right truncate">
                    {game.date_added || "—"}
                  </span>
                </div>

                {/* Recent Activity */}
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <span className="text-slate-400 flex items-center space-x-1.5 shrink-0">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span>Recent Activity</span>
                  </span>
                  <span className="text-slate-300 font-mono text-right truncate">
                    {game.last_played || (game.playtime_seconds > 0 ? "Played (Date unknown)" : "Never")}
                  </span>
                </div>

                {/* Size on Disk */}
                {game.size_on_disk && game.size_on_disk > 0 && (
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="text-slate-400 flex items-center space-x-1.5 shrink-0">
                      <HardDrive className="w-3 h-3 text-slate-400" />
                      <span>Size on Disk</span>
                    </span>
                    <span className="text-slate-300 font-mono text-right truncate">
                      {formatFileSize(game.size_on_disk)}
                    </span>
                  </div>
                )}

                {/* Source */}
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <span className="text-slate-400 flex items-center space-x-1.5 shrink-0">
                    <HardDrive className="w-3 h-3 text-slate-400" />
                    <span>Source</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onToggleSource?.(game.source)}
                    title={`Filter by ${game.source}`}
                    className={`px-2 py-0.5 rounded border text-[11px] font-semibold text-right transition-all cursor-pointer ${
                      selectedSources?.includes(game.source)
                        ? "bg-white text-zinc-950 font-bold border-white"
                        : "bg-white/5 border-white/10 text-slate-200 hover:bg-white/15 hover:text-white"
                    }`}
                  >
                    {game.source}
                  </button>
                </div>

                {/* Library */}
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <span className="text-slate-400 flex items-center space-x-1.5 shrink-0">
                    <HardDrive className="w-3 h-3 text-slate-400" />
                    <span>Library</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onToggleSource?.(game.source)}
                    title={`Filter by ${game.source}`}
                    className={`px-2 py-0.5 rounded border text-[11px] font-semibold text-right transition-all cursor-pointer ${
                      selectedSources?.includes(game.source)
                        ? "bg-white text-zinc-950 font-bold border-white"
                        : "bg-white/5 border-white/10 text-slate-200 hover:bg-white/15 hover:text-white"
                    }`}
                  >
                    {game.source}
                  </button>
                </div>

                {/* Genres & Tags */}
                {game.genres && game.genres.length > 0 && (
                  <div className="pt-2 border-t border-white/10 space-y-1.5">
                    <div className="text-slate-400 text-[10px] flex items-center space-x-1">
                      <Tag className="w-3 h-3 text-slate-400" />
                      <span>Genres & Tags</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {game.genres.map((g) => {
                        const isSelected = selectedGenres?.includes(g);
                        return (
                          <button
                            key={g}
                            type="button"
                            onClick={() => onToggleGenre?.(g)}
                            title={`Filter by ${g}`}
                            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all cursor-pointer ${
                              isSelected
                                ? "bg-white text-zinc-950 font-bold ring-1 ring-white"
                                : "bg-white/5 border border-white/10 text-slate-300 hover:bg-white/15 hover:text-white"
                            }`}
                          >
                            {g}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Community Score */}
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <span className="text-slate-400 flex items-center space-x-1.5 shrink-0">
                    <Star className="w-3 h-3 text-slate-400" />
                    <span>Community Score</span>
                  </span>
                  <span className="text-slate-200 font-bold font-mono text-right">
                    {game.community_score ? `${game.community_score}` : "—"}
                  </span>
                </div>

                {/* Critic Score */}
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <span className="text-slate-400 flex items-center space-x-1.5 shrink-0">
                    <Award className="w-3 h-3 text-slate-400" />
                    <span>Critic Score</span>
                  </span>
                  <span className="text-slate-200 font-bold font-mono text-right">
                    {game.critic_score ? `${game.critic_score}` : "—"}
                  </span>
                </div>

                {/* Installation Folder */}
                {game.install_directory && (
                  <div className="pt-2 border-t border-white/10 space-y-1">
                    <div className="text-slate-400 text-[10px] flex items-center space-x-1">
                      <HardDrive className="w-3 h-3 text-slate-400" />
                      <span>Installation Folder</span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono truncate" title={game.install_directory}>
                      {game.install_directory}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 3. Quick Achievements Showcase Widget */}
            <AchievementsQuickWidget
              game={game}
              onOpenFullAchievements={() => setActiveTab("achievements")}
            />
          </div>
        </div>
      </div>

      {/* Floating Bottom Stats & Action Launch Bar - Exactly matching Playnite FusionX: No Black Box, No Border Line, Scaled Controls (~200x48 Play button, w-12 buttons, large stats) */}
      <div className="absolute bottom-0 inset-x-0 h-20 px-6 lg:px-8 pb-4 flex items-end justify-between select-none z-30 pointer-events-none bg-transparent">
        {/* Left Side: Stats (Completion Status, Last Played, Time Played - Clean and Scaled to Match Bottom Bar Enlargement) */}
        <div
          key={`stats_${game.id}`}
          className="flex items-center space-x-10 text-slate-300 pointer-events-auto animate-game-switch"
        >
          {/* Completion Status */}
          <div className="flex items-center space-x-3">
            <CheckCircle2 className="w-6 h-6 text-slate-400 shrink-0" />
            <div>
              <div className="text-xs text-slate-400 uppercase font-bold tracking-wider">Completion Status</div>
              <div className="font-extrabold text-slate-100 text-base">
                {game.completion_status || (game.last_played || game.playtime_seconds > 0 ? "Played" : "Not Played")}
              </div>
            </div>
          </div>

          {/* Last Played */}
          <div className="flex items-center space-x-3">
            <Calendar className="w-6 h-6 text-slate-400 shrink-0" />
            <div>
              <div className="text-xs text-slate-400 uppercase font-bold tracking-wider">Last Played</div>
              <div className="font-extrabold text-slate-100 font-mono text-base">
                {game.last_played || (game.playtime_seconds > 0 ? "Played (Date unknown)" : "Never")}
              </div>
            </div>
          </div>

          {/* Time Played */}
          <div className="flex items-center space-x-3">
            <Clock className="w-6 h-6 text-slate-400 shrink-0" />
            <div>
              <div className="text-xs text-slate-400 uppercase font-bold tracking-wider">Time Played</div>
              <div className="font-extrabold text-slate-100 font-mono text-base">
                {formatPlaytime(game.playtime_seconds)}
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Action buttons + Large Play / Install Button */}
        <div className="flex items-center space-x-3 pointer-events-auto">
          {/* 1. Star (Favorite) Button */}
          <button
            onClick={() => onToggleFavorite(game.id)}
            title={game.is_favorite ? "Remove from Favorites" : "Add to Favorites"}
            className={`w-12 h-12 rounded-full border transition-all flex items-center justify-center cursor-pointer shadow-lg backdrop-blur-sm group ${
              game.is_favorite
                ? "bg-amber-400/15 text-amber-400 border-amber-400/30 hover:bg-amber-400/25 hover:border-amber-400/50"
                : "bg-white/5 text-slate-300 border-white/10 hover:text-white hover:bg-white/15"
            }`}
          >
            <Star
              className={`w-4.5 h-4.5 transition-transform group-hover:scale-110 ${
                game.is_favorite ? "fill-amber-400 text-amber-400" : "text-slate-300 group-hover:text-amber-300"
              }`}
            />
          </button>

          {/* 2. Dots Context Menu Button */}
          <div className="relative" ref={actionMenuRef}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onOpenContextMenu) {
                  const rect = e.currentTarget.getBoundingClientRect();
                  onOpenContextMenu(game, rect.right - 224, rect.top - 290);
                } else {
                  setIsActionMenuOpen(!isActionMenuOpen);
                }
              }}
              title="More Actions"
              className={`w-12 h-12 rounded-full border transition-colors flex items-center justify-center cursor-pointer shadow-lg backdrop-blur-sm ${
                isActionMenuOpen
                  ? "bg-white/20 text-white border-white/40"
                  : "bg-white/5 text-slate-300 border-white/10 hover:text-white hover:bg-white/15"
              }`}
            >
              <MoreHorizontal className="w-4.5 h-4.5" />
            </button>

            {/* Context Dropdown Popover */}
            {isActionMenuOpen && (
              <div className="absolute bottom-full right-0 mb-3 w-56 bg-[#131625]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-1.5 z-50 text-xs space-y-0.5 animate-in fade-in slide-in-from-bottom-2 duration-150">
                <button
                  onClick={() => {
                    setIsTrailerModalOpen(true);
                    setIsActionMenuOpen(false);
                  }}
                  className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-left text-slate-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <Film className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>{trailers.length > 0 ? "Manage Trailers" : "Add Trailer"}</span>
                </button>

                <button
                  onClick={() => {
                    onToggleFavorite(game.id);
                    setIsActionMenuOpen(false);
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

                <button
                  onClick={() => {
                    if (onRefreshGame) {
                      onRefreshGame(game.id);
                    } else {
                      onFetchMetadata(game.id);
                    }
                    setIsActionMenuOpen(false);
                  }}
                  disabled={isRefreshing || isFetchingMeta}
                  className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-left text-slate-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw
                    className={`w-4 h-4 text-emerald-400 shrink-0 ${
                      isRefreshing || isFetchingMeta ? "animate-spin" : ""
                    }`}
                  />
                  <span>{isRefreshing || isFetchingMeta ? "Refreshing..." : "Refresh"}</span>
                </button>

                <div className="my-1 border-t border-white/10" />

                <button
                  onClick={() => {
                    onOpenEdit(game);
                    setIsActionMenuOpen(false);
                  }}
                  className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-left text-slate-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <Settings className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>Game Properties</span>
                </button>

                {game.install_directory && (
                  <button
                    onClick={() => {
                      handleOpenLink(`file:///${game.install_directory}`);
                      setIsActionMenuOpen(false);
                    }}
                    className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-left text-slate-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <HardDrive className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>Open Game Folder</span>
                  </button>
                )}

                {(!["steam", "epic", "gog", "battle.net", "ea app", "ubisoft connect", "xbox"].includes(
                  game.source.toLowerCase()
                ) ||
                  game.source.toLowerCase() === "local" ||
                  game.source.toLowerCase() === "manual") &&
                  onRemoveGame && (
                    <>
                      <div className="my-1 border-t border-white/10" />
                      <button
                        onClick={() => {
                          setIsActionMenuOpen(false);
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
            )}
          </div>

          {/* 3. Settings Button */}
          <button
            onClick={() => onOpenEdit(game)}
            title="Game Properties"
            className="w-12 h-12 rounded-full bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white border border-white/10 flex items-center justify-center transition-colors cursor-pointer shadow-lg backdrop-blur-sm"
          >
            <Settings className="w-4.5 h-4.5" />
          </button>

          {/* 4. Big Play / Launching / Running Button: ~200px width x 48px height */}
          {isRunning ? (
            <button
              onClick={() => setIsExitModalOpen(true)}
              title="Game is running. Click to exit."
              className="w-[200px] h-12 rounded-full flex items-center justify-center space-x-2 text-sm font-bold tracking-wider uppercase transition-all shadow-lg cursor-pointer bg-emerald-500/15 hover:bg-rose-500/20 text-emerald-300 hover:text-rose-200 border border-emerald-500/30 hover:border-rose-500/40 group/run"
            >
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 group-hover/run:bg-rose-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              <span className="group-hover/run:hidden">Running</span>
              <span className="hidden group-hover/run:inline">Exit Game</span>
            </button>
          ) : (
            <button
              onClick={() => onLaunch(game)}
              disabled={isLaunching}
              className={`w-[200px] h-12 rounded-full flex items-center justify-center space-x-2.5 text-sm font-black tracking-wider uppercase transition-all shadow-xl cursor-pointer ${
                isLaunching
                  ? "bg-white text-slate-950 cursor-wait launching-pulse"
                  : "bg-white text-slate-950 play-btn-glow"
              }`}
            >
              {isLaunching ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                  <span>{game.is_installed ? "LAUNCHING..." : "INSTALLING..."}</span>
                </>
              ) : game.is_installed ? (
                <>
                  <Play className="w-4.5 h-4.5 fill-slate-950 text-slate-950" />
                  <span>Play</span>
                </>
              ) : (
                <>
                  <Download className="w-4.5 h-4.5" />
                  <span>Install</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Exit Game Confirmation Modal */}
      {isExitModalOpen && (
        <div
          onClick={() => setIsExitModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-[#0e101a] border border-white/15 rounded-2xl p-5 shadow-2xl space-y-4 text-center select-none"
          >
            <div className="w-12 h-12 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto shadow-md">
              <Square className="w-5 h-5 fill-rose-400" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-white">Exit Game?</h3>
              <p className="text-xs text-slate-300">
                Are you sure you want to stop <span className="font-semibold text-white">{game.title}</span>? Any unsaved progress may be lost.
              </p>
            </div>

            <div className="flex items-center space-x-2.5 pt-1">
              <button
                onClick={() => setIsExitModalOpen(false)}
                className="flex-1 py-2 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setIsExitModalOpen(false);
                  if (onStop) onStop(game);
                }}
                className="flex-1 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-md shadow-rose-950/50 cursor-pointer"
              >
                Exit Game
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SteamGridDB Artwork Selection Modal */}
      {!onOpenSteamGridDB && (
        <SteamGridDBModal
          isOpen={isSteamGridDBOpen}
          onClose={() => setIsSteamGridDBOpen(false)}
          game={game}
          onApplyArtwork={handleApplyArtwork}
        />
      )}

      {/* Video Trailer Manager Modal */}
      {!onOpenTrailers && (
        <TrailerModal
          isOpen={isTrailerModalOpen}
          onClose={() => setIsTrailerModalOpen(false)}
          game={game}
          onSaveTrailers={handleSaveTrailers}
        />
      )}
    </div>
  );
};
