// App only. Replaces the web view's speechSynthesis with Android's own text-to-speech (the
// @capacitor-community/text-to-speech plugin). The web view's version needs no setup in a browser but is unreliable
// in an app: it can stay silent, and it does not always say when it has finished speaking, which the app needs in
// order to start listening at the right moment. The screens use the same calls as before (speak, cancel, onend).
"use strict";
(() => {
  const cap = window.Capacitor;
  const plugin = cap && cap.isNativePlatform && cap.isNativePlatform() && cap.Plugins && cap.Plugins.TextToSpeech;
  if (!plugin) return;

  class Utterance {
    constructor(text) {
      this.text = String(text || "");
      this.lang = "en-US"; this.rate = 1; this.pitch = 1; this.volume = 1;
      this.onend = null; this.onerror = null;
    }
  }

  let turn = 0;          // identifies the utterance that is allowed to report back; cancelled ones stay quiet
  let speaking = false;
  const note = (message) => { try { console.log("[ScenePilot TTS] " + message); } catch { /* no console */ } };

  const synthesis = {
    get speaking() { return speaking; },
    get pending() { return false; },
    cancel() { turn += 1; speaking = false; plugin.stop().catch(() => {}); },
    speak(utterance) {
      const mine = (turn += 1);
      speaking = true;
      plugin.speak({ text: utterance.text, lang: utterance.lang || "en-US", rate: utterance.rate || 1, pitch: utterance.pitch || 1, volume: utterance.volume == null ? 1 : utterance.volume })
        .then(() => { if (turn === mine) { speaking = false; utterance.onend && utterance.onend({}); } })
        .catch((e) => {
          note("speak failed: " + String((e && e.message) || e));
          if (turn === mine) { speaking = false; utterance.onerror && utterance.onerror(e); }
        });
    },
    getVoices() { return []; },
  };

  window.SpeechSynthesisUtterance = Utterance;
  Object.defineProperty(window, "speechSynthesis", { value: synthesis, configurable: true, writable: true });
  note("using Android text-to-speech");
})();
