import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CloudSyncStatus, PeerDeviceInfo, SyncSummary } from "../../types/cloud_sync";
import {
  Cloud,
  FolderOpen,
  RefreshCw,
  Laptop,
  CheckCircle2,
  AlertCircle,
  ArrowUpDown,
  Shield,
  HardDrive,
  Info,
} from "lucide-react";

interface CloudSyncSettingsCardProps {
  onReloadGames?: () => Promise<void>;
}

export const CloudSyncSettingsCard: React.FC<CloudSyncSettingsCardProps> = ({
  onReloadGames,
}) => {
  const [status, setStatusMessage] = useState<CloudSyncStatus | null>(null);
  const [peers, setPeers] = useState<PeerDeviceInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const loadStatusAndPeers = async () => {
    setIsLoading(true);
    try {
      const s = await invoke<CloudSyncStatus>("get_cloud_sync_status");
      setStatusMessage(s);
      setDeviceName(s.device_name);

      if (s.is_folder_valid) {
        const p = await invoke<PeerDeviceInfo[]>("get_sync_peer_devices");
        setPeers(p || []);
      } else {
        setPeers([]);
      }
    } catch (err: any) {
      console.warn("Failed to load cloud sync status:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStatusAndPeers();
  }, []);

  const handleBrowseFolder = async () => {
    try {
      const selected = await invoke<string | null>("select_directory");
      if (selected) {
        setIsLoading(true);
        const updated = await invoke<CloudSyncStatus>("configure_cloud_sync", {
          folderPath: selected,
          enabled: true,
        });
        setStatusMessage(updated);
        const p = await invoke<PeerDeviceInfo[]>("get_sync_peer_devices");
        setPeers(p || []);
        setFeedback({
          type: "success",
          text: `Cloud sync folder set to: ${selected}`,
        });
      }
    } catch (err: any) {
      setFeedback({
        type: "error",
        text: typeof err === "string" ? err : err.message || "Failed to select folder",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleEnabled = async (enabled: boolean) => {
    if (!status?.folder_path && enabled) {
      handleBrowseFolder();
      return;
    }

    try {
      const updated = await invoke<CloudSyncStatus>("configure_cloud_sync", {
        folderPath: status?.folder_path || null,
        enabled,
      });
      setStatusMessage(updated);
      setFeedback({
        type: "info",
        text: enabled ? "Cloud sync enabled." : "Cloud sync paused.",
      });
    } catch (err: any) {
      setFeedback({
        type: "error",
        text: typeof err === "string" ? err : err.message || "Failed to update sync state",
      });
    }
  };

  const handleSaveDeviceName = async () => {
    if (!deviceName.trim()) return;
    setIsSavingName(true);
    try {
      await invoke("set_sync_device_name", { name: deviceName.trim() });
      await loadStatusAndPeers();
      setFeedback({
        type: "success",
        text: "Device name updated.",
      });
    } catch (err: any) {
      setFeedback({
        type: "error",
        text: typeof err === "string" ? err : err.message || "Failed to save device name",
      });
    } finally {
      setIsSavingName(false);
    }
  };

  const handleTriggerSync = async () => {
    setIsSyncing(true);
    setFeedback(null);
    try {
      const summary = await invoke<SyncSummary>("trigger_cloud_sync");
      await loadStatusAndPeers();
      if (onReloadGames) {
        await onReloadGames();
      }
      setFeedback({
        type: "success",
        text: summary.message,
      });
    } catch (err: any) {
      setFeedback({
        type: "error",
        text: typeof err === "string" ? err : err.message || "Cloud sync failed",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const formatIsoDate = (isoStr?: string | null) => {
    if (!isoStr) return "Never";
    try {
      const d = new Date(isoStr);
      return d.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoStr;
    }
  };

  if (isLoading && !status) {
    return (
      <div className="py-12 flex flex-col items-center justify-center text-zinc-500 gap-2">
        <RefreshCw className="w-5 h-5 animate-spin text-sky-400" />
        <span className="text-xs">Loading cloud sync status...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header card */}
      <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                Offline-First Cloud Sync
                {status?.enabled && status?.is_folder_valid && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Active
                  </span>
                )}
              </h4>
              <p className="text-xs text-zinc-400 mt-0.5">
                Multi-device synchronization via OneDrive, Syncthing, Dropbox, or a shared network folder.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs text-zinc-400">
                {status?.enabled ? "Enabled" : "Disabled"}
              </span>
              <input
                type="checkbox"
                checked={status?.enabled || false}
                onChange={(e) => handleToggleEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-sky-500 relative cursor-pointer" />
            </label>

            {status?.enabled && status?.is_folder_valid && (
              <button
                onClick={handleTriggerSync}
                disabled={isSyncing}
                className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                {isSyncing ? "Syncing..." : "Sync Now"}
              </button>
            )}
          </div>
        </div>

        {feedback && (
          <div
            className={`mt-4 p-3 rounded-lg text-xs flex items-center gap-2 ${
              feedback.type === "success"
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : feedback.type === "error"
                ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                : "bg-sky-500/10 text-sky-400 border border-sky-500/20"
            }`}
          >
            {feedback.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : feedback.type === "error" ? (
              <AlertCircle className="w-4 h-4 shrink-0" />
            ) : (
              <Info className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}
      </div>

      {/* Sync folder and device name configuration */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Sync Folder Selector */}
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-white flex items-center gap-1.5">
              <HardDrive className="w-4 h-4 text-zinc-400" />
              Shared Sync Folder
            </span>
            <button
              onClick={handleBrowseFolder}
              className="text-xs text-sky-400 hover:text-sky-300 font-medium flex items-center gap-1 cursor-pointer transition-colors"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              {status?.folder_path ? "Change" : "Browse..."}
            </button>
          </div>

          <div className="p-2.5 rounded-lg bg-black/40 border border-white/5 text-[11px] text-zinc-400 truncate font-mono">
            {status?.folder_path || "No sync directory configured"}
          </div>

          <p className="text-[11px] text-zinc-500">
            Select a folder synced by your cloud provider (e.g. OneDrive, Syncthing, Dropbox, or a network NAS).
          </p>
        </div>

        {/* Device Identity */}
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
          <span className="text-xs font-medium text-white flex items-center gap-1.5">
            <Laptop className="w-4 h-4 text-zinc-400" />
            This Device Identity
          </span>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="e.g. Desktop PC, Steam Deck"
              className="flex-1 px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-sky-500"
            />
            <button
              onClick={handleSaveDeviceName}
              disabled={isSavingName || deviceName === status?.device_name}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-40"
            >
              {isSavingName ? "Saving..." : "Save"}
            </button>
          </div>

          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span>Device ID: <span className="font-mono text-zinc-400">{status?.device_id.slice(0, 8)}...</span></span>
            <span>Last Synced: <span className="text-zinc-400">{formatIsoDate(status?.last_sync_time)}</span></span>
          </div>
        </div>
      </div>

      {/* Discovered Peer Devices Cluster */}
      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h5 className="text-xs font-semibold text-white flex items-center gap-1.5">
              <ArrowUpDown className="w-3.5 h-3.5 text-zinc-400" />
              Connected Peer Devices ({peers.length})
            </h5>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Devices writing to their own conflict-free state files in this shared folder.
            </p>
          </div>

          <button
            onClick={loadStatusAndPeers}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            title="Refresh Devices"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {peers.length === 0 ? (
          <div className="py-6 text-center text-xs text-zinc-500 bg-white/[0.01] rounded-lg border border-dashed border-white/5">
            {status?.folder_path
              ? "No peer devices found in this folder yet. Connect OpenPlay on another device pointing to this same folder!"
              : "Choose a sync folder to discover and link peer devices."}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {peers.map((peer) => (
              <div
                key={peer.device_id}
                className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                  peer.is_current_device
                    ? "bg-sky-500/[0.06] border-sky-500/20 shadow-sm"
                    : "bg-white/[0.02] border-white/5 hover:border-white/10"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`p-2 rounded-lg ${
                      peer.is_current_device
                        ? "bg-sky-500/20 text-sky-400"
                        : "bg-white/5 text-zinc-400"
                    }`}
                  >
                    <Laptop className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-white truncate">
                        {peer.device_name}
                      </span>
                      {peer.is_current_device && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-sky-500/20 text-sky-400">
                          This Device
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-zinc-500 block truncate font-mono">
                      {peer.games_count} games &bull; {formatIsoDate(peer.last_active)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Architecture & Offline-First Information */}
      <div className="p-3.5 rounded-xl bg-white/[0.01] border border-white/5 flex items-start gap-3">
        <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <div className="text-[11px] text-zinc-400 leading-relaxed">
          <span className="font-semibold text-zinc-300">Conflict-Free Distributed State: </span>
          Each device writes exclusively to its own state file in the sync folder. OpenPlay performs multi-leader
          CRDT playtime merging and Last-Write-Wins metadata synchronization without overwriting local install paths
          or requiring any third-party servers.
        </div>
      </div>
    </div>
  );
};
