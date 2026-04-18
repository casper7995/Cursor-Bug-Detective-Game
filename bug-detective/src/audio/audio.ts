/**
 * Bug Detective audio: 8 procedural SFX + a slow synth-pad ambient bed.
 * No shipped audio assets — everything is synthesized in real time via
 * WebAudio. Mirrors the pattern in shooting-game/src/audio.ts.
 *
 * Mute/unmute disconnects the master gain from destination so the audio
 * graph stays alive (latency-free toggle). Persisted in localStorage as
 * "bd:muted".
 */

const AC = new (window.AudioContext ??
  (window as unknown as { webkitAudioContext: typeof AudioContext })
    .webkitAudioContext)();

const master = AC.createGain();
master.gain.value = 1.0;
master.connect(AC.destination);

let muted = false;
let ambientStarted = false;
let ambientNodes: {
  oscA: OscillatorNode;
  oscB: OscillatorNode;
  lfo: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
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
  // Toggle ambient with mute too — silent mute means silent ambient.
  if (v) {
    stopAmbient();
    ambientStarted = false;
  } else if (!ambientStarted) {
    startAmbient();
    ambientStarted = true;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function toggleMute(): boolean {
  setMuted(!muted);
  return muted;
}

// ---------------------------------------------------------------------
// Ambient bed: two slightly detuned sine oscillators through a low-pass
// filter modulated by a slow LFO on cutoff.
// ---------------------------------------------------------------------
function startAmbient(): void {
  const oscA = AC.createOscillator();
  oscA.type = "sine";
  oscA.frequency.value = 110;
  const oscB = AC.createOscillator();
  oscB.type = "sine";
  oscB.frequency.value = 110.6;
  const filter = AC.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 600;
  filter.Q.value = 0.7;
  const gain = AC.createGain();
  gain.gain.value = 0.022;

  // LFO modulates the filter cutoff between ~400 and ~900 Hz at 0.07 Hz.
  const lfo = AC.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.07;
  const lfoGain = AC.createGain();
  lfoGain.gain.value = 250; // amplitude of cutoff modulation
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);

  oscA.connect(filter);
  oscB.connect(filter);
  filter.connect(gain);
  gain.connect(master);

  oscA.start();
  oscB.start();
  lfo.start();

  ambientNodes = { oscA, oscB, lfo, filter, gain };
}

function stopAmbient(): void {
  if (!ambientNodes) return;
  const { oscA, oscB, lfo, gain } = ambientNodes;
  // Quick fade so we don't click.
  const now = AC.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(0, now + 0.1);
  setTimeout(() => {
    try {
      oscA.stop();
      oscB.stop();
      lfo.stop();
    } catch {
      /* already stopped */
    }
  }, 150);
  ambientNodes = null;
}

// ---------------------------------------------------------------------
// SFX: small named functions mirroring shooting-game/src/audio.ts blip().
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

function noise(duration: number, gainAmp = 0.03): void {
  if (muted) return;
  const buffer = AC.createBuffer(
    1,
    Math.max(1, Math.floor(AC.sampleRate * duration)),
    AC.sampleRate,
  );
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);
  const src = AC.createBufferSource();
  src.buffer = buffer;
  const filter = AC.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 1200;
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
// 8 named SFX
// ---------------------------------------------------------------------

export function sfxHover(): void {
  blip(880, 0.04, "sine", 0.018);
}

export function sfxClueFound(): void {
  // Rising 2-note "ping"
  blip(660, 0.08, "sine", 0.04);
  setTimeout(() => blip(990, 0.1, "sine", 0.04), 60);
}

export function sfxSubmit(): void {
  // Soft thunk
  blip(220, 0.18, "triangle", 0.06);
}

export function sfxCorrect(): void {
  // Major triad arpeggio
  chord([523.25, 659.25, 783.99], 0.45, 0.05);
  setTimeout(() => blip(1046.5, 0.4, "sine", 0.04), 120);
}

export function sfxWrong(): void {
  sweep(440, 110, 0.45, "sawtooth", 0.045);
}

export function sfxPeelTear(): void {
  // Filtered noise sweep — paper rip
  noise(0.6, 0.06);
  sweep(900, 200, 0.6, "sawtooth", 0.025);
}

export function sfxMascotLand(): void {
  // Soft thump + tiny squeak
  blip(140, 0.2, "sine", 0.08);
  setTimeout(() => blip(660, 0.06, "sine", 0.02), 80);
}

export function sfxUiClick(): void {
  blip(1200, 0.03, "square", 0.02);
}
