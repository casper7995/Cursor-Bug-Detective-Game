import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { QaAssessmentDocument, RunManifestV1, MinigameKey } from "./types.js";
import { defaultArtifactsDir } from "./runStore.js";

function slots(): MinigameKey[] {
  return ["runner", "sentence", "errand", "tamper"];
}

export async function loadAssessment(path: string): Promise<QaAssessmentDocument> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as QaAssessmentDocument;
}

export async function writeShareBundle(
  repoRoot: string,
  manifest: RunManifestV1,
  assessment: QaAssessmentDocument,
): Promise<void> {
  const base = join(defaultArtifactsDir(repoRoot, manifest.runId), "share");
  await mkdir(base, { recursive: true });
  await writeFile(join(base, "assessment-summary.md"), formatAssessmentSummary(assessment), "utf8");
  await writeFile(join(base, "cursor-team-writeup.md"), formatTeamWriteup(manifest, assessment), "utf8");
  const videoManifest = { runId: manifest.runId, videos: manifest.videos, scores: assessment.byMinigame, gate: assessment.gate };
  await writeFile(join(base, "video-manifest.json"), JSON.stringify(videoManifest, null, 2) + "\n", "utf8");
}

function formatAssessmentSummary(a: QaAssessmentDocument): string {
  const lines: string[] = [
    `# Assessment summary`,
    `Run: ${a.runId} — model ${a.model} — ${a.createdAt}`,
    `Gate: allPassed=${a.gate.allPassed} threshold=${a.gate.passThreshold}`,
    `Failing: ${a.gate.failing.join(", ") || "(none)"}`,
    ``,
  ];
  for (const s of slots()) {
    const m = a.byMinigame[s];
    lines.push(`## ${s} — ${m?.score100 ?? "?"}/100`);
    if (m) lines.push(m.assessment, ``, m.recommendedFixes.slice(0, 5).map((x: string) => `- ${x}`).join("\n"));
  }
  return lines.join("\n");
}

function formatTeamWriteup(m: RunManifestV1, a: QaAssessmentDocument): string {
  return [
    `# Bug Detective — QA loop handoff`,
    `Run: ${m.runId}`,
    `State: ${m.state} | iteration ${m.iteration}/${m.maxIterations}`,
    `Threshold: ${a.gate.passThreshold} | allPassed: ${a.gate.allPassed}`,
    ``,
    `## Scores`,
    ...slots().map((s) => `- **${s}**: ${a.byMinigame[s]?.score100 ?? "n/a"}/100`),
    ``,
    `## SDK / ops`,
    `- Cursor cloud agents: @cursor/february Agent.create (record / plan / implement)`,
    `- Gemini: Files API + generateContent for strict JSON assessment`,
  ].join("\n");
}
