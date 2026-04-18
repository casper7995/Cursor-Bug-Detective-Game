export interface ShareCardInput {
  score: number;
  anomalyName: string;
  elapsedMs: number;
  cluesUsed: number;
  dateUtc: string;
  rank: number | null;
}

const CARD_W = 1200;
const CARD_H = 630;

const JAM_URL = "https://vibej.am/2026/";

/**
 * Render a 1200x630 social-card canvas summarising the result. Uses purely
 * canvas drawing so we don't ship any image assets — matches the
 * "no-shipped-images" constraint of the project.
 */
export function renderShareCard(input: ShareCardInput): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = CARD_W;
  c.height = CARD_H;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable for share card");

  // Background with vignette
  const bg = ctx.createRadialGradient(
    CARD_W / 2, CARD_H / 2, 100,
    CARD_W / 2, CARD_H / 2, CARD_W * 0.7,
  );
  bg.addColorStop(0, "#1f2330");
  bg.addColorStop(1, "#0a0c14");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Cursor-cube logo (top-left)
  drawCursorCubeIcon(ctx, 60, 60, 80);

  // App title
  ctx.fillStyle = "#e8efff";
  ctx.font = "700 36px ui-sans-serif, system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText("bug detective", 170, 100);
  ctx.fillStyle = "#8696b6";
  ctx.font = "500 18px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(`daily case · ${input.dateUtc}`, 170, 130);

  // Big score number
  ctx.fillStyle = "#fff48a";
  ctx.font = "800 220px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(String(input.score), CARD_W / 2, CARD_H / 2 + 20);

  // Anomaly name — phrased differently depending on outcome
  ctx.fillStyle = "#a9c4ff";
  ctx.font = "600 30px ui-sans-serif, system-ui, sans-serif";
  const verdict =
    input.score > 0
      ? `cracked it: ${input.anomalyName}`
      : `the bug: ${input.anomalyName}`;
  ctx.fillText(verdict, CARD_W / 2, CARD_H / 2 + 110);

  // Stat strip: time + clues + rank
  const stats: Array<[string, string]> = [
    ["time", formatTime(input.elapsedMs)],
    ["clues", String(input.cluesUsed)],
  ];
  if (input.rank != null) stats.push(["rank", `#${input.rank}`]);

  ctx.textAlign = "center";
  const stripY = CARD_H - 110;
  const slotW = CARD_W / (stats.length + 1);
  for (let i = 0; i < stats.length; i++) {
    const stat = stats[i];
    if (!stat) continue;
    const [label, value] = stat;
    const x = slotW * (i + 1);
    ctx.fillStyle = "#8696b6";
    ctx.font = "500 16px ui-monospace, monospace";
    ctx.fillText(label, x, stripY);
    ctx.fillStyle = "#e8efff";
    ctx.font = "700 36px ui-monospace, monospace";
    ctx.fillText(value, x, stripY + 38);
  }

  // Footer URL
  ctx.fillStyle = "#5a6580";
  ctx.font = "500 18px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("vibej.am/2026 · find tomorrow's bug", CARD_W / 2, CARD_H - 28);

  return c;
}

export function shareCardBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b)));
}

/** Build the X/Twitter intent URL with score + jam URL prefilled. */
export function tweetIntent(score: number, dateUtc: string): string {
  const text =
    score > 0
      ? `🔎 I cracked today's Bug Detective case (${dateUtc}) — ${score} pts. Find the bug:`
      : `🐛 Got fooled by today's Bug Detective case (${dateUtc}). Can you spot it?`;
  const params = new URLSearchParams({
    text,
    url: JAM_URL,
    hashtags: "VibeJam2026,BugDetective",
  });
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

function formatTime(ms: number): string {
  const sec = Math.max(0, ms / 1000);
  const m = Math.floor(sec / 60);
  const s = (sec - m * 60).toFixed(1).padStart(4, "0");
  return `${m}:${s}`;
}

/**
 * Mini Cursor-style cube icon. Used in the share card top-left.
 */
function drawCursorCubeIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  // Three-face iso cube: top + front-left + front-right.
  const top = "#3a4356";
  const left = "#252a36";
  const right = "#1a1f2c";
  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = size / 2;
  // Top face
  ctx.fillStyle = top;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r * 0.9, cy - r * 0.45);
  ctx.lineTo(cx, cy + r * 0.05);
  ctx.lineTo(cx - r * 0.9, cy - r * 0.45);
  ctx.closePath();
  ctx.fill();
  // Front-left face
  ctx.fillStyle = left;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.9, cy - r * 0.45);
  ctx.lineTo(cx, cy + r * 0.05);
  ctx.lineTo(cx, cy + r * 0.95);
  ctx.lineTo(cx - r * 0.9, cy + r * 0.45);
  ctx.closePath();
  ctx.fill();
  // Front-right face
  ctx.fillStyle = right;
  ctx.beginPath();
  ctx.moveTo(cx + r * 0.9, cy - r * 0.45);
  ctx.lineTo(cx, cy + r * 0.05);
  ctx.lineTo(cx, cy + r * 0.95);
  ctx.lineTo(cx + r * 0.9, cy + r * 0.45);
  ctx.closePath();
  ctx.fill();
  // Cursor arrow on top
  ctx.fillStyle = "rgba(232,239,255,0.85)";
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.4, cy - r * 0.45);
  ctx.lineTo(cx + r * 0.05, cy - r * 0.25);
  ctx.lineTo(cx - r * 0.1, cy - r * 0.15);
  ctx.lineTo(cx - r * 0.1, cy + r * 0.05);
  ctx.lineTo(cx - r * 0.18, cy + r * 0.05);
  ctx.closePath();
  ctx.fill();
}
