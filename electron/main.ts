import { app, BrowserWindow, ipcMain, protocol, dialog, shell, nativeImage } from "electron";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { spawn } from "node:child_process";
import { registerMediaProtocol } from "./protocol";
import { startDaemon, stopDaemon, invoke as daemonInvoke, onDaemonEvent } from "./daemon";
import { handleStoreOAuth } from "./oauth";
import { applyUpdateAndRestart } from "./updater";
import {
  getEnrichedDisplays,
  enterFullscreenOnTargetDisplay,
  reapplyTargetDisplayFullscreen,
  exitTargetDisplayFullscreen,
  restorePrimaryDisplaySync,
  hasActiveTargetDisplay,
} from "./displayManager";
import {
  getAudioOutputs,
  switchAudioOutput,
  restoreAudioOutputAsync,
  restoreAudioOutputSync,
} from "./audioManager";

// 1. Register openplay:// scheme privileges before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: "openplay",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      bypassCSP: true,
    },
  },
]);

// 2. Hardware acceleration flags for butter-smooth Skia rendering
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");
app.commandLine.appendSwitch("ignore-gpu-blocklist");

// Disable sandbox and prevent Wayland Ozone/Vulkan conflict on Linux
app.setName("OpenPlay");
if (process.platform === "linux") {
  app.commandLine.appendSwitch("no-sandbox");
  app.commandLine.appendSwitch("disable-features", "Vulkan");
  app.commandLine.appendSwitch("ozone-platform-hint", "auto");
  app.commandLine.appendSwitch("class", "openplay");
  if (typeof (app as any).setDesktopName === "function") {
    (app as any).setDesktopName("openplay.desktop");
  }
}

function resolveAppIconPath(): string | undefined {
  const candidates = [
    ...(process.resourcesPath
      ? [
          path.join(process.resourcesPath, "icon.png"),
          path.join(process.resourcesPath, "icons", "icon.png"),
        ]
      : []),
    path.join(__dirname, "../src-tauri/icons/icon.png"),
    path.join(__dirname, "../src-tauri/icons/128x128@2x.png"),
    path.join(process.cwd(), "src-tauri/icons/icon.png"),
  ];
  return candidates.find((p) => fs.existsSync(p));
}

function refreshLinuxDesktopCaches(appsDir: string, hicolorDir: string) {
  const trySpawn = (cmd: string, args: string[]) => {
    try {
      const child = spawn(cmd, args, { stdio: "ignore", detached: true });
      child.on("error", () => {});
      child.unref();
    } catch {
      // ignore if tool is unavailable on this distro
    }
  };
  trySpawn("update-desktop-database", [appsDir]);
  trySpawn("gtk-update-icon-cache", ["-f", "-t", hicolorDir]);
  trySpawn("kbuildsycoca6", []);
  trySpawn("kbuildsycoca5", []);
}

function ensureLinuxDesktopEntry(iconPath?: string) {
  if (process.platform !== "linux" || !iconPath) return;
  try {
    const appsDir = path.join(os.homedir(), ".local", "share", "applications");
    fs.mkdirSync(appsDir, { recursive: true });
    const desktopFile = path.join(appsDir, "openplay.desktop");
    const hicolorDir = path.join(os.homedir(), ".local", "share", "icons", "hicolor");
    const iconsDir = path.join(hicolorDir, "256x256", "apps");
    fs.mkdirSync(iconsDir, { recursive: true });
    const installedIcon = path.join(iconsDir, "openplay.png");
    fs.copyFileSync(iconPath, installedIcon);

    const existing = fs.existsSync(desktopFile) ? fs.readFileSync(desktopFile, "utf8") : "";

    if (app.isPackaged) {
      // Packaged build (installed binary or AppImage): register a real, visible system app entry
      const execTarget = process.env.APPIMAGE || process.execPath;
      const content = [
        "[Desktop Entry]",
        "Version=1.0",
        "Type=Application",
        "Name=OpenPlay",
        "GenericName=Game Library & Launcher",
        "Comment=Open-source, offline-first cross-platform game launcher",
        `Exec="${execTarget}" %U`,
        `Icon=${installedIcon}`,
        "Terminal=false",
        "Categories=Game;",
        "Keywords=games;launcher;library;steam;epic;gog;retro;console;",
        "StartupNotify=true",
        "StartupWMClass=openplay",
        "",
      ].join("\n");

      if (existing !== content) {
        fs.writeFileSync(desktopFile, content, "utf8");
        refreshLinuxDesktopCaches(appsDir, hicolorDir);
      }
    } else {
      // Dev mode: never overwrite an installed user .desktop entry (which has Exec= and is visible)
      if (existing.includes("Exec=") && !existing.includes("NoDisplay=true")) {
        return;
      }
      const devStub = [
        "[Desktop Entry]",
        "Type=Application",
        "Name=OpenPlay",
        "Comment=Cross-Platform Game Library & Launcher",
        `Icon=${installedIcon}`,
        "Categories=Game;",
        "StartupWMClass=openplay",
        "NoDisplay=true",
        "",
      ].join("\n");
      if (!existing.includes(`Icon=${installedIcon}`) || !existing.includes("StartupWMClass=openplay")) {
        fs.writeFileSync(desktopFile, devStub, "utf8");
      }
    }
  } catch (err) {
    console.warn("[Linux Icon] Could not register openplay.desktop:", err);
  }
}

let mainWindow: BrowserWindow | null = null;

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

async function createWindow() {
  const iconPath = resolveAppIconPath();
  ensureLinuxDesktopEntry(iconPath);
  const windowIcon = iconPath ? nativeImage.createFromPath(iconPath) : undefined;

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    backgroundColor: "#07080c",
    icon: windowIcon && !windowIcon.isEmpty() ? windowIcon : iconPath,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Forward daemon push events to renderer
  onDaemonEvent((event, payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("openplay:event", { event, payload });
    }
  });

  const isDev = !app.isPackaged;
  const devServerUrl = process.env.VITE_DEV_SERVER_URL || (isDev ? "http://localhost:1420" : null);

  if (devServerUrl) {
    console.log("[Electron] Connecting to dev server:", devServerUrl);
    let loaded = false;
    for (let attempt = 1; attempt <= 30; attempt++) {
      try {
        await mainWindow.loadURL(devServerUrl);
        loaded = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    if (!loaded) {
      console.warn("[Electron] Could not connect to dev server, falling back to openplay://app/index.html");
      await mainWindow.loadURL("openplay://app/index.html");
    }
  } else {
    console.log("[Electron] Loading production bundle via openplay://app/index.html");
    await mainWindow.loadURL("openplay://app/index.html");
  }
}

let wasFullscreenBeforeMinimize = false;

// Window control IPC handlers
ipcMain.handle("openplay:window:minimize", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isFullScreen()) {
      wasFullscreenBeforeMinimize = true;
      mainWindow.setFullScreen(false);
    }
    mainWindow.minimize();
  }
});

ipcMain.handle("openplay:window:restore", async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
    if (wasFullscreenBeforeMinimize) {
      wasFullscreenBeforeMinimize = false;
      if (hasActiveTargetDisplay()) {
        await new Promise((r) => setTimeout(r, 120));
        if (mainWindow && !mainWindow.isDestroyed()) {
          await reapplyTargetDisplayFullscreen(mainWindow);
        }
      } else {
        mainWindow.setFullScreen(true);
      }
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.focus();
    }
  }
});

ipcMain.handle("openplay:window:maximize", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
    return mainWindow.isMaximized();
  }
  return false;
});

ipcMain.handle("openplay:window:close", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
});

ipcMain.handle("openplay:window:isMaximized", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow.isMaximized();
  }
  return false;
});

let previousBoundsBeforeFullscreen: Electron.Rectangle | null = null;
let previousMaximizedBeforeFullscreen = false;

ipcMain.handle("openplay:window:getDisplays", async () => {
  return await getEnrichedDisplays();
});

ipcMain.handle("openplay:window:setFullscreen", async (_event, enabled: boolean, displayId?: string) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const wantFs = Boolean(enabled);
    if (wantFs) {
      if (!mainWindow.isFullScreen()) {
        previousMaximizedBeforeFullscreen = mainWindow.isMaximized();
        if (previousMaximizedBeforeFullscreen) {
          mainWindow.unmaximize();
        }
        previousBoundsBeforeFullscreen = mainWindow.getBounds();
      }

      return await enterFullscreenOnTargetDisplay(mainWindow, displayId);
    } else {
      const bounds = previousBoundsBeforeFullscreen;
      const prevMax = previousMaximizedBeforeFullscreen;
      previousBoundsBeforeFullscreen = null;
      previousMaximizedBeforeFullscreen = false;
      await exitTargetDisplayFullscreen(mainWindow, bounds, prevMax);
      return !mainWindow.isDestroyed() && mainWindow.isFullScreen();
    }
  }
  return false;
});

ipcMain.handle("openplay:window:isFullscreen", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow.isFullScreen();
  }
  return false;
});

ipcMain.handle("openplay:audio:getOutputs", async () => {
  return await getAudioOutputs();
});

ipcMain.handle("openplay:audio:setOutput", async (_event, sinkId?: string) => {
  return await switchAudioOutput(sinkId);
});

ipcMain.handle("openplay:audio:restore", async () => {
  await restoreAudioOutputAsync();
});

// Primary RPC Dispatcher
ipcMain.handle("openplay:invoke", async (_event, command: string, args: any) => {
  try {
    // 1. Intercept Storefront OAuth Login Windows
    if (
      command.startsWith("open_") &&
      command.endsWith("_login_window")
    ) {
      const handled = handleStoreOAuth(command, {
        mainWindow,
        sendEvent: (evt, payload) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("openplay:event", { event: evt, payload });
          }
        },
      });
      if (handled) return;
    }

    // 2. Intercept Native File / Folder Picker Dialogs for smooth UX
    const parseDialogFilters = (rawFilter?: string) => {
      if (!rawFilter) return [];
      const parsed: { name: string; extensions: string[] }[] = [];
      // On Linux, Libretro cores use .so shared libraries
      if (
        process.platform === "linux" &&
        (rawFilter.includes(".so") || rawFilter.includes(".dll")) &&
        !rawFilter.includes(".exe")
      ) {
        return [
          { name: "Libretro Cores (*.so)", extensions: ["so"] },
          { name: "All Files", extensions: ["*"] },
        ];
      }
      // On Linux, native binaries often have no extension; default executable pickers to All Files first
      if (process.platform === "linux" && (rawFilter.includes(".exe") || rawFilter.includes(".AppImage"))) {
        return [
          { name: "All Files & Linux Executables", extensions: ["*"] },
          { name: "Packages & Scripts", extensions: ["AppImage", "appimage", "sh", "desktop", "bin", "run", "x86_64", "exe"] },
        ];
      }
      // Support pipe-delimited filters like "Executable (*.exe;*.lnk;*.bat)|*.exe;*.lnk;*.bat|All files (*.*)|*.*"
      if (rawFilter.includes("|")) {
        const parts = rawFilter.split("|");
        for (let i = 0; i < parts.length - 1; i += 2) {
          const name = parts[i].replace(/\s*\(.*?\)\s*/g, "").trim() || "Files";
          const exts = parts[i + 1]
            .split(";")
            .map((e) => e.trim().replace(/^\*\./, ""))
            .filter((e) => e && e !== "*");
          if (exts.length > 0) {
            parsed.push({ name, extensions: exts });
          } else {
            parsed.push({ name: "All Files", extensions: ["*"] });
          }
        }
        if (parsed.length > 0) return parsed;
      }
      if (rawFilter.includes(".exe")) {
        parsed.push({
          name: "Game Executables",
          extensions: ["exe", "lnk", "bat", "cmd", "sh", "AppImage", "bin", "x86_64"],
        });
        parsed.push({ name: "All Files", extensions: ["*"] });
      } else if (rawFilter.includes(".zip")) {
        parsed.push({ name: "ZIP Archive", extensions: ["zip"] });
      } else if (rawFilter.includes(".mp4") || rawFilter.includes(".webm")) {
        parsed.push({ name: "Video Files", extensions: ["mp4", "webm", "mkv", "mov", "m4v"] });
        parsed.push({ name: "All Files", extensions: ["*"] });
      } else if (rawFilter.includes(".png") || rawFilter.includes(".jpg") || rawFilter.includes(".webp")) {
        parsed.push({ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "svg"] });
        parsed.push({ name: "All Files", extensions: ["*"] });
      } else if (rawFilter.includes(".mp3") || rawFilter.includes(".ogg") || rawFilter.includes(".wav") || rawFilter.includes(".flac")) {
        parsed.push({ name: "Audio Files", extensions: ["mp3", "ogg", "wav", "flac", "m4a", "opus"] });
        parsed.push({ name: "All Files", extensions: ["*"] });
      }
      return parsed;
    };

    if (command === "select_file") {
      const filters = parseDialogFilters(args?.filter as string | undefined);
      const res = await dialog.showOpenDialog(mainWindow!, {
        properties: ["openFile"],
        filters,
      });
      return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0];
    }

    if (command === "select_directory") {
      const res = await dialog.showOpenDialog(mainWindow!, {
        properties: ["openDirectory"],
      });
      return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0];
    }

    if (command === "select_multiple_files") {
      const filters = parseDialogFilters(args?.filter as string | undefined);
      const res = await dialog.showOpenDialog(mainWindow!, {
        properties: ["openFile", "multiSelections"],
        filters,
      });
      return res.canceled ? [] : res.filePaths;
    }

    if (command === "open_external_url") {
      const url = args?.url as string | undefined;
      if (url && (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("steam://") || url.startsWith("com.epicgames.launcher://"))) {
        await shell.openExternal(url);
      }
      return null;
    }

    if (command === "apply_update_and_restart") {
      const installerPath = (args?.installerPath || args?.installer_path) as string | undefined;
      if (!installerPath) {
        throw new Error("Missing installerPath parameter for apply_update_and_restart");
      }
      await applyUpdateAndRestart(installerPath);
      return null;
    }

    // 3. Forward all core business logic to Rust daemon
    return await daemonInvoke(command, args);
  } catch (err: any) {
    console.error(`[IPC Error] Command '${command}' failed:`, err);
    throw err;
  }
});

// App lifecycle
app.whenReady().then(async () => {
  registerMediaProtocol();

  try {
    await startDaemon();
  } catch (err) {
    console.error("[Electron] Failed to start openplay-core daemon:", err);
  }

  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  restoreAudioOutputSync();
  restorePrimaryDisplaySync();
  stopDaemon();
});

process.on("SIGINT", () => {
  restoreAudioOutputSync();
  restorePrimaryDisplaySync();
  app.quit();
});

process.on("SIGTERM", () => {
  restoreAudioOutputSync();
  restorePrimaryDisplaySync();
  app.quit();
});
