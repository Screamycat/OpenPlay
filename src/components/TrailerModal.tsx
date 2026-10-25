import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Game, GameTrailer } from "../types/game";
import { VideoPlayer } from "./VideoPlayer";
import {
  X,
  Film,
  Plus,
  Trash2,
  Play,
  Sparkles,
  Check,
  Loader2,
  Search,
} from "lucide-react";

interface TrailerModalProps {
  isOpen: boolean;
  onClose: () => void;
  game: Game;
  onSaveTrailers: (trailers: GameTrailer[]) => void;
}

export function getYouTubeEmbedUrl(
  url: string,
  autoPlay = true,
  muted = true
): string | null {
  if (!url) return null;
  const regExp =
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = url.match(regExp);
  if (match && match[1]) {
    const autoPlayParam = autoPlay ? "1" : "0";
    const muteParam = muted ? "1" : "0";
    return `https://www.youtube-nocookie.com/embed/${match[1]}?autoplay=${autoPlayParam}&mute=${muteParam}&rel=0`;
  }
  return null;
}

export function getYouTubeThumbnail(url: string): string | null {
  if (!url) return null;
  const regExp =
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = url.match(regExp);
  if (match && match[1]) {
    return `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`;
  }
  return null;
}

export const TrailerModal: React.FC<TrailerModalProps> = ({
  isOpen,
  onClose,
  game,
  onSaveTrailers,
}) => {
  if (!isOpen) return null;

  const [trailers, setTrailers] = useState<GameTrailer[]>(game.trailers || []);
  const [activeTab, setActiveTab] = useState<"store" | "custom">("store");

  // Store Fetcher State
  const [storeTrailers, setStoreTrailers] = useState<GameTrailer[]>([]);
  const [isFetchingStore, setIsFetchingStore] = useState(false);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(game.title);

  // Manual Input State
  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Active Live Preview in Modal
  const [previewTrailer, setPreviewTrailer] = useState<GameTrailer | null>(null);

  // Auto-fetch store trailers on initial modal open
  useEffect(() => {
    setTrailers(game.trailers || []);
    setSearchQuery(game.title);
    handleFetchStore(game.title);
  }, [game.id, isOpen]);

  const handleFetchStore = async (termToSearch?: string) => {
    const term = (termToSearch !== undefined ? termToSearch : searchQuery).trim();
    if (!term) return;

    setIsFetchingStore(true);
    setStoreError(null);
    try {
      const results = await invoke<GameTrailer[]>("get_store_trailers", {
        title: term,
        appid: term === game.title ? game.source_id : undefined,
      });

      setStoreTrailers(results);
      if (results.length === 0) {
        setStoreError(`No official trailers found for "${term}".`);
      }
    } catch (err: any) {
      console.error("Failed to fetch store trailers:", err);
      setStoreError(
        typeof err === "string" ? err : "Could not fetch store trailers. Check your internet connection."
      );
      setStoreTrailers([]);
    } finally {
      setIsFetchingStore(false);
    }
  };

  const handleAddStoreTrailer = (trailer: GameTrailer) => {
    if (trailers.some((t) => t.url === trailer.url)) return;
    const updated = [...trailers, trailer];
    setTrailers(updated);
    onSaveTrailers(updated);
  };

  const handleAddAllStoreTrailers = () => {
    const newItems = storeTrailers.filter(
      (st) => !trailers.some((t) => t.url === st.url)
    );
    if (newItems.length === 0) return;
    const updated = [...trailers, ...newItems];
    setTrailers(updated);
    onSaveTrailers(updated);
  };

  const handleAddCustomTrailer = (e: React.FormEvent) => {
    e.preventDefault();
    const url = newUrl.trim();
    if (!url) {
      setErrorMsg("Please enter a valid video or YouTube URL");
      return;
    }

    const title = newTitle.trim() || `Trailer ${trailers.length + 1}`;
    const ytThumb = getYouTubeThumbnail(url);
    const thumbnail = ytThumb || "";

    const updated = [
      ...trailers,
      {
        name: title,
        url,
        thumbnail,
      },
    ];

    setTrailers(updated);
    onSaveTrailers(updated);
    setNewTitle("");
    setNewUrl("");
    setErrorMsg(null);
  };

  const handleRemoveTrailer = (index: number) => {
    const updated = trailers.filter((_, i) => i !== index);
    setTrailers(updated);
    onSaveTrailers(updated);
    if (previewTrailer && trailers[index]?.url === previewTrailer.url) {
      setPreviewTrailer(null);
    }
  };

  const handleClearAllTrailers = () => {
    setTrailers([]);
    onSaveTrailers([]);
    setPreviewTrailer(null);
  };

  const previewCustomEmbed = getYouTubeEmbedUrl(newUrl.trim());
  const isDirectCustomVideo =
    /\.(mp4|webm|ogg|m4v|m3u8)(\?.*)?$/i.test(newUrl.trim()) ||
    newUrl.includes("steamstatic.com") ||
    newUrl.includes("akamaihd.net");

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#12151e]/95 backdrop-blur-2xl border border-[#23293d] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#202538] flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-cyan-500/10 rounded-xl border border-cyan-500/20 text-cyan-400">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">
                Trailers: {game.title}
              </h2>
              <p className="text-[11px] text-slate-400">
                Import official store trailers or add custom YouTube links
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-[#1a1f2e] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto text-xs flex-1">
          {/* Active Preview Player (if trailer selected for preview) */}
          {previewTrailer && (
            <div className="space-y-1.5 p-3 rounded-xl bg-black/40 border border-cyan-500/30">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-cyan-400 flex items-center space-x-1">
                  <Play className="w-3 h-3" />
                  <span>Previewing: {previewTrailer.name}</span>
                </span>
                <button
                  onClick={() => setPreviewTrailer(null)}
                  className="text-[10px] text-slate-400 hover:text-white"
                >
                  Close Preview
                </button>
              </div>
              <div className="aspect-video rounded-lg overflow-hidden bg-black border border-white/10 flex items-center justify-center">
                {(() => {
                  const ytEmbed = getYouTubeEmbedUrl(previewTrailer.url);
                  if (ytEmbed) {
                    return (
                      <iframe
                        src={ytEmbed}
                        title={previewTrailer.name}
                        className="w-full h-full border-0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    );
                  }
                  return (
                    <VideoPlayer
                      key={previewTrailer.url}
                      src={previewTrailer.url}
                      poster={previewTrailer.thumbnail}
                      controls
                      autoPlay
                      className="w-full h-full object-cover"
                    />
                  );
                })()}
              </div>
            </div>
          )}

          {/* Current Assigned Trailers Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Assigned Trailers ({trailers.length})
              </h3>
              {trailers.length > 0 && (
                <div className="flex items-center space-x-3">
                  <button
                    onClick={handleClearAllTrailers}
                    className="text-[10px] text-rose-400 hover:text-rose-300 font-semibold cursor-pointer transition-colors"
                  >
                    Clear All
                  </button>
                  <span className="text-[10px] text-emerald-400 flex items-center space-x-1">
                    <Check className="w-3 h-3" />
                    <span>Will show on game details</span>
                  </span>
                </div>
              )}
            </div>

            {trailers.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-white/10 text-center text-slate-400 text-xs">
                No trailers assigned yet. Fetch from the store below or add a custom link.
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {trailers.map((t, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-black/30 border border-white/10 hover:border-white/20 transition-all gap-3"
                  >
                    <div
                      onClick={() => setPreviewTrailer(t)}
                      className="flex items-center space-x-3 min-w-0 cursor-pointer flex-1"
                      title="Click to preview"
                    >
                      <div className="w-14 h-9 rounded-md bg-black/50 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden relative group">
                        {t.thumbnail ? (
                          <img
                            src={t.thumbnail}
                            alt={t.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Play className="w-4 h-4 text-cyan-400" />
                        )}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <Play className="w-3.5 h-3.5 text-white" />
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-white truncate text-xs hover:text-cyan-300 transition-colors">
                          {t.name}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate font-mono">
                          {t.url}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1 shrink-0">
                      <button
                        onClick={() => setPreviewTrailer(t)}
                        title="Preview trailer"
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleRemoveTrailer(idx)}
                        title="Remove trailer"
                        className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add Trailers Section: Tab Switcher (Store vs Custom) */}
          <div className="pt-2 border-t border-white/10 space-y-4">
            <div className="flex items-center space-x-2 border-b border-white/10 pb-2">
              <button
                onClick={() => setActiveTab("store")}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === "store"
                    ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Fetch from Store</span>
              </button>

              <button
                onClick={() => setActiveTab("custom")}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === "custom"
                    ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Custom URL</span>
              </button>
            </div>

            {/* Tab 1: Fetch From Store */}
            {activeTab === "store" && (
              <div className="space-y-3.5">
                {/* Search Bar */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleFetchStore();
                  }}
                  className="flex items-center space-x-2"
                >
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search game title on store..."
                      className="w-full pl-9 pr-3 py-2 bg-[#161a29] border border-[#2b334d] rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400"
                    />
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  </div>
                  <button
                    type="submit"
                    disabled={isFetchingStore}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-slate-950 font-bold rounded-xl text-xs flex items-center space-x-1.5 transition-colors cursor-pointer shrink-0"
                  >
                    {isFetchingStore ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Search className="w-3.5 h-3.5" />
                    )}
                    <span>{isFetchingStore ? "Searching..." : "Search Store"}</span>
                  </button>
                </form>

                {storeError && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
                    {storeError}
                  </div>
                )}

                {/* Store Results Header */}
                {storeTrailers.length > 0 && (
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-slate-300 font-semibold">
                      Found {storeTrailers.length} official store trailer{storeTrailers.length === 1 ? "" : "s"}
                    </span>
                    <button
                      onClick={handleAddAllStoreTrailers}
                      className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 cursor-pointer flex items-center space-x-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add All to Game</span>
                    </button>
                  </div>
                )}

                {/* Store Results Cards */}
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {storeTrailers.map((st, idx) => {
                    const isAlreadyAdded = trailers.some((t) => t.url === st.url);

                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-[#161a29] border border-[#232a3d] hover:border-white/20 transition-all gap-3"
                      >
                        <div
                          onClick={() => setPreviewTrailer(st)}
                          className="flex items-center space-x-3 min-w-0 cursor-pointer flex-1"
                          title="Click to preview"
                        >
                          <div className="w-16 h-10 rounded-md bg-black/60 border border-white/10 shrink-0 overflow-hidden relative group">
                            {st.thumbnail ? (
                              <img
                                src={st.thumbnail}
                                alt={st.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Film className="w-5 h-5 text-slate-400 m-auto" />
                            )}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <Play className="w-3.5 h-3.5 text-white" />
                            </div>
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-white truncate text-xs hover:text-cyan-300 transition-colors">
                              {st.name}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">
                              Official Store Video
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 shrink-0">
                          <button
                            onClick={() => setPreviewTrailer(st)}
                            title="Preview video"
                            className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-[11px] font-medium transition-colors cursor-pointer"
                          >
                            Preview
                          </button>

                          {isAlreadyAdded ? (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold">
                              <Check className="w-3 h-3" />
                              <span>Added</span>
                            </span>
                          ) : (
                            <button
                              onClick={() => handleAddStoreTrailer(st)}
                              className="inline-flex items-center space-x-1 px-3 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 text-[11px] font-bold transition-all shadow-md cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Add</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tab 2: Add Custom URL */}
            {activeTab === "custom" && (
              <form onSubmit={handleAddCustomTrailer} className="space-y-3">
                {errorMsg && (
                  <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
                    {errorMsg}
                  </div>
                )}

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Trailer Title (Optional)
                  </label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g. Official Gameplay Trailer"
                    className="w-full px-3.5 py-2 bg-[#161a29] border border-[#2b334d] rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Video URL (YouTube or MP4/WebM)
                  </label>
                  <input
                    type="text"
                    value={newUrl}
                    onChange={(e) => {
                      setNewUrl(e.target.value);
                      setErrorMsg(null);
                    }}
                    placeholder="https://www.youtube.com/watch?v=... or https://.../video.mp4"
                    className="w-full px-3.5 py-2 bg-[#161a29] border border-[#2b334d] rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
                  />
                </div>

                {/* Custom Live Preview */}
                {newUrl.trim() && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400">
                      Live Preview
                    </span>
                    <div className="aspect-video rounded-xl overflow-hidden bg-black/60 border border-white/10 flex items-center justify-center">
                      {previewCustomEmbed ? (
                        <iframe
                          src={previewCustomEmbed}
                          title="Preview"
                          className="w-full h-full border-0"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      ) : isDirectCustomVideo ? (
                        <VideoPlayer
                          src={newUrl.trim()}
                          controls
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-slate-500 text-xs italic">
                          Checking URL preview...
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-2.5 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs transition-all flex items-center justify-center space-x-1.5 shadow-lg cursor-pointer mt-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Trailer to Game</span>
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#202538] flex items-center justify-between bg-[#0e1017]">
          <div className="text-[11px] text-slate-400">
            {trailers.length} trailer{trailers.length === 1 ? "" : "s"} assigned
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
