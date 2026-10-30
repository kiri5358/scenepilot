// Ties reading aloud and listening to the screen. A screen gives a spec:
//   { key, say: [sentences], hint, parse(text), run(command, text, guesses), quick?(text), listen?: false }
// The same key means the same moment, so a redraw never makes the app read the screen again. A new key reads the new
// sentences while already listening for a surely-understood answer (so an answer can cut the reading short), then
// listens normally when the reading has finished (when hands-free is on). No spec means a screen without voice: stay quiet.
import * as speaker from "./speak.js";
import * as voice from "./voice.js";
import { isShortCommand } from "../core/commands.js";

let lastKey = null;
let current = null;

// The listening spec always calls the newest screen's code, because the screen is redrawn while the app reads.
const live = () => ({
  hint: current.hint,
  parse: (text) => current.parse(text),
  quick: (text) => (current.quick ? current.quick(text) : isShortCommand(text, current.parse)),
  run: (command, text, guesses) => current.run(command, text, guesses),
});

const wantsVoice = () => Boolean(current) && current.listen !== false && voice.handsFree();

export function narrate(spec) {
  current = spec || null;
  if (!spec) {
    if (lastKey !== null) { speaker.stop(); voice.stop(); lastKey = null; }
    return;
  }
  if (spec.key === lastKey) return;
  lastKey = spec.key;
  const key = spec.key;
  voice.stop();
  voice.resetCounters();
  voice.setHint(spec.hint);
  speaker.speak(spec.say || [], {
    onDone: () => {
      if (lastKey !== key || !wantsVoice()) return;
      setTimeout(() => { if (lastKey === key && current) voice.listen(live()); }, 300);
    },
  });
  if (wantsVoice() && current.barge !== false && speaker.isPlaying()) voice.listen(live(), { barge: true });
}

// Listen again on the same screen (for example for a follow-up question after an answer was read out).
export function resumeListening() {
  if (wantsVoice()) voice.listen(live());
}

// "Hear it again" from a spoken command or a button.
export function repeat() {
  if (!current) return;
  const key = lastKey;
  voice.stop();
  // sayFull: the longer version a screen may keep for "again" (the first reading only announces a long note by its title)
  speaker.speak(current.sayFull || current.say || [], {
    onDone: () => {
      if (key !== lastKey || !wantsVoice()) return;
      setTimeout(() => { if (key === lastKey && current) voice.listen(live()); }, 300);
    },
  });
  if (wantsVoice() && speaker.isPlaying()) voice.listen(live(), { barge: true });
}

// The "Speak" button: listen now, even if listening was switched off.
export function listenNow() {
  if (!current) return;
  voice.setHandsFree(true);
  speaker.stop();
  voice.resetCounters();
  voice.listen(live());
}

export function stopListening() {
  voice.setHandsFree(false);
  voice.stop();
}
