// Facts for the insurer and outstanding tasks. Never turn an unconfirmed AI suggestion into a confirmed fact.
import { isObject, normalizeProfile } from "./insurance.js";

export const CLAIM_STATUSES = ["not_connected", "connected", "reported", "number_received"];
export const CLAIM_SCOPES = ["own_damage", "other_damage", "injury"];
export const DRAFT_DEFAULTS = {
  location: "", incidentAt: "", statement: "", injuryStatus: "unknown", injuryNote: "", towing: "unknown", dashcam: "unknown",
  claimStatus: "not_connected", claimNumber: "", agent: "", scopes: [],
};

export function normalizeDraft(value) {
  const input = isObject(value) ? value : {};
  const result = { ...DRAFT_DEFAULTS, scopes: [] };
  for (const [key, max] of Object.entries({ location: 300, incidentAt: 30, statement: 2000, injuryNote: 500, claimNumber: 100, agent: 200 })) {
    result[key] = typeof input[key] === "string" ? input[key].trim().slice(0, max) : "";
  }
  for (const [key, allowed] of Object.entries({ injuryStatus: ["unknown", "none", "mentioned"], towing: ["unknown", "yes", "no"],
    dashcam: ["unknown", "saved", "unavailable"], claimStatus: CLAIM_STATUSES })) {
    if (allowed.includes(input[key])) result[key] = input[key];
  }
  result.scopes = CLAIM_SCOPES.filter((scope) => Array.isArray(input.scopes) && input.scopes.includes(scope));
  return result;
}

export function formatWhen(value, language = "ko") {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString(language === "en" ? "en-GB" : "ko-KR", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }) : "";
}

export function infoFact(info, field) {
  const entry = info && info[field];
  if (!entry || typeof entry.value !== "string" || !entry.value.trim()) return { value: "", kind: "unknown", source: "unconfirmed" };
  return { value: entry.value, kind: entry.confirmed ? "ok" : "heard", source: entry.confirmed ? "user_statement" : "ai_observation" };
}

export function callRows(view, profile, value, language = "ko") {
  const draft = normalizeDraft(value);
  const own = normalizeProfile(profile);
  const info = view.session.info || {};
  const plate = infoFact(info, "other_plate"), insurer = infoFact(info, "other_insurance");
  const others = [plate.value, insurer.value].filter(Boolean).join(" · ");
  const bothConfirmed = plate.kind === "ok" && insurer.kind === "ok";
  const statement = draft.statement || info.statement?.value || "";
  const photos = (view.checklist || []).filter((slot) => slot.status === "captured").length;
  return [
    { key: "time", value: formatWhen(draft.incidentAt || view.session.created_at, language), kind: draft.incidentAt ? "ok" : "unknown", source: draft.incidentAt ? "user_statement" : "system" },
    { key: "location", value: draft.location, kind: draft.location ? "ok" : "unknown", source: "user_statement" },
    { key: "own", value: [own.plate, own.vehicle, own.policy].filter(Boolean).join(" · "), kind: own.plate ? "ok" : "unknown", source: "profile" },
    { key: "other", value: others, kind: others ? bothConfirmed ? "ok" : "heard" : "unknown", source: bothConfirmed ? "user_statement" : "unconfirmed" },
    { key: "statement", value: statement, kind: statement ? "ok" : "unknown", source: "user_statement" },
    { key: "injuries", value: draft.injuryStatus === "mentioned" ? draft.injuryNote : "", valueKey: draft.injuryStatus === "unknown" ? "wrap.unknown" : `wrap.injuries.${draft.injuryStatus}`, kind: draft.injuryStatus === "unknown" ? "unknown" : "ok", source: "user_statement" },
    { key: "photos", value: "", valueKey: "wrap.photosCount", vars: { n: photos }, kind: photos ? "ok" : "unknown", source: "photo" },
    { key: "towing", value: "", valueKey: `wrap.towing.${draft.towing}`, kind: draft.towing === "unknown" ? "unknown" : "ok", source: "user_statement" },
  ];
}

export function remainingTasks(view, value) {
  const draft = normalizeDraft(value);
  const tasks = [];
  for (const slot of view.checklist || []) {
    if (slot.core && slot.status !== "captured") tasks.push({ id: `photo:${slot.id}`, key: "wrap.task.photo", vars: { name: slot.title } });
  }
  for (const field of ["other_contact", "other_insurance", "other_plate"]) {
    if (infoFact(view.session.info, field).kind !== "ok") tasks.push({ id: field, key: `wrap.task.${field}` });
  }
  if (draft.dashcam === "unknown") tasks.push({ id: "dashcam", key: "wrap.task.dashcam" });
  if (!draft.location) tasks.push({ id: "location", key: "wrap.task.location" });
  if (!draft.statement && !infoFact(view.session.info, "statement").value) tasks.push({ id: "statement", key: "wrap.task.statement" });
  if (draft.injuryStatus === "unknown") tasks.push({ id: "injuries", key: "wrap.task.injuries" });
  if (!draft.claimNumber) tasks.push({ id: "claimNumber", key: "wrap.task.claimNumber" });
  if (["not_connected", "connected"].includes(draft.claimStatus)) tasks.push({ id: "claimStatus", key: "wrap.task.claimStatus" });
  if (!draft.scopes.length) tasks.push({ id: "scopes", key: "wrap.task.scopes" });
  if (draft.injuryStatus === "mentioned" && !draft.scopes.includes("injury")) tasks.push({ id: "injuryScope", key: "wrap.task.injuryScope" });
  return tasks;
}

export function readRecord(value) {
  if (!isObject(value) || value.version !== 1 || typeof value.id !== "string" || !isObject(value.view?.session)) return null;
  const view = value.view;
  const summary = isObject(view.summary) ? view.summary : {};
  return { ...value, completed: value.completed === true, profile: normalizeProfile(value.profile), draft: normalizeDraft(value.draft), view: {
    ...view, session: { ...view.session, info: isObject(view.session.info) ? view.session.info : {} },
    checklist: Array.isArray(view.checklist) ? view.checklist.filter(isObject) : [],
    summary: { ...summary, sections: Array.isArray(summary.sections) ? summary.sections.filter(isObject).map((section) => ({
      ...section, items: Array.isArray(section.items) ? section.items.filter(isObject) : [],
    })) : [] },
  } };
}

export function recordStatusKey(record) {
  if (record.completed) return "records.completed";
  return record.draft.claimStatus === "number_received" && record.draft.claimNumber ? "records.processing" : `wrap.claimStatus.${record.draft.claimStatus}`;
}

export function recordSnapshot(view, profile, coverage, value, previous = null, now = new Date().toISOString()) {
  // Store the summary and structured observations, never audio, transcripts, questions, or image bytes.
  return {
    version: 1, id: view.session.id, createdAt: view.session.created_at, updatedAt: now, completed: previous?.completed === true,
    profile: normalizeProfile(profile), coverage, draft: normalizeDraft(value),
    view: {
      session: { id: view.session.id, created_at: view.session.created_at, info: view.session.info || {} },
      checklist: (view.checklist || []).map(({ id, title, core, status }) => ({ id, title, core, status })),
      summary: view.summary || { sections: [] }, summary_text: view.summary_text || "",
    },
  };
}
