// Details of the other driver (name and phone, insurer, plate, vehicle). The server only lets them be typed or confirmed
// in its "details" stage, but the talk coaching happens while the server is at the choice screen. So these steps go to
// the details stage for a moment and come straight back, and the screen the person is looking at does not change.
import { api, post, sessionPath } from "../core/api.js";
import { errorMessage } from "./accident.js";
import { t } from "../core/i18n.js";

async function throughDetailsStage({ state, update }, action, body) {
  const current = state.get();
  if (!current.data || current.busy) return false;
  const id = current.data.session.id;
  const stage = current.data.session.stage;
  let moved = false;
  update({ busy: t("busy.working"), error: null });
  try {
    // During the guide and the photos the server takes the details as they are (there is no way to its details stage yet)
    if (stage === "guide" || stage === "photos") {
      await post(sessionPath(id, action), body);
      update({ data: await api(sessionPath(id)), busy: null });
      return true;
    }
    if (stage !== "info") { await post(sessionPath(id, "goto"), { target: "info" }); moved = true; }
    await post(sessionPath(id, action), body);
    const data = moved ? await post(sessionPath(id, "goto"), { target: stage === "summary" ? "summary" : "hub" }) : await api(sessionPath(id));
    update({ data, busy: null });
    return true;
  } catch (error) {
    if (moved) { try { update({ data: await post(sessionPath(id, "goto"), { target: stage === "summary" ? "summary" : "hub" }) }); } catch { /* the next action will show it */ } }
    update({ busy: null, error: errorMessage(error) });
    return false;
  }
}

// The person typed (or corrected) a detail: it counts as confirmed.
export const setInfoValue = (ctx, field, value) => throughDetailsStage(ctx, "info", { field, value });

// The person said "that is right" to something the AI heard.
export const confirmInfoValue = (ctx, field) => throughDetailsStage(ctx, "info/confirm", { field });
