// Screen id -> function. A screen returns { body: [nodes], actions?: [buttons], actionsRow?, actionsEqual?, tone?, voice?,
// banner?, appbar?, live?, onBack?, bare?, strip?, focusKey? }.
// Ids match core/router.js: "home.<tab>", "accident.<server stage>", "coach.<overlay>".
// An id without an entry falls back to a stand-in, so a screen that is not built yet never breaks the page.
import { homeScreen } from "./home/home.js";
import { insuranceScreen } from "./home/insurance.js";
import { onboardingScreen } from "./home/onboarding.js";
import { recordsScreen } from "./home/records.js";
import { leaveScreen } from "./accident/leave.js";
import { callprepScreen } from "./accident/callprep.js";
import { placeholderScreen } from "./home/placeholder.js";
import { safetyScreen } from "./accident/safety.js";
import { emergencyScreen } from "./accident/emergency.js";
import { guideScreen } from "./accident/guide.js";
import { photosScreen } from "./accident/photos.js";
import { hubScreen } from "./accident/hub.js";
import { askScreen } from "./accident/ask.js";
import { pendingScreen } from "./accident/pending.js";
import { coachSetupScreen } from "./coach/setup.js";
import { coachScreen } from "./coach/coach.js";
import { dangerScreen } from "./coach/danger.js";
import { myCardScreen } from "./coach/my-card.js";
import { noTalkScreen } from "./coach/no-talk.js";
import { coachPlaceholder } from "./coach/placeholder.js";

const SCREENS = {
  "home.home": homeScreen,
  "home.onboarding": onboardingScreen,
  "home.insurance": insuranceScreen,
  "home.records": recordsScreen,
  "accident.safety": safetyScreen,
  "accident.emergency": emergencyScreen,
  "accident.guide": guideScreen,
  "accident.photos": photosScreen,
  "accident.hub": hubScreen,
  "accident.ask": askScreen,
  "accident.summary": leaveScreen,
  "accident.call-prep": callprepScreen,
  "coach.coach-setup": coachSetupScreen,
  "coach.coach": coachScreen,
  "coach.coach-danger": dangerScreen,
  "coach.my-card": myCardScreen,
  "coach.no-talk": noTalkScreen,
};

export function getScreen(id) {
  if (SCREENS[id]) return SCREENS[id];
  if (id.startsWith("home.")) return placeholderScreen("home");
  if (id.startsWith("coach.")) return coachPlaceholder;
  return pendingScreen;
}
