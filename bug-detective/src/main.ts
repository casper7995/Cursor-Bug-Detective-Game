import "./style.css";
import * as THREE from "three";
import { createSceneBundle } from "./three/createScene";
import { CameraRig } from "./three/cameraRig";
import { createMascotMesh } from "./cursor/mascotMesh";
import { createDesktopDiorama } from "./scene/desktopDiorama";
import { CursorTracker } from "./intro/cursorTracker";
import { createHud } from "./ui/hud";
import { createAnswerPanel } from "./ui/answerPanel";
import { createResultsPanel } from "./ui/resultsPanel";
import { ANOMALIES, pickAnomaly, type PickedAnomaly } from "./scene/anomalies";
import { fallbackSeed, todayUtc } from "./api/seedClient";
import { GameState, assertNever } from "./game/gameState";
import { createTimer, ROUND_DURATION_MS, type Timer } from "./game/timer";
import { InputManager } from "./input/inputManager";
import { Action } from "./input/actions";

// ---------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------
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

// ---------------------------------------------------------------------
// Anomaly selection (Day 7 wires this to worker; for now: URL/today seed)
// ---------------------------------------------------------------------
const url = new URL(window.location.href);
const seedOverride = url.searchParams.get("seed");
const dateOverride = url.searchParams.get("date");
const hashMatch = /anomaly=([a-z-]+)/.exec(window.location.hash);
let seed: number;
if (hashMatch) {
  const target = hashMatch[1] ?? "";
  let found = 0;
  for (let s = 1; s <= 200; s++) {
    if (pickAnomaly(s).def.id === target) {
      found = s;
      break;
    }
  }
  seed = found || fallbackSeed(dateOverride ?? todayUtc());
} else if (seedOverride) {
  seed = Number.parseInt(seedOverride, 10) >>> 0;
} else {
  seed = fallbackSeed(dateOverride ?? todayUtc());
}
let picked: PickedAnomaly = pickAnomaly(seed);
picked.def.apply(diorama);
console.info(
  `[bug-detective] seed=${seed} anomaly=${picked.def.id} (1 of ${ANOMALIES.length})`,
);

// ---------------------------------------------------------------------
// Game state + UI
// ---------------------------------------------------------------------
const state = new GameState();
const hud = createHud(root, diorama);
const answerPanel = createAnswerPanel(root);
const resultsPanel = createResultsPanel(root);
const input = new InputManager();
input.attach(window);

let timer: Timer | null = null;
const HOVER_GRACE_MS = 2000;
const HOVER_CLUE_THRESHOLD_MS = 350;
const hoverStreak = new Map<string, number>();

answerPanel.onSubmit((choiceIndex) => {
  state.submit(choiceIndex, picked.correctIndex);
  answerPanel.hide();
  if (state.phase.kind === "results") {
    showResults(state.phase.score, state.phase.correct, state.phase.cluesUsed,
                state.phase.elapsedMs);
  }
});

resultsPanel.onRestart(() => {
  restartRound();
});
resultsPanel.onShare(() => {
  // Day 8 wires this. For now, just hide so the user knows the click landed.
  console.info("[bug-detective] share clicked (Day 8 wires this)");
});

function showResults(
  score: number,
  correct: boolean,
  cluesUsed: number,
  elapsedMs: number,
): void {
  resultsPanel.show({
    correct,
    score,
    cluesUsed,
    elapsedMs,
    revealText: picked.def.revealText,
    rank: null,
  });
}

function startInvestigating(now: number): void {
  state.enterInvestigating(now);
  timer = createTimer(now);
  hoverStreak.clear();
  hud.setCluesUsed(0);
  hud.setStatusText("find the bug — hover to investigate");
  resultsPanel.hide();
  answerPanel.hide();
}

function enterAnsweringNow(now: number): void {
  state.enterAnswering(now);
  hud.setStatusText("which one is the bug?");
  // Build the prompt from the picked anomaly. Choices are already shuffled.
  answerPanel.show("which one is the bug?", picked.choices);
}

function restartRound(): void {
  // For dev iteration, advance the seed by 1 so each restart shows a new bug.
  // In production (Day 7), the seed is daily and `restart` will just replay.
  seed = (seed + 1) >>> 0;
  // Reset the diorama by swapping in a fresh one. Simple and bulletproof.
  scene.remove(diorama.root);
  const fresh = createDesktopDiorama();
  Object.assign(diorama, fresh);
  scene.add(fresh.root);
  // Re-bind cursor tracker to the new desk mesh.
  cursorTracker.setTarget(fresh.desk);
  // Re-pick anomaly + apply.
  picked = pickAnomaly(seed);
  picked.def.apply(diorama);
  console.info(
    `[bug-detective] restart seed=${seed} anomaly=${picked.def.id}`,
  );
  startInvestigating(performance.now());
}

// Day 4: skip the wow opener and go straight to investigating. Day 5/6 wires
// the proper intro state.
startInvestigating(performance.now());

// ---------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------
function onResize(): void {
  const w = root.clientWidth;
  const h = Math.max(root.clientHeight, 1);
  cameraRig.setAspect(w / h);
  renderer.setSize(w, h);
}
window.addEventListener("resize", onResize);
onResize();

const startTime = performance.now();
let lastFrame = startTime;

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

  // ---- Phase-driven update ----
  switch (state.phase.kind) {
    case "intro":
      // Day 4 stub: nothing to do; we transition out at boot.
      break;
    case "investigating": {
      if (!timer) break;
      const remaining = timer.remainingMs(now);
      const elapsedMs = timer.elapsedMs(now);
      hud.setTimer(remaining);

      // Hover detection + clue counter.
      const hover = hud.update(cameraRig.camera);
      if (hover.tag) {
        const isAnomalyTarget = hover.tag === picked.def.targetTag;
        const hint = isAnomalyTarget
          ? picked.def.tooltipHint
          : friendlyTagName(hover.tag);
        hud.setHover(hover.tag, hint);
        if (isAnomalyTarget && elapsedMs > HOVER_GRACE_MS) {
          const prev = hoverStreak.get(hover.tag) ?? 0;
          const next = prev + dtMs;
          hoverStreak.set(hover.tag, next);
          if (
            prev < HOVER_CLUE_THRESHOLD_MS &&
            next >= HOVER_CLUE_THRESHOLD_MS
          ) {
            state.bumpClue();
            if (state.phase.kind === "investigating") {
              hud.setCluesUsed(state.phase.cluesUsed);
            }
          }
        }
        mascot.setMagnifierLifted(isAnomalyTarget ? 1 : 0);
      } else {
        hud.setHover(null);
        mascot.setMagnifierLifted(0);
      }

      // Manual submit (Enter) or timer expiry → answering.
      if (input.consumePress(Action.Submit) || timer.isExpired(now)) {
        enterAnsweringNow(now);
      }
      break;
    }
    case "answering":
      // Answer panel handles input; nothing per-frame.
      hud.update(cameraRig.camera);
      break;
    case "results":
      // Results panel up; let mascot still bob and tooltip still raycast.
      hud.update(cameraRig.camera);
      if (input.consumePress(Action.Restart)) {
        restartRound();
      }
      break;
    default:
      assertNever(state.phase);
  }

  renderer.render(scene, cameraRig.camera);
  input.endFrame();
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

// Hush the unused-warning on ROUND_DURATION_MS while keeping the import
// available for tests that probe the constant.
void ROUND_DURATION_MS;
