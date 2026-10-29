// The conversation watch with live coaching (src/scenepilot/static/watch.js). Run by tests/test_coach.py with node.
"use strict";
const assert = require("assert");
const Watch = require("../src/scenepilot/static/watch.js");

// a recognizer that replays sentences, one per listening round, and records when it is listening
function fakeSpeech(sentences, log) {
  let live = 0;
  return {
    listen({ onInterim, onFinal, onEnd }) {
      live += 1; log.push("listen");
      const ctrl = { stopped: false, stop() { ctrl.stopped = true; } };
      setTimeout(() => {
        if (!ctrl.stopped) {
          const next = sentences.shift();
          if (next !== undefined) { onInterim(next); onFinal(next); }
        }
        live -= 1; log.push("end");
        onEnd();
      }, 5);
      return ctrl;
    },
    get live() { return live; },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // ---- a coach reminder is played, and nothing is heard while it plays ----
  {
    const log = [];
    const sent = [];
    const said = [];
    let playingNow = false;
    const speech = fakeSpeech(["여기 서명하세요 합의서예요", "네 알겠습니다", "날씨가 좋네요"], log);
    const handle = Watch.start({
      speech, rules: [], cooldownSeconds: 30, compact: true,
      coach: {
        windowChars: 40, minGapMs: 0,
        send: async (text, seconds) => { sent.push([text, seconds]); return { hints: [{ id: "sign", hint: "이해하지 못한 서류에는 서명하지 마세요." }] }; },
      },
      onHint: (rule, done) => { said.push(rule.id); playingNow = true; assert.strictEqual(speech.live, 0, "the recognizer must be off while a reminder plays"); setTimeout(() => { playingNow = false; done(); }, 20); },
    });
    await sleep(400);
    handle.stop();
    assert.ok(sent.length >= 1 && typeof sent[0][1] === "number", "the coach was asked");
    assert.strictEqual(sent[0][0], "여기 서명하세요 합의서예요");
    assert.deepStrictEqual(said, ["sign"], "the same reminder is not repeated inside its cooldown");
    assert.ok(sent.every(([t]) => t.length <= 40), "only the window of recent talk is sent");
  }

  // ---- the coach is slow or fails: the watch keeps going ----
  {
    const said = [];
    const log = [];
    const speech = fakeSpeech(["첫 문장입니다", "둘째 문장입니다", "셋째 문장입니다"], log);
    let calls = 0;
    const handle = Watch.start({
      speech, rules: [{ id: "fault", phrases: ["제잘못"], hint: "사실만 말하세요." }], compact: true,
      coach: { minGapMs: 0, send: async () => { calls += 1; throw new Error("network"); } },
      onHint: (rule, done) => { said.push(rule.id); setTimeout(done, 5); },
    });
    await sleep(300);
    handle.stop();
    assert.ok(calls >= 1 && log.filter((x) => x === "listen").length >= 3, "listening went on after a failed coach call");
    assert.deepStrictEqual(said, []);
  }

  // ---- a local rule and a coach answer never play at the same time ----
  {
    const said = [];
    const speech = fakeSpeech(["제 잘못이에요"], []);
    let release;
    const gate = new Promise((r) => { release = r; });
    const handle = Watch.start({
      speech, rules: [{ id: "fault", phrases: ["제잘못"], hint: "사실만 말하세요." }], compact: true,
      coach: { minGapMs: 0, send: async () => { await gate; return { hints: [{ id: "tone", hint: "천천히, 사실만 말하세요." }] }; } },
      onHint: (rule, done) => { said.push(rule.id); setTimeout(done, 200); },
    });
    await sleep(60);
    release();
    await sleep(100);
    handle.stop();
    assert.deepStrictEqual(said, ["fault"], "a reminder already playing is not interrupted by a late coach answer");
  }

  // ---- without a coach the watch works as before ----
  {
    const said = [];
    const speech = fakeSpeech(["제 잘못이에요"], []);
    const handle = Watch.start({
      speech, rules: [{ id: "fault", phrases: ["제잘못"], hint: "사실만 말하세요." }], compact: true,
      onHint: (rule, done) => { said.push(rule.id); setTimeout(done, 5); },
    });
    await sleep(100);
    handle.stop();
    assert.deepStrictEqual(said, ["fault"]);
  }

  console.log("coach checks passed");
})().catch((e) => { console.error(e); process.exit(1); });
