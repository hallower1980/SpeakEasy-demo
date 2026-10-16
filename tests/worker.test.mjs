// Unit tests for the Cloudflare Worker proxy's request handling (run with node --test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { upstreamUrl, originAllowed, codeOk, parseOrigins } from "../worker/src/proxy.js";

test("upstream URL keeps only documented parameters and forces the model", () => {
  const u = new URL(upstreamUrl("https://p.example/stt?model=evil&sample_rate=16000&encoding=pcm&interim_results=true&endpointing=250&language=en&code=secret&foo=bar&endpointing=999999&keyterm=next%20slide&keyterm=go%20back", {}));
  assert.equal(u.origin + u.pathname, "https://api.x.ai/v1/stt");
  assert.equal(u.searchParams.get("model"), "grok-voice-transcribe-2.0");
  assert.equal(u.searchParams.get("sample_rate"), "16000");
  assert.equal(u.searchParams.get("encoding"), "pcm");
  assert.equal(u.searchParams.get("interim_results"), "true");
  assert.equal(u.searchParams.get("endpointing"), "250");
  assert.equal(u.searchParams.get("language"), "en");
  assert.equal(u.searchParams.get("code"), null, "access code is never forwarded");
  assert.equal(u.searchParams.get("foo"), null);
  assert.deepEqual(u.searchParams.getAll("keyterm"), ["next slide", "go back"]);
});

test("rejects out-of-range values and caps keyterms at 100 × 50 chars", () => {
  const q = new URLSearchParams({ endpointing: "9000", encoding: "mp3", language: "english!!" });
  for (let i = 0; i < 120; i++) q.append("keyterm", "x".repeat(80) + i);
  const u = new URL(upstreamUrl("https://p.example/stt?" + q, {}));
  assert.equal(u.searchParams.get("endpointing"), null);
  assert.equal(u.searchParams.get("encoding"), null);
  assert.equal(u.searchParams.get("language"), null);
  const terms = u.searchParams.getAll("keyterm");
  assert.equal(terms.length, 100);
  assert.ok(terms.every((t) => t.length <= 50));
});

test("model and endpoint can be overridden only from the Worker's own env", () => {
  const u = new URL(upstreamUrl("https://p.example/stt", { XAI_STT_MODEL: "grok-voice-transcribe-1.0", XAI_STT_URL: "https://us.example/v1/stt" }));
  assert.equal(u.searchParams.get("model"), "grok-voice-transcribe-1.0");
  assert.equal(u.host, "us.example");
});

test("origin allow-list", () => {
  assert.deepEqual(parseOrigins(" https://a.example/, https://b.example "), ["https://a.example", "https://b.example"]);
  assert.equal(originAllowed("https://a.example", "https://a.example,https://b.example"), true);
  assert.equal(originAllowed("https://evil.example", "https://a.example"), false);
  assert.equal(originAllowed("", "https://a.example"), false);
  assert.equal(originAllowed("https://x.example", ""), false, "empty list allows nothing");
  assert.equal(originAllowed("https://x.example", "*"), true);
});

test("access code", () => {
  assert.equal(codeOk(null, undefined), true, "no code configured");
  assert.equal(codeOk("abc", "abc"), true);
  assert.equal(codeOk("abd", "abc"), false);
  assert.equal(codeOk("", "abc"), false);
  assert.equal(codeOk("abcd", "abc"), false);
});
