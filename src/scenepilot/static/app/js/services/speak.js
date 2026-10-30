// Reading the screen aloud. Fixed sentences are played from audio made once with NVIDIA Magpie TTS (static/audio/ko);
// anything without a clip is read by the phone's own voice. The person can pause, replay, or turn the voice off.
// The "voice" key is shared with the older UI ("off" turns it off).
import { get, set } from "../core/store.js";

const CLIP_BASE = "/static/audio/ko/";
const RATE = 1.0;

let enabled = get("voice") !== "off";
let playing = false;
let token = 0;                 // the newest speak() call; older ones stop quietly
let player = null;
let clips = {};
let lastParts = [];
const listeners = new Set();

export const sentenceKey = (text) => String(text).split(/\s+/).filter(Boolean).join(" ");

const emit = () => { for (const fn of listeners) fn({ enabled, playing }); };
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const isEnabled = () => enabled;
export const isPlaying = () => playing;
export const hasSomethingToReplay = () => lastParts.length > 0;

export async function loadClips() {
  try {
    const res = await fetch(CLIP_BASE + "manifest.json");
    clips = res.ok ? (await res.json()).items || {} : {};
  } catch { clips = {}; /* no clips: the phone's voice reads everything */ }
}

export function stop() {
  token += 1;
  if (player) { try { player.pause(); } catch { /* already stopped */ } player = null; }
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  if (playing) { playing = false; emit(); }
}

function deviceSpeak(text, next) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) { setTimeout(next, 0); return; }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ko-KR";
  utterance.rate = RATE;
  let finished = false;
  const finish = () => { if (finished) return; finished = true; clearTimeout(timer); next(); };
  const timer = setTimeout(finish, Math.max(3000, text.length * 90 + 1500)); // some phones never report the end
  utterance.onend = finish;
  utterance.onerror = finish;
  window.speechSynthesis.speak(utterance);
}

function sayOne(text, next) {
  const file = clips[sentenceKey(text)];
  if (!file) { deviceSpeak(text, next); return; }
  const audio = new Audio(CLIP_BASE + file);
  audio.playbackRate = RATE;
  player = audio;
  let finished = false;
  const finish = () => { if (finished) return; finished = true; clearTimeout(timer); next(); };
  const fallBack = () => { if (finished) return; finished = true; clearTimeout(timer); deviceSpeak(text, next); };
  const timer = setTimeout(finish, 60000);
  audio.onended = finish;
  audio.onerror = fallBack;               // a missing or unplayable file: the phone's voice
  audio.play().catch(fallBack);           // the browser may block playback before a first tap
}

// parts: one sentence or a list, said one after the other. force: speak even when the voice is turned off.
export function speak(parts, { force = false, onDone = null, remember = true } = {}) {
  const list = (Array.isArray(parts) ? parts : [parts]).map(String).filter((s) => s.trim());
  stop();
  if (remember) lastParts = list;
  if (!(enabled || force) || !list.length) { if (onDone) setTimeout(onDone, 0); return; }
  const mine = token;
  playing = true;
  emit();
  const step = (i) => {
    if (mine !== token) return;           // replaced by a newer speak(), or stopped
    if (i >= list.length) { playing = false; emit(); if (onDone) onDone(); return; }
    sayOne(list[i], () => step(i + 1));
  };
  step(0);
}

export function replay(onDone) {
  if (!enabled) { enabled = true; set("voice", "on"); }
  speak(lastParts, { onDone, remember: false });
}

export function setEnabled(value) {
  enabled = Boolean(value);
  const saved = set("voice", enabled ? "on" : "off");
  if (!enabled) stop();
  emit();
  return saved;
}
