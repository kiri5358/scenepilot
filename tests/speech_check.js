// Checks spoken-command matching and the ?fakespeech test mode in src/scenepilot/static/speech.js.
// Run by tests/test_speech_js.py with node. Exits non-zero on any failure.
"use strict";
const path = require("path");

const failures = [];
function eq(name, got, want) {
  if (got !== want) failures.push(`${name}: got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
}

global.window = { location: { search: "?fakespeech=No%7CYes%20my%20passenger%20is%20hurt%7Cnext" }, isSecureContext: false };
const Speech = require(path.join(__dirname, "..", "src", "scenepilot", "static", "speech.js"));
const C = Speech.COMMANDS;

// guide commands
eq("next", Speech.match("Next please", C.guide), "next");
eq("continue", Speech.match("okay, continue", C.guide), "next");
eq("repeat", Speech.match("can you say that again", C.guide), "repeat");
eq("back", Speech.match("go back", C.guide), "back");
eq("skip", Speech.match("skip to photos", C.guide), "skip");
eq("gibberish", Speech.match("blah blah", C.guide), null);
eq("empty", Speech.match("", C.guide), null);
eq("partial word is not a match", Speech.match("nextdoor neighbor", C.guide), null);

// state step: the longest phrase wins, so "not sure" is not read as "sure"
eq("florida", Speech.match("Florida please", C.state), "FL");
eq("new york", Speech.match("it's New York", C.state), "NY");
eq("another state", Speech.match("another state", C.state), "OTHER");
eq("not sure", Speech.match("I'm not sure", C.state), "UNSURE");
eq("don't know", Speech.match("I don't know", C.state), "UNSURE");
eq("confirm", Speech.match("yes that's right", C.state), "confirm");
eq("apostrophe styles", Speech.match("that’s right", C.state), "confirm");

// hub and emergency
eq("summary", Speech.match("create summary", C.hub), "summary");
eq("more photos beats photos+summary", Speech.match("take more photos", C.hub), "photos");
eq("details", Speech.match("add details", C.hub), "details");
eq("emergency ack", Speech.match("got it, I called", C.emergency), "ack");
eq("emergency ack: safe", Speech.match("I'm safe", C.emergency), "ack");
eq("emergency: unrelated", Speech.match("what is happening", C.emergency), null);

// normalize
eq("normalize", Speech.normalize("  It’s  NEW-York!! "), "it's new york");

// ---- test mode and support checks ----
async function asyncChecks() {
  eq("fake mode counts as supported even on an insecure page", Speech.supported(), true);
  eq("fakeActive", Speech.fakeActive(), true);

  const heard = [];
  for (let i = 0; i < 4; i++) {
    const events = [];
    await new Promise((resolve) => {
      Speech.listen({
        onInterim: (t) => events.push(["interim", t]),
        onFinal: (t) => events.push(["final", t]),
        onError: (m, code) => events.push(["error", code]),
        onEnd: resolve,
      });
    });
    heard.push(events);
  }
  eq("turn 1 final", JSON.stringify(heard[0].filter((e) => e[0] === "final")), JSON.stringify([["final", "No"]]));
  eq("turn 2 final", JSON.stringify(heard[1].filter((e) => e[0] === "final")), JSON.stringify([["final", "Yes my passenger is hurt"]]));
  eq("turn 3 final", JSON.stringify(heard[2].filter((e) => e[0] === "final")), JSON.stringify([["final", "next"]]));
  eq("turn 4: nothing left means no-speech", JSON.stringify(heard[3].filter((e) => e[0] === "error")), JSON.stringify([["error", "no-speech"]]));

  // stopping a listening turn cancels it
  global.window.location.search = "?fakespeech=hello";
}

asyncChecks().then(() => {
  // A fresh module without test mode on an insecure page reports "not supported"
  delete require.cache[require.resolve(path.join(__dirname, "..", "src", "scenepilot", "static", "speech.js"))];
  global.window = { location: { search: "" }, isSecureContext: false };
  const Plain = require(path.join(__dirname, "..", "src", "scenepilot", "static", "speech.js"));
  eq("not supported without HTTPS or a recognizer", Plain.supported(), false);
  return new Promise((resolve) => {
    Plain.listen({
      onError: (msg, code) => { eq("unsupported code", code, "unsupported"); eq("unsupported message mentions HTTPS", /HTTPS/.test(msg), true); },
      onEnd: resolve,
    });
  });
}).then(() => {
  if (failures.length) {
    console.error("FAILURES:\n" + failures.join("\n"));
    process.exit(1);
  }
  console.log("speech checks passed");
});
