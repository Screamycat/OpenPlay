import React from "react";
import {
  X,
  Library,
  Plus,
  Settings,
  Gamepad2,
  Columns2,
  LayoutGrid,
  List,
} from "lucide-react";
import { ViewMode } from "./TopNav";

interface LeftDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenLibraryManager: () => void;
  onOpenAddGame: () => void;
  onOpenSettings: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  gameCount: number;
}

export const LeftDrawer: React.FC<LeftDrawerProps> = ({
  isOpen,
  onClose,
  onOpenLibraryManager,
  onOpenAddGame,
  onOpenSettings,
  viewMode,
  onViewModeChange,
  gameCount,
}) => {
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
        className={`fixed top-0 left-0 bottom-0 w-72 bg-[#0c0e15] border-r border-[#1e2333] z-50 flex flex-col shadow-2xl transition-transform duration-250 ease-out ${
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
            <span className="text-[10px] px-1.5 py-0.2 bg-cyan-500/20 text-cyan-300 font-bold rounded-full">
              {gameCount}
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-[#1a1f2e] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Items */}
        <div className="p-3 space-y-1 text-xs">
          {/* Library Button */}
          <button
            onClick={() => {
              onClose();
              onOpenLibraryManager();
            }}
            className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl bg-gradient-to-r from-cyan-950/40 to-blue-950/20 text-cyan-300 border border-cyan-500/30 hover:border-cyan-400/60 hover:bg-cyan-950/60 font-semibold transition-all shadow-sm"
          >
            <Library className="w-4 h-4 text-cyan-400 shrink-0" />
            <div className="text-left flex-1">
              <div>Library Manager</div>
              <div className="text-[10px] text-cyan-400/70 font-normal">
                Steam, Epic, GOG & Emulators
              </div>
            </div>
          </button>

          {/* Add Game Button */}
          <button
            onClick={() => {
              onClose();
              onOpenAddGame();
            }}
            className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-[#151926] transition-all font-medium"
          >
            <Plus className="w-4 h-4 text-slate-400 shrink-0" />
            <span>Add Manual Game</span>
          </button>

          {/* Settings Button */}
          <button
            onClick={() => {
              onClose();
              onOpenSettings();
            }}
            className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-[#151926] transition-all font-medium"
          >
            <Settings className="w-4 h-4 text-slate-400 shrink-0" />
            <span>Settings</span>
          </button>
        </div>

        {/* Divider */}
        <div className="px-4 py-2">
          <div className="border-t border-[#1a1f2e]" />
        </div>

        {/* View Switchers in Drawer */}
        <div className="px-4 py-2">
          <div className="text-[10px] uppercase font-bold text-slate-500 mb-2 tracking-wider">
            View Modes
          </div>
          <div className="space-y-1 text-xs">
            <button
              onClick={() => {
                onViewModeChange("split");
                onClose();
              }}
              className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg transition-all ${
                viewMode === "split"
                  ? "bg-[#1c2235] text-cyan-300 font-semibold"
                  : "text-slate-400 hover:text-slate-200 hover:bg-[#131622]"
              }`}
            >
              <Columns2 className="w-3.5 h-3.5" />
              <span>Details View (Split)</span>
            </button>

            <button
              onClick={() => {
                onViewModeChange("grid");
                onClose();
              }}
              className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg transition-all ${
                viewMode === "grid"
                  ? "bg-[#1c2235] text-cyan-300 font-semibold"
                  : "text-slate-400 hover:text-slate-200 hover:bg-[#131622]"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Full Grid View</span>
            </button>

            <button
              onClick={() => {
                onViewModeChange("list");
                onClose();
              }}
              className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg transition-all ${
                viewMode === "list"
                  ? "bg-[#1c2235] text-cyan-300 font-semibold"
                  : "text-slate-400 hover:text-slate-200 hover:bg-[#131622]"
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>List View</span>
            </button>
          </div>
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
