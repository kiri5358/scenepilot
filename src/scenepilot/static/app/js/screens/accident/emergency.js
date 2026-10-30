// Emergency: the sentences are the server's; the two big call buttons are always there.
import { h } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { t } from "../../core/i18n.js";
import { act } from "../../flows/stage.js";
import { commandTable, matchCommand } from "../../services/voice.js";

function bigCall(number, className, labelKey) {
  return h("a", { class: `bigcall bigcall--${className}`, href: `tel:${number}` }, icon("phone"), t(labelKey));
}

export function emergencyScreen(ctx) {
  const prompt = ctx.state.get().data.prompt;
  const acknowledge = () => act(ctx, "ack-emergency");

  return {
    tone: "danger",
    body: [
      h("div", { class: "emergency-kick" }, icon("alert"), prompt.text),
      h("ul", { class: "emergency-actions" }, (prompt.actions || []).map((line) => h("li", {}, line))),
      bigCall("119", "119", "emergency.call119"),
      bigCall("112", "112", "emergency.call112"),
      h("section", { class: "card card--danger" },
        h("p", { class: "eyebrow" }, t("emergency.say.title")),
        h("ul", {}, [1, 2, 3].map((n) => h("li", {}, t(`emergency.say.${n}`))))),
    ],
    actions: [{ label: t("emergency.next"), kind: "secondary", onClick: acknowledge }],
    voice: {
      key: `emergency:${prompt.text}`,
      say: [prompt.text, ...(prompt.actions || [])],
      hint: t("listen.hint.emergency"),
      parse: (text) => matchCommand(text, commandTable("emergency")),
      run: acknowledge,
    },
  };
}
