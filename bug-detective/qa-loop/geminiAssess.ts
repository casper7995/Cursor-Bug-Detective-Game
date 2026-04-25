import { GoogleGenerativeAI } from "@google/generative-ai";
import { FileState, GoogleAIFileManager } from "@google/generative-ai/server";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import {
  MINIGAMES,
  type MinigameKey,
  type QaAssessmentDocument,
} from "./types.js";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface AssessOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly runId: string;
  readonly videoPath: string;
  readonly minigame: MinigameKey;
}

const SCHEMA_HINT = `Return JSON only (no markdown fences) with this shape:
{
  "version": 1, "runId": string, "model": string, "createdAt": string,
  "byMinigame": { ${MINIGAMES.join(" | ")} : { minigame, issues, dimensions, score100, assessment, recommendedFixes } },
  "gate": { "passThreshold": 90, "allPassed": boolean, "failing": string[] }
}
Only fill the byMinigame key for the minigame in the prompt. Use score100 0-100.`;

export async function assessOneVideoWithGemini(
  opts: AssessOptions,
): Promise<QaAssessmentDocument> {
  const { apiKey, model, runId, videoPath, minigame } = opts;
  const fileManager = new GoogleAIFileManager(apiKey);
  const buf = await readFile(videoPath);
  const upload = await fileManager.uploadFile(buf, {
    mimeType: "video/webm",
    displayName: basename(videoPath),
  });
  const name = upload.file.name;
  let lastState: string | undefined;
  for (let i = 0; i < 60; i++) {
    const meta = await fileManager.getFile(name);
    lastState = String(meta.state);
    if (meta.state === FileState.ACTIVE) break;
    if (meta.state === FileState.FAILED) {
      throw new Error(
        `Gemini file failed: ${JSON.stringify(meta.error ?? meta)}`,
      );
    }
    await sleep(2000);
  }
  {
    const meta = await fileManager.getFile(name);
    if (meta.state !== FileState.ACTIVE) {
      throw new Error(
        `Gemini file never became ACTIVE (last state=${String(meta.state)}; saw=${lastState ?? "n/a"})`,
      );
    }
  }
  const gen = new GoogleGenerativeAI(apiKey);
  const mdl = gen.getGenerativeModel({ model });
  const result = await mdl.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          {
            fileData: {
              fileUri: upload.file.uri,
              mimeType: upload.file.mimeType,
            },
          },
          {
            text:
              "Assess a Bug Detective minigame screen recording (Cursor themed puzzle game).\n" +
              SCHEMA_HINT +
              "\nRun id: " +
              runId +
              " Minigame: " +
              minigame +
              "\n",
          },
        ],
      },
    ],
  });
  const text = result.response.text().trim();
  const json = normalizeAssessmentDoc(
    extractJsonObject(text) as QaAssessmentDocument,
    {
      runId,
      model,
      minigame,
    },
  );
  if (json.version !== 1) throw new Error("assessment.version must be 1");
  return json;
}

function extractJsonObject(s: string): unknown {
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? s).trim();
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    const balanced = firstBalancedJsonObject(candidate);
    if (balanced) return JSON.parse(balanced) as unknown;
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start < 0 || end <= start)
      throw new Error("No JSON object in model output");
    return JSON.parse(candidate.slice(start, end + 1)) as unknown;
  }
}

function firstBalancedJsonObject(s: string): string | null {
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i]!;
    if (inString) {
      if (esc) {
        esc = false;
        continue;
      }
      if (c === "\\") {
        esc = true;
        continue;
      }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

function normalizeAssessmentDoc(
  raw: QaAssessmentDocument,
  expected: { runId: string; model: string; minigame: MinigameKey },
): QaAssessmentDocument {
  if (raw.runId && raw.runId !== expected.runId) {
    // eslint-disable-next-line no-console
    console.warn(
      `[qa-loop] model returned runId=${raw.runId} expected=${expected.runId} — using expected id`,
    );
  }
  if (raw.model && raw.model !== expected.model) {
    // eslint-disable-next-line no-console
    console.warn(
      `[qa-loop] model returned model=${raw.model} expected=${expected.model} — using expected model`,
    );
  }
  const b = raw.byMinigame?.[expected.minigame];
  if (!b)
    throw new Error(`Assessment JSON missing byMinigame.${expected.minigame}`);
  if (b.minigame !== expected.minigame) {
    throw new Error(
      `Assessment JSON byMinigame minigame mismatch: got ${b.minigame} expected ${expected.minigame}`,
    );
  }
  if (typeof b.score100 !== "number" || b.score100 < 0 || b.score100 > 100) {
    throw new Error(
      `Invalid score100 for ${expected.minigame}: ${String(b.score100)}`,
    );
  }
  return {
    version: 1,
    runId: expected.runId,
    model: expected.model,
    createdAt: raw.createdAt ?? new Date().toISOString(),
    byMinigame: {
      [expected.minigame]: b,
    } as QaAssessmentDocument["byMinigame"],
    gate: raw.gate,
  };
}
