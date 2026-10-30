// Vibration for a reminder. It works in Chrome on Android; an iPhone has none, so the screen is the only signal there.
export const canVibrate = () => typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

export function vibrate(pattern) {
  if (!canVibrate() || !pattern) return false;
  try { return navigator.vibrate(pattern); } catch { return false; }
}
