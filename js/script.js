    
      (function () {
        var view = document.getElementById("script-view");
        var area = document.getElementById("script");
        var editBtn = document.getElementById("edit-text");
        var seqBtn = document.getElementById("mode-seq");
        var anyBtn = document.getElementById("mode-any");
        var list = document.getElementById("cue-list");
        var msgEl = document.getElementById("cue-msg");
        var tb = document.getElementById("cue-toolbar");
        var tbLabel = document.getElementById("cue-tb-label");
        var panel = document.getElementById("panel-script");
        function SLIDES() { return window.cueDeck.count(); }
        function MEDIA() { return window.cueDeck.media(); }
        function playWhere() { var m = MEDIA(); return m ? "slide " + m : "no media yet"; }

        var words = [];
        var triggers = [];
        var uid = 0;
        var editing = false;
        var tbMode = null, pending = null, editId = null;
        window.cueTriggers = triggers;
        window.cueSequential = true;
        window.cueArmed = 0;

        function norm(w) { return w.toLowerCase().replace(/[^\p{L}\p{N}']+/gu, ""); }
        function cleanPhrase(s) { return s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""); }
        function tokenize(text) {
          words = [];
          var parts = text.replace(/^\s+/, "").split(/(\s+)/);
          for (var i = 0; i < parts.length; i += 2) {
            if (parts[i] === "") continue;
            words.push({ t: parts[i], ws: parts[i + 1] || "" });
          }
        }
        function locate(phrase, from) {
          var p = phrase.split(/\s+/).map(norm);
          for (var i = from || 0; i + p.length <= words.length; i++) {
            var ok = true;
            for (var j = 0; j < p.length; j++) { if (norm(words[i + j].t) !== p[j]) { ok = false; break; } }
            if (ok) return i;
          }
          return -1;
        }
        var COLORS = { next: "", prev: "", goto: "x-cue--orange", play: "x-cue--orange", pause: "x-cue--red", blackout: "x-cue--red" };
        function chipText(t) {
          return { next: "▶ Next", prev: "◀ Prev", goto: "→ Slide " + t.slide, play: "▶ Play · " + playWhere(), pause: "❚❚ Pause", blackout: "■ Blackout" }[t.action];
        }
        function longText(t) {
          return { next: "Next slide", prev: "Previous slide", goto: "Go to slide " + t.slide, play: "Play video (" + playWhere() + ")", pause: "Pause media", blackout: "Blackout" }[t.action];
        }
        function byId(id) { for (var i = 0; i < triggers.length; i++) if (triggers[i].id === id) return triggers[i]; return null; }
        function msg(s) { msgEl.textContent = s || ""; }

        function render() {
          view.textContent = "";
          var starts = {};
          triggers.forEach(function (t) { starts[t.start] = t; });
          var host = view, cur = null;
          words.forEach(function (w, i) {
            if (starts[i]) {
              cur = starts[i];
              host = document.createElement("span");
              host.className = "x-cue " + COLORS[cur.action];
              if (window.cueSequential && triggers.indexOf(cur) === window.cueArmed) host.classList.add("is-armed");
              host.dataset.id = cur.id;
              host.tabIndex = 0;
              host.setAttribute("role", "button");
              host.setAttribute("aria-label", "Trigger “" + cur.phrase + "”: " + longText(cur) + ". Edit");
              view.appendChild(host);
            }
            var s = document.createElement("span");
            s.className = "x-w"; s.dataset.i = i; s.textContent = w.t;
            host.appendChild(s);
            if (cur && i === cur.end) {
              var c = document.createElement("span");
              c.className = "x-cue__chip"; c.setAttribute("aria-hidden", "true"); c.textContent = chipText(cur);
              host.appendChild(c);
              host = view; cur = null;
            }
            host.appendChild(document.createTextNode(w.ws));
          });
        }
        function renderList() {
          list.textContent = "";
          if (!triggers.length) {
            var e = document.createElement("li");
            e.innerHTML = '<span class="checklist__item">No triggers yet <small>Select 2 to 5 words in the script.</small></span>';
            list.appendChild(e);
            return;
          }
          triggers.forEach(function (t, i) {
            var li = document.createElement("li");
            var it = document.createElement("span");
            it.className = "checklist__item";
            it.textContent = (i + 1) + ". “" + t.phrase + "”";
            var sm = document.createElement("small");
            sm.textContent = longText(t);
            it.appendChild(sm);
            li.appendChild(it);
            if (window.cueSequential && i === window.cueArmed) {
              var c = document.createElement("span");
              c.className = "chip chip--solid"; c.textContent = "Armed";
              li.appendChild(c);
            }
            list.appendChild(li);
          });
        }
        function commit() {
          triggers.sort(function (a, b) { return a.start - b.start; });
          window.cueArmed = 0; triggers.forEach(function (x) { x.spent = false; });
          render();
          renderList();
          save();
          document.dispatchEvent(new CustomEvent("cuetriggerschange", { detail: triggers }));
        }

        // ---------- Saved on this device ----------
        var STORE_KEY = "speakeasy.script.v1";
        function scriptData() {
          return {
            type: "speakeasy-script", version: 1,
            text: words.map(function (w) { return w.t + w.ws; }).join(""),
            sequential: !!window.cueSequential,
            triggers: triggers.map(function (t) { return { phrase: t.phrase, action: t.action, slide: t.slide, start: t.start }; })
          };
        }
        function save() {
          if (editing) return;
          try { localStorage.setItem(STORE_KEY, JSON.stringify(scriptData())); } catch (e) {}
        }
        // Loads a script export (or the saved copy). Returns null if the data isn't a script.
        function loadData(d) {
          if (!d || typeof d.text !== "string" || !Array.isArray(d.triggers)) return null;
          hideToolbar();
          if (editing) {
            editing = false; area.hidden = true; view.hidden = false;
            editBtn.textContent = "Edit text"; editBtn.setAttribute("aria-pressed", "false");
          }
          area.value = d.text;
          tokenize(d.text);
          triggers.length = 0;
          var lost = 0;
          d.triggers.forEach(function (t) {
            if (!t || typeof t.phrase !== "string" || !COLORS.hasOwnProperty(t.action)) { lost++; return; }
            var n = t.phrase.split(/\s+/).length;
            var at = typeof t.start === "number" ? locate(t.phrase, t.start) : -1;
            if (at !== t.start) at = locate(t.phrase, 0);
            var clash = triggers.some(function (o) { return at <= o.end && at + n - 1 >= o.start; });
            if (at < 0 || clash) { lost++; return; }
            triggers.push({ id: ++uid, phrase: t.phrase, action: t.action, slide: t.slide == null ? null : t.slide, start: at, end: at + n - 1 });
          });
          window.cueArmed = 0;
          if (typeof d.sequential === "boolean") setSeq(d.sequential);
          commit();
          return { count: triggers.length, lost: lost };
        }
        function add(phrase, action, slide) {
          var from = triggers.length ? triggers[triggers.length - 1].end + 1 : 0;
          var at = locate(phrase, from);
          if (at < 0) at = locate(phrase, 0);
          if (at < 0) return;
          var n = phrase.split(/\s+/).length;
          triggers.push({ id: ++uid, phrase: phrase, action: action, slide: slide == null ? null : slide, start: at, end: at + n - 1 });
        }

        window.cueArm = function (i) {
          window.cueArmed = Math.max(0, Math.min(triggers.length, i));
          render(); renderList();
        };
        window.runCueAction = function (t) {
          if (!t) return;
          if (t.action === "next") window.next();
          else if (t.action === "prev") window.prev();
          else if (t.action === "goto") window.goTo(t.slide);
          else if (t.action === "last") window.goTo(window.cueDeck.count());
          else if (t.action === "play") { var m = MEDIA(); if (m) { window.goTo(m); window.playMedia(); } }
          else if (t.action === "pause") window.pauseMedia();
          else if (t.action === "blackout") window.toggleBlackout();
        };

        // Toolbar
        var gotoRow = document.getElementById("cue-goto-row");
        var gotoIn = document.getElementById("cue-goto-n");
        var gotoHint = document.getElementById("cue-goto-hint");
        function hideGoto() { gotoRow.hidden = true; gotoHint.textContent = ""; }
        function hideToolbar() { tb.hidden = true; tbMode = null; pending = null; editId = null; hideGoto(); }
        function showToolbar(mode, rect, t) {
          tbMode = mode;
          tbLabel.textContent = mode === "add" ? "Add a trigger for “" + pending.phrase + "”" : "Change “" + t.phrase + "”";
          tb.querySelectorAll("button[data-act]").forEach(function (b) {
            var a = b.dataset.act;
            if (a === "remove") b.hidden = mode !== "edit";
            else if (a !== "cancel") b.setAttribute("aria-pressed", mode === "edit" && t.action === a ? "true" : "false");
          });
          hideGoto();
          tb.hidden = false;
          var w = tb.offsetWidth;
          var left = rect.left + window.scrollX + rect.width / 2 - w / 2;
          left = Math.max(window.scrollX + 8, Math.min(left, window.scrollX + document.documentElement.clientWidth - w - 8));
          tb.style.left = left + "px";
          tb.style.top = rect.bottom + window.scrollY + (("ontouchstart" in window) ? 30 : 8) + "px";
        }
        function selectedRange() {
          var sel = window.getSelection();
          if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
          var r = sel.getRangeAt(0);
          if (!view.contains(r.startContainer) || !view.contains(r.endContainer)) return null;
          var a = -1, b = -1;
          view.querySelectorAll(".x-w").forEach(function (s) {
            var tn = s.firstChild;
            if (!tn) return;
            if (r.comparePoint(tn, 0) === 1 || r.comparePoint(tn, tn.length) === -1) return;
            if (r.endContainer === tn && r.endOffset === 0) return;
            if (r.startContainer === tn && r.startOffset === tn.length) return;
            var i = +s.dataset.i;
            if (a < 0) a = i;
            b = i;
          });
          if (a < 0) return null;
          return { a: a, b: b, rect: r.getBoundingClientRect() };
        }
        function handleSelection() {
          if (editing || panel.hidden) return;
          var s = selectedRange();
          if (!s) return;
          var n = s.b - s.a + 1;
          if (n < 2) { msg("Pick at least 2 words. A single word is too easy to say by accident."); if (tbMode === "add") hideToolbar(); return; }
          if (n > 5) { msg("That’s " + n + " words. Keep a trigger to 5 words or fewer so it’s quick to say."); if (tbMode === "add") hideToolbar(); return; }
          for (var i = 0; i < triggers.length; i++) {
            if (s.a <= triggers[i].end && s.b >= triggers[i].start) {
              msg("That overlaps the trigger “" + triggers[i].phrase + "”. Click its highlight to change it.");
              if (tbMode === "add") hideToolbar();
              return;
            }
          }
          var phrase = cleanPhrase(words.slice(s.a, s.b + 1).map(function (w) { return w.t; }).join(" "));
          msg("");
          pending = { start: s.a, end: s.b, phrase: phrase };
          editId = null;
          showToolbar("add", s.rect);
        }
        var selTimer = null;
        document.addEventListener("selectionchange", function () {
          clearTimeout(selTimer);
          selTimer = setTimeout(handleSelection, 450);
        });
        view.addEventListener("mouseup", function () { clearTimeout(selTimer); setTimeout(handleSelection, 0); });
        view.addEventListener("touchend", function () { clearTimeout(selTimer); selTimer = setTimeout(handleSelection, 350); });

        function openEdit(mark) {
          var t = byId(+mark.dataset.id);
          if (!t) return;
          pending = null; editId = t.id;
          showToolbar("edit", mark.getBoundingClientRect(), t);
          msg("");
        }
        view.addEventListener("click", function (e) {
          var m = e.target.closest(".x-cue");
          if (!m) return;
          var sel = window.getSelection();
          if (sel && !sel.isCollapsed && sel.toString().trim()) return;
          openEdit(m);
        });
        view.addEventListener("keydown", function (e) {
          var m = e.target.closest && e.target.closest(".x-cue");
          if (m && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openEdit(m); }
        });
        document.addEventListener("pointerdown", function (e) {
          if (tb.hidden || tb.contains(e.target)) return;
          if (e.target.closest && e.target.closest(".x-cue")) return;
          hideToolbar();
        });
        document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !tb.hidden) hideToolbar(); });
        tb.addEventListener("mousedown", function (e) { if (e.target !== gotoIn) e.preventDefault(); });
        tb.addEventListener("click", function (e) {
          var b = e.target.closest("button");
          if (!b) return;
          var act = b.dataset.act;
          if (act === "cancel") { hideToolbar(); return; }
          if (!act) return;
          var t = editId ? byId(editId) : null;
          if (act === "remove") {
            if (t) triggers.splice(triggers.indexOf(t), 1);
            hideToolbar(); commit(); msg("Trigger removed.");
            return;
          }
          var slide = null;
          if (act === "goto") {
            // Ask inline instead of window.prompt(), which sandboxed hosts often block.
            gotoIn.max = SLIDES();
            gotoIn.value = t && t.slide ? t.slide : "";
            gotoHint.textContent = "1–" + SLIDES();
            gotoRow.hidden = false;
            gotoIn.focus();
            return;
          }
          applyAction(act, slide, t);
        });
        function confirmGoto() {
          var t = editId ? byId(editId) : null;
          var slide = parseInt(gotoIn.value, 10);
          if (!(slide >= 1 && slide <= SLIDES())) { gotoHint.textContent = "Slide numbers run from 1 to " + SLIDES() + "."; gotoIn.focus(); return; }
          applyAction("goto", slide, t);
        }
        document.getElementById("cue-goto-ok").addEventListener("click", function (e) { e.stopPropagation(); confirmGoto(); });
        gotoIn.addEventListener("keydown", function (e) {
          if (e.key === "Enter") { e.preventDefault(); confirmGoto(); }
          else if (e.key === "Escape") { e.stopPropagation(); hideGoto(); }
        });
        function applyAction(act, slide, t) {
          if (act === "play") slide = MEDIA();
          if (tbMode === "add" && pending) {
            triggers.push({ id: ++uid, phrase: pending.phrase, action: act, slide: slide, start: pending.start, end: pending.end });
          } else if (t) {
            t.action = act; t.slide = slide;
          }
          var sel = window.getSelection();
          if (sel) sel.removeAllRanges();
          hideToolbar();
          commit();
        }

        // Edit text toggle
        editBtn.addEventListener("click", function () {
          hideToolbar();
          if (!editing) {
            editing = true;
            area.value = words.map(function (w) { return w.t + w.ws; }).join("");
            view.hidden = true; area.hidden = false;
            editBtn.textContent = "Done editing"; editBtn.setAttribute("aria-pressed", "true");
            msg("");
            area.focus();
            return;
          }
          editing = false;
          tokenize(area.value);
          var old = triggers.slice(), from = 0, lost = 0;
          triggers.length = 0;
          old.forEach(function (t) {
            var at = locate(t.phrase, from);
            if (at < 0) { lost++; return; }
            var n = t.phrase.split(/\s+/).length;
            t.start = at; t.end = at + n - 1; from = t.end + 1;
            triggers.push(t);
          });
          area.hidden = true; view.hidden = false;
          editBtn.textContent = "Edit text"; editBtn.setAttribute("aria-pressed", "false");
          commit();
          msg(lost ? lost + (lost === 1 ? " trigger no longer matched" : " triggers no longer matched") + " the text and " + (lost === 1 ? "was" : "were") + " removed." : "");
        });

        // Sequential / any order
        function setSeq(on) {
          window.cueSequential = on;
          window.cueArmed = 0; triggers.forEach(function (x) { x.spent = false; });
          seqBtn.setAttribute("aria-pressed", on ? "true" : "false");
          anyBtn.setAttribute("aria-pressed", on ? "false" : "true");
          render(); renderList();
          save();
        }
        seqBtn.addEventListener("click", function () { setSeq(true); });
        anyBtn.addEventListener("click", function () { setSeq(false); });
        document.querySelectorAll(".x-tab[role=tab]").forEach(function (t) { t.addEventListener("click", hideToolbar); });

        // Sample script and preloaded triggers; a script saved on this device wins.
        var SAMPLE_TEXT = area.value;
        function useSampleScript() {
          area.value = SAMPLE_TEXT;
          tokenize(SAMPLE_TEXT);
          triggers.length = 0;
          add("something every one of us", "next", null);
          add("show you how this works", "next", null);
          add("play a short clip", "play", 4);
          add("my own phrases still", "next", null);
          add("eyes on the room", "next", null);
          setSeq(true);
          commit();
        }
        var saved = null;
        try { saved = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) {}
        if (!saved || !loadData(saved)) useSampleScript();
        document.getElementById("script-sample").addEventListener("click", function () {
          if (triggers.length && !confirmReplace()) return;
          useSampleScript();
          msg("Loaded the sample script with " + triggers.length + " triggers.");
        });
        var sampleArmed = 0;
        function confirmReplace() {
          // Two taps instead of window.confirm(), which sandboxed hosts often block.
          if (Date.now() - sampleArmed < 4000) return true;
          sampleArmed = Date.now();
          msg("Tap Sample script again to replace your script and triggers.");
          return false;
        }
        document.addEventListener("cuedeckchange", function () { render(); renderList(); });

        // Export / import script + triggers
        document.getElementById("script-export").addEventListener("click", function () {
          if (editing) editBtn.click();
          var data = scriptData();
          var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
          var a = document.createElement("a");
          a.href = URL.createObjectURL(blob); a.download = "speakeasy-script.json";
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
          msg("Exported speakeasy-script.json with " + triggers.length + " triggers.");
        });
        var scriptIn = document.getElementById("script-import");
        document.getElementById("script-import-btn").addEventListener("click", function () { scriptIn.click(); });
        scriptIn.addEventListener("change", function () {
          var f = scriptIn.files && scriptIn.files[0];
          scriptIn.value = "";
          if (!f) return;
          var r = new FileReader();
          r.onload = function () {
            var d = null;
            try { d = JSON.parse(r.result); } catch (e) {}
            var res = loadData(d);
            if (!res) { msg("That file isn’t a SpeakEasy script export."); return; }
            msg("Imported the script with " + res.count + " triggers" + (res.lost ? "; " + res.lost + " didn’t match the text and were skipped." : "."));
          };
          r.readAsText(f);
        });
      })();
    
