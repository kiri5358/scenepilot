// Starting, resuming and leaving an accident. The session lives on the server; this phone only remembers its id.
import { ApiError, getSession, startSession } from "../core/api.js";
import { getSessionId, hasConsent, saveSessionId } from "../core/store.js";
import { t } from "../core/i18n.js";
import { askConsent } from "./consent.js";

export function errorMessage(error) {
  if (error instanceof ApiError) {
    if (error.status === 0) return t("err.network");
    if (error.status === 429) return t("err.busy");
  }
  return t("err.server");
}

export async function startAccident({ state, update }) {
  if (state.get().busy) return;
  if (!hasConsent() && !(await askConsent())) return;
  update({ busy: t("busy.starting"), error: null });
  try {
    const data = await startSession();
    saveSessionId(data.session.id);
    update({ mode: "accident", overlay: null, data, ongoing: null, busy: null, qa: [], guideItem: 0, lastPhoto: null });
  } catch (error) {
    update({ busy: null, error: errorMessage(error) });
  }
}

// Open the accident again from the home screen.
export async function resumeAccident({ state, update }) {
  const current = state.get();
  if (current.data) { update({ mode: "accident", overlay: null }); return; }
  const id = getSessionId();
  if (!id) return;
  update({ busy: t("busy.starting"), error: null });
  try {
    update({ mode: "accident", overlay: null, data: await getSession(id), busy: null });
  } catch (error) {
    update({ busy: null, error: errorMessage(error) });
  }
}

// "‹ Home": leave the accident screens without ending the accident.
export function leaveToHome({ state, update }) {
  const { data } = state.get();
  update({ mode: "home", tab: "home", overlay: null, ongoing: data ? { stage: data.session.stage, createdAt: data.session.created_at } : null });
}

// On launch: is there an accident from before that the server still knows?
export async function checkOngoing({ update }) {
  const id = getSessionId();
  if (!id) return;
  try {
    const data = await getSession(id);
    update({ data, ongoing: { stage: data.session.stage, createdAt: data.session.created_at } });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      saveSessionId(null);
      update({ ongoing: "expired" });
    }
    // other failures (offline, server asleep): stay quiet, the home screen still works
  }
}
