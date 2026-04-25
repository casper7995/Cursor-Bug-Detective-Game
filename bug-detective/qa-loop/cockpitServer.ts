import "./loadEnv.js";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  downloadRunArtifacts,
  listRunArtifacts,
  resumeArtifactAgent,
  type ArtifactAgent,
} from "./cloudArtifacts.js";
import { runAssessForRunId } from "./cli.js";
import {
  sendFollowUpToAgent as sendFollowUpToAgentDefault,
  startImplementCloudAgent as startImplementCloudAgentDefault,
  startPlanCloudAgent as startPlanCloudAgentDefault,
  startRecordingCloudAgent as startRecordingCloudAgentDefault,
  waitRunDone,
  type CloudAgentStart,
  type CloudFollowUpResult,
} from "./cursorAgent.js";
import {
  loadAssessment,
  writeShareBundle as writeShareBundleDefault,
} from "./report.js";
import {
  createInitialManifest,
  defaultArtifactsDir,
  listRunManifests,
  loadManifestForRunId,
  newRunId,
  nowIso,
  qaRunArtifactsRelativePath,
  saveManifest,
} from "./runStore.js";
import {
  MINIGAMES,
  type CloudAgentRole,
  type QaAssessmentDocument,
  type QaRunCloud,
  type RunManifestV1,
} from "./types.js";

type JsonBody = Record<string, unknown>;

export interface CockpitApiRequest {
  method: string;
  pathname: string;
  body?: unknown;
}

export interface CockpitApiResponse {
  status: number;
  body: Record<string, any>;
}

export interface CockpitApiDeps {
  repoRoot: string;
  startRecordingCloudAgent?: (
    repoRoot: string,
    runId: string,
  ) => Promise<CloudAgentStart>;
  startPlanCloudAgent?: (
    repoRoot: string,
    runId: string,
  ) => Promise<CloudAgentStart>;
  startImplementCloudAgent?: (
    repoRoot: string,
    runId: string,
  ) => Promise<CloudAgentStart>;
  sendFollowUpToAgent?: (
    agentId: string,
    text: string,
  ) => Promise<CloudFollowUpResult | unknown>;
  resumeArtifactAgent?: (agentId: string) => ArtifactAgent;
  runAssessForRunId?: (runId: string) => Promise<{ allPassed: boolean }>;
  writeShareBundle?: (
    repoRoot: string,
    manifest: RunManifestV1,
    assessment: QaAssessmentDocument,
  ) => Promise<void>;
}

export interface CockpitApi {
  handle: (request: CockpitApiRequest) => Promise<CockpitApiResponse>;
}

function asBody(value: unknown): JsonBody {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonBody)
    : {};
}

function stringField(body: JsonBody, key: string): string | undefined {
  const value = body[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberField(body: JsonBody, key: string): number | undefined {
  const value = body[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function assertSafeRunId(runId: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(runId))
    throw new Error(`Unsafe run id: ${runId}`);
  return runId;
}

function routeParts(pathname: string): string[] {
  return pathname.split("/").filter(Boolean).map(decodeURIComponent);
}

function appendCockpitMessage(manifest: RunManifestV1, message: string): void {
  const messages = [
    ...(manifest.cockpit?.messages ?? []),
    `${nowIso()} ${message}`,
  ].slice(-20);
  manifest.cockpit = {
    ...manifest.cockpit,
    phase: manifest.cockpit?.phase ?? "idle",
    lastActionAt: nowIso(),
    messages,
  };
}

function roleCloudPatch(
  role: CloudAgentRole,
  start: CloudAgentStart,
): QaRunCloud {
  const runRef = {
    role,
    agentId: start.agentId,
    ...(start.runId ? { runId: start.runId } : {}),
    startedAt: nowIso(),
  };
  switch (role) {
    case "record":
      return {
        recordAgentId: start.agentId,
        ...(start.runId ? { recordRunId: start.runId } : {}),
        latestArtifactAgentId: start.agentId,
        runs: { record: runRef },
      };
    case "plan":
      return {
        planAgentId: start.agentId,
        ...(start.runId ? { planRunId: start.runId } : {}),
        runs: { plan: runRef },
      };
    case "implement":
      return {
        implementAgentId: start.agentId,
        ...(start.runId ? { implementRunId: start.runId } : {}),
        runs: { implement: runRef },
      };
  }
}

function mergeCloud(
  current: QaRunCloud | undefined,
  patch: QaRunCloud,
): QaRunCloud {
  return {
    ...current,
    ...patch,
    runs: { ...current?.runs, ...patch.runs },
  };
}

function artifactAgentId(manifest: RunManifestV1, body: JsonBody): string {
  const id =
    stringField(body, "agentId") ??
    manifest.cloud?.latestArtifactAgentId ??
    manifest.cloud?.recordAgentId ??
    manifest.cloud?.planAgentId ??
    manifest.cloud?.implementAgentId;
  if (!id)
    throw new Error("No Cursor cloud agent id is available for artifacts.");
  return id;
}

async function loadRun(
  repoRoot: string,
  runId: string,
): Promise<RunManifestV1> {
  return loadManifestForRunId(repoRoot, assertSafeRunId(runId));
}

async function saveRun(
  repoRoot: string,
  manifest: RunManifestV1,
): Promise<void> {
  await saveManifest(defaultArtifactsDir(repoRoot, manifest.runId), manifest);
}

function assessmentPath(repoRoot: string, runId: string): string {
  return join(defaultArtifactsDir(repoRoot, runId), "assessment.json");
}

export function createFindingsPrompt(
  manifest: RunManifestV1,
  assessment: QaAssessmentDocument,
): string {
  const scoreLines = MINIGAMES.map((slot) => {
    const item = assessment.byMinigame[slot];
    const fixes = item.recommendedFixes.slice(0, 3).map((fix) => `  - ${fix}`);
    return [
      `- ${slot}: ${item.score100}/100`,
      `  Assessment: ${item.assessment}`,
      ...fixes,
    ].join("\n");
  });
  return [
    "Bug Detective QA findings are ready for Cursor cloud follow-up.",
    `Run: ${manifest.runId}`,
    `Gate: ${assessment.gate.allPassed ? "passed" : "failed"} threshold=${assessment.gate.passThreshold}`,
    `Failing: ${assessment.gate.failing.join(", ") || "(none)"}`,
    "",
    "Scores and recommended fixes:",
    ...scoreLines,
    "",
    `Please turn these findings into a focused implementation plan or patch. Keep output under artifacts/qa-runs/${manifest.runId}/.`,
  ].join("\n");
}

export function createCockpitApi(deps: CockpitApiDeps): CockpitApi {
  const startRecordingCloudAgent =
    deps.startRecordingCloudAgent ?? startRecordingCloudAgentDefault;
  const startPlanCloudAgent =
    deps.startPlanCloudAgent ?? startPlanCloudAgentDefault;
  const startImplementCloudAgent =
    deps.startImplementCloudAgent ?? startImplementCloudAgentDefault;
  const sendFollowUpToAgent =
    deps.sendFollowUpToAgent ?? sendFollowUpToAgentDefault;
  const resumeAgent = deps.resumeArtifactAgent ?? resumeArtifactAgent;
  const assessRun =
    deps.runAssessForRunId ??
    ((rid: string) => runAssessForRunId(rid, deps.repoRoot));
  const writeShareBundle = deps.writeShareBundle ?? writeShareBundleDefault;

  return {
    async handle(request) {
      try {
        const parts = routeParts(request.pathname);
        const body = asBody(request.body);

        if (request.method === "GET" && request.pathname === "/api/runs") {
          return {
            status: 200,
            body: { runs: await listRunManifests(deps.repoRoot) },
          };
        }
        if (request.method === "POST" && request.pathname === "/api/runs") {
          const runId = assertSafeRunId(
            stringField(body, "runId") ?? newRunId(),
          );
          await mkdir(defaultArtifactsDir(deps.repoRoot, runId), {
            recursive: true,
          });
          const passThreshold = numberField(body, "passThreshold");
          const manifest = createInitialManifest(
            runId,
            passThreshold === undefined ? {} : { passThreshold },
          );
          await saveRun(deps.repoRoot, manifest);
          return { status: 200, body: { manifest } };
        }
        if (parts[0] !== "api" || parts[1] !== "runs" || !parts[2]) {
          return { status: 404, body: { error: "Not found" } };
        }

        const runId = assertSafeRunId(parts[2]);
        if (request.method === "GET" && parts.length === 3) {
          const manifest = await loadRun(deps.repoRoot, runId);
          let assessment: QaAssessmentDocument | undefined;
          try {
            assessment = await loadAssessment(
              assessmentPath(deps.repoRoot, runId),
            );
          } catch {
            assessment = undefined;
          }
          return { status: 200, body: { manifest, assessment } };
        }
        if (request.method !== "POST") {
          return { status: 405, body: { error: "Method not allowed" } };
        }

        const action = parts.slice(3).join("/");
        let manifest = await loadRun(deps.repoRoot, runId);

        if (action === "cloud-record") {
          manifest.state = "cloud-recording";
          manifest.cockpit = {
            ...manifest.cockpit,
            phase: "cloud-recording",
            lastActionAt: nowIso(),
          };
          appendCockpitMessage(
            manifest,
            "Started Cursor cloud recording agent.",
          );
          await saveRun(deps.repoRoot, manifest);
          const start = await startRecordingCloudAgent(deps.repoRoot, runId);
          manifest = await loadRun(deps.repoRoot, runId);
          manifest.cloud = mergeCloud(
            manifest.cloud,
            roleCloudPatch("record", start),
          );
          manifest.state = "cloud-recording";
          manifest.cockpit = {
            ...manifest.cockpit,
            phase: "cloud-recording",
            lastActionAt: nowIso(),
          };
          appendCockpitMessage(
            manifest,
            `Recording agent ${start.agentId} started.`,
          );
          await saveRun(deps.repoRoot, manifest);
          return {
            status: 200,
            body: { manifest, agentId: start.agentId, runId: start.runId },
          };
        }

        if (action === "artifacts/list") {
          const agentId = artifactAgentId(manifest, body);
          const artifacts = await listRunArtifacts(
            resumeAgent(agentId),
            runId,
            agentId,
          );
          manifest.artifactSnapshots = artifacts;
          manifest.state = "artifacts-ready";
          manifest.cloud = {
            ...manifest.cloud,
            latestArtifactAgentId: agentId,
          };
          manifest.cockpit = {
            ...manifest.cockpit,
            phase: "artifacts-ready",
            lastActionAt: nowIso(),
          };
          appendCockpitMessage(
            manifest,
            `Listed ${artifacts.length} artifact(s) from ${agentId}.`,
          );
          await saveRun(deps.repoRoot, manifest);
          return { status: 200, body: { manifest, artifacts } };
        }

        if (action === "artifacts/download") {
          const agentId = artifactAgentId(manifest, body);
          manifest.cockpit = {
            ...manifest.cockpit,
            phase: "downloading",
            lastActionAt: nowIso(),
          };
          await saveRun(deps.repoRoot, manifest);
          const result = await downloadRunArtifacts({
            repoRoot: deps.repoRoot,
            runId,
            agent: resumeAgent(agentId),
            manifest,
            sourceAgentId: agentId,
          });
          result.manifest.cloud = {
            ...result.manifest.cloud,
            latestArtifactAgentId: agentId,
          };
          appendCockpitMessage(
            result.manifest,
            `Downloaded ${result.downloaded.length} artifact(s), ${result.failed.length} failed.`,
          );
          await saveRun(deps.repoRoot, result.manifest);
          return { status: 200, body: result };
        }

        if (action === "analyze") {
          manifest.state = "analyzing";
          manifest.cockpit = {
            ...manifest.cockpit,
            phase: "analyzing",
            lastActionAt: nowIso(),
          };
          await saveRun(deps.repoRoot, manifest);
          const assess = await assessRun(runId);
          manifest = await loadRun(deps.repoRoot, runId);
          manifest.cockpit = {
            ...manifest.cockpit,
            phase: "review-ready",
            lastActionAt: nowIso(),
          };
          appendCockpitMessage(
            manifest,
            `Gemini assessment complete: allPassed=${assess.allPassed}.`,
          );
          await saveRun(deps.repoRoot, manifest);
          return {
            status: 200,
            body: {
              manifest,
              assessment: await loadAssessment(
                assessmentPath(deps.repoRoot, runId),
              ),
            },
          };
        }

        if (action === "share") {
          const assessment = await loadAssessment(
            assessmentPath(deps.repoRoot, runId),
          );
          await writeShareBundle(deps.repoRoot, manifest, assessment);
          appendCockpitMessage(manifest, "Generated share bundle.");
          await saveRun(deps.repoRoot, manifest);
          return {
            status: 200,
            body: {
              manifest,
              shareDir: join(
                defaultArtifactsDir(deps.repoRoot, runId),
                "share",
              ),
            },
          };
        }

        if (action === "plan") {
          const {
            agentId,
            run,
            runId: planR,
          } = await startPlanCloudAgent(deps.repoRoot, runId);
          const started = nowIso();
          let m = await loadRun(deps.repoRoot, runId);
          m = {
            ...m,
            state: "planned",
            cloud: {
              ...m.cloud,
              planAgentId: agentId,
              ...(planR ? { planRunId: planR } : {}),
              runs: {
                ...m.cloud?.runs,
                plan: {
                  role: "plan",
                  agentId,
                  ...(planR ? { runId: planR } : {}),
                  status: "running",
                  startedAt: started,
                },
              },
            },
          };
          await saveRun(deps.repoRoot, m);
          const res = await waitRunDone(run);
          m = await loadRun(deps.repoRoot, runId);
          m = {
            ...m,
            state: "needs-approval",
            planPath: join(qaRunArtifactsRelativePath(runId), "cursor-plan.md"),
            cloud: {
              ...m.cloud,
              planAgentId: agentId,
              ...(planR ? { planRunId: planR } : {}),
              runs: {
                ...m.cloud?.runs,
                plan: {
                  role: "plan",
                  agentId,
                  ...(planR ? { runId: planR } : {}),
                  status: "finished",
                  startedAt: started,
                  completedAt: nowIso(),
                },
              },
            },
          };
          await saveRun(deps.repoRoot, m);
          return { status: 200, body: { runStatus: res.status, manifest: m } };
        }

        if (action === "send-findings") {
          const assessment = await loadAssessment(
            assessmentPath(deps.repoRoot, runId),
          );
          let targetAgentId =
            stringField(body, "agentId") ?? manifest.cloud?.planAgentId;
          if (!targetAgentId) {
            const planStart = await startPlanCloudAgent(deps.repoRoot, runId);
            manifest.cloud = mergeCloud(
              manifest.cloud,
              roleCloudPatch("plan", planStart),
            );
            targetAgentId = planStart.agentId;
          }
          const result = await sendFollowUpToAgent(
            targetAgentId,
            createFindingsPrompt(manifest, assessment),
          );
          manifest.state = "planned";
          manifest.pendingNextStep = "implement";
          manifest.cloud = { ...manifest.cloud, planAgentId: targetAgentId };
          manifest.cockpit = {
            ...manifest.cockpit,
            phase: "sent-to-cursor",
            lastActionAt: nowIso(),
          };
          appendCockpitMessage(
            manifest,
            `Sent findings to Cursor agent ${targetAgentId}.`,
          );
          await saveRun(deps.repoRoot, manifest);
          return { status: 200, body: { manifest, result } };
        }

        if (action === "approve-implement") {
          manifest.planApproved = true;
          manifest.pendingNextStep = "implement";
          manifest.state = "implementing";
          manifest.cockpit = {
            ...manifest.cockpit,
            phase: "implementing",
            lastActionAt: nowIso(),
          };
          appendCockpitMessage(
            manifest,
            "Approved findings for implementation.",
          );
          if (body.execute === false) {
            await saveRun(deps.repoRoot, manifest);
            return { status: 200, body: { manifest } };
          }
          const start = await startImplementCloudAgent(deps.repoRoot, runId);
          manifest.cloud = mergeCloud(
            manifest.cloud,
            roleCloudPatch("implement", start),
          );
          appendCockpitMessage(
            manifest,
            `Implementation agent ${start.agentId} started.`,
          );
          await saveRun(deps.repoRoot, manifest);
          const res = await waitRunDone(start.run);
          const prUrl = res.git?.branches?.[0]?.prUrl;
          let mDone = await loadRun(deps.repoRoot, runId);
          const implStarted =
            mDone.cloud?.runs?.implement?.startedAt ?? nowIso();
          mDone = {
            ...mDone,
            state: prUrl ? "pr-ready" : mDone.state,
            cloud: {
              ...mDone.cloud,
              lastPrUrl: prUrl ?? mDone.cloud?.lastPrUrl,
              runs: {
                ...mDone.cloud?.runs,
                implement: {
                  role: "implement",
                  agentId: start.agentId,
                  ...(start.runId ? { runId: start.runId } : {}),
                  status: "finished",
                  startedAt: implStarted,
                  completedAt: nowIso(),
                },
              },
            },
          };
          appendCockpitMessage(
            mDone,
            prUrl
              ? `Implementation finished; PR: ${prUrl}`
              : "Implementation agent run finished.",
          );
          await saveRun(deps.repoRoot, mDone);
          return {
            status: 200,
            body: { runStatus: res.status, prUrl, manifest: mDone },
          };
        }

        return { status: 404, body: { error: "Not found" } };
      } catch (e: unknown) {
        return {
          status: 500,
          body: { error: e instanceof Error ? e.message : String(e) },
        };
      }
    },
  };
}

const here = dirname(fileURLToPath(import.meta.url));

function safeFileUnderRoot(root: string, relUrlPath: string): string {
  const decoded = decodeURIComponent(relUrlPath);
  const abs = resolve(join(root, decoded));
  const rootAbs = resolve(root);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + sep)) {
    throw new Error("Path escapes root");
  }
  return abs;
}

async function readServerBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const ch of req) {
    chunks.push(
      typeof ch === "string"
        ? Buffer.from(ch, "utf8")
        : Buffer.isBuffer(ch)
          ? ch
          : Buffer.from(ch as Uint8Array),
    );
  }
  if (chunks.length === 0) return undefined;
  const s = Buffer.concat(chunks).toString("utf8");
  if (!s.trim()) return undefined;
  return JSON.parse(s) as unknown;
}

const staticMime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".webm": "video/webm",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const apiJsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
} as const;

export async function startCockpitServer(opts: {
  readonly repoRoot: string;
  readonly port: number;
}): Promise<{ url: string; close: () => Promise<void> }> {
  const api = createCockpitApi({ repoRoot: opts.repoRoot });
  const staticDir = join(here, "cockpit");
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      let pathname = url.pathname;
      if (pathname === "/") pathname = "/index.html";

      if (pathname.startsWith("/api/")) {
        if (req.method === "OPTIONS") {
          res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          });
          res.end();
          return;
        }
        try {
          const body =
            req.method === "POST" || req.method === "PUT"
              ? await readServerBody(req)
              : undefined;
          const out = await api.handle({
            method: req.method ?? "GET",
            pathname: url.pathname,
            body,
          });
          res.writeHead(out.status, apiJsonHeaders);
          res.end(JSON.stringify(out.body));
        } catch (e: unknown) {
          const err = e instanceof Error ? e.message : String(e);
          res.writeHead(500, apiJsonHeaders);
          res.end(JSON.stringify({ error: err }));
        }
        return;
      }

      if (pathname.startsWith("/local/")) {
        try {
          const rel = pathname.slice("/local/".length);
          const filePath = safeFileUnderRoot(opts.repoRoot, rel);
          if (!existsSync(filePath)) {
            res.writeHead(404);
            res.end();
            return;
          }
          const st = await stat(filePath);
          if (!st.isFile()) {
            res.writeHead(404);
            res.end();
            return;
          }
          res.writeHead(200, {
            "Content-Type":
              staticMime[extname(filePath)] ?? "application/octet-stream",
            "Content-Length": st.size,
          });
          createReadStream(filePath).pipe(res);
        } catch {
          res.writeHead(400);
          res.end();
        }
        return;
      }

      try {
        const filePath = safeFileUnderRoot(staticDir, pathname.slice(1));
        if (existsSync(filePath)) {
          const st = await stat(filePath);
          if (st.isFile()) {
            res.writeHead(200, {
              "Content-Type": staticMime[extname(filePath)] ?? "text/plain",
              "Content-Length": st.size,
            });
            createReadStream(filePath).pipe(res);
            return;
          }
        }
      } catch {
        /* path outside static dir */
      }
      res.writeHead(404);
      res.end("Not found");
    })();
  });
  return new Promise((resolveP, rejectP) => {
    server.listen(opts.port, "127.0.0.1", () => {
      resolveP({
        url: `http://127.0.0.1:${opts.port}/`,
        close: () =>
          new Promise((resC, rejC) => {
            server.close((err) => (err ? rejC(err) : resC()));
          }),
      });
    });
    server.on("error", rejectP);
  });
}

const cockpitRepoRoot = resolve(here, "..");

void (async () => {
  const entry = process.argv[1]
    ? pathToFileURL(resolve(process.argv[1])).href
    : "";
  if (entry && entry === import.meta.url) {
    const port = Number(process.env.QA_COCKPIT_PORT ?? "5875");
    if (Number.isNaN(port) || port < 1) {
      // eslint-disable-next-line no-console
      console.error("Invalid QA_COCKPIT_PORT");
      process.exit(1);
    }
    const s = await startCockpitServer({ repoRoot: cockpitRepoRoot, port });
    // eslint-disable-next-line no-console
    console.log(`Bug Detective QA cockpit: ${s.url}`);
  }
})();
