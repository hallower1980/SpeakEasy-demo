# SpeakEasy 1.1 Demo

SpeakEasy is a live presentation assistant. Load your slides (PDF or images), write
your script, and mark trigger phrases. While you present, SpeakEasy listens and
advances the slides when it hears a trigger. A separate audience window mirrors the
current slide.

It's a static web app with no build step: plain HTML, CSS, and JS, self-hosted fonts,
and a service worker so it works offline after the first visit.

## What's in 1.1

- **One real `index.html`** plus small `css/`, `js/`, `fonts/`, `icons/`, and `assets/`
  folders. The old base64 loader and `app*.txt` chunks are gone.
- **Installable / offline:** `manifest.webmanifest` and `sw.js` (stale-while-revalidate,
  with an offline app shell).
- **Your work persists:** the script and triggers are saved in `localStorage`
  (`speakeasy.script.v1`), and voice settings in `speakeasy.settings.v1`.
- **Presenting:**
  - Type a number and press Enter to jump to that slide.
  - Press `B` or `.` to black out the screen.
  - Undo covers jumps and blackouts.
  - A trigger held back by a cooldown now says so instead of failing silently.
  - Choosing "Go to slide" uses an inline number field instead of `prompt()`.
- **Lighter audience sync:** unchanged state isn't re-sent, and canvas frames go as
  JPEG at up to 8 fps.
- **Selectable recognition language.**
- **Voice engines:**
  - **Browser** (default): the Web Speech API. Free, but needs Chrome, Edge, or Safari.
  - **Grok STT:** streams 16 kHz PCM through your own proxy to xAI streaming
    speech-to-text, with interim results, about 250 ms endpointing, and **keyterm
    boosting** from your triggers and "My phrases".
  - A status chip shows the active engine. If Grok fails, SpeakEasy falls back
    automatically to Browser, and then to **Manual only** (keys, clicker, and buttons
    always work).

## Run it locally

```bash
npm install          # only needed for the tests and the dev server
npm start            # http://localhost:4317
```

Any static server works, for example `python3 -m http.server`. Mic access needs `localhost`
or HTTPS.

## Tests

```bash
npx playwright install chromium    # or point at an installed Chrome:
CHROME_PATH=/usr/bin/google-chrome npm test
npm run test:worker                # Worker unit tests (node --test)
```

The Playwright suite drives the real page with a fake `SpeechRecognition` and a
fake microphone. The Grok STT tests run against a **mock** xAI STT WebSocket in
`tests/server.mjs`, which covers interim → final stitching, dropped connections,
refused auth, and the silence gate.

## Deploy

The app is static, so deploy the repo root as-is.

- **GitHub Pages:** Settings → Pages → deploy from branch → `/ (root)`.
- **Cloudflare Pages:** create a project from this repo with framework "None", no build
  command, and output directory `/`. Or upload it directly:
  `npx wrangler pages deploy . --project-name speakeasy`.
- **grok.me (Grok apps):** import or publish the same static files from Grok Build.
  Mic access needs the app to run on its own HTTPS origin. If the embedded preview
  blocks the microphone, open the published URL directly.

Then, for the Grok STT engine only, deploy the proxy (see `worker/README.md`). Add the
app's origin to `ALLOWED_ORIGINS`, and paste the proxy URL into **Voice settings → Proxy
URL**. For example: `wss://speakeasy-stt.<your-account>.workers.dev/stt`.

## Privacy

- **Browser engine:** audio is handled by your browser's speech service. In Chrome
  that means Google's servers. SpeakEasy itself doesn't send audio anywhere.
- **Grok STT engine:** mic audio is streamed through *your* Worker to xAI for
  transcription. Neither SpeakEasy nor the proxy stores it.
  - Per xAI's API docs, xAI doesn't train on API inputs or outputs. By default it keeps
    requests encrypted for up to 30 days for abuse auditing.
  - To avoid that retention, enable **Zero Data Retention** for the xAI team that owns
    the key.
  - A silence gate stops sending audio when you're quiet. This also saves cost
    (about $0.20 per streamed hour at the time of writing).
- **No API key ever reaches the browser.** `XAI_API_KEY` is a Worker secret. You can
  optionally require an access code (`ACCESS_CODE`). Note that it travels as a query
  parameter to the Worker, and the Worker strips it before calling xAI.
- Slides, script, and settings stay in your browser (`localStorage` / memory).
- The audience window only talks to this page's own origin.

## Known limits / to verify against the live API

These parts of the xAI protocol are isolated in `js/recognizers/grok-stt.js` and
marked `TODO(xai-verify)`:

- Whether interim text after a chunk final is cumulative. The segmenter handles both
  cases.
- Whether idle sockets time out. The client sends 100 ms of silence every 5 s as a
  keepalive while gated.

Fonts: Geist and Geist Mono, under the SIL Open Font License (`fonts/OFL.txt`).
