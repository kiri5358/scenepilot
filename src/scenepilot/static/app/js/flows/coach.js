// Starting and leaving the talk coaching. Starting happens on a tap, which the phone needs for the screen lock and the microphone.
import * as coachSession from "../services/coach-session.js";

const FRESH_COACH = { status: "listening", hint: null, danger: null, aiError: false };

export function startTalk(ctx) {
  const prefs = ctx.state.get().coachPrefs;
  ctx.update({ overlay: "coach", cardReturnOverlay: null, coach: { ...FRESH_COACH } });
  coachSession.start(ctx, prefs);
}

// Leave the coaching: stop listening and go back to the choice screen.
export function endTalk(ctx) {
  coachSession.forget();
  ctx.update({ overlay: null, cardReturnOverlay: null, coach: { ...FRESH_COACH, status: "paused" } });
}

// After a danger card: the person is safe again. Coaching goes on where it was.
export function backToTalk(ctx) {
  ctx.update({ overlay: "coach", coach: { ...ctx.state.get().coach, hint: null, danger: null, status: "listening" } });
  return coachSession.resume();
}

export function openCard(ctx) {
  const { overlay } = ctx.state.get();
  if (overlay === "my-card") return;
  ctx.update({ overlay: "my-card", cardReturnOverlay: overlay || "coach" });
}

// Closing the card shown to the other driver: a danger that came meanwhile is shown now.
export function closeCard(ctx) {
  const { coach, cardReturnOverlay } = ctx.state.get();
  ctx.update({ overlay: coach.danger ? "coach-danger" : cardReturnOverlay || "coach", cardReturnOverlay: null });
}
