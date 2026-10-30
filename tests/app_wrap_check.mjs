// Wrap up a session, preserve uncertainty, and reopen its local snapshot without a server.
import assert from "node:assert/strict";
import * as store from "../src/scenepilot/static/app/js/core/store.js";
import { callRows, remainingTasks, recordSnapshot, readRecord, recordStatusKey } from "../src/scenepilot/static/app/js/core/wrap.js";
import { beginWrap, saveFinalRecord } from "../src/scenepilot/static/app/js/flows/wrap.js";
import { confirmInfoValue } from "../src/scenepilot/static/app/js/flows/info.js";

const originalFetch = globalThis.fetch;
const memory = new Map();
const backend = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: (key) => memory.delete(key) };
const response = (body, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body });
const view = {
  session: { id: "wrap-one", stage: "hub", created_at: "2026-10-30T03:00:00Z", info: {
    other_contact: { value: "010-0000-0000", source: "ai_observation", confirmed: false },
    other_insurance: { value: "보험사", source: "user_statement", confirmed: true },
  }, questions_asked: 7, transcript: "must not be stored" },
  checklist: [
    { id: "damage", title: "내 차", core: true, status: "captured" },
    { id: "other_vehicle", title: "상대 차", core: true, status: "captured" },
    { id: "scene_wide", title: "현장", core: true, status: "skipped" },
  ],
  summary: { sections: [], leave_check: ["확인하세요"], disclaimer: "안내" }, summary_text: "요약",
  transcript: "must not be stored", qa: ["must not be stored"], audio: "must not be stored",
};
function context(data) {
  let value = { mode: "accident", overlay: "coach", data, busy: null, coach: { status: "listening" } };
  return { state: { get: () => value }, update: (patch) => { value = { ...value, ...patch }; } };
}

try {
  store.useBackend(backend);
  store.saveSessionId(view.session.id);
  store.saveInsurance({ name: "테스트", plate: "12가 3456" }, { own: "unknown" });
  assert.equal(store.saveWrapDraft(view.session.id, { location: "테스트 도로", statement: "두 차 접촉", injuryStatus: "mentioned", injuryNote: "동승자 목 불편" }), true);
  assert.equal(store.getWrapDraft("another-accident").location, "", "drafts are scoped to each accident");
  store.useBackend(backend);
  assert.equal(store.getWrapDraft(view.session.id).location, "테스트 도로", "reload restores the local draft");

  const draft = store.getWrapDraft(view.session.id);
  const tasks = remainingTasks(view, draft).map((task) => task.id);
  assert.ok(tasks.includes("other_contact"), "hearing a phone number does not confirm it");
  assert.ok(tasks.includes("other_plate"), "having a photo does not fill in a license plate number");
  assert.ok(tasks.includes("photo:scene_wide"), "a skipped photo stays in the outstanding tasks");
  assert.ok(tasks.includes("injuryScope"), "a mentioned injury requires checking the claim scope");
  assert.ok(tasks.includes("claimNumber"));
  const rows = callRows(view, store.getProfile(), draft);
  assert.equal(rows.find((row) => row.key === "time").source, "system");
  assert.equal(rows.find((row) => row.key === "time").kind, "unknown", "record start is not a confirmed accident time");
  assert.equal(rows.find((row) => row.key === "other").kind, "heard", "the other vehicle is not fully confirmed");

  // Actual server transitions: finish at the hub; confirm in info; return to summary.
  const calls = [];
  let serverView = structuredClone(view);
  globalThis.fetch = async (path, options) => {
    const body = JSON.parse(options?.body || "{}");
    calls.push([path, body]);
    if (path.endsWith("/finish")) serverView.session.stage = "summary";
    else if (path.endsWith("/goto")) serverView.session.stage = body.target;
    else if (path.endsWith("/info/confirm")) {
      assert.equal(serverView.session.stage, "info");
      serverView.session.info[body.field].confirmed = true;
    }
    return response(structuredClone(serverView));
  };
  const ctx = context(structuredClone(view));
  assert.equal(await beginWrap(ctx), true);
  assert.equal(ctx.state.get().data.session.stage, "summary");
  assert.equal(ctx.state.get().overlay, null);
  assert.equal(ctx.state.get().coach.status, "paused");
  assert.equal(await confirmInfoValue(ctx, "other_contact"), true);
  assert.deepEqual(calls.map(([path]) => path.split("/").slice(-1)[0]), ["finish", "goto", "confirm", "goto"]);
  assert.equal(ctx.state.get().data.session.stage, "summary");
  assert.equal(ctx.state.get().busy, null);
  assert.ok(!remainingTasks(ctx.state.get().data, draft).some((task) => task.id === "other_contact"));

  // No restrictions on saving an incomplete call; unknowns must survive into the record.
  const beforeFailure = ctx.state.get().data;
  store.useBackend({ ...backend, setItem() { throw new Error("quota"); } });
  assert.equal(saveFinalRecord(ctx), false);
  assert.equal(ctx.state.get().data, beforeFailure, "failed saves keep the accident and inputs open");
  assert.equal(store.getSessionId(), "wrap-one", "failed saves must not clear the active session id");
  store.useBackend(backend);
  assert.equal(saveFinalRecord(ctx), true);
  assert.equal(store.getSessionId(), null);
  assert.equal(ctx.state.get().tab, "records");
  assert.equal(ctx.state.get().data, null);
  const record = store.getRecords()[0];
  assert.equal(record.draft.claimNumber, "");
  assert.equal(recordStatusKey(record), "wrap.claimStatus.not_connected", "saving a record does not imply an insurer is processing a claim");
  assert.equal(record.draft.injuryStatus, "mentioned");
  assert.ok(!JSON.stringify(record).includes("must not be stored"), "do not archive transcripts, audio, or free-question history");
  assert.equal(record.profile.plate, "12가 3456");

  // The snapshot is independent of later profile edits and the disappearing server session.
  store.saveInsurance({ plate: "changed later" });
  serverView = null;
  globalThis.fetch = async () => { throw new Error("server offline"); };
  assert.equal(store.getRecords()[0].profile.plate, "12가 3456");
  assert.equal(store.getRecords()[0].view.session.info.other_contact.confirmed, true);
  assert.equal(store.setRecordCompleted(record.id, true), true);
  const completed = store.getRecords()[0];
  assert.equal(completed.completed, true);
  assert.ok(remainingTasks(completed.view, completed.draft).length > 0, "marking complete does not erase unconfirmed facts");
  assert.equal(store.putRecord({ ...completed, updatedAt: "later" }), true);
  assert.equal(store.getRecords().length, 1, "saving the same accident again updates its snapshot rather than duplicating it");
  store.saveWrapDraft(record.id, { claimNumber: "TEST-001", claimStatus: "number_received", scopes: ["injury", "own_damage"] });
  assert.equal(store.saveRecordDraft(record.id), true, "a call result can be updated with the server offline");
  const edited = store.getRecords()[0];
  assert.equal(edited.draft.claimNumber, "TEST-001");
  assert.equal(edited.profile.plate, "12가 3456", "later edits retain the original profile snapshot");
  assert.ok(!remainingTasks(edited.view, edited.draft).some((task) => ["claimNumber", "claimStatus", "injuryScope"].includes(task.id)));

  assert.equal(readRecord(null), null);
  assert.equal(readRecord({ id: "broken", view: {} }), null);
  const repaired = readRecord({ ...record, draft: null, view: { ...record.view, checklist: 5, summary: { sections: [null, { items: 3 }] } } });
  assert.deepEqual(repaired.draft.scopes, []);
  assert.deepEqual(repaired.view.checklist, []);
  assert.deepEqual(repaired.view.summary.sections[0].items, []);
  const newSnapshot = recordSnapshot(view, {}, {}, { scopes: ["injury", "invented"], claimStatus: "invented" });
  assert.deepEqual(newSnapshot.draft.scopes, ["injury"]);
  assert.equal(newSnapshot.draft.claimStatus, "not_connected");

  // A failed server transition leaves a usable paused coach and a retryable action.
  const failed = context(view);
  assert.equal(await beginWrap(failed), false);
  assert.equal(failed.state.get().busy, null);
  assert.equal(failed.state.get().overlay, "coach");
  assert.equal(failed.state.get().coach.status, "paused");
} finally {
  globalThis.fetch = originalFetch;
  store.useBackend(null);
}
console.log("app wrap checks passed");
