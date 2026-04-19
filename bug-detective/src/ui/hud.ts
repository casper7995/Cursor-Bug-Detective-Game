import * as THREE from "three";
import type { DioramaObjects } from "../scene/desktopDiorama";

export interface HudHoverInfo {
  /** The userData.tag of the currently hovered prop, if any. */
  tag: string | null;
  /** First raycast hit (for inspect zoom / bounds). */
  object: THREE.Object3D | null;
  /** Screen-space mouse position used for tooltip anchoring. */
  clientX: number;
  clientY: number;
}

export interface Hud {
  readonly element: HTMLElement;
  setTimer(remainingMs: number): void;
  setCluesUsed(n: number): void;
  setStatusText(text: string | null): void;
  setHover(tag: string | null, hint?: string | undefined): void;
  /** Per-frame: raycast mouse against diorama, returns hover state. */
  update(camera: THREE.Camera): HudHoverInfo;
  destroy(): void;
}

const STYLE_TIMER =
  "position:absolute;top:14px;right:18px;color:#e8efff;font:600 22px ui-monospace,monospace;text-shadow:0 1px 2px rgba(0,0,0,0.7);pointer-events:none;letter-spacing:0.02em;";
const STYLE_CLUES =
  "position:absolute;top:48px;right:18px;color:#a9c4ff;font:13px ui-sans-serif,sans-serif;pointer-events:none;text-shadow:0 1px 2px rgba(0,0,0,0.7);";
const STYLE_STATUS =
  "position:absolute;left:50%;transform:translateX(-50%);top:14px;color:#fff48a;font:600 14px ui-sans-serif,sans-serif;pointer-events:none;text-shadow:0 1px 2px rgba(0,0,0,0.7);letter-spacing:0.04em;";
const STYLE_TOOLTIP =
  "position:absolute;pointer-events:none;background:rgba(20,20,28,0.92);color:#e8efff;border:1px solid rgba(232,239,255,0.35);border-radius:14px;padding:6px 12px;font:12px ui-sans-serif,sans-serif;transform:translate(-50%,calc(-100% - 14px));white-space:nowrap;box-shadow:0 4px 18px rgba(0,0,0,0.5);transition:opacity 80ms;";
const STYLE_LOUPE =
  "position:absolute;width:64px;height:64px;border-radius:50%;border:3px solid rgba(232,239,255,0.85);background:radial-gradient(circle at 35% 35%,rgba(232,239,255,0.18),rgba(232,239,255,0.05));pointer-events:none;transform:translate(-50%,-50%);box-shadow:0 0 0 1px rgba(0,0,0,0.4),0 6px 18px rgba(0,0,0,0.45);transition:opacity 100ms;mix-blend-mode:screen;";

export function createHud(
  container: HTMLElement,
  diorama: DioramaObjects,
): Hud {
  const wrapper = document.createElement("div");
  wrapper.id = "hud";
  wrapper.style.cssText =
    "position:absolute;inset:0;pointer-events:none;font-family:ui-sans-serif,system-ui,sans-serif;";
  container.appendChild(wrapper);

  const timerEl = document.createElement("div");
  timerEl.style.cssText = STYLE_TIMER;
  timerEl.textContent = "1:30.0";
  wrapper.appendChild(timerEl);

  const cluesEl = document.createElement("div");
  cluesEl.style.cssText = STYLE_CLUES;
  cluesEl.textContent = "clues used: 0";
  wrapper.appendChild(cluesEl);

  const statusEl = document.createElement("div");
  statusEl.style.cssText = STYLE_STATUS;
  wrapper.appendChild(statusEl);

  const tooltipEl = document.createElement("div");
  tooltipEl.style.cssText = STYLE_TOOLTIP;
  tooltipEl.style.opacity = "0";
  wrapper.appendChild(tooltipEl);

  const loupeEl = document.createElement("div");
  loupeEl.style.cssText = STYLE_LOUPE;
  loupeEl.style.opacity = "0";
  wrapper.appendChild(loupeEl);

  const raycaster = new THREE.Raycaster();
  const mouseNdc = new THREE.Vector2();
  // Mutated in place per mousemove (was reallocated as a fresh literal —
  // up to 1 kHz worth of garbage on high-poll-rate mice).
  const mouseClient = { x: -10, y: -10, has: false };
  const intersects: THREE.Intersection[] = [];
  const hoverScratch: HudHoverInfo = {
    tag: null,
    object: null,
    clientX: 0,
    clientY: 0,
  };

  // Cache the canvas rect — getBoundingClientRect forces a layout flush
  // and we don't want one per mousemove.
  let rectLeft = 0;
  let rectTop = 0;
  let rectWidth = 1;
  let rectHeight = 1;
  const refreshRect = (): void => {
    const rect = container.getBoundingClientRect();
    rectLeft = rect.left;
    rectTop = rect.top;
    rectWidth = Math.max(1, rect.width);
    rectHeight = Math.max(1, rect.height);
  };
  refreshRect();
  window.addEventListener("resize", refreshRect);

  const updatePointerFromClient = (clientX: number, clientY: number): void => {
    mouseNdc.x = ((clientX - rectLeft) / rectWidth) * 2 - 1;
    mouseNdc.y = -((clientY - rectTop) / rectHeight) * 2 + 1;
    mouseClient.x = clientX - rectLeft;
    mouseClient.y = clientY - rectTop;
    mouseClient.has = true;
  };

  const onMouseMove = (e: MouseEvent): void => {
    updatePointerFromClient(e.clientX, e.clientY);
  };
  const onPointerMove = (e: PointerEvent): void => {
    updatePointerFromClient(e.clientX, e.clientY);
  };
  const onPointerDown = (e: PointerEvent): void => {
    updatePointerFromClient(e.clientX, e.clientY);
  };
  container.addEventListener("mousemove", onMouseMove);
  container.addEventListener("pointermove", onPointerMove);
  container.addEventListener("pointerdown", onPointerDown, { passive: true });

  // Cache last text written so we don't churn the DOM every frame
  // (timer ticks tenths-of-seconds; status/clues change rarely).
  let lastTimerText = "";
  function setTimer(remainingMs: number): void {
    const sec = Math.max(0, remainingMs / 1000);
    const m = Math.floor(sec / 60);
    const s = (sec - m * 60).toFixed(1).padStart(4, "0");
    const next = `${m}:${s}`;
    if (next !== lastTimerText) {
      lastTimerText = next;
      timerEl.textContent = next;
    }
  }
  function setCluesUsed(n: number): void {
    cluesEl.textContent = `clues used: ${n}`;
  }
  function setStatusText(text: string | null): void {
    statusEl.textContent = text ?? "";
  }
  function setHover(tag: string | null, hint?: string): void {
    if (tag && hint) {
      tooltipEl.textContent = hint;
      tooltipEl.style.opacity = "1";
      tooltipEl.style.left = `${mouseClient.x}px`;
      tooltipEl.style.top = `${mouseClient.y}px`;
      loupeEl.style.opacity = "0.95";
      loupeEl.style.left = `${mouseClient.x}px`;
      loupeEl.style.top = `${mouseClient.y}px`;
    } else if (tag) {
      tooltipEl.style.opacity = "0";
      loupeEl.style.opacity = "0.7";
      loupeEl.style.left = `${mouseClient.x}px`;
      loupeEl.style.top = `${mouseClient.y}px`;
    } else {
      tooltipEl.style.opacity = "0";
      loupeEl.style.opacity = "0";
    }
  }

  function update(camera: THREE.Camera): HudHoverInfo {
    if (!mouseClient.has) {
      hoverScratch.tag = null;
      hoverScratch.object = null;
      hoverScratch.clientX = 0;
      hoverScratch.clientY = 0;
      return hoverScratch;
    }
    raycaster.setFromCamera(mouseNdc, camera as THREE.PerspectiveCamera);
    intersects.length = 0;
    raycaster.intersectObjects(
      diorama.hoverables as THREE.Object3D[],
      false,
      intersects,
    );
    const first = intersects[0];
    hoverScratch.tag =
      first && typeof first.object.userData.tag === "string"
        ? (first.object.userData.tag as string)
        : null;
    hoverScratch.object = first ? first.object : null;
    hoverScratch.clientX = mouseClient.x;
    hoverScratch.clientY = mouseClient.y;
    return hoverScratch;
  }

  function destroy(): void {
    container.removeEventListener("mousemove", onMouseMove);
    container.removeEventListener("pointermove", onPointerMove);
    container.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("resize", refreshRect);
    wrapper.remove();
  }

  return {
    element: wrapper,
    setTimer,
    setCluesUsed,
    setStatusText,
    setHover,
    update,
    destroy,
  };
}
