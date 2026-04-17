import type { CharacterKind, Entity, World } from "./types";
import { Input } from "./input";
import { SFX } from "./audio";

const SPEED: Record<CharacterKind, number> = {
  arrow: 240,
  ibeam: 336,
  hand: 240,
  spinner: 168,
  crosshair: 144,
};

function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const nx = x1 + t * dx;
  const ny = y1 + t * dy;
  return Math.hypot(px - nx, py - ny);
}

function pushOutOfCookies(self: Entity, world: World): void {
  for (const e of world.entities) {
    if (e.dead || e.team !== "bad") continue;
    if (e.data.enemyKind !== "cookie") continue;
    const dx = self.pos.x - e.pos.x;
    const dy = self.pos.y - e.pos.y;
    const d = Math.hypot(dx, dy) || 1;
    const min = self.radius + e.radius;
    if (d < min) {
      self.pos.x += (dx / d) * (min - d);
      self.pos.y += (dy / d) * (min - d);
    }
  }
}

function resolveProjectileHit(
  proj: Entity,
  target: Entity,
  w: World,
  distFromStart: number,
): void {
  target.hp -= proj.data.damage as number;
  if (target.kind === "boss") {
    proj.dead = true;
    return;
  }
  if (target.hp <= 0) {
    target.dead = true;
    const owner = w.entities.find((x) => x.id === proj.data.ownerId);
    if (owner && (owner.kind === "player" || owner.kind === "bot")) {
      w.events.push({
        type: "kill",
        killer: owner,
        victim: target,
        distance: distFromStart,
      });
    }
  }
  proj.dead = true;
}

function projectileUpdate(proj: Entity, dt: number, w: World): void {
  proj.pos.x += proj.vel.x * dt;
  proj.pos.y += proj.vel.y * dt;
  if (
    proj.pos.x < 0 ||
    proj.pos.y < 0 ||
    proj.pos.x > w.width ||
    proj.pos.y > w.height
  ) {
    proj.dead = true;
    return;
  }
  const startX = proj.data.startX as number;
  const startY = proj.data.startY as number;
  for (const e of w.entities) {
    if (e.team === "good" || e.kind === "projectile" || e.dead) continue;
    if (e.kind !== "enemy" && e.kind !== "boss") continue;
    const dx = e.pos.x - proj.pos.x;
    const dy = e.pos.y - proj.pos.y;
    if (dx * dx + dy * dy <= (e.radius + proj.radius) ** 2) {
      const dist = Math.hypot(proj.pos.x - startX, proj.pos.y - startY);
      resolveProjectileHit(proj, e, w, dist);
      break;
    }
  }
}

export function fireProjectile(
  owner: Entity,
  world: World,
  tx: number,
  ty: number,
  speed: number,
  damage: number,
): void {
  const dx = tx - owner.pos.x;
  const dy = ty - owner.pos.y;
  const len = Math.hypot(dx, dy) || 1;
  const startX = owner.pos.x;
  const startY = owner.pos.y;
  world.add({
    id: 0,
    kind: "projectile",
    pos: { x: owner.pos.x, y: owner.pos.y },
    vel: { x: (dx / len) * speed, y: (dy / len) * speed },
    radius: 4,
    hp: 1,
    team: owner.team,
    data: { ownerId: owner.id, damage, startX, startY },
    update(dt, w) {
      projectileUpdate(this, dt, w);
    },
    draw(ctx) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(this.pos.x - 2, this.pos.y - 2, 4, 4);
    },
  });
}

function spawnMeleeSwipe(owner: Entity, world: World, angle: number): void {
  world.add({
    id: 0,
    kind: "projectile",
    pos: { x: owner.pos.x, y: owner.pos.y },
    vel: { x: 0, y: 0 },
    radius: 40,
    hp: 1,
    team: "good",
    data: {
      ownerId: owner.id,
      damage: 1,
      life: 0.1,
      meleeAngle: angle,
      hit: new Set<number>(),
    },
    update(dt, w) {
      const life = (this.data.life as number) - dt;
      this.data.life = life;
      if (life <= 0) {
        this.dead = true;
        return;
      }
      const ang = this.data.meleeAngle as number;
      const ownerEnt = w.entities.find(
        (x) => x.id === (this.data.ownerId as number),
      );
      const ox = ownerEnt?.pos.x ?? this.pos.x;
      const oy = ownerEnt?.pos.y ?? this.pos.y;
      const hit = this.data.hit as Set<number>;
      for (const e of w.entities) {
        if (e.team !== "bad" || e.dead) continue;
        if (e.kind !== "enemy" && e.kind !== "boss") continue;
        if (hit.has(e.id)) continue;
        const dx = e.pos.x - ox;
        const dy = e.pos.y - oy;
        const d = Math.hypot(dx, dy);
        if (d > 40 + e.radius) continue;
        if (e.kind === "enemy") {
          const a = Math.atan2(dy, dx);
          let da = a - ang;
          while (da > Math.PI) da -= Math.PI * 2;
          while (da < -Math.PI) da += Math.PI * 2;
          if (Math.abs(da) > Math.PI / 4) continue;
        }
        e.hp -= 1;
        hit.add(e.id);
        if (e.kind === "boss") {
          /* boss death handled in boss.update */
        } else if (e.hp <= 0) {
          e.dead = true;
          if (ownerEnt && ownerEnt.kind === "player") {
            w.events.push({
              type: "kill",
              killer: ownerEnt,
              victim: e,
              distance: 0,
            });
          }
        }
      }
    },
    draw() {
      /* invisible */
    },
  });
}

function crosshairHitscan(
  owner: Entity,
  world: World,
  tx: number,
  ty: number,
): void {
  const x1 = owner.pos.x;
  const y1 = owner.pos.y;
  const x2 = tx;
  const y2 = ty;
  for (const e of world.entities) {
    if (e.team !== "bad" || e.dead) continue;
    if (e.kind !== "enemy" && e.kind !== "boss") continue;
    const d = distToSegment(e.pos.x, e.pos.y, x1, y1, x2, y2);
    if (d <= e.radius) {
      e.hp -= 3;
      const dist = Math.hypot(e.pos.x - x1, e.pos.y - y1);
      if (e.kind !== "boss" && e.hp <= 0) {
        e.dead = true;
        world.events.push({
          type: "kill",
          killer: owner,
          victim: e,
          distance: dist,
        });
      }
    }
  }
  world.add({
    id: 0,
    kind: "particle",
    pos: { x: x1, y: y1 },
    vel: { x: 0, y: 0 },
    radius: 1,
    hp: 1,
    team: "good",
    data: { life: 0.15, x2, y2 },
    update(dt) {
      const life = (this.data.life as number) - dt;
      this.data.life = life;
      if (life <= 0) this.dead = true;
    },
    draw(ctx) {
      const life = this.data.life as number;
      ctx.globalAlpha = Math.max(0, life / 0.15);
      ctx.strokeStyle = "#f472b6";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.pos.x, this.pos.y);
      ctx.lineTo(this.data.x2 as number, this.data.y2 as number);
      ctx.stroke();
      ctx.globalAlpha = 1;
    },
  });
  SFX.shoot();
}

export function makePlayer(kind: CharacterKind, x: number, y: number): Entity {
  const anim = { t: 0 };
  const e: Entity = {
    id: 0,
    kind: "player",
    pos: { x, y },
    vel: { x: 0, y: 0 },
    radius: 10,
    hp: 3,
    team: "good",
    data: {
      character: kind,
      fireCooldown: 0,
      iframes: 0,
      heldId: 0,
      spinTick: 0,
    },
    update(dt, world) {
      const vx =
        (Input.isDown("d") || Input.isDown("arrowright") ? 1 : 0) -
        (Input.isDown("a") || Input.isDown("arrowleft") ? 1 : 0);
      const vy =
        (Input.isDown("s") || Input.isDown("arrowdown") ? 1 : 0) -
        (Input.isDown("w") || Input.isDown("arrowup") ? 1 : 0);
      const len = Math.hypot(vx, vy) || 1;
      this.pos.x += (vx / len) * SPEED[kind] * dt;
      this.pos.y += (vy / len) * SPEED[kind] * dt;
      this.pos.x = Math.max(
        this.radius,
        Math.min(world.width - this.radius, this.pos.x),
      );
      this.pos.y = Math.max(
        this.radius,
        Math.min(world.height - this.radius, this.pos.y),
      );
      pushOutOfCookies(this, world);

      this.data.fireCooldown = Math.max(
        0,
        (this.data.fireCooldown as number) - dt,
      );
      this.data.iframes = Math.max(0, (this.data.iframes as number) - dt);
      this.data.spinTick = (this.data.spinTick as number) + dt;

      const character = kind;

      if (character === "hand") {
        if (Input.consumePress() && (this.data.fireCooldown as number) === 0) {
          const heldId = this.data.heldId as number;
          if (heldId === 0) {
            let best: Entity | null = null;
            let bestD = 80 * 80;
            for (const en of world.entities) {
              if (en.team !== "bad" || en.dead || en.kind !== "enemy") continue;
              const ddx = en.pos.x - this.pos.x;
              const ddy = en.pos.y - this.pos.y;
              const d2 = ddx * ddx + ddy * ddy;
              if (d2 < bestD) {
                bestD = d2;
                best = en;
              }
            }
            if (best) {
              this.data.heldId = best.id;
              best.data.grabbed = true;
            }
            this.data.fireCooldown = 0.2;
          } else {
            const g = world.entities.find((x) => x.id === heldId);
            if (g) {
              g.data.grabbed = false;
              const dx = Input.pointer.x - this.pos.x;
              const dy = Input.pointer.y - this.pos.y;
              const L = Math.hypot(dx, dy) || 1;
              g.vel.x = (dx / L) * 360;
              g.vel.y = (dy / L) * 360;
              g.data.thrownByHand = true;
            }
            this.data.heldId = 0;
            this.data.fireCooldown = 0.2;
          }
        }
      } else if (
        Input.pointer.down &&
        (this.data.fireCooldown as number) === 0
      ) {
        if (character === "arrow") {
          fireProjectile(this, world, Input.pointer.x, Input.pointer.y, 480, 1);
          this.data.fireCooldown = 0.25;
          SFX.shoot();
        } else if (character === "ibeam") {
          const ang = Math.atan2(
            Input.pointer.y - this.pos.y,
            Input.pointer.x - this.pos.x,
          );
          spawnMeleeSwipe(this, world, ang);
          this.data.fireCooldown = 0.3;
          SFX.shoot();
        } else if (character === "crosshair") {
          crosshairHitscan(this, world, Input.pointer.x, Input.pointer.y);
          this.data.fireCooldown = 0.8;
        }
      }

      if (character === "spinner" && Input.pointer.down) {
        if ((this.data.spinTick as number) >= 0.25) {
          this.data.spinTick = 0;
          const victims: Entity[] = [];
          for (const en of world.entities) {
            if (en.team !== "bad" || en.dead || en.kind !== "enemy") continue;
            const ddx = en.pos.x - this.pos.x;
            const ddy = en.pos.y - this.pos.y;
            if (ddx * ddx + ddy * ddy <= (60 + en.radius) ** 2)
              victims.push(en);
          }
          const spinHits = victims.length;
          for (const en of victims) {
            en.hp -= 1;
            if (en.hp <= 0) {
              en.dead = true;
              world.events.push({
                type: "kill",
                killer: this,
                victim: en,
                distance: 0,
                meta: { spinHits },
              });
            }
          }
          if (spinHits > 0) SFX.shoot();
        }
      }

      const hid = this.data.heldId as number;
      if (hid !== 0) {
        const g = world.entities.find((x) => x.id === hid);
        if (g && !g.dead) {
          g.pos.x = this.pos.x + 18;
          g.pos.y = this.pos.y;
          g.vel.x = 0;
          g.vel.y = 0;
        } else {
          this.data.heldId = 0;
        }
      }

      for (const g of world.entities) {
        if (!g.dead && g.kind === "enemy" && g.data.thrownByHand) {
          for (const o of world.entities) {
            if (o === g || o.dead || o.team !== "bad" || o.kind !== "enemy")
              continue;
            const ddx = o.pos.x - g.pos.x;
            const ddy = o.pos.y - g.pos.y;
            if (ddx * ddx + ddy * ddy <= (o.radius + g.radius) ** 2) {
              o.hp -= 1;
              if (o.hp <= 0) {
                o.dead = true;
                world.events.push({
                  type: "kill",
                  killer: this,
                  victim: o,
                  distance: Math.hypot(
                    g.pos.x - this.pos.x,
                    g.pos.y - this.pos.y,
                  ),
                  meta: { thrown: true },
                });
              }
              g.data.thrownByHand = false;
              g.dead = true;
              break;
            }
          }
        }
      }

      if ((this.data.iframes as number) === 0) {
        for (const p of world.entities) {
          if (p.kind === "projectile" && p.team === "bad" && !p.dead) {
            const dx = p.pos.x - this.pos.x;
            const dy = p.pos.y - this.pos.y;
            if (dx * dx + dy * dy <= (p.radius + this.radius) ** 2) {
              this.hp -= 1;
              this.data.iframes = 1.0;
              world.events.push({ type: "damage", victim: this, amount: 1 });
              p.dead = true;
              break;
            }
          }
        }
      }

      if ((this.data.iframes as number) === 0) {
        for (const en of world.entities) {
          if (
            en.team === "bad" &&
            !en.dead &&
            (en.kind === "enemy" || en.kind === "boss")
          ) {
            const dx = en.pos.x - this.pos.x;
            const dy = en.pos.y - this.pos.y;
            if (dx * dx + dy * dy <= (en.radius + this.radius) ** 2) {
              this.hp -= 1;
              this.data.iframes = 1.0;
              world.events.push({ type: "damage", victim: this, amount: 1 });
              if (en.kind === "enemy" && en.data.enemyKind === "notif") {
                en.dead = true;
              }
              break;
            }
          }
        }
      }
    },
    draw(ctx) {
      drawCharacter(ctx, kind, this.pos.x, this.pos.y, anim.t);
    },
  };
  const origUpdate = e.update.bind(e);
  e.update = (dt, world) => {
    anim.t = world.elapsed;
    origUpdate(dt, world);
  };
  return e;
}

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  kind: CharacterKind,
  x: number,
  y: number,
  t: number,
): void {
  switch (kind) {
    case "arrow":
      drawArrow(ctx, x, y);
      break;
    case "ibeam":
      drawIbeam(ctx, x, y);
      break;
    case "hand":
      drawHand(ctx, x, y);
      break;
    case "spinner":
      drawSpinner(ctx, x, y, t);
      break;
    case "crosshair":
      drawCrosshair(ctx, x, y);
      break;
  }
}

function drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 22);
  ctx.lineTo(6, 17);
  ctx.lineTo(10, 25);
  ctx.lineTo(13, 23);
  ctx.lineTo(9, 15);
  ctx.lineTo(16, 15);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawIbeam(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.fillRect(-14, -18, 28, 5);
  ctx.strokeRect(-14, -18, 28, 5);
  ctx.fillRect(-3, -13, 6, 26);
  ctx.strokeRect(-3, -13, 6, 26);
  ctx.fillRect(-14, 13, 28, 5);
  ctx.strokeRect(-14, 13, 28, 5);
  ctx.restore();
}

function drawHand(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.translate(x - 16, y - 16);
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.fillRect(8, 14, 20, 18);
  ctx.strokeRect(8, 14, 20, 18);
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(10 + i * 5, 4, 4, 12);
    ctx.strokeRect(10 + i * 5, 4, 4, 12);
  }
  ctx.fillRect(22, 20, 10, 6);
  ctx.strokeRect(22, 20, 10, 6);
  ctx.restore();
}

function drawSpinner(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t * 2);
  ctx.strokeStyle = "#a7f3d0";
  ctx.lineWidth = 4;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(0, 0, 14, i * ((2 * Math.PI) / 3), i * ((2 * Math.PI) / 3) + 1.2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCrosshair(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "#f472b6";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-12, 0);
  ctx.lineTo(12, 0);
  ctx.moveTo(0, -12);
  ctx.lineTo(0, 12);
  ctx.stroke();
  ctx.fillStyle = "#f472b6";
  ctx.beginPath();
  ctx.arc(0, 0, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
