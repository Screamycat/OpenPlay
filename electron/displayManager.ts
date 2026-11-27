import { BrowserWindow, screen } from "electron";
import { execFile, execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface EnrichedDisplayInfo {
  id: string;
  outputName?: string;
  label: string;
  width: number;
  height: number;
  logicalWidth: number;
  logicalHeight: number;
  scaleFactor: number;
  x: number;
  y: number;
  isPrimary: boolean;
  isDisabled?: boolean;
}

interface OsOutputInfo {
  name: string;
  enabled: boolean;
  x: number;
  y: number;
  physicalWidth: number;
  physicalHeight: number;
  logicalWidth: number;
  logicalHeight: number;
  scale: number;
  isPrimary: boolean;
  priority: number;
  source: "kscreen" | "xrandr";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripAnsi(input: string): string {
  return input.replace(/\x1b\[[0-9;]*m/g, "");
}

function execFileAsync(
  file: string,
  args: string[],
  timeout = 4000
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(Object.assign(err, { stdout, stderr }));
      } else {
        resolve({ stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
      }
    });
  });
}

function isLinuxWayland(): boolean {
  if (process.platform !== "linux") return false;
  return (
    process.env.XDG_SESSION_TYPE?.toLowerCase() === "wayland" ||
    Boolean(process.env.WAYLAND_DISPLAY)
  );
}

function isLinuxKDE(): boolean {
  if (process.platform !== "linux") return false;
  const desktop = (
    process.env.XDG_CURRENT_DESKTOP ||
    process.env.DESKTOP_SESSION ||
    ""
  ).toLowerCase();
  return desktop.includes("kde") || desktop.includes("plasma") || process.env.KDE_FULL_SESSION === "true";
}

// Track active Console Mode display routing state so we always restore cleanly on exit/quit
let originalPrimaryOutput: string | null = null;
let originalPrimaryBackend: "kscreen" | "xrandr" | null = null;
let autoEnabledOutput: string | null = null;
let autoEnabledBackend: "kscreen" | "xrandr" | null = null;
let originalWindowOutput: string | null = null;
let activeTargetDisplay: EnrichedDisplayInfo | null = null;

function resolveKScreenOutputResolution(out: any): { width: number; height: number } {
  const rawW = Number(out?.size?.width ?? 0);
  const rawH = Number(out?.size?.height ?? 0);
  if (rawW > 0 && rawH > 0) {
    return { width: rawW, height: rawH };
  }
  const modes = Array.isArray(out?.modes) ? out.modes : [];
  if (modes.length > 0) {
    const preferredIds: string[] = [];
    if (out.currentModeId) preferredIds.push(String(out.currentModeId));
    if (Array.isArray(out.preferredModes)) {
      for (const id of out.preferredModes) preferredIds.push(String(id));
    }
    for (const pid of preferredIds) {
      const m = modes.find((mode: any) => String(mode?.id) === pid);
      const mw = Number(m?.size?.width ?? 0);
      const mh = Number(m?.size?.height ?? 0);
      if (mw > 0 && mh > 0) return { width: mw, height: mh };
    }
    // Fallback to highest resolution mode reported by EDID
    let bestW = 0;
    let bestH = 0;
    for (const m of modes) {
      const mw = Number(m?.size?.width ?? 0);
      const mh = Number(m?.size?.height ?? 0);
      if (mw * mh > bestW * bestH) {
        bestW = mw;
        bestH = mh;
      }
    }
    if (bestW > 0 && bestH > 0) return { width: bestW, height: bestH };
  }
  return { width: 0, height: 0 };
}

async function queryKScreenOutputs(): Promise<OsOutputInfo[] | null> {
  if (process.platform !== "linux") return null;
  try {
    const { stdout } = await execFileAsync("kscreen-doctor", ["-j"], 3500);
    const clean = stripAnsi(stdout).trim();
    if (!clean) return null;
    const jsonStart = clean.indexOf("{");
    if (jsonStart < 0) return null;
    const parsed = JSON.parse(clean.slice(jsonStart));
    const rawOutputs = Array.isArray(parsed?.outputs) ? parsed.outputs : [];
    const results: OsOutputInfo[] = [];

    for (const out of rawOutputs) {
      if (!out || !out.connected || !out.name) continue;
      const enabled = Boolean(out.enabled);
      const scale = typeof out.scale === "number" && out.scale > 0 ? out.scale : 1;
      const res = resolveKScreenOutputResolution(out);
      // KScreen rotation: 2 (Left/90) or 8 (Right/270) swaps width & height
      const rotated = out.rotation === 2 || out.rotation === 8;
      const physW = rotated ? res.height : res.width;
      const physH = rotated ? res.width : res.height;
      const posX = Number(out.pos?.x ?? 0);
      const posY = Number(out.pos?.y ?? 0);
      const priority = typeof out.priority === "number" ? out.priority : 99;

      results.push({
        name: String(out.name),
        enabled,
        x: posX,
        y: posY,
        physicalWidth: physW,
        physicalHeight: physH,
        logicalWidth: physW > 0 ? Math.round(physW / scale) : 0,
        logicalHeight: physH > 0 ? Math.round(physH / scale) : 0,
        scale,
        isPrimary: enabled && priority === 1,
        priority,
        source: "kscreen",
      });
    }

    // If no enabled output explicitly had priority === 1, lowest priority > 0 among enabled outputs is primary
    const enabledOutputs = results.filter((o) => o.enabled);
    if (enabledOutputs.length > 0 && !enabledOutputs.some((o) => o.isPrimary)) {
      const sorted = [...enabledOutputs].sort((a, b) => a.priority - b.priority);
      sorted[0].isPrimary = true;
    }

    return results.length > 0 ? results : null;
  } catch {
    return null;
  }
}

async function queryXrandrOutputs(): Promise<OsOutputInfo[] | null> {
  if (process.platform !== "linux") return null;
  try {
    const { stdout } = await execFileAsync("xrandr", ["--query"], 3000);
    const results: OsOutputInfo[] = [];
    const lines = stdout.split(/\r?\n/);
    const activeRegex = /^(\S+)\s+connected\s+(primary\s+)?(\d+)x(\d+)\+(-?\d+)\+(-?\d+)/;
    const disabledRegex = /^(\S+)\s+connected\s+\(/;
    const modeRegex = /^\s+(\d+)x(\d+)\s+/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const activeMatch = line.match(activeRegex);
      if (activeMatch) {
        const name = activeMatch[1];
        const isPrimary = Boolean(activeMatch[2]);
        const w = parseInt(activeMatch[3], 10);
        const h = parseInt(activeMatch[4], 10);
        const x = parseInt(activeMatch[5], 10);
        const y = parseInt(activeMatch[6], 10);
        results.push({
          name,
          enabled: true,
          x,
          y,
          physicalWidth: w,
          physicalHeight: h,
          logicalWidth: w,
          logicalHeight: h,
          scale: 1,
          isPrimary,
          priority: isPrimary ? 1 : 2,
          source: "xrandr",
        });
        continue;
      }

      const disabledMatch = line.match(disabledRegex);
      if (disabledMatch) {
        const name = disabledMatch[1];
        let w = 0;
        let h = 0;
        if (i + 1 < lines.length) {
          const nextMode = lines[i + 1].match(modeRegex);
          if (nextMode) {
            w = parseInt(nextMode[1], 10);
            h = parseInt(nextMode[2], 10);
          }
        }
        results.push({
          name,
          enabled: false,
          x: 0,
          y: 0,
          physicalWidth: w,
          physicalHeight: h,
          logicalWidth: w,
          logicalHeight: h,
          scale: 1,
          isPrimary: false,
          priority: 99,
          source: "xrandr",
        });
      }
    }
    return results.length > 0 ? results : null;
  } catch {
    return null;
  }
}

async function queryLinuxOutputs(): Promise<OsOutputInfo[] | null> {
  if (process.platform !== "linux") return null;
  if (isLinuxKDE()) {
    const kscreen = await queryKScreenOutputs();
    if (kscreen) return kscreen;
  }
  const xrandr = await queryXrandrOutputs();
  if (xrandr) return xrandr;
  // Last try: kscreen-doctor even if XDG_CURRENT_DESKTOP wasn't set
  return await queryKScreenOutputs();
}

function matchDisplaysToOsOutputs(
  electronDisplays: Electron.Display[],
  primaryId: number,
  osOutputs: OsOutputInfo[] | null
): Map<number, OsOutputInfo> {
  const matched = new Map<number, OsOutputInfo>();
  if (!osOutputs || osOutputs.length === 0) return matched;

  interface Candidate {
    displayId: number;
    output: OsOutputInfo;
    score: number;
  }

  const candidates: Candidate[] = [];
  for (const d of electronDisplays) {
    const labelLower = (d.label || "").toLowerCase();
    const scale = d.scaleFactor || 1;
    const estPhysW = Math.round(d.bounds.width * scale);
    const estPhysH = Math.round(d.bounds.height * scale);

    for (const out of osOutputs) {
      let score = 0;
      const outNameLower = out.name.toLowerCase();

      if (labelLower && (labelLower === outNameLower || labelLower.includes(outNameLower))) {
        score += 120;
      }

      if (Math.abs(out.x - d.bounds.x) <= 10 && Math.abs(out.y - d.bounds.y) <= 10) {
        score += 70;
      } else if (
        Math.abs(out.x - Math.round(d.bounds.x * scale)) <= 16 &&
        Math.abs(out.y - Math.round(d.bounds.y * scale)) <= 16
      ) {
        score += 45;
      }

      const matchesLogical =
        Math.abs(out.logicalWidth - d.bounds.width) <= 16 &&
        Math.abs(out.logicalHeight - d.bounds.height) <= 16;
      const matchesPhysical =
        Math.abs(out.physicalWidth - estPhysW) <= 16 &&
        Math.abs(out.physicalHeight - estPhysH) <= 16;
      const matchesRawBounds =
        Math.abs(out.physicalWidth - d.bounds.width) <= 16 &&
        Math.abs(out.physicalHeight - d.bounds.height) <= 16;

      if (matchesLogical || matchesPhysical || matchesRawBounds) {
        score += 50;
      }

      if (out.isPrimary === (d.id === primaryId)) {
        score += 15;
      }

      if (score > 0) {
        candidates.push({ displayId: d.id, output: out, score });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const usedDisplayIds = new Set<number>();
  const usedOutputs = new Set<string>();

  for (const c of candidates) {
    if (usedDisplayIds.has(c.displayId) || usedOutputs.has(c.output.name)) continue;
    matched.set(c.displayId, c.output);
    usedDisplayIds.add(c.displayId);
    usedOutputs.add(c.output.name);
  }

  return matched;
}

export async function getEnrichedDisplays(): Promise<EnrichedDisplayInfo[]> {
  const primary = screen.getPrimaryDisplay();
  const allDisplays = screen.getAllDisplays();
  const osOutputs = await queryLinuxOutputs();
  const enabledOsOutputs = osOutputs ? osOutputs.filter((o) => o.enabled) : null;
  const matched = matchDisplaysToOsOutputs(allDisplays, primary.id, enabledOsOutputs);

  const activeList: EnrichedDisplayInfo[] = allDisplays.map((d, idx) => {
    const osOut = matched.get(d.id);
    const scale = osOut?.scale || d.scaleFactor || 1;
    const physW = osOut?.physicalWidth || Math.round(d.bounds.width * scale);
    const physH = osOut?.physicalHeight || Math.round(d.bounds.height * scale);

    return {
      id: String(d.id),
      outputName: osOut?.name,
      label: d.label || osOut?.name || `Display ${idx + 1}`,
      width: physW,
      height: physH,
      logicalWidth: d.bounds.width,
      logicalHeight: d.bounds.height,
      scaleFactor: scale,
      x: d.bounds.x,
      y: d.bounds.y,
      isPrimary: osOut ? osOut.isPrimary : d.id === primary.id,
      isDisabled: false,
    };
  });

  // Also include connected-but-disabled outputs (e.g. a living-room TV kept off during desktop browsing)
  // so the user can select it as Target Display and have OpenPlay auto-enable it on Console Mode entry!
  if (osOutputs) {
    const activeOutputNames = new Set(
      activeList.map((d) => d.outputName?.toLowerCase()).filter(Boolean)
    );
    for (const out of osOutputs) {
      if (out.enabled || activeOutputNames.has(out.name.toLowerCase())) continue;
      activeList.push({
        id: out.name,
        outputName: out.name,
        label: out.name,
        width: out.physicalWidth,
        height: out.physicalHeight,
        logicalWidth: out.logicalWidth || out.physicalWidth,
        logicalHeight: out.logicalHeight || out.physicalHeight,
        scaleFactor: out.scale || 1,
        x: out.x,
        y: out.y,
        isPrimary: false,
        isDisabled: true,
      });
    }
  }

  return activeList;
}

async function resolveTargetDisplay(
  displayId: string
): Promise<{ info: EnrichedDisplayInfo; electronDisplay: Electron.Display | null } | null> {
  if (!displayId || displayId === "auto") return null;
  const enriched = await getEnrichedDisplays();
  const needle = String(displayId).trim();
  const needleLower = needle.toLowerCase();

  const info =
    enriched.find((d) => d.outputName && d.outputName.toLowerCase() === needleLower) ||
    enriched.find((d) => d.id === needle);

  if (!info) return null;

  const electronDisplay =
    screen.getAllDisplays().find((d) => String(d.id) === info.id) || null;

  return { info, electronDisplay };
}

async function enableAndPromoteLinuxOutput(
  targetOutputName: string,
  backend: "kscreen" | "xrandr",
  origPrimaryName: string | null
): Promise<boolean> {
  if (process.platform !== "linux" || !targetOutputName) return false;
  let succeeded = false;

  if (backend === "kscreen") {
    try {
      console.log(
        `[DisplayManager] Auto-enabling KDE display and setting primary -> ${targetOutputName}`
      );
      // Single atomic kscreen-doctor call: KDE automatically restores saved resolution/scale/HDR/position
      await execFileAsync(
        "kscreen-doctor",
        [`output.${targetOutputName}.enable`, `output.${targetOutputName}.primary`],
        5000
      );
      succeeded = true;
    } catch (err) {
      console.warn(`[DisplayManager] kscreen-doctor enable+primary failed:`, err);
    }
  } else {
    try {
      console.log(
        `[DisplayManager] Auto-enabling X11 display and setting primary -> ${targetOutputName}`
      );
      const args = ["--output", targetOutputName, "--auto"];
      if (origPrimaryName && origPrimaryName !== targetOutputName) {
        args.push("--right-of", origPrimaryName);
      }
      args.push("--primary");
      await execFileAsync("xrandr", args, 4000);
      succeeded = true;
    } catch (err) {
      console.warn(`[DisplayManager] xrandr enable+primary failed:`, err);
    }
  }

  if (!succeeded) return false;

  // Poll until HDMI handshake finishes and the display is live in both OS outputs and Electron
  const deadline = Date.now() + 4500;
  while (Date.now() < deadline) {
    await delay(220);
    const outputs = await queryLinuxOutputs();
    const isNowEnabled = outputs?.some(
      (o) => o.name.toLowerCase() === targetOutputName.toLowerCase() && o.enabled
    );
    if (isNowEnabled) {
      const resolved = await resolveTargetDisplay(targetOutputName);
      if (resolved?.electronDisplay) {
        break;
      }
    }
  }

  // Extra settle buffer for KWin workspace.screens & XWayland primary sync
  await delay(350);

  if (backend === "kscreen") {
    try {
      const xrOutputs = await queryXrandrOutputs();
      if (xrOutputs?.some((o) => o.name === targetOutputName && o.enabled)) {
        await execFileAsync("xrandr", ["--output", targetOutputName, "--primary"], 2500);
      }
    } catch {
      // Harmless on pure Wayland
    }
  }

  return true;
}

async function setLinuxPrimaryOutput(
  targetOutputName: string,
  backend: "kscreen" | "xrandr"
): Promise<boolean> {
  if (process.platform !== "linux" || !targetOutputName) return false;
  let succeeded = false;

  if (backend === "kscreen") {
    try {
      console.log(`[DisplayManager] Switching KDE primary display -> ${targetOutputName}`);
      await execFileAsync("kscreen-doctor", [`output.${targetOutputName}.primary`], 4000);
      succeeded = true;
    } catch (err) {
      console.warn(`[DisplayManager] kscreen-doctor primary switch failed:`, err);
    }

    // Belt-and-suspenders: also update XWayland/X11 primary if xrandr sees this output name
    try {
      const xrOutputs = await queryXrandrOutputs();
      if (xrOutputs?.some((o) => o.name === targetOutputName)) {
        await execFileAsync("xrandr", ["--output", targetOutputName, "--primary"], 2500);
      }
    } catch {
      // Harmless on pure Wayland or if xrandr doesn't expose the same connector name
    }
  } else {
    try {
      console.log(`[DisplayManager] Switching X11 primary display -> ${targetOutputName}`);
      await execFileAsync("xrandr", ["--output", targetOutputName, "--primary"], 3000);
      succeeded = true;
    } catch (err) {
      console.warn(`[DisplayManager] xrandr primary switch failed:`, err);
    }
  }

  return succeeded;
}

async function runKWinScript(scriptContent: string): Promise<boolean> {
  if (process.platform !== "linux") return false;
  const pluginName = `openplay_display_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const tmpFile = path.join(os.tmpdir(), `${pluginName}.js`);

  try {
    fs.writeFileSync(tmpFile, scriptContent, { encoding: "utf8", mode: 0o600 });
  } catch (err) {
    console.warn("[DisplayManager] Could not write temporary KWin script:", err);
    return false;
  }

  const tryWithGdbus = async (): Promise<boolean> => {
    const loadRes = await execFileAsync(
      "gdbus",
      [
        "call",
        "--session",
        "--dest",
        "org.kde.KWin",
        "--object-path",
        "/Scripting",
        "--method",
        "org.kde.kwin.Scripting.loadScript",
        tmpFile,
        pluginName,
      ],
      3000
    );

    const idMatch = loadRes.stdout.match(/(-?\d+)/);
    const scriptId = idMatch ? parseInt(idMatch[1], 10) : -1;
    if (scriptId < 0) {
      throw new Error(`KWin loadScript returned invalid id: ${loadRes.stdout}`);
    }

    // Plasma 6 mounts loaded scripts at /Scripting/Script<id>; Plasma 5 used /<id>
    let ran = false;
    try {
      await execFileAsync(
        "gdbus",
        [
          "call",
          "--session",
          "--dest",
          "org.kde.KWin",
          "--object-path",
          `/Scripting/Script${scriptId}`,
          "--method",
          "org.kde.kwin.Script.run",
        ],
        3000
      );
      ran = true;
    } catch {
      await execFileAsync(
        "gdbus",
        [
          "call",
          "--session",
          "--dest",
          "org.kde.KWin",
          "--object-path",
          `/${scriptId}`,
          "--method",
          "org.kde.kwin.Script.run",
        ],
        3000
      );
      ran = true;
    }

    // Clean up loaded script registration in KWin
    await execFileAsync(
      "gdbus",
      [
        "call",
        "--session",
        "--dest",
        "org.kde.KWin",
        "--object-path",
        `/Scripting/Script${scriptId}`,
        "--method",
        "org.kde.kwin.Script.stop",
      ],
      1500
    ).catch(() => {});
    await execFileAsync(
      "gdbus",
      [
        "call",
        "--session",
        "--dest",
        "org.kde.KWin",
        "--object-path",
        "/Scripting",
        "--method",
        "org.kde.kwin.Scripting.unloadScript",
        pluginName,
      ],
      1500
    ).catch(() => {});

    return ran;
  };

  const tryWithQdbus = async (bin: string): Promise<boolean> => {
    const loadRes = await execFileAsync(
      bin,
      ["org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting.loadScript", tmpFile, pluginName],
      3000
    );
    const idMatch = loadRes.stdout.match(/(-?\d+)/);
    const scriptId = idMatch ? parseInt(idMatch[1], 10) : -1;
    if (scriptId < 0) {
      throw new Error(`${bin} loadScript returned invalid id: ${loadRes.stdout}`);
    }

    try {
      await execFileAsync(
        bin,
        ["org.kde.KWin", `/Scripting/Script${scriptId}`, "org.kde.kwin.Script.run"],
        3000
      );
    } catch {
      await execFileAsync(
        bin,
        ["org.kde.KWin", `/${scriptId}`, "org.kde.kwin.Script.run"],
        3000
      );
    }

    await execFileAsync(
      bin,
      ["org.kde.KWin", `/Scripting/Script${scriptId}`, "org.kde.kwin.Script.stop"],
      1500
    ).catch(() => {});
    await execFileAsync(
      bin,
      ["org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting.unloadScript", pluginName],
      1500
    ).catch(() => {});

    return true;
  };

  try {
    try {
      return await tryWithGdbus();
    } catch (gdbusErr) {
      for (const bin of ["qdbus6", "qdbus"]) {
        try {
          return await tryWithQdbus(bin);
        } catch {
          // try next binary
        }
      }
      console.warn("[DisplayManager] KWin script execution failed:", gdbusErr);
      return false;
    }
  } finally {
    try {
      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }
    } catch {
      // ignore temp cleanup failure
    }
  }
}

async function moveWindowViaKWin(
  target: { outputName?: string; x: number; y: number },
  wantFullscreen: boolean
): Promise<boolean> {
  if (!isLinuxKDE()) return false;

  const script = `
(function () {
  var targetName = ${JSON.stringify(target.outputName || "")};
  var targetX = ${JSON.stringify(target.x)};
  var targetY = ${JSON.stringify(target.y)};
  var targetPid = ${JSON.stringify(process.pid)};
  var wantFs = ${JSON.stringify(wantFullscreen)};

  var windows = typeof workspace.windowList === "function"
    ? workspace.windowList()
    : (typeof workspace.clientList === "function" ? workspace.clientList() : []);

  var win = null;
  for (var i = 0; i < windows.length; i++) {
    var w = windows[i];
    if (w && w.pid === targetPid && w.normalWindow) {
      win = w;
      break;
    }
  }
  if (!win) {
    for (var i = 0; i < windows.length; i++) {
      var w = windows[i];
      if (w && w.pid === targetPid && !w.popupWindow && !w.tooltip) {
        win = w;
        break;
      }
    }
  }
  if (!win) {
    for (var i = 0; i < windows.length; i++) {
      var w = windows[i];
      if (!w || w.popupWindow || w.tooltip) continue;
      var cls = (w.resourceClass || "").toString().toLowerCase();
      var cap = (w.caption || "").toString().toLowerCase();
      if (cls.indexOf("openplay") !== -1 || cap.indexOf("openplay") !== -1) {
        win = w;
        break;
      }
    }
  }
  if (!win) return;

  var screens = workspace.screens || [];
  var targetScreen = null;
  if (targetName) {
    for (var j = 0; j < screens.length; j++) {
      if (screens[j] && screens[j].name === targetName) {
        targetScreen = screens[j];
        break;
      }
    }
  }
  if (!targetScreen && screens.length > 0) {
    var bestDist = 9999999;
    for (var j = 0; j < screens.length; j++) {
      var g = screens[j] && screens[j].geometry;
      if (!g) continue;
      var dist = Math.abs(g.x - targetX) + Math.abs(g.y - targetY);
      if (dist < bestDist) {
        bestDist = dist;
        targetScreen = screens[j];
      }
    }
  }

  if (win.minimized) {
    win.minimized = false;
  }

  if (targetScreen) {
    if (win.fullScreen && win.output !== targetScreen) {
      win.fullScreen = false;
    }
    if (typeof workspace.sendClientToScreen === "function") {
      workspace.sendClientToScreen(win, targetScreen);
    }
  }

  win.fullScreen = wantFs;
  try {
    workspace.activeWindow = win;
  } catch (e) {}
})();
`;

  console.log(
    `[DisplayManager] Moving window via KWin -> ${target.outputName || `(${target.x},${target.y})`} (fullscreen=${wantFullscreen})`
  );
  return await runKWinScript(script);
}

async function moveWindowAndFullscreen(
  mainWindow: BrowserWindow,
  target: EnrichedDisplayInfo,
  electronDisplay: Electron.Display
): Promise<void> {
  if (mainWindow.isDestroyed()) return;

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }

  // KDE Plasma Wayland: Wayland forbids clients from self-positioning with setBounds().
  // Use KWin scripting to send the window directly to the target output and fullscreen it.
  if (isLinuxWayland() && isLinuxKDE()) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    }
    const moved = await moveWindowViaKWin(
      { outputName: target.outputName, x: target.x, y: target.y },
      true
    );
    await delay(150);
    if (!mainWindow.isDestroyed()) {
      if (!mainWindow.isFullScreen()) {
        mainWindow.setFullScreen(true);
      }
      mainWindow.focus();
    }
    if (moved) return;
  }

  // X11 / Windows / macOS (and Wayland fallback): unfullscreen -> move bounds -> wait -> fullscreen
  if (mainWindow.isFullScreen()) {
    mainWindow.setFullScreen(false);
    await delay(120);
  }
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
    await delay(60);
  }

  const b = electronDisplay.bounds;
  mainWindow.setBounds({
    x: b.x + 40,
    y: b.y + 40,
    width: Math.max(800, Math.min(1280, b.width - 80)),
    height: Math.max(500, Math.min(720, b.height - 80)),
  });
  await delay(160);

  if (!mainWindow.isDestroyed()) {
    mainWindow.setFullScreen(true);
    mainWindow.focus();
  }
}

/**
 * Activates Console Mode fullscreen on the requested target display.
 * On Linux (KDE Wayland & X11), also temporarily sets the target display as the OS Primary Display
 * so that all launched games (Steam, Proton, Wine, Emulators, native) open on the target display too.
 */
export async function enterFullscreenOnTargetDisplay(
  mainWindow: BrowserWindow,
  displayId?: string
): Promise<boolean> {
  if (mainWindow.isDestroyed()) return false;

  if (!displayId || displayId === "auto") {
    activeTargetDisplay = null;
    mainWindow.setFullScreen(true);
    return mainWindow.isFullScreen();
  }

  let resolved = await resolveTargetDisplay(displayId);
  if (!resolved) {
    console.warn(`[DisplayManager] Could not find target display '${displayId}', using current display.`);
    activeTargetDisplay = null;
    mainWindow.setFullScreen(true);
    return mainWindow.isFullScreen();
  }

  let { info, electronDisplay } = resolved;
  activeTargetDisplay = info;

  // On Linux, record original primary & window output, auto-enable the target output if it was
  // kept disabled during desktop browsing, and promote it to OS Primary Display so launched games
  // (Steam/Proton/native/emulators) automatically open on the target display while keeping your
  // desktop monitor and all open desktop windows completely untouched.
  if (process.platform === "linux" && info.outputName) {
    const osOutputs = await queryLinuxOutputs();
    if (osOutputs && osOutputs.length > 0) {
      const enabledOutputs = osOutputs.filter((o) => o.enabled);
      const currentPrimary = enabledOutputs.find((o) => o.isPrimary) || enabledOutputs[0];
      const targetOsOut = osOutputs.find(
        (o) => o.name.toLowerCase() === info.outputName!.toLowerCase()
      );

      if (!originalPrimaryOutput && currentPrimary) {
        originalPrimaryOutput = currentPrimary.name;
        originalPrimaryBackend = currentPrimary.source;
      }

      if (!originalWindowOutput) {
        if (isLinuxWayland()) {
          // Wayland does not expose global window (x, y) coordinates to clients,
          // so trust the OS primary output recorded before switching.
          originalWindowOutput = originalPrimaryOutput;
        } else {
          try {
            const curDisplay = screen.getDisplayMatching(mainWindow.getBounds());
            const enriched = await getEnrichedDisplays();
            const curMatch = enriched.find((d) => d.id === String(curDisplay.id));
            originalWindowOutput = curMatch?.outputName || originalPrimaryOutput;
          } catch {
            originalWindowOutput = originalPrimaryOutput;
          }
        }
      }

      const backend = targetOsOut?.source || currentPrimary?.source || "kscreen";

      if (info.isDisabled || (targetOsOut && !targetOsOut.enabled)) {
        // Remember that WE enabled this display so exiting Console Mode disables it again
        if (!autoEnabledOutput) {
          autoEnabledOutput = info.outputName;
          autoEnabledBackend = backend;
        }
        await enableAndPromoteLinuxOutput(info.outputName, backend, originalPrimaryOutput);
        // Re-resolve now that the display is active and registered in Electron/KWin
        const refreshed = await resolveTargetDisplay(info.outputName);
        if (refreshed) {
          info = refreshed.info;
          electronDisplay = refreshed.electronDisplay;
          activeTargetDisplay = info;
        }
      } else if (currentPrimary && currentPrimary.name !== info.outputName) {
        const switched = await setLinuxPrimaryOutput(info.outputName, backend);
        if (switched) {
          // Give KWin / XWayland a brief moment to settle primary display transition
          await delay(300);
        }
      }
    }
  }

  if (electronDisplay) {
    await moveWindowAndFullscreen(mainWindow, info, electronDisplay);
  } else if (isLinuxWayland() && isLinuxKDE() && info.outputName) {
    // Even if Electron's display list lags behind KWin by a tick, KWin can still move by outputName
    await moveWindowViaKWin({ outputName: info.outputName, x: info.x, y: info.y }, true);
    await delay(150);
    if (!mainWindow.isDestroyed() && !mainWindow.isFullScreen()) {
      mainWindow.setFullScreen(true);
      mainWindow.focus();
    }
  } else {
    mainWindow.setFullScreen(true);
    mainWindow.focus();
  }
  return !mainWindow.isDestroyed() && mainWindow.isFullScreen();
}

/**
 * Re-applies fullscreen on the active Console Mode target display (e.g. after minimizing for a game).
 */
export async function reapplyTargetDisplayFullscreen(mainWindow: BrowserWindow): Promise<void> {
  if (mainWindow.isDestroyed()) return;
  if (!activeTargetDisplay) {
    mainWindow.setFullScreen(true);
    mainWindow.focus();
    return;
  }

  const resolved = await resolveTargetDisplay(activeTargetDisplay.outputName || activeTargetDisplay.id);
  if (resolved?.electronDisplay) {
    await moveWindowAndFullscreen(mainWindow, resolved.info, resolved.electronDisplay);
  } else {
    mainWindow.setFullScreen(true);
    mainWindow.focus();
  }
}

/**
 * Restores the OS Primary Display, moves OpenPlay back to its original monitor, and disables
 * any TV/display that Console Mode auto-enabled when exiting Console Mode.
 */
export async function exitTargetDisplayFullscreen(
  mainWindow: BrowserWindow,
  previousBounds: Electron.Rectangle | null,
  previousMaximized: boolean
): Promise<void> {
  const returnOutput = originalWindowOutput || originalPrimaryOutput;
  const hadPrimarySwitch = Boolean(originalPrimaryOutput);
  const hadAutoEnabled = Boolean(autoEnabledOutput);
  const hadTargetDisplay = Boolean(activeTargetDisplay);

  activeTargetDisplay = null;
  originalWindowOutput = null;

  // 1. Move OpenPlay window back to its original monitor & exit fullscreen BEFORE disabling the TV
  //    so the transition back to Desktop Mode is clean and flicker-free.
  if (!mainWindow.isDestroyed()) {
    if (isLinuxWayland() && isLinuxKDE() && (hadTargetDisplay || hadPrimarySwitch || hadAutoEnabled) && returnOutput) {
      await moveWindowViaKWin({ outputName: returnOutput, x: 0, y: 0 }, false);
      await delay(120);
    }
    if (!mainWindow.isDestroyed() && mainWindow.isFullScreen()) {
      mainWindow.setFullScreen(false);
    }
  }

  // 2. Atomically restore original OS Primary Display and disable any auto-enabled TV
  if (hadPrimarySwitch || hadAutoEnabled) {
    await restorePrimaryDisplayAsync();
    await delay(200);
  }

  if (mainWindow.isDestroyed()) return;

  if (previousBounds) {
    mainWindow.setBounds(previousBounds);
  }
  if (previousMaximized) {
    mainWindow.maximize();
  }
  mainWindow.focus();
}

export async function restorePrimaryDisplayAsync(): Promise<void> {
  if (process.platform !== "linux") return;
  const orig = originalPrimaryOutput;
  const origBackend = originalPrimaryBackend;
  const disableTarget = autoEnabledOutput;
  const disableBackend = autoEnabledBackend;

  originalPrimaryOutput = null;
  originalPrimaryBackend = null;
  autoEnabledOutput = null;
  autoEnabledBackend = null;

  if (!orig && !disableTarget) return;

  const backend = origBackend || disableBackend || "kscreen";

  if (backend === "kscreen") {
    const args: string[] = [];
    if (orig) args.push(`output.${orig}.primary`);
    if (disableTarget && disableTarget !== orig) {
      args.push(`output.${disableTarget}.disable`);
    }
    if (args.length > 0) {
      try {
        console.log(`[DisplayManager] Restoring KDE display state -> ${args.join(" ")}`);
        await execFileAsync("kscreen-doctor", args, 4500);
      } catch (err) {
        console.warn("[DisplayManager] kscreen-doctor restore failed:", err);
      }
    }
    if (orig) {
      try {
        const xrOutputs = await queryXrandrOutputs();
        if (xrOutputs?.some((o) => o.name === orig && o.enabled)) {
          await execFileAsync("xrandr", ["--output", orig, "--primary"], 2500);
        }
      } catch {
        // ignore on pure Wayland
      }
    }
  } else {
    const args: string[] = [];
    if (orig) args.push("--output", orig, "--primary");
    if (disableTarget && disableTarget !== orig) {
      args.push("--output", disableTarget, "--off");
    }
    if (args.length > 0) {
      try {
        console.log(`[DisplayManager] Restoring X11 display state -> xrandr ${args.join(" ")}`);
        await execFileAsync("xrandr", args, 3500);
      } catch (err) {
        console.warn("[DisplayManager] xrandr restore failed:", err);
      }
    }
  }
}

/**
 * Synchronous crash/quit-safe restore of the OS Primary Display & auto-enabled TV
 * for app.on("before-quit") / SIGINT / SIGTERM.
 */
export function restorePrimaryDisplaySync(): void {
  if (process.platform !== "linux") return;
  const orig = originalPrimaryOutput;
  const origBackend = originalPrimaryBackend;
  const disableTarget = autoEnabledOutput;
  const disableBackend = autoEnabledBackend;

  originalPrimaryOutput = null;
  originalPrimaryBackend = null;
  autoEnabledOutput = null;
  autoEnabledBackend = null;
  activeTargetDisplay = null;
  originalWindowOutput = null;

  if (!orig && !disableTarget) return;
  const backend = origBackend || disableBackend || "kscreen";

  try {
    if (backend === "kscreen") {
      const args: string[] = [];
      if (orig) args.push(`output.${orig}.primary`);
      if (disableTarget && disableTarget !== orig) {
        args.push(`output.${disableTarget}.disable`);
      }
      if (args.length > 0) {
        console.log(`[DisplayManager] Restoring KDE display state on quit -> ${args.join(" ")}`);
        execFileSync("kscreen-doctor", args, {
          timeout: 3000,
          stdio: "ignore",
        });
      }
      if (orig) {
        try {
          execFileSync("xrandr", ["--output", orig, "--primary"], {
            timeout: 1500,
            stdio: "ignore",
          });
        } catch {
          // ignore if xrandr connector differs
        }
      }
    } else {
      const args: string[] = [];
      if (orig) args.push("--output", orig, "--primary");
      if (disableTarget && disableTarget !== orig) {
        args.push("--output", disableTarget, "--off");
      }
      if (args.length > 0) {
        console.log(`[DisplayManager] Restoring X11 display state on quit -> xrandr ${args.join(" ")}`);
        execFileSync("xrandr", args, {
          timeout: 3000,
          stdio: "ignore",
        });
      }
    }
  } catch (err) {
    console.warn("[DisplayManager] Failed to restore display state synchronously:", err);
  }
}

export function hasActiveTargetDisplay(): boolean {
  return Boolean(activeTargetDisplay || originalPrimaryOutput || autoEnabledOutput);
}
