import { h } from "../../ui/dom.js";
import { chip } from "../../ui/chip.js";
import { t } from "../../core/i18n.js";
import { getWrapDraft } from "../../core/store.js";
import { infoRows } from "../../core/coach.js";
import { act } from "../../flows/stage.js";
import { openInfoSheet } from "../coach/info-sheet.js";
import { editScene, taskList } from "./wrap-shared.js";

export function leaveScreen(ctx) {
  const { data, busy } = ctx.state.get();
  const draft = getWrapDraft(data.session.id);
  const rows = infoRows(data.session.info, data.checklist).map((row) => row.labelKey === "coach.row.photoChip"
    ? { ...row, kind: "unknown", labelKey: "wrap.platePhoto" } : row);
  const back = async () => { if (await act(ctx, "goto", { target: "hub" })) ctx.update({ overlay: "coach-setup" }); };
  return {
    body: [
      h("h1", { class: "title" }, t("wrap.leaveTitle")),
      h("div", { class: "card" },
        h("h2", { class: "h2" }, t("wrap.otherInfo")),
        rows.map((row) => h("button", { type: "button", class: "wrap-check", disabled: Boolean(busy), onclick: () => openInfoSheet(ctx, row) },
          h("span", {}, h("b", {}, t(row.nameKey)), h("span", { class: "wrap-check-value" }, row.value || t(row.valueKey))),
          chip(row.kind, row.labelKey ? { label: t(row.labelKey) } : undefined)))),
      h("section", { class: "card" }, h("div", { class: "row" }, h("h2", { class: "h2" }, t("wrap.sceneTitle")),
        h("button", { type: "button", class: "linkbtn", onclick: () => editScene(ctx) }, t("wrap.editScene"))),
        h("p", { class: "muted" }, t("wrap.dashcamStatus", { status: t(`wrap.option.dashcam.${draft.dashcam}`) })),
        h("p", { class: "muted" }, t("wrap.claimNumberStatus", { number: draft.claimNumber || t("wrap.unknown") }))),
      h("section", { class: "card" }, h("h2", { class: "h2" }, t("wrap.serverCheck")),
        h("ul", { class: "wrap-tasks" }, (data.summary?.leave_check || []).map((line) => h("li", {}, line)))),
      h("details", { class: "card" }, h("summary", {}, t("wrap.remaining")), taskList(data, draft)),
      h("p", { class: "wrap-note" }, t("wrap.leaveNote")),
    ],
    actions: [
      { label: t("wrap.toCall"), kind: "primary", disabled: Boolean(busy), onClick: () => ctx.update({ overlay: "call-prep", callPhase: "prep" }) },
      { label: t("wrap.backToTalk"), kind: "secondary", disabled: Boolean(busy), onClick: back },
    ],
    voice: { key: `leave:${data.session.id}:${JSON.stringify(data.summary?.leave_check)}`, say: data.summary?.leave_check || [], listen: false, parse: () => null, run: () => {} },
  };
}
