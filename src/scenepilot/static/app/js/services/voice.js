// Listening for a spoken answer. The browser's own recognizer does the work (speech.js, loaded before this module).
// A screen gives a spec: { hint, parse(text) -> command or null, quick(text) -> boolean, run(command, text, guesses) }.
// Hands-free is the default: the app listens while it reads (so an answer can cut the reading short) and again when it
// has finished. The person can switch listening off.
import { get, set } from "../core/store.js";
import { t, getLang } from "../core/i18n.js";
import * as speaker from "./speak.js";

const MAX_SILENT_ROUNDS = 3;   // quiet rounds before the app pauses (saves battery, avoids a loop)
const MAX_MISHEARD = 2;        // unclear answers before the app waits for a tap

const view = { status: "idle", transcript: "", message: null, hint: "" };
const listeners = new Set();
let control = null;
let generation = 0;            // bumped by stop(): late callbacks of an older round do nothing
let silent = 0;
let misheard = 0;
let handsFreeEnabled = get("handsfree") !== "off";

const speech = () => (typeof Speech !== "undefined" ? Speech : null);   // the global from speech.js

const emit = () => { for (const fn of listeners) fn({ ...view }); };
const patch = (next) => { Object.assign(view, next); emit(); };
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const getView = () => ({ ...view });

export function init() { if (speech()) speech().setLang(getLang() === "en" ? "en-US" : "ko-KR"); }

// Spoken commands: the table for one screen from speech.js, and the match of a sentence against a table.
export const commandTable = (name) => (speech() && speech().COMMANDS[name]) || null;
export const matchCommand = (text, table) => (speech() && table ? speech().match(text, table) : null);

export const supported = () => Boolean(speech() && speech().supported());
export const handsFree = () => handsFreeEnabled;
export function setHandsFree(on) {
  handsFreeEnabled = Boolean(on);
  const saved = set("handsfree", on ? "on" : "off");
  if (!on) stop();
  emit();
  return saved;
}

// A new moment on a new screen: show its hint and forget the last round's message.
export function setHint(hint) { patch({ hint, message: null }); }
export function resetCounters() { silent = 0; misheard = 0; }

export function stop() {
  generation += 1;
  if (control) { try { control.stop(); } catch { /* already stopped */ } control = null; }
  if (view.status !== "idle" || view.transcript) patch({ status: "idle", transcript: "" });
}

function errorMessage(code) {
  const key = `listen.err.${code}`;
  const text = t(key);
  return text === key ? t("listen.err.other") : text;
}

const PERMISSION_CODES = new Set(["not-allowed", "service-not-allowed", "unsupported"]);

// barge: listen while the app is still reading. Only a sentence that is surely an answer (spec.quick) cuts the reading
// short; anything else heard meanwhile is most likely the app's own voice and is ignored.
export function listen(spec, { barge = false } = {}) {
  if (!supported()) { if (!barge) patch({ status: "idle", message: t("listen.unsupported"), hint: spec.hint }); return; }
  if (barge && !spec.quick) return;
  stop();
  const mine = generation;
  const reading = () => barge && speaker.isPlaying();
  const again = (delay = 300) => setTimeout(() => { if (mine === generation && handsFree()) listen(spec); }, delay);

  patch({ status: "listening", transcript: "", message: null, hint: spec.hint });
  const round = control = speech().listen({
    onInterim: (text) => {
      if (mine !== generation) return;
      if (reading()) { if (!spec.quick(text)) return; speaker.stop(); }
      patch({ transcript: text });
    },
    onFinal: (text, guesses = []) => {
      if (mine !== generation || reading()) return;
      let command = spec.parse(text);
      if (command == null) for (const guess of guesses) { command = spec.parse(guess); if (command != null) break; }
      patch({ status: "idle", transcript: text });
      if (command == null) {
        misheard += 1;
        patch({ message: t("listen.misheard", { text }) });
        if (misheard <= MAX_MISHEARD) speaker.speak([t("listen.retrySay")], { force: true, remember: false, onDone: () => again(0) });
        return;
      }
      resetCounters();
      patch({ message: null });
      spec.run(command, text, guesses);
    },
    onError: (message, code) => {
      if (mine !== generation) return;
      if (barge && !PERMISSION_CODES.has(code)) return;   // quiet while reading; onEnd starts the next round
      patch({ status: "idle" });
      if (code === "no-speech" && handsFree() && silent < MAX_SILENT_ROUNDS) { silent += 1; again(); return; }
      patch({ message: errorMessage(code) });
      if (PERMISSION_CODES.has(code)) setHandsFree(false);
    },
    onEnd: () => {
      if (control !== round) return;
      if (reading() && handsFree()) { setTimeout(() => { if (control === round && reading()) listen(spec, { barge: true }); }, 200); return; }
      if (view.status === "listening") patch({ status: "idle" });
    },
  });
}
