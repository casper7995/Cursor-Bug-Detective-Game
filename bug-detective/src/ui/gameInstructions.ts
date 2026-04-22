/**
 * Single source for onboarding copy: case-file texture + optional How to play modal.
 */

export const CASE_FILE_TAGLINE =
  "Confidential · scan the desk, collect four clues, then make the call";

/** Drawn on the procedural case-file texture (short lines; canvas layout in pagePeel). */
export const CASE_FILE_BODY_LINES: readonly string[] = [
  "HOW TO PLAY",
  "• First: hover the desk. One prop is wrong today.",
  "• Then open the monitor, envelope, reagent tray, and lamp.",
  "• Each station gives one clue word. Lock all four into Evidence.",
  "• When Evidence reads 4/4, hit Make the call and name the anomaly.",
  "• Esc backs out of inspect zoom; X closes a desk mini.",
  "",
  "This page is only the jacket. Under it: your desk, your tools,",
  "and one bug hiding in plain sight.",
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
    body: "Click to open stations or inspect flavor props. Esc exits zoom. Desk minis can be closed with X or Esc.",
    icon: "⌨",
  },
];
