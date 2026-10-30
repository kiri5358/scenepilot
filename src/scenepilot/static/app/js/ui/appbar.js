// Top bar. Two kinds: home (brand) and accident ("back to home"). 119 and 112 are phone links, always one tap.
import { h } from "./dom.js";
import { icon } from "./icons.js";
import { t } from "../core/i18n.js";

function sos() {
  return h("div", { class: "sos" },
    h("a", { class: "call call--119", href: "tel:119", "aria-label": t("sos.119") }, "119"),
    h("a", { class: "call call--112", href: "tel:112", "aria-label": t("sos.112") }, "112"));
}

// variant: "home" | "accident" | "coach";  showSos: boolean;  onBack, onSettings: functions
// live (coach only): { status: "listening" | "paused" | "error" | "unsupported" }, shown as a small pill in the middle
const LIVE_LABEL = { listening: "coach.live", paused: "coach.paused", error: "coach.liveError", unsupported: "coach.liveError" };

function livePill(live) {
  const status = live && LIVE_LABEL[live.status] ? live.status : "paused";
  return h("span", { class: `live live--${status}`, role: "status" }, h("span", { class: "live-dot" }), t(LIVE_LABEL[status]));
}

export function appbar({ variant, showSos, onBack, onSettings, live }) {
  let left;
  if (variant === "accident") left = h("button", { type: "button", class: "back", onclick: onBack }, icon("back"), t("nav.home"));
  else if (variant === "coach") left = h("button", { type: "button", class: "back", onclick: onBack }, icon("back"), t("coach.leave"));
  else left = h("div", { class: "brand" }, h("span", { class: "brand-mark" }, icon("alert", "ico--sm")), t("app.name"));
  return h("header", { class: variant === "coach" ? "appbar appbar--coach" : "appbar" },
    left,
    variant === "coach" ? livePill(live) : null,
    h("div", { class: "sos" },
      showSos ? sos() : null,
      h("button", { type: "button", class: "iconbtn", "aria-label": t("nav.settings"), onclick: onSettings }, icon("gear"))));
}
