// Before the talk: how to receive the coaching, whether the AI coach is used, and what to tell the other driver first.
import { h } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { t } from "../../core/i18n.js";
import { SETUP_COMMANDS } from "../../core/coach.js";
import { saveCoachPrefs } from "../../core/store.js";
import { matchCommand } from "../../services/voice.js";
import { startTalk } from "../../flows/coach.js";

function modeOption(ctx, value, iconName, titleKey, subKey, current) {
  return h("label", { class: value === current ? "mode mode--on" : "mode" },
    h("input", {
      type: "radio", name: "coach-mode", value, checked: value === current ? true : null,
      onchange: () => { const prefs = { ...ctx.state.get().coachPrefs, mode: value }; saveCoachPrefs(prefs); ctx.update({ coachPrefs: prefs }); },
    }),
    h("span", { class: "mode-icon" }, icon(iconName)),
    h("span", {}, h("p", { class: "mode-title" }, t(titleKey)), h("p", { class: "mode-sub" }, t(subKey))));
}

export function coachSetupScreen(ctx) {
  const prefs = ctx.state.get().coachPrefs;
  const goNoTalk = () => ctx.update({ overlay: "no-talk" });
  const begin = () => startTalk(ctx);

  return {
    body: [
      h("h1", { class: "title" }, t("coach.setup.title")),
      h("p", { class: "eyebrow" }, t("coach.setup.how")),
      modeOption(ctx, "screen", "mic", "coach.mode.screen", "coach.mode.screenSub", prefs.mode),
      modeOption(ctx, "ear", "ear", "coach.mode.ear", "coach.mode.earSub", prefs.mode),
      h("label", { class: "ai-option" },
        h("input", {
          type: "checkbox", checked: prefs.ai ? true : null,
          onchange: (event) => { const next = { ...ctx.state.get().coachPrefs, ai: event.target.checked }; saveCoachPrefs(next); ctx.update({ coachPrefs: next }); },
        }),
        h("span", {}, h("span", { class: "ai-title" }, t("coach.ai.title")), h("span", { class: "ai-sub" }, t("coach.ai.sub")))),
      h("div", { class: "tell" },
        h("p", { class: "tell-label" }, t("coach.tell.title")),
        h("p", { class: "tell-text" }, `"${t("coach.tell.text")}"`)),
    ],
    actions: [
      { label: t("coach.start"), icon: "ear", kind: "primary", onClick: begin },
      { label: t("coach.noTalk"), kind: "secondary", onClick: goNoTalk },
    ],
    voice: {
      key: "coach-setup",
      say: [t("coach.setup.title"), t("coach.tell.title"), t("coach.tell.text")],
      hint: t("listen.hint.coachSetup"),
      parse: (text) => matchCommand(text, SETUP_COMMANDS),
      run: (command) => { if (command === "start") begin(); else if (command === "notalk") goNoTalk(); },
    },
  };
}
