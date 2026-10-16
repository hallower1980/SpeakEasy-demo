// Grok STT engine against a mock of the xAI streaming STT WebSocket (tests/server.mjs).
// The real API needs a key and isn't called here.
const { test, expect } = require("@playwright/test");
const { open, present } = require("./helpers");

async function useGrok(page, scenario, { port, code } = {}) {
  await page.request.get("/mock-reset");
  await present(page);
  await page.click("#voice-settings > summary");
  await page.selectOption("#set-engine", "grok");
  const base = port ? `ws://127.0.0.1:${port}/mock-stt` : new URL("/mock-stt", page.url()).href.replace(/^http/, "ws");
  await page.fill("#set-proxy", `${base}?scenario=${scenario}`);
  await page.press("#set-proxy", "Tab");
  if (code) { await page.fill("#set-code", code); await page.press("#set-code", "Tab"); }
}
async function mockLog(page) { return (await page.request.get("/mock-log")).json(); }

test("unit: keyterms, URL building and segmenting follow the documented limits", async ({ page }) => {
  await open(page);
  const r = await page.evaluate(() => {
    const G = window.SpeakEasyRecognizers.grok;
    const many = Array.from({ length: 130 }, (_, i) => "phrase number " + i);
    const terms = G.keyterms([["jump to slide N", "Next slide please", "next slide please"], many,
      ["one two three four five six seven eight nine ten eleven twelve thirteen fourteen"]]);
    const url = new URL(G.buildUrl("https://proxy.example/stt?keep=1", { language: "en", keyterms: ["a b", "c"], accessCode: "x" }));
    const seg = new G.Segmenter("g1");
    const out = [
      seg.push({ text: "next slide", is_final: false }),
      seg.push({ text: "next slide please", is_final: true, speech_final: false }),
      seg.push({ text: "next slide please and", is_final: false }),          // cumulative interim: stripped
      seg.push({ text: "and then", is_final: false }),                       // non-cumulative interim: kept
      seg.push({ text: "next slide please and then", is_final: true, speech_final: true }), // stitched
      seg.push({ text: "go back one", is_final: true, speech_final: true })
    ];
    return { terms, url: url.toString(), q: [...url.searchParams.entries()], out, gate: [G.gateThreshold(0), G.gateThreshold(4)] };
  });
  expect(r.terms[0]).toBe("jump to slide");                     // N placeholder dropped
  expect(r.terms[1]).toBe("Next slide please");
  expect(r.terms.filter((t) => t.toLowerCase() === "next slide please")).toHaveLength(1);
  expect(r.terms).toHaveLength(100);                             // max 100
  expect(Math.max(...r.terms.map((t) => t.length))).toBeLessThanOrEqual(50);
  expect(r.url.startsWith("wss://proxy.example/stt?")).toBe(true);
  const q = Object.fromEntries(r.q.filter(([k]) => k !== "keyterm"));
  expect(q).toMatchObject({ keep: "1", model: "grok-voice-transcribe-2.0", sample_rate: "16000", encoding: "pcm",
    interim_results: "true", endpointing: "250", language: "en", code: "x" });
  expect(r.q.filter(([k]) => k === "keyterm").map(([, v]) => v)).toEqual(["a b", "c"]);
  expect(r.out.map((x) => x && [x.key, x.text, x.isFinal])).toEqual([
    ["g1:0", "next slide", false],
    ["g1:0", "next slide please", true],
    ["g1:1", "and", false],
    ["g1:1", "and then", false],
    ["g1:1", "and then", true],
    ["g1:2", "go back one", true]
  ]);
  expect(r.gate).toEqual([0, 0.01]);
});

test("streams 16 kHz PCM16 with the documented query, fires cues, no double fire on stitched finals", async ({ page }) => {
  await open(page);
  await useGrok(page, "basic", { code: "letmein" });
  await expect(page.locator("#grok-notice")).toBeVisible();
  await page.click("#listen");
  await expect(page.locator("#mic-status")).toHaveText("Listening");
  await expect(page.locator("#engine-chip")).toHaveText("Grok STT");
  await expect(page.locator("#live-dot")).toBeVisible();
  await expect(page.locator("#counter")).toHaveText("2 / 6", { timeout: 10000 });
  await page.waitForTimeout(600);
  await expect(page.locator("#counter")).toHaveText("2 / 6");   // the stitched final didn't fire again
  expect(await page.evaluate(() => window.cueHeldBack)).toBe(0);
  await expect(page.locator("#transcript")).toHaveText("next slide please");
  const [conn] = await mockLog(page);
  const q = conn.query.reduce((m, [k, v]) => ((m[k] = m[k] || []).push(v), m), {});
  expect(q).toMatchObject({ sample_rate: ["16000"], encoding: ["pcm"], interim_results: ["true"], endpointing: ["250"], language: ["en"], code: ["letmein"] });
  expect(q.keyterm).toEqual(expect.arrayContaining(["something every one of us", "next slide please", "jump to slide"]));
  expect(Object.keys(conn.frameSizes)).toEqual(["3200"]);        // 100 ms of 16-bit mono at 16 kHz
  await page.click("#listen");
  await expect(page.locator("#mic-status")).toHaveText("Paused");
  await expect.poll(async () => (await mockLog(page))[0].json).toContain('{"type":"audio.done"}');
});

test("script trigger across chunk and utterance finals fires once", async ({ page }) => {
  await open(page);
  await useGrok(page, "stitched");
  await page.click("#listen");
  await expect(page.locator("#counter")).toHaveText("2 / 6", { timeout: 10000 });
  await page.waitForTimeout(600);
  await expect(page.locator("#counter")).toHaveText("2 / 6");
  expect(await page.evaluate(() => window.cueHeldBack)).toBe(0);
  await expect(page.locator("#readout")).toContainText("show you how this works");
});

test("silence gate: quiet audio isn't sent (only a keepalive)", async ({ page }) => {
  await open(page);
  await useGrok(page, "gate");
  await page.click("#listen");
  await expect(page.locator("#mic-status")).toHaveText("Listening");
  await page.waitForTimeout(6000);                               // fake mic: 0.6 s tone, 3.4 s silence, looped
  const stats = await page.evaluate(() => window.cueGrokStats);
  expect(stats.chunks).toBeGreaterThan(40);
  expect(stats.sent).toBeGreaterThan(5);
  expect(stats.sent).toBeLessThan(stats.chunks * 0.7);
});

test("disconnect: retries, then falls back to Browser recognition", async ({ page }) => {
  await open(page);
  await useGrok(page, "drop");
  await page.click("#listen");
  await expect(page.locator("#engine-chip")).toHaveText("Fallback: Browser", { timeout: 15000 });
  await expect(page.locator("#mic-status")).toHaveText("Listening");
  await expect(page.locator("#voice-msg")).toContainText("Grok STT disconnected");
  expect((await mockLog(page)).length).toBe(3);                  // first try + 2 reconnects
  await page.evaluate(() => window.__fakeSR.last.emit("next slide please", true));
  await expect(page.locator("#counter")).toHaveText("2 / 6");
});

test("refused by the proxy (origin/code): falls back without retrying", async ({ page }) => {
  await open(page);
  await useGrok(page, "refuse");
  await page.click("#listen");
  await expect(page.locator("#engine-chip")).toHaveText("Fallback: Browser", { timeout: 10000 });
  await expect(page.locator("#voice-msg")).toContainText("refused");
  expect((await mockLog(page)).length).toBe(1);
});

test("proxy unreachable and no browser recognition: manual control", async ({ page }) => {
  await open(page, { fakeSpeech: false, noSpeech: true });
  await useGrok(page, "basic", { port: 1 });                     // nothing listens on port 1
  await page.click("#listen");
  await expect(page.locator("#engine-chip")).toHaveText("Manual only", { timeout: 10000 });
  await expect(page.locator("#mic-status")).toHaveText("Manual");
  await expect(page.locator("#voice-msg")).toContainText("use Next/Back");
  await expect(page.locator("#live-dot")).toBeHidden();
  await page.click("#next");
  await expect(page.locator("#counter")).toHaveText("2 / 6");
});
