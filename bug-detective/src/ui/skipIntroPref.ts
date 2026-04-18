/**
 * Skip-intro persisted preference.
 *
 * When true, returning visitors bypass the page-peel intro and land
 * directly on the desk. The title splash is also skipped (the audio
 * gesture requirement is satisfied by the first hover/click during
 * investigation, which the audio module handles via its own resume
 * listeners).
 *
 * Stored in localStorage under "bd:skip-intro". Defaults to false.
 */

const KEY = "bd:skip-intro";

export function isSkipIntro(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setSkipIntro(v: boolean): void {
  try {
    if (v) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    // localStorage unavailable (private browsing, etc.) — silently ignore.
  }
}
