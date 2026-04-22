import type { RunnerMode } from "../game/gameState";
import { isFlavorTag } from "./propInteractions";

export type DeskMiniKind = "sentence" | "errand" | "tamper";

export type DeskInteractionRoute =
  | { kind: "runner"; mode: RunnerMode }
  | { kind: "desk-mini"; mini: DeskMiniKind }
  | { kind: "case-file" }
  | { kind: "flavor" }
  | { kind: "none" };

export function routeDeskMiniTag(tag: string): DeskMiniKind | null {
  switch (tag) {
    case "evidence-envelope":
      return "sentence";
    case "reagent-tray":
      return "errand";
    case "lamp":
      return "tamper";
    default:
      return null;
  }
}

export function routeDeskInteractionTag(
  tag: string,
  opts: {
    readonly monitorDailyClear: boolean;
    readonly anomalyTargetTag: string;
  },
): DeskInteractionRoute {
  switch (tag) {
    case "monitor":
    case "monitor-screen":
      return {
        kind: "runner",
        mode: opts.monitorDailyClear ? "endless" : "daily",
      };
    case "case-file":
      return { kind: "case-file" };
    default: {
      const mini = routeDeskMiniTag(tag);
      if (mini) return { kind: "desk-mini", mini };
      if (tag === opts.anomalyTargetTag) return { kind: "none" };
      if (isFlavorTag(tag)) return { kind: "flavor" };
      return { kind: "none" };
    }
  }
}
