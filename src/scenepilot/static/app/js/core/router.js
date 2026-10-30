// Which screen to show, and what the page frame around it looks like. Pure functions: no DOM, so node can test them.
//
// Home mode: three tabs (home, insurance, records), app bar with the brand, tab bar at the bottom.
// Accident mode: the server's stage decides the screen; app bar with "back to home" and the step indicator on top.
// An overlay (for example the talk-coaching screens) sits on top of the stage's screen.

export const TABS = ["home", "insurance", "records"];

// The five steps shown during an accident, in order.
export const STEPS = ["safety", "guide", "photos", "coach", "wrap"];

// Server stage -> index in STEPS. The consent stage is passed before the first screen, so it counts as the first step.
// The choice screen after the required photos (hub) is where the talk with the other driver starts, so it is the "talk"
// step, as in the mockup.
export const STAGE_STEP = {
  consent: 0, safety: 0, emergency: 0,
  guide: 1,
  photos: 2,
  hub: 3,
  info: 4, summary: 4,
};

// Overlay -> index in STEPS (screens that are not a server stage).
export const OVERLAY_STEP = { "coach-setup": 3, coach: 3, "coach-danger": 3, "my-card": 3, "no-talk": 3, leave: 4, "call-prep": 4 };

export function stepIndex({ stage, overlay }) {
  if (overlay && overlay in OVERLAY_STEP) return OVERLAY_STEP[overlay];
  return stage in STAGE_STEP ? STAGE_STEP[stage] : 0;
}

export function stepStates(index) {
  return STEPS.map((id, i) => ({ id, state: i < index ? "done" : i === index ? "current" : "todo" }));
}

// Overlays that are not part of the talk coaching have their own screen id.
const OVERLAY_SCREEN = { ask: "accident.ask", leave: "accident.summary", "call-prep": "accident.call-prep" };
const overlayScreen = (overlay) => OVERLAY_SCREEN[overlay] || `coach.${overlay}`;

// state: { mode: "home" | "accident", tab, overlay, data }  (data is the server's last view, or null)
export function resolve(state) {
  if (state.mode === "home" && state.onboardingOpen) return { screen: "home.onboarding", chrome: { appbar: "home", tabbar: false, step: null } };
  if (state.mode === "accident" && state.data) {
    const stage = state.data.session.stage;
    return {
      screen: state.overlay ? overlayScreen(state.overlay) : `accident.${stage}`,
      chrome: { appbar: "accident", tabbar: false, step: stepIndex({ stage, overlay: state.overlay }) },
    };
  }
  const tab = TABS.includes(state.tab) ? state.tab : "home";
  return { screen: `home.${tab}`, chrome: { appbar: "home", tabbar: true, step: null } };
}

// Should the 119 / 112 buttons be in the top bar? setting: "always" | "accident" | "hidden".
export function showSos(setting, appbar) {
  if (setting === "hidden") return false;
  if (setting === "accident") return appbar === "accident";
  return true;
}
