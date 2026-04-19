import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

function makeMockCanvasContext(): CanvasRenderingContext2D {
  const noop = () => {};
  const gradient = { addColorStop: noop };
  return {
    clearRect: noop,
    beginPath: noop,
    ellipse: noop,
    fill: noop,
    lineTo: noop,
    moveTo: noop,
    stroke: noop,
    arc: noop,
    fillRect: noop,
    strokeRect: noop,
    createRadialGradient: () => gradient,
    createLinearGradient: () => gradient,
  } as unknown as CanvasRenderingContext2D;
}

describe("createMascotMesh", () => {
  const originalDocument = globalThis.document;

  beforeEach(() => {
    const mockCtx = makeMockCanvasContext();
    vi.stubGlobal("document", {
      createElement(tag: string) {
        if (tag !== "canvas") throw new Error(`unexpected tag: ${tag}`);
        return {
          width: 256,
          height: 256,
          getContext(type: string) {
            if (type !== "2d") return null;
            return mockCtx;
          },
        };
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.document = originalDocument;
  });

  it("has chibi big-head-small-body proportions with a visibly tilted head cube", async () => {
    const { createMascotMesh } = await import("../src/cursor/mascotMesh");
    const mascot = createMascotMesh();
    mascot.group.updateMatrixWorld(true);

    const bounds = new THREE.Box3().setFromObject(mascot.group);
    const size = new THREE.Vector3();
    bounds.getSize(size);

    const headGroup = mascot.group.children.find(
      (child) => child instanceof THREE.Group && child.position.y > 0.2,
    ) as THREE.Group | undefined;
    const bodyGroup = mascot.group.children.find(
      (child) => child instanceof THREE.Group && child.position.y < 0,
    ) as THREE.Group | undefined;
    expect(headGroup).toBeDefined();
    expect(bodyGroup).toBeDefined();
    const headG = headGroup as THREE.Group;
    const bodyG = bodyGroup as THREE.Group;

    const headBounds = new THREE.Box3().setFromObject(headG);
    const headSize = new THREE.Vector3();
    headBounds.getSize(headSize);

    const bodyBounds = new THREE.Box3().setFromObject(bodyG);
    const bodySize = new THREE.Vector3();
    bodyBounds.getSize(bodySize);

    // Find the torso cylinder so we compare against the trunk, not arm reach
    // (which can extend beyond the head when the magnifier is drawn).
    let torsoSize = new THREE.Vector3();
    bodyG.traverse((obj) => {
      if (
        obj instanceof THREE.Mesh &&
        obj.geometry instanceof THREE.CylinderGeometry &&
        obj.position.x === 0 // torso is on centerline; arms/legs are not
      ) {
        new THREE.Box3().setFromObject(obj).getSize(torsoSize);
      }
    });

    // Big head: dominates the silhouette vertically and is wider than torso.
    expect(headSize.y / size.y).toBeGreaterThanOrEqual(0.45);
    expect(headSize.x).toBeGreaterThanOrEqual(torsoSize.x * 2);
    expect(headSize.y).toBeGreaterThanOrEqual(bodySize.y * 0.6);

    // Chibi proportions: not a tall humanoid.
    expect(size.y / size.x).toBeLessThanOrEqual(1.55);

    // Cube head is visibly tilted (showing more than one face).
    expect(Math.abs(headG.rotation.y)).toBeGreaterThanOrEqual(0.25);
  });

  it("holds the magnifying glass by the handle when lifted", async () => {
    const { createMascotMesh } = await import("../src/cursor/mascotMesh");
    const mascot = createMascotMesh();
    mascot.setMagnifierLifted(1);
    mascot.group.updateMatrixWorld(true);

    const magnifier = mascot.group.getObjectByName("magnifier");
    expect(magnifier).toBeTruthy();
    const hand = magnifier?.parent;
    const magnifierParts = magnifier?.children[0];
    const handle = magnifierParts?.children.find(
      (child) =>
        child.type === "Mesh" && child.geometry?.type === "CylinderGeometry",
    );
    const lens = magnifierParts?.children.find(
      (child) =>
        child.type === "Mesh" && child.geometry?.type === "CircleGeometry",
    );

    expect(hand).toBeTruthy();
    expect(handle).toBeTruthy();
    expect(lens).toBeTruthy();

    const handPos = new THREE.Vector3();
    const handlePos = new THREE.Vector3();
    const lensPos = new THREE.Vector3();
    hand?.getWorldPosition(handPos);
    handle?.getWorldPosition(handlePos);
    lens?.getWorldPosition(lensPos);

    expect(handPos.distanceTo(handlePos)).toBeLessThanOrEqual(0.11);
    expect(handPos.distanceTo(lensPos)).toBeGreaterThanOrEqual(0.27);
  });

  it("keeps a centered cursor-logo stack and leaves the face fixed to the front cube panel", async () => {
    const { createMascotMesh } = await import("../src/cursor/mascotMesh");
    const mascot = createMascotMesh();
    mascot.group.updateMatrixWorld(true);

    const cursorWedge = mascot.group.getObjectByName("cursorWedge");
    expect(cursorWedge).toBeTruthy();

    // The reference mark is centered in the cube, with a broad top facet
    // and a centered down-stroke rather than an off-to-the-side arrow.
    expect(Math.abs(cursorWedge!.position.x)).toBeLessThanOrEqual(0.03);

    // The cute face should sit on the front clear panel, not down on the
    // internal dark slab.
    expect(mascot.faceAnchor.position.z).toBeGreaterThanOrEqual(0.3);

    const headGroup = mascot.group.children.find(
      (child) => child instanceof THREE.Group && child.position.y > 0.2,
    ) as THREE.Group | undefined;
    expect(headGroup).toBeDefined();
    const facePlane = headGroup?.children.find(
      (child) =>
        child instanceof THREE.Mesh &&
        (child.material as THREE.MeshStandardMaterial).transparent === true &&
        child.renderOrder === 4,
    ) as THREE.Mesh | undefined;
    expect(facePlane).toBeDefined();

    const before = facePlane!.quaternion.clone();
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(3, 1.5, 2);
    mascot.faceCamera(camera);

    // Calling faceCamera should not billboard the face away from the cube panel.
    expect(facePlane!.quaternion.angleTo(before)).toBeLessThanOrEqual(1e-6);
  });

  it("builds the head as one faceted shell instead of a box plus separate roof cone", async () => {
    const { createMascotMesh } = await import("../src/cursor/mascotMesh");
    const mascot = createMascotMesh();

    let coneCount = 0;
    mascot.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.geometry?.type === "ConeGeometry") {
        coneCount += 1;
      }
    });

    expect(coneCount).toBe(0);
  });

  it("uses a clearer left-arm / darker right-arm material split", async () => {
    const { createMascotMesh } = await import("../src/cursor/mascotMesh");
    const mascot = createMascotMesh();

    const upperArms: THREE.Mesh[] = [];
    mascot.group.traverse((obj) => {
      if (
        obj instanceof THREE.Mesh &&
        obj.geometry instanceof THREE.CylinderGeometry &&
        obj.geometry.parameters.height >= 0.18 &&
        obj.geometry.parameters.height <= 0.2 &&
        obj.position.x !== 0
      ) {
        upperArms.push(obj);
      }
    });

    expect(upperArms).toHaveLength(2);
    const leftArm = upperArms.find((arm) => arm.position.x < 0);
    const rightArm = upperArms.find((arm) => arm.position.x > 0);
    expect(leftArm).toBeDefined();
    expect(rightArm).toBeDefined();

    const leftMat = leftArm!.material as THREE.MeshStandardMaterial;
    const rightMat = rightArm!.material as THREE.MeshStandardMaterial;
    expect(leftMat.transparent).toBe(true);
    expect(rightMat.transparent).toBe(false);
  });
});
