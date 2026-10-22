import React, { useState } from "react";
import { Game } from "../types/game";
import { X, Plus } from "lucide-react";

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
  const [launchArguments, setLaunchArguments] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [developer, setDeveloper] = useState("");
  const [genres, setGenres] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    onAddGame({
      id: `manual_${Date.now()}`,
      title: title.trim(),
      sorting_title: title.trim(),
      source: "Manual",
      executable_path: executablePath.trim() || undefined,
      launch_arguments: launchArguments.trim() || undefined,
      cover_image: coverImage.trim() || undefined,
      developer: developer.trim() || undefined,
      genres: genres
        ? genres.split(",").map((g) => g.trim()).filter(Boolean)
        : [],
      is_installed: true,
      is_favorite: false,
      playtime_seconds: 0,
      platforms: ["Windows", "Linux"],
      completion_status: "Not Played",
      links: [],
      screenshots: [],
      features: [],
    });

    onClose();
    setTitle("");
    setExecutablePath("");
    setLaunchArguments("");
    setCoverImage("");
    setDeveloper("");
    setGenres("");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#12151e] border border-[#23293d] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#202538] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Plus className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-bold text-slate-100">
              Add Manual Game
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div>
            <label className="block text-slate-400 font-semibold mb-1">
              Game Title *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Minecraft, Super Mario World..."
              className="w-full px-3 py-2 bg-[#181c2a] border border-[#262c42] rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="block text-slate-400 font-semibold mb-1">
              Executable Path
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={executablePath}
                onChange={(e) => setExecutablePath(e.target.value)}
                placeholder="C:\Games\Game.exe or /usr/games/game"
                className="flex-1 px-3 py-2 bg-[#181c2a] border border-[#262c42] rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500 font-mono text-[11px]"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-400 font-semibold mb-1">
              Launch Arguments (optional)
            </label>
            <input
              type="text"
              value={launchArguments}
              onChange={(e) => setLaunchArguments(e.target.value)}
              placeholder="-fullscreen -skipintro"
              className="w-full px-3 py-2 bg-[#181c2a] border border-[#262c42] rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500 font-mono text-[11px]"
            />
          </div>

          <div>
            <label className="block text-slate-400 font-semibold mb-1">
              Cover Art URL or Local Path (optional)
            </label>
            <input
              type="text"
              value={coverImage}
              onChange={(e) => setCoverImage(e.target.value)}
              placeholder="https://... or C:\Images\cover.jpg"
              className="w-full px-3 py-2 bg-[#181c2a] border border-[#262c42] rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 font-semibold mb-1">
                Developer / Publisher
              </label>
              <input
                type="text"
                value={developer}
                onChange={(e) => setDeveloper(e.target.value)}
                placeholder="Indie Dev"
                className="w-full px-3 py-2 bg-[#181c2a] border border-[#262c42] rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">
                Genres (comma separated)
              </label>
              <input
                type="text"
                value={genres}
                onChange={(e) => setGenres(e.target.value)}
                placeholder="Action, Platformer"
                className="w-full px-3 py-2 bg-[#181c2a] border border-[#262c42] rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="pt-4 flex justify-end space-x-2 border-t border-[#202538]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[#181c2a] hover:bg-[#22273b] text-slate-300 rounded-lg transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-lg transition-all shadow-md"
            >
              Add to Library
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
