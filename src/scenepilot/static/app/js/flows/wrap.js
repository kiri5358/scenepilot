import { post, sessionPath } from "../core/api.js";
import { t } from "../core/i18n.js";
import { getWrapDraft, getProfile, getCoverage, getRecords, putRecord, saveSessionId, hydrateWrapDraft } from "../core/store.js";
import { recordSnapshot } from "../core/wrap.js";
import * as coachSession from "../services/coach-session.js";
import { errorMessage } from "./accident.js";
import { syncContact } from "./handover.js";

// Called from all three endings: the hub, talk coaching, and the no-talk route.
export async function beginWrap(ctx) {
  const { data, busy } = ctx.state.get();
  if (!data || busy) return false;
  coachSession.forget();
  ctx.update({ busy: t("busy.working"), error: null, coach: { ...ctx.state.get().coach, status: "paused" } });
  try {
    const fresh = data.session.stage === "summary" ? data : await post(sessionPath(data.session.id, "finish"));
    hydrateWrapDraft(fresh);
    ctx.update({ data: fresh, overlay: null, busy: null, cardReturnOverlay: null, callPhase: "prep" });
    return true;
  } catch (error) {
    ctx.update({ busy: null, error: errorMessage(error), coach: { ...ctx.state.get().coach, status: "paused" } });
    return false;
  }
}

export async function saveFinalRecord(ctx) {
  const { data, busy } = ctx.state.get();
  if (!data || busy) return false;
  ctx.update({ busy: t("busy.working"), error: null });
  let result;
  try { result = await syncContact(data, getWrapDraft(data.session.id)); }
  catch (error) { ctx.update({ busy: null, error: error.message === "handover.contactTooLong" ? t("handover.contactTooLong") : errorMessage(error) }); return false; }
  const record = { ...recordSnapshot(result.data, getProfile(), getCoverage(), getWrapDraft(data.session.id), getRecords().find((item) => item?.id === data.session.id)), contactSynced: result.synced };
  if (!putRecord(record)) { ctx.update({ data: result.data, busy: null, error: t("wrap.saveError") }); return false; }
  coachSession.forget();
  saveSessionId(null);
  ctx.update({ mode: "home", tab: "records", data: null, ongoing: null, overlay: null, error: null, busy: null,
    notice: result.synced ? null : t("handover.contactLocal"), selectedRecordId: record.id, recordNotice: true, recordEditing: false });
  return true;
}
