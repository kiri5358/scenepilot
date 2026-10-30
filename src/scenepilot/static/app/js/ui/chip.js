// Status chips. Five kinds, always an icon plus words so color is never the only signal.
//   ok = confirmed, heard = heard but not confirmed, unknown = not known, skipped = skipped for safety, later = do later
import { h } from "./dom.js";
import { icon } from "./icons.js";
import { t } from "../core/i18n.js";

const KINDS = {
  ok: { icon: "check", key: "chip.ok" },
  heard: { icon: "half", key: "chip.heard" },
  unknown: { icon: "question", key: "chip.unknown" },
  skipped: { icon: "minus", key: "chip.skipped" },
  later: { icon: "clock", key: "chip.later" },
};

export const chipKinds = () => Object.keys(KINDS);

// chip("ok")                      -> "✓ 확인함"
// chip("ok", { label: "대인Ⅱ" })  -> a chip with its own words and the same icon and color
export function chip(kind, { label } = {}) {
  const spec = KINDS[kind] || KINDS.unknown;
  return h("span", { class: `chip chip--${kind in KINDS ? kind : "unknown"}` }, icon(spec.icon, "ico--sm"), label ?? t(spec.key));
}
