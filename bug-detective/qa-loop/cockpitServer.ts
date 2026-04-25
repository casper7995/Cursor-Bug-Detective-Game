import "./loadEnv.js";
import { createReadStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
  const assessRun = deps.runAssessForRunId ?? runAssessForRunId;
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
          if (body.execute !== false) {
            const start = await startImplementCloudAgent(deps.repoRoot, runId);
            manifest.cloud = mergeCloud(
              manifest.cloud,
              roleCloudPatch("implement", start),
            );
            appendCockpitMessage(
              manifest,
              `Implementation agent ${start.agentId} started.`,
            );
          }
          await saveRun(deps.repoRoot, manifest);
          return { status: 200, body: { manifest } };
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

function mimeType(pathname: string): string {
  switch (extname(pathname)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".md":
      return "text/markdown; charset=utf-8";
    case ".log":
    case ".txt":
      return "text/plain; charset=utf-8";
    case ".webm":
      return "video/webm";
    default:
      return "application/octet-stream";
  }
}

async function readRequestBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return undefined;
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? (JSON.parse(raw) as unknown) : undefined;
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body, null, 2));
}

function serveArtifact(
  repoRoot: string,
  pathname: string,
  res: ServerResponse,
): boolean {
  if (!pathname.startsWith("/artifacts/qa-runs/")) return false;
  const base = resolve(repoRoot, "artifacts", "qa-runs");
  const relativePath = normalize(
    decodeURIComponent(pathname.replace(/^\/artifacts\/qa-runs\//, "")),
  );
  const target = resolve(base, relativePath);
  if (!target.startsWith(base)) {
    writeJson(res, 403, { error: "Forbidden" });
    return true;
  }
  res.writeHead(200, { "content-type": mimeType(target) });
  createReadStream(target)
    .on("error", () => {
      if (!res.headersSent)
        writeJson(res, 404, { error: "Artifact not found" });
      else res.end();
    })
    .pipe(res);
  return true;
}

function html(): string {
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8" />' +
    '<meta name="viewport" content="width=device-width, initial-scale=1" />' +
    "<title>Bug Detective QA Cockpit</title><style>" +
    css() +
    "</style></head><body>" +
    '<aside><h1>QA Cockpit</h1><button id="new-run">New Run</button><div id="runs"></div></aside>' +
    '<main><section class="panel"><div class="toolbar"><h2 id="run-title">Select or create a run</h2><span id="status"></span></div>' +
    '<div id="timeline" class="timeline"></div><div class="actions">' +
    '<button data-action="cloud-record">Cloud Record</button><button data-action="artifacts/list">List Artifacts</button>' +
    '<button data-action="artifacts/download">Download Artifacts</button><button data-action="analyze">Analyze</button>' +
    '<button data-action="share">Share</button><button data-action="send-findings">Send to Cursor</button>' +
    '<button data-action="approve-implement">Approve & Implement</button></div></section>' +
    '<section class="grid"><div class="panel"><h2>Artifacts</h2><div id="artifacts"></div></div>' +
    '<div class="panel"><h2>Videos</h2><div id="videos" class="videos"></div></div>' +
    '<div class="panel wide"><h2>Findings</h2><div id="findings"></div></div>' +
    '<div class="panel"><h2>Cursor Agents</h2><pre id="cloud"></pre></div>' +
    '<div class="panel wide"><h2>Messages</h2><pre id="messages"></pre></div></section></main>' +
    "<script>" +
    clientJs() +
    "</script></body></html>"
  );
}

function css(): string {
  return (
    "*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;grid-template-columns:280px 1fr;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#0f1117;color:#f6f7fb}" +
    "aside{border-right:1px solid #2a3142;padding:20px;background:#131722}h1,h2{margin:0 0 14px}" +
    "button{border:1px solid #3d8bff;border-radius:10px;background:#17233a;color:#f6f7fb;padding:9px 12px;cursor:pointer}button:hover{background:#203456}" +
    "main{padding:22px;overflow:auto}.run{display:block;width:100%;margin:10px 0;text-align:left;border-color:#2a3142}.run.active{border-color:#9ad7ff;background:#1d3451}" +
    ".panel{background:#171b27;border:1px solid #2a3142;border-radius:18px;padding:16px;box-shadow:0 18px 50px #0004}.toolbar{display:flex;justify-content:space-between;gap:16px;align-items:baseline}" +
    ".actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}.timeline{display:flex;flex-wrap:wrap;gap:8px}.step{border:1px solid #30384b;border-radius:999px;padding:6px 10px;color:#aab4c8}.step.current{color:#0f1117;background:#9ad7ff;border-color:#9ad7ff}" +
    ".grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px}.wide{grid-column:1/-1}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #293246;padding:8px;text-align:left}" +
    ".videos{display:grid;gap:12px}video{width:100%;border-radius:12px;background:#05070c}.score{display:grid;grid-template-columns:120px 70px 1fr;gap:10px;border-bottom:1px solid #293246;padding:10px 0}pre{white-space:pre-wrap;color:#cbd5e1}#status{color:#9ad7ff}"
  );
}

function clientJs(): string {
  return (
    "const state={runId:null,detail:null};const $=(id)=>document.getElementById(id);" +
    'async function api(path,options={}){const res=await fetch(path,{method:options.method||"GET",headers:{"content-type":"application/json"},body:options.body?JSON.stringify(options.body):undefined});const json=await res.json();if(!res.ok)throw new Error(json.error||res.statusText);return json}' +
    'function setStatus(text){$("status").textContent=text}' +
    'async function refreshRuns(){const data=await api("/api/runs");$("runs").innerHTML=data.runs.map((run)=>"<button class=\\"run "+(run.runId===state.runId?"active":"")+"\\" data-run=\\""+run.runId+"\\"><strong>"+run.runId+"</strong><br><small>"+run.state+" · "+((run.cockpit&&run.cockpit.phase)||"idle")+"</small></button>").join("")}' +
    'async function loadRun(runId){state.runId=runId;state.detail=await api("/api/runs/"+encodeURIComponent(runId));render();await refreshRuns()}' +
    'function render(){const detail=state.detail;if(!detail)return;const manifest=detail.manifest,assessment=detail.assessment;$("run-title").textContent=manifest.runId+" · "+manifest.state;const phase=(manifest.cockpit&&manifest.cockpit.phase)||"idle";$("timeline").innerHTML=["cloud-recording","artifacts-ready","analyzing","review-ready","sent-to-cursor","implementing"].map((step)=>"<span class=\\"step "+(step===phase?"current":"")+"\\">"+step+"</span>").join("");const artifacts=manifest.artifactSnapshots||[];$("artifacts").innerHTML=artifacts.length?"<table><thead><tr><th>Path</th><th>Size</th><th>Updated</th></tr></thead><tbody>"+artifacts.map((artifact)=>"<tr><td>"+artifact.path+"</td><td>"+(artifact.size||"")+"</td><td>"+(artifact.updatedAt||"")+"</td></tr>").join("")+"</tbody></table>":"<p>No SDK artifact listing yet.</p>";const downloads=(manifest.downloadedArtifacts||[]).filter((artifact)=>artifact.status==="downloaded"&&artifact.relativePath.endsWith(".webm"));$("videos").innerHTML=downloads.length?downloads.map((artifact)=>"<div><strong>"+artifact.relativePath+"</strong><video controls src=\\"/artifacts/qa-runs/"+manifest.runId+"/"+artifact.relativePath+"\\"></video></div>").join(""):"<p>Download videos to preview them here.</p>";$("cloud").textContent=JSON.stringify(manifest.cloud||{},null,2);$("messages").textContent=((manifest.cockpit&&manifest.cockpit.messages)||[]).join("\\n");$("findings").innerHTML=!assessment?"<p>No Gemini assessment yet.</p>":Object.values(assessment.byMinigame).map((item)=>"<div class=\\"score\\"><strong>"+item.minigame+"</strong><span>"+item.score100+"/100</span><span>"+item.assessment+"<br><small>"+item.recommendedFixes.join(" · ")+"</small></span></div>").join("")}' +
    'document.addEventListener("click",async(event)=>{const runButton=event.target.closest("[data-run]");if(runButton)return loadRun(runButton.dataset.run);if(event.target.id==="new-run"){setStatus("Creating run...");const data=await api("/api/runs",{method:"POST",body:{}});setStatus("Created "+data.manifest.runId);return loadRun(data.manifest.runId)}const actionButton=event.target.closest("[data-action]");if(actionButton&&state.runId){const action=actionButton.dataset.action;setStatus("Running "+action+"...");await api("/api/runs/"+encodeURIComponent(state.runId)+"/"+action,{method:"POST",body:{}});setStatus("Done: "+action);return loadRun(state.runId)}});refreshRuns().catch((error)=>setStatus(error.message));'
  );
}

export function startCockpitServer(
  repoRoot: string,
  opts: { host?: string; port?: number } = {},
): void {
  const host = opts.host ?? "127.0.0.1";
  const port = opts.port ?? Number(process.env.QA_COCKPIT_PORT ?? 8787);
  const api = createCockpitApi({ repoRoot });
  const server = createServer(async (req, res) => {
    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html());
      return;
    }
    if (req.method === "GET" && serveArtifact(repoRoot, url.pathname, res))
      return;
    if (url.pathname.startsWith("/api/")) {
      const body =
        req.method === "POST" ? await readRequestBody(req) : undefined;
      const response = await api.handle({
        method: req.method ?? "GET",
        pathname: url.pathname,
        body,
      });
      writeJson(res, response.status, response.body);
      return;
    }
    writeJson(res, 404, { error: "Not found" });
  });
  server.listen(port, host, () => {
    // eslint-disable-next-line no-console
    console.log(`Bug Detective QA cockpit: http://${host}:${port}/`);
  });
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  startCockpitServer(repoRoot);
}
import "./loadEnv.js";
import { createReadStream, existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
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
} from "./cloudArtifacts.js";
import { runAssessForRunId } from "./cli.js";
import {
  startImplementCloudAgent,
  startPlanCloudAgent,
  startRecordingCloudAgent,
  sendFollowUpToAgent,
  waitRunDone,
} from "./cursorAgent.js";
import { getCursorApiKey } from "./env.js";
import { loadAssessment, writeShareBundle } from "./report.js";
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
  type QaAssessmentDocument,
  type RunManifestV1,
} from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
const staticDir = join(here, "cockpit");
const textEncoder = new TextEncoder();

function safeFileUnderRoot(root: string, urlPath: string): string {
  const decoded = decodeURIComponent(urlPath);
  const abs = resolve(join(root, decoded));
  const rootAbs = resolve(root);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + sep)) {
    throw new Error("Path escapes root");
  }
  return abs;
}

export interface CockpitRequest {
  readonly method: string;
  readonly pathname: string;
  readonly body?: unknown;
}

export interface CockpitResponse {
  readonly status: number;
  readonly body: unknown;
}

export function createFindingsPrompt(
  manifest: RunManifestV1,
  assessment: QaAssessmentDocument,
): string {
  const lines: string[] = [
    `Run: ${manifest.runId}`,
    `Gate: allPassed=${assessment.gate.allPassed} threshold=${assessment.gate.passThreshold}`,
    `Failing: ${assessment.gate.failing.join(", ") || "(none)"}`,
    "",
  ];
  for (const s of MINIGAMES) {
    const m = assessment.byMinigame[s];
    lines.push(`${s}: ${m.score100}/100`);
    if (m.assessment.trim().length) lines.push(m.assessment.trim());
    for (const fix of m.recommendedFixes.slice(0, 5)) {
      lines.push(`- ${fix}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

type FollowUp = (agentId: string, text: string) => Promise<unknown>;

export interface CreateCockpitApiOptions {
  readonly repoRoot: string;
  readonly sendFollowUpToAgent?: FollowUp;
}

function parsePathSegments(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

type CockpitHandler = (req: CockpitRequest) => Promise<CockpitResponse>;

export function createCockpitApi(opts: CreateCockpitApiOptions): {
  handle: CockpitHandler;
} {
  const { repoRoot } = opts;
  const followUp: FollowUp =
    opts.sendFollowUpToAgent ?? ((id, t) => sendFollowUpToAgent(id, t));

  async function handle(req: CockpitRequest): Promise<CockpitResponse> {
    const { method, pathname } = req;
    const segs = parsePathSegments(pathname);

    if (method === "GET" && pathname === "/api/runs") {
      const runs = await listRunManifests(repoRoot);
      return { status: 200, body: { runs } };
    }

    if (method === "POST" && pathname === "/api/runs") {
      const b = (req.body ?? {}) as {
        runId?: unknown;
        passThreshold?: unknown;
      };
      const id =
        typeof b.runId === "string" && b.runId.length ? b.runId : newRunId();
      const pass =
        typeof b.passThreshold === "number" && !Number.isNaN(b.passThreshold)
          ? b.passThreshold
          : undefined;
      const manifest = createInitialManifest(id, { passThreshold: pass });
      await saveManifest(defaultArtifactsDir(repoRoot, id), manifest);
      return { status: 200, body: { manifest } };
    }

    if (
      method === "GET" &&
      segs[0] === "api" &&
      segs[1] === "runs" &&
      segs.length === 3
    ) {
      const runId = segs[2]!;
      try {
        const manifest = await loadManifestForRunId(repoRoot, runId);
        return { status: 200, body: { manifest } };
      } catch {
        return { status: 404, body: { error: "Run not found" } };
      }
    }

    if (
      method === "POST" &&
      segs[0] === "api" &&
      segs[1] === "runs" &&
      segs[3] === "send-findings" &&
      segs.length === 4
    ) {
      const runId = segs[2]!;
      const runDir = defaultArtifactsDir(repoRoot, runId);
      const manifest = await loadManifestForRunId(repoRoot, runId);
      const planId = manifest.cloud?.planAgentId;
      if (!planId) {
        return {
          status: 400,
          body: {
            error:
              "No plan agent on this run. Run Plan first (cockpit or qa:plan).",
          },
        };
      }
      const raw = await readFile(join(runDir, "assessment.json"), "utf8");
      const assessment = JSON.parse(raw) as QaAssessmentDocument;
      const prompt = createFindingsPrompt(manifest, assessment);
      await followUp(planId, prompt);
      const next: RunManifestV1 = {
        ...manifest,
        state: "planned",
        cockpit: {
          ...manifest.cockpit,
          phase: "sent-to-cursor",
          lastActionAt: nowIso(),
          messages: [
            ...(manifest.cockpit?.messages ?? []),
            "Sent findings to plan agent (Cursor follow-up).",
          ],
        },
      };
      await saveManifest(runDir, next);
      return { status: 200, body: { ok: true, manifest: next } };
    }

    if (
      method === "POST" &&
      segs[0] === "api" &&
      segs[1] === "runs" &&
      segs[3] === "analyze" &&
      segs.length === 4
    ) {
      const runId = segs[2]!;
      const runDir = defaultArtifactsDir(repoRoot, runId);
      let m = await loadManifestForRunId(repoRoot, runId);
      m = {
        ...m,
        state: "analyzing",
        cockpit: { ...m.cockpit, phase: "analyzing", lastActionAt: nowIso() },
      };
      await saveManifest(runDir, m);
      try {
        const { allPassed } = await runAssessForRunId(runId, repoRoot);
        const updated = await loadManifestForRunId(repoRoot, runId);
        return { status: 200, body: { allPassed, manifest: updated } };
      } catch (e: unknown) {
        const err = e instanceof Error ? e.message : String(e);
        return { status: 500, body: { error: err } };
      }
    }

    if (
      method === "POST" &&
      segs[0] === "api" &&
      segs[1] === "runs" &&
      segs[3] === "share" &&
      segs.length === 4
    ) {
      const runId = segs[2]!;
      const runDir = defaultArtifactsDir(repoRoot, runId);
      const m = await loadManifestForRunId(repoRoot, runId);
      const a = await loadAssessment(join(runDir, "assessment.json"));
      await writeShareBundle(repoRoot, m, a);
      return { status: 200, body: { ok: true, dir: join(runDir, "share") } };
    }

    if (
      method === "POST" &&
      segs[0] === "api" &&
      segs[1] === "runs" &&
      segs[3] === "artifacts" &&
      segs[4] === "list" &&
      segs.length === 5
    ) {
      const runId = segs[2]!;
      const b = (req.body ?? {}) as { agentId?: unknown };
      if (typeof b.agentId !== "string" || !b.agentId) {
        return { status: 400, body: { error: "body.agentId required" } };
      }
      const agent = resumeArtifactAgent(b.agentId, getCursorApiKey());
      const listed = await listRunArtifacts(agent, runId, b.agentId);
      const runDir = defaultArtifactsDir(repoRoot, runId);
      const m = await loadManifestForRunId(repoRoot, runId);
      const next: RunManifestV1 = {
        ...m,
        artifactSnapshots: listed,
        cloud: { ...m.cloud, latestArtifactAgentId: b.agentId },
        cockpit: {
          ...m.cockpit,
          phase: "artifacts-ready",
          lastActionAt: nowIso(),
        },
      };
      await saveManifest(runDir, next);
      return { status: 200, body: { artifacts: listed, manifest: next } };
    }

    if (
      method === "POST" &&
      segs[0] === "api" &&
      segs[1] === "runs" &&
      segs[3] === "artifacts" &&
      segs[4] === "download" &&
      segs.length === 5
    ) {
      const runId = segs[2]!;
      const b = (req.body ?? {}) as { agentId?: unknown };
      if (typeof b.agentId !== "string" || !b.agentId) {
        return { status: 400, body: { error: "body.agentId required" } };
      }
      const agent = resumeArtifactAgent(b.agentId, getCursorApiKey());
      const runDir = defaultArtifactsDir(repoRoot, runId);
      const m = await loadManifestForRunId(repoRoot, runId);
      const result = await downloadRunArtifacts({
        repoRoot,
        runId,
        agent,
        manifest: m,
        sourceAgentId: b.agentId,
      });
      await saveManifest(runDir, result.manifest);
      return {
        status: 200,
        body: {
          manifest: result.manifest,
          downloaded: result.downloaded,
          failed: result.failed,
        },
      };
    }

    if (
      method === "POST" &&
      segs[0] === "api" &&
      segs[1] === "runs" &&
      segs[3] === "cloud-record" &&
      segs.length === 4
    ) {
      const runId = segs[2]!;
      const runDir = defaultArtifactsDir(repoRoot, runId);
      const m0 = await loadManifestForRunId(repoRoot, runId);
      const m: RunManifestV1 = {
        ...m0,
        state: "cloud-recording",
        cockpit: {
          ...m0.cockpit,
          phase: "cloud-recording",
          lastActionAt: nowIso(),
        },
      };
      await saveManifest(runDir, m);
      try {
        const {
          agentId,
          runId: recRun,
          run,
        } = await startRecordingCloudAgent(repoRoot, m.runId);
        const started = nowIso();
        const m2: RunManifestV1 = {
          ...m,
          cloud: {
            ...m.cloud,
            recordAgentId: agentId,
            recordRunId: recRun,
            latestArtifactAgentId: agentId,
            runs: {
              ...m.cloud?.runs,
              record: {
                role: "record",
                agentId,
                runId: recRun,
                status: "running",
                startedAt: started,
              },
            },
          },
        };
        await saveManifest(runDir, m2);
        void waitRunDone(run)
          .then(() =>
            loadManifestForRunId(repoRoot, m2.runId).then(async (cur) => {
              const m3: RunManifestV1 = {
                ...cur,
                state: "artifacts-ready",
                cockpit: {
                  ...cur.cockpit,
                  phase: "artifacts-ready",
                  lastActionAt: nowIso(),
                },
                cloud: {
                  ...cur.cloud,
                  runs: {
                    ...cur.cloud?.runs,
                    record: {
                      role: "record",
                      agentId,
                      runId: recRun,
                      status: "finished",
                      startedAt: started,
                      completedAt: nowIso(),
                    },
                  },
                },
              };
              await saveManifest(defaultArtifactsDir(repoRoot, m3.runId), m3);
            }),
          )
          .catch((e) => {
            // eslint-disable-next-line no-console
            console.error("[qa-cockpit] record run error", e);
          });
        return { status: 200, body: { agentId, runId: recRun, manifest: m2 } };
      } catch (e: unknown) {
        const err = e instanceof Error ? e.message : String(e);
        return { status: 500, body: { error: err } };
      }
    }

    if (
      method === "POST" &&
      segs[0] === "api" &&
      segs[1] === "runs" &&
      segs[3] === "plan" &&
      segs.length === 4
    ) {
      const runId = segs[2]!;
      try {
        const {
          agentId,
          run,
          runId: planR,
        } = await startPlanCloudAgent(repoRoot, runId);
        const runDir = defaultArtifactsDir(repoRoot, runId);
        const started = nowIso();
        let m = await loadManifestForRunId(repoRoot, runId);
        m = {
          ...m,
          state: "planned",
          cloud: {
            ...m.cloud,
            planAgentId: agentId,
            planRunId: planR,
            runs: {
              ...m.cloud?.runs,
              plan: {
                role: "plan",
                agentId,
                runId: planR,
                status: "running",
                startedAt: started,
              },
            },
          },
        };
        await saveManifest(runDir, m);
        const res = await waitRunDone(run);
        m = await loadManifestForRunId(repoRoot, runId);
        m = {
          ...m,
          state: "needs-approval",
          planPath: join(qaRunArtifactsRelativePath(runId), "cursor-plan.md"),
          cloud: {
            ...m.cloud,
            planAgentId: agentId,
            planRunId: planR,
            runs: {
              ...m.cloud?.runs,
              plan: {
                role: "plan",
                agentId,
                runId: planR,
                status: "finished",
                startedAt: started,
                completedAt: nowIso(),
              },
            },
          },
        };
        await saveManifest(runDir, m);
        return { status: 200, body: { runStatus: res.status, manifest: m } };
      } catch (e: unknown) {
        const err = e instanceof Error ? e.message : String(e);
        return { status: 500, body: { error: err } };
      }
    }

    if (
      method === "POST" &&
      segs[0] === "api" &&
      segs[1] === "runs" &&
      segs[3] === "approve-implement" &&
      segs.length === 4
    ) {
      const runId = segs[2]!;
      const b = (req.body ?? {}) as { execute?: unknown };
      const runDir = defaultArtifactsDir(repoRoot, runId);
      let m = await loadManifestForRunId(repoRoot, runId);
      m = {
        ...m,
        planApproved: true,
        pendingNextStep: "implement",
        state: "implementing",
        cockpit: {
          ...m.cockpit,
          phase: "implementing",
          lastActionAt: nowIso(),
        },
      };
      await saveManifest(runDir, m);
      if (b.execute !== true) {
        return {
          status: 200,
          body: {
            ok: true,
            manifest: m,
            message:
              "Approved; call again with { execute: true } to run implement agent.",
          },
        };
      }
      const {
        agentId,
        run,
        runId: implR,
      } = await startImplementCloudAgent(repoRoot, runId);
      const started = nowIso();
      m = await loadManifestForRunId(repoRoot, runId);
      m = {
        ...m,
        cloud: {
          ...m.cloud,
          implementAgentId: agentId,
          implementRunId: implR,
          runs: {
            ...m.cloud?.runs,
            implement: {
              role: "implement",
              agentId,
              runId: implR,
              status: "running",
              startedAt: started,
            },
          },
        },
      };
      await saveManifest(runDir, m);
      const res = await waitRunDone(run);
      m = await loadManifestForRunId(repoRoot, runId);
      const prUrl = res.git?.branches?.[0]?.prUrl;
      m = {
        ...m,
        state: prUrl ? "pr-ready" : m.state,
        cloud: {
          ...m.cloud,
          lastPrUrl: prUrl ?? m.cloud?.lastPrUrl,
          implementAgentId: agentId,
          implementRunId: implR,
          runs: {
            ...m.cloud?.runs,
            implement: {
              role: "implement",
              agentId,
              runId: implR,
              status: "finished",
              startedAt: started,
              completedAt: nowIso(),
            },
          },
        },
      };
      await saveManifest(runDir, m);
      return {
        status: 200,
        body: { runStatus: res.status, prUrl, manifest: m },
      };
    }

    return { status: 404, body: { error: "Not found" } };
  }

  return { handle };
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const ch of req) {
    chunks.push(ch as Buffer);
  }
  if (chunks.length === 0) return undefined;
  const s = Buffer.concat(chunks).toString("utf8");
  if (!s.trim()) return undefined;
  return JSON.parse(s) as unknown;
}

const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".webm": "video/webm",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

export async function startCockpitServer(opts: {
  readonly repoRoot: string;
  readonly port: number;
}): Promise<{ url: string; close: () => Promise<void> }> {
  const api = createCockpitApi({ repoRoot: opts.repoRoot });
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
              ? await readJsonBody(req)
              : undefined;
          const out = await api.handle({
            method: req.method ?? "GET",
            pathname: url.pathname,
            body,
          });
          res.writeHead(out.status, {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          });
          res.end(
            typeof out.body === "string"
              ? out.body
              : JSON.stringify(out.body, null, 2),
          );
        } catch (e: unknown) {
          const err = e instanceof Error ? e.message : String(e);
          res.writeHead(500, { "Content-Type": "application/json" });
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
              mime[extname(filePath)] ?? "application/octet-stream",
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
              "Content-Type": mime[extname(filePath)] ?? "text/plain",
              "Content-Length": st.size,
            });
            createReadStream(filePath).pipe(res);
            return;
          }
        }
      } catch {
        /* fall through */
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
    if (Number.isNaN(port)) {
      // eslint-disable-next-line no-console
      console.error("Invalid QA_COCKPIT_PORT");
      process.exit(1);
    }
    const s = await startCockpitServer({ repoRoot: cockpitRepoRoot, port });
    // eslint-disable-next-line no-console
    console.log(`Bug Detective QA cockpit: ${s.url}`);
  }
})();
