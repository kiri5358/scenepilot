// The three answer buttons of a safety question. The words on the buttons belong to this app (they fit each question),
// but what is sent to the server is the server's own option text, so the server's rules read the answer as before.
const BASE = { danger: "safety.danger", movable: "safety.movable" };
const KINDS = ["yes", "no", "unsure"];
const FALLBACK_SEND = { yes: "예", no: "아니요", unsure: "모르겠어요" };

// "Yes" is the risky answer to the danger question but the good answer to "can you move the car", so the color of a
// button depends on the question: risk (red), ok (green) or unsure (gray).
const TONES = {
  danger: { yes: "risk", no: "ok", unsure: "unsure" },
  movable: { yes: "ok", no: "risk", unsure: "unsure" },
};

// The server puts this in front of a question that it asked again because it did not understand the answer.
export const RETRY_PREFIX = "죄송해요, 잘 못 들었어요.";
export function splitRetry(text) {
  if (typeof text === "string" && text.startsWith(RETRY_PREFIX)) return [RETRY_PREFIX, text.slice(RETRY_PREFIX.length).trim()];
  return [text];
}

// itemId: the question id from the server's prompt. options: the server's options, in the order yes / no / not sure.
export function answerChoices(itemId, options) {
  const base = BASE[itemId] || "safety.generic";
  const tones = TONES[itemId] || TONES.danger;
  const usable = Array.isArray(options) && options.length === KINDS.length;
  return KINDS.map((kind, i) => ({ kind, tone: tones[kind], labelKey: `${base}.${kind}`, send: usable ? options[i] : FALLBACK_SEND[kind] }));
}

// "1 of 2": progress comes from the server (safety_progress: { answered, total }).
export function safetyPosition(progress) {
  const total = Math.max(1, (progress && progress.total) || 1);
  const n = Math.min(((progress && progress.answered) || 0) + 1, total);
  return { n, total };
}
