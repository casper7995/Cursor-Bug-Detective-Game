/**
 * Fullscreen 2D canvas overlay for the arcade-style code-runner (above WebGL).
 */

export interface RunnerOverlayViewport {
  /** CSS pixels (logical width). */
  readonly cssW: number;
  readonly cssH: number;
  readonly dpr: number;
}

export interface RunnerOverlay {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  getViewport(): RunnerOverlayViewport;
  /** 0..1 from computed opacity (best-effort). */
  getOpacity(): number;
  fadeIn(durationMs: number): Promise<void>;
  fadeOut(durationMs: number): Promise<void>;
  dispose(): void;
}

export function createRunnerOverlay(container: HTMLElement): RunnerOverlay {
  const canvas = document.createElement("canvas");
  canvas.className = "bd-runner";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;z-index:90000;opacity:0;pointer-events:none;transition:opacity 220ms ease";

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable for runner overlay");

  container.appendChild(canvas);

  let resizeHandler: (() => void) | null = null;

  const syncSize = (): void => {
    const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
  };

  syncSize();
  resizeHandler = syncSize;
  window.addEventListener("resize", resizeHandler);

  const getViewport = (): RunnerOverlayViewport => ({
    cssW: window.innerWidth,
    cssH: window.innerHeight,
    dpr: Math.min(window.devicePixelRatio ?? 1, 2),
  });

  const getOpacity = (): number => {
    const o = parseFloat(getComputedStyle(canvas).opacity);
    return Number.isFinite(o) ? o : 0;
  };

  const waitTransition = (ms: number, targetOpacity: number): Promise<void> => {
    return new Promise((resolve) => {
      const safety = window.setTimeout(() => resolve(), ms + 120);
      const onEnd = (e: TransitionEvent): void => {
        if (e.propertyName !== "opacity") return;
        canvas.removeEventListener("transitionend", onEnd);
        window.clearTimeout(safety);
        resolve();
      };
      canvas.addEventListener("transitionend", onEnd);
      requestAnimationFrame(() => {
        canvas.style.opacity = String(targetOpacity);
      });
    });
  };

  return {
    canvas,
    ctx,
    getViewport,
    getOpacity,
    fadeIn(durationMs: number): Promise<void> {
      canvas.style.transitionDuration = `${durationMs}ms`;
      return waitTransition(durationMs, 1);
    },
    fadeOut(durationMs: number): Promise<void> {
      canvas.style.transitionDuration = `${durationMs}ms`;
      return waitTransition(durationMs, 0);
    },
    dispose(): void {
      if (resizeHandler) window.removeEventListener("resize", resizeHandler);
      canvas.remove();
    },
  };
}
