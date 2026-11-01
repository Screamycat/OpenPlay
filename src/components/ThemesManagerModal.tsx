import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  X,
  Palette,
  Upload,
  FolderOpen,
  Check,
  Trash2,
  Sliders,
  ChevronLeft,
  ChevronRight,
  Eye,
  Search,
  Sparkles,
  AlertCircle,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { ThemeInfo } from "../types/themes";
import { resolveImageSrc } from "../utils/image";
import { applyTheme } from "../utils/themeEngine";

interface ThemesManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onThemeChanged?: (theme: ThemeInfo) => void;
}

export const ThemesManagerModal: React.FC<ThemesManagerModalProps> = ({
  isOpen,
  onClose,
  onThemeChanged,
}) => {
  const [themes, setThemes] = useState<ThemeInfo[]>([]);
  const [activeThemeId, setActiveThemeId] = useState<string>("default");
  const [selectedTheme, setSelectedTheme] = useState<ThemeInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Carousel & Lightbox state
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // In-App Config Editor state
  const [editingTheme, setEditingTheme] = useState<ThemeInfo | null>(null);
  const [configForm, setConfigForm] = useState<Record<string, any>>({});
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadThemes();
      setErrorMessage(null);
      setSuccessMessage(null);
    }
  }, [isOpen]);

  const loadThemes = async () => {
    setIsLoading(true);
    try {
      const list = await invoke<ThemeInfo[]>("get_installed_themes");
      const currentActiveId = await invoke<string>("get_active_theme_id");
      setThemes(list);
      setActiveThemeId(currentActiveId);

      const current = list.find((t) => t.manifest.id === currentActiveId) || list[0] || null;
      setSelectedTheme(current);
      setActiveSlideIndex(0);
    } catch (err: any) {
      console.error("Failed to load themes:", err);
      setErrorMessage(typeof err === "string" ? err : "Failed to load themes.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectThemeForPreview = (theme: ThemeInfo) => {
    setSelectedTheme(theme);
    setActiveSlideIndex(0);
  };

  const handleApplyTheme = async (theme: ThemeInfo) => {
    try {
      await invoke("set_active_theme", { themeId: theme.manifest.id });
      setActiveThemeId(theme.manifest.id);
      applyTheme(theme);
      if (onThemeChanged) onThemeChanged(theme);
      setSuccessMessage(`Applied theme: "${theme.manifest.name}"`);
      setTimeout(() => setSuccessMessage(null), 3000);
      await loadThemes();
    } catch (err: any) {
      setErrorMessage(typeof err === "string" ? err : "Failed to apply theme.");
    }
  };

  const handleImportThemeZip = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const filePath = await invoke<string | null>("select_file", { filter: ".zip" });
      if (!filePath) return;

      setIsImporting(true);
      const imported = await invoke<ThemeInfo>("import_theme_zip", { zipPath: filePath });
      setSuccessMessage(`Successfully imported "${imported.manifest.name}" (v${imported.manifest.version})!`);
      await loadThemes();
      setSelectedTheme(imported);
      setActiveSlideIndex(0);
    } catch (err: any) {
      console.error("Failed to import theme zip:", err);
      setErrorMessage(typeof err === "string" ? err : "Failed to import theme package.");
    } finally {
      setIsImporting(false);
    }
  };

  const handleDeleteTheme = async (theme: ThemeInfo) => {
    if (theme.is_builtin) return;
    const confirm = window.confirm(`Are you sure you want to delete the theme "${theme.manifest.name}"?`);
    if (!confirm) return;

    try {
      await invoke("delete_theme", { themeId: theme.manifest.id });
      setSuccessMessage(`Theme "${theme.manifest.name}" deleted.`);
      await loadThemes();
    } catch (err: any) {
      setErrorMessage(typeof err === "string" ? err : "Failed to delete theme.");
    }
  };

  const handleOpenThemesFolder = async () => {
    try {
      await invoke("open_themes_folder");
    } catch (err: any) {
      console.error("Failed to open themes folder:", err);
    }
  };

  const handleOpenConfigEditor = (theme: ThemeInfo) => {
    setEditingTheme(theme);
    // Initialize config form with saved values or defaults
    const initialConfig: Record<string, any> = {};
    if (theme.manifest.settings) {
      for (const s of theme.manifest.settings) {
        initialConfig[s.id] =
          theme.config_values[s.id] !== undefined ? theme.config_values[s.id] : s.default;
      }
    }
    setConfigForm(initialConfig);
  };

  const handleSaveConfig = async () => {
    if (!editingTheme) return;
    setIsSavingConfig(true);
    try {
      const json = JSON.stringify(configForm);
      await invoke("save_theme_config", {
        themeId: editingTheme.manifest.id,
        configJson: json,
      });

      // Update in local state
      const updatedTheme: ThemeInfo = {
        ...editingTheme,
        config_values: configForm,
      };

      if (editingTheme.manifest.id === activeThemeId) {
        applyTheme(updatedTheme);
        if (onThemeChanged) onThemeChanged(updatedTheme);
      }

      setEditingTheme(null);
      setSuccessMessage(`Saved settings for "${editingTheme.manifest.name}"!`);
      setTimeout(() => setSuccessMessage(null), 3000);
      await loadThemes();
    } catch (err: any) {
      setErrorMessage(typeof err === "string" ? err : "Failed to save theme settings.");
    } finally {
      setIsSavingConfig(false);
    }
  };

  if (!isOpen) return null;

  const filteredThemes = themes.filter((t) => {
    const q = searchQuery.toLowerCase();
    return (
      t.manifest.name.toLowerCase().includes(q) ||
      t.manifest.author.toLowerCase().includes(q) ||
      t.manifest.description.toLowerCase().includes(q)
    );
  });

  const previewScreenshots = selectedTheme?.resolved_screenshots || [];
  const currentSlide = previewScreenshots[activeSlideIndex] || null;

  return (
    <div
      onClick={onClose}
      data-theme-part="themes-modal"
      className="fixed inset-0 z-50 theme-modal-backdrop flex items-center justify-center p-4 sm:p-6 md:p-8 select-none animate-in fade-in duration-150"
    >
      {/* Main Container */}
      <div
        onClick={(e) => e.stopPropagation()}
        data-theme-part="modal-container"
        className="theme-modal-container rounded-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden text-zinc-100 z-10"
      >
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02] shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center theme-accent-text">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-white tracking-wide">Themes Manager</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-zinc-300 font-mono">
                  {themes.length} {themes.length === 1 ? "Theme" : "Themes"}
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Customize OpenPlay's appearance, layout, and visual styles.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2.5">
            {/* Import Theme Button */}
            <button
              onClick={handleImportThemeZip}
              disabled={isImporting}
              className="px-3.5 py-1.5 rounded-xl theme-accent-btn text-white text-xs font-semibold flex items-center space-x-2 transition-all cursor-pointer shadow-md disabled:opacity-50"
              title="Import a .zip theme package"
            >
              {isImporting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              <span>Import Theme (.zip)</span>
            </button>

            {/* Open Folder Button */}
            <button
              onClick={handleOpenThemesFolder}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white text-xs font-medium flex items-center space-x-1.5 transition-all cursor-pointer"
              title="Open Themes Folder in File Explorer"
            >
              <FolderOpen className="w-3.5 h-3.5 text-zinc-400" />
              <span>Open Folder</span>
            </button>

            {/* Refresh */}
            <button
              onClick={loadThemes}
              disabled={isLoading}
              className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
              title="Reload themes"
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

        {/* Content Body: Left Gallery + Right Showcase */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
          {/* Left Side: Installed Themes List & Search */}
          <div className="w-full md:w-80 border-r border-white/10 flex flex-col bg-black/20 shrink-0">
            {/* Search Filter */}
            <div className="p-3 border-b border-white/10">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search installed themes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none theme-accent-focus"
                />
              </div>
            </div>

            {/* List of Themes */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {filteredThemes.map((theme) => {
                const isSelected = selectedTheme?.manifest.id === theme.manifest.id;
                const isActive = theme.manifest.id === activeThemeId;
                const iconSrc = resolveImageSrc(theme.resolved_icon);

                return (
                  <div
                    key={theme.manifest.id}
                    onClick={() => handleSelectThemeForPreview(theme)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between group ${
                      isSelected
                        ? "bg-white/[0.08] border-[var(--app-accent-color)] shadow-md"
                        : "bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/10"
                    }`}
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      {/* Theme Icon */}
                      <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
                        {iconSrc ? (
                          <img
                            src={iconSrc}
                            alt={theme.manifest.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Palette className="w-5 h-5 text-zinc-500" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-1.5">
                          <span className="text-xs font-bold text-white truncate">
                            {theme.manifest.name}
                          </span>
                          {theme.is_builtin && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/10 text-zinc-400 font-mono">
                              BUILT-IN
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-400 truncate">
                          by {theme.manifest.author} • v{theme.manifest.version}
                        </div>
                      </div>
                    </div>

                    {/* Active Checkmark Pill */}
                    {isActive ? (
                      <span className="w-5 h-5 rounded-full theme-accent-bg flex items-center justify-center text-white shrink-0 shadow-sm" title="Active Theme">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </span>
                    ) : (
                      <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-300 transition-colors shrink-0" />
                    )}
                  </div>
                );
              })}

              {filteredThemes.length === 0 && (
                <div className="p-8 text-center text-zinc-500 text-xs">
                  No themes found matching your search.
                </div>
              )}
            </div>
          </div>

          {/* Right Side: Selected Theme Hero, Carousel & Settings */}
          {selectedTheme ? (
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-6 space-y-6">
              {/* Header Info Banner */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
                <div className="flex items-start space-x-4">
                  {/* Big Theme Icon */}
                  <div className="w-14 h-14 rounded-2xl bg-black/50 border border-white/15 overflow-hidden flex items-center justify-center shrink-0 shadow-lg">
                    {selectedTheme.resolved_icon ? (
                      <img
                        src={resolveImageSrc(selectedTheme.resolved_icon)}
                        alt={selectedTheme.manifest.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Palette className="w-7 h-7 theme-accent-text" />
                    )}
                  </div>

                  <div>
                    <div className="flex items-center space-x-2.5">
                      <h3 className="text-lg font-extrabold text-white">
                        {selectedTheme.manifest.name}
                      </h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 font-mono text-zinc-300">
                        v{selectedTheme.manifest.version}
                      </span>
                      {selectedTheme.manifest.id === activeThemeId && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full theme-accent-pill font-mono font-bold tracking-wider">
                          ACTIVE THEME
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-400 mt-0.5">
                      Created by <span className="text-zinc-200 font-medium">{selectedTheme.manifest.author}</span>
                    </div>
                    <p className="text-xs text-zinc-300 mt-2 max-w-2xl leading-relaxed">
                      {selectedTheme.manifest.description}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-2 shrink-0">
                  {selectedTheme.manifest.settings && selectedTheme.manifest.settings.length > 0 && (
                    <button
                      onClick={() => handleOpenConfigEditor(selectedTheme)}
                      className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer"
                    >
                      <Sliders className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Theme Settings</span>
                    </button>
                  )}

                  {selectedTheme.manifest.id !== activeThemeId ? (
                    <button
                      onClick={() => handleApplyTheme(selectedTheme)}
                      className="px-4 py-2 rounded-xl theme-accent-btn text-white text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer shadow-md"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Apply Theme</span>
                    </button>
                  ) : (
                    <div className="px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center space-x-1.5">
                      <Check className="w-3.5 h-3.5" />
                      <span>Currently Active</span>
                    </div>
                  )}

                  {!selectedTheme.is_builtin && (
                    <button
                      onClick={() => handleDeleteTheme(selectedTheme)}
                      className="w-9 h-9 rounded-xl bg-white/5 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 border border-white/10 hover:border-red-500/30 flex items-center justify-center transition-colors cursor-pointer"
                      title="Uninstall Theme"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Screenshot Carousel Showcase (Enforcing 3+ Images) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center space-x-2">
                    <span>Theme Previews</span>
                    <span className="text-[10px] text-zinc-500 font-mono font-normal">
                      ({previewScreenshots.length} {previewScreenshots.length === 1 ? "Screenshot" : "Screenshots"})
                    </span>
                  </h4>

                  {previewScreenshots.length > 1 && (
                    <div className="flex items-center space-x-1.5">
                      <button
                        onClick={() =>
                          setActiveSlideIndex((prev) =>
                            prev === 0 ? previewScreenshots.length - 1 : prev - 1
                          )
                        }
                        className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer border border-white/10"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="text-xs font-mono text-zinc-400 px-2">
                        {activeSlideIndex + 1} / {previewScreenshots.length}
                      </span>
                      <button
                        onClick={() =>
                          setActiveSlideIndex((prev) =>
                            prev === previewScreenshots.length - 1 ? 0 : prev + 1
                          )
                        }
                        className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer border border-white/10"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Main Large Slide Display */}
                {currentSlide ? (
                  <div className="relative group rounded-2xl overflow-hidden border border-white/10 bg-black/60 aspect-video flex items-center justify-center shadow-xl">
                    <img
                      src={resolveImageSrc(currentSlide)}
                      alt={`Preview ${activeSlideIndex + 1}`}
                      className="w-full h-full object-contain"
                    />

                    {/* Expand / Lightbox overlay button */}
                    <button
                      onClick={() => setLightboxImage(resolveImageSrc(currentSlide) || null)}
                      className="absolute bottom-4 right-4 px-3 py-1.5 rounded-xl bg-black/75 hover:bg-black/90 backdrop-blur-md text-white border border-white/20 text-xs font-medium flex items-center space-x-1.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow-lg"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View Full Resolution</span>
                    </button>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-12 text-center text-zinc-500 text-xs">
                    No preview screenshots available for this theme.
                  </div>
                )}

                {/* Thumbnail Strip */}
                {previewScreenshots.length > 1 && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5 pt-1">
                    {previewScreenshots.map((shot, idx) => {
                      const isThumbActive = idx === activeSlideIndex;
                      const resolved = resolveImageSrc(shot);
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setActiveSlideIndex(idx)}
                          className={`relative rounded-xl overflow-hidden aspect-video border transition-all cursor-pointer ${
                            isThumbActive
                              ? "ring-2 ring-[var(--app-accent-color)] border-transparent scale-102 shadow-md"
                              : "border-white/10 opacity-60 hover:opacity-100 hover:border-white/30"
                          }`}
                        >
                          <img
                            src={resolved}
                            alt={`Thumb ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Manifest Metadata Details */}
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-2">
                <h5 className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                  Theme Package Details
                </h5>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] text-zinc-500 block">Identifier</span>
                    <span className="font-mono text-zinc-200">{selectedTheme.manifest.id}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 block">Version</span>
                    <span className="font-mono text-zinc-200">{selectedTheme.manifest.version}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 block">Stylesheet</span>
                    <span className="font-mono text-zinc-200">{selectedTheme.manifest.css || "theme.css"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 block">Settings Configurable</span>
                    <span className="font-mono text-zinc-200">
                      {selectedTheme.manifest.settings?.length || 0} options
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center p-12 text-zinc-500 text-sm">
              Select a theme from the left to preview.
            </div>
          )}
        </div>
      </div>

      {/* Lightbox Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-60 bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setLightboxImage(null)}
        >
          <div className="relative max-w-6xl max-h-[92vh] w-full flex items-center justify-center">
            <img
              src={lightboxImage}
              alt="Full resolution preview"
              className="max-w-full max-h-[90vh] object-contain rounded-xl border border-white/10 shadow-2xl"
            />
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/70 hover:bg-black/90 text-white flex items-center justify-center transition-colors cursor-pointer border border-white/20"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* In-App Theme Settings Drawer/Modal */}
      {editingTheme && (
        <div
          onClick={() => setEditingTheme(null)}
          className="fixed inset-0 z-60 theme-modal-backdrop flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            data-theme-part="modal-container"
            className="relative w-full max-w-lg theme-modal-container rounded-2xl p-6 z-10 space-y-5 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center space-x-2.5">
                <Sliders className="w-5 h-5 theme-accent-text" />
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Customize "{editingTheme.manifest.name}"
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Adjust in-app theme variables without editing files.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditingTheme(null)}
                className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Dynamic Settings Fields */}
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              {editingTheme.manifest.settings?.map((setting) => {
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
                            ? "theme-accent-subtle-bg theme-accent-subtle-border text-white"
                            : "bg-white/5 border-white/10 text-zinc-400 hover:text-white"
                        }`}
                      >
                        <span>{currentVal ? "Enabled" : "Disabled"}</span>
                        {currentVal && <Check className="w-3.5 h-3.5 theme-accent-text" />}
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

                    {setting.type === "color" && (
                      <div className="flex items-center space-x-2">
                        <input
                          type="color"
                          value={currentVal || "#a855f7"}
                          onChange={(e) =>
                            setConfigForm((prev) => ({
                              ...prev,
                              [setting.id]: e.target.value,
                            }))
                          }
                          className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                        />
                        <input
                          type="text"
                          value={currentVal || "#a855f7"}
                          onChange={(e) =>
                            setConfigForm((prev) => ({
                              ...prev,
                              [setting.id]: e.target.value,
                            }))
                          }
                          className="flex-1 px-3 py-1.5 bg-black/40 border border-white/10 rounded-lg text-xs font-mono text-zinc-200 focus:outline-none theme-accent-focus"
                        />
                      </div>
                    )}

                    {setting.type === "number" && (
                      <input
                        type="number"
                        min={setting.min}
                        max={setting.max}
                        step={setting.step || 1}
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

                    {setting.type === "text" && (
                      <input
                        type="text"
                        value={currentVal || ""}
                        onChange={(e) =>
                          setConfigForm((prev) => ({
                            ...prev,
                            [setting.id]: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-1.5 bg-black/40 border border-white/10 rounded-lg text-xs text-white focus:outline-none theme-accent-focus"
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
                onClick={() => setEditingTheme(null)}
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
