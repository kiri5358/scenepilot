import { displayState } from "../../core/display.js";
// During the talk: one line from the coach, what to say, and what is still missing from the other driver.
// The phone listens in the background (services/coach-session.js); this screen shows what it found.
import { h } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { chip } from "../../ui/chip.js";
import { t } from "../../core/i18n.js";
import { infoRows } from "../../core/coach.js";
import * as coachSession from "../../services/coach-session.js";
import { canVibrate } from "../../services/vibrate.js";
import { endTalk, openCard } from "../../flows/coach.js";
import { beginWrap } from "../../flows/wrap.js";
import { openInfoSheet } from "./info-sheet.js";

const VIB_KEY = { danger: "coach.vib.danger", stop: "coach.vib.stop", info: "coach.vib.info", tone: "coach.vib.tone", tip: "coach.vib.tip" };

function coachCard(plan) {
  if (!plan) {
    return h("div", { class: "coach-card" },
      h("div", { class: "coach-head" }, h("span", {}, t("coach.coachLabel"))),
      h("p", { class: "coach-line coach-line--idle" }, t("coach.idle")));
  }
  return h("div", { class: "coach-card" },
    h("div", { class: "coach-head" },
      h("span", {}, t("coach.coachLabel")),
      canVibrate() ? h("span", { class: "vib" }, icon("vibrate", "ico--sm"), t(VIB_KEY[plan.category])) : null),
    h("p", { class: "coach-line" }, plan.text));
}

function checklist(ctx, rows) {
  return h("ul", { class: "checklist", "aria-label": t("coach.checklist") }, rows.map((row) => h("li", {},
    h("button", { type: "button", class: "check-row", onclick: () => openInfoSheet(ctx, row) },
      h("span", { class: "check-text" },
        h("span", { class: "check-name" }, t(row.nameKey)),
        h("span", { class: "check-value" }, row.value || t(row.valueKey))),
      chip(row.kind, row.labelKey ? { label: t(row.labelKey) } : undefined)))));
}

// The strip above the buttons: what the phone is doing, with pause / resume.
function strip(status) {
  const unsupported = status === "unsupported";
  const failed = status === "error";
  const paused = status === "paused";
  const title = unsupported ? t("coach.unsupported") : failed ? t("coach.micError") : paused ? t("coach.strip.paused") : t("coach.strip.on");
  const sub = unsupported || failed ? null : paused ? t("coach.strip.pausedSub") : t("coach.strip.onSub");
  return h("div", { class: paused || failed || unsupported ? "talkstrip talkstrip--paused" : "talkstrip", role: "status" },
    h("span", { class: "talkstrip-text" }, h("span", {}, title), sub ? h("span", { class: "talkstrip-sub" }, sub) : null),
    unsupported ? null : h("button", {
      type: "button", class: "voicebar-btn",
      onclick: status === "listening" ? () => coachSession.pause() : () => coachSession.resume(),
    }, status === "listening" ? t("coach.pause") : t("coach.resume")));
}

export function coachScreen(ctx) {
  const { data, coach, busy } = displayState(ctx);
  const rows = infoRows(data.session.info, data.checklist);
  return {
    appbar: "coach",
    live: { status: coach.status },
    onBack: () => endTalk(ctx),
    banner: coach.aiError ? { kind: "warn", message: t("coach.ai.error") } : null,
    body: [
      h("p", { class: "heard" }, `${t("coach.heard")} `, h("span", { id: "heard-text" }, "")),
      coachCard(coach.hint),
      coach.hint && coach.hint.say
        ? h("div", { class: "say" }, h("span", { class: "say-label" }, t("coach.sayLabel")), h("p", { class: "say-text" }, `"${coach.hint.say}"`))
        : null,
      checklist(ctx, rows),
    ],
    strip: strip(coach.status),
    actions: [
      { label: t("coach.showCard"), icon: "check", kind: "secondary", onClick: () => openCard(ctx) },
      { label: t("coach.end"), kind: "primary", disabled: Boolean(busy), onClick: () => beginWrap(ctx) },
    ],
    actionsEqual: true,
  };
}
