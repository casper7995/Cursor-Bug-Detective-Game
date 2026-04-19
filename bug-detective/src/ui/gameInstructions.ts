/**
 * Single source for onboarding copy: case-file texture + optional How to play modal.
 */

export const CASE_FILE_TAGLINE =
  "Confidential · read below, then lift the page when you're ready";

/** Drawn on the procedural case-file texture (short lines; canvas layout in pagePeel). */
export const CASE_FILE_BODY_LINES: readonly string[] = [
  "HOW TO PLAY",
  "• Hover desk props — one is wrong today; your tooltip flags it.",
  "• Open the monitor, envelope, reagent tray, and lamp. Each opens a",
  "  mini-game; solve it to lock a clue word in Evidence.",
  "• Gather all four clues, then tap Make the call and pick the anomaly.",
  "• Esc or click exits inspect zoom; X closes desk minis.",
  "",
  "This sheet is only the case jacket. Underneath: your desk, your tools,",
  "and today's bug. Lifting the page is stepping through into the room.",
];

/** Richer steps for the optional DOM modal (?howto=1 or settings). */
export const HOWTO_MODAL_STEPS: readonly {
  title: string;
  body: string;
  icon: string;
}[] = [
  {
    title: "Find the bug",
    body: "Hover desk props. One is wrong today — your tooltip will flag it.",
    icon: "🔎",
  },
  {
    title: "Gather four clues",
    body: "Click the monitor, envelope, reagent tray, and lamp. Each opens a fullscreen mini-puzzle — solve it to lock a clue word.",
    icon: "📎",
  },
  {
    title: "Make the call",
    body: "Open the answer panel (bottom-right) and pick which anomaly you saw.",
    icon: "✓",
  },
  {
    title: "Controls",
    body: "Click any prop to inspect. Esc or another click exits zoom. Close desk minis with the X in the corner.",
    icon: "⌨",
  },
];
