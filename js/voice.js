    
      (function () {
        function SLIDES() { return window.cueDeck.count(); }
        function MEDIA() { return window.cueDeck.media(); }
        var ACTIONS = [
          ["next", "Next slide"], ["prev", "Previous slide"], ["goto", "Go to slide"],
          ["play", "Go to slide and play video"], ["pause", "Pause media"],
          ["last", "Go to last slide"], ["blackout", "Toggle blackout"], ["undo", "Undo last action"]
        ];
        var DEFAULTS = [
          { phrase: "next slide please", action: "next", slide: null },
          { phrase: "go back one", action: "prev", slide: null },
          { phrase: "jump to slide N", action: "goto", slide: null },
          { phrase: "skip to the video", action: "play", slide: 4 },
          { phrase: "back to the beginning", action: "goto", slide: 1 },
          { phrase: "skip to the end", action: "last", slide: null },
          { phrase: "pause that", action: "pause", slide: null },
          { phrase: "black screen", action: "blackout", slide: null },
          { phrase: "undo that", action: "undo", slide: null }
        ];
        var KEY = "speakeasy.phrases.v2";
        function copy(a) { return a.map(function (p) { return { phrase: p.phrase, action: p.action, slide: p.slide == null ? null : p.slide }; }); }
        function valid(a) { return Array.isArray(a) && a.every(function (p) { return p && typeof p.phrase === "string" && ACTIONS.some(function (x) { return x[0] === p.action; }); }); }
        var stored = null;
        try { stored = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
        window.cuePhrases = valid(stored) ? copy(stored) : copy(DEFAULTS);
        function save() { try { localStorage.setItem(KEY, JSON.stringify(window.cuePhrases)); } catch (e) {} }

        // ---------- My Phrases table ----------
        var rows = document.getElementById("phrase-rows");
        var pmsg = document.getElementById("phrase-msg");
        function needsSlide(a) { return a === "goto"; }
        function renderPhrases(focusLast) {
          rows.textContent = "";
          window.cuePhrases.forEach(function (p, i) {
            var tr = document.createElement("tr");
            var th = document.createElement("th"); th.scope = "row";
            var inp = document.createElement("input");
            inp.className = "x-input"; inp.type = "text"; inp.value = p.phrase;
            inp.setAttribute("aria-label", "Phrase " + (i + 1));
            inp.placeholder = "Say this…";
            inp.addEventListener("input", function () { p.phrase = inp.value; save(); });
            th.appendChild(inp); tr.appendChild(th);

            var td1 = document.createElement("td");
            var sel = document.createElement("select");
            sel.className = "x-input"; sel.setAttribute("aria-label", "Action for phrase " + (i + 1));
            ACTIONS.forEach(function (a) {
              var o = document.createElement("option"); o.value = a[0]; o.textContent = a[1];
              if (a[0] === p.action) o.selected = true;
              sel.appendChild(o);
            });
            td1.appendChild(sel); tr.appendChild(td1);

            var td2 = document.createElement("td");
            var num = document.createElement("input");
            num.className = "x-input x-input--num"; num.type = "number"; num.min = 1; num.max = SLIDES();
            num.setAttribute("aria-label", "Slide for phrase " + (i + 1));
            function syncSlide() {
              var on = needsSlide(p.action);
              num.disabled = !on;
              num.value = on && p.slide ? p.slide : (p.action === "play" && MEDIA() ? MEDIA() : "");
              num.placeholder = p.action === "goto" ? "N" : "—";
              num.title = p.action === "play" ? "Follows the attached media" : "";
            }
            syncSlide();
            num.addEventListener("input", function () {
              var v = parseInt(num.value, 10);
              p.slide = v >= 1 && v <= SLIDES() ? v : null; save();
            });
            sel.addEventListener("change", function () {
              p.action = sel.value;
              if (!needsSlide(p.action)) p.slide = null;
              syncSlide(); save();
            });
            td2.appendChild(num); tr.appendChild(td2);

            var td3 = document.createElement("td");
            var del = document.createElement("button");
            del.className = "x-small"; del.type = "button"; del.textContent = "Delete";
            del.setAttribute("aria-label", "Delete phrase " + (i + 1));
            del.addEventListener("click", function () {
              window.cuePhrases.splice(window.cuePhrases.indexOf(p), 1);
              save(); renderPhrases(); pmsg.textContent = "Phrase deleted.";
            });
            td3.appendChild(del); tr.appendChild(td3);
            rows.appendChild(tr);
            if (focusLast && i === window.cuePhrases.length - 1) setTimeout(function () { inp.focus(); }, 0);
          });
        }
        document.getElementById("phrase-add").addEventListener("click", function () {
          window.cuePhrases.push({ phrase: "", action: "next", slide: null });
          save(); renderPhrases(true); pmsg.textContent = "";
        });
        document.getElementById("phrase-reset").addEventListener("click", function () {
          window.cuePhrases.length = 0;
          Array.prototype.push.apply(window.cuePhrases, copy(DEFAULTS));
          save(); renderPhrases(); pmsg.textContent = "Phrases reset to the defaults.";
        });
        document.getElementById("phrase-export").addEventListener("click", function () {
          var blob = new Blob([JSON.stringify(window.cuePhrases, null, 2)], { type: "application/json" });
          var a = document.createElement("a");
          a.href = URL.createObjectURL(blob); a.download = "speakeasy-phrases.json";
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
          pmsg.textContent = "Exported speakeasy-phrases.json.";
        });
        var fileIn = document.getElementById("phrase-import");
        document.getElementById("phrase-import-btn").addEventListener("click", function () { fileIn.click(); });
        fileIn.addEventListener("change", function () {
          var f = fileIn.files && fileIn.files[0];
          if (!f) return;
          var r = new FileReader();
          r.onload = function () {
            var data = null;
            try { data = JSON.parse(r.result); } catch (e) {}
            if (!valid(data)) { pmsg.textContent = "That file isn’t a SpeakEasy phrase export."; return; }
            window.cuePhrases.length = 0;
            Array.prototype.push.apply(window.cuePhrases, copy(data));
            save(); renderPhrases(); pmsg.textContent = "Imported " + data.length + " phrases.";
          };
          r.readAsText(f);
          fileIn.value = "";
        });
        renderPhrases();

        // ---------- Undo ----------
        var undoBtn = document.getElementById("undo");
        var undoStack = [];
        function snapshot() {
          var s = window.cueGetState(); s.armed = window.cueArmed;
          undoStack.push(s);
          if (undoStack.length > 50) undoStack.shift();
          undoBtn.disabled = false;
        }
        function undo() {
          var s = undoStack.pop();
          undoBtn.disabled = !undoStack.length;
          if (!s) return false;
          window.cueSetState(s);
          if (window.cueSequential && typeof s.armed === "number") window.cueArm(s.armed);
          updateReadout();
          return true;
        }
        undoBtn.addEventListener("click", function () { if (undo()) toast("↶ Undone"); });
        ["back", "next", "black"].forEach(function (id) {
          document.getElementById(id).addEventListener("click", snapshot, true);
        });
        ["back", "next"].forEach(function (id) {
          document.getElementById(id).addEventListener("click", function () { lastNav = Date.now(); }, true);
        });
        document.getElementById("media").addEventListener("click", snapshot, true);
        document.addEventListener("keydown", function (e) {
          if (document.getElementById("panel-present").hidden) return;
          var tag = (e.target.tagName || "").toLowerCase();
          if (tag === "textarea" || tag === "input" || tag === "select") return;
          if (e.ctrlKey || e.metaKey || e.altKey) return;
          if (["ArrowRight", "ArrowDown", " ", "PageDown", "ArrowLeft", "ArrowUp", "PageUp"].indexOf(e.key) >= 0) { snapshot(); lastNav = Date.now(); }
          else if (e.key === "b" || e.key === "B" || e.key === ".") snapshot();
          else if (e.key === "Enter" && window.cueDigitsPending && window.cueDigitsPending()) {
            var n = parseInt(window.cueDigitsPending(), 10);
            if (n >= 1 && n <= window.cueDeck.count() && n !== window.cueGetState().slide) { snapshot(); lastNav = Date.now(); }
          }
        }, true);

        // ---------- Toast ----------
        var toastEl = document.getElementById("toast"), toastT = null;
        document.addEventListener("cueplayblocked", function () { toast("This browser blocked autoplay. Tap the video once to play it."); });
        function toast(s) {
          toastEl.textContent = s; toastEl.classList.add("is-on");
          clearTimeout(toastT);
          toastT = setTimeout(function () { toastEl.classList.remove("is-on"); }, 2600);
        }
        window.cueToast = toast;
        window.cueHeldBack = 0;
        function heldBack(text, loud) {
          window.cueHeldBack++;
          if (loud) toast(text);
          var vm = document.getElementById("voice-msg");
          if (vm) vm.textContent = text.replace(/^⏸ /, "");
        }
        document.addEventListener("cuedeckchange", function () { renderPhrases(); updateReadout(); });

        // ---------- How to test card ----------
        var howto = document.getElementById("howto");
        var HOWTO_KEY = "cuespeak.howto.dismissed";
        var seen = false;
        try { seen = localStorage.getItem(HOWTO_KEY) === "1"; } catch (e) {}
        howto.hidden = seen;
        document.getElementById("howto-close").addEventListener("click", function () {
          howto.hidden = true;
          try { localStorage.setItem(HOWTO_KEY, "1"); } catch (e) {}
          document.getElementById("howto-open").focus();
        });
        document.getElementById("howto-open").addEventListener("click", function () {
          howto.hidden = !howto.hidden;
          if (!howto.hidden) howto.scrollIntoView({ block: "nearest", behavior: "smooth" });
        });

        // ---------- Normalizing ----------
        var NUMS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
          eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20 };
        var SOUNDALIKE = { to: 2, too: 2, for: 4, fore: 4, won: 1, ate: 8 };
        // Each word is matched as w (number words become digits) and shown as d (as heard),
        // so a toast reads “every one of us”, not “every 1 of us”.
        function tokens(s) {
          return String(s).toLowerCase().replace(/[’']/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim()
            .split(/\s+/).filter(Boolean).map(function (d) { return { w: NUMS.hasOwnProperty(d) ? String(NUMS[d]) : d, d: d }; });
        }
        function normalize(s) { return tokens(s).map(function (x) { return x.w; }); }
        function numberOf(w) {
          if (/^\d+$/.test(w)) return parseInt(w, 10);
          if (SOUNDALIKE.hasOwnProperty(w)) return SOUNDALIKE[w];
          return null;
        }

        // ---------- Rolling buffer ----------
        // entries: { key, words, final, time, used } ; used = leading words already matched
        var entries = [];
        var IOS_DEDUPE = /iPhone|iPad|iPod/i.test(navigator.userAgent || "") || (/Macintosh/.test(navigator.userAgent || "") && navigator.maxTouchPoints > 1);
        var session = 0, simN = 0;
        var WINDOW_MS = 10000;
        function prune() {
          var now = Date.now();
          entries = entries.filter(function (e) { return !e.final || now - e.time < WINDOW_MS; });
        }
        function upsert(key, text, final) {
          var e = null;
          for (var i = 0; i < entries.length; i++) if (entries[i].key === key) { e = entries[i]; break; }
          var isNew = !e;
          if (!e) { e = { key: key, used: 0 }; entries.push(e); }
          var tk = tokens(text), nw = tk.map(function (x) { return x.w; });
          if (!isNew && e.final && Date.now() - e.time > 1500) { e.used = 0; }
          else if (!isNew && e.used) {
            // same slot, different words (a revision or a reused result index): only keep what still matches
            var kk = 0; while (kk < e.used && kk < nw.length && e.words[kk] === nw[kk]) kk++;
            e.used = kk;
          }
          e.raw = text; e.words = nw; e.disp = tk.map(function (x) { return x.d; }); e.final = final; e.time = Date.now();
          if (isNew && IOS_DEDUPE && key.charAt(0) === "s") {
            // Safari can re-send the whole session so far as one new result: skip the earlier results it repeats
            var sess = key.split(":")[0], pos = 0, prior = entries.filter(function (o) { return o !== e && o.key.split(":")[0] === sess && o.words && o.words.length; });
            prior.forEach(function (o) {
              var L = o.words.length, ok = pos + L <= e.words.length;
              for (var q = 0; ok && q < L; q++) if (e.words[pos + q] !== o.words[q]) ok = false;
              if (ok) pos += L;
            });
            if (pos) e.used = Math.max(e.used, pos);
          }
          if (isNew) {
            entries.forEach(function (o) {
              var sameSession = IOS_DEDUPE && o.key.split(":")[0] === e.key.split(":")[0] && o.key.charAt(0) === "s" && o.key !== e.key;
              if (o === e || !o.words || !o.words.length || (!sameSession && Date.now() - o.time > 2500)) return;
              var k = 0; while (k < o.words.length && k < e.words.length && o.words[k] === e.words[k]) k++;
              if (k === o.words.length || k >= 3) { e.used = Math.max(e.used, Math.min(o.used, k)); if (k === o.words.length) o.used = o.words.length; }
            });
          }
          if (e.used > e.words.length) e.used = e.words.length;
        }
        function buffer() {
          var b = [];
          entries.forEach(function (e) {
            for (var i = e.used; i < e.words.length; i++) b.push({ w: e.words[i], d: (e.disp && e.disp[i]) || e.words[i], e: e, i: i });
          });
          return b;
        }

        // ---------- Matching ----------
        function candidates() {
          var list = [];
          var trig = window.cueTriggers || [];
          trig.forEach(function (t, idx) {
            if (window.cueSequential && idx !== window.cueArmed && idx !== window.cueArmed + 1) return;
            if (!window.cueSequential && t.spent) return;
            list.push({ kind: "script", t: t, idx: idx, tokens: normalize(t.phrase), cooling: coolingDown("s" + t.id) });
          });
          window.cuePhrases.forEach(function (p) {
            var toks = normalize(p.phrase).map(function (w) { return w === "n" ? "#N" : w; });
            if (toks.length) list.push({ kind: "phrase", p: p, tokens: toks, cooling: coolingDown("p" + p.phrase) });
          });
          return list;
        }
        var lastFired = {}, lastNav = 0;
        function coolingDown(key) { return lastFired[key] && Date.now() - lastFired[key] < 3000; }
        function matchAt(toks, b, s, kind) {
          var miss = 0, allowed = kind === "script" && toks.length >= 4 ? 1 : 0, num = null;
          for (var j = 0; j < toks.length; j++) {
            var w = b[s + j].w;
            if (toks[j] === "#N") {
              num = numberOf(w);
              if (num == null) return null;
              continue;
            }
            if (w !== toks[j] && (j === 0 || j === toks.length - 1 || ++miss > allowed)) return null;
          }
          return { start: s, end: s + toks.length - 1, num: num };
        }
        function findBest(b) {
          var best = null;
          candidates().forEach(function (c) {
            var L = c.tokens.length;
            for (var s = 0; s + L <= b.length; s++) {
              var m = matchAt(c.tokens, b, s, c.kind);
              if (!m) continue;
              // a spoken "1" or "2" still being heard may grow into 10–20: wait for more
              if (m.num != null && m.end === b.length - 1 && !b[m.end].e.final && m.num <= 2 && /^\d$/.test(b[m.end].w)) continue;
              m.c = c;
              if (!best || m.end < best.end || (m.end === best.end && L > best.c.tokens.length)) best = m;
              break;
            }
          });
          return best;
        }
        function consume(b, m) {
          var last = b[m.end];
          for (var k = 0; k <= m.end; k++) {
            var e = b[k].e;
            e.used = e === last.e ? last.i + 1 : e.words.length;
          }
        }

        var LABEL = { next: "Next Slide", prev: "Previous Slide", pause: "Pause Media", blackout: "Blackout", undo: "Undo" };
        function fire(m, b) {
          var heard = b.slice(m.start, m.end + 1).map(function (x) { return x.d; }).join(" ");
          var c = m.c, action, slide, label;
          if (c.cooling) {
            // The same cue within 3 s (often a recognizer re-send): held back, and said so.
            heldBack("Held back a repeat of “" + heard + "” (3-second cooldown).", false);
            return;
          }
          if (c.kind === "script") { action = c.t.action; slide = c.t.slide; }
          else { action = c.p.action; slide = c.p.slide; if (action === "goto" && !slide) slide = m.num; }
          if (action === "last") { action = "goto"; slide = SLIDES(); }
          if (action === "play") slide = MEDIA();
          if ((action === "next" || action === "prev") && Date.now() - lastNav < 1200) {
            heldBack("⏸ Held back “" + heard + "” — the slide just changed (1.2-second cooldown)", true);
            return;
          }
          lastFired[c.kind === "script" ? "s" + c.t.id : "p" + c.p.phrase] = Date.now();
          if (action === "goto" && !(slide >= 1 && slide <= SLIDES())) {
            toast("Slide " + slide + " doesn’t exist (deck has " + SLIDES() + ") — heard “" + heard + "”");
            return;
          }
          if (action === "play" && !slide) {
            toast("No media to play — attach one under Deck and media. Heard “" + heard + "”");
            return;
          }
          if (action === "goto") label = "Go to Slide " + slide;
          else if (action === "play") label = "Play Video";
          else label = LABEL[action];
          if (action === "undo") {
            if (!undo()) label = "Nothing to undo";
          } else {
            snapshot();
            window.runCueAction(c.kind === "script" ? c.t : { action: action, slide: slide });
            if (action === "next" || action === "prev") lastNav = Date.now();
            if (c.kind === "script") { c.t.spent = true; if (window.cueSequential) window.cueArm(c.idx + 1); }
            if (c.kind === "phrase" && action === "goto" && slide === 1 && window.cueSequential) { window.cueArm(0); (window.cueTriggers || []).forEach(function (x) { x.spent = false; }); }
          }
          toast("✓ " + label + " — heard “" + heard + "”");
          updateReadout();
        }
        function process() {
          prune();
          for (var guard = 0; guard < 10; guard++) {
            var b = buffer();
            var m = findBest(b);
            if (!m) break;
            consume(b, m);
            fire(m, b);
          }
          checkNear();
          showTranscript();
        }
        window.cueHear = function (text) { upsert("sim" + (++simN), text, true); process(); };

        // ---------- Readout, near-trigger glow, transcript ----------
        var readout = document.getElementById("readout");
        var transcriptEl = document.getElementById("transcript");
        var nearT = null;
        function armedTrigger() {
          var trig = window.cueTriggers || [];
          return window.cueSequential ? trig[window.cueArmed] || null : null;
        }
        function updateReadout() {
          var trig = window.cueTriggers || [];
          var t = armedTrigger();
          if (!trig.length) readout.textContent = "Next trigger: none — add some on the Script tab";
          else if (!window.cueSequential) readout.textContent = "Next trigger: any of " + trig.length + " script triggers";
          else if (!t) readout.textContent = "Next trigger: script complete — Undo to re-arm the last one";
          else readout.textContent = "Next trigger: “" + t.phrase + "”";
        }
        function checkNear() {
          var targets = window.cueSequential ? [armedTrigger()].filter(Boolean) : (window.cueTriggers || []);
          var b = buffer().map(function (x) { return x.w; });
          var near = targets.some(function (t) {
            var toks = normalize(t.phrase);
            for (var k = Math.min(toks.length - 1, b.length); k >= 1; k--) {
              var tail = b.slice(b.length - k).join(" ");
              if (tail === toks.slice(0, k).join(" ")) return true;
            }
            return false;
          });
          if (near) {
            readout.classList.add("is-near");
            clearTimeout(nearT);
            nearT = setTimeout(function () { readout.classList.remove("is-near"); }, 2500);
          }
        }
        function showTranscript() {
          var words = [];
          entries.forEach(function (e) { words = words.concat(String(e.raw || "").trim().split(/\s+/).filter(Boolean)); });
          transcriptEl.textContent = words.slice(-22).join(" ");
        }
        document.addEventListener("cuetriggerschange", updateReadout);
        setInterval(function () { updateReadout(); prune(); showTranscript(); }, 1000);
        updateReadout();

        // ---------- Simulate ----------
        var sim = document.getElementById("simulate");
        sim.addEventListener("keydown", function (e) {
          if (e.key !== "Enter") return;
          e.preventDefault();
          if (sim.value.trim()) window.cueHear(sim.value);
          sim.value = "";
        });

        // ---------- Speech engines ----------
        // Recognizers live in js/recognizers/ and all feed upsert() + process() above, so the
        // matcher is the same whichever engine is listening.
        var ENGINES = window.SpeakEasyRecognizers || {};
        var listenBtn = document.getElementById("listen");
        var statusEl = document.getElementById("mic-status");
        var engineChip = document.getElementById("engine-chip");
        var liveDot = document.getElementById("live-dot");
        var banner = document.getElementById("voice-banner");
        var bannerHead = banner.querySelector(".callout__head");
        var bannerLead = document.getElementById("voice-lead");
        var voiceMsg = document.getElementById("voice-msg");
        var helpEl = document.getElementById("mic-help");
        var helpMsg = document.getElementById("mic-help-msg");
        var helpWhy = document.getElementById("mic-help-why");
        // wanted: the presenter asked to listen. mode: which engine is serving that wish.
        var engine = null, wanted = false, lastErr = "", everListened = false;
        var mode = "idle"; // "primary" | "fallback" | "manual" | "idle"

        function setStatus(s) {
          statusEl.textContent = s;
          statusEl.classList.toggle("chip--solid", s === "Listening");
        }
        function setButton() {
          listenBtn.textContent = wanted ? "Stop Listening" : "Start Listening";
          listenBtn.setAttribute("aria-pressed", wanted ? "true" : "false");
        }
        function say(s) { voiceMsg.textContent = s || ""; }
        function showBanner(head, lead) {
          bannerHead.textContent = head;
          banner.setAttribute("aria-label", head);
          bannerLead.textContent = lead;
          banner.hidden = false;
        }
        function clearProblems() { banner.hidden = true; say(""); }
        function setLive(on, sendingNow) {
          liveDot.hidden = !on;
          liveDot.classList.toggle("is-sending", !!(on && sendingNow));
        }
        function setChip(text, cls) {
          engineChip.textContent = text;
          engineChip.classList.toggle("is-fallback", cls === "fallback");
          engineChip.classList.toggle("is-manual", cls === "manual");
        }
        function idleChip() { setChip(settings.engine === "grok" ? "Grok STT" : "Browser", ""); }
        function stopEngine(graceful) {
          var e = engine; engine = null;
          if (e) { try { graceful ? e.stop() : e.abort(); } catch (x) {} }
          setLive(false);
        }
        function fail(status) {
          wanted = false; stopEngine(false); mode = "idle";
          setStatus(status); setButton();
        }
        window.cueEngine = function () { return { engine: engine ? engine.name : null, mode: mode, wanted: wanted, chip: engineChip.textContent }; };

        // ---------- Settings ----------
        var SETTINGS_KEY = "speakeasy.settings.v1";
        var LANGS = [].map.call(document.querySelectorAll("#set-lang option"), function (o) { return o.value; });
        function defaultLang() {
          var nav = (navigator.languages && navigator.languages[0]) || navigator.language || "en-US";
          if (LANGS.indexOf(nav) >= 0) return nav;
          var base = nav.split("-")[0];
          for (var i = 0; i < LANGS.length; i++) if (LANGS[i].split("-")[0] === base) return LANGS[i];
          return "en-US";
        }
        var settings = { engine: "browser", lang: defaultLang(), proxyUrl: "", accessCode: "", gate: 4 };
        try {
          var st = JSON.parse(localStorage.getItem(SETTINGS_KEY));
          if (st && typeof st === "object") {
            if (st.engine === "browser" || st.engine === "grok") settings.engine = st.engine;
            if (LANGS.indexOf(st.lang) >= 0) settings.lang = st.lang;
            if (typeof st.proxyUrl === "string") settings.proxyUrl = st.proxyUrl;
            if (typeof st.accessCode === "string") settings.accessCode = st.accessCode;
            if (st.gate >= 0 && st.gate <= 10) settings.gate = +st.gate;
          }
        } catch (e) {}
        function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {} }
        var setEngine = document.getElementById("set-engine"), setLang = document.getElementById("set-lang");
        var setProxy = document.getElementById("set-proxy"), setCode = document.getElementById("set-code");
        var setGate = document.getElementById("set-gate"), setGateVal = document.getElementById("set-gate-val");
        var settingsMsg = document.getElementById("settings-msg");
        function showEngineFields() {
          document.querySelectorAll("#voice-settings [data-engine]").forEach(function (el) { el.hidden = el.getAttribute("data-engine") !== settings.engine; });
          setGateVal.textContent = settings.gate === 0 ? "off" : String(settings.gate);
          if (!wanted) idleChip();
        }
        setEngine.value = settings.engine; setLang.value = settings.lang;
        setProxy.value = settings.proxyUrl; setCode.value = settings.accessCode; setGate.value = settings.gate;
        function changed(note) {
          saveSettings(); showEngineFields();
          settingsMsg.textContent = wanted ? "Saved. Stop and start listening to apply." : (note || "Saved.");
        }
        setEngine.addEventListener("change", function () { settings.engine = setEngine.value; changed(settings.engine === "grok" && !settings.proxyUrl ? "Saved. Add your proxy URL to use Grok STT." : ""); });
        setLang.addEventListener("change", function () { settings.lang = setLang.value; changed(); });
        setProxy.addEventListener("change", function () { settings.proxyUrl = setProxy.value.trim(); changed(); });
        setCode.addEventListener("change", function () { settings.accessCode = setCode.value; changed(); });
        setGate.addEventListener("input", function () { settings.gate = +setGate.value; changed(); });
        showEngineFields();

        // Boost phrases for Grok STT: script triggers first, then My Phrases.
        function boostPhrases() {
          return ENGINES.grok.keyterms([
            (window.cueTriggers || []).map(function (t) { return t.phrase; }),
            (window.cuePhrases || []).map(function (p) { return p.phrase; })
          ]);
        }
        window.cueBoostPhrases = boostPhrases;

        // ---------- Diagnosis ----------
        function isLockedSandbox() {
          if (window.origin === "null" || !window.isSecureContext) return true;
          try { if (location.origin === "null") return true; } catch (e) { return true; }
          try {
            var pol = document.permissionsPolicy || document.featurePolicy;
            if (pol && typeof pol.allowsFeature === "function" && !pol.allowsFeature("microphone")) return true;
          } catch (e) {}
          return false;
        }
        var SANDBOX_MSG = "This copy is running in a locked sandbox that blocks microphones. Open the standalone SpeakEasy link or file to use voice. Simulate speech still works.";
        var UA0 = navigator.userAgent || "";
        var IOS0 = /iPhone|iPad|iPod/i.test(UA0) || (/Macintosh/.test(UA0) && navigator.maxTouchPoints > 1);
        var IOS_OTHER = IOS0 && /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(UA0);
        var UNSUPPORTED_MSG = IOS_OTHER ? "On iPhone and iPad, voice only works in Safari. Copy this link and open it in Safari."
          : IOS0 ? "Voice recognition needs iOS 14.5 or later in Safari. Update iOS, or use Simulate speech."
          : "This browser doesn't support voice recognition. Use Chrome or Edge.";
        function micPermission() {
          try {
            if (!navigator.permissions || !navigator.permissions.query) return Promise.resolve("unknown");
            return navigator.permissions.query({ name: "microphone" })
              .then(function (r) { return r.state; }, function () { return "unknown"; });
          } catch (e) { return Promise.resolve("unknown"); }
        }
        function denied() {
          fail("Mic blocked");
          say("Microphone access is blocked. Follow Mic help below.");
          openHelp(true);
        }

        // ---------- Recognition ----------
        function dropInterim() { entries = entries.filter(function (e) { return e.final; }); }
        function onResult(key, text, isFinal) {
          if (lastErr) { lastErr = ""; say(""); }
          upsert(key, text, isFinal);
          process();
        }
        function onEngineState(state, info) {
          if (!wanted) return;
          if (state === "listening") {
            everListened = true;
            setStatus("Listening"); banner.hidden = true; setLive(true, false);
            if (info && info.recovered) say("");
          } else if (state === "reconnecting") { setStatus("Reconnecting"); }
          else if (state === "sending") setLive(true, true);
          else if (state === "gated") setLive(true, false);
        }
        // Manual control is the last resort: voice off, keys, buttons and clickers still work.
        function goManual(reason) {
          wanted = false; stopEngine(false); mode = "manual";
          keepAwake(true); // the talk goes on
          setStatus("Manual"); setButton(); setChip("Manual only", "manual");
          say(reason + " Voice is off — use Next/Back, the arrow keys or your clicker. Tap Start Listening to try again.");
          toast("Voice is off — manual control");
        }
        function fallBack(reason) {
          stopEngine(false);
          toast("Grok STT unavailable — switched to Browser recognition");
          say(reason + " Switched to Browser recognition.");
          startBrowser(true);
        }

        function startBrowser(isFallback) {
          var B = ENGINES.browser;
          if (!B || !B.supported()) {
            if (isFallback) { goManual("Browser recognition isn't available here either."); return; }
            fail("Unsupported"); showBanner("Voice unavailable", UNSUPPORTED_MSG);
            if (IOS_OTHER && navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(location.href).then(function () { say("Link copied. Open Safari and paste it in the address bar."); }, function () {});
            return;
          }
          mode = isFallback ? "fallback" : "primary";
          setChip(isFallback ? "Fallback: Browser" : "Browser", isFallback ? "fallback" : "");
          var go = function () {
            if (!wanted) return;
            engine = B.create({ lang: settings.lang, onResult: onResult, onState: onEngineState, onError: browserError, onSessionEnd: dropInterim });
            engine.start();
          };
          if (IOS0) { go(); return; } // iPhone: start within the tap
          micPermission().then(function (state) {
            if (!wanted) return;
            if (state === "denied") { denied(); return; }
            go();
          });
        }
        function browserError(err) {
          if (!wanted) return;
          var code = err.code;
          lastErr = code;
          if (err.fatal) {
            if (IOS0 && code === "not-allowed" && err.everListened) { fail("Paused"); say("Your iPhone paused the microphone. Tap Start Listening to resume."); return; }
            if (IOS0 && code === "service-not-allowed") { fail("Dictation off"); say("Speech recognition is off on this iPhone. Turn on Dictation (see Mic help), then tap Start Listening."); openHelp(true); return; }
            if (code === "not-allowed" || code === "service-not-allowed") {
              if (isLockedSandbox()) { fail("Blocked"); showBanner("Microphone blocked here", SANDBOX_MSG); }
              else denied();
              return;
            }
            if (mode === "fallback") { goManual("Browser recognition stopped (" + code + ")."); return; }
            if (code === "start-timeout") { fail("Not listening"); say("Voice didn't start. The microphone may be blocked — see Mic help."); return; }
            if (code === "start-failed") {
              if (isLockedSandbox()) { fail("Blocked"); showBanner("Microphone blocked here", SANDBOX_MSG); return; }
              fail("Not listening"); say("Voice couldn't start: " + (err.message || "unknown error") + "."); return;
            }
            fail("Not listening"); say("Voice stopped (" + code + ")."); return;
          }
          if (code === "no-speech") { say("No speech heard — still listening."); return; }
          if (code === "audio-capture") { setStatus("No mic"); say("No microphone found — plug one in or check another app isn't using it. Retrying…"); return; }
          if (code === "network") {
            if (mode === "fallback" && err.count >= 3) { goManual("The browser's speech service is unreachable too."); return; }
            setStatus("Offline"); say("Speech service unreachable — check your connection. Retrying…"); return;
          }
          setStatus("Error"); say("Voice stopped (" + code + "). Retrying…");
        }

        function startGrok() {
          var G = ENGINES.grok;
          if (!settings.proxyUrl) { say("Grok STT needs your proxy URL (Voice settings)."); fallBack("No Grok STT proxy is set."); return; }
          if (!G || !G.supported()) { fallBack("This browser can't stream audio to Grok STT."); return; }
          mode = "primary";
          setChip("Grok STT", "");
          engine = G.create({
            proxyUrl: settings.proxyUrl, accessCode: settings.accessCode,
            language: settings.lang.split("-")[0], keyterms: boostPhrases(), gate: settings.gate,
            workletUrl: new URL("js/recognizers/pcm-worklet.js", location.href).href,
            onResult: onResult, onState: onEngineState, onError: grokError, onSessionEnd: dropInterim
          });
          window.cueGrokStats = engine.stats;
          engine.start();
        }
        function grokError(err) {
          if (!wanted) return;
          lastErr = err.code;
          if (err.code === "not-allowed") {
            if (isLockedSandbox()) { fail("Blocked"); showBanner("Microphone blocked here", SANDBOX_MSG); }
            else denied();
            return;
          }
          if (err.fatal) {
            var why = {
              "no-proxy": "No Grok STT proxy is set.",
              "bad-proxy-url": "The Grok STT proxy URL isn't valid.",
              "unauthorized": "The Grok STT proxy refused this page (check the access code and allowed origins).",
              "connect-failed": "Couldn't reach the Grok STT proxy.",
              "connect-timeout": "Grok STT didn't answer in time.",
              "disconnected": "Grok STT disconnected."
            }[err.code] || ("Grok STT stopped (" + (err.message || err.code) + ").");
            fallBack(why);
          }
        }

        function startRec() {
          clearProblems();
          lastErr = "";
          if (isLockedSandbox()) { fail("Blocked"); showBanner("Microphone blocked here", SANDBOX_MSG); return; }
          wanted = true; setButton(); setStatus("Starting");
          if (window.cueUnlockMedia) window.cueUnlockMedia();
          keepAwake(true);
          if (settings.engine === "grok") startGrok();
          else startBrowser(false);
        }
        var wakeLock = null;
        function keepAwake(on) {
          try {
            if (on && navigator.wakeLock && !wakeLock) navigator.wakeLock.request("screen").then(function (l) { wakeLock = l; l.addEventListener("release", function () { wakeLock = null; }); }, function () {});
            if (!on && wakeLock) { wakeLock.release(); wakeLock = null; }
          } catch (e) {}
        }
        document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && (wanted || mode === "manual")) keepAwake(true); });
        function stopRec() {
          keepAwake(false);
          wanted = false; setButton();
          stopEngine(true);
          mode = "idle";
          lastErr = ""; say("");
          setStatus("Paused"); idleChip();
        }
        listenBtn.addEventListener("click", function () { wanted ? stopRec() : startRec(); });
        setStatus("Paused"); setButton();
        window.addEventListener("pagehide", function () { stopEngine(true); });

        // ---------- Mic help ----------
        var ua = navigator.userAgent || "";
        var isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
        var isAndroid = /Android/i.test(ua);
        var platform = isIOS ? "ios" : isAndroid ? "android" : "desktop";
        var isEdge = /Edg\//.test(ua);
        var os = !isIOS && /Macintosh|Mac OS X/.test(ua) ? "mac" : /Windows/.test(ua) ? "win" : "";
        helpEl.querySelectorAll("[data-platform]").forEach(function (el) { el.hidden = el.getAttribute("data-platform") !== platform; });
        helpEl.querySelectorAll("[data-os]").forEach(function (el) { el.hidden = el.getAttribute("data-os") !== os; });
        var urlEl = document.getElementById("mic-settings-url");
        if (isEdge) {
          urlEl.textContent = "edge://settings/content/microphone";
          document.getElementById("mic-desktop-label").textContent = "Desktop · Edge";
        }
        function openHelp(fromDenied) {
          document.getElementById("strip").open = true;
          helpWhy.textContent = fromDenied
            ? "The microphone is blocked for this page. Allow it with the steps below, then tap Try again."
            : "If the microphone is blocked, follow these steps, then tap Try again.";
          helpMsg.textContent = "";
          helpEl.hidden = false;
          helpEl.focus({ preventScroll: true });
          helpEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
        function closeHelp() { helpEl.hidden = true; document.getElementById("mic-help-link").focus(); }
        document.getElementById("mic-help-link").addEventListener("click", function (e) {
          e.preventDefault();
          helpEl.hidden ? openHelp(false) : closeHelp();
        });
        document.getElementById("mic-help-close").addEventListener("click", closeHelp);
        helpEl.addEventListener("keydown", function (e) { if (e.key === "Escape") closeHelp(); });

        document.getElementById("mic-copy").addEventListener("click", function () {
          var btn = this, text = urlEl.textContent;
          function done(ok) {
            btn.textContent = ok ? "Copied" : "Select and copy";
            setTimeout(function () { btn.textContent = "Copy"; }, 1800);
          }
          function fallback() {
            try {
              var r = document.createRange(); r.selectNodeContents(urlEl);
              var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
              done(document.execCommand("copy"));
            } catch (e) { done(false); }
          }
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
          else fallback();
        });

        document.getElementById("mic-retry").addEventListener("click", function () {
          if (isLockedSandbox()) { helpMsg.textContent = SANDBOX_MSG; return; }
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            helpMsg.textContent = "This browser can't request the microphone here. Use Chrome or Edge.";
            return;
          }
          helpMsg.textContent = "Asking for the microphone…";
          navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
            stream.getTracks().forEach(function (t) { t.stop(); });
            helpMsg.textContent = "Microphone allowed. Starting to listen…";
            if (settings.engine !== "grok" && !(ENGINES.browser && ENGINES.browser.supported())) { showBanner("Voice unavailable", UNSUPPORTED_MSG); return; }
            if (wanted) stopRec();
            setTimeout(function () { startRec(); if (wanted) helpEl.hidden = true; }, 300);
          }, function (err) {
            var name = err && err.name;
            if (name === "NotAllowedError" || name === "SecurityError") {
              helpMsg.textContent = "Still blocked. Follow the steps above, reload if asked, then tap Try again.";
              fail("Mic blocked");
            } else if (name === "NotFoundError" || name === "OverconstrainedError") {
              helpMsg.textContent = "No microphone found — plug one in and try again.";
            } else if (name === "NotReadableError") {
              helpMsg.textContent = "The microphone is busy in another app — close it and try again.";
            } else {
              helpMsg.textContent = "Couldn't reach the microphone (" + (name || "unknown error") + ").";
            }
          });
        });
      })();
    
