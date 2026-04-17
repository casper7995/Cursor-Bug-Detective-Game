import type { Entity, World } from "./types";

export function makeCaptchaBoss(world: World): Entity {
  return {
    id: 0,
    kind: "boss",
    pos: { x: world.width / 2, y: world.height / 2 },
    vel: { x: 0, y: 0 },
    radius: 36,
    hp: 9,
    team: "bad",
    data: { fireTimer: 2, age: 0, expireAt: 20, eventDone: false },
    update(dt, w) {
      if (this.hp <= 0) {
        if (!(this.data.eventDone as boolean)) {
          this.data.eventDone = true;
          const player = w.entities.find((x) => x.kind === "player");
          if (player) w.events.push({ type: "boss-killed", killer: player });
        }
        this.dead = true;
        return;
      }
      this.data.age = (this.data.age as number) + dt;
      if ((this.data.age as number) >= (this.data.expireAt as number)) {
        this.dead = true;
        return;
      }
      this.data.fireTimer = (this.data.fireTimer as number) - dt;
      if ((this.data.fireTimer as number) <= 0) {
        this.data.fireTimer = 2;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          spawnBossBullet(this, w, Math.cos(a) * 160, Math.sin(a) * 160);
        }
      }
    },
    draw(ctx) {
      ctx.save();
      ctx.translate(this.pos.x, this.pos.y);
      const age = this.data.age as number;
      ctx.rotate(age * 0.6);
      ctx.fillStyle = "#3b82f6";
      ctx.fillRect(-30, -30, 60, 60);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "center";
      ctx.fillText("CAPTCHA", 0, 0);
      ctx.fillText(`HP ${this.hp}`, 0, 14);
      ctx.restore();
    },
  };
}

function spawnBossBullet(
  owner: Entity,
  world: World,
  vx: number,
  vy: number,
): void {
  world.add({
    id: 0,
    kind: "projectile",
    pos: { x: owner.pos.x, y: owner.pos.y },
    vel: { x: vx, y: vy },
    radius: 5,
    hp: 1,
    team: "bad",
    data: { damage: 1 },
    update(dt, w) {
      this.pos.x += this.vel.x * dt;
      this.pos.y += this.vel.y * dt;
      if (
        this.pos.x < -50 ||
        this.pos.x > w.width + 50 ||
        this.pos.y < -50 ||
        this.pos.y > w.height + 50
      ) {
        this.dead = true;
      }
    },
    draw(ctx) {
      ctx.fillStyle = "#3b82f6";
      ctx.beginPath();
      ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
    },
  });
}
