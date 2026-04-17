const AC = new (
  window.AudioContext ||
  (window as unknown as { webkitAudioContext: typeof AudioContext })
    .webkitAudioContext
)();

function resumeAudio(): void {
  if (AC.state === "suspended") void AC.resume();
}
window.addEventListener("pointerdown", resumeAudio, { once: true });
window.addEventListener("keydown", resumeAudio, { once: true });

function blip(
  freq: number,
  duration: number,
  type: OscillatorType = "square",
  gain = 0.05,
): void {
  const osc = AC.createOscillator();
  const g = AC.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = gain;
  g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + duration);
  osc.connect(g).connect(AC.destination);
  osc.start();
  osc.stop(AC.currentTime + duration);
}

export const SFX = {
  shoot: () => blip(800, 0.06, "square", 0.03),
  kill: () => blip(220, 0.1, "sawtooth", 0.05),
  hurt: () => blip(120, 0.2, "square", 0.08),
  boss: () => blip(80, 0.3, "sawtooth", 0.1),
};
