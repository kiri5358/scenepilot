import { post, sessionPath } from "../core/api.js";
import { t } from "../core/i18n.js";
import { getWrapDraft, getProfile, getCoverage, getRecords, putRecord, saveSessionId } from "../core/store.js";
import { recordSnapshot } from "../core/wrap.js";
import * as coachSession from "../services/coach-session.js";
import { errorMessage } from "./accident.js";

// Called from all three endings: the hub, talk coaching, and the no-talk route.
export async function beginWrap(ctx) {
  const { data, busy } = ctx.state.get();
  if (!data || busy) return false;
  coachSession.forget();
  ctx.update({ busy: t("busy.working"), error: null, coach: { ...ctx.state.get().coach, status: "paused" } });
  try {
    const fresh = data.session.stage === "summary" ? data : await post(sessionPath(data.session.id, "finish"));
    ctx.update({ data: fresh, overlay: null, busy: null, cardReturnOverlay: null, callPhase: "prep" });
    return true;
  } catch (error) {
    ctx.update({ busy: null, error: errorMessage(error), coach: { ...ctx.state.get().coach, status: "paused" } });
    return false;
  }
}

export function saveFinalRecord(ctx) {
  const { data, busy } = ctx.state.get();
  if (!data || busy) return false;
  const record = recordSnapshot(data, getProfile(), getCoverage(), getWrapDraft(data.session.id), getRecords().find((item) => item?.id === data.session.id));
  if (!putRecord(record)) { ctx.update({ error: t("wrap.saveError") }); return false; }
  coachSession.forget();
  saveSessionId(null);
  ctx.update({ mode: "home", tab: "records", data: null, ongoing: null, overlay: null, error: null, selectedRecordId: record.id, recordNotice: true, recordEditing: false });
  return true;
}
