export function recordingAgentPrompt(runId: string): string {
  return [
    "You are a recording agent for the Bug Detective QA loop.",
    "The game is under bug-detective/ (Vite + Playwright).",
    "Run: cd bug-detective && npm ci; then",
    "npm run qa:record -- --local --scenario runner|sentence|errand|tamper (each).",
    "Store clips under artifacts/qa-runs/" + runId + "/videos/<slot>.webm and write recorder.log with commands + exit codes.",
  ].join("\n");
}

export function planAgentPrompt(runId: string): string {
  return [
    "Read artifacts/qa-runs/" + runId + "/assessment.json. Write",
    "artifacts/qa-runs/" + runId + "/cursor-plan.md with a ranked, PR-sized plan.",
    "Do not implement. Reference bug-detective/src/scene/deskInteractionRouting.ts for props: monitor, envelope, tray, lamp.",
  ].join("\n");
}

export function implementAgentPrompt(runId: string): string {
  return [
    "Implement the approved plan on a feature branch, open a PR, and re-run: cd bug-detective && npm test && npm run build.",
    "Log commands to artifacts/qa-runs/" + runId + "/implement.log.",
  ].join("\n");
}
