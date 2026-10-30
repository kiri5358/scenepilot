// Exercise the new coaching service with the real Watch loop and a controlled recognizer/network/clock.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import * as session from "../src/scenepilot/static/app/js/services/coach-session.js";
import { openCard, closeCard, backToTalk, endTalk } from "../src/scenepilot/static/app/js/flows/coach.js";

const require = createRequire(import.meta.url);
const realWatch = require("../src/scenepilot/static/watch.js");
const originals = new Map(["fetch", "Speech", "Watch", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "navigator", "document"]
  .map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const defer = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const response = (body) => ({ ok: true, json: async () => body });
function context(overlay = "coach") {
  let value = { overlay, cardReturnOverlay: null, coachPrefs: { mode: "screen", ai: true },
    coach: { status: "paused", hint: null, danger: null, aiError: false }, data: { session: { id: "one", stage: "hub" } } };
  return { state: { get: () => value }, update: (patch) => { value = { ...value, ...patch }; } };
}

let now = 0, timerId = 0;
const timers = new Map();
const schedule = (fn, delay, interval = false) => {
  const id = ++timerId;
  timers.set(id, { fn, due: now + delay, interval: interval ? delay : 0 });
  return id;
};
function tick(ms) {
  now += ms;
  for (const [id, timer] of [...timers]) {
    if (timer.due > now) continue;
    if (timer.interval) timer.due = now + timer.interval;
    else timers.delete(id);
    timer.fn();
  }
}

try {
  globalThis.setTimeout = (fn, ms = 0) => schedule(fn, ms);
  globalThis.setInterval = (fn, ms) => schedule(fn, ms, true);
  globalThis.clearTimeout = globalThis.clearInterval = (id) => timers.delete(id);
  const rounds = [];
  globalThis.Speech = {
    supported: () => true,
    listen(options) {
      const round = { ...options, stopped: false };
      rounds.push(round);
      return { stop() { if (!round.stopped) { round.stopped = true; round.onEnd(); } } };
    },
  };
  globalThis.Watch = realWatch;
  const rule = { id: "hostile", phrases: ["위협"], hint: "거리를 두고 112에 신고하세요." };

  // Leaving while the rules are loading must not turn the microphone back on later.
  const loading = defer();
  globalThis.fetch = () => loading.promise;
  const abandoned = context();
  const boot = session.start(abandoned, { mode: "screen", ai: true });
  assert.equal(session.isRunning(), true);
  session.forget();
  loading.resolve(response({ rules: [rule], cooldown_seconds: 30 }));
  assert.equal(await boot, false);
  assert.equal(rounds.length, 0);

  // A pending AI answer cannot replace a danger card or update the session after listening stops.
  const pending = defer();
  let coachCalls = 0, refreshes = 0;
  globalThis.fetch = (path) => {
    if (path.endsWith("/coach")) { coachCalls++; return pending.promise; }
    refreshes++;
    return Promise.resolve(response({ session: { id: "stale" } }));
  };
  const ctx = context();
  assert.equal(await session.start(ctx, { mode: "screen", ai: true }), true);
  const first = rounds.at(-1);
  first.onFinal("연락처를 알려드릴게요");
  await flush();
  assert.equal(coachCalls, 1);
  first.onInterim("위협");
  assert.equal(ctx.state.get().overlay, "coach-danger");
  assert.equal(ctx.state.get().coach.status, "paused");
  assert.equal(first.stopped, true);
  assert.equal(session.isRunning(), false);
  const danger = ctx.state.get().coach.danger;
  pending.resolve(response({ ok: true, suggested: ["other_contact"], hints: [{ id: "ai", hint: "일반 조언" }] }));
  await flush();
  tick(1000);
  assert.equal(rounds.length, 1, "the real Watch loop stays stopped on the danger screen");
  assert.equal(refreshes, 0, "an old response must not reload session data");
  assert.equal(ctx.state.get().coach.hint, danger);

  // Listening resumes only after the person explicitly leaves the danger card.
  await backToTalk(ctx);
  assert.equal(ctx.state.get().overlay, "coach");
  assert.equal(ctx.state.get().coach.danger, null);
  assert.equal(session.isRunning(), true);
  assert.equal(rounds.length, 2);

  // A danger heard while showing the other driver our card still stops listening immediately.
  openCard(ctx);
  rounds.at(-1).onInterim("위협");
  assert.equal(ctx.state.get().overlay, "my-card");
  assert.equal(session.isRunning(), false);
  closeCard(ctx);
  assert.equal(ctx.state.get().overlay, "coach-danger");
  endTalk(ctx);

  // Both entry screens return to themselves; opening the card twice does not lose its origin.
  for (const origin of ["coach", "no-talk"]) {
    const card = context(origin);
    openCard(card);
    openCard(card);
    closeCard(card);
    assert.equal(card.state.get().overlay, origin);
    assert.equal(card.state.get().cardReturnOverlay, null);
    assert.equal(session.isRunning(), false, "showing a card does not start a conversation");
  }

  // Danger reported by the AI follows the same stop/resume path as a local phrase rule.
  globalThis.fetch = async () => response({ ok: true, hints: [{ id: "pain", hint: "119에 연락하세요." }], suggested: [] });
  const aiDanger = context();
  await session.start(aiDanger, { mode: "screen", ai: true });
  rounds.at(-1).onFinal("목이 불편하다고 하네요");
  await flush();
  assert.equal(aiDanger.state.get().overlay, "coach-danger");
  assert.equal(aiDanger.state.get().coach.danger.id, "pain");
  assert.equal(session.isRunning(), false);
  const afterAiDanger = rounds.length;
  tick(1000);
  assert.equal(rounds.length, afterAiDanger);
  session.forget();

  // Preferences changed while paused apply when resuming, including disabling model requests.
  let disabledCoachCalls = 0;
  globalThis.fetch = async () => { disabledCoachCalls++; return response({ hints: [] }); };
  const changedPrefs = context();
  await session.start(changedPrefs, { mode: "screen", ai: true });
  session.pause();
  changedPrefs.update({ coachPrefs: { mode: "ear", ai: false } });
  await session.resume();
  rounds.at(-1).onFinal("보험사를 알려드릴게요");
  await flush();
  assert.equal(disabledCoachCalls, 0);
  session.forget();

  // A failed request from a previous run must not put the next run into an error state.
  const oldRequest = defer();
  globalThis.fetch = () => oldRequest.promise;
  const old = context();
  await session.start(old, { mode: "screen", ai: true });
  rounds.at(-1).onFinal("연락처");
  await flush();
  session.forget();
  const next = context();
  await session.start(next, { mode: "screen", ai: false });
  oldRequest.resolve({ ok: false, status: 500, json: async () => ({}) });
  await flush();
  assert.equal(next.state.get().coach.aiError, false);
  assert.equal(next.state.get().coach.status, "listening");
  session.forget();

  // A screen-lock request finishing after exit must be released, without starting recognition.
  const lockRequest = defer();
  let released = 0;
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { wakeLock: { request: () => lockRequest.promise } } });
  globalThis.document = { visibilityState: "visible" };
  const count = rounds.length;
  const locking = session.start(context(), { mode: "screen", ai: false });
  await flush();
  session.forget();
  lockRequest.resolve({ release: async () => { released++; }, addEventListener() {} });
  assert.equal(await locking, false);
  assert.equal(released, 1);
  assert.equal(rounds.length, count);
} finally {
  session.forget();
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
}

console.log("app coach checks passed");
