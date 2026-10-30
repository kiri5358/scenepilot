// Everything the app keeps on this phone. Storage can be missing or throw (private windows, blocked site data),
// so every read and write is guarded and the app keeps working without it.
// Keys share the "scenepilot." prefix with the older UI. This UI only adds keys; it never renames or removes theirs.

const PREFIX = "scenepilot.";

// Same value as the older UI, so a person who already agreed there is not asked again.
export const CONSENT_VERSION = "2";

let backend = null;
try { backend = window.localStorage; } catch { backend = null; }

// Tests (and pages without storage) can swap the backend: anything with getItem / setItem / removeItem.
export function useBackend(next) { backend = next; }

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

export function setJSON(key, value) { return set(key, JSON.stringify(value)); }

// ---------- Named values ----------

export const hasConsent = () => get("consent") === CONSENT_VERSION;
export const saveConsent = () => set("consent", CONSENT_VERSION);

export const getSessionId = () => get("sid");
export const saveSessionId = (id) => set("sid", id);

// The older UI's "My info" card. Read-only here until the insurance screen is built.
export const getProfile = () => {
  const profile = getJSON("profile", {});
  return profile && typeof profile === "object" && !Array.isArray(profile) ? profile : {};
};

// Which coverages the person has. A new key so the older UI's profile is never rewritten by this one.
// value per coverage: "yes" | "no" | "unknown". A coverage that is not stored means "unknown": not entered is not "not covered".
export const COVERAGES = ["liability2", "property", "own", "injury", "uninsured", "roadside"];
export function getCoverage() {
  const stored = getJSON("coverage", {});
  const out = {};
  for (const id of COVERAGES) out[id] = stored && ["yes", "no"].includes(stored[id]) ? stored[id] : "unknown";
  return out;
}

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

export const getRecords = () => {
  const records = getJSON("records", []);
  return Array.isArray(records) ? records : [];
};
