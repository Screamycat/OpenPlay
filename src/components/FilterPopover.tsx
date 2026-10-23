import React, { useState, useRef, useEffect } from "react";
import { Star, X, Tag, Code, Library, Check, RotateCcw, Search } from "lucide-react";

export interface FilterItem {
  name: string;
  count: number;
}

interface FilterPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  // Favorites
  showFavoritesOnly: boolean;
  onToggleFavoritesOnly: () => void;
  favoritesCount: number;
  // Genres / Tags
  availableGenres: FilterItem[];
  selectedGenres: string[];
  onToggleGenre: (genre: string) => void;
  // Developers
  availableDevelopers: FilterItem[];
  selectedDevelopers: string[];
  onToggleDeveloper: (dev: string) => void;
  // Libraries / Sources
  availableSources: FilterItem[];
  selectedSources: string[];
  onToggleSource: (source: string) => void;
  // Reset
  onResetFilters: () => void;
  activeFilterCount: number;
}

type FilterTab = "tags" | "developers" | "libraries";

export const FilterPopover: React.FC<FilterPopoverProps> = ({
  isOpen,
  onClose,
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
}) => {
  const [activeTab, setActiveTab] = useState<FilterTab>("tags");
  const [filterSearch, setFilterSearch] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Filter items in current tab based on search
  const searchLower = filterSearch.toLowerCase().trim();

  const filteredGenres = availableGenres.filter((item) =>
    item.name.toLowerCase().includes(searchLower)
  );

  const filteredDevelopers = availableDevelopers.filter((item) =>
    item.name.toLowerCase().includes(searchLower)
  );

  const filteredSources = availableSources.filter((item) =>
    item.name.toLowerCase().includes(searchLower)
  );

  return (
    <div
      ref={popoverRef}
      onMouseDown={(e) => e.stopPropagation()}
      className="absolute top-full left-0 mt-2 w-[360px] sm:w-[420px] bg-[#0c0e18]/95 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col text-slate-200 select-none animate-in fade-in zoom-in-95 duration-150"
    >
      {/* Top Header */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-black/30">
        <div className="flex items-center space-x-2">
          <span className="font-bold text-xs uppercase tracking-wider text-white">
            Library Filters
          </span>
          {activeFilterCount > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono font-bold border border-cyan-500/30">
              {activeFilterCount} active
            </span>
          )}
        </div>

        <div className="flex items-center space-x-1.5">
          {activeFilterCount > 0 && (
            <button
              onClick={onResetFilters}
              title="Reset all filters"
              className="text-[11px] px-2 py-1 text-slate-400 hover:text-white hover:bg-white/10 rounded-md transition-colors flex items-center space-x-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded-md transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-3.5 space-y-3 max-h-[460px] overflow-y-auto">
        {/* Prominent Favorites Section (Distinctly Separated at the Top) */}
        <div
          onClick={onToggleFavoritesOnly}
          className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border transition-all cursor-pointer ${
            showFavoritesOnly
              ? "bg-amber-500/20 border-amber-500/40 text-amber-200 shadow-md shadow-amber-950/30"
              : "bg-white/5 hover:bg-white/10 border-white/10 text-slate-300"
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <div
              className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${
                showFavoritesOnly
                  ? "bg-amber-500 border-amber-400 text-black"
                  : "border-slate-500 bg-black/40"
              }`}
            >
              {showFavoritesOnly && <Check className="w-3 h-3 stroke-[3]" />}
            </div>
            <Star
              className={`w-4 h-4 ${
                showFavoritesOnly ? "fill-amber-400 text-amber-400" : "text-amber-400/60"
              }`}
            />
            <span className="text-xs font-bold tracking-wide">Favorites Only</span>
          </div>
          <span className="text-[11px] font-mono opacity-70">({favoritesCount})</span>
        </div>

        {/* Subtle Glass Divider */}
        <div className="h-px bg-white/10 my-1" />

        {/* Filter Categories Tab Switcher */}
        <div className="flex items-center bg-black/40 rounded-xl p-1 border border-white/10 text-xs">
          {/* Tags Tab */}
          <button
            onClick={() => setActiveTab("tags")}
            className={`flex-1 py-1.5 px-2 rounded-lg font-semibold transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
              activeTab === "tags"
                ? "bg-white/15 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Tags</span>
            {selectedGenres.length > 0 && (
              <span className="text-[10px] w-4 h-4 rounded-full bg-cyan-500/30 text-cyan-200 flex items-center justify-center font-mono">
                {selectedGenres.length}
              </span>
            )}
          </button>

          {/* Developers Tab */}
          <button
            onClick={() => setActiveTab("developers")}
            className={`flex-1 py-1.5 px-2 rounded-lg font-semibold transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
              activeTab === "developers"
                ? "bg-white/15 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>Developer</span>
            {selectedDevelopers.length > 0 && (
              <span className="text-[10px] w-4 h-4 rounded-full bg-cyan-500/30 text-cyan-200 flex items-center justify-center font-mono">
                {selectedDevelopers.length}
              </span>
            )}
          </button>

          {/* Libraries Tab */}
          <button
            onClick={() => setActiveTab("libraries")}
            className={`flex-1 py-1.5 px-2 rounded-lg font-semibold transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
              activeTab === "libraries"
                ? "bg-white/15 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Library className="w-3.5 h-3.5" />
            <span>Library</span>
            {selectedSources.length > 0 && (
              <span className="text-[10px] w-4 h-4 rounded-full bg-cyan-500/30 text-cyan-200 flex items-center justify-center font-mono">
                {selectedSources.length}
              </span>
            )}
          </button>
        </div>

        {/* Quick Search within Current Category */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            placeholder={`Search ${
              activeTab === "tags"
                ? "tags (e.g. Indie, RPG, Simulation)..."
                : activeTab === "developers"
                ? "developers..."
                : "libraries..."
            }`}
            className="w-full pl-8 pr-7 py-1.5 text-xs bg-black/40 text-slate-100 border border-white/10 rounded-lg focus:outline-none focus:border-white/30 placeholder-slate-500 transition-all font-sans"
          />
          {filterSearch && (
            <button
              onClick={() => setFilterSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Tab 1: Tags / Genres Grid */}
        {activeTab === "tags" && (
          <div className="space-y-1.5">
            {filteredGenres.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">
                No matching tags found
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1.5 max-h-[220px] overflow-y-auto pr-1">
                {filteredGenres.map(({ name, count }) => {
                  const isChecked = selectedGenres.includes(name);
                  return (
                    <div
                      key={name}
                      onClick={() => onToggleGenre(name)}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs transition-all cursor-pointer ${
                        isChecked
                          ? "bg-white/15 border-white/30 text-white font-bold shadow-xs"
                          : "bg-black/25 hover:bg-white/5 border-white/10 text-slate-300"
                      }`}
                    >
                      <div className="flex items-center space-x-2 min-w-0 pr-1">
                        <div
                          className={`w-3.5 h-3.5 rounded shrink-0 flex items-center justify-center border transition-all ${
                            isChecked
                              ? "bg-white border-white text-black"
                              : "border-slate-500 bg-black/40"
                          }`}
                        >
                          {isChecked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                        </div>
                        <span className="truncate">{name}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500 shrink-0">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Developers List */}
        {activeTab === "developers" && (
          <div className="space-y-1.5">
            {filteredDevelopers.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">
                No matching developers found
              </div>
            ) : (
              <div className="space-y-1 max-h-[220px] overflow-y-auto pr-1">
                {filteredDevelopers.map(({ name, count }) => {
                  const isChecked = selectedDevelopers.includes(name);
                  return (
                    <div
                      key={name}
                      onClick={() => onToggleDeveloper(name)}
                      className={`flex items-center justify-between px-3 py-1.5 rounded-lg border text-xs transition-all cursor-pointer ${
                        isChecked
                          ? "bg-white/15 border-white/30 text-white font-bold shadow-xs"
                          : "bg-black/25 hover:bg-white/5 border-white/10 text-slate-300"
                      }`}
                    >
                      <div className="flex items-center space-x-2 min-w-0 pr-2">
                        <div
                          className={`w-3.5 h-3.5 rounded shrink-0 flex items-center justify-center border transition-all ${
                            isChecked
                              ? "bg-white border-white text-black"
                              : "border-slate-500 bg-black/40"
                          }`}
                        >
                          {isChecked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                        </div>
                        <span className="truncate">{name}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500 shrink-0">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Libraries / Sources List */}
        {activeTab === "libraries" && (
          <div className="space-y-1.5">
            {filteredSources.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">
                No libraries found
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                {filteredSources.map(({ name, count }) => {
                  const isChecked = selectedSources.includes(name);
                  return (
                    <div
                      key={name}
                      onClick={() => onToggleSource(name)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs transition-all cursor-pointer ${
                        isChecked
                          ? "bg-white/15 border-white/30 text-white font-bold shadow-xs"
                          : "bg-black/25 hover:bg-white/5 border-white/10 text-slate-300"
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <div
                          className={`w-3.5 h-3.5 rounded shrink-0 flex items-center justify-center border transition-all ${
                            isChecked
                              ? "bg-white border-white text-black"
                              : "border-slate-500 bg-black/40"
                          }`}
                        >
                          {isChecked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                        </div>
                        <span className="font-semibold">{name}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500">
                        {count} games
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="px-4 py-2 border-t border-white/10 bg-black/40 flex items-center justify-between text-[11px] text-slate-400">
        <span>Click options to toggle filters</span>
        {activeFilterCount > 0 && (
          <span className="text-cyan-300 font-semibold">Filters active</span>
        )}
      </div>
    </div>
  );
};
