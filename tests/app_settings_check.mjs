import assert from "node:assert/strict";
import * as store from "../src/scenepilot/static/app/js/core/store.js";
import { createBackup, parseBackup, mergeBackup, MAX_BACKUP_BYTES, MAX_RECORDS } from "../src/scenepilot/static/app/js/core/backup.js";
import { recordSnapshot } from "../src/scenepilot/static/app/js/core/wrap.js";
import { openOnboarding, acceptOnboarding, finishOnboarding, checkMicrophone } from "../src/scenepilot/static/app/js/flows/onboarding.js";
import * as speaker from "../src/scenepilot/static/app/js/services/speak.js";
import * as voice from "../src/scenepilot/static/app/js/services/voice.js";
import * as narrator from "../src/scenepilot/static/app/js/services/narrator.js";

const realNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
const realSpeech = Object.getOwnPropertyDescriptor(globalThis, "Speech");
const originalFetch = globalThis.fetch;
const memory = new Map();
const backend = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: (key) => memory.delete(key) };
const date = "2026-10-30T05:00:00Z";
const view = { session: { id: "backup-one", stage: "summary", created_at: date, info: {
  other_contact: { value: "heard phone", confirmed: false, source: "ai_observation" },
} }, checklist: [], summary: { sections: [], missing: [] }, summary_text: "test" };
const old = recordSnapshot(view, { plate: "OLD" }, {}, {}, null, date);
function context(value = {}) {
  let current = { mode: "home", tab: "home", onboardingRun: 0, onboardingOpen: false, ...value };
  return { state: { get: () => current }, update: (patch) => { current = { ...current, ...patch }; } };
}
const tick = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

try {
  store.useBackend(backend);
  memory.set("scenepilot.insurance", JSON.stringify({ profile: { plate: "LEGACY", insurer: "legacy insurer" }, coverage: { own: "yes" } }));
  memory.set("scenepilot.records", JSON.stringify([old]));
  store.saveSessionId("do-not-import-this");
  store.saveConsent();
  store.saveSettings({ lang: "en" });
  assert.equal(store.getRecords().length, 1);
  assert.equal(store.getProfile().plate, "LEGACY");

  // Migrating to the single personal-data value preserves both existing parts.
  assert.equal(store.saveInsurance({ ...store.getProfile(), plate: "NEW" }), true);
  assert.equal(store.getRecords()[0].id, old.id);
  assert.equal(store.getCoverage().own, "yes");
  assert.equal(JSON.parse(memory.get("scenepilot.insurance")).profile.plate, "LEGACY", "ordinary writes leave older keys intact");
  assert.equal(store.setRecordCompleted(old.id, true), true);
  assert.equal(store.getProfile().plate, "NEW");

  const exported = createBackup(store.getProfile(), store.getCoverage(), store.getRecords(), date);
  const parsed = parseBackup(exported);
  assert.equal(parsed.records[0].view.session.info.other_contact.confirmed, false, "backup/restore preserves uncertainty");
  assert.ok(!exported.includes("do-not-import-this"));
  assert.ok(!exported.includes("scenepilot.consent"));
  assert.ok(!exported.includes("lang"), "device preferences and consent do not move between devices");
  const injected = { ...parsed, apiKey: "DO-NOT-KEEP", transcript: "DO-NOT-KEEP" };
  injected.records[0].view.session.transcript = "DO-NOT-KEEP";
  assert.ok(!JSON.stringify(parseBackup(JSON.stringify(injected))).includes("DO-NOT-KEEP"));
  for (const bad of ["{}", "not JSON", JSON.stringify({ ...parsed, version: 99 }), JSON.stringify({ ...parsed, records: [parsed.records[0], parsed.records[0]] })]) {
    assert.throws(() => parseBackup(bad));
  }
  assert.throws(() => parseBackup("x".repeat(MAX_BACKUP_BYTES + 1)), /backup.tooLarge/);
  const invalid = structuredClone(parsed);
  invalid.records[0].draft.claimStatus = "invented";
  assert.throws(() => parseBackup(JSON.stringify(invalid)));
  invalid.records[0].draft.claimStatus = "not_connected";
  invalid.records[0].view.session.info.other_contact.confirmed = "true";
  assert.throws(() => parseBackup(JSON.stringify(invalid)));

  const current = { insurance: { profile: { plate: "KEEP" }, coverage: {} }, records: [old] };
  const merged = mergeBackup(parsed, current);
  assert.equal(merged.insurance.profile.plate, "KEEP", "insurance replacement requires an explicit option");
  assert.equal(merged.added, 0);
  assert.equal(merged.skipped, 1);
  assert.equal(merged.records[0].completed, false, "existing same-id records win over imported values");
  assert.equal(mergeBackup(parsed, current, true).insurance.profile.plate, "NEW");
  assert.throws(() => mergeBackup({ ...parsed, records: [] }, { ...current, records: Array(MAX_RECORDS + 1).fill(old) }), /backup.tooLarge/);

  // One failed write changes neither insurance nor records.
  const before = memory.get("scenepilot.data");
  store.useBackend({ ...backend, setItem() { throw new Error("quota exceeded"); } });
  assert.equal(store.replacePersonalData(parsed.insurance, []), false);
  assert.equal(memory.get("scenepilot.data"), before);
  assert.equal(store.getProfile().plate, "NEW");
  assert.equal(store.getRecords().length, 1);
  store.useBackend(backend);

  // Voice preferences remain effective in this tab even if saving is blocked.
  store.useBackend({ ...backend, setItem() { throw new Error("blocked"); } });
  assert.equal(voice.setHandsFree(false), false);
  assert.equal(voice.handsFree(), false);
  assert.equal(speaker.setEnabled(false), false);
  assert.equal(speaker.isEnabled(), false);
  store.useBackend(backend);
  voice.setHandsFree(true); speaker.setEnabled(true);
  store.saveCoachPrefs({ mode: "ear", ai: false });
  assert.deepEqual(store.getCoachPrefs(), { mode: "ear", ai: false });

  // Replaying/skipping onboarding creates no accident or permission request.
  let networkCalls = 0;
  globalThis.fetch = async () => { networkCalls++; throw new Error("unexpected network"); };
  const ctx = context({ tab: "records" });
  openOnboarding(ctx);
  assert.equal(ctx.state.get().onboardingOpen, true);
  assert.equal(ctx.state.get().onboardingStep, 0);
  acceptOnboarding(ctx);
  assert.equal(ctx.state.get().consentAccepted, true);
  assert.equal(ctx.state.get().onboardingStep, 2);
  finishOnboarding(ctx);
  assert.equal(ctx.state.get().tab, "records");
  assert.equal(store.hasOnboarding(), true);
  assert.equal(networkCalls, 0);

  // A late microphone grant is immediately released even after the introduction is closed.
  let grant, stopped = 0;
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: {
    getUserMedia: () => new Promise((resolve) => { grant = resolve; }),
  } } });
  openOnboarding(ctx);
  const checking = checkMicrophone(ctx);
  finishOnboarding(ctx);
  grant({ getTracks: () => [{ stop() { stopped++; } }] });
  await checking;
  assert.equal(stopped, 1);
  assert.equal(ctx.state.get().onboardingOpen, false);

  // Settings cancels even a queued listening callback and does not resume it on close.
  let listens = 0;
  globalThis.Speech = { supported: () => true, listen() { listens++; return { stop() {} }; } };
  speaker.setEnabled(false);
  const spec = { key: "settings-pause", hint: "", say: [], parse: () => null, run() {} };
  narrator.narrate(spec);
  narrator.suspend();
  narrator.resume();
  narrator.narrate(spec);
  await new Promise((resolve) => setTimeout(resolve, 350));
  await tick();
  assert.equal(listens, 0);

  // Explicit local deletion clears old fallback copies, preserves preferences and other applications' data.
  memory.set("unrelated.app", "keep");
  store.saveWrapDraft("draft", { location: "private draft" });
  assert.equal(store.clearPersonalData(), true);
  assert.equal(store.getRecords().length, 0);
  assert.deepEqual(store.getProfile(), {});
  assert.equal(store.getWrapDraft("draft").location, "");
  assert.equal(store.getSessionId(), null);
  assert.equal(store.getSettings().lang, "en");
  assert.equal(store.hasConsent(), true);
  assert.equal(memory.get("unrelated.app"), "keep");
  assert.equal(memory.has("scenepilot.profile"), false);
  assert.equal(memory.has("scenepilot.insurance"), false);
} finally {
  narrator.suspend();
  narrator.narrate(null);
  narrator.resume();
  voice.stop();
  globalThis.fetch = originalFetch;
  if (realNavigator) Object.defineProperty(globalThis, "navigator", realNavigator); else delete globalThis.navigator;
  if (realSpeech) Object.defineProperty(globalThis, "Speech", realSpeech); else delete globalThis.Speech;
  store.useBackend(null);
}
console.log("app settings checks passed");
