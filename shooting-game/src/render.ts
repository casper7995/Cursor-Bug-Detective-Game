import type { World } from "./types";

export function clear(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  color = "#0a0a12",
): void {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
}

export function circle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  fill: string,
): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Visible aim point while the OS cursor is hidden (`cursor: none` on body). */
export function drawAimReticle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
): void {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 1;
  const r = 10;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - r - 4, y);
  ctx.lineTo(x - 3, y);
  ctx.moveTo(x + 3, y);
  ctx.lineTo(x + r + 4, y);
  ctx.moveTo(x, y - r - 4);
  ctx.lineTo(x, y - 3);
  ctx.moveTo(x, y + 3);
  ctx.lineTo(x, y + r + 4);
  ctx.stroke();
  ctx.restore();
}

export function text(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  opts?: { color?: string; size?: number; align?: CanvasTextAlign },
): void {
  ctx.fillStyle = opts?.color ?? "#ddd";
  ctx.font = `${opts?.size ?? 14}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = opts?.align ?? "left";
  ctx.fillText(s, x, y);
}

export function spawnHitParticles(
  world: World,
  x: number,
  y: number,
  color: string,
  count = 8,
): void {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 80 + Math.random() * 120;
    world.add({
      id: 0,
      kind: "particle",
      pos: { x, y },
      vel: { x: Math.cos(a) * s, y: Math.sin(a) * s },
      radius: 2,
      hp: 1,
      team: "good",
      data: { life: 0.4 },
      update(dt) {
        const life = this.data.life as number;
        if (life <= 0) {
          this.dead = true;
          return;
        }
        this.data.life = life - dt;
        this.pos.x += this.vel.x * dt;
        this.pos.y += this.vel.y * dt;
        this.vel.x *= 0.92;
        this.vel.y *= 0.92;
      },
      draw(ctx) {
        const life = this.data.life as number;
        ctx.globalAlpha = Math.max(0, life / 0.4);
        ctx.fillStyle = color;
        ctx.fillRect(this.pos.x - 1, this.pos.y - 1, 2, 2);
        ctx.globalAlpha = 1;
      },
    });
  }
}
