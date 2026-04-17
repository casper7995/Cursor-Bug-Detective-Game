import type { CharacterKind, Entity } from "./types";
import { makePlayer } from "./characters";

export function makeBot(kind: CharacterKind, x: number, y: number): Entity {
  const e = makePlayer(kind, x, y);
  e.kind = "bot";
  const baseDraw = e.draw.bind(e);
  e.update = function (dt, world) {
    const enemies = world.entities.filter((x) => x.team === "bad" && !x.dead);
    if (enemies.length === 0) return;
    let nearest = enemies[0]!;
    let bestD = Infinity;
    for (const ee of enemies) {
      const dx = ee.pos.x - this.pos.x;
      const dy = ee.pos.y - this.pos.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        nearest = ee;
      }
    }
    const dx = nearest.pos.x - this.pos.x;
    const dy = nearest.pos.y - this.pos.y;
    const len = Math.hypot(dx, dy) || 1;
    const speed = 200;
    if (Math.sqrt(bestD) > 200) {
      this.pos.x += (dx / len) * speed * dt;
      this.pos.y += (dy / len) * speed * dt;
    }
    const cd = (this.data.fireCooldown as number) - dt;
    this.data.fireCooldown = Math.max(0, cd);
    if (cd <= 0) {
      world.add({
        id: 0,
        kind: "projectile",
        pos: { x: this.pos.x, y: this.pos.y },
        vel: { x: (dx / len) * 480, y: (dy / len) * 480 },
        radius: 4,
        hp: 1,
        team: "good",
        data: {
          ownerId: this.id,
          damage: 1,
          startX: this.pos.x,
          startY: this.pos.y,
        },
        update(dt2, w) {
          this.pos.x += this.vel.x * dt2;
          this.pos.y += this.vel.y * dt2;
          if (
            this.pos.x < 0 ||
            this.pos.y < 0 ||
            this.pos.x > w.width ||
            this.pos.y > w.height
          ) {
            this.dead = true;
            return;
          }
          for (const en of w.entities) {
            if (en.team !== "bad" || en.dead) continue;
            if (en.kind !== "enemy" && en.kind !== "boss") continue;
            const dxe = en.pos.x - this.pos.x;
            const dye = en.pos.y - this.pos.y;
            if (dxe * dxe + dye * dye <= (en.radius + this.radius) ** 2) {
              en.hp -= 1;
              if (en.kind === "boss") {
                en.data.lastDamagerId = this.data.ownerId;
              } else if (en.hp <= 0) {
                en.dead = true;
              }
              this.dead = true;
              return;
            }
          }
        },
        draw(ctx) {
          ctx.fillStyle = "#88f";
          ctx.fillRect(this.pos.x - 2, this.pos.y - 2, 4, 4);
        },
      });
      this.data.fireCooldown = 0.4;
    }
  };
  e.draw = baseDraw;
  return e;
}
