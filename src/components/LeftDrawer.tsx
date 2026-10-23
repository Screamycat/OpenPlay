import React, { useState, useRef } from "react";
import {
  X,
  Library,
  Settings,
  Gamepad2,
  RefreshCw,
  Sparkles,
  ChevronRight,
  Layers,
  Loader2,
} from "lucide-react";

const SteamIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 496 512" fill="currentColor" className={className} aria-hidden="true">
    <path d="M496 256c0 137-111.2 248-248.4 248-113.8 0-209.6-76.3-239-180.4l95.2 39.3c6.4 32.1 34.9 56.4 68.9 56.4 39.2 0 71.9-32.4 70.2-73.5l84.5-60.2c52.1 1.3 95.8-40.9 95.8-93.5 0-51.6-42-93.5-93.7-93.5s-93.7 42-93.7 93.5v1.2L176.6 279c-15.5-.9-30.7 3.4-43.5 12.1L0 236.1C10.2 108.4 117.1 8 247.6 8 384.8 8 496 119 496 256zM155.7 384.3l-30.5-12.6a52.79 52.79 0 0 0 27.2 25.8c26.9 11.2 57.8-1.6 69-28.4 5.4-13 5.5-27.3.1-40.3-5.4-13-15.5-23.2-28.5-28.6-12.9-5.4-26.7-5.2-38.9-.6l31.5 13c19.8 8.2 29.2 30.9 20.9 50.7-8.3 19.9-31 29.2-50.8 21zm173.8-129.9c-34.4 0-62.4-28-62.4-62.3s28-62.3 62.4-62.3 62.4 28 62.4 62.3-27.9 62.3-62.4 62.3zm.1-15.6c25.9 0 46.9-21 46.9-46.8 0-25.9-21-46.8-46.9-46.8s-46.9 21-46.9 46.8c.1 25.8 21.1 46.8 46.9 46.8z" />
  </svg>
);

interface LeftDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenLibraryManager: () => void;
  onOpenSettings: () => void;
  gameCount: number;
  onRefreshAllMetadata: () => void;
  onRefreshAllLibraries: () => void;
  onRefreshLibrary: (provider: string) => void;
  isSyncingMetadata?: boolean;
  isScanning?: boolean;
}

export const LeftDrawer: React.FC<LeftDrawerProps> = ({
  isOpen,
  onClose,
  onOpenLibraryManager,
  onOpenSettings,
  gameCount,
  onRefreshAllMetadata,
  onRefreshAllLibraries,
  onRefreshLibrary,
  isSyncingMetadata = false,
  isScanning = false,
}) => {
  const [isRefreshHovered, setIsRefreshHovered] = useState(false);
  const [isRefreshExpanded, setIsRefreshExpanded] = useState(false);
  const hoverTimeoutRef = useRef<number | null>(null);

  const handleMouseEnterRefresh = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setIsRefreshHovered(true);
  };

  const handleMouseLeaveRefresh = () => {
    hoverTimeoutRef.current = window.setTimeout(() => {
      setIsRefreshHovered(false);
    }, 250);
  };

  const isFlyoutVisible = isRefreshHovered || isRefreshExpanded;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-xs transition-opacity duration-200 ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Sliding Drawer Container */}
      <aside
        className={`fixed top-0 left-0 bottom-0 w-64 bg-[#0c0e15] border-r border-[#1e2333] z-50 flex flex-col shadow-2xl transition-transform duration-250 ease-out select-none ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="h-14 px-4 border-b border-[#1e2333] flex items-center justify-between bg-[#0e1017]">
          <div className="flex items-center space-x-2">
            <Gamepad2 className="w-5 h-5 text-cyan-400" />
            <span className="font-extrabold text-sm text-slate-100 tracking-wide">
              OpenPlay
            </span>
            <span className="text-[10px] px-1.5 py-0.2 bg-cyan-500/20 text-cyan-300 font-bold rounded-full font-mono">
              {gameCount}
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-[#1a1f2e] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Items */}
        <div className="p-3 space-y-1.5 text-xs">
          {/* Library Button */}
          <button
            onClick={() => {
              onClose();
              onOpenLibraryManager();
            }}
            className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl bg-gradient-to-r from-cyan-950/40 to-blue-950/20 text-cyan-300 border border-cyan-500/30 hover:border-cyan-400/60 hover:bg-cyan-950/60 font-semibold transition-all shadow-sm cursor-pointer"
          >
            <Library className="w-4 h-4 text-cyan-400 shrink-0" />
            <div className="text-left flex-1">
              <div>Library Manager</div>
              <div className="text-[10px] text-cyan-400/70 font-normal">
                Steam, Epic, GOG & Emulators
              </div>
            </div>
          </button>

          {/* Refresh Menu Item with Hover Flyout */}
          <div
            className="relative"
            onMouseEnter={handleMouseEnterRefresh}
            onMouseLeave={handleMouseLeaveRefresh}
          >
            <button
              onClick={() => setIsRefreshExpanded((prev) => !prev)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all font-medium cursor-pointer ${
                isFlyoutVisible
                  ? "bg-white/10 text-white shadow-sm border border-white/15"
                  : "text-slate-300 hover:text-white hover:bg-[#151926]"
              }`}
            >
              <div className="flex items-center space-x-3">
                {isScanning || isSyncingMetadata ? (
                  <Loader2 className="w-4 h-4 text-cyan-400 animate-spin shrink-0" />
                ) : (
                  <RefreshCw className="w-4 h-4 text-slate-400 group-hover:text-cyan-400 shrink-0 transition-colors" />
                )}
                <div className="text-left">
                  <span>Refresh</span>
                  {(isScanning || isSyncingMetadata) && (
                    <span className="text-[10px] text-cyan-400 block leading-none">
                      Syncing...
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight
                className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-200 ${
                  isFlyoutVisible ? "rotate-90 sm:rotate-0 sm:translate-x-0.5 text-white" : ""
                }`}
              />
            </button>

            {/* Submenu Flyout (positioned to the right on desktop, or stacked) */}
            {isFlyoutVisible && (
              <div className="absolute left-full top-0 ml-2 w-72 bg-[#0c0e18]/95 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-2xl p-2.5 z-50 flex flex-col space-y-1 text-slate-200 animate-in fade-in slide-in-from-left-2 duration-150">
                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                  <span>Refresh Options</span>
                  {(isScanning || isSyncingMetadata) && (
                    <Loader2 className="w-3 h-3 text-cyan-400 animate-spin" />
                  )}
                </div>

                {/* 1. Refresh all metadata */}
                <button
                  onClick={() => {
                    onClose();
                    onRefreshAllMetadata();
                  }}
                  className="w-full text-left p-2.5 rounded-xl hover:bg-white/10 transition-colors group flex items-start space-x-2.5 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-bold text-xs text-slate-200 group-hover:text-white">
                      Refresh all metadata
                    </div>
                    <div className="text-[10px] text-slate-400 leading-tight mt-0.5">
                      Refreshes metadata for every installed game (missing description, cover etc.)
                    </div>
                  </div>
                </button>

                {/* 2. Refresh all libraries */}
                <button
                  onClick={() => {
                    onClose();
                    onRefreshAllLibraries();
                  }}
                  className="w-full text-left p-2.5 rounded-xl hover:bg-white/10 transition-colors group flex items-start space-x-2.5 cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-bold text-xs text-slate-200 group-hover:text-white">
                      Refresh all libraries
                    </div>
                    <div className="text-[10px] text-slate-400 leading-tight mt-0.5">
                      Scans for newly purchased or installed games across all platforms
                    </div>
                  </div>
                </button>

                <div className="h-px bg-white/10 my-1" />

                {/* 3. Refresh library > (Nested provider list) */}
                <div className="px-2.5 pt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                  <span>Refresh Library</span>
                  <Layers className="w-3 h-3 text-slate-500" />
                </div>

                <div className="space-y-0.5">
                  <button
                    onClick={() => {
                      onClose();
                      onRefreshLibrary("steam");
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-white/10 transition-colors flex items-center justify-between text-xs text-slate-300 hover:text-white cursor-pointer group"
                  >
                    <div className="flex items-center space-x-2">
                      <SteamIcon className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-colors" />
                      <span>Steam</span>
                    </div>
                    <span className="text-[10px] text-slate-500 group-hover:text-slate-400 font-mono">
                      Scan
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Settings Button */}
          <button
            onClick={() => {
              onClose();
              onOpenSettings();
            }}
            className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-[#151926] transition-all font-medium cursor-pointer"
          >
            <Settings className="w-4 h-4 text-slate-400 shrink-0" />
            <span>Settings</span>
          </button>
        </div>

        {/* Footer */}
        <div className="mt-auto p-4 border-t border-[#1e2333] text-[11px] text-slate-500 flex justify-between items-center">
          <span>OpenPlay v0.1.0</span>
          <span>Cross-Platform</span>
        </div>
      </aside>
    </>
  );
};
