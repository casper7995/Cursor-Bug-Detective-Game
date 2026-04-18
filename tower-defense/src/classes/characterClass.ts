export type CharacterClass =
  | "arrow"
  | "crosshair"
  | "ibeam"
  | "spinner"
  | "hand";

export function parseCharacterClass(search: string): CharacterClass {
  const raw = new URLSearchParams(search).get("class")?.toLowerCase();
  if (
    raw === "crosshair" ||
    raw === "ibeam" ||
    raw === "spinner" ||
    raw === "hand"
  )
    return raw;
  return "arrow";
}
