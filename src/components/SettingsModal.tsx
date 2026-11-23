import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  Sliders,
  Palette,
  PlaySquare,
  KeyRound,
  Info,
  ExternalLink,
  Check,
  Eye,
  EyeOff,
  Terminal,
  Archive,
  RefreshCw,
  Download,
  CheckCircle2,
  AlertCircle,
  Cpu,
  FolderOpen,
  Gamepad2,
  RotateCcw,
  Tv,
  Volume2,
  Film,
  Trash2,
  Monitor,
  Music,
  Bug,
  Lightbulb,
  Copy,
  Send,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, DisplayInfo, getVersion } from "../utils/ipc";
import { openUrl } from "@tauri-apps/plugin-opener";
import { AppConfig, DEFAULT_APP_CONFIG, RunnerInfo } from "../types/config";
import {
  CONTROLLER_ACTIONS_META,
  ControllerGlyphStyle,
  getButtonDisplayName,
  getPhysicalButtonForAction,
  resolveGlyphProfile,
} from "../types/gamepad";
import { useGamepad } from "../contexts/GamepadContext";
import { ControllerGlyph } from "./gamepad/ControllerGlyph";
import { PlayniteBackupTab } from "./library/PlayniteBackupTab";
import { OpenPlayBackupTab } from "./library/OpenPlayBackupTab";
import { CloudSyncSettingsCard } from "./library/CloudSyncSettingsCard";
import { formatFileSize } from "../utils/image";
import { UpdateCheckResult, UpdateProgressPayload } from "../types/update";
import { ThemeInfo } from "../types/themes";
import { resolveImageSrc } from "../utils/image";
import { applyTheme } from "../utils/themeEngine";
import {
  BUILTIN_CONSOLE_LOGIN_VIDEOS,
  DEFAULT_CONSOLE_BOOT_VIDEO,
  DEFAULT_CONSOLE_LOGIN_VIDEO,
} from "../constants/consoleVideos";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenThemes?: () => void;
  onOpenConsoleThemes?: () => void;
  onEnterConsoleMode?: () => void;
  onScanLibrary?: () => void;
  onReloadGames?: () => Promise<void>;
  isScanning?: boolean;
  totalGames?: number;
  config: AppConfig;
  onSaveConfig: (updated: AppConfig) => void;
  initialTab?: string;
  initialUpdateResult?: UpdateCheckResult | null;
}

type SettingsTab =
  | "general"
  | "appearance"
  | "playback"
  | "controller"
  | "console"
  | "linux"
  | "apis"
  | "backup"
  | "about";

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onOpenThemes,
  config: initialConfig,
  onSaveConfig,
  onReloadGames,
  initialTab,
  initialUpdateResult,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    (initialTab as SettingsTab) || "general"
  );
  const [activeTheme, setActiveTheme] = useState<ThemeInfo | null>(null);
  const [appearanceCategory, setAppearanceCategory] = useState<string>("All");
  const [formConfig, setFormConfig] = useState<AppConfig>({
    ...DEFAULT_APP_CONFIG,
    ...initialConfig,
  });
  const [showSgdbKey, setShowSgdbKey] = useState(false);
  const [showIgdbSecret, setShowIgdbSecret] = useState(false);
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    getCurrentWindow()
      .getDisplays()
      .then((list) => setDisplays(list || []))
      .catch(() => setDisplays([]));
  }, [isOpen]);
  const [isSavedNotice, setIsSavedNotice] = useState(false);
  const [appVersion, setAppVersion] = useState<string>("");
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(
    initialUpdateResult || null
  );

  useEffect(() => {
    getVersion()
      .then((ver) => {
        if (ver) setAppVersion(ver);
      })
      .catch(() => {});
  }, []);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // In-app updater states: "idle" | "downloading" | "ready" | "restarting"
  const [updateStatus, setUpdateStatus] = useState<
    "idle" | "downloading" | "ready" | "restarting"
  >("idle");
  const [downloadProgress, setDownloadProgress] = useState<UpdateProgressPayload>({
    downloaded: 0,
    total: 0,
    percentage: 0,
  });
  const [installerPath, setInstallerPath] = useState<string | null>(null);
  const [backupSubTab, setBackupSubTab] = useState<"cloud" | "openplay" | "playnite">("cloud");

  // Feedback section state
  const [feedbackType, setFeedbackType] = useState<"bug" | "feature">("bug");
  const [feedbackTitle, setFeedbackTitle] = useState("");
  const [feedbackBody, setFeedbackBody] = useState("");
  const [includeSystemInfo, setIncludeSystemInfo] = useState(true);
  const [systemInfo, setSystemInfo] = useState<{
    version: string;
    os: string;
    arch: string;
    is_appimage?: boolean;
  } | null>(null);
  const [copiedDiagnostics, setCopiedDiagnostics] = useState(false);
  const [availableRunners, setAvailableRunners] = useState<RunnerInfo[]>([]);
  const {
    isControllerConnected,
    controllerName,
    listeningForAction,
    startListeningForKeybind,
    cancelListeningForKeybind,
  } = useGamepad();

  useEffect(() => {
    if (isOpen && (activeTab === "linux" || activeTab === "playback")) {
      invoke<RunnerInfo[]>("get_available_runners")
        .then((runners) => setAvailableRunners(runners || []))
        .catch((err) => console.warn("Failed to load runners:", err));
    }
  }, [isOpen, activeTab]);

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab as SettingsTab);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen) return;
    const refreshActiveTheme = () => {
      invoke<ThemeInfo[]>("get_installed_themes")
        .then((themes) => {
          const active =
            themes.find((t) => t.is_active) ||
            themes.find((t) => t.manifest.id === "default") ||
            themes[0];
          setActiveTheme(active || null);
        })
        .catch((err) => console.warn("Failed to load active theme in settings:", err));
    };
    refreshActiveTheme();
    const unlisten = listen("cloud-sync-completed", () => {
      refreshActiveTheme();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [isOpen, initialConfig.active_theme_id]);

  useEffect(() => {
    if (initialUpdateResult) {
      setUpdateResult(initialUpdateResult);
    }
  }, [initialUpdateResult]);

  useEffect(() => {
    if (isOpen && activeTab === "about" && !systemInfo) {
      invoke<{ version: string; os: string; arch: string; is_appimage?: boolean }>(
        "get_system_info"
      )
        .then((info) => setSystemInfo(info))
        .catch(() => {});
    }
  }, [isOpen, activeTab, systemInfo]);

  useEffect(() => {
    let isMounted = true;
    const unlistenPromise = listen<UpdateProgressPayload>(
      "app-update-progress",
      (event) => {
        if (!isMounted) return;
        setDownloadProgress(event.payload);
      }
    );

    return () => {
      isMounted = false;
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const handleCheckForUpdates = async () => {
    setIsCheckingUpdate(true);
    setUpdateError(null);
    setUpdateStatus("idle");
    try {
      const res = await invoke<UpdateCheckResult>("check_for_app_updates");
      setUpdateResult(res);
    } catch (err: any) {
      setUpdateError(String(err));
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleStartUpdate = async () => {
    if (!updateResult?.download_url) return;
    setUpdateStatus("downloading");
    setUpdateError(null);
    setDownloadProgress({ downloaded: 0, total: 0, percentage: 0 });

    try {
      const path = await invoke<string>("download_app_update", {
        downloadUrl: updateResult.download_url,
        targetVersion: updateResult.latest_version,
      });
      setInstallerPath(path);
      setUpdateStatus("ready");
    } catch (err: any) {
      setUpdateError(String(err));
      setUpdateStatus("idle");
    }
  };

  const handleApplyUpdateAndRestart = async () => {
    if (!installerPath) return;
    setUpdateStatus("restarting");
    try {
      await invoke("apply_update_and_restart", { installerPath });
    } catch (err: any) {
      setUpdateError(String(err));
      setUpdateStatus("ready");
    }
  };

  const buildSystemInfoMarkdown = () => {
    const version = systemInfo?.version || updateResult?.current_version || appVersion || "unknown";
    const os = systemInfo?.os || (navigator.userAgent.includes("Windows") ? "windows" : "linux");
    const arch = systemInfo?.arch || "x86_64";
    const pkg = systemInfo?.is_appimage ? " (AppImage)" : "";
    return [
      "### Environment",
      `- **OpenPlay Version:** v${version}`,
      `- **OS / Arch:** ${os} (${arch})${pkg}`,
    ].join("\n");
  };

  const handleOpenFeedbackOnGitHub = () => {
    const isBug = feedbackType === "bug";
    const label = isBug ? "bug" : "enhancement";
    const prefix = isBug ? "[Bug]: " : "[Feature]: ";
    const title = feedbackTitle.trim() ? `${prefix}${feedbackTitle.trim()}` : prefix;

    const sections: string[] = [];
    if (isBug) {
      sections.push("### Description");
      sections.push(feedbackBody.trim() || "_Describe what went wrong and how to reproduce it._");
    } else {
      sections.push("### Feature Summary");
      sections.push(feedbackBody.trim() || "_Describe the feature or improvement you'd like to see._");
    }
    if (includeSystemInfo) {
      sections.push("");
      sections.push(buildSystemInfoMarkdown());
    }

    const params = new URLSearchParams({
      labels: label,
      title,
      body: sections.join("\n"),
    });
    openUrl(`https://github.com/Screamycat/OpenPlay/issues/new?${params.toString()}`);
  };

  const handleCopyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(buildSystemInfoMarkdown());
      setCopiedDiagnostics(true);
      setTimeout(() => setCopiedDiagnostics(false), 2000);
    } catch {
      // ignore clipboard error
    }
  };

  useEffect(() => {
    setFormConfig({ ...DEFAULT_APP_CONFIG, ...initialConfig });
    if (isOpen) {
      invoke<boolean>("get_autostart_status")
        .then((status) => {
          setFormConfig((prev) => ({ ...prev, launch_on_startup: status }));
        })
        .catch((err) => console.error("Failed to query autostart status:", err));
    }
  }, [initialConfig, isOpen]);

  const appearanceCategories = useMemo(() => {
    if (!activeTheme?.manifest?.settings) return [];
    const set = new Set<string>();
    for (const s of activeTheme.manifest.settings) {
      if (s.category && s.category.trim()) {
        set.add(s.category.trim());
      }
    }
    return Array.from(set);
  }, [activeTheme]);

  const updateField = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => {
    const updated = { ...formConfig, [key]: value };
    setFormConfig(updated);
    onSaveConfig(updated);
    setIsSavedNotice(true);
    setTimeout(() => setIsSavedNotice(false), 2000);
  };

  const updateAppearanceSetting = (key: string, value: any) => {
    // 1. Map specialized values for AppConfig if needed
    let appConfigVal = value;
    if (key === "view_mode") {
      if (value === "Split View") appConfigVal = "split";
      else if (value === "Full Grid") appConfigVal = "grid";
      else if (value === "Table List") appConfigVal = "list";
    }

    // 2. Update formConfig & appConfig
    const updated = { ...formConfig, [key]: appConfigVal };
    setFormConfig(updated);
    onSaveConfig(updated);
    setIsSavedNotice(true);
    setTimeout(() => setIsSavedNotice(false), 2000);

    // 3. Also save to activeTheme config and apply live
    if (activeTheme) {
      const updatedConfigValues = {
        ...(activeTheme.config_values || {}),
        [key]: value,
      };
      const updatedTheme: ThemeInfo = {
        ...activeTheme,
        config_values: updatedConfigValues,
      };
      setActiveTheme(updatedTheme);
      applyTheme(updatedTheme);

      invoke("save_theme_config", {
        themeId: activeTheme.manifest.id,
        configJson: JSON.stringify(updatedConfigValues),
      }).catch((e) => console.warn("Failed to persist theme config:", e));
    }
  };

  const navItems = [
    { id: "general", label: "General", icon: Sliders },
    { id: "appearance", label: "Appearance", icon: Palette },
    { id: "playback", label: "Playback & Media", icon: PlaySquare },
    { id: "controller", label: "Controller", icon: Gamepad2 },
    { id: "console", label: "Console Mode", icon: Tv },
    { id: "linux", label: "Linux", icon: Terminal },
    { id: "apis", label: "APIs & Services", icon: KeyRound },
    { id: "backup", label: "Backups & Data", icon: Archive },
    { id: "about", label: "About OpenPlay", icon: Info },
  ] as const;

  if (!isOpen) return null;

  return (
    <div
      id="openplay-settings-modal"
      onClick={onClose}
      data-theme-part="settings-modal"
      className="openplay-system-modal fixed inset-0 z-50 theme-modal-backdrop flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-theme-part="modal-container"
        data-gamepad-zone="modal"
        className="theme-modal-container rounded-2xl w-full max-w-4xl h-[620px] max-h-[90vh] flex flex-col overflow-hidden text-zinc-200"
      >
        {/* Header */}
        <div className="h-14 px-5 border-b border-white/10 flex items-center justify-between bg-white/[0.02] shrink-0">
          <div className="flex items-center space-x-2.5">
            <Sliders className="w-4 h-4 text-zinc-400" />
            <h2 className="text-sm font-bold text-white tracking-wide uppercase">
              OpenPlay Settings
            </h2>
            {isSavedNotice && (
              <span className="flex items-center space-x-1 text-[11px] text-zinc-200 font-semibold px-2 py-0.5 rounded bg-white/10 border border-white/15">
                <Check className="w-3 h-3 text-zinc-300" />
                <span>Saved</span>
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            data-gamepad-close="true"
            className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/15 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer border border-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body: Sidebar + Main Settings View */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar Navigation */}
          <div
            data-gamepad-tabs="true"
            className="w-52 border-r border-white/10 bg-white/[0.015] p-2.5 space-y-1 shrink-0 overflow-y-auto"
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  data-gamepad-tab-active={isActive ? "true" : undefined}
                  className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left ${
                    isActive
                      ? "bg-white/15 text-white shadow-sm border border-white/10"
                      : "text-zinc-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0 text-zinc-400" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab Content Pane */}
          <div className="flex-1 p-6 overflow-y-auto space-y-6 text-xs text-zinc-300">
            {/* 1. General Tab */}
            {activeTab === "general" && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-1">
                    Application Startup & Behavior
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Control how OpenPlay behaves when launched and when executing games.
                  </p>
                </div>

                <div className="space-y-3 bg-white/[0.02] border border-white/5 rounded-xl p-4">
                  {/* Launch on Startup */}
                  <label className="flex items-center justify-between cursor-pointer group">
                    <div className="space-y-0.5">
                      <div className="font-semibold text-zinc-200 group-hover:text-white transition-colors">
                        Launch on System Startup
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        Start OpenPlay automatically when logging into your computer.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={formConfig.launch_on_startup ?? false}
                      onChange={async (e) => {
                        const checked = e.target.checked;
                        try {
                          await invoke("set_autostart", { enabled: checked });
                        } catch (err) {
                          console.error("Failed to update autostart setting:", err);
                        }
                        updateField("launch_on_startup", checked);
                      }}
                      className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-white accent-white cursor-pointer"
                    />
                  </label>

                  <div className="border-t border-white/5" />

                  {/* Sync All Libraries on Startup */}
                  <label className="flex items-center justify-between cursor-pointer group">
                    <div className="space-y-0.5">
                      <div className="font-semibold text-zinc-200 group-hover:text-white transition-colors">
                        Sync Libraries on Startup
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        Automatically check for newly added games, playtime, and last-played dates in the background when OpenPlay launches.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={formConfig.sync_on_startup ?? formConfig.auto_scan_on_startup ?? true}
                      onChange={(e) => {
                        const val = e.target.checked;
                        updateField("sync_on_startup", val);
                        updateField("auto_scan_on_startup", val);
                      }}
                      className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-white accent-white cursor-pointer"
                    />
                  </label>

                  <div className="border-t border-white/5" />

                  {/* Periodic Background Playtime Sync */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5 pr-4">
                      <div className="font-semibold text-zinc-200">
                        Periodic Background Playtime Sync
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        Automatically sync playtime and recency in the background across devices (automatically paused during gameplay).
                      </div>
                    </div>
                    <select
                      value={formConfig.periodic_playtime_sync_hours ?? 0}
                      onChange={(e) =>
                        updateField("periodic_playtime_sync_hours", parseInt(e.target.value, 10))
                      }
                      className="bg-zinc-800 border border-zinc-700 text-xs text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-zinc-500 shrink-0 cursor-pointer"
                    >
                      <option value={0}>Disabled</option>
                      <option value={2}>Every 2 hours</option>
                      <option value={4}>Every 4 hours</option>
                      <option value={8}>Every 8 hours</option>
                      <option value={12}>Every 12 hours</option>
                      <option value={24}>Every 24 hours</option>
                    </select>
                  </div>

                  <div className="border-t border-white/5" />

                  {/* Minimize on Game Launch */}
                  <label className="flex items-center justify-between cursor-pointer group">
                    <div className="space-y-0.5">
                      <div className="font-semibold text-zinc-200 group-hover:text-white transition-colors">
                        Minimize on Game Launch
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        Minimize OpenPlay to the taskbar when a game starts playing.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={formConfig.minimize_on_game_launch ?? false}
                      onChange={(e) => updateField("minimize_on_game_launch", e.target.checked)}
                      className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-white accent-white cursor-pointer"
                    />
                  </label>

                  <div className="border-t border-white/5" />

                  {/* Close to Tray */}
                  <label className="flex items-center justify-between cursor-pointer group">
                    <div className="space-y-0.5">
                      <div className="font-semibold text-zinc-200 group-hover:text-white transition-colors">
                        Close to System Tray
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        Keep OpenPlay running in the background notification area when closed.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={formConfig.close_to_tray ?? false}
                      onChange={(e) => updateField("close_to_tray", e.target.checked)}
                      className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-white accent-white cursor-pointer"
                    />
                  </label>

                  <div className="border-t border-white/5" />

                  {/* Merge Duplicate Games */}
                  <label className="flex items-center justify-between cursor-pointer group">
                    <div className="space-y-0.5">
                      <div className="font-semibold text-zinc-200 group-hover:text-white transition-colors">
                        Merge Duplicate Games
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        Automatically combine identical titles owned across Steam, Epic, Local, and Retro into single cards.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={formConfig.merge_duplicates ?? true}
                      onChange={(e) => updateField("merge_duplicates", e.target.checked)}
                      className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-white accent-white cursor-pointer"
                    />
                  </label>
                </div>

                {/* Display & Formatting */}
                <div className="pt-2">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-1">
                    Display & Formatting
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Customize how dates, timestamps, and metadata are presented across your library.
                  </p>
                </div>

                <div className="space-y-3 bg-white/[0.02] border border-white/5 rounded-xl p-4">
                  {/* Date & Time Display Format */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5 pr-4">
                      <div className="font-semibold text-zinc-200">
                        Date & Time Display
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        Choose whether last played timestamps display date only or include the clock time.
                      </div>
                    </div>
                    <select
                      value={formConfig.last_played_date_format ?? "date_and_time"}
                      onChange={(e) =>
                        updateField("last_played_date_format", e.target.value as "date_and_time" | "date_only")
                      }
                      className="bg-zinc-800 border border-zinc-700 text-xs text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-zinc-500 shrink-0 cursor-pointer"
                    >
                      <option value="date_and_time">Date + Time (e.g. Nov 2, 2026 • 14:30)</option>
                      <option value="date_only">Date Only (e.g. Nov 2, 2026)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* 2. Appearance Tab */}
            {activeTab === "appearance" && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-1">
                    Interface & Theme Customization
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Control the appearance, geometry, and visual style of the active theme.
                  </p>
                </div>

                {/* Active Theme Hero Card */}
                {activeTheme && (
                  <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between gap-4">
                    <div className="flex items-center space-x-3.5 min-w-0">
                      <div className="w-12 h-12 rounded-xl bg-black/40 border border-white/10 overflow-hidden flex items-center justify-center shrink-0 shadow-sm">
                        {activeTheme.resolved_icon ? (
                          <img
                            src={resolveImageSrc(activeTheme.resolved_icon)}
                            alt={activeTheme.manifest.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Palette className="w-6 h-6 theme-accent-text" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-bold text-white truncate">
                            {activeTheme.manifest.name}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 font-mono text-zinc-300">
                            v{activeTheme.manifest.version}
                          </span>
                          {activeTheme.is_builtin && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/10 text-zinc-400 font-mono">
                              BUILT-IN
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-400 truncate mt-0.5">
                          by <span className="text-zinc-200">{activeTheme.manifest.author}</span> • {activeTheme.manifest.description}
                        </p>
                      </div>
                    </div>

                    {onOpenThemes && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenThemes();
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-200 hover:text-white text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer shrink-0"
                      >
                        <Palette className="w-3.5 h-3.5 text-zinc-400" />
                        <span>Browse Themes</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Category Filter Tabs (Mirroring theme.json categories) */}
                {appearanceCategories.length > 0 && (
                  <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 text-xs">
                    {["All", ...appearanceCategories].map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setAppearanceCategory(cat)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                          appearanceCategory === cat
                            ? "theme-accent-btn shadow-md text-white font-bold"
                            : "bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white border border-white/5"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}

                {/* Theme Config Settings (Mirroring Active Theme theme.json) */}
                <div className="space-y-4 bg-white/[0.02] border border-white/5 rounded-xl p-4">
                  {activeTheme?.manifest.settings && activeTheme.manifest.settings.length > 0 ? (
                    activeTheme.manifest.settings
                      .filter((setting) => {
                        if (appearanceCategory === "All") return true;
                        return (setting.category || "").trim() === appearanceCategory;
                      })
                      .map((setting, idx) => {
                        const currentVal =
                          activeTheme?.config_values?.[setting.id] !== undefined
                            ? activeTheme.config_values[setting.id]
                            : setting.default;

                        return (
                          <React.Fragment key={setting.id}>
                            {idx > 0 && <div className="border-t border-white/5" />}

                            <div className="space-y-2">
                              {/* Label, Description & Current Value Readout */}
                              <div className="flex justify-between items-start gap-4">
                                <div>
                                  <label className="font-semibold text-zinc-200 text-xs block">
                                    {setting.label}
                                  </label>
                                  {setting.description && (
                                    <span className="text-[11px] text-zinc-400 block mt-0.5 leading-snug">
                                      {setting.description}
                                    </span>
                                  )}
                                </div>
                                <span className="font-mono text-zinc-300 text-xs px-2 py-0.5 rounded bg-white/5 border border-white/10 shrink-0">
                                  {setting.type === "color"
                                    ? String(currentVal || setting.default || "")
                                    : setting.type === "boolean"
                                    ? currentVal ? "Enabled" : "Disabled"
                                    : setting.type === "number"
                                    ? (setting.min !== undefined && setting.min >= 0 && setting.max !== undefined && setting.max <= 1)
                                      ? `${Math.round(Number(currentVal || 0) * 100)}%`
                                      : (setting.label || "").includes("Blur")
                                      ? `${currentVal}px`
                                      : (setting.label || "").includes("%")
                                      ? `${currentVal}%`
                                      : String(currentVal ?? "")
                                    : String(currentVal ?? "")}
                                </span>
                              </div>

                              {/* Control: Color */}
                              {setting.type === "color" && (
                                <div className="flex items-center gap-2 flex-wrap pt-1">
                                  {(setting.id === "panel_tint"
                                    ? [
                                        { name: "Greyish Black", hex: "#0e0e11" },
                                        { name: "Onyx", hex: "#070709" },
                                        { name: "Midnight Navy", hex: "#0a0d17" },
                                        { name: "Charcoal", hex: "#14151b" },
                                        { name: "Slate", hex: "#0f172a" },
                                      ]
                                    : [
                                        { name: "Purple", hex: "#783efe" },
                                        { name: "Cyan", hex: "#06b6d4" },
                                        { name: "Blue", hex: "#3b82f6" },
                                        { name: "Emerald", hex: "#10b981" },
                                        { name: "Amber", hex: "#f59e0b" },
                                        { name: "Rose", hex: "#f43f5e" },
                                        { name: "White", hex: "#ffffff" },
                                      ]
                                  ).map((preset) => {
                                    const isSelected =
                                      String(currentVal || "").toLowerCase() ===
                                      preset.hex.toLowerCase();
                                    return (
                                      <button
                                        key={preset.hex}
                                        type="button"
                                        onClick={() => updateAppearanceSetting(setting.id, preset.hex)}
                                        title={preset.name}
                                        className={`w-7 h-7 rounded-full transition-all cursor-pointer flex items-center justify-center border ${
                                          isSelected
                                            ? "ring-2 ring-white ring-offset-2 ring-offset-black scale-110 border-white"
                                            : "border-white/20 hover:scale-105"
                                        }`}
                                        style={{ backgroundColor: preset.hex }}
                                      >
                                        {isSelected && (
                                          <Check
                                            className={`w-3.5 h-3.5 ${
                                              preset.hex === "#ffffff" ? "text-black" : "text-white"
                                            }`}
                                          />
                                        )}
                                      </button>
                                    );
                                  })}

                                  {/* Native Custom Color Picker Swatch */}
                                  <label className="relative w-7 h-7 rounded-full border border-white/20 hover:border-white/40 cursor-pointer overflow-hidden flex items-center justify-center bg-white/5 transition-all">
                                    <input
                                      type="color"
                                      value={currentVal || setting.default || "#783efe"}
                                      onChange={(e) => updateAppearanceSetting(setting.id, e.target.value)}
                                      className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                                    />
                                    <Palette className="w-3.5 h-3.5 text-zinc-400" />
                                  </label>
                                </div>
                              )}

                              {/* Control: Select */}
                              {setting.type === "select" && setting.options && (
                                <div
                                  className={`grid gap-2 ${
                                    setting.options.length <= 3
                                      ? "grid-cols-3"
                                      : setting.options.length === 4
                                      ? "grid-cols-2 sm:grid-cols-4"
                                      : "grid-cols-1 sm:grid-cols-3"
                                  }`}
                                >
                                  {setting.options.map((opt) => {
                                    const isSelected = String(currentVal) === opt;
                                    return (
                                      <button
                                        key={opt}
                                        type="button"
                                        onClick={() => updateAppearanceSetting(setting.id, opt)}
                                        className={`py-2 px-2.5 rounded-xl border text-xs font-semibold truncate transition-all cursor-pointer ${
                                          isSelected
                                            ? "bg-white text-zinc-950 border-white font-bold shadow-md"
                                            : "bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10 hover:text-white"
                                        }`}
                                      >
                                        {opt}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Control: Boolean */}
                              {setting.type === "boolean" && (
                                <button
                                  type="button"
                                  onClick={() => updateAppearanceSetting(setting.id, !Boolean(currentVal))}
                                  className={`w-full py-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                                    currentVal
                                      ? "theme-accent-subtle-bg theme-accent-subtle-border text-white"
                                      : "bg-white/5 border-white/10 text-zinc-400 hover:text-white"
                                  }`}
                                >
                                  <span>{currentVal ? "Enabled" : "Disabled"}</span>
                                  {currentVal && <Check className="w-3.5 h-3.5 theme-accent-text" />}
                                </button>
                              )}

                              {/* Control: Number Slider */}
                              {setting.type === "number" && (
                                <div className="pt-1">
                                  <input
                                    type="range"
                                    min={setting.min ?? 0}
                                    max={setting.max ?? 100}
                                    step={setting.step ?? 1}
                                    value={currentVal ?? setting.default}
                                    onChange={(e) =>
                                      updateAppearanceSetting(setting.id, Number(e.target.value))
                                    }
                                    className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-white"
                                  />
                                  <div className="flex justify-between text-[10px] text-zinc-500 font-mono mt-1">
                                    <span>{setting.min ?? 0}</span>
                                    <span>{setting.max ?? 100}</span>
                                  </div>
                                </div>
                              )}

                              {/* Control: Text */}
                              {setting.type === "text" && (
                                <input
                                  type="text"
                                  value={currentVal || ""}
                                  onChange={(e) => updateAppearanceSetting(setting.id, e.target.value)}
                                  className="w-full bg-[#161a29] border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[var(--app-accent-color)]"
                                />
                              )}
                            </div>
                          </React.Fragment>
                        );
                      })
                  ) : (
                    <div className="py-8 text-center text-zinc-500 text-xs">
                      No configurable settings found for this theme.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 3. Playback & Media Tab */}
            {activeTab === "playback" && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-1">
                    Trailers & Media Playback
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Control game trailer behavior in the details overview.
                  </p>
                </div>

                <div className="space-y-3 bg-white/[0.02] border border-white/5 rounded-xl p-4">
                  {/* Autoplay Trailers */}
                  <label className="flex items-center justify-between cursor-pointer group">
                    <div className="space-y-0.5">
                      <div className="font-semibold text-zinc-200 group-hover:text-white transition-colors">
                        Autoplay Video Trailers
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        Automatically play video trailers when opening the trailer dialog or player.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={formConfig.trailer_autoplay ?? true}
                      onChange={(e) => updateField("trailer_autoplay", e.target.checked)}
                      className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-white accent-white cursor-pointer"
                    />
                  </label>

                  <div className="border-t border-white/5" />

                  {/* Muted by Default */}
                  <label className="flex items-center justify-between cursor-pointer group">
                    <div className="space-y-0.5">
                      <div className="font-semibold text-zinc-200 group-hover:text-white transition-colors">
                        Mute Trailers by Default
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        Start trailer videos with audio muted until manually unmuted.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={formConfig.trailer_muted ?? true}
                      onChange={(e) => updateField("trailer_muted", e.target.checked)}
                      className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-white accent-white cursor-pointer"
                    />
                  </label>
                </div>
              </div>
            )}

            {/* 4. Linux Tab */}
            {activeTab === "linux" && (
              <div className="space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <Cpu className="w-3.5 h-3.5 text-purple-400" />
                      Linux Compatibility & Execution (Wine / Proton)
                    </h3>
                    <button
                      type="button"
                      onClick={() => {
                        invoke<RunnerInfo[]>("get_available_runners")
                          .then((runners) => setAvailableRunners(runners || []))
                          .catch((e) => console.warn(e));
                      }}
                      className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1 transition-colors px-2 py-0.5 rounded bg-white/5 hover:bg-white/10"
                      title="Rescan installed Proton / Wine runners"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Rescan
                    </button>
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Standalone execution configuration for Windows (.exe) titles running natively on Linux without external frontends.
                  </p>
                </div>

                <div className="space-y-4 bg-white/[0.02] border border-white/5 rounded-xl p-4">
                  {/* Preferred Runner Selection */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-200 block">
                      Preferred Compatibility Runner
                    </label>
                    <select
                      value={formConfig.linux_preferred_runner_id || ""}
                      onChange={(e) => updateField("linux_preferred_runner_id", e.target.value || undefined)}
                      className="w-full px-3 py-2 bg-zinc-900 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-purple-500/50"
                    >
                      <option value="">
                        Auto-Detect Best Runner {availableRunners.find((r) => r.is_default) ? `(Default: ${availableRunners.find((r) => r.is_default)?.name})` : ""}
                      </option>
                      {availableRunners.map((runner) => (
                        <option key={runner.id} value={runner.id}>
                          {runner.name} [{runner.runner_type.toUpperCase()}] {runner.is_default ? "★ Recommended" : ""}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-zinc-500">
                      Discovered runners from Steam compatibility tools (GE-Proton), Steam common runtimes, Lutris/Heroic, and system Wine.
                    </p>
                  </div>

                  {/* Custom Runner Path (Optional) */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-200 block">
                      Custom Runner Directory or Binary (Optional)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={formConfig.linux_custom_runner_path || ""}
                        onChange={(e) => updateField("linux_custom_runner_path", e.target.value || undefined)}
                        placeholder="e.g. /home/user/.steam/root/compatibilitytools.d/GE-Proton9-25 or /usr/bin/wine"
                        className="flex-1 px-3 py-2 bg-zinc-900 border border-white/10 rounded-lg text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500/50 font-mono"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const selected = await invoke<string | null>("select_directory");
                            if (selected) {
                              updateField("linux_custom_runner_path", selected);
                            }
                          } catch (err) {
                            console.error("Failed to select folder:", err);
                          }
                        }}
                        className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs text-zinc-300 hover:text-white flex items-center gap-1.5 transition-colors"
                        title="Browse custom runner folder"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        Browse
                      </button>
                    </div>
                  </div>

                  <div className="border-t border-white/5" />

                  {/* Feral GameMode */}
                  <label className="flex items-center justify-between cursor-pointer group">
                    <div className="space-y-0.5">
                      <div className="font-semibold text-zinc-200 group-hover:text-white transition-colors text-xs">
                        Enable Feral GameMode (<span className="font-mono text-purple-300">gamemoderun</span>)
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        Automatically requests Linux scheduler priority and optimal GPU power governor while game is running.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={formConfig.enable_gamemode ?? true}
                      onChange={(e) => updateField("enable_gamemode", e.target.checked)}
                      className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-purple-600 accent-purple-500 cursor-pointer"
                    />
                  </label>

                  <div className="border-t border-white/5" />

                  {/* MangoHud Overlay */}
                  <label className="flex items-center justify-between cursor-pointer group">
                    <div className="space-y-0.5">
                      <div className="font-semibold text-zinc-200 group-hover:text-white transition-colors text-xs">
                        Enable MangoHud Performance Overlay (<span className="font-mono text-purple-300">mangohud</span>)
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        Displays Vulkan / OpenGL in-game FPS, frametime graph, VRAM usage, and hardware thermals.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={formConfig.enable_mangohud ?? false}
                      onChange={(e) => updateField("enable_mangohud", e.target.checked)}
                      className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-purple-600 accent-purple-500 cursor-pointer"
                    />
                  </label>
                </div>
              </div>
            )}

            {/* 5. APIs & Services Tab */}
            {activeTab === "apis" && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-1">
                    External APIs & Metadata Services
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Configure community API keys for high-res artwork and achievements.
                  </p>
                </div>

                {/* SteamGridDB Configuration */}
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-white">SteamGridDB API (Custom & Animated Artwork)</div>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                        formConfig.steamgriddb_api_key
                          ? "bg-white/10 text-zinc-200 border-white/20"
                          : "bg-white/5 text-zinc-400 border-white/10"
                      }`}
                    >
                      {formConfig.steamgriddb_api_key ? "Configured" : "Optional"}
                    </span>
                  </div>

                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Used to browse and apply community covers, animated posters, custom logos, and hero backdrops.
                  </p>

                  <div className="space-y-1.5">
                    <label className="text-[11px] text-zinc-400 font-medium">API Key</label>
                    <div className="flex items-center space-x-2">
                      <div className="relative flex-1">
                        <input
                          type={showSgdbKey ? "text" : "password"}
                          value={formConfig.steamgriddb_api_key || ""}
                          onChange={(e) => updateField("steamgriddb_api_key", e.target.value)}
                          placeholder="Paste SteamGridDB API Key..."
                          className="w-full px-3 py-1.5 pr-8 bg-black/40 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-white/30 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSgdbKey((prev) => !prev)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                        >
                          {showSgdbKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* SFW / NSFW Artwork Toggle */}
                  <label className="flex items-center justify-between cursor-pointer pt-1">
                    <div className="space-y-0.5">
                      <div className="font-semibold text-zinc-200">Include NSFW / Adult Artwork</div>
                      <div className="text-[11px] text-zinc-500">
                        When enabled, adult and mature community artwork will be included in searches.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={formConfig.steamgriddb_nsfw ?? false}
                      onChange={(e) => updateField("steamgriddb_nsfw", e.target.checked)}
                      className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-white accent-white cursor-pointer"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => openUrl("https://www.steamgriddb.com/profile/preferences/api")}
                    className="text-[11px] text-zinc-400 hover:text-white flex items-center space-x-1 underline cursor-pointer pt-1"
                  >
                    <span>Get a free SteamGridDB API key</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>

                {/* IGDB (Twitch API) Configuration */}
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-white">IGDB Database (Twitch Developer API)</div>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                        formConfig.igdb_client_id && formConfig.igdb_client_secret
                          ? "bg-white/10 text-zinc-200 border-white/20"
                          : "bg-white/5 text-zinc-400 border-white/10"
                      }`}
                    >
                      {formConfig.igdb_client_id && formConfig.igdb_client_secret ? "Configured" : "Optional"}
                    </span>
                  </div>

                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Access over 300,000+ games for universal descriptions, franchise series, ESRB/PEGI ratings, critic scores, and 1080p covers.
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[11px] text-zinc-400 font-medium">Client ID</label>
                      <input
                        type="text"
                        value={formConfig.igdb_client_id || ""}
                        onChange={(e) => updateField("igdb_client_id", e.target.value)}
                        placeholder="Twitch Client ID..."
                        className="w-full px-3 py-1.5 bg-black/40 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-white/30 font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] text-zinc-400 font-medium">Client Secret</label>
                      <div className="relative">
                        <input
                          type={showIgdbSecret ? "text" : "password"}
                          value={formConfig.igdb_client_secret || ""}
                          onChange={(e) => updateField("igdb_client_secret", e.target.value)}
                          placeholder="Twitch Client Secret..."
                          className="w-full px-3 py-1.5 pr-8 bg-black/40 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-white/30 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowIgdbSecret((prev) => !prev)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                        >
                          {showIgdbSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => openUrl("https://dev.twitch.tv/console/apps")}
                    className="text-[11px] text-zinc-400 hover:text-white flex items-center space-x-1 underline cursor-pointer pt-1"
                  >
                    <span>Register a free Twitch Developer app for IGDB API credentials</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}

            {/* 5. Backups & Data Tab */}
            {activeTab === "controller" && (() => {
              const activeProfile = resolveGlyphProfile(
                formConfig.controller_glyph_style,
                controllerName
              );
              const customBindings = formConfig.controller_bindings || {};
              const nintendoSwap = formConfig.controller_nintendo_swap ?? false;
              const deadzonePct = Math.round(
                (formConfig.controller_deadzone ?? 0.18) * 100
              );

              return (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-1">
                      Controller & Gamepad Navigation
                    </h3>
                    <p className="text-[11px] text-zinc-400">
                      Configure desktop controller navigation, button prompt styles, analog stick deadzones, and custom keybinds.
                    </p>
                  </div>

                  {/* Connected Controller Status Card */}
                  <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center space-x-3.5 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 ${
                          isControllerConnected
                            ? "theme-accent-subtle-bg theme-accent-text border-[var(--app-accent-color)]/40"
                            : "bg-white/5 text-zinc-500 border-white/10"
                        }`}
                      >
                        <Gamepad2 className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-xs text-white truncate">
                            {isControllerConnected
                              ? controllerName || "Gamepad Connected"
                              : "No Controller Detected"}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                              isControllerConnected
                                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                                : "bg-white/5 text-zinc-400 border-white/10"
                            }`}
                          >
                            {isControllerConnected ? "Active" : "Standby"}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          {isControllerConnected
                            ? `Active prompt profile: ${
                                activeProfile === "playstation"
                                  ? "PlayStation"
                                  : activeProfile === "nintendo"
                                  ? "Nintendo Switch"
                                  : "Xbox / Standard"
                              }`
                            : "Press any button on your controller to wake it up."}
                        </p>
                      </div>
                    </div>

                    {/* Live Face Button Glyph Preview */}
                    <div className="flex items-center space-x-1.5 shrink-0 bg-black/40 px-3 py-2 rounded-xl border border-white/10">
                      <ControllerGlyph
                        button="South"
                        profile={activeProfile}
                        size="sm"
                      />
                      <ControllerGlyph
                        button="East"
                        profile={activeProfile}
                        size="sm"
                      />
                      <ControllerGlyph
                        button="West"
                        profile={activeProfile}
                        size="sm"
                      />
                      <ControllerGlyph
                        button="North"
                        profile={activeProfile}
                        size="sm"
                      />
                    </div>
                  </div>

                  {/* General Controller Behavior */}
                  <div className="space-y-3 bg-white/[0.02] border border-white/5 rounded-xl p-4">
                    {/* Enable Controller Support */}
                    <label className="flex items-center justify-between cursor-pointer group">
                      <div className="space-y-0.5 pr-4">
                        <div className="font-semibold text-zinc-200 group-hover:text-white transition-colors">
                          Enable Controller Navigation
                        </div>
                        <div className="text-[11px] text-zinc-500">
                          Navigate your game library, details pane, modals, virtual keyboard, and file browser with a gamepad.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={formConfig.controller_enabled ?? true}
                        onChange={(e) =>
                          updateField("controller_enabled", e.target.checked)
                        }
                        className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-white accent-white cursor-pointer"
                      />
                    </label>

                    <div className="border-t border-white/5" />

                    {/* Suspend Input While In-Game */}
                    <label className="flex items-center justify-between cursor-pointer group">
                      <div className="space-y-0.5 pr-4">
                        <div className="font-semibold text-zinc-200 group-hover:text-white transition-colors">
                          Suspend Input While In-Game or Unfocused
                        </div>
                        <div className="text-[11px] text-zinc-500">
                          Automatically pause OpenPlay controller navigation while a game is running or when OpenPlay is in the background.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={formConfig.controller_suspend_in_game ?? true}
                        onChange={(e) =>
                          updateField(
                            "controller_suspend_in_game",
                            e.target.checked
                          )
                        }
                        className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-white accent-white cursor-pointer"
                      />
                    </label>

                    <div className="border-t border-white/5" />

                    {/* Nintendo Layout Swap */}
                    <label className="flex items-center justify-between cursor-pointer group">
                      <div className="space-y-0.5 pr-4">
                        <div className="font-semibold text-zinc-200 group-hover:text-white transition-colors">
                          Nintendo Layout Swap (A/B & X/Y)
                        </div>
                        <div className="text-[11px] text-zinc-500">
                          Swap physical South/East (Confirm/Back) and West/North face button positions to match Nintendo controllers.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={formConfig.controller_nintendo_swap ?? false}
                        onChange={(e) =>
                          updateField(
                            "controller_nintendo_swap",
                            e.target.checked
                          )
                        }
                        className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-white accent-white cursor-pointer"
                      />
                    </label>

                    <div className="border-t border-white/5" />

                    {/* Button Prompt Style */}
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5 pr-4">
                        <div className="font-semibold text-zinc-200">
                          Button Prompt Icons (Glyphs)
                        </div>
                        <div className="text-[11px] text-zinc-500">
                          Automatically match connected controller hardware or lock to your preferred button icon set.
                        </div>
                      </div>
                      <select
                        aria-label="Button Prompt Icons"
                        value={formConfig.controller_glyph_style ?? "auto"}
                        onChange={(e) =>
                          updateField(
                            "controller_glyph_style",
                            e.target.value as ControllerGlyphStyle
                          )
                        }
                        className="bg-zinc-800 border border-zinc-700 text-xs text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-zinc-500 shrink-0 cursor-pointer"
                      >
                        <option value="auto">Auto-Detect</option>
                        <option value="xbox">Xbox (A / B / X / Y)</option>
                        <option value="playstation">
                          PlayStation (Cross / Circle / Square / Triangle)
                        </option>
                        <option value="nintendo">
                          Nintendo Switch (B / A / Y / X)
                        </option>
                      </select>
                    </div>

                    <div className="border-t border-white/5" />

                    {/* Analog Stick Deadzone Slider */}
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-zinc-200">
                            Analog Stick Deadzone
                          </div>
                          <div className="text-[11px] text-zinc-500">
                            Ignore minor stick drift below this threshold before moving focus or scrolling.
                          </div>
                        </div>
                        <span className="text-xs font-mono font-bold text-white bg-white/10 px-2 py-0.5 rounded border border-white/10">
                          {deadzonePct}%
                        </span>
                      </div>
                      <input
                        type="range"
                        aria-label="Analog Stick Deadzone"
                        min={0.05}
                        max={0.4}
                        step={0.01}
                        value={formConfig.controller_deadzone ?? 0.18}
                        onChange={(e) =>
                          updateField(
                            "controller_deadzone",
                            parseFloat(e.target.value)
                          )
                        }
                        className="w-full accent-[var(--app-accent-color)] cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Interactive Keybind Remapping Suite */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                          Controller Keybinds
                        </h4>
                        <p className="text-[11px] text-zinc-400">
                          Select any action and press a controller button to assign a custom binding.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          cancelListeningForKeybind();
                          updateField("controller_bindings", {});
                        }}
                        className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reset Defaults</span>
                      </button>
                    </div>

                    <div className="bg-white/[0.02] border border-white/5 rounded-xl divide-y divide-white/5 overflow-hidden">
                      {CONTROLLER_ACTIONS_META.map((meta) => {
                        const isListening = listeningForAction === meta.action;
                        const boundPhys = getPhysicalButtonForAction(
                          meta.action,
                          customBindings,
                          nintendoSwap
                        );

                        return (
                          <div
                            key={meta.action}
                            className="p-3.5 flex items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors"
                          >
                            <div className="space-y-0.5 min-w-0">
                              <div className="font-semibold text-zinc-100 text-xs">
                                {meta.label}
                              </div>
                              <div className="text-[11px] text-zinc-500">
                                {meta.description}
                              </div>
                            </div>

                            <div className="flex items-center space-x-2.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  if (isListening) {
                                    cancelListeningForKeybind();
                                  } else {
                                    startListeningForKeybind(
                                      meta.action,
                                      (capturedBtn) => {
                                        const nextBindings = {
                                          ...(formConfig.controller_bindings || {}),
                                          [meta.action]: capturedBtn,
                                        };
                                        updateField(
                                          "controller_bindings",
                                          nextBindings
                                        );
                                      }
                                    );
                                  }
                                }}
                                className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center space-x-2 transition-all cursor-pointer ${
                                  isListening
                                    ? "theme-accent-bg text-white border-white animate-pulse shadow-lg"
                                    : "bg-black/40 hover:bg-white/10 text-zinc-200 border-white/15"
                                }`}
                              >
                                {isListening ? (
                                  <span>Press Button...</span>
                                ) : (
                                  <>
                                    <ControllerGlyph
                                      button={boundPhys}
                                      profile={activeProfile}
                                      size="sm"
                                    />
                                    <span>
                                      {getButtonDisplayName(
                                        boundPhys,
                                        activeProfile
                                      )}
                                    </span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Console Mode Tab */}
            {activeTab === "console" && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-1">
                    Console Mode Experience
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Configure OpenPlay&apos;s fullscreen TV &amp; ultrawide console experience, display target, boot video, profile backdrop, and ambient audio.
                  </p>
                </div>

                {/* Startup & Display Target */}
                <div className="space-y-3 bg-white/[0.02] border border-white/5 rounded-xl p-4">
                  <label className="flex items-center justify-between cursor-pointer group">
                    <div className="space-y-0.5 pr-4">
                      <div className="font-semibold text-zinc-200 group-hover:text-white transition-colors">
                        Start Directly in Console Mode
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        Automatically enter fullscreen Console Mode whenever OpenPlay launches.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={formConfig.start_in_console_mode ?? false}
                      onChange={(e) =>
                        updateField("start_in_console_mode", e.target.checked)
                      }
                      className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-white accent-white cursor-pointer"
                    />
                  </label>

                  <div className="border-t border-white/5" />

                  {/* Target Display Selector */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <div className="font-semibold text-zinc-200 flex items-center gap-1.5">
                        <Monitor className="w-3.5 h-3.5 text-zinc-400" />
                        <span>Target Display</span>
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        Force Console Mode to open fullscreen on a specific monitor or living-room TV.
                      </div>
                    </div>
                    <select
                      value={formConfig.console_display_id || "auto"}
                      onChange={(e) => updateField("console_display_id", e.target.value)}
                      className="px-3 py-1.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white focus:outline-none cursor-pointer max-w-[240px]"
                    >
                      <option value="auto">Current Display (Auto)</option>
                      {displays.map((d, idx) => (
                        <option key={d.id} value={d.id}>
                          {d.label || `Display ${idx + 1}`} — {d.width}×{d.height}
                          {d.isPrimary ? " (Primary)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="border-t border-white/5" />

                  <label className="flex items-center justify-between cursor-pointer group">
                    <div className="space-y-0.5 pr-4">
                      <div className="font-semibold text-zinc-200 group-hover:text-white transition-colors">
                        Show Boot Splash Screen
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        Play the OpenPlay startup animation or your custom boot video when entering Console Mode.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={formConfig.console_boot_splash_enabled ?? true}
                      onChange={(e) =>
                        updateField("console_boot_splash_enabled", e.target.checked)
                      }
                      className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-white accent-white cursor-pointer"
                    />
                  </label>

                  <div className="border-t border-white/5" />

                  <label className="flex items-center justify-between cursor-pointer group">
                    <div className="space-y-0.5 pr-4">
                      <div className="font-semibold text-zinc-200 group-hover:text-white transition-colors">
                        Auto-Sign In (Skip Profile Selection)
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        Jump straight to your library using the last active local profile.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={formConfig.console_auto_sign_in ?? false}
                      onChange={(e) =>
                        updateField("console_auto_sign_in", e.target.checked)
                      }
                      className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-white accent-white cursor-pointer"
                    />
                  </label>
                </div>

                {/* Custom Boot & Login Videos */}
                <div className="space-y-4 bg-white/[0.02] border border-white/5 rounded-xl p-4">
                  <div className="flex items-center space-x-2">
                    <Film className="w-4 h-4 text-zinc-400" />
                    <span className="font-bold text-zinc-100">Custom Motion &amp; Boot Videos</span>
                  </div>

                  {/* Custom Boot Video */}
                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold text-zinc-200">
                      Boot Splash Video (.mp4 / .webm)
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={
                          formConfig.console_boot_video_path ||
                          DEFAULT_CONSOLE_BOOT_VIDEO
                        }
                        placeholder="Using preinstalled OpenPlay_Console_2K.mp4"
                        className="flex-1 px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-zinc-300 placeholder-zinc-500"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          const picked = await invoke<string | null>("select_file", {
                            filter: ".mp4,.webm,.mkv,.mov",
                          });
                          if (picked) updateField("console_boot_video_path", picked);
                        }}
                        className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-xs font-semibold text-white flex items-center space-x-1.5 cursor-pointer"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span>Browse</span>
                      </button>
                      {formConfig.console_boot_video_path &&
                        formConfig.console_boot_video_path !== DEFAULT_CONSOLE_BOOT_VIDEO && (
                          <button
                            type="button"
                            onClick={() =>
                              updateField(
                                "console_boot_video_path",
                                DEFAULT_CONSOLE_BOOT_VIDEO
                              )
                            }
                            className="p-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-zinc-300 cursor-pointer"
                            title="Restore preinstalled OpenPlay_Console_2K.mp4"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                    </div>
                  </div>

                  {/* Preinstalled & Custom Login Screen Moving Backgrounds */}
                  <div className="space-y-2.5 pt-2 border-t border-white/5">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold text-zinc-200">
                          Profile Screen Moving Background
                        </div>
                        <div className="text-[11px] text-zinc-500">
                          Pick one of OpenPlay&apos;s 9 preinstalled login loop videos or browse for your own
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          const picked = await invoke<string | null>("select_file", {
                            filter: ".mp4,.webm,.mkv,.mov",
                          });
                          if (picked) updateField("console_login_bg_video_path", picked);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-xs font-semibold text-white flex items-center space-x-1.5 cursor-pointer shrink-0"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span>Browse Custom...</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2.5">
                      {BUILTIN_CONSOLE_LOGIN_VIDEOS.map((preset) => {
                        const currentPath =
                          formConfig.console_login_bg_video_path ||
                          DEFAULT_CONSOLE_LOGIN_VIDEO;
                        const isSelected = currentPath === preset.path;
                        const previewSrc = resolveImageSrc(preset.path);
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() =>
                              updateField("console_login_bg_video_path", preset.path)
                            }
                            className={`group relative rounded-xl overflow-hidden border text-left transition-all cursor-pointer bg-black/40 ${
                              isSelected
                                ? "border-white ring-1 ring-white shadow-lg"
                                : "border-white/10 hover:border-white/35"
                            }`}
                          >
                            <div className="aspect-video w-full bg-black overflow-hidden relative">
                              {previewSrc && (
                                <video
                                  src={previewSrc}
                                  autoPlay
                                  loop
                                  muted
                                  playsInline
                                  preload="metadata"
                                  className="w-full h-full object-cover"
                                />
                              )}
                              {isSelected && (
                                <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-white text-slate-950 flex items-center justify-center shadow">
                                  <Check className="w-3 h-3 stroke-[3]" />
                                </div>
                              )}
                            </div>
                            <div className="px-2.5 py-1.5 text-[11px] font-semibold text-zinc-200 truncate bg-black/60">
                              {preset.label}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Audio Cues & Ambient Background Music */}
                <div className="space-y-3 bg-white/[0.02] border border-white/5 rounded-xl p-4">
                  <label className="flex items-center justify-between cursor-pointer group">
                    <div className="space-y-0.5 pr-4">
                      <div className="font-semibold text-zinc-200 group-hover:text-white transition-colors flex items-center gap-2">
                        <Volume2 className="w-4 h-4 text-zinc-400" />
                        <span>Subtle Console UI Sounds</span>
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        Play gentle synthesized sound cues for navigation, tabs, and launching games (auto-muted while in-game).
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={formConfig.console_ui_sounds ?? true}
                      onChange={(e) =>
                        updateField("console_ui_sounds", e.target.checked)
                      }
                      className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-white accent-white cursor-pointer"
                    />
                  </label>

                  {formConfig.console_ui_sounds !== false && (
                    <div className="pt-2 border-t border-white/5 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-zinc-400 font-medium">UI Sound Volume</span>
                        <span className="font-mono text-zinc-200">
                          {Math.round((formConfig.console_ui_volume ?? 0.45) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={formConfig.console_ui_volume ?? 0.45}
                        onChange={(e) =>
                          updateField("console_ui_volume", parseFloat(e.target.value))
                        }
                        className="w-full accent-white cursor-pointer"
                      />
                    </div>
                  )}

                  <div className="border-t border-white/5" />

                  {/* Background Music */}
                  <label className="flex items-center justify-between cursor-pointer group">
                    <div className="space-y-0.5 pr-4">
                      <div className="font-semibold text-zinc-200 group-hover:text-white transition-colors flex items-center gap-2">
                        <Music className="w-4 h-4 text-zinc-400" />
                        <span>Subtle Background Music</span>
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        Plays calm ambient console music in the background (auto-pauses when a game launches or a trailer plays).
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={formConfig.console_bg_music_enabled ?? true}
                      onChange={(e) =>
                        updateField("console_bg_music_enabled", e.target.checked)
                      }
                      className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-white accent-white cursor-pointer"
                    />
                  </label>

                  {formConfig.console_bg_music_enabled !== false && (
                    <div className="pt-2 border-t border-white/5 space-y-3">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-zinc-400 font-medium">Music Volume</span>
                          <span className="font-mono text-zinc-200">
                            {Math.round((formConfig.console_bg_music_volume ?? 0.25) * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={formConfig.console_bg_music_volume ?? 0.25}
                          onChange={(e) =>
                            updateField("console_bg_music_volume", parseFloat(e.target.value))
                          }
                          className="w-full accent-white cursor-pointer"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <div className="text-[11px] font-semibold text-zinc-300">
                          Custom Background Music Track (Optional: .mp3 / .ogg / .wav / .flac)
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            readOnly
                            value={formConfig.console_bg_music_path || ""}
                            placeholder="Using built-in calm ambient console synth"
                            className="flex-1 px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-zinc-300 placeholder-zinc-500"
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              const picked = await invoke<string | null>("select_file", {
                                filter: ".mp3,.ogg,.wav,.flac,.m4a,.opus",
                              });
                              if (picked) updateField("console_bg_music_path", picked);
                            }}
                            className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-xs font-semibold text-white flex items-center space-x-1.5 cursor-pointer"
                          >
                            <FolderOpen className="w-3.5 h-3.5" />
                            <span>Browse</span>
                          </button>
                          {formConfig.console_bg_music_path && (
                            <button
                              type="button"
                              onClick={() => updateField("console_bg_music_path", undefined)}
                              className="p-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/25 text-red-300 cursor-pointer"
                              title="Reset to built-in ambient music"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 5. Backups & Data Tab */}
            {activeTab === "backup" && (
              <div className="space-y-4">
                {/* Sub-navigation tabs */}
                <div className="flex items-center space-x-1.5 p-1 bg-white/[0.04] border border-white/5 rounded-xl w-fit">
                  <button
                    onClick={() => setBackupSubTab("cloud")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      backupSubTab === "cloud"
                        ? "bg-white/15 text-white shadow-sm border border-white/10"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    Cloud Sync
                  </button>
                  <button
                    onClick={() => setBackupSubTab("openplay")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      backupSubTab === "openplay"
                        ? "bg-white/15 text-white shadow-sm border border-white/10"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    Snapshots & Bundles
                  </button>
                  <button
                    onClick={() => setBackupSubTab("playnite")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      backupSubTab === "playnite"
                        ? "bg-white/15 text-white shadow-sm border border-white/10"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    Import Playnite Backup
                  </button>
                </div>

                {backupSubTab === "cloud" && (
                  <CloudSyncSettingsCard
                    onReloadGames={onReloadGames}
                    config={formConfig}
                    onSaveConfig={(updated) => {
                      setFormConfig(updated);
                      onSaveConfig(updated);
                    }}
                  />
                )}

                {backupSubTab === "openplay" && (
                  <OpenPlayBackupTab
                    config={formConfig}
                    onSaveConfig={onSaveConfig}
                    onReloadGames={onReloadGames}
                  />
                )}

                {backupSubTab === "playnite" && (
                  <PlayniteBackupTab onImportComplete={onReloadGames} />
                )}
              </div>
            )}

            {/* 6. About Tab */}
            {activeTab === "about" && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-1">
                    About OpenPlay
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Open-source, offline-first cross-platform game launcher.
                  </p>
                </div>

                {/* App Info Card */}
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center p-2">
                        <img
                          src="/OpenPlayIcon.svg"
                          alt="OpenPlay"
                          className="w-full h-full invert filter drop-shadow-[0_0_8px_rgba(168,85,247,0.4)]"
                        />
                      </div>
                      <div>
                        <div className="font-extrabold text-sm text-white flex items-center space-x-2">
                          <span>OpenPlay</span>
                          {(updateResult?.current_version || appVersion) && (
                            <span
                              className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold text-white border"
                              style={{
                                backgroundColor: "color-mix(in srgb, var(--app-accent-color, #783efe) 25%, transparent)",
                                borderColor: "color-mix(in srgb, var(--app-accent-color, #783efe) 50%, transparent)",
                              }}
                            >
                              v{updateResult?.current_version || appVersion}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-zinc-400">
                          Cross-platform game library & launcher
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => openUrl("https://github.com/Screamycat/OpenPlay")}
                      className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-zinc-300 hover:text-white flex items-center space-x-1.5 transition-colors cursor-pointer"
                    >
                      <span>GitHub</span>
                      <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
                    </button>
                  </div>
                </div>

                {/* Creator & Ownership Attribution Card */}
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 flex items-center justify-between">
                  <div className="flex items-center space-x-3.5">
                    <div className="w-11 h-11 rounded-xl overflow-hidden border border-white/10 shrink-0 shadow-md bg-black/40">
                      <img
                        src="/screamycat-logo.png"
                        alt="ScreamyCat"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-extrabold text-sm text-white">ScreamyCat</span>
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full font-semibold border"
                          style={{
                            backgroundColor: "color-mix(in srgb, var(--app-accent-color, #783efe) 18%, transparent)",
                            borderColor: "color-mix(in srgb, var(--app-accent-color, #783efe) 35%, transparent)",
                            color: "var(--app-accent-color, #783efe)",
                          }}
                        >
                          Creator & Developer
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        Lead Author & Architect of OpenPlay
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => openUrl("https://github.com/Screamycat")}
                    className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-zinc-300 hover:text-white flex items-center space-x-1.5 transition-colors cursor-pointer"
                  >
                    <span>Profile</span>
                    <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
                  </button>
                </div>

                {/* Software Updates Section */}
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-white">Software Updates</h4>
                      <p className="text-[11px] text-zinc-400">
                        Check for new releases, bug fixes, and feature improvements
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleCheckForUpdates}
                      disabled={isCheckingUpdate}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold text-white flex items-center space-x-2 transition-all cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
                      style={{
                        backgroundColor: "var(--app-accent-color, #783efe)",
                      }}
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${isCheckingUpdate ? "animate-spin" : ""}`}
                      />
                      <span>{isCheckingUpdate ? "Checking..." : "Check for Updates"}</span>
                    </button>
                  </div>

                  {/* Update Status Feedback */}
                  {updateError && (
                    <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2 animate-in fade-in duration-150">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{updateError}</span>
                    </div>
                  )}

                  {updateResult && !updateResult.is_update_available && (
                    <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-200 text-xs flex items-center justify-between animate-in fade-in duration-150">
                      <div className="flex items-center space-x-2.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <div>
                          <div className="font-bold">OpenPlay is up to date</div>
                          <div className="text-[11px] text-emerald-300/80">
                            Version {updateResult.current_version} is the latest available release.
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {updateResult && updateResult.is_update_available && (
                    <div className="space-y-3.5 animate-in fade-in zoom-in-95 duration-150">
                      <div
                        className="p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg"
                        style={{
                          backgroundColor:
                            "color-mix(in srgb, var(--app-accent-color, #783efe) 18%, transparent)",
                          borderColor:
                            "color-mix(in srgb, var(--app-accent-color, #783efe) 45%, transparent)",
                        }}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                            <h5 className="font-extrabold text-sm text-white">
                              {updateResult.release_name || `Update Available: v${updateResult.latest_version}`}
                            </h5>
                          </div>
                          <p className="text-xs text-zinc-300">
                            A new version is ready to install (current: v{updateResult.current_version} → latest: v{updateResult.latest_version}).
                          </p>
                        </div>

                        <div className="flex items-center space-x-2 shrink-0">
                          {updateStatus === "idle" && updateResult.download_url && (
                            <button
                              type="button"
                              onClick={handleStartUpdate}
                              className="px-3.5 py-1.5 rounded-xl bg-white text-black font-extrabold text-xs flex items-center space-x-1.5 hover:bg-zinc-200 transition-all cursor-pointer shadow-md active:scale-95"
                            >
                              <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                              <span>Update to v{updateResult.latest_version}</span>
                            </button>
                          )}

                          {updateStatus === "downloading" && (
                            <div className="w-56 sm:w-64 bg-black/60 border border-white/10 rounded-xl p-2.5 space-y-1.5 shadow-inner animate-in fade-in">
                              <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-300">
                                <span className="flex items-center space-x-1.5">
                                  <RefreshCw className="w-3 h-3 animate-spin theme-accent-text" />
                                  <span>Downloading update...</span>
                                </span>
                                <span className="font-mono theme-accent-text font-bold">{downloadProgress.percentage}%</span>
                              </div>
                              <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-150 ease-out"
                                  style={{
                                    width: `${downloadProgress.percentage}%`,
                                    backgroundColor: "var(--app-accent-color, #783efe)",
                                  }}
                                />
                              </div>
                              {downloadProgress.total > 0 && (
                                <div className="text-[10px] text-zinc-400 text-right font-mono">
                                  {formatFileSize(downloadProgress.downloaded)} / {formatFileSize(downloadProgress.total)}
                                </div>
                              )}
                            </div>
                          )}

                          {updateStatus === "ready" && (
                            <button
                              type="button"
                              onClick={handleApplyUpdateAndRestart}
                              className="px-4 py-2 rounded-xl text-white font-extrabold text-xs flex items-center space-x-2 transition-all cursor-pointer shadow-lg active:scale-95 animate-pulse"
                              style={{
                                backgroundColor: "var(--app-accent-color, #783efe)",
                              }}
                            >
                              <CheckCircle2 className="w-4 h-4 text-white" />
                              <span>Restart Now</span>
                            </button>
                          )}

                          {updateStatus === "restarting" && (
                            <div className="flex items-center space-x-2 px-3.5 py-1.5 rounded-xl theme-accent-subtle-bg border border-[var(--app-accent-color)]/30 theme-accent-text text-xs font-bold animate-pulse">
                              <RefreshCw className="w-3.5 h-3.5 animate-spin theme-accent-text" />
                              <span>Relaunching OpenPlay...</span>
                            </div>
                          )}

                          {updateResult.html_url && (
                            <button
                              type="button"
                              onClick={() => openUrl(updateResult.html_url!)}
                              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs flex items-center space-x-1 transition-colors cursor-pointer border border-white/15"
                            >
                              <span>View Release</span>
                              <ExternalLink className="w-3 h-3 text-zinc-400" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Changelog Underneath */}
                      {updateResult.release_notes && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between px-1">
                            <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                              Changelog
                            </span>
                            {updateResult.published_at && (
                              <span className="text-[10px] text-zinc-500 font-mono">
                                Released on {new Date(updateResult.published_at).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          <div className="bg-black/40 border border-white/10 rounded-xl p-3.5 max-h-60 overflow-y-auto space-y-1 font-sans">
                            {updateResult.release_notes.split("\n").map((line, idx) => {
                              const trimmed = line.trim();
                              if (trimmed.startsWith("### ")) {
                                return (
                                  <h4 key={idx} className="text-xs font-bold text-white mt-2.5 mb-1">
                                    {trimmed.replace(/^###\s+/, "")}
                                  </h4>
                                );
                              }
                              if (trimmed.startsWith("## ")) {
                                return (
                                  <h3 key={idx} className="text-xs font-extrabold text-white mt-3 mb-1 border-b border-white/10 pb-0.5">
                                    {trimmed.replace(/^##\s+/, "")}
                                  </h3>
                                );
                              }
                              if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
                                return (
                                  <div key={idx} className="flex items-start space-x-2 text-[11px] text-zinc-300 ml-1 py-0.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-white/40 mt-1 shrink-0" />
                                    <span>{trimmed.replace(/^[-*]\s+/, "")}</span>
                                  </div>
                                );
                              }
                              if (!trimmed) {
                                return <div key={idx} className="h-1" />;
                              }
                              return (
                                <p key={idx} className="text-[11px] text-zinc-300 leading-relaxed">
                                  {line}
                                </p>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Feedback & Bug Reports Section */}
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-white">Feedback & Bug Reports</h4>
                      <p className="text-[11px] text-zinc-400">
                        Report an issue or suggest a feature — opens a pre-filled GitHub issue.
                      </p>
                    </div>
                    <div className="flex items-center bg-black/40 border border-white/10 rounded-lg p-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setFeedbackType("bug")}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer ${
                          feedbackType === "bug"
                            ? "text-white shadow-sm"
                            : "text-zinc-400 hover:text-zinc-200"
                        }`}
                        style={
                          feedbackType === "bug"
                            ? { backgroundColor: "var(--app-accent-color, #783efe)" }
                            : undefined
                        }
                      >
                        <Bug className="w-3 h-3" />
                        <span>Bug</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setFeedbackType("feature")}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer ${
                          feedbackType === "feature"
                            ? "text-white shadow-sm"
                            : "text-zinc-400 hover:text-zinc-200"
                        }`}
                        style={
                          feedbackType === "feature"
                            ? { backgroundColor: "var(--app-accent-color, #783efe)" }
                            : undefined
                        }
                      >
                        <Lightbulb className="w-3 h-3" />
                        <span>Feature</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <input
                      type="text"
                      value={feedbackTitle}
                      onChange={(e) => setFeedbackTitle(e.target.value)}
                      placeholder={
                        feedbackType === "bug"
                          ? "Short summary of the bug..."
                          : "Short summary of your feature idea..."
                      }
                      className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white/25 transition-colors"
                    />
                    <textarea
                      rows={3}
                      value={feedbackBody}
                      onChange={(e) => setFeedbackBody(e.target.value)}
                      placeholder={
                        feedbackType === "bug"
                          ? "What happened, and how can it be reproduced?"
                          : "Describe what you'd like added and how it would help..."
                      }
                      className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white/25 transition-colors resize-none"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                    <label className="flex items-center space-x-2 text-[11px] text-zinc-400 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={includeSystemInfo}
                        onChange={(e) => setIncludeSystemInfo(e.target.checked)}
                        className="rounded border-white/20 bg-black/40 accent-[var(--app-accent-color,#783efe)]"
                      />
                      <span>
                        Include OS & version (
                        {systemInfo ? `${systemInfo.os} / v${systemInfo.version}` : `v${appVersion || "1.0.0"}`}
                        )
                      </span>
                    </label>

                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={handleCopyDiagnostics}
                        className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-semibold text-zinc-300 hover:text-white flex items-center space-x-1.5 transition-colors cursor-pointer"
                      >
                        {copiedDiagnostics ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3 text-zinc-400" />
                        )}
                        <span>{copiedDiagnostics ? "Copied" : "Copy Info"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleOpenFeedbackOnGitHub}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-white flex items-center space-x-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
                        style={{
                          backgroundColor: "var(--app-accent-color, #783efe)",
                        }}
                      >
                        <Send className="w-3 h-3" />
                        <span>Open on GitHub</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Offline-First Architecture Card */}
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-3 text-[11px] text-zinc-400">
                  <div className="flex items-start space-x-2.5">
                    <Terminal className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-zinc-200">Offline-First Architecture:</strong> Built on Electron + Rust with local SQLite storage. All metadata, artwork links, and game configurations remain exclusively on your device.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
