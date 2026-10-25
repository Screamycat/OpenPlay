import React, { useState } from "react";
import { Game } from "../types/game";
import { X, Plus, FolderOpen, FileCode, Sparkles, Loader2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { MetadataComparison } from "./MetadataDiffModal";

interface AddGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddGame: (game: Partial<Game>) => void;
}

export const AddGameModal: React.FC<AddGameModalProps> = ({
  isOpen,
  onClose,
  onAddGame,
}) => {
  const [title, setTitle] = useState("");
  const [executablePath, setExecutablePath] = useState("");
  const [installDirectory, setInstallDirectory] = useState("");
  const [launchArguments, setLaunchArguments] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [backgroundImage, setBackgroundImage] = useState("");
  const [developer, setDeveloper] = useState("");
  const [publisher, setPublisher] = useState("");
  const [genres, setGenres] = useState("");
  const [description, setDescription] = useState("");
  const [isScanningExe, setIsScanningExe] = useState(false);
  const [isFetchingMeta, setIsFetchingMeta] = useState(false);

  if (!isOpen) return null;

  const handleBrowseExe = async () => {
    try {
      const path = await invoke<string | null>("select_file", {
        filter: "Executable (*.exe;*.lnk;*.bat;*.cmd)|*.exe;*.lnk;*.bat;*.cmd|All files (*.*)|*.*",
      });
      if (path) {
        setIsScanningExe(true);
        const candidate = await invoke<Game>("scan_local_executable", { path });
        setExecutablePath(candidate.executable_path || path);
        if (!title.trim()) setTitle(candidate.title);
        if (candidate.install_directory) setInstallDirectory(candidate.install_directory);
      }
    } catch (err) {
      console.warn("Failed to browse executable:", err);
    } finally {
      setIsScanningExe(false);
    }
  };

  const handleBrowseFolder = async () => {
    try {
      const path = await invoke<string | null>("select_directory");
      if (path) {
        setInstallDirectory(path);
      }
    } catch (err) {
      console.warn("Failed to browse folder:", err);
    }
  };

  const handleAutoFetchMeta = async () => {
    if (!title.trim()) return;
    setIsFetchingMeta(true);
    try {
      const meta = await invoke<MetadataComparison>("fetch_metadata_from_source", {
        title: title.trim(),
        provider: "steam",
      });
      if (meta.cover_image && !coverImage) setCoverImage(meta.cover_image);
      if (meta.background_image && !backgroundImage) setBackgroundImage(meta.background_image);
      if (meta.developer && !developer) setDeveloper(meta.developer);
      if (meta.publisher && !publisher) setPublisher(meta.publisher);
      if (meta.genres && meta.genres.length > 0 && !genres) setGenres(meta.genres.join(", "));
      if (meta.description && !description) setDescription(meta.description);
    } catch (err) {
      console.warn("Could not auto-fetch metadata:", err);
    } finally {
      setIsFetchingMeta(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    onAddGame({
      id: `manual_${Date.now()}`,
      title: title.trim(),
      sorting_title: title.trim(),
      source: "Manual",
      executable_path: executablePath.trim() || undefined,
      install_directory: installDirectory.trim() || undefined,
      launch_arguments: launchArguments.trim() || undefined,
      cover_image: coverImage.trim() || undefined,
      background_image: backgroundImage.trim() || undefined,
      developer: developer.trim() || undefined,
      publisher: publisher.trim() || undefined,
      description: description.trim() || undefined,
      genres: genres
        ? genres.split(",").map((g) => g.trim()).filter(Boolean)
        : [],
      is_installed: true,
      is_favorite: false,
      playtime_seconds: 0,
      platforms: ["Windows"],
      completion_status: "Not Played",
      links: [],
      screenshots: [],
      features: [],
    });

    onClose();
    setTitle("");
    setExecutablePath("");
    setInstallDirectory("");
    setLaunchArguments("");
    setCoverImage("");
    setBackgroundImage("");
    setDeveloper("");
    setPublisher("");
    setGenres("");
    setDescription("");
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="theme-panel-surface backdrop-blur-2xl border border-white/10 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col text-zinc-200"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-cyan-500/20 text-cyan-300 rounded-xl border border-cyan-500/30">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">
                Add Local / Manual Game
              </h2>
              <p className="text-[11px] text-zinc-400">
                Register an installed PC executable, DRM-free standalone game, or custom script
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
          {/* Title & Auto-fetch Button */}
          <div>
            <label className="block text-zinc-300 font-semibold mb-1">
              Game Title *
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Hollow Knight, Dead Cells..."
                className="flex-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-white font-medium focus:outline-none focus:border-cyan-500"
              />
              <button
                type="button"
                disabled={!title.trim() || isFetchingMeta}
                onClick={handleAutoFetchMeta}
                title="Auto-fetch cover artwork and details from Steam"
                className="px-3 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-xl font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-40 shrink-0"
              >
                {isFetchingMeta ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                )}
                <span>Auto-Fetch Art</span>
              </button>
            </div>
          </div>

          {/* Executable Path with Browse Button */}
          <div>
            <label className="block text-zinc-300 font-semibold mb-1">
              Executable File (.exe)
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={executablePath}
                onChange={(e) => setExecutablePath(e.target.value)}
                placeholder="C:\Games\GameFolder\game.exe"
                className="flex-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-zinc-200 font-mono text-[11px] truncate focus:outline-none focus:border-cyan-500"
              />
              <button
                type="button"
                disabled={isScanningExe}
                onClick={handleBrowseExe}
                className="px-3.5 py-2 bg-white/10 hover:bg-white/15 text-white rounded-xl font-semibold flex items-center space-x-1.5 cursor-pointer border border-white/10 transition-colors shrink-0"
              >
                {isScanningExe ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileCode className="w-3.5 h-3.5 text-cyan-400" />
                )}
                <span>Browse .exe</span>
              </button>
            </div>
          </div>

          {/* Installation Directory */}
          <div>
            <label className="block text-zinc-300 font-semibold mb-1">
              Installation Directory (optional)
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={installDirectory}
                onChange={(e) => setInstallDirectory(e.target.value)}
                placeholder="C:\Games\GameFolder"
                className="flex-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-zinc-200 font-mono text-[11px] truncate focus:outline-none focus:border-cyan-500"
              />
              <button
                type="button"
                onClick={handleBrowseFolder}
                className="px-3.5 py-2 bg-white/10 hover:bg-white/15 text-white rounded-xl font-semibold flex items-center space-x-1.5 cursor-pointer border border-white/10 transition-colors shrink-0"
              >
                <FolderOpen className="w-3.5 h-3.5 text-zinc-400" />
                <span>Browse</span>
              </button>
            </div>
          </div>

          {/* Launch Arguments */}
          <div>
            <label className="block text-zinc-300 font-semibold mb-1">
              Launch Arguments (optional)
            </label>
            <input
              type="text"
              value={launchArguments}
              onChange={(e) => setLaunchArguments(e.target.value)}
              placeholder="-fullscreen -skipintro"
              className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-zinc-200 focus:outline-none focus:border-cyan-500 font-mono text-[11px]"
            />
          </div>

          {/* Artwork URLs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-300 font-semibold mb-1">
                Cover Poster URL / Path
              </label>
              <input
                type="text"
                value={coverImage}
                onChange={(e) => setCoverImage(e.target.value)}
                placeholder="https://... or C:\Images\cover.jpg"
                className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-zinc-200 focus:outline-none focus:border-cyan-500 font-mono text-[11px] truncate"
              />
            </div>

            <div>
              <label className="block text-zinc-300 font-semibold mb-1">
                Background Hero URL / Path
              </label>
              <input
                type="text"
                value={backgroundImage}
                onChange={(e) => setBackgroundImage(e.target.value)}
                placeholder="https://... or C:\Images\hero.jpg"
                className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-zinc-200 focus:outline-none focus:border-cyan-500 font-mono text-[11px] truncate"
              />
            </div>
          </div>

          {/* Developer & Genres */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-300 font-semibold mb-1">
                Developer / Studio
              </label>
              <input
                type="text"
                value={developer}
                onChange={(e) => setDeveloper(e.target.value)}
                placeholder="e.g. Team Cherry"
                className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-zinc-200 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-zinc-300 font-semibold mb-1">
                Genres (comma separated)
              </label>
              <input
                type="text"
                value={genres}
                onChange={(e) => setGenres(e.target.value)}
                placeholder="Metroidvania, Action"
                className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-zinc-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="pt-4 flex justify-end space-x-2 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white rounded-xl transition-colors font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-xl transition-all shadow-md active:scale-98 cursor-pointer"
            >
              Add to Library
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
