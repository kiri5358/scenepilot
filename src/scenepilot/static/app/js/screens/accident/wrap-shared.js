import { h } from "../../ui/dom.js";
import { chip } from "../../ui/chip.js";
import { openSheet } from "../../ui/sheet.js";
import { t, getLang } from "../../core/i18n.js";
import { getWrapDraft, saveWrapDraft } from "../../core/store.js";
import { callRows, remainingTasks } from "../../core/wrap.js";

export function taskList(view, draft) {
  const tasks = remainingTasks(view, draft);
  return tasks.length ? h("ul", { class: "wrap-tasks" }, tasks.map((task) => h("li", {}, t(task.key, task.vars))))
    : h("p", { class: "muted" }, t("wrap.noTasks"));
}

export function preparationRows(view, profile, draft) {
  return h("dl", { class: "wrap-facts" }, callRows(view, profile, draft, getLang()).map((row) => [
    h("dt", {}, t(`wrap.row.${row.key}`)),
    h("dd", {}, h("span", { class: "wrap-fact-value" }, row.value || t(row.valueKey || "wrap.unknown", row.vars)),
      chip(row.kind, { label: t(row.kind === "unknown" && row.source !== "system" ? "wrap.source.unconfirmed" : `wrap.source.${row.source}`) })),
  ]));
}

export async function editScene(ctx) {
  const { data } = ctx.state.get();
  const draft = getWrapDraft(data.session.id);
  const definitions = [
    ["incidentAt", "datetime-local"], ["location", "text"], ["statement", "textarea"],
    ["injuryStatus", ["unknown", "none", "mentioned"]], ["injuryNote", "text"], ["towing", ["unknown", "yes", "no"]],
    ["dashcam", ["unknown", "saved", "unavailable"]], ["claimNumber", "text"],
  ];
  const inputs = {};
  const fields = definitions.map(([name, type]) => {
    const input = Array.isArray(type) ? h("select", { id: `scene-${name}` }, type.map((value) => h("option", { value, selected: value === draft[name] }, t(`wrap.option.${name}.${value}`))))
      : type === "textarea" ? h("textarea", { id: `scene-${name}`, rows: 3, maxlength: 2000 }, draft[name])
        : h("input", { id: `scene-${name}`, type, value: draft[name], maxlength: name === "location" ? 300 : name === "injuryNote" ? 500 : 100 });
    inputs[name] = input;
    return h("div", { class: "insurance-field" }, h("label", { for: `scene-${name}` }, t(`wrap.field.${name}`)), input);
  });
  const message = h("p", { class: "insurance-feedback", role: "alert" });
  const result = await openSheet((close) => [
    h("h2", { class: "title" }, t("wrap.editScene")), h("p", { class: "muted" }, t("wrap.sceneNote")),
    h("form", { class: "stack", onsubmit: (event) => {
      event.preventDefault();
      const values = Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input.value]));
      if (!saveWrapDraft(data.session.id, values)) { message.textContent = t("wrap.draftError"); return; }
      close(true);
    } }, fields, message,
    h("button", { type: "submit", class: "btn btn--primary btn--lg" }, t("insurance.save")),
    h("button", { type: "button", class: "btn btn--ghost", onclick: () => close(false) }, t("insurance.cancel"))),
  ], { label: t("wrap.editScene") });
  if (result) ctx.update({ error: null });
}
