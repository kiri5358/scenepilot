// The card the other driver reads: my name, phone, plate and insurer. Giving these details is a legal duty after an accident
// (Road Traffic Act, article 54), so this is for showing, not for coaching: no coach line and no menus are on this screen.
import { h } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { t } from "../../core/i18n.js";
import { getProfile } from "../../core/store.js";
import { closeCard } from "../../flows/coach.js";

const clean = (value) => (typeof value === "string" ? value.trim() : "");

function field(labelKey, value, small = false) {
  return h("div", { class: "card-field" },
    h("span", { class: "card-label" }, t(labelKey)),
    value ? h("span", { class: small ? "card-value card-value--small" : "card-value" }, value) : h("span", { class: "card-empty" }, t("mycard.empty")));
}

export function myCardScreen(ctx) {
  const profile = getProfile();
  const { cardMsg } = ctx.state.get();
  const insurer = [clean(profile.insurer), clean(profile.claims_phone)].filter(Boolean).join(" ");
  const toggle = () => ctx.update({ cardMsg: !cardMsg });

  return {
    bare: true,
    body: [
      h("div", { class: "card-head" },
        h("h1", { class: "card-title" }, t("mycard.title")),
        h("button", { type: "button", class: "iconbtn iconbtn--dark", "aria-label": t("mycard.close"), onclick: () => closeCard(ctx) }, icon("close"))),
      h("div", { class: "card-body" },
        field("mycard.name", clean(profile.name)),
        field("mycard.phone", clean(profile.phone)),
        field("mycard.plate", clean(profile.plate)),
        field("mycard.insurer", insurer, true),
        cardMsg
          ? h("div", { class: "card-msg" },
            h("button", { type: "button", class: "card-msg-x", "aria-label": t("mycard.hide"), onclick: toggle }, icon("close")),
            h("p", { class: "card-msg-ko" }, t("mycard.msg")),
            h("p", { class: "card-msg-en", lang: "en" }, "I would like to handle this through insurance."))
          : h("button", { type: "button", class: "card-msg-show", "aria-label": t("mycard.show"), onclick: toggle }, icon("check"), t("mycard.show"))),
    ],
    actions: [{ label: t("mycard.close"), kind: "secondary", onClick: () => closeCard(ctx) }],
  };
}
