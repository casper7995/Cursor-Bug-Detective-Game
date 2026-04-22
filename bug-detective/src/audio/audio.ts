/**
 * Bug Detective audio: procedural ambient bed + SFX for desk and minigames.
 * No shipped assets — Web Audio only. Mute disconnects master from destination;
 * graph stays warm. Persisted as "bd:muted".
 */

const AC = new (window.AudioContext ??
  (window as unknown as { webkitAudioContext: typeof AudioContext })
    .webkitAudioContext)();

const master = AC.createGain();
master.gain.value = 1.0;
master.connect(AC.destination);

let muted = false;
let ambientStarted = false;

/** Ambient mix → ducking → master (SFX connect straight to master). */
const ambientDuck = AC.createGain();
ambientDuck.gain.value = 1;
ambientDuck.connect(master);

export type AmbientContext =
  | "desk"
  | "investigating"
  | "runner"
  | "sentence"
  | "errand"
  | "tamper";

let ambientContext: AmbientContext = "desk";

const AMBIENT_TARGET: Record<AmbientContext, number> = {
  desk: 1,
  investigating: 1,
  runner: 0.42,
  sentence: 0.62,
  errand: 0.66,
  tamper: 0.58,
};

let ambientNodes: {
  stopAll: () => void;
} | null = null;

function loadMutedFromStorage(): void {
  try {
    muted = localStorage.getItem("bd:muted") === "1";
  } catch {
    muted = false;
  }
  applyMutedState();
}

function applyMutedState(): void {
  master.disconnect();
  if (!muted) master.connect(AC.destination);
}

function resumeAudio(): void {
  if (AC.state === "suspended") void AC.resume();
  if (!ambientStarted && !muted) {
    startAmbient();
    ambientStarted = true;
    applyAmbientDuckGain();
  }
}

window.addEventListener("pointerdown", resumeAudio, { once: true });
window.addEventListener("keydown", resumeAudio, { once: true });
loadMutedFromStorage();

export function setMuted(v: boolean): void {
  muted = v;
  try {
    localStorage.setItem("bd:muted", v ? "1" : "0");
  } catch {
    /* ignore */
  }
  applyMutedState();
  if (v) {
    stopAmbient();
    ambientStarted = false;
  } else if (!ambientStarted) {
    startAmbient();
    ambientStarted = true;
    applyAmbientDuckGain();
  }
}

export function isMuted(): boolean {
  return muted;
}

export function toggleMute(): boolean {
  setMuted(!muted);
  return muted;
}

function applyAmbientDuckGain(): void {
  if (muted || !ambientStarted) return;
  const target = AMBIENT_TARGET[ambientContext];
  const now = AC.currentTime;
  ambientDuck.gain.cancelScheduledValues(now);
  ambientDuck.gain.setValueAtTime(ambientDuck.gain.value, now);
  ambientDuck.gain.linearRampToValueAtTime(target, now + 0.35);
}

export function setAmbientContext(ctx: AmbientContext): void {
  if (ctx === ambientContext) return;
  ambientContext = ctx;
  applyAmbientDuckGain();
}

// ---------------------------------------------------------------------
// Ambient: pad + soft fifth + sub + filtered “room” noise (noir haze)
// ---------------------------------------------------------------------

function startAmbient(): void {
  const now = AC.currentTime;

  const padGain = AC.createGain();
  padGain.gain.value = 0.018;

  const oscA = AC.createOscillator();
  oscA.type = "sine";
  oscA.frequency.value = 98;
  const oscB = AC.createOscillator();
  oscB.type = "sine";
  oscB.frequency.value = 98.55;
  const oscFifth = AC.createOscillator();
  oscFifth.type = "sine";
  oscFifth.frequency.value = 147.2;

  const filter = AC.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 520;
  filter.Q.value = 0.65;

  const lfo = AC.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.055;
  const lfoGain = AC.createGain();
  lfoGain.gain.value = 220;
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);

  oscA.connect(filter);
  oscB.connect(filter);
  const fifthF = AC.createBiquadFilter();
  fifthF.type = "lowpass";
  fifthF.frequency.value = 900;
  oscFifth.connect(fifthF);
  fifthF.connect(filter);

  const sub = AC.createOscillator();
  sub.type = "triangle";
  sub.frequency.value = 49;
  const subGain = AC.createGain();
  subGain.gain.value = 0.012;
  sub.connect(subGain);

  filter.connect(padGain);
  padGain.connect(ambientDuck);
  subGain.connect(ambientDuck);

  const sr = AC.sampleRate;
  const nFrames = Math.floor(sr * 2.2);
  const nb = AC.createBuffer(1, nFrames, sr);
  const nd = nb.getChannelData(0);
  let brown = 0;
  for (let i = 0; i < nFrames; i++) {
    brown = brown * 0.985 + (Math.random() * 2 - 1) * 0.045;
    nd[i] = brown;
  }
  const room = AC.createBufferSource();
  room.buffer = nb;
  room.loop = true;
  const roomF = AC.createBiquadFilter();
  roomF.type = "lowpass";
  roomF.frequency.value = 320;
  const roomG = AC.createGain();
  roomG.gain.value = 0.055;
  room.connect(roomF);
  roomF.connect(roomG);
  roomG.connect(ambientDuck);

  oscA.start(now);
  oscB.start(now);
  oscFifth.start(now);
  lfo.start(now);
  sub.start(now);
  room.start(now);

  const stopAll = (): void => {
    const t = AC.currentTime;
    const fade = (g: GainNode, ms: number): void => {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + ms / 1000);
    };
    fade(padGain, 120);
    fade(subGain, 120);
    fade(roomG, 120);
    setTimeout(() => {
      for (const o of [oscA, oscB, oscFifth, lfo, sub, room]) {
        try {
          o.stop();
        } catch {
          /* already stopped */
        }
      }
    }, 200);
  };

  ambientNodes = { stopAll };
}

function stopAmbient(): void {
  if (!ambientNodes) return;
  ambientNodes.stopAll();
  ambientNodes = null;
}

// ---------------------------------------------------------------------
// SFX helpers
// ---------------------------------------------------------------------

function blip(
  freq: number,
  duration: number,
  type: OscillatorType = "sine",
  gainAmp = 0.06,
): void {
  if (muted) return;
  const osc = AC.createOscillator();
  const g = AC.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const now = AC.currentTime;
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(gainAmp, now + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(g);
  g.connect(master);
  osc.start(now);
  osc.stop(now + duration + 0.05);
}

function chord(freqs: readonly number[], duration: number, gainAmp = 0.05): void {
  for (const f of freqs) blip(f, duration, "sine", gainAmp);
}

function sweep(
  fromFreq: number,
  toFreq: number,
  duration: number,
  type: OscillatorType = "sawtooth",
  gainAmp = 0.05,
): void {
  if (muted) return;
  const osc = AC.createOscillator();
  const g = AC.createGain();
  osc.type = type;
  const now = AC.currentTime;
  osc.frequency.setValueAtTime(fromFreq, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, toFreq), now + duration);
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(gainAmp, now + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(g);
  g.connect(master);
  osc.start(now);
  osc.stop(now + duration + 0.05);
}

function noise(
  duration: number,
  gainAmp = 0.03,
  highpassHz = 1200,
): void {
  if (muted) return;
  const buffer = AC.createBuffer(
    1,
    Math.max(1, Math.floor(AC.sampleRate * duration)),
    AC.sampleRate,
  );
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = AC.createBufferSource();
  src.buffer = buffer;
  const filter = AC.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = highpassHz;
  const g = AC.createGain();
  const now = AC.currentTime;
  g.gain.setValueAtTime(gainAmp, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  src.connect(filter);
  filter.connect(g);
  g.connect(master);
  src.start(now);
  src.stop(now + duration + 0.05);
}

// ---------------------------------------------------------------------
// Desk / global SFX
// ---------------------------------------------------------------------

export function sfxHover(): void {
  blip(880, 0.04, "sine", 0.018);
}

export function sfxClueFound(): void {
  blip(660, 0.08, "sine", 0.04);
  setTimeout(() => blip(990, 0.1, "sine", 0.04), 60);
}

export function sfxSubmit(): void {
  blip(220, 0.18, "triangle", 0.06);
}

export function sfxCorrect(): void {
  chord([523.25, 659.25, 783.99], 0.45, 0.05);
  setTimeout(() => blip(1046.5, 0.4, "sine", 0.04), 120);
}

export function sfxWrong(): void {
  sweep(440, 110, 0.45, "sawtooth", 0.045);
}

export function sfxPeelTear(): void {
  noise(0.6, 0.06);
  sweep(900, 200, 0.6, "sawtooth", 0.025);
}

export function sfxMascotLand(): void {
  blip(140, 0.2, "sine", 0.08);
  setTimeout(() => blip(660, 0.06, "sine", 0.02), 80);
}

export function sfxUiClick(): void {
  blip(1200, 0.03, "square", 0.02);
}

// ---------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------

export function sfxRunnerJump(): void {
  if (muted) return;
  const now = AC.currentTime;
  const osc = AC.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(420, now);
  osc.frequency.exponentialRampToValueAtTime(880, now + 0.07);
  const g = AC.createGain();
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(0.055, now + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
  osc.connect(g);
  g.connect(master);
  osc.start(now);
  osc.stop(now + 0.12);
}

export function sfxRunnerLand(): void {
  blip(165, 0.08, "sine", 0.07);
  noise(0.04, 0.018, 400);
}

let lastRunnerBoostFx = 0;
export function sfxRunnerBoostPulse(): void {
  const nowMs = performance.now();
  if (nowMs - lastRunnerBoostFx < 70) return;
  lastRunnerBoostFx = nowMs;
  sweep(280, 720, 0.055, "square", 0.028);
}

export function sfxRunnerCluePing(): void {
  blip(1320, 0.06, "sine", 0.035);
  setTimeout(() => blip(1760, 0.08, "sine", 0.028), 45);
}

export function sfxRunnerFloorChime(tier: number): void {
  const base = 523.25 + Math.min(9, tier) * 32;
  blip(base, 0.12, "sine", 0.032);
  setTimeout(() => blip(base * 1.25, 0.14, "sine", 0.025), 70);
}

// ---------------------------------------------------------------------
// Sentence (Tab autocomplete)
// ---------------------------------------------------------------------

let typewriterTickBuffer: AudioBuffer | null = null;

function getTypewriterTickBuffer(): AudioBuffer {
  if (!typewriterTickBuffer) {
    const frames = Math.max(1, Math.floor(AC.sampleRate * 0.012));
    typewriterTickBuffer = AC.createBuffer(1, frames, AC.sampleRate);
    const data = typewriterTickBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return typewriterTickBuffer;
}

/** Short typewriter tick — reuses one small buffer (called often in type phase). */
export function sfxSentenceTypeTick(): void {
  if (muted) return;
  const src = AC.createBufferSource();
  src.buffer = getTypewriterTickBuffer();
  const filter = AC.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 2000;
  const g = AC.createGain();
  const now = AC.currentTime;
  g.gain.setValueAtTime(0.014, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.012);
  src.connect(filter);
  filter.connect(g);
  g.connect(master);
  src.start(now);
  src.stop(now + 0.02);
}

export function sfxSentenceSuggestionOpen(): void {
  blip(740, 0.05, "sine", 0.03);
  setTimeout(() => blip(990, 0.06, "sine", 0.025), 55);
}

export function sfxSentencePick(color: "blue" | "purple" | "orange" | "idle"): void {
  if (color === "idle") {
    sweep(300, 140, 0.22, "triangle", 0.04);
    return;
  }
  if (color === "blue") {
    chord([784, 988], 0.14, 0.034);
  } else if (color === "purple") {
    chord([622, 784], 0.14, 0.034);
  } else {
    chord([523, 659], 0.15, 0.036);
  }
}

export function sfxSentencePickHover(): void {
  blip(620, 0.025, "sine", 0.016);
}

// ---------------------------------------------------------------------
// Errand (agents queue)
// ---------------------------------------------------------------------

export function sfxErrandGrab(): void {
  blip(300, 0.05, "square", 0.035);
  noise(0.03, 0.012, 800);
}

export function sfxErrandDispatch(): void {
  blip(440, 0.06, "sine", 0.04);
  setTimeout(() => blip(660, 0.08, "triangle", 0.032), 45);
}

export function sfxErrandReject(): void {
  sweep(220, 90, 0.14, "sawtooth", 0.03);
}

export function sfxErrandTrapPing(): void {
  for (let i = 0; i < 3; i++) {
    setTimeout(() => blip(880 + i * 90, 0.05, "square", 0.028), i * 70);
  }
}

export function sfxErrandAlertChoice(hover: "abort" | "push"): void {
  if (hover === "abort") blip(360, 0.1, "sine", 0.045);
  else sweep(200, 520, 0.12, "triangle", 0.04);
}

// ---------------------------------------------------------------------
// Tamper (Bugbot review)
// ---------------------------------------------------------------------

export function sfxTamperPanelHover(): void {
  blip(520, 0.03, "sine", 0.015);
}

export function sfxTamperSpotMode(): void {
  blip(420, 0.08, "sine", 0.032);
  setTimeout(() => blip(660, 0.06, "sine", 0.022), 55);
}

export function sfxTamperVerdict(r: {
  rightCall: boolean;
  caughtLie: boolean;
}): void {
  if (r.caughtLie) {
    chord([784, 988, 1174], 0.2, 0.04);
    setTimeout(() => blip(1318, 0.18, "sine", 0.035), 90);
  } else if (r.rightCall) {
    chord([659, 784], 0.16, 0.038);
  } else {
    sweep(380, 120, 0.28, "sawtooth", 0.038);
  }
}
