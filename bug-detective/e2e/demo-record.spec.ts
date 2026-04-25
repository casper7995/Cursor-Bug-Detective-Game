import { expect, test } from "@playwright/test";

const RalphUrl =
  "/?fastIntro=1&seed=1&date=2026-04-21#anomaly=calendar-tomorrow";

async function bootToDesk(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.goto(RalphUrl, { waitUntil: "domcontentloaded" });
  await page.keyboard.press("Space");
  await expect(page.locator("#hud")).toBeVisible({ timeout: 90_000 });
  await page.waitForFunction(
    () => {
      const w = window as unknown as {
        __bdResolveAllHovers?: () => Record<
          string,
          { x: number; y: number } | null
        >;
      };
      const p = w.__bdResolveAllHovers?.()?.["evidence-envelope"] ?? null;
      return Boolean(p);
    },
    undefined,
    { timeout: 90_000 },
  );
}

const TAG_LIST = [
  "monitor-screen",
  "evidence-envelope",
  "reagent-tray",
  "lamp",
] as const;

async function resolveHoverPts(
  page: import("@playwright/test").Page,
  tags: readonly (typeof TAG_LIST)[number][] = TAG_LIST,
): Promise<Record<(typeof TAG_LIST)[number], { x: number; y: number }>> {
  return page.evaluate((tagSubset) => {
    const w = window as unknown as {
      __bdResolveAllHovers?: () => Record<
        string,
        { x: number; y: number } | null
      >;
      __bdRayProbe?: (x: number, y: number) => Array<{ tag: string }>;
    };
    const raw = w.__bdResolveAllHovers!();
    const out = {} as Record<string, { x: number; y: number }>;
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
    return out as Record<(typeof TAG_LIST)[number], { x: number; y: number }>;
  }, tags);
}

test.describe("QA demo recordings (Deterministic)", () => {
  // Serial: each test records a new video artifact; running in parallel can make
  // mtime-based discovery pick the wrong clip when the orchestrator reuses one worker.
  test.describe.configure({ mode: "serial" });

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
  });

  test("runner", async ({ page }) => {
    await bootToDesk(page);
    const hoverPts = await resolveHoverPts(page);
    const mon = hoverPts["monitor-screen"];
    await page.mouse.click(mon.x, mon.y);
    await expect(page.locator("#bd-runner-tutorial")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByTestId("bd-runner-tutorial-dismiss").click();
    await expect(page.locator(".bd-runner")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".bd-runner")).toBeHidden({ timeout: 20_000 });
    await page.waitForTimeout(800);
  });

  test("sentence", async ({ page }) => {
    await bootToDesk(page);
    const env = (await resolveHoverPts(page, ["evidence-envelope"]))[
      "evidence-envelope"
    ];
    await page.mouse.click(env.x, env.y);
    await page.waitForTimeout(4000);
    await page.keyboard.press("Tab");
    await page.waitForTimeout(800);
    await page.keyboard.press("Escape");
    await expect(page.locator("#hud")).toBeVisible();
  });

  test("errand", async ({ page }) => {
    await bootToDesk(page);
    const tray = (await resolveHoverPts(page, ["reagent-tray"]))[
      "reagent-tray"
    ];
    await page.mouse.click(tray.x, tray.y);
    await page.waitForTimeout(1500);
    await page.keyboard.press("Escape");
    await expect(page.locator("#hud")).toBeVisible();
  });

  test("tamper", async ({ page }) => {
    await bootToDesk(page);
    const lamp = (await resolveHoverPts(page, ["lamp"])).lamp;
    await page.mouse.click(lamp.x, lamp.y);
    await page.waitForTimeout(1200);
    await page.keyboard.press("Escape");
    await expect(page.locator("#hud")).toBeVisible();
  });
});
