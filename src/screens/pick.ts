import type { CharacterKind } from "../types";
import { Input } from "../input";
import { clear, text } from "../render";

export interface PickResult {
  character: CharacterKind;
}

const ROSTER: { kind: CharacterKind; label: string; tagline: string }[] = [
  { kind: "arrow", label: "ARROW", tagline: "balanced — ranged shots" },
  { kind: "ibeam", label: "I-BEAM", tagline: "fast — melee combo" },
  { kind: "hand", label: "HAND", tagline: "grabs + throws enemies" },
  { kind: "spinner", label: "SPINNER", tagline: "slow — spin AoE" },
  {
    kind: "crosshair",
    label: "CROSSHAIR",
    tagline: "very slow — high dmg snipe",
  },
];

export function showPickScreen(
  ctx: CanvasRenderingContext2D,
): Promise<PickResult> {
  Input.consumePress();
  return new Promise((resolve) => {
    let selected = 0;
    let confirmWithKeyboard = false;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        selected = (selected + 1) % ROSTER.length;
        e.preventDefault();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        selected = (selected - 1 + ROSTER.length) % ROSTER.length;
        e.preventDefault();
      } else if (e.key === "Enter" || e.key === " ") {
        confirmWithKeyboard = true;
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    function frame(): void {
      const w = window.innerWidth;
      const h = window.innerHeight;
      clear(ctx, w, h);
      text(ctx, "CURSOR CREW", w / 2, 80, { size: 36, align: "center" });
      text(ctx, "pick your cursor — click a card or ← → then ENTER", w / 2, 110, {
        color: "#888",
        align: "center",
      });
      const cardW = 180;
      const cardH = 200;
      const gap = 16;
      const totalW = ROSTER.length * cardW + (ROSTER.length - 1) * gap;
      const x0 = (w - totalW) / 2;
      const y0 = h / 2 - cardH / 2;
      const px = Input.pointer.x;
      const py = Input.pointer.y;
      let hovered: CharacterKind | null = null;
      for (let i = 0; i < ROSTER.length; i++) {
        const cx = x0 + i * (cardW + gap);
        const isHover =
          px >= cx && px <= cx + cardW && py >= y0 && py <= y0 + cardH;
        const isSelected = i === selected;
        const highlight = isHover || isSelected;
        ctx.fillStyle = highlight ? "#1e1e2e" : "#0f0f18";
        ctx.fillRect(cx, y0, cardW, cardH);
        ctx.strokeStyle = highlight ? "#fff" : "#444";
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.strokeRect(cx, y0, cardW, cardH);
        text(ctx, ROSTER[i]!.label, cx + cardW / 2, y0 + 40, {
          align: "center",
          size: 16,
        });
        text(ctx, ROSTER[i]!.tagline, cx + cardW / 2, y0 + cardH - 24, {
          align: "center",
          color: "#aaa",
          size: 11,
        });
        if (isHover) hovered = ROSTER[i]!.kind;
      }
      if (confirmWithKeyboard) {
        confirmWithKeyboard = false;
        window.removeEventListener("keydown", onKey);
        resolve({ character: ROSTER[selected]!.kind });
        return;
      }
      if (hovered && Input.consumePress()) {
        window.removeEventListener("keydown", onKey);
        resolve({ character: hovered });
        return;
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}
