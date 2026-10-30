import { displayState } from "../../core/display.js";
// "I don't want to talk": swap contact and insurer only. The talk may be skipped, the exchange of details may not
// (giving them is a duty, Road Traffic Act article 54), so this screen walks through just that.
import { h } from "../../ui/dom.js";
import { chip } from "../../ui/chip.js";
import { t } from "../../core/i18n.js";
import { beginWrap } from "../../flows/wrap.js";
import { setInfoValue } from "../../flows/info.js";
import { openCard } from "../../flows/coach.js";

function step(number, title, ...rest) {
  return h("div", { class: "step" },
    h("span", { class: "task-num task-num--small" }, number),
    h("div", { class: "step-body" }, h("p", { class: "step-title" }, title), rest));
}

function detailField(ctx, { id, labelKey, placeholderKey, field, type }) {
  const { data } = displayState(ctx);
  const entry = data.session.info && data.session.info[field];
  const input = h("input", { type, id, placeholder: t(placeholderKey), value: entry ? entry.value : "", autocomplete: "off" });
  const save = () => { if (input.value.trim() && (!entry || input.value.trim() !== entry.value)) setInfoValue(ctx, field, input.value); };
  input.addEventListener("change", save);
  input.addEventListener("keydown", (event) => { if (event.key === "Enter") save(); });
  return h("label", { class: "fld" }, h("span", { class: "step-sub" }, t(labelKey)), input);
}

export function noTalkScreen(ctx) {
  const { data, noTalkRefused } = displayState(ctx);
  const photo = data.checklist.some((slot) => slot.id === "other_vehicle" && slot.status === "captured");
  return {
    body: [
      h("p", { class: "eyebrow" }, t("notalk.kick")),
      h("h1", { class: "title" }, t("notalk.title")),
      h("div", { class: "say say--small" },
        h("span", { class: "say-label" }, t("notalk.sayLabel")),
        h("p", { class: "say-text say-text--small" }, `"${t("notalk.say")}"`)),
      step(1, t("notalk.s1"),
        h("p", { class: "step-sub" }, t("notalk.s1sub")),
        h("button", { type: "button", class: "mini", onclick: () => openCard(ctx) }, t("notalk.s1btn"))),
      step(2, t("notalk.s2"),
        photo ? chip("ok", { label: t("notalk.photoChip") }) : null,
        detailField(ctx, { id: "nt-contact", labelKey: "notalk.phone", placeholderKey: "notalk.phonePh", field: "other_contact", type: "text" }),
        detailField(ctx, { id: "nt-insurer", labelKey: "notalk.insurer", placeholderKey: "notalk.insurerPh", field: "other_insurance", type: "text" }),
        h("button", { type: "button", class: "mini", onclick: () => ctx.update({ noTalkRefused: !noTalkRefused }) }, noTalkRefused ? t("notalk.refuseUndo") : t("notalk.refuse"))),
      noTalkRefused ? h("div", { class: "refuse", role: "alert" }, t("notalk.refused"), photo ? ` ${t("notalk.refusedPhoto")}` : "") : null,
      step(3, t("notalk.s3"), h("p", { class: "step-sub" }, t("notalk.s3sub"))),
    ],
    actions: [
      { label: t("notalk.toInsurer"), icon: "phone", kind: "primary", onClick: () => beginWrap(ctx) },
      { label: t("notalk.toCoach"), kind: "secondary", onClick: () => ctx.update({ overlay: "coach-setup" }) },
    ],
  };
}
