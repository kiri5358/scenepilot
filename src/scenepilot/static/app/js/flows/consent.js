// The promise sheet shown before the first accident on this phone. Resolves true when the person agrees.
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { openSheet } from "../ui/sheet.js";
import { t } from "../core/i18n.js";
import { saveConsent } from "../core/store.js";

export async function askConsent() {
  const agreed = await openSheet((close) => [
    h("h2", { class: "title" }, t("consent.title")),
    h("ul", { class: "promises" }, ["p1", "p2", "p3"].map((id) => h("li", {}, icon("check"), t(`consent.${id}`)))),
    h("details", {},
      h("summary", { class: "linkbtn" }, t("consent.more")),
      h("ul", { class: "detail-list" }, ["d1", "d2", "d3", "d4", "d5", "d6"].map((id) => h("li", {}, t(`consent.${id}`))))),
    h("div", { class: "stack" },
      h("button", { type: "button", class: "btn btn--primary btn--lg", onclick: () => close(true) }, t("consent.agree")),
      h("button", { type: "button", class: "btn btn--ghost", onclick: () => close(false) }, t("consent.cancel"))),
  ], { label: t("consent.title") });

  if (agreed === true) saveConsent();
  return agreed === true;
}
