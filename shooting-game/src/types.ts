export type Vec2 = { x: number; y: number };

export type EntityKind =
  | "player"
  | "bot"
  | "enemy"
  | "projectile"
  | "boss"
  | "particle";

export interface Entity {
  id: number;
  kind: EntityKind;
  pos: Vec2;
  vel: Vec2;
  radius: number;
  hp: number;
  team: "good" | "bad";
  data: Record<string, unknown>;
  update: (dt: number, world: World) => void;
  draw: (ctx: CanvasRenderingContext2D) => void;
  dead?: boolean;
}

export interface World {
  entities: Entity[];
  add: (e: Entity) => void;
  width: number;
  height: number;
  elapsed: number;
  matchLength: number;
  rng: () => number;
  events: GameEvent[];
}

export type GameEvent =
  | {
      type: "kill";
      killer: Entity;
      victim: Entity;
      distance: number;
      meta?: { thrown?: boolean; comboAtKill?: number; spinHits?: number };
    }
  | { type: "damage"; victim: Entity; amount: number }
  | { type: "boss-spawn" }
  | { type: "boss-killed"; killer: Entity };

export type GameState = "pick" | "playing" | "end";

export type CharacterKind =
  | "arrow"
  | "ibeam"
  | "hand"
  | "spinner"
  | "crosshair";
export type EnemyKind = "404" | "cookie" | "loader" | "notif" | "popup";
