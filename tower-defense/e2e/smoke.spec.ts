import { test, expect } from "@playwright/test";

test("loads canvas, no console errors, jam widget present", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const t = msg.text();
    if (t.includes("vibej.am")) return;
    errors.push(t);
  });
  await page.goto("/");
  await expect(page.locator("#app canvas")).toBeVisible();
  await expect(
    page.locator('script[src="https://vibej.am/2026/widget.js"]'),
  ).toHaveCount(1);
  expect(errors, errors.join("\n")).toEqual([]);
});
