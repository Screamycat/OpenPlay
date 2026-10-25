import React, { useState, useEffect } from "react";
import { LibraryIntegration } from "../types/integration";
import { Game } from "../types/game";
import {
  X,
  RefreshCw,
  LogIn,
  LogOut,
  FolderOpen,
  Gamepad,
  HardDrive,
  Cloud,
  Clock,
  Layers,
  Sparkles,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import { LocalGamesTab } from "./library/LocalGamesTab";

interface ScanResult {
  count: number;
  installed: number;
  uninstalled: number;
}

export type CategoryTab =
  | "steam"
  | "epic"
  | "gog"
  | "retroarch"
  | "standalone_emulators"
  | "manual_local"
  | "manual_shortcuts";

interface LibraryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: CategoryTab;
  onRefreshGames?: () => Promise<void>;
  onGameAdded?: (game: Game) => void;
  // Steam
  steamIntegration: LibraryIntegration;
  onOpenSteamLogin: () => void;
  onAuthenticateManual: (idOrVanity: string) => void;
  onLogoutSteam: () => void;
  onSaveSteamIntegration: (updated: LibraryIntegration) => void;
  onSyncSteamLibrary: () => Promise<ScanResult | number | void>;
  onClearLibrary: () => Promise<void>;
  isSyncing: boolean;
  isAuthenticating: boolean;
  // Epic
  epicIntegration: LibraryIntegration;
  onOpenEpicLogin: () => void;
  onAuthenticateEpicManual: (code: string) => void;
  onLogoutEpic: () => void;
  onSaveEpicIntegration: (updated: LibraryIntegration) => void;
  onSyncEpicLibrary: () => Promise<ScanResult | number | void>;
  isSyncingEpic: boolean;
  isAuthenticatingEpic: boolean;
}

export const LibraryManagerModal: React.FC<LibraryManagerModalProps> = ({
  isOpen,
  onClose,
  initialTab = "steam",
  onRefreshGames,
  onGameAdded,
  steamIntegration,
  onOpenSteamLogin,
  onAuthenticateManual,
  onLogoutSteam,
  onSaveSteamIntegration,
  onSyncSteamLibrary,
  onClearLibrary,
  isSyncing,
  isAuthenticating,
  epicIntegration,
  onOpenEpicLogin,
  onAuthenticateEpicManual,
  onLogoutEpic,
  onSaveEpicIntegration,
  onSyncEpicLibrary,
  isSyncingEpic,
  isAuthenticatingEpic,
}) => {
  const [activeTab, setActiveTab] = useState<CategoryTab>(initialTab);
  const [manualInput, setManualInput] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);
  const [epicManualInput, setEpicManualInput] = useState("");
  const [showEpicManualInput, setShowEpicManualInput] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  // Steam Toggles
  const handleToggleInstalled = () => {
    onSaveSteamIntegration({
      ...steamIntegration,
      import_installed: !steamIntegration.import_installed,
    });
  };

  const handleToggleUninstalled = () => {
    onSaveSteamIntegration({
      ...steamIntegration,
      import_uninstalled: !steamIntegration.import_uninstalled,
    });
  };

  const handleTogglePlaytime = () => {
    onSaveSteamIntegration({
      ...steamIntegration,
      sync_playtime: !steamIntegration.sync_playtime,
    });
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualInput.trim()) {
      onAuthenticateManual(manualInput.trim());
      setManualInput("");
      setShowManualInput(false);
    }
  };

  const handleSyncClick = async () => {
    setSyncStatusMsg(null);
    try {
      const res = await onSyncSteamLibrary();
      if (res && typeof res === "object" && "installed" in res) {
        setSyncStatusMsg(
          `Sync Complete! Found ${res.installed} installed and ${res.uninstalled} uninstalled games (${res.count} total).`
        );
      } else if (typeof res === "number") {
        setSyncStatusMsg(`Sync Complete! ${res} games imported into library.`);
      } else {
        setSyncStatusMsg("Sync Complete! Library refreshed.");
      }
      setTimeout(() => setSyncStatusMsg(null), 6000);
    } catch (err) {
      setSyncStatusMsg(`Sync error: ${err}`);
    }
  };

  // Epic Toggles
  const handleToggleEpicInstalled = () => {
    onSaveEpicIntegration({
      ...epicIntegration,
      import_installed: !epicIntegration.import_installed,
    });
  };

  const handleToggleEpicUninstalled = () => {
    onSaveEpicIntegration({
      ...epicIntegration,
      import_uninstalled: !epicIntegration.import_uninstalled,
    });
  };

  const handleToggleEpicPlaytime = () => {
    onSaveEpicIntegration({
      ...epicIntegration,
      sync_playtime: !epicIntegration.sync_playtime,
    });
  };

  const handleEpicManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let raw = epicManualInput.trim();
    if (raw) {
      if (raw.startsWith("{")) {
        try {
          const json = JSON.parse(raw);
          raw = json.authorizationCode || json.exchangeCode || json.sid || raw;
        } catch {}
      } else if (raw.includes("code=")) {
        const match = raw.match(/code=([^&]+)/);
        if (match) raw = match[1];
      }
      onAuthenticateEpicManual(raw.trim());
      setEpicManualInput("");
      setShowEpicManualInput(false);
    }
  };

  const handleSyncEpicClick = async () => {
    setSyncStatusMsg(null);
    try {
      const res = await onSyncEpicLibrary();
      if (res && typeof res === "object" && "installed" in res) {
        setSyncStatusMsg(
          `Epic Sync Complete! Found ${res.installed} installed and ${res.uninstalled} uninstalled games (${res.count} total).`
        );
      } else if (typeof res === "number") {
        setSyncStatusMsg(`Epic Sync Complete! ${res} games imported into library.`);
      } else {
        setSyncStatusMsg("Epic Sync Complete! Library refreshed.");
      }
      setTimeout(() => setSyncStatusMsg(null), 6000);
    } catch (err) {
      setSyncStatusMsg(`Epic sync error: ${err}`);
    }
  };

  const handleClearClick = async () => {
    if (confirm("Are you sure you want to clear all imported games from OpenPlay? You can re-sync anytime.")) {
      await onClearLibrary();
      setSyncStatusMsg("All library games have been removed.");
      setTimeout(() => setSyncStatusMsg(null), 4000);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl bg-[#0f111a] border border-[#23293e] rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[640px]"
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e2333] bg-[#121520]">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-cyan-950/50 border border-cyan-500/30 rounded-xl text-cyan-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">
                Library Integrations & Managers
              </h2>
              <p className="text-xs text-slate-400">
                Configure game platforms, emulation cores, and local disk scanners
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Left Categorized Sidebar + Right Content Pane */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Categorized Navigation (Manual, Emulation, Providers) */}
          <div className="w-64 border-r border-[#1e2333] bg-[#0c0e15] overflow-y-auto p-3 space-y-4 select-none">
            {/* 1. MANUAL & IMPORT */}
            <div>
              <div className="px-2 py-1 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                Manual & Import
              </div>
              <div className="space-y-0.5 mt-1">
                <button
                  onClick={() => setActiveTab("manual_local")}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                    activeTab === "manual_local"
                      ? "bg-cyan-950/60 text-cyan-300 border border-cyan-500/40 font-semibold"
                      : "text-slate-300 hover:text-white hover:bg-[#141824]"
                  }`}
                >
                  <span className="flex items-center space-x-2">
                    <FolderOpen className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Local Files & Folders</span>
                  </span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-400 font-medium">
                    Active
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab("manual_shortcuts")}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                    activeTab === "manual_shortcuts"
                      ? "bg-[#1f2538] text-cyan-300 font-semibold"
                      : "text-slate-400 hover:text-slate-200 hover:bg-[#141824]"
                  }`}
                >
                  <span className="flex items-center space-x-2">
                    <HardDrive className="w-3.5 h-3.5" />
                    <span>Custom Shortcuts</span>
                  </span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-500">
                    Soon
                  </span>
                </button>
              </div>
            </div>

            <div className="border-t border-[#1a1f2e]" />

            {/* 2. EMULATION */}
            <div>
              <div className="px-2 py-1 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                Emulation
              </div>
              <div className="space-y-0.5 mt-1">
                <button
                  onClick={() => setActiveTab("retroarch")}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                    activeTab === "retroarch"
                      ? "bg-[#1f2538] text-cyan-300 font-semibold"
                      : "text-slate-400 hover:text-slate-200 hover:bg-[#141824]"
                  }`}
                >
                  <span className="flex items-center space-x-2">
                    <Gamepad className="w-3.5 h-3.5" />
                    <span>RetroArch</span>
                  </span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-500">
                    Soon
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab("standalone_emulators")}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                    activeTab === "standalone_emulators"
                      ? "bg-[#1f2538] text-cyan-300 font-semibold"
                      : "text-slate-400 hover:text-slate-200 hover:bg-[#141824]"
                  }`}
                >
                  <span className="flex items-center space-x-2">
                    <Gamepad className="w-3.5 h-3.5" />
                    <span>Standalone Emulators</span>
                  </span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-500">
                    Soon
                  </span>
                </button>
              </div>
            </div>

            <div className="border-t border-[#1a1f2e]" />

            {/* 3. PROVIDERS */}
            <div>
              <div className="px-2 py-1 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                Providers
              </div>
              <div className="space-y-0.5 mt-1">
                {/* Steam (Active) */}
                <button
                  onClick={() => setActiveTab("steam")}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                    activeTab === "steam"
                      ? "bg-cyan-950/60 text-cyan-300 border border-cyan-500/40 font-semibold"
                      : "text-slate-300 hover:text-white hover:bg-[#141824]"
                  }`}
                >
                  <span className="flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-cyan-400" />
                    <span>Steam</span>
                  </span>
                  {steamIntegration.is_authenticated ? (
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-bold">
                      Connected
                    </span>
                  ) : (
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-400 font-medium">
                      Active
                    </span>
                  )}
                </button>

                {/* Epic Games (Active) */}
                <button
                  onClick={() => setActiveTab("epic")}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                    activeTab === "epic"
                      ? "bg-purple-950/60 text-purple-300 border border-purple-500/40 font-semibold"
                      : "text-slate-300 hover:text-white hover:bg-[#141824]"
                  }`}
                >
                  <span className="flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-purple-400" />
                    <span>Epic Games</span>
                  </span>
                  {epicIntegration.is_authenticated ? (
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-bold">
                      Connected
                    </span>
                  ) : (
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/10 text-purple-400 font-medium">
                      Active
                    </span>
                  )}
                </button>

                {/* GOG */}
                <button
                  onClick={() => setActiveTab("gog")}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                    activeTab === "gog"
                      ? "bg-[#1f2538] text-cyan-300 font-semibold"
                      : "text-slate-400 hover:text-slate-200 hover:bg-[#141824]"
                  }`}
                >
                  <span>GOG Galaxy</span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-500">
                    Soon
                  </span>
                </button>
              </div>
            </div>

            {/* Quick Action: Clear Library */}
            <div className="pt-4">
              <button
                onClick={handleClearClick}
                className="w-full flex items-center justify-center space-x-1.5 px-3 py-2 bg-rose-950/20 hover:bg-rose-950/40 text-rose-400/80 hover:text-rose-300 border border-rose-900/30 rounded-lg text-xs transition-all cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear All Games</span>
              </button>
            </div>
          </div>

          {/* Right Pane: Dynamic based on Active Tab */}
          <div className="flex-1 p-6 overflow-y-auto bg-[#0f111a]">
            {/* Status Feedback Toast / Banner */}
            {syncStatusMsg && (
              <div className="mb-4 p-3 bg-cyan-950/60 border border-cyan-500/40 rounded-xl text-cyan-300 text-xs flex items-center space-x-2 animate-in fade-in duration-200">
                <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>{syncStatusMsg}</span>
              </div>
            )}

            {activeTab === "steam" ? (
              /* STEAM INTEGRATION VIEW */
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                    <span>Steam Integration</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Connect your Steam account or import games directly from local drives.
                  </p>
                </div>

                {/* 1. Account Authentication Card */}
                <div className="bg-[#151926] border border-[#23293e] rounded-xl p-4 space-y-4">
                  <div className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">
                    Steam Account
                  </div>

                  {steamIntegration.is_authenticated ? (
                    <div className="flex items-center justify-between bg-[#111420] border border-[#1e2333] p-3 rounded-lg">
                      <div className="flex items-center space-x-3">
                        {steamIntegration.avatar_url ? (
                          <img
                            src={steamIntegration.avatar_url}
                            alt="Steam Avatar"
                            className="w-10 h-10 rounded-full border border-cyan-400 shadow-md"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center font-bold text-slate-300">
                            {steamIntegration.username?.[0] || "S"}
                          </div>
                        )}
                        <div>
                          <div className="font-bold text-white text-sm flex items-center space-x-2">
                            <span>{steamIntegration.username || "Steam User"}</span>
                            <span className="text-[9px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-400 rounded-full font-semibold border border-emerald-500/30">
                              Authenticated
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            SteamID: {steamIntegration.account_id}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={onLogoutSteam}
                        className="flex items-center space-x-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg transition-all font-medium cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Log Out</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="p-3 bg-[#121520] rounded-lg border border-[#1e2333] text-slate-400 leading-relaxed text-xs">
                        Sign in to connect your Steam account. OpenPlay uses an authentic embedded login window to securely identify your profile, enabling syncing of uninstalled library games and cloud playtime.
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={onOpenSteamLogin}
                          disabled={isAuthenticating}
                          className="flex items-center space-x-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold rounded-xl shadow-lg transition-all active:scale-[0.98] cursor-pointer"
                        >
                          <LogIn className="w-4 h-4" />
                          <span>{isAuthenticating ? "Opening Login..." : "Log In with Steam"}</span>
                        </button>

                        <button
                          onClick={() => setShowManualInput(!showManualInput)}
                          className="text-xs text-slate-400 hover:text-slate-200 underline cursor-pointer"
                        >
                          {showManualInput ? "Hide manual entry" : "Enter SteamID / Vanity URL manually"}
                        </button>
                      </div>

                      {showManualInput && (
                        <form
                          onSubmit={handleManualSubmit}
                          className="pt-2 flex items-center space-x-2"
                        >
                          <input
                            type="text"
                            value={manualInput}
                            onChange={(e) => setManualInput(e.target.value)}
                            placeholder="e.g. 76561198333189713 or custom_url"
                            className="flex-1 px-3 py-2 bg-[#10131d] border border-[#262c42] rounded-lg text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
                          />
                          <button
                            type="submit"
                            className="px-4 py-2 bg-cyan-600 text-slate-950 font-bold rounded-lg text-xs hover:bg-cyan-500 transition-all cursor-pointer"
                          >
                            Verify & Connect
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </div>

                {/* 2. Library Import Settings */}
                <div className="bg-[#151926] border border-[#23293e] rounded-xl p-4 space-y-3">
                  <div className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">
                    Import Options
                  </div>

                  <div className="space-y-2.5">
                    {/* Import Installed */}
                    <label className="flex items-center justify-between p-2.5 rounded-lg bg-[#111420] border border-[#1d2232] cursor-pointer hover:bg-[#151928] transition-colors">
                      <div className="flex items-center space-x-3">
                        <HardDrive className="w-4 h-4 text-cyan-400" />
                        <div>
                          <div className="font-semibold text-slate-200">
                            Import installed games
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Scans local storage drives for installed Steam game manifests (filters out software & tools).
                          </div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={steamIntegration.import_installed}
                        onChange={handleToggleInstalled}
                        className="w-4 h-4 rounded bg-[#1e2335] border-[#2c344d] text-cyan-500 focus:ring-0 cursor-pointer accent-cyan-400"
                      />
                    </label>

                    {/* Import Uninstalled */}
                    <label className="flex items-center justify-between p-2.5 rounded-lg bg-[#111420] border border-[#1d2232] cursor-pointer hover:bg-[#151928] transition-colors">
                      <div className="flex items-center space-x-3">
                        <Cloud className="w-4 h-4 text-amber-400" />
                        <div>
                          <div className="font-semibold text-slate-200">
                            Import uninstalled / cloud-owned games
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Pulls your full game catalog from your connected Steam profile.
                          </div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={steamIntegration.import_uninstalled}
                        onChange={handleToggleUninstalled}
                        className="w-4 h-4 rounded bg-[#1e2335] border-[#2c344d] text-cyan-500 focus:ring-0 cursor-pointer accent-cyan-400"
                      />
                    </label>

                    {/* Sync Playtime */}
                    <label className="flex items-center justify-between p-2.5 rounded-lg bg-[#111420] border border-[#1d2232] cursor-pointer hover:bg-[#151928] transition-colors">
                      <div className="flex items-center space-x-3">
                        <Clock className="w-4 h-4 text-emerald-400" />
                        <div>
                          <div className="font-semibold text-slate-200">
                            Sync lifetime playtime
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Imports playtime recorded in Steam userdata and cloud stats.
                          </div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={steamIntegration.sync_playtime}
                        onChange={handleTogglePlaytime}
                        className="w-4 h-4 rounded bg-[#1e2335] border-[#2c344d] text-cyan-500 focus:ring-0 cursor-pointer accent-cyan-400"
                      />
                    </label>
                  </div>
                </div>

                {/* 3. Sync Action Row */}
                <div className="pt-2 flex items-center justify-between">
                  <div className="text-[11px] text-slate-400">
                    {steamIntegration.last_sync ? (
                      <span>Last Synced: <strong className="text-slate-200">{steamIntegration.last_sync}</strong></span>
                    ) : (
                      <span>Ready to sync</span>
                    )}
                  </div>

                  <button
                    onClick={handleSyncClick}
                    disabled={isSyncing}
                    className="flex items-center space-x-2 px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-xl transition-all shadow-md active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
                    <span>{isSyncing ? "Scanning Steam Library..." : "Sync Steam Library"}</span>
                  </button>
                </div>
              </div>
            ) : activeTab === "epic" ? (
              /* EPIC GAMES INTEGRATION VIEW */
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                    <span className="p-1 px-2 rounded bg-purple-900/40 text-purple-300 text-xs font-mono font-bold border border-purple-500/30">
                      EPIC
                    </span>
                    <span>Epic Games Store</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Connect your Epic Games account to import your cloud library and locally installed titles.
                  </p>
                </div>

                {/* 1. Account Authentication Card */}
                <div className="bg-[#151926] border border-[#23293e] rounded-xl p-4 space-y-4">
                  <div className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">
                    Epic Games Account
                  </div>

                  {epicIntegration.is_authenticated ? (
                    <div className="flex items-center justify-between bg-[#111420] border border-[#1e2333] p-3 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 to-indigo-700 flex items-center justify-center font-bold text-white shadow-md border border-purple-400/40">
                          {epicIntegration.username?.[0]?.toUpperCase() || "E"}
                        </div>
                        <div>
                          <div className="font-bold text-white text-sm flex items-center space-x-2">
                            <span>{epicIntegration.username || "Epic User"}</span>
                            <span className="text-[9px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-400 rounded-full font-semibold border border-emerald-500/30">
                              Connected
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            Account ID: {epicIntegration.account_id}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={onLogoutEpic}
                        className="flex items-center space-x-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg transition-all font-medium cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Disconnect</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="p-3 bg-[#121520] rounded-lg border border-[#1e2333] text-slate-400 leading-relaxed text-xs">
                        Sign in to connect your Epic Games account. OpenPlay uses an authentic embedded login window to securely identify your profile, enabling automatic importing of your claimed, purchased, and installed games with official artwork and metadata.
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={onOpenEpicLogin}
                          disabled={isAuthenticatingEpic}
                          className="flex items-center space-x-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg transition-all active:scale-[0.98] cursor-pointer"
                        >
                          <LogIn className="w-4 h-4" />
                          <span>{isAuthenticatingEpic ? "Opening Login..." : "Connect Epic Games"}</span>
                        </button>

                        <button
                          onClick={() => setShowEpicManualInput(!showEpicManualInput)}
                          className="text-xs text-slate-400 hover:text-slate-200 underline cursor-pointer"
                        >
                          {showEpicManualInput ? "Hide manual entry" : "Enter authorization code manually"}
                        </button>
                      </div>

                      {showEpicManualInput && (
                        <form
                          onSubmit={handleEpicManualSubmit}
                          className="pt-2 flex items-center space-x-2"
                        >
                          <input
                            type="text"
                            value={epicManualInput}
                            onChange={(e) => setEpicManualInput(e.target.value)}
                            placeholder="Paste 32-character authorization code here"
                            className="flex-1 px-3 py-2 bg-[#10131d] border border-[#262c42] rounded-lg text-xs text-white focus:outline-none focus:border-purple-400 font-mono"
                          />
                          <button
                            type="submit"
                            className="px-4 py-2 bg-purple-600 text-white font-bold rounded-lg text-xs hover:bg-purple-500 transition-all cursor-pointer"
                          >
                            Authenticate
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </div>

                {/* 2. Library Import Settings */}
                <div className="bg-[#151926] border border-[#23293e] rounded-xl p-4 space-y-3">
                  <div className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">
                    Import Options
                  </div>

                  <div className="space-y-2.5">
                    {/* Import Installed */}
                    <label className="flex items-center justify-between p-2.5 rounded-lg bg-[#111420] border border-[#1d2232] cursor-pointer hover:bg-[#151928] transition-colors">
                      <div className="flex items-center space-x-3">
                        <HardDrive className="w-4 h-4 text-purple-400" />
                        <div>
                          <div className="font-semibold text-slate-200">
                            Import locally installed games
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Reads local installation manifests (%ProgramData%\Epic) to locate launch executables and disk sizes.
                          </div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={epicIntegration.import_installed}
                        onChange={handleToggleEpicInstalled}
                        className="w-4 h-4 rounded bg-[#1e2335] border-[#2c344d] text-purple-500 focus:ring-0 cursor-pointer accent-purple-400"
                      />
                    </label>

                    {/* Import Uninstalled */}
                    <label className="flex items-center justify-between p-2.5 rounded-lg bg-[#111420] border border-[#1d2232] cursor-pointer hover:bg-[#151928] transition-colors">
                      <div className="flex items-center space-x-3">
                        <Cloud className="w-4 h-4 text-amber-400" />
                        <div>
                          <div className="font-semibold text-slate-200">
                            Import uninstalled / cloud-owned catalog
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Queries your connected Epic account for claimed, gifted, and purchased games in your library.
                          </div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={epicIntegration.import_uninstalled}
                        onChange={handleToggleEpicUninstalled}
                        className="w-4 h-4 rounded bg-[#1e2335] border-[#2c344d] text-purple-500 focus:ring-0 cursor-pointer accent-purple-400"
                      />
                    </label>

                    {/* Sync Playtime */}
                    <label className="flex items-center justify-between p-2.5 rounded-lg bg-[#111420] border border-[#1d2232] cursor-pointer hover:bg-[#151928] transition-colors">
                      <div className="flex items-center space-x-3">
                        <Clock className="w-4 h-4 text-emerald-400" />
                        <div>
                          <div className="font-semibold text-slate-200">
                            Sync recorded playtime
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Pulls official playtime statistics from Epic's live cloud library service.
                          </div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={epicIntegration.sync_playtime}
                        onChange={handleToggleEpicPlaytime}
                        className="w-4 h-4 rounded bg-[#1e2335] border-[#2c344d] text-purple-500 focus:ring-0 cursor-pointer accent-purple-400"
                      />
                    </label>
                  </div>
                </div>

                {/* 3. Sync Action Row */}
                <div className="pt-2 flex items-center justify-between">
                  <div className="text-[11px] text-slate-400">
                    {epicIntegration.last_sync ? (
                      <span>Last Synced: <strong className="text-slate-200">{epicIntegration.last_sync}</strong></span>
                    ) : (
                      <span>Ready to sync</span>
                    )}
                  </div>

                  <button
                    onClick={handleSyncEpicClick}
                    disabled={isSyncingEpic}
                    className="flex items-center space-x-2 px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-xl transition-all shadow-md active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`w-4 h-4 ${isSyncingEpic ? "animate-spin" : ""}`} />
                    <span>{isSyncingEpic ? "Scanning Epic Library..." : "Sync Epic Games"}</span>
                  </button>
                </div>
              </div>
            ) : activeTab === "manual_local" ? (
              <LocalGamesTab
                onGameAdded={(game) => {
                  onGameAdded?.(game);
                  onRefreshGames?.();
                }}
                onBatchAdded={() => {
                  onRefreshGames?.();
                }}
              />
            ) : (
              /* Coming Soon Placeholder for other categories */
              <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3">
                <Sparkles className="w-12 h-12 text-slate-600" />
                <h3 className="text-base font-bold text-slate-200 capitalize">
                  {activeTab.replace("_", " ")} Integration
                </h3>
                <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
                  Support for this category is planned in upcoming phases. The library architecture is already modularized to plug in scanners and store manifests seamlessly.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
