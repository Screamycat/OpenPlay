import React, { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Game } from "../types/game";
import { GameSaveState, CloudSaveSnapshot, LocalSafetyBackup } from "../types/saves";
import {
  formatFileSize,
  resolveGridCoverSrc,
  isVideoSrc,
  getStaticFallbackCover,
} from "../utils/image";
import { PlatformIcon } from "./icons/PlatformIcons";
import {
  X,
  FolderOpen,
  Cloud,
  RefreshCw,
  Plus,
  Trash2,
  Upload,
  Download,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  HardDrive,
  Laptop,
  ShieldCheck,
  Loader2,
} from "lucide-react";

interface SaveManagerModalProps {
  game: Game | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenCloudSettings?: () => void;
  onGameUpdated?: (updated: Game) => void;
  onSaveStateChanged?: () => void;
}

function originLabel(origin: string): string {
  switch (origin) {
    case "custom":
      return "Custom";
    case "emulator":
      return "Emulator";
    case "steam_userdata":
      return "Steam Cloud";
    case "proton_prefix":
      return "Proton Prefix";
    case "wine_prefix":
      return "Wine Prefix";
    case "pcgamingwiki":
      return "PCGamingWiki";
    case "heuristic":
      return "Detected";
    default:
      return origin;
  }
}

function triggerLabel(trigger: string): string {
  switch (trigger) {
    case "auto_exit":
      return "Auto (Exit)";
    case "pre_launch":
      return "Auto (Launch)";
    case "manual":
      return "Manual";
    default:
      return trigger;
  }
}

export const SaveManagerModal: React.FC<SaveManagerModalProps> = ({
  game,
  isOpen,
  onClose,
  onOpenCloudSettings,
  onGameUpdated,
  onSaveStateChanged,
}) => {
  const [saveState, setSaveState] = useState<GameSaveState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshingDetect, setIsRefreshingDetect] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [confirmRestoreSnapshot, setConfirmRestoreSnapshot] = useState<CloudSaveSnapshot | null>(null);
  const [oversizedConfirmBytes, setOversizedConfirmBytes] = useState<number | null>(null);
  const [manualSaveInput, setManualSaveInput] = useState("");
  const [manualConfigInput, setManualConfigInput] = useState("");
  const [snapshotNote, setSnapshotNote] = useState("");
  const [showConfigPaths, setShowConfigPaths] = useState(false);
  const [showSafetyBackups, setShowSafetyBackups] = useState(false);
  const [retentionInput, setRetentionInput] = useState<string>("");
  const [imgError, setImgError] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const loadState = useCallback(
    async (forceRefresh = false) => {
      if (!game) return;
      if (forceRefresh) {
        setIsRefreshingDetect(true);
      } else {
        setIsLoading(true);
      }
      try {
        const res = await invoke<GameSaveState>("get_game_save_state", {
          gameId: game.id,
          forceRefreshDetection: forceRefresh,
        });
        setSaveState(res);
        setRetentionInput(
          res.cloud_save_retention_override !== null && res.cloud_save_retention_override !== undefined
            ? String(res.cloud_save_retention_override)
            : ""
        );
      } catch (err: any) {
        setFeedback({
          type: "error",
          text: typeof err === "string" ? err : err?.message || "Failed to load save locations.",
        });
      } finally {
        setIsLoading(false);
        setIsRefreshingDetect(false);
      }
    },
    [game]
  );

  useEffect(() => {
    if (!isOpen || !game) return;
    setFeedback(null);
    setConfirmRestoreSnapshot(null);
    setOversizedConfirmBytes(null);
    setManualSaveInput("");
    setManualConfigInput("");
    setSnapshotNote("");
    setImgError(false);
    setVideoFailed(false);
    loadState(false);

    const unlistenPromise = listen<any>("save-backup-completed", (event) => {
      if (event.payload?.game_id === game.id) {
        loadState(false);
      }
    });
    return () => {
      unlistenPromise.then((fn) => fn());
    };
  }, [isOpen, game?.id, loadState]);

  if (!isOpen || !game) return null;

  const handleOpenFolder = async (path: string) => {
    try {
      await invoke("open_in_explorer", { path });
    } catch (err: any) {
      setFeedback({
        type: "error",
        text: typeof err === "string" ? err : "Could not open folder in explorer.",
      });
    }
  };

  const handleAddCustomPath = async (kind: "save" | "config", pathOverride?: string) => {
    const candidate = (pathOverride ?? (kind === "save" ? manualSaveInput : manualConfigInput)).trim();
    if (!candidate || !saveState) return;
    const nextSaves =
      kind === "save" ? [...saveState.custom_save_paths, candidate] : saveState.custom_save_paths;
    const nextConfigs =
      kind === "config"
        ? [...saveState.custom_config_paths, candidate]
        : saveState.custom_config_paths;

    try {
      const updated = await invoke<GameSaveState>("save_custom_save_paths", {
        gameId: game.id,
        savePaths: nextSaves,
        configPaths: nextConfigs,
      });
      setSaveState(updated);
      if (kind === "save") setManualSaveInput("");
      else setManualConfigInput("");
      onSaveStateChanged?.();
    } catch (err: any) {
      setFeedback({
        type: "error",
        text: typeof err === "string" ? err : "Failed to save custom path.",
      });
    }
  };

  const handleBrowseCustomFolder = async (kind: "save" | "config") => {
    try {
      const selected = await invoke<string | null>("select_directory");
      if (selected) {
        await handleAddCustomPath(kind, selected);
      }
    } catch (err) {
      console.warn("Folder pick failed:", err);
    }
  };

  const handleRemoveCustomPath = async (kind: "save" | "config", pathToRemove: string) => {
    if (!saveState) return;
    const nextSaves =
      kind === "save"
        ? saveState.custom_save_paths.filter((p) => p !== pathToRemove)
        : saveState.custom_save_paths;
    const nextConfigs =
      kind === "config"
        ? saveState.custom_config_paths.filter((p) => p !== pathToRemove)
        : saveState.custom_config_paths;
    try {
      const updated = await invoke<GameSaveState>("save_custom_save_paths", {
        gameId: game.id,
        savePaths: nextSaves,
        configPaths: nextConfigs,
      });
      setSaveState(updated);
      onSaveStateChanged?.();
    } catch (err: any) {
      setFeedback({ type: "error", text: String(err) });
    }
  };

  const handleResetToAuto = async (kind: "save" | "config") => {
    if (!saveState) return;
    const nextSaves = kind === "save" ? [] : saveState.custom_save_paths;
    const nextConfigs = kind === "config" ? [] : saveState.custom_config_paths;
    try {
      const updated = await invoke<GameSaveState>("save_custom_save_paths", {
        gameId: game.id,
        savePaths: nextSaves,
        configPaths: nextConfigs,
      });
      setSaveState(updated);
      onSaveStateChanged?.();
    } catch (err: any) {
      setFeedback({ type: "error", text: String(err) });
    }
  };

  const handleUpdateCloudSettings = async (
    enabled: boolean,
    retentionOverride: number | null
  ) => {
    try {
      const updated = await invoke<GameSaveState>("set_game_cloud_save_settings", {
        gameId: game.id,
        enabled,
        retentionOverride,
      });
      setSaveState(updated);
      onGameUpdated?.({
        ...game,
        cloud_save_enabled: updated.cloud_save_enabled,
        cloud_save_retention_override: updated.cloud_save_retention_override ?? undefined,
      });
      onSaveStateChanged?.();
    } catch (err: any) {
      setFeedback({ type: "error", text: String(err) });
    }
  };

  const handleRetentionBlurOrApply = async () => {
    if (!saveState) return;
    const trimmed = retentionInput.trim();
    const parsed = trimmed === "" ? null : Math.max(1, Math.min(50, Number(trimmed) || 5));
    await handleUpdateCloudSettings(saveState.cloud_save_enabled, parsed);
  };

  const handleForceSave = async (allowOversized = false) => {
    setIsPushing(true);
    setFeedback(null);
    setOversizedConfirmBytes(null);
    try {
      const res = await invoke<any>("force_push_cloud_save", {
        gameId: game.id,
        note: snapshotNote.trim() || null,
        allowOversized,
      });
      setSaveState(res.state);
      if (!res.skipped) setSnapshotNote("");
      setFeedback({
        type: res.skipped ? "info" : "success",
        text: res.message,
      });
      onSaveStateChanged?.();
    } catch (err: any) {
      const msg = typeof err === "string" ? err : err?.message || "Failed to push cloud save.";
      if (msg.startsWith("OVERSIZED:")) {
        const bytes = Number(msg.split(":")[1] || 0);
        setOversizedConfirmBytes(bytes);
      } else {
        setFeedback({ type: "error", text: msg });
      }
    } finally {
      setIsPushing(false);
    }
  };

  const handleConfirmRestore = async (snap: CloudSaveSnapshot) => {
    setRestoringId(snap.id);
    setConfirmRestoreSnapshot(null);
    setFeedback(null);
    try {
      const res = await invoke<any>("restore_cloud_save_snapshot", {
        gameId: game.id,
        snapshotId: snap.id,
      });
      setSaveState(res.state);
      setFeedback({ type: "success", text: res.message });
      onSaveStateChanged?.();
    } catch (err: any) {
      setFeedback({
        type: "error",
        text: typeof err === "string" ? err : err?.message || "Failed to restore cloud save.",
      });
    } finally {
      setRestoringId(null);
    }
  };

  const handleDeleteSnapshot = async (snapshotId: string) => {
    try {
      const updated = await invoke<GameSaveState>("delete_cloud_save_snapshot", {
        gameId: game.id,
        snapshotId,
      });
      setSaveState(updated);
      onSaveStateChanged?.();
    } catch (err: any) {
      setFeedback({ type: "error", text: String(err) });
    }
  };

  const handleRestoreSafetyBackup = async (backup: LocalSafetyBackup) => {
    setRestoringId(backup.id);
    setFeedback(null);
    try {
      const updated = await invoke<GameSaveState>("restore_local_safety_backup", {
        gameId: game.id,
        backupId: backup.id,
      });
      setSaveState(updated);
      setFeedback({
        type: "success",
        text: "Restored previous local saves from safety backup.",
      });
      onSaveStateChanged?.();
    } catch (err: any) {
      setFeedback({ type: "error", text: String(err) });
    } finally {
      setRestoringId(null);
    }
  };

  const formatTimestamp = (iso: string) => {
    try {
      return new Date(iso).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  const statusText = (s: string) => {
    switch (s) {
      case "in_sync":
        return { label: "In Sync", cls: "text-emerald-400" };
      case "peer_ahead":
        return { label: "Newer Cloud Save Available", cls: "text-amber-400" };
      case "local_ahead":
        return { label: "Local Changes Ready", cls: "text-sky-400" };
      case "no_save_path":
        return { label: "No Save Path Set", cls: "text-zinc-400" };
      case "cloud_disabled":
        return { label: "Cloud Sync Offline", cls: "text-zinc-400" };
      default:
        return { label: "Not Synced Yet", cls: "text-zinc-400" };
    }
  };

  const coverSrc = resolveGridCoverSrc(game.cover_image, 200);
  const isVideoCover = isVideoSrc(game.cover_image) || isVideoSrc(coverSrc);
  const staticCoverFallback = getStaticFallbackCover(game.cover_image);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 theme-modal-backdrop flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-gamepad-zone="modal"
        className="theme-modal-container rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden text-xs text-zinc-200 shadow-2xl"
      >
        {/* Header */}
        <div className="px-5 py-3.5 theme-modal-header flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-10 rounded-lg bg-black/40 border border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
              {coverSrc && !imgError ? (
                isVideoCover && !videoFailed ? (
                  <video
                    src={coverSrc}
                    poster={staticCoverFallback}
                    autoPlay
                    loop
                    muted
                    playsInline
                    onError={() => setVideoFailed(true)}
                    className="w-full h-full object-cover pointer-events-none"
                  />
                ) : (
                  <img
                    src={
                      videoFailed
                        ? staticCoverFallback ||
                          game.cover_image?.replace(/\.(webm|mp4)$/i, ".webp") ||
                          coverSrc
                        : coverSrc
                    }
                    alt=""
                    onError={(e) => {
                      const target = e.currentTarget;
                      if (target.src.includes(".webp")) {
                        target.src = target.src.replace(/\.webp$/i, ".png");
                        return;
                      }
                      if (target.src.includes(".png") && !target.src.includes(".jpg")) {
                        target.src = target.src.replace(/\.png$/i, ".jpg");
                        return;
                      }
                      if (
                        game.source?.toLowerCase() === "steam" &&
                        game.source_id &&
                        !target.src.includes("steamstatic.com")
                      ) {
                        target.src = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${game.source_id}/library_600x900.jpg`;
                        return;
                      }
                      setImgError(true);
                    }}
                    className="w-full h-full object-cover"
                  />
                )
              ) : (
                <PlatformIcon platform={game.platforms?.[0] || game.source} className="w-4 h-4 text-zinc-400" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white truncate">{game.title}</h2>
                <span className="text-[10px] text-zinc-400 font-medium">{game.source}</span>
              </div>
              <p className="text-[11px] text-zinc-400">Save Location & Cloud Saves</p>
            </div>
          </div>

          <button
            onClick={onClose}
            data-gamepad-close="true"
            className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/15 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer border border-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {feedback && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                feedback.type === "success"
                  ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                  : feedback.type === "error"
                  ? "bg-rose-500/10 text-rose-300 border border-rose-500/20"
                  : "bg-sky-500/10 text-sky-300 border border-sky-500/20"
              }`}
            >
              {feedback.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{feedback.text}</span>
            </div>
          )}

          {oversizedConfirmBytes !== null && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3">
              <div className="text-[11px] text-amber-200">
                Save files total <span className="font-bold font-mono">{formatFileSize(oversizedConfirmBytes)}</span>, which exceeds the 250 MB auto-sync guard. Upload anyway?
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setOversizedConfirmBytes(null)}
                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-zinc-200 text-[11px] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleForceSave(true)}
                  className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-[11px] cursor-pointer"
                >
                  Upload Anyway
                </button>
              </div>
            </div>
          )}

          {isLoading && !saveState ? (
            <div className="py-12 flex flex-col items-center justify-center text-zinc-400 gap-2">
              <Loader2 className="w-5 h-5 animate-spin theme-accent-text" />
              <span>Locating save paths...</span>
            </div>
          ) : saveState ? (
            <>
              {/* SECTION 1: LOCAL SAVE & CONFIG PATHS */}
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-zinc-400" />
                    <span className="text-xs font-semibold text-white">Save Location</span>
                    {saveState.has_custom_save_paths && (
                      <button
                        type="button"
                        onClick={() => handleResetToAuto("save")}
                        className="text-[10px] text-zinc-400 hover:text-white underline cursor-pointer"
                      >
                        Reset to Auto
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => loadState(true)}
                      disabled={isRefreshingDetect}
                      className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-zinc-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${isRefreshingDetect ? "animate-spin" : ""}`} />
                      <span>Auto-Detect</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBrowseCustomFolder("save")}
                      className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-[11px] text-white font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <FolderOpen className="w-3 h-3 text-zinc-300" />
                      <span>Add Folder</span>
                    </button>
                  </div>
                </div>

                {saveState.save_paths.length === 0 ? (
                  <div className="p-3 rounded-xl border border-dashed border-white/10 bg-black/20 text-center text-[11px] text-zinc-400">
                    No save folder detected automatically. Add a folder manually below.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {saveState.save_paths.map((sp) => (
                      <div
                        key={sp.path}
                        className="px-3 py-2 rounded-xl bg-black/35 border border-white/5 flex items-center justify-between gap-2"
                      >
                        <button
                          type="button"
                          onClick={() => sp.exists && handleOpenFolder(sp.path)}
                          disabled={!sp.exists}
                          title={sp.exists ? "Open in File Explorer" : "Folder does not exist on disk yet"}
                          className={`min-w-0 text-left flex-1 ${
                            sp.exists ? "hover:text-white cursor-pointer" : "opacity-60 cursor-default"
                          }`}
                        >
                          <div className="font-mono text-[11px] text-zinc-200 truncate">{sp.path}</div>
                          <div className="text-[10px] text-zinc-500 flex items-center gap-2 mt-0.5">
                            <span>{originLabel(sp.origin)}</span>
                            <span>·</span>
                            <span>
                              {sp.exists
                                ? `${sp.file_count} file${sp.file_count === 1 ? "" : "s"} (${formatFileSize(sp.total_bytes)})`
                                : "Not created on disk yet"}
                            </span>
                          </div>
                        </button>

                        {sp.origin === "custom" && (
                          <button
                            type="button"
                            onClick={() => handleRemoveCustomPath("save", sp.path)}
                            title="Remove custom path"
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Direct path input for manual routing */}
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={manualSaveInput}
                    onChange={(e) => setManualSaveInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddCustomPath("save");
                      }
                    }}
                    placeholder="Paste folder path to route manually..."
                    className="flex-1 px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-[11px] font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-white/30"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddCustomPath("save")}
                    disabled={!manualSaveInput.trim()}
                    className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-[11px] font-medium flex items-center gap-1 cursor-pointer disabled:opacity-40"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add</span>
                  </button>
                </div>

                {/* Collapsible Config Paths */}
                <div className="pt-1 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => setShowConfigPaths((p) => !p)}
                    className="flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  >
                    {showConfigPaths ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                    <span>Config Locations ({saveState.config_paths.length})</span>
                    <span className="text-[10px] text-zinc-500">· Local only</span>
                  </button>

                  {showConfigPaths && (
                    <div className="mt-2.5 space-y-2">
                      {saveState.config_paths.map((cp) => (
                        <div
                          key={cp.path}
                          className="px-3 py-1.5 rounded-lg bg-black/30 border border-white/5 flex items-center justify-between gap-2"
                        >
                          <button
                            type="button"
                            onClick={() => cp.exists && handleOpenFolder(cp.path)}
                            disabled={!cp.exists}
                            className={`min-w-0 text-left flex-1 font-mono text-[10px] truncate ${
                              cp.exists ? "text-zinc-300 hover:text-white cursor-pointer" : "text-zinc-500"
                            }`}
                          >
                            {cp.path}
                          </button>
                          {cp.origin === "custom" && (
                            <button
                              type="button"
                              onClick={() => handleRemoveCustomPath("config", cp.path)}
                              className="p-1 text-zinc-500 hover:text-rose-400 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))}
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={manualConfigInput}
                          onChange={(e) => setManualConfigInput(e.target.value)}
                          placeholder="Optional config folder path..."
                          className="flex-1 px-2.5 py-1 rounded-lg bg-black/40 border border-white/10 text-[10px] font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-white/30"
                        />
                        <button
                          type="button"
                          onClick={() => handleBrowseCustomFolder("config")}
                          className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-[10px] text-white cursor-pointer"
                        >
                          Browse
                        </button>
                        {manualConfigInput.trim() && (
                          <button
                            type="button"
                            onClick={() => handleAddCustomPath("config")}
                            className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-[10px] text-white cursor-pointer"
                          >
                            Add
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION 2: CLOUD SAVES & LATEST X SNAPSHOTS */}
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Cloud className="w-4 h-4 theme-accent-text" />
                    <div>
                      <div className="text-xs font-semibold text-white">Cloud Game Saves</div>
                      <div className={`text-[10px] font-medium ${statusText(saveState.sync_status).cls}`}>
                        {statusText(saveState.sync_status).label}
                      </div>
                    </div>
                  </div>

                  {saveState.cloud_sync_enabled && saveState.cloud_sync_folder_valid && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className="text-[11px] text-zinc-400">
                        {saveState.cloud_save_enabled ? "Auto-Sync On" : "Auto-Sync Off"}
                      </span>
                      <input
                        type="checkbox"
                        checked={saveState.cloud_save_enabled}
                        onChange={(e) =>
                          handleUpdateCloudSettings(
                            e.target.checked,
                            saveState.cloud_save_retention_override ?? null
                          )
                        }
                        className="sr-only peer"
                      />
                      <div
                        className="w-9 h-5 bg-white/10 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all relative cursor-pointer"
                        style={{
                          backgroundColor: saveState.cloud_save_enabled
                            ? "var(--app-accent-color, #0ea5e9)"
                            : undefined,
                        }}
                      />
                    </label>
                  )}
                </div>

                {!saveState.cloud_sync_enabled || !saveState.cloud_sync_folder_valid ? (
                  <div className="p-3.5 rounded-xl bg-black/30 border border-white/10 flex items-center justify-between gap-3">
                    <div className="text-[11px] text-zinc-400">
                      Connect a shared folder in Cloud Sync to store and load versioned game saves across devices.
                    </div>
                    {onOpenCloudSettings && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenCloudSettings();
                        }}
                        className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-[11px] font-semibold shrink-0 cursor-pointer"
                      >
                        Cloud Sync Settings
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Retention & Force Save Bar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                      <div className="flex items-center gap-2 text-[11px] text-zinc-300">
                        <span>Keep latest</span>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={retentionInput}
                          placeholder={String(saveState.global_retention_count)}
                          onChange={(e) => setRetentionInput(e.target.value)}
                          onBlur={handleRetentionBlurOrApply}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRetentionBlurOrApply();
                          }}
                          className="w-14 px-2 py-1 rounded-lg bg-black/40 border border-white/15 text-center font-mono text-white focus:outline-none focus:border-white/40"
                        />
                        <span className="text-zinc-400">
                          saves
                          {saveState.cloud_save_retention_override == null &&
                            ` (default ${saveState.global_retention_count})`}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={snapshotNote}
                          onChange={(e) => setSnapshotNote(e.target.value)}
                          placeholder="Optional note..."
                          className="w-36 px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-[11px] text-white placeholder-zinc-500 focus:outline-none focus:border-white/30"
                        />
                        <button
                          type="button"
                          onClick={() => handleForceSave(false)}
                          disabled={isPushing || saveState.local_file_count === 0}
                          className="px-3 py-1.5 rounded-xl text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm disabled:opacity-40"
                          style={{ backgroundColor: "var(--app-accent-color, #783efe)" }}
                        >
                          {isPushing ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Upload className="w-3.5 h-3.5" />
                          )}
                          <span>{isPushing ? "Saving..." : "Force Save to Cloud"}</span>
                        </button>
                      </div>
                    </div>

                    {/* Inline Restore Confirmation */}
                    {confirmRestoreSnapshot && (
                      <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2.5">
                        <div className="text-[11px] text-amber-100">
                          Load save from <span className="font-bold">{confirmRestoreSnapshot.device_name}</span> ({formatTimestamp(confirmRestoreSnapshot.created_at)})? Your current local saves will be backed up first.
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setConfirmRestoreSnapshot(null)}
                            className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-zinc-200 text-[11px] cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleConfirmRestore(confirmRestoreSnapshot)}
                            className="px-3 py-1 rounded-lg bg-white text-black font-bold text-[11px] hover:bg-zinc-200 cursor-pointer"
                          >
                            Confirm Load Save
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Cloud Snapshot List */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-zinc-400">
                        <span>
                          Cloud Snapshots ({saveState.snapshots.length} / {saveState.effective_retention_count})
                        </span>
                        {saveState.is_game_running && (
                          <span className="text-amber-400">Close game before loading saves</span>
                        )}
                      </div>

                      {saveState.snapshots.length === 0 ? (
                        <div className="py-6 rounded-xl border border-dashed border-white/10 text-center text-[11px] text-zinc-500">
                          No cloud snapshots yet. Enable Auto-Sync or click Force Save to Cloud.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {saveState.snapshots.map((snap, idx) => {
                            const isCurrentSynced = saveState.local_save_hash === snap.sha256;
                            return (
                              <div
                                key={snap.id}
                                className="p-3 rounded-xl bg-black/35 border border-white/5 hover:border-white/15 flex items-center justify-between gap-3 transition-colors"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="p-2 rounded-lg bg-white/5 text-zinc-300 shrink-0">
                                    <Laptop className="w-3.5 h-3.5" />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold text-white truncate">
                                        {snap.device_name}
                                      </span>
                                      <span className="text-[10px] text-zinc-400">{snap.os}</span>
                                      {idx === 0 && (
                                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/10 text-zinc-200 font-medium">
                                          Latest
                                        </span>
                                      )}
                                      {isCurrentSynced && (
                                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-300 font-medium">
                                          Matches Local
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[10px] text-zinc-400 font-mono mt-0.5 truncate">
                                      {formatTimestamp(snap.created_at)} · {triggerLabel(snap.trigger)} ·{" "}
                                      {snap.file_count} file{snap.file_count === 1 ? "" : "s"} ·{" "}
                                      {formatFileSize(snap.size_bytes)}
                                      {snap.note ? ` · "${snap.note}"` : ""}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    disabled={
                                      saveState.is_game_running || restoringId === snap.id
                                    }
                                    onClick={() => setConfirmRestoreSnapshot(snap)}
                                    className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-40"
                                  >
                                    {restoringId === snap.id ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Download className="w-3 h-3" />
                                    )}
                                    <span>Load</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteSnapshot(snap.id)}
                                    title="Delete snapshot"
                                    className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Local Safety Backups (Pre-Restore Undo) */}
                    {saveState.safety_backups.length > 0 && (
                      <div className="pt-2 border-t border-white/5">
                        <button
                          type="button"
                          onClick={() => setShowSafetyBackups((p) => !p)}
                          className="flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-white transition-colors cursor-pointer"
                        >
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Local Safety Backups ({saveState.safety_backups.length})</span>
                          {showSafetyBackups ? (
                            <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ChevronRight className="w-3 h-3" />
                          )}
                        </button>

                        {showSafetyBackups && (
                          <div className="mt-2 space-y-1.5">
                            {saveState.safety_backups.map((bk) => (
                              <div
                                key={bk.id}
                                className="px-3 py-2 rounded-lg bg-black/30 border border-white/5 flex items-center justify-between gap-2 text-[11px]"
                              >
                                <div className="min-w-0">
                                  <div className="text-zinc-200 truncate">{bk.reason}</div>
                                  <div className="text-[10px] text-zinc-500 font-mono">
                                    {formatTimestamp(bk.created_at)} · {bk.file_count} files ·{" "}
                                    {formatFileSize(bk.size_bytes)}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  disabled={saveState.is_game_running || restoringId === bk.id}
                                  onClick={() => handleRestoreSafetyBackup(bk)}
                                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-white text-[10px] font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-40 shrink-0"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>Restore</span>
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
