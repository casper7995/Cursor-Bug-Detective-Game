import "./style.css";

const canvas = document.getElementById("game") as HTMLCanvasElement | null;
if (!canvas) throw new Error("game canvas missing");
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2d context unavailable");

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas!.width = Math.floor(window.innerWidth * dpr);
  canvas!.height = Math.floor(window.innerHeight * dpr);
  canvas!.style.width = `${window.innerWidth}px`;
  canvas!.style.height = `${window.innerHeight}px`;
  ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
}

resize();
window.addEventListener("resize", resize);

let last = performance.now();
const player = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

window.addEventListener("pointermove", (e) => {
  player.x = e.clientX;
  player.y = e.clientY;
});

function drawArrowCursor(x: number, y: number): void {
  ctx!.save();
  ctx!.translate(x, y);
  ctx!.fillStyle = "#fff";
  ctx!.strokeStyle = "#000";
  ctx!.lineWidth = 2;
  ctx!.beginPath();
  ctx!.moveTo(0, 0);
  ctx!.lineTo(0, 22);
  ctx!.lineTo(6, 17);
  ctx!.lineTo(10, 25);
  ctx!.lineTo(13, 23);
  ctx!.lineTo(9, 15);
  ctx!.lineTo(16, 15);
  ctx!.closePath();
  ctx!.fill();
  ctx!.stroke();
  ctx!.restore();
}

function frame(now: number): void {
  const dt = (now - last) / 1000;
  last = now;

  ctx!.fillStyle = "#0a0a12";
  ctx!.fillRect(0, 0, window.innerWidth, window.innerHeight);

  ctx!.fillStyle = "#9aa";
  ctx!.font = "14px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx!.fillText("Cursor Crew — scaffold", 16, 24);
  ctx!.fillText(`dt: ${(dt * 1000).toFixed(1)}ms`, 16, 42);

  drawArrowCursor(player.x, player.y);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
