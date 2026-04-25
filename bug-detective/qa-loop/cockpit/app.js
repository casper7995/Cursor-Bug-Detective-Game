const logEl = document.querySelector("#log");
const rawEl = document.querySelector("#raw");
const runList = document.querySelector("#runList");
const currentRun = document.querySelector("#currentRun");
const runTitle = document.querySelector("#runTitle");
const runMeta = document.querySelector("#runMeta");
const videos = document.querySelector("#videos");
const agentId = document.querySelector("#agentId");

let selectedRunId = null;

function log(line) {
  const t = new Date().toISOString().slice(11, 19);
  logEl.textContent = `[${t}] ${line}\n` + logEl.textContent;
}

async function jfetch(url, options = {}) {
  const r = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
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

async function refreshRuns() {
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

function slotVideos(m) {
  videos.innerHTML = "";
  const slots = ["runner", "sentence", "errand", "tamper"];
  for (const s of slots) {
    const p = m.videos?.[s];
    const box = document.createElement("div");
    box.className = "video-slot";
    const h3 = document.createElement("h3");
    h3.textContent = s;
    box.appendChild(h3);
    if (p) {
      const rel = `artifacts/qa-runs/${m.runId}/videos/${s}.webm`;
      const url = `/local/${rel}`;
      const v = document.createElement("video");
      v.src = url;
      v.controls = true;
      v.width = 320;
      box.appendChild(v);
      const c = document.createElement("p");
      c.className = "hint";
      c.textContent = p;
      box.appendChild(c);
    } else {
      const p2 = document.createElement("p");
      p2.className = "hint";
      p2.textContent = "No file yet — record or download artifacts.";
      box.appendChild(p2);
    }
    videos.appendChild(box);
  }
}

async function openRun(runId) {
  selectedRunId = runId;
  const data = await jfetch(`/api/runs/${encodeURIComponent(runId)}`);
  const m = data.manifest;
  currentRun.hidden = false;
  runTitle.textContent = m.runId;
  runMeta.textContent = JSON.stringify(
    { state: m.state, cloud: m.cloud, cockpit: m.cockpit },
    null,
    2,
  );
  if (m.cloud?.recordAgentId) agentId.value = m.cloud.recordAgentId;
  slotVideos(m);
  rawEl.textContent = JSON.stringify(data, null, 2);
  await refreshRuns();
}

async function postRun(path, body) {
  const id = selectedRunId;
  if (!id) throw new Error("Select a run first");
  const url = `/api/runs/${encodeURIComponent(id)}${path}`;
  const res = await jfetch(url, { method: "POST", body: JSON.stringify(body ?? {}) });
  rawEl.textContent = JSON.stringify(res, null, 2);
  await openRun(id);
  return res;
}

document.querySelector("#newRun").addEventListener("click", async () => {
  const data = await jfetch("/api/runs", {
    method: "POST",
    body: JSON.stringify({}),
  });
  log(`Created run ${data.manifest.runId}`);
  await openRun(data.manifest.runId);
});

document.querySelector("#btnCloudRecord").addEventListener("click", async () => {
  try {
    log("Starting cloud record…");
    await postRun("/cloud-record", {});
  } catch (e) {
    log(String(e));
  }
});

document.querySelector("#btnListArtifacts").addEventListener("click", async () => {
  try {
    const id = agentId.value.trim();
    if (!id) {
      log("Set Agent ID (bc-…) for list");
      return;
    }
    log("Listing artifacts…");
    await postRun("/artifacts/list", { agentId: id });
  } catch (e) {
    log(String(e));
  }
});

document.querySelector("#btnDownloadArtifacts").addEventListener("click", async () => {
  try {
    const id = agentId.value.trim();
    if (!id) {
      log("Set Agent ID (bc-…)");
      return;
    }
    log("Downloading artifacts…");
    await postRun("/artifacts/download", { agentId: id });
  } catch (e) {
    log(String(e));
  }
});

document.querySelector("#btnPlan").addEventListener("click", async () => {
  try {
    log("Plan agent (this may take several minutes)…");
    await postRun("/plan", {});
  } catch (e) {
    log(String(e));
  }
});

document.querySelector("#btnAnalyze").addEventListener("click", async () => {
  try {
    log("Running Gemini analysis…");
    await postRun("/analyze", {});
  } catch (e) {
    log(String(e));
  }
});

document.querySelector("#btnShare").addEventListener("click", async () => {
  try {
    await postRun("/share", {});
  } catch (e) {
    log(String(e));
  }
});

document.querySelector("#btnSend").addEventListener("click", async () => {
  try {
    log("Sending findings to plan agent…");
    await postRun("/send-findings", {});
  } catch (e) {
    log(String(e));
  }
});

document.querySelector("#btnApprove").addEventListener("click", async () => {
  try {
    await postRun("/approve-implement", { execute: false });
  } catch (e) {
    log(String(e));
  }
});

document.querySelector("#btnImplement").addEventListener("click", async () => {
  try {
    log("Starting implement agent…");
    await postRun("/approve-implement", { execute: true });
  } catch (e) {
    log(String(e));
  }
});

void refreshRuns().then(() => log("Load runs OK")).catch((e) => log(String(e)));
