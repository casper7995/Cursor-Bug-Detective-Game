(function applyCockpitDemoMode() {
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get("demo") === "1" || q.get("hideRecipes") === "1") {
      document.body.classList.add("cockpit-demo");
    }
  } catch {
    /* ignore */
  }
})();

const logEl = document.querySelector("#log");
const rawEl = document.querySelector("#raw");
const runList = document.querySelector("#runList");
const currentRun = document.querySelector("#currentRun");
const runTitle = document.querySelector("#runTitle");
const runMeta = document.querySelector("#runMeta");
const controlSummary = document.querySelector("#controlSummary");
const videos = document.querySelector("#videos");
const videoPreviewPanel = document.querySelector("#videoPreviewPanel");
const agentId = document.querySelector("#agentId");
const agentCommandPrompt = document.querySelector("#agentCommandPrompt");
const agentCommandRole = document.querySelector("#agentCommandRole");
const agentRolePrefix = document.querySelector("#agentRolePrefix");
const agentPick = document.querySelector("#agentPick");
const selectedAgentIdEl = document.querySelector("#selectedAgentId");
const agentEvents = document.querySelector("#agentEvents");
const agentFriendlyName = document.querySelector("#agentFriendlyName");
const agentRetryPrompt = document.querySelector("#agentRetryPrompt");
const agentCloudLinks = document.querySelector("#agentCloudLinks");
const agentConversationSummary = document.querySelector(
  "#agentConversationSummary",
);
const geminiAssessScope = document.querySelector("#geminiAssessScope");
const assessmentInstruction = document.querySelector("#assessmentInstruction");
const assessmentModel = document.querySelector("#assessmentModel");
const assessmentModelCustom = document.querySelector("#assessmentModelCustom");
const geminiAnalysisStatus = document.querySelector("#geminiAnalysisStatus");
const assessmentResultsPanel = document.querySelector("#assessmentResultsPanel");
const assessmentResults = document.querySelector("#assessmentResults");
const assessmentGateBadge = document.querySelector("#assessmentGateBadge");
const handoffScopePreset = document.querySelector("#handoffScopePreset");
const handoffCustomSlots = document.querySelector("#handoffCustomSlots");
const followUpInstruction = document.querySelector("#followUpInstruction");
const cockpitBoard = document.querySelector(".cockpit-board");

const VIDEO_SLOTS = ["runner", "sentence", "errand", "tamper"];

function handoffScopeStorageKey(runId) {
  return `qa-cockpit-handoff:${runId}`;
}

function syncHandoffCustomVisibility() {
  if (!handoffCustomSlots || !handoffScopePreset) return;
  handoffCustomSlots.hidden = handoffScopePreset.value !== "custom";
}

/**
 * Body fragment for POST /share and /send-findings. Omitted keys = all minigames.
 * @returns {Record<string, unknown>}
 */
function handoffIncludeBody() {
  const preset = handoffScopePreset?.value ?? "all";
  if (preset === "all") return {};
  if (preset !== "custom") return { includeMinigames: [preset] };
  const picked = VIDEO_SLOTS.filter(
    (s) => document.querySelector(`[data-handoff-slot="${s}"]`)?.checked,
  );
  if (picked.length === 0) {
    throw new Error(
      "Handoff: pick at least one minigame under Custom, or choose All minigames.",
    );
  }
  if (picked.length === VIDEO_SLOTS.length) return {};
  return { includeMinigames: picked };
}

function saveHandoffScope(runId) {
  if (!runId || !handoffScopePreset) return;
  const payload = { preset: handoffScopePreset.value, custom: {} };
  for (const s of VIDEO_SLOTS) {
    const el = document.querySelector(`[data-handoff-slot="${s}"]`);
    payload.custom[s] = Boolean(el?.checked);
  }
  try {
    sessionStorage.setItem(handoffScopeStorageKey(runId), JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
}

function followUpInstructionStorageKey(runId) {
  return `qa-cockpit-followup:${runId}`;
}

function applyFollowUpInstructionForRun(runId) {
  if (!followUpInstruction) return;
  try {
    const v = sessionStorage.getItem(followUpInstructionStorageKey(runId));
    followUpInstruction.value = v ?? "";
  } catch {
    followUpInstruction.value = "";
  }
}

function saveFollowUpInstructionForRun(runId) {
  if (!followUpInstruction || !runId) return;
  try {
    sessionStorage.setItem(
      followUpInstructionStorageKey(runId),
      followUpInstruction.value,
    );
  } catch {
    /* ignore quota */
  }
}

/** @returns {Record<string, string>} */
function followUpInstructionBody() {
  const t = followUpInstruction?.value?.trim() ?? "";
  return t ? { followUpInstruction: t } : {};
}

function applyHandoffScope(runId) {
  if (!handoffScopePreset) return;
  let data = null;
  try {
    const raw = sessionStorage.getItem(handoffScopeStorageKey(runId));
    if (raw) data = JSON.parse(raw);
  } catch {
    /* ignore */
  }
  if (!data || typeof data !== "object") {
    handoffScopePreset.value = "all";
    for (const s of VIDEO_SLOTS) {
      const el = document.querySelector(`[data-handoff-slot="${s}"]`);
      if (el) el.checked = true;
    }
    syncHandoffCustomVisibility();
    return;
  }
  handoffScopePreset.value =
    typeof data.preset === "string" ? data.preset : "all";
  if (data.custom && typeof data.custom === "object") {
    for (const s of VIDEO_SLOTS) {
      const el = document.querySelector(`[data-handoff-slot="${s}"]`);
      if (el) el.checked = Boolean(data.custom[s]);
    }
  }
  syncHandoffCustomVisibility();
}

function formatArtifactSize(n) {
  if (n == null || typeof n !== "number" || Number.isNaN(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Effective target slot for a cloud row (override wins, then high-confidence inference).
 * @param {{ path: string, classification?: { slot?: string, confidence?: string, ext?: string } }} row
 * @param {Record<string, string> | undefined} overrides
 */
function effectiveArtifactSlot(row, overrides) {
  const o = overrides?.[row.path];
  if (o && VIDEO_SLOTS.includes(o)) return o;
  const c = row.classification;
  if (c?.slot && c.confidence === "high") return c.slot;
  return "";
}

/**
 * @param {unknown[]} shots
 * @param {Record<string, string> | undefined} overrides
 */
function rowArtifactStatuses(shots, overrides) {
  const sorted = [...shots].sort((a, b) => {
    const ta =
      a && typeof a === "object" && "updatedAt" in a && a.updatedAt
        ? String(a.updatedAt)
        : "";
    const tb =
      b && typeof b === "object" && "updatedAt" in b && b.updatedAt
        ? String(b.updatedAt)
        : "";
    return ta.localeCompare(tb);
  });
  const lastByTarget = new Map();
  for (let i = 0; i < sorted.length; i += 1) {
    const row = sorted[i];
    if (!row || typeof row !== "object" || !("path" in row)) continue;
    const path = String(row.path);
    const c = "classification" in row ? row.classification : undefined;
    if (!c || typeof c !== "object" || c.ext == null) continue;
    const ext = c.ext;
    const slot = effectiveArtifactSlot(
      { path, classification: c },
      overrides,
    );
    if (!slot || !ext) continue;
    const key = `${slot}${String(ext)}`;
    lastByTarget.set(key, path);
  }
  /** @param {string} path */
  return (path) => {
    const row = shots.find(
      (s) => s && typeof s === "object" && s.path === path,
    );
    if (!row || typeof row !== "object") return "—";
    const c = "classification" in row ? row.classification : undefined;
    if (!c || typeof c !== "object" || c.ext == null) return "—";
    const slot = effectiveArtifactSlot(
      { path, classification: c },
      overrides,
    );
    if (c.confidence === "low" && !overrides?.[path]) {
      return "Needs slot";
    }
    if (!slot) return "—";
    const key = `${slot}${String(c.ext)}`;
    const winningPath = lastByTarget.get(key);
    if (winningPath === path) return "Ready";
    if (winningPath && winningPath !== path) return "Will replace";
    return "Ready";
  };
}
const FALLBACK_GEMINI_VIDEO_MODELS = [
  "gemini-3.1-pro-preview",
  "gemini-3-flash-preview",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
];

const DEFAULT_ASSESS_INSTRUCTION = [
  "Prioritize: (1) first-time clarity of each minigame, (2) control feel and fair failure,",
  "(3) Cursor brand fit (mascot, glass/clear UI, readable HUD), (4) obvious bugs or stutter.",
  "Flag clips that are too dark, unreadable, or janky. Keep recommended fixes small and shippable for a jam build.",
].join(" ");

function assessInstructionStorageKey(runId) {
  return `qaCockpitAssessInstr::${runId}`;
}

function assessmentModelStorageKey(runId) {
  return `qaCockpitAssessModel::${runId}`;
}

/**
 * @param {string} runId
 * @returns {string | null}
 */
function loadAssessInstruction(runId) {
  try {
    return sessionStorage.getItem(assessInstructionStorageKey(runId));
  } catch {
    return null;
  }
}

/**
 * @param {string} runId
 * @param {string} text
 */
function saveAssessInstruction(runId, text) {
  try {
    sessionStorage.setItem(assessInstructionStorageKey(runId), text);
  } catch {
    /* ignore */
  }
}

function loadAssessmentModel(runId) {
  try {
    return sessionStorage.getItem(assessmentModelStorageKey(runId));
  } catch {
    return null;
  }
}

function saveAssessmentModel(runId, model) {
  try {
    sessionStorage.setItem(assessmentModelStorageKey(runId), model);
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} runId
 */
function applyAssessInstructionForRun(runId) {
  if (!assessmentInstruction) return;
  const stored = loadAssessInstruction(runId);
  assessmentInstruction.value =
    stored !== null ? stored : DEFAULT_ASSESS_INSTRUCTION;
}

function selectedAssessmentModel() {
  if (assessmentModel?.value === "__custom") {
    return assessmentModelCustom?.value?.trim() ?? "";
  }
  return assessmentModel?.value?.trim() ?? "";
}

function syncAssessmentModelCustomVisibility() {
  if (!assessmentModelCustom || !assessmentModel) return;
  const custom = assessmentModel.value === "__custom";
  assessmentModelCustom.hidden = !custom;
  if (custom) assessmentModelCustom.focus();
}

function applyAssessmentModelForRun(runId, currentModel, modelOptions) {
  if (!assessmentModel) return;
  const options = [
    ...new Set([
      ...(Array.isArray(modelOptions) ? modelOptions : []),
      ...FALLBACK_GEMINI_VIDEO_MODELS,
    ]),
  ].filter(Boolean);
  let stored = loadAssessmentModel(runId);
  if (
    stored === "gemini-3.1-pro-preview" &&
    currentModel &&
    currentModel !== stored
  ) {
    stored = null;
    saveAssessmentModel(runId, currentModel);
  }
  const selected = stored || currentModel || options[0] || "";
  assessmentModel.innerHTML = "";
  for (const model of options) {
    const opt = document.createElement("option");
    opt.value = model;
    opt.textContent = model === currentModel ? `${model} (server default)` : model;
    assessmentModel.appendChild(opt);
  }
  const custom = document.createElement("option");
  custom.value = "__custom";
  custom.textContent = "Custom model id…";
  assessmentModel.appendChild(custom);
  if (selected && options.includes(selected)) {
    assessmentModel.value = selected;
    if (assessmentModelCustom) assessmentModelCustom.value = "";
  } else {
    assessmentModel.value = "__custom";
    if (assessmentModelCustom) assessmentModelCustom.value = selected;
  }
  syncAssessmentModelCustomVisibility();
}

/**
 * @param {string} runId
 */
function defaultRetryPrompt(runId) {
  return [
    "The previous demo recording was not good enough. Please repeat the recording for this QA run.",
    `Focus on producing clear WebM or MP4 artifacts under artifacts/bug-detective-runner-demo.webm or artifacts/qa-runs/${runId}/videos/*, keep the browser stable, and report exactly where the files were written.`,
  ].join(" ");
}

function retryPromptStorageKey(runId) {
  return `qaCockpitRetryPrompt::${runId}`;
}

/**
 * @param {string} runId
 * @returns {string | null}
 */
function loadRetryPromptSession(runId) {
  try {
    return sessionStorage.getItem(retryPromptStorageKey(runId));
  } catch {
    return null;
  }
}

/**
 * @param {string} runId
 * @param {string} text
 */
function saveRetryPromptSession(runId, text) {
  try {
    sessionStorage.setItem(retryPromptStorageKey(runId), text);
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} runId
 */
function applyRetryPromptForRun(runId) {
  if (!agentRetryPrompt) return;
  const stored = loadRetryPromptSession(runId);
  agentRetryPrompt.value =
    stored !== null ? stored : defaultRetryPrompt(runId);
}

const ACTION_BUTTON_IDS = [
  "newRun",
  "btnAgentStart",
  "btnAgentSelect",
  "btnAgentFollowup",
  "btnAgentRetryRecording",
  "btnRefreshAgentConversation",
  "btnCloudRecord",
  "btnPlan",
  "btnListArtifacts",
  "btnSaveArtifactSlots",
  "btnDownloadArtifacts",
  "btnAnalyze",
  "btnShare",
  "btnSend",
  "btnApprove",
  "btnImplement",
  "btnFocusedLoopRun",
  "btnFocusedLoopCancel",
];

/** @type {null | { manifest: object, assessment?: object }} */
let lastRunGetResponse = null;
let actionBusy = false;
/** @type {string | null} */
let currentBusyButtonId = null;

/** @type {ReturnType<typeof setInterval> | null} */
let focusedLoopPollId = null;

let selectedRunId = null;
let activeAgentEvents = null;
const maxAgentEventLines = 120;

/** @type {{ record: string, plan: string } | null} */
let lastRecipePrompts = null;

/**
 * Must stay aligned with `recordPrompt.ts` (recordingAgentPrompt / planAgentPrompt)
 * for offline preview when GET /api/runs/…/recipe-prompts fails (e.g. 405: old server).
 * @param {string} runId
 */
function clientRecipePromptsFromRunId(runId) {
  const base = `artifacts/qa-runs/${runId}`;
  const planPath = `${base}/cursor-plan.md`;
  const record = [
    "You are a recording agent for the Bug Detective QA loop.",
    "This job requires real computer use (terminal + local browser / Playwright as needed): do not only describe steps—run commands, bring up the game, and capture actual playable demos for review.",
    "The game is under bug-detective/ (Vite + Playwright).",
    "First time on a clean machine: cd bug-detective && npm ci. Later runs: npm install as needed.",
    "npm run qa:record -- --local --scenario runner|sentence|errand|tamper (each).",
    `Store clips under ${base}/videos/<slot>.webm (or .mp4 for computer-use screen recordings) and write recorder.log with commands + exit codes.`,
  ].join("\n");
  const plan = [
    "You are the Bug Detective QA plan writer (no code changes in this step).",
    `Primary input: ${base}/assessment.json — produced by Gemini video analysis in the QA cockpit (Step 3).`,
    `If that file is missing, open ${planPath} with a short section stating assessment.json is absent, that the human should run Gemini video analysis first for scored findings, then re-invoke the plan agent. Do not claim you are vaguely "gathering" things; if you must describe the desk without scores, cite concrete source files (e.g. bug-detective/src/scene/deskInteractionRouting.ts for prop tags like monitor, envelope, tray, lamp and how routes fire).`,
    `Your durable output for this run is a single markdown file at ${planPath} (create or overwrite that exact path in the repo workspace). The QA loop and humans use this file as the canonical plan for the run—keep it self-contained and PR-sized.`,
  ].join("\n");
  return { record, plan };
}

/**
 * Prefer `recipePrompts` from `GET /api/runs/:id` (same payload as opening a run) so we do not rely
 * on a separate route that 405s on an older cockpit process.
 * @param {string} runId
 */
async function refreshRecipePrompts(runId) {
  const preR = document.getElementById("recipeRecordPre");
  const preP = document.getElementById("recipePlanPre");
  if (!runId) {
    lastRecipePrompts = null;
    if (preR) preR.textContent = "(select a run to load)";
    if (preP) preP.textContent = "(select a run to load)";
    return;
  }

  const embedded = lastRunGetResponse?.recipePrompts;
  if (
    embedded &&
    typeof embedded.record === "string" &&
    typeof embedded.plan === "string" &&
    lastRunGetResponse?.manifest?.runId === runId
  ) {
    lastRecipePrompts = { record: embedded.record, plan: embedded.plan };
    if (preR) preR.textContent = embedded.record;
    if (preP) preP.textContent = embedded.plan;
    return;
  }

  try {
    const data = await jfetch(
      `/api/runs/${encodeURIComponent(runId)}/recipe-prompts`,
      { method: "GET" },
    );
    lastRecipePrompts = { record: data.record, plan: data.plan };
    if (preR) preR.textContent = data.record;
    if (preP) preP.textContent = data.plan;
  } catch {
    const built = clientRecipePromptsFromRunId(runId);
    lastRecipePrompts = built;
    if (preR) preR.textContent = built.record;
    if (preP) preP.textContent = built.plan;
  }
}

const AGENT_SCRATCH_STORAGE_VERSION = 1;
const RECIPE_ROLES = ["record", "plan", "implement", "custom"];

function agentScratchStorageKey(runId) {
  return `qa-cockpit-agent-scratch:${runId}`;
}

function saveAgentScratchForRun(runId) {
  if (!runId || !agentCommandPrompt) return;
  try {
    sessionStorage.setItem(
      agentScratchStorageKey(runId),
      JSON.stringify({
        v: AGENT_SCRATCH_STORAGE_VERSION,
        prompt: agentCommandPrompt.value,
        role: agentCommandRole?.value ?? "custom",
      }),
    );
  } catch {
    /* ignore quota */
  }
}

/**
 * @returns {{ prompt: string, role: string } | null}
 */
function loadAgentScratchForRun(runId) {
  if (!runId) return null;
  try {
    const raw = sessionStorage.getItem(agentScratchStorageKey(runId));
    if (raw === null) return null;
    const o = JSON.parse(raw);
    if (
      o &&
      typeof o === "object" &&
      o.v === AGENT_SCRATCH_STORAGE_VERSION &&
      typeof o.prompt === "string"
    ) {
      const role = typeof o.role === "string" ? o.role : "custom";
      return { prompt: o.prompt, role };
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Restores Scratch from session, or seeds from record vs plan recipe on first visit.
 * @param {string} runId
 * @param {object | null | undefined} assessment
 */
function applyAgentScratchForRun(runId, assessment) {
  if (!agentCommandPrompt || !runId) return;
  const loaded = loadAgentScratchForRun(runId);
  if (loaded) {
    agentCommandPrompt.value = loaded.prompt;
    if (agentCommandRole && RECIPE_ROLES.includes(loaded.role)) {
      agentCommandRole.value = loaded.role;
    }
    return;
  }
  if (!lastRecipePrompts) return;
  const kind = assessment ? "plan" : "record";
  agentCommandPrompt.value =
    kind === "record" ? lastRecipePrompts.record : lastRecipePrompts.plan;
  if (agentCommandRole) {
    agentCommandRole.value = kind;
  }
  saveAgentScratchForRun(runId);
}

/**
 * @param {"record" | "plan"} kind
 */
async function applyRecipeToCustom(kind) {
  if (!selectedRunId) {
    log("Select a run first.");
    return;
  }
  if (!lastRecipePrompts) await refreshRecipePrompts(selectedRunId);
  if (!lastRecipePrompts) {
    log("Recipe text not available. Check server or network.");
    return;
  }
  const text =
    kind === "record" ? lastRecipePrompts.record : lastRecipePrompts.plan;
  if (agentCommandPrompt) agentCommandPrompt.value = text;
  if (agentCommandRole) {
    agentCommandRole.value = kind === "record" ? "record" : "plan";
  }
  agentCommandPrompt?.focus();
  try {
    agentCommandPrompt?.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch {
    /* ignore */
  }
  onPromptOrAgentInput();
  log(
    `Loaded ${
      kind === "record" ? "record" : "plan"
    } recipe into Custom command — edit, then Start agent.`,
  );
  if (selectedRunId) saveAgentScratchForRun(selectedRunId);
}

/**
 * @param {string} line
 * @param {{ scrollLog?: boolean }} [opts]
 */
function log(line, opts) {
  if (!logEl) return;
  const t = new Date().toISOString().slice(11, 19);
  logEl.textContent = `[${t}] ${line}\n` + logEl.textContent;
  if (opts?.scrollLog) {
    try {
      logEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch {
      /* ignore */
    }
  }
}

async function jfetch(url, options = {}) {
  const m = (options.method ?? "GET").toString().toUpperCase();
  const withJsonBody = ["POST", "PUT", "PATCH", "DELETE"].includes(m);
  const baseHeaders = withJsonBody
    ? { "Content-Type": "application/json", ...options.headers }
    : { ...options.headers };
  const r = await fetch(url, {
    ...options,
    headers: baseHeaders,
  });
  const text = await r.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!r.ok) {
    const err = new Error(
      `HTTP ${r.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`,
    );
    err.body = body;
    throw err;
  }
  return body;
}

function hasLocalVideo(m) {
  if (!m?.videos) return false;
  return VIDEO_SLOTS.some((s) => Boolean(m.videos[s]));
}

function hasArtifactAgent(m) {
  return Boolean(m?.cloud?.selectedAgentId || m?.cloud?.latestArtifactAgentId);
}

const FOCUSED_LOOP_STAGES = [
  ["send-findings", "Send scoped findings"],
  ["implement", "Implement fix"],
  ["record", "Record fresh demo"],
  ["artifacts", "Download artifact"],
  ["assess", "Run Gemini (slot only)"],
  ["score-check", "Score check"],
];

/**
 * @param {object | null | undefined} manifest
 */
function renderFocusedLoopUI(manifest) {
  const fl = manifest?.cockpit?.focusedLoop;
  const list = document.getElementById("focusedLoopChecklist");
  const statusEl = document.getElementById("focusedLoopStatus");
  if (!list || !statusEl) return;
  if (!fl) {
    list.hidden = true;
    list.innerHTML = "";
    statusEl.textContent = "";
    return;
  }
  const terminal =
    fl.status === "done" ||
    fl.status === "failed" ||
    fl.status === "interrupted";
  const showChecklist = fl.status === "running" || terminal;
  list.hidden = !showChecklist;
  const order = FOCUSED_LOOP_STAGES.map(([id]) => id);
  let activeIdx = order.indexOf(fl.stage);
  if (activeIdx < 0) activeIdx = 0;
  list.innerHTML = "";
  for (let i = 0; i < FOCUSED_LOOP_STAGES.length; i++) {
    const [, label] = FOCUSED_LOOP_STAGES[i];
    const li = document.createElement("li");
    let mark = "○";
    let cls = "focused-loop-checklist__pending";
    if (fl.status === "running") {
      if (i < activeIdx) {
        mark = "✓";
        cls = "focused-loop-checklist__done";
      } else if (i === activeIdx) {
        mark = "⋯";
        cls = "focused-loop-checklist__active";
      }
    } else if (terminal) {
      mark = i <= activeIdx ? "✓" : "○";
      cls =
        i <= activeIdx
          ? "focused-loop-checklist__done"
          : "focused-loop-checklist__pending";
    }
    li.className = cls;
    li.textContent = `${mark} ${label}`;
    list.appendChild(li);
  }
  const parts = [
    `Slot: ${fl.slot}`,
    `Attempt ${fl.attempt}/${fl.maxAttempts}`,
    `Stage: ${fl.stage}`,
    `Status: ${fl.status}`,
  ];
  if (typeof fl.lastScore === "number") parts.push(`Last score: ${fl.lastScore}`);
  if (fl.error) parts.push(`Note: ${fl.error}`);
  statusEl.textContent = parts.join(" · ");
}

function syncFocusedLoopPoll() {
  if (focusedLoopPollId != null) {
    clearInterval(focusedLoopPollId);
    focusedLoopPollId = null;
  }
  const m = lastRunGetResponse?.manifest;
  if (m?.cockpit?.focusedLoop?.status !== "running") return;
  focusedLoopPollId = setInterval(() => {
    const id = selectedRunId;
    if (!id) return;
    void jfetch(`/api/runs/${encodeURIComponent(id)}`)
      .then((data) => {
        lastRunGetResponse = data;
        const mm = data.manifest;
        renderFocusedLoopUI(mm);
        syncActionControls({ manifest: mm, assessment: data.assessment });
        if (runMeta) {
          runMeta.textContent = JSON.stringify(
            { state: mm.state, cloud: mm.cloud, cockpit: mm.cockpit },
            null,
            2,
          );
        }
        if (mm?.cockpit?.focusedLoop?.status !== "running") {
          if (focusedLoopPollId != null) {
            clearInterval(focusedLoopPollId);
            focusedLoopPollId = null;
          }
        }
      })
      .catch(() => {});
  }, 2500);
}

/**
 * @param {object} manifest
 * @param {object | undefined} assessment
 * @param {{ prompt: string, agentCandidate: string, retryPrompt?: string } | undefined} ui
 */
function deriveControlState(manifest, assessment, ui) {
  const m = manifest ?? {};
  const loopHold = m.cockpit?.focusedLoop?.status === "running";
  const loopReason =
    "A focused auto-loop is running. Stop it after the current stage to use manual controls.";
  const phase = m.cockpit?.phase ?? "idle";
  const state = m.state ?? "init";
  const prompt = ui?.prompt?.trim() ?? "";
  const retryPrompt = ui?.retryPrompt?.trim() ?? "";
  const agentCandidate = ui?.agentCandidate?.trim() ?? "";
  const hasAssess = Boolean(assessment);
  const videosOk = hasLocalVideo(m);
  const handoffDone =
    phase === "sent-to-cursor" ||
    ["planned", "needs-approval", "implementing", "pr-ready", "passed"].includes(
      state,
    );
  const shipDone = state === "pr-ready" || state === "passed";
  const cloudRunning =
    phase === "cloud-recording" ||
    phase === "cloud-agent-running" ||
    state === "cloud-recording" ||
    (state === "recording" && !videosOk);
  const anyBlocked = state === "blocked";

  /** @type {Record<string, 'not-started' | 'running' | 'ready' | 'blocked' | 'done'>} */
  const stepBadges = {
    cloud: (() => {
      if (anyBlocked) return "blocked";
      if (hasArtifactAgent(m)) return "done";
      if (cloudRunning) return "running";
      if (m.cloud?.customCloudAgents?.length || m.cloud?.recordAgentId)
        return "ready";
      return "not-started";
    })(),
    artifacts: (() => {
      if (anyBlocked) return "blocked";
      if (videosOk) return "done";
      if (phase === "downloading") return "running";
      if (hasArtifactAgent(m)) return "ready";
      return "not-started";
    })(),
    assess: (() => {
      if (anyBlocked) return "blocked";
      if (hasAssess || ["assessed", "planned", "needs-approval"].includes(state))
        return "done";
      if (state === "analyzing" || phase === "analyzing") return "running";
      if (videosOk) return "ready";
      return "not-started";
    })(),
    handoff: (() => {
      if (anyBlocked) return "blocked";
      if (handoffDone) return "done";
      if (hasAssess) return "ready";
      return "not-started";
    })(),
    ship: (() => {
      if (anyBlocked) return "blocked";
      if (shipDone) return "done";
      if (state === "implementing" || phase === "implementing") return "running";
      if (
        state === "needs-approval" ||
        state === "planned" ||
        (hasAssess && state === "assessed")
      ) {
        return "ready";
      }
      return "not-started";
    })(),
  };

  let nextLabel = "Select a run or create one.";
  if (m.runId) {
    if (!hasArtifactAgent(m)) {
      nextLabel = "Next: start or select a cloud agent for artifacts.";
    } else if (!videosOk) {
      nextLabel = "Next: list and download SDK artifacts so local video paths exist.";
    } else if (!hasAssess) {
      nextLabel = "Next: run Gemini video analysis on downloaded videos.";
    } else if (!handoffDone) {
      nextLabel =
        "Next: export the share bundle, then optionally send the assessment to the selected cloud agent (or plan/record fallback).";
    } else if (state === "needs-approval" || state === "planned") {
      nextLabel =
        "Ready: mark approved in the manifest only (you commit/PR yourself), or mark approved and start the implement agent (may open a PR).";
    } else {
      nextLabel = "Track cloud jobs in the log; run is in a late stage.";
    }
  }

  let reason;
  if (m.lastError) reason = `Last error: ${m.lastError}`;

  const gate = (() => {
    if (actionBusy) {
      return { block: true, reason: "Another action is in progress…" };
    }
    return { block: false, reason: "" };
  })();

  const actions = {
    newRun: {
      allowed: !gate.block && !loopHold,
      reason: gate.block ? gate.reason : loopHold ? loopReason : "",
    },
    btnAgentStart: {
      allowed: !gate.block && !loopHold && prompt.length > 0,
      reason: gate.block
        ? gate.reason
        : loopHold
          ? loopReason
          : !prompt
            ? "Enter a prompt in the custom command field."
            : "",
    },
    btnAgentSelect: {
      allowed: !gate.block && !loopHold && agentCandidate.length > 0,
      reason: gate.block
        ? gate.reason
        : loopHold
          ? loopReason
          : !agentCandidate
            ? "Pick an agent or paste a bc-… id."
            : "",
    },
    btnAgentFollowup: {
      allowed:
        !gate.block &&
        !loopHold &&
        agentCandidate.length > 0 &&
        prompt.length > 0,
      reason: gate.block
        ? gate.reason
        : loopHold
          ? loopReason
          : !agentCandidate
            ? "Pick an agent for follow-up."
            : !prompt
              ? "Enter a follow-up prompt."
              : "",
    },
    btnAgentRetryRecording: {
      allowed:
        !gate.block &&
        !loopHold &&
        agentCandidate.length > 0 &&
        retryPrompt.length > 0,
      reason: gate.block
        ? gate.reason
        : loopHold
          ? loopReason
          : !agentCandidate
            ? "Pick an agent for retry follow-up."
            : !retryPrompt
              ? "Enter the retry prompt."
              : "",
    },
    btnRefreshAgentConversation: {
      allowed: !gate.block && !loopHold && agentCandidate.length > 0,
      reason: gate.block
        ? gate.reason
        : loopHold
          ? loopReason
          : !agentCandidate
            ? "Pick an agent to load conversation details."
            : "",
    },
    btnCloudRecord: {
      allowed: !gate.block && !loopHold,
      reason: gate.block ? gate.reason : loopHold ? loopReason : "",
    },
    btnPlan: {
      allowed: !gate.block && !loopHold,
      reason: gate.block ? gate.reason : loopHold ? loopReason : "",
    },
    btnListArtifacts: {
      allowed: !gate.block && !loopHold && agentCandidate.length > 0,
      reason: gate.block
        ? gate.reason
        : loopHold
          ? loopReason
          : !agentCandidate
            ? "Pick an agent (or paste id) for list / download."
            : "",
    },
    btnSaveArtifactSlots: {
      allowed:
        !gate.block &&
        !loopHold &&
        Array.isArray(m.artifactSnapshots) &&
        m.artifactSnapshots.length > 0,
      reason: gate.block
        ? gate.reason
        : loopHold
          ? loopReason
          : !m.artifactSnapshots?.length
            ? "List cloud artifacts first (or load a run that has a saved list)."
            : "",
    },
    btnDownloadArtifacts: {
      allowed: !gate.block && !loopHold && agentCandidate.length > 0,
      reason: gate.block
        ? gate.reason
        : loopHold
          ? loopReason
          : !agentCandidate
            ? "Pick an agent (or paste id) for list / download."
            : "",
    },
    btnAnalyze: {
      allowed: !gate.block && !loopHold && videosOk,
      reason: gate.block
        ? gate.reason
        : loopHold
          ? loopReason
          : !videosOk
            ? "Download at least one minigame video to a local path in the manifest."
            : "",
    },
    btnShare: {
      allowed: !gate.block && !loopHold && hasAssess,
      reason: gate.block
        ? gate.reason
        : loopHold
          ? loopReason
          : !hasAssess
            ? "Run Gemini video analysis first so assessment.json exists."
            : "",
    },
    btnSend: {
      allowed: !gate.block && !loopHold && hasAssess,
      reason: gate.block
        ? gate.reason
        : loopHold
          ? loopReason
          : !hasAssess
            ? "Run Gemini video analysis first so there are findings to send."
            : "",
    },
    btnApprove: {
      allowed: !gate.block && !loopHold,
      reason: gate.block ? gate.reason : loopHold ? loopReason : "",
    },
    btnImplement: {
      allowed: !gate.block && !loopHold,
      reason: gate.block ? gate.reason : loopHold ? loopReason : "",
    },
    btnFocusedLoopRun: {
      allowed: !gate.block && !loopHold && hasAssess,
      reason: gate.block
        ? gate.reason
        : loopHold
          ? loopReason
          : !hasAssess
            ? "Run Gemini video analysis first."
            : "",
    },
    btnFocusedLoopCancel: {
      allowed: !gate.block && loopHold,
      reason: gate.block
        ? gate.reason
        : !loopHold
          ? "No focused loop is running."
          : "",
    },
  };

  return { stepBadges, nextLabel, reason, actions };
}

/**
 * @param {string} id
 * @param {{ disabled: boolean, busy: boolean, title: string }} s
 */
function setButtonState(id, s) {
  const el = document.getElementById(id);
  if (!el) return;
  el.disabled = s.disabled;
  el.setAttribute("aria-disabled", s.disabled ? "true" : "false");
  if (s.busy) {
    el.setAttribute("aria-busy", "true");
    el.classList.add("busy");
  } else {
    el.removeAttribute("aria-busy");
    el.classList.remove("busy");
  }
  el.title = s.title;
}

const INLINE_ACTION_STATUS = {
  btnAnalyze: () => geminiAnalysisStatus,
};

const INLINE_ACTION_MESSAGES = {
  btnAnalyze: {
    blockedPrefix: "Gemini video analysis is not ready",
    running:
      "Sending local WebM or MP4 clips to Gemini. This can take a bit; keep this cockpit open.",
    done: "Gemini video analysis finished. assessment.json is updated for this run.",
    failedPrefix: "Gemini video analysis failed",
  },
};

function setInlineActionStatus(buttonId, tone, text) {
  const el = INLINE_ACTION_STATUS[buttonId]?.();
  if (!el) return;
  el.hidden = !text;
  el.textContent = text;
  el.classList.remove("action-status--idle", "action-status--running", "action-status--done", "action-status--error");
  if (text) el.classList.add(`action-status--${tone}`);
}

const BADGE_KEYS = /** @type {const} */ ([
  "cloud",
  "artifacts",
  "assess",
  "handoff",
  "ship",
]);
const BADGE_ELS = {
  cloud: () => document.getElementById("stepBadgeCloud"),
  artifacts: () => document.getElementById("stepBadgeArtifacts"),
  assess: () => document.getElementById("stepBadgeAssess"),
  handoff: () => document.getElementById("stepBadgeHandoff"),
  ship: () => document.getElementById("stepBadgeShip"),
};

/** Short label before "· Ready" etc.; keys match BADGE_ELS. */
const STEP_BADGE_HEADING = {
  cloud: "Cloud",
  artifacts: "Artifacts",
  assess: "Gemini video",
  handoff: "Hand off",
  ship: "Finish",
};

function setStepBadge(key, status) {
  const el = BADGE_ELS[key]?.();
  if (!el) return;
  el.className = "step-badge";
  el.classList.add(`step-badge--${status}`);
  const labels = {
    "not-started": "Not started",
    running: "Running",
    ready: "Ready",
    blocked: "Blocked",
    done: "Done",
  };
  const base =
    STEP_BADGE_HEADING[key] ??
    key.charAt(0).toUpperCase() + key.slice(1);
  el.textContent = `${base} · ${labels[status] ?? status}`;
}

/**
 * @param {null | { manifest?: object, assessment?: object }} getBody
 */
function syncActionControls(getBody) {
  const m = getBody?.manifest;
  const assessment = getBody?.assessment;
  const prompt = agentCommandPrompt?.value?.trim() ?? "";
  const agentCandidate = selectedAgentCandidate();
  const retryPrompt = agentRetryPrompt?.value?.trim() ?? "";
  const ctx = { prompt, agentCandidate, retryPrompt };
  const derived = deriveControlState(m, assessment, ctx);

  if (controlSummary) {
    const agentLabel =
      m?.cloud?.selectedAgentId ??
      m?.cloud?.latestArtifactAgentId ??
      "(none)";
    const parts = [m ? `State: ${m.state}` : "", `Agent: ${agentLabel}`];
    if (derived.nextLabel) parts.push(derived.nextLabel);
    const text = parts.filter(Boolean).join(" · ");
    controlSummary.textContent = text;
    controlSummary.hidden = !text;
  }
  for (const k of BADGE_KEYS) {
    setStepBadge(k, derived.stepBadges[k]);
  }

  if (cockpitBoard) {
    const focusKey =
      BADGE_KEYS.find((k) => derived.stepBadges[k] === "running") ??
      BADGE_KEYS.find(
        (k) =>
          derived.stepBadges[k] !== "done" &&
          derived.stepBadges[k] !== "blocked",
      ) ??
      BADGE_KEYS.find((k) => derived.stepBadges[k] !== "done") ??
      "ship";
    cockpitBoard.setAttribute("data-cockpit-focus", focusKey);
  }

  for (const id of ACTION_BUTTON_IDS) {
    const spec = derived.actions[id];
    if (!spec) continue;
    const busy = actionBusy && currentBusyButtonId === id;
    const disabled = !spec.allowed || actionBusy;
    const title = spec.reason || "";
    setButtonState(id, { disabled, busy, title });
  }
}

function getUiSnapshot() {
  return {
    prompt: agentCommandPrompt?.value?.trim() ?? "",
    retryPrompt: agentRetryPrompt?.value?.trim() ?? "",
    agentCandidate: selectedAgentCandidate(),
  };
}

/**
 * @param {string} buttonId
 * @param {string} logLine
 * @param {() => Promise<unknown>} asyncFn
 * @param {{ scrollLog?: boolean }} [runOpts] Pass `scrollLog: true` to scroll the timeline into view (off by default).
 */
async function runAction(buttonId, logLine, asyncFn, runOpts) {
  if (actionBusy) {
    log("Wait for the current action to finish.");
    return;
  }
  const snap = getUiSnapshot();
  const d = deriveControlState(
    lastRunGetResponse?.manifest,
    lastRunGetResponse?.assessment,
    snap,
  );
  if (!d.actions[buttonId]?.allowed) {
    const msg = d.actions[buttonId]?.reason || "This action is not available.";
    log(msg);
    const inline = INLINE_ACTION_MESSAGES[buttonId];
    setInlineActionStatus(
      buttonId,
      "error",
      inline ? `${inline.blockedPrefix}: ${msg}` : msg,
    );
    return;
  }
  actionBusy = true;
  currentBusyButtonId = buttonId;
  syncActionControls(lastRunGetResponse);
  if (logLine) log(logLine, { scrollLog: runOpts?.scrollLog === true });
  const inline = INLINE_ACTION_MESSAGES[buttonId];
  if (inline) setInlineActionStatus(buttonId, "running", inline.running);
  try {
    await asyncFn();
    if (inline) setInlineActionStatus(buttonId, "done", inline.done);
  } catch (e) {
    const msg = String(e);
    log(msg);
    if (inline) {
      setInlineActionStatus(buttonId, "error", `${inline.failedPrefix}: ${msg}`);
    }
  } finally {
    actionBusy = false;
    currentBusyButtonId = null;
    syncActionControls(lastRunGetResponse);
  }
}

async function refreshRuns() {
  if (!runList) return;
  const data = await jfetch("/api/runs");
  runList.innerHTML = "";
  for (const m of data.runs) {
    const li = document.createElement("li");
    li.textContent = `${m.runId}  [${m.state}]`;
    if (m.runId === selectedRunId) li.classList.add("active");
    li.addEventListener("click", () => openRun(m.runId));
    runList.appendChild(li);
  }
}

function scrollVideoPreviewPanel() {
  requestAnimationFrame(() => {
    videoPreviewPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function scrollStep2ArtifactListIntoView() {
  requestAnimationFrame(() => {
    document.getElementById("step2ArtifactList")?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  });
}

/**
 * @param {Record<string, unknown> | null | undefined} m manifest
 */
function renderArtifactListInline(m) {
  const summary = document.getElementById("artifactListSummary");
  const wrap = document.getElementById("artifactTableWrap");
  const tbody = document.getElementById("artifactTableBody");
  if (!summary || !wrap || !tbody) return;
  const shots = m?.artifactSnapshots;
  const overrides = m?.cockpit?.artifactSlotOverrides ?? {};
  if (!Array.isArray(shots) || shots.length === 0) {
    summary.innerHTML =
      "No list loaded yet. Use <strong>List (cloud only)</strong> to fetch paths from the selected agent, or <strong>Download for video review</strong> (also refreshes the list).";
    tbody.innerHTML = "";
    wrap.hidden = true;
    return;
  }
  const agent =
    m?.cloud?.latestArtifactAgentId || m?.cloud?.selectedAgentId || "";
  summary.textContent = `${shots.length} path(s) in the last cloud list${
    agent ? ` (agent ${agent})` : ""
  }.`;
  const getStatus = rowArtifactStatuses(shots, overrides);
  const max = 200;
  tbody.innerHTML = "";
  for (let i = 0; i < Math.min(shots.length, max); i += 1) {
    const row = shots[i];
    if (!row || typeof row !== "object" || !("path" in row)) continue;
    const path = String(row.path);
    const c = "classification" in row ? row.classification : undefined;
    const tr = document.createElement("tr");
    const pathTd = document.createElement("td");
    pathTd.className = "artifact-td-path";
    pathTd.textContent = path;
    tr.appendChild(pathTd);
    const uTd = document.createElement("td");
    uTd.textContent =
      row && "updatedAt" in row && row.updatedAt
        ? String(row.updatedAt)
        : "—";
    tr.appendChild(uTd);
    const sTd = document.createElement("td");
    sTd.textContent = formatArtifactSize(
      "size" in row && typeof row.size === "number" ? row.size : null,
    );
    tr.appendChild(sTd);
    const det = document.createElement("td");
    if (c && typeof c === "object" && c.slot) {
      det.textContent = String(c.slot);
    } else {
      det.textContent = "—";
    }
    tr.appendChild(det);
    const confTd = document.createElement("td");
    if (c && typeof c === "object" && c.confidence) {
      confTd.textContent = String(c.confidence);
      if (c.reason) confTd.title = String(c.reason);
    } else {
      confTd.textContent = "—";
    }
    tr.appendChild(confTd);
    const slotTd = document.createElement("td");
    if (c && typeof c === "object" && c.ext != null) {
      const sel = document.createElement("select");
      sel.className = "artifact-slot-select";
      sel.dataset.artifactPath = path;
      const add = (v, label) => {
        const o = document.createElement("option");
        o.value = v;
        o.textContent = label;
        sel.appendChild(o);
      };
      add("", "Auto");
      for (const sl of VIDEO_SLOTS) {
        add(sl, sl);
      }
      const eff = effectiveArtifactSlot(
        { path, classification: c },
        overrides,
      );
      sel.value = eff && VIDEO_SLOTS.includes(eff) ? eff : "";
      slotTd.appendChild(sel);
    } else {
      slotTd.textContent = "—";
    }
    tr.appendChild(slotTd);
    const stTd = document.createElement("td");
    stTd.textContent = getStatus(path);
    tr.appendChild(stTd);
    tbody.appendChild(tr);
  }
  if (shots.length > max) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 7;
    td.className = "artifact-table-more";
    td.textContent = `… and ${shots.length - max} more (see Run manifest or Raw response).`;
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
  wrap.hidden = false;
}

/**
 * Bust browser cache of /local/… videos: path is stable after re-download, so
 * the URL must change when the manifest (or that file’s download row) updates.
 * @param {Record<string, unknown> | null | undefined} m
 * @param {string} relFromRunRoot e.g. `artifacts/qa-runs/rid/videos/runner.webm`
 * @param {string} videoRelFromArtifacts e.g. `videos/runner.webm` or `videos/runner.mp4`
 */
function videoLocalCacheBuster(m, relFromRunRoot, videoRelFromArtifacts) {
  const bits = [m?.updatedAt, m?.cockpit?.lastActionAt]
    .filter((x) => typeof x === "string" && x.length > 0);
  const dls = m?.downloadedArtifacts;
  if (Array.isArray(dls)) {
    for (const e of dls) {
      if (e && e.status === "downloaded" && e.relativePath === videoRelFromArtifacts) {
        if (e.updatedAt) bits.push(/** @type {string} */ (e.updatedAt));
        if (e.downloadedAt) bits.push(/** @type {string} */ (e.downloadedAt));
      }
    }
  }
  const lw = m?.cockpit?.latestSyncWebm;
  if (lw && typeof lw === "object" && "relativePath" in lw) {
    const rel = String(lw.relativePath);
    if (rel === videoRelFromArtifacts || relFromRunRoot.endsWith(rel)) {
      if (lw.cloudUpdatedAt) bits.push(String(lw.cloudUpdatedAt));
    }
  }
  const sorted = bits.filter(Boolean).sort();
  return sorted.length ? sorted[sorted.length - 1] : "0";
}

/**
 * Latest cloud SDK path that was mapped into this slot’s local video file.
 * @param {Record<string, unknown> | null | undefined} m
 * @param {string} slot
 * @param {string} videoRelFromArtifacts
 */
function cloudArtifactPathForSlot(m, slot, videoRelFromArtifacts) {
  const dls = m?.downloadedArtifacts;
  if (!Array.isArray(dls)) return "";
  let bestT = "";
  let bestPath = "";
  for (const e of dls) {
    if (
      !e ||
      e.status !== "downloaded" ||
      e.relativePath !== videoRelFromArtifacts
    ) {
      continue;
    }
    const t = String(e.updatedAt ?? e.downloadedAt ?? "");
    if (t >= bestT) {
      bestT = t;
      bestPath = typeof e.path === "string" ? e.path : "";
    }
  }
  return bestPath;
}

function videoRelativePathForSlot(runId, slot, localPath) {
  const file = String(localPath).split(/[\\/]/).pop() || `${slot}.webm`;
  const safeFile = /^(runner|sentence|errand|tamper)\.(webm|mp4)$/i.test(file)
    ? file
    : `${slot}.webm`;
  return {
    localRel: `artifacts/qa-runs/${runId}/videos/${safeFile}`,
    artifactRel: `videos/${safeFile}`,
  };
}

function updateGeminiAssessScope(m) {
  if (!geminiAssessScope) return;
  const withVideo = VIDEO_SLOTS.filter((s) => Boolean(m?.videos?.[s]));
  const missing = VIDEO_SLOTS.filter((s) => !m?.videos?.[s]);
  if (withVideo.length === 0) {
    geminiAssessScope.textContent =
      "No videos in this run’s manifest yet — record or download artifacts first. Gemini needs at least one local file.";
    return;
  }
  let msg = `This run will analyze: ${withVideo.join(", ")} (${withVideo.length} parallel Gemini request${withVideo.length === 1 ? "" : "s"}).`;
  if (missing.length)
    msg += ` No file yet (skipped until present): ${missing.join(", ")}.`;
  geminiAssessScope.textContent = msg;
}

function slotVideos(m) {
  if (!videos) return;
  updateGeminiAssessScope(m);
  videos.innerHTML = "";
  const newestSlot = m.cockpit?.latestSyncWebm?.slot;
  for (const s of VIDEO_SLOTS) {
    const p = m.videos?.[s];
    const box = document.createElement("div");
    box.className = "video-slot";
    if (newestSlot === s) box.classList.add("video-slot--newest");
    const head = document.createElement("div");
    head.className = "video-slot-head";
    const h3 = document.createElement("h3");
    h3.textContent = s;
    head.appendChild(h3);
    if (newestSlot === s) {
      const badge = document.createElement("span");
      badge.className = "latest-webm-badge";
      badge.textContent = "Newest download";
      const cu = m.cockpit?.latestSyncWebm?.cloudUpdatedAt;
      const src = m.cockpit?.latestSyncWebm?.sourceCloudPath;
      const mo = m.cockpit?.latestSyncWebm?.manualOverride;
      badge.title = [
        "Newest clip in the last successful download batch (all slots with a file still go to Gemini).",
        src ? `Cloud file: ${src}` : null,
        cu ? `Cloud updated: ${cu}` : null,
        mo ? "Slot came from a saved manual assignment." : null,
      ]
        .filter(Boolean)
        .join(" · ");
      head.appendChild(badge);
    }
    box.appendChild(head);
    if (p) {
      const rel = videoRelativePathForSlot(m.runId, s, p);
      const url = `/local/${rel.localRel}?v=${encodeURIComponent(
        videoLocalCacheBuster(m, rel.localRel, rel.artifactRel),
      )}`;
      const v = document.createElement("video");
      v.src = url;
      v.controls = true;
      v.width = 320;
      box.appendChild(v);
      const c = document.createElement("p");
      c.className = "hint";
      c.textContent = p;
      box.appendChild(c);
      const cloudPath = cloudArtifactPathForSlot(m, s, rel.artifactRel);
      if (cloudPath) {
        const cCloud = document.createElement("p");
        cCloud.className = "hint hint--cloud-artifact";
        const manual = Boolean(
          m.cockpit?.artifactSlotOverrides?.[cloudPath],
        );
        cCloud.textContent = `Cloud artifact: ${cloudPath}${manual ? " (manual)" : ""}`;
        box.appendChild(cCloud);
      }
    } else {
      const p2 = document.createElement("p");
      p2.className = "hint";
      p2.textContent = "No file yet — record or download artifacts.";
      box.appendChild(p2);
    }
    videos.appendChild(box);
  }
}

function shortList(items, limit = 3) {
  if (!Array.isArray(items) || items.length === 0) return [];
  return items.slice(0, limit).map((x) => String(x));
}

function issueLabel(issue) {
  if (!issue || typeof issue !== "object") return String(issue);
  const i = /** @type {{ severity?: string; tSec?: number; summary?: string; evidence?: string }} */ (issue);
  const bits = [];
  if (i.severity) bits.push(i.severity.toUpperCase());
  if (typeof i.tSec === "number") bits.push(`${i.tSec}s`);
  const lead = bits.length ? `[${bits.join(" · ")}] ` : "";
  return `${lead}${i.summary ?? i.evidence ?? JSON.stringify(issue)}`;
}

function renderAssessmentResults(assessment) {
  if (!assessmentResultsPanel || !assessmentResults || !assessmentGateBadge) return;
  assessmentResults.innerHTML = "";
  if (!assessment) {
    assessmentResultsPanel.hidden = true;
    assessmentGateBadge.textContent = "";
    return;
  }
  assessmentResultsPanel.hidden = false;
  const gate = assessment.gate ?? {};
  const failing = Array.isArray(gate.failing) ? gate.failing : [];
  const allPassed = Boolean(gate.allPassed);
  assessmentGateBadge.className = "results-gate";
  assessmentGateBadge.classList.add(
    allPassed ? "results-gate--pass" : "results-gate--fail",
  );
  assessmentGateBadge.textContent = allPassed
    ? "All passed"
    : `Needs work: ${failing.length ? failing.join(", ") : "review findings"}`;

  const meta = document.createElement("p");
  meta.className = "assessment-meta";
  const threshold =
    typeof gate.passThreshold === "number" ? `${gate.passThreshold}` : "n/a";
  meta.textContent = `Model: ${assessment.model ?? "(unknown)"} · Threshold: ${threshold} · Created: ${assessment.createdAt ?? "(unknown)"}`;
  assessmentResults.appendChild(meta);

  const grid = document.createElement("div");
  grid.className = "assessment-grid";
  for (const slot of VIDEO_SLOTS) {
    const row = assessment.byMinigame?.[slot];
    const card = document.createElement("article");
    const score = typeof row?.score100 === "number" ? row.score100 : null;
    card.className = "assessment-card";
    card.classList.add(score !== null && score >= (gate.passThreshold ?? 90) ? "assessment-card--pass" : "assessment-card--fail");

    const head = document.createElement("div");
    head.className = "assessment-card-head";
    const title = document.createElement("h3");
    title.textContent = slot;
    const scoreEl = document.createElement("span");
    scoreEl.className = "assessment-score";
    scoreEl.textContent = score === null ? "n/a" : `${score}/100`;
    head.appendChild(title);
    head.appendChild(scoreEl);
    card.appendChild(head);

    const summary = document.createElement("p");
    summary.className = "assessment-summary";
    summary.textContent = row?.assessment ?? "No Gemini assessment for this slot.";
    card.appendChild(summary);

    const issueItems = shortList(row?.issues?.map(issueLabel), 3);
    if (issueItems.length) {
      const issues = document.createElement("ul");
      issues.className = "assessment-list assessment-list--issues";
      for (const item of issueItems) {
        const li = document.createElement("li");
        li.textContent = item;
        issues.appendChild(li);
      }
      card.appendChild(issues);
    }

    const fixes = shortList(row?.recommendedFixes, 3);
    if (fixes.length) {
      const fixesEl = document.createElement("ul");
      fixesEl.className = "assessment-list assessment-list--fixes";
      for (const fix of fixes) {
        const li = document.createElement("li");
        li.textContent = fix;
        fixesEl.appendChild(li);
      }
      card.appendChild(fixesEl);
    }
    grid.appendChild(card);
  }
  assessmentResults.appendChild(grid);
}

function resolvedCommandRole() {
  const sel = agentCommandRole?.value ?? "custom";
  if (sel === "custom") {
    const p = agentRolePrefix?.value?.trim() ?? "";
    return p.length > 0 ? p : "custom";
  }
  return sel;
}

function appendAgentEvent(line) {
  if (!agentEvents) return;
  const t = new Date().toISOString().slice(11, 19);
  const lines = (`[${t}] ${line}\n` + agentEvents.textContent)
    .split("\n")
    .slice(0, maxAgentEventLines);
  agentEvents.textContent = lines.join("\n");
}

function formatAgentEventData(raw) {
  try {
    const data = JSON.parse(raw);
    if (data.error) return `error ${data.error}`;
    if (data.status) return `status ${data.status}`;
    if (data.message?.type) return `${data.message.type} ${JSON.stringify(data.message)}`;
    if (data.result) return `done ${JSON.stringify(data.result)}`;
    return JSON.stringify(data);
  } catch {
    return raw;
  }
}

/**
 * Mirrors `defaultCockpitAgentId` in `cockpitServer.ts` (keep order in sync).
 * @param {object | undefined} c manifest.cloud
 */
function defaultCockpitAgentIdFromCloud(c) {
  if (!c) return "";
  const fromAgentTable = () => {
    const rows = c.agents;
    if (!rows?.length) return "";
    const withSelected = rows.filter(
      (a) => typeof a.selectedAt === "string" && a.selectedAt.length > 0,
    );
    if (withSelected.length) {
      withSelected.sort((a, b) =>
        (b.selectedAt || "").localeCompare(a.selectedAt || ""),
      );
      return withSelected[0].agentId || "";
    }
    return rows[rows.length - 1].agentId || "";
  };
  return (
    c.selectedAgentId ||
    c.latestArtifactAgentId ||
    c.recordAgentId ||
    c.customCloudAgents?.at(-1)?.agentId ||
    fromAgentTable() ||
    c.planAgentId ||
    c.implementAgentId ||
    ""
  );
}

function selectedAgentCandidate() {
  const pick = agentPick?.value?.trim() ?? "";
  const typed = agentId?.value?.trim() ?? "";
  if (typed) return typed;
  if (pick) return pick;
  const c = lastRunGetResponse?.manifest?.cloud;
  return defaultCockpitAgentIdFromCloud(c);
}

function streamAgentEvents(agent, runId) {
  if (!agent || !runId || !selectedRunId || typeof EventSource === "undefined") {
    return;
  }
  if (activeAgentEvents) activeAgentEvents.close();
  const url = `/api/runs/${encodeURIComponent(selectedRunId)}/agents/${encodeURIComponent(agent)}/events?runId=${encodeURIComponent(runId)}`;
  activeAgentEvents = new EventSource(url);
  appendAgentEvent(`Streaming ${agent} / ${runId}`);
  activeAgentEvents.addEventListener("status", (event) => {
    appendAgentEvent(formatAgentEventData(event.data));
  });
  activeAgentEvents.addEventListener("message", (event) => {
    appendAgentEvent(formatAgentEventData(event.data));
  });
  activeAgentEvents.addEventListener("done", (event) => {
    appendAgentEvent(formatAgentEventData(event.data));
    activeAgentEvents.close();
    activeAgentEvents = null;
    if (selectedRunId) void openRun(selectedRunId);
  });
  activeAgentEvents.addEventListener("run-error", (event) => {
    appendAgentEvent(formatAgentEventData(event.data));
  });
  activeAgentEvents.addEventListener("error", () => {
    appendAgentEvent("stream closed or failed");
    activeAgentEvents?.close();
    activeAgentEvents = null;
  });
}

/**
 * @param {{
 *   agentId: string;
 *   role: string;
 *   runId?: string;
 *   displayName?: string;
 *   status?: string;
 *   lastPromptPreview?: string;
 * }} a
 */
function formatAgentOptionText(a) {
  const st = a.status ? ` [${a.status}]` : "";
  const idShort = a.agentId.length > 22 ? `${a.agentId.slice(0, 22)}…` : a.agentId;
  if (a.lastPromptPreview) {
    const p = a.lastPromptPreview;
    const shortP = p.length > 36 ? `${p.slice(0, 33)}…` : p;
    return `${shortP} · ${a.role} · ${idShort}${st}`;
  }
  const label =
    a.displayName && a.displayName !== a.role ? a.displayName : a.role;
  return `${label} · ${idShort}${st}`;
}

/**
 * @param {{
 *   agentId: string;
 *   role: string;
 *   runId?: string;
 *   lastPromptPreview?: string;
 * }} a
 */
function formatAgentOptionTitle(a) {
  const parts = [a.agentId];
  if (a.runId) parts.push(`cloud run: ${a.runId}`);
  if (a.lastPromptPreview) parts.push(a.lastPromptPreview);
  return parts.join(" | ");
}

/**
 * @param {unknown} convo
 * @returns {unknown[]}
 */
function extractConversationMessages(convo) {
  if (!convo || typeof convo !== "object") return [];
  const c = /** @type {Record<string, unknown>} */ (convo);
  if (Array.isArray(c.messages)) return c.messages;
  const inner = c.data;
  if (inner && typeof inner === "object" && Array.isArray(inner.messages)) {
    return inner.messages;
  }
  return [];
}

/**
 * @param {unknown[]} messages
 * @returns {string | null}
 */
function lastMessagePreview(messages) {
  if (!messages.length) return null;
  const last = messages[messages.length - 1];
  if (typeof last === "string") {
    return last.length > 220 ? `${last.slice(0, 217)}…` : last;
  }
  if (last && typeof last === "object") {
    const o = /** @type {Record<string, unknown>} */ (last);
    const text = o.content ?? o.text ?? o.body;
    if (typeof text === "string") {
      return text.length > 220 ? `${text.slice(0, 217)}…` : text;
    }
  }
  try {
    const s = JSON.stringify(last);
    return s.length > 220 ? `${s.slice(0, 217)}…` : s;
  } catch {
    return String(last);
  }
}

/**
 * @param {{
 *   dashboardUrl?: string;
 *   conversationPath?: string;
 *   conversation?: unknown;
 * }} data
 */
function renderAgentDetails(data) {
  if (!agentCloudLinks || !agentConversationSummary) return;
  agentCloudLinks.innerHTML = "";
  agentConversationSummary.textContent = "";
  if (data.dashboardUrl) {
    const a = document.createElement("a");
    a.className = "cloud-agent-link";
    a.href = data.dashboardUrl;
    a.target = "_blank";
    a.rel = "noreferrer";
    a.textContent = "Open in Cursor Cloud";
    agentCloudLinks.appendChild(a);
  }
  if (data.conversationPath) {
    const span = document.createElement("span");
    span.className = "local-path";
    span.textContent = `Local trace: ${data.conversationPath}`;
    agentCloudLinks.appendChild(span);
  }
  const msgs = extractConversationMessages(data.conversation);
  const n = msgs.length;
  if (n > 0) {
    const prev = lastMessagePreview(msgs);
    const line = document.createElement("span");
    line.textContent = `Conversation: ${n} message${n === 1 ? "" : "s"}.`;
    agentConversationSummary.appendChild(line);
    if (prev) {
      const br = document.createElement("br");
      const span = document.createElement("span");
      span.className = "preview";
      span.textContent = prev;
      agentConversationSummary.appendChild(br);
      agentConversationSummary.appendChild(span);
    }
  } else if (data.conversation !== undefined && data.conversation !== null) {
    agentConversationSummary.textContent =
      "Conversation: (no messages in API response; check local JSON or Cursor Cloud).";
  } else if (data.dashboardUrl || data.conversationPath) {
    agentConversationSummary.textContent =
      "Message preview updates when you use Refresh conversation.";
  }
}

/**
 * @param {object} manifest
 */
function hydrateAgentDetailsFromManifest(manifest) {
  if (!agentCloudLinks || !agentConversationSummary) return;
  const m = /** @type {{ cloud?: { agents?: object[] } }} */ (manifest);
  const id = selectedAgentCandidate();
  const row = m.cloud?.agents?.find(
    (a) => /** @type {{ agentId: string }} */ (a).agentId === id,
  );
  if (!row) {
    agentCloudLinks.innerHTML = "";
    agentConversationSummary.textContent = "";
    return;
  }
  const r = /** @type {{
    dashboardUrl?: string;
    conversationPath?: string;
    lastConversationSyncAt?: string;
  }} */ (row);
  if (!r.dashboardUrl && !r.conversationPath) {
    agentCloudLinks.innerHTML = "";
    agentConversationSummary.textContent =
      "Select an agent; use Refresh conversation to write a local trace under artifacts/qa-runs/…/agent-conversations/.";
    return;
  }
  renderAgentDetails({
    dashboardUrl: r.dashboardUrl,
    conversationPath: r.conversationPath,
    conversation: null,
  });
  if (r.lastConversationSyncAt) {
    const em = document.createElement("em");
    em.className = "sync-hint";
    em.textContent = ` Last saved: ${r.lastConversationSyncAt}.`;
    agentConversationSummary.appendChild(em);
  }
}

async function refreshAgentPick(manifest) {
  if (!selectedRunId || !agentPick) return;
  const data = await jfetch(`/api/runs/${encodeURIComponent(selectedRunId)}/agents`);
  agentPick.innerHTML = "";
  for (const a of data.agents) {
    const opt = document.createElement("option");
    opt.value = a.agentId;
    opt.textContent = formatAgentOptionText(a);
    opt.title = formatAgentOptionTitle(a);
    agentPick.appendChild(opt);
  }
  const want =
    data.selectedAgentId ??
    manifest?.cloud?.selectedAgentId ??
    manifest?.cloud?.latestArtifactAgentId ??
    data.agents[0]?.agentId ??
    "";
  if (want && [...agentPick.options].some((o) => o.value === want)) {
    agentPick.value = want;
  }
  if (selectedAgentIdEl) {
    selectedAgentIdEl.textContent =
      data.selectedAgentId ?? manifest?.cloud?.latestArtifactAgentId ?? "(none)";
  }
  hydrateAgentDetailsFromManifest(manifest);
}

async function openRun(runId) {
  selectedRunId = runId;
  const data = await jfetch(`/api/runs/${encodeURIComponent(runId)}`);
  lastRunGetResponse = data;
  const m = data.manifest;
  const assessment = data.assessment;
  if (currentRun) currentRun.hidden = false;
  if (runTitle) runTitle.textContent = m.runId;
  if (runMeta) {
    runMeta.textContent = JSON.stringify(
      { state: m.state, cloud: m.cloud, cockpit: m.cockpit },
      null,
      2,
    );
  }
  const defaultAgent = defaultCockpitAgentIdFromCloud(m.cloud);
  if (agentId) agentId.value = defaultAgent;
  if (selectedAgentIdEl) {
    selectedAgentIdEl.textContent = m.cloud?.latestArtifactAgentId || "(none)";
  }
  try {
    await refreshAgentPick(m);
  } catch {
    /* ignore agent list errors */
  }
  applyAssessInstructionForRun(m.runId);
  const geminiOverviewPre = document.getElementById("geminiPromptOverviewPre");
  if (geminiOverviewPre) {
    geminiOverviewPre.textContent =
      typeof data.geminiAssessmentPromptOverview === "string"
        ? data.geminiAssessmentPromptOverview
        : "(Prompt overview unavailable — use a current QA cockpit server.)";
  }
  applyAssessmentModelForRun(m.runId, data.assessModel, data.assessModels);
  applyRetryPromptForRun(m.runId);
  await refreshRecipePrompts(m.runId);
  applyAgentScratchForRun(m.runId, assessment);
  applyHandoffScope(m.runId);
  applyFollowUpInstructionForRun(m.runId);
  const flSlot = document.getElementById("focusedLoopSlot");
  if (flSlot) {
    const preset = handoffScopePreset?.value ?? "all";
    if (preset !== "all" && preset !== "custom" && VIDEO_SLOTS.includes(preset)) {
      flSlot.value = preset;
    } else if (preset === "custom") {
      const picked = VIDEO_SLOTS.filter(
        (s) => document.querySelector(`[data-handoff-slot="${s}"]`)?.checked,
      );
      if (picked.length === 1) flSlot.value = picked[0];
    }
  }
  const flInstr = document.getElementById("focusedLoopInstruction");
  if (flInstr && followUpInstruction && !flInstr.value.trim()) {
    flInstr.value = followUpInstruction.value;
  }
  slotVideos(m);
  renderArtifactListInline(m);
  renderAssessmentResults(assessment);
  if (rawEl) rawEl.textContent = JSON.stringify(data, null, 2);
  await refreshRuns();
  hydrateAgentDetailsFromManifest(m);
  renderFocusedLoopUI(m);
  syncActionControls({ manifest: m, assessment });
  syncFocusedLoopPoll();
}

async function getRun(path) {
  const id = selectedRunId;
  if (!id) throw new Error("Select a run first");
  return jfetch(`/api/runs/${encodeURIComponent(id)}${path}`);
}

async function postRun(path, body) {
  const id = selectedRunId;
  if (!id) throw new Error("Select a run first");
  const url = `/api/runs/${encodeURIComponent(id)}${path}`;
  const res = await jfetch(url, { method: "POST", body: JSON.stringify(body ?? {}) });
  if (rawEl) rawEl.textContent = JSON.stringify(res, null, 2);
  await openRun(id);
  return res;
}

function onPromptOrAgentInput() {
  if (selectedRunId) saveAgentScratchForRun(selectedRunId);
  if (!lastRunGetResponse) return;
  syncActionControls(lastRunGetResponse);
}

document.querySelector("#newRun")?.addEventListener("click", async () => {
  await runAction("newRun", "Creating new run…", async () => {
    const data = await jfetch("/api/runs", {
      method: "POST",
      body: JSON.stringify({}),
    });
    log(`Created run ${data.manifest.runId}`);
    await openRun(data.manifest.runId);
  });
});

document.querySelector("#btnAgentStart")?.addEventListener("click", async () => {
  await runAction("btnAgentStart", "Starting custom cloud agent…", async () => {
    const res = await postRun("/agents/start", {
      prompt: agentCommandPrompt?.value?.trim() ?? "",
      displayName: resolvedCommandRole(),
      friendlyName: agentFriendlyName?.value?.trim() ?? "",
    });
    streamAgentEvents(res.agentId, res.runId);
    log("Custom agent start requested");
  });
});

document.querySelector("#btnAgentSelect")?.addEventListener("click", async () => {
  await runAction("btnAgentSelect", "Selecting artifact agent…", async () => {
    const id = selectedAgentCandidate();
    await postRun("/agents/select", {
      agentId: id,
      displayName: resolvedCommandRole(),
    });
    log(`Selected artifact agent ${id}`);
  });
});

document.querySelector("#btnAgentFollowup")?.addEventListener("click", async () => {
  await runAction("btnAgentFollowup", "Sending follow-up…", async () => {
    const id = selectedAgentCandidate();
    const res = await postRun(`/agents/${encodeURIComponent(id)}/followup`, {
      prompt: agentCommandPrompt?.value?.trim() ?? "",
    });
    streamAgentEvents(res.agent?.agentId ?? id, res.agent?.runId);
    log("Follow-up sent");
  });
});

document
  .querySelector("#btnAgentRetryRecording")
  ?.addEventListener("click", async () => {
    await runAction("btnAgentRetryRecording", "Sending retry to cloud agent…", async () => {
      const id = selectedAgentCandidate();
      const res = await postRun(`/agents/${encodeURIComponent(id)}/followup`, {
        prompt: agentRetryPrompt?.value?.trim() ?? "",
      });
      streamAgentEvents(res.agent?.agentId ?? id, res.agent?.runId);
      log("Retry / follow-up sent to selected agent");
    });
  });

document
  .querySelector("#btnRefreshAgentConversation")
  ?.addEventListener("click", async () => {
    await runAction("btnRefreshAgentConversation", "Fetching cloud agent details…", async () => {
      const id = selectedAgentCandidate();
      const data = await getRun(
        `/agents/${encodeURIComponent(id)}/details`,
      );
      if (rawEl) rawEl.textContent = JSON.stringify(data, null, 2);
      renderAgentDetails(data);
      if (selectedRunId) await openRun(selectedRunId);
      log("Refreshed agent conversation (local JSON + cloud links).");
    });
  });

document.querySelector("#btnInjectRecordRecipe")?.addEventListener("click", () => {
  void applyRecipeToCustom("record");
});

document.querySelector("#btnInjectPlanRecipe")?.addEventListener("click", () => {
  void applyRecipeToCustom("plan");
});

document.querySelector("#btnRecipeRecordToCustom")?.addEventListener("click", () => {
  void applyRecipeToCustom("record");
});

document.querySelector("#btnRecipePlanToCustom")?.addEventListener("click", () => {
  void applyRecipeToCustom("plan");
});

document.querySelector("#btnCloudRecord")?.addEventListener("click", async () => {
  await runAction("btnCloudRecord", "Starting record preset (cloud)…", async () => {
    await postRun("/cloud-record", {});
  });
});

document.querySelector("#btnListArtifacts")?.addEventListener("click", async () => {
  await runAction("btnListArtifacts", "Listing artifacts…", async () => {
    await postRun("/artifacts/list", { agentId: selectedAgentCandidate() });
    log("Artifact list updated — see Step 2 (Cloud list result) above.");
    scrollStep2ArtifactListIntoView();
  });
});

document
  .querySelector("#btnSaveArtifactSlots")
  ?.addEventListener("click", async () => {
    await runAction("btnSaveArtifactSlots", "Saving slot assignments…", async () => {
      const m = lastRunGetResponse?.manifest;
      if (!m?.artifactSnapshots) return;
      const prev = m.cockpit?.artifactSlotOverrides ?? {};
      /** @type {Record<string, string>} */
      const assignments = {};
      const removePaths = [];
      const tbody = document.getElementById("artifactTableBody");
      if (!tbody) return;
      for (const sel of tbody.querySelectorAll("select.artifact-slot-select")) {
        const p = sel.dataset.artifactPath;
        if (!p) continue;
        const v = sel.value;
        if (v && VIDEO_SLOTS.includes(v)) {
          assignments[p] = v;
        } else if (!v && prev[p]) {
          removePaths.push(p);
        }
      }
      await postRun("/artifacts/assign", { assignments, removePaths });
    });
  });

document.querySelector("#btnDownloadArtifacts")?.addEventListener("click", async () => {
  await runAction("btnDownloadArtifacts", "Downloading artifacts…", async () => {
    await postRun("/artifacts/download", { agentId: selectedAgentCandidate() });
    scrollVideoPreviewPanel();
  });
});

document.querySelector("#btnPlan")?.addEventListener("click", async () => {
  const msg =
    "The plan agent call blocks the server until the cloud run finishes. Continue?";
  if (!window.confirm(msg)) {
    return;
  }
  await runAction("btnPlan", "Plan preset (blocking until cloud run done)…", async () => {
    await postRun("/plan", {});
  });
});

document.querySelector("#btnAnalyze")?.addEventListener("click", async () => {
  await runAction("btnAnalyze", "Running Gemini video analysis…", async () => {
    const text = assessmentInstruction?.value?.trim() ?? "";
    const model = selectedAssessmentModel();
    if (selectedRunId && model) saveAssessmentModel(selectedRunId, model);
    await postRun("/analyze", {
      assessmentInstruction: text,
      ...(model ? { assessmentModel: model } : {}),
    });
  });
});

document.querySelector("#btnShare")?.addEventListener("click", async () => {
  await runAction("btnShare", "Exporting share bundle to disk…", async () => {
    await postRun("/share", {
      ...handoffIncludeBody(),
      ...followUpInstructionBody(),
    });
  });
});

document.querySelector("#btnSend")?.addEventListener("click", async () => {
  await runAction("btnSend", "Sending assessment follow-up…", async () => {
    let id = selectedAgentCandidate();
    if (!id && lastRunGetResponse?.manifest?.cloud) {
      id = defaultCockpitAgentIdFromCloud(lastRunGetResponse.manifest.cloud);
    }
    await postRun("/send-findings", {
      ...handoffIncludeBody(),
      ...followUpInstructionBody(),
      ...(id ? { agentId: id } : {}),
    });
  });
});

handoffScopePreset?.addEventListener("change", () => {
  const v = handoffScopePreset.value;
  if (v === "all") {
    for (const s of VIDEO_SLOTS) {
      const el = document.querySelector(`[data-handoff-slot="${s}"]`);
      if (el) el.checked = true;
    }
  } else if (v !== "custom") {
    for (const s of VIDEO_SLOTS) {
      const el = document.querySelector(`[data-handoff-slot="${s}"]`);
      if (el) el.checked = s === v;
    }
  }
  syncHandoffCustomVisibility();
  if (selectedRunId) saveHandoffScope(selectedRunId);
});

handoffCustomSlots?.addEventListener("change", () => {
  if (selectedRunId && handoffScopePreset?.value === "custom") {
    saveHandoffScope(selectedRunId);
  }
});

followUpInstruction?.addEventListener("input", () => {
  if (selectedRunId) saveFollowUpInstructionForRun(selectedRunId);
});
followUpInstruction?.addEventListener("change", () => {
  if (selectedRunId) saveFollowUpInstructionForRun(selectedRunId);
});

document.querySelector("#btnApprove")?.addEventListener("click", async () => {
  await runAction("btnApprove", "Marking run approved in manifest (local only)…", async () => {
    await postRun("/approve-implement", { execute: false });
  });
});

document.querySelector("#btnImplement")?.addEventListener("click", async () => {
  const w =
    "This marks the run approved and starts Cursor’s implement agent. It may create a branch or open a pull request on your repo. Continue?";
  if (!window.confirm(w)) {
    return;
  }
  await runAction("btnImplement", "Starting implement agent (may open a PR)…", async () => {
    await postRun("/approve-implement", { execute: true });
  });
});

document.querySelector("#btnFocusedLoopRun")?.addEventListener("click", async () => {
  const w =
    "This may start the implement agent and open a pull request. Continue?";
  if (!window.confirm(w)) return;
  const slotEl = document.getElementById("focusedLoopSlot");
  const targetEl = document.getElementById("focusedLoopTarget");
  const attemptsEl = document.getElementById("focusedLoopAttempts");
  const instrEl = document.getElementById("focusedLoopInstruction");
  const slot = slotEl?.value ?? "errand";
  const targetScore = Number(targetEl?.value ?? 90);
  const maxAttempts = Number(attemptsEl?.value ?? 2);
  /** @type {Record<string, unknown>} */
  const body = {
    slot,
    targetScore,
    maxAttempts,
    allowImplement: true,
  };
  const note = instrEl?.value?.trim() ?? "";
  if (note) body.followUpInstruction = note;
  await runAction("btnFocusedLoopRun", "Starting focused QA loop…", async () => {
    await postRun("/focused-loop/start", body);
  });
});

document
  .querySelector("#btnFocusedLoopCancel")
  ?.addEventListener("click", async () => {
    await runAction("btnFocusedLoopCancel", "Requesting focused loop cancel…", async () => {
      await postRun("/focused-loop/cancel", {});
    });
  });

if (agentCommandPrompt) {
  agentCommandPrompt.addEventListener("input", onPromptOrAgentInput);
  agentCommandPrompt.addEventListener("change", onPromptOrAgentInput);
}
if (agentCommandRole) {
  agentCommandRole.addEventListener("change", onPromptOrAgentInput);
}
if (agentId) {
  agentId.addEventListener("input", onPromptOrAgentInput);
  agentId.addEventListener("change", onPromptOrAgentInput);
}
if (agentPick) {
  agentPick.addEventListener("change", onPromptOrAgentInput);
}
if (agentRetryPrompt) {
  agentRetryPrompt.addEventListener("input", () => {
    if (selectedRunId) saveRetryPromptSession(selectedRunId, agentRetryPrompt.value);
    onPromptOrAgentInput();
  });
  agentRetryPrompt.addEventListener("change", () => {
    if (selectedRunId) saveRetryPromptSession(selectedRunId, agentRetryPrompt.value);
    onPromptOrAgentInput();
  });
}
if (assessmentInstruction) {
  assessmentInstruction.addEventListener("input", () => {
    if (selectedRunId) saveAssessInstruction(selectedRunId, assessmentInstruction.value);
  });
  assessmentInstruction.addEventListener("change", () => {
    if (selectedRunId) saveAssessInstruction(selectedRunId, assessmentInstruction.value);
  });
}
if (assessmentModel) {
  assessmentModel.addEventListener("change", () => {
    syncAssessmentModelCustomVisibility();
    const model = selectedAssessmentModel();
    if (selectedRunId && model) saveAssessmentModel(selectedRunId, model);
  });
}
if (assessmentModelCustom) {
  assessmentModelCustom.addEventListener("input", () => {
    const model = selectedAssessmentModel();
    if (selectedRunId && model) saveAssessmentModel(selectedRunId, model);
  });
  assessmentModelCustom.addEventListener("change", () => {
    const model = selectedAssessmentModel();
    if (selectedRunId && model) saveAssessmentModel(selectedRunId, model);
  });
}

void refreshRuns().then(() => log("Load runs OK")).catch((e) => log(String(e)));
