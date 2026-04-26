import { GoogleGenerativeAI } from "@google/generative-ai";
import { FileState, GoogleAIFileManager } from "@google/generative-ai/server";
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { isQaLoopDebugIngestEnabled } from "./env.js";
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
  /** Merged into the user text prompt after the default intro, before the schema hint. */
  readonly extraInstructions?: string;
}

const INTRO =
  "Assess a Bug Detective minigame screen recording (Cursor themed puzzle game).\n";

const SCHEMA_HINT = `Return JSON only (no markdown fences) with this shape:
{
  "version": 1, "runId": string, "model": string, "createdAt": string,
  "byMinigame": { ${MINIGAMES.join(" | ")} : { minigame, issues, dimensions, score100, assessment, recommendedFixes } },
  "gate": { "passThreshold": 90, "allPassed": boolean, "failing": string[] }
}
Only fill the byMinigame key for the minigame in the prompt. Use score100 0-100.`;

/** Full text part sent with each video (matches server behavior). */
export function buildGeminiAssessmentUserPromptText(opts: {
  runId: string;
  minigame: MinigameKey;
  extraInstructions?: string;
}): string {
  const x = opts.extraInstructions?.trim();
  const op = x ? `Additional direction from the QA operator:\n${x}\n\n` : "";
  return (
    INTRO +
    op +
    SCHEMA_HINT +
    "\nRun id: " +
    opts.runId +
    " Minigame: " +
    opts.minigame +
    "\n"
  );
}

/**
 * Read-only explanation for the QA cockpit: fixed intro, schema (incl. score100 0–100),
 * and how Focus notes and per-clip lines fit in.
 */
export function geminiAssessmentPromptOverviewForRun(runId: string): string {
  return [
    "Text prompt structure sent to Gemini (same order as the API; video bytes are attached separately):",
    "",
    "— Fixed intro —",
    INTRO.trimEnd(),
    "",
    "— Focus notes (only if the box below is non-empty) —",
    "Additional direction from the QA operator:",
    "<your Focus notes>",
    "",
    "— Output contract (model must return JSON only; overall + dimension scores are 0–100) —",
    SCHEMA_HINT,
    "",
    "— One line per analyzed clip (minigame changes when another slot has a video) —",
    `Run id: ${runId} Minigame: <runner | sentence | errand | tamper>`,
    "",
    "Dimension fields (each 0–100 in JSON): clarity, controlFeel, fun, goalReadability, visualPolish, performanceSmoothness, cursorBrandFit. The gate uses passThreshold (90 in the contract above) when merging slots into assessment.json.",
  ].join("\n");
}

export function mimeTypeForVideoPath(
  videoPath: string,
): "video/mp4" | "video/webm" {
  return extname(videoPath).toLowerCase() === ".mp4"
    ? "video/mp4"
    : "video/webm";
}

export async function assessOneVideoWithGemini(
  opts: AssessOptions,
): Promise<QaAssessmentDocument> {
  const { apiKey, model, runId, videoPath, minigame, extraInstructions } = opts;
  const fileManager = new GoogleAIFileManager(apiKey);
  const buf = await readFile(videoPath);
  const upload = await fileManager.uploadFile(buf, {
    mimeType: mimeTypeForVideoPath(videoPath),
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
  if (isQaLoopDebugIngestEnabled()) {
    fetch("http://127.0.0.1:7875/ingest/9f55c4b0-3327-449a-8e13-27f476aac9ad", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "7c3848",
      },
      body: JSON.stringify({
        sessionId: "7c3848",
        runId,
        hypothesisId: "H4,H5",
        location: "geminiAssess.ts:67",
        message: "About to call Gemini generateContent",
        data: {
          model,
          minigame,
          videoBasename: basename(videoPath),
          hasExtraInstructions: Boolean(extraInstructions?.trim()),
          uploadMimeType: upload.file.mimeType,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }
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
            text: buildGeminiAssessmentUserPromptText(
              extraInstructions !== undefined
                ? { runId, minigame, extraInstructions }
                : { runId, minigame },
            ),
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
