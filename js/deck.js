    
      (function () {
        var tabs = document.querySelectorAll(".x-tab");
        function showTab(id) {
          tabs.forEach(function (t) {
            var on = t.id === id;
            t.setAttribute("aria-selected", on);
            document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
          });
        }
        tabs.forEach(function (t) { t.addEventListener("click", function () { showTab(t.id); }); });
        window.showTab = showTab;

        var stage = document.getElementById("stage");
        var blackEl = stage.querySelector(".x-blackout");
        var sampleSlides = Array.prototype.slice.call(stage.querySelectorAll(".x-slide"));
        var slides = sampleSlides.slice();
        var isSample = true;
        var attached = null; // { el, kind, slide, url, name }
        var counter = document.getElementById("counter");
        var current = 0;

        function canvasSlide() { return isSample ? sampleSlides.indexOf(canvas.closest(".x-slide")) + 1 : 0; }
        function mediaSlide() { return attached ? attached.slide : (canvasSlide() || null); }

        function goTo(n) {
          n = Math.max(1, Math.min(slides.length, Number(n) || 1));
          if (current !== n - 1 && current + 1 === mediaSlide()) pauseMedia();
          current = n - 1;
          slides.forEach(function (s, i) { s.classList.toggle("is-active", i === current); });
          counter.textContent = n + " / " + slides.length;
          syncAudience();
          return n;
        }
        function next() { return goTo(current + 2); }
        function prev() { return goTo(current); }

        var canvas = document.getElementById("media");
        var ctx = canvas.getContext("2d");
        var mediaState = document.getElementById("media-state");
        var playing = false, t = 0, raf = null;
        function draw() {
          var w = canvas.width, h = canvas.height;
          var cs = getComputedStyle(document.body);
          ctx.clearRect(0, 0, w, h);
          ctx.fillStyle = cs.getPropertyValue("--fill-tertiary") || "#eee";
          ctx.fillRect(0, h - 40, w, 40);
          for (var i = 0; i < 5; i++) {
            var x = ((t * 2 + i * 140) % (w + 60)) - 30;
            var y = h / 2 + Math.sin(t / 20 + i) * 60;
            ctx.beginPath();
            ctx.arc(x, y, 18 + i * 3, 0, Math.PI * 2);
            ctx.fillStyle = cs.getPropertyValue("--text-primary") || "#111";
            ctx.globalAlpha = 0.25 + i * 0.15;
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
        var frameN = 0;
        function loop() { t++; draw(); syncCanvasFrame(); if (playing) raf = requestAnimationFrame(loop); }
        function playMedia() {
          if (attached) {
            var p = attached.el.play();
            if (p && p.catch) p.catch(function () { document.dispatchEvent(new CustomEvent("cueplayblocked")); });
            return;
          }
          if (!isSample) return;
          if (!playing) { playing = true; mediaState.textContent = "Playing"; loop(); syncAudience(); }
        }
        window.cueUnlockMedia = function () {
          if (!attached || attached.unlocked) return;
          var el = attached.el; el.muted = true;
          var p = el.play();
          var done = function () { el.pause(); el.currentTime = 0; el.muted = false; attached.unlocked = true; };
          if (p && p.then) p.then(done, function () { el.muted = false; }); else done();
        };
        function pauseMedia() {
          if (attached) attached.el.pause();
          var was = playing;
          playing = false; if (raf) cancelAnimationFrame(raf); mediaState.textContent = "Paused";
          if (was) syncAudience();
        }
        function isPlaying() { return attached ? !attached.el.paused : playing; }
        draw();

        function toggleBlackout() { var on = stage.classList.toggle("is-black"); syncAudience(); return on; }

        // ---------- Deck: your images or the sample ----------
        function setSlides(list) {
          pauseMedia();
          slides.forEach(function (s) { s.remove(); });
          slides = list;
          slides.forEach(function (s) { stage.insertBefore(s, blackEl); s.classList.remove("is-active"); });
          if (attached) {
            if (attached.slide > slides.length) attached.slide = slides.length;
            slides[attached.slide - 1].appendChild(attached.el);
          }
          current = 0;
          goTo(1);
          document.dispatchEvent(new CustomEvent("cuedeckchange"));
        }
        var deckUrls = [];
        function loadDeck(files) {
          files = Array.prototype.filter.call(files, function (f) { return /^image\/(png|jpe?g)$/i.test(f.type) || /\.(png|jpe?g)$/i.test(f.name); });
          if (!files.length) return 0;
          files.sort(function (a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }); });
          deckUrls.forEach(function (u) { URL.revokeObjectURL(u); });
          deckUrls = [];
          var list = files.map(function (f, i) {
            var d = document.createElement("div");
            d.className = "x-slide x-slide--img";
            var img = document.createElement("img");
            var u = URL.createObjectURL(f); deckUrls.push(u);
            img.src = u; img.alt = "Slide " + (i + 1) + " (" + f.name + ")";
            img.addEventListener("load", function () { if (slides[current] === d) syncAudience(); });
            d.appendChild(img);
            return d;
          });
          isSample = false;
          setSlides(list);
          return list.length;
        }
        function useSample() { isSample = true; setSlides(sampleSlides.slice()); }
        function attachMedia(file, n) {
          detachMedia(true);
          var kind = /^audio\//.test(file.type) || /\.(mp3|m4a|wav|ogg|aac|flac)$/i.test(file.name) ? "audio" : "video";
          var el = document.createElement(kind);
          el.className = "x-media" + (kind === "audio" ? " x-media--audio" : "");
          el.controls = true; el.preload = "auto";
          if (kind === "video") el.playsInline = true;
          var url = URL.createObjectURL(file);
          el.src = url;
          n = Math.max(1, Math.min(slides.length, n));
          attached = { el: el, kind: kind, slide: n, url: url, name: file.name };
          ["play", "pause", "seeked"].forEach(function (ev) { el.addEventListener(ev, syncAudience); });
          slides[n - 1].appendChild(el);
          if (isSample) { playing = false; if (raf) cancelAnimationFrame(raf); mediaState.textContent = "Paused"; }
          document.dispatchEvent(new CustomEvent("cuedeckchange"));
          syncAudience();
          return attached;
        }
        function detachMedia(quiet) {
          if (!attached) return;
          attached.el.pause(); attached.el.remove();
          URL.revokeObjectURL(attached.url);
          attached = null;
          if (!quiet) { document.dispatchEvent(new CustomEvent("cuedeckchange")); syncAudience(); }
        }

        // ---------- Audience window ----------
        var audience = null;
        function audienceOpen() { return audience && !audience.closed; }
        // Audience sync is light: unchanged state is never re-sent, and the sample clip's
        // canvas goes over as a small JPEG at most CANVAS_FPS times a second.
        var CANVAS_FPS = 8, lastCanvasSend = 0, lastSig = null;
        function canvasFrame() { try { return canvas.toDataURL("image/jpeg", 0.6); } catch (e) { return null; } }
        function slideMessage() {
          var s = slides[current], m = { type: "speakeasy-slide", black: stage.classList.contains("is-black"), n: current + 1, total: slides.length };
          var img = s.querySelector(".x-slide--img > img, :scope > img");
          if (s.classList.contains("x-slide--img") && img) m.img = img.src;
          else if (s.contains(canvas)) { m.img = canvasFrame(); m.canvas = true; m.ratio = canvas.width / canvas.height; }
          else {
            var c = s.cloneNode(true);
            c.querySelectorAll(".x-media").forEach(function (x) { x.remove(); });
            m.html = c.innerHTML;
          }
          if (attached && attached.slide === current + 1) {
            m.media = { kind: attached.kind, src: attached.url, playing: !attached.el.paused, time: attached.el.currentTime };
          }
          return m;
        }
        function targetOrigin() { return window.origin && window.origin !== "null" ? window.origin : "*"; }
        function post(m) { try { audience.postMessage(m, targetOrigin()); window.cueAudienceSent = (window.cueAudienceSent || 0) + 1; } catch (e) {} }
        function signature(m) {
          var media = m.media ? [m.media.src, m.media.playing, Math.round(m.media.time * 2) / 2].join(",") : "";
          return [m.n, m.total, m.black, m.canvas ? "canvas" : (m.img || ""), m.html || "", media].join("|");
        }
        function syncAudience(force) {
          if (!audienceOpen()) return;
          var m = slideMessage(), sig = signature(m);
          if (!force && sig === lastSig && !m.canvas) return;
          lastSig = sig;
          if (m.canvas) lastCanvasSend = Date.now();
          post(m);
        }
        function syncCanvasFrame() {
          if (!audienceOpen() || !slides[current] || !slides[current].contains(canvas)) return;
          var now = Date.now();
          if (now - lastCanvasSend < 1000 / CANVAS_FPS) return;
          lastCanvasSend = now;
          post(slideMessage());
        }
        function audienceDoc() {
          var cs = getComputedStyle(document.body);
          var bg = cs.getPropertyValue("--fill-primary-on").trim() || "#fff";
          var fg = cs.getPropertyValue("--text-primary").trim() || "#111";
          var fg2 = cs.getPropertyValue("--text-secondary").trim() || "#666";
          return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>SpeakEasy · Audience</title>' +
            '<link rel="stylesheet" href="' + new URL("css/fonts.css", location.href).href + '">' +
            "<style>html,body{margin:0;height:100%;background:" + bg + ";color:" + fg + ";font-family:Geist,system-ui,sans-serif;overflow:hidden}" +
            "#s{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:2vh;padding:6vh 6vw;box-sizing:border-box}" +
            "#s.img{padding:0}#s img{max-width:100%;max-height:100%;object-fit:contain}" +
            "#s h3{margin:0;font-weight:600;font-size:clamp(28px,6vw,96px);line-height:1.1}" +
            "#s p{margin:0;color:" + fg2 + ";font-size:clamp(16px,2.4vw,40px)}#s canvas{display:none}" +
            "#m{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);max-width:84vw;max-height:84vh;background:#000;z-index:2}" +
            "#m.audio{display:none}#b{position:fixed;inset:0;background:#000;z-index:5;display:none}" +
            "#hint{position:fixed;bottom:12px;right:16px;font-size:12px;color:" + fg2 + ";z-index:6}</style></head>" +
            '<body><div id="s"></div><div id="b"></div><p id="hint">Double-click for fullscreen</p><script>' +
            "var s=document.getElementById('s'),b=document.getElementById('b'),m=null,last=null;" +
            "document.addEventListener('dblclick',function(){if(document.fullscreenElement)document.exitFullscreen();else if(document.documentElement.requestFullscreen)document.documentElement.requestFullscreen();});" +
            "setTimeout(function(){var h=document.getElementById('hint');if(h)h.remove();},5000);" +
            "window.addEventListener('message',function(e){var d=e.data;if(!d||d.type!=='speakeasy-slide')return;" +
            "b.style.display=d.black?'block':'none';document.title='SpeakEasy · Slide '+d.n+' of '+d.total;" +
            "var key=d.n+'|'+(d.html||'')+'|'+(d.img&&d.img.slice(0,5)==='blob:'?d.img:'');" +
            "if(d.img){var im=s.querySelector('img');if(!im||key!==last){s.className='img';s.innerHTML='';im=document.createElement('img');im.alt='Slide '+d.n;s.appendChild(im);}if(im.getAttribute('src')!==d.img)im.setAttribute('src',d.img);}" +
            "else if(key!==last){s.className='';s.innerHTML=d.html||'';}last=key;" +
            "if(d.media){if(!m||m.getAttribute('src')!==d.media.src){if(m)m.remove();m=document.createElement(d.media.kind);m.id='m';m.className=d.media.kind;m.muted=true;m.playsInline=true;m.setAttribute('src',d.media.src);document.body.appendChild(m);}" +
            "if(Math.abs(m.currentTime-d.media.time)>0.4)m.currentTime=d.media.time;if(d.media.playing){var p=m.play();if(p&&p.catch)p.catch(function(){});}else m.pause();}" +
            "else if(m){m.remove();m=null;}});" +
            "<\/script></body></html>";
        }
        function openAudience() {
          if (audienceOpen()) { audience.focus(); syncAudience(); return true; }
          var w = null;
          try { w = window.open("", "speakeasy-audience", "popup=yes,width=1280,height=720"); } catch (e) { w = null; }
          if (!w) return false;
          try {
            w.document.open(); w.document.write(audienceDoc()); w.document.close();
          } catch (e) { try { w.close(); } catch (x) {} return false; }
          audience = w; lastSig = null;
          setTimeout(function () { syncAudience(true); }, 50);
          syncAudience(true);
          return true;
        }
        document.getElementById("audience").addEventListener("click", function () {
          if (openAudience()) { if (window.cueToast) window.cueToast("Audience window open — drag it to the projector"); return; }
          if (window.cueToast) window.cueToast("Pop-ups are blocked — showing the slides fullscreen instead");
          if (!document.fullscreenElement && !stage.classList.contains("is-pseudo-fs")) fsBtn.click();
        });
        window.addEventListener("beforeunload", function () { if (audienceOpen()) audience.close(); });

        document.getElementById("back").addEventListener("click", prev);
        document.getElementById("next").addEventListener("click", next);
        document.getElementById("black").addEventListener("click", toggleBlackout);
        canvas.addEventListener("click", function () { playing ? pauseMedia() : playMedia(); });
        var fsBtn = document.getElementById("fs");
        function setPseudo(on) {
          stage.classList.toggle("is-pseudo-fs", on);
          fsBtn.textContent = on ? "Exit fullscreen" : "Fullscreen";
        }
        fsBtn.addEventListener("click", function () {
          try {
            if (stage.classList.contains("is-pseudo-fs")) { setPseudo(false); return; }
            if (document.fullscreenElement) {
              var ex = document.exitFullscreen();
              if (ex && ex.catch) ex.catch(function () {});
              return;
            }
            var req = stage.requestFullscreen ? stage.requestFullscreen() : null;
            if (req && req.catch) req.catch(function () { setPseudo(true); });
            else if (!req) setPseudo(true);
          } catch (err) { setPseudo(true); }
        });
        document.getElementById("fs-exit").addEventListener("click", function () { setPseudo(false); });
        document.addEventListener("fullscreenchange", function () {
          fsBtn.textContent = document.fullscreenElement ? "Exit fullscreen" : "Fullscreen";
        });
        document.addEventListener("keydown", function (e) {
          if (e.key === "Escape" && stage.classList.contains("is-pseudo-fs")) setPseudo(false);
        });
        // Clicker-style keys: arrows/space/PgUp/PgDn, B or . for blackout, a number then Enter to jump.
        var keyMsg = document.getElementById("key-msg");
        var digits = "", digitsTimer = null;
        function setDigits(d) {
          digits = d;
          clearTimeout(digitsTimer);
          if (keyMsg) keyMsg.textContent = d ? "Go to slide " + d + " — press Enter" : "";
          if (d) digitsTimer = setTimeout(function () { setDigits(""); }, 3000);
        }
        window.cueDigitsPending = function () { return digits; };
        document.addEventListener("keydown", function (e) {
          if (document.getElementById("panel-present").hidden) return;
          var tag = (e.target.tagName || "").toLowerCase();
          if (tag === "textarea" || tag === "input" || tag === "select") return;
          if (e.ctrlKey || e.metaKey || e.altKey) return;
          if (/^[0-9]$/.test(e.key)) { e.preventDefault(); if (digits.length < 3) setDigits(digits + e.key); return; }
          if (e.key === "Backspace" && digits) { e.preventDefault(); setDigits(digits.slice(0, -1)); return; }
          if (e.key === "Escape" && digits) { setDigits(""); return; }
          if (e.key === "Enter" && digits) {
            e.preventDefault();
            var n = parseInt(digits, 10);
            setDigits("");
            if (n >= 1 && n <= slides.length) goTo(n);
            else if (keyMsg) keyMsg.textContent = "Slide " + n + " doesn’t exist (deck has " + slides.length + ").";
            return;
          }
          if (e.key === "b" || e.key === "B" || e.key === ".") { e.preventDefault(); toggleBlackout(); return; }
          if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " " || e.key === "PageDown") { e.preventDefault(); next(); }
          else if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp") { e.preventDefault(); prev(); }
        });

        window.cueGetState = function () { return { slide: current + 1, playing: isPlaying(), black: stage.classList.contains("is-black") }; };
        window.cueSetState = function (s) {
          goTo(s.slide);
          if (s.playing) playMedia(); else pauseMedia();
          stage.classList.toggle("is-black", !!s.black);
          syncAudience();
        };
        window.cueDeck = {
          count: function () { return slides.length; },
          media: mediaSlide,
          isSample: function () { return isSample; },
          attached: function () { return attached ? { kind: attached.kind, slide: attached.slide, name: attached.name } : null; },
          load: loadDeck, sample: useSample, attach: attachMedia, detach: detachMedia
        };

        // ---------- Deck and media controls ----------
        var deckFile = document.getElementById("deck-file");
        var deckName = document.getElementById("deck-name");
        var deckMsg = document.getElementById("deck-msg");
        var mediaFile = document.getElementById("media-file");
        var mediaSlideIn = document.getElementById("media-slide");
        var mediaRemove = document.getElementById("media-remove");
        function refreshDeckUI() {
          var n = slides.length;
          deckName.textContent = (isSample ? "Sample deck" : "Your deck") + " · " + n + " slides";
          mediaSlideIn.max = n;
          if (+mediaSlideIn.value > n) mediaSlideIn.value = n;
          mediaRemove.disabled = !attached;
          if (attached) mediaSlideIn.value = attached.slide;
        }
        document.addEventListener("cuedeckchange", refreshDeckUI);
        refreshDeckUI();
        document.getElementById("deck-load").addEventListener("click", function () { deckFile.click(); });
        deckFile.addEventListener("change", function () {
          var n = loadDeck(deckFile.files || []);
          deckMsg.textContent = n ? "Loaded " + n + " slides, ordered by filename." : "No PNG or JPG images in that selection.";
          deckFile.value = "";
        });
        document.getElementById("deck-sample").addEventListener("click", function () {
          useSample();
          deckMsg.textContent = "Back to the built-in six slides.";
        });
        document.getElementById("media-attach").addEventListener("click", function () {
          var n = parseInt(mediaSlideIn.value, 10);
          if (!(n >= 1 && n <= slides.length)) { deckMsg.textContent = "Pick a slide from 1 to " + slides.length + "."; return; }
          mediaFile.click();
        });
        mediaFile.addEventListener("change", function () {
          var f = mediaFile.files && mediaFile.files[0];
          mediaFile.value = "";
          if (!f) return;
          if (!/^(video|audio)\//.test(f.type) && !/\.(mp4|webm|mov|m4v|ogv|mp3|m4a|wav|ogg|aac|flac)$/i.test(f.name)) { deckMsg.textContent = "That isn’t a video or audio file."; return; }
          var a = attachMedia(f, parseInt(mediaSlideIn.value, 10) || 1);
          deckMsg.textContent = "Attached " + f.name + " to slide " + a.slide + ".";
        });
        mediaRemove.addEventListener("click", function () {
          detachMedia();
          deckMsg.textContent = "Media removed." + (isSample ? " Play Video uses the sample clip on slide " + canvasSlide() + " again." : "");
        });
        window.goTo = goTo; window.next = next; window.prev = prev;
        window.playMedia = playMedia; window.pauseMedia = pauseMedia; window.toggleBlackout = toggleBlackout;
      })();
    
