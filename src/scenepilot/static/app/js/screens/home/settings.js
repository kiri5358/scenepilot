import { h } from "../../ui/dom.js";
import { openSheet } from "../../ui/sheet.js";
import { getLang, setLang, t } from "../../core/i18n.js";
import { getSettings, saveSettings, saveCoachPrefs } from "../../core/store.js";
import * as speaker from "../../services/speak.js";
import * as voice from "../../services/voice.js";
import * as narrator from "../../services/narrator.js";
import * as coachSession from "../../services/coach-session.js";
import { openOnboarding } from "../../flows/onboarding.js";
import { canManageData, downloadBackup, restoreBackup, clearDeviceData } from "../../flows/data.js";

function choice(name, current, options, onChange, label) {
  return h("fieldset", { class: "seg", "aria-label": label },
    options.map(({ value, label }) => h("label", {},
      h("input", { type: "radio", name, value, checked: value === current ? true : null, onchange: () => onChange(value) }),
      h("span", {}, label))));
}

function toggle(labelKey, checked, onChange) {
  return h("label", { class: "settings-toggle" }, h("span", {}, t(labelKey)),
    h("input", { type: "checkbox", role: "switch", checked, onchange: (event) => onChange(event.target.checked) }));
}
export async function openSettings(ctx) {
  narrator.suspend();
  if (coachSession.isRunning()) coachSession.pause();
  const settings = { ...getSettings(), lang: ctx.state.get().lang, sos: ctx.state.get().sos };
  let prefs = ctx.state.get().coachPrefs;
  const message = h("p", { class: "insurance-feedback", role: "status" });
  const saved = (ok) => { message.textContent = t(ok ? "settings.saved" : "settings.sessionOnly"); message.dataset.error = String(!ok); };
  const updatePrefs = (patch) => { prefs = { ...prefs, ...patch }; saved(saveCoachPrefs(prefs)); ctx.update({ coachPrefs: prefs }); };
  const section = (title, ...content) => h("section", { class: "settings-section" }, h("h3", { class: "h2" }, t(title)), content);
  const canManage = canManageData(ctx);
  try {
    const action = await openSheet((close) => [
      h("h2", { class: "title" }, t("settings.title")),
      section("settings.lang", choice("lang", getLang(), [{ value: "ko", label: t("lang.ko") }, { value: "en", label: t("lang.en") }], async (value) => {
        const ok = saveSettings({ lang: value });
        await setLang(value);
        voice.init();
        ctx.update({ lang: value, notice: ok ? null : t("settings.sessionOnly") }); close();
      }, t("settings.lang")), h("p", { class: "muted" }, t("settings.langNote"))),
      section("settings.sos", choice("sos", settings.sos, [
        { value: "always", label: t("settings.sos.always") }, { value: "accident", label: t("settings.sos.accident") }, { value: "hidden", label: t("settings.sos.hidden") },
      ], (value) => { saved(saveSettings({ sos: value })); ctx.update({ sos: value }); }, t("settings.sos")), h("p", { class: "muted" }, t("settings.sosNote"))),
      section("settings.voice", toggle("settings.speak", speaker.isEnabled(), (on) => saved(speaker.setEnabled(on))),
        toggle("settings.listen", voice.handsFree(), (on) => saved(voice.setHandsFree(on))),
        h("p", { class: "muted" }, t("settings.pauseNote"))),
      section("settings.coaching", choice("coach-mode", prefs.mode, [{ value: "screen", label: t("settings.coach.screen") }, { value: "ear", label: t("settings.coach.ear") }],
        (mode) => updatePrefs({ mode }), t("settings.coaching")), toggle("settings.ai", prefs.ai, (ai) => updatePrefs({ ai })),
        h("p", { class: "muted" }, t("settings.aiNote"))),
      section("settings.data", h("p", { class: "muted" }, t("backup.fileNote")),
        h("button", { type: "button", class: "btn btn--secondary", onclick: () => close("backup") }, t("backup.export")),
        h("button", { type: "button", class: "btn btn--secondary", disabled: !canManage, onclick: () => close("restore") }, t("backup.restore")),
        h("button", { type: "button", class: "btn btn--secondary", disabled: !canManage, onclick: () => close("clear") }, t("settings.clear")),
        canManage ? null : h("p", { class: "muted" }, t("settings.dataBusy"))),
      h("button", { type: "button", class: "btn btn--secondary", disabled: !canManage, onclick: () => close("onboarding") }, t("settings.replay")),
      h("button", { type: "button", class: "btn btn--secondary", onclick: () => close("privacy") }, t("settings.privacy")),
      message, h("button", { type: "button", class: "btn btn--primary btn--lg", onclick: () => close() }, t("settings.close")),
    ], { label: t("settings.title") });
    if (action === "backup") downloadBackup(ctx);
    else if (action === "restore") await restoreBackup(ctx);
    else if (action === "clear") await clearDeviceData(ctx);
    else if (action === "onboarding") openOnboarding(ctx);
    else if (action === "privacy") await openSheet((close) => [h("h2", { class: "title" }, t("settings.privacy")),
      [1, 2, 3, 4, 5, 6].map((n) => h("p", {}, t(`privacy.${n}`))),
      h("button", { type: "button", class: "btn btn--primary btn--lg", onclick: () => close() }, t("settings.close"))], { label: t("settings.privacy") });
  } finally { narrator.resume(); }
}
