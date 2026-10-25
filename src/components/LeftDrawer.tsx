import React, { useState, useRef } from "react";
import {
  X,
  Library,
  Settings,
  RefreshCw,
  Sparkles,
  ChevronRight,
  Layers,
  Loader2,
  HardDrive,
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
  gameCount?: number;
  onRefreshAll: () => void;
  onRefreshAllLibraries: () => void;
  onRefreshAllMetadata: () => void;
  onRefreshInstalledMetadata: () => void;
  onRefreshLibrary: (provider: string) => void;
  isSyncingMetadata?: boolean;
  isScanning?: boolean;
  isFullRefreshing?: boolean;
}

export const LeftDrawer: React.FC<LeftDrawerProps> = ({
  isOpen,
  onClose,
  onOpenLibraryManager,
  onOpenSettings,
  onRefreshAll,
  onRefreshAllLibraries,
  onRefreshAllMetadata,
  onRefreshInstalledMetadata,
  onRefreshLibrary,
  isSyncingMetadata = false,
  isScanning = false,
  isFullRefreshing = false,
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
        className={`fixed inset-0 z-40 bg-black/45 backdrop-blur-sm transition-opacity duration-200 ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Sliding Drawer Container: Smoked Neutral Dark Glass */}
      <aside
        className={`fixed top-0 left-0 bottom-0 w-64 theme-panel-surface backdrop-blur-2xl border-r border-white/10 z-50 flex flex-col shadow-[0_20px_60px_rgba(0,0,0,0.85)] transition-transform duration-250 ease-out select-none ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="h-14 px-4 border-b border-white/10 flex items-center justify-between bg-white/[0.03] backdrop-blur-sm shrink-0">
          <div className="flex items-center space-x-2.5">
            <img
              src="/OpenPlayIcon.svg"
              alt="OpenPlay"
              className="w-5 h-5 invert filter drop-shadow-[0_0_8px_rgba(168,85,247,0.4)]"
            />
            <span className="font-extrabold text-sm text-white tracking-wide">
              OpenPlay
            </span>
          </div>

          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/15 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer border border-white/5"
          >
            <X className="w-4 h-4 text-zinc-400" />
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
            className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-zinc-200 hover:text-white border border-white/10 font-semibold transition-all shadow-sm cursor-pointer group"
          >
            <Library className="w-4 h-4 text-zinc-400 group-hover:text-white shrink-0 transition-colors" />
            <div className="text-left flex-1 min-w-0">
              <div className="text-zinc-100">Library Manager</div>
              <div className="text-[10px] text-zinc-500 font-normal truncate">
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
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all font-medium cursor-pointer group ${
                isFlyoutVisible
                  ? "bg-white/10 text-white shadow-sm border border-white/15"
                  : "text-zinc-300 hover:text-white hover:bg-white/[0.05]"
              }`}
            >
              <div className="flex items-center space-x-3">
                {isScanning || isSyncingMetadata ? (
                  <Loader2 className="w-4 h-4 text-white animate-spin shrink-0" />
                ) : (
                  <RefreshCw className="w-4 h-4 text-zinc-400 group-hover:text-white shrink-0 transition-colors" />
                )}
                <div className="text-left">
                  <span>Refresh</span>
                  {(isScanning || isSyncingMetadata) && (
                    <span className="text-[10px] text-zinc-400 block leading-none">
                      Syncing...
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight
                className={`w-3.5 h-3.5 text-zinc-500 transition-transform duration-200 ${
                  isFlyoutVisible ? "rotate-90 sm:rotate-0 sm:translate-x-0.5 text-white" : "group-hover:text-zinc-300"
                }`}
              />
            </button>

            {/* Submenu Flyout (Neutral Smoked Dark Glass) */}
            {isFlyoutVisible && (
              <div className="absolute left-full top-0 ml-2 w-72 theme-panel-surface backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_16px_48px_rgba(0,0,0,0.8)] p-2.5 z-50 flex flex-col space-y-1 text-zinc-200 animate-in fade-in slide-in-from-left-2 duration-150">
                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500 flex items-center justify-between">
                  <span>Refresh Options</span>
                  {(isScanning || isSyncingMetadata || isFullRefreshing) && (
                    <Loader2 className="w-3 h-3 text-white animate-spin" />
                  )}
                </div>

                {/* 1. Refresh All (Libraries + Metadata) */}
                <button
                  onClick={() => {
                    onClose();
                    onRefreshAll();
                  }}
                  className="w-full text-left p-2.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 hover:border-purple-500/50 transition-all group flex items-start space-x-2.5 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-purple-400 group-hover:text-purple-300 mt-0.5 shrink-0 transition-colors" />
                  <div>
                    <div className="font-semibold text-xs text-purple-200 group-hover:text-white flex items-center space-x-1.5">
                      <span>Refresh All</span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/30 text-purple-200 font-mono font-bold">ALL</span>
                    </div>
                    <div className="text-[10px] text-zinc-400 leading-tight mt-0.5">
                      Refreshes all libraries and updates missing metadata across your collection
                    </div>
                  </div>
                </button>

                {/* 2. Refresh All libraries */}
                <button
                  onClick={() => {
                    onClose();
                    onRefreshAllLibraries();
                  }}
                  className="w-full text-left p-2.5 rounded-xl hover:bg-white/10 transition-colors group flex items-start space-x-2.5 cursor-pointer border border-transparent hover:border-white/10"
                >
                  <RefreshCw className="w-4 h-4 text-zinc-400 group-hover:text-white mt-0.5 shrink-0 transition-colors" />
                  <div>
                    <div className="font-semibold text-xs text-zinc-200 group-hover:text-white">
                      Refresh All libraries
                    </div>
                    <div className="text-[10px] text-zinc-400 leading-tight mt-0.5">
                      Fetches games from all connected libraries (Steam, Epic)
                    </div>
                  </div>
                </button>

                {/* 3. Refresh All Metadata */}
                <button
                  onClick={() => {
                    onClose();
                    onRefreshAllMetadata();
                  }}
                  className="w-full text-left p-2.5 rounded-xl hover:bg-white/10 transition-colors group flex items-start space-x-2.5 cursor-pointer border border-transparent hover:border-white/10"
                >
                  <Layers className="w-4 h-4 text-zinc-400 group-hover:text-white mt-0.5 shrink-0 transition-colors" />
                  <div>
                    <div className="font-semibold text-xs text-zinc-200 group-hover:text-white">
                      Refresh All Metadata
                    </div>
                    <div className="text-[10px] text-zinc-400 leading-tight mt-0.5">
                      Fetches metadata for all games in library (only replaces empty fields from native stores)
                    </div>
                  </div>
                </button>

                {/* 4. Refresh Installed Metadata */}
                <button
                  onClick={() => {
                    onClose();
                    onRefreshInstalledMetadata();
                  }}
                  className="w-full text-left p-2.5 rounded-xl hover:bg-white/10 transition-colors group flex items-start space-x-2.5 cursor-pointer border border-transparent hover:border-white/10"
                >
                  <HardDrive className="w-4 h-4 text-zinc-400 group-hover:text-white mt-0.5 shrink-0 transition-colors" />
                  <div>
                    <div className="font-semibold text-xs text-zinc-200 group-hover:text-white">
                      Refresh Installed Metadata
                    </div>
                    <div className="text-[10px] text-zinc-400 leading-tight mt-0.5">
                      Fetches metadata for installed games in library (only replaces empty fields from native stores)
                    </div>
                  </div>
                </button>

                <div className="h-px bg-white/10 my-1" />

                {/* 3. Refresh individual library */}
                <div className="px-2.5 pt-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500 flex items-center justify-between">
                  <span>Refresh Specific Library</span>
                  <Layers className="w-3 h-3 text-zinc-500" />
                </div>

                <div className="space-y-0.5">
                  <button
                    onClick={() => {
                      onClose();
                      onRefreshLibrary("steam");
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-white/10 transition-colors flex items-center justify-between text-xs text-zinc-300 hover:text-white cursor-pointer group border border-transparent hover:border-white/10"
                  >
                    <div className="flex items-center space-x-2.5">
                      <SteamIcon className="w-4 h-4 text-zinc-400 group-hover:text-white transition-colors" />
                      <span className="font-medium">Steam</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 group-hover:text-zinc-300 font-mono">
                      Scan
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      onClose();
                      onRefreshLibrary("epic");
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-white/10 transition-colors flex items-center justify-between text-xs text-zinc-300 hover:text-white cursor-pointer group border border-transparent hover:border-white/10"
                  >
                    <div className="flex items-center space-x-2.5">
                      <span className="w-4 h-4 rounded bg-purple-900/60 text-purple-300 font-mono text-[9px] flex items-center justify-center font-bold border border-purple-500/30">
                        E
                      </span>
                      <span className="font-medium">Epic Games</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 group-hover:text-zinc-300 font-mono">
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
            className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-zinc-300 hover:text-white hover:bg-white/[0.05] transition-all font-medium cursor-pointer group"
          >
            <Settings className="w-4 h-4 text-zinc-400 group-hover:text-white shrink-0 transition-colors" />
            <span>Settings</span>
          </button>
        </div>

        {/* Footer */}
        <div className="mt-auto p-4 border-t border-white/10 bg-white/[0.02] backdrop-blur-sm text-[11px] text-zinc-500 flex justify-between items-center">
          <span>OpenPlay v0.1.0</span>
          <span>Cross-Platform</span>
        </div>
      </aside>
    </>
  );
};
