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
