import { Game } from "../types/game";

/**
 * Normalizes a game title for safe, collision-free duplicate detection.
 * Strips punctuation, symbols, and common edition subtitles (e.g. GOTY, Definitive).
 */
export function normalizeTitleForMerge(title: string): string {
  if (!title) return "";
  const lower = title.toLowerCase();
  const withoutEdition = lower
    .replace(/game of the year edition/gi, "")
    .replace(/game of the year/gi, "")
    .replace(/definitive edition/gi, "")
    .replace(/enhanced edition/gi, "")
    .replace(/remastered/gi, "")
    .replace(/digital deluxe edition/gi, "")
    .replace(/deluxe edition/gi, "")
    .replace(/standard edition/gi, "")
    .replace(/director's cut/gi, "");

  return withoutEdition.replace(/[^a-z0-9]/gi, "");
}

/**
 * Extracts a 4-digit year from an ISO or freeform release date string.
 */
function extractYear(releaseDate?: string): number | null {
  if (!releaseDate) return null;
  const match = releaseDate.match(/\b(19\d\d|20\d\d)\b/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Strict safety check: determines if two game instances represent the same title across platforms.
 */
export function canMergeGames(
  g1: Game,
  g2: Game,
  unmergedIds: Set<string> = new Set()
): boolean {
  if (g1.id === g2.id) return false;
  if (unmergedIds.has(g1.id) || unmergedIds.has(g2.id)) return false;

  const key1 = normalizeTitleForMerge(g1.title);
  const key2 = normalizeTitleForMerge(g2.title);

  if (!key1 || !key2 || key1 !== key2) return false;

  // Franchise reboot guard:
  // Across multi-store catalogs (Steam, Epic Games Store, GOG), live-service and back-catalog titles
  // are frequently added years apart (e.g. Warframe 2013 on Steam vs 2020 on Epic, Destiny 2 2019 on Steam vs 2021 on Epic).
  // Only guard against genuine generational reboots with identical bare titles (e.g. Doom 1993 vs Doom 2016, Prey 2006 vs Prey 2017)
  // where release dates are 8+ years apart and lack a distinct number or roman numeral identifier.
  const y1 = extractYear(g1.release_date);
  const y2 = extractYear(g2.release_date);
  if (y1 !== null && y2 !== null) {
    if (Math.abs(y1 - y2) >= 8) {
      const hasDistinctIdentifier = /\d+|(\b(ii|iii|iv|v|vi|vii|viii|ix|x)\b)/i.test(g1.title);
      if (!hasDistinctIdentifier) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Determines store/source priority rank for choosing the primary representation.
 */
function getSourcePriority(source?: string): number {
  const s = (source || "").toLowerCase();
  if (s === "steam") return 4;
  if (s === "epic") return 3;
  if (s === "local" || s === "manual") return 2;
  if (s.includes("retro")) return 1;
  return 0;
}

/**
 * Virtual Library Merger:
 * Groups duplicate games owned across multiple platforms into single unified cards.
 */
export function mergeDuplicateGames(
  games: Game[],
  enabled: boolean = true,
  unmergedIds: string[] = []
): Game[] {
  if (!enabled || games.length === 0) {
    return games;
  }

  const unmergedSet = new Set(unmergedIds);
  const groups = new Map<string, Game[]>();
  const unmergedGames: Game[] = [];

  for (const game of games) {
    if (unmergedSet.has(game.id)) {
      unmergedGames.push({ ...game, sibling_games: [] });
      continue;
    }

    const key = normalizeTitleForMerge(game.title);
    if (!key) {
      unmergedGames.push({ ...game, sibling_games: [] });
      continue;
    }

    const existing = groups.get(key);
    if (existing) {
      // Check year compatibility with group representative
      if (canMergeGames(existing[0], game, unmergedSet)) {
        existing.push(game);
      } else {
        // Year mismatch (e.g. 1993 vs 2016) -> Keep separate
        unmergedGames.push({ ...game, sibling_games: [] });
      }
    } else {
      groups.set(key, [game]);
    }
  }

  const mergedResults: Game[] = [];

  for (const group of groups.values()) {
    if (group.length === 1) {
      mergedResults.push({ ...group[0], sibling_games: [] });
      continue;
    }

    // Sort group members to pick the best primary game:
    // 1. Installed games take absolute precedence
    // 2. Highest playtime
    // 3. Store priority (Steam > Epic > Local > Retro)
    const sorted = [...group].sort((a, b) => {
      if (a.is_installed !== b.is_installed) {
        return a.is_installed ? -1 : 1;
      }
      if ((a.playtime_seconds || 0) !== (b.playtime_seconds || 0)) {
        return (b.playtime_seconds || 0) - (a.playtime_seconds || 0);
      }
      return getSourcePriority(b.source) - getSourcePriority(a.source);
    });

    const primary = { ...sorted[0] };
    const siblings = sorted.slice(1);

    // If any platform version is marked as favorite, the merged game reflects it
    const isAnyFavorite = group.some((g) => g.is_favorite);
    primary.is_favorite = isAnyFavorite;

    // Merge unique platform labels so category/platform filtering still discovers the game
    const combinedPlatforms = Array.from(
      new Set([
        ...(primary.platforms || []),
        ...siblings.flatMap((s) => s.platforms || []),
      ])
    );

    primary.platforms = combinedPlatforms;
    primary.sibling_games = siblings;

    mergedResults.push(primary);
  }

  return [...mergedResults, ...unmergedGames];
}

/**
 * Searches for potential merge candidates for an unmerged game.
 */
export function findMergeCandidate(
  game: Game,
  allGames: Game[],
  _unmergedIds: string[] = []
): Game | undefined {
  const targetKey = normalizeTitleForMerge(game.title);
  if (!targetKey) return undefined;

  return allGames.find((other) => {
    if (other.id === game.id) return false;
    // Don't propose if already a merged sibling of this game
    if (game.sibling_games?.some((s) => s.id === other.id)) return false;
    // Don't propose if this game is already a sibling of other
    if (other.sibling_games?.some((s) => s.id === game.id)) return false;

    const otherKey = normalizeTitleForMerge(other.title);
    if (otherKey !== targetKey) return false;

    // Check year compatibility using reboot guard
    const y1 = extractYear(game.release_date);
    const y2 = extractYear(other.release_date);
    if (y1 !== null && y2 !== null && Math.abs(y1 - y2) >= 8) {
      const hasDistinctIdentifier = /\d+|(\b(ii|iii|iv|v|vi|vii|viii|ix|x)\b)/i.test(game.title);
      if (!hasDistinctIdentifier) return false;
    }

    return true;
  });
}
