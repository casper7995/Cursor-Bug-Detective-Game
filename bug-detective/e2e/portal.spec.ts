import { expect, test } from "@playwright/test";

/**
 * Vibe Jam 2026 portal — boot-time skip-splash + return-portal click.
 *
 * Run against the local Vite dev server (configured via playwright.config.ts).
 * Production smoke happens manually via curl + cursor-ide-browser; this
 * test guards the regression boundary in CI.
 */

test.describe("vibe-jam portal arrival", () => {
  test("?portal=true skips title splash and shows the desk", async ({
    page,
  }) => {
    await page.goto(
      "/?portal=true&ref=fly.pieter.com&username=levelsio&color=red&fastIntro=1",
      { waitUntil: "domcontentloaded" },
    );
    // Splash should not appear within the first second of boot.
    await page.waitForTimeout(1000);
    const splash = page.locator(".bd-title");
    await expect(splash).toHaveCount(0);

    // HUD comes up once the skip-intro fast path lands on the desk.
    await expect(page.locator("#hud")).toBeVisible({ timeout: 30_000 });
  });

  test("clicking the return portal navigates back to ref host with portal=true", async ({
    page,
  }) => {
    // Block real navigation to fly.pieter.com so the test stays on the
    // app page; we observe the URL Playwright was asked to visit.
    let capturedUrl: string | null = null;
    await page.route("**/fly.pieter.com/**", (route) => {
      capturedUrl = route.request().url();
      return route.abort();
    });

    await page.goto(
      "/?portal=true&ref=fly.pieter.com&username=levelsio&color=red&fastIntro=1",
      { waitUntil: "domcontentloaded" },
    );
    await expect(page.locator("#hud")).toBeVisible({ timeout: 30_000 });

    // Use the debug probe (added by main.ts for headless testing) to
    // get the projected screen position of the return portal, then
    // click on it. Sweep a tiny radius around that point so a
    // sub-pixel mismatch with the disc geometry doesn't fail us.
    const portalPt = await page.evaluate(() => {
      type Pts = Record<string, { x: number; y: number }>;
      const probe = (window as unknown as { __bdProbe?: () => Pts }).__bdProbe;
      const pts = probe?.();
      return pts?.portal_return ?? null;
    });
    expect(portalPt).not.toBeNull();
    const offsets: Array<[number, number]> = [
      [0, 0],
      [-12, 0],
      [12, 0],
      [0, -12],
      [0, 12],
      [-20, -10],
      [20, -10],
      [-20, 10],
      [20, 10],
    ];
    for (const [ox, oy] of offsets) {
      if (capturedUrl) break;
      await page.mouse.click(portalPt!.x + ox, portalPt!.y + oy);
      await page.waitForTimeout(120);
    }

    expect(capturedUrl).not.toBeNull();
    expect(capturedUrl!).toContain("fly.pieter.com");
    expect(capturedUrl!).toContain("portal=true");
  });
});
