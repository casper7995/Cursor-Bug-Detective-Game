/** Errand clue token derivation. */

export function clueTokenForErrand(word: string): string {
  return word.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8) || "RACE";
}
