// Screen id -> function. A screen returns { body: [nodes], actions?: [buttons], actionsRow?, tone?, voice?, banner? }.
// Ids match core/router.js: "home.<tab>", "accident.<server stage>", "coach.<overlay>".
// An id without an entry falls back to a stand-in, so a screen that is not built yet never breaks the page.
import { homeScreen } from "./home/home.js";
import { placeholderScreen } from "./home/placeholder.js";
import { safetyScreen } from "./accident/safety.js";
import { emergencyScreen } from "./accident/emergency.js";
import { guideScreen } from "./accident/guide.js";
import { photosScreen } from "./accident/photos.js";
import { hubScreen } from "./accident/hub.js";
import { askScreen } from "./accident/ask.js";
import { pendingScreen } from "./accident/pending.js";
import { coachPlaceholder } from "./coach/placeholder.js";

const SCREENS = {
  "home.home": homeScreen,
  "home.insurance": placeholderScreen("insurance"),
  "home.records": placeholderScreen("records"),
  "accident.safety": safetyScreen,
  "accident.emergency": emergencyScreen,
  "accident.guide": guideScreen,
  "accident.photos": photosScreen,
  "accident.hub": hubScreen,
  "accident.ask": askScreen,
};

export function getScreen(id) {
  if (SCREENS[id]) return SCREENS[id];
  if (id.startsWith("home.")) return placeholderScreen("home");
  if (id.startsWith("coach.")) return coachPlaceholder;
  return pendingScreen;
}
