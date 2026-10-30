import assert from "node:assert/strict";
import fs from "node:fs";
import { planHint } from "../src/scenepilot/static/app/js/core/coach.js";
import { contactBody, contactPatch, followupRows } from "../src/scenepilot/static/app/js/core/handover.js";
import { recordSnapshot } from "../src/scenepilot/static/app/js/core/wrap.js";
import { createBackup, parseBackup } from "../src/scenepilot/static/app/js/core/backup.js";
import * as store from "../src/scenepilot/static/app/js/core/store.js";
// Each protocol fixture starts with a fresh module cache, as a newly loaded browser page does.
const session = await import("../src/scenepilot/static/app/js/services/coach-session.js?handover-contract");
import { syncContact, appendFollowup } from "../src/scenepilot/static/app/js/flows/handover.js";

const actual = process.argv.includes("--protocol");
const risks = ["coverage", "refuse", "uninsured", "tow"];
const protocol = actual ? JSON.parse(fs.readFileSync(0, "utf8")) : {
  rules: risks.map((id) => ({ id, hint: `server hint ${id}`, phrases: [id] })),
  say: Object.fromEntries(risks.map((id) => [id, `server sentence ${id}`])), severity: Object.fromEntries(risks.map((id) => [id, 2])),
};
const originals = new Map(["fetch", "Speech", "Watch"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const memory = new Map();
const backend = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: (key) => memory.delete(key) };
const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
function context(data) {
  let value = { mode: "accident", data, coach: {}, coachPrefs: { mode: "screen", ai: false }, busy: null };
  return { state: { get: () => value }, update: (patch) => { value = { ...value, ...patch }; } };
}

try {
  // The Python wrapper supplies the actual current API response, so these assertions catch contract drift.
  for (const id of risks) {
    const rule = protocol.rules.find((rule) => rule.id === id);
    assert.ok(rule, id);
    const plan = planHint(rule, protocol);
    assert.equal(plan.say, protocol.say[id]);
    assert.equal(plan.category, "stop");
    assert.equal(plan.pattern.length, 3, "two vibrations, separated by a pause");
  }
  assert.equal(planHint({ id: "ai", hint: "generated text" }, { say: { ai: "do not show" } }).say, null);
  const ctx = context({ session: { id: "handover-one" } });
  let handlers;
  globalThis.Speech = { supported: () => true };
  globalThis.Watch = { start(options) { handlers = options; return { stop() {}, heard: () => "" }; } };
  globalThis.fetch = async () => response(protocol);
  await session.start(ctx, { mode: "screen", ai: false });
  handlers.onHint(protocol.rules.find((rule) => rule.id === "coverage"), () => {});
  assert.equal(ctx.state.get().coach.hint.say, protocol.say.coverage, "the live service uses the backend sentence");
  session.forget();

  const draft = { claimStatus: "number_received", claimNumber: "TEST-001", agent: "test agent" };
  assert.deepEqual(contactBody(draft), { state: "told", number: "TEST-001", agent: "test agent" });
  assert.throws(() => contactBody({ ...draft, agent: "x".repeat(41) }), /handover.contactTooLong/);
  assert.deepEqual(contactPatch({ claimStatus: "not_connected", claimNumber: "", agent: "" }, { state: "trying", number: "", agent: "" }), { claimStatus: "trying", claimNumber: "", agent: "" });
  assert.deepEqual(contactPatch({ ...draft, contactDirty: true }, { state: "before", number: "different" }), {}, "local edits are not silently overwritten");

  const date = "2026-10-30T05:00:00Z";
  const data = { session: { id: "handover-one", created_at: date, info: {}, hit: { vehicle: "yes" }, coverage: { number: "unknown" } }, checklist: [],
    summary: { sections: [], call_card: ["server card"], hit_rows: [{ id: "vehicle", label: "차량", state: "yes", state_label: "예" }],
      coverage_rows: [{ id: "number", label: "접수번호 확인", state: "unknown", state_label: "아직 안 함" }], followups: [],
      contact: { state: "before", state_label: "연락 전", number: "", agent: "" },
      uninsured: { title: "안내", lines: ["source text"], source: { title: "source", url: "https://example.test/source" } },
      titles: { followup: "후속 기록" } }, summary_text: "original summary" };
  let body;
  globalThis.fetch = async (url, options) => { body = JSON.parse(options.body); return response({ ...data, summary: { ...data.summary, contact: body } }); };
  const contact = await syncContact(data, draft);
  assert.equal(contact.synced, true);
  assert.equal(body.number, "TEST-001");
  assert.deepEqual(data.session.coverage, { number: "unknown" }, "a filled claim number never confirms a reporting check");
  globalThis.fetch = async () => response({ detail: "gone" }, 404);
  assert.equal((await syncContact(data, draft)).synced, false);

  store.useBackend(backend);
  const record = recordSnapshot(data, {}, {}, {}, null, date);
  store.putRecord(record);
  const saved = JSON.stringify(record.view.summary.sections);
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return response({ ...data, summary: { ...data.summary, followups: [{ time: "2026-10-30 14:00 KST", text: "추가 확인 내용" }] } });
  };
  // If saving locally fails after the server accepted a note, retry persistence rather than append it twice.
  store.useBackend({ ...backend, setItem() { throw new Error("quota"); } });
  assert.equal(await appendFollowup(ctx, "추가 확인 내용", record.id), false);
  store.useBackend(backend);
  assert.equal(await appendFollowup(ctx, "추가 확인 내용", record.id), true);
  assert.equal(calls, 1);
  globalThis.fetch = async () => response({ detail: "gone" }, 404);
  assert.equal(await appendFollowup(ctx, "서버 만료 후 메모", record.id), true);
  const updated = store.getRecords()[0];
  assert.equal(followupRows(updated).length, 2);
  assert.equal(updated.followups[1].local, true);
  assert.equal(JSON.stringify(updated.view.summary.sections), saved, "later notes do not rewrite the initial record");
  const restored = parseBackup(createBackup({}, {}, [updated], date)).records[0];
  assert.equal(restored.view.summary.call_card[0], "server card");
  assert.equal(restored.view.summary.hit_rows[0].state, "yes");
  assert.equal(restored.view.summary.coverage_rows[0].state, "unknown");
  assert.equal(restored.view.summary.uninsured.source.url, "https://example.test/source");
  assert.equal(followupRows(restored).length, 2);
} finally {
  session.forget();
  store.useBackend(null);
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
}
console.log("app handover checks passed");
