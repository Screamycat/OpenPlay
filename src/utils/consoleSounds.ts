// Zero-dependency Web Audio API synthesizer for subtle Console Mode UI audio cues

let audioCtx: AudioContext | null = null;
let soundsEnabled = true;
let soundsVolume = 0.5;
let soundsSuspended = false;

export function configureConsoleSounds(
  enabled: boolean,
  volume: number,
  suspended = false
): void {
  soundsEnabled = enabled;
  soundsVolume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0.5));
  soundsSuspended = suspended;
}

function getContext(): AudioContext | null {
  if (!soundsEnabled || soundsSuspended || soundsVolume <= 0.001) return null;
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) {
    try {
      audioCtx = new Ctx();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playTone(opts: {
  freqStart: number;
  freqEnd?: number;
  duration: number;
  type?: OscillatorType;
  gainPeak: number;
  delay?: number;
  filterFreq?: number;
}) {
  const ctx = getContext();
  if (!ctx) return;

  const now = ctx.currentTime + (opts.delay || 0);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = opts.type || "sine";
  osc.frequency.setValueAtTime(opts.freqStart, now);
  if (opts.freqEnd && opts.freqEnd !== opts.freqStart) {
    osc.frequency.exponentialRampToValueAtTime(opts.freqEnd, now + opts.duration);
  }

  const peak = opts.gainPeak * soundsVolume;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + opts.duration);

  if (opts.filterFreq) {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(opts.filterFreq, now);
    osc.connect(filter);
    filter.connect(gain);
  } else {
    osc.connect(gain);
  }
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + opts.duration + 0.02);
}

/** Crisp soft tick when moving focus between game cards or buttons */
export function playNavTick(): void {
  playTone({
    freqStart: 540,
    freqEnd: 410,
    duration: 0.045,
    type: "triangle",
    gainPeak: 0.14,
    filterFreq: 1800,
  });
}

/** Soft airy sweep when switching tabs / filter presets (LB / RB) */
export function playTabSwitch(): void {
  playTone({
    freqStart: 360,
    freqEnd: 560,
    duration: 0.085,
    type: "sine",
    gainPeak: 0.15,
    filterFreq: 2000,
  });
}

/** Warm two-note confirm chime when pressing A / Enter */
export function playConfirm(): void {
  playTone({
    freqStart: 523.25, // C5
    freqEnd: 587.33,
    duration: 0.09,
    type: "sine",
    gainPeak: 0.17,
    filterFreq: 2400,
  });
  playTone({
    freqStart: 783.99, // G5
    duration: 0.13,
    type: "sine",
    gainPeak: 0.13,
    delay: 0.04,
    filterFreq: 2600,
  });
}

/** Subtle descending tone when pressing B / Back / Cancel */
export function playBack(): void {
  playTone({
    freqStart: 420,
    freqEnd: 270,
    duration: 0.09,
    type: "sine",
    gainPeak: 0.15,
    filterFreq: 1500,
  });
}

/** Atmospheric startup chord for Console Mode boot splash */
export function playBootChime(): void {
  const notes = [261.63, 329.63, 392.0, 523.25]; // C4 E4 G4 C5
  notes.forEach((freq, idx) => {
    playTone({
      freqStart: freq,
      duration: 0.85,
      type: "sine",
      gainPeak: 0.12 - idx * 0.015,
      delay: idx * 0.09,
      filterFreq: 1900,
    });
  });
}

/** Rich rising launch pulse when launching a game */
export function playLaunch(): void {
  playTone({
    freqStart: 329.63,
    freqEnd: 440,
    duration: 0.14,
    type: "triangle",
    gainPeak: 0.18,
    filterFreq: 2200,
  });
  playTone({
    freqStart: 523.25,
    freqEnd: 659.25,
    duration: 0.24,
    type: "sine",
    gainPeak: 0.18,
    delay: 0.07,
    filterFreq: 2600,
  });
}

// ============================================================================
// Subtle Console Mode Ambient Background Music (Built-In Synth or Custom Track)
// ============================================================================

let musicCtx: AudioContext | null = null;
let musicMasterGain: GainNode | null = null;
let musicInterval: number | null = null;
let musicAudioEl: HTMLAudioElement | null = null;
let musicCurrentSrc: string | null = null;
let musicChordIndex = 0;

// Warm atmospheric major-9 / sus2 ambient voicings (Hz)
const AMBIENT_CHORDS: number[][] = [
  [130.81, 196.0, 246.94, 293.66], // Cmaj9
  [110.0, 164.81, 220.0, 261.63],  // Am7
  [87.31, 130.81, 196.0, 220.0],   // Fmaj9
  [98.0, 146.83, 196.0, 246.94],   // G6
];

function stopSynthMusic() {
  if (musicInterval !== null) {
    window.clearInterval(musicInterval);
    musicInterval = null;
  }
  if (musicMasterGain && musicCtx) {
    try {
      const now = musicCtx.currentTime;
      musicMasterGain.gain.cancelScheduledValues(now);
      musicMasterGain.gain.setTargetAtTime(0.0001, now, 0.25);
    } catch {}
  }
}

function stopCustomAudioMusic() {
  if (musicAudioEl) {
    try {
      musicAudioEl.pause();
    } catch {}
  }
}

function triggerAmbientPadChord(volume: number) {
  if (!musicCtx || !musicMasterGain) return;
  if (musicCtx.state === "suspended") {
    musicCtx.resume().catch(() => {});
  }

  const chord = AMBIENT_CHORDS[musicChordIndex % AMBIENT_CHORDS.length];
  musicChordIndex += 1;

  const now = musicCtx.currentTime;
  const chordDuration = 9.5;

  const filter = musicCtx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(340, now);
  filter.frequency.linearRampToValueAtTime(620, now + chordDuration * 0.45);
  filter.frequency.linearRampToValueAtTime(300, now + chordDuration);
  filter.connect(musicMasterGain);

  chord.forEach((freq, idx) => {
    if (!musicCtx) return;
    const osc = musicCtx.createOscillator();
    const noteGain = musicCtx.createGain();
    osc.type = idx === 0 ? "sine" : "triangle";
    osc.frequency.setValueAtTime(freq, now);
    // Gentle detune for lush pad warmth
    osc.detune.setValueAtTime((idx - 1.5) * 4.5, now);

    const perVoicePeak = (0.042 / chord.length) * Math.max(0.05, volume);
    noteGain.gain.setValueAtTime(0.0001, now);
    noteGain.gain.linearRampToValueAtTime(perVoicePeak, now + 2.8);
    noteGain.gain.linearRampToValueAtTime(perVoicePeak * 0.8, now + chordDuration - 2.6);
    noteGain.gain.linearRampToValueAtTime(0.0001, now + chordDuration);

    osc.connect(noteGain);
    noteGain.connect(filter);
    osc.start(now);
    osc.stop(now + chordDuration + 0.15);
  });
}

export function configureConsoleMusic(opts: {
  active: boolean;
  enabled: boolean;
  volume: number;
  customSrc?: string;
  suspended?: boolean;
}): void {
  const shouldPlay =
    opts.active &&
    opts.enabled &&
    !opts.suspended &&
    opts.volume > 0.005;

  const clampedVol = Math.max(0, Math.min(1, Number.isFinite(opts.volume) ? opts.volume : 0.25));

  if (!shouldPlay) {
    stopSynthMusic();
    stopCustomAudioMusic();
    return;
  }

  // Mode A: Custom local audio file
  if (opts.customSrc) {
    stopSynthMusic();
    if (!musicAudioEl) {
      musicAudioEl = new Audio();
      musicAudioEl.loop = true;
    }
    if (musicCurrentSrc !== opts.customSrc) {
      musicCurrentSrc = opts.customSrc;
      musicAudioEl.src = opts.customSrc;
    }
    musicAudioEl.volume = clampedVol;
    if (musicAudioEl.paused) {
      musicAudioEl.play().catch(() => {});
    }
    return;
  }

  // Mode B: Built-in subtle ambient synthesizer
  stopCustomAudioMusic();
  if (typeof window === "undefined") return;
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctx) return;

  if (!musicCtx) {
    try {
      musicCtx = new Ctx();
      musicMasterGain = musicCtx.createGain();
      musicMasterGain.gain.setValueAtTime(0.0001, musicCtx.currentTime);
      musicMasterGain.connect(musicCtx.destination);
    } catch {
      return;
    }
  }

  if (musicMasterGain && musicCtx) {
    const now = musicCtx.currentTime;
    musicMasterGain.gain.cancelScheduledValues(now);
    musicMasterGain.gain.setTargetAtTime(clampedVol, now, 0.35);
  }

  if (musicInterval === null) {
    triggerAmbientPadChord(1);
    musicInterval = window.setInterval(() => {
      triggerAmbientPadChord(1);
    }, 7800);
  }
}

export function stopConsoleMusic(): void {
  stopSynthMusic();
  stopCustomAudioMusic();
}

