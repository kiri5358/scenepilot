// Reading aloud when the person moves on quickly: a clip that is stopped must never turn into the phone's voice reading the
// old sentence on top of the new one. Run with node (tests/test_app_ui.py runs it).
import assert from "node:assert/strict";

const spoken = [];
const audios = [];
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.window = {
  speechSynthesis: { cancel() {}, getVoices: () => [], speak(u) { spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 0); } },
};
globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
// like a browser: pausing a clip whose play() has not started yet rejects that promise with an AbortError
globalThis.Audio = class {
  constructor(src) { this.src = src; audios.push(this); }
  play() { return new Promise((resolve, reject) => { this.resolve = resolve; this.reject = reject; }); }
  pause() { if (this.reject) this.reject(Object.assign(new Error("The play() request was interrupted"), { name: "AbortError" })); }
};
globalThis.fetch = async () => ({ ok: true, json: async () => ({ items: { "첫 문장입니다.": "a.mp3", "둘째 문장입니다.": "b.mp3" } }) });

const speaker = await import("../src/scenepilot/static/app/js/services/speak.js");
const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
await speaker.loadClips();

// 1. moving on while a clip is still starting: only the new sentence may be heard
speaker.speak(["첫 문장입니다."], { force: true });
assert.equal(audios.length, 1, "the first clip was created");
speaker.speak(["파일이 없는 새 문장입니다."], { force: true });   // no clip for it: the phone's voice
await tick();
assert.deepEqual(spoken, ["파일이 없는 새 문장입니다."], "the stopped clip did not fall back to the phone's voice");

// 2. several quick moves in a row
spoken.length = 0;
for (const sentence of ["첫 문장입니다.", "둘째 문장입니다.", "첫 문장입니다.", "둘째 문장입니다."]) speaker.speak([sentence], { force: true });
speaker.speak(["마지막 문장입니다."], { force: true });
await tick();
assert.deepEqual(spoken, ["마지막 문장입니다."], "only the last sentence is read");

// 3. a clip that the browser refuses to play (no first tap yet) still falls back to the phone's voice
spoken.length = 0;
const before = audios.length;
speaker.speak(["첫 문장입니다."], { force: true });
audios[before].reject(Object.assign(new Error("blocked"), { name: "NotAllowedError" }));
await tick();
assert.deepEqual(spoken, ["첫 문장입니다."], "a blocked clip is read by the phone's voice");

// 4. stop() really stops the phone's voice queue
spoken.length = 0;
speaker.speak(["하나입니다.", "둘입니다."], { force: true });
speaker.stop();
await tick();
assert.ok(spoken.length <= 1, "after stop() the rest of the list is not read");

// 5. every clip of a list is asked for at once, so the next sentence has arrived when the previous one ends
speaker.stop();
const base = audios.length;
speaker.speak(["첫 문장입니다.", "둘째 문장입니다.", "파일이 없는 문장입니다."], { force: true });
assert.equal(audios.length - base, 2, "both clips of the list were created (and started loading) before the first one finished");
assert.ok(audios.slice(base).every((a) => a.preload === "auto"), "they are marked to preload");
speaker.stop();
console.log("app speak checks passed");
