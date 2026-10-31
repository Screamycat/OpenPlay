import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ConfiguredConsole } from "../../types/emulator";
import { Game } from "../../types/game";
import { AddConsoleWizardModal } from "./AddConsoleWizardModal";
import {
  Gamepad2,
  FolderOpen,
  Plus,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  ExternalLink,
} from "lucide-react";

interface EmulationTabProps {
  onGameAdded?: (game: Game) => void;
  onRefreshGames?: () => void;
}

export const EmulationTab: React.FC<EmulationTabProps> = ({
  onGameAdded: _onGameAdded,
  onRefreshGames,
}) => {
  const [consoles, setConsoles] = useState<ConfiguredConsole[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [scanningConsoleId, setScanningConsoleId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Load configured consoles and library games
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [fetchedConsoles, fetchedGames] = await Promise.all([
        invoke<ConfiguredConsole[]>("get_configured_consoles").catch(() => []),
        invoke<Game[]>("get_games").catch(() => []),
      ]);
      setConsoles(fetchedConsoles || []);
      setGames(fetchedGames || []);
    } catch (err) {
      console.warn("Failed to load emulation consoles:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Rescan a specific console's folder
  const handleRescanConsole = async (conf: ConfiguredConsole) => {
    setScanningConsoleId(conf.id);
    setStatusMsg(null);

    try {
      const addedCount = await invoke<number>("scan_and_import_console_roms", {
        consoleId: conf.id,
      });

      await loadData();
      onRefreshGames?.();

      setStatusMsg({
        type: "success",
        text: `Rescan complete for '${conf.name}'. ${addedCount} new title(s) added!`,
      });
    } catch (err: any) {
      console.error("Rescan failed:", err);
      setStatusMsg({
        type: "error",
        text: typeof err === "string" ? err : err.message || "Failed to rescan console folder",
      });
    } finally {
      setScanningConsoleId(null);
    }
  };

  // Delete a configured console
  const handleDeleteConsole = async (conf: ConfiguredConsole) => {
    const confirmDelete = window.confirm(
      `Are you sure you want to remove '${conf.name}' from configured consoles?\n(Your ROM files will remain untouched on your hard drive).`
    );
    if (!confirmDelete) return;

    try {
      await invoke("delete_configured_console", { id: conf.id });
      await loadData();
      setStatusMsg({
        type: "success",
        text: `Successfully removed '${conf.name}'.`,
      });
    } catch (err: any) {
      alert(`Failed to delete console: ${err.message || err}`);
    }
  };

  // Open console folder in explorer
  const handleOpenFolder = (dir: string) => {
    invoke("open_in_explorer", { path: dir }).catch((err) => {
      console.warn("Failed to open directory:", err);
    });
  };

  return (
    <div className="space-y-6 text-xs text-zinc-300">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center space-x-2">
            <Gamepad2 className="w-5 h-5 theme-accent-text" />
            <span>Emulators & Consoles</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage your retro gaming consoles, mapped emulators, and local ROM collections.
          </p>
        </div>

        <button
          onClick={() => setIsWizardOpen(true)}
          className="px-4 py-2.5 theme-accent-btn font-bold rounded-xl text-xs flex items-center space-x-2 transition-all shadow-md active:scale-95 cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Console</span>
        </button>
      </div>

      {/* Status Messages */}
      {statusMsg && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between animate-in fade-in duration-150 ${
            statusMsg.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : "bg-rose-500/10 border-rose-500/30 text-rose-400"
          }`}
        >
          <div className="flex items-center space-x-2">
            {statusMsg.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span className="font-medium text-xs">{statusMsg.text}</span>
          </div>
          <button
            onClick={() => setStatusMsg(null)}
            className="text-xs opacity-60 hover:opacity-100 transition-opacity ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Loading State */}
      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-2 text-zinc-400">
          <Loader2 className="w-8 h-8 animate-spin theme-accent-text" />
          <span>Loading configured consoles...</span>
        </div>
      ) : consoles.length === 0 ? (
        /* Empty State */
        <div className="p-12 border border-dashed border-white/10 rounded-3xl text-center space-y-4 bg-white/[0.01]">
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-zinc-500 shadow-inner">
            <Gamepad2 className="w-8 h-8" />
          </div>
          <div className="space-y-1.5 max-w-md mx-auto">
            <h4 className="text-base font-bold text-white">No Retro Consoles Configured</h4>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Add your first console (like Super Nintendo, PlayStation 2, or GameCube) with our guided setup wizard to seamlessly launch your ROM collection.
            </p>
          </div>
          <button
            onClick={() => setIsWizardOpen(true)}
            className="px-5 py-2.5 theme-accent-btn font-bold rounded-xl text-xs inline-flex items-center space-x-2 transition-all shadow-md active:scale-95 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Add Your First Console</span>
          </button>
        </div>
      ) : (
        /* Configured Consoles Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {consoles.map((conf) => {
            const romCount = games.filter(
              (g) =>
                g.emulator_id === conf.id ||
                (g.platforms &&
                  g.platforms.some(
                    (p) => p.trim().toLowerCase() === conf.name.trim().toLowerCase()
                  ))
            ).length;
            const isScanning = scanningConsoleId === conf.id;

            return (
              <div
                key={conf.id}
                className="bg-[#121522] border border-white/10 rounded-2xl p-5 space-y-4 relative hover:border-white/20 transition-all shadow-md flex flex-col justify-between"
              >
                <div className="space-y-3">
                  {/* Console Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center theme-accent-text shadow-sm">
                        <Gamepad2 className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white leading-tight">
                          {conf.name}
                        </h4>
                        <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
                          {conf.manufacturer}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteConsole(conf)}
                      title="Remove console profile"
                      className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Console Details */}
                  <div className="space-y-1.5 pt-1 text-xs">
                    <div className="flex items-center justify-between text-zinc-400">
                      <span className="text-zinc-500 font-medium">Emulator:</span>
                      <span className="font-semibold text-zinc-200">
                        {conf.emulator_name}
                        {conf.core_name ? ` (${conf.core_name})` : ""}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-zinc-400">
                      <span className="text-zinc-500 font-medium">Titles in Library:</span>
                      <span className="font-mono font-bold text-white bg-white/5 px-2 py-0.5 rounded-md">
                        {romCount}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-zinc-400 pt-1">
                      <span className="text-zinc-500 font-medium">ROMs Directory:</span>
                      <div
                        onClick={() => handleOpenFolder(conf.rom_directory)}
                        title={conf.rom_directory}
                        className="flex items-center space-x-1 font-mono text-[11px] text-zinc-300 hover:text-white cursor-pointer truncate max-w-[200px]"
                      >
                        <FolderOpen className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
                        <span className="truncate">{conf.rom_directory}</span>
                        <ExternalLink className="w-3 h-3 shrink-0 text-zinc-500" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Rescan Action */}
                <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[10px] text-zinc-500">
                    Extensions: {conf.extensions.slice(0, 4).join(", ")}
                    {conf.extensions.length > 4 ? "..." : ""}
                  </span>

                  <button
                    onClick={() => handleRescanConsole(conf)}
                    disabled={isScanning}
                    className="px-3.5 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? "animate-spin" : ""}`} />
                    <span>{isScanning ? "Scanning..." : "Rescan Folder"}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Console Wizard Modal */}
      <AddConsoleWizardModal
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onConsoleAdded={(newConsole, count) => {
          loadData();
          onRefreshGames?.();
          setStatusMsg({
            type: "success",
            text: `Successfully added '${newConsole.name}' and imported ${count} retro game(s)!`,
          });
        }}
      />
    </div>
  );
};
