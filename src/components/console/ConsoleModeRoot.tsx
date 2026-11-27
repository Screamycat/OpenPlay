import React, { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Game } from "../../types/game";
import { AppConfig, ConsoleProfile } from "../../types/config";
import { ThemeInfo } from "../../types/themes";
import {
  getStaticFallbackCover,
  isVideoSrc,
  resolveGridCoverSrc,
  resolveImageSrc,
} from "../../utils/image";
import {
  resolveGameAchievementSummary,
  resolveMergedSiblingView,
} from "../../utils/merger";
import { PlatformIcon } from "../icons/PlatformIcons";
import { useGamepad } from "../../contexts/GamepadContext";
import {
  configureConsoleMusic,
  configureConsoleSounds,
  stopConsoleMusic,
} from "../../utils/consoleSounds";
import { ConsoleSplash } from "./ConsoleSplash";
import { ConsoleProfileScreen } from "./ConsoleProfileScreen";
import {
  ConsoleAchievementSummaryLite,
  ConsoleHome,
  ConsoleHomeViewMode,
  ConsoleSortOption,
} from "./ConsoleHome";
import { ConsoleGameDetails } from "./ConsoleGameDetails";
import { ConsoleSystemMenu } from "./ConsoleSystemMenu";

type ConsoleStage = "splash" | "profile" | "home" | "details";

interface ConsoleModeRootProps {
  games: Game[];
  appConfig: AppConfig;
  activeConsoleTheme: ThemeInfo | null;
  achievementSummaryMap: Record<string, ConsoleAchievementSummaryLite>;
  runningGameId: string | null;
  launchingGameId: string | null;
  isWindowFocused: boolean;
  isRefreshing: boolean;
  isExternalModalOpen: boolean;
  onRequestHydrateGame: (gameId: string, siblingIds?: string[]) => void;
  onUpdateAppConfig: (partial: Partial<AppConfig>) => Promise<void> | void;
  onLaunchGame: (game: Game) => void;
  onInstallGame: (game: Game) => void;
  onToggleFavorite: (game: Game) => void;
  onUpdateGame?: (updated: Game) => void;
  onOpenGameOptions: (game: Game) => void;
  onOpenSaveManager: (game: Game) => void;
  onOpenAchievementHub: () => void;
  onRefreshLibraries: () => void;
  onOpenConsoleThemes: () => void;
  onOpenSettings: () => void;
  onExitConsoleMode: () => void;
}

const DEFAULT_FALLBACK_PROFILE: ConsoleProfile = {
  id: "default-player",
  name: "Player 1",
  accent_color: "#38bdf8",
};

export const ConsoleModeRoot: React.FC<ConsoleModeRootProps> = ({
  games,
  appConfig,
  activeConsoleTheme,
  achievementSummaryMap,
  runningGameId,
  launchingGameId,
  isWindowFocused,
  isRefreshing,
  isExternalModalOpen,
  onRequestHydrateGame,
  onUpdateAppConfig,
  onLaunchGame,
  onInstallGame,
  onToggleFavorite,
  onUpdateGame,
  onOpenGameOptions,
  onOpenSaveManager,
  onOpenAchievementHub,
  onRefreshLibraries,
  onOpenConsoleThemes,
  onOpenSettings,
  onExitConsoleMode,
}) => {
  const { isControllerActive } = useGamepad();

  // Auto-hide mouse cursor in Console Mode whenever in gamepad mode;
  // GamepadContext automatically exits gamepad mode on real mouse movement (>5px) or click.
  useEffect(() => {
    if (isControllerActive) {
      document.documentElement.dataset.consoleHideCursor = "true";
    } else {
      delete document.documentElement.dataset.consoleHideCursor;
    }
    return () => {
      delete document.documentElement.dataset.consoleHideCursor;
    };
  }, [isControllerActive]);

  const profiles: ConsoleProfile[] = useMemo(() => {
    if (appConfig.console_profiles && appConfig.console_profiles.length > 0) {
      return appConfig.console_profiles;
    }
    return [DEFAULT_FALLBACK_PROFILE];
  }, [appConfig.console_profiles]);

  const initialStage: ConsoleStage = useMemo(() => {
    if (appConfig.console_boot_splash_enabled !== false) {
      return "splash";
    }
    if (appConfig.console_auto_sign_in) {
      return "home";
    }
    return "profile";
  }, []);

  const [stage, setStage] = useState<ConsoleStage>(initialStage);
  const [selectedProfileId, setSelectedProfileId] = useState<string>(
    appConfig.console_active_profile_id || profiles[0]?.id || "default-player"
  );
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [detailsGameId, setDetailsGameId] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<ConsoleSortOption>("recent");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [systemMenuOpen, setSystemMenuOpen] = useState(false);
  const [isTrailerPlaying, setIsTrailerPlaying] = useState(false);
  const [dismissedSessionGameId, setDismissedSessionGameId] = useState<string | null>(null);

  const activeSessionGameId = launchingGameId || runningGameId || null;

  // Reset manual overlay dismissal whenever a new game launch starts or all sessions end
  useEffect(() => {
    if (!activeSessionGameId || launchingGameId) {
      setDismissedSessionGameId(null);
    }
  }, [activeSessionGameId, launchingGameId]);

  const defaultHomeViewFromTheme: ConsoleHomeViewMode = useMemo(() => {
    const val = activeConsoleTheme?.config_values?.default_home_view;
    if (typeof val === "string" && val.toLowerCase().includes("grid")) {
      return "grid";
    }
    return "carousel";
  }, [activeConsoleTheme?.manifest.id, activeConsoleTheme?.config_values?.default_home_view]);

  const [viewMode, setViewMode] = useState<ConsoleHomeViewMode>(defaultHomeViewFromTheme);

  // Sync UI sound effects and auto-mute while a game is running
  useEffect(() => {
    configureConsoleSounds(
      appConfig.console_ui_sounds !== false,
      appConfig.console_ui_volume ?? 0.45,
      !!runningGameId
    );
  }, [appConfig.console_ui_sounds, appConfig.console_ui_volume, runningGameId]);

  // Sync subtle Console Mode background music (auto-pauses on splash, in-game, trailers, or exit)
  const customMusicSrc = appConfig.console_bg_music_path
    ? resolveImageSrc(appConfig.console_bg_music_path)
    : undefined;

  useEffect(() => {
    configureConsoleMusic({
      active: stage !== "splash",
      enabled: appConfig.console_bg_music_enabled !== false,
      volume: appConfig.console_bg_music_volume ?? 0.25,
      customSrc: customMusicSrc,
      suspended: !!runningGameId || isTrailerPlaying,
    });
  }, [
    stage,
    appConfig.console_bg_music_enabled,
    appConfig.console_bg_music_volume,
    customMusicSrc,
    runningGameId,
    isTrailerPlaying,
  ]);

  useEffect(() => {
    return () => {
      stopConsoleMusic();
    };
  }, []);

  // Listen for Start button while on details stage to open Console System Menu
  useEffect(() => {
    if (stage !== "details" || systemMenuOpen || isExternalModalOpen) return;
    const onConsoleAction = (e: Event) => {
      const detail = (e as CustomEvent).detail as { action: string } | undefined;
      if (detail?.action === "start") {
        setSystemMenuOpen(true);
      }
    };
    window.addEventListener("openplay-console-action", onConsoleAction);
    return () => window.removeEventListener("openplay-console-action", onConsoleAction);
  }, [stage, systemMenuOpen, isExternalModalOpen]);

  const activeProfile = useMemo(() => {
    return (
      profiles.find((p) => p.id === selectedProfileId) ||
      profiles.find((p) => p.id === appConfig.console_active_profile_id) ||
      profiles[0] ||
      DEFAULT_FALLBACK_PROFILE
    );
  }, [profiles, selectedProfileId, appConfig.console_active_profile_id]);

  // Resolve full game object for details (including siblings with full merged metadata parity)
  const detailsGame = useMemo(() => {
    if (!detailsGameId) return null;
    for (const g of games) {
      if (g.id === detailsGameId) return g;
      if (g.sibling_games) {
        const sib = g.sibling_games.find((s) => s.id === detailsGameId);
        if (sib) {
          return resolveMergedSiblingView(g, sib);
        }
      }
    }
    return null;
  }, [games, detailsGameId]);

  const activeSessionGame = useMemo(() => {
    if (!activeSessionGameId) return null;
    for (const g of games) {
      if (g.id === activeSessionGameId) return g;
      if (g.sibling_games) {
        const sib = g.sibling_games.find((s) => s.id === activeSessionGameId);
        if (sib) return resolveMergedSiblingView(g, sib);
      }
    }
    return null;
  }, [games, activeSessionGameId]);

  const showLaunchingOverlay = Boolean(
    activeSessionGame && dismissedSessionGameId !== activeSessionGame.id
  );

  const handleSplashComplete = () => {
    if (appConfig.console_auto_sign_in) {
      setStage("home");
    } else {
      setStage("profile");
    }
  };

  const handleSelectProfile = async (profile: ConsoleProfile) => {
    setSelectedProfileId(profile.id);
    if (appConfig.console_active_profile_id !== profile.id) {
      await onUpdateAppConfig({ console_active_profile_id: profile.id });
    }
    setStage("home");
  };

  const handleSaveProfiles = async (
    nextProfiles: ConsoleProfile[],
    nextActiveId?: string
  ) => {
    const activeId = nextActiveId || activeProfile.id;
    setSelectedProfileId(activeId);
    await onUpdateAppConfig({
      console_profiles: nextProfiles,
      console_active_profile_id: activeId,
    });
  };

  const isOverlayActive = systemMenuOpen || isExternalModalOpen || showLaunchingOverlay;

  return (
    <div className="console-mode-shell">
      {stage === "splash" && (
        <ConsoleSplash
          customVideoPath={appConfig.console_boot_video_path || undefined}
          onComplete={handleSplashComplete}
        />
      )}

      {stage === "profile" && (
        <ConsoleProfileScreen
          profiles={profiles}
          activeProfileId={activeProfile.id}
          games={games}
          loginBgVideoPath={appConfig.console_login_bg_video_path || undefined}
          onChangeLoginBgVideo={async (nextPath) => {
            await onUpdateAppConfig({ console_login_bg_video_path: nextPath });
          }}
          onSelectProfile={handleSelectProfile}
          onSaveProfiles={handleSaveProfiles}
          onExitConsoleMode={onExitConsoleMode}
        />
      )}

      {(stage === "home" || stage === "details") && (
        <ConsoleHome
          games={games}
          runningGameId={runningGameId}
          launchingGameId={launchingGameId}
          activeProfile={activeProfile}
          achievementSummaryMap={achievementSummaryMap}
          lastPlayedDateFormat={appConfig.last_played_date_format}
          selectedGameId={selectedGameId}
          onSelectGameId={setSelectedGameId}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          activePreset={activePreset}
          onPresetChange={setActivePreset}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          sortBy={sortBy}
          onSortByChange={setSortBy}
          sortDirection={sortDirection}
          onSortDirectionChange={setSortDirection}
          onOpenDetails={(game) => {
            setDetailsGameId(game.id);
            setStage("details");
          }}
          onLaunchGame={onLaunchGame}
          onInstallGame={onInstallGame}
          onOpenGameOptions={onOpenGameOptions}
          onOpenSystemMenu={() => setSystemMenuOpen(true)}
          onOpenProfileSwitch={() => setStage("profile")}
          onOpenAchievementHub={onOpenAchievementHub}
          onRequestHydrateGame={onRequestHydrateGame}
          isOverlayActive={isOverlayActive || stage === "details"}
        />
      )}

      {stage === "details" && detailsGame && (
        <ConsoleGameDetails
          game={detailsGame}
          runningGameId={runningGameId}
          launchingGameId={launchingGameId}
          achievementSummary={resolveGameAchievementSummary(detailsGame, achievementSummaryMap)}
          lastPlayedDateFormat={appConfig.last_played_date_format}
          onBack={() => {
            setStage("home");
            setDetailsGameId(null);
            setIsTrailerPlaying(false);
          }}
          onLaunchGame={onLaunchGame}
          onInstallGame={onInstallGame}
          onToggleFavorite={onToggleFavorite}
          onUpdateGame={onUpdateGame}
          onOpenOptions={onOpenGameOptions}
          onOpenSaveManager={onOpenSaveManager}
          onSelectSiblingGame={(sib) => setDetailsGameId(sib.id)}
          onTrailerActiveChange={setIsTrailerPlaying}
          onRequestHydrateGame={onRequestHydrateGame}
          isOverlayActive={isOverlayActive}
        />
      )}

      {/* Console-Style Fullscreen Launching / In-Game Backdrop (Zero-GPU static once game takes focus) */}
      {showLaunchingOverlay && activeSessionGame && (() => {
        const rawBg =
          activeSessionGame.background_image ||
          activeSessionGame.screenshots?.[0] ||
          activeSessionGame.cover_image;
        const resolvedBg = resolveImageSrc(rawBg);
        const staticBg = resolvedBg
          ? isVideoSrc(resolvedBg)
            ? getStaticFallbackCover(resolvedBg)
            : resolvedBg
          : undefined;

        const resolvedCover = resolveGridCoverSrc(activeSessionGame.cover_image, 600);
        const staticCover = resolvedCover
          ? isVideoSrc(resolvedCover)
            ? getStaticFallbackCover(resolvedCover)
            : resolvedCover
          : undefined;

        const resolvedLogo = resolveImageSrc(activeSessionGame.logo_image);
        const staticLogo = resolvedLogo && !isVideoSrc(resolvedLogo) ? resolvedLogo : undefined;

        const isStillStarting = Boolean(launchingGameId) && isWindowFocused;
        const isHibernatingBehindGame = !isStillStarting;

        return (
          <div
            data-console-part="launching-overlay"
            className="fixed inset-0 z-50 bg-[#05070e] text-white flex flex-col items-center justify-center overflow-hidden select-none"
          >
            {/* Strictly static artwork backdrop — zero video decode, zero repaint behind game */}
            {staticBg && (
              <img
                src={staticBg}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover opacity-30 scale-105"
                style={{ filter: "blur(18px) saturate(1.1)" }}
              />
            )}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(circle at center, rgba(5,7,14,0.45) 0%, rgba(5,7,14,0.94) 80%)",
              }}
            />

            <div className="relative z-10 flex flex-col items-center text-center px-8 max-w-2xl space-y-6">
              {staticCover && (
                <div
                  className="w-40 sm:w-48 aspect-[2/3] overflow-hidden border border-white/15 bg-zinc-900 shadow-2xl"
                  style={{ borderRadius: "var(--console-card-radius, 14px)" }}
                >
                  <img
                    src={staticCover}
                    alt={activeSessionGame.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              {staticLogo ? (
                <img
                  src={staticLogo}
                  alt={activeSessionGame.title}
                  className="max-h-24 max-w-[440px] w-auto object-contain drop-shadow-[0_10px_28px_rgba(0,0,0,0.85)]"
                />
              ) : (
                <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
                  {activeSessionGame.title}
                </h1>
              )}

              <div className="flex flex-col items-center space-y-3 pt-1">
                <div className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full bg-white/[0.08] border border-white/12 text-sm font-semibold text-white/90">
                  {isStillStarting ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white/90" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  )}
                  <span>
                    {isStillStarting
                      ? `Starting ${activeSessionGame.title}...`
                      : `Playing ${activeSessionGame.title}`}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs text-white/45">
                  <PlatformIcon platform={activeSessionGame.source} className="w-3.5 h-3.5" />
                  <span>{activeSessionGame.source}</span>
                </div>

                {/* If user switches back to OpenPlay while the game is still running, allow returning to library */}
                {isHibernatingBehindGame && isWindowFocused && (
                  <button
                    type="button"
                    onClick={() => setDismissedSessionGameId(activeSessionGame.id)}
                    className="mt-2 px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-semibold text-white/80 hover:text-white transition-colors cursor-pointer"
                  >
                    Return to Library
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      <ConsoleSystemMenu
        isOpen={systemMenuOpen}
        activeProfile={activeProfile}
        isRefreshing={isRefreshing}
        onClose={() => setSystemMenuOpen(false)}
        onSwitchProfile={() => setStage("profile")}
        onOpenAchievementHub={onOpenAchievementHub}
        onRefreshLibraries={onRefreshLibraries}
        onOpenConsoleThemes={onOpenConsoleThemes}
        onOpenSettings={onOpenSettings}
        onExitConsoleMode={onExitConsoleMode}
      />
    </div>
  );
};
