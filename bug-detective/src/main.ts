import "./style.css";
import * as THREE from "three";
import { createSceneBundle, WebGLUnsupportedError } from "./three/createScene";
import { CameraRig } from "./three/cameraRig";
import { createMascotMesh } from "./cursor/mascotMesh";
import { MascotController } from "./cursor/mascotController";
import { createDesktopDiorama } from "./scene/desktopDiorama";
import {
  applyPropFlavor,
  preferredDeskHoverHit,
} from "./scene/propInteractions";
import {
  canDispatchDuringDeskInspect,
  routeDeskInteractionTag,
} from "./scene/deskInteractionRouting";
import { CursorTracker } from "./intro/cursorTracker";
import { createPagePeel, type PagePeel } from "./intro/pagePeel";
import { showCaseFileModal } from "./ui/caseFileModal";
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
import { createPostFx } from "./three/postFx";
import {
  type AmbientContext,
  setAmbientContext,
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
import { formatGameScoresDetail, GAME_SCORE_LABEL } from "./game/score";
import {
  clearSessionScores,
  getSessionScoreboardView,
  recordMinigameScore,
  recordRunnerEndlessClimb,
} from "./game/sessionScoreboard";
import { GameState, assertNever, type RunnerMode } from "./game/gameState";
import { SentenceSession } from "./minigames/sentence/sentenceSession";
import { ErrandSession } from "./minigames/errand/errandSession";
import { TamperSession } from "./minigames/tamper/tamperSession";
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
import { tryMountRunnerTutorialGate } from "./ui/runnerTutorialGate";
import { recordRound, showStreakOutro } from "./ui/streakOutro";
import {
  buildExitUrl,
  buildReturnUrl,
  createExitPortal,
  createReturnPortal,
  parsePortalParams,
  PORTAL_TAG_EXIT,
  PORTAL_TAG_RETURN,
  type PortalHandle,
} from "./scene/portal";

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
// Vibe Jam 2026 portal protocol: ?portal=true means another game just
// flung the player here through the Vibeverse. Per spec, drop straight
// into the desk view (no splash, no peel) and place a return portal.
// Stored params are forwarded onto exit-portal navigation, both back to
// the source game (via `ref`) and forward to the Vibe Jam hub.
const PORTAL_BOOT = parsePortalParams(queryParams);

if (queryParams.get("mobile") === "1" || isMobile()) {
  // Mobile users get a dismissable card explaining the desktop trade-off
  // and a "Play simplified" button. The gate's promise resolves only
  // when they pick "Play simplified"; copy/share keep the gate up by
  // design. The mobile gate fires BEFORE the portal-arrival skip-splash
  // path so narrow+touch devices still see the desktop-only message.
  void mountMobileGate(root).then(() => bootGame({ simplified: true }));
} else if (PORTAL_BOOT.arrivedViaPortal || isSkipIntro()) {
  // Portal arrival OR returning visitor who opted in to "Skip intro" in
  // Settings: boot the game immediately. WebAudio resumes on the first
  // hover/click during investigation. Portal arrivals also skip the
  // page-peel intro per the vibej.am spec ("instantly drop into desk").
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
  // Expose a tiny debug probe used by the headless playtest to locate
  // each launchable prop on screen. Cheap to keep in production — only
  // runs when a tester pokes window.__bdProbe() in DevTools.
  // (The implementation needs cameraRig + diorama + renderer in scope, so
  // we install it after those are constructed below.)

  const cameraRig = new CameraRig(
    root.clientWidth / Math.max(root.clientHeight, 1),
  );
  // Camera must live in the scene graph so RenderPass(scene, camera) traverses
  // camera children (e.g. the intro page-peel mesh parented under the camera).
  scene.add(cameraRig.camera);

  // Game-time camera pose (used during investigation phase).
  const GAME_CAMERA_POS = new THREE.Vector3(3.2, 2.4, 5.2);
  const GAME_CAMERA_LOOKAT = new THREE.Vector3(-0.2, 0.3, -0.4);
  const INVEST_DEFAULT_CAMERA_DIST =
    GAME_CAMERA_POS.distanceTo(GAME_CAMERA_LOOKAT);
  /**
   * Investigation desk zoom: exactly two levels on the same view ray — default
   * wide framing and one closer "detail" step (no continuous dolly).
   */
  const INVEST_ZOOM_TIGHT_DIST = Math.max(
    2.35,
    INVEST_DEFAULT_CAMERA_DIST * 0.55,
  );
  const tmpWheelAnchor = new THREE.Vector3();
  const tmpDirScratch = new THREE.Vector3();

  const diorama = createDesktopDiorama();

  // Headless-playtest debug probe: returns the on-screen pixel coords of
  // each launchable prop as projected by the current camera. Stays harmless
  // in production — only fires when DevTools (or an automated test) calls
  // `window.__bdProbe()`.
  // Headless-playtest ray probe: returns the top-3 hoverable hits at the
  // given client (x, y) so a tester can debug "why did this prop swallow
  // my click?" cases.
  (
    window as unknown as { __bdRayProbe?: (x: number, y: number) => unknown }
  ).__bdRayProbe = (
    x: number,
    y: number,
  ): Array<{ tag: string; distance: number }> => {
    const r = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((x - r.left) / r.width) * 2 - 1,
      -((y - r.top) / r.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, cameraRig.camera);
    const hits = ray.intersectObjects(
      diorama.hoverables as THREE.Object3D[],
      true,
    );
    // Keep a short list for DevTools; deeper stacks are exposed via
    // `__bdResolveAllHovers` for automated hover mapping.
    return hits.slice(0, 200).map((h) => ({
      tag: String(h.object.userData.tag ?? "?"),
      distance: Number(h.distance.toFixed(3)),
    }));
  };

  /** Grid-scan the WebGL canvas for the first pixel whose top ray hit matches each tag (robust across browsers / camera poses). */
  (
    window as unknown as {
      __bdResolveAllHovers?: () => Record<
        string,
        { x: number; y: number } | null
      >;
    }
  ).__bdResolveAllHovers = (): Record<
    string,
    { x: number; y: number } | null
  > => {
    const checklistTags = [
      "calendar",
      "mug",
      "reagent-tray",
      "monitor-screen",
      "case-file",
      "evidence-envelope",
      "coffee-steam",
      "keyboard",
      "lamp",
      "desk",
    ] as const;
    const remaining = new Set<string>(checklistTags);
    const out: Record<string, { x: number; y: number } | null> = {};
    for (const t of checklistTags) out[t] = null;
    const r = renderer.domElement.getBoundingClientRect();
    const hitsAt = (x: number, y: number): readonly { tag: string }[] => {
      if (
        x <= r.left + 1 ||
        x >= r.right - 1 ||
        y <= r.top + 1 ||
        y >= r.bottom - 1
      )
        return [];
      const ndc = new THREE.Vector2(
        ((x - r.left) / r.width) * 2 - 1,
        -((y - r.top) / r.height) * 2 + 1,
      );
      const rc = new THREE.Raycaster();
      rc.setFromCamera(ndc, cameraRig.camera);
      const hits = rc.intersectObjects(
        diorama.hoverables as THREE.Object3D[],
        true,
      );
      const pref = preferredDeskHoverHit(hits);
      const mapped: { tag: string }[] = [];
      if (pref) mapped.push({ tag: String(pref.object.userData.tag ?? "?") });
      for (const h of hits) {
        if (h === pref) continue;
        mapped.push({ tag: String(h.object.userData.tag ?? "?") });
        if (mapped.length >= 200) break;
      }
      return mapped;
    };
    const verify = (pt: { x: number; y: number }, want: string): boolean =>
      hitsAt(pt.x, pt.y).some((e) => e.tag === want);
    const refineTop = (
      x0: number,
      y0: number,
      want: string,
    ): { x: number; y: number } | null => {
      for (let d = 0; d <= 22; d += 1) {
        for (let ox = -d; ox <= d; ox++) {
          for (let oy = -d; oy <= d; oy++) {
            if (Math.max(Math.abs(ox), Math.abs(oy)) !== d && d > 0) continue;
            const x = x0 + ox;
            const y = y0 + oy;
            if (hitsAt(x, y)[0]?.tag === want) {
              return { x: Math.round(x), y: Math.round(y) };
            }
          }
        }
      }
      return null;
    };
    const refineInTop3 = (
      x0: number,
      y0: number,
      want: string,
    ): { x: number; y: number } | null => {
      for (let d = 0; d <= 18; d += 1) {
        for (let ox = -d; ox <= d; ox++) {
          for (let oy = -d; oy <= d; oy++) {
            if (Math.max(Math.abs(ox), Math.abs(oy)) !== d && d > 0) continue;
            const x = x0 + ox;
            const y = y0 + oy;
            const h = hitsAt(x, y);
            if (h.some((e) => e.tag === want)) {
              return { x: Math.round(x), y: Math.round(y) };
            }
          }
        }
      }
      return null;
    };
    const step = 2;
    for (let y = r.top + 2; y < r.bottom - 2 && remaining.size > 0; y += step) {
      for (
        let x = r.left + 2;
        x < r.right - 2 && remaining.size > 0;
        x += step
      ) {
        const hits = hitsAt(x, y);
        for (const want of checklistTags) {
          if (!remaining.has(want)) continue;
          if (!hits.some((h) => h.tag === want)) continue;
          const refined = refineTop(x, y, want) ??
            refineInTop3(x, y, want) ?? { x: Math.round(x), y: Math.round(y) };
          if (!verify(refined, want)) continue;
          out[want] = refined;
          remaining.delete(want);
        }
      }
    }
    const fineStep = 1;
    for (const want of checklistTags) {
      if (!remaining.has(want)) continue;
      outer: for (let y = r.top + 1; y < r.bottom - 1; y += fineStep) {
        for (let x = r.left + 1; x < r.right - 1; x += fineStep) {
          const h = hitsAt(x, y);
          if (h[0]?.tag === want || h.some((e) => e.tag === want)) {
            const cand = refineTop(x, y, want) ??
              refineInTop3(x, y, want) ?? {
                x: Math.round(x),
                y: Math.round(y),
              };
            if (!verify(cand, want)) continue;
            out[want] = cand;
            remaining.delete(want);
            break outer;
          }
        }
      }
    }
    return out;
  };

  /** Spiral search from each prop's projected seed so automated tests hit the intended mesh when centroids overlap (mug vs steam, etc.). */
  (
    window as unknown as {
      __bdHoverResolve?: (
        tags: readonly string[],
      ) => Record<string, { x: number; y: number } | null>;
    }
  ).__bdHoverResolve = (tags: readonly string[]) => {
    const probeFn = (
      window as unknown as {
        __bdProbe?: () => Record<string, { x: number; y: number }>;
      }
    ).__bdProbe;
    const ray = (
      window as unknown as {
        __bdRayProbe?: (
          x: number,
          y: number,
        ) => Array<{ tag: string; distance: number }>;
      }
    ).__bdRayProbe;
    const out: Record<string, { x: number; y: number } | null> = {};
    if (!probeFn || !ray) {
      for (const t of tags) out[t] = null;
      return out;
    }
    const pts = probeFn();
    const r = renderer.domElement.getBoundingClientRect();
    const find = (tag: string): { x: number; y: number } | null => {
      const seed = pts[`hit_${tag}`];
      if (!seed) return null;
      const tryPt = (x: number, y: number): { x: number; y: number } | null => {
        if (
          x <= r.left + 1 ||
          x >= r.right - 1 ||
          y <= r.top + 1 ||
          y >= r.bottom - 1
        )
          return null;
        const top = ray(x, y)[0]?.tag;
        return top === tag ? { x: Math.round(x), y: Math.round(y) } : null;
      };
      for (let ox = -120; ox <= 120; ox += 6) {
        for (let oy = -120; oy <= 120; oy += 6) {
          const hit = tryPt(seed.x + ox, seed.y + oy);
          if (hit) return hit;
        }
      }
      const maxR = Math.min(r.width, r.height) * 0.32;
      let angle = 0;
      let radius = 0;
      const step = 2.2;
      while (radius <= maxR) {
        const x = seed.x + Math.cos(angle) * radius;
        const y = seed.y + Math.sin(angle) * radius;
        const hit = tryPt(x, y);
        if (hit) return hit;
        angle += 0.45;
        radius += step * 0.07;
      }
      return null;
    };
    for (const t of tags) {
      out[t] = find(t);
    }
    return out;
  };

  (window as unknown as { __bdProbe?: () => unknown }).__bdProbe = (): Record<
    string,
    { x: number; y: number }
  > => {
    const camera = cameraRig.camera;
    const r = renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector3();
    const project = (obj: THREE.Object3D): { x: number; y: number } => {
      obj.updateMatrixWorld(true);
      obj.getWorldPosition(v);
      v.project(camera);
      return {
        x: Math.round(((v.x + 1) / 2) * r.width + r.left),
        y: Math.round(((-v.y + 1) / 2) * r.height + r.top),
      };
    };
    const out: Record<string, { x: number; y: number }> = {
      monitor: project(diorama.monitorScreen),
      envelope: project(diorama.evidenceEnvelopeRoot),
      reagent: project(diorama.reagentTray),
      lamp: project(diorama.lamp),
      portal_exit: project(exitPortal.group),
    };
    if (returnPortal) out.portal_return = project(returnPortal.group);
    // Project the centroid of every hoverable that carries one of the
    // launcher tags so the headless playtest can find a definitive
    // on-screen pixel for each clickable prop. Use bounding-box center
    // since the group origin may not match the visible mesh center.
    const checklistTags = new Set([
      "calendar",
      "mug",
      "reagent-tray",
      "monitor-screen",
      "case-file",
      "evidence-envelope",
      "coffee-steam",
      "keyboard",
      "lamp",
      "desk",
      "monitor",
    ]);
    const box = new THREE.Box3();
    const center = new THREE.Vector3();
    for (const obj of diorama.hoverables) {
      const tag = obj.userData.tag as string | undefined;
      if (!tag || !checklistTags.has(tag)) continue;
      obj.updateMatrixWorld(true);
      box.setFromObject(obj);
      box.getCenter(center);
      const camera = cameraRig.camera;
      const r = renderer.domElement.getBoundingClientRect();
      center.project(camera);
      const x = Math.round(((center.x + 1) / 2) * r.width + r.left);
      const y = Math.round(((-center.y + 1) / 2) * r.height + r.top);
      const key = `hit_${tag}`;
      // First-found wins (some tags repeat: monitor bezel + screen).
      if (!out[key]) out[key] = { x, y };
    }
    return out;
  };
  diorama.root.visible = false; // hidden during the page-peel intro
  scene.add(diorama.root);

  // ---- Vibe Jam 2026 portal --------------------------------------------
  // Always show the EXIT portal so anyone visiting can hop to the Vibe Jam
  // hub. The RETURN portal is added only when the player arrived via
  // ?portal=true (per the spec, the source game's host comes in on `ref`).
  const portalArrived = PORTAL_BOOT.arrivedViaPortal;
  const exitPortal: PortalHandle = createExitPortal(scene);
  // Portal must be hidden during the page-peel intro otherwise it
  // appears as a floating ring in front of the lifted page. Skip-intro
  // and portal-arrival paths set this back to visible below.
  exitPortal.group.visible = false;
  let returnPortal: PortalHandle | null = null;
  if (portalArrived) {
    const refHost = PORTAL_BOOT.stored.ref ?? "";
    if (refHost) {
      returnPortal = createReturnPortal(scene, refHost);
    }
  }

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
  // Fullscreen peel is parented to the camera so it stays viewport-locked
  // while the intro camera dollies; a world-fixed plane would slide off-screen
  // past the desk props.
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
  pagePeel.mesh.position.set(0, 0, -INTRO_CAMERA_Z);
  cameraRig.camera.add(pagePeel.mesh);

  cameraRig.setStatic(
    new THREE.Vector3(0, 0, INTRO_CAMERA_Z),
    new THREE.Vector3(0, 0, 0),
  );

  // Post-processing: bloom on the lamp + vignette around the corners.
  const postFx = createPostFx(renderer, scene, cameraRig.camera);

  // Mascot sits in front of the page during the intro (world space); the peel
  // lives in camera space so this is only used if the mascot is shown early.
  mascot.group.position.set(0, -introPlaneHeight * 0.1, INTRO_CAMERA_Z - 0.25);

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
    mascotController.setFootObstacles(d.mascotFootObstacles);
    mascotController.setDeskBounds(4, 2);
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
  hud.setSessionScores(getSessionScoreboardView());
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
  const RUNNER_ENDLESS_RESTART_DELAY_S = 2.1;

  function removeRunnerTutorialOverlays(): void {
    document.querySelectorAll("#bd-runner-tutorial").forEach((el) => {
      el.remove();
    });
  }

  type DeskMini =
    | { kind: "sentence"; session: SentenceSession }
    | { kind: "errand"; session: ErrandSession }
    | { kind: "tamper"; session: TamperSession };

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

  function getDeskZoomTarget(kind: "sentence" | "errand" | "tamper"): {
    camPos: THREE.Vector3;
    lookAt: THREE.Vector3;
  } {
    let obj: THREE.Object3D = diorama.evidenceEnvelopeRoot;
    if (kind === "errand") obj = diorama.reagentTray;
    if (kind === "tamper") obj = diorama.lamp;
    obj.updateMatrixWorld(true);
    deskZoomBox.setFromObject(obj);
    deskZoomBox.getCenter(deskZoomCenter);
    const lookAt = deskZoomCenter.clone();
    const offset =
      kind === "tamper"
        ? new THREE.Vector3(1.05, 0.52, 1.08)
        : kind === "errand"
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
    diorama.flags.reagentActive = false;
    diorama.flags.lampActive = false;
    removeRunnerTutorialOverlays();
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
    diorama.flags.reagentActive = false;
    diorama.flags.lampActive = false;
    const ret = deskMiniCamReturn;
    deskMiniCamReturn = null;
    disposeDeskMiniOnly();
    // Bring the HUD back into view as we return to the desk.
    hud.element.style.opacity = "1";
    // Always animate the camera back. Falling back to the desk-overview
    // pose when `ret` is null (e.g. after a stale dispose/reset) prevents
    // the player from getting stuck zoomed on the lamp / envelope / tray.
    if (ret) {
      void cameraRig.scriptedTo(ret.pos, ret.look, 420);
    } else {
      void cameraRig.scriptedTo(GAME_CAMERA_POS, GAME_CAMERA_LOOKAT, 420);
    }
    investigationZoomLevel = 0;
    if (runnerOverlay) {
      // SH-8: 180→280ms so the desk-mini overlay rides the camera move
      // back to the desk view instead of snapping out before the rig
      // arrives. Camera move is 420ms; overlay finishes ~150ms before.
      void runnerOverlay.fadeOut(280).then(() => {
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
    kind: "sentence" | "errand" | "tamper",
    _now: number,
  ): Promise<void> {
    if (deskMinigame) return;
    exitInspectZoom(200);
    mascotController.setFrozen(true);
    disposeRunnerVisuals();
    // Tuck the HUD evidence row away while the mini owns the screen.
    hud.element.style.opacity = "0";
    hud.element.style.transition = "opacity 220ms ease";

    deskMiniCamReturn = {
      pos: cameraRig.camera.position.clone(),
      look: new THREE.Vector3(),
    };
    cameraRig.copyLookAtInto(deskMiniCamReturn.look);

    if (kind === "sentence") diorama.flags.envelopeOpen = true;
    if (kind === "errand") diorama.flags.reagentActive = true;
    if (kind === "tamper") diorama.flags.lampActive = true;

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

    if (kind === "sentence") {
      const session = new SentenceSession({
        overlayCtx: runnerOverlay.ctx,
        getOverlayViewport: getVp,
        clueWord: words.sentence,
        anomalyId: picked.def.id,
        onExit,
      });
      session.attachPointer(runnerOverlay.canvas);
      deskMinigame = { kind: "sentence", session };
    } else if (kind === "errand") {
      const session = new ErrandSession({
        overlayCtx: runnerOverlay.ctx,
        getOverlayViewport: getVp,
        clueWord: words.errand,
        onExit,
      });
      session.attachPointer(runnerOverlay.canvas);
      deskMinigame = { kind: "errand", session };
    } else {
      const session = new TamperSession({
        overlayCtx: runnerOverlay.ctx,
        getOverlayViewport: getVp,
        clueWord: words.tamper,
        onExit,
      });
      session.attachPointer(runnerOverlay.canvas);
      deskMinigame = { kind: "tamper", session };
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
    removeRunnerTutorialOverlays();

    runnerOverlay = createRunnerOverlay(root);
    void tryMountRunnerTutorialGate(root);
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
        ? "daily code run — Space jumps · hold Right through wide gaps · Esc exits"
        : "endless code run — climb for height · Space jumps · hold Right · Esc exits",
    );

    window.setTimeout(() => {
      if (!runnerOverlay) return;
      void runnerOverlay.fadeIn(220).then(() => {
        runnerUpdateMonitorTexture = false;
      });
    }, 380);

    await cameraRig.scriptedTo(targetCam, p, 600);
  }

  const deskInteractionRay = new THREE.Raycaster();
  const deskInteractionNdc = new THREE.Vector2();

  function pickDeskInteractionHit(
    clientX: number,
    clientY: number,
  ): THREE.Intersection | null {
    const rect = renderer.domElement.getBoundingClientRect();
    deskInteractionNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    deskInteractionNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    deskInteractionRay.setFromCamera(deskInteractionNdc, cameraRig.camera);
    const hits = deskInteractionRay.intersectObjects(
      diorama.hoverables as THREE.Object3D[],
      false,
    );
    return preferredDeskHoverHit(hits);
  }

  function dispatchDeskInteractionFromHit(
    hit: THREE.Intersection,
    e: PointerEvent,
  ): void {
    if (state.phase.kind !== "investigating") return;
    const inv = state.phase;
    const obj = hit.object;
    if (!obj) return;
    const tag = obj.userData.tag;
    if (typeof tag !== "string") return;
    const route = routeDeskInteractionTag(tag, {
      monitorDailyClear: inv.monitorDailyClear,
      anomalyTargetTag: picked.def.targetTag,
      shiftKey: e.shiftKey,
    });
    const now = performance.now();

    switch (route.kind) {
      case "runner":
        if (!state.enterRunner(now, route.mode)) return;
        startRunnerSession(route.mode, now);
        return;
      case "desk-mini":
        console.info(`[bug-detective] desk-mini click tag=${tag}`);
        void startDeskMini(route.mini, now);
        return;
      case "case-file":
        void showCaseFileModal(root);
        return;
      case "flavor":
        startFlavorInspect(obj);
        return;
      case "none":
        return;
      default:
        assertNever(route);
    }
  }

  /** Raycast against just the portal meshes; portal clicks navigate away. */
  function tryHandlePortalClick(clientX: number, clientY: number): boolean {
    const targets: THREE.Object3D[] = [];
    if (exitPortal.group.visible) targets.push(exitPortal.group);
    if (returnPortal?.group.visible) targets.push(returnPortal.group);
    if (targets.length === 0) return false;
    const rect = renderer.domElement.getBoundingClientRect();
    deskInteractionNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    deskInteractionNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    deskInteractionRay.setFromCamera(deskInteractionNdc, cameraRig.camera);
    const hits = deskInteractionRay.intersectObjects(targets, true);
    for (const h of hits) {
      const tag = h.object?.userData?.tag;
      if (tag === PORTAL_TAG_EXIT) {
        const url = buildExitUrl(PORTAL_BOOT.stored);
        console.info(`[bug-detective] portal exit → ${url}`);
        window.location.href = url;
        return true;
      }
      if (tag === PORTAL_TAG_RETURN) {
        const refHost = PORTAL_BOOT.stored.ref ?? "";
        const url = buildReturnUrl(refHost, PORTAL_BOOT.stored);
        if (url) {
          console.info(`[bug-detective] portal return → ${url}`);
          window.location.href = url;
          return true;
        }
      }
    }
    return false;
  }

  function handleDeskPointerDown(e: PointerEvent): void {
    if (deskMinigame || runnerSession) return;
    // Portals work in any phase (including the boot-into-desk path); check
    // them before the desk dispatch so a click on the ring always wins.
    if (tryHandlePortalClick(e.clientX, e.clientY)) return;
    if (state.phase.kind !== "investigating") return;
    const hit = pickDeskInteractionHit(e.clientX, e.clientY);
    const tag = hit?.object?.userData?.tag;
    if (inspectZoomActive || flavorInspectReturn) {
      if (hit?.object && canDispatchDuringDeskInspect(tag)) {
        if (inspectZoomActive) exitInspectZoom(200);
        else endFlavorInspectNow();
        dispatchDeskInteractionFromHit(hit, e);
        return;
      }
      if (inspectZoomActive) {
        exitInspectZoom(200);
        return;
      }
      if (flavorInspectReturn) {
        endFlavorInspectNow();
        return;
      }
    }
    if (!hit?.object) return;
    dispatchDeskInteractionFromHit(hit, e);
  }

  renderer.domElement.addEventListener("pointerdown", handleDeskPointerDown, {
    passive: true,
  });
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
  let lastDeskZoomHint: string | null = null;
  /** Desk exploration only: 0 = default wide, 1 = single close step. */
  let investigationZoomLevel: 0 | 1 = 0;
  let lastDiscreteDeskZoomMs = 0;

  /**
   * Inspect framing: stay far enough from props to avoid clipping / huge
   * texels, but not so far that the shot reads as a wide room view.
   */
  const INSPECT_MIN_DIST_FROM_FOCUS = 1.55;
  const INSPECT_MAX_DIST_FROM_FOCUS = 3.25;

  function clampInspectCamDistance(
    camPos: THREE.Vector3,
    focus: THREE.Vector3,
  ): void {
    tmpDirScratch.subVectors(camPos, focus);
    const d0 = tmpDirScratch.length();
    if (d0 < 1e-5) {
      tmpDirScratch.set(0.55, 0.3, 0.75);
    } else {
      tmpDirScratch.multiplyScalar(1 / d0);
    }
    const dClamped = THREE.MathUtils.clamp(
      d0 < 1e-5 ? INSPECT_MIN_DIST_FROM_FOCUS : d0,
      INSPECT_MIN_DIST_FROM_FOCUS,
      INSPECT_MAX_DIST_FROM_FOCUS,
    );
    camPos.copy(focus).add(tmpDirScratch.multiplyScalar(dClamped));
  }

  function anomalyInspectFraming(_tag: string): {
    lerp: number;
    yLift: number;
    durationMs: number;
  } {
    return { lerp: 0.36, yLift: 0.24, durationMs: 580 };
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
    hud.setInspectCaption(`${caption} · Esc / Wider / scroll`);
    hitObject.updateMatrixWorld(true);
    inspectBox.setFromObject(hitObject);
    inspectBox.getCenter(inspectAnomalyPos);
    inspectCamPos.lerpVectors(
      cameraRig.camera.position,
      inspectAnomalyPos,
      0.45,
    );
    inspectCamPos.y += 0.24;
    clampInspectCamDistance(inspectCamPos, inspectAnomalyPos);
    void cameraRig.scriptedTo(inspectCamPos, inspectAnomalyPos, 500);
    if (flavorInspectTimer) clearTimeout(flavorInspectTimer);
    flavorInspectTimer = window.setTimeout(() => {
      flavorInspectTimer = null;
      endFlavorInspectNow();
    }, 1200);
  }

  function exitInspectZoom(durationMs: number): void {
    if (!inspectZoomActive) return;
    inspectZoomActive = false;
    inspectZoomCooldownUntil = performance.now() + 800;
    hud.setInspectCaption(null);
    mascotController.setFrozen(false);
    void cameraRig.scriptedTo(inspectReturnPos, inspectReturnLook, durationMs);
  }

  function applyInvestigationWheelDelta(rawDeltaY: number): void {
    if (state.phase.kind !== "investigating") return;
    if (runnerSession || deskMinigame) return;
    if (Math.abs(rawDeltaY) < 1.5) return;
    const now = performance.now();
    if (now - lastDiscreteDeskZoomMs < 90) return;
    const zoomIn = rawDeltaY < 0;
    const zoomOut = rawDeltaY > 0;
    if (!zoomIn && !zoomOut) return;
    if (flavorInspectReturn || inspectZoomActive) {
      lastDiscreteDeskZoomMs = now;
      cameraRig.copyLookAtInto(tmpWheelAnchor);
      if (zoomIn) {
        cameraRig.setDistanceFromAnchor(
          tmpWheelAnchor,
          INSPECT_MIN_DIST_FROM_FOCUS,
        );
      } else {
        cameraRig.setDistanceFromAnchor(
          tmpWheelAnchor,
          INSPECT_MAX_DIST_FROM_FOCUS,
        );
      }
      return;
    }
    if (zoomIn) {
      if (investigationZoomLevel === 1) return;
      lastDiscreteDeskZoomMs = now;
      investigationZoomLevel = 1;
      cameraRig.setDistanceFromAnchor(
        GAME_CAMERA_LOOKAT,
        INVEST_ZOOM_TIGHT_DIST,
      );
      return;
    }
    if (investigationZoomLevel === 0) return;
    lastDiscreteDeskZoomMs = now;
    investigationZoomLevel = 0;
    void cameraRig.scriptedTo(GAME_CAMERA_POS, GAME_CAMERA_LOOKAT, 220);
  }

  function deskZoomWideFromClose(): void {
    if (investigationZoomLevel === 0) return;
    investigationZoomLevel = 0;
    void cameraRig.scriptedTo(GAME_CAMERA_POS, GAME_CAMERA_LOOKAT, 220);
  }

  /** Keep the discrete level aligned with the camera after scripted moves (e.g. inspect exit). */
  function syncInvestigationZoomLevelFromCamera(): void {
    if (state.phase.kind !== "investigating") return;
    if (runnerSession || deskMinigame) return;
    if (flavorInspectReturn || inspectZoomActive) return;
    if (cameraRig.isDollying()) return;
    const d = cameraRig.camera.position.distanceTo(GAME_CAMERA_LOOKAT);
    const mid = (INVEST_DEFAULT_CAMERA_DIST + INVEST_ZOOM_TIGHT_DIST) / 2;
    investigationZoomLevel = d < mid ? 1 : 0;
  }

  /**
   * Snap back to the default desk framing and clear flavor / hover inspect.
   * Does not run the short return tween from exitInspectZoom / endFlavorInspect.
   */
  function resetInvestigationCameraToDefault(): void {
    if (state.phase.kind !== "investigating") return;
    if (runnerSession || deskMinigame) return;
    if (flavorInspectTimer) {
      clearTimeout(flavorInspectTimer);
      flavorInspectTimer = null;
    }
    flavorInspectReturn = null;
    if (inspectZoomActive) {
      inspectZoomActive = false;
      inspectZoomCooldownUntil = performance.now() + 800;
    }
    investigationZoomLevel = 0;
    hud.setInspectCaption(null);
    mascotController.setFrozen(false);
    void cameraRig.scriptedTo(GAME_CAMERA_POS, GAME_CAMERA_LOOKAT, 420);
  }

  hud.onInspectExit(() => {
    if (state.phase.kind !== "investigating") return;
    if (inspectZoomActive) exitInspectZoom(420);
    else endFlavorInspectNow();
  });
  hud.onInspectWider(() => {
    if (state.phase.kind !== "investigating") return;
    if (runnerSession || deskMinigame) return;
    applyInvestigationWheelDelta(100);
  });
  hud.onInspectResetView(() => {
    resetInvestigationCameraToDefault();
  });

  /** Escape exits inspect or desk close-zoom; +/− step between two levels. */
  document.addEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      if (state.phase.kind !== "investigating") return;
      if (runnerSession || deskMinigame) return;
      const t = e.target;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.code === "Minus" || e.code === "NumpadSubtract") {
        e.preventDefault();
        applyInvestigationWheelDelta(120);
        return;
      }
      if (e.code === "NumpadAdd" || (e.code === "Equal" && e.shiftKey)) {
        e.preventDefault();
        applyInvestigationWheelDelta(-120);
        return;
      }
      if (e.code !== "Escape" || e.repeat) return;
      e.preventDefault();
      if (inspectZoomActive) exitInspectZoom(420);
      else if (flavorInspectReturn) endFlavorInspectNow();
      else deskZoomWideFromClose();
    },
    { capture: true },
  );

  function handleInvestigationWheel(ev: WheelEvent): void {
    if (state.phase.kind !== "investigating") return;
    if (runnerSession || deskMinigame) return;
    applyInvestigationWheelDelta(ev.deltaY);
    ev.preventDefault();
  }
  renderer.domElement.addEventListener("wheel", handleInvestigationWheel, {
    passive: false,
  });

  function placeMascotAtDefaultDesk(deskTopY: number): void {
    mascot.group.position.set(
      0.4,
      deskTopY + MASCOT_FEET_OFFSET * MASCOT_GAME_SCALE,
      0.4,
    );
    mascotController.resetAt(mascot.group.position.clone(), 0);
  }

  answerPanel.onSubmitChoice(({ correct }) => {
    sfxUiClick();
    state.submit(correct);
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
        showResults(
          phase.score,
          phase.correct,
          4,
          phase.elapsedMs,
          phase.breakdown,
        );
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

  resultsPanel.onBackToDesk(() => {
    if (!state.resumeInvestigatingFromResults(performance.now())) return;
    resultsPanel.hide();
    lastResults = null;
    if (state.phase.kind !== "investigating") return;
    hud.setNotebook(state.phase.notebook);
    hud.setStatusText(
      state.phase.monitorDailyClear
        ? "Shift+click monitor for practice · click for endless"
        : "sweep the desk — trust the tooltip",
    );
    void cameraRig.scriptedTo(GAME_CAMERA_POS, GAME_CAMERA_LOOKAT, 380);
    mascotController.setFrozen(false);
  });

  let lastResults: {
    score: number;
    cluesUsed: number;
    elapsedMs: number;
    rank: number | null;
    breakdown: import("./game/score").GameScoreBreakdown | null;
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
    breakdown: import("./game/score").GameScoreBreakdown | null,
  ): void {
    lastResults = {
      score,
      cluesUsed,
      elapsedMs,
      rank: null,
      breakdown,
    };
    const resultsView = {
      correct,
      score,
      cluesUsed,
      elapsedMs,
      revealText: picked.def.revealText,
      rank: null,
      ...(correct && breakdown ? { breakdown } : {}),
    };
    resultsPanel.show(resultsView);
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
  }

  function startInvestigating(now: number): void {
    // Case file + envelope flap are shown when the desk first appears (mascot walk);
    // keep visible here for skip-intro and any path that calls startInvestigating alone.
    diorama.caseFileSheet.visible = true;
    state.enterInvestigating(now);
    clearSessionScores();
    hud.setSessionScores(getSessionScoreboardView());
    hud.hideTimer();
    hud.setNotebook({});
    hud.onMakeTheCall(() => enterAnsweringNow(performance.now()));
    hud.setStatusText("sweep the desk — trust the tooltip");
    resultsPanel.hide();
    answerPanel.hide();
    lastResults = null;
  }

  function enterAnsweringNow(now: number): void {
    exitInspectZoom(280);
    if (!state.enterAnswering(now)) return;
    sfxSubmit();
    hud.setExplorationHint(null);
    hud.setStatusText("which one is the bug?");
    if (state.phase.kind !== "answering") return;
    const nb = state.phase.notebook;
    const ev = [nb.runner, nb.sentence, nb.errand, nb.tamper]
      .map((p) => p?.clueToken.toUpperCase())
      .filter(Boolean)
      .join(" · ");
    answerPanel.show({
      prompt: "Make the call — which anomaly is live?",
      evidenceLine: ev,
      choices: picked.choices,
      correctIndex: picked.correctIndex,
    });
  }

  answerPanel.onCancel(() => {
    if (state.phase.kind !== "answering") {
      answerPanel.hide();
      return;
    }
    sfxUiClick();
    state.cancelAnswering();
    answerPanel.hide();
    hud.setStatusText("sweep the desk — trust the tooltip");
    hud.setExplorationHint("hit Make the call when you're sure");
  });

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
  //   5. Cursor tracker switches target to desk; hop-on + walk-in + HUD.
  //   6. State transitions to investigating (untimed round).
  const fastIntro =
    new URLSearchParams(window.location.search).get("fastIntro") === "1";
  const MIN_CASE_READ_MS = fastIntro ? 0 : 3200; // QA: `?fastIntro=1` skips dwell for automated smoke
  const PEEL_BEGIN_MS = 200; // delay between mascot reaction and peel start
  const DOLLY_START_DELAY_MS = 420; // let the peel read before camera moves
  const DOLLY_DURATION_MS = 2200; // total camera dolly time (ease-in-out cubic)
  const REVEAL_AT_PROGRESS = 0.32; // show desk a bit earlier vs peel
  /** Spawn near the lying case file, clear of the mug at (2.4, 0.6). */
  const INTRO_MASCOT_SPAWN_X = 0.35;
  const INTRO_MASCOT_SPAWN_Z = -1.42;
  const INTRO_HOP_MS = 380;
  const INTRO_HOP_PEAK_Y = 0.072;

  type IntroStep =
    | "waiting" // case file visible; wait for read time + confirm
    | "reacting" // mascot tilts/jumps before peel
    | "peeling" // peel + dolly running concurrently
    | "landingHop" // brief jump-on before walk to home
    | "landing" // mascot walks to default desk spot
    | "done";

  let introStep: IntroStep = "waiting";
  let introStepStartedAt = 0;
  let dollyStarted = false;
  let dollyStartAtMs = 0;
  let dioramaRevealed = false;
  let introAckPointer = false;
  let caseFileCtaShown = false;
  let mascotIntroSpawnedOnDesk = false;
  let introHopBaseY = 0;
  const introLandingFeet = new THREE.Vector3();
  /**
   * Case sheet on the desk + 3D envelope flap — as soon as the diorama and mascot
   * appear, not only after the walk-in finishes.
   */
  function revealDeskCaseReadables(): void {
    diorama.caseFileSheet.visible = true;
    diorama.flags.envelopeOpen = true;
    // Portals appear with the desk so the ring isn't visible against the
    // page-peel intro. Once revealed they stay up for the rest of the
    // session.
    exitPortal.group.visible = true;
  }
  const caseFileCta = document.createElement("div");
  caseFileCta.id = "bd-casefile-cta";
  caseFileCta.setAttribute("role", "status");
  caseFileCta.setAttribute("aria-live", "polite");
  caseFileCta.innerHTML =
    "<div>Press Space, Enter, or click to continue</div>" +
    "<div style=\"margin-top:12px;font:500 12px 'Cursor Gothic',ui-sans-serif,sans-serif;opacity:0.82;line-height:1.45;\">" +
    "After the peel: <strong>hover the desk</strong>, then the <strong>four props</strong> from the case file.</div>";
  caseFileCta.style.cssText =
    "position:fixed;left:50%;bottom:36px;transform:translateX(-50%);max-width:min(92vw,520px);padding:14px 24px 16px;border-radius:12px;background:rgba(26,24,18,0.88);color:#efe7d7;border:1px solid rgba(245,78,0,0.45);font:600 14px 'Cursor Gothic',ui-sans-serif,sans-serif;letter-spacing:0.03em;text-align:center;opacity:0;pointer-events:none;transition:opacity 650ms ease;z-index:60;box-shadow:0 8px 28px rgba(0,0,0,0.45)";
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
          setIntroStep("peeling", now);
        }
        break;
      }
      case "peeling": {
        if (!dollyStarted && now - introStepStartedAt >= DOLLY_START_DELAY_MS) {
          void cameraRig.scriptedTo(
            GAME_CAMERA_POS,
            GAME_CAMERA_LOOKAT,
            DOLLY_DURATION_MS,
          );
          dollyStartAtMs = now;
          dollyStarted = true;
        }
        // Reveal the diorama mid-dolly so the room appears as the page lifts.
        if (!dioramaRevealed && dollyStarted) {
          const dollyProgress = Math.min(
            1,
            (now - dollyStartAtMs) / DOLLY_DURATION_MS,
          );
          if (dollyProgress >= REVEAL_AT_PROGRESS) {
            diorama.root.visible = true;
            dioramaRevealed = true;
          }
        }
        // First time the desk is visible: spawn the mascot off-frame and let
        // the landing step walk it to the default spot.
        if (dioramaRevealed && !mascotIntroSpawnedOnDesk) {
          mascotIntroSpawnedOnDesk = true;
          revealDeskCaseReadables();
          mascot.group.scale.setScalar(MASCOT_GAME_SCALE);
          const landY =
            diorama.deskTopY + MASCOT_FEET_OFFSET * MASCOT_GAME_SCALE;
          mascot.group.position.set(
            INTRO_MASCOT_SPAWN_X,
            landY,
            INTRO_MASCOT_SPAWN_Z,
          );
          mascotController.resetAt(mascot.group.position.clone(), 0);
          mascot.group.visible = true;
          mascotController.setFrozen(true);
          cursorTracker.setTarget(diorama.desk);
          cursorTracker.setYOffset(MASCOT_FEET_OFFSET * MASCOT_GAME_SCALE);
          syncCursorDeskNav(diorama);
        }
        // Once both peel and dolly are done, move to hop then walk-in.
        if (pagePeel.done && dollyStarted && !cameraRig.isDollying()) {
          if (!mascotIntroSpawnedOnDesk) {
            diorama.root.visible = true;
            dioramaRevealed = true;
            mascotIntroSpawnedOnDesk = true;
            revealDeskCaseReadables();
            mascot.group.scale.setScalar(MASCOT_GAME_SCALE);
            const landY =
              diorama.deskTopY + MASCOT_FEET_OFFSET * MASCOT_GAME_SCALE;
            mascot.group.position.set(
              INTRO_MASCOT_SPAWN_X,
              landY,
              INTRO_MASCOT_SPAWN_Z,
            );
            mascotController.resetAt(mascot.group.position.clone(), 0);
            mascot.group.visible = true;
            mascotController.setFrozen(true);
          }
          cursorTracker.setTarget(diorama.desk);
          cursorTracker.setYOffset(MASCOT_FEET_OFFSET * MASCOT_GAME_SCALE);
          syncCursorDeskNav(diorama);
          cursorTracker.attach(renderer.domElement);
          cursorTracker.refreshLayout();
          introHopBaseY = mascot.group.position.y;
          setIntroStep("landingHop", now);
        }
        break;
      }
      case "landingHop": {
        if (now - introStepStartedAt >= INTRO_HOP_MS) {
          mascot.group.position.y = introHopBaseY;
          mascot.setTilt(0);
          mascot.setStride(0, 0);
          sfxMascotLand();
          const landY =
            diorama.deskTopY + MASCOT_FEET_OFFSET * MASCOT_GAME_SCALE;
          introLandingFeet.set(0.4, landY, 0.4);
          const hopYaw = Math.atan2(
            introLandingFeet.x - mascot.group.position.x,
            introLandingFeet.z - mascot.group.position.z,
          );
          mascotController.resetAt(mascot.group.position.clone(), hopYaw);
          mascotController.setFrozen(false);
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
          // Preserve the walk’s end pose when we land near home; only snap to
          // the default spot if the long fallback timeout fired while still far.
          if (close) {
            mascotController.resetAt(
              mascot.group.position.clone(),
              mascot.group.rotation.y,
            );
          } else {
            placeMascotAtDefaultDesk(diorama.deskTopY);
          }
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

  function ambientContextForFrame(): AmbientContext {
    if (state.phase.kind === "intro") return "desk";
    if (state.phase.kind === "runner") return "runner";
    if (state.phase.kind === "investigating") {
      return deskMinigame ? deskMinigame.kind : "investigating";
    }
    return "desk";
  }

  let lastAppliedAmbientContext: AmbientContext | null = null;

  function frame(now: number): void {
    const dtMs = Math.min(50, now - lastFrame);
    const dtSec = dtMs / 1000;
    lastFrame = now;
    const elapsed = (now - startTime) / 1000;

    const nextAmbient = ambientContextForFrame();
    if (nextAmbient !== lastAppliedAmbientContext) {
      lastAppliedAmbientContext = nextAmbient;
      setAmbientContext(nextAmbient);
    }

    // Desk minis attach keydown on `window` (bubble). InputManager uses capture
    // on `window` for runner — suppress global bindings so Tab/Enter/etc. reach
    // sentence / errand / tamper sessions.
    input.setSuppressGameKeys(deskMinigame !== null);

    cameraRig.update(dtMs);
    diorama.step(elapsed, dtSec);
    exitPortal.step(elapsed);
    returnPortal?.step(elapsed);

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
    } else if (state.phase.kind === "intro" && introStep === "landingHop") {
      const u = Math.min(1, (now - introStepStartedAt) / INTRO_HOP_MS);
      const arc = Math.sin(u * Math.PI);
      mascot.group.position.y = introHopBaseY + arc * INTRO_HOP_PEAK_Y;
      mascot.setTilt(-arc * 0.32);
      mascot.setStride(0, 0);
    } else if (state.phase.kind === "intro" && introStep === "landing") {
      const landY = diorama.deskTopY + MASCOT_FEET_OFFSET * MASCOT_GAME_SCALE;
      introLandingFeet.set(0.4, landY, 0.4);
      const walk = mascotController.step(introLandingFeet, dtSec, now);
      mascot.setStride(walk.stridePhase01, walk.strideIntensity);
    } else if (state.phase.kind === "runner") {
      if (runnerSession && runnerOverlay) {
        const mode = runnerSession.mode;
        if (runnerSession.isGameOver()) {
          if (mode === "endless") {
            runnerEndlessDeathTimer += dtSec;
            if (runnerEndlessDeathTimer >= RUNNER_ENDLESS_RESTART_DELAY_S) {
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
          runnerSession.step(dtSec, false, false);
        } else {
          runnerEndlessDeathTimer = 0;
          if (
            runnerSession.isDailyCleared() &&
            input.consumePress(Action.RunnerRetry)
          ) {
            runnerSession.restartSameMode();
          } else {
            const jump = input.consumePress(Action.RunnerJump);
            const wantBoost = input.isDown(Action.RunnerBoost);
            runnerSession.step(dtSec, jump, wantBoost);
          }
        }

        if (
          state.phase.kind === "runner" &&
          runnerSession.isDailyCleared() &&
          !state.phase.notebook.runner
        ) {
          const peakM = Math.floor(runnerSession.getPeakHeightM());
          const gs = Math.min(1000, peakM * 5);
          const tMs = performance.now();
          if (gs >= 500) {
            const { newBest: runnerClueNewBest } = recordMinigameScore(
              "runner",
              gs,
              tMs,
            );
            state.pinNotebookPage("runner", {
              clueToken: picked.def.gameClueWords.runner.toUpperCase(),
              gameScore: gs,
              solvedAtMs: tMs,
            });
            sfxClueFound();
            if (state.phase.kind === "runner") {
              hud.setNotebook(state.phase.notebook);
              hud.setSessionScores(getSessionScoreboardView());
              hud.setStatusText(
                `runner clue locked · ${picked.def.gameClueWords.runner.toUpperCase()}${runnerClueNewBest ? " · RUN new best" : ""} · endless: click monitor · daily replay: Shift+click`,
              );
            }
          } else if (state.phase.kind === "runner") {
            hud.setStatusText(
              `daily line cleared — reach score 500+ to lock the runner clue (now ${gs}) · Shift+click to retry daily`,
            );
          }
        }

        if (input.consumePress(Action.MenuBack)) {
          if (runnerSession.isGameOver()) {
            runnerSession.exitFromGameOverToDesktop();
          } else {
            void endRunnerSessionAsync(now).then(() => {
              const p = state.phase;
              const runnerUnlocked =
                p.kind === "runner" && p.notebook.runner !== undefined;
              const phase = state.returnToInvestigatingFromRunner(
                runnerUnlocked ? { monitorDailyClear: true } : {},
              );
              if (phase?.monitorDailyClear) {
                hud.setStatusText(
                  "Shift+click monitor — daily practice · click monitor — endless",
                );
              } else {
                hud.setStatusText("find the bug — hover to investigate");
              }
            });
          }
        }

        const out = runnerSession.getOutcome();
        if (out) {
          const captured = out;
          void endRunnerSessionAsync(now).then(() => {
            if (captured.kind === "daily_fail") {
              state.returnToInvestigatingFromRunner({});
              hud.setStatusText(
                "runner failed — sweep the desk again or click monitor to retry the clue run",
              );
            } else {
              const climbNew = recordRunnerEndlessClimb(
                Math.floor(captured.score),
                performance.now(),
              );
              state.returnToInvestigatingFromRunner({
                monitorDailyClear: true,
              });
              hud.setSessionScores(getSessionScoreboardView());
              hud.setStatusText(
                `endless complete — best ${captured.score}m${climbNew.newBest ? " · new climb best (session)" : ""} · click monitor (endless) · Shift+click (daily)`,
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
                  `endless complete — rank ${res.rank} · click monitor (endless) · Shift+click (daily)`,
                );
              });
            }
          });
        }
      }
      mascot.setStride(0, 0);
    } else if (state.phase.kind === "investigating" && deskMinigame) {
      const deskMini = deskMinigame;
      deskMini.session.step(dtSec);
      // Esc / MenuBack: handled inside each desk session (tutorial gate vs exit).
      // Capture `deskMini` before `step`: Tamper may call onExit during step when
      // no clue is earned, which clears `deskMinigame` before getOutcome runs.
      const out = deskMini.session.getOutcome();
      if (out) {
        const kind = deskMini.kind;
        const slot: "sentence" | "errand" | "tamper" =
          kind === "sentence"
            ? "sentence"
            : kind === "errand"
              ? "errand"
              : "tamper";
        const { newBest: deskNewBest } = recordMinigameScore(
          slot,
          out.score,
          now,
        );
        state.pinNotebookPage(slot, {
          clueToken: out.clueToken,
          gameScore: out.score,
          solvedAtMs: now,
        });
        if (state.phase.kind === "investigating") {
          hud.setNotebook(state.phase.notebook);
          hud.setSessionScores(getSessionScoreboardView());
          hud.setStatusText(
            `clue secured · ${out.clueToken.toUpperCase()}${deskNewBest ? ` · ${GAME_SCORE_LABEL[slot]} new best` : ""} — sweep the desk`,
          );
        }
        sfxClueFound();
        endDeskMiniFromOverlay();
      }
      mascot.setStride(0, 0);
    } else if (state.phase.kind === "investigating") {
      if (input.consumePress(Action.MenuBack)) {
        if (inspectZoomActive) exitInspectZoom(420);
        else if (flavorInspectReturn) endFlavorInspectNow();
        else deskZoomWideFromClose();
      }
      syncInvestigationZoomLevelFromCamera();
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
        clampInspectCamDistance(inspectCamPos, inspectAnomalyPos);
        void cameraRig.scriptedTo(inspectCamPos, inspectAnomalyPos, durationMs);
        hud.setInspectCaption("Inspecting — Esc / Wider / scroll to zoom out");
      } else if (!isAnomalyTarget && inspectZoomActive) {
        exitInspectZoom(420);
      }

      const stepTarget = inspectZoomActive ? null : hasFeet ? tmpFeet : null;
      const walk = mascotController.step(stepTarget, dtSec, now);
      mascot.setStride(walk.stridePhase01, walk.strideIntensity);

      if (hover.tag) {
        const hint = friendlyTagName(hover.tag);
        hud.setHover(hover.tag, hint);
        (
          window as unknown as { __bdLastHoverTag?: string | null }
        ).__bdLastHoverTag = hover.tag;
        if (lastHoverTag !== hover.tag) {
          if (hover.tag !== null) sfxHover();
          lastHoverTag = hover.tag;
        }
        mascot.setMagnifierLifted(isAnomalyTarget ? 1 : 0);
      } else {
        hud.setHover(null);
        (
          window as unknown as { __bdLastHoverTag?: string | null }
        ).__bdLastHoverTag = null;
        mascot.setMagnifierLifted(0);
        lastHoverTag = null;
      }

      {
        const lim = inspectZoomActive || flavorInspectReturn;
        const nextHint =
          lim || investigationZoomLevel === 0
            ? null
            : "Close view — Esc, scroll down, or − (wide · + is closer)";
        if (nextHint !== lastDeskZoomHint) {
          lastDeskZoomHint = nextHint;
          hud.setViewZoomHint(nextHint);
        }
      }

      if (input.consumePress(Action.Submit)) {
        enterAnsweringNow(now);
      }
    } else {
      mascot.setStride(0, 0);
    }

    {
      const deskExplore =
        state.phase.kind === "investigating" && !deskMinigame && !runnerSession;
      if (!deskExplore && lastDeskZoomHint !== null) {
        lastDeskZoomHint = null;
        hud.setViewZoomHint(null);
      }
    }

    if (
      state.phase.kind === "investigating" ||
      (state.phase.kind === "intro" && introStep !== "landingHop")
    ) {
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
  //   - Vibe Jam 2026 portal arrival (?portal=true) — per spec the player
  //     must drop instantly into the desk view with no splash / peel /
  //     input gate so the multi-game portal hop feels seamless.
  // In all cases, the choreography state machine is parked at "done" so
  // its switch never runs, and we manually do the same teardown the
  // landing step does (camera pose, diorama visible, HUD + settings
  // shown, bloom on, cursor target = desk, mascot at game scale).
  if (isSkipIntro() || simplified || portalArrived) {
    caseFileCta.remove();
    pagePeel.mesh.visible = false;
    diorama.caseFileSheet.visible = true;
    diorama.flags.envelopeOpen = true;
    diorama.root.visible = true;
    exitPortal.group.visible = true;
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
      case "coffee-steam":
        return "steam";
      case "calendar":
        return "calendar";
      case "mug":
        return "mug";
      case "case-file":
        return "case file";
      case "keyboard":
        return "keyboard";
      case "desk":
        return "desk";
      default:
        return tag;
    }
  }
} // end bootGameInner
