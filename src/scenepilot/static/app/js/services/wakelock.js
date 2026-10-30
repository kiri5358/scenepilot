// Keep the screen on while the talk is being coached (a phone that goes dark cannot show the reminders).
// The browser may refuse or release it (for example when the page is hidden), so it is asked for again when the page returns.
let lock = null;
let wanted = false;

async function request() {
  if (!wanted || lock || typeof navigator === "undefined" || !navigator.wakeLock || document.visibilityState !== "visible") return;
  try {
    const mine = await navigator.wakeLock.request("screen");
    // A request may finish after coaching was stopped, or after another request acquired the lock.
    if (!wanted || lock) { await mine.release(); return; }
    lock = mine;
    mine.addEventListener("release", () => { if (lock === mine) lock = null; });
  } catch { /* refused: the person can keep the screen on by touch */ }
}

if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => { if (wanted && !lock) request(); });

export function keepAwake() { wanted = true; return request(); }

export async function release() {
  wanted = false;
  const current = lock;
  lock = null;
  if (current) { try { await current.release(); } catch { /* already released */ } }
}
