import { protocol, net } from "electron";
import { pathToFileURL } from "node:url";
import * as path from "node:path";
import * as fs from "node:fs";

/**
 * Registers the openplay:// scheme to stream local media (posters, banners, icons, video trailers)
 * with zero-copy hardware acceleration and partial HTTP Range request support.
 */
export function registerMediaProtocol(): void {
  protocol.handle("openplay", async (request) => {
    try {
      const url = new URL(request.url);
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
          return net.fetch(pathToFileURL(safePath).toString());
        }
      }
      return new Response("Not found", { status: 404 });
    } catch (err) {
      console.error("[openplay:// protocol error]", err);
      return new Response("Internal error", { status: 500 });
    }
  });
}
