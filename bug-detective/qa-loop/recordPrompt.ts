import { qaRunArtifactsRelativePath } from "./runStore.js";

export function recordingAgentPrompt(runId: string): string {
  const base = qaRunArtifactsRelativePath(runId);
  return [
    "You are a recording agent for the Bug Detective QA loop.",
    "The game is under bug-detective/ (Vite + Playwright).",
    "First time on a clean machine: cd bug-detective && npm ci. Later runs: npm install as needed.",
    "npm run qa:record -- --local --scenario runner|sentence|errand|tamper (each).",
    `Store clips under ${base}/videos/<slot>.webm and write recorder.log with commands + exit codes.`,
  ].join("\n");
}

export function planAgentPrompt(runId: string): string {
  const base = qaRunArtifactsRelativePath(runId);
  return [
    `Read ${base}/assessment.json. Write`,
    `${base}/cursor-plan.md with a ranked, PR-sized plan.`,
    "Do not implement. Reference bug-detective/src/scene/deskInteractionRouting.ts for props: monitor, envelope, tray, lamp.",
  ].join("\n");
}

export function implementAgentPrompt(runId: string): string {
  const base = qaRunArtifactsRelativePath(runId);
  return [
    "Implement the approved plan on a feature branch, open a PR, and re-run: cd bug-detective && npm test && npm run build.",
    `Log commands to ${base}/implement.log.`,
  ].join("\n");
}
