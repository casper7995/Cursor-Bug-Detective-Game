import { GoogleGenerativeAI } from "@google/generative-ai";
import { FileState, GoogleAIFileManager } from "@google/generative-ai/server";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { MinigameKey, QaAssessmentDocument } from "./types.js";

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
  "byMinigame": { "runner" | "sentence" | "errand" | "tamper" : { minigame, issues, dimensions, score100, assessment, recommendedFixes } },
  "gate": { "passThreshold": 90, "allPassed": boolean, "failing": string[] }
}
Only fill the byMinigame key for the minigame in the prompt. Use score100 0-100.`;

export async function assessOneVideoWithGemini(opts: AssessOptions): Promise<QaAssessmentDocument> {
  const { apiKey, model, runId, videoPath, minigame } = opts;
  const fileManager = new GoogleAIFileManager(apiKey);
  const upload = await fileManager.uploadFile(await readFile(videoPath), {
    mimeType: "video/webm",
    displayName: basename(videoPath),
  });
  const name = upload.file.name;
  for (let i = 0; i < 60; i++) {
    const meta = await fileManager.getFile(name);
    if (meta.state === FileState.ACTIVE) break;
    if (meta.state === FileState.FAILED) {
      throw new Error(`Gemini file failed: ${JSON.stringify(meta.error ?? meta)}`);
    }
    await sleep(2000);
  }
  const gen = new GoogleGenerativeAI(apiKey);
  const mdl = gen.getGenerativeModel({ model });
  const result = await mdl.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          { fileData: { fileUri: upload.file.uri, mimeType: upload.file.mimeType } },
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
  const json = extractJsonObject(text) as QaAssessmentDocument;
  if (json.version !== 1) throw new Error("assessment.version must be 1");
  return json;
}

function extractJsonObject(s: string): unknown {
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in model output");
  return JSON.parse(s.slice(start, end + 1)) as unknown;
}
