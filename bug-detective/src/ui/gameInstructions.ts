/**
 * Single source for onboarding copy: case-file texture + optional How to play modal.
 */

export const CASE_FILE_TAGLINE =
  "Confidential · scan the desk, collect four clues, then make the call";

/**
 * Drawn on the case-file peel texture and 3D desk sheet — short and
 * punchy. Detailed controls live in the help modal (?howto=1) so first-run
 * players aren't reading a wall of text. SH-1.
 */
export const CASE_FILE_BODY_LINES: readonly string[] = [
  "HOW TO PLAY",
  "• Scan the desk — one prop is wrong today.",
  "• Open four stations to fill your clue board.",
  "• Make the call when Evidence hits 4/4.",
  "",
  "Peel the page, then hunt the live bug.",
];

/** Richer steps for the optional DOM modal (?howto=1 or settings). */
export const HOWTO_MODAL_STEPS: readonly {
  title: string;
  body: string;
  icon: string;
}[] = [
  {
    title: "Read the desk first",
    body: "Hover props and trust your eyes. One detail on the desk is wrong today.",
    icon: "🔎",
  },
  {
    title: "Gather four clues",
    body: "Open the monitor, envelope, reagent tray, and lamp. Each one pays out a clue word when you solve its mini-puzzle.",
    icon: "📎",
  },
  {
    title: "Make the call",
    body: "Once Evidence is full, open the answer panel and pick the anomaly you actually saw on the desk.",
    icon: "✓",
  },
  {
    title: "Controls",
    body: "Click to open stations or inspect flavor props. Esc, Wider, Reset view, scroll, or − / + — desk view is two levels (wide vs close), not a free dolly. Exit on the bar matches Esc. Code run jumps with Space. After you clear the daily monitor run, Shift+click the monitor to practice daily again; normal click opens endless.",
    icon: "⌨",
  },
];
