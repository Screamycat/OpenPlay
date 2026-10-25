import React, { useState } from "react";
import { X, Check, ArrowRight, Sparkles } from "lucide-react";
import { Game } from "../types/game";
import { resolveImageSrc } from "../utils/image";

export interface MetadataComparison {
  provider: string;
  title?: string;
  description?: string;
  developer?: string;
  publisher?: string;
  release_date?: string;
  genres: string[];
  tags: string[];
  features: string[];
  critic_score?: number;
  community_score?: number;
  age_rating?: string;
  series?: string;
  cover_image?: string;
  background_image?: string;
  links: { title: string; url: string }[];
}

interface MetadataDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentGame: Partial<Game>;
  incoming: MetadataComparison;
  onApply: (appliedFields: Partial<Game>) => void;
}

export const MetadataDiffModal: React.FC<MetadataDiffModalProps> = ({
  isOpen,
  onClose,
  currentGame,
  incoming,
  onApply,
}) => {
  // Pre-select all fields that have incoming data by default
  const [selectedFields, setSelectedFields] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    if (incoming.title) init.title = true;
    if (incoming.description) init.description = true;
    if (incoming.developer) init.developer = true;
    if (incoming.publisher) init.publisher = true;
    if (incoming.release_date) init.release_date = true;
    if (incoming.genres && incoming.genres.length > 0) init.genres = true;
    if (incoming.features && incoming.features.length > 0) init.features = true;
    if (incoming.critic_score !== undefined && incoming.critic_score !== null) init.critic_score = true;
    if (incoming.community_score !== undefined && incoming.community_score !== null) init.community_score = true;
    if (incoming.age_rating) init.age_rating = true;
    if (incoming.series) init.series = true;
    if (incoming.cover_image) init.cover_image = true;
    if (incoming.background_image) init.background_image = true;
    if (incoming.links && incoming.links.length > 0) init.links = true;
    return init;
  });

  if (!isOpen) return null;

  const toggleField = (key: string) => {
    setSelectedFields((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSelectAll = (select: boolean) => {
    const next: Record<string, boolean> = {};
    const keys = [
      "title",
      "description",
      "developer",
      "publisher",
      "release_date",
      "genres",
      "features",
      "critic_score",
      "community_score",
      "age_rating",
      "series",
      "cover_image",
      "background_image",
      "links",
    ];
    for (const k of keys) {
      if ((incoming as any)[k] !== undefined && (incoming as any)[k] !== null) {
        next[k] = select;
      }
    }
    setSelectedFields(next);
  };

  const handleApplyClick = () => {
    const applied: Partial<Game> = {};
    if (selectedFields.title && incoming.title) applied.title = incoming.title;
    if (selectedFields.description && incoming.description) applied.description = incoming.description;
    if (selectedFields.developer && incoming.developer) applied.developer = incoming.developer;
    if (selectedFields.publisher && incoming.publisher) applied.publisher = incoming.publisher;
    if (selectedFields.release_date && incoming.release_date) applied.release_date = incoming.release_date;
    if (selectedFields.genres && incoming.genres.length > 0) applied.genres = incoming.genres;
    if (selectedFields.features && incoming.features.length > 0) applied.features = incoming.features;
    if (selectedFields.critic_score && incoming.critic_score !== undefined) applied.critic_score = incoming.critic_score;
    if (selectedFields.community_score && incoming.community_score !== undefined) applied.community_score = incoming.community_score;
    if (selectedFields.age_rating && incoming.age_rating) applied.age_rating = incoming.age_rating;
    if (selectedFields.series && incoming.series) applied.series = incoming.series;
    if (selectedFields.cover_image && incoming.cover_image) applied.cover_image = incoming.cover_image;
    if (selectedFields.background_image && incoming.background_image) applied.background_image = incoming.background_image;
    if (selectedFields.links && incoming.links.length > 0) {
      // Merge unique links
      const existing = currentGame.links || [];
      const incomingLinks = incoming.links;
      const merged = [...existing];
      for (const inc of incomingLinks) {
        if (!merged.some((l) => l.url === inc.url)) {
          merged.push(inc);
        }
      }
      applied.links = merged;
    }

    onApply(applied);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-4xl bg-[#10121a]/95 border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden text-zinc-200 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-300">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <span>Review & Select Metadata</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono font-medium border border-purple-500/30">
                  {incoming.provider}
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Choose which incoming fields you want to apply. New data is pre-selected.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleSelectAll(true)}
              className="px-2.5 py-1 text-xs bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white rounded-lg border border-white/10 transition-colors"
            >
              Select All
            </button>
            <button
              onClick={() => handleSelectAll(false)}
              className="px-2.5 py-1 text-xs bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white rounded-lg border border-white/10 transition-colors"
            >
              Deselect All
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Diff Table List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3.5">
          {/* 1. Title */}
          {incoming.title && (
            <DiffRow
              label="Title"
              checked={!!selectedFields.title}
              onToggle={() => toggleField("title")}
              current={currentGame.title || "—"}
              incoming={incoming.title}
            />
          )}

          {/* 2. Developer */}
          {incoming.developer && (
            <DiffRow
              label="Developer"
              checked={!!selectedFields.developer}
              onToggle={() => toggleField("developer")}
              current={currentGame.developer || "—"}
              incoming={incoming.developer}
            />
          )}

          {/* 3. Publisher */}
          {incoming.publisher && (
            <DiffRow
              label="Publisher"
              checked={!!selectedFields.publisher}
              onToggle={() => toggleField("publisher")}
              current={currentGame.publisher || "—"}
              incoming={incoming.publisher}
            />
          )}

          {/* 4. Release Date */}
          {incoming.release_date && (
            <DiffRow
              label="Release Date"
              checked={!!selectedFields.release_date}
              onToggle={() => toggleField("release_date")}
              current={currentGame.release_date || "—"}
              incoming={incoming.release_date}
            />
          )}

          {/* 5. Series / Franchise */}
          {incoming.series && (
            <DiffRow
              label="Series / Franchise"
              checked={!!selectedFields.series}
              onToggle={() => toggleField("series")}
              current={currentGame.series || "—"}
              incoming={incoming.series}
            />
          )}

          {/* 6. Age Rating */}
          {incoming.age_rating && (
            <DiffRow
              label="Age Rating"
              checked={!!selectedFields.age_rating}
              onToggle={() => toggleField("age_rating")}
              current={currentGame.age_rating || "—"}
              incoming={incoming.age_rating}
            />
          )}

          {/* 7. Critic Score */}
          {incoming.critic_score !== undefined && incoming.critic_score !== null && (
            <DiffRow
              label="Critic Score"
              checked={!!selectedFields.critic_score}
              onToggle={() => toggleField("critic_score")}
              current={currentGame.critic_score !== undefined && currentGame.critic_score !== null ? `${currentGame.critic_score}/100` : "—"}
              incoming={`${incoming.critic_score}/100`}
            />
          )}

          {/* 8. Community Score */}
          {incoming.community_score !== undefined && incoming.community_score !== null && (
            <DiffRow
              label="Community Score"
              checked={!!selectedFields.community_score}
              onToggle={() => toggleField("community_score")}
              current={currentGame.community_score !== undefined && currentGame.community_score !== null ? `${currentGame.community_score}%` : "—"}
              incoming={`${incoming.community_score}%`}
            />
          )}

          {/* 9. Genres */}
          {incoming.genres && incoming.genres.length > 0 && (
            <DiffRow
              label="Genres"
              checked={!!selectedFields.genres}
              onToggle={() => toggleField("genres")}
              current={currentGame.genres && currentGame.genres.length > 0 ? currentGame.genres.join(", ") : "—"}
              incoming={incoming.genres.join(", ")}
            />
          )}

          {/* 10. Features & Modes */}
          {incoming.features && incoming.features.length > 0 && (
            <DiffRow
              label="Features & Modes"
              checked={!!selectedFields.features}
              onToggle={() => toggleField("features")}
              current={currentGame.features && currentGame.features.length > 0 ? currentGame.features.join(", ") : "—"}
              incoming={incoming.features.join(", ")}
            />
          )}

          {/* 11. Description */}
          {incoming.description && (
            <div className="p-3.5 bg-white/[0.03] border border-white/10 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div
                  onClick={() => toggleField("description")}
                  className="flex items-center space-x-2 text-xs font-semibold text-zinc-200 cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={!!selectedFields.description}
                    onChange={() => toggleField("description")}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 rounded bg-white/10 border-white/20 text-purple-500 accent-purple-400 cursor-pointer"
                  />
                  <span>Description ({incoming.description.length} chars)</span>
                </div>
                <span className="text-[10px] text-zinc-400">
                  {selectedFields.description ? "Applying new description" : "Keeping existing"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-2.5 bg-black/30 rounded-lg border border-white/5 max-h-36 overflow-y-auto text-zinc-400 leading-relaxed">
                  <div className="text-[10px] font-bold uppercase text-zinc-500 mb-1">Current</div>
                  {currentGame.description || <span className="italic text-zinc-600">No description</span>}
                </div>
                <div className="p-2.5 bg-purple-950/20 rounded-lg border border-purple-500/20 max-h-36 overflow-y-auto text-purple-200 leading-relaxed">
                  <div className="text-[10px] font-bold uppercase text-purple-400 mb-1">Incoming ({incoming.provider})</div>
                  {incoming.description}
                </div>
              </div>
            </div>
          )}

          {/* 12. Cover Image Visual Preview */}
          {(incoming.cover_image || currentGame.cover_image) && (
            <div
              onClick={() => incoming.cover_image && toggleField("cover_image")}
              className={`p-3.5 rounded-xl border transition-all select-none space-y-2.5 ${
                !incoming.cover_image
                  ? "bg-white/[0.02] border-white/5 opacity-70 cursor-default"
                  : selectedFields.cover_image
                  ? "bg-purple-950/20 border-purple-500/30 text-white cursor-pointer"
                  : "bg-white/[0.02] border-white/5 text-zinc-400 opacity-60 cursor-pointer"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-xs font-semibold text-zinc-200">
                  <input
                    type="checkbox"
                    disabled={!incoming.cover_image}
                    checked={!!selectedFields.cover_image}
                    onChange={() => incoming.cover_image && toggleField("cover_image")}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 rounded bg-white/10 border-white/20 text-purple-500 accent-purple-400 cursor-pointer disabled:opacity-40"
                  />
                  <span>Cover Poster Artwork</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] text-zinc-400">
                    {!incoming.cover_image
                      ? `No cover found on ${incoming.provider}`
                      : selectedFields.cover_image
                      ? "Applying incoming cover"
                      : "Keeping existing cover"}
                  </span>
                  {incoming.cover_image && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 bg-white/5 border border-white/10">
                      {selectedFields.cover_image ? "Replace" : "Keep Old"}
                    </span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center space-x-3 p-2 bg-black/30 rounded-lg border border-white/5">
                  {currentGame.cover_image ? (
                    <img
                      src={resolveImageSrc(currentGame.cover_image)}
                      alt="Current Cover"
                      className="w-14 h-20 object-cover rounded shadow"
                    />
                  ) : (
                    <div className="w-14 h-20 bg-white/5 rounded flex items-center justify-center text-[10px] text-zinc-600">None</div>
                  )}
                  <div className="min-w-0">
                    <span className="text-xs text-zinc-300 font-medium block">Current Cover</span>
                    <span className="text-[10px] text-zinc-500 block truncate">
                      {currentGame.cover_image ? "Active artwork" : "Empty"}
                    </span>
                  </div>
                </div>
                <div
                  className={`flex items-center space-x-3 p-2 rounded-lg border transition-all ${
                    selectedFields.cover_image && incoming.cover_image
                      ? "bg-purple-950/30 border-purple-500/30"
                      : "bg-black/20 border-white/5 opacity-50"
                  }`}
                >
                  {incoming.cover_image ? (
                    <img
                      src={resolveImageSrc(incoming.cover_image)}
                      alt="Incoming Cover"
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (target.src.includes("library_600x900_2x.jpg")) {
                          target.src = target.src.replace("library_600x900_2x.jpg", "header.jpg");
                        }
                      }}
                      className="w-14 h-20 object-cover rounded shadow"
                    />
                  ) : (
                    <div className="w-14 h-20 bg-white/5 rounded flex items-center justify-center text-[10px] text-zinc-600">
                      None
                    </div>
                  )}
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-purple-300 block">Incoming Cover</span>
                    <span className="text-[10px] text-purple-400/80 block truncate">
                      {incoming.cover_image ? `From ${incoming.provider}` : "Not Available"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 13. Background Hero Visual Preview */}
          {(incoming.background_image || currentGame.background_image) && (
            <div
              onClick={() => incoming.background_image && toggleField("background_image")}
              className={`p-3.5 rounded-xl border transition-all select-none space-y-2.5 ${
                !incoming.background_image
                  ? "bg-white/[0.02] border-white/5 opacity-70 cursor-default"
                  : selectedFields.background_image
                  ? "bg-purple-950/20 border-purple-500/30 text-white cursor-pointer"
                  : "bg-white/[0.02] border-white/5 text-zinc-400 opacity-60 cursor-pointer"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-xs font-semibold text-zinc-200">
                  <input
                    type="checkbox"
                    disabled={!incoming.background_image}
                    checked={!!selectedFields.background_image}
                    onChange={() => incoming.background_image && toggleField("background_image")}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 rounded bg-white/10 border-white/20 text-purple-500 accent-purple-400 cursor-pointer disabled:opacity-40"
                  />
                  <span>Hero Background Artwork</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] text-zinc-400">
                    {!incoming.background_image
                      ? `No background found on ${incoming.provider}`
                      : selectedFields.background_image
                      ? "Applying incoming hero"
                      : "Keeping existing hero"}
                  </span>
                  {incoming.background_image && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 bg-white/5 border border-white/10">
                      {selectedFields.background_image ? "Replace" : "Keep Old"}
                    </span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center space-x-3 p-2 bg-black/30 rounded-lg border border-white/5">
                  {currentGame.background_image ? (
                    <img
                      src={resolveImageSrc(currentGame.background_image)}
                      alt="Current Hero"
                      className="w-24 h-14 object-cover rounded shadow"
                    />
                  ) : (
                    <div className="w-24 h-14 bg-white/5 rounded flex items-center justify-center text-[10px] text-zinc-600">None</div>
                  )}
                  <div className="min-w-0">
                    <span className="text-xs text-zinc-300 font-medium block">Current Hero</span>
                    <span className="text-[10px] text-zinc-500 block truncate">
                      {currentGame.background_image ? "Active background" : "Empty"}
                    </span>
                  </div>
                </div>
                <div
                  className={`flex items-center space-x-3 p-2 rounded-lg border transition-all ${
                    selectedFields.background_image && incoming.background_image
                      ? "bg-purple-950/30 border-purple-500/30"
                      : "bg-black/20 border-white/5 opacity-50"
                  }`}
                >
                  {incoming.background_image ? (
                    <img
                      src={resolveImageSrc(incoming.background_image)}
                      alt="Incoming Hero"
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (target.src.includes("library_hero.jpg")) {
                          target.src = target.src.replace("library_hero.jpg", "header.jpg");
                        }
                      }}
                      className="w-24 h-14 object-cover rounded shadow"
                    />
                  ) : (
                    <div className="w-24 h-14 bg-white/5 rounded flex items-center justify-center text-[10px] text-zinc-600">
                      None
                    </div>
                  )}
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-purple-300 block">Incoming Hero</span>
                    <span className="text-[10px] text-purple-400/80 block truncate">
                      {incoming.background_image ? `From ${incoming.provider}` : "Not Available"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 bg-white/[0.02] flex items-center justify-between">
          <span className="text-xs text-zinc-400">
            Selected fields will be updated in the Game Properties editor non-destructively.
          </span>
          <div className="flex items-center space-x-2.5">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApplyClick}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold transition-all shadow-lg shadow-purple-600/20 flex items-center space-x-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Apply Selected Fields</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface DiffRowProps {
  label: string;
  checked: boolean;
  onToggle: () => void;
  current: string;
  incoming: string;
}

const DiffRow: React.FC<DiffRowProps> = ({ label, checked, onToggle, current, incoming }) => {
  return (
    <div
      onClick={onToggle}
      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
        checked
          ? "bg-purple-950/20 border-purple-500/30"
          : "bg-white/[0.02] border-white/5 hover:bg-white/[0.04]"
      }`}
    >
      <div className="flex items-center space-x-3 w-1/4">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          className="w-4 h-4 rounded bg-white/10 border-white/20 text-purple-500 accent-purple-400 cursor-pointer"
        />
        <span className="text-xs font-semibold text-zinc-200">{label}</span>
      </div>

      <div className="flex-1 grid grid-cols-2 gap-4 text-xs">
        <div className="truncate text-zinc-400">
          <span className="text-[10px] text-zinc-600 uppercase font-mono mr-1.5">Old:</span>
          {current}
        </div>
        <div className={`truncate font-medium flex items-center space-x-1 ${checked ? "text-purple-200" : "text-zinc-400"}`}>
          <ArrowRight className="w-3 h-3 text-purple-400 shrink-0" />
          <span className="truncate">{incoming}</span>
        </div>
      </div>
    </div>
  );
};
