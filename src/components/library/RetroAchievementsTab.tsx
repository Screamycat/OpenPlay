import React, { useState } from "react";
import { AppConfig } from "../../types/config";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Trophy,
  RefreshCw,
  ExternalLink,
  Eye,
  EyeOff,
  Check,
  CheckCircle2,
  AlertCircle,
  Gamepad2,
  Clock,
  KeyRound,
  Trash2,
} from "lucide-react";

interface RetroAchievementsTabProps {
  config: AppConfig;
  onSaveConfig: (updated: AppConfig) => void;
  onSync: () => Promise<void>;
  isSyncing: boolean;
}

export const RetroAchievementsTab: React.FC<RetroAchievementsTabProps> = ({
  config,
  onSaveConfig,
  onSync,
  isSyncing,
}) => {
  const [username, setUsername] = useState(config.retroachievements_username || "");
  const [apiKey, setApiKey] = useState(config.retroachievements_api_key || "");
  const [showKey, setShowKey] = useState(false);
  const [isSavedNotice, setIsSavedNotice] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);
  const [syncErrorMsg, setSyncErrorMsg] = useState<string | null>(null);

  const isConnected = !!(config.retroachievements_username && config.retroachievements_api_key);

  const handleSaveCredentials = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const updated = {
      ...config,
      retroachievements_username: username.trim(),
      retroachievements_api_key: apiKey.trim(),
    };
    onSaveConfig(updated);
    setIsSavedNotice(true);
    setTimeout(() => setIsSavedNotice(false), 2500);
  };

  const handleClearCredentials = () => {
    setUsername("");
    setApiKey("");
    const updated = {
      ...config,
      retroachievements_username: "",
      retroachievements_api_key: "",
    };
    onSaveConfig(updated);
  };

  const handleTriggerSync = async () => {
    setSyncStatusMsg(null);
    setSyncErrorMsg(null);
    try {
      // Ensure credentials saved first if dirty
      if (
        username.trim() !== (config.retroachievements_username || "") ||
        apiKey.trim() !== (config.retroachievements_api_key || "")
      ) {
        handleSaveCredentials();
      }
      await onSync();
      setSyncStatusMsg("RetroAchievements library and achievements synced successfully!");
      setTimeout(() => setSyncStatusMsg(null), 7000);
    } catch (err: any) {
      setSyncErrorMsg(typeof err === "string" ? err : err.message || "Failed to sync RetroAchievements");
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Header */}
      <div>
        <div className="flex items-center space-x-2.5">
          <span className="p-1 px-2 rounded bg-amber-500/20 text-amber-300 text-xs font-mono font-bold border border-amber-500/30">
            RETRO
          </span>
          <h3 className="text-lg font-bold text-white">RetroAchievements Integration</h3>
        </div>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
          Connect your RetroAchievements account to import retro titles you have played, sync badges, unlock timestamps, and track achievements.
        </p>
      </div>

      {/* Status Messages */}
      {syncStatusMsg && (
        <div className="p-3 bg-emerald-950/60 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{syncStatusMsg}</span>
        </div>
      )}

      {syncErrorMsg && (
        <div className="p-3 bg-rose-950/60 border border-rose-500/40 rounded-xl text-rose-300 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{syncErrorMsg}</span>
        </div>
      )}

      {/* 1. Account & Credentials Card */}
      <div className="bg-[#151926] border border-[#23293e] rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-[11px] uppercase font-bold text-slate-400 tracking-wider flex items-center space-x-1.5">
            <KeyRound className="w-3.5 h-3.5 text-amber-400" />
            <span>Account Credentials</span>
          </div>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
              isConnected
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                : "bg-white/5 text-slate-400 border-white/10"
            }`}
          >
            {isConnected ? "Connected" : "Not Configured"}
          </span>
        </div>

        <form onSubmit={handleSaveCredentials} className="space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Username */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-slate-300 font-medium">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="RetroAchievements username..."
                className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-amber-400 transition-all font-medium"
              />
            </div>

            {/* Web API Key */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-slate-300 font-medium">Web API Key</label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="32-character web API key..."
                  className="w-full px-3 py-2 pr-9 bg-black/40 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-amber-400 transition-all font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={() => openUrl("https://retroachievements.org/controlpanel.php")}
              className="text-[11px] text-slate-400 hover:text-amber-300 flex items-center space-x-1 underline cursor-pointer transition-colors"
            >
              <span>Find your RetroAchievements Web API key</span>
              <ExternalLink className="w-3 h-3" />
            </button>

            <div className="flex items-center space-x-2">
              {isConnected && (
                <button
                  type="button"
                  onClick={handleClearCredentials}
                  className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-semibold transition-all cursor-pointer flex items-center space-x-1"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Disconnect</span>
                </button>
              )}

              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-semibold transition-all cursor-pointer flex items-center space-x-1.5"
              >
                {isSavedNotice ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />
                    <span className="text-emerald-300 font-bold">Saved!</span>
                  </>
                ) : (
                  <span>Save Credentials</span>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* 2. Library Features Card */}
      <div className="bg-[#151926] border border-[#23293e] rounded-xl p-4 space-y-3">
        <div className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">
          What gets imported
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-[#111420] border border-[#1d2232] space-y-1">
            <div className="font-semibold text-slate-200 flex items-center space-x-1.5">
              <Gamepad2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Full Played History</span>
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Imports all retro games with a play history on your account, including games with zero achievements unlocked.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-[#111420] border border-[#1d2232] space-y-1">
            <div className="font-semibold text-slate-200 flex items-center space-x-1.5">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>Playtime & Dates</span>
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Imports recorded session playtime and accurate last played dates logged through emulators and RetroArch.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-[#111420] border border-[#1d2232] space-y-1">
            <div className="font-semibold text-slate-200 flex items-center space-x-1.5">
              <Trophy className="w-3.5 h-3.5 text-emerald-400" />
              <span>Badges & Awards</span>
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Pulls complete achievement badge sets, unlock timestamps, and Beaten/Mastered award statuses.
            </p>
          </div>
        </div>
      </div>

      {/* 3. Sync Action Row */}
      <div className="pt-2 flex items-center justify-between">
        <div className="text-[11px] text-slate-400">
          {isConnected ? (
            <span>Connected as <strong className="text-amber-300 font-semibold">{config.retroachievements_username}</strong></span>
          ) : (
            <span>Please enter credentials above to sync your library</span>
          )}
        </div>

        <button
          onClick={handleTriggerSync}
          disabled={isSyncing || !username.trim() || !apiKey.trim()}
          className="flex items-center space-x-2 px-6 py-2.5 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-bold rounded-xl transition-all shadow-md active:scale-[0.98] disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
          <span>{isSyncing ? "Syncing RetroAchievements..." : "Sync RetroAchievements Library"}</span>
        </button>
      </div>
    </div>
  );
};
