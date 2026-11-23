import { protocol, net } from "electron";
import { pathToFileURL } from "node:url";
import * as path from "node:path";
import * as fs from "node:fs";

/**
 * Registers the openplay:// scheme to:
 * 1. Serve the packaged frontend bundle & public assets via openplay://app/...
 * 2. Stream local media (posters, banners, icons, video trailers) via openplay://file/...
 *    with zero-copy hardware acceleration and partial HTTP Range request support.
 */
export function registerMediaProtocol(): void {
  const distDir = path.resolve(__dirname, "../dist");

  protocol.handle("openplay", async (request) => {
    try {
      const url = new URL(request.url);

      // 1. Packaged frontend bundle & public assets (openplay://app/...)
      if (url.host === "app") {
        const relPath = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
        let target = path.resolve(distDir, relPath);
        if (!target.startsWith(distDir)) {
          return new Response("Forbidden", { status: 403 });
        }
        if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
          target = path.join(distDir, "index.html");
        }
        return net.fetch(pathToFileURL(target).toString(), {
          headers: request.headers,
        });
      }

      // 2. Local filesystem media streaming (openplay://file/...)
      let rawPath = "";
      if (url.host === "file") {
        rawPath = decodeURIComponent(url.pathname);
      } else if (!url.host && url.pathname) {
        rawPath = decodeURIComponent(url.pathname);
      } else if (url.host) {
        rawPath = decodeURIComponent(`/${url.host}${url.pathname}`);
      }

      if (rawPath) {
        if (process.platform === "win32" && /^\/[a-zA-Z]:/.test(rawPath)) {
          rawPath = rawPath.slice(1);
        }
        const safePath = path.normalize(rawPath);
        if (fs.existsSync(safePath)) {
          return net.fetch(pathToFileURL(safePath).toString(), {
            headers: request.headers,
          });
        }
      }
      return new Response("Not found", { status: 404 });
    } catch (err) {
      console.error("[openplay:// protocol error]", err);
      return new Response("Internal error", { status: 500 });
    }
  });
}
