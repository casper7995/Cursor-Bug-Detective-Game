/** Lane defense clue token derivation (notebook slot `errand`). */

export function clueTokenForErrand(word: string): string {
  return (
    word
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 8) || "DEF"
  );
}
