/**
 * One-time runner tutorial card (localStorage `bd:miniTutorial:runner`).
 * Shown above the fullscreen runner overlay on first launch.
 */

const STORAGE_KEY = "bd:miniTutorial:runner";

export function tryMountRunnerTutorialGate(
  container: HTMLElement,
): HTMLElement | null {
  try {
    if (localStorage.getItem(STORAGE_KEY) === "1") return null;
  } catch {
    return null;
  }

  const panel = document.createElement("div");
  panel.id = "bd-runner-tutorial";
  panel.style.cssText =
    "position:fixed;inset:0;z-index:95000;display:flex;align-items:center;justify-content:center;background:rgba(6,5,4,0.72);pointer-events:auto;";
  panel.innerHTML = `
    <div style="max-width:420px;margin:20px;padding:22px 24px;border-radius:14px;background:#1a1812;border:1px solid rgba(245,78,0,0.45);color:#efe7d7;font-family:ui-sans-serif,system-ui,sans-serif;">
      <h2 style="margin:0 0 10px;font-size:18px;">Code run</h2>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.45;opacity:0.9;">
        Daily run: reach the upload target to bank the monitor clue. Space (or Up / W) jumps, hold Right or D to burn boost over long gaps, and Esc exits back to the desk.
      </p>
      <button type="button" data-testid="bd-runner-tutorial-dismiss" style="padding:10px 18px;border-radius:10px;border:1px solid rgba(245,78,0,0.55);background:rgba(245,78,0,0.18);color:#fff;font-weight:600;cursor:pointer;">
        Got it — start the run
      </button>
    </div>
  `;
  const dismiss = (): void => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    panel.remove();
  };
  const btn = panel.querySelector<HTMLButtonElement>(
    "[data-testid='bd-runner-tutorial-dismiss']",
  );
  btn?.addEventListener("click", dismiss);
  panel.addEventListener("click", (e) => {
    if (e.target === panel) dismiss();
  });
  container.appendChild(panel);
  return panel;
}
