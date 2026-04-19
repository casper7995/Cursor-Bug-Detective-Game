// Standalone physics + course probe (no app imports).
// Mirrors constants in bug-detective/src/minigames/runner/sim.ts.

const PLAYER_W = 44;
const PLAYER_H = 52;
const GRAVITY = 3200;
const JUMP_V0 = -800;
const SPEED_BASE = 220;
const SPEED_BOOST_MAX = 520;
/** At boost01=0.5 */
const SPEED_AT_HALF_BOOST = SPEED_BASE + (SPEED_BOOST_MAX - SPEED_BASE) * 0.5;
const MIN_GAP = 32;

const MAX_JUMP_UP = (JUMP_V0 * JUMP_V0) / (2 * GRAVITY);
const AIR_TIME = (-2 * JUMP_V0) / GRAVITY;
const horizRange = (s) => s * AIR_TIME;
const maxGapForSpeed = (s) => Math.min(100, horizRange(s) - 36);

function isDeathGapAfterPlankId(sid) {
  return sid % 7 === 0 && sid > 3;
}

function deathGapPx(rng) {
  const maxDeath = horizRange(SPEED_BOOST_MAX) - 16;
  const raw = Math.round(horizRange(SPEED_BASE) + 24 + rng() * 40);
  return Math.min(raw, maxDeath);
}

// Mulberry32 (matches makeSeededRng).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const deriveRunnerSeed = (s) => (s ^ 0x9e3779b9) >>> 0;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// Mirror generateInitialPlanks (snippet width ~208px avg).
function genPlanks(rng, mode, genCursor, goalDistance, startId) {
  const planks = [];
  let x = genCursor;
  let id = startId;
  const targetEnd =
    mode === "daily"
      ? goalDistance + 400 + Math.floor(rng() * 400)
      : genCursor + 9000;

  const maxGap = maxGapForSpeed(SPEED_BASE);
  let prevYTop = clamp(280 - genCursor * 0.07 + (rng() - 0.5) * 36, 196, 270);

  while (x < targetEnd) {
    const sid = id++;
    const textW = 208;
    const w = Math.max(88 + Math.floor(rng() * 110), textW + 16);
    const baseGap =
      MIN_GAP + Math.floor(rng() * Math.max(1, maxGap - MIN_GAP + 1));
    const gap = isDeathGapAfterPlankId(sid) ? deathGapPx(rng) : baseGap;
    const midX = x + w * 0.5;
    const climbBaseY = 280 - midX * 0.07;
    const jitter = (rng() - 0.5) * 42;
    const upBias = rng() * rng() * 18;
    let yTop = climbBaseY + jitter - upBias;
    const minNext = prevYTop - (MAX_JUMP_UP - 8);
    const maxNext = prevYTop + 40;
    yTop = clamp(yTop, minNext, maxNext);
    yTop = Math.max(80, yTop);
    planks.push({ id: sid, x0: x, x1: x + w, yTop });
    prevYTop = yTop;
    x += w + gap;
  }
  return planks;
}

function windowAtHeight(dy) {
  const a = 1600, b = -720, c = dy;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t1 = (-b - Math.sqrt(disc)) / (2 * a);
  const t2 = (-b + Math.sqrt(disc)) / (2 * a);
  return [t1, t2];
}

console.log("=== PHYSICS ===");
console.log("Jump apex (px):       ", MAX_JUMP_UP.toFixed(1));
console.log("Air time (s):         ", AIR_TIME.toFixed(3));
console.log("H range @ base", SPEED_BASE + ":", horizRange(SPEED_BASE).toFixed(1));
console.log("H range @ boost max", SPEED_BOOST_MAX + ":", horizRange(SPEED_BOOST_MAX).toFixed(1));
console.log("Reachability max gap: ", maxGapForSpeed(SPEED_BASE).toFixed(1));
console.log("Reachability max Δy:  ", (MAX_JUMP_UP - 8).toFixed(1));

console.log("\n=== LANDING WINDOW @ Δy upward (sec) and scroll covered ===");
console.log("Δy   window(s)  base scroll(px)  boost scroll(px)");
for (const dy of [0, 20, 35, 50, 65, 73, 81]) {
  const w = windowAtHeight(dy);
  if (!w) {
    console.log(String(dy).padStart(3), "  UNREACHABLE");
    continue;
  }
  const dur = (w[1] - w[0]).toFixed(3);
  const baseS = ((w[1] - w[0]) * SPEED_BASE).toFixed(1);
  const boostS = ((w[1] - w[0]) * SPEED_BOOST_MAX).toFixed(1);
  console.log(
    String(dy).padStart(3),
    " ",
    dur.padStart(7),
    "    ",
    baseS.padStart(6),
    "         ",
    boostS.padStart(6),
  );
}

console.log("\nFor 'edge of player overlaps next plank' the scroll change");
console.log("only needs to exceed (gap - PLAYER_W) =", `gap - ${PLAYER_W}`);
console.log("For 'player center over next plank' it needs to exceed gap.\n");

console.log("=== STRESS: worst-case combos ===");
for (const dy of [73, 60, 50, 35]) {
  const w = windowAtHeight(dy);
  if (!w) continue;
  const dur = w[1] - w[0];
  const baseScrollOK = dur * SPEED_BASE;
  console.log(
    `Δy=${dy.toString().padStart(2)}  base scroll in window=${baseScrollOK.toFixed(1)}px  ` +
      `→ max gap landable (edge-overlap, base): ${(baseScrollOK + PLAYER_W).toFixed(1)}px  ` +
      `(boost: ${(dur * SPEED_BOOST_MAX + PLAYER_W).toFixed(1)}px)`,
  );
}

console.log("\n=== GENERATED COURSE (mode=daily, seed=42) ===");
const rng = mulberry32(deriveRunnerSeed(42));
const planks = genPlanks(rng, "daily", 40, 2600, 0);
console.log("planks:", planks.length);
let prev = planks[0];
let countMaxClimb = 0;
let maxObservedDy = 0;
let maxObservedGap = 0;
let deathGapCount = 0;
for (let i = 0; i < planks.length; i++) {
  const p = planks[i];
  const gap = i === 0 ? 0 : p.x0 - prev.x1;
  const dy = i === 0 ? 0 : prev.yTop - p.yTop;
  if (i > 0 && isDeathGapAfterPlankId(prev.id)) deathGapCount++;
  if (dy > maxObservedDy) maxObservedDy = dy;
  if (gap > maxObservedGap) maxObservedGap = gap;
  if (dy >= MAX_JUMP_UP - 9) countMaxClimb++;
  if (i < 30) {
    const tag =
      i > 0 && isDeathGapAfterPlankId(prev.id) ? " DEATH-GAP" : "";
    console.log(
      `p${i.toString().padStart(2)}  x=${p.x0.toFixed(0).padStart(5)}..${p.x1.toFixed(0).padStart(5)}  ` +
        `w=${(p.x1 - p.x0).toFixed(0).padStart(3)}  yTop=${p.yTop.toFixed(0).padStart(3)}  ` +
        `Δy(up)=${dy.toFixed(0).padStart(3)}  gap=${gap.toFixed(0).padStart(3)}${tag}`,
    );
  }
  prev = p;
}
console.log(
  `\nmax observed Δy=${maxObservedDy.toFixed(1)}  max gap=${maxObservedGap.toFixed(1)}  ` +
    `death-gap transitions=${deathGapCount}  near-max-climb planks=${countMaxClimb}/${planks.length}`,
);

console.log("\n=== BOOST ECONOMY (mirror sim.ts) ===");
console.log(
  "Starting boost01 = 0.75 → speed =",
  SPEED_BASE + (SPEED_BOOST_MAX - SPEED_BASE) * 0.75,
  "px/s if Right held from frame 1.",
);
console.log("BOOST_CHARGE_PER_LANDING = 0.35");
console.log("BOOST_DRAIN_PER_SEC = 0.22 → full meter drains in", (1 / 0.22).toFixed(2), "s of holding Right.");

console.log("\n=== TIGHTEST JUMP (per generated course) ===");
function takeoffWindowMs(prev, curr, speed) {
  const dy = prev.yTop - curr.yTop;
  if (dy >= 81) return 0;
  const a = 1600, b = -720, c = dy;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return 0;
  const t1 = (-b - Math.sqrt(disc)) / (2 * a);
  const t2 = (-b + Math.sqrt(disc)) / (2 * a);
  const PSX = 96, PW = 44;
  const tkMaxOnPrev = prev.x1 - PSX;
  const tkMinOnPrev = prev.x0 - PSX;
  const lower = curr.x0 - PSX - PW - speed * t2;
  const upper = curr.x1 - PSX - speed * t1;
  const lo = Math.max(lower, tkMinOnPrev);
  const hi = Math.min(upper, tkMaxOnPrev);
  if (hi <= lo) return 0;
  return ((hi - lo) / speed) * 1000;
}

let worstBaseMs = Infinity, worstHalfMs = Infinity, worstIdx = -1;
for (let i = 1; i < planks.length; i++) {
  const baseMs = takeoffWindowMs(planks[i - 1], planks[i], SPEED_BASE);
  const halfMs = takeoffWindowMs(planks[i - 1], planks[i], SPEED_AT_HALF_BOOST);
  if (baseMs < worstBaseMs) {
    worstBaseMs = baseMs;
    worstIdx = i;
  }
  if (halfMs < worstHalfMs) worstHalfMs = halfMs;
}
console.log(
  "worst takeoff window @ base",
  SPEED_BASE + ":",
  worstBaseMs.toFixed(0),
  "ms (jump p" + (worstIdx - 1) + "→p" + worstIdx + ")",
);
console.log(
  "worst takeoff window @ boost 0.5 (" + SPEED_AT_HALF_BOOST + " px/s):",
  worstHalfMs.toFixed(0),
  "ms",
);
console.log(
  "worst takeoff window @ boost full (" + SPEED_BOOST_MAX + " px/s):",
  (() => {
    let w = Infinity;
    for (let i = 1; i < planks.length; i++) {
      const v = takeoffWindowMs(planks[i - 1], planks[i], SPEED_BOOST_MAX);
      if (v < w) w = v;
    }
    return w.toFixed(0);
  })(),
  "ms",
);
