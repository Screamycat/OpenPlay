import React, { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, Copy, X } from "lucide-react";

export const WindowControls: React.FC<{ className?: string }> = ({ className = "" }) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  useEffect(() => {
    if (!isTauri) return;

    let isMounted = true;
    let unlisten: (() => void) | null = null;

    try {
      const appWindow = getCurrentWindow();
      appWindow
        .isMaximized()
        .then((max) => {
          if (isMounted) setIsMaximized(max);
        })
        .catch(() => {});

      appWindow
        .onResized(async () => {
          try {
            const max = await appWindow.isMaximized();
            if (isMounted) setIsMaximized(max);
          } catch (e) {}
        })
        .then((fn) => {
          unlisten = fn;
        })
        .catch(() => {});
    } catch (e) {
      console.warn("Failed to initialize window controls:", e);
    }

    return () => {
      isMounted = false;
      if (unlisten) unlisten();
    };
  }, [isTauri]);

  const handleMinimize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isTauri) return;
    try {
      await getCurrentWindow().minimize();
    } catch (err) {
      console.error("Minimize error:", err);
    }
  };

  const handleToggleMaximize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isTauri) return;
    try {
      const appWindow = getCurrentWindow();
      await appWindow.toggleMaximize();
      const max = await appWindow.isMaximized();
      setIsMaximized(max);
    } catch (err) {
      console.error("Toggle maximize error:", err);
    }
  };

  const handleClose = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isTauri) return;
    try {
      await getCurrentWindow().close();
    } catch (err) {
      console.error("Close error:", err);
    }
  };

  return (
    <div
      className={`flex items-center space-x-1 shrink-0 ${className}`}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Minimize Button */}
      <button
        onClick={handleMinimize}
        title="Minimize"
        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 active:bg-white/15 transition-all cursor-pointer"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>

      {/* Maximize / Restore Button */}
      <button
        onClick={handleToggleMaximize}
        title={isMaximized ? "Restore Window" : "Maximize Window"}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 active:bg-white/15 transition-all cursor-pointer"
      >
        {isMaximized ? (
          <Copy className="w-3 h-3 rotate-180" />
        ) : (
          <Square className="w-3 h-3" />
        )}
      </button>

      {/* Close Button */}
      <button
        onClick={handleClose}
        title="Close Application"
        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-rose-500/80 active:bg-rose-600 transition-all cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
