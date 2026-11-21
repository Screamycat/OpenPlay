import React, { useState } from "react";
import { Game } from "../types/game";
import { CloudSaveSnapshot } from "../types/saves";
import { formatFileSize } from "../utils/image";
import { Cloud, Download, Play, FolderOpen, X, Laptop, Loader2 } from "lucide-react";

interface NewerCloudSaveModalProps {
  game: Game | null;
  snapshot: CloudSaveSnapshot | null;
  isOpen: boolean;
  onClose: () => void;
  onLoadAndPlay: () => Promise<void>;
  onOpenSaveManager: () => void;
  onLaunchAnyway: () => void;
}

export const NewerCloudSaveModal: React.FC<NewerCloudSaveModalProps> = ({
  game,
  snapshot,
  isOpen,
  onClose,
  onLoadAndPlay,
  onOpenSaveManager,
  onLaunchAnyway,
}) => {
  const [isLoadingSave, setIsLoadingSave] = useState(false);

  if (!isOpen || !game || !snapshot) return null;

  const formattedTime = (() => {
    try {
      return new Date(snapshot.created_at).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return snapshot.created_at;
    }
  })();

  const handleLoadAndPlay = async () => {
    setIsLoadingSave(true);
    try {
      await onLoadAndPlay();
    } finally {
      setIsLoadingSave(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 theme-modal-backdrop flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
    >
      <div
        data-gamepad-zone="modal"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md theme-modal-container rounded-2xl p-5 shadow-2xl space-y-4 text-xs text-zinc-200"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
              <Cloud className="w-5 h-5 theme-accent-text" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Newer Cloud Save Available</h3>
              <p className="text-[11px] text-zinc-400 truncate max-w-[280px]">{game.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            data-gamepad-close="true"
            className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/15 text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-3 rounded-xl bg-black/35 border border-white/10 flex items-center gap-3">
          <Laptop className="w-4 h-4 text-zinc-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-xs font-semibold text-white truncate">
              {snapshot.device_name} · {snapshot.os}
            </div>
            <div className="text-[10px] text-zinc-400 font-mono mt-0.5">
              {formattedTime} · {snapshot.file_count} file{snapshot.file_count === 1 ? "" : "s"} ·{" "}
              {formatFileSize(snapshot.size_bytes)}
            </div>
          </div>
        </div>

        <p className="text-[11px] text-zinc-400 leading-relaxed">
          Loading backs up your current local save first. Launching without loading keeps your current local files untouched.
        </p>

        <div className="flex flex-col gap-2 pt-1">
          <button
            type="button"
            disabled={isLoadingSave}
            onClick={handleLoadAndPlay}
            className="w-full py-2.5 px-4 rounded-xl text-white font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md disabled:opacity-50"
            style={{ backgroundColor: "var(--app-accent-color, #783efe)" }}
          >
            {isLoadingSave ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span>{isLoadingSave ? "Loading Save..." : "Load Cloud Save & Play"}</span>
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={isLoadingSave}
              onClick={onOpenSaveManager}
              className="py-2 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-zinc-200 hover:text-white font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Save Manager</span>
            </button>
            <button
              type="button"
              disabled={isLoadingSave}
              onClick={onLaunchAnyway}
              className="py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Launch Anyway</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
