// Top bar. Two kinds: home (brand) and accident ("back to home"). 119 and 112 are phone links, always one tap.
import { h } from "./dom.js";
import { icon } from "./icons.js";
import { t } from "../core/i18n.js";

function sos() {
  return h("div", { class: "sos" },
    h("a", { class: "call call--119", href: "tel:119", "aria-label": t("sos.119") }, "119"),
    h("a", { class: "call call--112", href: "tel:112", "aria-label": t("sos.112") }, "112"));
}

// variant: "home" | "accident";  showSos: boolean;  onBack, onSettings: functions
export function appbar({ variant, showSos, onBack, onSettings }) {
  const left = variant === "accident"
    ? h("button", { type: "button", class: "back", onclick: onBack }, icon("back"), t("nav.home"))
    : h("div", { class: "brand" }, h("span", { class: "brand-mark" }, icon("alert", "ico--sm")), t("app.name"));
  return h("header", { class: "appbar" },
    left,
    h("div", { class: "sos" },
      showSos ? sos() : null,
      h("button", { type: "button", class: "iconbtn", "aria-label": t("nav.settings"), onclick: onSettings }, icon("gear"))));
}
