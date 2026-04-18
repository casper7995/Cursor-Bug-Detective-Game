import "./style.css";
import * as THREE from "three";
import { createSceneBundle, WebGLUnsupportedError } from "./three/createScene";
import { CameraRig } from "./three/cameraRig";
import { createMascotMesh } from "./cursor/mascotMesh";
import { createDesktopDiorama } from "./scene/desktopDiorama";
import { CursorTracker } from "./intro/cursorTracker";
import { createPagePeel, type PagePeel } from "./intro/pagePeel";
import { createHud } from "./ui/hud";
import { createAnswerPanel } from "./ui/answerPanel";
import { createResultsPanel } from "./ui/resultsPanel";
import { ANOMALIES, pickAnomaly, type PickedAnomaly } from "./scene/anomalies";
import { fallbackSeed, fetchSeed, todayUtc } from "./api/seedClient";
import { fetchLeaderboard, postScore } from "./api/scoreClient";
import { renderShareCard, tweetIntent, shareCardBlob } from "./ui/shareCard";
import { renderLeaderboardPanel } from "./ui/leaderboard";
import { createCountdown } from "./ui/countdown";
import { createPostFx } from "./three/postFx";
import {
  isMuted,
  sfxClueFound,
  sfxCorrect,
  sfxHover,
  sfxMascotLand,
  sfxPeelTear,
  sfxSubmit,
  sfxUiClick,
  sfxWrong,
  toggleMute,
} from "./audio/audio";
void isMuted; // exported for the Day 11 settings panel
import { GameState, assertNever } from "./game/gameState";
import { createTimer, ROUND_DURATION_MS, type Timer } from "./game/timer";
import { InputManager } from "./input/inputManager";
import { Action } from "./input/actions";
import { isMobile, mountMobileGate } from "./ui/mobileGate";
import { showTitleSplash } from "./ui/titleSplash";
import { createSettingsPanel } from "./ui/settingsPanel";
import { isSkipIntro } from "./ui/skipIntroPref";
import { recordRound, showStreakOutro } from "./ui/streakOutro";

// ---------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------
const container = document.getElementById("app");
if (!(container instanceof HTMLElement)) throw new Error("#app missing");
const root = container;

// Mobile fallback: Bug Detective requires a mouse for the page-peel intro
// and hover-to-investigate. On phones / coarse-pointer narrow viewports we
// show a friendly "open on desktop" gate instead of a broken touch path.
// URL ?mobile=1 forces the gate (handy for QA on desktop browsers).
const forceMobile = new URLSearchParams(window.location.search).get("mobile") === "1";
if (forceMobile || isMobile()) {
  // Mobile users get a dismissable card explaining the desktop trade-off
  // and a "Play simplified" button. If they pick simplified, boot the
  // touch-friendly flow (skip-intro path + tap-to-investigate).
  void mountMobileGate(root).then((choice) => {
    if (choice === "simplified") bootGame({ simplified: true });
  });
} else if (isSkipIntro()) {
  // Returning visitor opted in to "Skip intro" in Settings. Boot the game
  // immediately. WebAudio will resume on the first hover/click during
  // investigation (audio module attaches its own listeners).
  bootGame({ simplified: false });
} else {
  // Show the title splash first; once the user clicks/keys, boot the game.
  // This both gates the heavy 3D init and gives the AudioContext a user
  // gesture so the ambient pad/SFX can resume on Chrome's autoplay policy.
  const splash = showTitleSplash(document.body);
  splash.ready.then(() => bootGame({ simplified: false }));
}

interface BootOpts {
  /**
   * Simplified touch flow for phones. Skips the page-peel intro and the
   * mouse-driven cursor tracker; raycasts each tap to register as a
   * "hover" on the picked prop.
   */
  readonly simplified: boolean;
}

function bootGame(opts: BootOpts): void {
  const simplified = opts.simplified;
  try {
    bootGameInner(simplified);
  } catch (err) {
    if (err instanceof WebGLUnsupportedError) {
      showWebGLError(root);
      return;
    }
    throw err;
  }
}

function showWebGLError(container: HTMLElement): void {
  const card = document.createElement("div");
  card.style.cssText =
    "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#0e0f15;color:#f1f3f7;padding:24px;font-family:ui-sans-serif,system-ui,sans-serif;z-index:1000;";
  card.innerHTML = `
    <div style="max-width:420px;text-align:center;background:#1a1d24;border:1px solid #2a2e3a;border-radius:14px;padding:28px;">
      <div style="font-size:48px;line-height:1;margin-bottom:8px;">🛠️</div>
      <h1 style="font-size:20px;margin:8px 0 12px;">WebGL is required</h1>
      <p style="font-size:14px;line-height:1.5;opacity:0.8;margin:0 0 14px;">
        Bug Detective needs WebGL to render the 3D desktop. Try a modern
        browser (Chrome, Edge, Safari 16+, Firefox) on a device with
        hardware acceleration enabled.
      </p>
    </div>
  `;
  container.appendChild(card);
}

function bootGameInner(simplified: boolean): void {

const { scene, renderer } = createSceneBundle(root);

const cameraRig = new CameraRig(
  root.clientWidth / Math.max(root.clientHeight, 1),
);

// Game-time camera pose (used during investigation phase).
const GAME_CAMERA_POS = new THREE.Vector3(3.2, 2.4, 5.2);
const GAME_CAMERA_LOOKAT = new THREE.Vector3(-0.2, 0.3, -0.4);

const diorama = createDesktopDiorama();
diorama.root.visible = false; // hidden during the page-peel intro
scene.add(diorama.root);

const mascot = createMascotMesh();
// Default to intro-scale (small, OS-cursor-sized). Investigation-time the
// scale is bumped up so the mascot reads as a desk figurine. v3 mascot is
// taller (humanoid body) so game scale is smaller than v2.
const MASCOT_INTRO_SCALE = 0.06;
const MASCOT_GAME_SCALE = 0.35;
const MASCOT_FEET_OFFSET = 1.05; // local-space distance from origin to soles
mascot.group.scale.setScalar(MASCOT_INTRO_SCALE);
scene.add(mascot.group);

// ---- Page-peel intro setup ------------------------------------------
// The page plane sits at z = 0, centered. We position the camera close
// to it on +Z so the plane fills the frustum exactly. Plane size derived
// from camera FOV + distance + viewport aspect.
const INTRO_CAMERA_Z = 1.2;
const fovTanHalf = Math.tan((cameraRig.camera.fov * Math.PI) / 180 / 2);
const introPlaneHeight = INTRO_CAMERA_Z * fovTanHalf * 2;
const introPlaneWidth =
  introPlaneHeight * (root.clientWidth / Math.max(root.clientHeight, 1));

let pagePeel: PagePeel = createPagePeel({
  width: introPlaneWidth,
  height: introPlaneHeight,
  center: new THREE.Vector3(0, 0, 0),
});
scene.add(pagePeel.mesh);

cameraRig.setStatic(
  new THREE.Vector3(0, 0, INTRO_CAMERA_Z),
  new THREE.Vector3(0, 0, 0),
);

// Post-processing: bloom on the lamp + vignette around the corners.
const postFx = createPostFx(renderer, scene, cameraRig.camera);

// Mascot sits in front of the plane during the intro, just above the
// "ground" of the page (slightly toward bottom of viewport).
mascot.group.position.set(0, -introPlaneHeight * 0.1, 0.05);

const cursorTracker = new CursorTracker(
  cameraRig.camera,
  mascot.group,
  pagePeel.mesh, // initially track on the page plane
);
cursorTracker.setYOffset(0.0);
cursorTracker.setSmoothing(18);
cursorTracker.attach(renderer.domElement);

// ---------------------------------------------------------------------
// Anomaly selection
// - URL `?seed=N` override → forced seed (dev iteration).
// - URL `#anomaly=<id>` → search the first seed that maps to that id.
// - URL `?date=YYYY-MM-DD` → use that date (overrides today, still goes
//   through the worker so the worker's daily seed for that date is used).
// - Otherwise: fetchSeed(today) — worker round trip with local fallback.
// ---------------------------------------------------------------------
const url = new URL(window.location.href);
const seedOverride = url.searchParams.get("seed");
const dateOverride = url.searchParams.get("date");
const targetDate = dateOverride ?? todayUtc();
const hashMatch = /anomaly=([a-z-]+)/.exec(window.location.hash);

async function pickSeed(): Promise<number> {
  if (hashMatch) {
    const target = hashMatch[1] ?? "";
    for (let s = 1; s <= 200; s++) {
      if (pickAnomaly(s).def.id === target) return s;
    }
  }
  if (seedOverride) return Number.parseInt(seedOverride, 10) >>> 0;
  // Try the worker; falls back to local FNV-1a if the API isn't configured
  // or returns an error.
  return await fetchSeed(targetDate);
}

let picked: PickedAnomaly = pickAnomaly(fallbackSeed(targetDate));
let seed = fallbackSeed(targetDate);
// Boot with the local fallback applied immediately so the diorama isn't
// blank during the worker round-trip; if the worker disagrees, we'll
// re-apply when its response arrives. In practice the worker mirrors
// the same FNV-1a so this is a no-op.
picked.def.apply(diorama);
console.info(
  `[bug-detective] (boot) seed=${seed} anomaly=${picked.def.id} (1 of ${ANOMALIES.length})`,
);

// Async re-pick from worker. If the worker chooses a different seed
// (won't, in normal operation, but possible if the server hash drifts),
// rebuild the diorama and re-apply.
void pickSeed().then((s) => {
  if (s === seed) return;
  seed = s;
  // Replace diorama with a fresh one and apply the new anomaly.
  scene.remove(diorama.root);
  const fresh = createDesktopDiorama();
  fresh.root.visible = state.phase.kind !== "intro";
  Object.assign(diorama, fresh);
  scene.add(fresh.root);
  cursorTracker.setTarget(state.phase.kind === "intro" ? pagePeel.mesh : fresh.desk);
  picked = pickAnomaly(seed);
  picked.def.apply(diorama);
  console.info(
    `[bug-detective] worker seed=${seed} anomaly=${picked.def.id}`,
  );
});

// ---------------------------------------------------------------------
// Game state + UI
// ---------------------------------------------------------------------
const state = new GameState();
const hud = createHud(root, diorama);
hud.element.style.display = "none"; // hidden during intro
const answerPanel = createAnswerPanel(root);
const resultsPanel = createResultsPanel(root);
const settings = createSettingsPanel(document.body, {
  onRestart: () => {
    sfxUiClick();
    resultsPanel.hide();
    answerPanel.hide();
    restartRound();
  },
});
settings.setVisible(false); // hidden during intro
const input = new InputManager();
input.attach(window);

let timer: Timer | null = null;
// Plan Day 3: clue counter increments only AFTER the first 5s of the
// round, so reflexive carpet-bombing hovers aren't penalised. The
// HOVER_CLUE_THRESHOLD_MS gate also requires the player to dwell on
// the anomaly target for ~350ms before it counts (avoids one-frame
// flyovers).
const HOVER_GRACE_MS = 5000;
const HOVER_CLUE_THRESHOLD_MS = 350;
const hoverStreak = new Map<string, number>();
let lastHoverTag: string | null = null;
let lastIdleAt = performance.now();
const lastMascotPos = new THREE.Vector3();

answerPanel.onSubmit((choiceIndex) => {
  sfxUiClick();
  state.submit(choiceIndex, picked.correctIndex);
  answerPanel.hide();
  if (state.phase.kind === "results") {
    const phase = state.phase;
    if (phase.correct) sfxCorrect();
    else sfxWrong();
    // Track session streak. Show "Detective Pro" outro card on every
    // 3rd consecutive correct (3, 6, 9, ...) before the normal results
    // panel. Wrong answer resets streak to 0.
    const streak = recordRound(phase.correct);
    const showOutro = phase.correct && streak >= 3 && streak % 3 === 0;
    const proceed = (): void => {
      showResults(phase.score, phase.correct, phase.cluesUsed, phase.elapsedMs);
    };
    if (showOutro) {
      void showStreakOutro(document.body, streak).then(proceed);
    } else {
      proceed();
    }
    // Persist correct submissions to the worker (best-effort, no UI block).
    if (phase.correct) {
      // localStorage can throw in Safari Private Browsing — fall back to "anon".
      let name = "anon";
      try {
        name = (localStorage.getItem("bd:name") ?? "anon").slice(0, 16);
      } catch {
        /* ignore */
      }
      void postScore({
        date: targetDate,
        score: phase.score,
        cluesUsed: phase.cluesUsed,
        elapsedMs: phase.elapsedMs,
        name,
      }).then((res) => {
        if (res) console.info(`[bug-detective] posted score, rank=${res.rank}`);
      });
    }
  }
});

resultsPanel.onRestart(() => {
  restartRound();
});

const countdown = createCountdown();
resultsPanel.setCountdownSlot(countdown.element);

let lastResults: {
  score: number;
  cluesUsed: number;
  elapsedMs: number;
  rank: number | null;
} | null = null;

resultsPanel.onShare(async () => {
  if (!lastResults) return;
  const card = renderShareCard({
    score: lastResults.score,
    anomalyName: picked.def.correctChoice,
    elapsedMs: lastResults.elapsedMs,
    cluesUsed: lastResults.cluesUsed,
    dateUtc: targetDate,
    rank: lastResults.rank,
  });

  // Try Web Share API with a PNG file first (modern Chrome/Safari iOS).
  // Fall back to opening Twitter/X intent in a new tab.
  const blob = await shareCardBlob(card);
  if (blob && navigator.canShare) {
    const file = new File([blob], `bug-detective-${targetDate}.png`, {
      type: "image/png",
    });
    const data: ShareData = {
      title: "Bug Detective",
      text: `I scored ${lastResults.score} on Bug Detective (${targetDate}).`,
      url: "https://vibej.am/2026/",
      files: [file],
    };
    if (navigator.canShare(data)) {
      try {
        await navigator.share(data);
        return;
      } catch {
        /* fall through to twitter intent */
      }
    }
  }
  window.open(tweetIntent(lastResults.score, targetDate), "_blank", "noopener");
});

function showResults(
  score: number,
  correct: boolean,
  cluesUsed: number,
  elapsedMs: number,
): void {
  lastResults = { score, cluesUsed, elapsedMs, rank: null };
  resultsPanel.show({
    correct,
    score,
    cluesUsed,
    elapsedMs,
    revealText: picked.def.revealText,
    rank: null,
  });
  // Refresh the leaderboard slot async (worker round-trip).
  void fetchLeaderboard(targetDate).then((entries) => {
    // Find current player's rank in the freshly-fetched list. Match on
    // score + cluesUsed + elapsedMs (server-side dedupes by ts which we
    // don't know here, so this matches the "just-submitted" entry well
    // enough for highlighting).
    let myRank: number | null = null;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (
        e &&
        correct &&
        e.score === score &&
        e.cluesUsed === cluesUsed &&
        e.elapsedMs === elapsedMs
      ) {
        myRank = i + 1;
        break;
      }
    }
    if (lastResults) lastResults.rank = myRank;
    const node = renderLeaderboardPanel({
      entries,
      myRank,
      myScore: correct ? score : null,
    });
    resultsPanel.setLeaderboardSlot(node);
  });
  countdown.start();
}

function startInvestigating(now: number): void {
  state.enterInvestigating(now);
  timer = createTimer(now);
  hoverStreak.clear();
  hud.setCluesUsed(0);
  hud.setStatusText("find the bug — hover to investigate");
  resultsPanel.hide();
  answerPanel.hide();
  countdown.stop();
  lastResults = null;
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

// ---- Wow opener choreography (Day 6) -------------------------------
// Sequence on first user mouse move (after a small beat):
//   1. Mascot tilts up + jumps slightly (cursor "noticing" something).
//   2. Page peel begins (vertex shader rolls bottom edge upward).
//   3. Camera dollies from intro pose to gameplay pose CONCURRENTLY.
//   4. Diorama becomes visible mid-dolly (the "reveal").
//   5. Cursor tracker switches target to desk; mascot scales up + lands.
//   6. State transitions to investigating, HUD fades in, timer starts.
const INTRO_BEAT_MS = 600;       // beat after first move before peel begins
const PEEL_BEGIN_MS = 200;       // delay between mascot reaction and peel start
const DOLLY_DURATION_MS = 1600;  // total camera dolly time
const REVEAL_AT_PROGRESS = 0.35; // make diorama visible at 35% of dolly

type IntroStep =
  | "waiting"           // before first mouse move + beat
  | "reacting"          // mascot tilts/jumps before peel
  | "peeling"           // peel + dolly running concurrently
  | "landing"           // mascot scales up + lands on desk
  | "done";

let firstMoveAt: number | null = null;
let introStep: IntroStep = "waiting";
let introStepStartedAt = 0;
let dollyStarted = false;
let dioramaRevealed = false;
let dollyPromise: Promise<void> | null = null;

function setIntroStep(step: IntroStep, now: number): void {
  introStep = step;
  introStepStartedAt = now;
}

function tickIntroChoreography(now: number, dtSec: number): void {
  switch (introStep) {
    case "waiting": {
      if (firstMoveAt === null) return;
      if (now - firstMoveAt < INTRO_BEAT_MS) return;
      setIntroStep("reacting", now);
      // Detach cursor tracker so mascot stops following mouse — scripted now.
      cursorTracker.detach();
      break;
    }
    case "reacting": {
      const t = (now - introStepStartedAt) / 400; // 400ms of reaction
      // Tilt up to look at the page edge above.
      mascot.setTilt(-0.3 * Math.min(1, t));
      // Tiny upward bounce.
      const bounce = Math.sin(Math.PI * Math.min(1, t)) * 0.04;
      mascot.group.position.y =
        -introPlaneHeight * 0.1 + bounce;
      if (now - introStepStartedAt > PEEL_BEGIN_MS) {
        pagePeel.start();
        sfxPeelTear();
        dollyPromise = cameraRig.scriptedTo(
          GAME_CAMERA_POS,
          GAME_CAMERA_LOOKAT,
          DOLLY_DURATION_MS,
        );
        void dollyPromise; // fire and forget; tracked by isDollying()
        dollyStarted = true;
        setIntroStep("peeling", now);
      }
      break;
    }
    case "peeling": {
      // Continue mascot reaction tilt during peel. Drop the tilt as the
      // peel approaches completion (mascot relaxes).
      const peelT = pagePeel.progress01;
      mascot.setTilt(-0.3 * (1 - peelT));
      // Reveal the diorama mid-dolly so the room appears as the page lifts.
      if (!dioramaRevealed && dollyStarted) {
        const dollyProgress =
          dollyStarted && cameraRig.isDollying()
            ? Math.min(1, (now - introStepStartedAt) / DOLLY_DURATION_MS)
            : 1;
        if (dollyProgress >= REVEAL_AT_PROGRESS) {
          diorama.root.visible = true;
          dioramaRevealed = true;
        }
      }
      // Once both peel and dolly are done, move to landing.
      if (pagePeel.done && !cameraRig.isDollying()) {
        // Switch cursor target + scale up the mascot for landing.
        cursorTracker.setTarget(diorama.desk);
        cursorTracker.setYOffset(MASCOT_FEET_OFFSET * MASCOT_GAME_SCALE);
        cursorTracker.setSmoothing(8);
        cursorTracker.attach(renderer.domElement);
        // Park the mascot at the landing spot so the scale-up doesn't
        // throw it across the desk; cursor tracker will take over at end.
        mascot.group.position.set(
          0.4,
          diorama.deskTopY + MASCOT_FEET_OFFSET * MASCOT_GAME_SCALE,
          0.4,
        );
        setIntroStep("landing", now);
      }
      // Smooth scale interpolation from intro -> game scale during the
      // final 50% of the peel so the mascot grows as the camera pulls back.
      const scale = THREE.MathUtils.lerp(
        MASCOT_INTRO_SCALE,
        MASCOT_GAME_SCALE,
        Math.min(1, Math.max(0, peelT * 1.2)),
      );
      mascot.group.scale.setScalar(scale);
      break;
    }
    case "landing": {
      // 600ms gentle settle on the desk: small drop + bounce + tilt to 0.
      const t = Math.min(1, (now - introStepStartedAt) / 600);
      mascot.setTilt((1 - t) * -0.15);
      const bounce = Math.sin(Math.PI * t) * 0.05;
      mascot.group.position.y =
        diorama.deskTopY + MASCOT_FEET_OFFSET * MASCOT_GAME_SCALE + bounce;
      if (t === 0 || (t < 0.2 && now - introStepStartedAt < 50)) {
        sfxMascotLand();
      }
      if (t >= 1) {
        mascot.setTilt(0);
        hud.element.style.display = "block";
        settings.setVisible(true);
        postFx.setBloomEnabled(true);
        startInvestigating(now);
        setIntroStep("done", now);
      }
      break;
    }
    case "done":
      break;
    default:
      assertNever(introStep);
  }
  void dtSec;
}

function maybeBeginIntroExit(now: number): void {
  // Drives the choreography state machine. State.phase stays in "intro"
  // until the landing step calls startInvestigating().
  tickIntroChoreography(now, 0);
}

// ---------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------
function onResize(): void {
  const w = root.clientWidth;
  const h = Math.max(root.clientHeight, 1);
  const aspect = w / h;
  cameraRig.setAspect(aspect);
  renderer.setSize(w, h);
  postFx.setSize(w, h);
  // While the page-peel intro is up, resize the page plane so it keeps
  // filling the viewport at any aspect ratio.
  if (state.phase.kind === "intro" && pagePeel.mesh.visible) {
    const newH = INTRO_CAMERA_Z * fovTanHalf * 2;
    const newW = newH * aspect;
    pagePeel.mesh.scale.set(newW / introPlaneWidth, newH / introPlaneHeight, 1);
  }
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
  pagePeel.update(dtSec);

  // Periodic blink for personality.
  const blinkPhase = (elapsed % 4.2) / 4.2;
  mascot.setBlink(blinkPhase > 0.95 ? 0 : 1);

  // Idle bob: track mascot position deltas as a "did the cursor move?"
  // heuristic. When stationary >0.6s, gently float up/down.
  if (state.phase.kind === "investigating") {
    const movedDelta = mascot.group.position
      .clone()
      .sub(lastMascotPos)
      .lengthSq();
    if (movedDelta > 1e-6) {
      lastIdleAt = now;
    }
    lastMascotPos.copy(mascot.group.position);
    const idleMs = now - lastIdleAt;
    if (idleMs > 600) {
      const bob = Math.sin((now - lastIdleAt) * 0.0024) * 0.014;
      mascot.group.position.y =
        diorama.deskTopY + MASCOT_FEET_OFFSET * MASCOT_GAME_SCALE + bob;
    }
  }

  // Global Mute toggle.
  if (input.consumePress(Action.Mute)) {
    toggleMute();
  }

  // Detect first mouse move while in intro.
  if (state.phase.kind === "intro" && firstMoveAt === null && cursorTracker.hasUserMoved()) {
    firstMoveAt = now;
  }

  // ---- Phase-driven update ----
  switch (state.phase.kind) {
    case "intro":
      // While the page is up, mascot tracks mouse on the page plane.
      // After the beat, transition out (Day 5 stub: snap-cut; Day 6: peel).
      maybeBeginIntroExit(now);
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
            sfxClueFound();
            if (state.phase.kind === "investigating") {
              hud.setCluesUsed(state.phase.cluesUsed);
            }
          }
        }
        // Subtle hover tick (throttled — only when newly entering this tag).
        if (lastHoverTag !== hover.tag) {
          if (hover.tag !== null) sfxHover();
          lastHoverTag = hover.tag;
        }
        mascot.setMagnifierLifted(isAnomalyTarget ? 1 : 0);
      } else {
        hud.setHover(null);
        mascot.setMagnifierLifted(0);
        lastHoverTag = null;
      }

      // Manual submit (Enter) or timer expiry → answering.
      if (input.consumePress(Action.Submit) || timer.isExpired(now)) {
        sfxSubmit();
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

  postFx.render();
  input.endFrame();
  requestAnimationFrame(frame);
}

// Skip-intro fast path: bypass the page-peel choreography and land
// directly on the desk. Triggered by:
//   - Settings → "Skip intro next load" toggle (returning desktop visitors)
//   - Mobile gate "Play simplified" choice (touch users)
// In both cases, the choreography state machine is parked at "done" so
// its switch never runs, and we manually do the same teardown the
// landing step does (camera pose, diorama visible, HUD + settings
// shown, bloom on, cursor target = desk, mascot at game scale).
if (isSkipIntro() || simplified) {
  pagePeel.mesh.visible = false;
  diorama.root.visible = true;
  cameraRig.setStatic(GAME_CAMERA_POS, GAME_CAMERA_LOOKAT);
  cursorTracker.setTarget(diorama.desk);
  cursorTracker.setYOffset(MASCOT_FEET_OFFSET * MASCOT_GAME_SCALE);
  cursorTracker.setSmoothing(12);
  mascot.group.scale.setScalar(MASCOT_GAME_SCALE);
  mascot.group.position.set(
    0.4,
    diorama.deskTopY + MASCOT_FEET_OFFSET * MASCOT_GAME_SCALE,
    0.4,
  );
  hud.element.style.display = "block";
  settings.setVisible(true);
  postFx.setBloomEnabled(true);
  setIntroStep("done", performance.now());
  startInvestigating(performance.now());
}

// Simplified touch flow: each tap on the canvas raycasts against the
// hoverables and writes the hit's NDC coords into the cursor tracker
// just like a mouse hover would. The HUD update loop already runs each
// frame; it picks up the new mouse coords and registers a hover (which
// drives tooltip + clue counting). After 2.5s the registered hover
// auto-clears so the next tap is treated as a fresh hover (otherwise
// idle clue counting would keep ticking up on the most recent prop).
if (simplified) {
  const HOVER_HOLD_MS = 2500;
  let clearAt = 0;
  const onTap = (e: PointerEvent | MouseEvent | Touch): void => {
    const rect = renderer.domElement.getBoundingClientRect();
    const cx =
      "clientX" in e
        ? (e as { clientX: number }).clientX
        : (e as Touch).clientX;
    const cy =
      "clientY" in e
        ? (e as { clientY: number }).clientY
        : (e as Touch).clientY;
    const x = cx - rect.left;
    const y = cy - rect.top;
    cursorTracker.setMouse(x, y);
    clearAt = performance.now() + HOVER_HOLD_MS;
  };
  renderer.domElement.addEventListener("pointerdown", (e) => onTap(e), {
    passive: true,
  });
  renderer.domElement.addEventListener(
    "touchstart",
    (e) => {
      const t = e.touches[0];
      if (t) onTap(t);
    },
    { passive: true },
  );

  // Periodically clear the held hover so clue tick doesn't compound.
  // Done outside the per-frame hot loop to keep main.ts diff small.
  window.setInterval(() => {
    if (clearAt > 0 && performance.now() > clearAt) {
      cursorTracker.setMouse(-9999, -9999); // off-canvas → no hit
      clearAt = 0;
    }
  }, 200);
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

} // end bootGameInner
