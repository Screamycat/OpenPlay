import React, { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  PlayniteBackupSummary,
  PlayniteImportResult,
  PlayniteImportOptions,
} from "../../types/playnite";
import {
  Archive,
  FolderOpen,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Image as ImageIcon,
  Sparkles,
  ArrowRight,
  Cloud,
  Clock,
  Star,
  Tag,
  Search,
  CheckSquare,
  Square,
} from "lucide-react";

interface PlayniteBackupTabProps {
  onImportComplete?: () => void;
}

export const PlayniteBackupTab: React.FC<PlayniteBackupTabProps> = ({ onImportComplete }) => {
  const [detectedBackups, setDetectedBackups] = useState<string[]>([]);
  const [selectedZip, setSelectedZip] = useState<string>("");
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [summary, setSummary] = useState<PlayniteBackupSummary | null>(null);

  // Granular Field Selection Toggles (like Metadata modal)
  const [extractArtwork, setExtractArtwork] = useState(true);
  const [importUninstalled, setImportUninstalled] = useState(true);
  const [importPlaytime, setImportPlaytime] = useState(true);
  const [importLastPlayed, setImportLastPlayed] = useState(true);
  const [importNotes, setImportNotes] = useState(true);
  const [importRatings, setImportRatings] = useState(true);
  const [importTags, setImportTags] = useState(true);

  // Individual Game Selection State
  const [selectedGameIds, setSelectedGameIds] = useState<Set<string>>(new Set());
  const [searchFilter, setSearchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "installed" | "uninstalled">("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  // Import Execution State
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    current: number;
    total: number;
    gamesFound: number;
    artworkExtracted: number;
  } | null>(null);
  const [importResult, setImportResult] = useState<PlayniteImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Auto-detect Playnite backups on mount
  useEffect(() => {
    const detect = async () => {
      try {
        const found = await invoke<string[]>("auto_detect_playnite_backups");
        setDetectedBackups(found);
        if (found.length > 0 && !selectedZip) {
          handleSelectZip(found[0]);
        }
      } catch (err) {
        console.warn("Could not auto-detect backups:", err);
      }
    };
    detect();
  }, []);

  // Listen to import progress events
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<any>("playnite-import-progress", (event) => {
      setImportProgress(event.payload);
    }).then((un) => {
      unlisten = un;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const handleSelectZip = async (path: string) => {
    setSelectedZip(path);
    setSummary(null);
    setErrorMsg(null);
    setImportResult(null);
    setImportProgress(null);
    setIsLoadingSummary(true);

    try {
      const sum = await invoke<PlayniteBackupSummary>("get_playnite_backup_summary", {
        zipPath: path,
      });
      setSummary(sum);
      // Pre-select all detected games by default
      if (sum.games && sum.games.length > 0) {
        setSelectedGameIds(new Set(sum.games.map((g) => g.id)));
      } else {
        setSelectedGameIds(new Set());
      }
    } catch (err: any) {
      setErrorMsg(typeof err === "string" ? err : err.message || "Failed to inspect backup file");
    } finally {
      setIsLoadingSummary(false);
    }
  };

  const handleBrowseZip = async () => {
    try {
      const chosen = await invoke<string | null>("select_file", {
        filter: "Playnite Backup (*.zip)|*.zip|All files (*.*)|*.*",
      });
      if (chosen) {
        handleSelectZip(chosen);
      }
    } catch (err: any) {
      setErrorMsg(typeof err === "string" ? err : err.message || "Failed to select file");
    }
  };

  const handleToggleGame = (id: string) => {
    setSelectedGameIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAllGames = () => {
    if (!summary?.games) return;
    setSelectedGameIds(new Set(summary.games.map((g) => g.id)));
  };

  const handleDeselectAllGames = () => {
    setSelectedGameIds(new Set());
  };

  const sourceCounts = useMemo(() => {
    if (!summary?.games) return {};
    const counts: Record<string, number> = {};
    for (const g of summary.games) {
      counts[g.source] = (counts[g.source] || 0) + 1;
    }
    return counts;
  }, [summary]);

  const allSources = useMemo(() => Object.keys(sourceCounts).sort(), [sourceCounts]);

  const handleToggleSourceGames = (sourceName: string) => {
    if (!summary?.games) return;
    const gamesForSource = summary.games.filter((g) => g.source === sourceName);
    const allChecked = gamesForSource.every((g) => selectedGameIds.has(g.id));
    setSelectedGameIds((prev) => {
      const next = new Set(prev);
      if (allChecked) {
        gamesForSource.forEach((g) => next.delete(g.id));
      } else {
        gamesForSource.forEach((g) => next.add(g.id));
      }
      return next;
    });
  };

  const filteredGames = useMemo(() => {
    if (!summary?.games) return [];
    return summary.games.filter((game) => {
      if (statusFilter === "installed" && !game.is_installed) return false;
      if (statusFilter === "uninstalled" && game.is_installed) return false;
      if (sourceFilter !== "all" && game.source !== sourceFilter) return false;
      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase();
        return (
          game.title.toLowerCase().includes(q) ||
          game.source.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [summary, statusFilter, sourceFilter, searchFilter]);

  const handleRunImport = async () => {
    if (!selectedZip) return;
    setIsImporting(true);
    setErrorMsg(null);
    setImportResult(null);

    try {
      const options: PlayniteImportOptions = {
        zip_path: selectedZip,
        extract_artwork: extractArtwork,
        import_uninstalled: importUninstalled,
        import_playtime: importPlaytime,
        import_last_played: importLastPlayed,
        import_notes: importNotes,
        import_ratings: importRatings,
        import_tags: importTags,
        selected_game_ids: Array.from(selectedGameIds),
      };

      const res = await invoke<PlayniteImportResult>("import_playnite_backup", {
        options,
      });
      setImportResult(res);
      if (onImportComplete) {
        onImportComplete();
      }
    } catch (err: any) {
      setErrorMsg(typeof err === "string" ? err : err.message || "Failed to import Playnite backup");
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  };

  const formatFilename = (fullPath: string) => {
    const parts = fullPath.split(/[/\\]/);
    return parts[parts.length - 1];
  };

  const formatPlaytime = (seconds: number) => {
    if (!seconds || seconds <= 0) return "Never played";
    const hrs = (seconds / 3600).toFixed(1);
    return `${hrs} hrs`;
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200 text-zinc-200">
      {/* Title & Introduction */}
      <div>
        <h3 className="text-base font-bold text-white flex items-center space-x-2">
          <span className="p-1.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <Archive className="w-4 h-4" />
          </span>
          <span>Playnite Backup Importer</span>
        </h3>
        <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
          Import games, playtime history, offline artwork, and custom tags from a Playnite backup archive (<code className="text-amber-300 font-mono text-[11px]">.zip</code>). You can customize exactly what fields and games to import below.
        </p>
      </div>

      {/* Auto-Detected Backups (if found) */}
      {detectedBackups.length > 0 && (
        <div className="bg-[#12141f] border border-white/10 rounded-xl p-3 space-y-2">
          <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider flex items-center justify-between">
            <span>Detected Playnite Backups</span>
            <span className="text-zinc-500 font-mono font-normal">Found {detectedBackups.length} archive(s)</span>
          </div>

          <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
            {detectedBackups.map((path) => (
              <button
                key={path}
                type="button"
                onClick={() => handleSelectZip(path)}
                className={`w-full text-left p-2 rounded-lg border transition-all flex items-center justify-between cursor-pointer ${
                  selectedZip === path
                    ? "bg-amber-500/15 border-amber-500/40 text-white shadow-sm"
                    : "bg-white/[0.02] border-white/5 text-zinc-400 hover:text-white hover:bg-white/[0.05]"
                }`}
              >
                <div className="flex items-center space-x-2.5 min-w-0 pr-3">
                  <Archive className={`w-3.5 h-3.5 shrink-0 ${selectedZip === path ? "text-amber-400" : "text-zinc-500"}`} />
                  <div className="min-w-0">
                    <span className="text-xs font-semibold block truncate">
                      {formatFilename(path)}
                    </span>
                    <span className="text-[10px] text-zinc-500 block truncate font-mono">
                      {path}
                    </span>
                  </div>
                </div>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 border ${
                  selectedZip === path
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/30 font-bold"
                    : "bg-white/5 text-zinc-500 border-white/10"
                }`}>
                  {selectedZip === path ? "Selected" : "Choose"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* File Selection Action Row */}
      <div className="bg-[#12141f] border border-white/10 rounded-xl p-3 space-y-2">
        <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
          Backup Archive Location
        </div>

        <div className="flex items-center space-x-2">
          <input
            type="text"
            readOnly
            value={selectedZip}
            placeholder="No backup archive selected (click browse or pick above)..."
            className="flex-1 px-3 py-1.5 bg-black/40 border border-white/10 rounded-xl text-xs text-zinc-300 font-mono truncate focus:outline-none"
          />
          <button
            type="button"
            onClick={handleBrowseZip}
            className="px-3.5 py-1.5 bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 cursor-pointer border border-white/10 transition-colors shrink-0"
          >
            <FolderOpen className="w-3.5 h-3.5 text-zinc-300" />
            <span>Browse .zip...</span>
          </button>
        </div>

        {isLoadingSummary && (
          <div className="flex items-center space-x-2 text-xs text-amber-300 py-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Inspecting Playnite database and artwork index...</span>
          </div>
        )}
      </div>

      {/* Error Message */}
      {errorMsg && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/25 rounded-xl text-xs text-rose-300 flex items-start space-x-2.5">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">{errorMsg}</div>
        </div>
      )}

      {/* Backup Inspection & Granular Configuration */}
      {summary && (
        <div className="bg-[#12141f] border border-white/10 rounded-xl p-4 space-y-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                Backup Metrics
              </span>
            </div>
            <span className="text-[11px] text-zinc-400 font-mono">
              Found {summary.total_games} games in archive
            </span>
          </div>

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="p-2 bg-black/30 rounded-lg border border-white/5">
              <span className="text-[10px] uppercase font-bold text-zinc-500 block">Total Games</span>
              <span className="text-sm font-bold text-white font-mono">{summary.total_games}</span>
            </div>

            <div className="p-2 bg-black/30 rounded-lg border border-white/5">
              <span className="text-[10px] uppercase font-bold text-emerald-400/80 block">Installed</span>
              <span className="text-sm font-bold text-emerald-300 font-mono">{summary.installed_games}</span>
            </div>

            <div className="p-2 bg-black/30 rounded-lg border border-white/5">
              <span className="text-[10px] uppercase font-bold text-zinc-500 block">Uninstalled</span>
              <span className="text-sm font-bold text-zinc-300 font-mono">{summary.uninstalled_games}</span>
            </div>

            <div className="p-2 bg-black/30 rounded-lg border border-white/5">
              <span className="text-[10px] uppercase font-bold text-purple-400/80 block">Artwork Files</span>
              <span className="text-sm font-bold text-purple-300 font-mono">{summary.total_artwork_files.toLocaleString()}</span>
            </div>
          </div>

          {/* 1. GRANULAR FIELD SELECTION CHECKLIST */}
          <div className="space-y-2 border-t border-white/5 pt-3">
            <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
              Choose Data Fields to Import
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {/* Artwork */}
              <label className="flex items-center justify-between p-2 rounded-lg bg-black/25 border border-white/5 cursor-pointer hover:bg-black/40 transition-colors">
                <div className="flex items-center space-x-2">
                  <ImageIcon className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                  <span className="text-zinc-200 font-medium">Extract Covers & Artwork</span>
                </div>
                <input
                  type="checkbox"
                  checked={extractArtwork}
                  onChange={(e) => setExtractArtwork(e.target.checked)}
                  className="w-4 h-4 rounded bg-white/10 border-white/20 text-amber-500 accent-amber-500 cursor-pointer"
                />
              </label>

              {/* Playtime */}
              <label className="flex items-center justify-between p-2 rounded-lg bg-black/25 border border-white/5 cursor-pointer hover:bg-black/40 transition-colors">
                <div className="flex items-center space-x-2">
                  <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="text-zinc-200 font-medium">Playtime & Play Counts</span>
                </div>
                <input
                  type="checkbox"
                  checked={importPlaytime}
                  onChange={(e) => setImportPlaytime(e.target.checked)}
                  className="w-4 h-4 rounded bg-white/10 border-white/20 text-amber-500 accent-amber-500 cursor-pointer"
                />
              </label>

              {/* Last Played */}
              <label className="flex items-center justify-between p-2 rounded-lg bg-black/25 border border-white/5 cursor-pointer hover:bg-black/40 transition-colors">
                <div className="flex items-center space-x-2">
                  <Clock className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span className="text-zinc-200 font-medium">Last Played Dates</span>
                </div>
                <input
                  type="checkbox"
                  checked={importLastPlayed}
                  onChange={(e) => setImportLastPlayed(e.target.checked)}
                  className="w-4 h-4 rounded bg-white/10 border-white/20 text-amber-500 accent-amber-500 cursor-pointer"
                />
              </label>

              {/* Notes & User Ratings */}
              <label className="flex items-center justify-between p-2 rounded-lg bg-black/25 border border-white/5 cursor-pointer hover:bg-black/40 transition-colors">
                <div className="flex items-center space-x-2">
                  <Star className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="text-zinc-200 font-medium">User Notes & Star Ratings</span>
                </div>
                <input
                  type="checkbox"
                  checked={importNotes && importRatings}
                  onChange={(e) => {
                    setImportNotes(e.target.checked);
                    setImportRatings(e.target.checked);
                  }}
                  className="w-4 h-4 rounded bg-white/10 border-white/20 text-amber-500 accent-amber-500 cursor-pointer"
                />
              </label>

              {/* Tags & Categories */}
              <label className="flex items-center justify-between p-2 rounded-lg bg-black/25 border border-white/5 cursor-pointer hover:bg-black/40 transition-colors">
                <div className="flex items-center space-x-2">
                  <Tag className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span className="text-zinc-200 font-medium">Tags, Genres & Features</span>
                </div>
                <input
                  type="checkbox"
                  checked={importTags}
                  onChange={(e) => setImportTags(e.target.checked)}
                  className="w-4 h-4 rounded bg-white/10 border-white/20 text-amber-500 accent-amber-500 cursor-pointer"
                />
              </label>

              {/* Uninstalled Catalog */}
              <label className="flex items-center justify-between p-2 rounded-lg bg-black/25 border border-white/5 cursor-pointer hover:bg-black/40 transition-colors">
                <div className="flex items-center space-x-2">
                  <Cloud className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span className="text-zinc-200 font-medium">Uninstalled / Cloud Catalog</span>
                </div>
                <input
                  type="checkbox"
                  checked={importUninstalled}
                  onChange={(e) => setImportUninstalled(e.target.checked)}
                  className="w-4 h-4 rounded bg-white/10 border-white/20 text-amber-500 accent-amber-500 cursor-pointer"
                />
              </label>
            </div>
          </div>

          {/* 2. GAME-BY-GAME SELECTION CHECKLIST */}
          {summary.games && summary.games.length > 0 && (
            <div className="space-y-2 border-t border-white/5 pt-3">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                  Select Games to Import ({selectedGameIds.size} of {summary.games.length} selected)
                </div>

                <div className="flex items-center space-x-2 text-xs">
                  <button
                    type="button"
                    onClick={handleSelectAllGames}
                    className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold cursor-pointer"
                  >
                    Select All
                  </button>
                  <span className="text-zinc-600">•</span>
                  <button
                    type="button"
                    onClick={handleDeselectAllGames}
                    className="text-[11px] text-zinc-400 hover:text-white font-semibold cursor-pointer"
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              {/* Integration / Source Bulk Filters */}
              {allSources.length > 0 && (
                <div className="space-y-1.5 bg-black/25 p-2 rounded-lg border border-white/5">
                  <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                    <span>Filter & Toggle by Integration</span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    <button
                      type="button"
                      onClick={() => setSourceFilter("all")}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all cursor-pointer ${
                        sourceFilter === "all"
                          ? "bg-amber-500/25 text-amber-300 border border-amber-500/40 font-bold"
                          : "bg-white/5 text-zinc-400 hover:text-white border border-white/5"
                      }`}
                    >
                      All Sources ({summary.games.length})
                    </button>

                    {allSources.map((sourceName) => {
                      const count = sourceCounts[sourceName] || 0;
                      const gamesForSource = summary.games.filter((g) => g.source === sourceName);
                      const checkedCount = gamesForSource.filter((g) => selectedGameIds.has(g.id)).length;
                      const isAllChecked = checkedCount === gamesForSource.length && gamesForSource.length > 0;
                      const isSomeChecked = checkedCount > 0 && !isAllChecked;
                      const isFilterActive = sourceFilter === sourceName;

                      return (
                        <div
                          key={sourceName}
                          className={`flex items-center space-x-1.5 pl-1.5 pr-2 py-0.5 rounded text-[11px] transition-all border ${
                            isFilterActive
                              ? "bg-amber-500/20 border-amber-500/50 text-white font-medium"
                              : "bg-black/40 border-white/10 text-zinc-300 hover:border-white/20"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isAllChecked}
                            ref={(el) => {
                              if (el) el.indeterminate = isSomeChecked;
                            }}
                            onChange={() => handleToggleSourceGames(sourceName)}
                            title={`Toggle all ${sourceName} games (${checkedCount}/${count} selected)`}
                            className="w-3.5 h-3.5 rounded bg-white/10 border-white/20 text-amber-500 accent-amber-500 cursor-pointer"
                          />
                          <button
                            type="button"
                            onClick={() => setSourceFilter(isFilterActive ? "all" : sourceName)}
                            className="cursor-pointer flex items-center space-x-1"
                            title={`Filter view to ${sourceName}`}
                          >
                            <span>{sourceName}</span>
                            <span className="text-[10px] opacity-60">({checkedCount}/{count})</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Search & Filter Header */}
              <div className="flex items-center space-x-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder="Search backup games..."
                    className="w-full pl-8 pr-3 py-1.5 bg-black/40 border border-white/10 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500/50"
                  />
                </div>

                <div className="flex items-center bg-black/40 rounded-lg p-0.5 border border-white/10 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setStatusFilter("all")}
                    className={`px-2 py-0.5 rounded transition-all cursor-pointer font-medium ${
                      statusFilter === "all" ? "bg-white/15 text-white font-bold" : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    All ({summary.games.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter("installed")}
                    className={`px-2 py-0.5 rounded transition-all cursor-pointer font-medium ${
                      statusFilter === "installed" ? "bg-white/15 text-white font-bold" : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    Installed ({summary.installed_games})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter("uninstalled")}
                    className={`px-2 py-0.5 rounded transition-all cursor-pointer font-medium ${
                      statusFilter === "uninstalled" ? "bg-white/15 text-white font-bold" : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    Uninstalled ({summary.uninstalled_games})
                  </button>
                </div>
              </div>

              {/* Game Table / Scroll List */}
              <div className="max-h-56 overflow-y-auto rounded-lg border border-white/10 bg-black/30 divide-y divide-white/5">
                {filteredGames.length === 0 ? (
                  <div className="p-4 text-center text-xs text-zinc-500">
                    No games match filter
                  </div>
                ) : (
                  filteredGames.map((game) => {
                    const isSelected = selectedGameIds.has(game.id);
                    return (
                      <div
                        key={game.id}
                        onClick={() => handleToggleGame(game.id)}
                        className={`flex items-center justify-between p-2 hover:bg-white/[0.04] cursor-pointer transition-colors ${
                          isSelected ? "bg-amber-500/[0.03]" : "opacity-60"
                        }`}
                      >
                        <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                          <button
                            type="button"
                            className="text-zinc-400 hover:text-white cursor-pointer"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-amber-400" />
                            ) : (
                              <Square className="w-4 h-4 text-zinc-600" />
                            )}
                          </button>
                          <div className="min-w-0">
                            <span className="text-xs font-semibold text-zinc-200 block truncate">
                              {game.title}
                            </span>
                            <div className="flex items-center space-x-1.5 text-[10px] text-zinc-500">
                              <span className="font-medium text-zinc-400">{game.source}</span>
                              <span>•</span>
                              <span>{formatPlaytime(game.playtime_seconds)}</span>
                              {game.last_played && (
                                <>
                                  <span>•</span>
                                  <span>Last: {game.last_played}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-medium shrink-0 ${
                            game.is_installed
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              : "bg-white/5 text-zinc-500 border border-white/5"
                          }`}
                        >
                          {game.is_installed ? "Installed" : "Cloud"}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Import Progress Bar */}
          {isImporting && importProgress && (
            <div className="space-y-1.5 p-3 bg-black/40 rounded-xl border border-white/10">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-amber-300 flex items-center space-x-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Importing games ({importProgress.gamesFound} parsed, {importProgress.artworkExtracted} artwork files)...</span>
                </span>
                <span className="text-zinc-400">
                  {Math.round((importProgress.current / (importProgress.total || 1)) * 100)}%
                </span>
              </div>
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-orange-400 transition-all duration-150"
                  style={{
                    width: `${Math.round((importProgress.current / (importProgress.total || 1)) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Import Success Notification */}
          {importResult && (
            <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-xs text-emerald-200 flex items-start space-x-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block text-sm text-white mb-0.5">
                  Playnite Import Completed!
                </span>
                <span>
                  Successfully processed {importResult.total} games ({importResult.imported} new, {importResult.updated} updated) and extracted {importResult.artwork_extracted} offline artwork assets.
                </span>
              </div>
            </div>
          )}

          {/* Start Import Action Button */}
          <div className="flex items-center justify-between pt-2 border-t border-white/5">
            <span className="text-xs text-zinc-400">
              {selectedGameIds.size} game(s) will be imported
            </span>

            <button
              type="button"
              disabled={isImporting || selectedGameIds.size === 0}
              onClick={handleRunImport}
              className="px-5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold rounded-xl text-xs flex items-center space-x-2 transition-all shadow-lg shadow-amber-500/20 active:scale-98 disabled:opacity-50 cursor-pointer"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                  <span>Importing from Playnite...</span>
                </>
              ) : (
                <>
                  <span>Import {selectedGameIds.size} Selected Games</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
