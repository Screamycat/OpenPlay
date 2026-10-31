/**
 * Date formatting helpers for OpenPlay
 */

/**
 * Safely extracts a 4-digit release year from various date formats:
 * - Natural Steam strings: "27 May, 2022" -> "2022"
 * - ISO date strings: "2022-05-27" -> "2022"
 * - Month-Year strings: "Nov 2020" -> "2020"
 * - Year only: "2015" -> "2015"
 * - Quarter / text: "Q4 2024" -> "2024"
 */
export function formatReleaseYear(dateStr?: string | null): string | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // Search for any 4-digit year (19xx or 20xx)
  const match = trimmed.match(/\b(19\d{2}|20\d{2})\b/);
  if (match) {
    return match[1];
  }

  // Fallback to first 4 characters if it starts with 4 digits
  if (/^\d{4}/.test(trimmed)) {
    return trimmed.slice(0, 4);
  }

  return trimmed;
}

/**
 * Formats an achievement unlock timestamp into a clean, human-readable date/time.
 * Handles ISO 8601 strings (e.g. "2021-12-31T18:37:37.7160000Z"), Unix epoch timestamps,
 * or existing formatted strings.
 *
 * @param raw The raw timestamp string
 * @param shortOnly If true, formats as date-only (e.g. "Dec 31, 2021"). If false, includes time.
 */
export function formatUnlockDate(raw?: string | null, shortOnly: boolean = false): string {
  if (!raw || !raw.trim()) return "";
  const s = raw.trim();

  // 1. Unix epoch numeric string (e.g. "1640975857")
  if (/^\d{9,13}$/.test(s)) {
    const num = parseInt(s, 10);
    const ms = num < 1e11 ? num * 1000 : num;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) {
      return shortOnly
        ? d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
        : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) +
            " • " +
            d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    }
  }

  // 2. Standard ISO 8601 / RFC 3339 or parseable date string
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const hasTime = s.includes("T") || (s.includes(":") && !s.startsWith("http"));
    if (!shortOnly && hasTime) {
      return (
        d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) +
        " • " +
        d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
      );
    }
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  // 3. Fallback: Clean up ISO strings with 'T' and microseconds
  if (s.includes("T")) {
    const parts = s.split("T");
    const datePart = parts[0];
    const timePart = parts[1] ? parts[1].split(".")[0].replace("Z", "") : "";
    return shortOnly || !timePart ? datePart : `${datePart} • ${timePart}`;
  }

  return s;
}
