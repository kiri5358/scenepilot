import { h } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { t, getLang, setLang } from "../../core/i18n.js";
import { saveSettings } from "../../core/store.js";
import * as speaker from "../../services/speak.js";
import { finishOnboarding, acceptOnboarding, checkMicrophone } from "../../flows/onboarding.js";
import { supported } from "../../services/voice.js";

const PAGES = ["intro", "promises", "microphone", "insurance"];

export function onboardingScreen(ctx) {
  const state = ctx.state.get(), step = state.onboardingStep || 0, page = PAGES[step];
  const feature = (name, title, copy) => h("div", { class: "onboarding-feature" }, icon(name),
    h("div", {}, h("h2", { class: "h2" }, t(title)), h("p", { class: "muted" }, t(copy))));
  const micSupported = supported() && typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
  const next = () => step === 1 ? acceptOnboarding(ctx) : step === 3 ? finishOnboarding(ctx, { tab: "insurance" }) : ctx.update({ onboardingStep: step + 1 });
  return {
    bare: true, tone: "welcome", focusKey: `onboarding:${step}`,
    body: [
      h("div", { class: "onboarding-head" }, h("span", { class: "brand" }, icon("shield"), "ScenePilot"),
        h("span", { class: "eyebrow" }, t("onboarding.page", { n: step + 1, total: 4 }),
          // the language can be changed on the very first screen, before the settings are reachable
          h("button", { type: "button", class: "linkbtn lang-switch", lang: getLang() === "en" ? "ko" : "en", onclick: async () => {
            const next = getLang() === "en" ? "ko" : "en";
            await setLang(next); saveSettings({ lang: next }); ctx.update({ lang: next }); speaker.warmClips();
          } }, t("onboarding.langSwitch")))),
      h("div", { class: "onboarding-sos" }, h("a", { href: "tel:119", class: "call call--119" }, "119"), h("a", { href: "tel:112", class: "call call--112" }, "112")),
      h("h1", { class: "onboarding-title" }, t(`onboarding.${page}.title`)),
      h("p", { class: "onboarding-sub" }, t(`onboarding.${page}.sub`)),
      page === "intro" ? h("div", { class: "stack" },
        feature("shield", "onboarding.feature.safety", "onboarding.feature.safetyNote"),
        feature("ear", "onboarding.feature.talk", "onboarding.feature.talkNote"),
        feature("folder", "onboarding.feature.claim", "onboarding.feature.claimNote")) : null,
      page === "promises" ? h("div", { class: "stack" },
        ["p1", "p2", "p3"].map((key) => h("p", { class: "onboarding-promise" }, icon("check"), t(`consent.${key}`))),
        h("details", { class: "onboarding-detail" }, h("summary", {}, t("consent.more")),
          h("ul", { class: "detail-list" }, ["d1", "d2", "d3", "d4", "d5", "d6"].map((key) => h("li", {}, t(`consent.${key}`)))))) : null,
      page === "microphone" ? h("div", { class: "stack" },
        feature("mic", "onboarding.mic.title", "onboarding.mic.note"),
        h("p", { class: "onboarding-promise", role: "status" }, t(micSupported ? `onboarding.mic.${state.onboardingMic || "idle"}` : "onboarding.mic.unsupported")),
        h("button", { type: "button", class: "btn btn--secondary", disabled: !micSupported || state.onboardingMic === "asking", onclick: () => checkMicrophone(ctx) }, t("onboarding.mic.check")),
        h("p", { class: "muted" }, t("onboarding.mic.optional"))) : null,
      page === "insurance" ? h("div", { class: "stack" },
        feature("lock", "onboarding.insurance.card", "onboarding.insurance.note"),
        h("p", { class: "onboarding-promise" }, t("onboarding.insurance.optional"))) : null,
      h("nav", { class: "onboarding-dots", "aria-label": t("onboarding.pages") }, PAGES.map((name, index) => h("button", {
        type: "button", "aria-label": t(`onboarding.${name}.title`), "aria-current": step === index ? "step" : null,
        onclick: () => ctx.update({ onboardingStep: index }),
      }, h("span", { "aria-hidden": "true" })))),
    ],
    actions: [
      { label: t(step === 1 ? "onboarding.agree" : step === 3 ? "onboarding.register" : "onboarding.next"), kind: "primary", onClick: next },
      { label: t("onboarding.accident"), kind: "secondary", onClick: () => finishOnboarding(ctx, { accident: true }) },
      { label: t("onboarding.skip"), kind: "ghost", onClick: () => finishOnboarding(ctx, { tab: "home" }) },
    ],
  };
}
