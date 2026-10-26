import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Game, GameLink, GameAction } from "../types/game";
import { resolveImageSrc, formatFileSize, isVideoSrc } from "../utils/image";
import { MetadataDiffModal, MetadataComparison } from "./MetadataDiffModal";
import { normalizeCompletionStatus } from "../utils/completionStatus";
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
  Plus,
  Trash2,
  Copy,
  Check,
  Sparkles,
  Clock,
  Calendar,
  Hash,
  Gamepad2,
  Building,
  Building2,
  Globe,
  ShieldAlert,
  Star,
  Award,
  Users,
  Repeat,
  Monitor,
  Layers,
  Terminal,
  CheckCircle2,
  ShieldCheck,
  ArrowUpDown,
  PenTool,
  Upload,
  Search,
  Loader2,
} from "lucide-react";

interface EditGameModalProps {
  game: Game | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: Game) => void;
  onOpenSteamGridDB?: (game: Game) => void;
  onRemoveGame?: (game: Game) => void;
}

type TabKey =
  | "general"
  | "installation"
  | "actions"
  | "tags"
  | "scores"
  | "description"
  | "artwork"
  | "links";

interface ArtworkPreviewItemProps {
  label: string;
  recommendedSize: string;
  value: string;
  onChange: (val: string) => void;
  aspectRatio: "poster" | "hero" | "logo" | "icon";
  onBrowse: () => void;
  placeholderText: string;
}

const ArtworkPreviewItem: React.FC<ArtworkPreviewItemProps> = ({
  label,
  recommendedSize,
  value,
  onChange,
  aspectRatio,
  onBrowse,
  placeholderText,
}) => {
  const [imgError, setImgError] = useState(false);
  const resolved = resolveImageSrc(value);

  useEffect(() => {
    setImgError(false);
  }, [value]);

  const isVideo = Boolean(value && (isVideoSrc(value) || isVideoSrc(resolved)));

  return (
    <div className="p-3.5 bg-white/[0.03] border border-white/10 rounded-2xl space-y-2.5 transition-colors hover:border-white/15">
      <div className="flex items-center justify-between">
        <label className="text-zinc-300 font-medium text-xs flex items-center space-x-1.5">
          <Image className="w-3.5 h-3.5 text-zinc-400" />
          <span>{label}</span>
          <span className="text-[10px] text-zinc-500 font-normal">({recommendedSize})</span>
        </label>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-[10px] text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer"
          >
            Clear Art
          </button>
        )}
      </div>

      <div className="flex items-start space-x-3.5">
        {/* Preview Container */}
        <div
          className={`shrink-0 rounded-xl overflow-hidden border border-white/10 bg-black/50 flex items-center justify-center relative shadow-sm ${
            aspectRatio === "poster"
              ? "w-16 h-24"
              : aspectRatio === "hero"
              ? "w-32 h-18"
              : aspectRatio === "logo"
              ? "w-28 h-14 bg-[radial-gradient(#ffffff20_1px,transparent_1px)] [background-size:6px_6px]"
              : "w-12 h-12 bg-[radial-gradient(#ffffff20_1px,transparent_1px)] [background-size:6px_6px]"
          }`}
        >
          {value && resolved && !imgError ? (
            isVideo ? (
              <video
                src={resolved}
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <img
                src={resolved}
                alt={label}
                onError={() => setImgError(true)}
                className={`w-full h-full ${
                  aspectRatio === "logo" || aspectRatio === "icon"
                    ? "object-contain p-1"
                    : "object-cover"
                }`}
              />
            )
          ) : (
            <div className="flex flex-col items-center justify-center text-zinc-500 text-[10px] p-1 text-center">
              {imgError ? (
                <span className="text-rose-400/80 text-[9px] font-medium leading-tight">
                  Load Error
                </span>
              ) : (
                <span className="opacity-40 text-[10px]">{placeholderText}</span>
              )}
            </div>
          )}
        </div>

        {/* Input & Browse Button */}
        <div className="flex-1 space-y-1.5 min-w-0">
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="flex-1 px-3 py-2 bg-white/[0.04] hover:bg-white/[0.06] border border-white/10 rounded-xl text-white font-mono text-[11px] focus:outline-none focus:border-white/30 focus:bg-white/[0.08] transition-all truncate"
              placeholder="https://... or C:\..."
            />
            <button
              type="button"
              onClick={onBrowse}
              title="Browse local artwork file"
              className="px-3 py-2 bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs font-medium flex items-center space-x-1.5 cursor-pointer shrink-0 border border-white/10 transition-colors"
            >
              <Upload className="w-3.5 h-3.5 text-zinc-300" />
              <span>Browse...</span>
            </button>
          </div>
          <span className="text-[10px] text-zinc-500 block truncate">
            Supports local file paths, web URLs, transparent PNGs, and looping WebM/MP4 videos.
          </span>
        </div>
      </div>
    </div>
  );
};

export const EditGameModal: React.FC<EditGameModalProps> = ({
  game,
  isOpen,
  onClose,
  onSave,
  onOpenSteamGridDB,
  onRemoveGame,
}) => {
  if (!isOpen || !game) return null;

  const [activeTab, setActiveTab] = useState<TabKey>("general");

  // Tab 1: General Form State
  const [title, setTitle] = useState(game.title || "");
  const [sortingTitle, setSortingTitle] = useState(game.sorting_title || "");
  const [developer, setDeveloper] = useState(game.developer || "");
  const [publisher, setPublisher] = useState(game.publisher || "");
  const [releaseDate, setReleaseDate] = useState(game.release_date || "");
  const [series, setSeries] = useState(game.series || "");
  const [ageRating, setAgeRating] = useState(game.age_rating || "");
  const [region, setRegion] = useState(game.region || "");
  const [isHidden, setIsHidden] = useState<boolean>(game.is_hidden || false);

  // Tab 2: Installation & Execution
  const [source, setSource] = useState(game.source || "Manual");
  const [sourceId, setSourceId] = useState(game.source_id || "");
  const [isInstalled, setIsInstalled] = useState(game.is_installed ?? true);
  const [installDirectory, setInstallDirectory] = useState(game.install_directory || "");
  const [executablePath, setExecutablePath] = useState(game.executable_path || "");
  const [launchArguments, setLaunchArguments] = useState(game.launch_arguments || "");

  // Tab 3: Play Actions (Dual Launch & Alternate Executables)
  const [playActions, setPlayActions] = useState<GameAction[]>(game.play_actions || []);

  // Scores & Playtime: Completion Status & Auto Beaten
  const [completionStatus, setCompletionStatus] = useState<string>(
    normalizeCompletionStatus(game.completion_status)
  );
  const [autoBeaten, setAutoBeaten] = useState(!!game.auto_beaten);
  const [genres, setGenres] = useState<string[]>(game.genres || []);
  const [categories, setCategories] = useState<string[]>(game.categories || []);
  const [features, setFeatures] = useState<string[]>(game.features || []);
  const [tags, setTags] = useState<string[]>(game.tags || []);
  const [platforms, setPlatforms] = useState<string[]>(game.platforms || []);

  // Tab 4: Scores & Playtime
  const [userRating, setUserRating] = useState<number | "">(
    game.user_rating !== undefined ? game.user_rating : ""
  );
  const [criticScore, setCriticScore] = useState<number | "">(
    game.critic_score !== undefined ? game.critic_score : ""
  );
  const [communityScore, setCommunityScore] = useState<number | "">(
    game.community_score !== undefined ? game.community_score : ""
  );
  const [playtimeHours, setPlaytimeHours] = useState(
    Math.floor((game.playtime_seconds || 0) / 3600)
  );
  const [playtimeMins, setPlaytimeMins] = useState(
    Math.floor(((game.playtime_seconds || 0) % 3600) / 60)
  );
  const [playCount, setPlayCount] = useState<number>(game.play_count || 0);
  const [lastPlayed, setLastPlayed] = useState(game.last_played || "");
  const [dateAdded, setDateAdded] = useState(game.date_added || "");
  const [copiedId, setCopiedId] = useState(false);

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

  // Metadata Downloader & Diff State
  const [isProviderPickerOpen, setIsProviderPickerOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<"steam" | "epic" | "igdb">("steam");
  const [searchTitle, setSearchTitle] = useState("");
  const [isFetchingProviderMeta, setIsFetchingProviderMeta] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [metadataDiff, setMetadataDiff] = useState<MetadataComparison | null>(null);

  const handleFetchMetadataFromProvider = async () => {
    try {
      setIsFetchingProviderMeta(true);
      setFetchError(null);
      const res = await invoke<MetadataComparison>("fetch_metadata_from_source", {
        title: searchTitle.trim() || title.trim(),
        provider: selectedProvider,
        gameId: game.id,
      });
      setMetadataDiff(res);
      setIsProviderPickerOpen(false);
    } catch (err: any) {
      setFetchError(typeof err === "string" ? err : err.message || "Failed to fetch metadata");
    } finally {
      setIsFetchingProviderMeta(false);
    }
  };

  const handleApplyMetadataDiff = (applied: Partial<Game>) => {
    if (applied.title !== undefined) setTitle(applied.title);
    if (applied.description !== undefined) setDescription(applied.description);
    if (applied.developer !== undefined) setDeveloper(applied.developer);
    if (applied.publisher !== undefined) setPublisher(applied.publisher);
    if (applied.release_date !== undefined) setReleaseDate(applied.release_date);
    if (applied.genres !== undefined) setGenres(applied.genres);
    if (applied.features !== undefined) setFeatures(applied.features);
    if (applied.critic_score !== undefined) setCriticScore(applied.critic_score);
    if (applied.community_score !== undefined) setCommunityScore(applied.community_score);
    if (applied.age_rating !== undefined) setAgeRating(applied.age_rating);
    if (applied.series !== undefined) setSeries(applied.series);
    if (applied.cover_image !== undefined) setCoverImage(applied.cover_image);
    if (applied.background_image !== undefined) setBackgroundImage(applied.background_image);
    if (applied.links !== undefined) setLinks(applied.links);
  };

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

  const handleBrowseArtwork = async (onSelected: (path: string) => void) => {
    try {
      const selected = await invoke<string | null>("select_file", {
        filter:
          "Artwork Files (*.png;*.jpg;*.jpeg;*.webp;*.gif;*.webm;*.mp4)|*.png;*.jpg;*.jpeg;*.webp;*.gif;*.webm;*.mp4|All files (*.*)|*.*",
      });
      if (selected) {
        onSelected(selected);
      }
    } catch (e) {
      console.warn("Browse artwork error:", e);
    }
  };

  const handleAddPlayAction = () => {
    const newAction: GameAction = {
      id: crypto.randomUUID(),
      name: "Play with Mods",
      path: "",
      arguments: "",
      working_dir: "",
      is_primary: playActions.length === 0,
    };
    setPlayActions([...playActions, newAction]);
  };

  const handleUpdatePlayAction = (id: string, updates: Partial<GameAction>) => {
    setPlayActions((prev) =>
      prev.map((act) => {
        if (act.id === id) {
          return { ...act, ...updates };
        }
        if (updates.is_primary && act.id !== id) {
          return { ...act, is_primary: false };
        }
        return act;
      })
    );
  };

  const handleRemovePlayAction = (id: string) => {
    setPlayActions((prev) => prev.filter((act) => act.id !== id));
  };

  const handleBrowseActionFile = async (actionId: string) => {
    try {
      const selected = await invoke<string | null>("select_file", {
        filter: "Executables & Scripts (*.exe;*.bat;*.cmd)|*.exe;*.bat;*.cmd|All files (*.*)|*.*",
      });
      if (selected) {
        handleUpdatePlayAction(actionId, { path: selected });
      }
    } catch (e) {
      console.warn("Browse action file error:", e);
    }
  };

  const handleBrowseActionDirectory = async (actionId: string) => {
    try {
      const selected = await invoke<string | null>("select_directory");
      if (selected) {
        handleUpdatePlayAction(actionId, { working_dir: selected });
      }
    } catch (e) {
      console.warn("Browse action directory error:", e);
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
      size_on_disk: game.size_on_disk,

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
      is_hidden: isHidden,
      play_actions: playActions,
      auto_beaten: autoBeaten,
      beaten_prompt_playtime: game.beaten_prompt_playtime,
    };

    onSave(updated);
    onClose();
  };

  const addTagItem = (
    field: "genres" | "categories" | "features" | "tags" | "platforms",
    value: string
  ) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (field === "genres" && !genres.includes(trimmed)) setGenres([...genres, trimmed]);
    if (field === "categories" && !categories.includes(trimmed))
      setCategories([...categories, trimmed]);
    if (field === "features" && !features.includes(trimmed))
      setFeatures([...features, trimmed]);
    if (field === "tags" && !tags.includes(trimmed)) setTags([...tags, trimmed]);
    if (field === "platforms" && !platforms.includes(trimmed))
      setPlatforms([...platforms, trimmed]);
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

  const resolvedHeaderCover = resolveImageSrc(coverImage);

  // Tabs configuration - subtle monochrome icons and clean glass active state
  const tabs: Array<{
    key: TabKey;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { key: "general", label: "General", icon: Info },
    { key: "installation", label: "Installation & Launch", icon: HardDrive },
    { key: "actions", label: "Play Actions", icon: Layers },
    { key: "tags", label: "Categorization & Tags", icon: Tag },
    { key: "scores", label: "Scores & Playtime", icon: Trophy },
    { key: "description", label: "Description & Notes", icon: FileText },
    { key: "artwork", label: "Artwork & Media", icon: Image },
    { key: "links", label: "Links", icon: Link2 },
  ];

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="theme-panel-surface backdrop-blur-2xl border border-white/10 rounded-2xl w-full max-w-4xl h-[720px] max-h-[92vh] shadow-[0_20px_60px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden text-xs text-zinc-200"
      >
        {/* Top Header */}
        <div className="px-6 py-3.5 border-b border-white/10 flex items-center justify-between bg-white/[0.03] backdrop-blur-sm shrink-0">
          <div className="flex items-center space-x-3.5 min-w-0">
            <div className="w-9 h-12 rounded-lg bg-black/40 border border-white/10 overflow-hidden shrink-0 shadow-sm flex items-center justify-center">
              {coverImage && resolvedHeaderCover ? (
                isVideoSrc(resolvedHeaderCover) ? (
                  <video
                    src={resolvedHeaderCover}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-full h-full object-cover pointer-events-none"
                  />
                ) : (
                  <img src={resolvedHeaderCover} alt="" className="w-full h-full object-cover" />
                )
              ) : (
                <Gamepad2 className="w-5 h-5 text-zinc-400" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-white truncate max-w-md">
                  {title || "Untitled Game"}
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-white/10 text-zinc-300 text-[10px] font-medium border border-white/10">
                  {source}
                </span>
                {isInstalled && (
                  <span className="px-2 py-0.5 rounded-full bg-white/10 text-zinc-300 text-[10px] font-medium border border-white/10">
                    Installed
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-400">Game Properties & Metadata</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer border border-white/5"
          >
            <X className="w-4 h-4 text-zinc-400" />
          </button>
        </div>

        {/* Modal Body: Left Sidebar Tabs + Right Scrollable Form Pane */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Tabs Sidebar (~210px) */}
          <div className="w-52 border-r border-white/10 bg-white/[0.02] p-2.5 space-y-1 shrink-0 overflow-y-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`w-full flex items-center space-x-2.5 px-3 py-2.5 rounded-xl text-left text-xs transition-all cursor-pointer ${
                    isActive
                      ? "bg-white/15 text-white font-semibold border border-white/15 shadow-sm"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]"
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      isActive ? "text-white" : "text-zinc-400"
                    }`}
                  />
                  <span className="font-medium">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Right Content Pane */}
          <form
            id="edit-game-form"
            onSubmit={handleSave}
            className="flex-1 overflow-y-auto p-6 space-y-6 bg-transparent"
          >
            {/* TAB 1: GENERAL */}
            {activeTab === "general" && (
              <div className="space-y-4 animate-in fade-in duration-100">
                <div className="border-b border-white/10 pb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center space-x-2">
                    <Info className="w-4 h-4 text-zinc-400" />
                    <span>General Metadata</span>
                  </h3>
                  <span className="text-[11px] text-zinc-400">Core game identification</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Title */}
                  <div className="sm:col-span-2">
                    <label className="block text-zinc-300 font-medium mb-1 flex items-center space-x-1.5">
                      <Gamepad2 className="w-3.5 h-3.5 text-zinc-400" />
                      <span>
                        Title <span className="text-rose-400">*</span>
                      </span>
                    </label>
                    <input
                      type="text"
                      required
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full px-3 py-2 bg-white/[0.04] hover:bg-white/[0.06] border border-white/10 rounded-xl text-white focus:outline-none focus:border-white/30 focus:bg-white/[0.08] transition-all"
                      placeholder="e.g. Terraria"
                    />
                  </div>

                  {/* Sorting Title */}
                  <div className="sm:col-span-2">
                    <label className="block text-zinc-300 font-medium mb-1 flex items-center space-x-1.5">
                      <ArrowUpDown className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Sorting Title</span>
                    </label>
                    <input
                      type="text"
                      value={sortingTitle}
                      onChange={(e) => setSortingTitle(e.target.value)}
                      className="w-full px-3 py-2 bg-white/[0.04] hover:bg-white/[0.06] border border-white/10 rounded-xl text-white focus:outline-none focus:border-white/30 focus:bg-white/[0.08] transition-all"
                      placeholder="Overrides library alphabetical sorting (e.g. 'Witcher 3, The')"
                    />
                  </div>

                  {/* Developer */}
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1 flex items-center space-x-1.5">
                      <Building className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Developer</span>
                    </label>
                    <input
                      type="text"
                      value={developer}
                      onChange={(e) => setDeveloper(e.target.value)}
                      className="w-full px-3 py-2 bg-white/[0.04] hover:bg-white/[0.06] border border-white/10 rounded-xl text-white focus:outline-none focus:border-white/30 focus:bg-white/[0.08] transition-all"
                      placeholder="e.g. Re-Logic"
                    />
                  </div>

                  {/* Publisher */}
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1 flex items-center space-x-1.5">
                      <Building2 className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Publisher</span>
                    </label>
                    <input
                      type="text"
                      value={publisher}
                      onChange={(e) => setPublisher(e.target.value)}
                      className="w-full px-3 py-2 bg-white/[0.04] hover:bg-white/[0.06] border border-white/10 rounded-xl text-white focus:outline-none focus:border-white/30 focus:bg-white/[0.08] transition-all"
                      placeholder="e.g. 505 Games"
                    />
                  </div>

                  {/* Release Date */}
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1 flex items-center space-x-1.5">
                      <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Release Date</span>
                    </label>
                    <input
                      type="text"
                      value={releaseDate}
                      onChange={(e) => setReleaseDate(e.target.value)}
                      className="w-full px-3 py-2 bg-white/[0.04] hover:bg-white/[0.06] border border-white/10 rounded-xl text-white focus:outline-none focus:border-white/30 focus:bg-white/[0.08] transition-all font-mono"
                      placeholder="YYYY-MM-DD (e.g. 2011-05-16)"
                    />
                  </div>

                  {/* Series */}
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1 flex items-center space-x-1.5">
                      <Layers className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Series</span>
                    </label>
                    <input
                      type="text"
                      value={series}
                      onChange={(e) => setSeries(e.target.value)}
                      className="w-full px-3 py-2 bg-white/[0.04] hover:bg-white/[0.06] border border-white/10 rounded-xl text-white focus:outline-none focus:border-white/30 focus:bg-white/[0.08] transition-all"
                      placeholder="e.g. Terraria, Elder Scrolls"
                    />
                  </div>

                  {/* Age Rating */}
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1 flex items-center space-x-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Age Rating</span>
                    </label>
                    <select
                      value={ageRating}
                      onChange={(e) => setAgeRating(e.target.value)}
                      className="w-full px-3 py-2 bg-[#18181b] border border-white/10 rounded-xl text-white focus:outline-none focus:border-white/30 transition-all cursor-pointer"
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
                    <label className="block text-zinc-300 font-medium mb-1 flex items-center space-x-1.5">
                      <Globe className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Region</span>
                    </label>
                    <select
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                      className="w-full px-3 py-2 bg-[#18181b] border border-white/10 rounded-xl text-white focus:outline-none focus:border-white/30 transition-all cursor-pointer"
                    >
                      <option value="">Worldwide / Global</option>
                      <option value="North America">North America (NTSC-U)</option>
                      <option value="Europe">Europe (PAL)</option>
                      <option value="Japan">Japan (NTSC-J)</option>
                      <option value="Asia">Asia</option>
                    </select>
                  </div>

                  {/* Hidden Game Privacy Setting */}
                  <div className="sm:col-span-2 pt-2 border-t border-white/5">
                    <label className="flex items-center space-x-3 cursor-pointer group p-3 bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 hover:border-white/10 rounded-xl transition-colors">
                      <input
                        type="checkbox"
                        checked={isHidden}
                        onChange={(e) => setIsHidden(e.target.checked)}
                        className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-purple-600 focus:ring-purple-500 cursor-pointer"
                      />
                      <div className="space-y-0.5">
                        <div className="text-zinc-200 font-semibold group-hover:text-white transition-colors">
                          Hide Game
                        </div>
                        <div className="text-[11px] text-zinc-400">
                          Hides this title from the main library grid and list views unless "Show Hidden Games" is enabled.
                        </div>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: INSTALLATION & LAUNCH */}
            {activeTab === "installation" && (
              <div className="space-y-4 animate-in fade-in duration-100">
                <div className="border-b border-white/10 pb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center space-x-2">
                    <HardDrive className="w-4 h-4 text-zinc-400" />
                    <span>Installation & Execution</span>
                  </h3>
                  <span className="text-[11px] text-zinc-400">Path & executable routing</span>
                </div>

                <div className="space-y-4">
                  {/* Source / Provider & Status */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-zinc-300 font-medium mb-1 flex items-center space-x-1.5">
                        <Layers className="w-3.5 h-3.5 text-zinc-400" />
                        <span>Library Source</span>
                      </label>
                      <select
                        value={source}
                        onChange={(e) => setSource(e.target.value)}
                        className="w-full px-3 py-2 bg-[#18181b] border border-white/10 rounded-xl text-white focus:outline-none focus:border-white/30 transition-all cursor-pointer"
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
                      <label className="block text-zinc-300 font-medium mb-1 flex items-center space-x-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-zinc-400" />
                        <span>Installation Status</span>
                      </label>
                      <label className="flex items-center space-x-3 px-3 py-2 bg-white/[0.04] hover:bg-white/[0.06] border border-white/10 rounded-xl cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={isInstalled}
                          onChange={(e) => setIsInstalled(e.target.checked)}
                          className="w-4 h-4 accent-white rounded cursor-pointer"
                        />
                        <span className="font-medium text-white">Installed Locally</span>
                      </label>
                    </div>
                  </div>

                  {/* Installation Folder */}
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1 flex items-center space-x-1.5">
                      <FolderOpen className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Installation Folder</span>
                    </label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={installDirectory}
                        onChange={(e) => setInstallDirectory(e.target.value)}
                        className="flex-1 px-3 py-2 bg-white/[0.04] hover:bg-white/[0.06] border border-white/10 rounded-xl text-white font-mono text-[11px] focus:outline-none focus:border-white/30 focus:bg-white/[0.08] transition-all truncate"
                        placeholder="C:\Program Files (x86)\Steam\steamapps\common\..."
                      />
                      <button
                        type="button"
                        onClick={handleBrowseDirectory}
                        title="Browse for folder"
                        className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-medium flex items-center space-x-1.5 cursor-pointer shrink-0 transition-colors border border-white/10"
                      >
                        <FolderOpen className="w-3.5 h-3.5 text-zinc-300" />
                        <span>Browse...</span>
                      </button>
                      {installDirectory && (
                        <button
                          type="button"
                          onClick={() => handleOpenFolder(installDirectory)}
                          title="Open folder in File Explorer"
                          className="px-3 py-2 bg-white/5 hover:bg-white/15 text-zinc-300 hover:text-white rounded-xl text-xs cursor-pointer shrink-0 transition-colors border border-white/10"
                        >
                          Open
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Executable Path */}
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1 flex items-center space-x-1.5">
                      <FileCode className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Executable Path (.exe)</span>
                    </label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={executablePath}
                        onChange={(e) => setExecutablePath(e.target.value)}
                        className="flex-1 px-3 py-2 bg-white/[0.04] hover:bg-white/[0.06] border border-white/10 rounded-xl text-white font-mono text-[11px] focus:outline-none focus:border-white/30 focus:bg-white/[0.08] transition-all truncate"
                        placeholder="e.g. C:\Games\Terraria\Terraria.exe"
                      />
                      <button
                        type="button"
                        onClick={handleBrowseFile}
                        title="Browse executable file"
                        className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-medium flex items-center space-x-1.5 cursor-pointer shrink-0 transition-colors border border-white/10"
                      >
                        <FileCode className="w-3.5 h-3.5 text-zinc-300" />
                        <span>Select .exe</span>
                      </button>
                    </div>
                  </div>

                  {/* Launch Arguments / Options */}
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1 flex items-center space-x-1.5">
                      <Terminal className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Launch Arguments / Options</span>
                    </label>
                    <input
                      type="text"
                      value={launchArguments}
                      onChange={(e) => setLaunchArguments(e.target.value)}
                      className="w-full px-3 py-2 bg-white/[0.04] hover:bg-white/[0.06] border border-white/10 rounded-xl text-white font-mono text-[11px] focus:outline-none focus:border-white/30 focus:bg-white/[0.08] transition-all"
                      placeholder="-windowed -novid +exec autoexec.cfg"
                    />
                    <span className="text-[10px] text-zinc-500 mt-1 block">
                      Arguments passed directly to the binary or launcher command at startup.
                    </span>
                  </div>

                  {/* Size on Disk (Read-Only Hardware Display) */}
                  <div className="pt-2">
                    <div className="p-3.5 bg-white/[0.03] border border-white/10 rounded-2xl flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-zinc-300 shadow-sm">
                          <HardDrive className="w-4 h-4 text-zinc-400" />
                        </div>
                        <div>
                          <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400 block">
                            Size on Disk (Read-Only)
                          </span>
                          <span className="text-sm font-semibold font-mono text-white">
                            {game.size_on_disk && game.size_on_disk > 0
                              ? formatFileSize(game.size_on_disk)
                              : "Not measured / Unknown"}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] text-zinc-500 max-w-xs text-right">
                        Calculated automatically from game installation directory.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: PLAY ACTIONS (DUAL LAUNCH / MODDED CONFIGURATIONS) */}
            {activeTab === "actions" && (
              <div className="space-y-4 animate-in fade-in duration-100">
                <div className="border-b border-white/10 pb-2 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-white flex items-center space-x-2">
                      <Layers className="w-4 h-4 text-purple-400" />
                      <span>Play Actions & Dual Launch</span>
                    </h3>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Configure alternate executables, mod managers (like Thunderstore / BepInEx), server instances, or custom launch arguments.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddPlayAction}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer shadow-md shadow-purple-950/40"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Play Action</span>
                  </button>
                </div>

                {playActions.length === 0 ? (
                  <div className="p-8 border border-dashed border-white/10 rounded-2xl text-center space-y-3 bg-white/[0.01]">
                    <Layers className="w-8 h-8 text-zinc-600 mx-auto" />
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-zinc-300">
                        No custom play actions configured
                      </p>
                      <p className="text-[11px] text-zinc-500 max-w-md mx-auto">
                        Add secondary actions to easily choose between Vanilla and Modded game launches, or launch server utilities with a single click.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddPlayAction}
                      className="px-3.5 py-1.5 bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs font-medium inline-flex items-center space-x-1.5 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Create First Action</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {playActions.map((act, idx) => (
                      <div
                        key={act.id}
                        className="p-4 bg-white/[0.03] border border-white/10 rounded-2xl space-y-3 relative hover:border-white/15 transition-all"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center font-mono text-[10px] font-bold">
                              {idx + 1}
                            </span>
                            <span className="font-bold text-xs text-white">
                              {act.name || "Untitled Action"}
                            </span>
                            {act.is_primary && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono font-semibold">
                                Primary Action
                              </span>
                            )}
                          </div>

                          <div className="flex items-center space-x-2">
                            <label className="flex items-center space-x-1.5 text-[11px] text-zinc-300 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={act.is_primary ?? false}
                                onChange={(e) =>
                                  handleUpdatePlayAction(act.id, {
                                    is_primary: e.target.checked,
                                  })
                                }
                                className="w-3.5 h-3.5 rounded bg-zinc-800 border-zinc-700 text-purple-600 cursor-pointer"
                              />
                              <span>Set as Primary</span>
                            </label>
                            <button
                              type="button"
                              onClick={() => handleRemovePlayAction(act.id)}
                              title="Delete action"
                              className="p-1 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          {/* Action Name */}
                          <div className="sm:col-span-2">
                            <label className="block text-zinc-400 text-[11px] mb-1">
                              Action Name
                            </label>
                            <input
                              type="text"
                              value={act.name}
                              onChange={(e) =>
                                handleUpdatePlayAction(act.id, { name: e.target.value })
                              }
                              placeholder="e.g. Play with Thunderstore Mods, DirectX 11, Dedicated Server"
                              className="w-full px-3 py-1.5 bg-white/[0.04] border border-white/10 rounded-xl text-white font-medium focus:outline-none focus:border-white/30"
                            />
                          </div>

                          {/* Executable Path / URL */}
                          <div className="sm:col-span-2">
                            <label className="block text-zinc-400 text-[11px] mb-1">
                              Path or Scheme URL (Executable, .bat, or steam:// / thunderstore://)
                            </label>
                            <div className="flex items-center space-x-2">
                              <input
                                type="text"
                                value={act.path}
                                onChange={(e) =>
                                  handleUpdatePlayAction(act.id, { path: e.target.value })
                                }
                                placeholder="C:\Games\ModManager.exe or ror2mm://..."
                                className="flex-1 px-3 py-1.5 bg-white/[0.04] border border-white/10 rounded-xl text-white font-mono text-[11px] focus:outline-none focus:border-white/30"
                              />
                              <button
                                type="button"
                                onClick={() => handleBrowseActionFile(act.id)}
                                className="px-3 py-1.5 bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs font-semibold flex items-center space-x-1 cursor-pointer shrink-0 border border-white/10"
                              >
                                <FolderOpen className="w-3.5 h-3.5 text-zinc-300" />
                                <span>Browse...</span>
                              </button>
                            </div>
                          </div>

                          {/* Arguments */}
                          <div>
                            <label className="block text-zinc-400 text-[11px] mb-1">
                              Arguments (Optional)
                            </label>
                            <input
                              type="text"
                              value={act.arguments || ""}
                              onChange={(e) =>
                                handleUpdatePlayAction(act.id, { arguments: e.target.value })
                              }
                              placeholder="--doorstop-enable true -popupwindow"
                              className="w-full px-3 py-1.5 bg-white/[0.04] border border-white/10 rounded-xl text-white font-mono text-[11px] focus:outline-none focus:border-white/30"
                            />
                          </div>

                          {/* Working Directory */}
                          <div>
                            <label className="block text-zinc-400 text-[11px] mb-1">
                              Working Directory (Optional)
                            </label>
                            <div className="flex items-center space-x-2">
                              <input
                                type="text"
                                value={act.working_dir || ""}
                                onChange={(e) =>
                                  handleUpdatePlayAction(act.id, { working_dir: e.target.value })
                                }
                                placeholder="C:\Games\GameFolder"
                                className="flex-1 px-3 py-1.5 bg-white/[0.04] border border-white/10 rounded-xl text-white font-mono text-[11px] focus:outline-none focus:border-white/30"
                              />
                              <button
                                type="button"
                                onClick={() => handleBrowseActionDirectory(act.id)}
                                className="px-2.5 py-1.5 bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs font-medium flex items-center space-x-1 cursor-pointer shrink-0 border border-white/10"
                              >
                                <FolderOpen className="w-3.5 h-3.5 text-zinc-300" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: TAGS & CATEGORIZATION */}
            {activeTab === "tags" && (
              <div className="space-y-4 animate-in fade-in duration-100">
                <div className="border-b border-white/10 pb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center space-x-2">
                    <Tag className="w-4 h-4 text-zinc-400" />
                    <span>Categorization & Tags</span>
                  </h3>
                  <span className="text-[11px] text-zinc-400">Genres, features, and platform tags</span>
                </div>

                {/* Genres */}
                <div>
                  <label className="block text-zinc-300 font-medium mb-1 flex items-center space-x-1.5">
                    <Tag className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Genres</span>
                  </label>
                  <div className="p-3 bg-white/[0.03] border border-white/10 rounded-xl space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {genres.map((g) => (
                        <span
                          key={g}
                          className="px-2.5 py-1 rounded-lg bg-white/10 text-zinc-200 border border-white/10 text-xs font-medium flex items-center space-x-1"
                        >
                          <span>{g}</span>
                          <button
                            type="button"
                            onClick={() => removeTagItem("genres", g)}
                            className="hover:text-white cursor-pointer ml-1 text-zinc-400"
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
                        className="flex-1 px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.06] border border-white/10 rounded-lg text-white text-xs focus:outline-none focus:border-white/30"
                      />
                      <button
                        type="button"
                        onClick={() => addTagItem("genres", tagInput.genres || "")}
                        className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-medium cursor-pointer border border-white/10 transition-colors"
                      >
                        Add
                      </button>
                    </div>
                    {/* Quick presets */}
                    <div className="flex flex-wrap gap-1 pt-1">
                      {[
                        "Action",
                        "Adventure",
                        "RPG",
                        "Indie",
                        "Strategy",
                        "Simulation",
                        "Shooter",
                        "Platformer",
                        "Sandbox",
                        "Puzzle",
                      ].map((preset) => (
                        <button
                          type="button"
                          key={preset}
                          onClick={() => addTagItem("genres", preset)}
                          disabled={genres.includes(preset)}
                          className="text-[10px] px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white disabled:opacity-30 cursor-pointer transition-colors"
                        >
                          + {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Platforms */}
                <div>
                  <label className="block text-zinc-300 font-medium mb-1 flex items-center space-x-1.5">
                    <Monitor className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Platforms</span>
                  </label>
                  <div className="p-3 bg-white/[0.03] border border-white/10 rounded-xl space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {platforms.map((p) => (
                        <span
                          key={p}
                          className="px-2.5 py-1 rounded-lg bg-white/10 text-zinc-200 border border-white/10 text-xs font-medium flex items-center space-x-1"
                        >
                          <span>{p}</span>
                          <button
                            type="button"
                            onClick={() => removeTagItem("platforms", p)}
                            className="hover:text-white cursor-pointer ml-1 text-zinc-400"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {[
                        "Windows",
                        "Linux",
                        "Macintosh",
                        "Steam Deck",
                        "PlayStation",
                        "Xbox",
                        "Nintendo Switch",
                      ].map((preset) => (
                        <button
                          type="button"
                          key={preset}
                          onClick={() => addTagItem("platforms", preset)}
                          disabled={platforms.includes(preset)}
                          className="text-[10px] px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white disabled:opacity-30 cursor-pointer transition-colors"
                        >
                          + {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Features & Tags */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1 flex items-center space-x-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Features</span>
                    </label>
                    <div className="p-3 bg-white/[0.03] border border-white/10 rounded-xl space-y-2">
                      <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                        {features.map((f) => (
                          <span
                            key={f}
                            className="px-2 py-0.5 rounded bg-white/10 text-zinc-200 text-[11px] flex items-center space-x-1"
                          >
                            <span>{f}</span>
                            <button
                              type="button"
                              onClick={() => removeTagItem("features", f)}
                              className="hover:text-white ml-1 cursor-pointer text-zinc-400"
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
                          onChange={(e) =>
                            setTagInput({ ...tagInput, features: e.target.value })
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addTagItem("features", tagInput.features || "");
                            }
                          }}
                          placeholder="e.g. Single-player..."
                          className="flex-1 px-2.5 py-1 bg-white/[0.04] hover:bg-white/[0.06] border border-white/10 rounded-lg text-white text-xs focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => addTagItem("features", tagInput.features || "")}
                          className="px-2.5 py-1 bg-white/10 text-white rounded-lg text-xs cursor-pointer hover:bg-white/15"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-zinc-300 font-medium mb-1 flex items-center space-x-1.5">
                      <Hash className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Tags</span>
                    </label>
                    <div className="p-3 bg-white/[0.03] border border-white/10 rounded-xl space-y-2">
                      <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                        {tags.map((t) => (
                          <span
                            key={t}
                            className="px-2 py-0.5 rounded bg-white/10 text-zinc-200 text-[11px] flex items-center space-x-1"
                          >
                            <span>{t}</span>
                            <button
                              type="button"
                              onClick={() => removeTagItem("tags", t)}
                              className="hover:text-white ml-1 cursor-pointer text-zinc-400"
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
                          className="flex-1 px-2.5 py-1 bg-white/[0.04] hover:bg-white/[0.06] border border-white/10 rounded-lg text-white text-xs focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => addTagItem("tags", tagInput.tags || "")}
                          className="px-2.5 py-1 bg-white/10 text-white rounded-lg text-xs cursor-pointer hover:bg-white/15"
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
                  <h3 className="text-sm font-semibold text-white flex items-center space-x-2">
                    <Trophy className="w-4 h-4 text-zinc-400" />
                    <span>Scores, Stats & Progress</span>
                  </h3>
                  <span className="text-[11px] text-zinc-400">Completion status, playtime history and scores</span>
                </div>

                {/* Completion Status & Auto Beaten Claim */}
                <div className="p-4 bg-white/[0.03] border border-white/10 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-200 uppercase tracking-wider flex items-center space-x-2">
                      <Trophy className="w-4 h-4 text-amber-400" />
                      <span>Completion Status</span>
                    </label>
                    <span className="text-[11px] text-zinc-400">Progression & story tracking</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <select
                      value={completionStatus}
                      onChange={(e) => setCompletionStatus(e.target.value)}
                      className="w-full px-3 py-2.5 bg-[#18181b] border border-white/10 rounded-xl text-white focus:outline-none focus:border-white/30 transition-all cursor-pointer font-medium text-xs"
                    >
                      <option value="Auto">Auto (Smart Dynamic Status)</option>
                      <option value="Untouched">Untouched (Never Played)</option>
                      <option value="In Progress">In Progress (Actively Playing)</option>
                      <option value="Beaten">Beaten (Main Story Complete)</option>
                      <option value="Hunting">Hunting (Achievement Hunting)</option>
                      <option value="Mastered">Mastered (100% / Perfect)</option>
                      <option value="Forgotten">Forgotten (Unplayed for 6+ months)</option>
                    </select>

                    {normalizeCompletionStatus(completionStatus) === "Auto" ? (
                      <button
                        type="button"
                        onClick={() => setAutoBeaten(!autoBeaten)}
                        className={`w-full px-4 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center space-x-2 cursor-pointer border shadow-sm ${
                          autoBeaten
                            ? "bg-emerald-500/25 hover:bg-emerald-500/35 text-emerald-300 border-emerald-500/40"
                            : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/25 hover:border-emerald-500/45"
                        }`}
                      >
                        {autoBeaten ? (
                          <>
                            <Check className="w-4 h-4 text-emerald-400 stroke-[2.5]" />
                            <span>Beaten (Claimed)</span>
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-4 h-4 text-emerald-400" />
                            <span>Claim Beaten</span>
                          </>
                        )}
                      </button>
                    ) : (
                      <div className="w-full px-4 py-2.5 rounded-xl text-zinc-500 text-xs font-medium border border-white/5 bg-white/[0.02] flex items-center justify-center">
                        <span>Manual Override Active</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Score Cards (User, Critic, Community) */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-white/[0.03] border border-white/10 rounded-xl space-y-1.5">
                    <label className="block text-[11px] font-semibold text-zinc-300 uppercase tracking-wider flex items-center space-x-1.5">
                      <Star className="w-3.5 h-3.5 text-zinc-400" />
                      <span>User Score (0-100)</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={userRating}
                      onChange={(e) =>
                        setUserRating(e.target.value === "" ? "" : Number(e.target.value))
                      }
                      className="w-full px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.06] border border-white/10 rounded-lg text-white font-mono text-sm font-semibold focus:outline-none focus:border-white/30"
                      placeholder="e.g. 95"
                    />
                  </div>

                  <div className="p-3 bg-white/[0.03] border border-white/10 rounded-xl space-y-1.5">
                    <label className="block text-[11px] font-semibold text-zinc-300 uppercase tracking-wider flex items-center space-x-1.5">
                      <Award className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Critic Score (0-100)</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={criticScore}
                      onChange={(e) =>
                        setCriticScore(e.target.value === "" ? "" : Number(e.target.value))
                      }
                      className="w-full px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.06] border border-white/10 rounded-lg text-white font-mono text-sm font-semibold focus:outline-none focus:border-white/30"
                      placeholder="e.g. 83"
                    />
                  </div>

                  <div className="p-3 bg-white/[0.03] border border-white/10 rounded-xl space-y-1.5">
                    <label className="block text-[11px] font-semibold text-zinc-300 uppercase tracking-wider flex items-center space-x-1.5">
                      <Users className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Community Score (0-100)</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={communityScore}
                      onChange={(e) =>
                        setCommunityScore(e.target.value === "" ? "" : Number(e.target.value))
                      }
                      className="w-full px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.06] border border-white/10 rounded-lg text-white font-mono text-sm font-semibold focus:outline-none focus:border-white/30"
                      placeholder="e.g. 97"
                    />
                  </div>
                </div>

                {/* Playtime & Count */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1 flex items-center space-x-1.5">
                      <Clock className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Total Playtime</span>
                    </label>
                    <div className="flex items-center space-x-2">
                      <div className="flex-1 flex items-center bg-white/[0.04] border border-white/10 rounded-xl px-2.5 py-1.5">
                        <input
                          type="number"
                          min="0"
                          value={playtimeHours}
                          onChange={(e) => setPlaytimeHours(Math.max(0, Number(e.target.value)))}
                          className="w-16 bg-transparent text-white font-mono font-semibold text-sm focus:outline-none"
                        />
                        <span className="text-[11px] text-zinc-400 ml-1">hrs</span>
                      </div>
                      <div className="flex-1 flex items-center bg-white/[0.04] border border-white/10 rounded-xl px-2.5 py-1.5">
                        <input
                          type="number"
                          min="0"
                          max="59"
                          value={playtimeMins}
                          onChange={(e) =>
                            setPlaytimeMins(Math.max(0, Math.min(59, Number(e.target.value))))
                          }
                          className="w-16 bg-transparent text-white font-mono font-semibold text-sm focus:outline-none"
                        />
                        <span className="text-[11px] text-zinc-400 ml-1">mins</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-zinc-300 font-medium mb-1 flex items-center space-x-1.5">
                      <Repeat className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Play Count (Sessions)</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={playCount}
                      onChange={(e) => setPlayCount(Math.max(0, Number(e.target.value)))}
                      className="w-full px-3 py-2 bg-white/[0.04] hover:bg-white/[0.06] border border-white/10 rounded-xl text-white font-mono focus:outline-none focus:border-white/30"
                      placeholder="e.g. 12"
                    />
                  </div>
                </div>

                {/* Dates: Last Played & Date Added */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1 flex items-center space-x-1.5">
                      <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Last Played Date</span>
                    </label>
                    <input
                      type="text"
                      value={lastPlayed}
                      onChange={(e) => setLastPlayed(e.target.value)}
                      className="w-full px-3 py-2 bg-white/[0.04] hover:bg-white/[0.06] border border-white/10 rounded-xl text-white font-mono focus:outline-none focus:border-white/30"
                      placeholder="YYYY-MM-DD HH:MM (e.g. 2026-10-23 18:00)"
                    />
                  </div>

                  <div>
                    <label className="block text-zinc-300 font-medium mb-1 flex items-center space-x-1.5">
                      <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Date Added</span>
                    </label>
                    <input
                      type="text"
                      value={dateAdded}
                      onChange={(e) => setDateAdded(e.target.value)}
                      className="w-full px-3 py-2 bg-white/[0.04] hover:bg-white/[0.06] border border-white/10 rounded-xl text-white font-mono focus:outline-none focus:border-white/30"
                      placeholder="YYYY-MM-DD"
                    />
                  </div>
                </div>

                {/* Game Identifiers */}
                <div className="pt-2 border-t border-white/10 space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-zinc-400 text-[11px] font-semibold mb-1 flex items-center space-x-1">
                        <Hash className="w-3 h-3 text-zinc-400" />
                        <span>Source / Store App ID</span>
                      </label>
                      <input
                        type="text"
                        value={sourceId}
                        onChange={(e) => setSourceId(e.target.value)}
                        className="w-full px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.06] border border-white/10 rounded-lg text-white font-mono text-xs focus:outline-none"
                        placeholder="e.g. 105600"
                      />
                    </div>

                    <div>
                      <label className="block text-zinc-400 text-[11px] font-semibold mb-1 flex items-center space-x-1">
                        <Hash className="w-3 h-3 text-zinc-400" />
                        <span>OpenPlay Database ID</span>
                      </label>
                      <div className="flex items-center space-x-2">
                        <input
                          type="text"
                          readOnly
                          value={game.id}
                          className="flex-1 px-3 py-1.5 bg-black/40 border border-white/5 rounded-lg text-zinc-400 font-mono text-xs cursor-default truncate"
                        />
                        <button
                          type="button"
                          onClick={handleCopyId}
                          title="Copy ID to clipboard"
                          className="px-2.5 py-1.5 bg-white/10 hover:bg-white/15 text-white rounded-lg text-xs flex items-center space-x-1 cursor-pointer"
                        >
                          {copiedId ? (
                            <Check className="w-3.5 h-3.5 text-white" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-zinc-300" />
                          )}
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
                  <h3 className="text-sm font-semibold text-white flex items-center space-x-2">
                    <FileText className="w-4 h-4 text-zinc-400" />
                    <span>Description & Notes</span>
                  </h3>
                  <span className="text-[11px] text-zinc-400">Synopsis and personal notes</span>
                </div>

                <div>
                  <label className="block text-zinc-300 font-medium mb-1 flex items-center space-x-1.5">
                    <FileText className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Game Description / Synopsis</span>
                  </label>
                  <textarea
                    rows={6}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-3 py-2 bg-white/[0.04] hover:bg-white/[0.06] border border-white/10 rounded-xl text-white text-xs leading-relaxed focus:outline-none focus:border-white/30"
                    placeholder="Game overview and storyline..."
                  />
                </div>

                <div>
                  <label className="block text-zinc-300 font-medium mb-1 flex items-center space-x-1.5">
                    <PenTool className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Personal Game Notes / Cheat Codes / Walkthrough Tips</span>
                  </label>
                  <textarea
                    rows={4}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3 py-2 bg-white/[0.04] hover:bg-white/[0.06] border border-white/10 rounded-xl text-white text-xs leading-relaxed focus:outline-none focus:border-white/30"
                    placeholder="Add personal notes, controller settings, build guides, or keybindings..."
                  />
                </div>
              </div>
            )}

            {/* TAB 6: ARTWORK & MEDIA */}
            {activeTab === "artwork" && (
              <div className="space-y-4 animate-in fade-in duration-100">
                <div className="border-b border-white/10 pb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center space-x-2">
                    <Image className="w-4 h-4 text-zinc-400" />
                    <span>Artwork & Assets</span>
                  </h3>
                  {onOpenSteamGridDB && (
                    <button
                      type="button"
                      onClick={() => onOpenSteamGridDB(game)}
                      className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-zinc-200 border border-white/10 text-xs font-medium flex items-center space-x-1.5 cursor-pointer transition-colors"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Search SteamGridDB</span>
                    </button>
                  )}
                </div>

                <div className="space-y-4">
                  {/* Cover Poster */}
                  <ArtworkPreviewItem
                    label="Cover Poster (Vertical Grid)"
                    recommendedSize="600 × 900"
                    value={coverImage}
                    onChange={setCoverImage}
                    aspectRatio="poster"
                    onBrowse={() => handleBrowseArtwork(setCoverImage)}
                    placeholderText="No Poster"
                  />

                  {/* Background Hero */}
                  <ArtworkPreviewItem
                    label="Background Hero (Banner)"
                    recommendedSize="1920 × 620"
                    value={backgroundImage}
                    onChange={setBackgroundImage}
                    aspectRatio="hero"
                    onBrowse={() => handleBrowseArtwork(setBackgroundImage)}
                    placeholderText="No Hero"
                  />

                  {/* Transparent Logo */}
                  <ArtworkPreviewItem
                    label="Clear Logo (Transparent Title Art)"
                    recommendedSize="Transparent PNG"
                    value={logoImage}
                    onChange={setLogoImage}
                    aspectRatio="logo"
                    onBrowse={() => handleBrowseArtwork(setLogoImage)}
                    placeholderText="No Logo"
                  />

                  {/* Icon */}
                  <ArtworkPreviewItem
                    label="App / Game Icon"
                    recommendedSize="32 × 32 or Square PNG/ICO"
                    value={iconImage}
                    onChange={setIconImage}
                    aspectRatio="icon"
                    onBrowse={() => handleBrowseArtwork(setIconImage)}
                    placeholderText="No Icon"
                  />
                </div>
              </div>
            )}

            {/* TAB 7: LINKS */}
            {activeTab === "links" && (
              <div className="space-y-4 animate-in fade-in duration-100">
                <div className="border-b border-white/10 pb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center space-x-2">
                    <Link2 className="w-4 h-4 text-zinc-400" />
                    <span>Game Links</span>
                  </h3>
                  <span className="text-[11px] text-zinc-400">
                    Store pages, wikis, and community hubs
                  </span>
                </div>

                {/* Existing Links List */}
                <div className="space-y-2">
                  {links.map((link, idx) => (
                    <div
                      key={idx}
                      className="flex items-center space-x-2.5 p-2 bg-white/[0.03] border border-white/10 rounded-xl"
                    >
                      <input
                        type="text"
                        value={link.title}
                        onChange={(e) => {
                          const updated = [...links];
                          updated[idx].title = e.target.value;
                          setLinks(updated);
                        }}
                        className="w-36 px-2.5 py-1 bg-black/40 border border-white/10 rounded-lg text-white text-xs font-medium"
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
                        className="flex-1 px-2.5 py-1 bg-black/40 border border-white/10 rounded-lg text-white font-mono text-xs"
                        placeholder="URL"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveLink(idx)}
                        className="p-1 text-zinc-400 hover:text-rose-400 rounded cursor-pointer transition-colors"
                        title="Remove link"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  {links.length === 0 && (
                    <p className="text-xs text-zinc-500 py-2 italic text-center">
                      No custom links configured. Add official store, wiki, or discord links below.
                    </p>
                  )}
                </div>

                {/* Add New Link */}
                <div className="pt-2 border-t border-white/10">
                  <label className="block text-zinc-300 font-medium mb-1 flex items-center space-x-1.5">
                    <Plus className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Add New Link</span>
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={newLinkTitle}
                      onChange={(e) => setNewLinkTitle(e.target.value)}
                      placeholder="Title (e.g. Official Wiki)"
                      className="w-40 px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.06] border border-white/10 rounded-xl text-white text-xs focus:outline-none"
                    />
                    <input
                      type="text"
                      value={newLinkUrl}
                      onChange={(e) => setNewLinkUrl(e.target.value)}
                      placeholder="https://..."
                      className="flex-1 px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.06] border border-white/10 rounded-xl text-white font-mono text-xs focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAddLink}
                      className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-medium flex items-center space-x-1 cursor-pointer shrink-0 border border-white/10 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5 text-zinc-300" />
                      <span>Add</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </form>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-white/10 bg-white/[0.03] backdrop-blur-sm flex items-center justify-between shrink-0">
          {/* Left Side: Metadata Source Picker Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setSearchTitle(title);
                setFetchError(null);
                setIsProviderPickerOpen((p) => !p);
              }}
              className="px-3.5 py-2 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-200 hover:text-white text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>Download Metadata</span>
            </button>

            {isProviderPickerOpen && (
              <div className="absolute left-0 bottom-full mb-2 w-80 theme-panel-surface border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.85)] p-3.5 z-50 space-y-3 backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-xs font-bold text-white flex items-center space-x-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                    <span>Choose Metadata Source</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsProviderPickerOpen(false)}
                    className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-white/10"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-1.5 p-1 bg-white/[0.04] rounded-xl border border-white/5">
                  <button
                    type="button"
                    onClick={() => setSelectedProvider("steam")}
                    className={`py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                      selectedProvider === "steam"
                        ? "bg-purple-600 text-white shadow font-bold"
                        : "text-zinc-400 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    Steam
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedProvider("epic")}
                    className={`py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                      selectedProvider === "epic"
                        ? "bg-purple-600 text-white shadow font-bold"
                        : "text-zinc-400 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    Epic Games
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedProvider("igdb")}
                    className={`py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                      selectedProvider === "igdb"
                        ? "bg-purple-600 text-white shadow font-bold"
                        : "text-zinc-400 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    IGDB
                  </button>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Search Query</label>
                  <input
                    type="text"
                    value={searchTitle}
                    onChange={(e) => setSearchTitle(e.target.value)}
                    placeholder="Game title to search..."
                    className="w-full px-3 py-1.5 bg-black/40 border border-white/10 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                  />
                </div>

                {fetchError && (
                  <div className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/20 p-2 rounded-lg leading-tight">
                    {fetchError}
                  </div>
                )}

                <button
                  type="button"
                  disabled={isFetchingProviderMeta || !searchTitle.trim()}
                  onClick={handleFetchMetadataFromProvider}
                  className="w-full py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center space-x-1.5 cursor-pointer shadow-md active:scale-98"
                >
                  {isFetchingProviderMeta ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Searching {selectedProvider.toUpperCase()}...</span>
                    </>
                  ) : (
                    <>
                      <Search className="w-3.5 h-3.5" />
                      <span>Search & Compare</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Right Side: Remove Local Game, Cancel & Save Changes */}
          <div className="flex items-center space-x-2.5">
            {game &&
              (!["steam", "epic", "gog", "battle.net", "ea app", "ubisoft connect", "xbox"].includes(
                game.source.toLowerCase()
              ) ||
                game.source.toLowerCase() === "local" ||
                game.source.toLowerCase() === "manual") &&
              onRemoveGame && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onRemoveGame(game);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 text-xs font-semibold transition-all border border-red-500/20 flex items-center space-x-1.5 cursor-pointer mr-2"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  <span>Remove Game</span>
                </button>
              )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-xs font-medium transition-colors cursor-pointer border border-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="edit-game-form"
              className="px-5 py-2 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 text-xs font-bold transition-all shadow-lg shadow-white/10 flex items-center space-x-1.5 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5 text-zinc-950" />
              <span>Save Changes</span>
            </button>
          </div>
        </div>
      </div>

      {/* Metadata Diff & Selection Modal */}
      {metadataDiff && (
        <MetadataDiffModal
          isOpen={!!metadataDiff}
          onClose={() => setMetadataDiff(null)}
          currentGame={{
            title,
            description,
            developer,
            publisher,
            release_date: releaseDate,
            genres,
            features,
            critic_score: criticScore !== "" ? Number(criticScore) : undefined,
            community_score: communityScore !== "" ? Number(communityScore) : undefined,
            age_rating: ageRating,
            series,
            cover_image: coverImage,
            background_image: backgroundImage,
            links,
          }}
          incoming={metadataDiff}
          onApply={handleApplyMetadataDiff}
        />
      )}
    </div>
  );
};
