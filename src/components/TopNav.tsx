import React from "react";
import {
  Gamepad2,
  Search,
  Star,
  CheckCircle2,
  LayoutGrid,
  Columns2,
  List,
  RefreshCw,
  Plus,
  Settings,
  X,
} from "lucide-react";

export type ViewMode = "split" | "grid" | "list";

interface TopNavProps {
  onToggleDrawer: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
  showFavoritesOnly: boolean;
  onToggleFavoritesOnly: () => void;
  showInstalledOnly: boolean;
  onToggleInstalledOnly: () => void;
  onScanLibrary: () => void;
  isScanning: boolean;
  onSyncAllMetadata: () => void;
  isSyncingMetadata: boolean;
  onOpenAddModal: () => void;
  onOpenSettings: () => void;
  gameCount: number;
}

export const TopNav: React.FC<TopNavProps> = ({
  onToggleDrawer,
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  showFavoritesOnly,
  onToggleFavoritesOnly,
  showInstalledOnly,
  onToggleInstalledOnly,
  onScanLibrary,
  isScanning,
  onSyncAllMetadata,
  isSyncingMetadata,
  onOpenAddModal,
  onOpenSettings,
  gameCount,
}) => {
  return (
    <header className="h-14 bg-[#0e1017] border-b border-[#1e2230] px-4 flex items-center justify-between select-none z-30">
      {/* Left: Branding & Quick Filters */}
      <div className="flex items-center space-x-2">
        <button
          onClick={onToggleDrawer}
          title="Open Menu & Library Manager"
          className="flex items-center space-x-2 mr-3 px-2.5 py-1.5 bg-gradient-to-r from-blue-600/20 to-cyan-500/10 border border-blue-500/30 hover:border-cyan-400/60 rounded-lg text-blue-400 hover:text-white transition-all group shadow-sm cursor-pointer"
        >
          <Gamepad2 className="w-5 h-5 text-cyan-400 group-hover:scale-105 transition-transform" />
          <span className="font-bold text-sm tracking-wide text-slate-100">
            OpenPlay
          </span>
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-500/20 text-cyan-300 font-semibold">
            {gameCount}
          </span>
        </button>

        {/* Quick Filter Buttons */}
        <div className="flex items-center bg-[#151824] rounded-lg p-0.5 border border-[#23283a]">
          <button
            onClick={onToggleFavoritesOnly}
            title="Filter Favorites"
            className={`p-1.5 rounded-md transition-colors ${
              showFavoritesOnly
                ? "bg-amber-500/20 text-amber-400 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-[#1f2436]"
            }`}
          >
            <Star className={`w-4 h-4 ${showFavoritesOnly ? "fill-amber-400" : ""}`} />
          </button>

          <button
            onClick={onToggleInstalledOnly}
            title="Filter Installed"
            className={`p-1.5 rounded-md transition-colors ${
              showInstalledOnly
                ? "bg-emerald-500/20 text-emerald-400 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-[#1f2436]"
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
          </button>
        </div>

        {/* Search Input Box */}
        <div className="relative ml-2">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search games..."
            className="w-56 lg:w-72 pl-9 pr-8 py-1.5 text-xs bg-[#151824] text-slate-200 border border-[#23283a] rounded-full focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30 placeholder-slate-500 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Center: View Mode Switcher */}
      <div className="flex items-center bg-[#151824] rounded-lg p-0.5 border border-[#23283a]">
        <button
          onClick={() => onViewModeChange("split")}
          title="Details View (Split)"
          className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center space-x-1 transition-all ${
            viewMode === "split"
              ? "bg-[#252b40] text-cyan-300 shadow-sm"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Columns2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Details</span>
        </button>

        <button
          onClick={() => onViewModeChange("grid")}
          title="Full Grid View"
          className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center space-x-1 transition-all ${
            viewMode === "grid"
              ? "bg-[#252b40] text-cyan-300 shadow-sm"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <LayoutGrid className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Grid</span>
        </button>

        <button
          onClick={() => onViewModeChange("list")}
          title="List View"
          className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center space-x-1 transition-all ${
            viewMode === "list"
              ? "bg-[#252b40] text-cyan-300 shadow-sm"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <List className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">List</span>
        </button>
      </div>

      {/* Right: Actions (Scan, Add Game, Settings) */}
      <div className="flex items-center space-x-2">
        <button
          onClick={onScanLibrary}
          disabled={isScanning || isSyncingMetadata}
          title="Scan Local Steam Library"
          className="flex items-center space-x-1.5 px-3 py-1.5 text-xs bg-[#161a26] hover:bg-[#202638] text-slate-200 border border-[#272e44] rounded-lg transition-all disabled:opacity-50"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 text-cyan-400 ${
              isScanning ? "animate-spin" : ""
            }`}
          />
          <span className="hidden md:inline font-medium">
            {isScanning ? "Scanning..." : "Scan Steam"}
          </span>
        </button>

        <button
          onClick={onSyncAllMetadata}
          disabled={isScanning || isSyncingMetadata}
          title="Download descriptions, tags & community scores from Steam for all games"
          className="flex items-center space-x-1.5 px-3 py-1.5 text-xs bg-[#161a26] hover:bg-[#202638] text-slate-200 border border-[#272e44] rounded-lg transition-all disabled:opacity-50"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 text-amber-400 ${
              isSyncingMetadata ? "animate-spin" : ""
            }`}
          />
          <span className="hidden md:inline font-medium">
            {isSyncingMetadata ? "Syncing..." : "Sync Metadata"}
          </span>
        </button>

        <button
          onClick={onOpenAddModal}
          title="Add Game Manually"
          className="flex items-center space-x-1.5 px-3 py-1.5 text-xs bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 rounded-lg transition-all font-medium"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Add Game</span>
        </button>

        <button
          onClick={onOpenSettings}
          title="Settings"
          className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-[#1e2334] rounded-lg transition-colors border border-transparent hover:border-[#2b3248]"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
