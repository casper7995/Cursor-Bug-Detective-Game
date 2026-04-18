import type { Entity, EnemyKind } from "./types";

function handleThrownMotion(self: Entity, dt: number): boolean {
  if (!self.data.thrownByHand) return false;
  self.pos.x += self.vel.x * dt;
  self.pos.y += self.vel.y * dt;
  const damp = Math.pow(0.92, dt * 60);
  self.vel.x *= damp;
  self.vel.y *= damp;
  if (self.vel.x * self.vel.x + self.vel.y * self.vel.y < 400) {
    self.data.thrownByHand = false;
  }
  return true;
}

export const ENEMY_VALUE: Record<EnemyKind, number> = {
  "404": 10,
  cookie: 30,
  loader: 20,
  notif: 15,
  popup: 25,
};

export function makeEnemy(kind: EnemyKind, x: number, y: number): Entity {
  switch (kind) {
    case "404":
      return make404Walker(x, y);
    case "cookie":
      return makeCookie(x, y);
    case "loader":
      return makeLoader(x, y);
    case "notif":
      return makeNotif(x, y);
    case "popup":
      return makePopup(x, y);
    default:
      return make404Walker(x, y);
  }
}

function make404Walker(x: number, y: number): Entity {
  return {
    id: 0,
    kind: "enemy",
    pos: { x, y },
    vel: { x: 0, y: 0 },
    radius: 12,
    hp: 1,
    team: "bad",
    data: {
      enemyKind: "404" as EnemyKind,
      value: ENEMY_VALUE["404"],
      speed: 60,
      split: false,
    },
    update(dt, world) {
      if (handleThrownMotion(this, dt)) return;
      if (this.data.grabbed) return;
      const player = world.entities.find((e) => e.kind === "player");
      if (!player) return;
      const dx = player.pos.x - this.pos.x;
      const dy = player.pos.y - this.pos.y;
      const len = Math.hypot(dx, dy) || 1;
      const speed = this.data.speed as number;
      this.pos.x += (dx / len) * speed * dt;
      this.pos.y += (dy / len) * speed * dt;
    },
    draw(ctx) {
      ctx.fillStyle = "#ff5555";
      ctx.font = "bold 18px monospace";
      ctx.textAlign = "center";
      ctx.fillText("404", this.pos.x, this.pos.y + 6);
    },
  };
}

function makeCookie(x: number, y: number): Entity {
  const vx = x < 0 ? 50 : -50;
  return {
    id: 0,
    kind: "enemy",
    pos: { x, y },
    vel: { x: vx, y: 0 },
    radius: 14,
    hp: 3,
    team: "bad",
    data: { enemyKind: "cookie" as EnemyKind, value: ENEMY_VALUE.cookie },
    update(dt, world) {
      if (handleThrownMotion(this, dt)) return;
      if (this.data.grabbed) return;
      this.pos.x += this.vel.x * dt;
      if (this.pos.x < this.radius) this.pos.x = this.radius;
      if (this.pos.x > world.width - this.radius)
        this.pos.x = world.width - this.radius;
    },
    draw(ctx) {
      ctx.fillStyle = "#d4a574";
      ctx.strokeStyle = "#3a2a1a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(this.pos.x - 18, this.pos.y - 10, 36, 20, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#333";
      ctx.font = "10px monospace";
      ctx.textAlign = "center";
      ctx.fillText("cookie", this.pos.x, this.pos.y + 4);
    },
  };
}

function makeLoader(x: number, y: number): Entity {
  return {
    id: 0,
    kind: "enemy",
    pos: { x, y },
    vel: { x: 0, y: 0 },
    radius: 11,
    hp: 2,
    team: "bad",
    data: {
      enemyKind: "loader" as EnemyKind,
      value: ENEMY_VALUE.loader,
      orbitAngle: Math.random() * Math.PI * 2,
    },
    update(dt, world) {
      if (handleThrownMotion(this, dt)) return;
      if (this.data.grabbed) return;
      const player = world.entities.find((e) => e.kind === "player");
      if (!player) return;
      let ang = this.data.orbitAngle as number;
      ang += ((60 * Math.PI) / 180) * dt;
      this.data.orbitAngle = ang;
      const r = 140;
      this.pos.x = player.pos.x + Math.cos(ang) * r;
      this.pos.y = player.pos.y + Math.sin(ang) * r;
    },
    draw(ctx) {
      ctx.strokeStyle = "#6ee7ff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.pos.x, this.pos.y, 8, 0, Math.PI * 1.7);
      ctx.stroke();
    },
  };
}

function makeNotif(x: number, y: number): Entity {
  return {
    id: 0,
    kind: "enemy",
    pos: { x, y },
    vel: { x: 0, y: 0 },
    radius: 6,
    hp: 1,
    team: "bad",
    data: {
      enemyKind: "notif" as EnemyKind,
      value: ENEMY_VALUE.notif,
      speed: 180,
    },
    update(dt, world) {
      if (handleThrownMotion(this, dt)) return;
      if (this.data.grabbed) return;
      const player = world.entities.find((e) => e.kind === "player");
      if (!player) return;
      const dx = player.pos.x - this.pos.x;
      const dy = player.pos.y - this.pos.y;
      const len = Math.hypot(dx, dy) || 1;
      const speed = this.data.speed as number;
      this.pos.x += (dx / len) * speed * dt;
      this.pos.y += (dy / len) * speed * dt;
    },
    draw(ctx) {
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
    },
  };
}

function makePopup(x: number, y: number): Entity {
  return {
    id: 0,
    kind: "enemy",
    pos: { x, y },
    vel: { x: 0, y: 0 },
    radius: 13,
    hp: 2,
    team: "bad",
    data: {
      enemyKind: "popup" as EnemyKind,
      value: ENEMY_VALUE.popup,
      birthTime: -1,
      replicated: false,
    },
    update(dt, world) {
      if (handleThrownMotion(this, dt)) return;
      if (this.data.grabbed) return;
      if ((this.data.birthTime as number) < 0)
        this.data.birthTime = world.elapsed;
      const age = world.elapsed - (this.data.birthTime as number);
      if (!(this.data.replicated as boolean) && age >= 5) {
        const n = world.entities.filter(
          (e) => !e.dead && e.kind === "enemy" && e.data.enemyKind === "popup",
        ).length;
        if (n < 8) {
          world.add(makePopup(this.pos.x + 20, this.pos.y));
          world.add(makePopup(this.pos.x - 20, this.pos.y));
        }
        this.data.replicated = true;
      }
    },
    draw(ctx) {
      ctx.fillStyle = "#e2e8f0";
      ctx.strokeStyle = "#64748b";
      ctx.lineWidth = 2;
      ctx.fillRect(this.pos.x - 20, this.pos.y - 14, 40, 28);
      ctx.strokeRect(this.pos.x - 20, this.pos.y - 14, 40, 28);
      ctx.fillStyle = "#64748b";
      ctx.fillRect(this.pos.x - 6, this.pos.y - 10, 12, 4);
    },
  };
}
