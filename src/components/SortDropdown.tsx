import React, { useState, useRef, useEffect } from "react";
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  Clock,
  Calendar,
  Star,
  Type,
  Layers,
  Library,
  CheckCircle2,
  SlidersHorizontal,
} from "lucide-react";
import { SortOption, SortDirection, GroupByOption } from "./TopNav";

interface SortDropdownProps {
  sortBy: SortOption;
  onSortByChange: (sort: SortOption) => void;
  sortDirection: SortDirection;
  onToggleSortDirection: () => void;
  onSetSortDirection: (dir: SortDirection) => void;
  groupBy: GroupByOption;
  onGroupByChange: (group: GroupByOption) => void;
}

const sortOptionsConfig: Array<{
  key: SortOption;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: "title", label: "Title (Name)", icon: Type },
  { key: "playtime", label: "Total Playtime", icon: Clock },
  { key: "last_played", label: "Last Played", icon: Calendar },
  { key: "release_date", label: "Release Date", icon: Calendar },
  { key: "rating", label: "Community Rating", icon: Star },
];

const groupOptionsConfig: Array<{
  key: GroupByOption;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: "none", label: "None (Flat Library)", icon: SlidersHorizontal },
  { key: "source", label: "By Library / Source", icon: Library },
  { key: "status", label: "By Installation Status", icon: CheckCircle2 },
  { key: "first_letter", label: "By Alphabetical Letter", icon: Type },
  { key: "completion_status", label: "By Completion Status", icon: Layers },
];

export const SortDropdown: React.FC<SortDropdownProps> = ({
  sortBy,
  onSortByChange,
  sortDirection,
  onSetSortDirection,
  groupBy,
  onGroupByChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent | PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };

    // Use capture phase so stopPropagation inside other headers or wrappers does not prevent closing
    document.addEventListener("pointerdown", handleClickOutside, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handleClickOutside, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const activeSortLabel =
    sortOptionsConfig.find((o) => o.key === sortBy)?.label.split(" ")[0] || "Sort";

  return (
    <div className="relative" ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex items-center space-x-2 px-2.5 py-1.5 rounded-lg border transition-all text-xs cursor-pointer select-none ${
          isOpen
            ? "bg-white/15 text-white border-white/20 shadow-sm"
            : "bg-black/40 hover:bg-white/10 text-zinc-300 hover:text-white border-white/10"
        }`}
      >
        <ArrowUpDown className="w-3.5 h-3.5 text-zinc-400" />
        <span className="font-medium text-xs">
          Sort: {activeSortLabel}
        </span>
        {groupBy !== "none" && (
          <span className="px-1.5 py-0.2 bg-white/10 text-zinc-300 rounded text-[10px] font-mono border border-white/10">
            Grouped
          </span>
        )}
        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-500 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-white" : ""
          }`}
        />
      </button>

      {/* Floating Glassmorphic Popover Menu */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-2 w-64 theme-panel-surface backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.85)] p-2.5 z-50 text-xs text-zinc-200 animate-in fade-in slide-in-from-top-2 duration-150 select-none space-y-3">
          {/* Section 1: Sort Criteria */}
          <div>
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Sort By
            </div>
            <div className="space-y-0.5">
              {sortOptionsConfig.map((opt) => {
                const Icon = opt.icon;
                const isSelected = sortBy === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => onSortByChange(opt.key)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-left transition-colors cursor-pointer group ${
                      isSelected
                        ? "bg-white/10 text-white font-semibold"
                        : "text-zinc-300 hover:text-white hover:bg-white/[0.06]"
                    }`}
                  >
                    <div className="flex items-center space-x-2.5">
                      <Icon className="w-3.5 h-3.5 text-zinc-400 group-hover:text-white transition-colors" />
                      <span>{opt.label}</span>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Sort Direction */}
          <div className="pt-2 border-t border-white/10">
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Direction
            </div>
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-black/40 border border-white/10 rounded-xl">
              <button
                type="button"
                onClick={() => onSetSortDirection("asc")}
                className={`py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  sortDirection === "asc"
                    ? "bg-white/15 text-white font-bold shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Ascending (A-Z)
              </button>
              <button
                type="button"
                onClick={() => onSetSortDirection("desc")}
                className={`py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  sortDirection === "desc"
                    ? "bg-white/15 text-white font-bold shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Descending (Z-A)
              </button>
            </div>
          </div>

          {/* Section 3: Grouping Support */}
          <div className="pt-2 border-t border-white/10">
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500 flex items-center justify-between">
              <span>Group Library</span>
              <Layers className="w-3 h-3 text-zinc-500" />
            </div>
            <div className="space-y-0.5">
              {groupOptionsConfig.map((grp) => {
                const Icon = grp.icon;
                const isSelected = groupBy === grp.key;
                return (
                  <button
                    key={grp.key}
                    type="button"
                    onClick={() => onGroupByChange(grp.key)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-left transition-colors cursor-pointer group ${
                      isSelected
                        ? "bg-white/10 text-white font-semibold"
                        : "text-zinc-300 hover:text-white hover:bg-white/[0.06]"
                    }`}
                  >
                    <div className="flex items-center space-x-2.5">
                      <Icon className="w-3.5 h-3.5 text-zinc-400 group-hover:text-white transition-colors" />
                      <span>{grp.label}</span>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
