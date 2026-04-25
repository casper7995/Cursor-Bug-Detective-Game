export function getGeminiApiKey(): string {
  const k = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!k)
    throw new Error(
      "Set GEMINI_API_KEY (or GOOGLE_API_KEY) for video assessment",
    );
  return k;
}

/** Default IDs match Google’s current Gemini model names; override via env in CI. */
export function getAssessModel(): string {
  return process.env.GEMINI_ASSESS_MODEL ?? "gemini-3.1-pro-preview";
}

export function getFastModel(): string {
  return process.env.GEMINI_FAST_MODEL ?? "gemini-3-flash-preview";
}

export function getCursorApiKey(): string {
  const k = process.env.CURSOR_API_KEY;
  if (!k)
    throw new Error(
      "Set CURSOR_API_KEY for cloud agent steps (plan/approve/record).",
    );
  return k;
}
