import type { Intersection } from "three";
import type { DioramaObjects } from "./desktopDiorama";

const DUR_MS = 620;

/**
 * Raycaster hits are sorted by distance. The desk surface is usually the
 * closest intersection under the cursor even when a prop sits on top, so
 * clicks and tooltips can miss the envelope / tray / lamp. Prefer the
 * closest hit whose tag is not the broad desk mesh.
 */
export function preferredDeskHoverHit(
  hits: readonly Intersection[],
): Intersection | null {
  if (hits.length === 0) return null;
  const onProp = hits.find(
    (h) =>
      typeof h.object.userData.tag === "string" &&
      h.object.userData.tag !== "desk",
  );
  return onProp ?? hits[0] ?? null;
}

/**
 * Click-to-play desk flavor lines (non-anomaly props). Sets `userData.flavorEndMs`
 * on meshes; `desktopDiorama.step` reads these for short animations.
 */
export function applyPropFlavor(tag: string, o: DioramaObjects): string | null {
  const end = performance.now() + DUR_MS;
  switch (tag) {
    case "calendar":
      o.calendar.userData.flavorEndMs = end;
      return "You tear off yesterday. It grows back.";
    case "mug":
      o.mug.userData.flavorEndMs = end;
      return "Cold brew. The mug insists it was hot a minute ago.";
    case "keyboard":
      o.keyboard.userData.flavorEndMs = end;
      return "Mechanical. Loud. Secretly a linter.";
    case "coffee-steam":
      o.coffeeSteam.userData.flavorEndMs = end;
      return "Steam rises — unless the anomaly says otherwise.";
    case "lamp":
      o.lamp.userData.flavorEndMs = end;
      return "Desk lamp, warm CCT, mild judgment.";
    default:
      return null;
  }
}

export function isFlavorTag(tag: string): boolean {
  // The bare desk is hoverable for cursor projection, but it is not an
  // investigable prop; clicking it must not start a camera focus tween.
  return (
    tag === "calendar" ||
    tag === "mug" ||
    tag === "keyboard" ||
    tag === "coffee-steam" ||
    tag === "lamp"
  );
}
