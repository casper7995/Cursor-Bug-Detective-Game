/** In-lane hero badge copy + colors — shared by renderer and unit tests. */

import type { AgentKind } from "./types";

export interface ErrandLaneBadgeMeta {
  readonly abbrev: string;
  readonly fg: string;
  readonly bg: string;
  readonly border: string;
}

export function errandAgentLaneBadgeMeta(kind: AgentKind): ErrandLaneBadgeMeta {
  switch (kind) {
    case "fixer":
      return {
        abbrev: "FIX",
        fg: "#07140d",
        bg: "rgba(50,235,140,0.92)",
        border: "rgba(18,120,72,0.98)",
      };
    case "reviewer":
      return {
        abbrev: "REV",
        fg: "#f6f2ff",
        bg: "rgba(95,62,235,0.94)",
        border: "rgba(200,180,255,0.98)",
      };
    case "firewall":
      return {
        abbrev: "FW",
        fg: "#f0f8ff",
        bg: "rgba(55,115,220,0.92)",
        border: "rgba(120,200,255,0.98)",
      };
  }
}
