import { h } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { t } from "../../core/i18n.js";
import { getProfile, getWrapDraft, saveWrapDraft } from "../../core/store.js";
import { phoneHref } from "../../core/insurance.js";
import { CLAIM_STATUSES, CLAIM_SCOPES } from "../../core/wrap.js";
import { saveFinalRecord } from "../../flows/wrap.js";
import { leaveToHome } from "../../flows/accident.js";
import { preparationRows, editScene, taskList } from "./wrap-shared.js";

export function resultForm(data) {
  let draft = getWrapDraft(data.session.id);
  const message = h("p", { class: "insurance-feedback", role: "status" });
  const tasks = h("div", {}, taskList(data, draft));
  const injuryWarning = h("p", { class: "wrap-note", role: "status" });
  const refreshWarning = () => { injuryWarning.textContent = draft.injuryStatus === "mentioned" && !draft.scopes.includes("injury") ? t("wrap.injuryWarning") : ""; };
  const save = (patch) => {
    const saved = saveWrapDraft(data.session.id, patch);
    draft = getWrapDraft(data.session.id);
    message.textContent = t(saved ? "wrap.draftSaved" : "wrap.draftError");
    message.dataset.error = String(!saved);
    tasks.replaceChildren(taskList(data, draft));
    refreshWarning();
  };
  const textField = (name) => h("label", { class: "insurance-field" }, h("span", {}, t(`wrap.field.${name}`)),
    h("input", { type: "text", maxlength: name === "agent" ? 200 : 100, value: draft[name], oninput: (event) => save({ [name]: event.target.value }) }));
  refreshWarning();
  return [
    h("h1", { class: "title" }, t("wrap.afterTitle")),
    h("p", { class: "muted" }, t("wrap.afterNote")),
    h("fieldset", { class: "wrap-call-status" }, h("legend", { class: "eyebrow" }, t("wrap.contactStatus")),
      CLAIM_STATUSES.map((status) => h("label", {}, h("input", { type: "radio", name: "claim-status", value: status, checked: draft.claimStatus === status,
        onchange: () => save({ claimStatus: status }) }), h("span", {}, t(`wrap.claimStatus.${status}`))))),
    textField("claimNumber"), textField("agent"),
    h("fieldset", { class: "card wrap-scopes" }, h("legend", { class: "eyebrow" }, t("wrap.scopes")),
      CLAIM_SCOPES.map((scope) => h("label", {}, h("input", { type: "checkbox", value: scope, checked: draft.scopes.includes(scope),
        onchange: (event) => save({ scopes: event.target.checked ? [...draft.scopes, scope] : draft.scopes.filter((item) => item !== scope) }) }), h("span", {}, t(`wrap.scope.${scope}`))))),
    injuryWarning, message,
    h("section", { class: "card" }, h("h2", { class: "h2" }, t("wrap.remaining")), tasks),
  ];
}

export function callprepScreen(ctx) {
  const { data, callPhase, busy } = ctx.state.get();
  const after = callPhase === "after";
  const profile = getProfile(), draft = getWrapDraft(data.session.id);
  const href = phoneHref(profile.claims_phone);
  return {
    focusKey: `call:${data.session.id}:${after ? "after" : "prep"}`,
    onBack: () => ctx.update({ overlay: null }),
    body: after ? resultForm(data) : [
      h("p", { class: "eyebrow" }, t("wrap.prepKick")), h("h1", { class: "title" }, t("wrap.prepTitle")),
      preparationRows(data, profile, draft), h("p", { class: "muted" }, t("wrap.timeNote")),
      h("button", { type: "button", class: "btn btn--secondary", onclick: () => editScene(ctx) }, t("wrap.editScene")),
      h("div", { class: "wrap-say" }, h("p", { class: "eyebrow" }, t("wrap.lastQuestion")), h("p", { class: "lead" }, t("wrap.lastQuestionText"))),
      h("p", { class: "muted" }, t("wrap.prepNote")),
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
