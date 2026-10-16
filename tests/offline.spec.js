const { test, expect } = require("@playwright/test");

test("installable and works offline after the first visit", async ({ page, context }) => {
  await page.goto("/index.html");
  const manifest = await page.evaluate(async () => (await fetch(document.querySelector('link[rel=manifest]').href)).json());
  expect(manifest.short_name).toBe("SpeakEasy");
  expect(manifest.icons.length).toBeGreaterThan(1);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();                                            // now controlled by the worker
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("#tab-present")).toBeVisible();
  await page.click("#tab-present");
  await page.click("#next");
  await expect(page.locator("#counter")).toHaveText("2 / 6");
  await context.setOffline(false);
});
