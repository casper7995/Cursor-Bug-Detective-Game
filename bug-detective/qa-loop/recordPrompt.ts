import { qaRunArtifactsRelativePath } from "./runStore.js";

/**
 * If you change prompt strings here, update the offline mirror in
 * `qa-loop/cockpit/app.js` (`clientRecipePromptsFromRunId`) so the cockpit
 * preview still works when the API is unavailable.
 */
export function recordingAgentPrompt(runId: string): string {
  const base = qaRunArtifactsRelativePath(runId);
  return [
    "You are a recording agent for the Bug Detective QA loop.",
    "This job requires real computer use (terminal + local browser / Playwright as needed): do not only describe steps—run commands, bring up the game, and capture actual playable demos for review.",
    "The game is under bug-detective/ (Vite + Playwright).",
    "First time on a clean machine: cd bug-detective && npm ci. Later runs: npm install as needed.",
    "npm run qa:record -- --local --scenario runner|sentence|errand|tamper (each).",
    `Store clips under ${base}/videos/<slot>.webm (or .mp4 for computer-use screen recordings) and write recorder.log with commands + exit codes.`,
  ].join("\n");
}

export function planAgentPrompt(runId: string): string {
  const base = qaRunArtifactsRelativePath(runId);
  const planPath = `${base}/cursor-plan.md`;
  return [
    "You are the Bug Detective QA plan writer (no code changes in this step).",
    `Primary input: ${base}/assessment.json — produced by Gemini video analysis in the QA cockpit (Step 3).`,
    `If that file is missing, open ${planPath} with a short section stating assessment.json is absent, that the human should run Gemini video analysis first for scored findings, then re-invoke the plan agent. Do not claim you are vaguely "gathering" things; if you must describe the desk without scores, cite concrete source files (e.g. bug-detective/src/scene/deskInteractionRouting.ts for prop tags like monitor, envelope, tray, lamp and how routes fire).`,
    `Your durable output for this run is a single markdown file at ${planPath} (create or overwrite that exact path in the repo workspace). The QA loop and humans use this file as the canonical plan for the run—keep it self-contained and PR-sized.`,
  ].join("\n");
}

export function implementAgentPrompt(runId: string): string {
  const base = qaRunArtifactsRelativePath(runId);
  return [
    "Implement the approved plan on a feature branch, open a PR, and re-run: cd bug-detective && npm test && npm run build.",
    `Log commands to ${base}/implement.log.`,
  ].join("\n");
}
