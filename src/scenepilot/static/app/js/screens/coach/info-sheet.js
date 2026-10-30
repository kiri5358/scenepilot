// Tap a row of the checklist: confirm what the AI heard, correct it, or type it in.
import { h } from "../../ui/dom.js";
import { openSheet } from "../../ui/sheet.js";
import { t } from "../../core/i18n.js";
import { confirmInfoValue, setInfoValue } from "../../flows/info.js";

export async function openInfoSheet(ctx, row) {
  const name = t(row.nameKey);
  const heard = row.kind === "heard";
  const input = h("input", {
    type: "text", id: "info-value", value: row.value || "", autocomplete: "off",
    "aria-label": name, placeholder: t(`coach.info.ph.${row.field}`),
  });
  const choice = await openSheet((close) => [
    h("h2", { class: "title" }, name),
    heard ? h("p", { class: "lead" }, t("coach.info.heard", { value: row.value })) : null,
    h("div", { class: "stack" },
      heard ? h("button", { type: "button", class: "btn btn--primary btn--lg", onclick: () => close({ confirm: true }) }, t("coach.info.ok")) : null,
      h("label", { class: "sheet-field" }, h("span", { class: "muted" }, heard ? t("coach.info.edit") : t("coach.info.type")), input),
      h("button", { type: "button", class: heard ? "btn btn--secondary" : "btn btn--primary btn--lg", onclick: () => close({ value: input.value }) }, t("coach.info.save")),
      h("button", { type: "button", class: "btn btn--ghost", onclick: () => close(undefined) }, t("settings.close"))),
  ], { label: name });

  if (!choice) return;
  if (choice.confirm) await confirmInfoValue(ctx, row.field);
  else if (choice.value && choice.value.trim()) await setInfoValue(ctx, row.field, choice.value);
}
