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
    /**
     * After daily is cleared, normal click opens endless; Shift+click opens
     * daily practice again.
     */
    readonly shiftKey?: boolean;
  },
): DeskInteractionRoute {
  switch (tag) {
    case "monitor":
    case "monitor-screen": {
      const wantDaily =
        !opts.monitorDailyClear ||
        (opts.monitorDailyClear && opts.shiftKey === true);
      return {
        kind: "runner",
        mode: wantDaily ? "daily" : "endless",
      };
    }
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
