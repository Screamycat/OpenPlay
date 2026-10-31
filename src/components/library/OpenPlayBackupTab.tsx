import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { BackupInfo, ImportBackupSummary } from "../../types/backup";
import { AppConfig } from "../../types/config";
import { formatFileSize } from "../../utils/image";
import {
  ShieldCheck,
  HardDrive,
  Download,
  Upload,
  RefreshCw,
  Trash2,
  RotateCcw,
  FolderOpen,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Archive,
  Clock,
} from "lucide-react";

interface OpenPlayBackupTabProps {
  config: AppConfig;
  onSaveConfig: (updated: AppConfig) => void;
  onReloadGames?: () => Promise<void>;
}

export const OpenPlayBackupTab: React.FC<OpenPlayBackupTabProps> = ({
  config,
  onSaveConfig,
  onReloadGames,
}) => {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [restoringFilename, setRestoringFilename] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const [frequency, setFrequency] = useState<string>(config.backup_frequency || "daily");
  const [retention, setRetention] = useState<number>(config.backup_retention_count || 5);

  const loadBackups = async () => {
    setIsLoading(true);
    try {
      const list = await invoke<BackupInfo[]>("list_database_backups");
      setBackups(list || []);
    } catch (err: any) {
      console.warn("Failed to load backups list:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBackups();
  }, []);

  const handleUpdatePolicy = (newFreq: string, newRet: number) => {
    setFrequency(newFreq);
    setRetention(newRet);
    onSaveConfig({
      ...config,
      backup_frequency: newFreq as any,
      backup_retention_count: newRet,
    });
    setStatusMessage({
      type: "success",
      text: "Backup policy updated successfully.",
    });
  };

  const handleCreateSnapshot = async () => {
    setIsCreatingBackup(true);
    setStatusMessage(null);
    try {
      const info = await invoke<BackupInfo>("create_database_backup", {
        backupName: null,
        isAutomatic: false,
      });
      await loadBackups();
      setStatusMessage({
        type: "success",
        text: `Snapshot created: ${info.filename} (${info.game_count} games, ${formatFileSize(info.size_bytes)})`,
      });
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: typeof err === "string" ? err : err.message || "Failed to create snapshot",
      });
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const handleRestore = async (backup: BackupInfo) => {
    const confirmed = window.confirm(
      `Are you sure you want to restore snapshot '${backup.filename}'?\n\nDate: ${backup.created_at}\nGames: ${backup.game_count}\n\nOpenPlay will automatically create a pre-restore safety copy before restoring.`
    );
    if (!confirmed) return;

    setRestoringFilename(backup.filename);
    setStatusMessage(null);
    try {
      await invoke("restore_database_backup", { filename: backup.filename });
      if (onReloadGames) {
        await onReloadGames();
      }
      await loadBackups();
      setStatusMessage({
        type: "success",
        text: `Database successfully restored from '${backup.filename}'.`,
      });
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: typeof err === "string" ? err : err.message || "Failed to restore backup",
      });
    } finally {
      setRestoringFilename(null);
    }
  };

  const handleDelete = async (filename: string) => {
    const confirmed = window.confirm(`Delete backup file '${filename}'? This cannot be undone.`);
    if (!confirmed) return;

    try {
      await invoke("delete_database_backup", { filename });
      setBackups((prev) => prev.filter((b) => b.filename !== filename));
    } catch (err: any) {
      alert(`Failed to delete backup: ${err}`);
    }
  };

  const handleExportPortable = async () => {
    setIsExporting(true);
    setStatusMessage(null);
    try {
      const targetPath = await invoke<string | null>("select_file", {
        filter: "OpenPlay Portable Backup (*.openplaybackup)|*.openplaybackup|Zip Archive (*.zip)|*.zip",
      });

      if (!targetPath) {
        setIsExporting(false);
        return;
      }

      const outPath = targetPath.endsWith(".openplaybackup") || targetPath.endsWith(".zip")
        ? targetPath
        : `${targetPath}.openplaybackup`;

      const result = await invoke<string>("export_portable_backup", { targetPath: outPath });
      setStatusMessage({
        type: "success",
        text: `Portable backup exported successfully to: ${result}`,
      });
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: typeof err === "string" ? err : err.message || "Export failed",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportPortable = async () => {
    setIsImporting(true);
    setStatusMessage(null);
    try {
      const filePath = await invoke<string | null>("select_file", {
        filter: "OpenPlay Portable Backup (*.openplaybackup;*.zip)|*.openplaybackup;*.zip|All Files (*.*)|*.*",
      });

      if (!filePath) {
        setIsImporting(false);
        return;
      }

      const confirmed = window.confirm(
        `Import portable backup from '${filePath}'?\n\nThis will merge games, playtimes, ratings, and artwork non-destructively. A safety snapshot will be created automatically before importing.`
      );
      if (!confirmed) {
        setIsImporting(false);
        return;
      }

      const summary = await invoke<ImportBackupSummary>("import_portable_backup", { filePath });
      if (onReloadGames) {
        await onReloadGames();
      }
      await loadBackups();

      setStatusMessage({
        type: "success",
        text: `Import complete! ${summary.total_games} games processed (${summary.imported_count} new, ${summary.updated_count} updated).`,
      });
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: typeof err === "string" ? err : err.message || "Import failed",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleOpenFolder = async () => {
    try {
      if (backups.length > 0) {
        await invoke("open_in_explorer", { path: backups[0].file_path });
      }
    } catch (err) {
      console.warn("Failed to open backup folder:", err);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-1 flex items-center space-x-2">
          <span>OpenPlay Database Backups & Snapshots</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
            OFFLINE-FIRST
          </span>
        </h3>
        <p className="text-[11px] text-zinc-400">
          Create point-in-time database snapshots or export portable <code className="text-zinc-200">.openplaybackup</code> bundles for other devices.
        </p>
      </div>

      {statusMessage && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center space-x-2.5 transition-all ${
            statusMessage.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
              : statusMessage.type === "error"
              ? "bg-rose-500/10 border-rose-500/20 text-rose-300"
              : "bg-blue-500/10 border-blue-500/20 text-blue-300"
          }`}
        >
          {statusMessage.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          )}
          <span className="flex-1 min-w-0 font-medium">{statusMessage.text}</span>
        </div>
      )}

      {/* Auto Backup & Manual Snapshot Card */}
      <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <div className="font-semibold text-xs text-zinc-200">Periodic Auto-Backup Schedule</div>
              <div className="text-[10px] text-zinc-500">
                Zero-downtime background SQLite snapshots taken automatically
              </div>
            </div>
          </div>

          <button
            onClick={handleCreateSnapshot}
            disabled={isCreatingBackup}
            className="px-3 py-1.5 rounded-lg theme-accent-subtle-bg hover:opacity-90 theme-accent-text border border-[var(--app-accent-color)]/30 text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer shadow-sm disabled:opacity-50"
          >
            {isCreatingBackup ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            <span>Create Snapshot Now</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div>
            <label className="text-[11px] font-medium text-zinc-400 block mb-1">
              Backup Frequency
            </label>
            <select
              value={frequency}
              onChange={(e) => handleUpdatePolicy(e.target.value, retention)}
              className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-white/20"
            >
              <option value="daily">Daily (Recommended)</option>
              <option value="weekly">Weekly</option>
              <option value="on_exit">On App Exit</option>
              <option value="disabled">Disabled (Manual Only)</option>
            </select>
          </div>

          <div>
            <label className="text-[11px] font-medium text-zinc-400 block mb-1">
              Retention Limit (Auto-Prune)
            </label>
            <select
              value={retention}
              onChange={(e) => handleUpdatePolicy(frequency, parseInt(e.target.value, 10))}
              className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-white/20"
            >
              <option value="3">Keep last 3 snapshots</option>
              <option value="5">Keep last 5 snapshots</option>
              <option value="10">Keep last 10 snapshots</option>
            </select>
          </div>
        </div>
      </div>

      {/* Portable Cross-Device Backup Bundle (Phase 2) */}
      <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-3">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
            <Archive className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <div className="font-semibold text-xs text-zinc-200">Portable Cross-Device Bundle (.openplaybackup)</div>
            <div className="text-[10px] text-zinc-500">
              Exports full metadata, categories, tags, playtime, and custom artwork stripped of sensitive auth tokens
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2.5 pt-1">
          <button
            onClick={handleExportPortable}
            disabled={isExporting}
            className="flex-1 py-2 px-3 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] text-zinc-200 hover:text-white border border-white/10 text-xs font-semibold flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-sm disabled:opacity-50"
          >
            {isExporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5 text-zinc-400" />
            )}
            <span>Export Portable Backup</span>
          </button>

          <button
            onClick={handleImportPortable}
            disabled={isImporting}
            className="flex-1 py-2 px-3 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] text-zinc-200 hover:text-white border border-white/10 text-xs font-semibold flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-sm disabled:opacity-50"
          >
            {isImporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5 text-zinc-400" />
            )}
            <span>Import Portable Backup</span>
          </button>
        </div>
      </div>

      {/* Local Snapshots Table */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center space-x-2">
            <HardDrive className="w-3.5 h-3.5 text-zinc-400" />
            <span>Available Local Snapshots ({backups.length})</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={loadBackups}
              className="text-[11px] text-zinc-400 hover:text-white flex items-center space-x-1 cursor-pointer transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Refresh</span>
            </button>
            {backups.length > 0 && (
              <button
                onClick={handleOpenFolder}
                className="text-[11px] text-zinc-400 hover:text-white flex items-center space-x-1 cursor-pointer transition-colors"
              >
                <FolderOpen className="w-3 h-3" />
                <span>Open Folder</span>
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-zinc-500 text-xs flex items-center justify-center space-x-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Loading local snapshots...</span>
          </div>
        ) : backups.length === 0 ? (
          <div className="p-8 text-center bg-white/[0.02] border border-white/5 rounded-xl text-zinc-500 text-xs">
            No snapshots recorded yet. Click "Create Snapshot Now" above to create your first backup.
          </div>
        ) : (
          <div className="bg-white/[0.02] border border-white/5 rounded-xl divide-y divide-white/5 overflow-hidden">
            {backups.map((b) => (
              <div
                key={b.filename}
                className="p-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors text-xs"
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold shrink-0 ${
                      b.is_automatic
                        ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                        : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                    }`}
                  >
                    {b.is_automatic ? "AUTO" : "MANUAL"}
                  </span>

                  <div className="min-w-0">
                    <div className="font-semibold text-zinc-200 truncate">{b.filename}</div>
                    <div className="text-[10px] text-zinc-500 flex items-center space-x-2 mt-0.5">
                      <span className="flex items-center space-x-1">
                        <Clock className="w-2.5 h-2.5" />
                        <span>{b.created_at}</span>
                      </span>
                      <span>•</span>
                      <span>{b.game_count} games</span>
                      <span>•</span>
                      <span>{formatFileSize(b.size_bytes)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    onClick={() => handleRestore(b)}
                    disabled={restoringFilename === b.filename}
                    className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-200 hover:text-white border border-white/10 text-[11px] font-medium flex items-center space-x-1 cursor-pointer transition-colors disabled:opacity-50"
                  >
                    {restoringFilename === b.filename ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RotateCcw className="w-3 h-3 text-zinc-400" />
                    )}
                    <span>Restore</span>
                  </button>

                  <button
                    onClick={() => handleDelete(b.filename)}
                    className="p-1.5 rounded-lg hover:bg-rose-500/20 text-zinc-400 hover:text-rose-300 transition-colors cursor-pointer"
                    title="Delete Snapshot"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
