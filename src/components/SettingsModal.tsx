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
  RefreshCw,
  Download,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { AppConfig, DEFAULT_APP_CONFIG } from "../types/config";
import { PlayniteBackupTab } from "./library/PlayniteBackupTab";

interface ReleaseAssetInfo {
  name: string;
  download_url: string;
  size: number;
}

interface UpdateCheckResult {
  current_version: string;
  latest_version: string;
  is_update_available: boolean;
  release_name?: string | null;
  release_notes?: string | null;
  published_at?: string | null;
  html_url?: string | null;
  download_url?: string | null;
  assets?: ReleaseAssetInfo[];
}

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
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [isSyncingRa, setIsSyncingRa] = useState(false);
  const [raSyncStatus, setRaSyncStatus] = useState<string | null>(null);

  const handleSyncRetroAchievements = async () => {
    setIsSyncingRa(true);
    setRaSyncStatus(null);
    try {
      onSaveConfig(formConfig);
      await invoke("sync_retroachievements");
      setRaSyncStatus("RetroAchievements synchronized successfully!");
      if (onReloadGames) {
        await onReloadGames();
      }
    } catch (err: any) {
      setRaSyncStatus(`Sync failed: ${String(err)}`);
    } finally {
      setIsSyncingRa(false);
    }
  };

  const handleCheckForUpdates = async () => {
    setIsCheckingUpdate(true);
    setUpdateError(null);
    try {
      const res = await invoke<UpdateCheckResult>("check_for_app_updates");
      setUpdateResult(res);
    } catch (err: any) {
      setUpdateError(String(err));
    } finally {
      setIsCheckingUpdate(false);
    }
  };

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
        className="theme-panel-surface backdrop-blur-2xl border border-white/10 rounded-2xl w-full max-w-4xl h-[620px] max-h-[90vh] shadow-[0_20px_60px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden text-zinc-200"
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

                  <div className="border-t border-white/5" />

                  {/* Theme Accent Color */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <div>
                        <label className="font-semibold text-zinc-200 block">Theme Accent Color</label>
                        <span className="text-[11px] text-zinc-400">
                          Highlights, focus rings, badges, and primary interactive accents
                        </span>
                      </div>
                      <span className="font-mono text-zinc-300 text-xs px-2 py-0.5 rounded bg-white/5 border border-white/10">
                        {formConfig.accent_color || "#a855f7"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap pt-1">
                      {[
                        { name: "Purple", hex: "#a855f7" },
                        { name: "Cyan", hex: "#06b6d4" },
                        { name: "Blue", hex: "#3b82f6" },
                        { name: "Emerald", hex: "#10b981" },
                        { name: "Amber", hex: "#f59e0b" },
                        { name: "Rose", hex: "#f43f5e" },
                        { name: "White", hex: "#ffffff" },
                      ].map((preset) => {
                        const isSelected =
                          (formConfig.accent_color || "#a855f7").toLowerCase() ===
                          preset.hex.toLowerCase();
                        return (
                          <button
                            key={preset.hex}
                            type="button"
                            onClick={() => updateField("accent_color", preset.hex)}
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
                      {/* Custom color picker */}
                      <label className="relative w-7 h-7 rounded-full border border-white/20 hover:border-white/40 cursor-pointer overflow-hidden flex items-center justify-center bg-white/5 transition-all">
                        <input
                          type="color"
                          value={formConfig.accent_color || "#a855f7"}
                          onChange={(e) => updateField("accent_color", e.target.value)}
                          className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                        />
                        <Palette className="w-3.5 h-3.5 text-zinc-400" />
                      </label>
                    </div>
                  </div>

                  <div className="border-t border-white/5" />

                  {/* Panel Background Tint */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <div>
                        <label className="font-semibold text-zinc-200 block">Panel Tint & Windows Background</label>
                        <span className="text-[11px] text-zinc-400">
                          Base background shade applied to dialogs, menus, and side panes
                        </span>
                      </div>
                      <span className="font-mono text-zinc-300 text-xs px-2 py-0.5 rounded bg-white/5 border border-white/10">
                        {formConfig.panel_tint || "#0e0e11"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap pt-1">
                      {[
                        { name: "Greyish Black", hex: "#0e0e11" },
                        { name: "Onyx", hex: "#070709" },
                        { name: "Midnight Navy", hex: "#0a0d17" },
                        { name: "Charcoal", hex: "#14151b" },
                        { name: "Slate", hex: "#0f172a" },
                      ].map((preset) => {
                        const isSelected =
                          (formConfig.panel_tint || "#0e0e11").toLowerCase() ===
                          preset.hex.toLowerCase();
                        return (
                          <button
                            key={preset.hex}
                            type="button"
                            onClick={() => updateField("panel_tint", preset.hex)}
                            title={preset.name}
                            className={`w-7 h-7 rounded-full transition-all cursor-pointer flex items-center justify-center border ${
                              isSelected
                                ? "ring-2 ring-white ring-offset-2 ring-offset-black scale-110 border-white"
                                : "border-white/20 hover:scale-105"
                            }`}
                            style={{ backgroundColor: preset.hex }}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                          </button>
                        );
                      })}
                      {/* Custom tint picker */}
                      <label className="relative w-7 h-7 rounded-full border border-white/20 hover:border-white/40 cursor-pointer overflow-hidden flex items-center justify-center bg-white/5 transition-all">
                        <input
                          type="color"
                          value={formConfig.panel_tint || "#0e0e11"}
                          onChange={(e) => updateField("panel_tint", e.target.value)}
                          className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                        />
                        <Palette className="w-3.5 h-3.5 text-zinc-400" />
                      </label>
                    </div>
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

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => openUrl("https://retroachievements.org/controlpanel.php")}
                      className="text-[11px] text-zinc-400 hover:text-white flex items-center space-x-1 underline cursor-pointer"
                    >
                      <span>Find your RetroAchievements Web API key</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>

                    <button
                      type="button"
                      disabled={isSyncingRa || !formConfig.retroachievements_username || !formConfig.retroachievements_api_key}
                      onClick={handleSyncRetroAchievements}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 font-medium text-xs transition-colors flex items-center space-x-1.5 disabled:opacity-40 cursor-pointer w-fit"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncingRa ? "animate-spin" : ""}`} />
                      <span>{isSyncingRa ? "Syncing Progress..." : "Sync RetroAchievements Now"}</span>
                    </button>
                  </div>

                  {raSyncStatus && (
                    <div
                      className={`text-[11px] px-3 py-2 rounded-lg border ${
                        raSyncStatus.includes("failed")
                          ? "bg-red-500/10 border-red-500/20 text-red-300"
                          : "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                      }`}
                    >
                      {raSyncStatus}
                    </div>
                  )}
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
                          <span
                            className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold text-white border"
                            style={{
                              backgroundColor: "color-mix(in srgb, var(--app-accent-color, #a855f7) 25%, transparent)",
                              borderColor: "color-mix(in srgb, var(--app-accent-color, #a855f7) 50%, transparent)",
                            }}
                          >
                            v0.1.0
                          </span>
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
                            backgroundColor: "color-mix(in srgb, var(--app-accent-color, #a855f7) 18%, transparent)",
                            borderColor: "color-mix(in srgb, var(--app-accent-color, #a855f7) 35%, transparent)",
                            color: "var(--app-accent-color, #a855f7)",
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
                        backgroundColor: "var(--app-accent-color, #a855f7)",
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
                            "color-mix(in srgb, var(--app-accent-color, #a855f7) 18%, transparent)",
                          borderColor:
                            "color-mix(in srgb, var(--app-accent-color, #a855f7) 45%, transparent)",
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
                          {updateResult.download_url && (
                            <button
                              type="button"
                              onClick={() => openUrl(updateResult.download_url!)}
                              className="px-3.5 py-1.5 rounded-xl bg-white text-black font-extrabold text-xs flex items-center space-x-1.5 hover:bg-zinc-200 transition-all cursor-pointer shadow-md"
                            >
                              <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                              <span>Update to v{updateResult.latest_version}</span>
                            </button>
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

                {/* Offline-First Architecture Card */}
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-3 text-[11px] text-zinc-400">
                  <div className="flex items-start space-x-2.5">
                    <Terminal className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-zinc-200">Offline-First Architecture:</strong> Built on Tauri v2 + Rust with local SQLite storage. All metadata, artwork links, and game configurations remain exclusively on your device.
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
