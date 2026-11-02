import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  X,
  Blocks,
  Upload,
  FolderOpen,
  Check,
  Trash2,
  Sliders,
  Search,
  AlertCircle,
  Loader2,
  RefreshCw,
  Power,
  Puzzle,
} from "lucide-react";
import { PluginInfo } from "../types/plugins";
import { resolveImageSrc } from "../utils/image";

interface PluginsManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPluginsChanged?: () => void;
}

export const PluginsManagerModal: React.FC<PluginsManagerModalProps> = ({
  isOpen,
  onClose,
  onPluginsChanged,
}) => {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterState, setFilterState] = useState<"all" | "enabled" | "disabled">("all");
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // In-App Config Editor state
  const [editingPlugin, setEditingPlugin] = useState<PluginInfo | null>(null);
  const [configForm, setConfigForm] = useState<Record<string, any>>({});
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadPlugins();
      setErrorMessage(null);
      setSuccessMessage(null);
    }
  }, [isOpen]);

  const loadPlugins = async () => {
    setIsLoading(true);
    try {
      const list = await invoke<PluginInfo[]>("get_installed_plugins");
      setPlugins(list);
    } catch (err: any) {
      console.error("Failed to load plugins:", err);
      setErrorMessage(typeof err === "string" ? err : "Failed to load plugins.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleTogglePlugin = async (plugin: PluginInfo) => {
    const newState = !plugin.is_enabled;
    try {
      await invoke("toggle_plugin", {
        pluginId: plugin.manifest.id,
        enabled: newState,
      });
      setSuccessMessage(
        `${plugin.manifest.name} ${newState ? "enabled" : "disabled"}.`
      );
      setTimeout(() => setSuccessMessage(null), 2500);
      await loadPlugins();
      if (onPluginsChanged) onPluginsChanged();
    } catch (err: any) {
      setErrorMessage(typeof err === "string" ? err : "Failed to toggle plugin.");
    }
  };

  const handleImportPluginZip = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const filePath = await invoke<string | null>("select_file", { filter: ".zip" });
      if (!filePath) return;

      setIsImporting(true);
      const imported = await invoke<PluginInfo>("import_plugin_zip", { zipPath: filePath });
      setSuccessMessage(
        `Successfully imported "${imported.manifest.name}" (v${imported.manifest.version})!`
      );
      await loadPlugins();
      if (onPluginsChanged) onPluginsChanged();
    } catch (err: any) {
      console.error("Failed to import plugin zip:", err);
      setErrorMessage(typeof err === "string" ? err : "Failed to import plugin package.");
    } finally {
      setIsImporting(false);
    }
  };

  const handleDeletePlugin = async (plugin: PluginInfo) => {
    const confirm = window.confirm(
      `Are you sure you want to uninstall "${plugin.manifest.name}"?`
    );
    if (!confirm) return;

    try {
      await invoke("delete_plugin", { pluginId: plugin.manifest.id });
      setSuccessMessage(`Plugin "${plugin.manifest.name}" uninstalled.`);
      setTimeout(() => setSuccessMessage(null), 2500);
      await loadPlugins();
      if (onPluginsChanged) onPluginsChanged();
    } catch (err: any) {
      setErrorMessage(typeof err === "string" ? err : "Failed to delete plugin.");
    }
  };

  const handleOpenPluginsFolder = async () => {
    try {
      await invoke("open_plugins_folder");
    } catch (err: any) {
      console.error("Failed to open plugins folder:", err);
    }
  };

  const handleOpenConfigEditor = (plugin: PluginInfo) => {
    setEditingPlugin(plugin);
    const initialConfig: Record<string, any> = {};
    if (plugin.manifest.settings) {
      for (const s of plugin.manifest.settings) {
        initialConfig[s.id] =
          plugin.config_values[s.id] !== undefined ? plugin.config_values[s.id] : s.default;
      }
    }
    setConfigForm(initialConfig);
  };

  const handleSaveConfig = async () => {
    if (!editingPlugin) return;
    setIsSavingConfig(true);
    try {
      const json = JSON.stringify(configForm);
      await invoke("save_plugin_config", {
        pluginId: editingPlugin.manifest.id,
        configJson: json,
      });

      setEditingPlugin(null);
      setSuccessMessage(`Saved settings for "${editingPlugin.manifest.name}"!`);
      setTimeout(() => setSuccessMessage(null), 3000);
      await loadPlugins();
      if (onPluginsChanged) onPluginsChanged();
    } catch (err: any) {
      setErrorMessage(typeof err === "string" ? err : "Failed to save plugin settings.");
    } finally {
      setIsSavingConfig(false);
    }
  };

  if (!isOpen) return null;

  const filteredPlugins = plugins.filter((p) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      p.manifest.name.toLowerCase().includes(q) ||
      p.manifest.author.toLowerCase().includes(q) ||
      p.manifest.description.toLowerCase().includes(q);

    if (!matchesSearch) return false;

    if (filterState === "enabled") return p.is_enabled;
    if (filterState === "disabled") return !p.is_enabled;
    return true;
  });

  return (
    <div
      onClick={onClose}
      data-theme-part="plugins-modal"
      className="fixed inset-0 z-50 theme-modal-backdrop flex items-center justify-center p-4 sm:p-6 md:p-8 select-none animate-in fade-in duration-150"
    >
      {/* Main Container */}
      <div
        onClick={(e) => e.stopPropagation()}
        data-theme-part="modal-container"
        className="theme-modal-container rounded-2xl w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden text-zinc-100 z-10"
      >
        {/* Top Header */}
        <div className="px-6 py-4 theme-modal-header shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Blocks className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-white tracking-wide">Plugins Manager</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-zinc-300 font-mono">
                  {plugins.length} {plugins.length === 1 ? "Plugin" : "Plugins"}
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Extend OpenPlay's features, integrations, and automation hooks.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2.5">
            {/* Import Plugin Button */}
            <button
              onClick={handleImportPluginZip}
              disabled={isImporting}
              className="px-3.5 py-1.5 rounded-xl theme-accent-btn text-white text-xs font-semibold flex items-center space-x-2 transition-all cursor-pointer shadow-md disabled:opacity-50"
              title="Import a .zip plugin package"
            >
              {isImporting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              <span>Import Plugin (.zip)</span>
            </button>

            {/* Open Folder Button */}
            <button
              onClick={handleOpenPluginsFolder}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white text-xs font-medium flex items-center space-x-1.5 transition-all cursor-pointer"
              title="Open Plugins Folder in File Explorer"
            >
              <FolderOpen className="w-3.5 h-3.5 text-zinc-400" />
              <span>Open Folder</span>
            </button>

            {/* Refresh */}
            <button
              onClick={loadPlugins}
              disabled={isLoading}
              className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
              title="Reload plugins"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/15 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer border border-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Notifications / Alerts */}
        {errorMessage && (
          <div className="mx-6 mt-3 p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-200 text-xs flex items-center justify-between animate-in fade-in">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-red-400 hover:text-white text-xs cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {successMessage && (
          <div className="mx-6 mt-3 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs flex items-center justify-between animate-in fade-in">
            <div className="flex items-center space-x-2">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
            <button
              onClick={() => setSuccessMessage(null)}
              className="text-emerald-400 hover:text-white text-xs cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Filter Bar & Search */}
        <div className="px-6 py-3 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/[0.01]">
          {/* Status Tabs */}
          <div className="flex items-center space-x-1.5 p-1 bg-white/5 rounded-xl border border-white/10">
            {(["all", "enabled", "disabled"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setFilterState(tab)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-all cursor-pointer ${
                  filterState === tab
                    ? "bg-white text-zinc-950 shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search plugins..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none theme-accent-focus"
            />
          </div>
        </div>

        {/* Plugins List / Grid */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {filteredPlugins.map((plugin) => {
            const iconSrc = resolveImageSrc(plugin.resolved_icon);
            const hasSettings = plugin.manifest.settings && plugin.manifest.settings.length > 0;

            return (
              <div
                key={plugin.manifest.id}
                className={`p-5 rounded-2xl border transition-all ${
                  plugin.is_enabled
                    ? "bg-white/[0.03] border-white/10 hover:border-white/20"
                    : "bg-white/[0.01] border-white/5 opacity-70"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  {/* Left: Icon & Info */}
                  <div className="flex items-start space-x-4 min-w-0 flex-1">
                    <div className="w-12 h-12 rounded-xl bg-black/40 border border-white/15 overflow-hidden flex items-center justify-center shrink-0 shadow-md">
                      {iconSrc ? (
                        <img
                          src={iconSrc}
                          alt={plugin.manifest.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Puzzle className="w-6 h-6 text-zinc-500" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-2.5 flex-wrap">
                        <h4 className="text-sm font-bold text-white">
                          {plugin.manifest.name}
                        </h4>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 font-mono text-zinc-300">
                          v{plugin.manifest.version}
                        </span>
                        <span className="text-[10px] text-zinc-400">
                          by <span className="text-zinc-200">{plugin.manifest.author}</span>
                        </span>
                      </div>

                      <p className="text-xs text-zinc-300 mt-1 line-clamp-2">
                        {plugin.manifest.description}
                      </p>

                      {/* Permissions Tags */}
                      {plugin.manifest.permissions && plugin.manifest.permissions.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
                          {plugin.manifest.permissions.map((perm) => (
                            <span
                              key={perm}
                              className="text-[9px] px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-zinc-400 font-mono"
                            >
                              {perm}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Actions & Toggle */}
                  <div className="flex items-center space-x-2.5 shrink-0">
                    {hasSettings && (
                      <button
                        onClick={() => handleOpenConfigEditor(plugin)}
                        className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer"
                        title="Configure plugin settings"
                      >
                        <Sliders className="w-3.5 h-3.5 text-zinc-400" />
                        <span>Configure</span>
                      </button>
                    )}

                    {/* Enable / Disable Switch */}
                    <button
                      onClick={() => handleTogglePlugin(plugin)}
                      className={`px-3.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer ${
                        plugin.is_enabled
                          ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25"
                          : "bg-white/5 border-white/10 text-zinc-400 hover:text-white"
                      }`}
                    >
                      <Power className="w-3.5 h-3.5" />
                      <span>{plugin.is_enabled ? "Enabled" : "Disabled"}</span>
                    </button>

                    {/* Uninstall */}
                    <button
                      onClick={() => handleDeletePlugin(plugin)}
                      className="w-8 h-8 rounded-xl bg-white/5 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 border border-white/10 hover:border-red-500/30 flex items-center justify-center transition-colors cursor-pointer"
                      title="Uninstall plugin"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {filteredPlugins.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.01] p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 mx-auto flex items-center justify-center text-zinc-500">
                <Puzzle className="w-6 h-6" />
              </div>
              <div className="text-sm font-semibold text-zinc-200">No plugins installed yet</div>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                Enhance OpenPlay by importing an extension package (.zip) or creating custom plugins.
              </p>
              <button
                onClick={handleImportPluginZip}
                disabled={isImporting}
                className="mt-2 px-4 py-2 rounded-xl theme-accent-btn text-white text-xs font-bold inline-flex items-center space-x-1.5 shadow-md cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Import Plugin (.zip)</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* In-App Plugin Settings Drawer/Modal */}
      {editingPlugin && (
        <div
          onClick={() => setEditingPlugin(null)}
          className="fixed inset-0 z-60 theme-modal-backdrop flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            data-theme-part="modal-container"
            className="relative w-full max-w-lg theme-modal-container rounded-2xl p-6 z-10 space-y-5 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center space-x-2.5">
                <Sliders className="w-5 h-5 text-blue-400" />
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Configure "{editingPlugin.manifest.name}"
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Adjust plugin configuration options directly inside OpenPlay.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditingPlugin(null)}
                className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Dynamic Settings Fields */}
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              {editingPlugin.manifest.settings?.map((setting) => {
                const currentVal = configForm[setting.id];

                return (
                  <div key={setting.id} className="space-y-1.5 p-3 rounded-xl bg-white/[0.03] border border-white/5">
                    <label className="text-xs font-semibold text-zinc-200 block">
                      {setting.label}
                    </label>

                    {setting.type === "boolean" && (
                      <button
                        type="button"
                        onClick={() =>
                          setConfigForm((prev) => ({
                            ...prev,
                            [setting.id]: !Boolean(currentVal),
                          }))
                        }
                        className={`w-full py-2 px-3 rounded-lg border text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                          currentVal
                            ? "bg-blue-500/20 border-blue-500/40 text-blue-300"
                            : "bg-white/5 border-white/10 text-zinc-400 hover:text-white"
                        }`}
                      >
                        <span>{currentVal ? "Enabled" : "Disabled"}</span>
                        {currentVal && <Check className="w-3.5 h-3.5 text-blue-400" />}
                      </button>
                    )}

                    {setting.type === "select" && setting.options && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                        {setting.options.map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() =>
                              setConfigForm((prev) => ({
                                ...prev,
                                [setting.id]: opt,
                              }))
                            }
                            className={`py-1.5 px-2 rounded-lg border text-[11px] font-medium truncate transition-colors cursor-pointer ${
                              currentVal === opt
                                ? "bg-white text-zinc-950 border-white font-bold"
                                : "bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10"
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    )}

                    {setting.type === "string" && (
                      <input
                        type="text"
                        placeholder={setting.placeholder || "Enter value..."}
                        value={currentVal || ""}
                        onChange={(e) =>
                          setConfigForm((prev) => ({
                            ...prev,
                            [setting.id]: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-1.5 bg-black/40 border border-white/10 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none theme-accent-focus font-mono"
                      />
                    )}

                    {setting.type === "number" && (
                      <input
                        type="number"
                        value={currentVal ?? setting.default ?? 0}
                        onChange={(e) =>
                          setConfigForm((prev) => ({
                            ...prev,
                            [setting.id]: Number(e.target.value),
                          }))
                        }
                        className="w-full px-3 py-1.5 bg-black/40 border border-white/10 rounded-lg text-xs font-mono text-white focus:outline-none theme-accent-focus"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end space-x-2.5 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setEditingPlugin(null)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white text-xs font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveConfig}
                disabled={isSavingConfig}
                className="px-5 py-2 rounded-xl theme-accent-btn text-white text-xs font-bold transition-all shadow-md cursor-pointer disabled:opacity-50 flex items-center space-x-1.5"
              >
                {isSavingConfig ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
