// The buttons fixed at the bottom of an accident screen: at most three, the main one 56px tall.
// items: [{ label, kind: "primary" | "secondary" | "ghost" | "danger", onClick, disabled }]
import { h } from "./dom.js";
import { icon } from "./icons.js";

export const MAX_ACTIONS = 3;

// row: put the buttons side by side (the main one twice as wide, on the right) instead of stacked.
// equal: side by side and all the same width, in the order given (for two choices of the same weight).
// item.icon: the name of an icon to put before the label.
export function actions(items, { row = false, equal = false } = {}) {
  if (!items || !items.length) return null;
  const layout = equal ? "actions actions--row actions--equal" : row ? "actions actions--row" : "actions";
  return h("footer", { class: layout },
    items.slice(0, MAX_ACTIONS).map((item, i) => h("button", {
      type: "button",
      class: `btn btn--${item.kind || (i === 0 ? "primary" : "secondary")}${i === 0 && !equal ? " btn--lg" : ""}`,
      disabled: item.disabled || null,
      onclick: item.onClick,
    }, item.icon ? icon(item.icon) : null, item.label)));
}
