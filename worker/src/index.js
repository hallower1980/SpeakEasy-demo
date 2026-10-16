/* SpeakEasy STT proxy: a Cloudflare Worker that relays a browser WebSocket to
 * xAI's streaming speech-to-text (wss://api.x.ai/v1/stt) with your API key added
 * on the server. The key lives only in the Worker secret XAI_API_KEY.
 *
 * Browser  --ws-->  this Worker  --wss + Authorization: Bearer XAI_API_KEY-->  api.x.ai/v1/stt
 *
 * Vars (wrangler.toml [vars]):   ALLOWED_ORIGINS  comma-separated page origins allowed to connect
 * Secrets (wrangler secret put): XAI_API_KEY      required
 *                                ACCESS_CODE      optional shared code the page must send (?code=)
 */
import { originAllowed, codeOk, upstreamUrl } from "./proxy.js";

const MAX_SESSION_MS = 3 * 60 * 60 * 1000; // hard stop after 3 hours, to cap a forgotten tab

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return new Response("ok", { headers: { "content-type": "text/plain" } });
    if (url.pathname !== "/stt") return new Response("Not found", { status: 404 });
    if ((request.headers.get("Upgrade") || "").toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }
    if (!env.XAI_API_KEY) return new Response("Proxy not configured (XAI_API_KEY missing)", { status: 500 });

    const origin = request.headers.get("Origin") || "";
    const allowed = originAllowed(origin, env.ALLOWED_ORIGINS);
    const authorized = codeOk(url.searchParams.get("code"), env.ACCESS_CODE);

    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    server.accept();

    // Reject after the handshake so the browser gets a readable close code:
    // 4003 = origin not allowed, 4001 = wrong access code.
    if (!allowed || !authorized) {
      server.close(allowed ? 4001 : 4003, allowed ? "Access code required" : "Origin not allowed");
      return new Response(null, { status: 101, webSocket: client });
    }

    let upstream;
    try {
      const res = await fetch(upstreamUrl(request.url, env), {
        headers: { Upgrade: "websocket", Authorization: `Bearer ${env.XAI_API_KEY}` },
      });
      upstream = res.webSocket;
      if (!upstream) {
        server.close(1011, `Upstream refused (${res.status})`);
        return new Response(null, { status: 101, webSocket: client });
      }
    } catch (e) {
      server.close(1011, "Upstream unreachable");
      return new Response(null, { status: 101, webSocket: client });
    }
    upstream.accept();

    const closeBoth = (code, reason) => {
      try { server.close(code, reason); } catch (e) {}
      try { upstream.close(code, reason); } catch (e) {}
    };
    const timer = setTimeout(() => closeBoth(1000, "Session time limit"), MAX_SESSION_MS);

    // Binary audio frames and JSON control messages pass through unchanged, both ways.
    server.addEventListener("message", (ev) => { try { upstream.send(ev.data); } catch (e) { closeBoth(1011, "Upstream send failed"); } });
    upstream.addEventListener("message", (ev) => { try { server.send(ev.data); } catch (e) {} });
    server.addEventListener("close", (ev) => { clearTimeout(timer); try { upstream.close(safeCode(ev.code), ev.reason); } catch (e) {} });
    upstream.addEventListener("close", (ev) => { clearTimeout(timer); try { server.close(safeCode(ev.code), ev.reason); } catch (e) {} });
    server.addEventListener("error", () => closeBoth(1011, "Client error"));
    upstream.addEventListener("error", () => closeBoth(1011, "Upstream error"));

    return new Response(null, { status: 101, webSocket: client });
  },
};

// close() only accepts 1000 or 3000–4999.
function safeCode(code) { return code === 1000 || (code >= 3000 && code <= 4999) ? code : 1000; }
