import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Play,
  Download,
  Info,
  MoreHorizontal,
  Search,
  Trophy,
  Menu,
  LayoutGrid,
  GalleryHorizontalEnd,
  Star,
  Clock,
  HardDrive,
  SlidersHorizontal,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  Calendar,
  Cloud,
  Check,
  RotateCcw,
  Crown,
  ShieldCheck,
  Target,
  Flame,
  CircleDot,
  Sparkles,
  User,
  Tag,
  Building2,
  ShieldAlert,
  FolderOpen,
} from "lucide-react";
import { Game } from "../../types/game";
import { ConsoleProfile } from "../../types/config";
import { invoke } from "../../utils/ipc";
import { resolveGameAchievementSummary } from "../../utils/merger";
import {
  formatFileSize,
  formatPlaytime,
  getStaticFallbackCover,
  isVideoSrc,
  resolveGridCoverSrc,
  resolveImageSrc,
} from "../../utils/image";
import { formatLastPlayed, formatReleaseYear, parseLastPlayedMs } from "../../utils/date";
import { getEffectiveCompletionStatus } from "../../utils/completionStatus";
import { PlatformIcon } from "../icons/PlatformIcons";
import { HowLongToBeatWidget } from "../HowLongToBeatWidget";
import { AchievementsQuickWidget } from "../AchievementsQuickWidget";
import { SteamDescription } from "../SteamDescription";
import { VideoPlayer } from "../VideoPlayer";
import { getYouTubeEmbedUrl } from "../TrailerModal";
import { UltrawideMediaStage } from "./UltrawideMediaStage";
import { useGamepad } from "../../contexts/GamepadContext";
import { ControllerGlyph } from "../gamepad/ControllerGlyph";
import {
  playBack,
  playConfirm,
  playLaunch,
  playNavTick,
  playTabSwitch,
} from "../../utils/consoleSounds";

export type ConsoleHomeViewMode = "carousel" | "grid";
export type ConsoleSortOption =
  | "recent"
  | "playtime"
  | "title"
  | "release_date"
  | "date_added"
  | "rating";

export interface ConsoleAchievementSummaryLite {
  total_achievements: number;
  unlocked_achievements: number;
  is_perfect: boolean;
}

interface ConsoleHomeProps {
  games: Game[];
  runningGameId: string | null;
  launchingGameId: string | null;
  activeProfile: ConsoleProfile | null;
  achievementSummaryMap: Record<string, ConsoleAchievementSummaryLite>;
  lastPlayedDateFormat?: "date_and_time" | "date_only";
  selectedGameId: string | null;
  onSelectGameId: (id: string | null) => void;
  viewMode: ConsoleHomeViewMode;
  onViewModeChange: (mode: ConsoleHomeViewMode) => void;
  activePreset: string;
  onPresetChange: (preset: string) => void;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  sortBy: ConsoleSortOption;
  onSortByChange: (sort: ConsoleSortOption) => void;
  sortDirection: "asc" | "desc";
  onSortDirectionChange: (dir: "asc" | "desc") => void;
  onOpenDetails: (game: Game) => void;
  onLaunchGame: (game: Game) => void;
  onInstallGame: (game: Game) => void;
  onOpenGameOptions: (game: Game) => void;
  onOpenSystemMenu: () => void;
  onOpenProfileSwitch: () => void;
  onOpenAchievementHub: () => void;
  onRequestHydrateGame?: (gameId: string, siblingIds?: string[]) => void;
  isOverlayActive: boolean;
}

const SORT_OPTIONS: Array<{ key: ConsoleSortOption; label: string }> = [
  { key: "recent", label: "Last Played" },
  { key: "playtime", label: "Total Playtime" },
  { key: "title", label: "Title (A–Z)" },
  { key: "release_date", label: "Release Date" },
  { key: "date_added", label: "Date Added" },
  { key: "rating", label: "Community Rating" },
];

function renderStatusIcon(iconName: string, className = "w-3 h-3") {
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

function formatHltbShort(hours?: number): string | null {
  if (!hours || hours <= 0) return null;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export const ConsoleHome: React.FC<ConsoleHomeProps> = ({
  games,
  runningGameId,
  launchingGameId,
  activeProfile,
  achievementSummaryMap,
  lastPlayedDateFormat = "date_and_time",
  selectedGameId,
  onSelectGameId,
  viewMode,
  onViewModeChange,
  activePreset,
  onPresetChange,
  searchQuery,
  onSearchQueryChange,
  sortBy,
  onSortByChange,
  sortDirection,
  onSortDirectionChange,
  onOpenDetails,
  onLaunchGame,
  onInstallGame,
  onOpenGameOptions,
  onOpenSystemMenu,
  onOpenProfileSwitch,
  onOpenAchievementHub,
  onRequestHydrateGame,
  isOverlayActive,
}) => {
  const {
    glyphProfile,
    isControllerActive,
    customBindings,
    nintendoSwap,
    openVirtualKeyboard,
  } = useGamepad();

  const [nowTime, setNowTime] = useState(() => formatClock());
  const [searchBarOpen, setSearchBarOpen] = useState(false);

  // LS Click (Filter Modal) & RS Click (Sort Modal)
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isSortModalOpen, setIsSortModalOpen] = useState(false);
  const [filterTab, setFilterTab] = useState<"genres" | "developers" | "sources">("genres");
  const [filterFavoritesOnly, setFilterFavoritesOnly] = useState(false);
  const [filterInstallState, setFilterInstallState] = useState<"all" | "installed" | "uninstalled">("all");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedDevelopers, setSelectedDevelopers] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);

  const carouselContainerRef = useRef<HTMLDivElement>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const gridDetailsScrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const cardRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Shared IntersectionObserver so EVERY visible animated video cover plays smoothly (just like Desktop GameGrid!)
  const videoElementsMapRef = useRef<Map<HTMLElement, HTMLVideoElement>>(new Map());
  const videoObserverRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const video = videoElementsMapRef.current.get(entry.target as HTMLElement);
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
      { rootMargin: "180px" }
    );
    videoObserverRef.current = observer;
    return () => {
      observer.disconnect();
      videoObserverRef.current = null;
      videoElementsMapRef.current.clear();
    };
  }, [viewMode]);

  const registerVideoCard = useCallback(
    (cardEl: HTMLElement | null, videoEl: HTMLVideoElement | null) => {
      if (!cardEl) return;
      const obs = videoObserverRef.current;
      if (videoEl) {
        videoElementsMapRef.current.set(cardEl, videoEl);
        obs?.observe(cardEl);
      } else {
        videoElementsMapRef.current.delete(cardEl);
        obs?.unobserve(cardEl);
      }
    },
    []
  );

  useEffect(() => {
    const id = window.setInterval(() => setNowTime(formatClock()), 15000);
    return () => window.clearInterval(id);
  }, []);

  // Build available filter facets (same as Desktop)
  const { availableGenres, availableDevelopers, availableSources } = useMemo(() => {
    const genreMap = new Map<string, number>();
    const devMap = new Map<string, number>();
    const sourceMap = new Map<string, number>();

    for (const g of games) {
      if (g.is_hidden) continue;
      for (const genre of g.genres || []) {
        if (genre) genreMap.set(genre, (genreMap.get(genre) || 0) + 1);
      }
      if (g.developer) {
        devMap.set(g.developer, (devMap.get(g.developer) || 0) + 1);
      }
      if (g.source) {
        sourceMap.set(g.source, (sourceMap.get(g.source) || 0) + 1);
      }
      for (const sib of g.sibling_games || []) {
        if (sib.source && sib.source !== g.source) {
          sourceMap.set(sib.source, (sourceMap.get(sib.source) || 0) + 1);
        }
      }
    }

    const toSorted = (m: Map<string, number>) =>
      Array.from(m.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    return {
      availableGenres: toSorted(genreMap),
      availableDevelopers: toSorted(devMap),
      availableSources: toSorted(sourceMap),
    };
  }, [games]);

  const activeFilterCount =
    (filterFavoritesOnly ? 1 : 0) +
    (filterInstallState !== "all" ? 1 : 0) +
    selectedGenres.length +
    selectedDevelopers.length +
    selectedSources.length;

  const resetAllFilters = () => {
    setFilterFavoritesOnly(false);
    setFilterInstallState("all");
    setSelectedGenres([]);
    setSelectedDevelopers([]);
    setSelectedSources([]);
  };

  // Build dynamic LB/RB presets
  const presets = useMemo(() => {
    const base = [
      { id: "all", label: "All Games" },
      { id: "installed", label: "Installed" },
      { id: "favorites", label: "Favorites" },
    ];
    const sources = new Set<string>();
    for (const g of games) {
      if (g.is_hidden) continue;
      if (g.source && g.source.trim()) {
        sources.add(g.source.trim());
      }
    }
    const sortedSources = Array.from(sources).sort((a, b) => a.localeCompare(b));
    for (const s of sortedSources) {
      base.push({ id: `source:${s}`, label: s });
    }
    return base;
  }, [games]);

  // Filter + sort games (with Desktop parity!)
  const visibleGames = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = games.filter((g) => {
      if (g.is_hidden) return false;
      const hasInstalled =
        g.is_installed || Boolean(g.sibling_games?.some((s) => s.is_installed));

      if (activePreset === "installed" && !hasInstalled) return false;
      if (activePreset === "favorites" && !g.is_favorite) return false;
      if (activePreset.startsWith("source:")) {
        const target = activePreset.slice("source:".length).toLowerCase();
        const matchesPrimary = g.source.toLowerCase() === target;
        const matchesSibling = g.sibling_games?.some(
          (s) => s.source.toLowerCase() === target
        );
        if (!matchesPrimary && !matchesSibling) return false;
      }

      // LS Filter Modal constraints
      if (filterFavoritesOnly && !g.is_favorite) return false;
      if (filterInstallState === "installed" && !hasInstalled) return false;
      if (filterInstallState === "uninstalled" && hasInstalled) return false;

      if (selectedGenres.length > 0) {
        const gameGenres = g.genres || [];
        if (!selectedGenres.some((sg) => gameGenres.includes(sg))) return false;
      }
      if (selectedDevelopers.length > 0) {
        if (!g.developer || !selectedDevelopers.includes(g.developer)) return false;
      }
      if (selectedSources.length > 0) {
        const gameSources = [g.source, ...(g.sibling_games || []).map((s) => s.source)];
        if (!selectedSources.some((ss) => gameSources.includes(ss))) return false;
      }

      if (q) {
        const hay = `${g.title} ${g.developer || ""} ${g.publisher || ""} ${g.source} ${(g.genres || []).join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const dir = sortDirection === "asc" ? 1 : -1;
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "recent": {
          const lpA = parseLastPlayedMs(a.last_played);
          const lpB = parseLastPlayedMs(b.last_played);
          cmp = lpA - lpB;
          break;
        }
        case "playtime":
          cmp = (a.playtime_seconds || 0) - (b.playtime_seconds || 0);
          break;
        case "release_date": {
          const rdA = a.release_date ? Date.parse(a.release_date) || 0 : 0;
          const rdB = b.release_date ? Date.parse(b.release_date) || 0 : 0;
          cmp = rdA - rdB;
          break;
        }
        case "date_added": {
          const daA = a.date_added ? Date.parse(a.date_added) || 0 : 0;
          const daB = b.date_added ? Date.parse(b.date_added) || 0 : 0;
          cmp = daA - daB;
          break;
        }
        case "rating": {
          const rA = a.user_rating || a.community_score || a.critic_score || 0;
          const rB = b.user_rating || b.community_score || b.critic_score || 0;
          cmp = rA - rB;
          break;
        }
        case "title":
        default:
          cmp = (a.sorting_title || a.title).localeCompare(b.sorting_title || b.title);
          break;
      }
      if (cmp !== 0) return cmp * dir;
      return (a.sorting_title || a.title).localeCompare(b.sorting_title || b.title);
    });

    return list;
  }, [
    games,
    activePreset,
    searchQuery,
    sortBy,
    sortDirection,
    filterFavoritesOnly,
    filterInstallState,
    selectedGenres,
    selectedDevelopers,
    selectedSources,
  ]);

  const selectedIndex = useMemo(() => {
    if (visibleGames.length === 0) return -1;
    if (!selectedGameId) return 0;
    const idx = visibleGames.findIndex((g) => g.id === selectedGameId);
    return idx >= 0 ? idx : 0;
  }, [visibleGames, selectedGameId]);

  const selectedGame = selectedIndex >= 0 ? visibleGames[selectedIndex] : null;
  const selectedAchSummary = useMemo(
    () => resolveGameAchievementSummary(selectedGame, achievementSummaryMap),
    [selectedGame, achievementSummaryMap]
  );
  const selectedEffectiveStatus = useMemo(
    () =>
      selectedGame
        ? getEffectiveCompletionStatus(selectedGame, selectedAchSummary)
        : null,
    [selectedGame, selectedAchSummary]
  );

  // Hydrate full detail columns (description, trailers, screenshots, etc.) into the shared
  // App.tsx single-source-of-truth cache whenever the focused Console game changes.
  useEffect(() => {
    if (!selectedGame || !onRequestHydrateGame) return;
    const siblingIds = selectedGame.sibling_games?.map((s) => s.id);
    const timer = window.setTimeout(() => {
      onRequestHydrateGame(selectedGame.id, siblingIds);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [selectedGame?.id, onRequestHydrateGame]);

  // Lazily fetch & persist missing HLTB once per game so Console & Desktop share identical data
  const hltbRequestedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!selectedGame) return;
    if (selectedGame.hltb_main !== undefined && selectedGame.hltb_main !== null) return;
    if (hltbRequestedRef.current.has(selectedGame.id)) return;

    const targetId = selectedGame.id;
    const targetTitle = selectedGame.title;
    const timer = window.setTimeout(() => {
      hltbRequestedRef.current.add(targetId);
      invoke<any>("get_game_hltb", { gameId: targetId, title: targetTitle }).catch(() => {});
    }, 450);
    return () => window.clearTimeout(timer);
  }, [selectedGame?.id, selectedGame?.title, selectedGame?.hltb_main]);

  // Keep selectedGameId synced when filters narrow list
  useEffect(() => {
    if (visibleGames.length === 0) {
      if (selectedGameId !== null) onSelectGameId(null);
      return;
    }
    if (!selectedGameId || !visibleGames.some((g) => g.id === selectedGameId)) {
      onSelectGameId(visibleGames[0].id);
    }
  }, [visibleGames, selectedGameId]);

  // Smoothly scroll selected card into view strictly inside its own scroll container
  useEffect(() => {
    if (!selectedGame) return;
    const el = cardRefs.current.get(selectedGame.id);
    if (!el) return;

    if (viewMode === "carousel") {
      const container = carouselContainerRef.current;
      if (!container) return;
      const targetLeft =
        el.offsetLeft - container.clientWidth / 2 + el.clientWidth / 2;
      container.scrollTo({
        left: Math.max(0, targetLeft),
        behavior: "smooth",
      });
    } else {
      const scrollHost = el.closest<HTMLElement>('[data-console-part="grid"]');
      if (!scrollHost) return;
      const hostRect = scrollHost.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const pad = 28;
      if (elRect.top < hostRect.top + pad) {
        scrollHost.scrollBy({
          top: elRect.top - hostRect.top - pad,
          behavior: "smooth",
        });
      } else if (elRect.bottom > hostRect.bottom - pad) {
        scrollHost.scrollBy({
          top: elRect.bottom - hostRect.bottom + pad,
          behavior: "smooth",
        });
      }
      if (gridDetailsScrollRef.current) {
        gridDetailsScrollRef.current.scrollTop = 0;
      }
    }
  }, [selectedGame?.id, viewMode]);

  const cyclePreset = (dir: -1 | 1) => {
    const idx = presets.findIndex((p) => p.id === activePreset);
    const nextIdx = (idx + dir + presets.length) % presets.length;
    playTabSwitch();
    onPresetChange(presets[nextIdx].id);
  };

  const getGridColumnsCount = (): number => {
    const grid = gridContainerRef.current;
    if (!grid) return 5;
    const style = window.getComputedStyle(grid);
    const cols = style.gridTemplateColumns.split(" ").filter(Boolean).length;
    return Math.max(1, cols);
  };

  const moveSelection = (dir: "left" | "right" | "up" | "down") => {
    if (visibleGames.length === 0) return;

    if (viewMode === "carousel") {
      if (dir === "left") {
        if (selectedIndex > 0) {
          playNavTick();
          onSelectGameId(visibleGames[selectedIndex - 1].id);
        }
      } else if (dir === "right") {
        if (selectedIndex < visibleGames.length - 1) {
          playNavTick();
          onSelectGameId(visibleGames[selectedIndex + 1].id);
        }
      } else if (dir === "down") {
        playTabSwitch();
        onViewModeChange("grid");
      }
      return;
    }

    // Expanded Grid Mode
    const cols = getGridColumnsCount();
    if (dir === "left") {
      if (selectedIndex > 0) {
        playNavTick();
        onSelectGameId(visibleGames[selectedIndex - 1].id);
      }
    } else if (dir === "right") {
      if (selectedIndex < visibleGames.length - 1) {
        playNavTick();
        onSelectGameId(visibleGames[selectedIndex + 1].id);
      }
    } else if (dir === "down") {
      const next = Math.min(visibleGames.length - 1, selectedIndex + cols);
      if (next !== selectedIndex) {
        playNavTick();
        onSelectGameId(visibleGames[next].id);
      }
    } else if (dir === "up") {
      if (selectedIndex < cols) {
        playTabSwitch();
        onViewModeChange("carousel");
      } else {
        playNavTick();
        onSelectGameId(visibleGames[selectedIndex - cols].id);
      }
    }
  };

  const triggerPrimaryPlay = (game: Game) => {
    if (runningGameId === game.id || launchingGameId === game.id) return;
    playLaunch();
    const hasInstalled =
      game.is_installed || Boolean(game.sibling_games?.some((s) => s.is_installed));
    if (hasInstalled) {
      const launchTarget = game.is_installed
        ? game
        : game.sibling_games?.find((s) => s.is_installed) || game;
      onLaunchGame(launchTarget);
    } else {
      onInstallGame(game);
    }
  };

  const handleOpenSearch = () => {
    playConfirm();
    if (isControllerActive) {
      openVirtualKeyboard({
        title: "Search Library",
        initialValue: searchQuery,
        placeholder: "Search your library...",
        liveSync: true,
        onUpdateValue: (val) => onSearchQueryChange(val),
        onConfirm: (val) => {
          onSearchQueryChange(val);
          openVirtualKeyboard(null);
        },
        onCancel: () => openVirtualKeyboard(null),
      });
    } else {
      setSearchBarOpen(true);
      window.setTimeout(() => searchInputRef.current?.focus(), 20);
    }
  };

  const anyLocalModalOpen = isFilterModalOpen || isSortModalOpen;

  // Listen for both Keyboard and Gamepad console navigation events
  useEffect(() => {
    if (isOverlayActive || anyLocalModalOpen) return;

    const handleConsoleAction = (e: Event) => {
      const detail = (e as CustomEvent).detail as { action: string } | undefined;
      if (!detail) return;
      switch (detail.action) {
        case "left":
        case "right":
        case "up":
        case "down":
          moveSelection(detail.action);
          break;
        case "confirm":
          if (selectedGame) {
            playConfirm();
            onOpenDetails(selectedGame);
          }
          break;
        case "back":
          if (searchQuery) {
            playBack();
            onSearchQueryChange("");
            setSearchBarOpen(false);
          } else if (viewMode === "grid") {
            playBack();
            onViewModeChange("carousel");
          } else {
            playConfirm();
            onOpenSystemMenu();
          }
          break;
        case "play":
          if (selectedGame) triggerPrimaryPlay(selectedGame);
          break;
        case "options":
          if (selectedGame) {
            playConfirm();
            onOpenGameOptions(selectedGame);
          }
          break;
        case "prev_tab":
          cyclePreset(-1);
          break;
        case "next_tab":
          cyclePreset(1);
          break;
        case "search":
          handleOpenSearch();
          break;
        case "open_filter":
          playConfirm();
          setIsSortModalOpen(false);
          setIsFilterModalOpen(true);
          break;
        case "open_sort":
          playConfirm();
          setIsFilterModalOpen(false);
          setIsSortModalOpen(true);
          break;
        case "start":
          playConfirm();
          onOpenSystemMenu();
          break;
        case "toggle_view":
          playTabSwitch();
          onViewModeChange(viewMode === "carousel" ? "grid" : "carousel");
          break;
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isOverlayActive || anyLocalModalOpen) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        if (e.key === "Escape") {
          target.blur();
          setSearchBarOpen(false);
        }
        return;
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        moveSelection("left");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        moveSelection("right");
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        moveSelection("up");
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        moveSelection("down");
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (selectedGame) {
          playConfirm();
          onOpenDetails(selectedGame);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (viewMode === "grid") {
          playBack();
          onViewModeChange("carousel");
        } else {
          playConfirm();
          onOpenSystemMenu();
        }
      } else if (e.key === "q" || e.key === "Q") {
        e.preventDefault();
        cyclePreset(-1);
      } else if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        cyclePreset(1);
      } else if (e.key === "Tab") {
        e.preventDefault();
        playTabSwitch();
        onViewModeChange(viewMode === "carousel" ? "grid" : "carousel");
      } else if (e.key === "/") {
        e.preventDefault();
        handleOpenSearch();
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        playConfirm();
        setIsFilterModalOpen(true);
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        playConfirm();
        setIsSortModalOpen(true);
      }
    };

    window.addEventListener("openplay-console-action", handleConsoleAction);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("openplay-console-action", handleConsoleAction);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    isOverlayActive,
    anyLocalModalOpen,
    visibleGames,
    selectedIndex,
    selectedGame,
    viewMode,
    activePreset,
    presets,
    searchQuery,
    sortBy,
    sortDirection,
    runningGameId,
    launchingGameId,
    isControllerActive,
  ]);

  // Close local filter/sort modals on Escape
  useEffect(() => {
    if (!anyLocalModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        playBack();
        setIsFilterModalOpen(false);
        setIsSortModalOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anyLocalModalOpen]);

  // Resolve hero backdrop (background_image -> screenshot -> cover fallback)
  const heroBgRaw =
    selectedGame?.background_image ||
    selectedGame?.screenshots?.[0] ||
    selectedGame?.cover_image;
  const heroBgSrc = resolveImageSrc(heroBgRaw);
  const heroBgIsVideo = isVideoSrc(heroBgRaw);
  const logoSrc = resolveImageSrc(selectedGame?.logo_image);
  const logoIsVideo = isVideoSrc(selectedGame?.logo_image);
  const profileAvatarSrc = resolveImageSrc(activeProfile?.avatar_url || undefined);

  const isSelectedRunning = selectedGame && runningGameId === selectedGame.id;
  const isSelectedLaunching = selectedGame && launchingGameId === selectedGame.id;
  const selectedHasInstalled = selectedGame
    ? selectedGame.is_installed ||
      Boolean(selectedGame.sibling_games?.some((s) => s.is_installed))
    : false;

  const selectedReleaseYear = formatReleaseYear(selectedGame?.release_date);
  const selectedLastPlayed = formatLastPlayed(
    selectedGame?.last_played,
    lastPlayedDateFormat
  );
  const selectedHltbShort = formatHltbShort(selectedGame?.hltb_main);
  const selectedPlatformSources = useMemo(() => {
    if (!selectedGame) return [];
    const list = [selectedGame.source];
    for (const s of selectedGame.sibling_games || []) {
      if (!list.includes(s.source)) list.push(s.source);
    }
    return list;
  }, [selectedGame]);

  const activeSortLabel =
    SORT_OPTIONS.find((o) => o.key === sortBy)?.label || "Last Played";

  const renderAnimatedCard = (game: Game, idx: number, isCarouselCard: boolean) => {
    const isSelected = idx === selectedIndex;
    const coverSrc = resolveGridCoverSrc(game.cover_image, 540);
    const coverIsVideo = Boolean(coverSrc && isVideoSrc(coverSrc));
    const staticPoster = coverIsVideo ? getStaticFallbackCover(coverSrc) : undefined;
    const hasInstalled =
      game.is_installed || Boolean(game.sibling_games?.some((s) => s.is_installed));

    return (
      <button
        key={game.id}
        ref={(node) => {
          if (node) cardRefs.current.set(game.id, node);
          else cardRefs.current.delete(game.id);
        }}
        type="button"
        data-console-part="card"
        data-selected={isSelected ? "true" : "false"}
        onClick={() => {
          if (isSelected) {
            playConfirm();
            onOpenDetails(game);
          } else {
            playNavTick();
            onSelectGameId(game.id);
          }
        }}
        onDoubleClick={() => {
          playConfirm();
          onOpenDetails(game);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onSelectGameId(game.id);
          onOpenGameOptions(game);
        }}
        style={{
          width: isCarouselCard ? "var(--console-card-width, 192px)" : undefined,
          borderRadius: "var(--console-card-radius, 14px)",
        }}
        className={`relative aspect-[2/3] ${
          isCarouselCard ? "shrink-0" : "w-full"
        } overflow-hidden bg-zinc-900/90 border transition-all duration-200 cursor-pointer text-left group ${
          isSelected
            ? isCarouselCard
              ? "scale-[1.08] -translate-y-2 border-white z-20"
              : "scale-[1.04] border-white z-10"
            : "border-white/10 hover:border-white/35 hover:scale-[1.02]"
        } ${
          !hasInstalled
            ? isSelected
              ? "grayscale-[25%] opacity-90"
              : "grayscale-[60%] opacity-50 hover:opacity-80"
            : isSelected
            ? "opacity-100"
            : "opacity-85 hover:opacity-100"
        }`}
      >
        {coverSrc ? (
          coverIsVideo ? (
            <video
              ref={(vEl) => {
                const cardEl = cardRefs.current.get(game.id) || null;
                registerVideoCard(cardEl, vEl);
                if (vEl) {
                  vEl.defaultMuted = true;
                  vEl.muted = true;
                  if (vEl.paused) {
                    vEl.play().catch(() => {});
                  }
                }
              }}
              src={coverSrc}
              poster={staticPoster}
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
              className="w-full h-full object-cover"
            />
          ) : (
            <img
              src={coverSrc}
              alt={game.title}
              loading="lazy"
              className="w-full h-full object-cover"
            />
          )
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gradient-to-br from-slate-800 to-slate-950 text-center">
            <span className="text-sm font-bold text-white/85 line-clamp-3">
              {game.title}
            </span>
          </div>
        )}

        {/* Subtle bottom gradient + favorite / cloud / running indicators */}
        <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/75 via-black/20 to-transparent pointer-events-none" />

        {game.is_favorite && (
          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/65 backdrop-blur flex items-center justify-center">
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
          </div>
        )}

        {!hasInstalled && (
          <div
            title="Not Installed"
            className="absolute bottom-2 right-2 w-6 h-6 rounded-full bg-black/65 backdrop-blur border border-white/15 flex items-center justify-center text-white/75"
          >
            <Cloud className="w-3.5 h-3.5" />
          </div>
        )}

        {runningGameId === game.id && (
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 text-[10px] font-black uppercase tracking-wider">
            Playing
          </div>
        )}
      </button>
    );
  };

  return (
    <div
      data-console-part="root"
      data-gamepad-zone="console-home"
      className="fixed inset-0 z-20 bg-[#06080f] text-white overflow-hidden select-none flex flex-col animate-in fade-in duration-500"
    >
      {/* Full-bleed edge-to-edge Hero Artwork Background (100vw x 100vh for 32:9 & 16:9) */}
      <div
        data-console-part="hero-backdrop"
        className="console-diagonal-backdrop absolute inset-0 pointer-events-none overflow-hidden"
      >
        {heroBgSrc ? (
          <UltrawideMediaStage
            key={heroBgSrc}
            src={heroBgSrc}
            isVideo={heroBgIsVideo}
            loop
            muted
            centerFilter="blur(var(--console-bg-blur, 4px)) saturate(1.12)"
            className="animate-bg-crossfade"
          />
        ) : (
          <div className="console-ambient-mesh absolute inset-0" />
        )}

        {/* Cinematic Dark Gradient Vignettes */}
        <div
          className="absolute inset-0 transition-opacity duration-300"
          style={{
            backgroundColor: `rgba(5, 7, 13, var(--console-bg-dim, 0.56))`,
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              viewMode === "carousel"
                ? "linear-gradient(180deg, rgba(6,8,15,0.68) 0%, rgba(6,8,15,0.18) 32%, rgba(6,8,15,0.72) 66%, rgba(6,8,15,0.96) 100%)"
                : "linear-gradient(180deg, rgba(6,8,15,0.84) 0%, rgba(6,8,15,0.78) 50%, rgba(6,8,15,0.96) 100%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, rgba(6,8,15,0.78) 0%, rgba(6,8,15,0.22) 48%, rgba(6,8,15,0.65) 100%)",
          }}
        />
      </div>

      {/* Safe-Zone Centered Foreground Layout (Ultrawide 32:9 & 16:9 TV Optimized) */}
      <div
        className="relative z-10 flex-1 min-h-0 flex flex-col w-full mx-auto px-6 sm:px-10 md:px-14 pt-5 pb-3"
        style={{ maxWidth: "var(--console-safe-width, 2200px)" }}
      >
        {/* TOP FLOATING STATUS BAR */}
        <header
          data-console-part="top-bar"
          className="flex items-center justify-between gap-4 shrink-0 pb-3"
        >
          {/* Left: Profile Badge */}
          <button
            type="button"
            onClick={() => {
              playConfirm();
              onOpenProfileSwitch();
            }}
            className="flex items-center space-x-3 pl-1.5 pr-4 py-1.5 rounded-full bg-white/[0.07] hover:bg-white/[0.14] border border-white/10 backdrop-blur-xl transition-all cursor-pointer shrink-0"
            title="Switch Profile"
          >
            <div
              className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center border border-white/20 shrink-0"
              style={{
                backgroundColor: activeProfile?.accent_color || "var(--console-accent, #783efe)",
              }}
            >
              {profileAvatarSrc ? (
                <img
                  src={profileAvatarSrc}
                  alt={activeProfile?.name || "Player"}
                  className="w-full h-full object-cover object-top"
                />
              ) : (
                <span className="text-xs font-black text-white uppercase">
                  {(activeProfile?.name || "P").slice(0, 1)}
                </span>
              )}
            </div>
            <span className="text-xs font-bold tracking-wide text-white/95 max-w-[130px] truncate">
              {activeProfile?.name || "Player"}
            </span>
          </button>

          {/* Center: Filter Presets Ribbon (LB / RB) */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 px-2 rounded-full bg-black/35 border border-white/10 backdrop-blur-xl max-w-full">
            {isControllerActive && (
              <span className="px-1.5 opacity-70 shrink-0">
                <ControllerGlyph
                  button="LB"
                  profile={glyphProfile}
                  nintendoSwap={nintendoSwap}
                  size="xs"
                />
              </span>
            )}
            {presets.map((preset) => {
              const active = preset.id === activePreset;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    playTabSwitch();
                    onPresetChange(preset.id);
                  }}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    active
                      ? "bg-white text-slate-950 shadow-md"
                      : "text-white/65 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
            {isControllerActive && (
              <span className="px-1.5 opacity-70 shrink-0">
                <ControllerGlyph
                  button="RB"
                  profile={glyphProfile}
                  nintendoSwap={nintendoSwap}
                  size="xs"
                />
              </span>
            )}
          </div>

          {/* Right: Search, Filter, Sort, View Toggle, Achievements, Clock, System Menu */}
          <div className="flex items-center space-x-2 shrink-0">
            {searchBarOpen || searchQuery ? (
              <div className="flex items-center bg-black/55 border border-white/20 rounded-full pl-3 pr-2 py-1 backdrop-blur-xl">
                <Search className="w-3.5 h-3.5 text-white/60 mr-2 shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => onSearchQueryChange(e.target.value)}
                  placeholder="Search games..."
                  className="bg-transparent text-xs text-white placeholder-white/40 focus:outline-none w-36"
                />
                <button
                  type="button"
                  onClick={() => {
                    onSearchQueryChange("");
                    setSearchBarOpen(false);
                  }}
                  className="p-0.5 text-white/50 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleOpenSearch}
                title="Search Library (/)"
                className="w-9 h-9 rounded-full bg-white/[0.07] hover:bg-white/[0.15] border border-white/10 backdrop-blur-xl flex items-center justify-center text-white/80 hover:text-white transition-all cursor-pointer"
              >
                <Search className="w-4 h-4" />
              </button>
            )}

            {/* Filter Button (LS Click / F) */}
            <button
              type="button"
              onClick={() => {
                playConfirm();
                setIsFilterModalOpen(true);
              }}
              title="Filter Library (L3 / F)"
              className={`h-9 px-3 rounded-full border backdrop-blur-xl flex items-center space-x-1.5 text-xs font-semibold transition-all cursor-pointer ${
                activeFilterCount > 0
                  ? "bg-white text-slate-950 border-white"
                  : "bg-white/[0.07] hover:bg-white/[0.15] border-white/10 text-white/85"
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              {activeFilterCount > 0 && (
                <span className="font-mono text-[11px]">{activeFilterCount}</span>
              )}
            </button>

            {/* Sort Button (RS Click / S) */}
            <button
              type="button"
              onClick={() => {
                playConfirm();
                setIsSortModalOpen(true);
              }}
              title="Sort Library (R3 / S)"
              className="h-9 px-3 rounded-full bg-white/[0.07] hover:bg-white/[0.15] border border-white/10 backdrop-blur-xl flex items-center space-x-1.5 text-xs font-semibold text-white/85 hover:text-white transition-all cursor-pointer"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">{activeSortLabel}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                playTabSwitch();
                onViewModeChange(viewMode === "carousel" ? "grid" : "carousel");
              }}
              title={
                viewMode === "carousel"
                  ? "Switch to Fullscreen Grid (Down / Tab)"
                  : "Switch to Horizontal Carousel (Up / Tab)"
              }
              className="h-9 px-3 rounded-full bg-white/[0.07] hover:bg-white/[0.15] border border-white/10 backdrop-blur-xl flex items-center space-x-1.5 text-xs font-semibold text-white/85 hover:text-white transition-all cursor-pointer"
            >
              {viewMode === "carousel" ? (
                <>
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline">Grid</span>
                </>
              ) : (
                <>
                  <GalleryHorizontalEnd className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline">Carousel</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                playConfirm();
                onOpenAchievementHub();
              }}
              title="Achievement Hunter Hub"
              className="w-9 h-9 rounded-full bg-white/[0.07] hover:bg-white/[0.15] border border-white/10 backdrop-blur-xl flex items-center justify-center text-amber-300/90 hover:text-amber-200 transition-all cursor-pointer"
            >
              <Trophy className="w-4 h-4" />
            </button>

            <span className="text-xs font-bold text-white/80 tabular-nums px-3 py-2 rounded-full bg-white/[0.06] border border-white/10 backdrop-blur-xl">
              {nowTime}
            </span>

            <button
              type="button"
              onClick={() => {
                playConfirm();
                onOpenSystemMenu();
              }}
              title="Console Menu (Start / Esc)"
              className="w-9 h-9 rounded-full bg-white/[0.09] hover:bg-white/[0.2] border border-white/15 backdrop-blur-xl flex items-center justify-center text-white transition-all cursor-pointer"
            >
              <Menu className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* MAIN STAGE: HORIZONTAL CAROUSEL OR SPLIT FULLSCREEN GRID */}
        {visibleGames.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="text-xl font-bold text-white/85">No games in this view</div>
            <p className="text-sm text-white/50 mt-2 max-w-md">
              Try switching filter presets with LB/RB, opening Filter (LS Click), or clearing your search query.
            </p>
            {(searchQuery || activePreset !== "all" || activeFilterCount > 0) && (
              <button
                type="button"
                onClick={() => {
                  onSearchQueryChange("");
                  onPresetChange("all");
                  resetAllFilters();
                }}
                className="mt-5 px-5 py-2.5 rounded-full bg-white text-slate-950 text-xs font-bold cursor-pointer"
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : viewMode === "carousel" ? (
          <div className="flex-1 min-h-0 flex flex-col justify-between pt-1 pb-1">
            {/* UPPER HERO STAGE (Rich Desktop-Parity Metadata + Clean Telemetry Strip!) */}
            {selectedGame && (
              <div
                data-console-part="hero-stage"
                className="flex-1 min-h-0 flex flex-col justify-center max-w-4xl py-2 animate-in fade-in duration-300"
              >
                {/* Logo or Crisp Title (Animated Logo Supported + Viewport Clamped) */}
                <div className="mb-3">
                  {logoSrc ? (
                    logoIsVideo ? (
                      <video
                        key={logoSrc}
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
                        alt={selectedGame.title}
                        className="max-h-[15vh] max-w-[460px] w-auto object-contain object-left drop-shadow-[0_10px_28px_rgba(0,0,0,0.85)]"
                      />
                    )
                  ) : (
                    <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white drop-shadow-[0_6px_24px_rgba(0,0,0,0.8)] line-clamp-2">
                      {selectedGame.title}
                    </h1>
                  )}
                </div>

                {/* Clean Single-Line Identity Pills (Platforms, Installed, Status, Year) */}
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-white/85 mb-2">
                  <span className="px-2.5 py-1 rounded-full bg-white/12 border border-white/15 backdrop-blur-md flex items-center gap-1.5">
                    {selectedPlatformSources.map((src) => (
                      <PlatformIcon key={src} platform={src} className="w-3.5 h-3.5" />
                    ))}
                    <span>{selectedGame.source}</span>
                  </span>

                  {selectedHasInstalled ? (
                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 flex items-center gap-1">
                      <HardDrive className="w-3 h-3" />
                      Installed
                      {selectedGame.size_on_disk
                        ? ` • ${formatFileSize(selectedGame.size_on_disk)}`
                        : ""}
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full bg-white/8 border border-white/10 text-white/60 flex items-center gap-1">
                      <Cloud className="w-3 h-3" />
                      Not Installed
                    </span>
                  )}

                  {selectedEffectiveStatus && (
                    <span
                      className={`px-2.5 py-1 rounded-full border flex items-center gap-1 ${selectedEffectiveStatus.badgeClass}`}
                    >
                      {renderStatusIcon(selectedEffectiveStatus.iconName)}
                      <span>{selectedEffectiveStatus.status}</span>
                    </span>
                  )}

                  {selectedReleaseYear && (
                    <span className="px-2.5 py-1 rounded-full bg-black/40 border border-white/10 font-mono">
                      {selectedReleaseYear}
                    </span>
                  )}
                </div>

                {/* Secondary Metadata Line: Developer, Scores & Genres */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/65 mb-2.5">
                  {selectedGame.developer && (
                    <span className="font-semibold text-white/85 flex items-center gap-1">
                      <User className="w-3 h-3 text-white/50" />
                      {selectedGame.developer}
                    </span>
                  )}
                  {(selectedGame.user_rating ||
                    selectedGame.community_score ||
                    selectedGame.critic_score) && (
                    <span className="flex items-center gap-2.5">
                      {selectedGame.user_rating ? (
                        <span className="flex items-center gap-1 text-amber-300 font-semibold">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          {selectedGame.user_rating} User
                        </span>
                      ) : null}
                      {selectedGame.community_score ? (
                        <span className="flex items-center gap-1 text-sky-300 font-semibold">
                          <Star className="w-3 h-3 fill-sky-400 text-sky-400" />
                          {selectedGame.community_score} Community
                        </span>
                      ) : null}
                      {selectedGame.critic_score ? (
                        <span className="flex items-center gap-1 text-emerald-300 font-semibold">
                          <Star className="w-3 h-3 fill-emerald-400 text-emerald-400" />
                          {selectedGame.critic_score} Critic
                        </span>
                      ) : null}
                    </span>
                  )}
                  {selectedGame.genres && selectedGame.genres.length > 0 && (
                    <span className="uppercase tracking-wider text-[11px] text-white/50">
                      {selectedGame.genres.slice(0, 4).join("  •  ")}
                    </span>
                  )}
                </div>

                {selectedGame.description && (
                  <p className="text-sm text-white/75 line-clamp-2 max-w-2xl leading-relaxed mb-3.5">
                    {stripHtml(selectedGame.description)}
                  </p>
                )}

                {/* Console Telemetry Strip: Playtime, Achievements & HowLongToBeat */}
                {(selectedGame.playtime_seconds > 0 ||
                  selectedLastPlayed ||
                  (selectedAchSummary && selectedAchSummary.total_achievements > 0) ||
                  selectedHltbShort) && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 max-w-2xl mb-4">
                    {/* Playtime Card */}
                    <div className="console-diagonal-surface rounded-xl bg-black/40 border border-white/10 backdrop-blur-xl px-3.5 py-2.5 flex flex-col justify-between">
                      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-white/45 font-bold">
                        <span>Playtime</span>
                        <Clock className="w-3 h-3 text-sky-300" />
                      </div>
                      <div className="text-sm font-extrabold text-white mt-1 tabular-nums">
                        {formatPlaytime(selectedGame.playtime_seconds)}
                      </div>
                      <div className="text-[10px] text-white/50 truncate mt-0.5">
                        {selectedLastPlayed ? `Last played ${selectedLastPlayed}` : "Never played"}
                      </div>
                    </div>

                    {/* Achievements Card */}
                    <div className="console-diagonal-surface rounded-xl bg-black/40 border border-white/10 backdrop-blur-xl px-3.5 py-2.5 flex flex-col justify-between">
                      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-white/45 font-bold">
                        <span>Achievements</span>
                        <Trophy className="w-3 h-3 text-amber-400" />
                      </div>
                      {selectedAchSummary && selectedAchSummary.total_achievements > 0 ? (
                        <>
                          <div className="flex items-baseline justify-between mt-1">
                            <span className="text-sm font-extrabold text-white tabular-nums">
                              {selectedAchSummary.unlocked_achievements} /{" "}
                              {selectedAchSummary.total_achievements}
                            </span>
                            <span className="text-[11px] font-bold text-amber-300 font-mono">
                              {Math.round(
                                (selectedAchSummary.unlocked_achievements /
                                  selectedAchSummary.total_achievements) *
                                  100
                              )}
                              %
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden mt-1.5">
                            <div
                              className="h-full rounded-full bg-amber-400 transition-all duration-500"
                              style={{
                                width: `${Math.min(
                                  100,
                                  Math.round(
                                    (selectedAchSummary.unlocked_achievements /
                                      selectedAchSummary.total_achievements) *
                                      100
                                  )
                                )}%`,
                              }}
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-sm font-bold text-white/45 mt-1">—</div>
                          <div className="text-[10px] text-white/35 mt-0.5">No trophies tracked</div>
                        </>
                      )}
                    </div>

                    {/* How Long To Beat Card */}
                    <div className="console-diagonal-surface rounded-xl bg-black/40 border border-white/10 backdrop-blur-xl px-3.5 py-2.5 flex flex-col justify-between">
                      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-white/45 font-bold">
                        <span>How Long To Beat</span>
                        <Sparkles className="w-3 h-3 text-cyan-300" />
                      </div>
                      {selectedHltbShort ? (
                        <>
                          <div className="flex items-baseline justify-between mt-1">
                            <span className="text-sm font-extrabold text-white font-mono">
                              {selectedHltbShort}
                            </span>
                            <span className="text-[10px] text-white/50 truncate ml-2">
                              {formatHltbShort(selectedGame.hltb_extra)
                                ? `Extra ${formatHltbShort(selectedGame.hltb_extra)}`
                                : "Main Story"}
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden flex mt-1.5">
                            <div className="h-full bg-cyan-400 w-1/3" />
                            <div className="h-full bg-blue-500 w-1/3" />
                            <div className="h-full bg-emerald-400 w-1/3" />
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-sm font-bold text-white/45 mt-1">—</div>
                          <div className="text-[10px] text-white/35 mt-0.5">No HLTB data</div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Quick Action Row */}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => triggerPrimaryPlay(selectedGame)}
                    disabled={!!isSelectedRunning || !!isSelectedLaunching}
                    className="px-7 py-3 rounded-full font-bold text-sm flex items-center space-x-2.5 transition-all cursor-pointer shadow-xl hover:scale-[1.03] disabled:opacity-70"
                    style={{
                      backgroundColor: isSelectedRunning
                        ? "#10b981"
                        : "var(--console-accent, #783efe)",
                      color: "#ffffff",
                    }}
                  >
                    {selectedHasInstalled ? (
                      <Play className="w-4 h-4 fill-current" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    <span>
                      {isSelectedRunning
                        ? "Running"
                        : isSelectedLaunching
                        ? "Launching..."
                        : selectedHasInstalled
                        ? "Play"
                        : "Install"}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      playConfirm();
                      onOpenDetails(selectedGame);
                    }}
                    className="px-5 py-3 rounded-full bg-white/12 hover:bg-white/20 border border-white/15 backdrop-blur-xl text-sm font-semibold text-white flex items-center space-x-2 transition-all cursor-pointer"
                  >
                    <Info className="w-4 h-4" />
                    <span>Game Details</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      playConfirm();
                      onOpenGameOptions(selectedGame);
                    }}
                    className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 backdrop-blur-xl flex items-center justify-center text-white transition-all cursor-pointer"
                    title="Game Options"
                  >
                    <MoreHorizontal className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}

            {/* LOWER HORIZONTAL COVER CAROUSEL (Zero Clipping!) */}
            <div className="shrink-0">
              <div className="flex items-center justify-between mb-1 px-2">
                <div className="text-xs font-semibold uppercase tracking-widest text-white/55">
                  {presets.find((p) => p.id === activePreset)?.label || "Library"} •{" "}
                  <span className="text-white/85">
                    {selectedIndex + 1} / {visibleGames.length}
                  </span>
                </div>
                <div className="text-xs text-white/50 flex items-center gap-3">
                  <span>
                    Sort: <strong className="text-white/80">{activeSortLabel}</strong>{" "}
                    ({sortDirection === "asc" ? "Asc" : "Desc"})
                  </span>
                </div>
              </div>

              {/* Negative horizontal margin + generous internal padding so scaled card rings/glows NEVER clip! */}
              <div
                ref={carouselContainerRef}
                data-console-part="carousel"
                className="-mx-4 flex items-end gap-5 overflow-x-auto no-scrollbar py-8 px-10 scroll-px-10 scroll-smooth"
              >
                {visibleGames.map((game, idx) => renderAnimatedCard(game, idx, true))}
              </div>
            </div>
          </div>
        ) : (
          /* EXPANDED CONSOLE SPLIT GRID VIEW (Left 2:3 Animated Grid + Right Live Metadata Details Panel, NO Useless Play Button!) */
          <div className="flex-1 min-h-0 flex gap-6 pt-1">
            {/* LEFT: 2:3 Animated Steam Cover Grid */}
            <div className="flex-1 min-w-0 flex flex-col min-h-0">
              <div className="flex items-center justify-between pb-2 px-1 shrink-0">
                <div className="text-xs font-semibold uppercase tracking-widest text-white/55">
                  {presets.find((p) => p.id === activePreset)?.label || "Library"} •{" "}
                  <span className="text-white/85">
                    {selectedIndex + 1} / {visibleGames.length}
                  </span>
                </div>
                <div className="text-xs text-white/55">
                  {activeSortLabel} ({sortDirection === "asc" ? "↑" : "↓"})
                </div>
              </div>

              <div
                data-console-part="grid"
                className="flex-1 min-h-0 overflow-y-auto pr-2 pb-6"
              >
                <div
                  ref={gridContainerRef}
                  className="grid gap-4 p-2"
                  style={{
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(152px, 1fr))",
                  }}
                >
                  {visibleGames.map((game, idx) => renderAnimatedCard(game, idx, false))}
                </div>
              </div>
            </div>

            {/* RIGHT: Live Selected Game Details Panel (Exact User-Specified Top-to-Bottom Flow!) */}
            {selectedGame && (
              <aside
                data-console-part="grid-details-panel"
                className="console-diagonal-surface hidden lg:flex w-[38%] max-w-[560px] min-w-[360px] shrink-0 flex-col min-h-0 rounded-2xl bg-black/45 border border-white/10 backdrop-blur-2xl overflow-hidden"
              >
                <div
                  ref={gridDetailsScrollRef}
                  data-gamepad-scroll="true"
                  className="flex-1 overflow-y-auto no-scrollbar"
                >
                  {/* 1. Top 16:9 Media Banner: Muted Autoplaying Trailer if assigned, else Background Image */}
                  <div className="relative w-full aspect-video bg-black/70 overflow-hidden border-b border-white/10 shrink-0">
                    {(() => {
                      const primaryTrailer = selectedGame.trailers?.[0];
                      if (primaryTrailer?.url) {
                        const ytEmbed = getYouTubeEmbedUrl(primaryTrailer.url, true, true);
                        if (ytEmbed) {
                          return (
                            <iframe
                              key={ytEmbed}
                              src={`${ytEmbed}&controls=0&modestbranding=1`}
                              title={primaryTrailer.name || selectedGame.title}
                              allow="autoplay; encrypted-media"
                              className="w-full h-full border-0 pointer-events-none scale-[1.03]"
                            />
                          );
                        }
                        return (
                          <VideoPlayer
                            key={primaryTrailer.url}
                            src={primaryTrailer.url}
                            poster={primaryTrailer.thumbnail || heroBgSrc}
                            autoPlay
                            controls={false}
                            muted
                            loop
                            className="w-full h-full object-cover"
                          />
                        );
                      }

                      if (heroBgSrc) {
                        return heroBgIsVideo ? (
                          <video
                            key={heroBgSrc}
                            src={heroBgSrc}
                            autoPlay
                            loop
                            muted
                            playsInline
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <img
                            key={heroBgSrc}
                            src={heroBgSrc}
                            alt={selectedGame.title}
                            className="w-full h-full object-cover"
                          />
                        );
                      }

                      return <div className="console-ambient-mesh w-full h-full" />;
                    })()}
                    <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#080b13] via-[#080b13]/40 to-transparent pointer-events-none" />
                  </div>

                  {/* Panel Content Body */}
                  <div className="p-5 space-y-4">
                    {/* 2. Game Name in Text Only + Three Cells (Platform, Installed, Completion Status) */}
                    <div className="space-y-2.5">
                      <h2 className="text-2xl font-black text-white tracking-tight leading-tight">
                        {selectedGame.title}
                      </h2>

                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                        <span className="px-2.5 py-1 rounded-full bg-white/10 border border-white/15 flex items-center gap-1.5">
                          {selectedPlatformSources.map((src) => (
                            <PlatformIcon key={src} platform={src} className="w-3.5 h-3.5" />
                          ))}
                          <span>{selectedGame.source}</span>
                        </span>

                        {selectedHasInstalled ? (
                          <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 flex items-center gap-1">
                            <HardDrive className="w-3 h-3" />
                            Installed
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full bg-white/8 border border-white/10 text-white/60 flex items-center gap-1">
                            <Cloud className="w-3 h-3" />
                            Not Installed
                          </span>
                        )}

                        {selectedEffectiveStatus && (
                          <span
                            className={`px-2.5 py-1 rounded-full border flex items-center gap-1 ${selectedEffectiveStatus.badgeClass}`}
                          >
                            {renderStatusIcon(selectedEffectiveStatus.iconName)}
                            <span>{selectedEffectiveStatus.status}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 3. Rich Desktop-Parity Game Info Card */}
                    <div className="console-diagonal-surface rounded-xl bg-black/30 border border-white/10 p-4 space-y-3 text-xs">
                      <div className="grid grid-cols-2 gap-3 pb-3 border-b border-white/10">
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-slate-400 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            Time Played
                          </div>
                          <div className="font-bold text-white mt-0.5">
                            {formatPlaytime(selectedGame.playtime_seconds)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-slate-400 flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            Last Played
                          </div>
                          <div className="font-bold text-white mt-0.5 truncate">
                            {selectedLastPlayed || "Never"}
                          </div>
                        </div>
                      </div>

                      {/* Review Scores Row */}
                      {(selectedGame.user_rating ||
                        selectedGame.community_score ||
                        selectedGame.critic_score) && (
                        <div className="flex flex-wrap items-center gap-2 pb-2.5 border-b border-white/10 text-[11px] font-semibold">
                          {selectedGame.user_rating ? (
                            <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-400/25 text-amber-200 flex items-center gap-1">
                              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                              {selectedGame.user_rating} User
                            </span>
                          ) : null}
                          {selectedGame.community_score ? (
                            <span className="px-2 py-0.5 rounded bg-sky-500/15 border border-sky-400/25 text-sky-200 flex items-center gap-1">
                              <Star className="w-3 h-3 fill-sky-400 text-sky-400" />
                              {selectedGame.community_score} Community
                            </span>
                          ) : null}
                          {selectedGame.critic_score ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/25 text-emerald-200 flex items-center gap-1">
                              <Star className="w-3 h-3 fill-emerald-400 text-emerald-400" />
                              {selectedGame.critic_score} Critic
                            </span>
                          ) : null}
                        </div>
                      )}

                      {/* Full Desktop Details Rows */}
                      <div className="space-y-1.5 text-[11px]">
                        <GridInfoRow
                          icon={<Tag className="w-3 h-3" />}
                          label="Series"
                          value={selectedGame.series || selectedGame.title}
                        />
                        <GridInfoRow
                          icon={<User className="w-3 h-3" />}
                          label="Developer"
                          value={selectedGame.developer}
                        />
                        <GridInfoRow
                          icon={<Building2 className="w-3 h-3" />}
                          label="Publisher"
                          value={selectedGame.publisher}
                        />
                        <GridInfoRow
                          icon={<Calendar className="w-3 h-3" />}
                          label="Release Date"
                          value={selectedGame.release_date}
                        />
                        <GridInfoRow
                          icon={<ShieldAlert className="w-3 h-3" />}
                          label="Age Rating"
                          value={selectedGame.age_rating || "All Ages"}
                        />
                        <GridInfoRow
                          icon={<Calendar className="w-3 h-3" />}
                          label="Date Added"
                          value={
                            selectedGame.date_added
                              ? selectedGame.date_added.slice(0, 10)
                              : undefined
                          }
                        />
                        <GridInfoRow
                          icon={<HardDrive className="w-3 h-3" />}
                          label="Size on Disk"
                          value={
                            selectedGame.size_on_disk
                              ? formatFileSize(selectedGame.size_on_disk)
                              : undefined
                          }
                        />
                        <GridInfoRow
                          icon={<PlatformIcon platform={selectedGame.source} className="w-3 h-3" />}
                          label="Source"
                          value={selectedGame.source}
                        />
                        {selectedGame.platforms && selectedGame.platforms.length > 0 && (
                          <GridInfoRow
                            icon={<Sparkles className="w-3 h-3" />}
                            label="Platforms"
                            value={selectedGame.platforms.slice(0, 3).join(", ")}
                          />
                        )}
                      </div>

                      {selectedGame.install_directory && (
                        <div className="pt-2 border-t border-white/10 space-y-1">
                          <div className="text-[10px] text-slate-400 flex items-center gap-1">
                            <FolderOpen className="w-3 h-3" />
                            <span>Installation Folder</span>
                          </div>
                          <div className="text-[10px] font-mono text-slate-300 truncate bg-black/35 px-2 py-1 rounded border border-white/5">
                            {selectedGame.install_directory}
                          </div>
                        </div>
                      )}

                      {selectedGame.genres && selectedGame.genres.length > 0 && (
                        <div className="pt-2 border-t border-white/10 flex flex-wrap gap-1.5">
                          {selectedGame.genres.slice(0, 8).map((g) => (
                            <span
                              key={g}
                              className="px-2 py-0.5 rounded bg-white/8 border border-white/10 text-[10px] text-slate-200"
                            >
                              {g}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 4. HowLongToBeat Widget */}
                    {(selectedGame.hltb_main ||
                      selectedGame.hltb_extra ||
                      selectedGame.hltb_completionist) && (
                      <HowLongToBeatWidget
                        mainStoryHours={selectedGame.hltb_main}
                        mainExtraHours={selectedGame.hltb_extra}
                        completionistHours={selectedGame.hltb_completionist}
                      />
                    )}

                    {/* 5. Desktop-Style Achievements Showcase Widget */}
                    <AchievementsQuickWidget
                      game={selectedGame}
                      onOpenFullAchievements={() => {
                        playConfirm();
                        onOpenDetails(selectedGame);
                      }}
                    />

                    {/* 6. Rich HTML Store Description */}
                    {selectedGame.description && (
                      <div className="console-diagonal-surface rounded-xl bg-black/30 border border-white/10 p-4">
                        <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/50 mb-3 pb-2 border-b border-white/10">
                          About This Game
                        </h3>
                        <SteamDescription html={selectedGame.description} />
                      </div>
                    )}
                  </div>
                </div>
              </aside>
            )}
          </div>
        )}

        {/* BOTTOM CONSOLE ACTION BAR (Centered in Safe Zone) */}
        <footer
          data-console-part="hud"
          className="shrink-0 pt-1.5 flex items-center justify-center"
        >
          <div className="inline-flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 px-5 py-2 rounded-full bg-black/55 border border-white/10 backdrop-blur-xl text-xs text-white/80">
            <span className="flex items-center gap-1.5">
              {isControllerActive ? (
                <ControllerGlyph
                  action="confirm"
                  profile={glyphProfile}
                  customBindings={customBindings}
                  nintendoSwap={nintendoSwap}
                  size="xs"
                />
              ) : (
                <kbd className="px-1.5 py-0.5 rounded bg-white/15 font-mono text-[10px]">
                  Enter
                </kbd>
              )}
              <span>Details</span>
            </span>

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
              <span>{selectedHasInstalled ? "Play" : "Install"}</span>
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
                  Right-Click
                </kbd>
              )}
              <span>Options</span>
            </span>

            <span className="flex items-center gap-1.5">
              {isControllerActive ? (
                <ControllerGlyph
                  button="L3"
                  profile={glyphProfile}
                  nintendoSwap={nintendoSwap}
                  size="xs"
                />
              ) : (
                <kbd className="px-1.5 py-0.5 rounded bg-white/15 font-mono text-[10px]">
                  F
                </kbd>
              )}
              <span>Filter</span>
            </span>

            <span className="flex items-center gap-1.5">
              {isControllerActive ? (
                <ControllerGlyph
                  button="R3"
                  profile={glyphProfile}
                  nintendoSwap={nintendoSwap}
                  size="xs"
                />
              ) : (
                <kbd className="px-1.5 py-0.5 rounded bg-white/15 font-mono text-[10px]">
                  S
                </kbd>
              )}
              <span>Sort</span>
            </span>

            <span className="flex items-center gap-1.5">
              {isControllerActive ? (
                <ControllerGlyph
                  button={viewMode === "carousel" ? "DPadDown" : "DPadUp"}
                  profile={glyphProfile}
                  nintendoSwap={nintendoSwap}
                  size="xs"
                />
              ) : (
                <kbd className="px-1.5 py-0.5 rounded bg-white/15 font-mono text-[10px]">
                  Tab
                </kbd>
              )}
              <span>{viewMode === "carousel" ? "Grid" : "Carousel"}</span>
            </span>

            {viewMode === "grid" && (
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
                <span>Scroll Details</span>
              </span>
            )}

            <span className="flex items-center gap-1.5">
              {isControllerActive ? (
                <ControllerGlyph
                  action="main_menu"
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
              <span>Menu</span>
            </span>
          </div>
        </footer>
      </div>

      {/* LS CLICK: CONSOLE FILTER MODAL */}
      {isFilterModalOpen && (
        <div
          data-gamepad-zone="modal"
          onClick={() => {
            playBack();
            setIsFilterModalOpen(false);
          }}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="console-diagonal-surface w-full max-w-2xl max-h-[82vh] rounded-3xl bg-[#0d1018]/95 border border-white/15 shadow-2xl flex flex-col overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <Filter className="w-4 h-4 text-white/75" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                  Filter Library
                </h3>
                {activeFilterCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-white text-slate-950 text-[10px] font-bold">
                    {activeFilterCount} active
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    data-gamepad-focusable="true"
                    onClick={() => {
                      playBack();
                      resetAllFilters();
                    }}
                    className="px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 text-xs font-semibold text-white flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                )}
                <button
                  type="button"
                  data-gamepad-close="true"
                  onClick={() => {
                    playBack();
                    setIsFilterModalOpen(false);
                  }}
                  className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/15 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1" data-gamepad-scroll="true">
              {/* Quick Toggles: Favorites + Install Status */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-gamepad-focusable="true"
                  onClick={() => {
                    playConfirm();
                    setFilterFavoritesOnly((v) => !v);
                  }}
                  className={`px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                    filterFavoritesOnly
                      ? "bg-amber-400/20 border-amber-400/40 text-amber-200"
                      : "bg-white/[0.04] border-white/10 text-zinc-300 hover:bg-white/10"
                  }`}
                >
                  <Star className={`w-3.5 h-3.5 ${filterFavoritesOnly ? "fill-amber-400" : ""}`} />
                  <span>Favorites Only</span>
                </button>

                {(["all", "installed", "uninstalled"] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    data-gamepad-focusable="true"
                    onClick={() => {
                      playConfirm();
                      setFilterInstallState(st);
                    }}
                    className={`px-3.5 py-2 rounded-xl border text-xs font-semibold capitalize cursor-pointer ${
                      filterInstallState === st
                        ? "bg-white text-slate-950 border-white"
                        : "bg-white/[0.04] border-white/10 text-zinc-300 hover:bg-white/10"
                    }`}
                  >
                    {st === "all" ? "All Statuses" : st}
                  </button>
                ))}
              </div>

              {/* Facet Tabs */}
              <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white/[0.04] border border-white/10 w-fit">
                {(
                  [
                    { id: "genres", label: `Genres (${availableGenres.length})` },
                    { id: "developers", label: `Developers (${availableDevelopers.length})` },
                    { id: "sources", label: `Libraries (${availableSources.length})` },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    data-gamepad-focusable="true"
                    onClick={() => {
                      playTabSwitch();
                      setFilterTab(tab.id);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                      filterTab === tab.id
                        ? "bg-white text-slate-950"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Facet Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(filterTab === "genres"
                  ? availableGenres
                  : filterTab === "developers"
                  ? availableDevelopers.slice(0, 60)
                  : availableSources
                ).map((item) => {
                  const selectedList =
                    filterTab === "genres"
                      ? selectedGenres
                      : filterTab === "developers"
                      ? selectedDevelopers
                      : selectedSources;
                  const isActive = selectedList.includes(item.name);

                  const toggle = () => {
                    playConfirm();
                    const updater = (prev: string[]) =>
                      prev.includes(item.name)
                        ? prev.filter((x) => x !== item.name)
                        : [...prev, item.name];
                    if (filterTab === "genres") setSelectedGenres(updater);
                    else if (filterTab === "developers") setSelectedDevelopers(updater);
                    else setSelectedSources(updater);
                  };

                  return (
                    <button
                      key={item.name}
                      type="button"
                      data-gamepad-focusable="true"
                      onClick={toggle}
                      className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 text-left cursor-pointer ${
                        isActive
                          ? "bg-white text-slate-950 border-white"
                          : "bg-white/[0.04] hover:bg-white/[0.1] border-white/10 text-zinc-200"
                      }`}
                    >
                      <span className="truncate">{item.name}</span>
                      <span className="text-[10px] font-mono opacity-65 shrink-0">
                        {item.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RS CLICK: CONSOLE SORT MODAL */}
      {isSortModalOpen && (
        <div
          data-gamepad-zone="modal"
          onClick={() => {
            playBack();
            setIsSortModalOpen(false);
          }}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="console-diagonal-surface w-full max-w-md rounded-3xl bg-[#0d1018]/95 border border-white/15 shadow-2xl overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <SlidersHorizontal className="w-4 h-4 text-white/75" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                  Sort Library
                </h3>
              </div>
              <button
                type="button"
                data-gamepad-close="true"
                onClick={() => {
                  playBack();
                  setIsSortModalOpen(false);
                }}
                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/15 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Direction Switcher */}
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-white/[0.04] border border-white/10">
                <button
                  type="button"
                  data-gamepad-focusable="true"
                  onClick={() => {
                    playTabSwitch();
                    onSortDirectionChange("desc");
                  }}
                  className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                    sortDirection === "desc"
                      ? "bg-white text-slate-950"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                  <span>Descending</span>
                </button>
                <button
                  type="button"
                  data-gamepad-focusable="true"
                  onClick={() => {
                    playTabSwitch();
                    onSortDirectionChange("asc");
                  }}
                  className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                    sortDirection === "asc"
                      ? "bg-white text-slate-950"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                  <span>Ascending</span>
                </button>
              </div>

              {/* Sort Fields */}
              <div className="space-y-2">
                {SORT_OPTIONS.map((opt) => {
                  const active = sortBy === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      data-gamepad-focusable="true"
                      onClick={() => {
                        playConfirm();
                        onSortByChange(opt.key);
                        if (opt.key === "title") {
                          onSortDirectionChange("asc");
                        } else {
                          onSortDirectionChange("desc");
                        }
                        setIsSortModalOpen(false);
                      }}
                      className={`w-full px-4 py-3 rounded-xl border text-xs font-bold flex items-center justify-between cursor-pointer transition-all ${
                        active
                          ? "bg-white text-slate-950 border-white"
                          : "bg-white/[0.04] hover:bg-white/[0.1] border-white/10 text-zinc-200"
                      }`}
                    >
                      <span>{opt.label}</span>
                      {active && <Check className="w-4 h-4" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const GridInfoRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  value?: string | null;
}> = ({ icon, label, value }) => {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-400 flex items-center gap-1.5 shrink-0">
        {icon}
        <span>{label}</span>
      </span>
      <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-200 font-semibold truncate text-right max-w-[190px]">
        {value}
      </span>
    </div>
  );
};

function formatClock(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
