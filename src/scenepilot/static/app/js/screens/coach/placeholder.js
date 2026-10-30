// The talk-coaching screens come in the next step. This says so and lets the person go back.
import { h } from "../../ui/dom.js";
import { t } from "../../core/i18n.js";

export function coachPlaceholder(ctx) {
  return {
    body: [
      h("h1", { class: "title" }, t("hub.coach")),
      h("div", { class: "card todo-card" }, h("p", { class: "muted" }, t("coach.todo"))),
    ],
    actions: [{ label: t("coach.back"), kind: "secondary", onClick: () => ctx.update({ overlay: null }) }],
  };
}
