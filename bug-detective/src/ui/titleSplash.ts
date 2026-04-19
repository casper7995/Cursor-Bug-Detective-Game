/**
 * Title splash — full-screen intro shown before the page-peel kicks off.
 *
 * Shows the game title + a "press anything" prompt. Resolves the returned
 * promise when the user clicks, taps, or presses any key. The splash
 * fades out then removes itself from the DOM.
 *
 * Used by main.ts to wait for an explicit user gesture before starting
 * the audio context (browsers require it) and the choreographed intro.
 */

import * as THREE from "three";
import { createMascotMesh } from "../cursor/mascotMesh";

export interface TitleSplash {
  /** Resolves once the user dismisses the splash. */
  readonly ready: Promise<void>;
}

const SPLASH_W = 280;
const SPLASH_H = 220;

const WALK_END = 1.2;
const DOLLY_END = 1.6;
const SCAN_END = 2.5;

const CAM_POS_START = new THREE.Vector3(0.4, 0.55, 3.4);
const CAM_POS_END = new THREE.Vector3(0, 0.32, 2.15);
const LOOK_START = new THREE.Vector3(0, 0.2, 0);
const LOOK_END = new THREE.Vector3(0, 0.08, 0);

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

export function showTitleSplash(container: HTMLElement): TitleSplash {
  ensureStyle();

  const overlay = document.createElement("div");
  overlay.className = "bd-title";
  overlay.innerHTML = `
    <div class="bd-title__inner">
      <canvas class="bd-title__stage" aria-hidden="true"></canvas>
      <h1 class="bd-title__h1">Cursor Detective</h1>
      <p class="bd-title__sub">A daily anomaly hunt</p>
      <p class="bd-title__cta">Click to continue</p>
      <p class="bd-title__introcue">Then move your mouse — a case file lifts away to your desk.</p>
      <p class="bd-title__hint">Vibe Jam 2026</p>
    </div>
  `;
  container.appendChild(overlay);

  /** Dismiss is blocked until intro choreography finishes (unless Escape). */
  let introDone = false;
  let loggedDismissBlocked = false;

  const markIntroReady = (): void => {
    if (introDone) return;
    introDone = true;
    overlay.classList.add("bd-title--ready");
  };

  let cleanupSplash: () => void = () => {};

  const canvas = overlay.querySelector<HTMLCanvasElement>(".bd-title__stage");
  if (canvas) {
    const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
    canvas.width = Math.floor(SPLASH_W * dpr);
    canvas.height = Math.floor(SPLASH_H * dpr);
    canvas.style.width = `${SPLASH_W}px`;
    canvas.style.height = `${SPLASH_H}px`;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    });
    renderer.setPixelRatio(dpr);
    renderer.setSize(SPLASH_W, SPLASH_H, false);
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      42,
      SPLASH_W / SPLASH_H,
      0.1,
      20,
    );
    camera.position.copy(CAM_POS_START);
    camera.lookAt(LOOK_START);

    scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x1a1d24, 1.0));
    const key = new THREE.DirectionalLight(0xfff4e8, 1.15);
    key.position.set(0.85, 1.1, 1.2);
    scene.add(key);

    const mascot = createMascotMesh();
    mascot.group.position.set(-1.4, -0.72, 0);
    mascot.group.rotation.y = 0.38;
    scene.add(mascot.group);

    let scanCone: THREE.Mesh | null = null;
    let scanConeMat: THREE.MeshBasicMaterial | null = null;
    const magnifierRoot = mascot.group.getObjectByName("magnifier");
    if (magnifierRoot) {
      const coneGeo = new THREE.ConeGeometry(0.55, 1.4, 24, 1, true);
      const coneMat = new THREE.MeshBasicMaterial({
        color: 0x9ec5ff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.name = "splashScanCone";
      cone.renderOrder = 2;
      cone.position.set(0.14, -0.02, 0.22);
      cone.rotation.x = Math.PI / 2;
      cone.visible = false;
      magnifierRoot.add(cone);
      scanCone = cone;
      scanConeMat = coneMat;
    }

    const tmpLook = new THREE.Vector3();
    const t0 = performance.now();
    let rafId = 0;

    const loop = (): void => {
      const sec = (performance.now() - t0) * 0.001;

      if (sec < WALK_END) {
        const p = easeOutCubic(Math.min(1, sec / WALK_END));
        mascot.group.position.x = THREE.MathUtils.lerp(-1.4, 0, p);
        mascot.setStride((sec * 1.4) % 1, 0.85);
      } else {
        mascot.group.position.x = 0;
        if (sec < SCAN_END) {
          mascot.setStride((sec * 0.6) % 1, 0.25);
        } else {
          mascot.setStride(((sec - SCAN_END) * 0.08) % 1, 0.05);
        }
      }

      const camT = Math.min(1, sec / DOLLY_END);
      const ce = easeOutCubic(camT);
      camera.position.lerpVectors(CAM_POS_START, CAM_POS_END, ce);
      tmpLook.lerpVectors(LOOK_START, LOOK_END, ce);
      camera.lookAt(tmpLook);

      if (sec < SCAN_END) {
        mascot.group.rotation.y = THREE.MathUtils.lerp(
          0.38,
          0,
          easeOutCubic(Math.min(1, sec / SCAN_END)),
        );
      } else {
        mascot.group.rotation.y = 0.18 * Math.sin((sec - SCAN_END) * 0.5);
      }

      if (scanCone) scanCone.visible = false;

      if (sec < WALK_END) {
        mascot.setMagnifierLifted(0.05);
      } else if (sec <= SCAN_END) {
        const sp = Math.min(
          1,
          Math.max(0, (sec - WALK_END) / (SCAN_END - WALK_END)),
        );
        mascot.setMagnifierLifted(easeInOutQuad(sp));
        if (scanCone) {
          if (scanConeMat) scanConeMat.opacity = Math.sin(sp * Math.PI) * 0.22;
          scanCone.visible = true;
          scanCone.rotation.y = THREE.MathUtils.lerp(
            -Math.PI / 4,
            Math.PI / 4,
            sp,
          );
        }
      } else {
        mascot.setMagnifierLifted(
          0.55 + 0.15 * Math.sin((sec - SCAN_END) * 1.0),
        );
      }

      if (sec >= SCAN_END) {
        const blinkWindow = (sec - SCAN_END) % 3.5 < 0.15;
        mascot.setBlink(blinkWindow ? 0 : 1);
        markIntroReady();
      } else {
        mascot.setBlink(1);
      }

      renderer.render(scene, camera);
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    cleanupSplash = (): void => {
      cancelAnimationFrame(rafId);
      if (scanCone) {
        scanCone.parent?.remove(scanCone);
        scanCone.geometry.dispose();
        scanConeMat?.dispose();
        scanCone = null;
        scanConeMat = null;
      }
      renderer.dispose();
    };
  } else {
    markIntroReady();
  }

  const ready = new Promise<void>((resolve) => {
    let dismissed = false;
    const dismiss = (label: string): void => {
      if (dismissed) return;
      if (!introDone && label !== "escape") {
        if (!loggedDismissBlocked) {
          loggedDismissBlocked = true;
          console.info(
            "[bug-detective] title splash dismiss ignored — intro still running (press Escape to skip)",
          );
        }
        return;
      }
      dismissed = true;
      console.info(`[bug-detective] title splash dismissed via ${label}`);
      cleanupSplash();
      overlay.classList.add("bd-title--out");
      window.setTimeout(() => {
        overlay.remove();
        resolve();
      }, 350);
      teardown();
    };
    // Use document-level capture-phase listeners. Some embedded views
    // (Simple Browser, sandboxed iframes) only deliver one of
    // pointerdown/mousedown/click and may not bubble to window or to the
    // overlay element. Capture-phase on document is the most reliable
    // path: events are dispatched here BEFORE any element handler can
    // stopPropagation. We listen for several event types so whichever
    // the host browser emits will fire dismiss.
    const onPointerDown = (): void => dismiss("pointerdown");
    const onMouseDown = (): void => dismiss("mousedown");
    const onClick = (): void => dismiss("click");
    const onTouchStart = (): void => dismiss("touchstart");
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        dismiss("escape");
        return;
      }
      dismiss("keydown");
    };
    const teardown = (): void => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("touchstart", onTouchStart, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("touchstart", onTouchStart, {
      capture: true,
      passive: true,
    });
    window.addEventListener("keydown", onKeyDown, true);
  });

  return { ready };
}

function ensureStyle(): void {
  const id = "bd-title-style";
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    .bd-title {
      position: fixed;
      inset: 0;
      background: radial-gradient(ellipse at center, #1a1d24 0%, #0a0b10 80%);
      color: #f1f3f7;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100000;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      transition: opacity 320ms ease-out;
      cursor: pointer;
      touch-action: manipulation;
    }
    .bd-title--out { opacity: 0; pointer-events: none; }
    .bd-title__inner { text-align: center; max-width: 520px; padding: 24px; }
    .bd-title__stage {
      width: 280px;
      height: 220px;
      margin: 0 auto 12px;
      display: block;
      border-radius: 12px;
      background: radial-gradient(ellipse at 50% 60%, rgba(158,197,255,0.18) 0%, transparent 70%);
    }
    .bd-title__h1 {
      font-size: clamp(36px, 7vw, 64px);
      letter-spacing: -0.02em;
      margin: 8px 0 4px;
    }
    .bd-title__sub {
      font-size: 18px;
      opacity: 0.78;
      margin: 0 0 28px;
    }
    .bd-title__introcue {
      font-size: 15px;
      line-height: 1.45;
      opacity: 0.72;
      margin: 0 0 20px;
      max-width: 420px;
      margin-left: auto;
      margin-right: auto;
    }
    .bd-title__cta {
      font-size: 16px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      opacity: 0.35;
      transition: opacity 0.4s ease;
    }
    .bd-title--ready .bd-title__cta {
      opacity: 0.85;
      animation: bdTitlePulse 1.6s ease-in-out infinite;
    }
    @keyframes bdTitlePulse {
      0%, 100% { opacity: 0.55; }
      50%      { opacity: 1;    }
    }
    .bd-title__hint {
      margin-top: 28px;
      font-size: 12px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      opacity: 0.4;
    }
  `;
  document.head.appendChild(style);
}
