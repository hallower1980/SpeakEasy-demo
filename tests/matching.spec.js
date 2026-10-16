// Matching behaviors from Hark's 1.0.2 test plan: script triggers, My Phrases, number words,
// cooldowns, undo, and how heard words are shown.
const { test, expect } = require("@playwright/test");
const { open, present, hear, slide } = require("./helpers");

test.beforeEach(async ({ page }) => {
  await page.clock.install();
  await open(page);
  await present(page);
});

test("sequential script triggers fire in order; the next one also listens", async ({ page }) => {
  await hear(page, "Today I want to talk about something every one of us has seen go wrong");
  await expect(page.locator("#counter")).toHaveText("2 / 6");
  await expect(page.locator("#readout")).toContainText("show you how this works");
  // Trigger 4 isn't armed yet (armed is 2, the one after it is 3): nothing happens.
  await page.clock.fastForward(1500);
  await hear(page, "and my own phrases still work");
  await expect(page.locator("#counter")).toHaveText("2 / 6");
  // Trigger 3 is the one after the armed trigger, so it fires (one missed cue doesn't stall the talk).
  await hear(page, "let me play a short clip");
  await expect(page.locator("#counter")).toHaveText("4 / 6");
});

test("a 4+ word trigger allows one misheard middle word, never the first or last", async ({ page }) => {
  await hear(page, "something every one of us");
  await page.clock.fastForward(1500);
  await hear(page, "shows you how this works");          // first word wrong
  await expect(page.locator("#counter")).toHaveText("2 / 6");
  await hear(page, "show you how this work");             // last word wrong
  await expect(page.locator("#counter")).toHaveText("2 / 6");
  await hear(page, "show you how thus works");            // middle word wrong: fires
  await expect(page.locator("#counter")).toHaveText("3 / 6");
});

test("heard words are shown as spoken: “every one of us”, not “every 1 of us”", async ({ page }) => {
  await hear(page, "something every one of us");
  await expect(page.locator("#toast")).toContainText("heard “something every one of us”");
});

test("My Phrases: slide numbers as words, digits and sound-alikes", async ({ page }) => {
  await hear(page, "jump to slide five");
  await expect(page.locator("#counter")).toHaveText("5 / 6");
  await page.clock.fastForward(3100);
  await hear(page, "jump to slide to");                  // "to" → 2
  await expect(page.locator("#counter")).toHaveText("2 / 6");
  await page.clock.fastForward(3100);
  await hear(page, "jump to slide 6");
  await expect(page.locator("#counter")).toHaveText("6 / 6");
  await page.clock.fastForward(3100);
  await hear(page, "jump to slide twelve");
  await expect(page.locator("#counter")).toHaveText("6 / 6");
  await expect(page.locator("#toast")).toContainText("Slide 12 doesn’t exist");
});

test("My Phrases: back, end, beginning, blackout", async ({ page }) => {
  await hear(page, "skip to the end");
  await expect(page.locator("#counter")).toHaveText("6 / 6");
  await page.clock.fastForward(1500);
  await hear(page, "go back one");
  await expect(page.locator("#counter")).toHaveText("5 / 6");
  await hear(page, "black screen");
  await expect(page.locator("#stage")).toHaveClass(/is-black/);
  await page.clock.fastForward(3100);
  await hear(page, "black screen");
  await expect(page.locator("#stage")).not.toHaveClass(/is-black/);
  await hear(page, "back to the beginning");
  await expect(page.locator("#counter")).toHaveText("1 / 6");
  await expect(page.locator("#readout")).toContainText("something every one of us"); // re-armed
});

test("cooldown: a second next within 1.2 s is held back with a notice", async ({ page }) => {
  await hear(page, "something every one of us");
  await expect(page.locator("#counter")).toHaveText("2 / 6");
  await hear(page, "next slide please");
  await expect(page.locator("#counter")).toHaveText("2 / 6");
  await expect(page.locator("#toast")).toContainText("Held back “next slide please”");
  // A held-back cue doesn't start its own 3 s cooldown. (Identical recognizer results within
  // 2.5 s are still dropped as re-sends, so wait past that.)
  await page.clock.fastForward(2600);
  await hear(page, "next slide please");
  await expect(page.locator("#counter")).toHaveText("3 / 6");
});

test("cooldown: the same phrase within 3 s is held back and said so", async ({ page }) => {
  await hear(page, "go back one");
  await page.clock.fastForward(1300);
  await hear(page, "skip to the end");
  await expect(page.locator("#counter")).toHaveText("6 / 6");
  await page.clock.fastForward(1300);
  // Said again in a new sentence (an identical re-send would be dropped silently as a duplicate).
  await hear(page, "okay so skip to the end");
  await expect(page.locator("#voice-msg")).toContainText("Held back a repeat of “skip to the end”");
  expect(await page.evaluate(() => window.cueHeldBack)).toBeGreaterThan(0);
});

test("undo: voice and button restore the previous slide", async ({ page }) => {
  await hear(page, "jump to slide four");
  await expect(page.locator("#counter")).toHaveText("4 / 6");
  await hear(page, "undo that");
  await expect(page.locator("#counter")).toHaveText("1 / 6");
  await page.click("#next");
  await expect(page.locator("#counter")).toHaveText("2 / 6");
  await page.click("#undo");
  await expect(page.locator("#counter")).toHaveText("1 / 6");
});

test("any-order mode: each trigger fires once until restart", async ({ page }) => {
  await page.click("#tab-script");
  await page.click("#mode-any");
  await present(page);
  await hear(page, "eyes on the room");
  await expect(page.locator("#counter")).toHaveText("2 / 6");
  await page.clock.fastForward(3100);
  await hear(page, "eyes on the room");
  await expect(page.locator("#counter")).toHaveText("2 / 6");
});
