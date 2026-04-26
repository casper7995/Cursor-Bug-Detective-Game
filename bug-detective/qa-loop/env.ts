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
  return process.env.GEMINI_ASSESS_MODEL ?? "gemini-2.5-flash";
}

export function getAssessModelOptions(): string[] {
  const configured = process.env.GEMINI_ASSESS_MODELS?.split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const defaults = [
    getAssessModel(),
    "gemini-2.5-flash",
    "gemini-3-flash-preview",
    "gemini-2.0-flash",
    "gemini-2.5-pro",
    "gemini-3.1-pro-preview",
  ];
  return [...new Set([...(configured ?? []), ...defaults])];
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

/** When `1` or `true`, optional LOCAL debug POSTs to a QA ingest URL may run. Off by default. */
export function isQaLoopDebugIngestEnabled(): boolean {
  const v = process.env.QA_LOOP_DEBUG_INGEST?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}
