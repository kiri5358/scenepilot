// Free questions. The server answers with an AI model that may only use the app's reviewed notes and steps; a question that
// mentions danger never reaches the model and gets the fixed "call 119" answer. Answers are shown newest first.
import { post, sessionPath } from "../core/api.js";
import { t, getLang } from "../core/i18n.js";
import { errorMessage } from "./accident.js";
import * as speaker from "../services/speak.js";
import { resumeListening } from "../services/narrator.js";
import { handsFree } from "../services/voice.js";

export const MAX_QUESTION_CHARS = 500;   // the server's limit

export async function askQuestion({ state, update }, text, onSuccess = null) {
  const question = String(text || "").trim().slice(0, MAX_QUESTION_CHARS);
  const current = state.get();
  if (!question || current.busy || !current.data) return;
  update({ busy: t("ask.looking"), error: null });
  try {
    const result = await post(sessionPath(current.data.session.id, "ask"), { question, language: getLang() });
    if (onSuccess) onSuccess();
    update({ busy: null, qa: [{ question, ...result }, ...state.get().qa] });
    // read the answer aloud, then listen for a follow-up question
    speaker.speak([result.answer], { remember: false, onDone: () => { if (handsFree()) setTimeout(resumeListening, 300); } });
  } catch (error) {
    update({ busy: null, error: errorMessage(error) });
  }
}
