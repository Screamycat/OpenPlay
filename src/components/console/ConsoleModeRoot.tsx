import React, { useEffect, useMemo, useState } from "react";
import { Game } from "../../types/game";
import { AppConfig, ConsoleProfile } from "../../types/config";
import { ThemeInfo } from "../../types/themes";
import { resolveImageSrc } from "../../utils/image";
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
  isRefreshing: boolean;
  isExternalModalOpen: boolean;
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
  isRefreshing,
  isExternalModalOpen,
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

  // Resolve full game object for details (including siblings)
  const detailsGame = useMemo(() => {
    if (!detailsGameId) return null;
    for (const g of games) {
      if (g.id === detailsGameId) return g;
      if (g.sibling_games) {
        const sib = g.sibling_games.find((s) => s.id === detailsGameId);
        if (sib) {
          return {
            ...sib,
            sibling_games: [g, ...g.sibling_games.filter((x) => x.id !== sib.id)],
          };
        }
      }
    }
    return null;
  }, [games, detailsGameId]);

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

  const isOverlayActive = systemMenuOpen || isExternalModalOpen;

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
          isOverlayActive={isOverlayActive || stage === "details"}
        />
      )}

      {stage === "details" && detailsGame && (
        <ConsoleGameDetails
          game={detailsGame}
          runningGameId={runningGameId}
          launchingGameId={launchingGameId}
          achievementSummary={achievementSummaryMap[detailsGame.id] || null}
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
          isOverlayActive={isOverlayActive}
        />
      )}

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
