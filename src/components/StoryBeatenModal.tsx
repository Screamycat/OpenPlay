import React from "react";
import { Game } from "../types/game";
import { resolveGridCoverSrc, formatPlaytime } from "../utils/image";
import { getNextBeatenPromptHours } from "../utils/completionStatus";
import { ShieldCheck, Check, Clock, X, Sparkles, Gamepad2 } from "lucide-react";

interface StoryBeatenModalProps {
  game: Game;
  isOpen: boolean;
  onClose: () => void;
  onConfirmBeaten: () => void;
  onSnooze: () => void;
  onDisablePrompts?: () => void;
}

export const StoryBeatenModal: React.FC<StoryBeatenModalProps> = ({
  game,
  isOpen,
  onClose,
  onConfirmBeaten,
  onSnooze,
  onDisablePrompts,
}) => {
  if (!isOpen) return null;

  const coverSrc = resolveGridCoverSrc(game.cover_image);
  const nextHours = getNextBeatenPromptHours(game);
  const playtimeStr = formatPlaytime(game.playtime_seconds);
  const hasHltb = !!(game.hltb_main && game.hltb_main > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md theme-panel-surface border border-white/15 rounded-3xl p-6 shadow-2xl relative animate-in zoom-in-95 duration-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Subtle Background Glow Accent */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          title="Close (Ask later)"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header with Game artwork & Title */}
        <div className="flex items-center space-x-3.5 mb-5">
          <div className="w-12 h-16 rounded-lg overflow-hidden bg-zinc-800/80 border border-white/10 shrink-0 shadow-md flex items-center justify-center">
            {coverSrc ? (
              <img src={coverSrc} alt={game.title} className="w-full h-full object-cover" />
            ) : (
              <Gamepad2 className="w-6 h-6 text-zinc-500" />
            )}
          </div>
          <div className="min-w-0 pr-6">
            <div className="flex items-center space-x-1.5 text-emerald-400 text-xs font-bold tracking-wide uppercase">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Story Checkpoint</span>
            </div>
            <h2 className="text-lg font-black text-white truncate leading-tight mt-0.5">
              {game.title}
            </h2>
            <div className="text-xs text-zinc-400 flex items-center space-x-2 mt-0.5">
              <span>{playtimeStr} logged</span>
              {hasHltb && (
                <>
                  <span>·</span>
                  <span className="text-zinc-300">~{game.hltb_main}h story estimate</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Question Prompt */}
        <div className="space-y-3 mb-6">
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4">
            <p className="text-sm text-zinc-200 font-semibold leading-relaxed">
              Have you finished the main story or seen the credits roll for <span className="text-white font-bold">{game.title}</span>?
            </p>
          </div>

          {/* Auto Mode Explainer Banner */}
          <div className="flex items-start space-x-2.5 p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-200 text-xs leading-normal">
            <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <span>
              <strong>Auto mode stays on:</strong> Marking as beaten keeps automatic tracking active. When you unlock 100% of achievements, your status will automatically advance to <strong>Mastered</strong>!
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2">
          {/* Option 1: Yes, I've Beaten It */}
          <button
            onClick={onConfirmBeaten}
            className="w-full py-2.5 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all flex items-center justify-center space-x-2 cursor-pointer"
          >
            <Check className="w-4 h-4 stroke-[2.5]" />
            <span>Yes, I've Beaten It</span>
          </button>

          {/* Option 2: Not Yet (Snooze + 10%) */}
          <button
            onClick={onSnooze}
            className="w-full py-2.5 px-4 rounded-xl font-semibold text-sm bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/10 transition-colors flex items-center justify-center space-x-2 cursor-pointer"
          >
            <Clock className="w-4 h-4 text-zinc-400" />
            <span>
              Not Yet {nextHours ? `(Ask again at ~${nextHours}h)` : "(Ask again later)"}
            </span>
          </button>

          {/* Option 3: Dismiss permanently for this game */}
          {onDisablePrompts && (
            <div className="text-center pt-1">
              <button
                onClick={onDisablePrompts}
                className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors underline underline-offset-2 cursor-pointer"
              >
                Don't ask me again for this game
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
