import "./style.css";
import * as THREE from "three";
import { createSceneBundle } from "./three/createScene";
import { CameraRig } from "./three/cameraRig";
import { createMascotMesh } from "./cursor/mascotMesh";
import { createDesktopDiorama } from "./scene/desktopDiorama";
import { CursorTracker } from "./intro/cursorTracker";
import { createHud } from "./ui/hud";
import { pickAnomaly, ANOMALIES } from "./scene/anomalies";
import { fallbackSeed, todayUtc } from "./api/seedClient";

const container = document.getElementById("app");
if (!(container instanceof HTMLElement)) throw new Error("#app missing");
const root = container;

const { scene, renderer } = createSceneBundle(root);

const cameraRig = new CameraRig(
  root.clientWidth / Math.max(root.clientHeight, 1),
);
cameraRig.setStatic(
  new THREE.Vector3(3.2, 2.4, 5.2),
  new THREE.Vector3(-0.2, 0.3, -0.4),
);

const diorama = createDesktopDiorama();
scene.add(diorama.root);

const mascot = createMascotMesh();
mascot.group.scale.setScalar(0.55);
mascot.group.position.set(0.4, diorama.deskTopY + 0.18, 0.4);
scene.add(mascot.group);

const cursorTracker = new CursorTracker(
  cameraRig.camera,
  mascot.group,
  diorama.desk,
);
cursorTracker.setYOffset(0.18);
cursorTracker.attach(renderer.domElement);

// ---- Anomaly selection (Day 3: hardcoded seed for now; Day 7 wires worker)
// Allow URL override `?seed=N` for dev iteration across the 12 anomalies.
const url = new URL(window.location.href);
const seedOverride = url.searchParams.get("seed");
const dateOverride = url.searchParams.get("date");
// During Day 3 dev iteration we cycle through anomaly indices to verify each
// `apply()` works. Set `?seed=N` in the URL or a hash like #anomaly=clock-ccw.
const hashMatch = /anomaly=([a-z-]+)/.exec(window.location.hash);
let seed: number;
if (hashMatch) {
  // Pick the seed that maps to a target anomaly id. We brute-force search the
  // first 200 seeds and use the first match.
  const target = hashMatch[1] ?? "";
  let found = 0;
  for (let s = 1; s <= 200; s++) {
    const test = pickAnomaly(s).def.id;
    if (test === target) { found = s; break; }
  }
  seed = found || (fallbackSeed(dateOverride ?? todayUtc()));
} else if (seedOverride) {
  seed = Number.parseInt(seedOverride, 10) >>> 0;
} else {
  seed = fallbackSeed(dateOverride ?? todayUtc());
}
const picked = pickAnomaly(seed);
picked.def.apply(diorama);
console.info(
  `[bug-detective] seed=${seed} anomaly=${picked.def.id} (1 of ${ANOMALIES.length})`,
);

// ---- HUD
const hud = createHud(root, diorama);
hud.setStatusText("find the bug — hover to investigate");

// Hover-driven clue counter: only count distinct anomaly-target hovers, after
// a 2s grace period (so the player isn't penalised for the first sweep).
const HOVER_GRACE_MS = 2000;
const hoverStreak = new Map<string, number>(); // tag → ms hovered
let cluesUsed = 0;
const startTime = performance.now();
let lastFrame = startTime;

function onResize(): void {
  const w = root.clientWidth;
  const h = Math.max(root.clientHeight, 1);
  cameraRig.setAspect(w / h);
  renderer.setSize(w, h);
}
window.addEventListener("resize", onResize);
onResize();

function frame(now: number): void {
  const dtMs = Math.min(50, now - lastFrame);
  const dtSec = dtMs / 1000;
  lastFrame = now;
  const elapsed = (now - startTime) / 1000;

  cameraRig.update(dtMs);
  diorama.step(elapsed, dtSec);
  cursorTracker.update(dtSec);
  mascot.faceCamera(cameraRig.camera);

  // Periodic blink for personality.
  const blinkPhase = (elapsed % 4.2) / 4.2;
  mascot.setBlink(blinkPhase > 0.95 ? 0 : 1);

  // Hover detection + tooltip.
  const hover = hud.update(cameraRig.camera);
  if (hover.tag) {
    // Show short hint for the active anomaly's target tag, generic name otherwise.
    const isAnomalyTarget = hover.tag === picked.def.targetTag;
    const hint = isAnomalyTarget
      ? picked.def.tooltipHint
      : friendlyTagName(hover.tag);
    hud.setHover(hover.tag, hint);

    // Count time spent hovering each anomaly target after the grace period.
    if (isAnomalyTarget && elapsed * 1000 > HOVER_GRACE_MS) {
      const prev = hoverStreak.get(hover.tag) ?? 0;
      const next = prev + dtMs;
      hoverStreak.set(hover.tag, next);
      // First time a hover passes 350ms on the anomaly target = +1 clue.
      if (prev < 350 && next >= 350) {
        cluesUsed += 1;
        hud.setCluesUsed(cluesUsed);
      }
    }
    // Lift mascot's magnifier when hovering the actual anomaly target.
    mascot.setMagnifierLifted(isAnomalyTarget ? 1 : 0);
  } else {
    hud.setHover(null);
    mascot.setMagnifierLifted(0);
  }

  // Day-3 stub: 90s timer counts down for the HUD demo, no game state yet.
  const remaining = Math.max(0, 90_000 - (now - startTime));
  hud.setTimer(remaining);

  renderer.render(scene, cameraRig.camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function friendlyTagName(tag: string): string {
  switch (tag) {
    case "monitor":
    case "monitor-screen":
      return "monitor";
    case "lamp-shadow":
      return "shadow";
    case "coffee-steam":
      return "steam";
    default:
      return tag;
  }
}
