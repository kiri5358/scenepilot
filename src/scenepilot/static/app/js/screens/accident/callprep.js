import { displayView, displayState } from "../../core/display.js";
import { h } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { t } from "../../core/i18n.js";
import { getProfile, getWrapDraft, saveWrapDraft } from "../../core/store.js";
import { phoneHref } from "../../core/insurance.js";
import { CLAIM_STATUSES, CLAIM_SCOPES } from "../../core/wrap.js";
import { saveFinalRecord } from "../../flows/wrap.js";
import { leaveToHome } from "../../flows/accident.js";
import { preparationRows, editScene, taskList } from "./wrap-shared.js";
import { handoverChecks, callCard, uninsuredCard } from "../../ui/handover.js";
import { CONTACT_CHARS } from "../../core/handover.js";

export function resultForm(data, ctx = null) {
  data = displayView(data);
  let draft = getWrapDraft(data.session.id);
  const message = h("p", { class: "insurance-feedback", role: "status" });
  const tasks = h("div", {}, taskList(data, draft));
  const injuryWarning = h("p", { class: "wrap-note", role: "status" });
  const hasChecks = Array.isArray(data.summary?.coverage_rows) && data.summary.coverage_rows.length > 0;
  const refreshWarning = () => {
    const injuryConfirmed = hasChecks ? data.summary.coverage_rows.some((row) => row.id === "injury_claim" && row.state === "confirmed") : draft.scopes.includes("injury");
    injuryWarning.textContent = data.summary?.contact?.warning || (draft.injuryStatus === "mentioned" && !injuryConfirmed ? t("wrap.injuryWarning") : "");
  };
  const save = (patch) => {
    const saved = saveWrapDraft(data.session.id, patch);
    draft = getWrapDraft(data.session.id);
    message.textContent = t(saved ? "wrap.draftSaved" : "wrap.draftError");
    message.dataset.error = String(!saved);
    tasks.replaceChildren(taskList(data, draft));
    refreshWarning();
  };
  const textField = (name) => h("label", { class: "insurance-field" }, h("span", {}, t(`wrap.field.${name}`)),
    h("input", { type: "text", maxlength: ctx && data.summary?.contact ? CONTACT_CHARS : name === "agent" ? 200 : 100, value: draft[name],
      oninput: (event) => save({ [name]: event.target.value, contactDirty: true }) }));
  refreshWarning();
  return [
    h("h1", { class: "title" }, t("wrap.afterTitle")),
    h("p", { class: "muted" }, t("wrap.afterNote")),
    ctx && data.summary?.contact ? h("p", { class: "muted" }, t("handover.contactNotice")) : null,
    h("fieldset", { class: "wrap-call-status" }, h("legend", { class: "eyebrow" }, t("wrap.contactStatus")),
      CLAIM_STATUSES.map((status) => h("label", {}, h("input", { type: "radio", name: "claim-status", value: status, checked: draft.claimStatus === status,
        onchange: () => save({ claimStatus: status, contactDirty: true }) }), h("span", {}, t(`wrap.claimStatus.${status}`))))),
    textField("claimNumber"), textField("agent"),
    ctx && hasChecks ? handoverChecks(ctx) : null,
    h(hasChecks ? "details" : "div", { class: "stack" }, hasChecks ? h("summary", {}, t("handover.scopeMemo")) : null,
    h("fieldset", { class: "card wrap-scopes" }, h("legend", { class: "eyebrow" }, t("wrap.scopes")),
      CLAIM_SCOPES.map((scope) => h("label", {}, h("input", { type: "checkbox", value: scope, checked: draft.scopes.includes(scope),
        onchange: (event) => save({ scopes: event.target.checked ? [...draft.scopes, scope] : draft.scopes.filter((item) => item !== scope) }) }), h("span", {}, t(`wrap.scope.${scope}`)))))),
    injuryWarning, message,
    h("section", { class: "card" }, h("h2", { class: "h2" }, t("wrap.remaining")), tasks),
  ];
}

export function callprepScreen(ctx) {
  const { data, callPhase, busy } = displayState(ctx);
  const after = callPhase === "after";
  const profile = getProfile(), draft = getWrapDraft(data.session.id);
  const href = phoneHref(profile.claims_phone);
  return {
    focusKey: `call:${data.session.id}:${after ? "after" : "prep"}`,
    onBack: () => ctx.update({ overlay: null }),
    body: after ? resultForm(data, ctx) : [
      h("p", { class: "eyebrow" }, t("wrap.prepKick")), h("h1", { class: "title" }, t("wrap.prepTitle")),
      preparationRows(data, profile, draft), h("p", { class: "muted" }, t("wrap.timeNote")),
      h("button", { type: "button", class: "btn btn--secondary", onclick: () => editScene(ctx) }, t("wrap.editScene")),
      h("div", { class: "wrap-say" }, h("p", { class: "eyebrow" }, t("wrap.lastQuestion")), h("p", { class: "lead" }, t("wrap.lastQuestionText"))),
      h("p", { class: "muted" }, t("wrap.prepNote")),
      callCard(data, draft), uninsuredCard(data),
      href ? h("a", { class: "btn btn--primary btn--lg", href }, icon("phone"), t("wrap.call", { name: profile.insurer || t("wrap.insurer"), phone: profile.claims_phone }))
        : h("div", { class: "card" }, h("p", { class: "muted" }, t("wrap.noPhone")),
          h("button", { type: "button", class: "btn btn--secondary", onclick: () => { leaveToHome(ctx); ctx.update({ tab: "insurance" }); } }, t("wrap.toInsurance"))),
    ],
    strip: h("p", { class: "wrap-silent" }, t("wrap.silent")),
    actions: after ? [
      { label: t("wrap.saveRecord"), kind: "primary", disabled: Boolean(busy), onClick: () => saveFinalRecord(ctx) },
      { label: t("wrap.backToPrep"), kind: "secondary", onClick: () => ctx.update({ callPhase: "prep" }) },
    ] : [
      { label: t("wrap.toAfter"), kind: "primary", onClick: () => ctx.update({ callPhase: "after" }) },
      { label: t("wrap.toLeave"), kind: "secondary", onClick: () => ctx.update({ overlay: null }) },
    ],
  };
}
