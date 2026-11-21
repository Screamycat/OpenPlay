import React, { useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Game } from "../../types/game";
import { resolveImageSrc } from "../../utils/image";
import {
  FileCode,
  FolderOpen,
  Plus,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Layers,
  Sparkles,
  HardDrive,
  AppWindow,
  Search,
} from "lucide-react";

interface LocalGamesTabProps {
  onGameAdded?: (game: Game) => void;
  onBatchAdded?: (games: Game[]) => void;
}

export const LocalGamesTab: React.FC<LocalGamesTabProps> = ({
  onGameAdded,
  onBatchAdded,
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Single candidate review
  const [singleCandidate, setSingleCandidate] = useState<Game | null>(null);

  // Multi / Folder candidates review
  const [folderCandidates, setFolderCandidates] = useState<Game[]>([]);
  const [selectedFolderIds, setSelectedFolderIds] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");

  const filteredFolderCandidates = useMemo(() => {
    if (!searchQuery.trim()) return folderCandidates;
    const q = searchQuery.toLowerCase();
    return folderCandidates.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.executable_path && c.executable_path.toLowerCase().includes(q))
    );
  }, [folderCandidates, searchQuery]);

  // 1. Select Single Executable
  const handleSelectSingleExe = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const path = await invoke<string | null>("select_file", {
        filter: "Game Executable (*.exe;*.lnk;*.bat;*.cmd)|*.exe;*.lnk;*.bat;*.cmd|All files (*.*)|*.*",
      });
      if (!path) return;

      setIsScanning(true);
      const candidate = await invoke<Game>("scan_local_executable", { path });
      setSingleCandidate(candidate);
      setFolderCandidates([]);
    } catch (err: any) {
      setErrorMsg(typeof err === "string" ? err : err.message || "Failed to scan executable");
    } finally {
      setIsScanning(false);
    }
  };

  // 2. Select Game Directory
  const handleSelectFolder = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const path = await invoke<string | null>("select_directory");
      if (!path) return;

      setIsScanning(true);
      const candidates = await invoke<Game[]>("scan_local_folder", { path });
      setFolderCandidates(candidates);
      setSingleCandidate(null);

      // Pre-select all found candidates by default
      const initSelected: Record<string, boolean> = {};
      candidates.forEach((c) => {
        initSelected[c.id] = true;
      });
      setSelectedFolderIds(initSelected);
    } catch (err: any) {
      setErrorMsg(typeof err === "string" ? err : err.message || "Failed to scan directory");
    } finally {
      setIsScanning(false);
    }
  };

  // 3. Batch Select Multiple Executables
  const handleBatchSelectFiles = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const files = await invoke<string[]>("select_multiple_files", {
        filter: "Game Executables (*.exe;*.lnk;*.bat)|*.exe;*.lnk;*.bat|All files (*.*)|*.*",
      });
      if (!files || files.length === 0) return;

      setIsScanning(true);
      const candidates: Game[] = [];
      for (const f of files) {
        try {
          const g = await invoke<Game>("scan_local_executable", { path: f });
          candidates.push(g);
        } catch {}
      }

      setFolderCandidates(candidates);
      setSingleCandidate(null);

      const initSelected: Record<string, boolean> = {};
      candidates.forEach((c) => {
        initSelected[c.id] = true;
      });
      setSelectedFolderIds(initSelected);
    } catch (err: any) {
      setErrorMsg(typeof err === "string" ? err : err.message || "Failed to select files");
    } finally {
      setIsScanning(false);
    }
  };

  // 4. Scan Installed Desktop Apps (Linux & system launchers)
  const handleScanInstalledApps = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      setIsScanning(true);
      const candidates = await invoke<Game[]>("scan_installed_linux_apps");
      if (!candidates || candidates.length === 0) {
        setErrorMsg("No installed desktop applications or launchers were detected.");
        return;
      }
      setFolderCandidates(candidates);
      setSingleCandidate(null);

      // Pre-select known gaming launchers / tools or select all if few
      const initSelected: Record<string, boolean> = {};
      candidates.forEach((c) => {
        const titleLower = c.title.toLowerCase();
        if (
          titleLower.includes("prism") ||
          titleLower.includes("minecraft") ||
          titleLower.includes("steam") ||
          titleLower.includes("heroic") ||
          titleLower.includes("lutris") ||
          titleLower.includes("bottle") ||
          candidates.length <= 6
        ) {
          initSelected[c.id] = true;
        }
      });
      setSelectedFolderIds(initSelected);
    } catch (err: any) {
      setErrorMsg(
        typeof err === "string" ? err : err.message || "Failed to scan installed applications"
      );
    } finally {
      setIsScanning(false);
    }
  };

  // Save single candidate to OpenPlay
  const handleSaveSingle = async () => {
    if (!singleCandidate) return;
    try {
      const saved = await invoke<Game>("save_game", { game: singleCandidate });
      const effectiveGame = saved && saved.id ? saved : singleCandidate;
      setSuccessMsg(`Added "${effectiveGame.title}" to your library!`);
      if (onGameAdded) {
        onGameAdded(effectiveGame);
      }
      setSingleCandidate(null);
    } catch (err: any) {
      setErrorMsg(typeof err === "string" ? err : err.message || "Failed to save game");
    }
  };

  // Save multiple folder/batch candidates
  const handleSaveBatch = async () => {
    const toSave = folderCandidates.filter((c) => selectedFolderIds[c.id]);
    if (toSave.length === 0) return;

    try {
      await invoke("add_local_games", { games: toSave });
      setSuccessMsg(`Successfully added ${toSave.length} game(s) to OpenPlay!`);
      if (onBatchAdded) {
        onBatchAdded(toSave);
      }
      setFolderCandidates([]);
    } catch (err: any) {
      setErrorMsg(typeof err === "string" ? err : err.message || "Failed to add games");
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200 text-zinc-200">
      {/* Title & Introduction */}
      <div>
        <h3 className="text-lg font-bold text-white flex items-center space-x-2">
          <span className="p-1.5 rounded-xl theme-accent-subtle-bg theme-accent-text border theme-accent-subtle-border">
            <HardDrive className="w-4 h-4" />
          </span>
          <span>Local Games & Executables</span>
        </h3>
        <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
          Import standalone PC games, DRM-free titles, custom shortcuts, or entire game directories into OpenPlay. Titles and launch parameters are detected automatically.
        </p>
      </div>

      {/* Action Options Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Card 1: Executable File */}
        <button
          type="button"
          disabled={isScanning}
          onClick={handleSelectSingleExe}
          className="p-4 rounded-xl bg-[#12141f] border border-white/10 hover:border-[var(--app-accent-color)] hover:bg-white/[0.04] text-left transition-all cursor-pointer group flex flex-col justify-between space-y-3"
        >
          <div className="p-2 rounded-lg bg-white/5 border border-white/10 theme-accent-text group-hover:scale-105 transition-transform w-fit">
            <FileCode className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-bold text-white block group-hover:theme-accent-text transition-colors">
              Select Executable
            </span>
            <span className="text-[10px] text-zinc-400 leading-tight block mt-0.5">
              Pick a binary, script (.sh), AppImage, or .exe file.
            </span>
          </div>
        </button>

        {/* Card 2: Installed System Apps */}
        <button
          type="button"
          disabled={isScanning}
          onClick={handleScanInstalledApps}
          className="p-4 rounded-xl bg-[#12141f] border border-white/10 hover:border-emerald-500/40 hover:bg-emerald-500/10 text-left transition-all cursor-pointer group flex flex-col justify-between space-y-3"
        >
          <div className="p-2 rounded-lg bg-white/5 border border-white/10 text-emerald-400 group-hover:scale-105 transition-transform w-fit">
            <AppWindow className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-bold text-white block group-hover:text-emerald-300 transition-colors">
              Installed System Apps
            </span>
            <span className="text-[10px] text-zinc-400 leading-tight block mt-0.5">
              Scans Linux desktop launchers like Prism Launcher, Steam, Heroic, and Emulators.
            </span>
          </div>
        </button>

        {/* Card 3: Folder Scanner */}
        <button
          type="button"
          disabled={isScanning}
          onClick={handleSelectFolder}
          className="p-4 rounded-xl bg-[#12141f] border border-white/10 hover:border-[var(--app-accent-color)] hover:bg-white/[0.04] text-left transition-all cursor-pointer group flex flex-col justify-between space-y-3"
        >
          <div className="p-2 rounded-lg bg-white/5 border border-white/10 theme-accent-text group-hover:scale-105 transition-transform w-fit">
            <FolderOpen className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-bold text-white block group-hover:theme-accent-text transition-colors">
              Scan Game Folder
            </span>
            <span className="text-[10px] text-zinc-400 leading-tight block mt-0.5">
              Scans an install directory for game executables, filtering out crashpads and redistributables.
            </span>
          </div>
        </button>

        {/* Card 4: Batch Executables */}
        <button
          type="button"
          disabled={isScanning}
          onClick={handleBatchSelectFiles}
          className="p-4 rounded-xl bg-[#12141f] border border-white/10 hover:border-amber-500/40 hover:bg-amber-500/10 text-left transition-all cursor-pointer group flex flex-col justify-between space-y-3"
        >
          <div className="p-2 rounded-lg bg-white/5 border border-white/10 text-amber-400 group-hover:scale-105 transition-transform w-fit">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-bold text-white block group-hover:text-amber-300 transition-colors">
              Batch Select Files
            </span>
            <span className="text-[10px] text-zinc-400 leading-tight block mt-0.5">
              Select multiple executable files simultaneously to add a collection in one go.
            </span>
          </div>
        </button>
      </div>

      {/* Loading Indicator */}
      {isScanning && (
        <div className="p-3 theme-accent-subtle-bg border theme-accent-subtle-border rounded-xl text-xs theme-accent-text flex items-center space-x-2">
          <Loader2 className="w-4 h-4 animate-spin theme-accent-text" />
          <span>Scanning executable and folder contents...</span>
        </div>
      )}

      {/* Error Message */}
      {errorMsg && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/25 rounded-xl text-xs text-rose-300 flex items-start space-x-2.5">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div>{errorMsg}</div>
        </div>
      )}

      {/* Success Message */}
      {successMsg && (
        <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-xs text-emerald-200 flex items-start space-x-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div>{successMsg}</div>
        </div>
      )}

      {/* Single Candidate Review Form */}
      {singleCandidate && (
        <div className="bg-[#12141f] border border-white/10 rounded-xl p-4 space-y-3.5 animate-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-1.5">
              <Sparkles className="w-3.5 h-3.5 theme-accent-text" />
              <span>Review Scanned Game</span>
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">1 Game Detected</span>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                Detected Game Title
              </label>
              <input
                type="text"
                value={singleCandidate.title}
                onChange={(e) =>
                  setSingleCandidate({ ...singleCandidate, title: e.target.value })
                }
                className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-white font-semibold focus:outline-none theme-accent-focus text-xs"
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                Executable Path
              </label>
              <input
                type="text"
                readOnly
                value={singleCandidate.executable_path || ""}
                className="w-full px-3 py-2 bg-black/25 border border-white/5 rounded-xl text-zinc-400 font-mono text-[11px] truncate focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                Working / Installation Directory
              </label>
              <input
                type="text"
                readOnly
                value={singleCandidate.install_directory || ""}
                className="w-full px-3 py-2 bg-black/25 border border-white/5 rounded-xl text-zinc-400 font-mono text-[11px] truncate focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-white/5">
            <button
              type="button"
              onClick={() => setSingleCandidate(null)}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white rounded-xl text-xs font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveSingle}
              className="px-5 py-2 theme-accent-btn font-bold rounded-xl text-xs flex items-center space-x-1.5 cursor-pointer transition-all shadow-md active:scale-98"
            >
              <Plus className="w-4 h-4 text-white" />
              <span>Add to Library</span>
            </button>
          </div>
        </div>
      )}

      {/* Multiple / Folder Candidates Review List */}
      {folderCandidates.length > 0 && (
        <div className="bg-[#12141f] border border-white/10 rounded-xl p-4 space-y-3.5 animate-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-1.5">
              <Layers className="w-3.5 h-3.5 theme-accent-text" />
              <span>Detected Applications & Games ({folderCandidates.length})</span>
            </span>
            <div className="flex items-center space-x-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  const next: Record<string, boolean> = {};
                  folderCandidates.forEach((c) => (next[c.id] = true));
                  setSelectedFolderIds(next);
                }}
                className="text-[10px] text-zinc-400 hover:text-white underline cursor-pointer"
              >
                Select All
              </button>
              <span className="text-zinc-600">•</span>
              <button
                type="button"
                onClick={() => setSelectedFolderIds({})}
                className="text-[10px] text-zinc-400 hover:text-white underline cursor-pointer"
              >
                Deselect All
              </button>
            </div>
          </div>

          {folderCandidates.length > 4 && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter detected applications (e.g. Prism, Minecraft)..."
                className="w-full pl-8 pr-3 py-1.5 bg-black/30 border border-white/10 rounded-lg text-white text-xs placeholder:text-zinc-500 focus:outline-none theme-accent-focus"
              />
            </div>
          )}

          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {filteredFolderCandidates.map((candidate) => (
              <label
                key={candidate.id}
                className={`p-2.5 rounded-lg border transition-all flex items-center justify-between cursor-pointer ${
                  selectedFolderIds[candidate.id]
                    ? "theme-accent-subtle-bg theme-accent-subtle-border text-white"
                    : "bg-white/[0.02] border-white/5 text-zinc-400 opacity-60"
                }`}
              >
                <div className="flex items-center space-x-3 min-w-0 pr-3">
                  <input
                    type="checkbox"
                    checked={!!selectedFolderIds[candidate.id]}
                    onChange={(e) =>
                      setSelectedFolderIds({
                        ...selectedFolderIds,
                        [candidate.id]: e.target.checked,
                      })
                    }
                    className="w-4 h-4 rounded bg-white/10 border-white/20 cursor-pointer accent-[var(--app-accent-color)]"
                  />
                  {candidate.icon_image ? (
                    <img
                      src={resolveImageSrc(candidate.icon_image)}
                      alt=""
                      className="w-8 h-8 rounded-lg object-contain bg-black/40 border border-white/10 shrink-0 p-0.5"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                      <FileCode className="w-4 h-4 text-zinc-400" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <span className="text-xs font-semibold block truncate">
                      {candidate.title}
                    </span>
                    <span className="text-[10px] text-zinc-500 block truncate font-mono">
                      {candidate.executable_path}
                    </span>
                  </div>
                </div>

                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-mono shrink-0 ${
                    candidate.source === "Local" || candidate.platforms?.includes("PC (Linux)")
                      ? "bg-emerald-500/10 border border-emerald-500/25 text-emerald-400"
                      : "bg-white/5 border border-white/10 text-zinc-400"
                  }`}
                >
                  {candidate.source === "Local" ? "System App" : "Executable"}
                </span>
              </label>
            ))}
            {filteredFolderCandidates.length === 0 && (
              <div className="text-center py-6 text-zinc-500 text-xs font-mono">
                No applications match "{searchQuery}"
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-white/5">
            <span className="text-[11px] text-zinc-400 font-mono">
              {Object.values(selectedFolderIds).filter(Boolean).length} of {folderCandidates.length} selected
            </span>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setFolderCandidates([])}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white rounded-xl text-xs font-medium cursor-pointer"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleSaveBatch}
                className="px-5 py-2 theme-accent-btn font-bold rounded-xl text-xs flex items-center space-x-1.5 cursor-pointer transition-all shadow-md active:scale-98"
              >
                <Plus className="w-4 h-4" />
                <span>Import Selected Games</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
