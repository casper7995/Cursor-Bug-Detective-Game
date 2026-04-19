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
    case "pen":
      o.pen.userData.flavorEndMs = end;
      return "The pen spins — still no tests for this scene.";
    case "book":
      o.book.userData.flavorEndMs = end;
      o.bookPages.userData.flavorEndMs = end;
      return "Indexing… Chapter null. Appendix undefined.";
    case "plant":
      o.plant.userData.flavorEndMs = end;
      return "The succulent judges your commit messages.";
    case "keyboard":
      o.keyboard.userData.flavorEndMs = end;
      return "Mechanical. Loud. Secretly a linter.";
    case "photo":
      o.photoFrame.userData.flavorEndMs = end;
      return "Everyone smiled except the build pipeline.";
    case "coffee-steam":
      o.coffeeSteam.userData.flavorEndMs = end;
      return "Steam rises — unless the anomaly says otherwise.";
    case "lamp-shadow":
      o.lampShadowStandee.userData.flavorEndMs = end;
      o.lampShadowProp.userData.flavorEndMs = end;
      return "The shadow remembers a different light source.";
    case "lamp":
      o.lamp.userData.flavorEndMs = end;
      return "Desk lamp, warm CCT, mild judgment.";
    case "desk":
      o.desk.userData.flavorEndMs = end;
      return "Solid surface. Holds the whole sprint.";
    default:
      return null;
  }
}

export function isFlavorTag(tag: string): boolean {
  return (
    tag === "calendar" ||
    tag === "mug" ||
    tag === "pen" ||
    tag === "book" ||
    tag === "plant" ||
    tag === "keyboard" ||
    tag === "photo" ||
    tag === "coffee-steam" ||
    tag === "lamp-shadow" ||
    tag === "lamp" ||
    tag === "desk"
  );
}
