import * as THREE from "three";
import type { DioramaObjects } from "../scene/desktopDiorama";
import type { NotebookState } from "../game/notebook";
import { CURSOR } from "./cursorTheme";

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
  hideTimer(): void;
  setNotebook(nb: NotebookState): void;
  /** Primary action — only enabled with four evidence pages. */
  onMakeTheCall(handler: (() => void) | null): void;
  setStatusText(text: string | null): void;
  setHover(tag: string | null, hint?: string | undefined): void;
  /** Lower-third flavor line during click-to-inspect on props. */
  setInspectCaption(text: string | null): void;
  update(camera: THREE.Camera): HudHoverInfo;
  destroy(): void;
}

const STYLE_STATUS =
  "position:absolute;left:50%;transform:translateX(-50%);top:14px;color:#efe7d7;font:600 14px 'Cursor Gothic',ui-sans-serif,system-ui,sans-serif;pointer-events:none;text-shadow:0 1px 2px rgba(0,0,0,0.7);letter-spacing:0.04em;";
const STYLE_TOOLTIP =
  "position:absolute;pointer-events:none;background:rgba(26,24,18,0.94);color:#edecec;border:1px solid rgba(245,78,0,0.35);border-radius:14px;padding:6px 12px;font:12px ui-sans-serif,sans-serif;transform:translate(-50%,calc(-100% - 14px));white-space:nowrap;box-shadow:0 4px 18px rgba(0,0,0,0.5);transition:opacity 80ms;";
const STYLE_LOUPE =
  "position:absolute;width:64px;height:64px;border-radius:50%;border:3px solid rgba(239,231,215,0.55);background:radial-gradient(circle at 35% 35%,rgba(239,231,215,0.12),rgba(239,231,215,0.04));pointer-events:none;transform:translate(-50%,-50%);box-shadow:0 0 0 1px rgba(0,0,0,0.4),0 6px 18px rgba(0,0,0,0.45);transition:opacity 100ms;";

const SLOT_LABEL: Record<string, string> = {
  runner: "MONITOR",
  sentence: "ENVELOPE",
  errand: "REAGENT",
  tamper: "LAMP",
};

export function createHud(
  container: HTMLElement,
  diorama: DioramaObjects,
): Hud {
  const wrapper = document.createElement("div");
  wrapper.id = "hud";
  wrapper.style.cssText =
    "position:absolute;inset:0;pointer-events:none;font-family:'Cursor Gothic',ui-sans-serif,system-ui,sans-serif;";
  container.appendChild(wrapper);

  const timerEl = document.createElement("div");
  timerEl.style.cssText = "display:none";
  wrapper.appendChild(timerEl);

  const evidencePanel = document.createElement("div");
  evidencePanel.style.cssText = `position:absolute;top:12px;left:12px;display:flex;flex-direction:column;gap:6px;pointer-events:none;`;
  const evLabel = document.createElement("div");
  evLabel.textContent = "EVIDENCE";
  evLabel.style.cssText = `font:600 11px 'Cursor Gothic',ui-sans-serif,sans-serif;letter-spacing:0.12em;color:${CURSOR.gold};text-shadow:0 1px 2px rgba(0,0,0,0.6);`;
  evidencePanel.appendChild(evLabel);

  const cardRow = document.createElement("div");
  cardRow.style.cssText =
    "display:flex;flex-direction:row;gap:8px;flex-wrap:wrap;max-width:min(96vw,520px);";
  const cardEls: Record<string, HTMLDivElement> = {};
  for (const slot of ["runner", "sentence", "errand", "tamper"] as const) {
    const c = document.createElement("div");
    c.style.cssText = `width:112px;min-height:52px;box-sizing:border-box;border:1px dashed rgba(192,133,50,0.55);border-radius:6px;padding:6px 8px;background:rgba(20,18,11,0.35);`;
    c.dataset.slot = slot;
    cardEls[slot] = c;
    const small = document.createElement("div");
    small.textContent = SLOT_LABEL[slot];
    small.style.cssText = `font:600 9px 'Cursor Gothic',sans-serif;letter-spacing:0.06em;color:${CURSOR.gold};opacity:0.85;margin-bottom:4px;`;
    c.appendChild(small);
    const tok = document.createElement("div");
    tok.className = "tok";
    tok.style.cssText = `font:600 11px 'Cursor Mono','Berkeley Mono',monospace;color:${CURSOR.text};opacity:0.25;text-transform:uppercase;`;
    tok.textContent = "—";
    c.appendChild(tok);
    cardRow.appendChild(c);
  }
  evidencePanel.appendChild(cardRow);
  wrapper.appendChild(evidencePanel);

  const makeCallBtn = document.createElement("button");
  makeCallBtn.type = "button";
  makeCallBtn.textContent = "Make the call";
  makeCallBtn.style.cssText = `position:absolute;bottom:22px;right:18px;padding:12px 22px;border-radius:10px;font:600 14px 'Cursor Gothic',sans-serif;cursor:pointer;pointer-events:auto;transition:background 120ms,border-color 120ms,opacity 120ms;`;
  makeCallBtn.disabled = true;
  wrapper.appendChild(makeCallBtn);

  let makeCallHandler: (() => void) | null = null;
  makeCallBtn.addEventListener("click", () => {
    if (!makeCallBtn.disabled && makeCallHandler) makeCallHandler();
  });

  const styleBreathing = document.createElement("style");
  styleBreathing.textContent = `
    @keyframes bd-breathe { 0%,100%{opacity:1} 50%{opacity:0.72} }
    .bd-call-ready { animation: bd-breathe 2s ease-in-out infinite; }
  `;
  wrapper.appendChild(styleBreathing);

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

  const inspectCaptionEl = document.createElement("div");
  inspectCaptionEl.style.cssText = `position:absolute;left:50%;bottom:18px;transform:translateX(-50%);max-width:min(92vw,560px);padding:10px 18px;border-radius:12px;background:rgba(245,240,232,0.94);color:${CURSOR.ink};border:1px solid rgba(245,78,0,0.35);font:500 13px 'Cursor Gothic',ui-sans-serif,sans-serif;text-align:center;pointer-events:none;box-shadow:0 6px 22px rgba(0,0,0,0.35);opacity:0;transition:opacity 120ms;`;
  wrapper.appendChild(inspectCaptionEl);

  const raycaster = new THREE.Raycaster();
  const mouseNdc = new THREE.Vector2();
  const mouseClient = { x: -10, y: -10, has: false };
  const intersects: THREE.Intersection[] = [];
  const hoverScratch: HudHoverInfo = {
    tag: null,
    object: null,
    clientX: 0,
    clientY: 0,
  };

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

  let lastTimerText = "";
  function setTimer(remainingMs: number): void {
    timerEl.style.display = "";
    const sec = Math.max(0, remainingMs / 1000);
    const m = Math.floor(sec / 60);
    const s = (sec - m * 60).toFixed(1).padStart(4, "0");
    const next = `${m}:${s}`;
    if (next !== lastTimerText) {
      lastTimerText = next;
      timerEl.textContent = next;
    }
  }
  function hideTimer(): void {
    timerEl.style.display = "none";
  }

  function setNotebook(nb: NotebookState): void {
    const full =
      nb.runner && nb.sentence && nb.errand && nb.tamper ? true : false;
    for (const slot of ["runner", "sentence", "errand", "tamper"] as const) {
      const card = cardEls[slot]!;
      const page = nb[slot];
      const tok = card.querySelector(".tok") as HTMLDivElement;
      if (page) {
        card.style.border = `1px solid rgba(245,78,0,0.4)`;
        card.style.background = CURSOR.warmCream;
        card.style.boxShadow = "0 4px 14px rgba(245,78,0,0.18)";
        tok.textContent = page.clueToken.toUpperCase();
        tok.title =
          "Clue word from this minigame (not a “wrong guess” marker).";
        tok.style.opacity = "1";
        tok.style.color = CURSOR.ink;
      } else {
        card.style.border = "1px dashed rgba(192,133,50,0.55)";
        card.style.background = "rgba(20,18,11,0.35)";
        card.style.boxShadow = "none";
        tok.textContent = "—";
        tok.removeAttribute("title");
        tok.style.opacity = "0.25";
        tok.style.color = CURSOR.text;
      }
    }
    makeCallBtn.disabled = !full;
    if (full) {
      makeCallBtn.style.border = `2px solid ${CURSOR.orange}`;
      makeCallBtn.style.background = `linear-gradient(180deg, rgba(245,78,0,0.15), rgba(26,24,18,0.9))`;
      makeCallBtn.style.color = CURSOR.textHi;
      makeCallBtn.classList.add("bd-call-ready");
    } else {
      makeCallBtn.style.border = `1px solid rgba(237,236,236,0.3)`;
      makeCallBtn.style.background = "rgba(20,18,11,0.55)";
      makeCallBtn.style.color = "rgba(237,236,236,0.45)";
      makeCallBtn.classList.remove("bd-call-ready");
    }
  }

  function onMakeTheCall(handler: (() => void) | null): void {
    makeCallHandler = handler;
  }

  function setStatusText(text: string | null): void {
    statusEl.textContent = text ?? "";
  }
  function setInspectCaption(text: string | null): void {
    if (text) {
      inspectCaptionEl.textContent = text;
      inspectCaptionEl.style.opacity = "1";
    } else {
      inspectCaptionEl.textContent = "";
      inspectCaptionEl.style.opacity = "0";
    }
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

  setNotebook({});

  return {
    element: wrapper,
    setTimer,
    hideTimer,
    setNotebook,
    onMakeTheCall,
    setStatusText,
    setHover,
    setInspectCaption,
    update,
    destroy,
  };
}
