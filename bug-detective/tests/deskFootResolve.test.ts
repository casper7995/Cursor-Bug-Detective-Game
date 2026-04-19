import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  clampFeetToDeskBounds,
  resolveFeetAgainstDeskObstacles,
} from "../src/cursor/deskFootResolve";

describe("deskFootResolve", () => {
  it("pushes feet out of a circular obstacle", () => {
    const feet = new THREE.Vector3(2.4, 0, 0.6);
    resolveFeetAgainstDeskObstacles(feet, [{ x: 2.4, z: 0.6, r: 0.3 }], {
      agentRadius: 0.14,
      iterations: 6,
    });
    expect(Math.hypot(feet.x - 2.4, feet.z - 0.6)).toBeGreaterThanOrEqual(
      0.3 + 0.14 - 1e-3,
    );
  });

  it("clamps to desk bounds", () => {
    const feet = new THREE.Vector3(100, 0, 100);
    clampFeetToDeskBounds(feet, 4, 2, 0.2);
    expect(feet.x).toBeLessThanOrEqual(3.8);
    expect(feet.z).toBeLessThanOrEqual(1.8);
  });
});
