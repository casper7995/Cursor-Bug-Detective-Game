import type { AnomalyId, PickedAnomaly } from "../scene/anomalies";

export type FinalAccusationGrade =
  | { kind: "correct" }
  | { kind: "wrong" }
  | { kind: "vague"; message: string }
  | { kind: "ambiguous"; message: string };

const VAGUE_HINT = "Be more specific: what object is wrong, and what changed?";

const AMBIGUOUS_HINT =
  "That could mean two different bugs — which object, and what’s wrong with it?";

const ID_KEYWORDS: Record<
  AnomalyId,
  { primary: readonly string[]; also: readonly string[] }
> = {
  "calendar-tomorrow": {
    primary: ["calendar", "date", "day"],
    also: ["tomorrow", "ahead", "wrong", "april", "may"],
  },
  "mug-name": {
    primary: ["mug", "cup", "coffee"],
    also: ["name", "label", "yours", "printed", "you"],
  },
  "clock-ccw": {
    primary: ["reagent", "tray", "swirl", "liquid", "ccw", "backwards"],
    also: ["counterclockwise", "reverse", "wrong way", "inverted", "clock"],
  },
  "monitor-reflection": {
    primary: ["monitor", "screen", "reflection", "mirror", "echo"],
    also: ["wrong room", "display", "elsewhere", "other room"],
  },
  "photo-self": {
    primary: ["case file", "photo", "face", "picture", "portrait"],
    also: ["self", "own", "you", "twin", "familiar"],
  },
  "sticky-warning": {
    primary: ["envelope", "evidence", "note", "message", "letter", "warning"],
    also: ["behind you", "hush", "sticky", "sealed"],
  },
  "pen-floating": {
    primary: ["float", "hover", "case file", "paper", "sheet", "air"],
    also: ["no support", "lift", "above desk", "levitat"],
  },
  "steam-down": {
    primary: ["steam", "coffee", "down", "falling", "sink", "drip"],
    also: ["chill", "cold", "should rise"],
  },
  "blank-book": {
    primary: ["blank", "empty", "case file", "text", "line", "body"],
    also: ["no words", "hollow", "erased", "silent"],
  },
  "keyboard-extra-key": {
    primary: ["keyboard", "key", "extra", "red", "crimson", "giant", "odd key"],
    also: ["intruder", "macro"],
  },
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreForId(norm: string, id: AnomalyId): number {
  const k = ID_KEYWORDS[id];
  let s = 0;
  for (const p of k.primary) {
    if (p.length <= 1) continue;
    if (p.includes(" ") && norm.includes(p)) s += 3;
    else if (p.length > 2 && norm.includes(p)) s += 2;
  }
  for (const a of k.also) {
    if (a.length <= 1) continue;
    if (a.includes(" ") && norm.includes(a)) s += 2;
    else if (a.length > 2 && norm.includes(a)) s += 1;
  }
  return s;
}

/**
 * Hybrid local grader: typo-tolerant, avoids punishing valid paraphrases;
 * vague text asks for more detail; close ties ask for clarity.
 */
export function gradeFinalAccusation(
  raw: string,
  picked: PickedAnomaly,
): FinalAccusationGrade {
  const t = raw.trim();
  if (t.length < 2) {
    return { kind: "vague", message: VAGUE_HINT };
  }
  const norm = normalize(t);
  if (norm.length < 3) {
    return { kind: "vague", message: VAGUE_HINT };
  }
  if (norm.length < 10 && !norm.includes(" ")) {
    return { kind: "vague", message: VAGUE_HINT };
  }

  const scored: { id: AnomalyId; score: number }[] = (
    Object.keys(ID_KEYWORDS) as AnomalyId[]
  ).map((id) => ({ id, score: scoreForId(norm, id) }));
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  const second = scored[1];
  if (!best || best.score < 2) {
    return { kind: "vague", message: VAGUE_HINT };
  }

  if (
    second &&
    best.score > 0 &&
    second.score > 0 &&
    best.score - second.score <= 1
  ) {
    if (best.id !== second.id) {
      return { kind: "ambiguous", message: AMBIGUOUS_HINT };
    }
  }

  if (best.id === picked.def.id) {
    return { kind: "correct" };
  }
  if (best.score >= 3) {
    return { kind: "wrong" };
  }
  return { kind: "vague", message: VAGUE_HINT };
}
