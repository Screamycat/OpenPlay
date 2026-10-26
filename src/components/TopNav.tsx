import React, { useState, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WindowControls } from "./WindowControls";
import { FilterPopover, FilterItem } from "./FilterPopover";
import { SortDropdown } from "./SortDropdown";
import { UpdateCheckResult } from "../types/update";
import {
  Search,
  LayoutGrid,
  Columns2,
  List,
  Settings,
  X,
  ChevronDown,
  Trophy,
  Eye,
  EyeOff,
  Star,
} from "lucide-react";

export type ViewMode = "split" | "grid" | "list";
export type SortOption = "title" | "playtime" | "last_played" | "release_date" | "rating";
export type SortDirection = "asc" | "desc";
export type StatusFilter = "all" | "installed" | "uninstalled";
export type GroupByOption =
  | "none"
  | "source"
  | "status"
  | "first_letter"
  | "completion_status";

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
  showHiddenGames?: boolean;
  onToggleShowHidden?: () => void;
  showHiddenOnly?: boolean;
  onToggleHiddenOnly?: () => void;
  hiddenGamesCount?: number;
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
  groupBy: GroupByOption;
  onGroupByChange: (g: GroupByOption) => void;
  onOpenSettings: (tab?: string) => void;
  availableUpdate?: UpdateCheckResult | null;
  onOpenAchievementHub?: () => void;
  hunterLevel?: number;
  hunterScore?: number;
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
  showHiddenGames = false,
  onToggleShowHidden,
  showHiddenOnly = false,
  onToggleHiddenOnly,
  hiddenGamesCount = 0,
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
  groupBy,
  onGroupByChange,
  onOpenSettings,
  availableUpdate,
  onOpenAchievementHub,
  hunterLevel,
  hunterScore,
  totalCount,
  installedCount,
  uninstalledCount,
}) => {
  const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false);
  const filterContainerRef = useRef<HTMLDivElement>(null);
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
          <img
            src="/OpenPlayIcon.svg"
            alt="OpenPlay"
            className="w-4 h-4 invert group-hover:scale-110 transition-transform filter drop-shadow-[0_0_6px_rgba(168,85,247,0.4)]"
          />
          <span className="font-bold text-xs tracking-wider uppercase text-white hidden sm:inline">
            OpenPlay
          </span>
        </button>

        {/* 1. Filters (All / Installed / Uninstalled / Down Arrow dropdown) */}
        <div ref={filterContainerRef} className="relative">
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
                  ? "bg-white/15 text-white shadow-sm font-bold"
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

            {/* Down Arrow: Advanced Filter Dropdown Access with subtle active indicator */}
            <button
              onClick={() => setIsFilterPopoverOpen((prev) => !prev)}
              title={
                activeFilterCount > 0
                  ? `${activeFilterCount} active filter(s)`
                  : "Advanced Filters (Favorites, Tags, Developers, Libraries)"
              }
              className={`relative px-2 py-1.5 rounded-md transition-all flex items-center justify-center cursor-pointer ${
                isFilterPopoverOpen
                  ? "bg-white/20 text-white shadow-sm font-bold border border-white/25"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  isFilterPopoverOpen ? "rotate-180 text-white" : ""
                }`}
              />
              {/* Small white circle in the down arrow's top right corner indicating active filters */}
              {activeFilterCount > 0 && (
                <span
                  className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_5px_rgba(255,255,255,0.9)] ring-1 ring-black/80"
                  title={`${activeFilterCount} filter(s) active`}
                />
              )}
            </button>

            {/* Active Favorites Indicator Pill */}
            {showFavoritesOnly && (
              <button
                onClick={onToggleFavoritesOnly}
                title="Currently showing only favorites. Click to view all games."
                className="ml-1 px-2 py-0.5 rounded-md border font-bold text-[10px] tracking-wider uppercase flex items-center space-x-1 cursor-pointer transition-all shadow-sm bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-amber-500/30"
              >
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                <span>Favorites ({favoritesCount})</span>
                <X className="w-2.5 h-2.5 ml-0.5 opacity-70 hover:opacity-100" />
              </button>
            )}

            {/* Active Hidden Games Indicator Pill */}
            {showHiddenOnly ? (
              <button
                onClick={onToggleHiddenOnly}
                title="Currently showing only hidden games. Click to view all games."
                className="ml-1 px-2 py-0.5 rounded-md border font-bold text-[10px] tracking-wider uppercase flex items-center space-x-1 cursor-pointer transition-all shadow-sm"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--app-accent-color, #a855f7) 22%, transparent)",
                  borderColor: "color-mix(in srgb, var(--app-accent-color, #a855f7) 45%, transparent)",
                  color: "var(--app-accent-color, #a855f7)",
                }}
              >
                <EyeOff className="w-3 h-3" />
                <span>Hidden Only ({hiddenGamesCount})</span>
                <X className="w-2.5 h-2.5 ml-0.5 opacity-70 hover:opacity-100" />
              </button>
            ) : showHiddenGames ? (
              <button
                onClick={onToggleShowHidden}
                title="Currently viewing hidden games. Click to hide them again."
                className="ml-1 px-2 py-0.5 rounded-md border font-bold text-[10px] tracking-wider uppercase flex items-center space-x-1 cursor-pointer transition-all"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--app-accent-color, #a855f7) 20%, transparent)",
                  borderColor: "color-mix(in srgb, var(--app-accent-color, #a855f7) 40%, transparent)",
                  color: "var(--app-accent-color, #a855f7)",
                }}
              >
                <Eye className="w-3 h-3" />
                <span>Hidden ({hiddenGamesCount})</span>
              </button>
            ) : null}
          </div>

          {/* Filter Popover Panel */}
          <FilterPopover
            isOpen={isFilterPopoverOpen}
            onClose={() => setIsFilterPopoverOpen(false)}
            containerRef={filterContainerRef}
            showFavoritesOnly={showFavoritesOnly}
            onToggleFavoritesOnly={onToggleFavoritesOnly}
            favoritesCount={favoritesCount}
            showHiddenGames={showHiddenGames}
            onToggleShowHidden={onToggleShowHidden}
            showHiddenOnly={showHiddenOnly}
            onToggleHiddenOnly={onToggleHiddenOnly}
            hiddenGamesCount={hiddenGamesCount}
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

        {/* 2. Sort & Group Dropdown */}
        <SortDropdown
          sortBy={sortBy}
          onSortByChange={onSortByChange}
          sortDirection={sortDirection}
          onToggleSortDirection={onToggleSortDirection}
          onSetSortDirection={(dir) => {
            if (dir !== sortDirection) onToggleSortDirection();
          }}
          groupBy={groupBy}
          onGroupByChange={onGroupByChange}
        />

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
        className="flex-1 h-full min-w-8 cursor-default"
      />

      {/* Right: View Mode Toggle, Settings & Windows Controls */}
      <div
        className="flex items-center space-x-2 shrink-0"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Subtle Update Available Pill */}
        {availableUpdate?.is_update_available && (
          <button
            onClick={() => onOpenSettings("about")}
            title={`OpenPlay v${availableUpdate.latest_version} available. Click to view changelog and update.`}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold cursor-pointer transition-all shadow-xs hover:scale-102 active:scale-98 animate-in fade-in"
            style={{
              backgroundColor: "color-mix(in srgb, var(--app-accent-color, #a855f7) 18%, transparent)",
              borderColor: "color-mix(in srgb, var(--app-accent-color, #a855f7) 45%, transparent)",
              color: "white",
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="text-[11px] font-bold tracking-tight">Update v{availableUpdate.latest_version}</span>
          </button>
        )}

        {/* Achievement Hunter Button */}
        {onOpenAchievementHub && (
          <button
            onClick={onOpenAchievementHub}
            title="Open Achievement Hub"
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-amber-400/10 hover:bg-amber-400/20 text-amber-300 border border-amber-400/30 transition-all cursor-pointer text-xs font-bold shadow-xs group"
          >
            <Trophy className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform" />
            <span>Lv {hunterLevel || 1}</span>
            <span className="text-[10px] text-amber-200/70 font-mono font-normal">
              • {hunterScore ? hunterScore.toLocaleString() : 0} pts
            </span>
          </button>
        )}

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
          onClick={() => onOpenSettings()}
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
