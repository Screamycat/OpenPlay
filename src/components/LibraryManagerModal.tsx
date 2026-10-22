import React, { useState } from "react";
import { LibraryIntegration } from "../types/integration";
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

interface LibraryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  steamIntegration: LibraryIntegration;
  onOpenSteamLogin: () => void;
  onAuthenticateManual: (idOrVanity: string) => void;
  onLogoutSteam: () => void;
  onSaveSteamIntegration: (updated: LibraryIntegration) => void;
  onSyncSteamLibrary: () => Promise<number | void>;
  onClearLibrary: () => Promise<void>;
  isSyncing: boolean;
  isAuthenticating: boolean;
}

type CategoryTab =
  | "steam"
  | "epic"
  | "gog"
  | "retroarch"
  | "standalone_emulators"
  | "manual_local"
  | "manual_shortcuts";

export const LibraryManagerModal: React.FC<LibraryManagerModalProps> = ({
  isOpen,
  onClose,
  steamIntegration,
  onOpenSteamLogin,
  onAuthenticateManual,
  onLogoutSteam,
  onSaveSteamIntegration,
  onSyncSteamLibrary,
  onClearLibrary,
  isSyncing,
  isAuthenticating,
}) => {
  const [activeTab, setActiveTab] = useState<CategoryTab>("steam");
  const [manualInput, setManualInput] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);

  if (!isOpen) return null;

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
      const count = await onSyncSteamLibrary();
      setSyncStatusMsg(
        typeof count === "number"
          ? `Sync Complete! ${count} installed games imported into library.`
          : "Sync Complete! Library refreshed."
      );
      setTimeout(() => setSyncStatusMsg(null), 5000);
    } catch (err) {
      setSyncStatusMsg(`Sync error: ${err}`);
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
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#10131c] border border-[#23293d] rounded-2xl w-full max-w-4xl h-[620px] shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="h-14 px-6 border-b border-[#20263a] flex items-center justify-between bg-[#0e1017]">
          <div className="flex items-center space-x-2.5">
            <Layers className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-bold text-slate-100 tracking-wide">
              Library Manager
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-[#1a1f2e] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Left Categorized Sidebar + Right Content Pane */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Categorized Navigation (Manual, Emulation, Providers) */}
          <div className="w-64 border-r border-[#1e2333] bg-[#0c0e15] overflow-y-auto p-3 space-y-4 select-none">
            {/* 1. MANUAL */}
            <div>
              <div className="px-2 py-1 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                Manual
              </div>
              <div className="space-y-0.5 mt-1">
                <button
                  onClick={() => setActiveTab("manual_local")}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                    activeTab === "manual_local"
                      ? "bg-[#1f2538] text-cyan-300 font-semibold"
                      : "text-slate-400 hover:text-slate-200 hover:bg-[#141824]"
                  }`}
                >
                  <span className="flex items-center space-x-2">
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>Local Folders</span>
                  </span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-500">
                    Soon
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
                {/* Steam (Active!) */}
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

                {/* Epic Games */}
                <button
                  onClick={() => setActiveTab("epic")}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                    activeTab === "epic"
                      ? "bg-[#1f2538] text-cyan-300 font-semibold"
                      : "text-slate-400 hover:text-slate-200 hover:bg-[#141824]"
                  }`}
                >
                  <span>Epic Games</span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-500">
                    Soon
                  </span>
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
          </div>

          {/* Right Main Content Pane */}
          <div className="flex-1 overflow-y-auto p-6 bg-[#0f111a]">
            {activeTab === "steam" ? (
              <div className="max-w-2xl space-y-5 text-xs text-slate-200">
                {/* Steam Integration Header */}
                <div className="flex items-center justify-between border-b border-[#202538] pb-3">
                  <div>
                    <h3 className="text-base font-extrabold text-white flex items-center space-x-2">
                      <span>Steam Integration</span>
                    </h3>
                    <p className="text-slate-400 text-xs mt-0.5">
                      Sync installed games, full owned library catalog, and playtime directly from Steam.
                    </p>
                  </div>

                  <button
                    onClick={handleClearClick}
                    title="Wipe currently imported games to start completely fresh"
                    className="flex items-center space-x-1.5 px-3 py-1.5 text-[11px] text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-lg transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear Library</span>
                  </button>
                </div>

                {/* Status Alert Banner */}
                {syncStatusMsg && (
                  <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center space-x-2 animate-in fade-in duration-200">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{syncStatusMsg}</span>
                  </div>
                )}

                {/* 1. Account / Authentication Status Card */}
                <div className="bg-[#151926] border border-[#23293e] rounded-xl p-4 space-y-4">
                  <div className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">
                    Steam Account
                  </div>

                  {steamIntegration.is_authenticated ? (
                    <div className="flex items-center justify-between bg-[#1a1f30] p-3 rounded-lg border border-[#293148]">
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
