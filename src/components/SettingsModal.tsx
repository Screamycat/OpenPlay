import React, { useState, useEffect } from "react";
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
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { AppConfig, DEFAULT_APP_CONFIG } from "../types/config";
import { PlayniteBackupTab } from "./library/PlayniteBackupTab";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanLibrary?: () => void;
  onReloadGames?: () => Promise<void>;
  isScanning?: boolean;
  totalGames?: number;
  config: AppConfig;
  onSaveConfig: (updated: AppConfig) => void;
}

type SettingsTab =
  | "general"
  | "appearance"
  | "playback"
  | "apis"
  | "backup"
  | "about";

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  config: initialConfig,
  onSaveConfig,
  onReloadGames,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [formConfig, setFormConfig] = useState<AppConfig>({
    ...DEFAULT_APP_CONFIG,
    ...initialConfig,
  });
  const [showSgdbKey, setShowSgdbKey] = useState(false);
  const [showRaKey, setShowRaKey] = useState(false);
  const [showIgdbSecret, setShowIgdbSecret] = useState(false);
  const [isSavedNotice, setIsSavedNotice] = useState(false);

  useEffect(() => {
    setFormConfig({ ...DEFAULT_APP_CONFIG, ...initialConfig });
  }, [initialConfig, isOpen]);

  if (!isOpen) return null;

  const updateField = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => {
    const updated = { ...formConfig, [key]: value };
    setFormConfig(updated);
    onSaveConfig(updated);
    setIsSavedNotice(true);
    setTimeout(() => setIsSavedNotice(false), 2000);
  };

  const navItems = [
    { id: "general", label: "General", icon: Sliders },
    { id: "appearance", label: "Appearance", icon: Palette },
    { id: "playback", label: "Playback & Media", icon: PlaySquare },
    { id: "apis", label: "APIs & Services", icon: KeyRound },
    { id: "backup", label: "Playnite Backup", icon: Archive },
    { id: "about", label: "About OpenPlay", icon: Info },
  ] as const;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#0e0e11]/80 backdrop-blur-2xl border border-white/10 rounded-2xl w-full max-w-4xl h-[620px] max-h-[90vh] shadow-[0_20px_60px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden text-zinc-200"
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
            className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/15 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer border border-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body: Sidebar + Main Settings View */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar Navigation */}
          <div className="w-52 border-r border-white/10 bg-white/[0.015] p-2.5 space-y-1 shrink-0 overflow-y-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
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
                  {/* Auto-Scan on Startup */}
                  <label className="flex items-center justify-between cursor-pointer group">
                    <div className="space-y-0.5">
                      <div className="font-semibold text-zinc-200 group-hover:text-white transition-colors">
                        Auto-Scan Library on Startup
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        Automatically check for newly installed or uninstalled games when OpenPlay opens.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={formConfig.auto_scan_on_startup ?? true}
                      onChange={(e) => updateField("auto_scan_on_startup", e.target.checked)}
                      className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-white accent-white cursor-pointer"
                    />
                  </label>

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
                    Adjust library background effects, blur intensity, and layout defaults.
                  </p>
                </div>

                <div className="space-y-4 bg-white/[0.02] border border-white/5 rounded-xl p-4">
                  {/* Default View Mode */}
                  <div className="space-y-1.5">
                    <label className="font-semibold text-zinc-200">Default View Mode</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["split", "grid", "list"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => updateField("view_mode", m)}
                          className={`py-2 px-3 rounded-lg border text-xs font-semibold capitalize transition-all cursor-pointer ${
                            (formConfig.view_mode || "split") === m
                              ? "bg-white text-zinc-950 border-white font-bold"
                              : "bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10"
                          }`}
                        >
                          {m === "split" ? "Split View" : m === "grid" ? "Full Grid" : "Table List"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-white/5" />

                  {/* Background Blur */}
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <label className="font-semibold text-zinc-200">Dynamic Background Blur</label>
                      <span className="font-mono text-zinc-400">{formConfig.background_blur ?? 32}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="64"
                      step="4"
                      value={formConfig.background_blur ?? 32}
                      onChange={(e) => updateField("background_blur", Number(e.target.value))}
                      className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-white"
                    />
                  </div>

                  <div className="border-t border-white/5" />

                  {/* Background Opacity */}
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <label className="font-semibold text-zinc-200">Background Dimming Opacity</label>
                      <span className="font-mono text-zinc-400">
                        {Math.round((formConfig.background_opacity ?? 0.75) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.2"
                      max="1.0"
                      step="0.05"
                      value={formConfig.background_opacity ?? 0.75}
                      onChange={(e) => updateField("background_opacity", Number(e.target.value))}
                      className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-white"
                    />
                  </div>
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

            {/* 4. APIs & Services Tab */}
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

                {/* RetroAchievements Configuration */}
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-white">RetroAchievements</div>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                        formConfig.retroachievements_api_key
                          ? "bg-white/10 text-zinc-200 border-white/20"
                          : "bg-white/5 text-zinc-400 border-white/10"
                      }`}
                    >
                      {formConfig.retroachievements_api_key ? "Configured" : "Optional"}
                    </span>
                  </div>

                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Used to fetch and display retro game achievements, badges, and unlock times for emulation ROMs.
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[11px] text-zinc-400 font-medium">Username</label>
                      <input
                        type="text"
                        value={formConfig.retroachievements_username || ""}
                        onChange={(e) => updateField("retroachievements_username", e.target.value)}
                        placeholder="RetroAchievements username..."
                        className="w-full px-3 py-1.5 bg-black/40 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-white/30"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] text-zinc-400 font-medium">Web API Key</label>
                      <div className="relative">
                        <input
                          type={showRaKey ? "text" : "password"}
                          value={formConfig.retroachievements_api_key || ""}
                          onChange={(e) => updateField("retroachievements_api_key", e.target.value)}
                          placeholder="Web API key..."
                          className="w-full px-3 py-1.5 pr-8 bg-black/40 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-white/30 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowRaKey((prev) => !prev)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                        >
                          {showRaKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => openUrl("https://retroachievements.org/controlpanel.php")}
                    className="text-[11px] text-zinc-400 hover:text-white flex items-center space-x-1 underline cursor-pointer pt-1"
                  >
                    <span>Find your RetroAchievements Web API key</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}

            {/* 5. Playnite Backup Tab */}
            {activeTab === "backup" && (
              <PlayniteBackupTab onImportComplete={onReloadGames} />
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

                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                      <Sliders className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="font-extrabold text-sm text-white">OpenPlay</div>
                      <div className="text-[11px] text-zinc-400">Version 0.1.0 (Early Access)</div>
                    </div>
                  </div>

                  <div className="border-t border-white/5 pt-3 space-y-2 text-[11px] text-zinc-400">
                    <div className="flex items-start space-x-2">
                      <Terminal className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-zinc-200">Offline-First Architecture:</strong> Built on Tauri v2 + Rust with local SQLite storage. All metadata, artwork links, and game configurations remain exclusively on your device.
                      </div>
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
