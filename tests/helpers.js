const { expect } = require("@playwright/test");

// A scriptable stand-in for the Web Speech API, so the Browser engine can be tested headless.
function fakeSpeechInit() {
  window.__fakeSR = { instances: [] };
  class FakeSR {
    constructor() { this.list = []; this.lang = ""; window.__fakeSR.instances.push(this); window.__fakeSR.last = this; }
    start() { this.running = true; setTimeout(() => this.onstart && this.onstart(), 5); }
    stop() { this.running = false; setTimeout(() => this.onend && this.onend(), 5); }
    abort() { this.stop(); }
    emit(text, isFinal) {
      const r = { 0: { transcript: text }, length: 1, isFinal: !!isFinal };
      this.list.push(r);
      const results = Object.assign({}, this.list, { length: this.list.length });
      this.onresult && this.onresult({ resultIndex: this.list.length - 1, results });
    }
  }
  window.SpeechRecognition = FakeSR;
  window.webkitSpeechRecognition = FakeSR;
}

async function open(page, { fakeSpeech = true, noSpeech = false } = {}) {
  if (fakeSpeech) await page.addInitScript(fakeSpeechInit);
  if (noSpeech) await page.addInitScript(() => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; });
  page.on("dialog", (d) => { throw new Error("Unexpected dialog: " + d.message()); });
  await page.goto("/index.html");
  await expect(page.locator("#tab-script")).toBeVisible();
}
async function present(page) { await page.click("#tab-present"); }
async function hear(page, text) { await page.evaluate((t) => window.cueHear(t), text); }
async function slide(page) { return (await page.locator("#counter").textContent()).trim(); }

module.exports = { open, present, hear, slide, fakeSpeechInit };
