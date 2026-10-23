// Checks android-app/native/native-tts.js against a fake Android text-to-speech plugin. Run by tests/test_android_app.py.
"use strict";
const path = require("path");
const failures = [];
const eq = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) failures.push(`${name}: got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function load(plugin) {
  const file = path.join(__dirname, "..", "android-app", "native", "native-tts.js");
  delete require.cache[require.resolve(file)];
  global.window = { Capacitor: { isNativePlatform: () => true, Plugins: { TextToSpeech: plugin } } };
  require(file);
  return global.window;
}

(async () => {
  const spoken = [];
  const pending = [];
  const plugin = {
    speak: (o) => new Promise((resolve, reject) => { spoken.push(o.text); pending.push({ resolve, reject }); }),
    stop: async () => {},
  };
  let w = load(plugin);
  eq("replaces speechSynthesis", typeof w.speechSynthesis.speak, "function");

  // 1) the end of speech is reported when the plugin says it is done
  const a = new w.SpeechSynthesisUtterance("hello"); const events = [];
  a.onend = () => events.push("a-end");
  w.speechSynthesis.speak(a);
  eq("speaking while it talks", w.speechSynthesis.speaking, true);
  pending[0].resolve(); await wait(5);
  eq("end reported", events, ["a-end"]);
  eq("not speaking after the end", w.speechSynthesis.speaking, false);

  // 2) a cancelled utterance stays quiet, the next one reports normally
  const b = new w.SpeechSynthesisUtterance("first"); const c = new w.SpeechSynthesisUtterance("second");
  b.onend = () => events.push("b-end"); b.onerror = () => events.push("b-error"); c.onend = () => events.push("c-end");
  w.speechSynthesis.speak(b);
  w.speechSynthesis.cancel();
  w.speechSynthesis.speak(c);
  pending[1].resolve(); pending[2].resolve(); await wait(5);
  eq("only the live utterance reports", events, ["a-end", "c-end"]);

  // 3) a failure is reported so the app does not wait for an end that never comes
  const d = new w.SpeechSynthesisUtterance("fail"); d.onerror = () => events.push("d-error");
  w.speechSynthesis.speak(d);
  pending[3].reject(new Error("no engine")); await wait(5);
  eq("error reported", events.slice(-1), ["d-error"]);

  // outside the app (no plugin) the browser's own speechSynthesis is left alone
  global.window = { speechSynthesis: "browser" };
  delete require.cache[require.resolve(path.join(__dirname, "..", "android-app", "native", "native-tts.js"))];
  require(path.join(__dirname, "..", "android-app", "native", "native-tts.js"));
  eq("browser speechSynthesis untouched", global.window.speechSynthesis, "browser");

  if (failures.length) { console.error("FAILURES:\n" + failures.join("\n")); process.exit(1); }
  console.log("native tts checks passed");
})();
