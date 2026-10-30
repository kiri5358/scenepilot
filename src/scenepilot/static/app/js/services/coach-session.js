// The talk coaching while the person speaks with the other driver. It listens with the phone's microphone (the old
// continuous-listening loop, watch.js), matches the fixed phrase rules, and, when the AI coach is on, hands the last few
// sentences to the server, which answers with fixed reminders and details it heard. Nothing heard is stored or logged:
// the text lives only in the request. A reminder is shown (and the phone vibrates), or, in "ear" mode, read aloud.
import { api, post, sessionPath } from "../core/api.js";
import { planHint } from "../core/coach.js";
import { getLang } from "../core/i18n.js";
import * as speaker from "./speak.js";
import { vibrate } from "./vibrate.js";
import { keepAwake, release } from "./wakelock.js";
import { closeSheet } from "../ui/sheet.js";

const HEARD_POLL_MS = 400;
const MAX_HEARD_CHARS = 70;

let handle = null;
let rules = null;
let rulesLanguage = null;
let protocol = {};
let cooldown = 30;
let poller = null;
let current = null;   // { ctx, mode, ai }
let activeRun = null; // also covers start-up; callbacks from a stopped run must not change a later one

const speech = () => (typeof Speech !== "undefined" ? Speech : null);
const watcher = () => (typeof Watch !== "undefined" ? Watch : null);

export const isSupported = () => Boolean(speech() && speech().supported() && watcher());
export const isRunning = () => activeRun !== null;

function setCoach(patch) {
  if (!current) return;
  const { ctx } = current;
  ctx.update({ coach: { ...ctx.state.get().coach, ...patch } });
}

export async function loadProtocol() {
  const language = getLang();
  if (rules && rulesLanguage === language) return protocol;
  const r = await api(`/api/watch-rules?country=KR${language === "en" ? "&language=en" : ""}`);
  rules = r.rules || [];
  rulesLanguage = language;
  protocol = r;
  cooldown = r.cooldown_seconds || 30;
  return protocol;
}

// What the server's coach says about the last sentences. Details it heard are kept by the server as unconfirmed
// suggestions; the session is read again so the checklist shows them.
async function sendToCoach(run, text, seconds) {
  if (activeRun !== run) return { hints: [] };
  const { ctx } = run;
  const data = ctx.state.get().data;
  let result;
  try {
    result = await post(sessionPath(data.session.id, "coach"), { text, elapsed_s: seconds, language: getLang() });
  } catch {
    if (activeRun === run) setCoach({ aiError: true });
    return { hints: [] };
  }
  if (activeRun !== run) return { hints: [] };
  if (ctx.state.get().coach.aiError === result.ok) setCoach({ aiError: !result.ok });
  if (result.suggested && result.suggested.length) {
    try {
      const fresh = await api(sessionPath(data.session.id));
      if (activeRun === run) ctx.update({ data: fresh });
    } catch { /* the next answer will bring them */ }
  }
  return activeRun === run ? result : { hints: [] };
}

// The line "what was just heard" is written straight into the page (no redraw). The screen is redrawn for other reasons
// now and then, so the text is put back at the next tick.
function showHeard(text) {
  const el = typeof document !== "undefined" ? document.getElementById("heard-text") : null;
  if (!el) return;
  const shown = text.length > MAX_HEARD_CHARS ? `…${text.slice(-MAX_HEARD_CHARS)}` : text;
  if (el.textContent !== shown) el.textContent = shown;
}

function onHint(run, rule, done) {
  const plan = planHint(rule, protocol);
  if (!plan || activeRun !== run) { done(); return; }
  const { ctx, mode } = run;
  vibrate(plan.pattern);
  if (plan.category === "danger") {
    // Stop the ordinary coaching: safety first. A person who is showing their own card gets it when they close it.
    const onCard = ctx.state.get().overlay === "my-card";
    stop({ quiet: true });
    closeSheet();
    setCoach({ hint: plan, danger: plan, status: "paused" });
    if (!onCard) ctx.update({ overlay: "coach-danger" });
    done();
    return;
  }
  setCoach({ hint: plan });
  if (mode === "ear") speaker.speak([plan.text], { force: true, remember: false, onDone: done });
  else done();
}

function onStatus(status) {
  if (status === "error") setCoach({ status: "error" });
  else if (status === "stopped" || status === "paused") setCoach({ status: "paused" });
  else setCoach({ status: "listening" });
}

// ctx: the app's { state, update }. Returns false when the phone cannot listen (then the checklist can still be filled by hand).
export async function start(ctx, { mode, ai }) {
  stop({ quiet: true });
  const run = { ctx, mode, ai };
  current = run;
  if (!isSupported()) { setCoach({ status: "unsupported" }); return false; }
  activeRun = run;
  try { await loadProtocol(); } catch { /* retry on the next start; manual details remain usable */ }
  if (activeRun !== run) return false;
  await keepAwake();
  if (activeRun !== run) return false;
  setCoach({ status: "listening", aiError: false });
  const started = watcher().start({
    speech: speech(), rules: rules || [], cooldownSeconds: cooldown, compact: true,
    coach: ai ? { send: (text, seconds) => sendToCoach(run, text, seconds), windowChars: 500, minGapMs: 2500 } : null,
    onHint: (rule, done) => onHint(run, rule, done),
    onStatus: (status) => { if (activeRun === run) onStatus(status); },
  });
  if (activeRun !== run) { started.stop(); return false; }
  handle = started;
  poller = setInterval(() => showHeard(handle ? handle.heard() : ""), HEARD_POLL_MS);
  return true;
}

// Stop listening. quiet: do not touch the state (used when the screen is already going away).
export function stop({ quiet = false } = {}) {
  activeRun = null;
  if (poller) { clearInterval(poller); poller = null; }
  if (handle) { try { handle.stop(); } catch { /* already stopped */ } handle = null; }
  speaker.stop();
  release();
  if (!quiet && current) setCoach({ status: "paused" });
}

// Pause and resume from the strip at the bottom of the coaching screen.
export const pause = () => stop();
export const resume = () => (current ? start(current.ctx, current.ctx.state.get().coachPrefs || { mode: current.mode, ai: current.ai }) : false);

export function forget() { stop({ quiet: true }); current = null; }
