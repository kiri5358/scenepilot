import { post, sessionPath, ApiError } from "../core/api.js";
import { contactBody, followupRows, FOLLOWUP_CHARS, FOLLOWUP_MAX } from "../core/handover.js";
import { getRecords, putRecord } from "../core/store.js";
import { t } from "../core/i18n.js";
import { errorMessage } from "./accident.js";

export async function syncContact(data, draft) {
  // Older stored snapshots have no hand-over metadata and remain usable without a live session.
  if (!data.summary?.contact) return { data, synced: false };
  const body = contactBody(draft);
  try { return { data: await post(sessionPath(data.session.id, "contact"), body), synced: true }; }
  catch (error) {
    if (error instanceof ApiError && (error.status === 0 || error.status === 404 || error.status >= 500)) return { data, synced: false };
    throw error;
  }
}

const pendingNotes = new Map();
export async function appendFollowup(ctx, text, recordId = null) {
  const current = ctx.state.get();
  if (current.busy) return false;
  const record = recordId ? getRecords().find((item) => item?.id === recordId) : null;
  if (recordId && !record) { ctx.update({ error: t("wrap.saveError") }); return false; }
  const data = record ? record.view : current.data;
  const count = record ? followupRows(record).length : data?.summary?.followups?.length || 0;
  const note = text.trim();
  if (!data || !note || note.length > FOLLOWUP_CHARS || count >= FOLLOWUP_MAX) { ctx.update({ error: t("handover.noteLimit") }); return false; }
  ctx.update({ busy: t("busy.working"), error: null });
  const pendingKey = `${recordId || data.session.id}\n${note}`;
  let { response, local = false, localNote } = pendingNotes.get(pendingKey) || {};
  try { if (!response && !local) response = await post(sessionPath(data.session.id, "followup"), { text: note }); }
  catch (error) {
    if (record && error instanceof ApiError && (error.status === 0 || error.status === 404)) local = true;
    else { ctx.update({ busy: null, error: errorMessage(error) }); return false; }
  }
  if (record) {
    if (local && !localNote) localNote = { time: new Date().toISOString(), text: note, local: true };
    pendingNotes.set(pendingKey, { response, local, localNote });
    const latest = getRecords().find((item) => item?.id === recordId);
    if (!latest) { pendingNotes.delete(pendingKey); ctx.update({ busy: null, error: t("wrap.saveError") }); return false; }
    const notes = local ? [...(latest.followups || []), localNote]
      : [...(latest.followups || []), ...(response.summary?.followups || [])];
    const updated = { ...latest, followups: followupRows({ ...latest, followups: notes }), updatedAt: new Date().toISOString() };
    if (!putRecord(updated)) { ctx.update({ busy: null, error: t("wrap.saveError") }); return false; }
    pendingNotes.delete(pendingKey);
    ctx.update({ busy: null, notice: t(local ? "handover.noteLocal" : "handover.noteSaved") });
  } else ctx.update({ data: response, busy: null, notice: t("handover.noteSaved") });
  return true;
}
