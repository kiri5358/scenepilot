// Settings sheet. Only language and the 119/112 buttons so far; the rest arrives with the home screens.
import { h } from "../../ui/dom.js";
import { openSheet } from "../../ui/sheet.js";
import { getLang, setLang, t } from "../../core/i18n.js";
import { getSettings, saveSettings } from "../../core/store.js";

function choice(name, current, options, onChange) {
  return h("fieldset", { class: "seg" },
    options.map(({ value, label }) => h("label", {},
      h("input", { type: "radio", name, value, checked: value === current ? true : null, onchange: () => onChange(value) }),
      h("span", {}, label))));
}

export async function openSettings({ update }) {
  const settings = getSettings();
  await openSheet((close) => [
    h("h2", { class: "title" }, t("settings.title")),
    h("div", { class: "stack" },
      h("p", { class: "h2" }, t("settings.lang")),
      choice("lang", getLang(), [{ value: "ko", label: t("lang.ko") }, { value: "en", label: t("lang.en") }], async (value) => {
        saveSettings({ lang: value });
        await setLang(value);
        update({ lang: value });
        close();
      }),
      h("p", { class: "muted" }, t("settings.langNote"))),
    h("div", { class: "stack" },
      h("p", { class: "h2" }, t("settings.sos")),
      choice("sos", settings.sos, [
        { value: "always", label: t("settings.sos.always") },
        { value: "accident", label: t("settings.sos.accident") },
        { value: "hidden", label: t("settings.sos.hidden") },
      ], (value) => { saveSettings({ sos: value }); update({ sos: value }); }),
      h("p", { class: "muted" }, t("settings.sosNote"))),
    h("button", { type: "button", class: "btn btn--primary btn--lg", onclick: () => close() }, t("settings.close")),
  ], { label: t("settings.title") });
}
