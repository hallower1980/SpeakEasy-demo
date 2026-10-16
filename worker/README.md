# SpeakEasy STT proxy (Cloudflare Worker)

A tiny WebSocket proxy between the SpeakEasy page and xAI streaming speech-to-text
(`wss://api.x.ai/v1/stt`). It exists so that the API key never reaches the browser.
This follows the xAI docs' advice to proxy STT WebSockets through your own backend.

What it does:

- Accepts `wss://<worker>/stt?...` only from origins in `ALLOWED_ORIGINS`. Others are
  closed with code 4003.
- If `ACCESS_CODE` is set, checks the `code` query parameter. A wrong code closes
  with 4001.
- Forwards only the documented STT query parameters. It forces the model
  (`grok-voice-transcribe-2.0`, override with `XAI_STT_MODEL`), caps keyterms at
  100 × 50 chars, and drops `code`.
- Pipes frames both ways and adds `Authorization: Bearer $XAI_API_KEY` upstream.
  Sessions are capped at 3 hours.
- Stores nothing and logs no audio or transcripts.
- `GET /health` returns `ok`.

## Deploy

Wrangler 4 needs Node.js 22 or newer.

```bash
cd worker
npm install
npx wrangler login
npx wrangler secret put XAI_API_KEY      # paste your xAI API key
npx wrangler secret put ACCESS_CODE      # optional: shared code for your presenters
# edit ALLOWED_ORIGINS in wrangler.toml (comma-separated page origins, no trailing slash)
npx wrangler deploy
```

In SpeakEasy, open **Voice settings**, set the engine to **Grok STT**, set the proxy URL
to `wss://speakeasy-stt.<your-account>.workers.dev/stt`, and enter the access code if
you set one.

For local dev, put `XAI_API_KEY=...` in `worker/.dev.vars` (it's git-ignored) and run
`npx wrangler dev`.

Unit tests for the URL, origin, and code helpers: `npm run test:worker` from the repo
root.
