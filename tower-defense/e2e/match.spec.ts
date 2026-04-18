import { test, expect } from "@playwright/test";

test("keyboard-only: movement and primary do not break session", async ({
  page,
}) => {
  await page.goto("/?class=arrow");
  await expect(page.locator("#app canvas")).toBeVisible();
  await page.keyboard.press("KeyW");
  await page.keyboard.press("KeyA");
  await page.keyboard.press("KeyJ");
  await expect(page.locator("#app canvas")).toBeVisible();
});
