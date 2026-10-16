/* Pure helpers for the SpeakEasy STT proxy (unit-tested in tests/worker.test.mjs). */

export const XAI_STT_URL = "https://api.x.ai/v1/stt"; // Workers open outbound WebSockets with an https:// URL plus an Upgrade header
export const DEFAULT_MODEL = "grok-voice-transcribe-2.0";
export const MAX_TERMS = 100;
export const MAX_TERM_CHARS = 50;

// Query parameters documented for wss://api.x.ai/v1/stt (docs.x.ai, Speech to Text, streaming).
// Anything else the browser sends is dropped.
const ALLOWED = {
  sample_rate: (v) => /^\d{4,5}$/.test(v),
  encoding: (v) => ["pcm", "mulaw", "alaw", "opus"].includes(v),
  interim_results: (v) => v === "true" || v === "false",
  endpointing: (v) => /^\d{1,4}$/.test(v) && +v <= 5000,
  language: (v) => /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(v),
  format: (v) => v === "true" || v === "false",
  filler_words: (v) => v === "true" || v === "false",
  smart_turn: (v) => /^(0(\.\d+)?|1(\.0+)?)$/.test(v),
  smart_turn_timeout: (v) => /^\d{1,4}$/.test(v) && +v >= 1 && +v <= 5000,
  vad_threshold: (v) => /^(0(\.\d+)?|1(\.0+)?)$/.test(v),
};

export function parseOrigins(s) {
  return String(s || "").split(",").map((x) => x.trim().replace(/\/+$/, "")).filter(Boolean);
}

// Browsers always send Origin on WebSocket handshakes. "*" allows any origin (not recommended).
export function originAllowed(origin, allowedList) {
  const list = parseOrigins(allowedList);
  if (!list.length) return false;
  if (list.includes("*")) return true;
  return !!origin && list.includes(origin.replace(/\/+$/, ""));
}

// Constant-time-ish comparison so the access code can't be guessed byte by byte from timing.
export function codeOk(given, expected) {
  if (!expected) return true;
  const a = String(given || ""), b = String(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

// Builds the upstream xAI URL from the browser's request: only documented parameters,
// a fixed model, at most 100 keyterms of 50 characters, and never the access code.
export function upstreamUrl(requestUrl, env = {}) {
  const inUrl = new URL(requestUrl);
  const out = new URL(env.XAI_STT_URL || XAI_STT_URL);
  out.searchParams.set("model", env.XAI_STT_MODEL || DEFAULT_MODEL);
  for (const [k, v] of inUrl.searchParams) {
    if (k === "keyterm" || k === "model" || k === "code") continue;
    if (ALLOWED[k] && ALLOWED[k](v) && !out.searchParams.has(k)) out.searchParams.set(k, v);
  }
  const terms = inUrl.searchParams.getAll("keyterm")
    .map((t) => t.trim().slice(0, MAX_TERM_CHARS))
    .filter(Boolean)
    .slice(0, MAX_TERMS);
  for (const t of terms) out.searchParams.append("keyterm", t);
  return out.toString();
}
