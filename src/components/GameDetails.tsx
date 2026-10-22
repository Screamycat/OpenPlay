import React, { useState } from "react";
import { Game } from "../types/game";
import { resolveImageSrc, formatPlaytime, formatFileSize } from "../utils/image";
import {
  Play,
  Star,
  Edit3,
  ExternalLink,
  Sparkles,
  Monitor,
  Apple,
  Cpu,
  Loader2,
  Calendar,
  Clock,
  User,
  Building,
  HardDrive,
  FileText,
  Image as ImageIcon,
  CheckCircle,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";

interface GameDetailsProps {
  game: Game;
  onLaunch: (game: Game) => void;
  onToggleFavorite: (id: string) => void;
  onOpenEdit: (game: Game) => void;
  onFetchMetadata: (id: string) => void;
  isLaunching: boolean;
  isFetchingMeta: boolean;
  onSaveNotes: (id: string, notes: string) => void;
}

export const GameDetails: React.FC<GameDetailsProps> = ({
  game,
  onLaunch,
  onToggleFavorite,
  onOpenEdit,
  onFetchMetadata,
  isLaunching,
  isFetchingMeta,
  onSaveNotes,
}) => {
  const [activeTab, setActiveTab] = useState<"overview" | "screenshots" | "notes">("overview");
  const [userNotes, setUserNotes] = useState(game.notes || "");
  const [isNotesSaved, setIsNotesSaved] = useState(false);
  const [activeScreenshot, setActiveScreenshot] = useState<string | null>(null);

  const heroSrc = resolveImageSrc(game.background_image);
  const logoSrc = resolveImageSrc(game.logo_image);

  const handleNotesBlur = () => {
    if (userNotes !== (game.notes || "")) {
      onSaveNotes(game.id, userNotes);
      setIsNotesSaved(true);
      setTimeout(() => setIsNotesSaved(false), 2000);
    }
  };

  const handleOpenLink = async (url: string) => {
    try {
      await openUrl(url);
    } catch (e) {
      console.warn("Failed to open link:", url, e);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0a0b10] overflow-hidden select-text relative">
      {/* Scrollable details container */}
      <div className="flex-1 overflow-y-auto">
        {/* Top Hero Banner */}
        <div className="relative min-h-[280px] lg:min-h-[340px] flex flex-col justify-end p-6 overflow-hidden">
          {/* Background Hero Art with layered fade */}
          {heroSrc ? (
            <img
              src={heroSrc}
              alt={game.title}
              className="absolute inset-0 w-full h-full object-cover object-top opacity-60 pointer-events-none"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/40 via-[#0d101d] to-[#0a0b10]" />
          )}

          {/* Gradients to blend banner into dark background */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0b10] via-[#0a0b10]/60 to-transparent pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0a0b10]/80 via-transparent to-transparent pointer-events-none" />

          {/* Banner Contents */}
          <div className="relative z-10 max-w-4xl">
            {/* Title / Transparent Logo */}
            {logoSrc ? (
              <img
                src={logoSrc}
                alt={game.title}
                className="max-h-20 max-w-sm mb-3 object-contain drop-shadow-xl"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            ) : null}

            <h1 className="text-3xl lg:text-4xl font-extrabold text-white tracking-tight drop-shadow-md">
              {game.title}
            </h1>

            {/* Sub-header info: Developer, Year, Platforms, Community Score */}
            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs font-medium text-slate-300">
              {/* Star Rating / Metacritic */}
              {game.community_score && (
                <div className="flex items-center space-x-1 bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  <span className="font-bold">{game.community_score}</span>
                </div>
              )}

              {/* Release Year */}
              {game.release_date && (
                <span className="text-slate-400 font-semibold">
                  {game.release_date}
                </span>
              )}

              {/* Platform Badges */}
              <div className="flex items-center space-x-1.5">
                {game.platforms.includes("Windows") && (
                  <span className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700 text-slate-300 text-[10px]">
                    <Monitor className="w-3 h-3 text-cyan-400" />
                    <span>PC (WINDOWS)</span>
                  </span>
                )}
                {game.platforms.includes("Linux") && (
                  <span className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700 text-slate-300 text-[10px]">
                    <Cpu className="w-3 h-3 text-amber-400" />
                    <span>LINUX</span>
                  </span>
                )}
                {game.platforms.includes("Macintosh") && (
                  <span className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700 text-slate-300 text-[10px]">
                    <Apple className="w-3 h-3 text-slate-300" />
                    <span>MACINTOSH</span>
                  </span>
                )}
              </div>

              {/* Free to Play / Genre tag */}
              {game.genres.length > 0 && (
                <span className="px-2 py-0.5 rounded bg-blue-500/20 border border-blue-500/30 text-blue-300 text-[10px] uppercase font-bold tracking-wider">
                  {game.genres[0]}
                </span>
              )}
            </div>

            {/* Quick Action Links Row (Community Hub, Discussions, Store Page, PCGamingWiki) */}
            <div className="flex flex-wrap items-center gap-2 mt-4">
              {game.links.map((link) => (
                <button
                  key={link.title}
                  onClick={() => handleOpenLink(link.url)}
                  className="flex items-center space-x-1.5 px-2.5 py-1 text-xs bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 rounded-full transition-all shadow-sm"
                >
                  <ExternalLink className="w-3 h-3 text-cyan-400" />
                  <span>{link.title}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tab Navigation Row */}
        <div className="px-6 border-b border-[#1f2436] flex items-center space-x-6 bg-[#0a0b10] sticky top-0 z-20">
          <button
            onClick={() => setActiveTab("overview")}
            className={`py-3 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all ${
              activeTab === "overview"
                ? "border-cyan-400 text-cyan-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            Overview
          </button>

          <button
            onClick={() => setActiveTab("screenshots")}
            className={`py-3 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all flex items-center space-x-1.5 ${
              activeTab === "screenshots"
                ? "border-cyan-400 text-cyan-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Screenshots</span>
            {game.screenshots.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300">
                {game.screenshots.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("notes")}
            className={`py-3 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all flex items-center space-x-1.5 ${
              activeTab === "notes"
                ? "border-cyan-400 text-cyan-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Notes</span>
            {isNotesSaved && (
              <span className="text-[10px] text-emerald-400 flex items-center space-x-0.5">
                <CheckCircle className="w-3 h-3" />
                <span>Saved</span>
              </span>
            )}
          </button>
        </div>

        {/* Two-Column Details Body */}
        <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Tab Area (2 Cols on desktop) */}
          <div className="lg:col-span-2 space-y-6">
            {activeTab === "overview" && (
              <div className="space-y-6">
                {/* Description */}
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-2">
                    About the Game
                  </h3>
                  <div className="text-sm text-slate-300 leading-relaxed font-normal bg-[#11131c] p-4 rounded-xl border border-[#1e2333]">
                    {game.description ? (
                      <p className="whitespace-pre-line">{game.description}</p>
                    ) : (
                      <div className="py-6 text-center text-slate-500">
                        <p>No description available locally.</p>
                        <button
                          onClick={() => onFetchMetadata(game.id)}
                          disabled={isFetchingMeta}
                          className="mt-2 inline-flex items-center space-x-1.5 px-3 py-1 text-xs bg-cyan-600/20 text-cyan-400 border border-cyan-500/40 rounded-lg hover:bg-cyan-600/30 transition-all"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>Fetch Steam Store Description</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Play Stats Row */}
                <div className="grid grid-cols-3 gap-3 p-3.5 rounded-xl bg-[#11131c] border border-[#1e2333] text-center">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-500 mb-0.5 flex items-center justify-center space-x-1">
                      <Clock className="w-3 h-3" />
                      <span>Last Played</span>
                    </div>
                    <div className="text-xs font-semibold text-slate-200">
                      {game.last_played || "Never"}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-500 mb-0.5 flex items-center justify-center space-x-1">
                      <Play className="w-3 h-3 text-cyan-400" />
                      <span>Time Played</span>
                    </div>
                    <div className="text-xs font-semibold text-cyan-300">
                      {formatPlaytime(game.playtime_seconds)}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-500 mb-0.5 flex items-center justify-center space-x-1">
                      <CheckCircle className="w-3 h-3 text-emerald-400" />
                      <span>Completion</span>
                    </div>
                    <div className="text-xs font-semibold text-slate-200 uppercase">
                      {game.completion_status || "Not Played"}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "screenshots" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                    Official Screenshots
                  </h3>
                  {game.screenshots.length === 0 && (
                    <button
                      onClick={() => onFetchMetadata(game.id)}
                      disabled={isFetchingMeta}
                      className="flex items-center space-x-1 text-xs text-cyan-400 hover:underline"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Download Screenshots</span>
                    </button>
                  )}
                </div>

                {game.screenshots.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3">
                    {game.screenshots.map((s, idx) => (
                      <div
                        key={idx}
                        onClick={() => setActiveScreenshot(s)}
                        className="rounded-lg overflow-hidden border border-[#202538] hover:border-cyan-400 cursor-pointer aspect-video bg-black/40 group relative"
                      >
                        <img
                          src={s}
                          alt={`Screenshot ${idx + 1}`}
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                          loading="lazy"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center bg-[#11131c] rounded-xl border border-[#1e2333] text-slate-500 text-xs">
                    No screenshots downloaded yet. Click "Fetch Steam Store Description" to load them.
                  </div>
                )}
              </div>
            )}

            {activeTab === "notes" && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                  Custom User Notes
                </h3>
                <textarea
                  value={userNotes}
                  onChange={(e) => setUserNotes(e.target.value)}
                  onBlur={handleNotesBlur}
                  rows={8}
                  placeholder="Write your notes, cheat codes, walkthrough links, or controller configurations here... (Auto-saves on blur)"
                  className="w-full p-3.5 text-xs bg-[#11131c] text-slate-200 border border-[#1e2333] rounded-xl focus:outline-none focus:border-cyan-500/60 leading-relaxed placeholder-slate-600"
                />
              </div>
            )}
          </div>

          {/* Right Sidebar Column (Metadata & Features) */}
          <div className="space-y-6">
            {/* Details Panel */}
            <div className="bg-[#11131c] rounded-xl p-4 border border-[#1e2333] space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-[#1f2436] pb-2">
                Details
              </h4>

              <div className="space-y-2 text-xs">
                {game.developer && (
                  <div className="flex justify-between">
                    <span className="text-slate-500 flex items-center space-x-1">
                      <User className="w-3 h-3" />
                      <span>Developer</span>
                    </span>
                    <span className="text-slate-200 font-medium text-right">
                      {game.developer}
                    </span>
                  </div>
                )}

                {game.publisher && (
                  <div className="flex justify-between">
                    <span className="text-slate-500 flex items-center space-x-1">
                      <Building className="w-3 h-3" />
                      <span>Publisher</span>
                    </span>
                    <span className="text-slate-200 font-medium text-right">
                      {game.publisher}
                    </span>
                  </div>
                )}

                {game.date_added && (
                  <div className="flex justify-between">
                    <span className="text-slate-500 flex items-center space-x-1">
                      <Calendar className="w-3 h-3" />
                      <span>Date Added</span>
                    </span>
                    <span className="text-slate-300">{game.date_added}</span>
                  </div>
                )}

                <div className="flex justify-between">
                  <span className="text-slate-500">Source</span>
                  <span className="text-slate-300 font-medium">{game.source}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-500">Library</span>
                  <span className="text-slate-300 font-medium">{game.source}</span>
                </div>

                {game.community_score && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Community Score</span>
                    <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                      {game.community_score}
                    </span>
                  </div>
                )}

                {game.size_on_disk && (
                  <div className="flex justify-between">
                    <span className="text-slate-500 flex items-center space-x-1">
                      <HardDrive className="w-3 h-3" />
                      <span>Size On Disk</span>
                    </span>
                    <span className="text-slate-300">
                      {formatFileSize(game.size_on_disk)}
                    </span>
                  </div>
                )}

                {game.install_directory && (
                  <div className="pt-2 border-t border-[#1f2436]">
                    <span className="text-slate-500 block mb-1">
                      Installation Folder
                    </span>
                    <span
                      title={game.install_directory}
                      className="text-[10px] text-slate-400 font-mono break-all line-clamp-2 block bg-[#0a0b10] p-1.5 rounded border border-[#1e2333]"
                    >
                      {game.install_directory}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Features Tags (Pills) */}
            {game.features.length > 0 && (
              <div className="bg-[#11131c] rounded-xl p-4 border border-[#1e2333] space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-[#1f2436] pb-2">
                  Features
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {game.features.map((feat) => (
                    <span
                      key={feat}
                      className="text-[10px] px-2 py-0.8 rounded-full bg-[#181c2b] text-slate-300 border border-[#23293d]"
                    >
                      {feat}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Action / Launch Bar */}
      <footer className="h-16 bg-[#0e1017] border-t border-[#1e2230] px-6 flex items-center justify-between select-none z-20">
        {/* Left: Quick game actions (Favorite, Edit, Metadata Sync) */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => onToggleFavorite(game.id)}
            title={game.is_favorite ? "Remove from Favorites" : "Add to Favorites"}
            className={`p-2 rounded-lg border transition-all ${
              game.is_favorite
                ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                : "bg-[#151824] text-slate-400 border-[#23283a] hover:text-slate-200"
            }`}
          >
            <Star
              className={`w-4 h-4 ${game.is_favorite ? "fill-amber-400" : ""}`}
            />
          </button>

          <button
            onClick={() => onOpenEdit(game)}
            title="Edit Game Details"
            className="p-2 rounded-lg bg-[#151824] text-slate-400 border border-[#23283a] hover:text-slate-200 hover:bg-[#1d2233] transition-all"
          >
            <Edit3 className="w-4 h-4" />
          </button>

          <button
            onClick={() => onFetchMetadata(game.id)}
            disabled={isFetchingMeta}
            title="Fetch Fresh Metadata from Steam"
            className="p-2 rounded-lg bg-[#151824] text-slate-400 border border-[#23283a] hover:text-cyan-300 hover:bg-[#1d2233] transition-all disabled:opacity-50"
          >
            <Sparkles
              className={`w-4 h-4 ${isFetchingMeta ? "animate-spin text-cyan-400" : ""}`}
            />
          </button>
        </div>

        {/* Right: Big Play / Launching Button */}
        <div>
          <button
            onClick={() => onLaunch(game)}
            disabled={isLaunching}
            className={`flex items-center space-x-2 px-8 py-2.5 rounded-lg text-sm font-bold tracking-wide transition-all shadow-lg ${
              isLaunching
                ? "bg-emerald-600/50 text-white cursor-wait animate-pulse"
                : "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 hover:shadow-emerald-500/25 hover:scale-[1.02] active:scale-[0.98]"
            }`}
          >
            {isLaunching ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Launching...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-slate-950" />
                <span>Play</span>
              </>
            )}
          </button>
        </div>
      </footer>

      {/* Screenshot Lightbox Modal */}
      {activeScreenshot && (
        <div
          onClick={() => setActiveScreenshot(null)}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-6 cursor-zoom-out"
        >
          <img
            src={activeScreenshot}
            alt="Fullscreen Screenshot"
            className="max-w-full max-h-full rounded-lg shadow-2xl object-contain"
          />
        </div>
      )}
    </div>
  );
};
