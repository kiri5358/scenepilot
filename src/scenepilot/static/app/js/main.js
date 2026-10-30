// Start-up and drawing. Everything on screen is rebuilt from the state, as in the older UI.
import { createState } from "./core/state.js";
import { resolve, showSos, stepStates, TABS } from "./core/router.js";
import { setLang, t } from "./core/i18n.js";
import { getSettings } from "./core/store.js";
import { h, mount } from "./ui/dom.js";
import { appbar } from "./ui/appbar.js";
import { tabbar } from "./ui/tabbar.js";
import { actions } from "./ui/actions.js";
import { banner } from "./ui/banner.js";
import { voiceBars } from "./ui/voicebar.js";
import { getScreen } from "./screens/index.js";
import { openSettings } from "./screens/home/settings.js";
import { checkOngoing, leaveToHome } from "./flows/accident.js";
import { loadClips } from "./services/speak.js";
import { narrate } from "./services/narrator.js";
import * as voice from "./services/voice.js";

const settings = getSettings();
const state = createState({
  mode: "home",        // "home" | "accident"
  tab: "home",         // "home" | "insurance" | "records"
  overlay: null,       // a screen on top of the accident's stage screen (talk coaching, ...)
  lang: settings.lang,
  sos: settings.sos,
  data: null,          // the server's last view of the accident, or null
  ongoing: null,       // an accident from before: { stage, createdAt } | "expired" | null
  busy: null,          // a message while something is in progress
  error: null,         // a message to show in the banner
  guideItem: 0,        // which sentence of the "what to do now" list is shown
  lastPhoto: null,     // the result of the photo just sent: { itemId, accepted, message, observations }
  qa: [],              // questions asked and the server's answers, newest first
});

const shell = document.getElementById("shell");
const ctx = {
  state,
  update: state.update,
  openSettings: () => openSettings(ctx),
};

let lastScreen = null;

function stepsNav(index) {
  return h("ol", { class: "steps", "aria-label": t("steps.label") },
    stepStates(index).map(({ id, state: s }) => h("li", { "data-state": s, "aria-current": s === "current" ? "step" : null }, t(`steps.${id}`))));
}

function render(s) {
  const { screen, chrome } = resolve(s);
  const view = getScreen(screen)(ctx);
  const errorBanner = s.error
    ? { kind: "danger", message: s.error, actionLabel: t("action.dismiss"), onAction: () => state.update({ error: null }) }
    : null;

  const bottom = chrome.tabbar
    ? tabbar({ tabs: TABS, current: s.tab, onSelect: (tab) => state.update({ tab }) })
    : actions(view.actions, { row: view.actionsRow, equal: view.actionsEqual });

  if (view.tone) shell.dataset.tone = view.tone;
  else delete shell.dataset.tone;

  mount(shell,
    appbar({
      variant: chrome.appbar,
      showSos: showSos(s.sos, chrome.appbar),
      onBack: () => leaveToHome(ctx),
      onSettings: ctx.openSettings,
    }),
    chrome.step === null ? null : stepsNav(chrome.step),
    h("div", { class: "banner-slot" }, banner(errorBanner || view.banner)),
    h("main", { class: "screen", id: "screen", tabindex: "-1" }, view.body),
    h("div", { class: "dock" }, voiceBars(Boolean(view.voice), { listen: !view.voice || view.voice.listen !== false }), bottom));

  if (screen !== lastScreen) {
    window.scrollTo(0, 0);
    if (lastScreen !== null) document.getElementById("screen").focus({ preventScroll: true });
    lastScreen = screen;
  }

  narrate(view.voice);
}

state.subscribe(render);

async function boot() {
  voice.init();
  await Promise.all([setLang(settings.lang), loadClips()]);
  render(state.get());
  checkOngoing(ctx);
}

boot();
