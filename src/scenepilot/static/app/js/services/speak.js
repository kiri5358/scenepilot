// Reading the screen aloud. Fixed sentences are played from audio made once with NVIDIA Magpie TTS (static/audio/ko);
// anything without a clip is read by the phone's own voice. The person can pause, replay, or turn the voice off.
// The "voice" key is shared with the older UI ("off" turns it off).
import { get, set } from "../core/store.js";
import { getLang, serverText } from "../core/i18n.js";

// Fixed sentences have audio made once with NVIDIA Magpie TTS, one set per display language: Korean sentences in
// audio/ko, and the English wording of the same sentences in audio/kr-en (English voice, Korea edition content).
const CLIP_BASE = { ko: "/static/audio/ko/", en: "/static/audio/kr-en/" };
const RATE = 1.0;

let enabled = get("voice") !== "off";
let playing = false;
let token = 0;                 // the newest speak() call; older ones stop quietly
let player = null;
let clips = { ko: {}, en: {} };
let lastParts = [];
const listeners = new Set();

export const sentenceKey = (text) => String(text).split(/\s+/).filter(Boolean).join(" ");

const emit = () => { for (const fn of listeners) fn({ enabled, playing }); };
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const isEnabled = () => enabled;
export const isPlaying = () => playing;
export const hasSomethingToReplay = () => lastParts.length > 0;

export async function loadClips() {
  await Promise.all(Object.keys(CLIP_BASE).map(async (code) => {
    try {
      const res = await fetch(CLIP_BASE[code] + "manifest.json");
      clips[code] = res.ok ? (await res.json()).items || {} : {};
    } catch { clips[code] = {}; /* no clips: the phone's voice reads everything */ }
  }));
}

// What the phone's own voice should say: the written text is kept for the screen, but some things are read badly.
// "119" would be read "one hundred nineteen", so the emergency numbers are spelled out digit by digit in English.
export function spokenText(text, language = getLang()) {
  let out = String(text).replace(/\s*[·•]\s*/g, ", ").replace(/\s+/g, " ").trim();
  if (language === "en") {
    out = out.replace(/\b119\b/g, "one one nine").replace(/\b112\b/g, "one one two").replace(/\b(\d)\/(\d)\b/g, "$1 of $2");
  }
  return out;
}

// The best voice the phone has for a language: the exact language first, then a natural-sounding one.
export function pickVoice(voices, lang) {
  const exact = voices.filter((v) => v.lang && v.lang.replace("_", "-").toLowerCase() === lang.toLowerCase());
  const pool = exact.length ? exact : voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
  const nice = /natural|neural|online|google|samantha|aria|jenny|siri|premium|enhanced/i;
  return pool.find((v) => nice.test(v.name)) || pool.find((v) => !v.localService) || pool[0] || null;
}

export function stop() {
  token += 1;
  if (player) {
    player.onended = null; player.onerror = null;     // a stopped clip must not start the phone's voice as a "fallback"
    try { player.pause(); } catch { /* already stopped */ }
    player = null;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  if (playing) { playing = false; emit(); }
}

function deviceSpeak(text, next, mine) {
  if (mine !== undefined && mine !== token) return;   // replaced or stopped while it waited: say nothing
  if (typeof window === "undefined" || !("speechSynthesis" in window)) { setTimeout(next, 0); return; }
  const lang = /[가-힣]/.test(text) ? "ko-KR" : getLang() === "en" ? "en-US" : "ko-KR";
  const utterance = new SpeechSynthesisUtterance(spokenText(text));
  utterance.lang = lang;
  const voice = pickVoice(window.speechSynthesis.getVoices(), lang);   // otherwise the phone may read English with its Korean voice
  if (voice) utterance.voice = voice;
  utterance.rate = RATE;
  let finished = false;
  const finish = () => { if (finished) return; finished = true; clearTimeout(timer); next(); };
  const timer = setTimeout(finish, Math.max(3000, text.length * 90 + 1500)); // some phones never report the end
  utterance.onend = finish;
  utterance.onerror = finish;
  window.speechSynthesis.speak(utterance);
}

function sayOne(text, next, mine) {
  const language = getLang() === "en" ? "en" : "ko";
  const file = clips[language][sentenceKey(text)];
  if (!file) { deviceSpeak(text, next, mine); return; }
  const audio = new Audio(CLIP_BASE[language] + file);
  audio.playbackRate = RATE;
  player = audio;
  let finished = false;
  const finish = () => { if (finished) return; finished = true; clearTimeout(timer); next(); };
  // a clip that was stopped (the person moved on) also rejects its play() with an AbortError: that is not a reason to read it aloud
  const fallBack = () => { if (finished) return; finished = true; clearTimeout(timer); if (mine === token) deviceSpeak(text, next, mine); };
  const timer = setTimeout(finish, 60000);
  audio.onended = finish;
  audio.onerror = fallBack;               // a missing or unplayable file: the phone's voice
  audio.play().catch(fallBack);           // the browser may block playback before a first tap
}

// parts: one sentence or a list, said one after the other. force: speak even when the voice is turned off.
export function speak(parts, { force = false, onDone = null, remember = true } = {}) {
  const list = (Array.isArray(parts) ? parts : [parts]).map((part) => serverText(String(part))).filter((s) => s.trim());
  stop();
  if (remember) lastParts = list;
  if (!(enabled || force) || !list.length) { if (onDone) setTimeout(onDone, 0); return; }
  const mine = token;
  playing = true;
  emit();
  const step = (i) => {
    if (mine !== token) return;           // replaced by a newer speak(), or stopped
    if (i >= list.length) { playing = false; emit(); if (onDone) onDone(); return; }
    sayOne(list[i], () => step(i + 1), mine);
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
