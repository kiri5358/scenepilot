// A tab whose screen is not built yet. It says so plainly instead of pretending to work.
import { h } from "../../ui/dom.js";
import { t } from "../../core/i18n.js";

export function placeholderScreen(tab) {
  return () => ({
    body: [
      h("h1", { class: "title" }, t(`nav.${tab}`)),
      h("div", { class: "card todo-card" }, h("p", { class: "muted" }, t("placeholder.note"))),
    ],
  });
}
