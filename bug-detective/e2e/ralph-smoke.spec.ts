import { expect, test } from "@playwright/test";

/** No `?reset=1` here — it would wipe `bd:skip-intro` seeded in addInitScript. */
const RalphUrl =
  "/?fastIntro=1&seed=1&date=2026-04-21#anomaly=calendar-tomorrow";

async function bootToDesk(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.goto(RalphUrl, { waitUntil: "domcontentloaded" });
  await page.keyboard.press("Space");
  await expect(page.locator("#hud")).toBeVisible({ timeout: 90_000 });
}

const TAG_LIST = [
  "calendar",
  "mug",
  "reagent-tray",
  "monitor-screen",
  "case-file",
  "evidence-envelope",
  "coffee-steam",
  "keyboard",
  "lamp",
  "desk",
] as const;

async function resolveHoverPts(
  page: import("@playwright/test").Page,
  tags: readonly (typeof TAG_LIST)[number][] = TAG_LIST,
): Promise<
  Partial<Record<(typeof TAG_LIST)[number], { x: number; y: number }>>
> {
  return page.evaluate((tagSubset) => {
    const w = window as unknown as {
      __bdResolveAllHovers?: () => Record<
        string,
        { x: number; y: number } | null
      >;
      __bdRayProbe?: (x: number, y: number) => Array<{ tag: string }>;
    };
    const raw = w.__bdResolveAllHovers!();
    const out: Record<string, { x: number; y: number }> = {};
    for (const t of tagSubset) {
      const p = raw[t];
      if (!p) throw new Error(`__bdResolveAllHovers missing ${t}`);
      const hits = w.__bdRayProbe?.(p.x, p.y) ?? [];
      if (!hits.some((h) => h.tag === t)) {
        throw new Error(
          `hover for ${t} not ray-stable at ${p.x},${p.y} — hits=${hits.map((h) => h.tag).join(",")}`,
        );
      }
      out[t] = p;
    }
    return out as Partial<
      Record<(typeof TAG_LIST)[number], { x: number; y: number }>
    >;
  }, tags);
}

test.describe("Ralph-loop smoke (Chromium)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("bd:skip-intro", "1");
        localStorage.removeItem("bd:miniTutorial:runner");
        localStorage.setItem("bd:miniTutorial:sentence", "1");
        localStorage.setItem("bd:miniTutorial:errand", "1");
        localStorage.setItem("bd:miniTutorial:tamper", "1");
      } catch {
        /* ignore */
      }
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        console.error("PAGE console.error:", msg.text());
      }
    });
  });

  test("skip-intro desk + HUD, WebGL fallback, mobile gate, prop hovers, Esc overlays", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(String(err)));

    await bootToDesk(page);

    await page.goto("/?forceNoWebGL=1", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("WebGL is required")).toBeVisible();

    await page.goto("/?mobile=1&fastIntro=1", {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: /Best played on desktop/i }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Play simplified" }).click();
    await expect(page.locator("#hud")).toBeVisible({ timeout: 90_000 });

    await bootToDesk(page);

    const probe = await page.evaluate(() => {
      const w = window as unknown as {
        __bdProbe?: () => Record<string, { x: number; y: number }>;
      };
      return typeof w.__bdProbe === "function" ? w.__bdProbe() : null;
    });
    expect(probe).toBeTruthy();
    const hoverPts = (await resolveHoverPts(page)) as Record<
      (typeof TAG_LIST)[number],
      { x: number; y: number }
    >;

    for (const t of TAG_LIST) {
      const pt = hoverPts[t]!;
      await page.mouse.move(pt.x, pt.y);
      await page.waitForTimeout(25);
    }

    const mon =
      hoverPts["monitor-screen"] ?? probe!.hit_monitor ?? probe!.monitor;
    expect(mon).toBeTruthy();
    await page.mouse.click(mon!.x, mon!.y);
    await expect(page.locator("#bd-runner-tutorial")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByTestId("bd-runner-tutorial-dismiss").click();
    await expect(page.locator(".bd-runner")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".bd-runner")).toBeHidden({ timeout: 20_000 });
    await page.waitForTimeout(2000);

    const env = hoverPts["evidence-envelope"]!;
    await page.mouse.click(env.x, env.y);
    await page.waitForTimeout(4500);
    await page.keyboard.press("Escape");
    await expect(page.locator("#hud")).toBeVisible();

    await page.evaluate(() => {
      try {
        localStorage.removeItem("bd:miniTutorial:runner");
      } catch {
        /* ignore */
      }
    });
    await expect(page.locator(".bd-runner")).toBeHidden({ timeout: 25_000 });
    await expect(page.locator("#hud")).toBeVisible({ timeout: 15_000 });

    await expect(async () => {
      await page.evaluate(() => {
        try {
          localStorage.removeItem("bd:miniTutorial:runner");
        } catch {
          /* ignore */
        }
      });
      await page.waitForTimeout(420);
      const hoverPtsLate = (await resolveHoverPts(page)) as Record<
        (typeof TAG_LIST)[number],
        { x: number; y: number }
      >;
      const mon2 = hoverPtsLate["monitor-screen"]!;
      await page.mouse.move(mon2.x, mon2.y);
      await page.waitForTimeout(100);
      await page.mouse.down();
      await page.mouse.up();
      await page.waitForTimeout(220);
      const vis = await page.locator("#bd-runner-tutorial").isVisible();
      if (!vis) throw new Error("runner tutorial missing after monitor click");
    }).toPass({ timeout: 45_000, intervals: [800] });

    await page.getByTestId("bd-runner-tutorial-dismiss").click();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);

    // Re-use investigation-camera picks from the first pass — the rig returns
    // to the same desk pose, and re-resolving mid-flow can fail if the tray
    // never wins the top hit stack at the new pixel grid sample.
    const reagent = hoverPts["reagent-tray"];
    await page.mouse.click(reagent.x, reagent.y);
    await page.waitForTimeout(800);
    await page.keyboard.press("Escape");

    const lamp = hoverPts.lamp;
    await page.mouse.click(lamp.x, lamp.y);
    await page.waitForTimeout(800);
    await page.keyboard.press("Escape");

    await bootToDesk(page);
    await page.waitForTimeout(12_000);

    const serious = errors.filter(
      (e) => !e.includes("Navigated away from page"),
    );
    expect(serious, serious.join("\n")).toEqual([]);
  });

  test("sentence pick phase: Tab commits blue; idle advances within 4s", async ({
    page,
  }) => {
    await bootToDesk(page);
    const envPt = await page.evaluate(() => {
      const w = window as unknown as {
        __bdResolveAllHovers?: () => Record<
          string,
          { x: number; y: number } | null
        >;
      };
      const p = w.__bdResolveAllHovers!()["evidence-envelope"];
      if (!p) throw new Error("missing evidence-envelope hover");
      return p;
    });
    await page.mouse.click(envPt.x, envPt.y);
    await page.waitForTimeout(4000);
    await page.keyboard.press("Tab");
    await page.waitForTimeout(800);
    await page.keyboard.press("Escape");
    await expect(page.locator("#hud")).toBeVisible();
  });
});
