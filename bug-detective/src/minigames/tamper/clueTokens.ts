/** Tamper clue token: derived from anomaly's gameClueWords.tamper. */

export function clueTokenForTamper(clueWord: string): string {
  return clueWord.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8) || "BUG";
}
