import { convertFileSrc } from "@tauri-apps/api/core";

const KNOWN_SGDB_APNG_GRID_HASHES = new Set([
  "5164b46830eb9b286b4e6dd514d84d8c",
  "1bb6ff4f6f52891ba537ccb13cab09af",
  "02b293533a7ab5cb9362b406c8e402fd",
]);

export function isVideoSrc(pathOrUrl?: string): boolean {
  if (!pathOrUrl) return false;
  const resolved = resolveImageSrc(pathOrUrl) || pathOrUrl;
  const clean = resolved.split("?")[0].split("#")[0].toLowerCase();
  return (
    clean.endsWith(".webm") ||
    clean.endsWith(".mp4") ||
    clean.endsWith(".m4v") ||
    clean.endsWith(".ogg")
  );
}

export function getStaticFallbackCover(pathOrUrl?: string): string | undefined {
  if (!pathOrUrl) return undefined;
  if (!isVideoSrc(pathOrUrl)) return resolveImageSrc(pathOrUrl);

  const resolved = resolveImageSrc(pathOrUrl);
  if (!resolved) return undefined;

  // SteamGridDB does not host static .jpg/.png files for animated .webm hashes
  if (resolved.includes("steamgriddb.com")) {
    return undefined;
  }

  return resolved.replace(/\.(webm|mp4|m4v|ogg)$/i, ".jpg");
}

export function resolveImageSrc(pathOrUrl?: string): string | undefined {
  if (!pathOrUrl) return undefined;

  // Map heavy animated SteamGridDB WebP/APNG files (up to 49MB compressed / 1.3GB uncompressed RGBA in WebKitGTK)
  // to their lightweight hardware-accelerated .webm streams (~58KB - 2.8MB)
  if (pathOrUrl.includes("steamgriddb.com")) {
    const clean = pathOrUrl.split("?")[0].split("#")[0];
    const file = clean.split("/").pop() || "";
    const dotIdx = file.lastIndexOf(".");
    if (dotIdx > 0) {
      const hash = file.slice(0, dotIdx);
      const ext = file.slice(dotIdx + 1).toLowerCase();
      if (ext === "webp" || KNOWN_SGDB_APNG_GRID_HASHES.has(hash)) {
        if (clean.includes("/grid/")) {
          return `https://cdn2.steamgriddb.com/thumb/${hash}.webm`;
        }
        if (clean.includes("/hero/")) {
          return `https://cdn2.steamgriddb.com/hero_thumb/${hash}.webm`;
        }
        if (clean.includes("/logo/")) {
          return `https://cdn2.steamgriddb.com/logo_thumb/${hash}.webm`;
        }
      }
    }
  }

  if (
    pathOrUrl.startsWith("http://") ||
    pathOrUrl.startsWith("https://") ||
    pathOrUrl.startsWith("data:") ||
    pathOrUrl.startsWith("blob:") ||
    pathOrUrl.startsWith("asset:")
  ) {
    return pathOrUrl;
  }
  // Built-in public/videos assets served by Vite dev server or packaged dist/
  if (pathOrUrl.startsWith("/videos/") || pathOrUrl.startsWith("./videos/")) {
    const cleanRel = pathOrUrl.startsWith("./") ? pathOrUrl.slice(1) : pathOrUrl;
    const prefix =
      typeof window !== "undefined" && window.location?.protocol === "file:"
        ? "."
        : "";
    return encodeURI(`${prefix}${cleanRel}`);
  }
  // Ignore unresolvable custom:// or Windows drive paths on Linux/POSIX
  if (pathOrUrl.startsWith("custom://")) {
    return undefined;
  }
  if (/^[a-zA-Z]:[\\/]/.test(pathOrUrl)) {
    return undefined;
  }
  try {
    // Normalize Windows backslashes to forward slashes to avoid Edge Webview2 %5C URL encoding issues
    const normalized = pathOrUrl.replace(/\\/g, "/");
    return convertFileSrc(normalized);
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

  if (resolved.includes("images.igdb.com/igdb/image/upload/t_1080p/")) {
    return resolved.replace("/t_1080p/", targetHeight > 540 ? "/t_720p/" : "/t_cover_big/");
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
