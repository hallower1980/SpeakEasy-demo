/* SpeakEasy recognizer: the browser's built-in speech recognition (Web Speech API).
 *
 * Every SpeakEasy recognizer has the same shape, so the matcher in voice.js never
 * needs to know which engine is listening:
 *
 *   var r = SpeakEasyRecognizers.<engine>.create({
 *     lang: "en-US",
 *     onResult: function (key, text, isFinal) {},  // key is stable while a result is revised
 *     onState: function (state, info) {},          // "starting" | "listening" | "reconnecting" | "sending" | "gated" | "stopped"
 *     onError: function (err) {},                  // { code, message, fatal, ... }; fatal means the engine has stopped
 *     onSessionEnd: function () {}                 // interim results from the last session can be dropped
 *   });
 *   r.start(); r.stop();
 *
 * Free; Chrome sends audio to Google's speech service and Safari to Apple's.
 */
(function () {
  var R = window.SpeakEasyRecognizers = window.SpeakEasyRecognizers || {};
  function SR() { return window.SpeechRecognition || window.webkitSpeechRecognition || null; }
  var FATAL = { "not-allowed": 1, "service-not-allowed": 1, "language-not-supported": 1 };

  R.browser = {
    name: "browser",
    label: "Browser",
    supported: function () { return !!SR(); },
    create: function (opts) {
      var Ctor = SR();
      var noop = function () {};
      var onResult = opts.onResult || noop, onState = opts.onState || noop, onError = opts.onError || noop, onSessionEnd = opts.onSessionEnd || noop;
      var rec = null, wanted = false, started = false, lastErr = "", errCount = 0, session = 0, startTimer = null, everListened = false;

      function make() {
        rec = new Ctor();
        rec.continuous = true; rec.interimResults = true; rec.lang = opts.lang || "en-US";
        rec.onstart = function () {
          started = true; everListened = true; clearTimeout(startTimer);
          if (!wanted) { try { rec.stop(); } catch (e) {} return; }
          onState("listening", { recovered: !!lastErr });
        };
        rec.onresult = function (ev) {
          lastErr = ""; errCount = 0;
          for (var i = ev.resultIndex; i < ev.results.length; i++) {
            onResult("s" + session + ":" + i, ev.results[i][0].transcript, ev.results[i].isFinal);
          }
        };
        rec.onerror = function (ev) {
          var err = (ev && ev.error) || "unknown";
          if (err === "aborted") return;
          lastErr = err;
          if (FATAL[err]) {
            wanted = false; clearTimeout(startTimer);
            try { rec.abort(); } catch (e) {}
            onError({ code: err, fatal: true, everListened: everListened });
            return;
          }
          errCount++;
          onError({ code: err, fatal: false, count: errCount });
        };
        rec.onend = function () {
          started = false;
          session++;
          onSessionEnd();
          if (!wanted) { onState("stopped"); return; }
          var hard = lastErr && lastErr !== "no-speech";
          if (hard) onState("reconnecting", { code: lastErr });
          setTimeout(function () { if (wanted && !started) begin(); }, hard ? Math.min(1000 * errCount, 5000) : 250);
        };
      }
      function begin() {
        if (!rec) make();
        clearTimeout(startTimer);
        startTimer = setTimeout(function () {
          if (wanted && !started) {
            wanted = false;
            try { rec.abort(); } catch (e) {}
            onError({ code: "start-timeout", fatal: true });
          }
        }, 6000);
        try { rec.start(); }
        catch (e) {
          if (/already/i.test(String(e && e.message))) return;
          wanted = false; clearTimeout(startTimer);
          onError({ code: "start-failed", fatal: true, message: e && e.message ? e.message : "unknown error" });
        }
      }
      return {
        name: "browser",
        start: function () {
          if (!Ctor) { onError({ code: "unsupported", fatal: true }); return; }
          wanted = true; lastErr = ""; errCount = 0;
          onState("starting");
          begin();
        },
        stop: function () {
          wanted = false; clearTimeout(startTimer);
          if (rec) { try { rec.stop(); } catch (e) {} }
        },
        abort: function () {
          wanted = false; clearTimeout(startTimer);
          if (rec) { try { rec.abort(); } catch (e) {} }
        }
      };
    }
  };
})();
