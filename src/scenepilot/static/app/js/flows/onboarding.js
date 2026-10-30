import { saveOnboarding, saveConsent } from "../core/store.js";
import { t } from "../core/i18n.js";
import { startAccident } from "./accident.js";

export function openOnboarding(ctx) {
  const current = ctx.state.get();
  ctx.update({ onboardingOpen: true, onboardingStep: 0, onboardingRun: (current.onboardingRun || 0) + 1,
    onboardingReturnTab: current.tab, onboardingMic: "idle", error: null, notice: null });
}
export function finishOnboarding(ctx, { tab, accident = false } = {}) {
  const saved = saveOnboarding();
  ctx.update({ onboardingOpen: false, tab: tab || ctx.state.get().onboardingReturnTab || "home", error: saved ? null : t("settings.sessionOnly") });
  if (accident) return startAccident(ctx);
}
export function acceptOnboarding(ctx) {
  saveConsent();
  ctx.update({ consentAccepted: true, onboardingStep: 2 });
}
export async function checkMicrophone(ctx) {
  const run = ctx.state.get().onboardingRun;
  ctx.update({ onboardingMic: "asking" });
  let status = "failed";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) track.stop();
    status = "ready";
  } catch { /* use the buttons when unavailable or permission is refused */ }
  const current = ctx.state.get();
  if (current.onboardingOpen && current.onboardingRun === run) ctx.update({ onboardingMic: status });
}
