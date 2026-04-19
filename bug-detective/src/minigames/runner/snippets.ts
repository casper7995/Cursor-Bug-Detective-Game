/**
 * Code strings shown on runner planks — width used by sim for plank sizing.
 * Themed lines (every other plank) embed anomaly keywords so clue highlighting works.
 */

import type { AnomalyId } from "../../scene/anomalies";

/** Must match `FONT_MONO` in runner `draw.ts` (used for width + on-screen snippets). */
export const SNIPPET_MONO_FONT =
  "13px 'Cursor Mono', 'Berkeley Mono', ui-monospace, monospace";

export const CODE_SNIPPETS: readonly string[] = [
  "const bug = await find(scene);",
  "if (clue.matches(suspect)) return clue;",
  "for (const obj of scene.children) inspect(obj);",
  "throw new Error(`anomaly: ${kind}`);",
  "scene.traverse(o => o.userData.tag && tag(o));",
  "await magnifier.scan({ x, y, radius: 0.5 });",
  "return { found: true, hint: 'check the monitor' };",
  "expect(detective.solve(case)).toBe('arrested');",
  "logger.debug('pointerdown', { x, y, target });",
  "const result = anomalies.filter(a => a.live);",
  "// TODO: replace with deterministic seeding",
  "type Anomaly = { id: string; severity: number };",
];

/** One themed line per anomaly — keywords overlap with deriveRunnerClueSet tokens. */
export const ANOMALY_SNIPPETS: Record<AnomalyId, readonly string[]> = {
  "calendar-tomorrow": [
    "if (calendar.day === tomorrow.getDate()) flag('off');",
    "// FIXME: date drifted by +1 — calendar.tomorrow",
    "expect(calendar.label).toBe(today.toString());",
  ],
  "mug-name": [
    "if (mug.label === user.name) suspect('familiar');",
    "// label feels familiar — mug printed wrong name",
    "const label = mug.label; trace('familiar', label);",
  ],
  "clock-ccw": [
    "if (reagent.tray.swirl === 'cw') rewind();",
    "// reagent tray — swirl runs wrong direction",
    "expect(reagent.direction).not.toBe('cw');",
  ],
  "monitor-reflection": [
    "if (monitor.reflection !== room) warn('off');",
    "// monitor — reflection looks off vs scene",
    "reflect(monitor, scene); // reflection bug",
  ],
  "photo-self": [
    "if (photo.face === user.self) alert('familiar');",
    "// photo — that face is familiar (self)",
    "expect(photo.subject).toBe('your own face');",
  ],
  "sticky-warning": [
    "if (evidence.envelope.text.includes('behind')) warn('yesterday');",
    "// evidence envelope — new message in case file",
    'envelope.note = "they\'re behind you";',
  ],
  "pen-floating": [
    "if (pen.floats && pen.above(desk)) trace('holding');",
    "// pen floats above desk — nothing holding it up",
    "physics.assert(pen.support === null); // floats",
  ],
  "lamp-shadow-wrong": [
    "if (shadow.direction !== light) bug('wrong');",
    "// shadow — wrong direction vs lamp",
    "expect(shadow.vector).toPointAwayFrom(lamp);",
  ],
  "steam-down": [
    "if (steam.velocity.y > 0) fix('coffee');",
    "// steam — drifting the wrong way (down)",
    "particles.steam.gravity = +1; // falls",
  ],
  "blank-book": [
    "if (book.pages.every(p => p.blank)) silent();",
    "// book — strangely silent (blank pages)",
    "expect(book.open).toHaveLength(0); // blank",
  ],
  "keyboard-extra-key": [
    "if (keyboard.keys.has('extra_red')) warn('many');",
    "// keyboard — one key too many",
    "layout.count(keyboard) > 104;",
  ],
  "plant-glitching": [
    "if (plant.leaves.twitch) renderGlitch();",
    "// plant — leaves twitching (wrong frame)",
    "plant.mesh.userData.glitching = true;",
  ],
};

/** Fallback widths (px) at 13px ui-monospace when `measureText` unavailable (tests). */
const FALLBACK_SNIPPET_WIDTHS: readonly number[] = [
  208, 248, 272, 200, 280, 272, 312, 320, 264, 272, 248, 280,
];

let measuredWidthsGeneric: readonly number[] | null = null;

function measureWidthsGeneric(): readonly number[] {
  if (typeof document === "undefined") return FALLBACK_SNIPPET_WIDTHS;
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  if (!ctx) return FALLBACK_SNIPPET_WIDTHS;
  ctx.font = SNIPPET_MONO_FONT;
  return CODE_SNIPPETS.map((s) => Math.ceil(ctx.measureText(s).width));
}

const widthByText = new Map<string, number>();

function measureTextWidth(text: string): number {
  const hit = widthByText.get(text);
  if (hit !== undefined) return hit;
  if (typeof document === "undefined") {
    const w = Math.ceil(text.length * 7.85);
    widthByText.set(text, w);
    return w;
  }
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  if (!ctx) {
    const w = Math.ceil(text.length * 7.85);
    widthByText.set(text, w);
    return w;
  }
  ctx.font = SNIPPET_MONO_FONT;
  const w = Math.ceil(ctx.measureText(text).width);
  widthByText.set(text, w);
  return w;
}

export function getSnippetWidths(): readonly number[] {
  measuredWidthsGeneric ??= measureWidthsGeneric();
  return measuredWidthsGeneric;
}

/** ~60% themed lines (embed anomaly keywords), rest generic filler. */
export function snippetTextForPlankId(
  id: number,
  anomalyId: AnomalyId = "calendar-tomorrow",
): string {
  if (id % 10 < 6) {
    const themed = ANOMALY_SNIPPETS[anomalyId];
    return themed[id % themed.length]!;
  }
  return CODE_SNIPPETS[id % CODE_SNIPPETS.length]!;
}

export function snippetWidthForPlankId(
  id: number,
  anomalyId: AnomalyId = "calendar-tomorrow",
): number {
  return measureTextWidth(snippetTextForPlankId(id, anomalyId));
}
