import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Game } from "../types/game";
import {
  Sparkles,
  ExternalLink,
  Check,
  Loader2,
  X,
  Key,
  Film,
  Search,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";

interface SteamGridDBAsset {
  id: number;
  score: number;
  style?: string;
  width: number;
  height: number;
  url: string;
  thumb: string;
  mime: string;
  is_animated: boolean;
  author?: string;
}

interface SteamGridDBModalProps {
  isOpen: boolean;
  onClose: () => void;
  game: Game;
  onApplyArtwork: (updates: {
    coverImage?: string;
    cover_image?: string;
    backgroundImage?: string;
    background_image?: string;
    logoImage?: string;
    logo_image?: string;
    iconImage?: string;
    icon_image?: string;
  }) => Promise<void>;
}

export const SteamGridDBModal: React.FC<SteamGridDBModalProps> = ({
  isOpen,
  onClose,
  game,
  onApplyArtwork,
}) => {
  const [assetType, setAssetType] = useState<"grids" | "heroes" | "logos" | "icons">("grids");
  const [animatedOnly, setAnimatedOnly] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [assets, setAssets] = useState<SteamGridDBAsset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [applyingUrl, setApplyingUrl] = useState<string | null>(null);
  const [recentlyAppliedUrl, setRecentlyAppliedUrl] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(game.title);

  // Sync searchQuery when game changes
  useEffect(() => {
    setSearchQuery(game.title);
  }, [game.id, game.title]);

  // Check if API key exists on mount
  useEffect(() => {
    if (!isOpen) return;
    invoke<string | null>("get_steamgriddb_key")
      .then((key) => {
        if (key && key.trim()) {
          setApiKey(key);
          setHasApiKey(true);
        } else {
          setHasApiKey(false);
        }
      })
      .catch(() => setHasApiKey(false));
  }, [isOpen]);

  // Fetch assets whenever assetType or game changes and API key is present
  useEffect(() => {
    if (!isOpen || !hasApiKey) return;
    loadAssets(assetType, searchQuery);
  }, [isOpen, hasApiKey, assetType, game.id]);

  const loadAssets = async (type: string, customTitle?: string) => {
    const effectiveTitle = (customTitle ?? searchQuery).trim() || game.title;
    const isDefaultTitle = effectiveTitle.toLowerCase() === game.title.trim().toLowerCase();
    try {
      setIsLoading(true);
      setErrorMsg(null);
      const res = await invoke<SteamGridDBAsset[]>("search_steamgriddb", {
        appid: isDefaultTitle ? game.source_id || "" : "",
        source: isDefaultTitle ? game.source : "Custom",
        title: effectiveTitle,
        assetType: type,
      });
      setAssets(res);
    } catch (err: any) {
      console.warn("SteamGridDB fetch error:", err);
      setErrorMsg(String(err));
      setAssets([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) return;
    try {
      await invoke("save_steamgriddb_key", { key: apiKey.trim() });
      setHasApiKey(true);
      setErrorMsg(null);
      loadAssets(assetType);
    } catch (err: any) {
      setErrorMsg(String(err));
    }
  };

  const handleApply = async (asset: SteamGridDBAsset) => {
    try {
      setApplyingUrl(asset.url);
      const targetUrl = asset.url || asset.thumb;
      const updates: {
        coverImage?: string;
        cover_image?: string;
        backgroundImage?: string;
        background_image?: string;
        logoImage?: string;
        logo_image?: string;
        iconImage?: string;
        icon_image?: string;
      } = {};

      if (assetType === "grids") {
        updates.coverImage = targetUrl;
        updates.cover_image = targetUrl;
      }
      if (assetType === "heroes") {
        updates.backgroundImage = targetUrl;
        updates.background_image = targetUrl;
      }
      if (assetType === "logos") {
        updates.logoImage = targetUrl;
        updates.logo_image = targetUrl;
      }
      if (assetType === "icons") {
        updates.iconImage = targetUrl;
        updates.icon_image = targetUrl;
      }

      await onApplyArtwork(updates);
      setApplyingUrl(null);
      setRecentlyAppliedUrl(targetUrl);
      // Keep modal open so the user can continue customizing artwork across categories and close whenever they choose
    } catch (err: any) {
      alert(`Failed to apply artwork: ${err}`);
      setApplyingUrl(null);
    }
  };

  if (!isOpen) return null;

  const filteredAssets = animatedOnly
    ? assets.filter((a) => a.is_animated)
    : assets;

  // Aspect ratio class based on active category
  const getAspectClass = () => {
    switch (assetType) {
      case "heroes":
        return "aspect-[1920/620]";
      case "logos":
        return "aspect-[16/9]";
      case "icons":
        return "aspect-square";
      case "grids":
      default:
        return "aspect-[2/3]";
    }
  };

  // Grid columns class based on active category
  const getGridColsClass = () => {
    switch (assetType) {
      case "heroes":
        return "grid-cols-1 sm:grid-cols-2 gap-4";
      case "logos":
        return "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4";
      case "icons":
        return "grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3";
      case "grids":
      default:
        return "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5";
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#10131d]/95 backdrop-blur-2xl border border-[#23293e] rounded-2xl w-full max-w-5xl h-[720px] shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Modal Header */}
        <div className="h-14 px-6 border-b border-[#20263a] flex items-center justify-between bg-[#0e1017] shrink-0">
          <div className="flex items-center space-x-2.5">
            <Sparkles className="w-5 h-5 text-cyan-400" />
            <div>
              <h2 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
                <span>SteamGridDB Artwork</span>
                <span className="text-slate-400 font-normal">· {game.title}</span>
              </h2>
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
        {!hasApiKey ? (
          /* API Key Prompt */
          <div className="flex-1 p-8 flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-4">
            <div className="p-3 bg-cyan-500/10 rounded-2xl border border-cyan-500/20 text-cyan-400">
              <Key className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Enter your SteamGridDB API Key
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                To download custom covers, animated posters, banners, and logos directly into OpenPlay, connect your free SteamGridDB API key.
              </p>
            </div>

            <form onSubmit={handleSaveKey} className="w-full space-y-3">
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste SteamGridDB API Key..."
                className="w-full px-3.5 py-2.5 bg-[#161a29] border border-[#2b334d] rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
              />

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => openUrl("https://www.steamgriddb.com/profile/preferences/api")}
                  className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center space-x-1 underline cursor-pointer"
                >
                  <span>Get a free key here</span>
                  <ExternalLink className="w-3 h-3" />
                </button>

                <button
                  type="submit"
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-xl text-xs transition-all shadow-md cursor-pointer"
                >
                  Save & Connect
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* Main Asset Browser */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Asset Type Selector Bar */}
            <div className="px-6 py-3 border-b border-[#1c2235] bg-[#0c0e15] flex items-center justify-between gap-3">
              <div className="flex items-center space-x-2 bg-[#141825] p-1 rounded-xl border border-[#242b3e]">
                <button
                  onClick={() => setAssetType("grids")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    assetType === "grids"
                      ? "bg-cyan-600 text-slate-950 font-bold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Covers (Vertical)
                </button>

                <button
                  onClick={() => setAssetType("heroes")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    assetType === "heroes"
                      ? "bg-cyan-600 text-slate-950 font-bold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Heroes (1920x620)
                </button>

                <button
                  onClick={() => setAssetType("logos")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    assetType === "logos"
                      ? "bg-cyan-600 text-slate-950 font-bold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Logos (Transparent)
                </button>

                <button
                  onClick={() => setAssetType("icons")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    assetType === "icons"
                      ? "bg-cyan-600 text-slate-950 font-bold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Icons
                </button>
              </div>

              {/* Search & Animated Only Filter Controls */}
              <div className="flex items-center space-x-2">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    loadAssets(assetType, searchQuery);
                  }}
                  className="relative w-48 sm:w-56"
                >
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search SteamGridDB..."
                    className="w-full pl-8 pr-3 py-1.5 bg-[#141825] border border-[#242b3e] focus:border-cyan-500/60 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none"
                  />
                </form>

                <button
                  onClick={() => setAnimatedOnly(!animatedOnly)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer shrink-0 ${
                    animatedOnly
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                      : "bg-[#141825] text-slate-400 border-[#242b3e] hover:text-slate-200"
                  }`}
                >
                  <Film className="w-3.5 h-3.5" />
                  <span>Animated Only</span>
                </button>
              </div>
            </div>

            {/* Assets Grid Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {isLoading ? (
                <div className="h-full flex flex-col items-center justify-center space-y-2 text-slate-400">
                  <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
                  <span className="text-xs">Searching SteamGridDB...</span>
                </div>
              ) : errorMsg ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-2">
                  <p className="text-xs text-rose-400">{errorMsg}</p>
                  <button
                    onClick={() => setHasApiKey(false)}
                    className="text-xs text-cyan-400 underline cursor-pointer"
                  >
                    Change API Key
                  </button>
                </div>
              ) : filteredAssets.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs">
                  No {animatedOnly ? "animated" : ""} assets found for this category.
                </div>
              ) : (
                <div className={`grid ${getGridColsClass()}`}>
                  {filteredAssets.map((asset) => {
                    const isVideoThumb =
                      asset.thumb.endsWith(".webm") ||
                      asset.thumb.endsWith(".mp4") ||
                      asset.mime.includes("webm");

                    return (
                      <div
                        key={asset.id}
                        className="group relative rounded-xl overflow-hidden border border-[#23293e] hover:border-cyan-400/80 bg-[#141826] flex flex-col transition-all hover:scale-[1.02] shadow-md"
                      >
                        <div
                          className={`relative ${getAspectClass()} overflow-hidden bg-black/40 flex items-center justify-center`}
                        >
                          {/* Live Video Preview for Animated WebM Thumbnails */}
                          {asset.is_animated && isVideoThumb ? (
                            <video
                              src={asset.thumb}
                              autoPlay
                              loop
                              muted
                              playsInline
                              className={`w-full h-full ${
                                assetType === "logos" || assetType === "icons"
                                  ? "object-contain p-3"
                                  : "object-cover"
                              } pointer-events-none`}
                            />
                          ) : (
                            <img
                              src={asset.thumb}
                              alt="SteamGridDB asset"
                              className={`w-full h-full ${
                                assetType === "logos" || assetType === "icons"
                                  ? "object-contain p-3"
                                  : "object-cover"
                              }`}
                              loading="lazy"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                if (target.src !== asset.url) {
                                  target.src = asset.url;
                                }
                              }}
                            />
                          )}

                          {/* Applied Confirmation Badge */}
                          {(recentlyAppliedUrl === asset.url || recentlyAppliedUrl === asset.thumb) && (
                            <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-emerald-500 text-slate-950 text-[9px] font-extrabold uppercase tracking-wider flex items-center space-x-1 shadow-md z-10">
                              <Check className="w-2.5 h-2.5 stroke-[3]" />
                              <span>APPLIED</span>
                            </div>
                          )}

                          {/* Animated Badge */}
                          {asset.is_animated && !(recentlyAppliedUrl === asset.url || recentlyAppliedUrl === asset.thumb) && (
                            <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-amber-500/90 text-slate-950 text-[9px] font-extrabold uppercase tracking-wider flex items-center space-x-1 shadow-md z-10">
                              <Film className="w-2.5 h-2.5" />
                              <span>ANIMATED</span>
                            </div>
                          )}

                          {/* Score Badge (SteamGridDB community upvotes - only shown when upvoted) */}
                          {asset.score > 0 && (
                            <div
                              title={`${asset.score} community upvotes on SteamGridDB`}
                              className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-black/75 backdrop-blur-xs text-zinc-200 text-[10px] font-semibold z-10 border border-white/10 flex items-center space-x-0.5 shadow-sm"
                            >
                              <span className="text-[9px] opacity-80">▲</span>
                              <span>{asset.score}</span>
                            </div>
                          )}

                          {/* Hover Overlay Button */}
                          <div className="absolute inset-0 bg-black/75 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-3 z-20">
                            <button
                              onClick={() => handleApply(asset)}
                              disabled={applyingUrl === asset.url}
                              className={`px-4 py-2 font-bold rounded-lg text-xs transition-all flex items-center justify-center space-x-1.5 shadow-lg cursor-pointer disabled:opacity-50 ${
                                recentlyAppliedUrl === asset.url || recentlyAppliedUrl === asset.thumb
                                  ? "bg-emerald-500 hover:bg-emerald-400 text-slate-950"
                                  : "bg-cyan-600 hover:bg-cyan-500 text-slate-950"
                              }`}
                            >
                              {applyingUrl === asset.url ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : recentlyAppliedUrl === asset.url || recentlyAppliedUrl === asset.thumb ? (
                                <>
                                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                                  <span>Applied!</span>
                                </>
                              ) : (
                                <>
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Apply Artwork</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Card Footer info */}
                        <div className="p-2 text-[10px] text-slate-400 flex items-center justify-between border-t border-[#1c2235]">
                          <span>
                            {asset.width}x{asset.height}
                          </span>
                          {asset.author && (
                            <span className="truncate max-w-[100px]" title={asset.author}>
                              by {asset.author}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
