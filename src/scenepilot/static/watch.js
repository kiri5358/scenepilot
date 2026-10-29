// Conversation watch: listens while the user talks with the other driver and, when certain phrases are heard, asks the
// app to play the matching fixed reminder. The phrases and reminders come from the server (watch_hints.py); the
// matching is plain code, no model. The recognizer cannot tell speakers apart, so a reminder is meant for whoever spoke.
//
// Live coaching (Korea edition, off unless the user switches it on): every finished sentence is also handed to
// `coach.send(text, seconds)`, which asks the server's model what it hears. The answer is a list of fixed reminders
// ({ id, hint }); this file only plays the first one that is not in its cooldown. The model never writes what is said.
//
// Privacy: this file stores nothing and sends nothing itself. Heard text is compared with the phrase list and dropped
// (with coaching on, the app sends the last few sentences to our server for that one request). The browser may send audio
// to its own speech service, as with the other voice features.
"use strict";

const Watch = (() => {
  const normalize = (text) =>
    String(text).toLowerCase().replace(/[’]/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();

  // Korean rules: the server sends phrases with every space removed, and they match as plain substrings of the heard
  // text with its spaces removed (Korean words carry endings, so whole-word matching would miss them).
  const compactText = (text) => String(text).toLowerCase().replace(/[^0-9a-zㄱ-ㆎ가-힣]+/g, "");

  /** Rules whose phrase appears in `text` (as whole words, or as stems when `compact`), in rule order. */
  function matchRules(text, rules, compact = false) {
    if (compact) {
      const c = compactText(text);
      return rules.filter((r) => r.phrases.some((p) => p && c.includes(p)));
    }
    const t = ` ${normalize(text)} `;
    return rules.filter((r) => r.phrases.some((p) => t.includes(` ${normalize(p)} `)));
  }

  /**
   * Start watching. `speech` is the Speech helper, `rules`/`cooldownSeconds` come from /api/watch-rules.
   * onHint(rule, done) must play rule.hint and call done() when it has finished (listening resumes then, so the
   * phone does not hear its own voice). onStatus("listening" | "paused" | "stopped" | "error", message) reports state.
   * `coach` (optional) is { send(text, seconds) -> Promise<{ hints: [{ id, hint }] }>, windowChars, minGapMs }.
   * `now` is injectable for tests. Returns { stop(), heard() }.
   */
  function start({ speech, rules, cooldownSeconds = 30, compact = false, coach = null, onHint, onStatus = () => {}, now = () => Date.now() }) {
    const lastSaid = {};
    const ctrl = { stopped: false, current: null, last: "" };
    const startedAt = now();
    let playing = false;   // a reminder is being said: nothing is heard meanwhile, so the phone never hears itself
    let active = false;    // a listening round is running
    let talk = "";         // the last sentences, for the coach
    let inflight = false;
    let lastSend = -Infinity;

    const cooling = (id) => lastSaid[id] !== undefined && now() - lastSaid[id] < cooldownSeconds * 1000;
    const fire = (text) => matchRules(text, rules, compact).filter((r) => {
      if (cooling(r.id)) return false;
      lastSaid[r.id] = now();
      return true;
    });

    function next() {
      if (ctrl.stopped || playing) return;
      onStatus("listening");
      setTimeout(round, 100);
    }

    // Stop listening, say the reminder, then listen again.
    function play(rule) {
      if (ctrl.stopped || playing) return false;
      playing = true;
      onStatus("paused");
      if (ctrl.current) ctrl.current.stop();
      onHint(rule, () => { playing = false; next(); });
      return true;
    }

    function feedCoach(text) {
      if (!coach || ctrl.stopped) return;
      talk = (talk + " " + text).trim().slice(-(coach.windowChars || 500));
      if (inflight || now() - lastSend < (coach.minGapMs || 2500)) return;
      inflight = true;
      lastSend = now();
      Promise.resolve()
        .then(() => coach.send(talk, Math.round((now() - startedAt) / 1000)))
        .then((res) => {
          const hit = ((res && res.hints) || []).find((h) => h && h.id && h.hint && !cooling(h.id));
          if (!hit) return;
          lastSaid[hit.id] = now();
          play({ id: hit.id, hint: hit.hint, phrases: [] });
        })
        .catch(() => { /* coaching must never stop the watch */ })
        .finally(() => { inflight = false; });
    }

    function round() {
      if (ctrl.stopped || playing || active) return;
      active = true;
      const check = (text, finished) => {
        ctrl.last = text;
        if (ctrl.stopped || playing) return;
        const hits = fire(text);
        if (hits.length) play(hits[0]);
        else if (finished) feedCoach(text);
      };
      onStatus("listening");
      ctrl.current = speech.listen({
        onInterim: (text) => check(text, false),   // interim text too: the reminder comes sooner
        onFinal: (text) => check(text, true),
        onError: (message, code) => {
          if (code === "no-speech" || playing) return;   // silence is normal; the round just ends
          ctrl.stopped = true;
          onStatus("error", message);
        },
        onEnd: () => { active = false; if (!playing) next(); },
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
