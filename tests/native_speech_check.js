// Checks android-app/native/native-speech.js against a fake Android speech plugin. Run by tests/test_android_app.py.
"use strict";
const path = require("path");
const failures = [];
const eq = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) failures.push(`${name}: got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`); };

function fakePlugin({ permission = "granted", say = [], stopAfter = 30, finalAfterStop = null, rejectStart = null } = {}) {
  const listeners = {};
  return {
    available: async () => ({ available: true }),
    checkPermissions: async () => ({ speechRecognition: permission }),
    requestPermissions: async () => ({ speechRecognition: permission }),
    addListener: async (name, cb) => { listeners[name] = cb; return { remove: () => { delete listeners[name]; } }; },
    stop: async () => { setTimeout(() => listeners.listeningState && listeners.listeningState({ status: "stopped" }), 0); },
    start: async () => {
      if (rejectStart) { setTimeout(() => {
        // the real plugin goes on listening even after a stale rejection
        if (finalAfterStop) { setTimeout(() => listeners.listeningState && listeners.listeningState({ status: "stopped" }), 20);
                              setTimeout(() => listeners.partialResults && listeners.partialResults({ matches: [finalAfterStop] }), 40); }
      }, 0); throw new Error(rejectStart); }
      if (finalAfterStop) {   // what the phone really does: "stopped" first, the final text a moment later
        setTimeout(() => listeners.listeningState && listeners.listeningState({ status: "stopped" }), 20);
        setTimeout(() => listeners.partialResults && listeners.partialResults({ matches: [finalAfterStop] }), 40);
        return;
      }
      say.forEach((text, i) => setTimeout(() => listeners.partialResults && listeners.partialResults({ matches: [text] }), 5 + i * 5));
      setTimeout(() => listeners.listeningState && listeners.listeningState({ status: "stopped" }), stopAfter);
    },
  };
}

function load(plugin) {
  delete require.cache[require.resolve(path.join(__dirname, "..", "src", "scenepilot", "static", "speech.js"))];
  delete require.cache[require.resolve(path.join(__dirname, "..", "android-app", "native", "native-speech.js"))];
  global.window = { location: { search: "" }, isSecureContext: true, Capacitor: { isNativePlatform: () => true, Plugins: { SpeechRecognition: plugin } } };
  global.Speech = require(path.join(__dirname, "..", "src", "scenepilot", "static", "speech.js"));
  require(path.join(__dirname, "..", "android-app", "native", "native-speech.js"));
  return global.Speech;
}

const turn = (Speech, stopEarly = false) => new Promise((resolve) => {
  const events = [];
  const ctrl = Speech.listen({
    onInterim: (t) => events.push(["interim", t]), onFinal: (t) => events.push(["final", t]),
    onError: (m, code) => events.push(["error", code]), onEnd: () => resolve(events),
  });
  if (stopEarly) setTimeout(() => ctrl.stop(), 8);
});

(async () => {
  let Speech = load(fakePlugin({ say: ["no", "no one is hurt"] }));
  await new Promise((r) => setTimeout(r, 10));
  eq("supported once the plugin says available", Speech.supported(), true);
  eq("final text is the last partial result", (await turn(Speech)).filter((e) => e[0] === "final"), [["final", "no one is hurt"]]);

  // the recognizer's other guesses are passed along (in noise the right word is often not the first one)
  let seen = null;
  {
    const listeners = {};
    const p = fakePlugin();
    p.addListener = async (name, cb) => { listeners[name] = cb; return { remove: () => { delete listeners[name]; } }; };
    p.start = async (o) => {
      seen = o.maxResults;
      setTimeout(() => listeners.partialResults({ matches: ["know", "no", "node"] }), 5);
      setTimeout(() => listeners.listeningState({ status: "stopped" }), 20);
    };
    Speech = load(p);
    const got = await new Promise((resolve) => Speech.listen({ onFinal: (text, guesses) => resolve([text, guesses]), onError: () => resolve(null), onEnd: () => {} }));
    eq("final text and the other guesses", got, ["know", ["know", "no", "node"]]);
    eq("asks the recognizer for several guesses", seen, 5);
  }

  // Regression (phone test 2026-10-23): "stopped" came before the text, so a correct "no" was reported as silence
  Speech = load(fakePlugin({ finalAfterStop: "no" }));
  eq("final text that arrives after 'stopped' is kept", (await turn(Speech)).filter((e) => e[0] !== "interim"), [["final", "no"]]);

  Speech = load(fakePlugin({ finalAfterStop: "yes", rejectStart: "Didn't understand, please try again." }));
  eq("a stale 'didn't understand' from the last turn does not end this one", (await turn(Speech)).filter((e) => e[0] !== "interim"), [["final", "yes"]]);

  Speech = load(fakePlugin({ rejectStart: "Network error" }));
  eq("network failure is reported as such", (await turn(Speech)).filter((e) => e[0] === "error"), [["error", "network"]]);

  Speech = load(fakePlugin({ permission: "denied" }));
  eq("permission denied", (await turn(Speech)).filter((e) => e[0] === "error"), [["error", "not-allowed"]]);

  Speech = load(fakePlugin({ say: [] }));
  eq("silence", (await turn(Speech)).filter((e) => e[0] === "error"), [["error", "no-speech"]]);

  // Android keeps listening for ~2 s of silence; we stop it once the text has settled, so the answer arrives sooner
  Speech = load(fakePlugin({ say: ["no"], stopAfter: 5000 }));
  const t0 = Date.now();
  const quick = await turn(Speech);
  eq("settled text ends the turn early", quick.filter((e) => e[0] === "final"), [["final", "no"]]);
  eq("and well before the recognizer's own stop", Date.now() - t0 < 2000, true);

  Speech = load(fakePlugin({ say: ["hello"], stopAfter: 200 }));
  eq("stopping cancels the turn without a result", (await turn(Speech, true)).filter((e) => e[0] !== "interim"), []);

  // outside the app (no Capacitor) the web recognizer is left alone
  delete require.cache[require.resolve(path.join(__dirname, "..", "android-app", "native", "native-speech.js"))];
  global.window = { location: { search: "" }, isSecureContext: false };
  global.Speech = require(path.join(__dirname, "..", "src", "scenepilot", "static", "speech.js"));
  const before = global.Speech.listen;
  require(path.join(__dirname, "..", "android-app", "native", "native-speech.js"));
  eq("web recognizer untouched without the app", global.Speech.listen === before, true);

  if (failures.length) { console.error("FAILURES:\n" + failures.join("\n")); process.exit(1); }
  console.log("native speech checks passed");
})();
