import "./loadEnv.js";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createInitialManifest,
  defaultArtifactsDir,
  loadManifest,
  loadManifestForRunDir,
  MANIFEST_FILE,
  newRunId,
  nowIso,
  qaRunArtifactsRelativePath,
  recordVideoPath,
  saveManifest,
} from "./runStore.js";
import { assessOneVideoWithGemini } from "./geminiAssess.js";
import { getAssessModel, getGeminiApiKey } from "./env.js";
import {
  startRecordingCloudAgent,
  startPlanCloudAgent,
  startImplementCloudAgent,
  waitRunDone,
} from "./cursorAgent.js";
import { loadAssessment, writeShareBundle } from "./report.js";
import {
  MINIGAMES,
  type MinigameKey,
  type MinigameAssessment,
  type QaAssessmentDocument,
  type RunManifestV1,
} from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(here, "..");

function getArg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i < 0) return undefined;
  if (i + 1 >= process.argv.length) return undefined;
  const v = process.argv[i + 1]!;
  if (v.startsWith("--")) return undefined;
  return v;
}

function hasFlag(n: string): boolean {
  return process.argv.includes(n);
}

async function findLatestWebmAfter(
  base: string,
  before: number,
  scenario: string,
): Promise<string | undefined> {
  const results: { p: string; t: number; score: number }[] = [];
  async function walk(dir: string): Promise<void> {
    let ent: import("node:fs").Dirent[] | undefined;
    try {
      ent = await readdir(dir, { withFileTypes: true });
    } catch (e: unknown) {
      const code =
        e && typeof e === "object" && "code" in e
          ? (e as { code?: string }).code
          : undefined;
      if (code !== "ENOENT") {
        // eslint-disable-next-line no-console
        console.warn("[qa-loop] readdir", dir, e);
      }
      return;
    }
    for (const e of ent) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile() && p.endsWith(".webm")) {
        const t = (await stat(p)).mtimeMs;
        if (t >= before) {
          const hay = p.toLowerCase();
          const needle = scenario.toLowerCase();
          const score = hay.includes(needle) ? 1 : 0;
          results.push({ p, t, score });
        }
      }
    }
  }
  await walk(join(base, "test-results"));
  if (results.length === 0) return undefined;
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.t !== a.t) return b.t - a.t;
    return b.p.length - a.p.length;
  });
  return results[0]!.p;
}

function missingPlaceholder(s: MinigameKey): MinigameAssessment {
  return {
    minigame: s,
    issues: [],
    dimensions: {
      clarity: 0,
      controlFeel: 0,
      fun: 0,
      goalReadability: 0,
      visualPolish: 0,
      performanceSmoothness: 0,
      cursorBrandFit: 0,
    },
    score100: 0,
    assessment:
      "No recording for this minigame yet — record with npm run qa:record -- --local --scenario " +
      s,
    recommendedFixes: ["Record: npm run qa:record -- --local --scenario " + s],
  };
}

function mergeAssessments(
  runId: string,
  parts: QaAssessmentDocument[],
  threshold: number,
  model: string,
): QaAssessmentDocument {
  const acc: Partial<Record<MinigameKey, MinigameAssessment>> = {};
  for (const p of parts) {
    for (const k of MINIGAMES) {
      const b = p.byMinigame[k];
      if (b) acc[k] = b;
    }
  }
  const byMinigame = Object.fromEntries(
    MINIGAMES.map((k) => [k, acc[k] ?? missingPlaceholder(k)] as const),
  ) as QaAssessmentDocument["byMinigame"];
  const failing: MinigameKey[] = [];
  for (const s of MINIGAMES) {
    if (byMinigame[s].score100 < threshold) failing.push(s);
  }
  return {
    version: 1,
    runId,
    model,
    createdAt: nowIso(),
    byMinigame,
    gate: {
      passThreshold: threshold,
      allPassed: failing.length === 0,
      failing,
    },
  };
}

export async function runAssessForRunId(
  runId: string,
  repoRoot: string = REPO,
): Promise<{ allPassed: boolean }> {
  const runDir = defaultArtifactsDir(repoRoot, runId);
  const mPath = join(runDir, MANIFEST_FILE);
  const manifest = await loadManifest(mPath);
  const key = getGeminiApiKey();
  const model = getAssessModel();
  const toAssess: { slot: MinigameKey; vp: string }[] = [];
  for (const slot of MINIGAMES) {
    const vp = manifest.videos[slot];
    if (!vp) {
      // eslint-disable-next-line no-console
      console.warn(`[qa-loop] no video for ${slot}; using placeholder in gate`);
      continue;
    }
    toAssess.push({ slot, vp });
  }
  if (toAssess.length === 0)
    throw new Error("No videos in manifest to assess (record clips first).");
  const parts = await Promise.all(
    toAssess.map(({ slot, vp }) =>
      assessOneVideoWithGemini({
        apiKey: key,
        model,
        runId: manifest.runId,
        videoPath: vp,
        minigame: slot,
      }),
    ),
  );
  const merged = mergeAssessments(
    manifest.runId,
    parts,
    manifest.passThreshold,
    model,
  );
  const out = join(runDir, "assessment.json");
  await writeFile(out, JSON.stringify(merged, null, 2) + "\n", "utf8");
  for (const s of MINIGAMES) {
    const b = merged.byMinigame[s];
    if (b) manifest.scores[s] = b.score100;
  }
  manifest.assessmentPath = relative(repoRoot, out);
  manifest.allPassed = merged.gate.allPassed;
  manifest.state = merged.gate.allPassed ? "passed" : "assessed";
  manifest.pendingNextStep = merged.gate.allPassed ? "complete" : "plan";
  manifest.cockpit = {
    ...manifest.cockpit,
    phase: "review-ready",
    lastActionAt: nowIso(),
  };
  await saveManifest(runDir, manifest);
  // eslint-disable-next-line no-console
  console.log(
    `Wrote ${out} allPassed=${merged.gate.allPassed} failing=${merged.gate.failing.join(",") || "(none)"}`,
  );
  return { allPassed: merged.gate.allPassed };
}

function runDemoRecordSpec(scenario: MinigameKey): SpawnSyncReturns<Buffer> {
  return spawnSync(
    "npx",
    [
      "playwright",
      "test",
      "e2e/demo-record.spec.ts",
      "--project=demo",
      "-g",
      scenario,
    ],
    {
      cwd: REPO,
      stdio: "inherit",
      env: { ...process.env, BD_QA_SCENARIO: scenario },
    },
  );
}

/** One walk of `test-results/`: best .webm per scenario (same tie-break as single-scenario search). */
async function findLatestWebmPerScenario(
  base: string,
  sinceMs: number,
  scenarios: readonly string[],
): Promise<Map<string, string>> {
  const all: { p: string; t: number }[] = [];
  async function walk(dir: string): Promise<void> {
    let ent: import("node:fs").Dirent[] | undefined;
    try {
      ent = await readdir(dir, { withFileTypes: true });
    } catch (e: unknown) {
      const code =
        e && typeof e === "object" && "code" in e
          ? (e as { code?: string }).code
          : undefined;
      if (code !== "ENOENT") {
        // eslint-disable-next-line no-console
        console.warn("[qa-loop] readdir", dir, e);
      }
      return;
    }
    for (const e of ent) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile() && p.endsWith(".webm")) {
        all.push({ p, t: (await stat(p)).mtimeMs });
      }
    }
  }
  await walk(join(base, "test-results"));
  const out = new Map<string, string>();
  for (const scenario of scenarios) {
    const results = all
      .filter((x) => x.t >= sinceMs)
      .map((x) => {
        const hay = x.p.toLowerCase();
        const needle = scenario.toLowerCase();
        const score = hay.includes(needle) ? 1 : 0;
        return { ...x, score };
      });
    if (results.length === 0) continue;
    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.t !== a.t) return b.t - a.t;
      return b.p.length - a.p.length;
    });
    out.set(scenario, results[0]!.p);
  }
  return out;
}

async function cmdRecord(): Promise<void> {
  const scenario = (getArg("--scenario") ?? "runner") as MinigameKey;
  if (!MINIGAMES.includes(scenario))
    throw new Error(`--scenario must be one of: ${MINIGAMES.join(", ")}`);
  const runId = getArg("--run") ?? newRunId();
  const runDir = defaultArtifactsDir(REPO, runId);
  await mkdir(runDir, { recursive: true });
  const mPath = join(runDir, MANIFEST_FILE);
  let manifest: RunManifestV1;
  try {
    manifest = await loadManifest(mPath);
  } catch {
    manifest = createInitialManifest(runId);
  }
  if (hasFlag("--local")) {
    const t0 = Date.now();
    const r = runDemoRecordSpec(scenario);
    if (r.status !== 0)
      throw new Error(`playwright record failed: exit ${r.status}`);
    const webm = await findLatestWebmAfter(REPO, t0 - 2000, scenario);
    if (!webm)
      throw new Error("No .webm found under test-results/ after record");
    const target = join(runDir, "videos", `${scenario}.webm`);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(webm, target);
    manifest = recordVideoPath(manifest, scenario, target);
    if (!manifest.runId) manifest.runId = runId;
  } else {
    const { agentId, run } = await startRecordingCloudAgent(
      REPO,
      manifest.runId || runId,
    );
    manifest = {
      ...manifest,
      runId: manifest.runId || runId,
      cloud: { ...manifest.cloud, recordAgentId: agentId },
      state: "blocked",
    };
    await waitRunDone(run);
  }
  await saveManifest(runDir, manifest);
  // eslint-disable-next-line no-console
  console.log(
    `Recorded run=${manifest.runId} video[${scenario}]=${manifest.videos[scenario] ?? ""}`,
  );
}

async function cmdAssess(): Promise<void> {
  const runId = getArg("--run");
  if (!runId) throw new Error("Missing --run <runId>");
  await runAssessForRunId(runId);
}

async function cmdPlan(): Promise<void> {
  const runId = getArg("--run");
  if (!runId) throw new Error("Missing --run");
  const { agentId, run } = await startPlanCloudAgent(REPO, runId);
  const runDir = defaultArtifactsDir(REPO, runId);
  let manifest = await loadManifestForRunDir(runDir);
  manifest.state = "planned";
  manifest.cloud = { ...manifest.cloud, planAgentId: agentId };
  await saveManifest(runDir, manifest);
  const res = await waitRunDone(run);
  // eslint-disable-next-line no-console
  console.log("plan run status:", res.status);
  manifest = await loadManifestForRunDir(runDir);
  manifest.state = "needs-approval";
  manifest.planPath = join(qaRunArtifactsRelativePath(runId), "cursor-plan.md");
  await saveManifest(runDir, manifest);
}

async function cmdApprove(): Promise<void> {
  const runId = getArg("--run");
  if (!runId) throw new Error("Missing --run");
  const runDir = defaultArtifactsDir(REPO, runId);
  let manifest = await loadManifestForRunDir(runDir);
  manifest.planApproved = true;
  manifest.pendingNextStep = "implement";
  manifest.state = "implementing";
  await saveManifest(runDir, manifest);
  if (hasFlag("--execute")) {
    const { agentId, run } = await startImplementCloudAgent(REPO, runId);
    manifest = await loadManifestForRunDir(runDir);
    manifest.cloud = { ...manifest.cloud, implementAgentId: agentId };
    await saveManifest(runDir, manifest);
    const res = await waitRunDone(run);
    // eslint-disable-next-line no-console
    console.log("implement:", res.status, res.git);
    manifest = await loadManifestForRunDir(runDir);
    if (res.git?.branches?.[0]?.prUrl) {
      manifest.cloud = {
        ...manifest.cloud,
        lastPrUrl: res.git.branches[0].prUrl,
      };
      manifest.state = "pr-ready";
    }
    await saveManifest(runDir, manifest);
  } else {
    // eslint-disable-next-line no-console
    console.log(
      "Approved. Re-run: npm run qa:approve -- --run <id> --execute to start implement agent.",
    );
  }
}

async function cmdIterate(): Promise<void> {
  const runId = getArg("--run") ?? newRunId();
  const runDir = defaultArtifactsDir(REPO, runId);
  await mkdir(runDir, { recursive: true });
  let m: RunManifestV1;
  try {
    m = await loadManifestForRunDir(runDir);
  } catch {
    m = createInitialManifest(runId);
  }
  m.runId = m.runId || runId;
  m.iteration += 1;
  if (m.iteration > m.maxIterations) {
    m.state = "blocked";
    m.lastError = "max iterations";
    await saveManifest(runDir, m);
    throw new Error("max iterations reached");
  }
  const t0 = Date.now();
  for (const s of MINIGAMES) {
    const r = runDemoRecordSpec(s);
    if (r.status !== 0) {
      m.state = "blocked";
      m.lastError = `playwright ${s} failed`;
      await saveManifest(runDir, m);
      throw new Error(m.lastError!);
    }
  }
  const byScenario = await findLatestWebmPerScenario(
    REPO,
    t0 - 2000,
    MINIGAMES,
  );
  for (const s of MINIGAMES) {
    const webm = byScenario.get(s);
    if (!webm) throw new Error("no webm for " + s);
    const target = join(runDir, "videos", `${s}.webm`);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(webm, target);
    m = recordVideoPath(m, s, target);
  }
  m.state = "recording";
  await saveManifest(runDir, m);
  const { allPassed } = await runAssessForRunId(m.runId);
  if (!allPassed) {
    try {
      await cmdPlan();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("plan skipped (cloud/auth):", e);
    }
  }
}

async function cmdShare(): Promise<void> {
  const runId = getArg("--run");
  if (!runId) throw new Error("Missing --run");
  const runDir = defaultArtifactsDir(REPO, runId);
  const m = await loadManifestForRunDir(runDir);
  const a = await loadAssessment(join(runDir, "assessment.json"));
  await writeShareBundle(REPO, m, a);
  // eslint-disable-next-line no-console
  console.log("Share bundle in", join(runDir, "share"));
}

async function cmdStatus(): Promise<void> {
  const runId = getArg("--run");
  const runBase = join(REPO, "artifacts", "qa-runs");
  const { existsSync } = await import("node:fs");
  if (!existsSync(runBase)) {
    console.log(
      "No runs yet. Try: npm run qa:record -- --local --scenario runner",
    );
    return;
  }
  const dirs = (await readdir(runBase, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .reverse();
  if (dirs.length === 0) {
    console.log("No runs found.");
    return;
  }
  if (runId) {
    const mPath = join(runBase, runId, MANIFEST_FILE);
    if (!existsSync(mPath)) {
      console.error("Run not found:", runId);
      return;
    }
    const m = await loadManifest(mPath);
    console.log(
      `Run: ${m.runId}\n  state: ${m.state}\n  iter: ${m.iteration}/${m.maxIterations}\n  allPassed: ${m.allPassed ?? "?"}\n  videos: ${JSON.stringify(m.videos)}`,
    );
    return;
  }
  console.log(`\nAll runs (${dirs.length}):`);
  for (const id of dirs.slice(0, 10)) {
    const mPath = join(runBase, id, MANIFEST_FILE);
    if (!existsSync(mPath)) continue;
    const m = await loadManifest(mPath);
    const mark = m.allPassed ? "✅" : m.state === "blocked" ? "❌" : "  ";
    console.log(
      `  ${mark} ${id}  [${m.state}]  iter=${m.iteration}/${m.maxIterations}`,
    );
  }
  if (dirs.length > 10) console.log(`  … and ${dirs.length - 10} more`);
}

async function main(): Promise<void> {
  const sub = process.argv[2] ?? "help";
  if (sub === "record") await cmdRecord();
  else if (sub === "assess") await cmdAssess();
  else if (sub === "plan") await cmdPlan();
  else if (sub === "approve") await cmdApprove();
  else if (sub === "iterate") await cmdIterate();
  else if (sub === "share") await cmdShare();
  else if (sub === "status") await cmdStatus();
  else {
    // eslint-disable-next-line no-console
    console.log(
      `bug-detective QA loop\n` +
        `  npm run qa:record  -- --local --scenario runner [--run id]\n` +
        `  npm run qa:assess  -- --run <id>\n` +
        `  npm run qa:plan    -- --run <id>   (requires CURSOR_API_KEY)\n` +
        `  npm run qa:approve -- --run <id> [--execute]\n` +
        `  npm run qa:iterate -- [--run id]\n` +
        `  npm run qa:share   -- --run <id>\n` +
        `Env: GEMINI_API_KEY, CURSOR_API_KEY, GEMINI_ASSESS_MODEL, CURSOR_QA_REPO_URL, ...\n`,
    );
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
