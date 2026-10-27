// Conversation watch: listens while the user talks with the other driver and, when certain phrases are heard, asks the
// app to play the matching fixed reminder. The phrases and reminders come from the server (watch_hints.py); the
// matching is plain code, no model. The recognizer cannot tell speakers apart, so a reminder is meant for whoever spoke.
//
// Privacy: this file stores nothing and sends nothing. Heard text is only compared with the phrase list and dropped.
// (The browser may send audio to its own speech service, as with the other voice features.)
"use strict";

const Watch = (() => {
  const normalize = (text) =>
    String(text).toLowerCase().replace(/[’]/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();

  /** Rules whose phrase appears in `text` as whole words, in rule order. */
  function matchRules(text, rules) {
    const t = ` ${normalize(text)} `;
    return rules.filter((r) => r.phrases.some((p) => t.includes(` ${normalize(p)} `)));
  }

  /**
   * Start watching. `speech` is the Speech helper, `rules`/`cooldownSeconds` come from /api/watch-rules.
   * onHint(rule, done) must play rule.hint and call done() when it has finished (listening resumes then, so the
   * phone does not hear its own voice). onStatus("listening" | "paused" | "stopped" | "error", message) reports state.
   * `now` is injectable for tests. Returns { stop(), heard() }.
   */
  function start({ speech, rules, cooldownSeconds = 30, onHint, onStatus = () => {}, now = () => Date.now() }) {
    const lastSaid = {};
    const ctrl = { stopped: false, current: null, last: "" };

    const fire = (text) => {
      const t = now();
      return matchRules(text, rules).filter((r) => {
        if (lastSaid[r.id] !== undefined && t - lastSaid[r.id] < cooldownSeconds * 1000) return false;
        lastSaid[r.id] = t;
        return true;
      });
    };

    function round() {
      if (ctrl.stopped) return;
      let handled = false;
      let resumed = false;
      const resume = () => { if (resumed) return; resumed = true; if (!ctrl.stopped) { onStatus("listening"); setTimeout(round, 100); } };
      const check = (text) => {
        ctrl.last = text;
        if (handled || ctrl.stopped) return;
        const hits = fire(text);
        if (!hits.length) return;
        handled = true;
        onStatus("paused");
        if (ctrl.current) ctrl.current.stop();   // stop the microphone while the reminder plays
        onHint(hits[0], resume);
      };
      onStatus("listening");
      ctrl.current = speech.listen({
        onInterim: check,                         // interim text too: the reminder comes sooner
        onFinal: check,
        onError: (message, code) => {
          if (code === "no-speech" || handled) return;   // silence is normal; the round just ends
          ctrl.stopped = true;
          onStatus("error", message);
        },
        onEnd: () => { if (!handled) resume(); },
      });
    }

    round();
    return {
      stop() { ctrl.stopped = true; if (ctrl.current) ctrl.current.stop(); onStatus("stopped"); },
      heard() { return ctrl.last; },
    };
  }

  return { start, matchRules, normalize };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Watch;
