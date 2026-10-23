import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Game, GameLink } from "../types/game";
import {
  X,
  Save,
  Info,
  Tag,
  Trophy,
  HardDrive,
  FileText,
  Image,
  Link2,
  FolderOpen,
  FileCode,
  ExternalLink,
  Plus,
  Trash2,
  Copy,
  Check,
  Sparkles,
  Clock,
  Calendar,
  Hash,
  Gamepad2,
} from "lucide-react";

interface EditGameModalProps {
  game: Game | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: Game) => void;
  onOpenSteamGridDB?: (game: Game) => void;
}

type TabKey =
  | "general"
  | "installation"
  | "tags"
  | "scores"
  | "description"
  | "artwork"
  | "links";

export const EditGameModal: React.FC<EditGameModalProps> = ({
  game,
  isOpen,
  onClose,
  onSave,
  onOpenSteamGridDB,
}) => {
  if (!isOpen || !game) return null;

  const [activeTab, setActiveTab] = useState<TabKey>("general");
  const [copiedId, setCopiedId] = useState(false);

  // Tab 1: General
  const [title, setTitle] = useState(game.title || "");
  const [sortingTitle, setSortingTitle] = useState(game.sorting_title || "");
  const [developer, setDeveloper] = useState(game.developer || "");
  const [publisher, setPublisher] = useState(game.publisher || "");
  const [releaseDate, setReleaseDate] = useState(game.release_date || "");
  const [series, setSeries] = useState(game.series || "");
  const [ageRating, setAgeRating] = useState(game.age_rating || "");
  const [region, setRegion] = useState(game.region || "");

  // Tab 2: Installation & Launch
  const [source, setSource] = useState(game.source || "Manual");
  const [sourceId, setSourceId] = useState(game.source_id || "");
  const [isInstalled, setIsInstalled] = useState(game.is_installed ?? true);
  const [installDirectory, setInstallDirectory] = useState(game.install_directory || "");
  const [executablePath, setExecutablePath] = useState(game.executable_path || "");
  const [launchArguments, setLaunchArguments] = useState(game.launch_arguments || "");
  const [sizeOnDiskMB, setSizeOnDiskMB] = useState(
    game.size_on_disk ? Math.round(game.size_on_disk / (1024 * 1024)) : 0
  );

  // Tab 3: Tags & Categorization
  const [completionStatus, setCompletionStatus] = useState(
    game.completion_status || "Not Played"
  );
  const [genres, setGenres] = useState<string[]>(game.genres || []);
  const [categories, setCategories] = useState<string[]>(game.categories || []);
  const [features, setFeatures] = useState<string[]>(game.features || []);
  const [tags, setTags] = useState<string[]>(game.tags || []);
  const [platforms, setPlatforms] = useState<string[]>(
    game.platforms && game.platforms.length > 0 ? game.platforms : ["Windows"]
  );

  // Tab 4: Scores & Playtime
  const [userRating, setUserRating] = useState<number | "">(
    game.user_rating !== undefined && game.user_rating !== null ? game.user_rating : ""
  );
  const [criticScore, setCriticScore] = useState<number | "">(
    game.critic_score !== undefined && game.critic_score !== null ? game.critic_score : ""
  );
  const [communityScore, setCommunityScore] = useState<number | "">(
    game.community_score !== undefined && game.community_score !== null ? game.community_score : ""
  );
  const totalMinutes = Math.round(game.playtime_seconds / 60);
  const [playtimeHours, setPlaytimeHours] = useState(Math.floor(totalMinutes / 60));
  const [playtimeMins, setPlaytimeMins] = useState(totalMinutes % 60);
  const [playCount, setPlayCount] = useState<number>(game.play_count || 0);
  const [lastPlayed, setLastPlayed] = useState(game.last_played || "");
  const [dateAdded, setDateAdded] = useState(game.date_added || "");

  // Tab 5: Description & Notes
  const [description, setDescription] = useState(game.description || "");
  const [notes, setNotes] = useState(game.notes || "");

  // Tab 6: Artwork & Media
  const [coverImage, setCoverImage] = useState(game.cover_image || "");
  const [backgroundImage, setBackgroundImage] = useState(game.background_image || "");
  const [logoImage, setLogoImage] = useState(game.logo_image || "");
  const [iconImage, setIconImage] = useState(game.icon_image || "");

  // Tab 7: Links
  const [links, setLinks] = useState<GameLink[]>(game.links || []);
  const [newLinkTitle, setNewLinkTitle] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");

  // Tag input temporary buffer
  const [tagInput, setTagInput] = useState<{ [key: string]: string }>({});

  const handleCopyId = () => {
    navigator.clipboard.writeText(game.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleBrowseDirectory = async () => {
    try {
      const selected = await invoke<string | null>("select_directory");
      if (selected) {
        setInstallDirectory(selected);
      }
    } catch (e) {
      console.warn("Browse directory error:", e);
    }
  };

  const handleBrowseFile = async () => {
    try {
      const selected = await invoke<string | null>("select_file", {
        filter: "Executable (*.exe)|*.exe|All files (*.*)|*.*",
      });
      if (selected) {
        setExecutablePath(selected);
      }
    } catch (e) {
      console.warn("Browse file error:", e);
    }
  };

  const handleOpenFolder = async (path: string) => {
    if (!path.trim()) return;
    try {
      await openUrl(`file:///${path}`);
    } catch (e) {
      console.warn("Failed to open folder:", e);
    }
  };

  const handleAddLink = () => {
    if (!newLinkUrl.trim()) return;
    setLinks([
      ...links,
      {
        title: newLinkTitle.trim() || "Website",
        url: newLinkUrl.trim(),
      },
    ]);
    setNewLinkTitle("");
    setNewLinkUrl("");
  };

  const handleRemoveLink = (idx: number) => {
    setLinks(links.filter((_, i) => i !== idx));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    const totalSecs = Math.max(0, (playtimeHours * 60 + playtimeMins) * 60);

    const updated: Game = {
      ...game,
      title: title.trim(),
      sorting_title: sortingTitle.trim() || undefined,
      developer: developer.trim() || undefined,
      publisher: publisher.trim() || undefined,
      release_date: releaseDate.trim() || undefined,
      series: series.trim() || undefined,
      age_rating: ageRating.trim() || undefined,
      region: region.trim() || undefined,

      source: source.trim() || "Manual",
      source_id: sourceId.trim() || undefined,
      is_installed: isInstalled,
      install_directory: installDirectory.trim() || undefined,
      executable_path: executablePath.trim() || undefined,
      launch_arguments: launchArguments.trim() || undefined,
      size_on_disk: sizeOnDiskMB > 0 ? sizeOnDiskMB * 1024 * 1024 : undefined,

      completion_status: completionStatus,
      genres,
      categories,
      features,
      tags,
      platforms,

      user_rating: userRating !== "" ? Number(userRating) : undefined,
      critic_score: criticScore !== "" ? Number(criticScore) : undefined,
      community_score: communityScore !== "" ? Number(communityScore) : undefined,
      playtime_seconds: totalSecs,
      play_count: playCount > 0 ? playCount : undefined,
      last_played: lastPlayed.trim() || undefined,
      date_added: dateAdded.trim() || undefined,

      description: description.trim() || undefined,
      notes: notes.trim() || undefined,

      cover_image: coverImage.trim() || undefined,
      background_image: backgroundImage.trim() || undefined,
      logo_image: logoImage.trim() || undefined,
      icon_image: iconImage.trim() || undefined,

      links,
    };

    onSave(updated);
    onClose();
  };

  // Generic tag chip adder / remover
  const addTagItem = (
    field: "genres" | "categories" | "features" | "tags" | "platforms",
    value: string
  ) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (field === "genres" && !genres.includes(trimmed)) setGenres([...genres, trimmed]);
    if (field === "categories" && !categories.includes(trimmed)) setCategories([...categories, trimmed]);
    if (field === "features" && !features.includes(trimmed)) setFeatures([...features, trimmed]);
    if (field === "tags" && !tags.includes(trimmed)) setTags([...tags, trimmed]);
    if (field === "platforms" && !platforms.includes(trimmed)) setPlatforms([...platforms, trimmed]);
    setTagInput((prev) => ({ ...prev, [field]: "" }));
  };

  const removeTagItem = (
    field: "genres" | "categories" | "features" | "tags" | "platforms",
    value: string
  ) => {
    if (field === "genres") setGenres(genres.filter((x) => x !== value));
    if (field === "categories") setCategories(categories.filter((x) => x !== value));
    if (field === "features") setFeatures(features.filter((x) => x !== value));
    if (field === "tags") setTags(tags.filter((x) => x !== value));
    if (field === "platforms") setPlatforms(platforms.filter((x) => x !== value));
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150 select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#0f121d]/95 backdrop-blur-2xl border border-white/10 rounded-2xl w-full max-w-4xl h-[700px] max-h-[92vh] shadow-2xl flex flex-col overflow-hidden text-xs text-slate-200"
      >
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-black/30 shrink-0">
          <div className="flex items-center space-x-3 min-w-0">
            {coverImage ? (
              <img
                src={coverImage}
                alt=""
                className="w-8 h-10 object-cover rounded shadow-md border border-white/10 shrink-0"
              />
            ) : (
              <div className="w-8 h-10 rounded bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 shrink-0">
                <Gamepad2 className="w-4 h-4" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-white truncate max-w-md">
                  {title || "Untitled Game"}
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-white/10 text-slate-300 text-[10px] font-semibold border border-white/10">
                  {source}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Game Properties & Settings</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body: Left Sidebar Tabs + Right Scrollable Form Pane */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Tabs Sidebar (~210px) */}
          <div className="w-52 border-r border-white/10 bg-black/20 p-2 space-y-1 shrink-0 overflow-y-auto">
            <button
              type="button"
              onClick={() => setActiveTab("general")}
              className={`w-full flex items-center space-x-2.5 px-3 py-2.5 rounded-xl text-left text-xs transition-all cursor-pointer ${
                activeTab === "general"
                  ? "bg-white/15 text-white font-bold shadow-md border-l-2 border-cyan-400"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              <Info className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>General</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("installation")}
              className={`w-full flex items-center space-x-2.5 px-3 py-2.5 rounded-xl text-left text-xs transition-all cursor-pointer ${
                activeTab === "installation"
                  ? "bg-white/15 text-white font-bold shadow-md border-l-2 border-cyan-400"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              <HardDrive className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Installation & Launch</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("tags")}
              className={`w-full flex items-center space-x-2.5 px-3 py-2.5 rounded-xl text-left text-xs transition-all cursor-pointer ${
                activeTab === "tags"
                  ? "bg-white/15 text-white font-bold shadow-md border-l-2 border-cyan-400"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              <Tag className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Categorization & Tags</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("scores")}
              className={`w-full flex items-center space-x-2.5 px-3 py-2.5 rounded-xl text-left text-xs transition-all cursor-pointer ${
                activeTab === "scores"
                  ? "bg-white/15 text-white font-bold shadow-md border-l-2 border-cyan-400"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              <Trophy className="w-4 h-4 text-yellow-400 shrink-0" />
              <span>Scores & Playtime</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("description")}
              className={`w-full flex items-center space-x-2.5 px-3 py-2.5 rounded-xl text-left text-xs transition-all cursor-pointer ${
                activeTab === "description"
                  ? "bg-white/15 text-white font-bold shadow-md border-l-2 border-cyan-400"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              <FileText className="w-4 h-4 text-purple-400 shrink-0" />
              <span>Description & Notes</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("artwork")}
              className={`w-full flex items-center space-x-2.5 px-3 py-2.5 rounded-xl text-left text-xs transition-all cursor-pointer ${
                activeTab === "artwork"
                  ? "bg-white/15 text-white font-bold shadow-md border-l-2 border-cyan-400"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              <Image className="w-4 h-4 text-rose-400 shrink-0" />
              <span>Artwork & Media</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("links")}
              className={`w-full flex items-center space-x-2.5 px-3 py-2.5 rounded-xl text-left text-xs transition-all cursor-pointer ${
                activeTab === "links"
                  ? "bg-white/15 text-white font-bold shadow-md border-l-2 border-cyan-400"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              <Link2 className="w-4 h-4 text-blue-400 shrink-0" />
              <span>Links</span>
            </button>
          </div>

          {/* Right Content Pane */}
          <form
            id="edit-game-form"
            onSubmit={handleSave}
            className="flex-1 overflow-y-auto p-6 space-y-6"
          >
            {/* TAB 1: GENERAL */}
            {activeTab === "general" && (
              <div className="space-y-4 animate-in fade-in duration-100">
                <div className="border-b border-white/10 pb-2 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    <Info className="w-4 h-4 text-cyan-400" />
                    <span>General Metadata</span>
                  </h3>
                  <span className="text-[11px] text-slate-400">Core game identification</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Title */}
                  <div className="sm:col-span-2">
                    <label className="block text-slate-300 font-semibold mb-1">
                      Title <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-400 transition-colors"
                      placeholder="e.g. Terraria"
                    />
                  </div>

                  {/* Sorting Title */}
                  <div className="sm:col-span-2">
                    <label className="block text-slate-300 font-semibold mb-1">
                      Sorting Title
                    </label>
                    <input
                      type="text"
                      value={sortingTitle}
                      onChange={(e) => setSortingTitle(e.target.value)}
                      className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-400 transition-colors"
                      placeholder="Overrides library alphabetical sorting (e.g. 'Witcher 3, The')"
                    />
                  </div>

                  {/* Developer */}
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Developer</label>
                    <input
                      type="text"
                      value={developer}
                      onChange={(e) => setDeveloper(e.target.value)}
                      className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-400 transition-colors"
                      placeholder="e.g. Re-Logic"
                    />
                  </div>

                  {/* Publisher */}
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Publisher</label>
                    <input
                      type="text"
                      value={publisher}
                      onChange={(e) => setPublisher(e.target.value)}
                      className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-400 transition-colors"
                      placeholder="e.g. 505 Games"
                    />
                  </div>

                  {/* Release Date */}
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Release Date</label>
                    <input
                      type="text"
                      value={releaseDate}
                      onChange={(e) => setReleaseDate(e.target.value)}
                      className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-400 transition-colors font-mono"
                      placeholder="YYYY-MM-DD (e.g. 2011-05-16)"
                    />
                  </div>

                  {/* Series */}
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Series</label>
                    <input
                      type="text"
                      value={series}
                      onChange={(e) => setSeries(e.target.value)}
                      className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-400 transition-colors"
                      placeholder="e.g. Terraria, Elder Scrolls"
                    />
                  </div>

                  {/* Age Rating */}
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Age Rating</label>
                    <select
                      value={ageRating}
                      onChange={(e) => setAgeRating(e.target.value)}
                      className="w-full px-3 py-2 bg-[#121624] border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-400 transition-colors"
                    >
                      <option value="">Not Rated</option>
                      <option value="ESRB Everyone">ESRB: Everyone (E)</option>
                      <option value="ESRB Everyone 10+">ESRB: Everyone 10+ (E10+)</option>
                      <option value="ESRB Teen">ESRB: Teen (T)</option>
                      <option value="ESRB Mature 17+">ESRB: Mature 17+ (M)</option>
                      <option value="PEGI 3">PEGI 3</option>
                      <option value="PEGI 7">PEGI 7</option>
                      <option value="PEGI 12">PEGI 12</option>
                      <option value="PEGI 16">PEGI 16</option>
                      <option value="PEGI 18">PEGI 18</option>
                    </select>
                  </div>

                  {/* Region */}
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Region</label>
                    <select
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                      className="w-full px-3 py-2 bg-[#121624] border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-400 transition-colors"
                    >
                      <option value="">Worldwide / Global</option>
                      <option value="North America">North America (NTSC-U)</option>
                      <option value="Europe">Europe (PAL)</option>
                      <option value="Japan">Japan (NTSC-J)</option>
                      <option value="Asia">Asia</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: INSTALLATION & LAUNCH */}
            {activeTab === "installation" && (
              <div className="space-y-4 animate-in fade-in duration-100">
                <div className="border-b border-white/10 pb-2 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    <HardDrive className="w-4 h-4 text-emerald-400" />
                    <span>Installation & Execution</span>
                  </h3>
                  <span className="text-[11px] text-slate-400">Path & executable routing</span>
                </div>

                <div className="space-y-4">
                  {/* Source / Provider & Status */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Library Source
                      </label>
                      <select
                        value={source}
                        onChange={(e) => setSource(e.target.value)}
                        className="w-full px-3 py-2 bg-[#121624] border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-400 transition-colors"
                      >
                        <option value="Steam">Steam</option>
                        <option value="Manual">Manual Executable</option>
                        <option value="Epic">Epic Games</option>
                        <option value="GOG">GOG Galaxy</option>
                        <option value="Xbox">Xbox Game Pass</option>
                        <option value="EA">EA App</option>
                        <option value="Ubisoft">Ubisoft Connect</option>
                        <option value="Emulation">Emulation</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Installation Status
                      </label>
                      <label className="flex items-center space-x-3 px-3 py-2 bg-black/40 border border-white/10 rounded-xl cursor-pointer hover:bg-black/60 transition-colors">
                        <input
                          type="checkbox"
                          checked={isInstalled}
                          onChange={(e) => setIsInstalled(e.target.checked)}
                          className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                        />
                        <span className="font-semibold text-white">Installed Locally</span>
                      </label>
                    </div>
                  </div>

                  {/* Installation Folder */}
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Installation Folder
                    </label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={installDirectory}
                        onChange={(e) => setInstallDirectory(e.target.value)}
                        className="flex-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-white font-mono text-[11px] focus:outline-none focus:border-cyan-400 transition-colors truncate"
                        placeholder="C:\Program Files (x86)\Steam\steamapps\common\..."
                      />
                      <button
                        type="button"
                        onClick={handleBrowseDirectory}
                        title="Browse local folder"
                        className="px-3 py-2 bg-white/10 hover:bg-white/15 text-white border border-white/15 rounded-xl font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer shrink-0"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span>Browse...</span>
                      </button>
                      {installDirectory && (
                        <button
                          type="button"
                          onClick={() => handleOpenFolder(installDirectory)}
                          title="Open in Windows Explorer"
                          className="px-3 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl font-semibold flex items-center space-x-1 transition-colors cursor-pointer shrink-0"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Open</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Executable Path */}
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Target Executable Path
                    </label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={executablePath}
                        onChange={(e) => setExecutablePath(e.target.value)}
                        className="flex-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-white font-mono text-[11px] focus:outline-none focus:border-cyan-400 transition-colors truncate"
                        placeholder="C:\Games\Terraria\Terraria.exe (optional for Steam games)"
                      />
                      <button
                        type="button"
                        onClick={handleBrowseFile}
                        title="Browse executable file"
                        className="px-3 py-2 bg-white/10 hover:bg-white/15 text-white border border-white/15 rounded-xl font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer shrink-0"
                      >
                        <FileCode className="w-3.5 h-3.5" />
                        <span>Browse...</span>
                      </button>
                    </div>
                  </div>

                  {/* Launch Arguments / Options */}
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Launch Arguments / Options
                    </label>
                    <input
                      type="text"
                      value={launchArguments}
                      onChange={(e) => setLaunchArguments(e.target.value)}
                      className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-white font-mono text-[11px] focus:outline-none focus:border-cyan-400 transition-colors"
                      placeholder="-windowed -novid +exec autoexec.cfg"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Arguments passed directly to the binary at launch.
                    </span>
                  </div>

                  {/* Size on Disk */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Size on Disk (MB)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={sizeOnDiskMB || ""}
                        onChange={(e) => setSizeOnDiskMB(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-white font-mono focus:outline-none focus:border-cyan-400 transition-colors"
                        placeholder="e.g. 520"
                      />
                      {sizeOnDiskMB > 1024 && (
                        <span className="text-[10px] text-slate-400 mt-0.5 block">
                          ≈ {(sizeOnDiskMB / 1024).toFixed(2)} GB
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: TAGS & CATEGORIZATION */}
            {activeTab === "tags" && (
              <div className="space-y-4 animate-in fade-in duration-100">
                <div className="border-b border-white/10 pb-2 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    <Tag className="w-4 h-4 text-amber-400" />
                    <span>Categorization & Tags</span>
                  </h3>
                  <span className="text-[11px] text-slate-400">Genres, features, and platform tags</span>
                </div>

                {/* Completion Status */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Completion Status
                  </label>
                  <select
                    value={completionStatus}
                    onChange={(e) => setCompletionStatus(e.target.value)}
                    className="w-full sm:w-1/2 px-3 py-2 bg-[#121624] border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-400 transition-colors"
                  >
                    <option value="Not Played">Not Played</option>
                    <option value="Playing">Playing</option>
                    <option value="Played">Played</option>
                    <option value="Completed">Completed</option>
                    <option value="100% Completed">100% Completed</option>
                    <option value="On Hold">On Hold</option>
                    <option value="Abandoned">Abandoned</option>
                    <option value="Plan to Play">Plan to Play</option>
                  </select>
                </div>

                {/* Genres */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Genres</label>
                  <div className="p-2.5 bg-black/40 border border-white/10 rounded-xl space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {genres.map((g) => (
                        <span
                          key={g}
                          className="px-2.5 py-1 rounded-lg bg-cyan-950/70 text-cyan-200 border border-cyan-500/30 text-xs font-semibold flex items-center space-x-1"
                        >
                          <span>{g}</span>
                          <button
                            type="button"
                            onClick={() => removeTagItem("genres", g)}
                            className="hover:text-white cursor-pointer ml-1"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={tagInput.genres || ""}
                        onChange={(e) => setTagInput({ ...tagInput, genres: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addTagItem("genres", tagInput.genres || "");
                          }
                        }}
                        placeholder="Add genre and press Enter..."
                        className="flex-1 px-2.5 py-1 bg-white/5 border border-white/10 rounded-lg text-white text-xs focus:outline-none focus:border-cyan-400"
                      />
                      <button
                        type="button"
                        onClick={() => addTagItem("genres", tagInput.genres || "")}
                        className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        Add
                      </button>
                    </div>
                    {/* Quick presets */}
                    <div className="flex flex-wrap gap-1 pt-1">
                      {["Action", "Adventure", "RPG", "Indie", "Strategy", "Simulation", "Shooter", "Platformer", "Sandbox", "Puzzle"].map(
                        (preset) => (
                          <button
                            type="button"
                            key={preset}
                            onClick={() => addTagItem("genres", preset)}
                            disabled={genres.includes(preset)}
                            className="text-[10px] px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                          >
                            + {preset}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>

                {/* Platforms */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Platforms</label>
                  <div className="p-2.5 bg-black/40 border border-white/10 rounded-xl space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {platforms.map((p) => (
                        <span
                          key={p}
                          className="px-2.5 py-1 rounded-lg bg-emerald-950/70 text-emerald-200 border border-emerald-500/30 text-xs font-semibold flex items-center space-x-1"
                        >
                          <span>{p}</span>
                          <button
                            type="button"
                            onClick={() => removeTagItem("platforms", p)}
                            className="hover:text-white cursor-pointer ml-1"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {["Windows", "Linux", "Macintosh", "Steam Deck", "PlayStation", "Xbox", "Nintendo Switch"].map(
                        (preset) => (
                          <button
                            type="button"
                            key={preset}
                            onClick={() => addTagItem("platforms", preset)}
                            disabled={platforms.includes(preset)}
                            className="text-[10px] px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                          >
                            + {preset}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>

                {/* Features & Categories */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Features</label>
                    <div className="p-2.5 bg-black/40 border border-white/10 rounded-xl space-y-2">
                      <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                        {features.map((f) => (
                          <span
                            key={f}
                            className="px-2 py-0.5 rounded bg-white/10 text-slate-200 text-[11px] flex items-center space-x-1"
                          >
                            <span>{f}</span>
                            <button
                              type="button"
                              onClick={() => removeTagItem("features", f)}
                              className="hover:text-white ml-1 cursor-pointer"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <input
                          type="text"
                          value={tagInput.features || ""}
                          onChange={(e) => setTagInput({ ...tagInput, features: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addTagItem("features", tagInput.features || "");
                            }
                          }}
                          placeholder="e.g. Single-player..."
                          className="flex-1 px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-white text-xs focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => addTagItem("features", tagInput.features || "")}
                          className="px-2 py-1 bg-white/10 text-white rounded-lg text-xs cursor-pointer"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Tags</label>
                    <div className="p-2.5 bg-black/40 border border-white/10 rounded-xl space-y-2">
                      <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                        {tags.map((t) => (
                          <span
                            key={t}
                            className="px-2 py-0.5 rounded bg-white/10 text-slate-200 text-[11px] flex items-center space-x-1"
                          >
                            <span>{t}</span>
                            <button
                              type="button"
                              onClick={() => removeTagItem("tags", t)}
                              className="hover:text-white ml-1 cursor-pointer"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <input
                          type="text"
                          value={tagInput.tags || ""}
                          onChange={(e) => setTagInput({ ...tagInput, tags: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addTagItem("tags", tagInput.tags || "");
                            }
                          }}
                          placeholder="e.g. Pixel Graphics..."
                          className="flex-1 px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-white text-xs focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => addTagItem("tags", tagInput.tags || "")}
                          className="px-2 py-1 bg-white/10 text-white rounded-lg text-xs cursor-pointer"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: SCORES & PLAYTIME */}
            {activeTab === "scores" && (
              <div className="space-y-4 animate-in fade-in duration-100">
                <div className="border-b border-white/10 pb-2 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    <Trophy className="w-4 h-4 text-yellow-400" />
                    <span>Scores, Stats & Identifiers</span>
                  </h3>
                  <span className="text-[11px] text-slate-400">Playtime history and game IDs</span>
                </div>

                {/* Score Cards (User, Critic, Community) */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-black/40 border border-white/10 rounded-xl space-y-1">
                    <label className="block text-[11px] font-bold text-amber-300 uppercase tracking-wider">
                      User Score (0-100)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={userRating}
                      onChange={(e) => setUserRating(e.target.value === "" ? "" : Number(e.target.value))}
                      className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white font-mono text-sm font-bold focus:outline-none focus:border-amber-400"
                      placeholder="e.g. 95"
                    />
                  </div>

                  <div className="p-3 bg-black/40 border border-white/10 rounded-xl space-y-1">
                    <label className="block text-[11px] font-bold text-emerald-300 uppercase tracking-wider">
                      Critic Score (0-100)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={criticScore}
                      onChange={(e) => setCriticScore(e.target.value === "" ? "" : Number(e.target.value))}
                      className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white font-mono text-sm font-bold focus:outline-none focus:border-emerald-400"
                      placeholder="e.g. 83"
                    />
                  </div>

                  <div className="p-3 bg-black/40 border border-white/10 rounded-xl space-y-1">
                    <label className="block text-[11px] font-bold text-cyan-300 uppercase tracking-wider">
                      Community Score (0-100)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={communityScore}
                      onChange={(e) => setCommunityScore(e.target.value === "" ? "" : Number(e.target.value))}
                      className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white font-mono text-sm font-bold focus:outline-none focus:border-cyan-400"
                      placeholder="e.g. 97"
                    />
                  </div>
                </div>

                {/* Playtime & Count */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1 flex items-center space-x-1.5">
                      <Clock className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Total Playtime</span>
                    </label>
                    <div className="flex items-center space-x-2">
                      <div className="flex-1 flex items-center bg-black/40 border border-white/10 rounded-xl px-2.5 py-1.5">
                        <input
                          type="number"
                          min="0"
                          value={playtimeHours}
                          onChange={(e) => setPlaytimeHours(Math.max(0, Number(e.target.value)))}
                          className="w-16 bg-transparent text-white font-mono font-bold text-sm focus:outline-none"
                        />
                        <span className="text-[11px] text-slate-400 ml-1">hrs</span>
                      </div>
                      <div className="flex-1 flex items-center bg-black/40 border border-white/10 rounded-xl px-2.5 py-1.5">
                        <input
                          type="number"
                          min="0"
                          max="59"
                          value={playtimeMins}
                          onChange={(e) => setPlaytimeMins(Math.max(0, Math.min(59, Number(e.target.value))))}
                          className="w-16 bg-transparent text-white font-mono font-bold text-sm focus:outline-none"
                        />
                        <span className="text-[11px] text-slate-400 ml-1">mins</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Play Count (Sessions)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={playCount}
                      onChange={(e) => setPlayCount(Math.max(0, Number(e.target.value)))}
                      className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-white font-mono focus:outline-none focus:border-cyan-400 transition-colors"
                      placeholder="e.g. 12"
                    />
                  </div>
                </div>

                {/* Dates: Last Played & Date Added */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1 flex items-center space-x-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>Last Played Date</span>
                    </label>
                    <input
                      type="text"
                      value={lastPlayed}
                      onChange={(e) => setLastPlayed(e.target.value)}
                      className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-white font-mono focus:outline-none focus:border-cyan-400 transition-colors"
                      placeholder="YYYY-MM-DD HH:MM (e.g. 2026-10-23 18:00)"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1 flex items-center space-x-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>Date Added</span>
                    </label>
                    <input
                      type="text"
                      value={dateAdded}
                      onChange={(e) => setDateAdded(e.target.value)}
                      className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-white font-mono focus:outline-none focus:border-cyan-400 transition-colors"
                      placeholder="YYYY-MM-DD"
                    />
                  </div>
                </div>

                {/* Game Identifiers */}
                <div className="pt-2 border-t border-white/10 space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-400 text-[11px] font-semibold mb-1 flex items-center space-x-1">
                        <Hash className="w-3 h-3 text-cyan-400" />
                        <span>Source / Store App ID</span>
                      </label>
                      <input
                        type="text"
                        value={sourceId}
                        onChange={(e) => setSourceId(e.target.value)}
                        className="w-full px-3 py-1.5 bg-black/40 border border-white/10 rounded-lg text-white font-mono text-xs focus:outline-none"
                        placeholder="e.g. 105600"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 text-[11px] font-semibold mb-1 flex items-center space-x-1">
                        <Hash className="w-3 h-3 text-slate-400" />
                        <span>OpenPlay Database ID</span>
                      </label>
                      <div className="flex items-center space-x-2">
                        <input
                          type="text"
                          readOnly
                          value={game.id}
                          className="flex-1 px-3 py-1.5 bg-black/25 border border-white/5 rounded-lg text-slate-400 font-mono text-xs cursor-default truncate"
                        />
                        <button
                          type="button"
                          onClick={handleCopyId}
                          title="Copy ID to clipboard"
                          className="px-2.5 py-1.5 bg-white/10 hover:bg-white/15 text-white rounded-lg text-xs flex items-center space-x-1 cursor-pointer"
                        >
                          {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedId ? "Copied" : "Copy"}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5: DESCRIPTION & NOTES */}
            {activeTab === "description" && (
              <div className="space-y-4 animate-in fade-in duration-100">
                <div className="border-b border-white/10 pb-2 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    <FileText className="w-4 h-4 text-purple-400" />
                    <span>Description & Notes</span>
                  </h3>
                  <span className="text-[11px] text-slate-400">Synopsis and personal notes</span>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Game Description / Synopsis
                  </label>
                  <textarea
                    rows={6}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-white text-xs leading-relaxed focus:outline-none focus:border-cyan-400 transition-colors"
                    placeholder="Game overview and storyline..."
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Personal Game Notes / Cheat Codes / Walkthrough Tips
                  </label>
                  <textarea
                    rows={4}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-white text-xs leading-relaxed focus:outline-none focus:border-cyan-400 transition-colors"
                    placeholder="Add personal notes, controller settings, build guides, or keybindings..."
                  />
                </div>
              </div>
            )}

            {/* TAB 6: ARTWORK & MEDIA */}
            {activeTab === "artwork" && (
              <div className="space-y-4 animate-in fade-in duration-100">
                <div className="border-b border-white/10 pb-2 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    <Image className="w-4 h-4 text-rose-400" />
                    <span>Artwork & Assets</span>
                  </h3>
                  {onOpenSteamGridDB && (
                    <button
                      type="button"
                      onClick={() => onOpenSteamGridDB(game)}
                      className="px-2.5 py-1 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 text-xs font-semibold flex items-center space-x-1 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Search SteamGridDB</span>
                    </button>
                  )}
                </div>

                <div className="space-y-4">
                  {/* Cover Poster */}
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Cover Poster URL / Local Path (600×900)
                    </label>
                    <div className="flex items-center space-x-3">
                      {coverImage ? (
                        <img
                          src={coverImage}
                          alt="Cover"
                          className="w-12 h-18 object-cover rounded-lg border border-white/15 shrink-0 shadow-md"
                        />
                      ) : (
                        <div className="w-12 h-18 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center text-slate-500 shrink-0">
                          No Art
                        </div>
                      )}
                      <input
                        type="text"
                        value={coverImage}
                        onChange={(e) => setCoverImage(e.target.value)}
                        className="flex-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-white font-mono text-[11px] focus:outline-none focus:border-cyan-400"
                        placeholder="https://... or C:\..."
                      />
                    </div>
                  </div>

                  {/* Background Hero */}
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Background Hero URL / Path (1920×620)
                    </label>
                    <div className="flex items-center space-x-3">
                      {backgroundImage ? (
                        <img
                          src={backgroundImage}
                          alt="Hero"
                          className="w-24 h-14 object-cover rounded-lg border border-white/15 shrink-0 shadow-md"
                        />
                      ) : (
                        <div className="w-24 h-14 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center text-slate-500 shrink-0">
                          No Hero
                        </div>
                      )}
                      <input
                        type="text"
                        value={backgroundImage}
                        onChange={(e) => setBackgroundImage(e.target.value)}
                        className="flex-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-white font-mono text-[11px] focus:outline-none focus:border-cyan-400"
                        placeholder="https://... or C:\..."
                      />
                    </div>
                  </div>

                  {/* Logo Image */}
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Clear Logo URL / Path (Transparent PNG)
                    </label>
                    <div className="flex items-center space-x-3">
                      {logoImage ? (
                        <img
                          src={logoImage}
                          alt="Logo"
                          className="w-24 h-12 object-contain bg-black/40 p-1 rounded-lg border border-white/15 shrink-0 shadow-md"
                        />
                      ) : (
                        <div className="w-24 h-12 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center text-slate-500 shrink-0">
                          No Logo
                        </div>
                      )}
                      <input
                        type="text"
                        value={logoImage}
                        onChange={(e) => setLogoImage(e.target.value)}
                        className="flex-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-white font-mono text-[11px] focus:outline-none focus:border-cyan-400"
                        placeholder="https://... or C:\..."
                      />
                    </div>
                  </div>

                  {/* Icon Image */}
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Icon URL / Path
                    </label>
                    <div className="flex items-center space-x-3">
                      {iconImage ? (
                        <img
                          src={iconImage}
                          alt="Icon"
                          className="w-8 h-8 object-contain rounded border border-white/15 shrink-0 shadow-md"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded bg-black/40 border border-white/10 flex items-center justify-center text-slate-500 shrink-0">
                          Icon
                        </div>
                      )}
                      <input
                        type="text"
                        value={iconImage}
                        onChange={(e) => setIconImage(e.target.value)}
                        className="flex-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-white font-mono text-[11px] focus:outline-none focus:border-cyan-400"
                        placeholder="https://... or C:\..."
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 7: LINKS */}
            {activeTab === "links" && (
              <div className="space-y-4 animate-in fade-in duration-100">
                <div className="border-b border-white/10 pb-2 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    <Link2 className="w-4 h-4 text-blue-400" />
                    <span>Game Links</span>
                  </h3>
                  <span className="text-[11px] text-slate-400">Store pages, wikis, and community hubs</span>
                </div>

                {/* Existing Links List */}
                <div className="space-y-2">
                  {links.map((link, idx) => (
                    <div
                      key={idx}
                      className="flex items-center space-x-2.5 p-2 bg-black/40 border border-white/10 rounded-xl"
                    >
                      <input
                        type="text"
                        value={link.title}
                        onChange={(e) => {
                          const updated = [...links];
                          updated[idx].title = e.target.value;
                          setLinks(updated);
                        }}
                        className="w-36 px-2.5 py-1 bg-white/5 border border-white/10 rounded-lg text-white text-xs font-semibold"
                        placeholder="Title"
                      />
                      <input
                        type="text"
                        value={link.url}
                        onChange={(e) => {
                          const updated = [...links];
                          updated[idx].url = e.target.value;
                          setLinks(updated);
                        }}
                        className="flex-1 px-2.5 py-1 bg-white/5 border border-white/10 rounded-lg text-white font-mono text-xs"
                        placeholder="https://..."
                      />
                      <button
                        type="button"
                        onClick={() => openUrl(link.url)}
                        title="Open in Browser"
                        className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveLink(idx)}
                        title="Delete link"
                        className="p-1.5 text-rose-400 hover:text-rose-300 rounded-lg hover:bg-rose-500/10 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {links.length === 0 && (
                    <p className="text-slate-500 text-xs italic py-2">No custom links added yet.</p>
                  )}
                </div>

                {/* Add New Link */}
                <div className="pt-2 border-t border-white/10 space-y-2">
                  <label className="block text-slate-300 font-semibold text-xs">Add New Link</label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={newLinkTitle}
                      onChange={(e) => setNewLinkTitle(e.target.value)}
                      placeholder="Title (e.g. Official Wiki)"
                      className="w-40 px-3 py-1.5 bg-black/40 border border-white/10 rounded-xl text-white text-xs focus:outline-none"
                    />
                    <input
                      type="text"
                      value={newLinkUrl}
                      onChange={(e) => setNewLinkUrl(e.target.value)}
                      placeholder="https://..."
                      className="flex-1 px-3 py-1.5 bg-black/40 border border-white/10 rounded-xl text-white font-mono text-xs focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAddLink}
                      className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold flex items-center space-x-1 cursor-pointer shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </form>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-white/10 bg-black/30 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-400">
            Changes will be updated in your database and UI immediately.
          </span>
          <div className="flex items-center space-x-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="edit-game-form"
              className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-all shadow-lg shadow-cyan-950/50 flex items-center space-x-1.5 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5 text-slate-950" />
              <span>Save Changes</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
