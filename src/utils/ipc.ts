// OpenPlay Universal IPC Bridge (Electron <-> Tauri <-> Browser fallback)

export interface DisplayInfo {
  id: string;
  label: string;
  width: number;
  height: number;
  x: number;
  y: number;
  isPrimary: boolean;
}

export interface WindowControls {
  minimize: () => Promise<void>;
  restore: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  maximize: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  setFullscreen: (enabled: boolean, displayId?: string) => Promise<boolean>;
  isFullscreen: () => Promise<boolean>;
  getDisplays: () => Promise<DisplayInfo[]>;
  onResized: (handler: () => void) => Promise<() => void>;
  close: () => Promise<void>;
  startDragging: () => Promise<void>;
}

declare global {
  interface Window {
    openplayAPI?: {
      invoke: (command: string, args?: any) => Promise<any>;
      listen: (event: string, callback: (eventData: { payload: any }) => void) => () => void;
      convertFileSrc: (filePath: string) => string;
      minimize: () => Promise<void>;
      restore?: () => Promise<void>;
      maximize: () => Promise<boolean>;
      close: () => Promise<void>;
      isMaximized: () => Promise<boolean>;
      setFullscreen?: (enabled: boolean, displayId?: string) => Promise<boolean>;
      isFullscreen?: () => Promise<boolean>;
      getDisplays?: () => Promise<DisplayInfo[]>;
    };
    __TAURI_INTERNALS__?: any;
  }
}

export type FilePickerCommand =
  | "select_file"
  | "select_directory"
  | "select_multiple_files";

type FilePickerInterceptorFn = (
  command: FilePickerCommand,
  args?: Record<string, any>
) => Promise<any> | null;

let filePickerInterceptor: FilePickerInterceptorFn | null = null;

export function setControllerFilePickerInterceptor(
  fn: FilePickerInterceptorFn | null
) {
  filePickerInterceptor = fn;
}

/**
 * Invokes an IPC command on the backend.
 * Routes directly to Electron's openplay-core daemon supervisor via window.openplayAPI,
 * or falls back to Tauri's native IPC if running inside Tauri.
 */
export async function invoke<T = any>(command: string, args?: Record<string, any>): Promise<T> {
  if (
    filePickerInterceptor &&
    (command === "select_file" ||
      command === "select_directory" ||
      command === "select_multiple_files")
  ) {
    const intercepted = filePickerInterceptor(command, args);
    if (intercepted) {
      return intercepted as Promise<T>;
    }
  }

  if (typeof window !== "undefined" && window.openplayAPI?.invoke) {
    return window.openplayAPI.invoke(command, args) as Promise<T>;
  }

  // Fallback to Tauri if running in Tauri runtime
  if (typeof window !== "undefined" && window.__TAURI_INTERNALS__) {
    const tauriCore = await import("@tauri-apps/api/core");
    return tauriCore.invoke<T>(command, args);
  }

  console.warn(`[IPC] No native bridge available for '${command}'. Returning null.`);
  return null as unknown as T;
}

export type UnlistenFn = () => void;

/**
 * Listens for backend push events (scans, achievements, sync, themes, OAuth detection).
 */
export async function listen<T = any>(
  event: string,
  callback: (eventData: { payload: T }) => void
): Promise<UnlistenFn> {
  if (typeof window !== "undefined" && window.openplayAPI?.listen) {
    const unlisten = window.openplayAPI.listen(event, callback as any);
    return unlisten;
  }

  // Fallback to Tauri
  if (typeof window !== "undefined" && window.__TAURI_INTERNALS__) {
    const tauriEvent = await import("@tauri-apps/api/event");
    return tauriEvent.listen<T>(event, callback as any);
  }

  return () => {};
}

/**
 * Converts a local filesystem path to a hardware-accelerated streaming URL (openplay://file/...)
 */
export function convertFileSrc(filePath: string): string {
  if (!filePath) return "";

  if (
    filePath.startsWith("http://") ||
    filePath.startsWith("https://") ||
    filePath.startsWith("data:") ||
    filePath.startsWith("blob:") ||
    filePath.startsWith("asset:") ||
    filePath.startsWith("openplay://")
  ) {
    return filePath;
  }

  if (typeof window !== "undefined" && window.openplayAPI?.convertFileSrc) {
    return window.openplayAPI.convertFileSrc(filePath);
  }

  const normalized = filePath.replace(/\\/g, "/");
  const leading = normalized.startsWith("/") ? normalized : "/" + normalized;
  return `openplay://file${encodeURI(leading)}`;
}

/**
 * Native frameless window controls
 */
export function getCurrentWindow(): WindowControls {
  return {
    minimize: async () => {
      if (typeof window !== "undefined" && window.openplayAPI?.minimize) {
        await window.openplayAPI.minimize();
      }
    },
    restore: async () => {
      if (typeof window !== "undefined" && window.openplayAPI?.restore) {
        await window.openplayAPI.restore();
      }
    },
    toggleMaximize: async () => {
      if (typeof window !== "undefined" && window.openplayAPI?.maximize) {
        await window.openplayAPI.maximize();
      }
    },
    maximize: async () => {
      if (typeof window !== "undefined" && window.openplayAPI?.maximize) {
        await window.openplayAPI.maximize();
      }
    },
    isMaximized: async () => {
      if (typeof window !== "undefined" && window.openplayAPI?.isMaximized) {
        return await window.openplayAPI.isMaximized();
      }
      return false;
    },
    setFullscreen: async (enabled: boolean, displayId?: string) => {
      if (typeof window !== "undefined" && window.openplayAPI?.setFullscreen) {
        return await window.openplayAPI.setFullscreen(enabled, displayId);
      }
      try {
        if (enabled && !document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
          return true;
        } else if (!enabled && document.fullscreenElement) {
          await document.exitFullscreen();
          return false;
        }
      } catch {}
      return enabled;
    },
    isFullscreen: async () => {
      if (typeof window !== "undefined" && window.openplayAPI?.isFullscreen) {
        return await window.openplayAPI.isFullscreen();
      }
      return Boolean(typeof document !== "undefined" && document.fullscreenElement);
    },
    getDisplays: async () => {
      if (typeof window !== "undefined" && window.openplayAPI?.getDisplays) {
        return await window.openplayAPI.getDisplays();
      }
      return [];
    },
    onResized: async (handler: () => void) => {
      if (typeof window !== "undefined") {
        window.addEventListener("resize", handler);
        return () => window.removeEventListener("resize", handler);
      }
      return () => {};
    },
    close: async () => {
      if (typeof window !== "undefined" && window.openplayAPI?.close) {
        await window.openplayAPI.close();
      }
    },
    startDragging: async () => {
      // In Electron frameless windows, dragging is handled natively by CSS:
      // -webkit-app-region: drag;
    },
  };
}

/**
 * Returns the current application version.
 */
export async function getVersion(): Promise<string> {
  try {
    const ver = await invoke<string>("get_app_version");
    return ver || "0.1.4";
  } catch {
    return "0.1.4";
  }
}

/**
 * Opens an external URL or local path using the system default handler.
 */
export async function openUrl(url: string): Promise<void> {
  if (!url) return;
  if (url.startsWith("file://")) {
    const rawPath = decodeURIComponent(url.replace(/^file:\/\/\/?/, "/"));
    await invoke("open_in_explorer", { path: rawPath });
    return;
  }
  await invoke("open_external_url", { url });
}

export async function openPath(path: string): Promise<void> {
  if (!path) return;
  await invoke("open_in_explorer", { path });
}
