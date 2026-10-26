import { Game } from "../types/game";

export type CompletionStatus =
  | "Auto"
  | "Untouched"
  | "In Progress"
  | "Hunting"
  | "Beaten"
  | "Mastered"
  | "Forgotten";

export const ALL_COMPLETION_STATUSES: CompletionStatus[] = [
  "Auto",
  "Untouched",
  "In Progress",
  "Beaten",
  "Hunting",
  "Mastered",
  "Forgotten",
];

export function normalizeCompletionStatus(raw?: string | null): CompletionStatus {
  if (!raw) return "Auto";
  const s = raw.trim();
  if (
    s === "Untouched" ||
    s === "In Progress" ||
    s === "Hunting" ||
    s === "Beaten" ||
    s === "Mastered" ||
    s === "Forgotten"
  ) {
    return s as CompletionStatus;
  }
  return "Auto";
}

export interface EffectiveStatusResult {
  status: CompletionStatus;
  isAuto: boolean;
  label: string;
  badgeClass: string;
  iconName: "Crown" | "ShieldCheck" | "Target" | "Flame" | "Clock" | "CircleDot" | "Sparkles";
}

export function getEffectiveCompletionStatus(
  game: Game,
  summary?: { total_achievements?: number; unlocked_achievements?: number; is_perfect?: boolean } | null
): EffectiveStatusResult {
  const raw = (game.completion_status || "Auto").trim();
  const isAutoMode = raw === "Auto" || !raw;

  const totalAchs = summary?.total_achievements ?? 0;
  const unlockedAchs = summary?.unlocked_achievements ?? 0;
  const isPerfect = summary?.is_perfect || (totalAchs > 0 && unlockedAchs === totalAchs);
  const completionPct = totalAchs > 0 ? (unlockedAchs / totalAchs) * 100 : 0;
  const isHunting = totalAchs > 0 && completionPct >= 75 && completionPct < 100;

  // 1. Mastered: 100% achievements unlocked (highest priority in Auto, or if Beaten)
  if (isPerfect && totalAchs > 0) {
    if (isAutoMode || raw === "Beaten" || raw === "Completed") {
      return formatStatusResult("Mastered", isAutoMode);
    }
  }

  // 2. Hunting: >= 75% achievements (overrides Beaten status if applicable)
  if (isHunting) {
    if (isAutoMode || raw === "Beaten" || raw === "Completed" || game.auto_beaten) {
      return formatStatusResult("Hunting", isAutoMode);
    }
  }

  // 3. If user explicitly chose a manual status (not Auto and not overridden), honor it
  if (
    raw === "Untouched" ||
    raw === "In Progress" ||
    raw === "Hunting" ||
    raw === "Beaten" ||
    raw === "Mastered" ||
    raw === "Forgotten"
  ) {
    return formatStatusResult(raw as CompletionStatus, false);
  }

  // Backward compatibility with legacy values
  if (raw === "Completed") {
    return formatStatusResult("Beaten", false);
  }

  // Dynamic Auto evaluation:
  // 4. Beaten (Auto confirmed): user confirmed completion of main story while in Auto mode
  if (game.auto_beaten) {
    return formatStatusResult("Beaten", true);
  }

  // 5. Untouched: Never started
  const playtime = game.playtime_seconds || 0;
  const hasPlayed = playtime > 0 || unlockedAchs > 0 || !!game.last_played;
  if (!hasPlayed) {
    return formatStatusResult("Untouched", true);
  }

  // 6. Forgotten: Played, but not touched in > 180 days (~6 months)
  if (game.last_played) {
    const lastPlayedDate = new Date(game.last_played).getTime();
    if (!isNaN(lastPlayedDate)) {
      const daysSince = (Date.now() - lastPlayedDate) / (1000 * 60 * 60 * 24);
      if (daysSince > 180) {
        return formatStatusResult("Forgotten", true);
      }
    }
  }

  // 7. In Progress: actively played recently
  return formatStatusResult("In Progress", true);
}

function formatStatusResult(status: CompletionStatus, isAuto: boolean): EffectiveStatusResult {
  switch (status) {
    case "Mastered":
      return {
        status,
        isAuto,
        label: isAuto ? "Mastered (Auto)" : "Mastered",
        badgeClass: "bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.2)]",
        iconName: "Crown",
      };
    case "Beaten":
      return {
        status,
        isAuto,
        label: isAuto ? "Beaten (Auto)" : "Beaten",
        badgeClass: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.2)]",
        iconName: "ShieldCheck",
      };
    case "Hunting":
      return {
        status,
        isAuto,
        label: isAuto ? "Hunting (Auto)" : "Hunting",
        badgeClass: "bg-purple-500/20 text-purple-300 border-purple-500/40 shadow-[0_0_12px_rgba(168,85,247,0.2)]",
        iconName: "Target",
      };
    case "In Progress":
      return {
        status,
        isAuto,
        label: isAuto ? "In Progress (Auto)" : "In Progress",
        badgeClass: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.2)]",
        iconName: "Flame",
      };
    case "Forgotten":
      return {
        status,
        isAuto,
        label: isAuto ? "Forgotten (Auto)" : "Forgotten",
        badgeClass: "bg-orange-500/15 text-orange-300 border-orange-500/30",
        iconName: "Clock",
      };
    case "Untouched":
    default:
      return {
        status: "Untouched",
        isAuto,
        label: isAuto ? "Untouched (Auto)" : "Untouched",
        badgeClass: "bg-zinc-800/60 text-zinc-400 border-white/10",
        iconName: "CircleDot",
      };
  }
}

/**
 * Determines whether the "Did you beat the story?" modal should appear for a game.
 * Rules:
 * 1. Game must be in Auto mode (completion_status is "Auto" or unset).
 * 2. User has NOT already confirmed beaten (game.auto_beaten is false/falsy).
 * 3. Game must have valid HLTB main story hours (> 0).
 * 4. Current playtime must be >= HLTB main story hours (in seconds).
 * 5. If user previously selected "Not Yet" (beaten_prompt_playtime is set):
 *    current playtime must be >= beaten_prompt_playtime + 10% of main story hours (min 1 hour).
 */
export function shouldPromptBeatenModal(game: Game): boolean {
  const rawStatus = (game.completion_status || "Auto").trim();
  if (rawStatus !== "Auto") return false;

  if (game.auto_beaten) return false;

  const hltb = game.hltb_main;
  if (!hltb || hltb <= 0) return false;

  const currentPlaytime = game.playtime_seconds || 0;
  const mainStorySec = Math.round(hltb * 3600);

  // Must have reached main story hours
  if (currentPlaytime < mainStorySec) return false;

  // 10% step (at least 1 hour = 3600s)
  const stepSec = Math.max(3600, Math.round(hltb * 3600 * 0.10));

  if (game.beaten_prompt_playtime && game.beaten_prompt_playtime > 0) {
    if (currentPlaytime < game.beaten_prompt_playtime + stepSec) {
      return false;
    }
  }

  return true;
}

/**
 * Calculates the next playtime (in hours) at which the modal will prompt the user again if they answer "Not yet".
 */
export function getNextBeatenPromptHours(game: Game): number | null {
  const hltb = game.hltb_main;
  if (!hltb || hltb <= 0) return null;
  const currentPlaytime = game.playtime_seconds || 0;
  const stepSec = Math.max(3600, Math.round(hltb * 3600 * 0.10));
  const baseSec = game.beaten_prompt_playtime && game.beaten_prompt_playtime > 0
    ? Math.max(game.beaten_prompt_playtime, currentPlaytime)
    : currentPlaytime;
  const nextSec = baseSec + stepSec;
  return Math.round((nextSec / 3600) * 10) / 10;
}
