import React, { useState, useEffect, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Game } from "../types/game";
import { resolveImageSrc, resolveGridCoverSrc, getStaticFallbackCover, formatPlaytime, formatFileSize } from "../utils/image";
import { SteamDescription } from "./SteamDescription";
import { HowLongToBeatWidget } from "./HowLongToBeatWidget";
import { SteamGridDBModal } from "./SteamGridDBModal";
import { TrailerModal, getYouTubeEmbedUrl } from "./TrailerModal";
import { VideoPlayer } from "./VideoPlayer";
import { AchievementsTab } from "./AchievementsTab";
import { AchievementsQuickWidget } from "./AchievementsQuickWidget";
import { NewsArticleModal, SteamNewsItem } from "./NewsArticleModal";
import {
  Play,
  Download,
  Cloud,
  ExternalLink,
  Sparkles,
  Loader2,
  Calendar,
  Clock,
  User,
  Building,
  HardDrive,
  MoreHorizontal,
  Settings,
  Award,
  Tag,
  ShieldAlert,
  Star,
  Newspaper,
  Film,
  Plus,
  Square,
  RefreshCw,
  Trash2,
  ChevronDown,
  Crown,
  ShieldCheck,
  Target,
  Flame,
  CircleDot,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getEffectiveCompletionStatus, shouldPromptBeatenModal } from "../utils/completionStatus";
import { formatReleaseYear, formatLastPlayed } from "../utils/date";
import { StoryBeatenModal } from "./StoryBeatenModal";
import { PlatformIcon } from "./icons/PlatformIcons";

export interface GamePlatformBadge {
  id: string;
  gameId: string;
  title: string;
  label: string;
  icon: React.ReactNode;
  isInstalled: boolean;
  gameInstance: Game;
}

function createBadgeForGame(g: Game): GamePlatformBadge {
  const src = (g.source || "").toLowerCase().trim();
  if (src === "steam") {
    return {
      id: "steam",
      gameId: g.id,
      title: "Steam",
      label: "STEAM",
      icon: <PlatformIcon platform="steam" className="w-4 h-4 mx-auto" />,
      isInstalled: !!g.is_installed,
      gameInstance: g,
    };
  } else if (src === "epic" || src.includes("epic")) {
    return {
      id: "epic",
      gameId: g.id,
      title: "Epic Games",
      label: "EPIC",
      icon: <PlatformIcon platform="epic" className="w-4 h-4 mx-auto" />,
      isInstalled: !!g.is_installed,
      gameInstance: g,
    };
  } else if (src === "gog") {
    return {
      id: "gog",
      gameId: g.id,
      title: "GOG Galaxy",
      label: "GOG",
      icon: <PlatformIcon platform="gog" className="w-4 h-4 mx-auto" />,
      isInstalled: !!g.is_installed,
      gameInstance: g,
    };
  } else if (src === "battle.net" || src.includes("battle")) {
    return {
      id: "battlenet",
      gameId: g.id,
      title: "Battle.net",
      label: "BATTLE.NET",
      icon: <PlatformIcon platform="battlenet" className="w-4 h-4 mx-auto" />,
      isInstalled: !!g.is_installed,
      gameInstance: g,
    };
  } else if (src.includes("ea") || src.includes("origin")) {
    return {
      id: "ea",
      gameId: g.id,
      title: "EA App",
      label: "EA APP",
      icon: <PlatformIcon platform="ea" className="w-4 h-4 mx-auto" />,
      isInstalled: !!g.is_installed,
      gameInstance: g,
    };
  } else if (src.includes("ubisoft") || src.includes("uplay")) {
    return {
      id: "ubisoft",
      gameId: g.id,
      title: "Ubisoft Connect",
      label: "UBISOFT",
      icon: <PlatformIcon platform="ubisoft" className="w-4 h-4 mx-auto" />,
      isInstalled: !!g.is_installed,
      gameInstance: g,
    };
  } else if (src.includes("riot")) {
    return {
      id: "riot",
      gameId: g.id,
      title: "Riot Games",
      label: "RIOT",
      icon: <PlatformIcon platform="riot" className="w-4 h-4 mx-auto" />,
      isInstalled: !!g.is_installed,
      gameInstance: g,
    };
  } else if (src.includes("amazon")) {
    return {
      id: "amazon",
      gameId: g.id,
      title: "Amazon Games",
      label: "AMAZON",
      icon: <PlatformIcon platform="amazon" className="w-4 h-4 mx-auto" />,
      isInstalled: !!g.is_installed,
      gameInstance: g,
    };
  } else if (src.includes("xbox")) {
    return {
      id: "xbox",
      gameId: g.id,
      title: "Xbox",
      label: "XBOX",
      icon: <PlatformIcon platform="xbox" className="w-4 h-4 mx-auto" />,
      isInstalled: !!g.is_installed,
      gameInstance: g,
    };
  } else if (src.includes("playstation") || src.includes("psn")) {
    return {
      id: "psn",
      gameId: g.id,
      title: "PlayStation",
      label: "PSN",
      icon: <PlatformIcon platform="psn" className="w-4 h-4 mx-auto" />,
      isInstalled: !!g.is_installed,
      gameInstance: g,
    };
  } else if (src.includes("retroachievements") || src === "retro" || g.id.startsWith("ra_")) {
    return {
      id: "retroachievements",
      gameId: g.id,
      title: "RetroAchievements",
      label: "RETRO",
      icon: <PlatformIcon platform="retroachievements" className="w-4 h-4 mx-auto" />,
      isInstalled: !!g.is_installed,
      gameInstance: g,
    };
  } else {
    // Check if game is an emulated title or belongs to a specific console platform
    const platforms = (g.platforms || []).map((p) => p.toLowerCase().trim());
    const emu = (g.emulator_id || "").toLowerCase();
    const isEmulated =
      src === "emulation" ||
      g.id.startsWith("rom_") ||
      Boolean(g.emulator_id) ||
      platforms.some((p) =>
        [
          "switch",
          "snes",
          "nes",
          "n64",
          "gamecube",
          "game boy",
          "gba",
          "nds",
          "3ds",
          "wii",
          "ps1",
          "ps2",
          "ps3",
          "psp",
          "psvita",
          "genesis",
          "saturn",
          "dreamcast",
          "atari",
        ].some((c) => p.includes(c))
      );

    if (isEmulated) {
      // 1. Nintendo Switch
      if (platforms.some((p) => p.includes("switch")) || emu.includes("switch")) {
        return {
          id: "switch",
          gameId: g.id,
          title: "Nintendo Switch",
          label: "SWITCH",
          icon: <PlatformIcon platform="switch" className="w-4 h-4 mx-auto" />,
          isInstalled: !!g.is_installed,
          gameInstance: g,
        };
      }
      // 2. Super Nintendo (SNES)
      if (
        platforms.some((p) => p.includes("snes") || p.includes("super nintendo") || p.includes("super famicom")) ||
        emu.includes("snes")
      ) {
        return {
          id: "snes",
          gameId: g.id,
          title: "Super Nintendo",
          label: "SNES",
          icon: <PlatformIcon platform="snes" className="w-4 h-4 mx-auto" />,
          isInstalled: !!g.is_installed,
          gameInstance: g,
        };
      }
      // 3. Nintendo Entertainment System (NES)
      if (
        platforms.some(
          (p) =>
            p === "nes" ||
            p.includes("famicom") ||
            p.includes("nintendo entertainment system")
        ) ||
        emu.includes("nes")
      ) {
        return {
          id: "nes",
          gameId: g.id,
          title: "NES",
          label: "NES",
          icon: <PlatformIcon platform="nes" className="w-4 h-4 mx-auto" />,
          isInstalled: !!g.is_installed,
          gameInstance: g,
        };
      }
      // 4. Nintendo 64
      if (platforms.some((p) => p.includes("n64") || p.includes("nintendo 64")) || emu.includes("n64")) {
        return {
          id: "n64",
          gameId: g.id,
          title: "Nintendo 64",
          label: "N64",
          icon: <PlatformIcon platform="n64" className="w-4 h-4 mx-auto" />,
          isInstalled: !!g.is_installed,
          gameInstance: g,
        };
      }
      // 5. Nintendo GameCube
      if (platforms.some((p) => p.includes("gamecube") || p === "gc") || emu.includes("gamecube")) {
        return {
          id: "gamecube",
          gameId: g.id,
          title: "Nintendo GameCube",
          label: "GAMECUBE",
          icon: <PlatformIcon platform="gamecube" className="w-4 h-4 mx-auto" />,
          isInstalled: !!g.is_installed,
          gameInstance: g,
        };
      }
      // 6. Nintendo Wii U
      if (platforms.some((p) => p.includes("wii u") || p.includes("wiiu")) || emu.includes("wiiu")) {
        return {
          id: "wiiu",
          gameId: g.id,
          title: "Nintendo Wii U",
          label: "WII U",
          icon: <PlatformIcon platform="wiiu" className="w-4 h-4 mx-auto" />,
          isInstalled: !!g.is_installed,
          gameInstance: g,
        };
      }
      // 7. Nintendo Wii
      if (platforms.some((p) => p.includes("wii")) || emu.includes("wii")) {
        return {
          id: "wii",
          gameId: g.id,
          title: "Nintendo Wii",
          label: "WII",
          icon: <PlatformIcon platform="wii" className="w-4 h-4 mx-auto" />,
          isInstalled: !!g.is_installed,
          gameInstance: g,
        };
      }
      // 8. Game Boy Advance
      if (
        platforms.some(
          (p) =>
            p.includes("gba") ||
            p.includes("game boy advance") ||
            p.includes("gameboy advance")
        ) ||
        emu.includes("gba")
      ) {
        return {
          id: "gba",
          gameId: g.id,
          title: "Game Boy Advance",
          label: "GBA",
          icon: <PlatformIcon platform="gba" className="w-4 h-4 mx-auto" />,
          isInstalled: !!g.is_installed,
          gameInstance: g,
        };
      }
      // 9. Game Boy / Color
      if (
        platforms.some(
          (p) =>
            p === "gb" ||
            p === "gbc" ||
            p.includes("game boy") ||
            p.includes("gameboy")
        ) ||
        emu.includes("gb")
      ) {
        return {
          id: "gb",
          gameId: g.id,
          title: "Game Boy",
          label: "GAME BOY",
          icon: <PlatformIcon platform="gb" className="w-4 h-4 mx-auto" />,
          isInstalled: !!g.is_installed,
          gameInstance: g,
        };
      }
      // 10. Nintendo DS
      if (
        platforms.some(
          (p) => p === "nds" || p === "ds" || p.includes("nintendo ds")
        ) ||
        emu.includes("ds") ||
        emu.includes("nds")
      ) {
        return {
          id: "nds",
          gameId: g.id,
          title: "Nintendo DS",
          label: "NDS",
          icon: <PlatformIcon platform="nds" className="w-4 h-4 mx-auto" />,
          isInstalled: !!g.is_installed,
          gameInstance: g,
        };
      }
      // 11. Nintendo 3DS
      if (platforms.some((p) => p.includes("3ds")) || emu.includes("3ds")) {
        return {
          id: "3ds",
          gameId: g.id,
          title: "Nintendo 3DS",
          label: "3DS",
          icon: <PlatformIcon platform="3ds" className="w-4 h-4 mx-auto" />,
          isInstalled: !!g.is_installed,
          gameInstance: g,
        };
      }
      // 12. PlayStation 2
      if (platforms.some((p) => p === "ps2" || p.includes("playstation 2")) || emu.includes("ps2")) {
        return {
          id: "ps2",
          gameId: g.id,
          title: "PlayStation 2",
          label: "PS2",
          icon: <PlatformIcon platform="ps2" className="w-4 h-4 mx-auto" />,
          isInstalled: !!g.is_installed,
          gameInstance: g,
        };
      }
      // 13. PlayStation 3
      if (platforms.some((p) => p === "ps3" || p.includes("playstation 3")) || emu.includes("ps3")) {
        return {
          id: "ps3",
          gameId: g.id,
          title: "PlayStation 3",
          label: "PS3",
          icon: <PlatformIcon platform="ps3" className="w-4 h-4 mx-auto" />,
          isInstalled: !!g.is_installed,
          gameInstance: g,
        };
      }
      // 14. PlayStation Portable
      if (platforms.some((p) => p === "psp" || p.includes("playstation portable")) || emu.includes("psp")) {
        return {
          id: "psp",
          gameId: g.id,
          title: "PlayStation Portable",
          label: "PSP",
          icon: <PlatformIcon platform="psp" className="w-4 h-4 mx-auto" />,
          isInstalled: !!g.is_installed,
          gameInstance: g,
        };
      }
      // 15. PlayStation Vita
      if (
        platforms.some((p) => p === "psvita" || p === "vita" || p.includes("playstation vita") || p.includes("ps vita")) ||
        emu.includes("vita")
      ) {
        return {
          id: "psvita",
          gameId: g.id,
          title: "PlayStation Vita",
          label: "PS VITA",
          icon: <PlatformIcon platform="psvita" className="w-4 h-4 mx-auto" />,
          isInstalled: !!g.is_installed,
          gameInstance: g,
        };
      }
      // 16. PlayStation 1
      if (platforms.some((p) => p === "ps1" || p === "psx" || p.includes("playstation 1")) || emu.includes("ps1") || emu.includes("psx")) {
        return {
          id: "ps1",
          gameId: g.id,
          title: "PlayStation",
          label: "PS1",
          icon: <PlatformIcon platform="ps1" className="w-4 h-4 mx-auto" />,
          isInstalled: !!g.is_installed,
          gameInstance: g,
        };
      }
      // 17. Sega Genesis
      if (platforms.some((p) => p.includes("genesis") || p.includes("mega drive") || p.includes("megadrive")) || emu.includes("genesis")) {
        return {
          id: "genesis",
          gameId: g.id,
          title: "Sega Genesis",
          label: "GENESIS",
          icon: <PlatformIcon platform="genesis" className="w-4 h-4 mx-auto" />,
          isInstalled: !!g.is_installed,
          gameInstance: g,
        };
      }
      // 18. Sega Saturn
      if (platforms.some((p) => p.includes("saturn")) || emu.includes("saturn")) {
        return {
          id: "saturn",
          gameId: g.id,
          title: "Sega Saturn",
          label: "SATURN",
          icon: <PlatformIcon platform="saturn" className="w-4 h-4 mx-auto" />,
          isInstalled: !!g.is_installed,
          gameInstance: g,
        };
      }
      // 19. Sega Dreamcast
      if (platforms.some((p) => p.includes("dreamcast")) || emu.includes("dreamcast")) {
        return {
          id: "dreamcast",
          gameId: g.id,
          title: "Sega Dreamcast",
          label: "DREAMCAST",
          icon: <PlatformIcon platform="dreamcast" className="w-4 h-4 mx-auto" />,
          isInstalled: !!g.is_installed,
          gameInstance: g,
        };
      }
      // 20. Atari
      if (platforms.some((p) => p.includes("atari")) || emu.includes("atari")) {
        return {
          id: "atari",
          gameId: g.id,
          title: "Atari",
          label: "ATARI",
          icon: <PlatformIcon platform="atari" className="w-4 h-4 mx-auto" />,
          isInstalled: !!g.is_installed,
          gameInstance: g,
        };
      }
      // 21. Xbox 360
      if (platforms.some((p) => p.includes("360")) || emu.includes("360")) {
        return {
          id: "xbox360",
          gameId: g.id,
          title: "Xbox 360",
          label: "XBOX 360",
          icon: <PlatformIcon platform="xbox360" className="w-4 h-4 mx-auto" />,
          isInstalled: !!g.is_installed,
          gameInstance: g,
        };
      }

      // Generic Emulation fallback with exact name
      const consoleTitle = g.platforms?.[0] || "Emulation";
      const consoleLabel = consoleTitle.toUpperCase().replace(/\s+/g, " ").slice(0, 10);
      return {
        id: `emu_${consoleLabel.toLowerCase().replace(/[^a-z0-9]/g, "_")}`,
        gameId: g.id,
        title: consoleTitle,
        label: consoleLabel,
        icon: <PlatformIcon platform={consoleTitle} className="w-4 h-4 mx-auto" />,
        isInstalled: !!g.is_installed,
        gameInstance: g,
      };
    }

    return {
      id: "local",
      gameId: g.id,
      title: "PC (Local)",
      label: "LOCAL PC",
      icon: <PlatformIcon platform="local" className="w-4 h-4 mx-auto" />,
      isInstalled: !!g.is_installed,
      gameInstance: g,
    };
  }
}

export function getGamePlatformBadges(
  game: Game,
  achSummary?: { total_achievements?: number; unlocked_achievements?: number } | null
): GamePlatformBadge[] {
  const badges: GamePlatformBadge[] = [];
  const allInstances = [game, ...(game.sibling_games || [])];

  for (const inst of allInstances) {
    const badge = createBadgeForGame(inst);
    const existingIndex = badges.findIndex((b) => b.id === badge.id);
    if (existingIndex >= 0) {
      // If a badge for this platform already exists, keep the installed instance
      if (!badges[existingIndex].isInstalled && badge.isInstalled) {
        badges[existingIndex] = badge;
      }
    } else {
      badges.push(badge);
    }
  }

  // If this game has active RetroAchievements unlocked/total tracked, ensure a Retro indicator exists
  const hasRetroAchievements =
    achSummary &&
    (achSummary.total_achievements ?? 0) > 0 &&
    (game.source || "").toLowerCase().trim() === "local";

  if (hasRetroAchievements && !badges.some((b) => b.id === "retro")) {
    badges.push({
      id: "retro",
      gameId: game.id,
      title: "RetroAchievements",
      label: "RETRO",
      icon: <PlatformIcon platform="retroachievements" className="w-4 h-4 mx-auto text-amber-300" />,
      isInstalled: false, // Cloud linked platform
      gameInstance: game,
    });
  }

  return badges;
}

function renderScoreStars(score?: number) {
  if (score === undefined || score === null) return "★★★★★";
  const numStars = score <= 5 ? Math.round(score) : Math.round((score / 100) * 5);
  const clamped = Math.max(0, Math.min(5, numStars));
  return (
    <>
      <span className="text-white">{"★".repeat(clamped)}</span>
      {clamped < 5 && <span className="text-white/30">{"★".repeat(5 - clamped)}</span>}
    </>
  );
}

interface GameDetailsProps {
  game: Game;
  onLaunch: (game: Game, actionId?: string) => void;
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
  lastPlayedDateFormat?: "date_and_time" | "date_only";
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
  lastPlayedDateFormat = "date_and_time",
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

  // Steam news & changelog state
  const [newsItems, setNewsItems] = useState<SteamNewsItem[]>([]);
  const [isLoadingNews, setIsLoadingNews] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<SteamNewsItem | null>(null);

  // Play Actions / Dual Launch dropdown state
  const [isPlayActionsDropdownOpen, setIsPlayActionsDropdownOpen] = useState(false);
  const playActionsDropdownRef = useRef<HTMLDivElement>(null);

  // SteamGridDB Modal state
  const [isSteamGridDBOpen, setIsSteamGridDBOpen] = useState(false);

  // Context Menu state for "..." button
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const actionMenuRef = useRef<HTMLDivElement>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const heroSrc = resolveImageSrc(game.background_image);
  const logoSrc = resolveImageSrc(game.logo_image);
  const coverSrc = resolveGridCoverSrc(game.cover_image, 720);
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

    // 1. Fetch live player count (for all games via title resolution or native steamAppId)
    invoke<number>("get_game_current_players", {
      title: activeGame.title,
      appid: steamAppId,
    })
      .then((count) => setPlayerCount(count))
      .catch(() => setPlayerCount(null));

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

    // 3. Fetch News & Patch Notes (Supports Steam AppID directly + auto title resolution for non-Steam/backup games)
    setIsLoadingNews(true);
    invoke<SteamNewsItem[]>("get_game_news", {
      gameId: game.id,
      title: game.title,
      appid: steamAppId ? String(steamAppId) : null,
    })
      .then((items) => setNewsItems(items))
      .catch((e) => {
        console.warn("Game news fetch error:", e);
        setNewsItems([]);
      })
      .finally(() => setIsLoadingNews(false));
  }, [game.id, game.source_id, game.title]);

  // Keep HLTB widget synced when live refresh updates props on the same game
  useEffect(() => {
    setHltbData({
      main: game.hltb_main,
      extra: game.hltb_extra,
      completionist: game.hltb_completionist,
    });
  }, [game.hltb_main, game.hltb_extra, game.hltb_completionist]);

  // Achievement summary for completion status evaluation
  const platformBadges = useMemo(
    () => getGamePlatformBadges(game),
    [game]
  );

  // Active platform selector state (for merged multi-source games)
  const [selectedBadgeKey, setSelectedBadgeKey] = useState<string>("");

  useEffect(() => {
    // When game changes, pick installed badge first, or primary/first badge
    const installedBadge = platformBadges.find((b) => b.isInstalled);
    const primaryBadge = platformBadges[0];
    const initial = installedBadge
      ? installedBadge.id + "_" + installedBadge.gameId
      : primaryBadge
      ? primaryBadge.id + "_" + primaryBadge.gameId
      : "";
    setSelectedBadgeKey(initial);
  }, [game.id, platformBadges]);

  const activeBadge = useMemo(() => {
    if (!platformBadges || platformBadges.length === 0) return null;
    return (
      platformBadges.find((b) => b.id + "_" + b.gameId === selectedBadgeKey) ||
      platformBadges.find((b) => b.isInstalled) ||
      platformBadges[0]
    );
  }, [platformBadges, selectedBadgeKey]);

  const activeGame: Game = useMemo(() => {
    if (!activeBadge) return game;
    if (activeBadge.gameInstance) return activeBadge.gameInstance;
    if (activeBadge.gameId === game.id) return game;
    const found = game.sibling_games?.find((s) => s.id === activeBadge.gameId);
    return found || game;
  }, [game, activeBadge]);

  // Achievement summary for completion status evaluation (tracks currently active platform copy)
  const [achSummary, setAchSummary] = useState<{
    total_achievements: number;
    unlocked_achievements: number;
    is_perfect: boolean;
  } | null>(null);

  useEffect(() => {
    let active = true;
    setAchSummary(null);
    invoke<any>("get_game_achievement_summary", { gameId: activeGame.id })
      .then((res) => {
        if (active && res) {
          setAchSummary({
            total_achievements: res.total_achievements,
            unlocked_achievements: res.unlocked_achievements,
            is_perfect: res.is_perfect,
          });
        }
      })
      .catch(() => {
        if (active) setAchSummary(null);
      });
    return () => {
      active = false;
    };
  }, [activeGame.id]);

  const effectiveStatus = getEffectiveCompletionStatus(activeGame, achSummary);

  // Story Beaten Prompt Modal state
  const [isBeatenModalOpen, setIsBeatenModalOpen] = useState(false);
  const sessionDismissedBeatenPromptRef = useRef<Set<string>>(new Set());

  // Subtle auto-trigger when selecting the game if story hours reached
  useEffect(() => {
    if (shouldPromptBeatenModal(game) && !sessionDismissedBeatenPromptRef.current.has(game.id)) {
      const timer = window.setTimeout(() => {
        setIsBeatenModalOpen(true);
      }, 500);
      return () => window.clearTimeout(timer);
    }
  }, [game.id, game.playtime_seconds, game.hltb_main, game.auto_beaten, game.beaten_prompt_playtime]);

  const handleConfirmBeaten = () => {
    const updated: Game = {
      ...game,
      auto_beaten: true,
    };
    if (onUpdateGame) onUpdateGame(updated);
    setIsBeatenModalOpen(false);
  };

  const handleSnoozeBeaten = () => {
    const updated: Game = {
      ...game,
      beaten_prompt_playtime: game.playtime_seconds || 0,
    };
    sessionDismissedBeatenPromptRef.current.add(game.id);
    if (onUpdateGame) onUpdateGame(updated);
    setIsBeatenModalOpen(false);
  };

  const handleCloseBeatenModal = () => {
    sessionDismissedBeatenPromptRef.current.add(game.id);
    setIsBeatenModalOpen(false);
  };

  const handleDisableBeatenPrompts = () => {
    const updated: Game = {
      ...game,
      beaten_prompt_playtime: 999999999,
    };
    sessionDismissedBeatenPromptRef.current.add(game.id);
    if (onUpdateGame) onUpdateGame(updated);
    setIsBeatenModalOpen(false);
  };

  const handleUndoAutoBeaten = () => {
    const updated: Game = {
      ...game,
      auto_beaten: false,
      beaten_prompt_playtime: game.playtime_seconds || 0,
    };
    if (onUpdateGame) onUpdateGame(updated);
  };

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

  // Close Play Actions dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        playActionsDropdownRef.current &&
        !playActionsDropdownRef.current.contains(e.target as Node)
      ) {
        setIsPlayActionsDropdownOpen(false);
      }
    };
    if (isPlayActionsDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isPlayActionsDropdownOpen]);

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
    <div
      data-theme-part="game-details"
      className="relative flex-1 w-full h-full bg-transparent overflow-hidden select-text font-sans"
    >
      {/* Static bottom-fade mask wrapper (kept off the scrolling element so GPU tiled scroll compositing stays fast) */}
      <div
        className="w-full h-[calc(100%-80px)] overflow-hidden"
        style={{
          WebkitMaskImage:
            "linear-gradient(to bottom, black 0px, black calc(100% - 65px), rgba(0,0,0,0.8) calc(100% - 45px), rgba(0,0,0,0.35) calc(100% - 25px), rgba(0,0,0,0.08) calc(100% - 10px), transparent 100%)",
          maskImage:
            "linear-gradient(to bottom, black 0px, black calc(100% - 65px), rgba(0,0,0,0.8) calc(100% - 45px), rgba(0,0,0,0.35) calc(100% - 25px), rgba(0,0,0,0.08) calc(100% - 10px), transparent 100%)",
        }}
      >
        {/* Scrollable details container stopping above bottom bar, matching Playnite FusionX's Margin="0,0,0,64" */}
        <div
          ref={scrollContainerRef}
          className="w-full h-full overflow-y-auto pb-10"
        >
        {/* Top Hero Header - Strictly 96/31 Aspect Ratio & 50% Opacity Mask Fading */}
        <div
          data-theme-part="hero-banner"
          style={{ aspectRatio: "var(--theme-hero-aspect, 96 / 31)" }}
          className="relative w-full select-none mb-[100px]"
        >
          {/* Background Hero Art with Pure Alpha Mask Fading & Seamless Dual-Layer Morphing */}
          {(currentHero || prevHero) ? (
            <div
              data-theme-part="hero-backdrop"
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
                        decoding="async"
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
                        fetchPriority="high"
                        decoding="async"
                        className="w-full h-full object-cover opacity-50"
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {/* Prominent Title Logo Scaled Responsively Against Hero Banner (Max 50% width, 65% height) */}
          {logoSrc ? (
            <div
              key={`logo_${game.id}`}
              data-theme-part="hero-title-logo"
              className="absolute top-[30px] left-6 lg:top-[38px] lg:left-8 z-20 pointer-events-auto flex items-start animate-game-switch"
              style={{
                width: "var(--theme-logo-max-w, 50%)",
                maxWidth: "var(--theme-logo-max-w, 50%)",
                height: "var(--theme-logo-max-h, 65%)",
                maxHeight: "var(--theme-logo-max-h, 65%)",
              }}
            >
              {logoSrc.endsWith(".webm") || logoSrc.endsWith(".mp4") ? (
                <video
                  src={logoSrc}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full max-w-full max-h-full object-contain object-left-top drop-shadow-[0_6px_24px_rgba(0,0,0,0.95)]"
                />
              ) : (
                <img
                  src={logoSrc}
                  alt={game.title}
                  decoding="async"
                  className="w-full h-full max-w-full max-h-full object-contain object-left-top drop-shadow-[0_6px_24px_rgba(0,0,0,0.95)]"
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
            data-theme-part="hero-meta"
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
                    width={16}
                    height={16}
                    decoding="async"
                    className="w-4 h-4 rounded object-contain shrink-0 drop-shadow"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                ) : (
                  <PlatformIcon platform={game.platforms?.[0] || game.source} className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                )}
                <h1 className="text-sm sm:text-base font-bold uppercase tracking-wider text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] truncate">
                  {game.title}
                </h1>
              </div>

              {/* Ratings, Year, Platform Row - Clean Playnite aesthetic */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-200 font-semibold drop-shadow">
                {/* User Score / Personal Rating */}
                {game.user_rating ? (
                  <div
                    onClick={() => onOpenEdit(game)}
                    className="flex items-center space-x-1 text-white cursor-pointer hover:opacity-80 transition-opacity"
                    title={`User Score: ${game.user_rating} (Click to edit)`}
                  >
                    <span className="tracking-tighter text-xs">
                      {renderScoreStars(game.user_rating)}
                    </span>
                    <span className="font-bold text-white text-xs">{game.user_rating}</span>
                  </div>
                ) : null}

                {/* Community Score / Star Rating */}
                {game.community_score ? (
                  <div
                    className="flex items-center space-x-1 text-white"
                    title={`Community Score: ${game.community_score}%`}
                  >
                    <span className="tracking-tighter text-xs">
                      {renderScoreStars(game.community_score)}
                    </span>
                    <span className="font-bold text-white text-xs">{game.community_score}</span>
                  </div>
                ) : null}

                {/* Critic Score / Metacritic */}
                {game.critic_score ? (
                  <div
                    className="flex items-center space-x-1 text-white"
                    title={`Critic Score: ${game.critic_score}`}
                  >
                    <span className="tracking-tighter text-xs">
                      {renderScoreStars(game.critic_score)}
                    </span>
                    <span className="font-bold text-white text-xs">{game.critic_score}</span>
                  </div>
                ) : null}

                {/* Release Year */}
                {formatReleaseYear(game.release_date) && (
                  <span className="text-slate-300 font-semibold text-xs">
                    {formatReleaseYear(game.release_date)}
                  </span>
                )}

                {/* Platform */}
                <span className="text-slate-400">·</span>
                <span className="text-slate-300 font-semibold text-[11px] uppercase tracking-wide">
                  {game.platforms && game.platforms.length > 0
                    ? game.platforms.join(", ")
                    : "PC (WINDOWS)"}
                </span>

                {/* Not Installed Cloud Badge */}
                {!activeGame.is_installed && (
                  <span className="px-2 py-0.5 rounded bg-black/60 border border-slate-700 text-slate-300 text-[10px] font-bold flex items-center space-x-1 shadow-sm">
                    <Cloud className="w-3 h-3 text-slate-400" />
                    <span>NOT INSTALLED ({activeGame.source.toUpperCase()})</span>
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
                      className={`px-2.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider shadow-sm transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-white text-zinc-950 font-black ring-1 ring-white"
                          : "bg-black/35 border border-white/15 text-white hover:bg-white/15 hover:border-white/30"
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
              <div data-theme-part="platform-cells" className="flex items-center space-x-2 justify-end pb-0.5">
                {/* Live In-Game Player Count Box */}
                {playerCount !== null && (
                  <div
                    title="Live active concurrent players"
                    className="w-14 h-12 bg-black/35 border border-white/15 hover:border-white/25 rounded-xl flex flex-col items-center justify-center p-1 shadow-lg text-center transition-colors"
                  >
                    <div className="text-[11px] font-bold text-white font-mono leading-none">
                      {playerCount > 9999 ? `${Math.round(playerCount / 1000)}k` : playerCount}
                    </div>
                    <div className="text-[7px] font-bold text-emerald-400 tracking-wider uppercase mt-1">
                      IN-GAME
                    </div>
                  </div>
                )}

                {/* Platform / Source Badges (Supports Merged Multi-Platform games) */}
                {platformBadges.map((plat) => {
                  const badgeKey = plat.id + "_" + plat.gameId;
                  const isActive = activeBadge
                    ? activeBadge.id + "_" + activeBadge.gameId === badgeKey
                    : false;
                  return (
                    <button
                      key={badgeKey}
                      type="button"
                      onClick={() => setSelectedBadgeKey(badgeKey)}
                      title={
                        plat.isInstalled
                          ? `${plat.title} (Installed on PC) — Click to select`
                          : `${plat.title} (Cloud / Not Installed) — Click to select`
                      }
                      className={`w-14 h-12 rounded-xl flex flex-col items-center justify-center p-1 text-center transition-all cursor-pointer ${
                        isActive
                          ? "bg-white/20 border-2 border-white shadow-[0_0_15px_rgba(255,255,255,0.35)] text-white scale-105"
                          : plat.isInstalled
                          ? "bg-white/[0.08] border border-white/50 text-white/90 hover:opacity-100 opacity-80 hover:bg-white/[0.12]"
                          : "bg-black/35 border border-white/10 hover:border-white/20 text-slate-400 opacity-60 hover:opacity-90"
                      }`}
                    >
                      {plat.icon}
                      <div
                        className={`text-[7px] font-bold tracking-wider uppercase mt-1 truncate max-w-full px-0.5 ${
                          isActive
                            ? "text-white font-black"
                            : plat.isInstalled
                            ? "text-slate-100"
                            : "text-slate-400"
                        }`}
                      >
                        {plat.label}
                      </div>
                    </button>
                  );
                })}
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
                className="group relative w-[170px] sm:w-[185px] lg:w-[200px] aspect-[2/3] rounded-xl overflow-hidden shadow-2xl transition-shadow cursor-pointer hover:ring-1 hover:ring-white/40 hover:shadow-black/80 bg-black/40 shrink-0 border-0 isolated-widget"
              >
                {/* FusionX Corner-to-Corner Shine Overlay */}
                <div className="card-shine-container">
                  <div className="card-shine-beam" />
                </div>

                {coverSrc ? (
                  coverSrc.endsWith(".webm") || coverSrc.endsWith(".mp4") ? (
                    <video
                      src={coverSrc}
                      poster={getStaticFallbackCover(coverSrc)}
                      autoPlay
                      loop
                      muted
                      playsInline
                      width={400}
                      height={600}
                      className="w-full h-full object-cover pointer-events-none"
                    />
                  ) : (
                    <img
                      src={coverSrc}
                      alt={game.title}
                      width={400}
                      height={600}
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  )
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 p-2 text-center">
                    <PlatformIcon platform={game.platforms?.[0] || game.source} className="w-8 h-8 mb-1" />
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
                <div className="isolated-widget relative rounded-xl overflow-hidden border border-white/10 shadow-xl bg-black/65 aspect-video flex items-center justify-center group">
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
                        loop
                        className="w-full h-full object-cover rounded-xl"
                      />
                    );
                  })()}

                  {/* Watermark Badges */}
                  {game.age_rating && (
                    <div className="absolute bottom-3 left-3 px-2 py-0.5 rounded-md bg-black/85 border border-white/10 text-slate-200 font-extrabold text-[11px] shadow-md flex items-center space-x-1 pointer-events-none">
                      <ShieldAlert className="w-3 h-3 text-slate-400" />
                      <span>{game.age_rating}</span>
                    </div>
                  )}

                  {/* Edit Trailer Button Overlay (Hover) */}
                  <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                    <button
                      onClick={() => (onOpenTrailers ? onOpenTrailers(game) : setIsTrailerModalOpen(true))}
                      title="Manage Trailers"
                      className="px-2.5 py-1 rounded-lg bg-black/85 hover:bg-black text-white text-[10px] font-bold border border-white/20 shadow-md flex items-center space-x-1 cursor-pointer"
                    >
                      <Film className="w-3 h-3 theme-accent-text" />
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
            <div data-theme-part="details-tabs" className="border-b border-white/10 flex items-center space-x-8 select-none pt-2">
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
                  <div
                    className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full shadow-sm"
                    style={{ backgroundColor: "var(--app-accent-color, #ffffff)" }}
                  />
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
                  <div
                    className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full shadow-sm"
                    style={{ backgroundColor: "var(--app-accent-color, #ffffff)" }}
                  />
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
                  <div
                    className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full shadow-sm"
                    style={{ backgroundColor: "var(--app-accent-color, #ffffff)" }}
                  />
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
                <AchievementsTab key={activeGame.id} game={activeGame} />
              )}

              {/* Tab 3: News & Activity Feed (Terraria Style) */}
              {activeTab === "news" && (
                <div className="space-y-5">
                  {isLoadingNews ? (
                    <div className="flex flex-col items-center justify-center py-16 space-y-3 text-zinc-400 text-xs">
                      <Loader2 className="w-6 h-6 animate-spin theme-accent-text" />
                      <span>Fetching latest news and patch notes...</span>
                    </div>
                  ) : newsItems.length === 0 ? (
                    <div className="p-8 bg-black/35 border border-white/10 rounded-2xl text-center space-y-2">
                      <Newspaper className="w-8 h-8 text-zinc-600 mx-auto" />
                      <p className="text-xs text-zinc-400">
                        No news articles or changelogs found for this game.
                      </p>
                      {steamAppId && (
                        <button
                          onClick={() =>
                            handleOpenLink(`https://store.steampowered.com/news/app/${steamAppId}`)
                          }
                          className="text-xs text-zinc-300 hover:text-white underline inline-flex items-center space-x-1 cursor-pointer"
                        >
                          <span>Open Steam News Hub</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Top Featured Hero Card */}
                      {(() => {
                        const featured = newsItems[0];
                        const bannerImg = featured.image_url || featured.banner_image;
                        return (
                          <div
                            onClick={() => setSelectedArticle(featured)}
                            className="isolated-widget group relative rounded-2xl overflow-hidden border border-white/10 bg-black/45 hover:border-white/25 shadow-2xl transition-colors cursor-pointer"
                          >
                            {bannerImg && (
                              <div className="relative w-full aspect-[21/9] sm:aspect-[2.4/1] max-h-[280px] overflow-hidden bg-black/60">
                                <img
                                  src={bannerImg}
                                  alt=""
                                  decoding="async"
                                  onError={(e) => {
                                    const el = e.currentTarget;
                                    el.style.display = "none";
                                    const parent = el.parentElement;
                                    if (parent) parent.style.display = "none";
                                  }}
                                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-[#0e0e11] via-black/40 to-transparent" />
                              </div>
                            )}

                            <div className="p-5 sm:p-6 space-y-3">
                              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                <div className="flex items-center space-x-2">
                                  <span
                                    className="px-2.5 py-0.5 rounded-full font-extrabold text-[10px] tracking-wider uppercase border"
                                    style={{
                                      backgroundColor: "color-mix(in srgb, var(--app-accent-color, #783efe) 20%, transparent)",
                                      borderColor: "color-mix(in srgb, var(--app-accent-color, #783efe) 35%, transparent)",
                                      color: "var(--app-accent-color, #783efe)",
                                    }}
                                  >
                                    {featured.category || "MAJOR UPDATE"}
                                  </span>
                                  <span className="text-zinc-400 font-mono text-[11px]">
                                    {new Date(featured.date * 1000).toLocaleDateString(undefined, {
                                      year: "numeric",
                                      month: "short",
                                      day: "numeric",
                                    })}
                                  </span>
                                </div>
                                <span className="text-[11px] text-zinc-500">
                                  By {featured.author}
                                </span>
                              </div>

                              <h3 className="text-base sm:text-lg font-black text-white transition-colors line-clamp-2">
                                {featured.title}
                              </h3>

                              <p className="text-xs text-zinc-300 leading-relaxed line-clamp-3">
                                {formatNewsExcerpt(featured.contents)}
                              </p>

                              <div className="pt-2 flex items-center justify-between">
                                <span
                                  className="text-xs font-bold flex items-center space-x-1.5"
                                  style={{ color: "var(--app-accent-color, #783efe)" }}
                                >
                                  <span>Read Full Changelog</span>
                                  <span>→</span>
                                </span>
                                {featured.url && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenLink(featured.url);
                                    }}
                                    className="text-[11px] text-zinc-400 hover:text-white flex items-center space-x-1 cursor-pointer"
                                  >
                                    <span>Steam Hub</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Subsequent News & Activity Cards */}
                      {newsItems.length > 1 && (
                        <div className="space-y-3">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 pt-2 border-t border-white/10">
                            Recent Events & Updates
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                            {newsItems.slice(1).map((item) => {
                              const bannerImg = item.image_url || item.banner_image;
                              return (
                                <div
                                  key={item.gid}
                                  onClick={() => setSelectedArticle(item)}
                                  className="isolated-widget group p-4 bg-black/40 border border-white/10 hover:border-white/20 rounded-2xl space-y-2.5 transition-colors shadow-md cursor-pointer hover:bg-black/55 flex flex-col justify-between"
                                >
                                  <div className="space-y-2">
                                    {bannerImg && (
                                      <div className="w-full aspect-[16/9] max-h-[140px] rounded-xl overflow-hidden border border-white/5 bg-black/40 mb-2">
                                        <img
                                          src={bannerImg}
                                          alt=""
                                          loading="lazy"
                                          decoding="async"
                                          onError={(e) => {
                                            const el = e.currentTarget;
                                            el.style.display = "none";
                                            const parent = el.parentElement;
                                            if (parent) parent.style.display = "none";
                                          }}
                                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                        />
                                      </div>
                                    )}
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="px-2 py-0.5 rounded-full bg-white/10 text-zinc-300 font-bold text-[10px] uppercase tracking-wider">
                                        {item.category || item.feedlabel || "Update"}
                                      </span>
                                      <span className="text-zinc-500 font-mono text-[11px]">
                                        {new Date(item.date * 1000).toLocaleDateString(undefined, {
                                          month: "short",
                                          day: "numeric",
                                          year: "numeric",
                                        })}
                                      </span>
                                    </div>
                                    <h5 className="text-xs font-bold text-white group-hover:theme-accent-text transition-colors line-clamp-2">
                                      {item.title}
                                    </h5>
                                    <p className="text-[11px] text-zinc-400 leading-relaxed line-clamp-2">
                                      {formatNewsExcerpt(item.contents)}
                                    </p>
                                  </div>
                                  <div className="pt-2 flex items-center justify-between border-t border-white/5 text-[11px]">
                                    <span
                                      className="font-medium hover:underline"
                                      style={{ color: "var(--app-accent-color, #783efe)" }}
                                    >
                                      View Article
                                    </span>
                                    <span className="text-zinc-500">By {item.author}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
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
            <div className="isolated-widget bg-black/25 border border-white/10 rounded-xl p-4 shadow-xl space-y-3 select-none text-xs">
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
                    {formatLastPlayed(activeGame.last_played, lastPlayedDateFormat)}
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
                    onClick={() => onToggleSource?.(activeGame.source)}
                    title={`Filter by ${activeGame.source}`}
                    className={`px-2 py-0.5 rounded border text-[11px] font-semibold text-right transition-all cursor-pointer ${
                      selectedSources?.includes(activeGame.source)
                        ? "bg-white text-zinc-950 font-bold border-white"
                        : "bg-white/5 border-white/10 text-slate-200 hover:bg-white/15 hover:text-white"
                    }`}
                  >
                    {activeGame.source}
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

                {/* User Score */}
                {game.user_rating ? (
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="text-slate-400 flex items-center space-x-1.5 shrink-0">
                      <Star className="w-3 h-3 text-slate-400" />
                      <span>User Score</span>
                    </span>
                    <span className="text-slate-200 font-bold font-mono text-right">
                      {game.user_rating}
                    </span>
                  </div>
                ) : null}

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
                {(game.install_directory || game.executable_path) && (
                  <div className="pt-2 border-t border-white/10 space-y-1">
                    <div className="text-slate-400 text-[10px] flex items-center space-x-1">
                      <HardDrive className="w-3 h-3 text-slate-400" />
                      <span>Installation Folder</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const target =
                          game.install_directory ||
                          (game.executable_path
                            ? game.executable_path.substring(
                                0,
                                Math.max(
                                  game.executable_path.lastIndexOf("\\"),
                                  game.executable_path.lastIndexOf("/")
                                )
                              )
                            : "");
                        if (target) {
                          invoke("open_in_explorer", { path: target }).catch((err) =>
                            console.warn("Failed to open explorer:", err)
                          );
                        }
                      }}
                      title={`Click to open in Explorer: ${game.install_directory || game.executable_path}`}
                      className="text-[10px] text-slate-400 hover:text-white font-mono truncate text-left w-full transition-colors cursor-pointer block"
                    >
                      {game.install_directory || game.executable_path}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* 3. Quick Achievements Showcase Widget */}
            <AchievementsQuickWidget
              key={activeGame.id}
              game={activeGame}
              onOpenFullAchievements={() => setActiveTab("achievements")}
            />
          </div>
        </div>
      </div>
      </div>

      {/* Floating Bottom Stats & Action Launch Bar - Exactly matching Playnite FusionX: No Black Box, No Border Line, Scaled Controls (~200x48 Play button, w-12 buttons, large stats) */}
      <div data-theme-part="floating-action-bar" className="absolute bottom-0 inset-x-0 h-20 px-6 lg:px-8 pb-4 flex items-end justify-between select-none z-30 pointer-events-none bg-transparent">
        {/* Left Side: Stats (Completion Status, Last Played, Time Played - Clean and Scaled to Match Bottom Bar Enlargement) */}
        <div
          key={`stats_${activeGame.id}`}
          className="flex items-center space-x-10 text-slate-300 pointer-events-auto animate-game-switch"
        >
          {/* Completion Status */}
          <div className="flex items-center space-x-3">
            {effectiveStatus.iconName === "Crown" && <Crown className="w-6 h-6 text-amber-400 shrink-0" />}
            {effectiveStatus.iconName === "ShieldCheck" && <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0" />}
            {effectiveStatus.iconName === "Target" && <Target className="w-6 h-6 text-purple-400 shrink-0" />}
            {effectiveStatus.iconName === "Flame" && <Flame className="w-6 h-6 text-cyan-400 shrink-0" />}
            {effectiveStatus.iconName === "Clock" && <Clock className="w-6 h-6 text-orange-400 shrink-0" />}
            {effectiveStatus.iconName === "CircleDot" && <CircleDot className="w-6 h-6 text-slate-400 shrink-0" />}
            <div>
              <div className="text-xs text-slate-400 uppercase font-bold tracking-wider flex items-center space-x-1.5">
                <span>Completion Status</span>
                {effectiveStatus.isAuto && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-zinc-300 font-mono font-medium tracking-normal border border-white/10">
                    Auto
                  </span>
                )}
              </div>
              <div className="font-extrabold text-slate-100 text-base">
                {effectiveStatus.status}
              </div>
            </div>
          </div>

          {/* Last Played */}
          <div className="flex items-center space-x-3">
            <Calendar className="w-6 h-6 text-slate-400 shrink-0" />
            <div>
              <div className="text-xs text-slate-400 uppercase font-bold tracking-wider">Last Played</div>
              <div className="font-extrabold text-slate-100 font-mono text-base">
                {formatLastPlayed(activeGame.last_played, lastPlayedDateFormat)}
              </div>
            </div>
          </div>

          {/* Time Played */}
          <div className="flex items-center space-x-3">
            <Clock className="w-6 h-6 text-slate-400 shrink-0" />
            <div>
              <div className="text-xs text-slate-400 uppercase font-bold tracking-wider">Time Played</div>
              <div className="font-extrabold text-slate-100 font-mono text-base">
                {formatPlaytime(activeGame.playtime_seconds)}
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
            className={`w-12 h-12 rounded-full border transition-colors flex items-center justify-center cursor-pointer shadow-lg group ${
              game.is_favorite
                ? "bg-amber-400/15 text-amber-400 border-amber-400/30 hover:bg-amber-400/25 hover:border-amber-400/50"
                : "bg-white/[0.07] text-slate-300 border-white/10 hover:text-white hover:bg-white/15"
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
              className={`w-12 h-12 rounded-full border transition-colors flex items-center justify-center cursor-pointer shadow-lg ${
                isActionMenuOpen
                  ? "bg-white/20 text-white border-white/40"
                  : "bg-white/[0.07] text-slate-300 border-white/10 hover:text-white hover:bg-white/15"
              }`}
            >
              <MoreHorizontal className="w-4.5 h-4.5" />
            </button>

            {/* Context Dropdown Popover */}
            {isActionMenuOpen && (
              <div className="absolute bottom-full right-0 mb-3 w-56 theme-panel-surface backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-1.5 z-50 text-xs space-y-0.5 animate-in fade-in slide-in-from-bottom-2 duration-150">
                <button
                  onClick={() => {
                    setIsTrailerModalOpen(true);
                    setIsActionMenuOpen(false);
                  }}
                  className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-left text-slate-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <Film className="w-4 h-4 theme-accent-text shrink-0" />
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

                {effectiveStatus.isAuto && (
                  <button
                    onClick={() => {
                      if (game.auto_beaten) {
                        handleUndoAutoBeaten();
                      } else {
                        setIsBeatenModalOpen(true);
                      }
                      setIsActionMenuOpen(false);
                    }}
                    className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-left text-slate-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <ShieldCheck className={`w-4 h-4 shrink-0 ${game.auto_beaten ? "text-zinc-400" : "text-emerald-400"}`} />
                    <span>{game.auto_beaten ? "Undo Story Beaten" : "Claim Story Beaten (Auto)"}</span>
                  </button>
                )}

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
            className="w-12 h-12 rounded-full bg-white/[0.07] hover:bg-white/15 text-slate-300 hover:text-white border border-white/10 flex items-center justify-center transition-colors cursor-pointer shadow-lg"
          >
            <Settings className="w-4.5 h-4.5" />
          </button>

          {/* 4. Big Play / Dual Launch Split 80/20 Button */}
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
          ) : !activeGame.is_installed ? (
            <button
              onClick={async () => {
                try {
                  await invoke("install_game", { gameId: activeGame.id });
                } catch (e) {
                  onLaunch(activeGame);
                }
              }}
              disabled={isLaunching}
              className="w-[200px] h-12 rounded-full flex items-center justify-center space-x-2.5 text-sm font-black tracking-wider uppercase transition-all shadow-xl cursor-pointer bg-white text-slate-950 play-btn-glow"
            >
              <Download className="w-4.5 h-4.5" />
              <span>Install</span>
            </button>
          ) : activeGame.play_actions && activeGame.play_actions.length > 0 ? (
            /* 80/20 Split Play Button for Games with Multiple Play Actions */
            <div className="relative" ref={playActionsDropdownRef}>
              <div className="w-[220px] h-12 rounded-full flex overflow-hidden shadow-xl play-btn-glow bg-white text-slate-950 font-black">
                {/* 80% Play Primary Action */}
                <button
                  onClick={() => {
                    const primary = activeGame.play_actions?.find((a) => a.is_primary);
                    onLaunch(activeGame, primary?.id);
                  }}
                  disabled={isLaunching}
                  className="flex-1 h-full flex items-center justify-center space-x-2 px-3 text-sm tracking-wider uppercase transition-colors hover:bg-zinc-200 cursor-pointer disabled:opacity-50"
                >
                  {isLaunching ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                      <span>LAUNCHING...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4.5 h-4.5 fill-slate-950 text-slate-950" />
                      <span>Play</span>
                    </>
                  )}
                </button>

                {/* 1px Vertical Divider */}
                <div className="w-px h-6 bg-slate-950/20 self-center" />

                {/* 20% Action Dropdown Toggle */}
                <button
                  onClick={() => setIsPlayActionsDropdownOpen(!isPlayActionsDropdownOpen)}
                  title="Choose launch configuration"
                  className="w-11 h-full flex items-center justify-center hover:bg-zinc-200 transition-colors cursor-pointer"
                >
                  <ChevronDown
                    className={`w-4 h-4 text-slate-950 transition-transform ${
                      isPlayActionsDropdownOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
              </div>

              {/* Play Actions Dropdown Menu */}
              {isPlayActionsDropdownOpen && (
                <div className="absolute bottom-full right-0 mb-3 w-64 theme-panel-surface backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl p-2 z-50 text-xs space-y-1 animate-in fade-in slide-in-from-bottom-2 duration-150">
                  <div className="px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider text-zinc-500">
                    Launch Configurations
                  </div>

                  {/* Standard Launch Option */}
                  <button
                    onClick={() => {
                      setIsPlayActionsDropdownOpen(false);
                      onLaunch(activeGame);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-zinc-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center space-x-2 truncate pr-2">
                      <Play className="w-3.5 h-3.5 text-emerald-400 shrink-0 fill-emerald-400" />
                      <span className="truncate font-semibold">Standard Launch</span>
                    </div>
                  </button>

                  {/* Configured Actions */}
                  {activeGame.play_actions.map((act) => (
                    <button
                      key={act.id}
                      onClick={() => {
                        setIsPlayActionsDropdownOpen(false);
                        onLaunch(activeGame, act.id);
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-zinc-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center space-x-2 truncate pr-2">
                        <Play className="w-3.5 h-3.5 theme-accent-text shrink-0 group-hover:fill-[var(--app-accent-color)]" />
                        <span className="truncate font-semibold">{act.name}</span>
                      </div>
                      {act.is_primary && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded theme-accent-pill font-mono shrink-0">
                          Primary
                        </span>
                      )}
                    </button>
                  ))}

                  <div className="my-1 border-t border-white/10" />

                  <button
                    onClick={() => {
                      setIsPlayActionsDropdownOpen(false);
                      onOpenEdit(game);
                    }}
                    className="w-full flex items-center space-x-2 px-3 py-1.5 rounded-xl text-left text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer text-[11px]"
                  >
                    <Settings className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Manage Actions...</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Single Large Play Button when no custom play_actions are configured */
            <button
              onClick={() => onLaunch(activeGame)}
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
                  <span>LAUNCHING...</span>
                </>
              ) : (
                <>
                  <Play className="w-4.5 h-4.5 fill-slate-950 text-slate-950" />
                  <span>Play</span>
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
          className="fixed inset-0 z-50 flex items-center justify-center theme-modal-backdrop p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm theme-modal-container rounded-2xl p-5 shadow-2xl space-y-4 text-center select-none"
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

      {/* Steam News Article & Patch Notes Reader Modal */}
      {selectedArticle && (
        <NewsArticleModal
          article={selectedArticle}
          gameTitle={game.title}
          onClose={() => setSelectedArticle(null)}
        />
      )}

      {/* Story Beaten Confirmation & Snooze Modal */}
      <StoryBeatenModal
        game={game}
        isOpen={isBeatenModalOpen}
        onClose={handleCloseBeatenModal}
        onConfirmBeaten={handleConfirmBeaten}
        onSnooze={handleSnoozeBeaten}
        onDisablePrompts={handleDisableBeatenPrompts}
      />
    </div>
  );
};
