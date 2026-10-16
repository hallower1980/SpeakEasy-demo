// Test server: serves the app and a mock of the xAI streaming STT WebSocket
// (same event shapes as docs.x.ai: transcript.created / transcript.partial / transcript.done).
// The browser connects to ws://127.0.0.1:PORT/mock-stt?scenario=... as if it were the proxy.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.env.PORT || 4317);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png",
  ".webp": "image/webp", ".woff2": "font/woff2", ".txt": "text/plain" };

let log = [];

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/mock-log") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(log)); return; }
  if (url.pathname === "/mock-reset") { log = []; res.end("ok"); return; }
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || /[\\/](node_modules|\.git|tests|worker)[\\/]/.test(file.slice(ROOT.length))) { res.writeHead(404); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(data);
  });
});

const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname !== "/mock-stt") { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => handle(ws, url));
});

const partial = (text, is_final, speech_final) => JSON.stringify({ type: "transcript.partial", text, words: [], is_final, speech_final, start: 0, duration: 1 });

function handle(ws, url) {
  const scenario = url.searchParams.get("scenario") || "basic";
  const entry = { scenario, query: [...url.searchParams.entries()], frames: 0, frameSizes: {}, json: [], closedBy: null };
  log.push(entry);
  const sendLater = (ms, msg) => setTimeout(() => { if (ws.readyState === 1) ws.send(msg); }, ms);

  if (scenario === "refuse") { ws.close(4003, "Origin not allowed"); return; }
  ws.send(JSON.stringify({ type: "transcript.created" }));

  ws.on("message", (data, isBinary) => {
    if (!isBinary) {
      entry.json.push(String(data));
      try { if (JSON.parse(String(data)).type === "audio.done") { ws.send(JSON.stringify({ type: "transcript.done", text: "", duration: 0 })); ws.close(1000); } } catch (e) {}
      return;
    }
    entry.frames++;
    entry.frameSizes[data.length] = (entry.frameSizes[data.length] || 0) + 1;
    if (entry.frames !== 3) return;
    if (scenario === "basic") {
      sendLater(0, partial("next slide", false, false));
      sendLater(60, partial("next slide please", true, false));
      sendLater(120, partial("next slide please", true, true)); // stitched utterance repeats the chunk
    } else if (scenario === "stitched") {
      sendLater(0, partial("today I want to talk about something every one of us", true, false));
      sendLater(60, partial("has seen go", false, false));
      sendLater(120, partial("today I want to talk about something every one of us has seen go wrong", true, true));
    } else if (scenario === "drop") {
      entry.closedBy = "server"; ws.close(1011, "Upstream error");
    }
  });
}

server.listen(PORT, "127.0.0.1", () => console.log(`SpeakEasy test server on http://127.0.0.1:${PORT}`));
