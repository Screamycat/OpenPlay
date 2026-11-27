import { execFile, execFileSync } from "node:child_process";

export interface AudioOutputInfo {
  id: string;
  label: string;
  isDefault: boolean;
}

function execFileAsync(
  file: string,
  args: string[],
  timeout = 3500
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

// Track original default audio sink so we always restore cleanly when exiting Console Mode or quitting
let originalDefaultSink: string | null = null;

async function getLinuxDefaultSink(): Promise<string | null> {
  if (process.platform !== "linux") return null;
  try {
    const { stdout } = await execFileAsync("pactl", ["get-default-sink"], 2500);
    const name = stdout.trim();
    return name || null;
  } catch {
    return null;
  }
}

function parsePactlTextSinks(stdout: string, defaultSink: string | null): AudioOutputInfo[] {
  const outputs: AudioOutputInfo[] = [];
  const blocks = stdout.split(/\n(?=Sink #\d+)/);
  for (const block of blocks) {
    const nameMatch = block.match(/^\s*Name:\s*(.+)$/m);
    if (!nameMatch) continue;
    const id = nameMatch[1].trim();
    if (!id || id === "auto_null") continue;
    const descMatch = block.match(/^\s*Description:\s*(.+)$/m);
    const label = descMatch ? descMatch[1].trim() : id;
    outputs.push({
      id,
      label,
      isDefault: defaultSink ? id === defaultSink : false,
    });
  }
  return outputs;
}

export async function getAudioOutputs(): Promise<AudioOutputInfo[]> {
  if (process.platform !== "linux") {
    return [];
  }

  const defaultSink = await getLinuxDefaultSink();

  // 1. Prefer structured JSON output (pactl 16+ / PipeWire pipewire-pulse)
  try {
    const { stdout } = await execFileAsync("pactl", ["-f", "json", "list", "sinks"], 3500);
    const parsed = JSON.parse(stdout);
    if (Array.isArray(parsed)) {
      const results: AudioOutputInfo[] = [];
      for (const sink of parsed) {
        if (!sink || typeof sink.name !== "string") continue;
        const id = sink.name.trim();
        if (!id || id === "auto_null") continue;

        const props = sink.properties || {};
        let baseLabel =
          (typeof sink.description === "string" && sink.description.trim()) ||
          (typeof props["device.description"] === "string" && props["device.description"].trim()) ||
          (typeof props["node.description"] === "string" && props["node.description"].trim()) ||
          id;

        // Append active port description if informative (e.g. "HDMI / DisplayPort 2")
        if (typeof sink.active_port === "string" && Array.isArray(sink.ports)) {
          const activePortObj = sink.ports.find((p: any) => p?.name === sink.active_port);
          const portDesc =
            typeof activePortObj?.description === "string" ? activePortObj.description.trim() : "";
          if (
            portDesc &&
            !baseLabel.toLowerCase().includes(portDesc.toLowerCase()) &&
            !portDesc.toLowerCase().includes("analog output")
          ) {
            baseLabel = `${baseLabel} — ${portDesc}`;
          }
        }

        results.push({
          id,
          label: baseLabel,
          isDefault: defaultSink ? id === defaultSink : false,
        });
      }
      return results;
    }
  } catch {
    // Fall back to plain text pactl output
  }

  try {
    const { stdout } = await execFileAsync("pactl", ["list", "sinks"], 3500);
    return parsePactlTextSinks(stdout, defaultSink);
  } catch (err) {
    console.warn("[AudioManager] Could not list audio sinks via pactl:", err);
    return [];
  }
}

async function moveAllActiveStreamsToSink(targetSink: string): Promise<void> {
  if (process.platform !== "linux" || !targetSink) return;
  try {
    const { stdout } = await execFileAsync("pactl", ["list", "short", "sink-inputs"], 2500);
    const lines = stdout.split(/\r?\n/).filter((l) => l.trim().length > 0);
    for (const line of lines) {
      const idx = line.trim().split(/\s+/)[0];
      if (!idx || !/^\d+$/.test(idx)) continue;
      await execFileAsync("pactl", ["move-sink-input", idx, targetSink], 2000).catch(() => {});
    }
  } catch {
    // No active streams or pactl unavailable
  }
}

function moveAllActiveStreamsToSinkSync(targetSink: string): void {
  if (process.platform !== "linux" || !targetSink) return;
  try {
    const stdout = execFileSync("pactl", ["list", "short", "sink-inputs"], {
      timeout: 1500,
      encoding: "utf8",
    });
    const lines = String(stdout ?? "")
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0);
    for (const line of lines) {
      const idx = line.trim().split(/\s+/)[0];
      if (!idx || !/^\d+$/.test(idx)) continue;
      try {
        execFileSync("pactl", ["move-sink-input", idx, targetSink], {
          timeout: 1000,
          stdio: "ignore",
        });
      } catch {
        // ignore closed stream
      }
    }
  } catch {
    // ignore
  }
}

/**
 * Switches the OS default audio output sink and moves active streams to it for Console Mode.
 * Retries briefly if the target sink (e.g. a freshly enabled TV HDMI audio output) is still waking up.
 */
export async function switchAudioOutput(sinkId?: string): Promise<boolean> {
  if (process.platform !== "linux" || !sinkId || sinkId === "auto") {
    return false;
  }

  const currentDefault = await getLinuxDefaultSink();
  if (!originalDefaultSink && currentDefault) {
    originalDefaultSink = currentDefault;
  }

  if (currentDefault === sinkId) {
    // Still ensure active streams are routed to it
    await moveAllActiveStreamsToSink(sinkId);
    return true;
  }

  // Retry up to ~2.8s in case an HDMI TV display was just enabled and PipeWire is registering its audio sink
  const maxAttempts = 7;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[AudioManager] Switching default audio output -> ${sinkId} (attempt ${attempt})`);
      await execFileAsync("pactl", ["set-default-sink", sinkId], 3000);
      await moveAllActiveStreamsToSink(sinkId);
      return true;
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  }

  console.warn(`[AudioManager] Failed to switch audio output to '${sinkId}':`, lastErr);
  return false;
}

/**
 * Restores the original default audio output sink saved prior to entering Console Mode.
 */
export async function restoreAudioOutputAsync(): Promise<void> {
  if (process.platform !== "linux" || !originalDefaultSink) return;
  const orig = originalDefaultSink;
  originalDefaultSink = null;
  try {
    console.log(`[AudioManager] Restoring original audio output -> ${orig}`);
    await execFileAsync("pactl", ["set-default-sink", orig], 3000);
    await moveAllActiveStreamsToSink(orig);
  } catch (err) {
    console.warn(`[AudioManager] Failed to restore audio output '${orig}':`, err);
  }
}

/**
 * Synchronous restore for app quit / SIGINT / SIGTERM.
 */
export function restoreAudioOutputSync(): void {
  if (process.platform !== "linux" || !originalDefaultSink) return;
  const orig = originalDefaultSink;
  originalDefaultSink = null;
  try {
    console.log(`[AudioManager] Restoring original audio output on quit -> ${orig}`);
    execFileSync("pactl", ["set-default-sink", orig], {
      timeout: 2000,
      stdio: "ignore",
    });
    moveAllActiveStreamsToSinkSync(orig);
  } catch (err) {
    console.warn(`[AudioManager] Failed to restore audio output synchronously:`, err);
  }
}
