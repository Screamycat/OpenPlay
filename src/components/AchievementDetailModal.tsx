import React, { useState, useEffect } from "react";
import { Achievement } from "../types/achievement";
import {
  CheckCircle2,
  Lock,
  X,
  Sparkles,
  Eye,
  EyeOff,
  Gamepad2,
} from "lucide-react";
import { resolveImageSrc } from "../utils/image";

interface AchievementDetailModalProps {
  achievement: Achievement | null;
  gameTitle?: string;
  gameCover?: string | null;
  onClose: () => void;
}

export const AchievementDetailModal: React.FC<AchievementDetailModalProps> = ({
  achievement,
  gameTitle,
  gameCover,
  onClose,
}) => {
  const [showSecret, setShowSecret] = useState(false);

  useEffect(() => {
    // Reset secret reveal whenever selected achievement changes
    setShowSecret(false);
  }, [achievement?.api_name]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!achievement) return null;

  const isLocked = !achievement.is_unlocked;
  const isHiddenLocked = isLocked && achievement.is_secret && !showSecret;

  const getRarityTier = (pct: number) => {
    if (pct < 10.0 && pct > 0) {
      return {
        label: "Ultra Rare",
        color: "text-amber-300 bg-amber-400/15 border-amber-400/40 shadow-[0_0_15px_rgba(251,191,36,0.2)]",
        border: "border-amber-400/50 shadow-[0_0_25px_rgba(251,191,36,0.25)]",
        xp: 100,
      };
    }
    if (pct < 20.0 && pct >= 10.0) {
      return {
        label: "Rare",
        color: "text-purple-300 bg-purple-500/15 border-purple-500/40 shadow-[0_0_12px_rgba(168,85,247,0.15)]",
        border: "border-purple-500/40 shadow-[0_0_20px_rgba(168,85,247,0.2)]",
        xp: 50,
      };
    }
    if (pct < 50.0 && pct >= 20.0) {
      return {
        label: "Uncommon",
        color: "text-cyan-300 bg-cyan-500/15 border-cyan-500/40",
        border: "border-cyan-500/40",
        xp: 25,
      };
    }
    return {
      label: "Common",
      color: "text-zinc-300 bg-zinc-800 border-zinc-700",
      border: "border-white/10",
      xp: 10,
    };
  };

  const rarity = getRarityTier(achievement.rarity_percentage);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#0c0d14]/95 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col relative animate-in zoom-in-95 duration-150 backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center space-x-2 min-w-0">
            {gameCover ? (
              <img
                src={resolveImageSrc(gameCover)}
                alt=""
                className="w-5 h-6 rounded object-cover shrink-0 border border-white/10"
              />
            ) : (
              <Gamepad2 className="w-4 h-4 text-zinc-400 shrink-0" />
            )}
            <span className="text-xs font-semibold text-zinc-300 truncate">
              {gameTitle || "Achievement Details"}
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {/* Top Hero Section: Large Icon + Titles */}
          <div className="flex items-start space-x-4">
            {/* Achievement Icon */}
            <div className="relative shrink-0">
              <div
                className={`w-20 h-20 rounded-2xl overflow-hidden bg-black/70 border-2 flex items-center justify-center relative transition-all ${rarity.border}`}
              >
                <img
                  src={
                    achievement.is_unlocked
                      ? achievement.icon_url
                      : achievement.icon_gray_url || achievement.icon_url
                  }
                  alt={achievement.display_name}
                  className={`w-full h-full object-cover ${
                    isLocked ? "grayscale opacity-50" : ""
                  } ${isHiddenLocked ? "blur-md scale-125 opacity-20" : ""}`}
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />

                {isLocked && !isHiddenLocked && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <Lock className="w-6 h-6 text-zinc-300 drop-shadow-md" />
                  </div>
                )}

                {isHiddenLocked && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Lock className="w-6 h-6 text-zinc-400" />
                  </div>
                )}
              </div>
            </div>

            {/* Title & Status */}
            <div className="flex-1 min-w-0 space-y-1.5 pt-0.5">
              <h2 className="text-base font-black text-white leading-snug tracking-tight">
                {isHiddenLocked ? "Hidden Achievement" : achievement.display_name}
              </h2>

              {/* Status Pill */}
              <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold">
                {achievement.is_unlocked ? (
                  <span className="text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 rounded-full flex items-center space-x-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>
                      Unlocked {achievement.unlock_time ? `• ${achievement.unlock_time}` : ""}
                    </span>
                  </span>
                ) : (
                  <span className="text-zinc-400 bg-zinc-800/80 border border-white/5 px-2.5 py-0.5 rounded-full flex items-center space-x-1">
                    <Lock className="w-3 h-3" />
                    <span>Locked</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="bg-black/30 border border-white/5 rounded-xl p-3.5 space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              Description
            </div>

            {isHiddenLocked ? (
              <div className="flex items-center justify-between py-1">
                <span className="text-xs text-zinc-400 italic">
                  Details for this achievement are hidden.
                </span>
                <button
                  onClick={() => setShowSecret(true)}
                  className="flex items-center space-x-1 text-[11px] text-amber-300 hover:text-amber-200 transition-colors font-semibold cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Reveal</span>
                </button>
              </div>
            ) : (
              <p className="text-xs text-zinc-200 leading-relaxed">
                {achievement.description || (
                  <span className="text-zinc-400 italic">No description provided for this achievement.</span>
                )}
              </p>
            )}

            {isLocked && achievement.is_secret && showSecret && (
              <div className="flex justify-end pt-1">
                <button
                  onClick={() => setShowSecret(false)}
                  className="flex items-center space-x-1 text-[10px] text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  <EyeOff className="w-3 h-3" />
                  <span>Hide Spoiler</span>
                </button>
              </div>
            )}
          </div>

          {/* Stats Cards Grid */}
          <div className="grid grid-cols-2 gap-2.5">
            {/* Global Rarity Card */}
            <div className="bg-black/30 border border-white/5 rounded-xl p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-zinc-400">
                  Global Rarity
                </span>
                <span
                  className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded border leading-none ${rarity.color}`}
                >
                  {rarity.label}
                </span>
              </div>
              <div className="text-lg font-black text-white font-mono">
                {achievement.rarity_percentage}%
              </div>
              <div className="text-[10px] text-zinc-400">
                of all Steam players
              </div>
            </div>

            {/* Hunter XP Value */}
            <div className="bg-black/30 border border-white/5 rounded-xl p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-zinc-400">
                  Hunter Value
                </span>
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="text-lg font-black text-amber-300 font-mono">
                +{rarity.xp} <span className="text-xs font-bold text-amber-300/80">XP</span>
              </div>
              <div className="text-[10px] text-zinc-400">
                Achievement Hub points
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/10 bg-white/[0.02] flex items-center justify-between">
          <span className="text-[10px] text-zinc-400 font-mono truncate max-w-[200px]" title={achievement.api_name}>
            ID: {achievement.api_name}
          </span>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
