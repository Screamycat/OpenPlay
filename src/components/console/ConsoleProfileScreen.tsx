import React, { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Plus,
  Pencil,
  Trash2,
  User,
  Monitor,
  FolderOpen,
  Search,
  Check,
  X,
  Gamepad2,
  Sparkles,
  Loader2,
  Film,
} from "lucide-react";
import { ConsoleProfile } from "../../types/config";
import { Game } from "../../types/game";
import {
  isVideoSrc,
  resolveGridCoverSrc,
  resolveImageSrc,
} from "../../utils/image";
import {
  BUILTIN_CONSOLE_LOGIN_VIDEOS,
  DEFAULT_CONSOLE_LOGIN_VIDEO,
} from "../../constants/consoleVideos";
import { UltrawideMediaStage } from "./UltrawideMediaStage";
import { playConfirm, playBack, playNavTick } from "../../utils/consoleSounds";

interface SteamGridDBAsset {
  id: number;
  url: string;
  thumb: string;
  width: number;
  height: number;
  mime: string;
}

interface ConsoleProfileScreenProps {
  profiles: ConsoleProfile[];
  activeProfileId?: string;
  games: Game[];
  loginBgVideoPath?: string;
  onChangeLoginBgVideo?: (nextPath: string) => Promise<void> | void;
  onSelectProfile: (profile: ConsoleProfile) => void;
  onSaveProfiles: (profiles: ConsoleProfile[], nextActiveId?: string) => Promise<void> | void;
  onExitConsoleMode: () => void;
}

const ACCENT_PRESETS = [
  "#38bdf8",
  "#818cf8",
  "#c084fc",
  "#f472b6",
  "#fb7185",
  "#fb923c",
  "#34d399",
  "#22d3ee",
];

interface GameAvatarOption {
  id: string;
  title: string;
  source: string;
  rawPath: string;
  previewSrc: string;
}

export const ConsoleProfileScreen: React.FC<ConsoleProfileScreenProps> = ({
  profiles,
  activeProfileId,
  games,
  loginBgVideoPath,
  onChangeLoginBgVideo,
  onSelectProfile,
  onSaveProfiles,
  onExitConsoleMode,
}) => {
  const [nowTime, setNowTime] = useState(() => formatClock());
  const [editingProfile, setEditingProfile] = useState<ConsoleProfile | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftAvatar, setDraftAvatar] = useState<string | undefined>(undefined);
  const [draftAccent, setDraftAccent] = useState<string>("#38bdf8");
  const [showBgPickerModal, setShowBgPickerModal] = useState(false);
  const [bgVideoLoaded, setBgVideoLoaded] = useState(false);
  const [exitingToHome, setExitingToHome] = useState(false);

  // Avatar Picker state
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [pickerTab, setPickerTab] = useState<"sgdb" | "covers">("sgdb");
  const [iconSearch, setIconSearch] = useState("");
  const [sgdbAssets, setSgdbAssets] = useState<SteamGridDBAsset[]>([]);
  const [isSearchingSgdb, setIsSearchingSgdb] = useState(false);
  const [sgdbError, setSgdbError] = useState<string | null>(null);
  const [hasSgdbKey, setHasSgdbKey] = useState<boolean>(false);

  const effectiveBgPath =
    loginBgVideoPath && loginBgVideoPath.trim().length > 0
      ? loginBgVideoPath
      : DEFAULT_CONSOLE_LOGIN_VIDEO;
  const bgVideoSrc = resolveImageSrc(effectiveBgPath);

  useEffect(() => {
    setBgVideoLoaded(false);
  }, [bgVideoSrc]);

  const handleSelectProfileSmooth = (profile: ConsoleProfile) => {
    if (exitingToHome) return;
    playConfirm();
    setExitingToHome(true);
    window.setTimeout(() => {
      onSelectProfile(profile);
    }, 340);
  };

  useEffect(() => {
    const id = window.setInterval(() => setNowTime(formatClock()), 15000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    invoke<string | null>("get_steamgriddb_key")
      .then((key) => setHasSgdbKey(Boolean(key && key.trim().length > 0)))
      .catch(() => setHasSgdbKey(false));
  }, []);

  // Support controller Y shortcut to edit whichever profile is focused
  useEffect(() => {
    if (editingProfile) return;
    const onProfileEditEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail as { profileId?: string } | undefined;
      const target =
        profiles.find((p) => p.id === detail?.profileId) ||
        profiles.find((p) => p.id === activeProfileId) ||
        profiles[0];
      if (target) {
        openEditProfile(target);
      }
    };
    window.addEventListener("openplay-console-profile-edit", onProfileEditEvent);
    return () =>
      window.removeEventListener("openplay-console-profile-edit", onProfileEditEvent);
  }, [editingProfile, profiles, activeProfileId]);

  // Installed games sorted alphabetically (used for quick SGDB icon chips & high-res cover crops)
  const installedGames = useMemo(() => {
    return games
      .filter((g) => (g.is_installed || g.sibling_games?.some((s) => s.is_installed)) && !g.is_hidden)
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [games]);

  const installedCoverAvatars = useMemo<GameAvatarOption[]>(() => {
    const seen = new Set<string>();
    const options: GameAvatarOption[] = [];

    for (const g of installedGames) {
      if (g.cover_image && !isVideoSrc(g.cover_image)) {
        const preview = resolveGridCoverSrc(g.cover_image, 360);
        if (preview && !seen.has(g.cover_image)) {
          seen.add(g.cover_image);
          options.push({
            id: `${g.id}-cover`,
            title: g.title,
            source: g.source,
            rawPath: g.cover_image,
            previewSrc: preview,
          });
        }
      }
    }
    return options;
  }, [installedGames]);

  const filteredCoverOptions = useMemo(() => {
    const q = iconSearch.trim().toLowerCase();
    if (!q) return installedCoverAvatars.slice(0, 60);
    return installedCoverAvatars
      .filter(
        (opt) =>
          opt.title.toLowerCase().includes(q) || opt.source.toLowerCase().includes(q)
      )
      .slice(0, 60);
  }, [installedCoverAvatars, iconSearch]);

  const fetchSgdbIconsForGame = async (title: string, source = "Custom", appid = "") => {
    const clean = title.trim();
    if (!clean) return;
    setIsSearchingSgdb(true);
    setSgdbError(null);
    try {
      const res = await invoke<SteamGridDBAsset[]>("search_steamgriddb", {
        appid,
        source,
        title: clean,
        assetType: "icons",
      });
      setSgdbAssets(Array.isArray(res) ? res : []);
      if (!res || res.length === 0) {
        setSgdbError(`No high-res SteamGridDB icons found for "${clean}".`);
      }
    } catch (err: any) {
      setSgdbAssets([]);
      setSgdbError(typeof err === "string" ? err : "Could not fetch SteamGridDB icons.");
    } finally {
      setIsSearchingSgdb(false);
    }
  };

  const openCreateModal = () => {
    playConfirm();
    setIsCreating(true);
    setEditingProfile({
      id: `profile-${Date.now()}`,
      name: "",
      avatar_url: undefined,
      accent_color: ACCENT_PRESETS[profiles.length % ACCENT_PRESETS.length],
    });
    setDraftName("");
    setDraftAvatar(undefined);
    setDraftAccent(ACCENT_PRESETS[profiles.length % ACCENT_PRESETS.length]);
    setShowIconPicker(false);
    setIconSearch("");
    setSgdbAssets([]);
    setSgdbError(null);
  };

  const openEditProfile = (profile: ConsoleProfile) => {
    playConfirm();
    setIsCreating(false);
    setEditingProfile(profile);
    setDraftName(profile.name);
    setDraftAvatar(profile.avatar_url || undefined);
    setDraftAccent(profile.accent_color || "#38bdf8");
    setShowIconPicker(false);
    setIconSearch("");
    setSgdbAssets([]);
    setSgdbError(null);
  };

  const handleBrowseCustomAvatar = async () => {
    try {
      const picked = await invoke<string | null>("select_file", {
        filter: ".png,.jpg,.jpeg,.webp,.gif",
      });
      if (picked) {
        playConfirm();
        setDraftAvatar(picked);
      }
    } catch (err) {
      console.error("Failed to pick profile image:", err);
    }
  };

  const handleSaveEditor = async () => {
    if (!editingProfile) return;
    const trimmed = draftName.trim() || "Player";
    const updated: ConsoleProfile = {
      ...editingProfile,
      name: trimmed,
      avatar_url: draftAvatar,
      accent_color: draftAccent,
    };

    const nextList = isCreating
      ? [...profiles, updated]
      : profiles.map((p) => (p.id === updated.id ? updated : p));

    playConfirm();
    await onSaveProfiles(nextList, updated.id);
    setEditingProfile(null);
  };

  const handleDeleteProfile = async () => {
    if (!editingProfile || profiles.length <= 1) return;
    const nextList = profiles.filter((p) => p.id !== editingProfile.id);
    playBack();
    await onSaveProfiles(nextList, nextList[0]?.id);
    setEditingProfile(null);
  };

  return (
    <div
      data-console-part="profile-screen"
      data-gamepad-zone="console-profile"
      className={`fixed inset-0 z-30 bg-[#060810] text-white overflow-hidden select-none flex flex-col animate-in fade-in duration-500 transition-opacity ease-out ${
        exitingToHome ? "opacity-0 duration-300" : "opacity-100"
      }`}
    >
      {/* Full-bleed edge-to-edge moving background (32:9 & 16:9 safe) */}
      <div className="console-diagonal-backdrop absolute inset-0 pointer-events-none overflow-hidden">
        <div className="console-ambient-mesh absolute inset-0" />
        {bgVideoSrc && (
          <UltrawideMediaStage
            key={bgVideoSrc}
            src={bgVideoSrc}
            isVideo
            loop
            muted
            onLoadedData={() => setBgVideoLoaded(true)}
            className={`transition-opacity duration-700 ease-out ${
              bgVideoLoaded ? "opacity-75" : "opacity-0"
            }`}
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 35%, rgba(6,8,16,0.28) 0%, rgba(6,8,16,0.86) 75%)",
          }}
        />
      </div>

      {/* Safe-Zone Foreground Container */}
      <div
        className="relative z-10 flex-1 flex flex-col w-full mx-auto px-8 md:px-14 py-8"
        style={{ maxWidth: "var(--console-safe-width, 2200px)" }}
      >
        {/* Top Bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center border border-white/15 bg-white/5"
              style={{ color: "var(--console-accent, #38bdf8)" }}
            >
              <Gamepad2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-black tracking-[0.2em] uppercase text-white">
                OPENPLAY
              </div>
              <div className="text-[11px] text-white/45 tracking-wider uppercase">
                Console Mode
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2.5">
            {onChangeLoginBgVideo && (
              <button
                type="button"
                data-gamepad-focusable="true"
                onClick={() => {
                  playConfirm();
                  setShowBgPickerModal(true);
                }}
                className="flex items-center space-x-2 px-3.5 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.14] border border-white/10 text-xs font-semibold text-white/80 hover:text-white transition-all cursor-pointer"
                title="Choose Login Background Video"
              >
                <Film className="w-3.5 h-3.5" />
                <span>Backdrop</span>
              </button>
            )}
            <span className="text-sm font-semibold text-white/75 tabular-nums px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/10">
              {nowTime}
            </span>
            <button
              type="button"
              data-gamepad-focusable="true"
              onClick={() => {
                playBack();
                onExitConsoleMode();
              }}
              className="flex items-center space-x-2 px-4 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.14] border border-white/10 text-xs font-semibold text-white/80 hover:text-white transition-all cursor-pointer"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>Desktop Mode</span>
            </button>
          </div>
        </div>

        {/* Center Profile Selection Stage */}
        <div className="flex-1 flex flex-col items-center justify-center py-8">
          <div className="text-center mb-10 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white">
              Who&apos;s playing?
            </h1>
            <p className="text-sm text-white/50 mt-2">
              Choose a local profile to enter your library
            </p>
          </div>

          <div className="flex flex-wrap items-start justify-center gap-8 md:gap-10 max-w-5xl">
            {profiles.map((profile) => {
              const avatarSrc = resolveImageSrc(profile.avatar_url || undefined);
              const isLastActive = profile.id === activeProfileId;
              const accent = profile.accent_color || "var(--console-accent, #38bdf8)";

              return (
                <div key={profile.id} className="flex flex-col items-center">
                  <button
                    type="button"
                    data-gamepad-focusable="true"
                    data-console-profile-id={profile.id}
                    data-console-default-focus={isLastActive ? "true" : undefined}
                    onMouseEnter={() => playNavTick()}
                    onClick={() => handleSelectProfileSmooth(profile)}
                    className="relative w-36 h-36 md:w-44 md:h-44 rounded-full p-1.5 transition-all duration-200 cursor-pointer hover:scale-105 focus:outline-none"
                    style={{
                      background: `linear-gradient(145deg, ${accent}, rgba(255,255,255,0.12))`,
                      boxShadow: isLastActive
                        ? `0 18px 45px -12px ${accent}66`
                        : "0 16px 36px rgba(0,0,0,0.5)",
                    }}
                  >
                    <div className="w-full h-full rounded-full bg-[#0e1320] overflow-hidden flex items-center justify-center border-2 border-black/50">
                      {avatarSrc ? (
                        <img
                          src={avatarSrc}
                          alt={profile.name}
                          className="w-full h-full object-cover object-top"
                        />
                      ) : (
                        <span
                          className="text-4xl md:text-5xl font-black uppercase select-none"
                          style={{ color: accent }}
                        >
                          {(profile.name || "P").slice(0, 1)}
                        </span>
                      )}
                    </div>
                  </button>

                  <div className="mt-4 text-center">
                    <div className="text-base md:text-lg font-bold text-white tracking-wide">
                      {profile.name}
                    </div>
                    {isLastActive && (
                      <div className="text-[11px] uppercase tracking-widest text-white/45 mt-0.5">
                        Last active
                      </div>
                    )}
                  </div>

                  {/* Clean, directly-below Edit button (1 press Down from avatar on controller!) */}
                  <button
                    type="button"
                    data-gamepad-focusable="true"
                    onClick={() => openEditProfile(profile)}
                    className="mt-3 px-4 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.15] border border-white/12 text-xs font-semibold text-white/75 hover:text-white flex items-center space-x-1.5 transition-all cursor-pointer"
                  >
                    <Pencil className="w-3 h-3" />
                    <span>Edit Profile</span>
                  </button>
                </div>
              );
            })}

            {/* Add Profile Card */}
            <div className="flex flex-col items-center">
              <button
                type="button"
                data-gamepad-focusable="true"
                onMouseEnter={() => playNavTick()}
                onClick={openCreateModal}
                className="w-36 h-36 md:w-44 md:h-44 rounded-full bg-white/[0.04] hover:bg-white/[0.1] border-2 border-dashed border-white/20 hover:border-white/50 flex flex-col items-center justify-center gap-2 transition-all duration-200 cursor-pointer hover:scale-105"
              >
                <Plus className="w-9 h-9 text-white/65" />
                <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                  Add Profile
                </span>
              </button>
              <div className="mt-4 text-base font-medium text-white/45">New Player</div>
            </div>
          </div>
        </div>

        {/* Footer Hint */}
        <div className="flex items-center justify-center gap-5 text-xs text-white/45 pb-2">
          <span>Select a profile to continue</span>
          <span>•</span>
          <span>Press Down or Y to Edit Profile</span>
          <span>•</span>
          <span>F12 to return to Desktop Mode</span>
        </div>
      </div>

      {/* Add / Edit Profile Modal */}
      {editingProfile && (
        <div
          data-gamepad-zone="modal"
          onClick={() => {
            playBack();
            setEditingProfile(null);
          }}
          className="fixed inset-0 z-45 bg-black/75 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="console-diagonal-surface w-full max-w-2xl max-h-[86vh] rounded-3xl bg-[#0d111b]/95 border border-white/15 shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <User className="w-5 h-5 text-white/75" />
                <h2 className="text-base font-bold text-white">
                  {isCreating ? "Create Local Profile" : "Edit Profile"}
                </h2>
              </div>
              <button
                type="button"
                data-gamepad-close="true"
                onClick={() => {
                  playBack();
                  setEditingProfile(null);
                }}
                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/15 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6" data-gamepad-scroll="true">
              {/* Avatar Preview + Name */}
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <div
                  className="w-24 h-24 rounded-full p-1 shrink-0"
                  style={{
                    background: `linear-gradient(145deg, ${draftAccent}, rgba(255,255,255,0.15))`,
                  }}
                >
                  <div className="w-full h-full rounded-full bg-[#0a0d16] overflow-hidden flex items-center justify-center">
                    {draftAvatar && resolveImageSrc(draftAvatar) ? (
                      <img
                        src={resolveImageSrc(draftAvatar)}
                        alt="Avatar Preview"
                        className="w-full h-full object-cover object-top"
                      />
                    ) : (
                      <span
                        className="text-3xl font-black uppercase"
                        style={{ color: draftAccent }}
                      >
                        {(draftName.trim() || "P").slice(0, 1)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex-1 w-full space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                      Profile Name
                    </label>
                    <input
                      type="text"
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      placeholder="Player 1"
                      maxLength={32}
                      className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/15 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-white/50"
                    />
                  </div>

                  {/* Accent Color */}
                  <div className="flex items-center space-x-2">
                    {ACCENT_PRESETS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setDraftAccent(color)}
                        className={`w-6 h-6 rounded-full transition-transform cursor-pointer ${
                          draftAccent === color
                            ? "scale-125 ring-2 ring-white ring-offset-2 ring-offset-[#0d111b]"
                            : "opacity-75 hover:opacity-100"
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Avatar Source Actions */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Profile Avatar
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowIconPicker((v) => !v)}
                      className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white flex items-center space-x-1.5 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{showIconPicker ? "Hide Game Picker" : "Pick Game Artwork"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleBrowseCustomAvatar}
                      className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-xs font-semibold text-zinc-200 flex items-center space-x-1.5 cursor-pointer"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>Browse Image</span>
                    </button>
                    {draftAvatar && (
                      <button
                        type="button"
                        onClick={() => setDraftAvatar(undefined)}
                        className="px-2.5 py-1.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/25 text-xs text-red-300 cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {/* High-Res Game Avatar Picker (SteamGridDB Icons + Installed Game Covers) */}
                {showIconPicker && (
                  <div className="rounded-2xl bg-black/40 border border-white/10 p-4 space-y-3.5">
                    {/* Sub-tabs */}
                    <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white/[0.04] border border-white/10 w-fit">
                      <button
                        type="button"
                        onClick={() => setPickerTab("sgdb")}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          pickerTab === "sgdb"
                            ? "bg-white text-slate-950"
                            : "text-zinc-400 hover:text-white"
                        }`}
                      >
                        SteamGridDB HD Icons
                      </button>
                      <button
                        type="button"
                        onClick={() => setPickerTab("covers")}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          pickerTab === "covers"
                            ? "bg-white text-slate-950"
                            : "text-zinc-400 hover:text-white"
                        }`}
                      >
                        Installed Covers ({installedCoverAvatars.length})
                      </button>
                    </div>

                    {pickerTab === "sgdb" ? (
                      <div className="space-y-3">
                        {!hasSgdbKey ? (
                          <div className="py-5 text-center text-xs text-zinc-400 space-y-1">
                            <div className="font-semibold text-zinc-200">
                              Add a free SteamGridDB API Key in Settings → APIs &amp; Services
                            </div>
                            <div>
                              Unlock crisp 512×512–1024×1024 square community icons for every installed game and ROM.
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2">
                              <div className="relative flex-1">
                                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                  type="text"
                                  value={iconSearch}
                                  onChange={(e) => setIconSearch(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      fetchSgdbIconsForGame(iconSearch);
                                    }
                                  }}
                                  placeholder="Search any game for HD square icons..."
                                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white/40"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => fetchSgdbIconsForGame(iconSearch)}
                                className="px-3.5 py-2 rounded-xl bg-white text-slate-950 text-xs font-bold cursor-pointer"
                              >
                                Search
                              </button>
                            </div>

                            {/* Quick Installed Games Chips */}
                            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                              {installedGames.slice(0, 20).map((g) => (
                                <button
                                  key={g.id}
                                  type="button"
                                  onClick={() => {
                                    setIconSearch(g.title);
                                    fetchSgdbIconsForGame(g.title, g.source, g.source_id || "");
                                  }}
                                  className="px-2.5 py-1 rounded-full bg-white/[0.06] hover:bg-white/[0.15] border border-white/10 text-[11px] text-zinc-200 cursor-pointer truncate max-w-[180px]"
                                >
                                  {g.title}
                                </button>
                              ))}
                            </div>

                            {isSearchingSgdb ? (
                              <div className="py-8 flex items-center justify-center space-x-2 text-xs text-zinc-400">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Fetching HD icons from SteamGridDB...</span>
                              </div>
                            ) : sgdbAssets.length > 0 ? (
                              <div className="grid grid-cols-5 sm:grid-cols-6 gap-2.5 max-h-56 overflow-y-auto pr-1">
                                {sgdbAssets.slice(0, 36).map((asset) => {
                                  const selected = draftAvatar === asset.url;
                                  return (
                                    <button
                                      key={asset.id}
                                      type="button"
                                      onClick={() => {
                                        playConfirm();
                                        setDraftAvatar(asset.url);
                                      }}
                                      className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all cursor-pointer bg-zinc-900 p-1 ${
                                        selected
                                          ? "border-white scale-105 shadow-lg"
                                          : "border-white/10 hover:border-white/40"
                                      }`}
                                    >
                                      <img
                                        src={asset.thumb || asset.url}
                                        alt=""
                                        loading="lazy"
                                        className="w-full h-full object-contain"
                                      />
                                      {selected && (
                                        <div className="absolute inset-0 bg-white/20 flex items-center justify-center">
                                          <Check className="w-5 h-5 text-white drop-shadow" />
                                        </div>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="py-5 text-center text-xs text-zinc-500">
                                {sgdbError ||
                                  "Click any installed game above or search to browse crisp HD square icons."}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={iconSearch}
                            onChange={(e) => setIconSearch(e.target.value)}
                            placeholder="Filter installed games & ROMs..."
                            className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white/40"
                          />
                        </div>

                        {filteredCoverOptions.length > 0 ? (
                          <div className="grid grid-cols-5 sm:grid-cols-6 gap-2.5 max-h-56 overflow-y-auto pr-1">
                            {filteredCoverOptions.map((opt) => {
                              const selected = draftAvatar === opt.rawPath;
                              return (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() => {
                                    playConfirm();
                                    setDraftAvatar(opt.rawPath);
                                  }}
                                  title={`${opt.title} (${opt.source})`}
                                  className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all cursor-pointer bg-zinc-900 ${
                                    selected
                                      ? "border-white scale-105 shadow-lg"
                                      : "border-white/10 hover:border-white/40"
                                  }`}
                                >
                                  <img
                                    src={opt.previewSrc}
                                    alt={opt.title}
                                    loading="lazy"
                                    className="w-full h-full object-cover object-top"
                                  />
                                  {selected && (
                                    <div className="absolute inset-0 bg-white/20 flex items-center justify-center">
                                      <Check className="w-5 h-5 text-white drop-shadow" />
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="py-6 text-center text-xs text-zinc-500">
                            No installed game covers found matching your search.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between bg-black/30">
              {!isCreating && profiles.length > 1 ? (
                <button
                  type="button"
                  onClick={handleDeleteProfile}
                  className="px-3.5 py-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 text-xs font-semibold flex items-center space-x-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Profile</span>
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center space-x-2.5">
                <button
                  type="button"
                  onClick={() => {
                    playBack();
                    setEditingProfile(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-zinc-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEditor}
                  className="px-5 py-2 rounded-xl bg-white hover:bg-zinc-200 text-slate-950 text-xs font-bold cursor-pointer shadow-lg"
                >
                  Save Profile
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preinstalled Login Background Video Selector Modal */}
      {showBgPickerModal && onChangeLoginBgVideo && (
        <div
          data-gamepad-zone="modal"
          onClick={() => {
            playBack();
            setShowBgPickerModal(false);
          }}
          className="fixed inset-0 z-45 bg-black/75 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="console-diagonal-surface w-full max-w-3xl max-h-[85vh] rounded-3xl bg-[#0d111b]/95 border border-white/15 shadow-2xl flex flex-col overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <Film className="w-4 h-4 text-white/75" />
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Login Background Videos
                  </h3>
                  <p className="text-[11px] text-white/50">
                    Choose one of OpenPlay&apos;s preinstalled moving backdrops or browse for your own video
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-gamepad-focusable="true"
                  onClick={async () => {
                    const picked = await invoke<string | null>("select_file", {
                      filter: ".mp4,.webm,.mkv,.mov",
                    });
                    if (picked) {
                      playConfirm();
                      await onChangeLoginBgVideo(picked);
                    }
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Browse Custom...</span>
                </button>
                <button
                  type="button"
                  data-gamepad-close="true"
                  onClick={() => {
                    playBack();
                    setShowBgPickerModal(false);
                  }}
                  className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/15 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4" data-gamepad-scroll="true">
              {BUILTIN_CONSOLE_LOGIN_VIDEOS.map((preset) => {
                const isSelected = effectiveBgPath === preset.path;
                const previewSrc = resolveImageSrc(preset.path);
                return (
                  <button
                    key={preset.id}
                    type="button"
                    data-gamepad-focusable="true"
                    onClick={async () => {
                      playConfirm();
                      await onChangeLoginBgVideo(preset.path);
                    }}
                    className={`group relative rounded-2xl overflow-hidden border-2 text-left transition-all cursor-pointer bg-black/50 ${
                      isSelected
                        ? "border-white scale-[1.02] shadow-xl"
                        : "border-white/10 hover:border-white/40"
                    }`}
                  >
                    <div className="aspect-video w-full bg-black overflow-hidden relative">
                      {previewSrc && (
                        <video
                          src={previewSrc}
                          autoPlay
                          loop
                          muted
                          playsInline
                          preload="metadata"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      )}
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white text-slate-950 flex items-center justify-center shadow">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      )}
                    </div>
                    <div className="px-3.5 py-2.5 flex items-center justify-between bg-[#0b0e17]">
                      <span className="text-xs font-bold text-white truncate">
                        {preset.label}
                      </span>
                      {preset.isDefault && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-white/65 font-mono uppercase">
                          Default
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function formatClock(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
