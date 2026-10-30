// Start-up and drawing. Everything on screen is rebuilt from the state, as in the older UI.
import { createState } from "./core/state.js";
import { resolve, showSos, stepStates, TABS } from "./core/router.js";
import { setLang, t } from "./core/i18n.js";
import { getCoachPrefs, getSettings, getSessionId, hasOnboarding } from "./core/store.js";
import { h, mount } from "./ui/dom.js";
import { appbar } from "./ui/appbar.js";
import { tabbar } from "./ui/tabbar.js";
import { actions } from "./ui/actions.js";
import { banner } from "./ui/banner.js";
import { voiceBars } from "./ui/voicebar.js";
import { getScreen } from "./screens/index.js";
import { openSettings } from "./screens/home/settings.js";
import { checkOngoing, leaveToHome } from "./flows/accident.js";
import { loadClips, warmClips } from "./services/speak.js";
import { narrate } from "./services/narrator.js";
import * as voice from "./services/voice.js";
import * as coachSession from "./services/coach-session.js";

// The overlays during which the phone keeps listening to the talk.
const LISTENING_OVERLAYS = ["coach", "my-card"];

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
  coachPrefs: getCoachPrefs(),   // how coaching is received: { mode: "screen" | "ear", ai: boolean }
  coachProtocol: null,
  coach: { status: "paused", hint: null, danger: null, aiError: false },   // the talk coaching in progress
  cardMsg: true,       // show "I would like to handle this through insurance" on the card shown to the other driver
  cardReturnOverlay: null,   // the screen to return to after showing the other driver our card
  insuranceNotice: false,   // a successful save on the insurance screen
  callPhase: "prep",       // insurer call preparation or results
  selectedRecordId: null,
  recordEditing: false,
  recordNotice: false,
  notice: null,
  onboardingOpen: !hasOnboarding() && !getSessionId(),
  onboardingStep: 0,
  onboardingRun: 0,
  onboardingMic: "idle",
  consentAccepted: false,
  noTalkRefused: false,   // on the "no talk" screen: the other driver does not give their details
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
    : s.notice ? { kind: "info", message: s.notice, actionLabel: t("action.dismiss"), onAction: () => state.update({ notice: null }) } : null;

  const bottom = chrome.tabbar
    ? tabbar({ tabs: TABS, current: s.tab, onSelect: (tab) => state.update({ tab, selectedRecordId: null, recordNotice: false, recordEditing: false }) })
    : actions(view.actions, { row: view.actionsRow, equal: view.actionsEqual });

  if (view.tone) shell.dataset.tone = view.tone;
  else delete shell.dataset.tone;

  // The talk is only listened to while its own screens are open.
  if (coachSession.isRunning() && !(s.mode === "accident" && LISTENING_OVERLAYS.includes(s.overlay))) coachSession.stop({ quiet: true });

  const barVariant = view.appbar || chrome.appbar;
  mount(shell,
    view.bare ? null : appbar({
      variant: barVariant,
      showSos: showSos(s.sos, barVariant === "home" ? "home" : "accident"),
      onBack: view.onBack || (() => leaveToHome(ctx)),
      onSettings: ctx.openSettings,
      live: view.live,
    }),
    chrome.step === null || view.bare ? null : stepsNav(chrome.step),
    h("div", { class: "banner-slot" }, banner(errorBanner || view.banner)),
    h("main", { class: "screen", id: "screen", tabindex: "-1" }, view.body),
    h("div", { class: "dock" }, voiceBars(Boolean(view.voice), { listen: !view.voice || view.voice.listen !== false }), view.strip, bottom));

  const focusKey = view.focusKey || screen;
  if (focusKey !== lastScreen) {
    window.scrollTo(0, 0);
    if (lastScreen !== null) document.getElementById("screen").focus({ preventScroll: true });
    lastScreen = focusKey;
  }

  narrate(view.voice);
}

state.subscribe(render);

async function boot() {
  await Promise.all([setLang(settings.lang), loadClips()]);
  voice.init();
  render(state.get());
  checkOngoing(ctx);
  setTimeout(() => warmClips(), 2500);   // after the first screen: keep the spoken clips ready so sentences follow each other without pauses
  coachSession.loadProtocol().then((coachProtocol) => state.update({ coachProtocol })).catch(() => {});
}

boot();
