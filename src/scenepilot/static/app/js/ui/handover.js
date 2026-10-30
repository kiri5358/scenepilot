import { displayView, displayCallLine } from "../core/display.js";
import { h } from "./dom.js";
import { openSheet } from "./sheet.js";
import { t } from "../core/i18n.js";
import { HIT_STATES, COVERAGE_STATES, followupRows, FOLLOWUP_CHARS, FOLLOWUP_MAX } from "../core/handover.js";
import { act } from "../flows/stage.js";
import { appendFollowup } from "../flows/handover.js";

export function handoverChecks(ctx, { readOnly = false, data = ctx.state.get().data } = {}) {
  const summary = displayView(data)?.summary || {};
  const busy = ctx.state.get().busy;
  return [
    ["hit", summary.hit_rows, HIT_STATES, summary.titles?.hit || t("handover.hit"), null],
    ["coverage", summary.coverage_rows, COVERAGE_STATES, summary.titles?.coverage || t("handover.coverage"), summary.titles?.coverage_note],
  ].filter(([, rows]) => Array.isArray(rows) && rows.length).map(([action, rows, states, title, note]) =>
    h("section", { class: "card" }, h("h2", { class: "h2" }, title), note ? h("p", { class: "muted" }, note) : null,
      rows.map((row) => {
        const id = `handover-${action}-${row.id}`;
        return readOnly ? h("div", { class: "handover-read" }, h("b", {}, row.label), h("span", {}, row.state_label))
          : h("div", { class: "insurance-field handover-choice" }, h("label", { for: id }, row.label),
            h("select", { id, disabled: Boolean(busy), onchange: (event) => act(ctx, action, { item: row.id, state: event.target.value }) },
              states.map((state) => h("option", { value: state, selected: row.state === state }, t(`handover.${action}.${state}`)))));
      })));
}

export function callCard(data, draft) {
  const summary = data.summary || {};
  if (!Array.isArray(summary.call_card) || !summary.call_card.length) return null;
  // The current server card uses session start as accident time and the original safety answers.
  // Keep the GUI's explicit time and later injury/mobility entries as the source of those facts.
  const lines = summary.call_card.filter((line) => !line.startsWith("사고 시간은 ")
    && !(draft.injuryStatus !== "unknown" && /^(현재 다친 사람은|다친 사람이나 위험 신호가|다친 사람이 있는지는)/.test(line))
    && !(draft.towing !== "unknown" && /^(차량 이동 지원이|차량은 직접 이동)/.test(line)));
  return h("details", { class: "card" }, h("summary", {}, t("handover.callCard")), h("p", { class: "muted" }, t("handover.callBasis")),
    h("ul", { class: "wrap-tasks" }, lines.map((line) => h("li", {}, displayCallLine(line, data)))));
}

export function uninsuredCard(data) {
  const card = displayView(data).summary?.uninsured;
  if (!card || !Array.isArray(card.lines)) return null;
  return h("details", { class: "card" }, h("summary", {}, card.title),
    h("ul", { class: "wrap-tasks" }, card.lines.map((line) => h("li", {}, line))),
    typeof card.source?.url === "string" && card.source.url.startsWith("https://") ? h("a", { href: card.source.url, target: "_blank", rel: "noopener noreferrer" }, card.source.title) : null);
}

async function openFollowup(ctx, record) {
  const input = h("textarea", { id: "followup-note", rows: 4, maxlength: FOLLOWUP_CHARS });
  const message = h("p", { class: "insurance-feedback", role: "alert" });
  await openSheet((close) => [h("h2", { class: "title" }, t("handover.addNote")),
    h("form", { class: "stack", onsubmit: async (event) => {
      event.preventDefault();
      if (ctx.state.get().busy) return;
      const ok = await appendFollowup(ctx, input.value, record?.id || null);
      if (ok) close(); else message.textContent = ctx.state.get().error || t("wrap.saveError");
    } }, h("label", { class: "insurance-field", for: "followup-note" }, h("span", {}, t("handover.noteLabel")), input), message,
    h("button", { type: "submit", class: "btn btn--primary btn--lg" }, t("handover.addNote")),
    h("button", { type: "button", class: "btn btn--ghost", onclick: () => close() }, t("insurance.cancel")))], { label: t("handover.addNote") });
}
export function followupPanel(ctx, record = null) {
  const data = displayView(record ? record.view : ctx.state.get().data);
  if (!record && !Array.isArray(data?.summary?.followups)) return null;
  const rows = followupRows(record || { view: data });
  return h("section", { class: "card" }, h("h2", { class: "h2" }, data.summary?.titles?.followup || t("handover.followup")),
    h("p", { class: "muted" }, data.summary?.titles?.followup_note || t("handover.followupNote")),
    rows.map((row) => h("div", { class: "followup-note" }, h("time", { class: "eyebrow" }, row.time), h("p", {}, row.text),
      row.local ? h("small", { class: "muted" }, t("handover.localNote")) : null)),
    h("button", { type: "button", class: "btn btn--secondary", disabled: Boolean(ctx.state.get().busy) || rows.length >= FOLLOWUP_MAX,
      onclick: () => openFollowup(ctx, record) }, t("handover.addNote")));
}
