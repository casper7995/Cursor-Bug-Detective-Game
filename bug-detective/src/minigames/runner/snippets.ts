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
  "const seed = dailyHash(utcDate);",
  "type Anomaly = { id: string; severity: number };",
  "const evidence = await collect(scene, suspectId);",
  "if (witness.statement.contradicts(physics)) flag(witness);",
  "const fingerprint = sha1(scene.toJSON());",
  "for (const tip of leads) await chase(tip);",
  "if (alibi.timeline.gaps.length > 0) probe(alibi);",
  "const archive = await store.snapshot('case-7');",
  "return clues.reduce((acc, c) => acc.add(c), set);",
  "const sus = await profile.match(prints);",
  "if (door.locked && !window.cracked) impossible();",
  "const hash = murmur(transcript.join('\\n'));",
  "while (loose.ends.length) tie(loose.ends.pop()!);",
  "const trail = follow(footprints, mud.ph);",
  "if (motive && opportunity && means) charge();",
  "const cipher = key.decode(message);",
  "expect(courtroom.verdict).toBe('guilty');",
  "for (const w of witnesses) cross.examine(w);",
  "const drift = compass.declination - true_north;",
  "if (silence.before(scream)) suspect.witnessed();",
  "// every shadow casts a confession somewhere",
  "// the city remembers what the file forgot",
  "// trust the timeline, not the testimony",
  "// every locked room hands you the key",
];

/**
 * One themed line per anomaly — keywords embed the cipher tokens from
 * anomalies.ts so `deriveRunnerClueSet` can highlight them mid-climb. The
 * cipher words are oblique hints; they do NOT name the final answer.
 */
export const ANOMALY_SNIPPETS: Record<AnomalyId, readonly string[]> = {
  "calendar-tomorrow": [
    "if (day.offset === PLUS_ONE) flag('AHEAD');",
    "// DAWN ticked early — the LOOP restarts a beat too soon",
    "expect(calendar.tick).not.toBe('AHEAD'); // PLUS drift",
  ],
  "mug-name": [
    "if (mug.label === user.INK) suspect('MARKED');",
    "// the glaze feels OWNED — MIRROR of last week's mug",
    "const label = mug.INK; trace('MARKED', label);",
  ],
  "clock-ccw": [
    "if (tray.swirl === SPIRAL) rewind('EBB');",
    "// the reagent wants to UNDO itself — watch the RECOIL",
    "expect(tray.direction).not.toBe(SPIRAL); // EBB",
  ],
  "monitor-reflection": [
    "if (monitor.glass === ECHO) warn('DOUBLE');",
    "// the WINDOW shows ELSE — someone's DOUBLE in the glass",
    "reflect(monitor, ECHO); // WINDOW bug",
  ],
  "photo-self": [
    "if (caseFile.face === MIRROR) alert('TWIN');",
    "// the GAZE sits INSIDE the file — a TWIN looks back",
    "expect(caseFile.subject).toBe('TWIN'); // INSIDE",
  ],
  "sticky-warning": [
    "if (envelope.text.includes('BREATH')) warn('HUSH');",
    "// SHOULDER-prickle — PAPER breathes when you aren't looking",
    'envelope.PAPER = "HUSH";',
  ],
  "pen-floating": [
    "if (caseFile.HOVER && caseFile.AIRGAP) trace('LIFT');",
    "// the page keeps its own VOID — nothing holding the LIFT",
    "physics.assert(caseFile.support === VOID); // HOVER",
  ],
  "steam-down": [
    "if (vapor.velocity.y < 0) fix('SINK');",
    "// the POUR runs the wrong way — CHILL fighting GRAVITY",
    "particles.vapor.GRAVITY = +1; // SINK",
  ],
  "blank-book": [
    "if (caseFile.body.every(line => line === ERASED)) HOLLOW();",
    "// every line is UNSAID — SILENT paper, HOLLOW page",
    "expect(caseFile.lines).toBe(ERASED); // HOLLOW",
  ],
  "keyboard-extra-key": [
    "if (keys.has(INTRUDER)) warn('ODD');",
    "// one CRIMSON cap too many — the COUNT is off by one",
    "layout.COUNT(keyboard) > 104; // CRIMSON",
  ],
};

/**
 * Fallback widths (px) at 13px ui-monospace when `measureText` is
 * unavailable (e.g. unit tests). Computed by char count × ~7.85px since
 * the actual snippets all sit between 200 and 360px and a per-char
 * estimate is within ~10% of the real measurement.
 */
function fallbackSnippetWidths(): readonly number[] {
  return CODE_SNIPPETS.map((s) => Math.ceil(s.length * 7.85));
}

let measuredWidthsGeneric: readonly number[] | null = null;

function measureWidthsGeneric(): readonly number[] {
  if (typeof document === "undefined") return fallbackSnippetWidths();
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  if (!ctx) return fallbackSnippetWidths();
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
