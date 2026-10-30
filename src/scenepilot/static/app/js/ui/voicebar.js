// The two bars above the bottom buttons of an accident screen:
//   1. what the app is reading aloud, with "pause / hear again" and a mute switch
//   2. what the app is listening for ("듣고 있어요 · ..."), with a button to speak or to stop listening
// Both are created once and kept; they redraw themselves when the speaker or the listener changes, so a redraw of the
// screen never cuts them off.
import { h } from "./dom.js";
import { icon } from "./icons.js";
import { t } from "../core/i18n.js";
import * as speaker from "../services/speak.js";
import * as voice from "../services/voice.js";
import { listenNow, repeat, stopListening } from "../services/narrator.js";

const readBar = h("div", { class: "voicebar", role: "status" });
const listenBar = h("div", { class: "listenbar", role: "status" });
let wanted = false;          // show the reading bar
let listenWanted = false;    // show the listening bar (a screen with no spoken answer hides it)

function paintRead() {
  const on = speaker.isEnabled();
  const playing = on && speaker.isPlaying();
  const text = !on ? t("vb.off") : playing ? t("vb.playing") : t("vb.stopped");
  const buttonLabel = !on ? t("vb.enable") : playing ? t("vb.stop") : t("vb.replay");
  const buttonAction = !on ? () => { speaker.setEnabled(true); repeat(); }
    : playing ? () => speaker.stop()
    : () => repeat();
  readBar.className = on ? "voicebar" : "voicebar voicebar--off";
  readBar.replaceChildren(
    h("span", { class: "voicebar-text" },
      playing ? h("span", { class: "eq", "aria-hidden": "true" }, h("i"), h("i"), h("i")) : null, text),
    h("span", { class: "voicebar-buttons" },
      h("button", { type: "button", class: "voicebar-btn", onclick: buttonAction }, buttonLabel),
      h("button", {
        type: "button", class: on ? "vol" : "vol vol--off", "aria-pressed": String(!on),
        "aria-label": on ? t("vb.muteOn") : t("vb.muteOff"), title: on ? t("vb.muteOn") : t("vb.muteOff"),
        onclick: () => speaker.setEnabled(!on),
      }, icon(on ? "volume" : "mute"))));
  readBar.hidden = !wanted;
}

function paintListen() {
  const view = voice.getView();
  const supported = voice.supported();
  const live = view.status === "listening";
  listenBar.hidden = !listenWanted || (!supported && !view.message);
  if (listenBar.hidden) return;
  const caption = view.message
    || (live ? `${t("listen.live")} · ${view.hint || ""}` : voice.handsFree() ? view.hint || t("listen.idle") : t("listen.idle"));
  listenBar.className = live ? "listenbar listenbar--live" : "listenbar";
  listenBar.replaceChildren(
    h("span", { class: "pulse" }, icon("mic", "ico--sm")),
    h("span", { class: "listenbar-text" },
      view.transcript && live ? h("span", { class: "heard-text" }, `"${view.transcript}"`) : null,
      h("span", {}, caption)),
    supported
      ? h("button", { type: "button", class: "voicebar-btn", onclick: live ? stopListening : listenNow }, live ? t("listen.stop") : t("listen.start"))
      : null);
}

speaker.subscribe(paintRead);
voice.subscribe(paintListen);
paintRead();
paintListen();

// Show or hide both bars for the screen being drawn. Returns the two elements to place on the page.
export function voiceBars(show, { listen = true } = {}) {
  wanted = Boolean(show);
  listenWanted = wanted && listen;
  paintRead();
  paintListen();
  return [readBar, listenBar];
}

// Redraw the words (after the language changed).
export function repaintVoiceBars() { paintRead(); paintListen(); }
