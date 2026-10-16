/* SpeakEasy recognizer: xAI Grok streaming speech-to-text, through your own proxy.
 *
 * Protocol (docs.x.ai, "Speech to Text" → "Streaming Speech-to-Text (WebSocket)",
 * page last updated Oct 10 2026):
 *   - Endpoint wss://api.x.ai/v1/stt, configured only by URL query parameters.
 *   - Client sends raw binary audio frames (PCM16 at sample_rate, ~100 ms each),
 *     then {"type":"audio.done"} to finish.
 *   - Server sends JSON events:
 *       transcript.created  – ready; wait for it before sending audio
 *       transcript.partial  – { text, words, is_final, speech_final, start, duration }
 *                             is_final=false  interim (text may change)
 *                             is_final=true, speech_final=false  chunk final (text locked)
 *                             is_final=true, speech_final=true   utterance final ("complete stitched utterance")
 *       transcript.done     – after audio.done; connection then closes
 *       error               – { message }; most errors close the connection
 *   - The API key must never reach the browser: docs say to proxy the WebSocket through
 *     your backend. This adapter only ever talks to that proxy (see worker/).
 *
 * Everything the docs don't pin down is marked TODO(xai-verify) below.
 */
(function () {
  var R = window.SpeakEasyRecognizers = window.SpeakEasyRecognizers || {};

  var DEFAULTS = {
    model: "grok-voice-transcribe-2.0",
    sampleRate: 16000,
    chunkMs: 100,
    endpointing: 250,      // ms of silence before an utterance-final event (docs: 0–5000, default 400)
    hangoverMs: 800,       // keep sending this long after speech drops below the gate; must exceed endpointing
    prerollChunks: 2,      // chunks kept from just before the gate opens, so first syllables aren't clipped
    keepaliveMs: 5000,     // TODO(xai-verify): docs don't say whether an idle socket times out; send 100 ms of silence this often while gated
    readyTimeoutMs: 8000,
    maxReconnects: 2
  };
  var MAX_TERMS = 100, MAX_TERM_CHARS = 50;   // docs: "Max 100 terms, each up to 50 characters"

  function words(s) { return String(s || "").trim().split(/\s+/).filter(Boolean); }
  function norm(w) { return String(w).toLowerCase().replace(/[’']/g, "").replace(/[^\p{L}\p{N}]+/gu, ""); }

  // Boost phrases ("keyterm") from script triggers first, then My Phrases.
  // "N" placeholders are dropped, duplicates removed, long phrases cut at a word boundary.
  function keyterms(lists) {
    var out = [], seen = {};
    (lists || []).forEach(function (list) {
      (list || []).forEach(function (p) {
        var ws = words(p).filter(function (w) { return w.toUpperCase() !== "N"; });
        var t = "";
        for (var i = 0; i < ws.length; i++) {
          var next = t ? t + " " + ws[i] : ws[i];
          if (next.length > MAX_TERM_CHARS) break;
          t = next;
        }
        if (!t && ws.length) t = ws[0].slice(0, MAX_TERM_CHARS);
        var k = t.toLowerCase();
        if (!t || seen[k] || out.length >= MAX_TERMS) return;
        seen[k] = 1; out.push(t);
      });
    });
    return out;
  }

  // The proxy URL plus the documented STT query parameters. Any query already on the
  // proxy URL is kept. http(s) is accepted and turned into ws(s).
  function buildUrl(proxyUrl, o) {
    var u = new URL(String(proxyUrl).trim(), location.href);
    if (u.protocol === "https:") u.protocol = "wss:";
    else if (u.protocol === "http:") u.protocol = "ws:";
    if (u.protocol !== "wss:" && u.protocol !== "ws:") throw new Error("The proxy URL must start with wss:// (or https://).");
    var q = u.searchParams;
    q.set("model", o.model || DEFAULTS.model);
    q.set("sample_rate", String(o.sampleRate || DEFAULTS.sampleRate));
    q.set("encoding", "pcm");
    q.set("interim_results", "true");
    q.set("endpointing", String(o.endpointing == null ? DEFAULTS.endpointing : o.endpointing));
    if (o.language) q.set("language", o.language);
    q.delete("keyterm");
    (o.keyterms || []).slice(0, MAX_TERMS).forEach(function (t) { q.append("keyterm", String(t).slice(0, MAX_TERM_CHARS)); });
    if (o.accessCode) q.set("code", o.accessCode); // read and removed by the proxy; never forwarded to xAI
    return u.toString();
  }

  // Turns transcript.partial events into SpeakEasy results with stable keys.
  // TODO(xai-verify): the docs say an utterance-final event carries the "complete stitched
  // utterance", so it can repeat text already locked by chunk-final events. They don't say
  // whether interim text after a chunk final is cumulative too. Either way, any prefix that
  // matches text already committed in this utterance is stripped, so the matcher sees each
  // word once.
  function Segmenter(prefix) {
    this.prefix = prefix || "g0";
    this.seg = 0;
    this.committed = [];
  }
  Segmenter.prototype.strip = function (ws) {
    var c = this.committed;
    if (!c.length || ws.length < c.length) return ws;
    for (var i = 0; i < c.length; i++) if (norm(ws[i]) !== c[i]) return ws;
    return ws.slice(c.length);
  };
  // Returns { key, text, isFinal } or null.
  Segmenter.prototype.push = function (ev) {
    var rest = this.strip(words(ev.text));
    var key = this.prefix + ":" + this.seg;
    if (!ev.is_final) return rest.length ? { key: key, text: rest.join(" "), isFinal: false } : null;
    this.seg++;
    if (ev.speech_final) this.committed = [];
    else this.committed = this.committed.concat(rest.map(norm));
    return rest.length ? { key: key, text: rest.join(" "), isFinal: true } : { key: key, text: "", isFinal: true };
  };

  // Silence gate. level 0 sends everything; 1–10 raises the RMS threshold.
  function gateThreshold(level) { level = Math.max(0, Math.min(10, +level || 0)); return level * 0.0025; }

  function create(opts) {
    var cfg = {};
    Object.keys(DEFAULTS).forEach(function (k) { cfg[k] = opts[k] != null ? opts[k] : DEFAULTS[k]; });
    var noop = function () {};
    var onResult = opts.onResult || noop, onState = opts.onState || noop, onError = opts.onError || noop, onSessionEnd = opts.onSessionEnd || noop;
    var WS = opts.WebSocket || window.WebSocket;
    var threshold = gateThreshold(opts.gate);
    var stream = null, ctx = null, node = null, sink = null, ws = null;
    var running = false, ready = false, sessionN = 0, reconnects = 0, everReady = false;
    var segmenter = null, readyTimer = null, rate = cfg.sampleRate;
    var openUntil = 0, preroll = [], lastSent = 0, sending = false;
    var stats = { chunks: 0, sent: 0, bytes: 0 };

    function fatal(code, message, extra) {
      if (!running) return;
      var e = { code: code, message: message || code, fatal: true };
      if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
      teardown(false);
      onError(e);
    }
    function setSending(on) {
      if (on === sending) return;
      sending = on;
      onState(on ? "sending" : "gated");
    }
    function send(buf) {
      if (!ws || ws.readyState !== 1 || !ready) return false;
      ws.send(buf); stats.sent++; stats.bytes += buf.byteLength; lastSent = Date.now();
      return true;
    }
    function onChunk(pcm, rms) {
      stats.chunks++;
      var now = Date.now();
      var loud = rms >= threshold;
      if (loud) openUntil = now + cfg.hangoverMs;
      if (now < openUntil) {
        if (!sending) { while (preroll.length) send(preroll.shift()); }
        setSending(true);
        send(pcm);
      } else {
        setSending(false);
        preroll.push(pcm);
        if (preroll.length > cfg.prerollChunks) preroll.shift();
        if (cfg.keepaliveMs && ready && now - lastSent >= cfg.keepaliveMs) send(new ArrayBuffer(pcm.byteLength)); // zeros = silence
      }
    }
    function connect() {
      var url;
      try {
        url = buildUrl(opts.proxyUrl, {
          model: cfg.model, sampleRate: rate, endpointing: cfg.endpointing,
          language: opts.language, keyterms: opts.keyterms, accessCode: opts.accessCode
        });
      } catch (e) { fatal("bad-proxy-url", e.message); return; }
      ready = false;
      segmenter = new Segmenter("g" + (++sessionN));
      try { ws = new WS(url); } catch (e) { fatal("connect-failed", e && e.message); return; }
      ws.binaryType = "arraybuffer";
      clearTimeout(readyTimer);
      readyTimer = setTimeout(function () { if (running && !ready) fatal("connect-timeout", "Grok STT didn't answer in time."); }, cfg.readyTimeoutMs);
      ws.onmessage = function (m) {
        if (typeof m.data !== "string") return;
        var ev; try { ev = JSON.parse(m.data); } catch (e) { return; }
        if (ev.type === "transcript.created") {
          ready = true; everReady = true; clearTimeout(readyTimer);
          onState("listening", { recovered: reconnects > 0 });
        } else if (ev.type === "transcript.partial") {
          var r = segmenter.push(ev);
          if (r && r.text) onResult(r.key, r.text, r.isFinal);
        } else if (ev.type === "error") {
          // Most server errors close the socket; onclose decides what happens next.
          lastServerError = ev.message || "error";
        }
      };
      ws.onclose = function (ev) {
        clearTimeout(readyTimer);
        var wasReady = ready;
        ready = false; ws = null;
        onSessionEnd();
        if (!running) return;
        var why = lastServerError || (ev && ev.reason) || "";
        lastServerError = "";
        // Proxy rejections (bad origin or access code) arrive as close codes 4001/4003.
        if (ev && (ev.code === 4001 || ev.code === 4003)) { fatal("unauthorized", why || "The proxy refused this page."); return; }
        if (wasReady && reconnects < cfg.maxReconnects) {
          reconnects++;
          onState("reconnecting", { code: "disconnected" });
          setTimeout(function () { if (running) connect(); }, 400 * reconnects);
          return;
        }
        fatal(everReady ? "disconnected" : "connect-failed", why || (everReady ? "Grok STT disconnected." : "Couldn't reach the Grok STT proxy."), { closeCode: ev && ev.code });
      };
      ws.onerror = function () { /* onclose follows with the details */ };
    }
    var lastServerError = "";

    function teardown(graceful) {
      running = false;
      clearTimeout(readyTimer);
      if (ws) {
        var s = ws; ws = null;
        try {
          if (graceful && s.readyState === 1) { s.send(JSON.stringify({ type: "audio.done" })); setTimeout(function () { try { s.close(1000); } catch (e) {} }, 300); }
          else s.close(1000);
        } catch (e) {}
      }
      if (node) { try { node.port.onmessage = null; node.disconnect(); } catch (e) {} node = null; }
      if (sink) { try { sink.disconnect(); } catch (e) {} sink = null; }
      if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
      if (ctx) { try { ctx.close(); } catch (e) {} ctx = null; }
      sending = false; preroll = [];
      onState("stopped");
    }

    return {
      name: "grok",
      stats: stats,
      start: function () {
        if (running) return;
        running = true; reconnects = 0;
        onState("starting");
        if (!opts.proxyUrl) { fatal("no-proxy", "Add your proxy URL in Voice settings."); return; }
        if (!window.AudioWorkletNode || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { fatal("unsupported", "This browser can't stream microphone audio."); return; }
        // Ask for the mic within the user's tap (iPhone requires this), before any awaits.
        var mic = navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        var AC = window.AudioContext || window.webkitAudioContext;
        try { ctx = new AC(); } catch (e) { fatal("unsupported", "Audio isn't available here."); return; }
        if (ctx.resume) ctx.resume();
        mic.then(function (s) {
          if (!running) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
          stream = s;
          return ctx.audioWorklet.addModule(opts.workletUrl || "js/recognizers/pcm-worklet.js").then(function () {
            if (!running) return;
            var src = ctx.createMediaStreamSource(stream);
            node = new AudioWorkletNode(ctx, "speakeasy-pcm", { processorOptions: { targetRate: cfg.sampleRate, chunkMs: cfg.chunkMs } });
            sink = ctx.createGain(); sink.gain.value = 0;   // keeps the graph pulling audio; outputs nothing
            src.connect(node); node.connect(sink); sink.connect(ctx.destination);
            var formatSeen = false;
            node.port.onmessage = function (m) {
              var d = m.data;
              if (d.type === "format") { rate = d.sampleRate; if (!formatSeen) { formatSeen = true; connect(); } }
              else if (d.type === "chunk") onChunk(d.pcm, d.rms);
            };
          });
        }).catch(function (e) {
          var n = e && e.name;
          if (n === "NotAllowedError" || n === "SecurityError") fatal("not-allowed", "Microphone access is blocked.");
          else if (n === "NotFoundError" || n === "OverconstrainedError") fatal("audio-capture", "No microphone found.");
          else if (n === "NotReadableError") fatal("audio-capture", "The microphone is busy in another app.");
          else fatal("audio-failed", (e && e.message) || "Couldn't start audio.");
        });
      },
      stop: function () { if (running) teardown(true); },
      abort: function () { if (running) teardown(false); }
    };
  }

  R.grok = {
    name: "grok",
    label: "Grok STT",
    supported: function () { return !!(window.WebSocket && window.AudioWorkletNode && navigator.mediaDevices); },
    create: create,
    // exposed for tests
    buildUrl: buildUrl, keyterms: keyterms, Segmenter: Segmenter, gateThreshold: gateThreshold, DEFAULTS: DEFAULTS
  };
})();
