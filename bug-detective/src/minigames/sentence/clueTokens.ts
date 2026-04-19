/** Sentence clue token derivation. */

export function clueTokenForSentence(word: string): string {
  return word.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8) || "WORD";
}
