// Talk coaching: what a hint means on screen. Pure functions: no DOM, so node can test them.
//
// The server (and the fixed rules it sends) decide WHICH reminder fits what was said; the sentences of the reminders are
// the server's. This file only decides how a reminder looks and feels: its kind, how long the phone vibrates, and the
// sentence "the person may say" next to it.

// Kinds, from most to least urgent. danger takes over the screen; stop and info are shown as the coach's line.
export const DANGER_IDS = ["hostile", "drunk", "pain"];
export const STOP_IDS = ["deal", "sign", "leaving", "police", "fault", "coverage", "refuse", "uninsured", "tow"];
export const INFO_IDS = ["ask_contact", "ask_insurance", "ask_plate"];

export function categoryOf(id) {
  if (DANGER_IDS.includes(id)) return "danger";
  if (STOP_IDS.includes(id)) return "stop";
  if (INFO_IDS.includes(id)) return "info";
  if (id === "tone") return "tone";
  return "tip";   // a sentence the model wrote for this moment ("ai")
}

// Vibration: the more urgent, the longer and more often. [vibrate, pause, vibrate, ...] in milliseconds.
export const VIBRATION = {
  danger: [600, 150, 600, 150, 600],
  stop: [200, 120, 200],
  info: [200],
  tone: [120],
  tip: [200],
};

// hint: { id, hint } from the server or a rule. Returns what the screen needs, or null when there is nothing to show.
// say/severity come from /api/watch-rules, alongside the fixed rules. No duplicate advice lives in the frontend.
export function planHint(hint, protocol = {}) {
  if (!hint || !hint.hint || !String(hint.hint).trim()) return null;
  const id = hint.id || "ai";
  const severity = protocol.severity?.[id];
  const category = DANGER_IDS.includes(id) || severity === 3 ? "danger" : severity === 2 ? "stop" : categoryOf(id);
  const sentence = protocol.say?.[id];
  return {
    id, text: String(hint.hint).trim(), category,
    say: id === "ai" || category === "danger" && id !== "pain" ? null : typeof sentence === "string" ? sentence : null,
    pattern: VIBRATION[category],
  };
}

// What the danger card says. The sentence itself is the server's; the card only chooses the title and which number is first.
export function dangerVariant(id) {
  if (id === "pain") return { id, titleKey: "danger.title.pain", firstCall: "119", reasonKey: "danger.reason.pain" };
  return { id, titleKey: "danger.title.threat", firstCall: "112", reasonKey: id === "drunk" ? "danger.reason.drunk" : "danger.reason.hostile" };
}

// ---------- The checklist: what we still need from the other driver ----------
export const INFO_ROWS = [
  { field: "other_contact", nameKey: "coach.row.contact" },
  { field: "other_plate", nameKey: "coach.row.plate" },
  { field: "other_insurance", nameKey: "coach.row.insurance" },
  { field: "other_vehicle", nameKey: "coach.row.vehicle" },
];

// info: the session's details of the other driver { field: { value, source, confirmed } }.
// checklist: the server's photo checklist (a photo of the other car with a readable plate counts for the plate).
export function infoRows(info, checklist) {
  const photoOfPlate = (checklist || []).some((slot) => slot.id === "other_vehicle" && slot.status === "captured");
  return INFO_ROWS.map(({ field, nameKey }) => {
    const entry = info && info[field];
    if (!entry) {
      if (field === "other_plate" && photoOfPlate) return { field, nameKey, value: null, valueKey: "coach.row.photo", kind: "ok", labelKey: "coach.row.photoChip" };
      return { field, nameKey, value: null, valueKey: "coach.row.none", kind: "unknown", labelKey: "coach.row.waiting" };
    }
    if (entry.confirmed) return { field, nameKey, value: entry.value, kind: "ok", labelKey: null };
    return { field, nameKey, value: entry.value, kind: "heard", labelKey: null };   // heard by the AI, not confirmed yet
  });
}

// ---------- Choosing the words of the setup screen ----------
export const SETUP_COMMANDS = {
  start: ["대화시작", "시작", "코칭시작"],
  notalk: ["싫어", "연락처만", "대화없이", "없이"],
};

export const DEFAULT_COACH_PREFS = { mode: "screen", ai: true };   // mode: "screen" (screen + vibration) | "ear" (read aloud)
