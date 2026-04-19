import "./style.css";
import * as THREE from "three";
import { createSceneBundle, WebGLUnsupportedError } from "./three/createScene";
import { CameraRig } from "./three/cameraRig";
import { createMascotMesh } from "./cursor/mascotMesh";
import { MascotController } from "./cursor/mascotController";
import { createDesktopDiorama } from "./scene/desktopDiorama";
import { applyPropFlavor, isFlavorTag } from "./scene/propInteractions";
import { CursorTracker } from "./intro/cursorTracker";
import { createPagePeel, type PagePeel } from "./intro/pagePeel";
import { createHud } from "./ui/hud";
import { createAnswerPanel } from "./ui/answerPanel";
import { createResultsPanel } from "./ui/resultsPanel";
import { ANOMALIES, pickAnomaly, type PickedAnomaly } from "./scene/anomalies";
import { fallbackSeed, fetchSeed, todayUtc } from "./api/seedClient";
import {
  fetchLeaderboard,
  postScore,
  RUNNER_PUZZLE_ID,
} from "./api/scoreClient";
import { renderShareCard, tweetIntent, shareCardBlob } from "./ui/shareCard";
import { renderLeaderboardPanel } from "./ui/leaderboard";
import { createCountdown } from "./ui/countdown";
import { createPostFx } from "./three/postFx";
import {
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
import { formatGameScoresDetail } from "./game/score";
import { GameState, assertNever, type RunnerMode } from "./game/gameState";
import { EnvelopeSession } from "./minigames/envelope/envelopeSession";
import { ReagentSession } from "./minigames/reagent/reagentSession";
import { LampSession } from "./minigames/lamp/lampSession";
import { deriveRunnerClueSet } from "./minigames/runner/clueTokens";
import { RunnerSession } from "./minigames/runner/session";
import { swapMonitorScreenMap } from "./minigames/runner/monitorSurface";
import { createRunnerOverlay } from "./minigames/runner/runnerOverlay";
import { InputManager } from "./input/inputManager";
import { Action } from "./input/actions";
import { isMobile, mountMobileGate } from "./ui/mobileGate";
import { showTitleSplash } from "./ui/titleSplash";
import { showHowToPlay } from "./ui/howToPlay";
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
// URL ?reset=1 clears every bd:* localStorage key so QA + new visitors
// can re-experience the full intro choreography after testing the
// Skip-intro toggle.
const queryParams = new URLSearchParams(window.location.search);
if (queryParams.get("reset") === "1") {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith("bd:")) localStorage.removeItem(key);
    }
  } catch {
    /* private browsing — nothing to reset */
  }
}
if (queryParams.get("mobile") === "1" || isMobile()) {
  // Mobile users get a dismissable card explaining the desktop trade-off
  // and a "Play simplified" button. The gate's promise resolves only
  // when they pick "Play simplified"; copy/share keep the gate up by
  // design.
  void mountMobileGate(root).then(() => bootGame({ simplified: true }));
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
  void (async () => {
    try {
      const howtoOnce = new URLSearchParams(window.location.search).get(
        "howto",
      );
      if (!opts.simplified && howtoOnce === "1") {
        await showHowToPlay(root);
      }
      bootGameInner(opts.simplified);
    } catch (err) {
      if (err instanceof WebGLUnsupportedError) {
        showWebGLError(root);
        return;
      }
      throw err;
    }
  })();
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
  // scale is bumped up so the mascot reads as a desk figurine. The chibi
  // redesign has an oversized head on a small body, so total height shrank;
  // we scale up slightly to keep the mascot's apparent presence on the desk.
  const MASCOT_INTRO_SCALE = 0.06;
  const MASCOT_GAME_SCALE = 0.32;
  const MASCOT_FEET_OFFSET = 0.89; // local-space distance from origin to soles
  mascot.group.scale.setScalar(MASCOT_INTRO_SCALE);
  mascot.group.visible = false;
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

  const mascotController = new MascotController(mascot.group, {
    onLand: () => sfxMascotLand(),
  });
  mascotController.resetAt(mascot.group.position.clone(), 0);
  mascotController.setFrozen(true);

  const cursorTracker = new CursorTracker(cameraRig.camera, pagePeel.mesh);
  cursorTracker.setYOffset(0.0);
  cursorTracker.attach(renderer.domElement);

  function syncCursorDeskNav(d: ReturnType<typeof createDesktopDiorama>): void {
    cursorTracker.setFootObstacles(d.mascotFootObstacles);
    cursorTracker.setDeskBounds(4, 2);
  }

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
      // Regex requires at least one capture char so [1] is always set.
      const target = hashMatch[1] as string;
      for (let s = 1; s <= 200; s++) {
        if (pickAnomaly(s).def.id === target) return s;
      }
    }
    if (seedOverride) return Number.parseInt(seedOverride, 10) >>> 0;
    // Try the worker; falls back to local FNV-1a if the API isn't configured
    // or returns an error.
    return await fetchSeed(targetDate);
  }

  let seed = fallbackSeed(targetDate);
  let picked: PickedAnomaly = pickAnomaly(seed);
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
    cursorTracker.setTarget(
      state.phase.kind === "intro" ? pagePeel.mesh : fresh.desk,
    );
    if (state.phase.kind !== "intro") syncCursorDeskNav(fresh);
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
  const caseFileIntroStartMs = performance.now();
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

  let runnerSession: RunnerSession | null = null;
  let runnerSurfaceRestore: (() => void) | null = null;
  let runnerOverlay: ReturnType<typeof createRunnerOverlay> | null = null;
  /** False once overlay fade-in finishes — skip updating monitor mesh texture. */
  let runnerUpdateMonitorTexture = true;
  let runnerCamReturn: {
    pos: THREE.Vector3;
    look: THREE.Vector3;
  } | null = null;
  /** Endless runner: auto-restart countdown after game over (seconds). */
  let runnerEndlessDeathTimer = 0;

  type DeskMini =
    | { kind: "envelope"; session: EnvelopeSession }
    | { kind: "reagent"; session: ReagentSession }
    | { kind: "lamp"; session: LampSession };

  let deskMinigame: DeskMini | null = null;
  let deskMiniCamReturn: {
    pos: THREE.Vector3;
    look: THREE.Vector3;
  } | null = null;
  const deskZoomBox = new THREE.Box3();
  const deskZoomCenter = new THREE.Vector3();

  let flavorInspectReturn: {
    pos: THREE.Vector3;
    look: THREE.Vector3;
  } | null = null;
  let flavorInspectTimer: ReturnType<typeof setTimeout> | null = null;

  function readPlayerName(): string {
    try {
      return (localStorage.getItem("bd:name") ?? "anon").slice(0, 16);
    } catch {
      return "anon";
    }
  }

  function disposeDeskMiniOnly(): void {
    deskMinigame?.session.dispose();
    deskMinigame = null;
  }

  function getDeskZoomTarget(kind: "envelope" | "reagent" | "lamp"): {
    camPos: THREE.Vector3;
    lookAt: THREE.Vector3;
  } {
    let obj: THREE.Object3D = diorama.evidenceEnvelopeRoot;
    if (kind === "reagent") obj = diorama.reagentTray;
    if (kind === "lamp") obj = diorama.lamp;
    obj.updateMatrixWorld(true);
    deskZoomBox.setFromObject(obj);
    deskZoomBox.getCenter(deskZoomCenter);
    const lookAt = deskZoomCenter.clone();
    const offset =
      kind === "lamp"
        ? new THREE.Vector3(1.05, 0.52, 1.08)
        : kind === "reagent"
          ? new THREE.Vector3(0.88, 0.44, 0.98)
          : new THREE.Vector3(0.72, 0.4, 0.92);
    const camPos = lookAt.clone().add(offset);
    return { camPos, lookAt };
  }

  function disposeRunnerVisuals(): void {
    if (flavorInspectTimer) {
      clearTimeout(flavorInspectTimer);
      flavorInspectTimer = null;
    }
    if (flavorInspectReturn) {
      const ret = flavorInspectReturn;
      flavorInspectReturn = null;
      hud.setInspectCaption(null);
      mascotController.setFrozen(false);
      void cameraRig.scriptedTo(ret.pos, ret.look, 220);
    }
    disposeDeskMiniOnly();
    deskMiniCamReturn = null;
    diorama.flags.envelopeOpen = false;
    diorama.flags.reagentActive = false;
    diorama.flags.lampActive = false;
    runnerOverlay?.dispose();
    runnerOverlay = null;
    runnerUpdateMonitorTexture = true;
    runnerCamReturn = null;
    runnerSurfaceRestore?.();
    runnerSurfaceRestore = null;
    runnerSession?.dispose();
    runnerSession = null;
    mascotController.setFrozen(false);
    cursorTracker.refreshLayout();
  }

  async function endRunnerSessionAsync(_now: number): Promise<void> {
    if (runnerOverlay) {
      await runnerOverlay.fadeOut(180);
    }
    const ret = runnerCamReturn;
    runnerCamReturn = null;
    disposeRunnerVisuals();
    if (ret) {
      await cameraRig.scriptedTo(ret.pos, ret.look, 500);
    }
  }

  function endDeskMiniFromOverlay(): void {
    diorama.flags.envelopeOpen = false;
    diorama.flags.reagentActive = false;
    diorama.flags.lampActive = false;
    const ret = deskMiniCamReturn;
    deskMiniCamReturn = null;
    disposeDeskMiniOnly();
    if (ret) {
      void cameraRig.scriptedTo(ret.pos, ret.look, 420);
    }
    if (runnerOverlay) {
      void runnerOverlay.fadeOut(180).then(() => {
        runnerOverlay?.dispose();
        runnerOverlay = null;
        mascotController.setFrozen(false);
        cursorTracker.refreshLayout();
      });
    } else {
      mascotController.setFrozen(false);
      cursorTracker.refreshLayout();
    }
  }

  async function startDeskMini(
    kind: "envelope" | "reagent" | "lamp",
    _now: number,
  ): Promise<void> {
    if (deskMinigame) return;
    exitInspectZoom(200);
    mascotController.setFrozen(true);
    disposeRunnerVisuals();

    deskMiniCamReturn = {
      pos: cameraRig.camera.position.clone(),
      look: new THREE.Vector3(),
    };
    cameraRig.copyLookAtInto(deskMiniCamReturn.look);

    if (kind === "envelope") diorama.flags.envelopeOpen = true;
    if (kind === "reagent") diorama.flags.reagentActive = true;
    if (kind === "lamp") diorama.flags.lampActive = true;

    const { camPos, lookAt } = getDeskZoomTarget(kind);
    await cameraRig.scriptedTo(camPos, lookAt, 520);

    runnerOverlay = createRunnerOverlay(root);
    runnerOverlay.canvas.style.pointerEvents = "auto";
    runnerOverlay.canvas.style.background = "transparent";

    const getVp = (): { cssW: number; cssH: number } => {
      const v = runnerOverlay!.getViewport();
      return { cssW: v.cssW, cssH: v.cssH };
    };
    const onExit = (): void => {
      endDeskMiniFromOverlay();
    };
    const words = picked.def.gameClueWords;

    if (kind === "envelope") {
      const session = new EnvelopeSession({
        overlayCtx: runnerOverlay.ctx,
        getOverlayViewport: getVp,
        targetWord: words.sticky,
        onExit,
      });
      session.attachPointer(runnerOverlay.canvas);
      deskMinigame = { kind: "envelope", session };
    } else if (kind === "reagent") {
      const session = new ReagentSession({
        overlayCtx: runnerOverlay.ctx,
        getOverlayViewport: getVp,
        clueToken: words.clock,
        onExit,
      });
      session.attachPointer(runnerOverlay.canvas);
      deskMinigame = { kind: "reagent", session };
    } else {
      const session = new LampSession({
        overlayCtx: runnerOverlay.ctx,
        getOverlayViewport: getVp,
        clueWord: words.photo,
        onExit,
      });
      session.attachPointer(runnerOverlay.canvas);
      deskMinigame = { kind: "lamp", session };
    }
    await runnerOverlay.fadeIn(220);
  }

  function startRunnerSession(mode: RunnerMode, now: number): void {
    void startRunnerSessionAsync(mode, now);
  }

  async function startRunnerSessionAsync(
    mode: RunnerMode,
    _now: number,
  ): Promise<void> {
    exitInspectZoom(200);
    mascotController.setFrozen(true);
    runnerSurfaceRestore?.();
    runnerSession?.dispose();
    runnerOverlay?.dispose();

    runnerOverlay = createRunnerOverlay(root);
    runnerUpdateMonitorTexture = true;
    runnerEndlessDeathTimer = 0;

    const camReturnPos = cameraRig.camera.position.clone();
    const camReturnLook = new THREE.Vector3();
    cameraRig.copyLookAtInto(camReturnLook);
    /** Saved before dolly so Esc during zoom-in still restores the rig. */
    runnerCamReturn = { pos: camReturnPos, look: camReturnLook };

    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    diorama.monitorScreen.updateMatrixWorld(true);
    diorama.monitorScreen.getWorldPosition(p);
    diorama.monitorScreen.getWorldDirection(n);
    const targetCam = p.clone().add(n.multiplyScalar(0.55));

    runnerSession = new RunnerSession({
      baseSeed: seed,
      mode,
      THREE,
      overlayCtx: runnerOverlay.ctx,
      getOverlayViewport: () => ({
        cssW: runnerOverlay!.canvas.clientWidth,
        cssH: runnerOverlay!.canvas.clientHeight,
      }),
      shouldUpdateMonitorTexture: () => runnerUpdateMonitorTexture,
      clueSet: deriveRunnerClueSet(picked),
      anomalyId: picked.def.id,
      clueTooltipHint: picked.def.tooltipHint,
    });
    const swap = swapMonitorScreenMap(
      diorama.monitorScreen,
      runnerSession.getTexture(),
    );
    runnerSurfaceRestore = swap.restore;
    hud.setStatusText(
      mode === "daily"
        ? "code run — Tab to jump · hold Right · Esc exit"
        : "endless run — Tab to jump · hold Right · Esc exit",
    );

    window.setTimeout(() => {
      if (!runnerOverlay) return;
      void runnerOverlay.fadeIn(220).then(() => {
        runnerUpdateMonitorTexture = false;
      });
    }, 380);

    await cameraRig.scriptedTo(targetCam, p, 600);
  }

  const monitorLaunchRay = new THREE.Raycaster();
  const monitorLaunchNdc = new THREE.Vector2();

  function maybeExitInspectFromPointer(
    _clientX: number,
    _clientY: number,
  ): void {
    if (!inspectZoomActive) return;
    exitInspectZoom(200);
  }

  renderer.domElement.addEventListener(
    "pointerdown",
    (e: PointerEvent) => {
      maybeExitInspectFromPointer(e.clientX, e.clientY);
      if (deskMinigame) return;
      const rect = renderer.domElement.getBoundingClientRect();
      monitorLaunchNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      monitorLaunchNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      monitorLaunchRay.setFromCamera(monitorLaunchNdc, cameraRig.camera);
      const hits = monitorLaunchRay.intersectObjects(
        diorama.hoverables as THREE.Object3D[],
        false,
      );
      const tag = hits[0]?.object.userData.tag;
      if (tag !== "monitor" && tag !== "monitor-screen") return;
      const now = performance.now();
      const p = state.phase;
      if (p.kind !== "investigating") return;
      const mode: RunnerMode = p.monitorDailyClear ? "endless" : "daily";
      if (!state.enterRunner(now, mode)) return;
      startRunnerSession(mode, now);
    },
    { passive: true },
  );

  renderer.domElement.addEventListener(
    "pointerdown",
    (e: PointerEvent) => {
      maybeExitInspectFromPointer(e.clientX, e.clientY);
      if (deskMinigame) return;
      const rect = renderer.domElement.getBoundingClientRect();
      monitorLaunchNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      monitorLaunchNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      monitorLaunchRay.setFromCamera(monitorLaunchNdc, cameraRig.camera);
      const hits = monitorLaunchRay.intersectObjects(
        diorama.hoverables as THREE.Object3D[],
        false,
      );
      const tag = hits[0]?.object.userData.tag;
      if (
        tag !== "evidence-envelope" &&
        tag !== "reagent-tray" &&
        tag !== "lamp"
      )
        return;
      const now = performance.now();
      if (state.phase.kind !== "investigating") return;
      if (tag === "evidence-envelope") void startDeskMini("envelope", now);
      else if (tag === "reagent-tray") void startDeskMini("reagent", now);
      else void startDeskMini("lamp", now);
    },
    { passive: true },
  );
  let lastHoverTag: string | null = null;
  let lastBlink: 0 | 1 = 1;

  const tmpFeet = new THREE.Vector3();
  const inspectReturnPos = new THREE.Vector3();
  const inspectReturnLook = new THREE.Vector3();
  const inspectAnomalyPos = new THREE.Vector3();
  const inspectCamPos = new THREE.Vector3();
  const inspectBox = new THREE.Box3();
  let inspectZoomActive = false;
  let inspectZoomCooldownUntil = 0;

  function anomalyInspectFraming(tag: string): {
    lerp: number;
    yLift: number;
    durationMs: number;
  } {
    if (tag === "lamp-shadow") {
      return { lerp: 0.28, yLift: 0.42, durationMs: 520 };
    }
    return { lerp: 0.52, yLift: 0.28, durationMs: 580 };
  }

  function endFlavorInspectNow(): void {
    if (flavorInspectTimer) {
      clearTimeout(flavorInspectTimer);
      flavorInspectTimer = null;
    }
    if (!flavorInspectReturn) return;
    const ret = flavorInspectReturn;
    flavorInspectReturn = null;
    hud.setInspectCaption(null);
    mascotController.setFrozen(false);
    void cameraRig.scriptedTo(ret.pos, ret.look, 380);
  }

  function startFlavorInspect(hitObject: THREE.Object3D): void {
    const tag = hitObject.userData.tag;
    if (typeof tag !== "string") return;
    const caption = applyPropFlavor(tag, diorama);
    if (caption == null) return;
    if (flavorInspectReturn) endFlavorInspectNow();
    mascotController.setFrozen(true);
    flavorInspectReturn = {
      pos: cameraRig.camera.position.clone(),
      look: new THREE.Vector3(),
    };
    cameraRig.copyLookAtInto(flavorInspectReturn.look);
    hud.setInspectCaption(`${caption} · Esc to exit`);
    hitObject.updateMatrixWorld(true);
    inspectBox.setFromObject(hitObject);
    inspectBox.getCenter(inspectAnomalyPos);
    inspectCamPos.lerpVectors(
      cameraRig.camera.position,
      inspectAnomalyPos,
      0.45,
    );
    inspectCamPos.y += 0.24;
    void cameraRig.scriptedTo(inspectCamPos, inspectAnomalyPos, 500);
    if (flavorInspectTimer) clearTimeout(flavorInspectTimer);
    flavorInspectTimer = window.setTimeout(() => {
      flavorInspectTimer = null;
      endFlavorInspectNow();
    }, 1200);
  }

  renderer.domElement.addEventListener(
    "pointerdown",
    (e: PointerEvent) => {
      maybeExitInspectFromPointer(e.clientX, e.clientY);
      if (flavorInspectReturn) {
        endFlavorInspectNow();
        return;
      }
      if (deskMinigame || runnerSession) return;
      if (state.phase.kind !== "investigating") return;
      const rect = renderer.domElement.getBoundingClientRect();
      monitorLaunchNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      monitorLaunchNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      monitorLaunchRay.setFromCamera(monitorLaunchNdc, cameraRig.camera);
      const hits = monitorLaunchRay.intersectObjects(
        diorama.hoverables as THREE.Object3D[],
        false,
      );
      const first = hits[0];
      if (!first?.object) return;
      const tag = first.object.userData.tag;
      if (typeof tag !== "string") return;
      if (tag === "monitor" || tag === "monitor-screen") return;
      if (
        tag === "evidence-envelope" ||
        tag === "reagent-tray" ||
        tag === "lamp"
      )
        return;
      if (tag === picked.def.targetTag) return;
      if (!isFlavorTag(tag)) return;
      startFlavorInspect(first.object);
    },
    { passive: true },
  );

  function exitInspectZoom(durationMs: number): void {
    if (!inspectZoomActive) return;
    inspectZoomActive = false;
    inspectZoomCooldownUntil = performance.now() + 800;
    hud.setInspectCaption(null);
    mascotController.setFrozen(false);
    void cameraRig.scriptedTo(inspectReturnPos, inspectReturnLook, durationMs);
  }

  function placeMascotAtDefaultDesk(deskTopY: number): void {
    mascot.group.position.set(
      0.4,
      deskTopY + MASCOT_FEET_OFFSET * MASCOT_GAME_SCALE,
      0.4,
    );
    mascotController.resetAt(mascot.group.position.clone(), 0);
  }

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
        showResults(phase.score, phase.correct, 4, phase.elapsedMs);
      };
      if (showOutro) {
        void showStreakOutro(document.body, streak).then(proceed);
      } else {
        proceed();
      }
      // Persist correct submissions to the worker (best-effort, no UI block).
      if (phase.correct) {
        void postScore({
          date: targetDate,
          score: phase.score,
          cluesUsed: 4,
          elapsedMs: phase.elapsedMs,
          name: readPlayerName(),
          gameScoresDetail: formatGameScoresDetail(phase.breakdown),
        }).then((res) => {
          if (res)
            console.info(`[bug-detective] posted score, rank=${res.rank}`);
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
    window.open(
      tweetIntent(lastResults.score, targetDate),
      "_blank",
      "noopener",
    );
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
    hud.hideTimer();
    hud.setNotebook({});
    hud.onMakeTheCall(() => enterAnsweringNow(performance.now()));
    hud.setStatusText("find the bug — hover to investigate");
    resultsPanel.hide();
    answerPanel.hide();
    countdown.stop();
    lastResults = null;
  }

  function enterAnsweringNow(now: number): void {
    exitInspectZoom(280);
    if (!state.enterAnswering(now)) return;
    sfxSubmit();
    hud.setStatusText("which one is the bug?");
    if (state.phase.kind !== "answering") return;
    const nb = state.phase.notebook;
    const ev = [nb.runner, nb.sticky, nb.clock, nb.photo]
      .map((p) => p?.clueToken.toUpperCase())
      .filter(Boolean)
      .join(" · ");
    answerPanel.show(
      "Make the call — which anomaly is live?",
      picked.choices,
      ev,
    );
  }

  function restartRound(): void {
    // Always tear down runner / desk overlay. A lingering canvas (e.g. after a
    // desk mini fade-out) must not block the next round or the results panel.
    disposeRunnerVisuals();
    // Daily-case integrity: by default, restart replays the SAME daily
    // anomaly. The `?seed=` URL override is the dev-only escape hatch
    // that bumps the seed each restart so iteration through the anomaly
    // pool is fast.
    if (seedOverride !== null) {
      seed = (seed + 1) >>> 0;
    }
    // Reset the diorama by swapping in a fresh one. Simple and bulletproof.
    scene.remove(diorama.root);
    const fresh = createDesktopDiorama();
    Object.assign(diorama, fresh);
    scene.add(fresh.root);
    // Re-bind cursor tracker to the new desk mesh.
    cursorTracker.setTarget(fresh.desk);
    syncCursorDeskNav(fresh);
    // Recenter the mascot on the new desk. Without this, the mascot would
    // stay wherever the cursor was when "play again" fired (often off-desk
    // or under the results panel), which made it look like the mascot
    // disappeared after restart.
    inspectZoomActive = false;
    mascotController.setFrozen(false);
    placeMascotAtDefaultDesk(fresh.deskTopY);
    // Re-pick anomaly + apply (same seed → same anomaly, by design).
    picked = pickAnomaly(seed);
    picked.def.apply(diorama);
    console.info(
      `[bug-detective] restart seed=${seed} anomaly=${picked.def.id}`,
    );
    startInvestigating(performance.now());
  }

  // ---- Wow opener choreography (Day 6) -------------------------------
  // Sequence after the player has had time to read the case file + presses
  // Space / Enter / click (minimum dwell MIN_CASE_READ_MS):
  //   1. Mascot tilts up + jumps slightly (cursor "noticing" something).
  //   2. Page peel begins (vertex shader rolls bottom edge upward).
  //   3. Camera dollies from intro pose to gameplay pose CONCURRENTLY.
  //   4. Diorama becomes visible mid-dolly; mascot feet stay on the desk
  //      surface while scale ramps (no "buried in the desk" frame).
  //   5. Cursor tracker switches target to desk; landing bounce + HUD.
  //   6. State transitions to investigating (untimed round).
  const MIN_CASE_READ_MS = 3200; // minimum time on case file before peel can start
  const PEEL_BEGIN_MS = 200; // delay between mascot reaction and peel start
  const DOLLY_DURATION_MS = 2200; // total camera dolly time (ease-in-out cubic)
  const REVEAL_AT_PROGRESS = 0.4; // make diorama visible mid-dolly

  type IntroStep =
    | "waiting" // case file visible; wait for read time + confirm
    | "reacting" // mascot tilts/jumps before peel
    | "peeling" // peel + dolly running concurrently
    | "landing" // mascot scales up + lands on desk
    | "done";

  let introStep: IntroStep = "waiting";
  let introStepStartedAt = 0;
  let dollyStarted = false;
  let dioramaRevealed = false;
  let introAckPointer = false;
  let caseFileCtaShown = false;
  let mascotIntroSpawnedOnDesk = false;
  const introLandingFeet = new THREE.Vector3();
  const caseFileCta = document.createElement("div");
  caseFileCta.id = "bd-casefile-cta";
  caseFileCta.setAttribute("role", "status");
  caseFileCta.setAttribute("aria-live", "polite");
  caseFileCta.textContent =
    "Press Space, Enter, or click anywhere to lift the page";
  caseFileCta.style.cssText =
    "position:fixed;left:50%;bottom:32px;transform:translateX(-50%);max-width:min(92vw,520px);padding:12px 22px;border-radius:12px;background:rgba(26,24,18,0.88);color:#efe7d7;border:1px solid rgba(245,78,0,0.45);font:600 14px 'Cursor Gothic',ui-sans-serif,sans-serif;letter-spacing:0.03em;text-align:center;opacity:0;pointer-events:none;transition:opacity 650ms ease;z-index:60;box-shadow:0 8px 28px rgba(0,0,0,0.45)";
  root.appendChild(caseFileCta);
  renderer.domElement.addEventListener("pointerdown", () => {
    if (state.phase.kind === "intro" && introStep === "waiting") {
      introAckPointer = true;
    }
  });

  function setIntroStep(step: IntroStep, now: number): void {
    introStep = step;
    introStepStartedAt = now;
  }

  function tickIntroChoreography(now: number, dtSec: number): void {
    switch (introStep) {
      case "waiting": {
        // Advance to "reacting" is driven from the main frame loop once the
        // minimum read time has passed and the player confirms (see frame()).
        break;
      }
      case "reacting": {
        // Mascot stays hidden until the desk is revealed — no tilt/bounce here.
        if (now - introStepStartedAt > PEEL_BEGIN_MS) {
          pagePeel.start();
          sfxPeelTear();
          // Fire and forget; we poll `cameraRig.isDollying()` from the
          // peeling case to know when to hand off to landing.
          void cameraRig.scriptedTo(
            GAME_CAMERA_POS,
            GAME_CAMERA_LOOKAT,
            DOLLY_DURATION_MS,
          );
          dollyStarted = true;
          setIntroStep("peeling", now);
        }
        break;
      }
      case "peeling": {
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
        // First time the desk is visible: spawn the mascot off-frame and let
        // the landing step walk it to the default spot.
        if (dioramaRevealed && !mascotIntroSpawnedOnDesk) {
          mascotIntroSpawnedOnDesk = true;
          mascot.group.scale.setScalar(MASCOT_GAME_SCALE);
          mascot.group.position.set(
            2.6,
            diorama.deskTopY + MASCOT_FEET_OFFSET * MASCOT_GAME_SCALE,
            0.6,
          );
          mascotController.resetAt(mascot.group.position.clone(), 0);
          mascot.group.visible = true;
          mascotController.setFrozen(false);
          cursorTracker.setTarget(diorama.desk);
          cursorTracker.setYOffset(MASCOT_FEET_OFFSET * MASCOT_GAME_SCALE);
          syncCursorDeskNav(diorama);
        }
        // Once both peel and dolly are done, move to landing (walk-in).
        if (pagePeel.done && !cameraRig.isDollying()) {
          if (!mascotIntroSpawnedOnDesk) {
            diorama.root.visible = true;
            dioramaRevealed = true;
            mascotIntroSpawnedOnDesk = true;
            mascot.group.scale.setScalar(MASCOT_GAME_SCALE);
            mascot.group.position.set(
              2.6,
              diorama.deskTopY + MASCOT_FEET_OFFSET * MASCOT_GAME_SCALE,
              0.6,
            );
            mascotController.resetAt(mascot.group.position.clone(), 0);
            mascot.group.visible = true;
            mascotController.setFrozen(false);
          }
          cursorTracker.setTarget(diorama.desk);
          cursorTracker.setYOffset(MASCOT_FEET_OFFSET * MASCOT_GAME_SCALE);
          syncCursorDeskNav(diorama);
          cursorTracker.attach(renderer.domElement);
          cursorTracker.refreshLayout();
          setIntroStep("landing", now);
        }
        break;
      }
      case "landing": {
        // Walk-in is driven by mascotController.step in frame(); finish when
        // close to the home spot or after a long fallback.
        const landY = diorama.deskTopY + MASCOT_FEET_OFFSET * MASCOT_GAME_SCALE;
        introLandingFeet.set(0.4, landY, 0.4);
        const dx = mascot.group.position.x - introLandingFeet.x;
        const dz = mascot.group.position.z - introLandingFeet.z;
        const close = Math.hypot(dx, dz) < 0.09;
        const elapsed = now - introStepStartedAt;
        if ((close && elapsed > 400) || elapsed > 4200) {
          mascot.setTilt(0);
          mascot.setStride(0, 0);
          pagePeel.mesh.visible = false;
          caseFileCta.remove();
          hud.element.style.display = "block";
          settings.setVisible(true);
          postFx.setBloomEnabled(true);
          placeMascotAtDefaultDesk(diorama.deskTopY);
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

  function maybeBeginIntroExit(now: number, dtSec: number): void {
    // Drives the choreography state machine. State.phase stays in "intro"
    // until the landing step calls startInvestigating().
    tickIntroChoreography(now, dtSec);
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
      pagePeel.mesh.scale.set(
        newW / introPlaneWidth,
        newH / introPlaneHeight,
        1,
      );
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

    if (state.phase.kind === "intro" && introStep === "waiting") {
      if (mascot.group.visible) {
        cursorTracker.updateFeetTarget();
        if (cursorTracker.hasFeetHit) {
          cursorTracker.copyFeetWorldTo(tmpFeet);
          const a = 1 - Math.exp(-18 * dtSec);
          mascot.group.position.lerp(tmpFeet, a);
        }
      }
      mascot.setStride(0, 0);
    } else if (state.phase.kind === "intro" && introStep === "landing") {
      const landY = diorama.deskTopY + MASCOT_FEET_OFFSET * MASCOT_GAME_SCALE;
      introLandingFeet.set(0.4, landY, 0.4);
      const walk = mascotController.step(introLandingFeet, dtSec, now);
      mascot.setStride(walk.stridePhase01, walk.strideIntensity);
    } else if (state.phase.kind === "runner") {
      if (runnerSession && runnerOverlay) {
        const mode = runnerSession.mode;
        if (input.consumePress(Action.MenuBack)) {
          if (runnerSession.isGameOver()) {
            runnerSession.exitFromGameOverToDesktop();
          } else {
            void endRunnerSessionAsync(now).then(() => {
              state.returnToInvestigatingFromRunner({});
              hud.setStatusText("find the bug — hover to investigate");
            });
          }
        } else if (runnerSession.isGameOver()) {
          if (mode === "endless") {
            runnerEndlessDeathTimer += dtSec;
            if (runnerEndlessDeathTimer >= 1.5) {
              runnerSession.restartSameMode();
              runnerEndlessDeathTimer = 0;
            }
            if (input.consumePress(Action.RunnerRetry)) {
              runnerSession.restartSameMode();
              runnerEndlessDeathTimer = 0;
            }
          } else {
            runnerEndlessDeathTimer = 0;
            if (input.consumePress(Action.RunnerRetry)) {
              runnerSession.restartSameMode();
            }
          }
          const progress =
            mode === "endless" ? Math.min(1, runnerEndlessDeathTimer / 1.5) : 0;
          runnerSession.step(dtSec, false, false, {
            restartProgress01: progress,
          });
        } else {
          runnerEndlessDeathTimer = 0;
          const jump = input.consumePress(Action.RunnerJump);
          const wantBoost = input.isDown(Action.RunnerBoost);
          runnerSession.step(dtSec, jump, wantBoost);
        }

        const out = runnerSession.getOutcome();
        if (out) {
          const captured = out;
          const peakM = Math.floor(runnerSession.getPeakHeightM());
          void endRunnerSessionAsync(now).then(() => {
            if (captured.kind === "daily_clear") {
              const gs = Math.min(1000, peakM * 5);
              if (state.phase.kind === "runner") {
                state.pinNotebookPage("runner", {
                  clueToken: picked.def.gameClueWords.runner.toUpperCase(),
                  gameScore: gs,
                  solvedAtMs: performance.now(),
                });
              }
              const phase = state.returnToInvestigatingFromRunner({
                monitorDailyClear: true,
              });
              sfxClueFound();
              if (phase) hud.setNotebook(phase.notebook);
              hud.setStatusText(
                `monitor evidence · ${picked.def.gameClueWords.runner.toUpperCase()}`,
              );
            } else if (captured.kind === "daily_fail") {
              state.returnToInvestigatingFromRunner({});
              hud.setStatusText("find the bug — hover to investigate");
            } else {
              state.returnToInvestigatingFromRunner({
                monitorDailyClear: true,
              });
              hud.setStatusText(
                `endless over — best ${captured.score} · click monitor to replay`,
              );
              void postScore(
                {
                  date: targetDate,
                  score: Math.floor(captured.score),
                  cluesUsed: 0,
                  elapsedMs:
                    state.phase.kind === "investigating"
                      ? Math.floor(performance.now() - state.phase.startedAt)
                      : 0,
                  name: readPlayerName(),
                },
                RUNNER_PUZZLE_ID,
              ).then((res) => {
                if (!res) return;
                hud.setStatusText(
                  `endless over — rank ${res.rank} · click monitor to replay`,
                );
              });
            }
          });
        }
      }
      mascot.setStride(0, 0);
    } else if (state.phase.kind === "investigating" && deskMinigame) {
      deskMinigame.session.step(dtSec);
      // Esc / MenuBack: handled inside each desk session (tutorial gate vs exit).
      const out = deskMinigame.session.getOutcome();
      if (out) {
        const kind = deskMinigame.kind;
        const slot =
          kind === "envelope"
            ? "sticky"
            : kind === "reagent"
              ? "clock"
              : "photo";
        state.pinNotebookPage(slot, {
          clueToken: out.clueToken,
          gameScore: out.score,
          solvedAtMs: now,
        });
        if (state.phase.kind === "investigating") {
          hud.setNotebook(state.phase.notebook);
        }
        sfxClueFound();
        endDeskMiniFromOverlay();
      }
      mascot.setStride(0, 0);
    } else if (state.phase.kind === "investigating") {
      if (input.consumePress(Action.MenuBack)) {
        if (inspectZoomActive) exitInspectZoom(420);
        else endFlavorInspectNow();
      }
      cursorTracker.updateFeetTarget();
      const hasFeet = cursorTracker.hasFeetHit;
      if (hasFeet) cursorTracker.copyFeetWorldTo(tmpFeet);

      const hover = hud.update(cameraRig.camera);
      diorama.setDeskHighlight(hover.tag);
      const isAnomalyTarget =
        hover.tag !== null && hover.tag === picked.def.targetTag;

      if (
        isAnomalyTarget &&
        hover.object &&
        !inspectZoomActive &&
        now >= inspectZoomCooldownUntil
      ) {
        inspectZoomActive = true;
        mascotController.setFrozen(true);
        cameraRig.copyLookAtInto(inspectReturnLook);
        inspectReturnPos.copy(cameraRig.camera.position);
        hover.object.updateMatrixWorld(true);
        inspectBox.setFromObject(hover.object);
        inspectBox.getCenter(inspectAnomalyPos);
        const { lerp, yLift, durationMs } = anomalyInspectFraming(
          picked.def.targetTag,
        );
        inspectCamPos.lerpVectors(
          cameraRig.camera.position,
          inspectAnomalyPos,
          lerp,
        );
        inspectCamPos.y += yLift;
        void cameraRig.scriptedTo(inspectCamPos, inspectAnomalyPos, durationMs);
        if (hover.tag === "lamp-shadow") {
          hud.setInspectCaption(
            "Shadow — does it point the right way? Esc to exit",
          );
        } else {
          hud.setInspectCaption("Inspecting — Esc to exit");
        }
      } else if (!isAnomalyTarget && inspectZoomActive) {
        exitInspectZoom(420);
      }

      const stepTarget = inspectZoomActive ? null : hasFeet ? tmpFeet : null;
      const walk = mascotController.step(stepTarget, dtSec, now);
      mascot.setStride(walk.stridePhase01, walk.strideIntensity);

      if (hover.tag) {
        const hint = friendlyTagName(hover.tag);
        hud.setHover(hover.tag, hint);
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

      if (input.consumePress(Action.Submit)) {
        enterAnsweringNow(now);
      }
    } else {
      mascot.setStride(0, 0);
    }

    if (state.phase.kind === "intro" || state.phase.kind === "investigating") {
      mascot.faceCamera(cameraRig.camera);
    }
    pagePeel.update(dtSec);

    const blinkPhase = (elapsed % 4.2) / 4.2;
    const wantBlink: 0 | 1 = blinkPhase > 0.95 ? 0 : 1;
    if (wantBlink !== lastBlink) {
      mascot.setBlink(wantBlink);
      lastBlink = wantBlink;
    }

    // Global Mute toggle.
    if (input.consumePress(Action.Mute)) {
      toggleMute();
    }

    // ---- Phase-driven update ----
    switch (state.phase.kind) {
      case "intro": {
        if (introStep === "waiting") {
          const readElapsed = now - caseFileIntroStartMs;
          if (readElapsed >= MIN_CASE_READ_MS && !caseFileCtaShown) {
            caseFileCtaShown = true;
            caseFileCta.style.opacity = "1";
          }
          const canPeel =
            readElapsed >= MIN_CASE_READ_MS &&
            (introAckPointer || input.consumePress(Action.MenuConfirm));
          if (canPeel) {
            introAckPointer = false;
            caseFileCta.style.opacity = "0";
            setIntroStep("reacting", now);
            cursorTracker.detach();
          }
        }
        maybeBeginIntroExit(now, dtSec);
        break;
      }
      case "investigating":
        break;
      case "runner":
        break;
      case "answering":
        // Answer panel covers the canvas — no need to raycast hover or
        // update the loupe; the panel owns input.
        break;
      case "results":
        // Results card covers the canvas. Restart: R, Enter, or Esc (not Space —
        // Space is used elsewhere and would be too easy to hit by accident).
        if (
          input.consumePress(Action.Restart) ||
          input.consumePress(Action.Submit) ||
          input.consumePress(Action.MenuBack)
        ) {
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
    caseFileCta.remove();
    pagePeel.mesh.visible = false;
    diorama.root.visible = true;
    cameraRig.setStatic(GAME_CAMERA_POS, GAME_CAMERA_LOOKAT);
    cursorTracker.setTarget(diorama.desk);
    cursorTracker.setYOffset(MASCOT_FEET_OFFSET * MASCOT_GAME_SCALE);
    syncCursorDeskNav(diorama);
    cursorTracker.refreshLayout();
    mascot.group.visible = true;
    mascot.group.scale.setScalar(MASCOT_GAME_SCALE);
    mascotController.setFrozen(false);
    placeMascotAtDefaultDesk(diorama.deskTopY);
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
    // Pointer/Touch both expose clientX/clientY natively, so the handler
    // accepts a minimal structural type and skips runtime guards/casts.
    let clearTimer: ReturnType<typeof setTimeout> | null = null;
    const onTap = (p: { clientX: number; clientY: number }): void => {
      const rect = renderer.domElement.getBoundingClientRect();
      cursorTracker.setMouse(p.clientX - rect.left, p.clientY - rect.top);
      // Schedule a one-shot clear so the held hover doesn't keep ticking
      // up the clue counter forever. setTimeout (vs setInterval) means
      // we don't wake every 200ms on idle.
      if (clearTimer !== null) clearTimeout(clearTimer);
      clearTimer = setTimeout(() => {
        cursorTracker.setMouse(-9999, -9999); // off-canvas → no hit
        clearTimer = null;
      }, HOVER_HOLD_MS);
    };
    renderer.domElement.addEventListener("pointerdown", onTap, {
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
  }

  requestAnimationFrame(frame);

  function friendlyTagName(tag: string): string {
    switch (tag) {
      case "monitor":
      case "monitor-screen":
        return "monitor";
      case "evidence-envelope":
        return "evidence envelope";
      case "reagent-tray":
        return "reagent tray";
      case "lamp":
        return "lamp";
      case "lamp-shadow":
        return "shadow";
      case "coffee-steam":
        return "steam";
      case "photo":
        return "photo";
      case "calendar":
        return "calendar";
      case "mug":
        return "mug";
      case "pen":
        return "pen";
      case "book":
        return "book";
      case "keyboard":
        return "keyboard";
      case "plant":
        return "plant";
      case "desk":
        return "desk";
      default:
        return tag;
    }
  }
} // end bootGameInner
