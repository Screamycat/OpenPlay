import React from "react";
import { X, Settings, RefreshCw, Terminal, Gamepad2 } from "lucide-react";

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
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 text-xs text-slate-300">
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
                    Reads local library folders and app manifests directly.
                  </div>
                </div>
                <button
                  onClick={onScanLibrary}
                  disabled={isScanning}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 rounded-lg transition-all text-xs font-medium disabled:opacity-50"
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
            <span>Open Source (MIT)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
