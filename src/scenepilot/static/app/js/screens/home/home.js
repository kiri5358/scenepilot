// Home: the big "start" button first, then any accident in progress, then the insurance card summary.
import { h } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { chip } from "../../ui/chip.js";
import { t } from "../../core/i18n.js";
import { COVERAGES, getCoverage, getProfile } from "../../core/store.js";
import { resumeAccident, startAccident } from "../../flows/accident.js";

const clean = (value) => (typeof value === "string" ? value.trim() : "");

function formatTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function ongoingCard(ctx) {
  const { ongoing } = ctx.state.get();
  if (!ongoing) return null;
  if (ongoing === "expired") {
    return h("div", { class: "card", role: "status" }, h("p", { class: "muted" }, t("home.expired")));
  }
  return h("section", { class: "card card--strong", "aria-label": t("home.ongoing.title") },
    h("p", { class: "eyebrow" }, t("home.ongoing.title")),
    h("p", { class: "h2" }, t("home.ongoing.when", { time: formatTime(ongoing.createdAt), stage: t(`stage.${ongoing.stage}`) })),
    h("div", { class: "btn-row" },
      h("button", { type: "button", class: "btn btn--primary", onclick: () => resumeAccident(ctx) }, t("home.ongoing.resume")),
      h("button", { type: "button", class: "btn btn--secondary", onclick: () => ctx.update({ tab: "records" }) }, t("home.ongoing.records"))));
}

function startButton(ctx) {
  const { ongoing, busy } = ctx.state.get();
  const label = ongoing && ongoing !== "expired" ? t("home.startNew") : t("home.start");
  return h("button", { type: "button", class: "start", disabled: busy ? true : null, onclick: () => startAccident(ctx) },
    h("span", { class: "start-disc" }, icon("alert", "ico--lg")),
    h("span", { class: "start-text" },
      h("span", { class: "start-label" }, label),
      h("span", { class: "start-hint" }, busy || t("home.startHint"))));
}

function insuranceCard(ctx) {
  const profile = getProfile();
  const coverage = getCoverage();
  const headline = [clean(profile.insurer), clean(profile.plate)].filter(Boolean).join(" · ");
  const claims = clean(profile.claims_phone);
  const filled = Boolean(headline || claims || clean(profile.policy) || clean(profile.name) || clean(profile.phone)
    || COVERAGES.some((id) => coverage[id] !== "unknown"));
  const toInsurance = () => ctx.update({ tab: "insurance" });

  const head = h("div", { class: "row" },
    h("p", { class: "eyebrow" }, t("home.card.title")),
    filled ? h("button", { type: "button", class: "linkbtn", onclick: toInsurance }, t("home.card.edit")) : null);

  if (!filled) {
    return h("section", { class: "card" }, head,
      h("p", { class: "muted" }, t("home.card.empty")),
      h("button", { type: "button", class: "btn btn--secondary", onclick: toInsurance }, t("home.card.register")),
      localNote());
  }

  const chips = COVERAGES.map((id) => {
    const name = t(`cov.${id}`);
    if (coverage[id] === "yes") return chip("ok", { label: name });
    if (coverage[id] === "no") return chip("skipped", { label: t("cov.no", { name }) });
    return chip("unknown", { label: name });
  });
  return h("section", { class: "card" }, head,
    h("div", {},
      headline ? h("p", { class: "h2" }, headline) : null,
      claims ? h("p", { class: "muted" }, t("home.card.claims", { phone: claims })) : null),
    h("div", { class: "chips" }, chips),
    localNote());
}

function localNote() {
  return h("p", { class: "private-note" }, icon("lock", "ico--sm"), t("home.card.local"));
}

function help() {
  return h("details", { class: "card" },
    h("summary", {}, t("home.help.title")),
    h("ol", {}, [1, 2, 3, 4, 5].map((n) => h("li", {}, t(`home.help.${n}`)))));
}

export function homeScreen(ctx) {
  return { body: [ongoingCard(ctx), startButton(ctx), insuranceCard(ctx), help()] };
}
