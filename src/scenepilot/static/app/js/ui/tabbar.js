// Bottom tabs of home mode.
import { h } from "./dom.js";
import { icon } from "./icons.js";
import { t } from "../core/i18n.js";

const TAB_ICONS = { home: "home", insurance: "shield", records: "folder" };

export function tabbar({ tabs, current, onSelect }) {
  return h("nav", { class: "tabbar", "aria-label": t("nav.tabs") },
    tabs.map((id) => h("button", {
      type: "button", class: "tab", "aria-current": id === current ? "page" : null, onclick: () => onSelect(id),
    }, icon(TAB_ICONS[id]), t(`nav.${id}`))));
}
