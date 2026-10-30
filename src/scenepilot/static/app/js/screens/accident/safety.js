// Safety check: one question, three big answers. Danger answers (yes or not sure) lead to the emergency screen on the
// server's side; this screen only sends what was said or tapped.
import { h } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { t } from "../../core/i18n.js";
import { answerChoices, safetyPosition, splitRetry } from "../../core/safety.js";
import { isQuickAnswer } from "../../core/commands.js";
import { act } from "../../flows/stage.js";

function mark(tone) {
  if (tone === "ok") return icon("check");
  return tone === "risk" ? "!" : "?";
}

export function safetyScreen(ctx) {
  const { data, busy } = ctx.state.get();
  const prompt = data.prompt;
  const position = safetyPosition(data.safety_progress);
  const choices = answerChoices(prompt.item_id, prompt.options);
  const send = (answer, guesses = []) => act(ctx, "safety-answer", { answer, alternatives: guesses });

  return {
    body: [
      h("p", { class: "eyebrow" }, t("safety.kicker", position)),
      h("h1", { class: "question" }, prompt.text),
      h("p", { class: "sub" }, t("safety.sub")),
      h("div", { class: "answers" }, choices.map((choice) => h("button", {
        type: "button", class: "answer", disabled: busy ? true : null, onclick: () => send(choice.send),
      }, h("span", { class: `answer-mark answer-mark--${choice.tone}` }, mark(choice.tone)), t(choice.labelKey)))),
      prompt.item_id === "danger" ? h("p", { class: "muted" }, t("safety.note")) : null,
    ],
    voice: {
      key: `safety:${prompt.item_id}:${prompt.text}`,
      say: splitRetry(prompt.text),
      hint: t("listen.hint.safety"),
      // the server reads the answer (and the recognizer's other guesses), so the rules stay in one place
      parse: (text) => (text.trim() ? text : null),
      quick: isQuickAnswer,
      run: (command, text, guesses) => send(text, guesses),
    },
  };
}
