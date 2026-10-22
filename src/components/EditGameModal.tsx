import React, { useState } from "react";
import { Game } from "../types/game";
import { X, Edit3, Save } from "lucide-react";

interface EditGameModalProps {
  game: Game | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: Game) => void;
}

export const EditGameModal: React.FC<EditGameModalProps> = ({
  game,
  isOpen,
  onClose,
  onSave,
}) => {
  if (!isOpen || !game) return null;

  const [title, setTitle] = useState(game.title);
  const [developer, setDeveloper] = useState(game.developer || "");
  const [publisher, setPublisher] = useState(game.publisher || "");
  const [completionStatus, setCompletionStatus] = useState(
    game.completion_status || "Not Played"
  );
  const [playtimeMinutes, setPlaytimeMinutes] = useState(
    Math.round(game.playtime_seconds / 60)
  );
  const [coverImage, setCoverImage] = useState(game.cover_image || "");
  const [backgroundImage, setBackgroundImage] = useState(
    game.background_image || ""
  );
  const [description, setDescription] = useState(game.description || "");

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    const updated: Game = {
      ...game,
      title: title.trim(),
      developer: developer.trim() || undefined,
      publisher: publisher.trim() || undefined,
      completion_status: completionStatus,
      playtime_seconds: Math.max(0, playtimeMinutes * 60),
      cover_image: coverImage.trim() || undefined,
      background_image: backgroundImage.trim() || undefined,
      description: description.trim() || undefined,
    };

    onSave(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#12151e] border border-[#23293d] rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#202538] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Edit3 className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-bold text-slate-100">
              Edit Game: {game.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-6 space-y-4 text-xs overflow-y-auto">
          <div>
            <label className="block text-slate-400 font-semibold mb-1">
              Title
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-[#181c2a] border border-[#262c42] rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 font-semibold mb-1">
                Developer
              </label>
              <input
                type="text"
                value={developer}
                onChange={(e) => setDeveloper(e.target.value)}
                className="w-full px-3 py-2 bg-[#181c2a] border border-[#262c42] rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">
                Publisher
              </label>
              <input
                type="text"
                value={publisher}
                onChange={(e) => setPublisher(e.target.value)}
                className="w-full px-3 py-2 bg-[#181c2a] border border-[#262c42] rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 font-semibold mb-1">
                Completion Status
              </label>
              <select
                value={completionStatus}
                onChange={(e) => setCompletionStatus(e.target.value)}
                className="w-full px-3 py-2 bg-[#181c2a] border border-[#262c42] rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="Not Played">Not Played</option>
                <option value="Playing">Playing</option>
                <option value="Played">Played</option>
                <option value="Completed">Completed</option>
                <option value="Plan to Play">Plan to Play</option>
                <option value="Abandoned">Abandoned</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">
                Playtime (Minutes)
              </label>
              <input
                type="number"
                min={0}
                value={playtimeMinutes}
                onChange={(e) => setPlaytimeMinutes(Number(e.target.value))}
                className="w-full px-3 py-2 bg-[#181c2a] border border-[#262c42] rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-400 font-semibold mb-1">
              Cover Poster URL / Path
            </label>
            <input
              type="text"
              value={coverImage}
              onChange={(e) => setCoverImage(e.target.value)}
              placeholder="https://... or C:\path\to\poster.jpg"
              className="w-full px-3 py-2 bg-[#181c2a] border border-[#262c42] rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="block text-slate-400 font-semibold mb-1">
              Background Hero URL / Path
            </label>
            <input
              type="text"
              value={backgroundImage}
              onChange={(e) => setBackgroundImage(e.target.value)}
              placeholder="https://... or C:\path\to\hero.jpg"
              className="w-full px-3 py-2 bg-[#181c2a] border border-[#262c42] rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="block text-slate-400 font-semibold mb-1">
              Description
            </label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-[#181c2a] border border-[#262c42] rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Footer Buttons */}
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
              className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-lg transition-all shadow-md flex items-center space-x-1.5"
            >
              <Save className="w-4 h-4" />
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
