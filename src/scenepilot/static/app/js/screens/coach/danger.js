// A danger heard in the talk (threats, a drunk driver, pain) covers the whole screen. Ordinary coaching stops; the only
// things on it are what to do and the two phone numbers. The sentence is the server's; the card only picks the title
// and which number comes first.
import { h } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { t } from "../../core/i18n.js";
import { dangerVariant } from "../../core/coach.js";
import { backToTalk } from "../../flows/coach.js";

function callButton(number, className, label) {
  return h("a", { class: `danger-call ${className}`, href: `tel:${number}` }, className === "danger-call--first" ? icon("phone") : null, label);
}

export function dangerScreen(ctx) {
  const danger = ctx.state.get().coach.danger || { id: "hostile", text: "" };
  const variant = dangerVariant(danger.id);
  const pain = variant.firstCall === "119";
  return {
    bare: true,
    tone: "alert",
    body: [
      h("div", { class: "danger", role: "alert" },
        h("span", { class: "danger-ring" }, icon("alert")),
        h("h1", { class: "danger-title" }, t(variant.titleKey)),
        danger.text ? h("p", { class: "danger-text" }, danger.text) : null,
        pain ? null : h("p", { class: "danger-text" }, t("danger.noChase")),
        callButton(variant.firstCall, "danger-call--first", t(pain ? "danger.call119.first" : "danger.call112.first")),
        callButton(pain ? "112" : "119", "danger-call--second", t(pain ? "danger.call112.second" : "danger.call119.second")),
        danger.say ? h("div", { class: "danger-why" }, h("b", {}, t("coach.sayLabel")), h("br"), `"${danger.say}"`) : null,
        h("div", { class: "danger-why" }, h("b", {}, t("danger.why")), ` ${t(variant.reasonKey)}`, h("br"), t("danger.whyNote"))),
    ],
    actions: [{ label: t("danger.back"), kind: "ghost", onClick: () => backToTalk(ctx) }],
  };
}
