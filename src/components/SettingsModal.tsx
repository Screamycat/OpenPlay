import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, Settings, RefreshCw, Terminal, Gamepad2, Sparkles, ExternalLink, Check } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanLibrary: () => void;
  isScanning: boolean;
  totalGames: number;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onScanLibrary,
  isScanning,
  totalGames,
}) => {
  const [sgdbKey, setSgdbKey] = useState("");
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    invoke<string | null>("get_steamgriddb_key")
      .then((k) => {
        if (k) setSgdbKey(k);
      })
      .catch(() => {});
  }, [isOpen]);

  const handleSaveSgdbKey = async () => {
    try {
      await invoke("save_steamgriddb_key", { key: sgdbKey });
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2500);
    } catch (e) {
      console.error(e);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#12151e] border border-[#23293d] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#202538] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Settings className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-bold text-slate-100">
              OpenPlay Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 text-xs text-slate-300">
          {/* SteamGridDB API Integration */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5 flex items-center space-x-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>SteamGridDB (Animated Artwork)</span>
            </h3>
            <div className="p-3 bg-[#181c2a] border border-[#23293e] rounded-xl space-y-2.5">
              <p className="text-[11px] text-slate-400 leading-normal">
                Enables animated posters, high-res logos, and custom hero banners directly in the details pane.
              </p>

              <div className="flex items-center space-x-2">
                <input
                  type="password"
                  value={sgdbKey}
                  onChange={(e) => setSgdbKey(e.target.value)}
                  placeholder="Enter SteamGridDB API Key..."
                  className="flex-1 px-3 py-1.5 bg-[#121520] border border-[#2a3148] rounded-lg text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
                />
                <button
                  onClick={handleSaveSgdbKey}
                  className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-lg text-xs transition-all cursor-pointer flex items-center space-x-1"
                >
                  {isSaved ? <Check className="w-3.5 h-3.5" /> : null}
                  <span>{isSaved ? "Saved" : "Save"}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => openUrl("https://www.steamgriddb.com/profile/preferences/api")}
                className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center space-x-1 underline cursor-pointer pt-0.5"
              >
                <span>Generate free API Key at steamgriddb.com</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </button>
            </div>
          </div>

          {/* Library Management */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">
              Library Management
            </h3>
            <div className="p-3 bg-[#181c2a] border border-[#23293e] rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-200">
                    Steam Integration
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Reads local library folders, cloud history, and manifests.
                  </div>
                </div>
                <button
                  onClick={onScanLibrary}
                  disabled={isScanning}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 rounded-lg transition-all text-xs font-medium disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isScanning ? "animate-spin" : ""}`}
                  />
                  <span>{isScanning ? "Scanning..." : "Rescan"}</span>
                </button>
              </div>

              <div className="pt-2 border-t border-[#23293e] flex justify-between text-slate-400 text-[11px]">
                <span>Total Managed Games:</span>
                <span className="font-semibold text-cyan-400">{totalGames}</span>
              </div>
            </div>
          </div>

          {/* Linux & Cross-Platform Architecture */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Cross-Platform Architecture
            </h3>
            <div className="p-3 bg-[#181c2a] border border-[#23293e] rounded-xl space-y-2 text-[11px] text-slate-400">
              <div className="flex items-start space-x-2">
                <Terminal className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-medium text-slate-200">
                    Linux Ready:
                  </span>{" "}
                  Native support for <code className="text-cyan-300">~/.steam/steam</code> and Flatpak Steam paths, X11/Wayland rendering with WebKitGTK, and Proton/Wine launcher compatibility.
                </div>
              </div>
            </div>
          </div>

          {/* About OpenPlay */}
          <div className="pt-2 border-t border-[#202538] flex items-center justify-between text-[11px] text-slate-500">
            <div className="flex items-center space-x-1.5">
              <Gamepad2 className="w-4 h-4 text-cyan-400" />
              <span className="font-semibold text-slate-300">OpenPlay</span>
              <span>v0.1.0</span>
            </div>
            <span>Cross-Platform Game Library</span>
          </div>
        </div>
      </div>
    </div>
  );
};
