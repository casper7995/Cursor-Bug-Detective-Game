import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  MINIGAMES,
  type MinigameKey,
  type QaAssessmentDocument,
  type RunManifestV1,
} from "./types.js";
import { defaultArtifactsDir } from "./runStore.js";

export async function loadAssessment(
  path: string,
): Promise<QaAssessmentDocument> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as QaAssessmentDocument;
}

function handoffSlots(include?: MinigameKey[]): MinigameKey[] {
  if (!include?.length) return [...MINIGAMES];
  return MINIGAMES.filter((s) => include.includes(s));
}

export async function writeShareBundle(
  repoRoot: string,
  manifest: RunManifestV1,
  assessment: QaAssessmentDocument,
  options?: { includeMinigames?: MinigameKey[]; followUpInstruction?: string },
): Promise<void> {
  const slots = handoffSlots(options?.includeMinigames);
  const base = join(defaultArtifactsDir(repoRoot, manifest.runId), "share");
  await mkdir(base, { recursive: true });
  await writeFile(
    join(base, "assessment-summary.md"),
    formatAssessmentSummary(assessment, slots),
    "utf8",
  );
  await writeFile(
    join(base, "cursor-team-writeup.md"),
    formatTeamWriteup(manifest, assessment, slots),
    "utf8",
  );
  const note = options?.followUpInstruction?.trim();
  const notesPath = join(base, "handoff-follow-up-notes.txt");
  if (note) {
    await writeFile(notesPath, `${note}\n`, "utf8");
  } else {
    try {
      await unlink(notesPath);
    } catch {
      /* absent is fine */
    }
  }
  const videoManifest = {
    runId: manifest.runId,
    videos: Object.fromEntries(slots.map((s) => [s, manifest.videos?.[s]])),
    scores: Object.fromEntries(slots.map((s) => [s, assessment.byMinigame[s]])),
    gate: assessment.gate,
    ...(slots.length < MINIGAMES.length ? { handoffMinigames: slots } : {}),
    ...(note
      ? { handoffFollowUpNotesFile: "handoff-follow-up-notes.txt" }
      : {}),
  };
  await writeFile(
    join(base, "video-manifest.json"),
    JSON.stringify(videoManifest, null, 2) + "\n",
    "utf8",
  );
}

function formatAssessmentSummary(
  a: QaAssessmentDocument,
  slots: MinigameKey[],
): string {
  const lines: string[] = [
    `# Assessment summary`,
    `Run: ${a.runId} — model ${a.model} — ${a.createdAt}`,
    `Gate: allPassed=${a.gate.allPassed} threshold=${a.gate.passThreshold}`,
    `Failing: ${a.gate.failing.join(", ") || "(none)"}`,
    ``,
  ];
  if (slots.length < MINIGAMES.length) {
    lines.push(
      `> Handoff scope: ${slots.join(", ")} only (full assessment.json lists every minigame).`,
      ``,
    );
  }
  for (const s of slots) {
    const m = a.byMinigame[s];
    lines.push(`## ${s} — ${m.score100}/100`);
    lines.push(
      m.assessment,
      ``,
      m.recommendedFixes
        .slice(0, 5)
        .map((x: string) => `- ${x}`)
        .join("\n"),
    );
  }
  return lines.join("\n");
}

function formatTeamWriteup(
  m: RunManifestV1,
  a: QaAssessmentDocument,
  slots: MinigameKey[],
): string {
  const lines: string[] = [
    `# Bug Detective — QA loop handoff`,
    `Run: ${m.runId}`,
    `State: ${m.state} | iteration ${m.iteration}/${m.maxIterations}`,
    `Threshold: ${a.gate.passThreshold} | allPassed: ${a.gate.allPassed}`,
    ``,
  ];
  if (slots.length < MINIGAMES.length) {
    lines.push(`Handoff minigames: ${slots.join(", ")} only.`, ``);
  }
  lines.push(
    `## Scores`,
    ...slots.map((s) => `- **${s}**: ${a.byMinigame[s].score100}/100`),
    ``,
    `## SDK / ops`,
    `- Cursor cloud agents: @cursor/february Agent.create (record / plan / implement)`,
    `- Gemini: Files API + generateContent for strict JSON assessment`,
  );
  return lines.join("\n");
}
