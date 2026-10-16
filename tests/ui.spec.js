const { test, expect } = require("@playwright/test");
const { open, present, hear } = require("./helpers");

test("loads with no errors, no external requests, and no stray banner", async ({ page }) => {
  const errors = [], external = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("request", (r) => { const u = new URL(r.url()); if (u.hostname !== "127.0.0.1") external.push(r.url()); });
  await open(page);
  await present(page);
  await expect(page.locator("#counter")).toHaveText("1 / 6");
  await expect(page.locator("#voice-banner")).toBeHidden();       // was always visible in 1.0.2
  await expect(page.locator("#live-dot")).toBeHidden();
  const font = await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check("16px Geist"); });
  expect(font).toBe(true);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test("keyboard: arrows, B / . blackout, number + Enter", async ({ page }) => {
  await open(page);
  await present(page);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#counter")).toHaveText("2 / 6");
  await page.keyboard.press("b");
  await expect(page.locator("#stage")).toHaveClass(/is-black/);
  await page.keyboard.press(".");
  await expect(page.locator("#stage")).not.toHaveClass(/is-black/);
  await page.keyboard.press("4");
  await expect(page.locator("#key-msg")).toContainText("Go to slide 4");
  await page.keyboard.press("Enter");
  await expect(page.locator("#counter")).toHaveText("4 / 6");
  await page.keyboard.press("9");
  await page.keyboard.press("Enter");
  await expect(page.locator("#counter")).toHaveText("4 / 6");
  await expect(page.locator("#key-msg")).toContainText("doesn’t exist");
  await page.click("#undo");                                     // the jump was undoable
  await expect(page.locator("#counter")).toHaveText("2 / 6");
});

async function selectWords(page, from, to) {
  await page.evaluate(([a, b]) => {
    const view = document.getElementById("script-view");
    const s = view.querySelector('.x-w[data-i="' + a + '"]'), e = view.querySelector('.x-w[data-i="' + b + '"]');
    const r = document.createRange();
    r.setStart(s.firstChild, 0); r.setEnd(e.firstChild, e.firstChild.length);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    view.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  }, [from, to]);
}

test("Go to Slide # asks inline (no prompt) and the trigger is saved across reloads", async ({ page }) => {
  await open(page);
  await selectWords(page, 0, 1);                                  // "Good morning,"
  await expect(page.locator("#cue-toolbar")).toBeVisible();
  await page.click('#cue-toolbar [data-act="goto"]');
  await expect(page.locator("#cue-goto-row")).toBeVisible();
  await page.fill("#cue-goto-n", "9");
  await page.press("#cue-goto-n", "Enter");
  await expect(page.locator("#cue-goto-hint")).toContainText("1 to 6");
  await page.fill("#cue-goto-n", "3");
  await page.press("#cue-goto-n", "Enter");
  await expect(page.locator("#cue-toolbar")).toBeHidden();
  await expect(page.locator("#cue-list")).toContainText("“Good morning”");
  await expect(page.locator("#cue-list")).toContainText("Go to slide 3");
  await page.click("#mode-any");
  await page.reload();
  await expect(page.locator("#cue-list")).toContainText("Go to slide 3");
  await expect(page.locator("#mode-any")).toHaveAttribute("aria-pressed", "true");
  await present(page);
  await hear(page, "good morning");
  await expect(page.locator("#counter")).toHaveText("3 / 6");
});

test("edited script text is saved; Sample script restores the demo after a second tap", async ({ page }) => {
  await open(page);
  await page.click("#edit-text");
  await page.fill("#script", "Hello and welcome to the show. Thank you all for coming.");
  await page.click("#edit-text");
  await expect(page.locator("#cue-msg")).toContainText("no longer matched");
  await page.reload();
  await expect(page.locator("#script-view")).toContainText("Hello and welcome");
  await expect(page.locator("#cue-list")).toContainText("No triggers yet");
  await page.click("#script-sample");                             // no triggers to lose: replaces at once
  await expect(page.locator("#script-view")).toContainText("Good morning, everyone");
  await page.click("#edit-text");
  await page.fill("#script", "Good morning, everyone. Short version.");
  await page.click("#edit-text");
  await selectWords(page, 0, 1);
  await page.click('#cue-toolbar [data-act="next"]');
  await page.click("#script-sample");                             // a trigger would be lost: asks first
  await expect(page.locator("#cue-msg")).toContainText("Tap Sample script again");
  await expect(page.locator("#script-view")).toContainText("Short version");
  await page.click("#script-sample");
  await expect(page.locator("#script-view")).toContainText("hands free and your eyes on the room");
  await expect(page.locator("#cue-list li")).toHaveCount(5);
});

test("audience window: only changes are sent", async ({ page }) => {
  await open(page);
  await present(page);
  const [popup] = await Promise.all([page.waitForEvent("popup"), page.click("#audience")]);
  await expect(popup).toHaveTitle(/Slide 1 of 6/);
  await page.waitForTimeout(400);
  const before = await page.evaluate(() => window.cueAudienceSent);
  await page.waitForTimeout(1200);                                // static slide: nothing new to send
  expect(await page.evaluate(() => window.cueAudienceSent)).toBe(before);
  await page.click("#next");
  await expect(popup).toHaveTitle(/Slide 2 of 6/);
  expect(await page.evaluate(() => window.cueAudienceSent)).toBe(before + 1);
  await page.click("#black");
  await expect(popup.locator("#b")).toBeVisible();
});

test("voice settings: language and engine persist; Grok shows the privacy notice", async ({ page }) => {
  await open(page);
  await present(page);
  await page.click("#voice-settings > summary");
  await expect(page.locator("#grok-notice")).toBeHidden();
  await page.selectOption("#set-lang", "fr-FR");
  await page.selectOption("#set-engine", "grok");
  await expect(page.locator("#grok-notice")).toBeVisible();
  await expect(page.locator("#grok-notice")).toContainText("Processed by Grok, not stored");
  await expect(page.locator("#engine-chip")).toHaveText("Grok STT");
  await page.reload();
  await present(page);
  await page.click("#voice-settings > summary");
  await expect(page.locator("#set-lang")).toHaveValue("fr-FR");
  await expect(page.locator("#set-engine")).toHaveValue("grok");
  // Browser engine uses the chosen language.
  await page.selectOption("#set-engine", "browser");
  await page.click("#listen");
  await expect(page.locator("#mic-status")).toHaveText("Listening");
  expect(await page.evaluate(() => window.__fakeSR.last.lang)).toBe("fr-FR");
  await expect(page.locator("#live-dot")).toBeVisible();
  await page.evaluate(() => window.__fakeSR.last.emit("next slide please", true));
  await expect(page.locator("#counter")).toHaveText("2 / 6");
  await page.click("#listen");
  await expect(page.locator("#mic-status")).toHaveText("Paused");
  await expect(page.locator("#live-dot")).toBeHidden();
});
