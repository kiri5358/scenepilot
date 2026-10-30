import { h } from "../../ui/dom.js";
import { chip } from "../../ui/chip.js";
import { t, getLang } from "../../core/i18n.js";
import { getRecords, setRecordCompleted, saveWrapDraft, saveRecordDraft } from "../../core/store.js";
import { formatWhen, remainingTasks, readRecord, recordStatusKey } from "../../core/wrap.js";
import { resumeAccident } from "../../flows/accident.js";
import { preparationRows, taskList, editScene } from "../accident/wrap-shared.js";
import { resultForm } from "../accident/callprep.js";

const validRecords = () => getRecords().map(readRecord).filter(Boolean);

function detail(ctx, record) {
  const toggle = () => {
    if (!setRecordCompleted(record.id, !record.completed)) ctx.update({ error: t("wrap.saveError") });
    else ctx.update({ error: null });
  };
  if (ctx.state.get().recordEditing) {
    const localCtx = { ...ctx, state: { get: () => ({ ...ctx.state.get(), data: record.view }) } };
    return { focusKey: `record-edit:${record.id}`, body: [
      ...resultForm(record.view),
      h("button", { type: "button", class: "btn btn--secondary", onclick: () => editScene(localCtx) }, t("wrap.editScene")),
      h("button", { type: "button", class: "btn btn--primary btn--lg", onclick: () => {
        if (!saveRecordDraft(record.id)) ctx.update({ error: t("wrap.saveError") });
        else ctx.update({ recordEditing: false, error: null, recordNotice: true });
      } }, t("wrap.saveRecord")),
      h("button", { type: "button", class: "btn btn--ghost", onclick: () => {
        saveWrapDraft(record.id, record.draft);
        ctx.update({ recordEditing: false, error: null });
      } }, t("insurance.cancel")),
    ] };
  }
  return { focusKey: `record:${record.id}`, body: [
    h("button", { type: "button", class: "linkbtn records-back", onclick: () => ctx.update({ selectedRecordId: null, recordNotice: false }) }, t("records.back")),
    h("h1", { class: "title" }, t("records.detail")),
    ctx.state.get().recordNotice ? h("p", { class: "wrap-note", role: "status" }, t("records.saved")) : null,
    h("p", { class: "muted" }, formatWhen(record.draft.incidentAt || record.createdAt, getLang())),
    chip(record.completed ? "ok" : "later", { label: t(recordStatusKey(record)) }),
    preparationRows(record.view, record.profile, record.draft),
    h("section", { class: "card" }, h("h2", { class: "h2" }, t("records.claim")),
      h("p", {}, t(`wrap.claimStatus.${record.draft.claimStatus}`)),
      h("p", {}, t("wrap.claimNumberStatus", { number: record.draft.claimNumber || t("wrap.unknown") })),
      h("p", {}, t("records.agent", { value: record.draft.agent || t("wrap.unknown") })),
      h("p", {}, t("records.scope", { value: record.draft.scopes.length ? record.draft.scopes.map((scope) => t(`wrap.scope.${scope}`)).join(" · ") : t("wrap.unknown") }))),
    h("section", { class: "card" }, h("h2", { class: "h2" }, t("wrap.remaining")), taskList(record.view, record.draft)),
    h("details", { class: "card" }, h("summary", {}, t("records.serverSummary")),
      (record.view.summary?.sections || []).filter((section) => section.items.length).map((section) => h("section", { class: "stack" },
        h("h3", { class: "h2" }, section.title), (section.items || []).map((item) => h("p", { class: "records-summary-item" },
          h("b", {}, item.label), h("span", {}, item.value), h("small", { class: "muted" },
            t(`wrap.source.${["user_statement", "photo", "ai_observation", "unconfirmed", "system"].includes(item.source) ? item.source : "unconfirmed"}`)))))),
      record.view.summary?.disclaimer ? h("p", { class: "muted" }, record.view.summary.disclaimer) : null),
    h("button", { type: "button", class: "btn btn--secondary", onclick: toggle }, t(record.completed ? "records.markProcessing" : "records.markComplete")),
    h("button", { type: "button", class: "btn btn--primary", onclick: () => {
      const saved = saveWrapDraft(record.id, record.draft);
      ctx.update({ recordEditing: true, recordNotice: false, error: saved ? null : t("wrap.draftError") });
    } }, t("records.edit")),
    h("p", { class: "muted" }, t("records.completeNote")), h("p", { class: "muted" }, t("records.localNote")),
  ] };
}

export function recordsScreen(ctx) {
  const { selectedRecordId, ongoing } = ctx.state.get();
  const records = validRecords();
  const selected = records.find((record) => record.id === selectedRecordId);
  if (selected) return detail(ctx, selected);
  return { focusKey: "records-list", body: [
    h("h1", { class: "title" }, t("nav.records")),
    ongoing && ongoing !== "expired" ? h("section", { class: "card card--strong" },
      h("h2", { class: "h2" }, t("home.ongoing.title")),
      h("button", { type: "button", class: "btn btn--primary", onclick: () => resumeAccident(ctx) }, t("home.ongoing.resume"))) : null,
    records.length ? records.map((record) => h("button", { type: "button", class: "card records-item", onclick: () => ctx.update({ selectedRecordId: record.id, recordNotice: false, recordEditing: false }) },
      h("b", {}, formatWhen(record.draft.incidentAt || record.createdAt, getLang())), h("span", { class: "muted" }, record.draft.location || t("records.noLocation")),
      h("span", { class: "chips" }, chip(record.completed ? "ok" : "later", { label: t(recordStatusKey(record)) }),
        chip("unknown", { label: t("records.tasks", { n: remainingTasks(record.view, record.draft).length }) }))))
      : h("div", { class: "card" }, h("p", { class: "muted" }, t("records.empty"))),
    h("p", { class: "muted" }, t("records.localNote")),
  ] };
}
