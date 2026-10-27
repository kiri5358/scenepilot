// Checks the conversation watch in src/scenepilot/static/watch.js. Run by tests/test_watch.py with node.
// Input on stdin: the JSON from /api/watch-rules plus phrase cases. Exits non-zero on any failure.
"use strict";
const path = require("path");

const failures = [];
const eq = (name, got, want) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) failures.push(`${name}: got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
};

let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  const { rules, cooldown_seconds: cooldown, cases } = JSON.parse(input);
  global.window = { location: { search: "" }, isSecureContext: false };
  const Watch = require(path.join(__dirname, "..", "src", "scenepilot", "static", "watch.js"));

  // the browser matcher must agree with the Python matcher on every case
  for (const [text, want] of cases) eq(`match ${text}`, Watch.matchRules(text, rules).map((r) => r.id), want);

  // a fake recognizer that replays phrases, one per listening round
  function fakeSpeech(phrases) {
    return {
      listen({ onInterim, onFinal, onEnd }) {
        const ctrl = { stopped: false, stop() { ctrl.stopped = true; } };
        setTimeout(() => {
          if (ctrl.stopped) return;
          const next = phrases.shift();
          if (next !== undefined) { onInterim(next); onFinal(next); }
          onEnd();
        }, 1);
        return ctrl;
      },
    };
  }

  let clock = 0;
  const said = [];
  const statuses = [];
  const phrases = ["it was my fault", "nice weather", "my fault again", "i'll pay you cash", "oh it is my fault"];
  const handle = Watch.start({
    speech: fakeSpeech(phrases), rules, cooldownSeconds: cooldown, now: () => clock,
    onHint: (rule, done) => { said.push(rule.id); clock += 5000; setTimeout(done, 1); },
    onStatus: (s) => statuses.push(s),
  });
  setTimeout(() => {
    // the second "fault" is within the cooldown (only 5 s later), so only fault and deal are said so far
    eq("said before cooldown ends", said, ["fault", "deal"]);
    eq("paused while a reminder plays", statuses.includes("paused"), true);
    handle.stop();
    eq("stopped", statuses[statuses.length - 1], "stopped");
    console.log(failures.length ? "FAILED\n" + failures.join("\n") : "watch checks passed");
    process.exit(failures.length ? 1 : 0);
  }, 1500);   // each round restarts after a 100 ms pause
});
