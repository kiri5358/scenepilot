// "Ask a question": type or say a question, read the answer. The server decides what may be answered (it only uses the app's
// reviewed notes and steps and never judges fault, gives legal or medical advice, or estimates costs).
import { h } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { t } from "../../core/i18n.js";
import { askQuestion, MAX_QUESTION_CHARS } from "../../flows/ask.js";
import { commandTable, matchCommand } from "../../services/voice.js";
import * as speaker from "../../services/speak.js";

function answerCard(item) {
  return h("article", { class: "qa" },
    h("p", { class: "qa-question" }, item.question),
    h("p", { class: "qa-answer" }, item.answer),
    item.call_buttons && item.call_buttons.length
      ? h("div", { class: "stack" }, item.call_buttons.map((c) => h("a", { class: "btn btn--danger", href: `tel:${c.number}` }, icon("phone"), c.label)))
      : null,
    item.sources && item.sources.length
      ? h("details", { class: "qa-sources" },
        h("summary", {}, t("ask.sourceCount", { n: item.sources.length })),
        h("ul", { class: "sources" }, item.sources.map((s) => h("li", {},
          h("a", { href: s.url, target: "_blank", rel: "noopener noreferrer" }, s.version ? `${s.title} (${s.version})` : s.title)))))
      : null,
    item.note ? h("p", { class: "muted" }, item.note) : null,
    h("button", { type: "button", class: "linkbtn", onclick: () => speaker.speak([item.answer], { force: true, remember: false }) }, t("ask.read")));
}

export function askScreen(ctx) {
  const { qa, busy } = ctx.state.get();
  const close = () => ctx.update({ overlay: null });
  const input = h("textarea", {
    id: "question", rows: "3", maxlength: String(MAX_QUESTION_CHARS), placeholder: t("ask.placeholder"), "aria-label": t("ask.label"),
  });
  const send = () => { const text = input.value.trim(); if (text) askQuestion(ctx, text); };
  input.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } });

  return {
    body: [
      h("h1", { class: "title" }, t("ask.title")),
      h("p", { class: "muted" }, t("ask.intro")),
      input,
      h("button", { type: "button", class: "btn btn--primary btn--lg", disabled: busy ? true : null, onclick: send }, busy || t("ask.send")),
      qa.length ? h("div", { class: "stack" }, qa.map(answerCard)) : null,
    ],
    actions: [{ label: t("ask.back"), kind: "secondary", onClick: close }],
    voice: {
      key: "ask",
      say: [t("ask.say")],
      hint: t("listen.hint.ask"),
      barge: false,   // the app's own words are not a question
      parse: (text) => (text.trim() ? text : null),
      run: (command, text) => {
        if (matchCommand(text, commandTable("ask")) === "done") close();
        else askQuestion(ctx, text);
      },
    },
  };
}
