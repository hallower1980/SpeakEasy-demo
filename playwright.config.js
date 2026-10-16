// Playwright config. Run: npm test (installs nothing global; see README).
// Set CHROME_PATH to use an installed Chrome instead of Playwright's bundled Chromium.
const { defineConfig } = require("@playwright/test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const PORT = +(process.env.PORT || 4317);

// A fake microphone: 0.6 s of tone, then 3.4 s of silence, looped by Chrome.
// Generated at load time so no audio binary lives in the repo.
function fakeMicWav() {
  const file = path.join(os.tmpdir(), "speakeasy-fake-mic.wav");
  const rate = 16000, secs = 4, n = rate * secs;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = i < rate * 0.6 ? Math.sin(2 * Math.PI * 440 * i / rate) * 0.3 : 0;
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
  return file;
}

module.exports = defineConfig({
  testDir: "tests",
  testMatch: /.*\.spec\.js/,
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1280, height: 900 },
    permissions: ["microphone"],
    launchOptions: {
      executablePath: process.env.CHROME_PATH || undefined,
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        `--use-file-for-fake-audio-capture=${fakeMicWav()}`,
        "--autoplay-policy=no-user-gesture-required",
      ],
    },
  },
  webServer: {
    command: `node tests/server.mjs`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: false,
    env: { PORT: String(PORT) },
  },
});
