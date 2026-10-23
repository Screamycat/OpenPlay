import React, { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WindowControls } from "./WindowControls";
import { FilterPopover, FilterItem } from "./FilterPopover";
import {
  Gamepad2,
  Search,
  LayoutGrid,
  Columns2,
  List,
  Settings,
  X,
  ArrowUpDown,
  ChevronDown,
} from "lucide-react";

export type ViewMode = "split" | "grid" | "list";
export type SortOption = "title" | "playtime" | "last_played" | "release_date" | "rating";
export type SortDirection = "asc" | "desc";
export type StatusFilter = "all" | "installed" | "uninstalled";

interface TopNavProps {
  onToggleDrawer: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (s: StatusFilter) => void;
  // Advanced filters
  showFavoritesOnly: boolean;
  onToggleFavoritesOnly: () => void;
  favoritesCount: number;
  availableGenres: FilterItem[];
  selectedGenres: string[];
  onToggleGenre: (genre: string) => void;
  availableDevelopers: FilterItem[];
  selectedDevelopers: string[];
  onToggleDeveloper: (dev: string) => void;
  availableSources: FilterItem[];
  selectedSources: string[];
  onToggleSource: (source: string) => void;
  onResetFilters: () => void;
  activeFilterCount: number;
  // Sorting & App controls
  sortBy: SortOption;
  onSortByChange: (s: SortOption) => void;
  sortDirection: SortDirection;
  onToggleSortDirection: () => void;
  onOpenSettings: () => void;
  totalCount: number;
  installedCount: number;
  uninstalledCount: number;
}

export const TopNav: React.FC<TopNavProps> = ({
  onToggleDrawer,
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  statusFilter,
  onStatusFilterChange,
  showFavoritesOnly,
  onToggleFavoritesOnly,
  favoritesCount,
  availableGenres,
  selectedGenres,
  onToggleGenre,
  availableDevelopers,
  selectedDevelopers,
  onToggleDeveloper,
  availableSources,
  selectedSources,
  onToggleSource,
  onResetFilters,
  activeFilterCount,
  sortBy,
  onSortByChange,
  sortDirection,
  onToggleSortDirection,
  onOpenSettings,
  totalCount,
  installedCount,
  uninstalledCount,
}) => {
  const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false);
  const handleStartDrag = async (e: React.MouseEvent) => {
    // Only primary left-click
    if (e.button === 0) {
      if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
        try {
          await getCurrentWindow().startDragging();
        } catch (err) {
          console.warn("Window drag error:", err);
        }
      }
    }
  };

  const handleHeaderDoubleClick = async (e: React.MouseEvent) => {
    if (e.button === 0) {
      if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
        try {
          await getCurrentWindow().toggleMaximize();
        } catch (err) {}
      }
    }
  };

  return (
    <header
      data-tauri-drag-region
      onMouseDown={handleStartDrag}
      onDoubleClick={handleHeaderDoubleClick}
      className="h-14 bg-black/25 backdrop-blur-xl border-b border-white/10 px-4 flex items-center justify-between select-none z-30 gap-3 shadow-lg"
    >
      {/* Top Left: OpenPlay Menu, Filters, Sort, Search */}
      <div
        className="flex items-center space-x-3 shrink-0"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          onClick={onToggleDrawer}
          title="Open Menu & Library Manager"
          className="flex items-center space-x-2 px-2.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-slate-200 hover:text-white transition-all group shadow-sm cursor-pointer"
        >
          <Gamepad2 className="w-4 h-4 text-slate-300 group-hover:scale-105 transition-transform" />
          <span className="font-bold text-xs tracking-wider uppercase text-white hidden sm:inline">
            OpenPlay
          </span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/10 text-slate-300 font-mono">
            {totalCount}
          </span>
        </button>

        {/* 1. Filters (All / Installed / Uninstalled / Down Arrow dropdown) */}
        <div className="relative">
          <div className="flex items-center bg-black/40 rounded-lg p-0.5 border border-white/10 text-xs">
            <button
              onClick={() => onStatusFilterChange("all")}
              className={`px-2.5 py-1 rounded-md transition-all font-medium text-xs cursor-pointer ${
                statusFilter === "all"
                  ? "bg-white/15 text-white shadow-sm font-bold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              All <span className="opacity-70 text-[10px]">({totalCount})</span>
            </button>

            <button
              onClick={() => onStatusFilterChange("installed")}
              className={`px-2.5 py-1 rounded-md transition-all font-medium text-xs cursor-pointer ${
                statusFilter === "installed"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm font-bold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Installed <span className="opacity-70 text-[10px]">({installedCount})</span>
            </button>

            <button
              onClick={() => onStatusFilterChange("uninstalled")}
              className={`px-2.5 py-1 rounded-md transition-all font-medium text-xs cursor-pointer ${
                statusFilter === "uninstalled"
                  ? "bg-white/15 text-white shadow-sm font-bold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Uninstalled <span className="opacity-70 text-[10px]">({uninstalledCount})</span>
            </button>

            {/* Down Arrow: Advanced Filter Dropdown Access */}
            <button
              onClick={() => setIsFilterPopoverOpen((prev) => !prev)}
              title="Advanced Filters (Favorites, Tags, Developers, Libraries)"
              className={`px-2 py-1 rounded-md transition-all flex items-center space-x-1 cursor-pointer ${
                activeFilterCount > 0 || isFilterPopoverOpen
                  ? "bg-white/20 text-white shadow-sm font-bold border border-white/25"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  isFilterPopoverOpen ? "rotate-180 text-white" : ""
                }`}
              />
              {activeFilterCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-cyan-500/30 text-cyan-200 font-mono font-bold leading-tight">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Filter Popover Panel */}
          <FilterPopover
            isOpen={isFilterPopoverOpen}
            onClose={() => setIsFilterPopoverOpen(false)}
            showFavoritesOnly={showFavoritesOnly}
            onToggleFavoritesOnly={onToggleFavoritesOnly}
            favoritesCount={favoritesCount}
            availableGenres={availableGenres}
            selectedGenres={selectedGenres}
            onToggleGenre={onToggleGenre}
            availableDevelopers={availableDevelopers}
            selectedDevelopers={selectedDevelopers}
            onToggleDeveloper={onToggleDeveloper}
            availableSources={availableSources}
            selectedSources={selectedSources}
            onToggleSource={onToggleSource}
            onResetFilters={onResetFilters}
            activeFilterCount={activeFilterCount}
          />
        </div>

        {/* 2. Sort Select */}
        <div className="flex items-center space-x-1 bg-black/40 px-2 py-1 rounded-lg border border-white/10 text-xs text-slate-300">
          <span className="text-[10px] text-slate-500 uppercase font-bold">Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => onSortByChange(e.target.value as SortOption)}
            className="bg-transparent text-slate-200 text-xs focus:outline-none cursor-pointer"
          >
            <option value="playtime" className="bg-[#12141f]">Playtime</option>
            <option value="title" className="bg-[#12141f]">Title</option>
            <option value="last_played" className="bg-[#12141f]">Last Played</option>
            <option value="release_date" className="bg-[#12141f]">Release Date</option>
            <option value="rating" className="bg-[#12141f]">Rating</option>
          </select>
          <button
            onClick={onToggleSortDirection}
            title={sortDirection === "asc" ? "Sort Ascending" : "Sort Descending"}
            className="p-1 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 3. Search Input Box */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search..."
            className="w-40 md:w-52 pl-8 pr-8 py-1.5 text-xs bg-black/40 text-slate-100 border border-white/10 rounded-full focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 placeholder-slate-500 transition-all font-sans"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Draggable Center Window Area */}
      <div
        data-tauri-drag-region
        onMouseDown={handleStartDrag}
        onDoubleClick={handleHeaderDoubleClick}
        className="flex-1 h-full min-w-8 cursor-default"
      />

      {/* Right: View Mode Toggle, Settings & Windows Controls */}
      <div
        className="flex items-center space-x-2 shrink-0"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* View Mode Switcher */}
        <div className="flex items-center bg-black/40 rounded-lg p-0.5 border border-white/10">
          <button
            onClick={() => onViewModeChange("split")}
            title="Split Grid & Details View"
            className={`p-1.5 rounded-md transition-all cursor-pointer ${
              viewMode === "split"
                ? "bg-white/15 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Columns2 className="w-4 h-4" />
          </button>

          <button
            onClick={() => onViewModeChange("grid")}
            title="Full Grid View"
            className={`p-1.5 rounded-md transition-all cursor-pointer ${
              viewMode === "grid"
                ? "bg-white/15 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>

          <button
            onClick={() => onViewModeChange("list")}
            title="List View"
            className={`p-1.5 rounded-md transition-all cursor-pointer ${
              viewMode === "list"
                ? "bg-white/15 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>

        {/* Settings Button */}
        <button
          onClick={onOpenSettings}
          title="Settings"
          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition-colors cursor-pointer"
        >
          <Settings className="w-4 h-4" />
        </button>

        {/* Subtle Glass Divider */}
        <div className="h-5 w-px bg-white/15 mx-1" />

        {/* Windows Caption Controls */}
        <WindowControls />
      </div>
    </header>
  );
};
