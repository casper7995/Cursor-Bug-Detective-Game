import * as THREE from "three";
import type { DioramaObjects } from "../scene/desktopDiorama";
import { preferredDeskHoverHit } from "../scene/propInteractions";
import type { NotebookState } from "../game/notebook";
import type { SessionScoreboardView } from "../game/sessionScoreboard";
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
  /**
   * Personal in-session minigame bests (not the shared daily leaderboard).
   * Call from main after recording a score or clearing the session.
   */
  setSessionScores(view: SessionScoreboardView): void;
  /** Primary action — only enabled with four evidence pages. */
  onMakeTheCall(handler: (() => void) | null): void;
  setStatusText(text: string | null): void;
  /** Secondary line under status — exploration / evidence progress (not hover tooltips). */
  setExplorationHint(text: string | null): void;
  setHover(tag: string | null, hint?: string | undefined): void;
  /** Lower-third flavor line during click-to-inspect on props. */
  setInspectCaption(text: string | null): void;
  /** Click target next to caption — same as Esc / MenuBack for inspect zoom. */
  onInspectExit(handler: (() => void) | null): void;
  /** One dolly step wider (match wheel zoom-out). */
  onInspectWider(handler: (() => void) | null): void;
  /** Return to the default investigation framing (and exit flavor/hover inspect). */
  onInspectResetView(handler: (() => void) | null): void;
  /**
   * Shown over the 3D view when the camera is pulled in; pointer-events none.
   * Use to surface scroll/keyboard zoom when wheel alone is easy to miss.
   */
  setViewZoomHint(text: string | null): void;
  update(camera: THREE.Camera): HudHoverInfo;
  destroy(): void;
}

const STYLE_STATUS =
  "position:relative;width:100%;margin:0;padding:0;color:#efe7d7;font:600 14px 'Cursor Gothic',ui-sans-serif,system-ui,sans-serif;pointer-events:none;text-shadow:0 1px 2px rgba(0,0,0,0.7);letter-spacing:0.04em;text-align:center;";
const STYLE_EXPLORATION =
  "position:relative;width:100%;margin:6px 0 0;padding:0;max-width:100%;text-align:center;color:rgba(239,231,215,0.78);font:500 12px 'Cursor Gothic',ui-sans-serif,system-ui,sans-serif;pointer-events:none;text-shadow:0 1px 2px rgba(0,0,0,0.65);line-height:1.35;";
const STYLE_TOOLTIP =
  "position:absolute;pointer-events:none;background:rgba(26,24,18,0.94);color:#edecec;border:1px solid rgba(245,78,0,0.35);border-radius:14px;padding:6px 12px;font:12px ui-sans-serif,sans-serif;transform:translate(-50%,calc(-100% - 14px));white-space:nowrap;box-shadow:0 4px 18px rgba(0,0,0,0.5);transition:opacity 80ms;";
const STYLE_LOUPE =
  "position:absolute;width:64px;height:64px;border-radius:50%;border:3px solid rgba(239,231,215,0.55);background:radial-gradient(circle at 35% 35%,rgba(239,231,215,0.12),rgba(239,231,215,0.04));pointer-events:none;transform:translate(-50%,-50%);box-shadow:0 0 0 1px rgba(0,0,0,0.4),0 6px 18px rgba(0,0,0,0.45);transition:opacity 100ms;";

const SLOT_LABEL: Record<string, string> = {
  runner: "MONITOR",
  sentence: "ENVELOPE",
  errand: "AGENTS",
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
    // SH-6: was opacity 0.25 with em-dash — read as muted/empty rather than
    // "to be filled". Now uses an underscore placeholder at higher contrast
    // so the player sees this as a trackable slot.
    tok.style.cssText = `font:600 11px 'Cursor Mono','Berkeley Mono',monospace;color:${CURSOR.text};opacity:0.55;text-transform:uppercase;letter-spacing:0.08em;`;
    tok.textContent = "_ _ _ _";
    c.appendChild(tok);
    cardRow.appendChild(c);
  }
  evidencePanel.appendChild(cardRow);

  const sessionWrap = document.createElement("div");
  sessionWrap.style.cssText = `margin-top:4px;max-width:min(96vw,520px);border:1px solid rgba(192,133,50,0.3);border-radius:8px;padding:6px 8px;background:rgba(20,18,11,0.5);pointer-events:none;`;
  const sessionTitleEl = document.createElement("div");
  sessionTitleEl.style.cssText = `font:600 9px 'Cursor Gothic',sans-serif;letter-spacing:0.1em;color:${CURSOR.gold};opacity:0.9;margin-bottom:4px;`;
  sessionTitleEl.textContent = "TODAY · YOU";
  const sessionBodyEl = document.createElement("div");
  sessionBodyEl.style.cssText = "display:flex;flex-direction:column;gap:3px;";
  sessionWrap.appendChild(sessionTitleEl);
  sessionWrap.appendChild(sessionBodyEl);
  evidencePanel.appendChild(sessionWrap);

  function setSessionScores(view: SessionScoreboardView): void {
    sessionTitleEl.textContent = view.title.toUpperCase();
    sessionBodyEl.textContent = "";
    for (const r of view.rows) {
      const line = document.createElement("div");
      line.style.cssText = `font:500 9px 'Cursor Mono',ui-monospace,monospace;color:rgba(237,236,236,0.9);line-height:1.25;word-break:break-word;`;
      line.textContent = `${r.label}  ${r.line}`;
      sessionBodyEl.appendChild(line);
    }
  }

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

  /** Top status + objective sit in this column so they never cover the evidence cards. */
  const topMessageColumn = document.createElement("div");
  topMessageColumn.style.cssText =
    "position:absolute;left:0;right:0;top:0;pointer-events:none;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;";

  const topMessageInner = document.createElement("div");
  topMessageInner.style.cssText =
    "width:100%;max-width:min(92vw,520px);text-align:center;box-sizing:border-box;";

  const statusEl = document.createElement("div");
  statusEl.style.cssText = STYLE_STATUS;
  const explorationEl = document.createElement("div");
  explorationEl.style.cssText = STYLE_EXPLORATION;
  explorationEl.style.opacity = "0";
  topMessageInner.appendChild(statusEl);
  topMessageInner.appendChild(explorationEl);
  topMessageColumn.appendChild(topMessageInner);
  wrapper.appendChild(topMessageColumn);

  const refreshTopMessageInset = (): void => {
    const c = container.getBoundingClientRect();
    const ev = evidencePanel.getBoundingClientRect();
    const rightPad = 56;
    const minCenter = 200;
    const leftGap = 10;
    const proposedLeft = Math.max(12, ev.right - c.left + leftGap);
    if (c.width - proposedLeft - rightPad < minCenter) {
      topMessageColumn.style.paddingLeft = "12px";
      topMessageColumn.style.paddingRight = `${rightPad}px`;
      topMessageColumn.style.paddingTop = `${Math.max(12, ev.bottom - c.top + 8)}px`;
    } else {
      topMessageColumn.style.paddingTop = "14px";
      topMessageColumn.style.paddingLeft = `${proposedLeft}px`;
      topMessageColumn.style.paddingRight = `${rightPad}px`;
    }
  };
  window.addEventListener("resize", refreshTopMessageInset);
  const topLayoutObs =
    typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
          requestAnimationFrame(refreshTopMessageInset);
        })
      : null;
  if (topLayoutObs) {
    topLayoutObs.observe(evidencePanel);
    topLayoutObs.observe(container);
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(refreshTopMessageInset);
  });

  const tooltipEl = document.createElement("div");
  tooltipEl.style.cssText = STYLE_TOOLTIP;
  tooltipEl.style.opacity = "0";
  wrapper.appendChild(tooltipEl);

  const loupeEl = document.createElement("div");
  loupeEl.style.cssText = STYLE_LOUPE;
  loupeEl.style.opacity = "0";
  wrapper.appendChild(loupeEl);

  const inspectBarWrap = document.createElement("div");
  inspectBarWrap.style.cssText = `position:absolute;left:50%;bottom:18px;transform:translateX(-50%);max-width:min(92vw,560px);display:none;flex-direction:column;align-items:stretch;gap:10px;padding:10px 14px;border-radius:12px;background:rgba(245,240,232,0.94);color:${CURSOR.ink};border:1px solid rgba(245,78,0,0.35);box-shadow:0 6px 22px rgba(0,0,0,0.35);pointer-events:auto;opacity:0;transition:opacity 120ms;`;
  const inspectCaptionText = document.createElement("div");
  inspectCaptionText.style.cssText =
    "width:100%;font:500 13px 'Cursor Gothic',ui-sans-serif,sans-serif;text-align:center;min-width:0;";
  inspectBarWrap.appendChild(inspectCaptionText);

  const inspectWiderBtn = document.createElement("button");
  inspectWiderBtn.type = "button";
  inspectWiderBtn.textContent = "Wider";
  inspectWiderBtn.title =
    "Pull back one step (scroll down or −). On the desk: switches to wide view when close.";
  inspectWiderBtn.style.cssText = `padding:6px 12px;border-radius:8px;border:1px solid rgba(32,32,32,0.2);background:rgba(255,255,255,0.88);color:${CURSOR.ink};font:600 12px 'Cursor Gothic',ui-sans-serif,sans-serif;cursor:pointer;`;
  const inspectResetBtn = document.createElement("button");
  inspectResetBtn.type = "button";
  inspectResetBtn.textContent = "Reset view";
  inspectResetBtn.title = "Back to the default desk framing";
  inspectResetBtn.style.cssText = inspectWiderBtn.style.cssText;
  const inspectExitBtn = document.createElement("button");
  inspectExitBtn.type = "button";
  inspectExitBtn.textContent = "Exit · Esc";
  inspectExitBtn.style.cssText = `padding:6px 14px;border-radius:8px;border:1px solid rgba(245,78,0,0.45);background:rgba(255,255,255,0.92);color:${CURSOR.ink};font:600 12px 'Cursor Gothic',ui-sans-serif,sans-serif;cursor:pointer;`;
  const inspectButtonRow = document.createElement("div");
  inspectButtonRow.style.cssText =
    "display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;flex-shrink:0;";
  inspectButtonRow.appendChild(inspectWiderBtn);
  inspectButtonRow.appendChild(inspectResetBtn);
  inspectButtonRow.appendChild(inspectExitBtn);
  inspectBarWrap.appendChild(inspectButtonRow);
  let inspectExitHandler: (() => void) | null = null;
  let inspectWiderHandler: (() => void) | null = null;
  let inspectResetViewHandler: (() => void) | null = null;
  inspectExitBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
    inspectExitHandler?.();
  });
  inspectWiderBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
    inspectWiderHandler?.();
  });
  inspectResetBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
    inspectResetViewHandler?.();
  });
  wrapper.appendChild(inspectBarWrap);

  const viewZoomHintEl = document.createElement("div");
  viewZoomHintEl.style.cssText = `position:absolute;left:50%;bottom:80px;transform:translateX(-50%);max-width:min(92vw,480px);text-align:center;padding:6px 12px;border-radius:10px;background:rgba(20,18,11,0.75);color:rgba(239,231,215,0.9);font:500 12px 'Cursor Gothic',ui-sans-serif,system-ui,sans-serif;pointer-events:none;text-shadow:0 1px 2px rgba(0,0,0,0.65);line-height:1.35;opacity:0;transition:opacity 160ms;`;
  viewZoomHintEl.setAttribute("aria-hidden", "true");
  wrapper.appendChild(viewZoomHintEl);

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

  function syncExplorationFromNotebook(nb: NotebookState): void {
    const slots = ["runner", "sentence", "errand", "tamper"] as const;
    let n = 0;
    for (const s of slots) {
      if (nb[s]) n++;
    }
    if (n === 0) {
      explorationEl.textContent =
        "Objective: hover the desk, spot what feels wrong, and open the monitor, envelope, agents tray, and lamp for four cipher clues.";
      explorationEl.style.opacity = "1";
      return;
    }
    if (n === 4) {
      explorationEl.textContent =
        "Objective complete: all four cipher clues are pinned. Press Enter or click Make the call.";
      explorationEl.style.opacity = "1";
      return;
    }
    const labels: Record<(typeof slots)[number], string> = {
      runner: "monitor",
      sentence: "envelope",
      errand: "agents tray",
      tamper: "lamp",
    };
    const missing = slots
      .filter((s) => !nb[s])
      .map((s) => labels[s])
      .join(", ");
    explorationEl.textContent = `Evidence ${n}/4 — keep investigating. Still missing: ${missing}.`;
    explorationEl.style.opacity = "1";
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
        tok.style.letterSpacing = "normal";
      } else {
        // SH-6: empty slot reads as a fillable tracker, not a broken state.
        card.style.border = "1px dashed rgba(192,133,50,0.55)";
        card.style.background = "rgba(20,18,11,0.35)";
        card.style.boxShadow = "none";
        tok.textContent = "_ _ _ _";
        tok.removeAttribute("title");
        tok.style.opacity = "0.55";
        tok.style.color = CURSOR.text;
        tok.style.letterSpacing = "0.08em";
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
    syncExplorationFromNotebook(nb);
    requestAnimationFrame(refreshTopMessageInset);
  }

  function onMakeTheCall(handler: (() => void) | null): void {
    makeCallHandler = handler;
  }

  function setStatusText(text: string | null): void {
    statusEl.textContent = text ?? "";
    requestAnimationFrame(refreshTopMessageInset);
  }
  function setExplorationHint(text: string | null): void {
    if (text === null || text === "") {
      explorationEl.textContent = "";
      explorationEl.style.opacity = "0";
      requestAnimationFrame(refreshTopMessageInset);
      return;
    }
    explorationEl.textContent = text;
    explorationEl.style.opacity = "1";
    requestAnimationFrame(refreshTopMessageInset);
  }
  function setInspectCaption(text: string | null): void {
    if (text) {
      inspectCaptionText.textContent = text;
      inspectBarWrap.style.display = "flex";
      inspectBarWrap.style.flexDirection = "column";
      inspectBarWrap.style.opacity = "1";
    } else {
      inspectCaptionText.textContent = "";
      inspectBarWrap.style.opacity = "0";
      inspectBarWrap.style.display = "none";
    }
  }

  function onInspectExit(handler: (() => void) | null): void {
    inspectExitHandler = handler;
  }
  function onInspectWider(handler: (() => void) | null): void {
    inspectWiderHandler = handler;
  }
  function onInspectResetView(handler: (() => void) | null): void {
    inspectResetViewHandler = handler;
  }
  function setViewZoomHint(text: string | null): void {
    if (text) {
      viewZoomHintEl.textContent = text;
      viewZoomHintEl.style.opacity = "1";
    } else {
      viewZoomHintEl.textContent = "";
      viewZoomHintEl.style.opacity = "0";
    }
  }

  function setHover(tag: string | null, hint?: string): void {
    if (tag && hint) {
      tooltipEl.textContent = hint;
      tooltipEl.style.opacity = "1";
      tooltipEl.style.left = `${mouseClient.x}px`;
      tooltipEl.style.top = `${mouseClient.y}px`;
      // SH-3: when the cursor is near the top, the tooltip's default
      // (transform: translate(-50%, calc(-100% - 14px))) draws into the
      // HUD evidence row. Flip below the cursor inside the HUD safe zone.
      const HUD_SAFE_TOP = 110;
      const flipBelow = mouseClient.y < HUD_SAFE_TOP;
      tooltipEl.style.transform = flipBelow
        ? "translate(-50%, 14px)"
        : "translate(-50%, calc(-100% - 14px))";
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
    const first = preferredDeskHoverHit(intersects);
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
    window.removeEventListener("resize", refreshTopMessageInset);
    topLayoutObs?.disconnect();
    wrapper.remove();
  }

  setNotebook({});

  return {
    element: wrapper,
    setTimer,
    hideTimer,
    setNotebook,
    setSessionScores,
    onMakeTheCall,
    setStatusText,
    setExplorationHint,
    setHover,
    setInspectCaption,
    onInspectExit,
    onInspectWider,
    onInspectResetView,
    setViewZoomHint,
    update,
    destroy,
  };
}
