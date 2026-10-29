// App only. Android's web view has no browser speech recognition, so this swaps Speech.supported() and Speech.listen()
// for Android's own recognizer (the @capacitor-community/speech-recognition plugin). Everything else in speech.js
// (command matching, the ?fakespeech test mode) is unchanged, and the screens do not know the difference.
//
// Facts about the plugin that this code is built around (seen in the phone's log):
//  - It reports "stopped" BEFORE it delivers the final text, so "stopped" must not end the turn by itself.
//  - A stale "Didn't understand" error from an earlier turn can reject the NEW start() call, although the new turn goes on.
//  - Calling stop() when nothing is running can disturb the next start(), so it is only called while a turn is live.
"use strict";
(() => {
  const cap = window.Capacitor;
  const plugin = cap && cap.isNativePlatform && cap.isNativePlatform() && cap.Plugins && cap.Plugins.SpeechRecognition;
  if (!plugin || typeof Speech === "undefined") return;

  const webSupported = Speech.supported;
  const webListen = Speech.listen;
  const DENIED = "Microphone permission was denied. You can allow it in the phone's settings, or use the buttons.";
  // Android only reports the final answer after about 2 seconds of silence. Once the text has stopped changing for this
  // long, we stop listening ourselves so the app can move on sooner.
  const SETTLED_MS = 800;
  // After "stopped", how long to wait for the final text before giving up on this turn.
  // (in the phone's log it followed within 5 ms; when we already hold some text we wait less)
  const FINAL_GRACE_MS = 1500;
  const FINAL_GRACE_WITH_TEXT_MS = 600;
  const MAX_TURN_MS = 10000;
  let available = null;
  plugin.available().then((r) => { available = !!(r && r.available); }).catch(() => { available = false; });

  Speech.supported = () => (Speech.fakeActive() ? webSupported() : available !== false);

  Speech.listen = (options = {}) => {
    if (Speech.fakeActive()) return webListen(options);
    // the language of the edition in use (en-US, or ko-KR in the Korea edition) unless the caller names one
    const { lang = Speech.getLang ? Speech.getLang() : "en-US", onInterim, onFinal, onError, onEnd } = options;
    const handles = [];
    let last = "";
    let guesses = [];
    let done = false;
    let stoppedByPlugin = false;
    let watchdog = null;
    let settled = null;
    let grace = null;

    const ctrl = {
      stopped: false,
      stop() {
        ctrl.stopped = true;
        if (!done) plugin.stop().catch(() => {});
      },
    };

    const finish = (message, code) => {
      if (done) return;
      done = true;
      clearTimeout(watchdog); clearTimeout(settled); clearTimeout(grace);
      handles.forEach((h) => { try { h.remove(); } catch { /* already removed */ } });
      if (!ctrl.stopped) {
        if (message) onError && onError(message, code);
        else if (last.trim()) onFinal && onFinal(last.trim(), guesses);
        else onError && onError("I didn't hear anything.", "no-speech");
      }
      onEnd && onEnd();
    };

    (async () => {
      try {
        let perm = await plugin.checkPermissions();
        if (perm.speechRecognition !== "granted") perm = await plugin.requestPermissions();
        if (perm.speechRecognition !== "granted") return finish(DENIED, "not-allowed");

        handles.push(await plugin.addListener("partialResults", (event) => {
          if (done || ctrl.stopped) return;
          last = (event.matches && event.matches[0]) || last;
          if (event.matches && event.matches.length) guesses = event.matches.slice();
          if (stoppedByPlugin) return finish();   // the final text arrived after "stopped": we have it, so we are done
          onInterim && onInterim(last);
          clearTimeout(settled);
          if (last.trim()) settled = setTimeout(() => { if (!done) plugin.stop().catch(() => {}); }, SETTLED_MS);
        }));
        handles.push(await plugin.addListener("listeningState", (event) => {
          if (event.status !== "stopped" || done) return;
          stoppedByPlugin = true;
          clearTimeout(settled);
          grace = setTimeout(() => finish(), last.trim() ? FINAL_GRACE_WITH_TEXT_MS : FINAL_GRACE_MS);
        }));

        watchdog = setTimeout(() => { if (!done) plugin.stop().catch(() => {}); grace = setTimeout(() => finish(), FINAL_GRACE_MS); }, MAX_TURN_MS);
        // start() can reject for two different reasons: a real failure, or a stale "no match" from the previous turn.
        plugin.start({ language: lang, maxResults: 5, partialResults: true, popup: false }).catch((e) => {
          const text = String((e && e.message) || e || "");
          if (/didn'?t understand|no match|no speech|not match/i.test(text)) return;   // stale: the turn that just began goes on
          if (/network/i.test(text)) return finish("Voice recognition needs a good internet connection. Use the buttons, or try again.", "network");
          finish("Voice recognition failed. Use the buttons instead.", "start-failed");
        });
      } catch (e) {
        finish("Voice recognition failed. Use the buttons instead.", "start-failed");
      }
    })();
    return ctrl;
  };
})();
