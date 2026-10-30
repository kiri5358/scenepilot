// Everything the app keeps on this phone. Storage can be missing or throw (private windows, blocked site data),
// so every read and write is guarded and the app keeps working without it.
// Ordinary saves leave the older UI's keys intact. Explicit local data deletion also clears legacy personal copies.

import { COVERAGES, isObject, normalizeProfile, normalizeCoverage } from "./insurance.js";
import { normalizeDraft } from "./wrap.js";
import { contactPatch } from "./handover.js";
export { COVERAGES };

const PREFIX = "scenepilot.";

// Same value as the older UI, so a person who already agreed there is not asked again.
export const CONSENT_VERSION = "2";

let backend = null;
try { backend = window.localStorage; } catch { backend = null; }

// Tests (and pages without storage) can swap the backend: anything with getItem / setItem / removeItem.
export function useBackend(next) { backend = next; draftCache.clear(); }

export function get(key) {
  try { return backend ? backend.getItem(PREFIX + key) : null; } catch { return null; }
}

export function set(key, value) {
  try {
    if (!backend) return false;
    if (value === null || value === undefined) backend.removeItem(PREFIX + key);
    else backend.setItem(PREFIX + key, String(value));
    return true;
  } catch { return false; }
}

export function getJSON(key, fallback) {
  const raw = get(key);
  if (raw === null) return fallback;
  try {
    const value = JSON.parse(raw);
    return value === null || value === undefined ? fallback : value;
  } catch { return fallback; }
}

export function setJSON(key, value) {
  try { return set(key, JSON.stringify(value)); } catch { return false; }
}

// Personal data is committed as one value. Older keys remain readable until the first successful write.
function personalData() {
  const saved = getJSON("data", null);
  if (isObject(saved) && saved.version === 1 && isObject(saved.insurance) && Array.isArray(saved.records)) return saved;
  const insurance = getJSON("insurance", null);
  const records = getJSON("records", []);
  return { version: 1, insurance: isObject(insurance) ? insurance : {}, records: Array.isArray(records) ? records : [] };
}
export function replacePersonalData(insurance, records) {
  if (!isObject(insurance) || !Array.isArray(records)) return false;
  return setJSON("data", { version: 1, insurance, records });
}

// ---------- Named values ----------

export const hasConsent = () => get("consent") === CONSENT_VERSION;
export const saveConsent = () => set("consent", CONSENT_VERSION);

export const getSessionId = () => get("sid");
export const saveSessionId = (id) => set("sid", id);

// Read the old card as a starting point. New edits live in a separate snapshot, so the old UI cannot erase them.
export const getProfile = () => {
  const profile = getJSON("profile", {});
  const legacy = isObject(profile) ? profile : {};
  const saved = personalData().insurance;
  return isObject(saved) && isObject(saved.profile) ? { ...legacy, ...normalizeProfile({ ...legacy, ...saved.profile }) } : legacy;
};

// Which coverages the person has. A new key so the older UI's profile is never rewritten by this one.
// value per coverage: "yes" | "no" | "unknown". A coverage that is not stored means "unknown": not entered is not "not covered".
export function getCoverage() {
  const saved = personalData().insurance;
  return normalizeCoverage(isObject(saved) && isObject(saved.coverage) ? saved.coverage : getJSON("coverage", {}));
}

// One write keeps the profile and coverage together, even if storage fills up during a save.
export const saveInsurance = (profile, coverage = getCoverage()) => replacePersonalData({
  profile: normalizeProfile(profile), coverage: normalizeCoverage(coverage),
}, getRecords());
export const saveCoverage = (patch) => saveInsurance(getProfile(), { ...getCoverage(), ...patch });

export const DEFAULT_SETTINGS = {
  lang: "ko",          // "ko" | "en": the app's own words (the server's fixed sentences stay Korean)
  sos: "always",       // "always" | "accident" | "hidden": when the 119 / 112 buttons are in the top bar
};
export function getSettings() {
  const stored = getJSON("settings", {});
  const merged = { ...DEFAULT_SETTINGS, ...(stored && typeof stored === "object" ? stored : {}) };
  if (!["ko", "en"].includes(merged.lang)) merged.lang = DEFAULT_SETTINGS.lang;
  if (!["always", "accident", "hidden"].includes(merged.sos)) merged.sos = DEFAULT_SETTINGS.sos;
  return merged;
}
export const saveSettings = (patch) => setJSON("settings", { ...getSettings(), ...patch });

// How the talk coaching is received. mode: "screen" (screen + vibration, no sound) or "ear" (read aloud);
// ai: use the AI coach (sends the last sentences as text), or only the fixed reminders. The mockup's default is on.
export function getCoachPrefs() {
  const saved = getJSON("coachPrefs", null);
  if (isObject(saved) && ["screen", "ear"].includes(saved.mode) && typeof saved.ai === "boolean") return saved;
  return { mode: get("coachmode") === "ear" ? "ear" : "screen", ai: get("coach") !== "off" };
}
export function saveCoachPrefs({ mode, ai }) {
  return setJSON("coachPrefs", { mode: mode === "ear" ? "ear" : "screen", ai: Boolean(ai) });
}

export const getRecords = () => {
  const records = personalData().records;
  return Array.isArray(records) ? records : [];
};

const draftCache = new Map();
export function getWrapDraft(id) {
  if (draftCache.has(id)) return draftCache.get(id);
  const saved = getJSON("wrapDrafts", {});
  const draft = normalizeDraft(isObject(saved) ? saved[id] : null);
  draftCache.set(id, draft);
  return draft;
}
export function saveWrapDraft(id, patch) {
  const draft = normalizeDraft({ ...getWrapDraft(id), ...patch });
  draftCache.set(id, draft); // retain edits in this tab even when persistent storage is unavailable
  const saved = getJSON("wrapDrafts", {});
  return setJSON("wrapDrafts", { ...(isObject(saved) ? saved : {}), [id]: draft });
}
export function hydrateWrapDraft(data) {
  const id = data.session.id;
  const patch = contactPatch(getWrapDraft(id), data.summary?.contact || data.session.contact);
  if (Object.keys(patch).length) saveWrapDraft(id, patch);
}
export function putRecord(record) {
  if (!record || typeof record.id !== "string" || !record.view?.session) return false;
  const records = getRecords();
  return replacePersonalData({ profile: normalizeProfile(getProfile()), coverage: getCoverage() }, [record, ...records.filter((item) => item?.id !== record.id)]);
}
export function setRecordCompleted(id, completed) {
  const record = getRecords().find((item) => item?.id === id);
  return record ? putRecord({ ...record, completed: Boolean(completed), updatedAt: new Date().toISOString() }) : false;
}
export function saveRecordDraft(id) {
  const record = getRecords().find((item) => item?.id === id);
  return record ? putRecord({ ...record, draft: getWrapDraft(id), contactSynced: false, updatedAt: new Date().toISOString() }) : false;
}

export const hasOnboarding = () => get("onboarding") === "1";
export const saveOnboarding = () => set("onboarding", "1");

// Explicit user-requested local data removal also removes legacy copies, so they cannot reappear as fallbacks.
export function clearPersonalData() {
  let ok = true;
  for (const key of ["data", "insurance", "records", "wrapDrafts", "profile", "coverage", "insurer", "sid"]) {
    if (!set(key, null)) ok = false;
  }
  draftCache.clear();
  return ok;
}
