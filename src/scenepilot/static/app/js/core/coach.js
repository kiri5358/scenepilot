// Talk coaching: what a hint means on screen. Pure functions: no DOM, so node can test them.
//
// The server (and the fixed rules it sends) decide WHICH reminder fits what was said; the sentences of the reminders are
// the server's. This file only decides how a reminder looks and feels: its kind, how long the phone vibrates, and the
// sentence "the person may say" next to it.

// Kinds, from most to least urgent. danger takes over the screen; stop and info are shown as the coach's line.
export const DANGER_IDS = ["hostile", "drunk", "pain"];
export const STOP_IDS = ["deal", "sign", "leaving", "police", "fault"];
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

// The sentence the person may say, shown big. It is something the other driver can read too: no judgment of fault,
// no money, no medical advice. A reminder with no entry has no sentence (a danger card, or a tip from the model).
// DRAFT wording from docs/local/41; it belongs on the server next to the reminders (kr.py) and moves there later.
export const SAY = {
  pain: "많이 불편하시면 119를 부를게요. 지금 어디가 불편하세요?",
  deal: "보험사에 먼저 확인하고 결정하겠습니다.",
  sign: "무슨 내용인지 먼저 읽어 보고, 보험사에 확인한 뒤 서명할게요.",
  leaving: "가시기 전에 연락처와 보험사만 서로 알려 드려요.",
  police: "경찰에 신고해서 같이 확인받는 게 좋겠습니다.",
  fault: "제가 본 상황만 말씀드릴게요. 책임은 조사 후에 정해질 거예요.",
  tone: "잠깐 진정하고, 확인할 것만 차례로 정리해요.",
  ask_contact: "성함과 연락처 알려 주시겠어요? 저도 알려 드릴게요.",
  ask_insurance: "보험사가 어디세요? 서로 보험 접수하고 연락처 주고받을까요?",
};

// hint: { id, hint } from the server or a rule. Returns what the screen needs, or null when there is nothing to show.
export function planHint(hint) {
  if (!hint || !hint.hint || !String(hint.hint).trim()) return null;
  const id = hint.id || "ai";
  const category = categoryOf(id);
  return {
    id, text: String(hint.hint).trim(), category,
    say: category === "danger" && id !== "pain" ? null : SAY[id] || null,
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
