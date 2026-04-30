import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { MascotController } from "../src/cursor/mascotController";

describe("MascotController", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not let idle bob lower grounded feet below the desk target", () => {
    vi.spyOn(performance, "now").mockReturnValue(1000);
    const group = new THREE.Group();
    const controller = new MascotController(group, {});
    const groundedTarget = new THREE.Vector3(0, 0.285, 0);

    controller.resetAt(groundedTarget.clone(), 0);
    controller.step(groundedTarget, 1 / 60, 6000);

    expect(group.position.y).toBeGreaterThanOrEqual(groundedTarget.y);
  });
});
