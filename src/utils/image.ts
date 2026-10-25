import { convertFileSrc } from "@tauri-apps/api/core";

export function resolveImageSrc(pathOrUrl?: string): string | undefined {
  if (!pathOrUrl) return undefined;
  if (
    pathOrUrl.startsWith("http://") ||
    pathOrUrl.startsWith("https://") ||
    pathOrUrl.startsWith("data:") ||
    pathOrUrl.startsWith("blob:") ||
    pathOrUrl.startsWith("asset:")
  ) {
    return pathOrUrl;
  }
  try {
    return convertFileSrc(pathOrUrl);
  } catch (err) {
    console.warn("Could not convert local file src:", pathOrUrl, err);
    return pathOrUrl;
  }
}

/**
 * Resolves cover artwork optimized for library poster grids and cards.
 * Uses CDN server-side resizing on raw multi-megabyte storefront portrait assets
 * (e.g., Epic Games 1200x1600+ PNGs/JPGs) so raster decoding stays instant during scroll.
 */
export function resolveGridCoverSrc(
  pathOrUrl?: string,
  targetHeight = 540
): string | undefined {
  const resolved = resolveImageSrc(pathOrUrl);
  if (!resolved) return undefined;

  if (
    resolved.startsWith("https://cdn1.epicgames.com/") &&
    !resolved.includes("resize=1")
  ) {
    const sep = resolved.includes("?") ? "&" : "?";
    return `${resolved}${sep}h=${targetHeight}&resize=1`;
  }

  return resolved;
}

export function formatPlaytime(seconds: number): string {
  if (!seconds || seconds <= 0) return "Never";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours} hr ${minutes > 0 ? `${minutes} min` : ""}`;
  }
  return `${minutes} minutes`;
}

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  return `${mb.toFixed(2)} MB`;
}
