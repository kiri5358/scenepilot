// Backups contain only supported personal fields and saved snapshots. No session ids, consent, settings or raw media.
import { PROFILE_FIELDS, COVERAGES, COVERAGE_VALUES, isObject, normalizeProfile, normalizeCoverage, validPolicyDates } from "./insurance.js";
import { CLAIM_STATUSES, CLAIM_SCOPES, normalizeDraft } from "./wrap.js";

export const MAX_BACKUP_BYTES = 2 * 1024 * 1024;
export const MAX_RECORDS = 200;
const SOURCES = ["user_statement", "photo", "ai_observation", "unconfirmed", "system"];
const requireValue = (test) => { if (!test) throw new Error("backup.invalid"); };
const text = (value, max = 10000) => { requireValue(typeof value === "string" && value.length <= max); return value; };
const list = (value, max = 1000) => { requireValue(Array.isArray(value) && value.length <= max); return value; };
const date = (value) => { text(value, 50); requireValue(Number.isFinite(Date.parse(value))); return value; };
const object = (value) => { requireValue(isObject(value)); return value; };
const strings = (value = []) => list(value).map((item) => text(item));

function profile(value) {
  object(value);
  for (const { id, max } of PROFILE_FIELDS) if (id in value) text(value[id], max);
  const result = normalizeProfile(value);
  requireValue(validPolicyDates(result));
  return result;
}
function coverage(value) {
  object(value);
  for (const id of COVERAGES) if (id in value) requireValue(COVERAGE_VALUES.includes(value[id]));
  return normalizeCoverage(value);
}
function draft(value) {
  object(value);
  for (const [id, max] of Object.entries({ location: 300, incidentAt: 30, statement: 2000, injuryNote: 500, claimNumber: 100, agent: 200 })) {
    if (id in value) text(value[id], max);
  }
  for (const [id, allowed] of Object.entries({ injuryStatus: ["unknown", "none", "mentioned"], towing: ["unknown", "yes", "no"], dashcam: ["unknown", "saved", "unavailable"], claimStatus: CLAIM_STATUSES })) {
    if (id in value) requireValue(allowed.includes(value[id]));
  }
  if ("scopes" in value) list(value.scopes, CLAIM_SCOPES.length).forEach((scope) => requireValue(CLAIM_SCOPES.includes(scope)));
  return normalizeDraft(value);
}

function record(value) {
  object(value); requireValue(value.version === 1 && /^[a-zA-Z0-9_-]{1,100}$/.test(text(value.id, 100)) && typeof value.completed === "boolean");
  const view = object(value.view), session = object(view.session), info = {};
  requireValue(session.id === value.id);
  for (const [key, item] of Object.entries(object(session.info))) {
    if (!["statement", "other_contact", "other_insurance", "other_plate", "other_vehicle", "witness"].includes(key)) continue;
    object(item); requireValue(typeof item.confirmed === "boolean" && SOURCES.includes(item.source));
    info[key] = { value: text(item.value), source: item.source, confirmed: item.confirmed };
  }
  const summary = object(view.summary);
  return { version: 1, id: value.id, createdAt: date(value.createdAt), updatedAt: date(value.updatedAt), completed: value.completed,
    profile: profile(value.profile), coverage: coverage(value.coverage), draft: draft(value.draft),
    view: { session: { id: value.id, created_at: date(session.created_at), info },
      checklist: list(view.checklist, 50).map((slot) => {
        object(slot); requireValue(typeof slot.core === "boolean" && ["pending", "captured", "needs_retake", "skipped"].includes(slot.status));
        return { id: text(slot.id, 100), title: text(slot.title, 300), core: slot.core, status: slot.status };
      }),
      summary: { sections: list(summary.sections, 50).map((section) => ({ title: text(object(section).title, 300),
        items: list(section.items).map((item) => {
          object(item); requireValue(SOURCES.includes(item.source));
          return { label: text(item.label, 500), value: text(item.value), source: item.source };
        }) })), missing: strings(summary.missing), leave_check: strings(summary.leave_check), next_steps: strings(summary.next_steps),
        disclaimer: summary.disclaimer ? text(summary.disclaimer) : "", cleanup: summary.cleanup ? text(summary.cleanup) : null },
      summary_text: text(view.summary_text || "", 200000),
    },
  };
}

export function validateBackup(value) {
  object(value);
  requireValue(value.format === "scenepilot-backup" && value.version === 1);
  const records = list(value.records, MAX_RECORDS).map(record);
  requireValue(new Set(records.map((item) => item.id)).size === records.length);
  const insurance = object(value.insurance);
  return { format: "scenepilot-backup", version: 1, exportedAt: date(value.exportedAt),
    insurance: { profile: profile(insurance.profile), coverage: coverage(insurance.coverage) }, records };
}
export function parseBackup(raw) {
  if (typeof raw !== "string" || new TextEncoder().encode(raw).length > MAX_BACKUP_BYTES) throw new Error("backup.tooLarge");
  try { return validateBackup(JSON.parse(raw)); } catch { throw new Error("backup.invalid"); }
}
export function createBackup(profileValue, coverageValue, records, now = new Date().toISOString()) {
  const backup = validateBackup({ format: "scenepilot-backup", version: 1, exportedAt: now,
    insurance: { profile: normalizeProfile(profileValue), coverage: normalizeCoverage(coverageValue) }, records });
  const raw = JSON.stringify(backup, null, 2);
  if (new TextEncoder().encode(raw).length > MAX_BACKUP_BYTES) throw new Error("backup.tooLarge");
  return raw;
}
export function mergeBackup(backup, current, replaceInsurance = false) {
  const incoming = validateBackup(backup);
  const ids = new Set(current.records.map((item) => item?.id));
  const added = incoming.records.filter((item) => !ids.has(item.id));
  if (current.records.length + added.length > MAX_RECORDS) throw new Error("backup.tooLarge");
  return { insurance: replaceInsurance ? incoming.insurance : current.insurance,
    records: [...added, ...current.records], added: added.length, skipped: incoming.records.length - added.length };
}
