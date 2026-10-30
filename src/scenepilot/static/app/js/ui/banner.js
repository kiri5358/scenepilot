// One banner at most per screen. kind: "danger" | "warn" | "info".
import { h } from "./dom.js";
import { icon } from "./icons.js";

export function banner(spec) {
  if (!spec || !spec.message) return null;
  const { kind = "info", message, actionLabel, onAction } = spec;
  return h("div", { class: `banner banner--${kind}`, role: kind === "danger" ? "alert" : "status" },
    icon("alert", "ico--sm"),
    h("div", { class: "banner-body" },
      h("span", {}, message),
      actionLabel ? h("button", { type: "button", class: "linkbtn", onclick: onAction }, actionLabel) : null));
}
