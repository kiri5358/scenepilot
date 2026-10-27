// ScenePilot mobile web UI. The server decides stages, wording, and verdicts; this file only shows them and forwards input.
// All text from the server goes in through textContent only (never innerHTML).
"use strict";

const $app = document.getElementById("app");
const $steps = document.getElementById("steps");
const $voice = document.getElementById("voice");
const $restart = document.getElementById("restart");
const $profile = document.getElementById("profile");
const $ask = document.getElementById("ask");
const $watch = document.getElementById("watch");
const $mic = document.getElementById("mic");
const $listen = document.getElementById("listenbar");

const STEPS = [["consent", "Consent"], ["safety", "Safety"], ["photos", "Photos"], ["wrap", "Wrap-up"], ["summary", "Summary"]];
const STAGE_TO_STEP = { consent: 0, safety: 1, emergency: 1, guide: 1, photos: 2, hub: 3, info: 3, summary: 4 };
const STATUS_MARK = { captured: "✓", needs_retake: "↻", skipped: "–", pending: "○" };
const STATUS_TEXT = { captured: "Taken", needs_retake: "Retake", skipped: "Skipped", pending: "Waiting" };
const SKIP_REASONS = ["The other driver said no", "Not safe to take it", "Not applicable"];
const SOURCE_LABEL = {
  user_statement: "Your statement", photo: "Photo", ai_observation: "AI observation, unverified",
  unconfirmed: "Unconfirmed", system: "Recorded automatically",
};

const state = {
  data: null,        // last view sent by the server
  busy: null,        // in-progress message (string) or null
  error: null,
  lastPhoto: null,   // result of the most recent photo
  skipOpen: false,
  geo: { status: "idle" },  // phone-location lookup for the state question; never leaves the phone
  states: [],        // states that have state-specific guidance, from /api/states
  view: null,        // "profile" while the My info screen is open, "ask" while the question screen is open
  qa: [],            // questions asked and answers shown on the question screen (newest first)
  voiceOn: store("voice") !== "off",
  spokenKey: null,
};

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem("scenepilot." + key);
    if (value === null) localStorage.removeItem("scenepilot." + key);
    else localStorage.setItem("scenepilot." + key, value);
  } catch { /* must keep working where storage is unavailable */ }
  return null;
}

// ---------- Small DOM helper ----------
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// Only fixed icon paths are used (no server values go in).
const ICON_PATHS = {
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 9"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a1 1 0 01-1 1A16 16 0 014 5a1 1 0 011-1z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  alert: '<path d="M12 3l9 17H3z"/><path d="M12 10v4"/><path d="M12 17.2v.1"/>',
  pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 1114 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0"/><path d="M12 18v3"/>',
  ear: '<path d="M7 9a5 5 0 0110 0c0 3-3 3.5-3 6.5a2.5 2.5 0 01-5 0"/><path d="M10 9a2 2 0 014 0"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>',
};
function icon(name, cls = "") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "ico " + cls);
  svg.innerHTML = ICON_PATHS[name];
  return svg;
}

// ---------- API ----------
async function api(path, opts) {
  const res = await fetch(path, opts);
  let body = null;
  try { body = await res.json(); } catch { /* the body may not be JSON */ }
  if (!res.ok) {
    const detail = body && body.detail;
    throw new Error(typeof detail === "string" ? detail : `The request failed (${res.status}).`);
  }
  return body;
}
const post = (path, json) => api(path, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(json ?? {}),
});

async function run(message, fn) {
  stopListening();
  state.busy = message; state.error = null; render();
  try {
    state.data = await fn();
    store("sid", state.data.session.id);
    autoStateFromLocation();
  } catch (e) {
    state.error = e.message;
  } finally {
    state.busy = null;
    render();
  }
}

const sid = () => state.data.session.id;
const act = (path, json, message = "Working…") => {
  if (path === "goto") state.lastPhoto = null; // moving to another screen clears the last photo result card
  return run(message, () => post(`/api/sessions/${sid()}/${path}`, json));
};

// ---------- Consent, remembered on this device ----------
// The user agrees once (the first-run screen shows the notice and the browser asks for the microphone and location).
// After that, every new accident skips the notice and goes straight to the first question, so listening can start at once.
// Bump CONSENT_VERSION when the notice changes in a way people must see again.
const CONSENT_VERSION = "2";   // 2: questions you ask are sent to an AI model
const CONSENT_POINTS = [
  "Photos are sent to a server for AI analysis.",
  "If you use Ask a question, your question is sent to a server and answered by an AI model. Do not include names or other personal details.",
  "In the demo, use example photos, not real accident information.",
  "Your phone may ask to share its location, so the app can suggest your state. The location stays on this phone.",
  "After you agree, the app asks its questions out loud and listens for your answer. You can answer by voice or by tapping. Use the microphone button at the top to turn listening off.",
  "If you answer by voice, your browser may send what you say to its own speech service.",
  "The first time, your browser asks to use the microphone and location. Allow both once and it will not ask again on this device. After that the app opens straight to the questions.",
  "If anyone is hurt or in danger, call 911 first.",
];
const hasConsent = () => store("consent") === CONSENT_VERSION;

// Ask for the microphone now, while nothing is urgent, so the browser's question never appears during an emergency.
async function primeMic() {
  if (Speech.fakeActive() || !window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
  } catch {
    voice.handsFree = false; store("handsfree", "off"); // refused: the buttons still work
  }
}

async function startSession() {
  let data = await post("/api/sessions", { country: "US" });
  if (hasConsent() && data.session.stage === "consent") data = await post(`/api/sessions/${data.session.id}/consent`);
  return data;
}

async function boot() {
  startLocationLookup();
  try { state.states = (await api("/api/states")).states; } catch { /* optional: the app works without it */ }
  await loadClips();
  const saved = store("sid");
  if (saved) {
    try {
      state.data = await api(`/api/sessions/${saved}`);
      if (hasConsent() && state.data.session.stage === "consent") state.data = await post(`/api/sessions/${saved}/consent`);
      render(); return;
    } catch { store("sid", null); }
  }
  await run("Starting…", startSession);
}

function restart() {
  if (!confirm("Start over? You will no longer be able to open what you recorded so far on this device.")) return;
  state.lastPhoto = null; state.skipOpen = false;
  store("sid", null);
  state.geo = { status: "idle" };
  startLocationLookup();
  run("Starting…", startSession);
}

// ---------- My info (kept on this device only; never sent to the server) ----------
const US_STATES = ["Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware",
  "District of Columbia", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky",
  "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana",
  "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
  "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah",
  "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming"];
const PROFILE_FIELDS = [
  ["name", "Your name", "text"],
  ["phone", "Your phone number", "tel"],
  ["home_state", "Home state", "state"],
  ["vehicle", "Your vehicle (year, make, model, color)", "text"],
  ["plate", "Your license plate", "text"],
  ["insurer", "Insurance company", "text"],
  ["policy", "Policy number", "text"],
  ["claims_phone", "Insurer claims phone number", "tel"],
  ["emergency_name", "Emergency contact name", "text"],
  ["emergency_phone", "Emergency contact phone", "tel"],
];
function loadProfile() {
  try { return JSON.parse(store("profile") || "{}") || {}; } catch { return {}; }
}
const profileFilled = (p) => Object.values(p).some((v) => v && String(v).trim());
const profileRows = (p) => PROFILE_FIELDS.filter(([k]) => p[k] && String(p[k]).trim()).map(([k, label]) => [label, p[k]]);
function profileText(p) {
  const rows = profileRows(p);
  if (!rows.length) return "";
  return "Your details (entered by you, kept on your device)\n" + rows.map(([l, v]) => `  - ${l}: ${v}`).join("\n");
}

// ---------- Spoken guidance ----------
// Fixed sentences are played from audio made once with NVIDIA Magpie TTS (static/audio, see tools/synthesize_prompts.py).
// Anything without a clip (answers to free questions, text the model wrote) is read by the device's own voice.
const clips = { map: {} };   // sentence -> file name
let speechToken = 0;         // the newest speak() call; older ones stop quietly
let player = null;           // the clip that is playing, if any
const SPEECH_RATE = 1.0;     // 1.0 is the normal speed; the clips and the device voice both use it (1.3 sounded unnatural)
let speaking = false;        // true from the start of a speak() call until its last sentence ends or it is cancelled

const sentenceKey = (text) => String(text).split(/\s+/).filter(Boolean).join(" ");

async function loadClips() {
  try { clips.map = (await api("static/audio/manifest.json")).items || {}; } catch { clips.map = {}; /* no clips yet: device voice only */ }
}

function stopSpeaking() {
  speechToken += 1;
  speaking = false;
  if (player) { try { player.pause(); } catch { /* already stopped */ } player = null; }
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

function deviceSpeak(text, next) {
  if (!("speechSynthesis" in window)) { setTimeout(next, 0); return; }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US"; u.rate = SPEECH_RATE;
  let finished = false;
  const finish = () => { if (finished) return; finished = true; clearTimeout(timer); next(); };
  const timer = setTimeout(finish, Math.max(3000, text.length * 90 + 1500)); // some devices never report the end
  u.onend = finish; u.onerror = finish;
  window.speechSynthesis.speak(u);
}

function sayOne(text, next) {
  const file = clips.map[sentenceKey(text)];
  if (!file) { deviceSpeak(text, next); return; }
  const audio = new Audio("static/audio/" + file);
  audio.playbackRate = SPEECH_RATE;          // browsers keep the pitch, so the voice just speaks faster
  player = audio;
  let finished = false;
  const finish = () => { if (finished) return; finished = true; clearTimeout(timer); next(); };
  const fallBack = () => { if (finished) return; finished = true; clearTimeout(timer); deviceSpeak(text, next); };
  const timer = setTimeout(finish, 60000);
  audio.onended = finish;
  audio.onerror = fallBack;                  // a missing or unplayable file: use the device voice
  audio.play().catch(fallBack);              // for example when the browser blocks playback before a first tap
}

// `what` is one sentence or a list of sentences, said one after the other. onDone runs when the last one ends.
function speak(what, force = false, onDone = null) {
  const parts = (Array.isArray(what) ? what : [what]).map(String).filter((s) => s.trim());
  stopSpeaking();
  if (!(state.voiceOn || force) || !parts.length) { if (onDone) setTimeout(onDone, 0); return; }
  const token = speechToken;
  speaking = true;
  const step = (i) => {
    if (token !== speechToken) return;       // replaced by a newer speak() or cancelled
    if (i >= parts.length) { speaking = false; if (onDone) onDone(); return; }
    sayOne(parts[i], () => step(i + 1));
  };
  step(0);
}

// What a screen says, split into the same fixed sentences the clips were made from.
const RETRY_PREFIX = "Sorry, I didn't catch that. ";
// A state note is long, so it is only announced by its title; Repeat (full = true) reads all of it.
function speechParts(p, full = false) {
  if (p.step_kind === "state_note" && p.step_title && !full) return [p.step_title];
  let text = p.text || "";
  const parts = [];
  if (text.startsWith(RETRY_PREFIX)) { parts.push(RETRY_PREFIX.trim()); text = text.slice(RETRY_PREFIX.length); }
  parts.push(text, ...(p.items || []), ...(p.actions || []), p.warning, p.retake_message);
  return parts.filter(Boolean);
}

function maybeSpeak() {
  const d = state.data;
  if (!d || state.busy) return;
  const p = d.prompt;
  const key = [d.session.stage, p.item_id, p.text, p.retake_message, (p.actions || []).join("|")].join("::");
  if (key === state.spokenKey) return;
  state.spokenKey = key;
  voice.silent = 0; voice.retries = 0;
  // Take turns: after the app has finished speaking, hands-free mode listens for the answer.
  speak(speechParts(p), false, () => {
    if (state.spokenKey !== key || !voice.handsFree) return;
    setTimeout(() => { if (state.spokenKey === key) startListening(); }, 300);
  });
  // Answer while the question is still being read: listen from the start and cut the reading short on a command.
  if (speaking && voice.handsFree) startListening(true);
}

$voice.addEventListener("click", () => {
  state.voiceOn = !state.voiceOn;
  store("voice", state.voiceOn ? "on" : "off");
  $voice.setAttribute("aria-pressed", String(state.voiceOn));
  if (state.voiceOn) { state.spokenKey = null; maybeSpeak(); } else stopSpeaking();
});
$restart.addEventListener("click", restart);
function openAsk() {
  stopWatch();
  stopListening();
  stopSpeaking();
  state.view = "ask"; state.error = null;
  render();
  if (voice.handsFree) setTimeout(() => { if (state.view === "ask") startListening(); }, 300);
}
function closeAsk() {
  stopListening();
  stopSpeaking();
  state.view = null; state.spokenKey = null;   // the screen under it is read out again
  render();
}
$ask.addEventListener("click", () => (state.view === "ask" ? closeAsk() : openAsk()));

// ---------- Conversation watch ----------
// Off by default. When the user starts it, the microphone listens during the talk with the other driver and a fixed
// reminder is spoken when a rule's phrase is heard (rules come from the server; matching is plain code in watch.js).
// It runs only while this screen is open, so it never competes with the hands-free answers. Nothing heard is stored or sent.
const watchState = { running: false, status: "stopped", message: null, rules: null, cooldown: 30, handle: null, played: [] };

function stopWatch() {
  if (watchState.handle) watchState.handle.stop();
  watchState.handle = null; watchState.running = false; watchState.status = "stopped";
  stopSpeaking();
}

function openWatch() {
  stopListening();
  stopSpeaking();
  state.view = "watch"; state.error = null;
  render();
}

function closeWatch() {
  stopWatch();
  state.view = null; state.spokenKey = null;
  render();
}

async function startWatch() {
  watchState.message = null;
  if (!Speech.supported()) { watchState.message = "Listening needs a secure (HTTPS) page and a browser that supports speech recognition."; render(); return; }
  if (!watchState.rules) {
    try {
      const r = await api("/api/watch-rules");
      watchState.rules = r.rules; watchState.cooldown = r.cooldown_seconds;
    } catch (e) { watchState.message = "Could not load the reminders. " + e.message; render(); return; }
  }
  watchState.running = true; watchState.status = "listening"; watchState.played = [];
  watchState.handle = Watch.start({
    speech: Speech, rules: watchState.rules, cooldownSeconds: watchState.cooldown,
    onHint: (rule, done) => {
      watchState.played.unshift(rule.hint);
      if (state.view === "watch") render();
      speak(rule.hint, true, done);
    },
    onStatus: (status, message) => {
      watchState.status = status;
      if (status === "error") { watchState.running = false; watchState.handle = null; watchState.message = message; }
      if (state.view === "watch") render();
    },
  });
  render();
}

function watchScreen() {
  const on = watchState.running;
  return [
    h("div", { class: "card" },
      h("h2", {}, icon("ear"), "Conversation watch"),
      h("p", { class: "muted" }, "While you talk with the other driver, the app listens for a few phrases and quietly reminds you of one thing, such as sticking to the facts. It never decides who is at fault."),
      h("ul", { class: "muted" },
        h("li", {}, "Use earphones, so the other driver does not hear the reminders and the phone does not hear itself."),
        h("li", {}, "The app cannot tell who is speaking, so a reminder may be about what the other person said."),
        h("li", {}, "Nothing heard is saved or sent by ScenePilot. Your browser may send the audio to its own speech service."),
        h("li", {}, "Rules about recording conversations differ by state. Tell the other driver you are using it if you are unsure."),
        h("li", {}, "Keep this screen open while it listens. In a loud place it may miss words. This is a draft and not legal advice.")),
      watchState.message ? h("div", { class: "banner warn" }, icon("alert", "sm"), h("div", {}, watchState.message)) : null,
      h("div", { class: "stack", style: "margin-top:12px" },
        on ? h("button", { class: "btn danger big", onclick: () => { stopWatch(); render(); } }, "Stop listening")
           : h("button", { class: "btn primary big", onclick: startWatch }, icon("ear"), "Start listening"),
        h("button", { class: "btn", onclick: closeWatch }, "Back to the steps"))),
    on ? h("div", { class: "card", role: "status" },
      h("div", { class: "kicker" }, watchState.status === "paused" ? "PLAYING A REMINDER" : "LISTENING"),
      watchState.played.length ? h("div", {}, watchState.played.map((t) => h("p", { class: "a" }, t)))
        : h("p", { class: "muted" }, "Reminders appear here when one is spoken.")) : null,
  ];
}
$watch.addEventListener("click", () => (state.view === "watch" ? closeWatch() : openWatch()));
$profile.addEventListener("click", () => { stopWatch(); stopListening(); state.view = state.view === "profile" ? null : "profile"; render(); });

// ---------- Voice answers (browser speech recognition; needs HTTPS and the microphone) ----------
// The app speaks, then listens. Spoken text is handled exactly like typed text, so the server's rules
// (and the safety fallbacks for unclear answers) apply the same way. Buttons always work as well.
// Hands-free is the default: after the user agrees, the app speaks, listens, and moves on without any mic taps.
// It is off only if the user turned it off, or the browser refused the microphone.
const MAX_SILENT_ROUNDS = 3; // listening rounds with no speech before the app pauses (saves battery, avoids a loop)
const voice = { handsFree: store("handsfree") !== "off", status: "idle", transcript: "", message: null, hint: "", ctrl: null, retries: 0, silent: 0 };
let dictation = null;

function speakAgain(text) {
  speak(text, true, () => { if (voice.handsFree) setTimeout(startListening, 300); });
}

// What can be said on the screen that is showing right now. Returns null when voice is not used there.
// `quick(text)` tells whether text is surely an answer, so reading can be cut short without reacting to the app's own voice.
function voiceContext() {
  const ctx = rawVoiceContext();
  if (ctx && !ctx.quick && state.view !== "ask") ctx.quick = (t) => !!ctx.parse(t);
  return ctx;
}

const QUICK_ANSWER = /\b(yes|yeah|yep|yup|no|nope|nah|nobody|not sure|unsure|don't know|maybe)\b/;

function rawVoiceContext() {
  if (state.view === "ask") {
    if (state.busy) return null;
    return {
      hint: "Ask your question, or say done.",
      parse: (t) => (t.trim() ? t : null),
      run: (t) => (Speech.match(t, Speech.COMMANDS.ask) === "done" ? closeAsk() : askQuestion(t)),
    };
  }
  if (!state.data || state.busy || state.view) return null;
  const d = state.data;
  const p = d.prompt;
  switch (d.session.stage) {
    case "safety":
      // The server reads the answer (with the recognizer's other guesses too), so the rules stay in one place.
      return { hint: "Say yes, no, or not sure.", parse: (t) => (t.trim() ? t : null), quick: (t) => QUICK_ANSWER.test(Speech.normalize(t)), run: (t, spoken, guesses) => act("safety-answer", { answer: t, alternatives: guesses || [] }) };
    case "emergency":
      return {
        hint: "Say \"got it\" when you have made the call or you are safe.",
        parse: (t) => Speech.match(t, Speech.COMMANDS.emergency),
        run: () => act("ack-emergency"),
      };
    case "guide": {
      if (p.step_kind === "state") {
        const found = state.geo.status === "result" ? state.geo.result : null;
        return {
          hint: "Say Florida, New York, another state, or not sure.",
          parse: (t) => Speech.match(t, Speech.COMMANDS.state),
          run: (cmd) => {
            if (cmd === "back") return act("guide", { action: "back" });
            if (cmd === "skip") return act("guide", { action: "skip" });
            if (cmd === "repeat") return speakAgain(p.text);
            if (cmd === "confirm") {
              if (found && found.kind === "inside") return act("state", { state: found.code, via: "location" });
              voice.message = "I have no location suggestion to confirm. Say the state.";
              return paintListenBar();
            }
            return act("state", { state: cmd });
          },
        };
      }
      return {
        hint: "Say next, repeat, back, skip, or ask a question.",
        parse: (t) => Speech.match(t, Speech.COMMANDS.guide),
        run: (cmd) => {
          if (cmd === "ask") return openAsk();
          if (cmd === "next") return act("guide", { action: "next" });
          if (cmd === "back") return act("guide", { action: "back" });
          if (cmd === "skip") return act("guide", { action: "skip" });
          return speakAgain(speechParts(p, true));
        },
      };
    }
    case "hub": {
      const extraLeft = d.photo_progress.extra_total - d.photo_progress.extra_done;
      return {
        hint: "Say create summary, more photos, add details, or ask a question.",
        parse: (t) => Speech.match(t, Speech.COMMANDS.hub),
        run: (cmd) => {
          if (cmd === "ask") return openAsk();
          if (cmd === "photos" && extraLeft <= 0) { voice.message = "There are no more photos to take."; return paintListenBar(); }
          return act("goto", { target: { summary: "summary", photos: "photos", details: "info" }[cmd] });
        },
      };
    }
    default:
      return null;
  }
}

// `barge` = listen while the app is still reading the screen. Only a surely-understood answer (ctx.quick) cuts the reading
// short; anything else heard meanwhile is most likely the app's own voice and is ignored.
function startListening(barge = false) {
  const ctx = voiceContext();
  if (!ctx || !Speech.supported()) return;
  if (barge && !ctx.quick) return;
  stopListening();
  if (!barge) stopSpeaking();
  voice.status = "listening"; voice.transcript = ""; voice.message = null; voice.hint = ctx.hint;
  paintListenBar();
  const bargeKey = state.spokenKey;
  const reading = () => barge && speaking && state.spokenKey === bargeKey;
  const ctrl = voice.ctrl = Speech.listen({
    onInterim: (text) => {
      if (reading()) { if (!ctx.quick(text)) return; stopSpeaking(); }
      voice.transcript = text; paintListenBar();
    },
    onFinal: (text, guesses) => { if (!reading()) handleSpoken(ctx, text, guesses); },
    onError: (message, code) => {
      if (barge && !Speech.PERMISSION_CODES.has(code) && code !== "unsupported") return;   // quiet while reading; onEnd restarts
      voice.status = "idle";
      if (code === "no-speech" && voice.handsFree && voice.silent < MAX_SILENT_ROUNDS) {
        // Nobody spoke yet: keep listening on the same screen, quietly.
        voice.silent += 1; voice.message = null;
        const key = state.spokenKey;
        setTimeout(() => { if (voice.handsFree && state.spokenKey === key && voice.status === "idle") startListening(); }, 300);
        paintListenBar();
        return;
      }
      voice.message = code === "no-speech" && voice.handsFree ? "I couldn't hear you clearly. In a loud place, hold the phone close to your mouth or use earphones with a microphone, or tap your answer. Tap Try again to listen again." : message;
      if (Speech.PERMISSION_CODES.has(code) || code === "unsupported") { voice.handsFree = false; store("handsfree", "off"); syncMic(); }
      paintListenBar();
    },
    onEnd: () => {
      if (voice.ctrl === ctrl && reading() && voice.handsFree) { setTimeout(() => { if (voice.ctrl === ctrl && reading()) startListening(true); }, 200); return; }
      if (voice.status === "listening" && voice.ctrl === ctrl) voice.status = "idle";
      paintListenBar();
    },
  });
}

function stopListening() {
  if (voice.ctrl) voice.ctrl.stop();
  voice.ctrl = null;
  voice.status = "idle"; voice.message = null; voice.transcript = "";
  paintListenBar();
}

function handleSpoken(ctx, text, guesses = []) {
  voice.silent = 0;
  voice.transcript = text;
  voice.status = "idle";
  // In a noisy place the first guess is often wrong; use the best other guess that is a command on this screen.
  let command = ctx.parse(text);
  if (!command) for (const guess of guesses) { command = ctx.parse(guess); if (command) break; }
  if (!command) {
    voice.message = `I heard "${text}", but I didn't understand. ${ctx.hint}`;
    paintListenBar();
    voice.retries += 1;
    if (voice.retries <= 2) speak([RETRY_PREFIX.trim(), ctx.hint], true, () => { if (voice.handsFree) setTimeout(startListening, 300); });
    return;
  }
  voice.retries = 0;
  paintListenBar();
  ctx.run(command, text, guesses);
}

// The listening bar lives outside the screen, so showing what is heard never redraws (or wipes) the screen.
function paintListenBar() {
  const live = voice.status === "listening";
  const show = live || !!voice.message;
  $listen.hidden = !show;
  if (!show) { $listen.replaceChildren(); return; }
  $listen.replaceChildren(h("div", { class: "listen-row" },
    h("span", { class: "mic-dot" + (live ? " live" : ""), "aria-hidden": "true" }, icon("mic")),
    h("div", { class: "listen-text" },
      h("div", { class: "listen-title" }, live ? "Listening…" : "Voice"),
      voice.transcript ? h("div", { class: "listen-transcript" }, `"${voice.transcript}"`) : null,
      h("div", { class: "muted" }, voice.message || voice.hint)),
    live ? h("button", { class: "btn small", onclick: () => stopListening() }, "Stop")
         : h("button", { class: "btn small", onclick: () => { voice.silent = 0; startListening(); } }, "Try again")));
}

function syncMic() {
  $mic.hidden = !Speech.supported();
  $mic.setAttribute("aria-pressed", String(voice.handsFree));
}

$mic.addEventListener("click", () => {
  voice.handsFree = !voice.handsFree;
  store("handsfree", voice.handsFree ? "on" : "off");
  voice.silent = 0;
  syncMic();
  if (voice.handsFree) startListening(); else stopListening();
});

function micRow(label = "Speak your answer") {
  return Speech.supported() ? h("button", { class: "btn", onclick: () => startListening() }, icon("mic"), label) : null;
}

// Dictate into a text box (for example, what happened). The text stays editable.
function dictate(el, button) {
  if (dictation) { dictation.stop(); dictation = null; button.lastChild.textContent = "Speak"; return; }
  stopListening();
  stopSpeaking();
  const base = el.value.trim();
  button.lastChild.textContent = "Stop";
  dictation = Speech.listen({
    onInterim: (text) => { el.value = (base + " " + text).trim(); },
    onFinal: (text) => { el.value = (base + " " + text).trim(); },
    onError: (message) => { voice.message = message; paintListenBar(); },
    onEnd: () => { dictation = null; if (button.isConnected) button.lastChild.textContent = "Speak"; },
  });
}

// ---------- Image shrinking (saves upload time and size) ----------
async function shrink(file, max = 1280) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob || file;
  } catch {
    return file; // if decoding fails, send the original (the server may reject the format)
  }
}

async function uploadPhoto(file) {
  state.lastPhoto = null;
  await run("The AI is looking at your photo. This takes 5 to 10 seconds…", async () => {
    const blob = await shrink(file);
    const form = new FormData();
    form.append("file", blob, "photo.jpg");
    const data = await api(`/api/sessions/${sid()}/photo`, { method: "POST", body: form });
    state.lastPhoto = { verdict: data.verdict, analysis: data.analysis };
    state.skipOpen = false;
    return data;
  });
}

// ---------- Screens ----------
function renderSteps() {
  const now = state.data ? STAGE_TO_STEP[state.data.session.stage] : 0;
  $steps.replaceChildren(...STEPS.map(([, label], i) =>
    h("div", { class: "step" + (i < now ? " done" : i === now ? " now" : ""), "aria-current": i === now ? "step" : false }, label)));
}

function busyCard() {
  return h("div", { class: "card busy", role: "status" }, h("span", { class: "spinner", "aria-hidden": "true" }), h("span", {}, state.busy));
}

function consentScreen(d) {
  const saved = profileFilled(loadProfile());
  return [
    h("div", { class: "card" },
      h("h2", {}, "Before you start"),
      h("p", { class: "lead" }, d.prompt.text),
      h("ul", { class: "plain muted" }, CONSENT_POINTS.map((point) => h("li", {}, point))),
      h("p", { class: "muted" }, "Tip: add ScenePilot to your home screen so it opens like an app, ready to listen."),
    ),
    h("div", { class: "card" },
      h("h2", {}, "My info (optional)"),
      h("p", { class: "muted" }, saved
        ? "Your details are saved on this device. They are never sent to the server."
        : "Add your vehicle and insurance details now so they are ready in an emergency. They stay on this device and are never sent to the server."),
      h("button", { class: "btn", onclick: () => { state.view = "profile"; render(); } }, saved ? "Edit my info" : "Set up my info")),
    h("button", { class: "btn primary", onclick: async () => {
      store("consent", CONSENT_VERSION);   // remembered on this device, so the next accident starts at the first question
      await primeMic();
      act("consent");
    } }, d.prompt.options[0]),
  ];
}

function profileScreen() {
  const p = loadProfile();
  const inputs = {};
  const fieldEl = ([key, label, kind]) => {
    let el;
    if (kind === "state") {
      el = h("select", { id: "p-" + key }, h("option", { value: "" }, "Select a state"),
        US_STATES.map((s) => h("option", { value: s }, state.states.some((x) => x.name === s) ? `${s} (guidance available)` : s)));
    } else {
      el = h("input", { type: kind, id: "p-" + key, autocomplete: "off", inputmode: kind === "tel" ? "tel" : null });
    }
    el.value = p[key] || "";
    inputs[key] = el;
    return h("div", {}, h("label", { for: "p-" + key }, label), el,
      kind === "state" ? h("div", { class: "muted", style: "margin-top:6px" }, "State-specific guidance is available for " + (state.states.map((x) => x.name).join(" and ") || "a few states") + ". Other states get general guidance.") : null);
  };
  const save = () => {
    const out = {};
    for (const [key] of PROFILE_FIELDS) out[key] = inputs[key].value.trim();
    store("profile", profileFilled(out) ? JSON.stringify(out) : null);
    if (out.claims_phone) store("insurer", out.claims_phone);
    state.view = null; render();
  };
  const clear = () => {
    if (!confirm("Delete the details saved on this device?")) return;
    store("profile", null); store("insurer", null);
    state.view = null; render();
  };
  return [
    h("div", { class: "card" },
      h("h2", {}, "My info"),
      h("p", { class: "muted" }, "Everything here stays on this device. It is never sent to the server. It appears in your summary so you can read it out or copy it."),
      PROFILE_FIELDS.map(fieldEl)),
    h("button", { class: "btn primary", onclick: save }, "Save"),
    h("button", { class: "btn", onclick: () => { state.view = null; render(); } }, "Back"),
    profileFilled(p) ? h("button", { class: "btn ghost", onclick: clear }, "Delete my saved info") : null,
    h("div", { class: "card" },
      h("h2", {}, "About this app"),
      h("p", { class: "muted" }, "ScenePilot guides you through an accident one step at a time and organizes your photos and statements. It does not decide who is at fault, what repairs cost, or anyone's legal responsibility. AI observations can be wrong."),
      h("ul", { class: "plain muted" }, CONSENT_POINTS.map((point) => h("li", {}, point))),
      hasConsent() ? h("button", { class: "btn ghost", onclick: forgetConsent }, "Show the start notice again") : null),
  ];
}

function forgetConsent() {
  if (!confirm("Show the start notice again? This starts a new accident.")) return;
  store("consent", null); store("sid", null);
  state.view = null; state.lastPhoto = null; state.skipOpen = false;
  run("Starting…", startSession);
}

// Ask a question: the user types or says anything. The server answers with a Nemotron model that can only use our
// reviewed notes; anything about danger, fault, law, medicine or cost gets a fixed, safe answer instead.
async function askQuestion(text) {
  const question = String(text || "").trim();
  if (!question || state.busy) return;
  stopListening();
  state.busy = "Looking that up…"; state.error = null; render();
  try {
    const r = await post(`/api/sessions/${sid()}/ask`, { question });
    state.qa.unshift({ question, ...r });
    state.busy = null; render();
    // Read the answer aloud, then (hands-free) listen for a follow-up question.
    speak(r.answer, false, () => { if (voice.handsFree && state.view === "ask" && !state.busy) setTimeout(startListening, 300); });
    return;
  } catch (e) {
    state.error = e.message;
  }
  state.busy = null; render();
}

function askScreen() {
  const input = h("textarea", { id: "q", rows: "2", placeholder: "For example: Do I have to report this in Florida?", "aria-label": "Your question" });
  const send = () => { const v = input.value.trim(); if (v) askQuestion(v); };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
  const consent = state.data && state.data.session.stage === "consent";
  return [
    h("div", { class: "card" },
      h("h2", {}, icon("pin"), "Ask a question"),
      h("p", { class: "muted" }, "Ask in your own words. The answer comes from an AI model that can only use ScenePilot's reviewed notes and steps. It will not decide who is at fault, give legal or medical advice, or estimate costs."),
      consent ? h("div", { class: "banner warn" }, icon("alert", "sm"), h("div", {}, "Please agree to start first.")) : null,
      input,
      h("div", { class: "stack", style: "margin-top:12px" },
        h("button", { class: "btn primary big", onclick: send }, "Ask"),
        Speech.supported() ? h("button", { class: "btn", type: "button", onclick: () => startListening() }, icon("mic"), "Speak your question") : null,
        h("button", { class: "btn", onclick: closeAsk }, "Back to the steps"))),
    state.qa.length ? h("div", { class: "card" },
      state.qa.map((item, i) => h("div", { class: i ? "qa" : "" },
        h("div", { class: "q" }, item.question),
        h("p", { class: "a" }, item.answer),
        item.call_buttons && item.call_buttons.length ? h("div", { class: "stack", style: "margin-top:8px" }, item.call_buttons.map((c) =>
          h("a", { class: "btn danger", href: `tel:${c.number}` }, icon("phone"), c.label))) : null,
        item.sources && item.sources.length ? h("div", { class: "muted src" }, "Source: ",
          item.sources.flatMap((s, n) => [n ? "; " : "", h("a", { href: s.url, target: "_blank", rel: "noopener noreferrer" }, s.title), `, ${s.version}`])) : null,
        h("div", { class: "muted ask-note" }, item.note),
        h("button", { class: "btn small", style: "margin-top:8px", onclick: () => speak(item.answer, true) }, "Read aloud")))) : null,
  ];
}

function safetyScreen(d) {
  const { answered, total } = d.safety_progress;
  const input = h("input", { type: "text", id: "free", placeholder: "Or type it (for example: nobody is hurt)", autocomplete: "off", "aria-label": "Type your answer" });
  const send = () => { const v = input.value.trim(); if (v) act("safety-answer", { answer: v }); };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
  const optionValue = { "Yes": "yes", "No": "no", "Not sure": "unsure" };
  const answerBtn = (o, primary) => h("button", {
    class: "btn big" + (primary ? " primary" : ""), onclick: () => act("safety-answer", { answer: optionValue[o] || o }),
  }, o);
  const [first, ...rest] = d.prompt.options;
  return [
    h("div", { class: "card" },
      h("div", { class: "kicker" }, `SAFETY CHECK ${Math.min(answered + 1, total)}/${total}`),
      h("p", { class: "lead" }, d.prompt.text),
      h("div", { class: "stack" },
        answerBtn(first, true),
        h("div", { class: "two" }, rest.map((o) => answerBtn(o, false))),
        micRow())),
    h("div", { class: "card" },
      h("label", { for: "free", style: "margin-top:0" }, "Or answer in your own words"),
      h("div", { class: "row" }, input, h("button", { class: "btn small primary", onclick: send }, "Send"))),
  ];
}

function emergencyScreen(d) {
  const p = d.prompt;
  return [
    h("div", { class: "card emergency", role: "alert" },
      h("div", { class: "tape", "aria-hidden": "true" }),
      h("div", { class: "in" },
        h("h2", {}, icon("alert"), p.text),
        h("ol", {}, p.actions.map((a) => h("li", {}, a))),
        h("div", { class: "stack" }, p.call_buttons.map((c) =>
          h("a", { class: "btn danger", href: `tel:${c.number}` }, icon("phone"), c.label)))),
    ),
    h("button", { class: "btn primary", onclick: () => act("ack-emergency") }, p.options[0]),
    micRow("Say \"got it\""),
    h("p", { class: "muted" }, "Tap this after you have made the call or confirmed you are safe. Then we can continue with photos and notes."),
    d.session.accident_state_via === "location_auto" && d.session.accident_state
      ? h("p", { class: "muted" }, "We noted where you are from your phone's location, for your report. It stays on your phone.") : null,
  ];
}

// The location lookup starts as soon as the app opens (and again for a new accident), so a suggestion is usually
// ready by the time the state question comes up. It re-draws the screen only when that question is showing, so it
// never wipes what someone is typing.
function stateStepVisible() {
  return !state.view && !!state.data && state.data.session.stage === "guide" && state.data.prompt.step_kind === "state";
}

// In an emergency nobody can be asked a question, so the state is taken from the phone's location right away.
// The server records it as "set automatically, not confirmed". It never overrides a state the user chose.
function autoStateFromLocation() {
  const s = state.data && state.data.session;
  const g = state.geo;
  if (!s || s.emergency.level !== "emergency" || s.accident_state || g.status !== "result" || state.autoStateTried === s.id) return;
  const r = g.result;
  const code = r.kind === "inside" ? r.code : r.kind === "outside" ? "OTHER" : "UNSURE";
  state.autoStateTried = s.id;
  post(`/api/sessions/${s.id}/state`, { state: code, via: "location_auto" })
    .then(() => {
      if (state.data && state.data.session.id === s.id) {
        state.data.session.accident_state = code;
        state.data.session.accident_state_via = "location_auto";
        if (state.data.session.stage === "emergency" && !state.view) render();
      }
    })
    .catch(() => { state.autoStateTried = null; /* try again later; never block the emergency screen */ });
}

async function startLocationLookup() {
  if (state.geo.status === "locating") return;
  state.geo = { status: "locating" };
  if (stateStepVisible()) render();
  try {
    const pos = await Geo.getPosition();
    state.geo = { status: "result", result: Geo.locate(pos.lat, pos.lon, pos.accuracy), accuracyM: Math.round(pos.accuracy) };
  } catch (e) {
    state.geo = { status: "error", message: e.message };
  }
  if (stateStepVisible()) render();
  autoStateFromLocation();
}

// "Use my location" and what it found. The state is only a suggestion: the user always confirms with a tap.
function geoBlock(p) {
  const g = state.geo;
  const nameOf = (code) => (p.states.find((x) => x.code === code) || {}).name || code;
  const secure = !!Geo.fakeMode() || (window.isSecureContext && "geolocation" in navigator);
  const useBtn = h("button", { class: "btn", disabled: g.status === "locating" || !secure ? true : null, onclick: startLocationLookup },
    icon("pin"), g.status === "locating" ? "Finding your location…" : "Use my location");
  const blocks = [useBtn];
  if (!secure) {
    blocks.push(h("div", { class: "muted" }, "Location needs a secure (HTTPS) connection and a browser that can share it. Choose the state below."));
  } else if (g.status === "idle") {
    blocks.push(h("div", { class: "muted" }, "Your location stays on this phone. It is only used to suggest a state."));
  } else if (g.status === "error") {
    blocks.push(h("div", { class: "banner warn" }, icon("alert", "sm"), h("div", {}, g.message)));
  } else if (g.status === "result") {
    const r = g.result;
    const accuracy = g.accuracyM ? ` (accurate to about ${g.accuracyM} m)` : "";
    if (r.kind === "inside") {
      const msg = `Your phone's location looks like ${nameOf(r.code)}.${accuracy} Is that right?`;
      blocks.push(h("div", { class: "banner ok" }, icon("check", "sm"), h("div", {}, msg)),
        h("button", { class: "btn big primary", onclick: () => act("state", { state: r.code, via: "location" }) }, `Yes, ${nameOf(r.code)}`));
    } else if (r.kind === "outside") {
      const names = p.states.map((x) => x.name).join(" or ");
      blocks.push(h("div", { class: "banner warn" }, icon("alert", "sm"), h("div", {}, `You seem to be outside ${names}.${accuracy} I only have state notes for those two.`)),
        h("button", { class: "btn big primary", onclick: () => act("state", { state: "OTHER", via: "location" }) }, "Yes, another state"));
    } else {
      const closest = r.code ? ` The closest of my states is ${nameOf(r.code)}.` : "";
      blocks.push(h("div", { class: "banner warn" }, icon("alert", "sm"),
        h("div", {}, `You may be near a state line, so I can't be sure.${accuracy}${closest} Please pick the state you are in.`)));
    }
    blocks.push(h("div", { class: "muted" }, "If that is not right, choose the state yourself below."));
  }
  return blocks;
}

function guideScreen(d) {
  const p = d.prompt;
  const last = p.step_index >= p.steps.length - 1;
  const common = [
    micRow(),
    h("div", { class: "two" },
      h("button", { class: "btn", onclick: () => speak(speechParts(p, true), true) }, "Repeat"),
      h("button", { class: "btn", disabled: p.step_index === 0, onclick: () => act("guide", { action: "back" }) }, "Back")),
    h("button", { class: "btn ghost", onclick: () => act("guide", { action: "skip" }) }, "Skip to photos"),
  ];
  const allSteps = h("div", { class: "card" },
    h("h2", {}, "All steps"),
    h("ol", { class: "steps-list" }, p.steps.map((s, i) =>
      h("li", { class: i === p.step_index ? "current" : i < p.step_index ? "done" : "" }, s))));

  if (p.step_kind === "state") {
    const home = loadProfile().home_state;
    const homeCode = state.geo.status === "result" ? undefined : (p.states.find((x) => x.name === home) || {}).code;
    const stateBtn = (code, label, primary) => h("button", {
      class: "btn big" + (primary ? " primary" : ""), onclick: () => act("state", { state: code }),
    }, label);
    return [
      h("div", { class: "card" },
        h("div", { class: "kicker" }, `WHAT TO DO NOW ${p.step_index + 1}/${p.steps.length}`),
        h("p", { class: "lead" }, p.text),
        h("div", { class: "stack", style: "margin-top:12px" },
          ...geoBlock(p),
          p.states.map((x) => stateBtn(x.code, x.code === homeCode ? `Yes, ${x.name}` : x.name, x.code === homeCode)),
          stateBtn("OTHER", "Another state", false),
          stateBtn("UNSURE", "Not sure", false),
          ...common)),
      allSteps,
    ];
  }

  const noteCard = p.step_kind === "state_note" ? [
    h("div", { class: "muted", style: "margin-top:8px" }, "Source: ",
      p.sources.flatMap((s, i) => [i ? "; " : "", h("a", { href: s.url, target: "_blank", rel: "noopener noreferrer" }, s.title), `, ${s.version}`])),
    p.state_disclaimer ? h("div", { class: "banner warn", style: "margin-top:8px" }, icon("alert", "sm"), h("div", {}, p.state_disclaimer)) : null,
  ] : [];
  const stateName = { FL: "Florida", NY: "New York" }[p.state_choice] || "";
  return [
    h("div", { class: "card" },
      h("div", { class: "kicker" }, p.step_kind === "state_note"
        ? `${stateName.toUpperCase()} - ${(p.step_title || "").toUpperCase()}`
        : `WHAT TO DO NOW ${p.step_index + 1}/${p.steps.length}`),
      h("p", { class: "lead" }, p.text),
      p.step_kind === "list" ? h("ol", { class: "steps-list" }, p.items.map((s) => h("li", {}, s))) : null,
      ...noteCard,
      h("div", { class: "stack", style: "margin-top:12px" },
        h("button", { class: "btn primary big", onclick: () => act("guide", { action: "next" }) }, last ? "Continue to photos" : "Next"),
        ...common)),
    p.step_kind === "list" ? null : allSteps,
  ];
}

function checklistCard(d, currentId) {
  const row = (it) => h("li", { class: "s-" + it.status + (it.id === currentId ? " current" : "") },
    h("span", { class: "mark", "aria-hidden": "true" }, it.status === "pending" ? "" : STATUS_MARK[it.status]),
    h("span", {}, it.title),
    h("span", { class: "st muted" }, STATUS_TEXT[it.status]));
  return h("div", { class: "card" },
    h("h2", {}, "Evidence photos"),
    h("div", { class: "group" }, "CORE PHOTOS"),
    h("ul", { class: "checklist" }, d.checklist.filter((it) => it.core).map(row)),
    h("div", { class: "group" }, "EXTRA (can wait)"),
    h("ul", { class: "checklist" }, d.checklist.filter((it) => !it.core).map(row)));
}

function photoResultCard() {
  const r = state.lastPhoto;
  if (!r || !r.verdict.accepted) return null;
  const a = r.analysis;
  return h("div", { class: "banner ok" }, icon("check", "sm"),
    h("div", {},
      h("strong", {}, "Photo accepted."),
      a.observations.length ? h("div", { style: "margin-top:6px" },
        h("span", { class: "badge ai_observation" }, SOURCE_LABEL.ai_observation),
        h("ul", { class: "plain", style: "margin-top:4px; color:var(--ink)" }, a.observations.map((o) => h("li", {}, o)))) : null));
}

function photosScreen(d) {
  const p = d.prompt;
  const item = d.checklist.find((c) => c.id === p.item_id);
  const camera = h("input", { type: "file", accept: "image/*", capture: "environment", class: "hidden", id: "cam" });
  const album = h("input", { type: "file", accept: "image/*", class: "hidden", id: "album" });
  const onPick = (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) uploadPhoto(f); };
  camera.addEventListener("change", onPick);
  album.addEventListener("change", onPick);

  const skipBox = state.skipOpen ? h("div", { class: "stack" },
    h("div", { class: "muted" }, "Pick a reason for skipping. It will be recorded in the summary."),
    SKIP_REASONS.map((r) => h("button", { class: "btn", onclick: () => { state.skipOpen = false; act("skip", { reason: r }); } }, r))) : null;

  const pr = d.photo_progress;
  const heading = pr.extra_mode
    ? `EXTRA PHOTO ${Math.min(pr.extra_done + 1, pr.extra_total)}/${pr.extra_total}`
    : `CORE PHOTO ${Math.min(pr.core_done + 1, pr.core_total)}/${pr.core_total}`;
  const backToHub = pr.extra_mode
    ? h("button", { class: "btn", onclick: () => act("goto", { target: "hub" }) }, "Stop here and go back") : null;
  return [
    photoResultCard(),
    h("div", { class: "card" },
      h("div", { class: "kicker" }, heading),
      h("h2", {}, item ? item.title : ""),
      h("p", { class: "lead" }, p.text),
      p.warning ? h("div", { class: "banner warn" }, icon("alert", "sm"), h("div", {}, p.warning)) : null,
      p.retake_message ? h("div", { class: "banner warn" }, icon("alert", "sm"), h("div", {}, "Please retake it: " + p.retake_message)) : null,
      h("div", { class: "stack", style: "margin-top:12px" },
        camera, album,
        h("button", { class: "btn primary big", onclick: () => camera.click() }, icon("camera"), "Take photo"),
        h("button", { class: "btn", onclick: () => album.click() }, icon("image"), "Choose from library"),
        skipBox || h("button", { class: "btn ghost", onclick: () => { state.skipOpen = true; render(); } }, p.options[0]),
        backToHub)),
    checklistCard(d, p.item_id),
  ];
}

function hubScreen(d) {
  const pr = d.photo_progress;
  const extraLeft = pr.extra_total - pr.extra_done;
  return [
    photoResultCard(),
    h("div", { class: "card" },
      h("h2", {}, icon("check"), "Core photos are done"),
      h("p", { class: "lead" }, d.prompt.text),
      h("div", { class: "stack" },
        h("button", { class: "btn primary", onclick: () => act("goto", { target: "summary" }) }, "Create summary"),
        extraLeft > 0 ? h("button", { class: "btn", onclick: () => act("goto", { target: "photos" }) }, `Take more photos (${extraLeft} left)`) : null,
        h("button", { class: "btn", onclick: () => act("goto", { target: "info" }) }, "Add details"),
        micRow())),
    h("p", { class: "muted" }, "After you create the summary you can still come back with 'Add more' to add photos and details. Opening this same address on this device lets you continue."),
    checklistCard(d, null),
  ];
}

function infoScreen(d) {
  const fields = Object.entries(d.info_fields);
  const saved = d.session.info;
  const inputs = {};
  const form = h("div", { class: "card" },
    h("h2", {}, "More details"),
    h("p", { class: "muted" }, d.prompt.text + " Anything left blank is listed under 'Not confirmed'."),
    fields.map(([key, label]) => {
      const cur = saved[key];
      const el = key === "statement"
        ? h("textarea", { id: "f-" + key, placeholder: "Describe what happened, as you saw it." })
        : h("input", { type: "text", id: "f-" + key, autocomplete: "off" });
      el.value = cur ? cur.value : "";
      inputs[key] = el;
      return h("div", {},
        h("label", { for: "f-" + key }, label),
        el,
        key === "statement" && Speech.supported()
          ? h("button", { class: "btn small", type: "button", style: "margin-top:8px", onclick: (e) => dictate(el, e.currentTarget) }, icon("mic", "sm"), "Speak")
          : null,
        cur && !cur.confirmed ? h("div", { class: "muted" }, h("span", { class: "badge unconfirmed" }, "Unconfirmed"), " ",
          h("button", { class: "btn small", onclick: () => act("info/confirm", { field: key }) }, "Yes, confirm")) : null);
    }));
  const go = async () => {
    state.busy = "Creating your summary…"; state.error = null; render();
    try {
      let view = state.data;
      for (const [key] of fields) {
        const v = inputs[key].value.trim();
        const before = saved[key] ? saved[key].value : "";
        if (v !== before) view = await post(`/api/sessions/${sid()}/info`, { field: key, value: v });
      }
      state.data = await post(`/api/sessions/${sid()}/finish`);
    } catch (e) { state.error = e.message; }
    state.busy = null; render();
  };
  const later = async () => {
    state.busy = "Saving…"; state.error = null; render();
    try {
      for (const [key] of fields) {
        const v = inputs[key].value.trim();
        const before = saved[key] ? saved[key].value : "";
        if (v !== before) await post(`/api/sessions/${sid()}/info`, { field: key, value: v });
      }
      state.data = await post(`/api/sessions/${sid()}/goto`, { target: "hub" });
    } catch (e) { state.error = e.message; }
    state.busy = null; render();
  };
  return [form, h("button", { class: "btn primary", onclick: go }, "View summary"),
    h("button", { class: "btn", onclick: later }, "Save and go back")];
}

function summaryScreen(d) {
  const s = d.summary;
  const prof = loadProfile();
  const profText = profileText(prof);
  const fullText = d.summary_text + (profText ? "\n\n" + profText : "");
  const phone = h("input", { type: "tel", id: "ins", placeholder: "Enter your insurer's claims phone number", value: store("insurer") || prof.claims_phone || "", inputmode: "tel" });
  const call = h("a", { class: "btn", id: "call", href: "#" }, icon("phone"), prof.insurer ? "Call " + prof.insurer : "Call your insurer");
  const syncCall = () => {
    const n = phone.value.replace(/[^\d+*#]/g, "");
    store("insurer", phone.value);
    call.setAttribute("href", n ? `tel:${n}` : "#");
    call.style.opacity = n ? "1" : ".5";
  };
  phone.addEventListener("input", syncCall); syncCall();

  const copyBtn = h("button", { class: "btn primary" }, icon("copy"), "Copy summary");
  copyBtn.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(fullText); copyBtn.textContent = "Copied ✓"; }
    catch {
      const ta = h("textarea", { readonly: true }); ta.value = fullText; document.body.append(ta); ta.select();
      try { document.execCommand("copy"); copyBtn.textContent = "Copied ✓"; } catch { copyBtn.textContent = "Could not copy"; }
      ta.remove();
    }
  });

  return [
    h("div", { class: "card" },
      h("h2", {}, "Claim summary"),
      h("p", { class: "muted" }, "Every item shows its source. 'AI observation' items are for reference only and are not verified."),
      s.sections.map((sec) => h("div", { class: "sum-sec" },
        h("h3", {}, sec.title),
        sec.items.length ? sec.items.map((it) => h("div", { class: "sum-item" },
          h("span", { class: "lab" }, it.label),
          it.value, h("span", { class: "badge " + it.source }, SOURCE_LABEL[it.source])))
          : h("div", { class: "muted" }, "(none)"))),
      h("div", { class: "sum-sec" },
        h("h3", {}, "Not confirmed"),
        s.missing.length ? h("ul", { class: "plain" }, s.missing.map((m) => h("li", {}, m))) : h("div", { class: "muted" }, "(none)")),
      h("div", { class: "banner warn" }, icon("alert", "sm"), h("div", {}, s.disclaimer))),
    profileRows(prof).length ? h("div", { class: "card" },
      h("h2", {}, "Your details"),
      h("p", { class: "muted" }, "Entered by you and kept on this device. Not part of the server summary above, but included when you copy it."),
      profileRows(prof).map(([label, value]) => h("div", { class: "sum-item" },
        h("span", { class: "lab" }, label), value, h("span", { class: "badge user_statement" }, SOURCE_LABEL.user_statement)))) : null,
    h("div", { class: "card stack" }, copyBtn, phone, call),
    h("button", { class: "btn", onclick: () => act("goto", { target: "hub" }) }, "Add more (photos or details)"),
    h("button", { class: "btn", onclick: restart }, "Start a new accident"),
  ];
}

// ---------- Render ----------
const SCREENS = { consent: consentScreen, safety: safetyScreen, emergency: emergencyScreen, guide: guideScreen, photos: photosScreen, hub: hubScreen, info: infoScreen, summary: summaryScreen };

function render() {
  renderSteps();
  $voice.setAttribute("aria-pressed", String(state.voiceOn));
  syncMic();
  const parts = [];
  if (Geo.fakeMode()) {
    parts.push(h("div", { class: "banner warn" }, icon("alert", "sm"),
      h("div", {}, `Test mode: the location is simulated (${Geo.fakeMode()}). Remove ?fakeloc from the address to use the real GPS.`)));
  }
  if (Speech.fakeActive()) {
    parts.push(h("div", { class: "banner warn" }, icon("alert", "sm"),
      h("div", {}, "Test mode: spoken answers are simulated (?fakespeech). Remove it from the address to use the real microphone.")));
  }
  if (state.error) parts.push(h("div", { class: "banner error", role: "alert" }, state.error));
  if (state.view === "profile") {
    parts.push(...profileScreen());
  } else if (state.view === "ask") {
    parts.push(...askScreen());
  } else if (state.view === "watch") {
    parts.push(...watchScreen());
  } else if (state.data) {
    const screen = SCREENS[state.data.session.stage];
    parts.push(...[screen(state.data)].flat());
  }
  if (state.busy) {
    // While working, show a progress card on top and disable the buttons to block input.
    parts.unshift(busyCard());
  }
  $app.replaceChildren(...parts.filter(Boolean));
  if (state.busy) $app.querySelectorAll("button, input, textarea").forEach((el) => { el.disabled = true; });
  if (!state.view) maybeSpeak();
  window.scrollTo({ top: 0 });
}

boot();
