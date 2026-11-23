import { app } from "electron";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { stopDaemon } from "./daemon";

export interface ApplyUpdateOptions {
  /** Override install directory for automated testing */
  overrideInstallDir?: string;
  /** Override target binary to relaunch for automated testing */
  overrideExecPath?: string;
  /** Override PID to wait for (defaults to process.pid) */
  overridePid?: number;
  /** Skip quitting Electron (used in automated tests) */
  skipQuit?: boolean;
}

function escapePowerShellSingleQuote(val: string): string {
  return val.replace(/'/g, "''");
}

function escapeShellSingleQuote(val: string): string {
  return val.replace(/'/g, "'\\''");
}

/**
 * Generates a self-deleting Windows PowerShell script that:
 * 1. Waits cleanly for Electron + openplay-core to exit (no blind sleep race)
 * 2. Applies either a .zip update archive (atomic staging + mirror) or silent .exe/.msi installer
 * 3. Relaunches OpenPlay and cleans up temporary files
 */
export function buildWindowsUpdateScript(params: {
  pid: number;
  installerPath: string;
  installDir: string;
  execPath: string;
}): string {
  const installer = escapePowerShellSingleQuote(params.installerPath);
  const installDir = escapePowerShellSingleQuote(params.installDir);
  const execPath = escapePowerShellSingleQuote(params.execPath);
  const lower = params.installerPath.toLowerCase();

  const applyBlock = lower.endsWith(".zip")
    ? `
$stageDir = Join-Path $env:TEMP ("openplay-stage-" + [guid]::NewGuid().ToString("N"))
try {
  New-Item -ItemType Directory -Path $stageDir -Force | Out-Null
  Expand-Archive -LiteralPath $installer -DestinationPath $stageDir -Force
  # If the zip contains a single top-level folder, descend into it
  $entries = Get-ChildItem -LiteralPath $stageDir
  $sourceDir = $stageDir
  if ($entries.Count -eq 1 -and $entries[0].PSIsContainer) {
    $sourceDir = $entries[0].FullName
  }
  Copy-Item -Path (Join-Path $sourceDir '*') -Destination $installDir -Recurse -Force
} finally {
  if (Test-Path $stageDir) { Remove-Item -LiteralPath $stageDir -Recurse -Force -ErrorAction SilentlyContinue }
}
`
    : lower.endsWith(".msi")
      ? `
Start-Process -FilePath "msiexec.exe" -ArgumentList "/i", "\`"$installer\`"", "/qn", "/norestart" -Wait -NoNewWindow
`
      : `
# Support our custom SFX installer (--silent --dir=...) as well as legacy NSIS (/S /D=...)
if ($installer -match "OpenPlay-Setup") {
  Start-Process -FilePath $installer -ArgumentList "--silent", "--dir=$installDir" -Wait -NoNewWindow
} else {
  Start-Process -FilePath $installer -ArgumentList "/S", "/D=$installDir" -Wait -NoNewWindow
}
`;

  return [
    "$ErrorActionPreference = 'Stop'",
    `$appPid = ${params.pid}`,
    `$installer = '${installer}'`,
    `$installDir = '${installDir}'`,
    `$execPath = '${execPath}'`,
    "",
    "# 1. Wait up to 25s for Electron to exit cleanly",
    "for ($i = 0; $i -lt 50; $i++) {",
    "  if (-not (Get-Process -Id $appPid -ErrorAction SilentlyContinue)) { break }",
    "  Start-Sleep -Milliseconds 500",
    "}",
    "# Ensure any lingering openplay-core daemon releases file locks",
    "Get-Process -Name 'openplay-core' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue",
    "Start-Sleep -Milliseconds 500",
    "",
    "# 2. Apply update",
    "try {",
    applyBlock.trim(),
    "} catch {",
    "  $logPath = Join-Path $env:TEMP 'openplay-update-error.log'",
    "  $_ | Out-File -FilePath $logPath -Encoding utf8",
    "}",
    "",
    "# 3. Relaunch OpenPlay",
    "if (Test-Path $execPath) {",
    "  Start-Process -FilePath $execPath",
    "}",
    "",
    "# 4. Clean up installer and self",
    "Remove-Item -LiteralPath $installer -Force -ErrorAction SilentlyContinue",
    "Remove-Item -LiteralPath $MyInvocation.MyCommand.Path -Force -ErrorAction SilentlyContinue",
    "",
  ].join("\r\n");
}

/**
 * Generates a self-deleting POSIX shell script for Linux that:
 * 1. Waits cleanly for Electron PID to exit
 * 2. Atomically replaces AppImage OR extracts .zip update into installDir OR runs SFX installer --silent
 * 3. Restores executable bits, relaunches OpenPlay, and cleans up
 */
export function buildLinuxUpdateScript(params: {
  pid: number;
  installerPath: string;
  installDir: string;
  execPath: string;
  appImagePath?: string;
}): string {
  const installer = escapeShellSingleQuote(params.installerPath);
  const installDir = escapeShellSingleQuote(params.installDir);
  const execPath = escapeShellSingleQuote(params.execPath);
  const appImage = params.appImagePath ? escapeShellSingleQuote(params.appImagePath) : "";
  const lower = params.installerPath.toLowerCase();

  let applyBlock = "";
  let relaunchTarget = '"$EXEC_PATH"';

  if (appImage && lower.endsWith(".appimage")) {
    relaunchTarget = '"$APPIMAGE_PATH"';
    applyBlock = `
cp -f "$INSTALLER" "\${APPIMAGE_PATH}.new"
chmod +x "\${APPIMAGE_PATH}.new"
mv -f "\${APPIMAGE_PATH}.new" "$APPIMAGE_PATH"
`;
  } else if (lower.endsWith(".zip")) {
    applyBlock = `
STAGE_DIR="$(mktemp -d)"
if command -v unzip >/dev/null 2>&1; then
  unzip -oq "$INSTALLER" -d "$STAGE_DIR"
elif command -v python3 >/dev/null 2>&1; then
  python3 -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "$INSTALLER" "$STAGE_DIR"
else
  echo "Neither unzip nor python3 available to extract update" >&2
  rm -rf "$STAGE_DIR"
  exit 1
fi

SRC_DIR="$STAGE_DIR"
ITEM_COUNT="$(ls -A "$STAGE_DIR" | wc -l)"
if [ "$ITEM_COUNT" -eq 1 ]; then
  FIRST_ITEM="$(ls -A "$STAGE_DIR" | head -n 1)"
  if [ -d "$STAGE_DIR/$FIRST_ITEM" ]; then
    SRC_DIR="$STAGE_DIR/$FIRST_ITEM"
  fi
fi

mkdir -p "$INSTALL_DIR"
cp -a "$SRC_DIR/." "$INSTALL_DIR/"
rm -rf "$STAGE_DIR"

[ -f "$EXEC_PATH" ] && chmod +x "$EXEC_PATH"
[ -f "$INSTALL_DIR/openplay" ] && chmod +x "$INSTALL_DIR/openplay"
[ -f "$INSTALL_DIR/resources/bin/openplay-core" ] && chmod +x "$INSTALL_DIR/resources/bin/openplay-core"
`;
  } else if (lower.endsWith(".appimage")) {
    applyBlock = `
chmod +x "$INSTALLER"
cp -f "$INSTALLER" "$EXEC_PATH.new"
chmod +x "$EXEC_PATH.new"
mv -f "$EXEC_PATH.new" "$EXEC_PATH"
`;
  } else {
    // Custom Linux SFX installer binary
    applyBlock = `
chmod +x "$INSTALLER"
"$INSTALLER" --silent --dir="$INSTALL_DIR"
`;
  }

  return [
    "#!/usr/bin/env sh",
    "set -e",
    `APP_PID=${params.pid}`,
    `INSTALLER='${installer}'`,
    `INSTALL_DIR='${installDir}'`,
    `EXEC_PATH='${execPath}'`,
    `APPIMAGE_PATH='${appImage}'`,
    "",
    "# 1. Wait up to 20s for OpenPlay to exit cleanly",
    "i=0",
    'while [ "$i" -lt 40 ]; do',
    '  if ! kill -0 "$APP_PID" 2>/dev/null; then',
    "    break",
    "  fi",
    "  sleep 0.5",
    "  i=$((i + 1))",
    "done",
    "",
    "# 2. Apply update",
    applyBlock.trim(),
    "",
    "# 3. Relaunch OpenPlay in background",
    `if [ -x ${relaunchTarget} ]; then`,
    `  nohup ${relaunchTarget} >/dev/null 2>&1 &`,
    "fi",
    "",
    "# 4. Cleanup",
    'rm -f "$INSTALLER"',
    'rm -f "$0"',
    "",
  ].join("\n");
}

export async function applyUpdateAndRestart(
  installerPath: string,
  options: ApplyUpdateOptions = {}
): Promise<void> {
  if (!installerPath || !fs.existsSync(installerPath)) {
    throw new Error("Downloaded update package was not found on disk.");
  }

  const stat = fs.statSync(installerPath);
  if (stat.size === 0) {
    throw new Error("Downloaded update package is empty or corrupted.");
  }

  const testDir = options.overrideInstallDir || process.env.OPENPLAY_TEST_UPDATE_DIR;
  if (!app.isPackaged && !testDir) {
    throw new Error(
      "In-app updates can only be applied to an installed OpenPlay build (currently running in development mode)."
    );
  }

  const execPath =
    options.overrideExecPath || process.env.OPENPLAY_TEST_EXEC_PATH || process.execPath;
  const installDir = testDir || path.dirname(execPath);
  const pid = options.overridePid ?? process.pid;

  if (process.platform === "win32") {
    const scriptPath = path.join(os.tmpdir(), `openplay-updater-${Date.now()}.ps1`);
    const script = buildWindowsUpdateScript({
      pid,
      installerPath,
      installDir,
      execPath,
    });
    fs.writeFileSync(scriptPath, script, "utf8");

    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", scriptPath],
      {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      }
    );
    child.unref();
  } else if (process.platform === "linux") {
    const scriptPath = path.join(os.tmpdir(), `openplay-updater-${Date.now()}.sh`);
    const script = buildLinuxUpdateScript({
      pid,
      installerPath,
      installDir,
      execPath,
      appImagePath: process.env.APPIMAGE,
    });
    fs.writeFileSync(scriptPath, script, { encoding: "utf8", mode: 0o755 });
    fs.chmodSync(scriptPath, 0o755);

    const child = spawn("/bin/sh", [scriptPath], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } else {
    throw new Error(`In-app updates are currently supported on Windows and Linux (detected: ${process.platform}).`);
  }

  if (!options.skipQuit) {
    stopDaemon();
    setTimeout(() => {
      app.quit();
      setTimeout(() => app.exit(0), 600);
    }, 150);
  }
}
