// "Exchange details" at the scene: the other driver's name and phone, insurer, plate and car can be typed right where the
// guide says to exchange them, instead of waiting for the "check before leaving" screen.
import { h } from "../../ui/dom.js";
import { openSheet } from "../../ui/sheet.js";
import { t } from "../../core/i18n.js";
import { setInfoValue } from "../../flows/info.js";

const FIELDS = ["other_contact", "other_plate", "other_insurance", "other_vehicle"];

export async function openExchangeSheet(ctx) {
  const info = ctx.state.get().data?.session?.info || {};
  const inputs = Object.fromEntries(FIELDS.map((field) => [field, h("input", {
    type: "text", id: `exchange-${field}`, value: info[field]?.value || "", autocomplete: "off", maxlength: 80,
    placeholder: t(`coach.info.ph.${field}`),
  })]));
  const values = await openSheet((close) => [
    h("h2", { class: "title" }, t("exchange.title")),
    h("p", { class: "muted" }, t("exchange.note")),
    h("form", { class: "stack", onsubmit: (event) => { event.preventDefault(); close(Object.fromEntries(FIELDS.map((f) => [f, inputs[f].value]))); } },
      FIELDS.map((field) => h("label", { class: "sheet-field", for: `exchange-${field}` }, h("span", { class: "muted" }, t(`exchange.${field}`)), inputs[field])),
      h("button", { type: "submit", class: "btn btn--primary btn--lg" }, t("coach.info.save")),
      h("button", { type: "button", class: "btn btn--ghost", onclick: () => close(undefined) }, t("settings.close"))),
  ], { label: t("exchange.title") });
  if (!values) return;
  for (const field of FIELDS) {
    const next = String(values[field] || "").trim();
    if (next && next !== (info[field]?.value || "") ) await setInfoValue(ctx, field, next);   // only what was typed or changed
  }
}
