// Personal details stay on this device. These fields are also used by the card shown to the other driver.
export const PROFILE_FIELDS = [
  { id: "name", type: "text", autocomplete: "name", max: 60 },
  { id: "phone", type: "tel", autocomplete: "tel", max: 30 },
  { id: "plate", type: "text", max: 30 },
  { id: "vehicle", type: "text", max: 100 },
  { id: "insurer", type: "text", max: 100 },
  { id: "claims_phone", type: "tel", max: 30 },
  { id: "policy", type: "text", max: 100 },
  { id: "policy_start", type: "date", max: 10 },
  { id: "policy_end", type: "date", max: 10 },
];
export const COVERAGES = ["liability2", "property", "injury", "own", "uninsured", "roadside"];
export const COVERAGE_VALUES = ["yes", "no", "unknown"];
export const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export function normalizeProfile(value) {
  const input = isObject(value) ? value : {};
  return Object.fromEntries(PROFILE_FIELDS.map(({ id, max }) => [id, typeof input[id] === "string" ? input[id].trim().slice(0, max) : ""]));
}

export function normalizeCoverage(value) {
  const input = isObject(value) ? value : {};
  return Object.fromEntries(COVERAGES.map((id) => [id, COVERAGE_VALUES.includes(input[id]) ? input[id] : "unknown"]));
}

export function validPolicyDates({ policy_start: start, policy_end: end }) {
  const valid = (value) => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value);
  return valid(start) && valid(end) && (!start || !end || start <= end);
}

// Only phone characters may become a link; arbitrary stored text is never used as a URL.
export function phoneHref(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!/^\+?[\d\s().-]+$/.test(text)) return null;
  const digits = text.replace(/\D/g, "");
  return digits.length >= 3 && digits.length <= 20 ? `tel:${text.startsWith("+") ? "+" : ""}${digits}` : null;
}

// A manually entered number takes priority. A number filled by this picker may follow the next selection.
export function pickedClaimsPhone(current, previousSuggestion, next) {
  return !current.trim() || current === previousSuggestion ? next : current;
}
