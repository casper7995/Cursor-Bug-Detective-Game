import type { DioramaObjects } from "./desktopDiorama";

const DUR_MS = 620;

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
