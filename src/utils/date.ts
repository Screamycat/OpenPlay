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
