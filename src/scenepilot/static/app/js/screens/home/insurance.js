import { h } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { openSheet } from "../../ui/sheet.js";
import { api } from "../../core/api.js";
import { t, serverText } from "../../core/i18n.js";
import { getProfile, getCoverage, saveInsurance, saveCoverage } from "../../core/store.js";
import { PROFILE_FIELDS, COVERAGES, COVERAGE_VALUES, normalizeProfile, validPolicyDates, phoneHref, pickedClaimsPhone } from "../../core/insurance.js";

function field(definition, value) {
  const { id, type, autocomplete, max } = definition;
  const input = h("input", { id: `insurance-${id}`, name: id, type, value: value || "", maxlength: max,
    autocomplete: autocomplete || "off", inputmode: type === "tel" ? "tel" : null });
  return { input, label: h("label", { class: "insurance-field", for: `insurance-${id}` },
    h("span", {}, t(`insurance.field.${id}`)), input) };
}

async function fillInsurers(select, inputs, source, note) {
  try {
    const data = await api("/api/insurers?country=KR");
    if (!select.isConnected) return;
    const insurers = (data.insurers || []).filter((item) => typeof item.name === "string" && typeof item.phone === "string");
    if (!insurers.length) throw new Error("empty");
    select.replaceChildren(h("option", { value: "" }, t("insurance.picker.choose")),
      ...insurers.map((item, i) => h("option", { value: String(i) }, item.name)));
    select.disabled = false;
    note.textContent = serverText(data.note) || t("insurance.picker.note");
    let previousPhone = null;
    select.addEventListener("change", () => {
      const item = select.value === "" ? null : insurers[Number(select.value)];
      source.replaceChildren();
      if (!item) return;
      inputs.insurer.value = item.name;
      const nextPhone = pickedClaimsPhone(inputs.claims_phone.value, previousPhone, item.phone);
      if (nextPhone === item.phone) previousPhone = item.phone;
      inputs.claims_phone.value = nextPhone;
      if (typeof item.source === "string" && item.source.startsWith("https://")) {
        source.append(h("a", { href: item.source, target: "_blank", rel: "noopener noreferrer" }, t("insurance.picker.source")));
      }
      if (data.verified) source.append(h("span", {}, t("insurance.picker.checked", { date: data.verified })));
    });
  } catch {
    if (select.isConnected) {
      select.replaceChildren(h("option", { value: "" }, t("insurance.picker.failed")));
      note.textContent = t("insurance.picker.manual");
    }
  }
}

async function editProfile(ctx) {
  const profile = normalizeProfile(getProfile());
  const fields = PROFILE_FIELDS.map((definition) => ({ ...definition, ...field(definition, profile[definition.id]) }));
  const inputs = Object.fromEntries(fields.map(({ id, input }) => [id, input]));
  const select = h("select", { id: "insurance-picker", disabled: true }, h("option", { value: "" }, t("insurance.picker.loading")));
  const source = h("p", { class: "insurance-source" });
  const note = h("p", { class: "muted" }, t("insurance.picker.note"));
  const message = h("p", { class: "insurance-feedback", role: "alert" });
  const saved = openSheet((close) => [
    h("h2", { class: "title" }, t("insurance.edit")),
    h("p", { class: "muted" }, t("insurance.optional")),
    h("form", { class: "stack", onsubmit: (event) => {
      event.preventDefault();
      const values = Object.fromEntries(fields.map(({ id, input }) => [id, input.value]));
      if (!validPolicyDates(values)) { message.textContent = t("insurance.dateError"); inputs.policy_end.focus(); return; }
      if (!saveInsurance(values)) { message.textContent = t("insurance.saveError"); return; }
      close(true);
    } },
    h("label", { class: "insurance-field", for: "insurance-picker" }, h("span", {}, t("insurance.picker.title")), select), note, source,
    fields.map(({ label }) => label), message,
    h("button", { type: "submit", class: "btn btn--primary btn--lg" }, t("insurance.save")),
    h("button", { type: "button", class: "btn btn--ghost", onclick: () => close() }, t("insurance.cancel"))),
  ], { label: t("insurance.edit") });
  fillInsurers(select, inputs, source, note);
  if (await saved) ctx.update({ insuranceNotice: true });
}

function profileCard(ctx, profile) {
  const rows = PROFILE_FIELDS.filter(({ id }) => profile[id]);
  const href = phoneHref(profile.claims_phone);
  return h("section", { class: "card", "aria-label": t("insurance.details") },
    h("div", { class: "row" }, h("h2", { class: "h2" }, t("insurance.details")),
      h("button", { type: "button", class: "linkbtn", onclick: () => editProfile(ctx) }, t(rows.length ? "insurance.edit" : "insurance.register"))),
    rows.length ? h("dl", { class: "insurance-summary" }, rows.map(({ id }) => [
      h("dt", {}, t(`insurance.field.${id}`)), h("dd", {}, profile[id]),
    ])) : h("p", { class: "muted" }, t("insurance.empty")),
    href ? h("a", { class: "btn btn--secondary", href }, icon("phone"), t("insurance.call", { phone: profile.claims_phone })) : null);
}

function coverageRow(id, value, message) {
  const choices = h("fieldset", { class: "insurance-options" },
    h("legend", { class: "sr-only" }, t("insurance.coverageLabel", { name: t(`cov.${id}`) })),
    COVERAGE_VALUES.map((choice) => h("label", {},
      h("input", { type: "radio", name: `coverage-${id}`, value: choice, checked: choice === value,
        onchange: () => {
          if (saveCoverage({ [id]: choice })) {
            value = choice;
            message.textContent = t("insurance.saved");
            message.dataset.error = "false";
          } else {
            for (const radio of choices.querySelectorAll("input")) radio.checked = radio.value === value;
            message.textContent = t("insurance.saveError");
            message.dataset.error = "true";
          }
        } }), h("span", {}, t(`insurance.coverage.${choice}`)))));
  return h("div", { class: "insurance-coverage" },
    h("div", { class: "insurance-coverage-text" }, h("p", { class: "insurance-coverage-name" }, t(`cov.${id}`)),
      h("p", { class: "insurance-coverage-desc" }, t(`insurance.desc.${id}`))), choices);
}

export function insuranceScreen(ctx) {
  const profile = normalizeProfile(getProfile());
  const coverage = getCoverage();
  const message = h("p", { class: "insurance-feedback", role: "status", "aria-live": "polite" },
    ctx.state.get().insuranceNotice ? t("insurance.saved") : "");
  return { body: [
    h("h1", { class: "title" }, t("nav.insurance")),
    profileCard(ctx, profile),
    h("section", { class: "card", "aria-label": t("insurance.coverages") },
      h("h2", { class: "h2" }, t("insurance.coverages")), h("p", { class: "muted" }, t("insurance.coverageNote")),
      COVERAGES.map((id) => coverageRow(id, coverage[id], message))),
    message,
    h("p", { class: "private-note" }, icon("lock", "ico--sm"), t("home.card.local")),
    h("p", { class: "muted" }, t("insurance.registrationNote")),
  ] };
}
