import { spawn, ChildProcess } from "node:child_process";
import * as readline from "node:readline";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

let coreProcess: ChildProcess | null = null;
let currentBinaryMtime = 0;
let requestIdCounter = 1;
const pendingRequests = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();
const eventSubscribers = new Set<(event: string, payload: any) => void>();

export function getDaemonBinaryPath(): string {
  const binName = process.platform === "win32" ? "openplay-core.exe" : "openplay-core";

  // 1. Packaged production path
  if (process.resourcesPath) {
    const prodCandidates = [
      path.join(process.resourcesPath, "bin", binName),
      path.join(process.resourcesPath, binName),
    ];
    for (const c of prodCandidates) {
      if (fs.existsSync(c)) return c;
    }
  }

  // 2. Development paths in CARGO_TARGET_DIR, ~/.cache/openplay-target, or src-tauri/target (pick the newest compiled binary)
  const devCandidates = [
    ...(process.env.CARGO_TARGET_DIR
      ? [
          path.join(process.env.CARGO_TARGET_DIR, "debug", binName),
          path.join(process.env.CARGO_TARGET_DIR, "release", binName),
        ]
      : []),
    ...(process.platform === "linux"
      ? [
          path.join(os.homedir(), ".cache/openplay-target/debug", binName),
          path.join(os.homedir(), ".cache/openplay-target/release", binName),
        ]
      : []),
    path.join(__dirname, "../src-tauri/target/debug", binName),
    path.join(__dirname, "../src-tauri/target/release", binName),
    path.join(process.cwd(), "src-tauri/target/debug", binName),
    path.join(process.cwd(), "src-tauri/target/release", binName),
  ];
  const existingDev = devCandidates.filter((c) => fs.existsSync(c));
  if (existingDev.length > 0) {
    existingDev.sort((a, b) => {
      try {
        return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
      } catch {
        return 0;
      }
    });
    return existingDev[0];
  }

  // Fallback to default debug path
  return devCandidates[0];
}

export function startDaemon(): Promise<void> {
  return new Promise((resolve, reject) => {
    const binPath = getDaemonBinaryPath();
    console.log("[Daemon Supervisor] Launching openplay-core from:", binPath);

    if (!fs.existsSync(binPath)) {
      return reject(new Error(`openplay-core binary not found at '${binPath}'. Run 'cargo build --bin openplay-core' first.`));
    }

    try {
      try {
        currentBinaryMtime = fs.statSync(binPath).mtimeMs;
      } catch {
        currentBinaryMtime = Date.now();
      }
      coreProcess = spawn(binPath, [], {
        stdio: ["pipe", "pipe", "inherit"],
        env: {
          ...process.env,
          RUST_BACKTRACE: "1",
        },
      });

      let isReady = false;

      const rl = readline.createInterface({
        input: coreProcess.stdout!,
        terminal: false,
      });

      rl.on("line", (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        try {
          const parsed = JSON.parse(trimmed);

          // RPC Response: { id, result?, error? }
          if (typeof parsed.id === "number") {
            const pending = pendingRequests.get(parsed.id);
            if (pending) {
              pendingRequests.delete(parsed.id);
              if (parsed.error) {
                pending.reject(new Error(parsed.error));
              } else {
                pending.resolve(parsed.result);
              }
            }
            return;
          }

          // Push Event: { event, payload }
          if (parsed.event) {
            for (const sub of eventSubscribers) {
              try {
                sub(parsed.event, parsed.payload);
              } catch (e) {
                console.error("[Daemon Event Subscriber error]", e);
              }
            }
          }
        } catch (err) {
          console.error("[Daemon stdout parse error]", err, trimmed);
        }
      });

      coreProcess.on("error", (err) => {
        console.error("[Daemon Process error]", err);
        if (!isReady) reject(err);
      });

      coreProcess.on("exit", (code, signal) => {
        console.warn(`[Daemon Process exited] code: ${code}, signal: ${signal}`);
        coreProcess = null;
        for (const [, pending] of pendingRequests) {
          pending.reject(new Error("openplay-core process terminated"));
        }
        pendingRequests.clear();
      });

      // Give 500ms for startup
      setTimeout(() => {
        isReady = true;
        resolve();
      }, 500);
    } catch (err) {
      reject(err);
    }
  });
}

export function stopDaemon(): void {
  if (coreProcess && !coreProcess.killed) {
    console.log("[Daemon Supervisor] Stopping openplay-core...");
    try {
      // Closing stdin prompts openplay-core to exit gracefully
      coreProcess.stdin?.end();
      coreProcess.kill("SIGTERM");
    } catch (e) {}
    coreProcess = null;
  }
}

export async function invoke<T = any>(method: string, params: any = {}): Promise<T> {
  // Automatically hot-reload openplay-core if the binary was recompiled on disk
  try {
    const binPath = getDaemonBinaryPath();
    if (fs.existsSync(binPath)) {
      const mtime = fs.statSync(binPath).mtimeMs;
      if (currentBinaryMtime > 0 && mtime > currentBinaryMtime) {
        console.log("[Daemon Supervisor] Detected updated openplay-core binary on disk. Hot-reloading daemon...");
        stopDaemon();
        await startDaemon();
      }
    }
  } catch (e) {
    console.warn("[Daemon Supervisor] Binary mtime check failed:", e);
  }

  if (!coreProcess || !coreProcess.stdin || coreProcess.killed) {
    await startDaemon();
  }

  return new Promise((resolve, reject) => {
    if (!coreProcess || !coreProcess.stdin || coreProcess.killed) {
      return reject(new Error("openplay-core daemon is not running"));
    }

    const id = requestIdCounter++;
    pendingRequests.set(id, { resolve, reject });

    const req = JSON.stringify({ id, method, params }) + "\n";
    coreProcess.stdin.write(req, "utf8", (err) => {
      if (err) {
        pendingRequests.delete(id);
        reject(err);
      }
    });

    // Request timeout (60 seconds)
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error(`RPC timeout waiting for response to '${method}'`));
      }
    }, 60000);
  });
}

export function onDaemonEvent(cb: (event: string, payload: any) => void): () => void {
  eventSubscribers.add(cb);
  return () => {
    eventSubscribers.delete(cb);
  };
}
