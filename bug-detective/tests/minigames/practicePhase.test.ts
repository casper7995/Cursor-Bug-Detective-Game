import { describe, expect, it, vi } from "vitest";
import { IdleExitTimer } from "../../src/minigames/desk/idleExitTimer";
import {
  hitPracticeConfirmAgain,
  hitPracticeConfirmStart,
  hitPracticeSkip,
  layoutPracticeConfirm,
  practiceSkipRect,
} from "../../src/minigames/desk/practiceCoach";

describe("practice / idle scaffolding", () => {
  it("IdleExitTimer calls onExit after grace with no ping", () => {
    const onExit = vi.fn();
    const t = new IdleExitTimer({ graceSec: 2, onExit });
    t.step(1);
    expect(onExit).not.toHaveBeenCalled();
    t.step(1.1);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("IdleExitTimer ping resets countdown", () => {
    const onExit = vi.fn();
    const t = new IdleExitTimer({ graceSec: 2, onExit });
    t.step(1.5);
    t.ping();
    t.step(1.5);
    expect(onExit).not.toHaveBeenCalled();
  });

  it("practice skip hit rect is stable", () => {
    const r = practiceSkipRect(512);
    expect(hitPracticeSkip(r.x + r.w / 2, r.y + r.h / 2, 512)).toBe(true);
    expect(hitPracticeSkip(r.x - 2, r.y, 512)).toBe(false);
  });

  it("practice confirm button hits match layout", () => {
    const { startRound, again } = layoutPracticeConfirm(512, 320);
    expect(
      hitPracticeConfirmStart(
        startRound.x + startRound.w / 2,
        startRound.y + startRound.h / 2,
        512,
        320,
      ),
    ).toBe(true);
    expect(
      hitPracticeConfirmAgain(
        again.x + again.w / 2,
        again.y + again.h / 2,
        512,
        320,
      ),
    ).toBe(true);
  });
});
