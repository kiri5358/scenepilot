// Talking to the server about the accident in progress. Every action answers with the whole new view, which replaces the
// old one. When the server moves to another stage, the pieces that belonged to the old stage are cleared.
import { post, sessionPath } from "../core/api.js";
import { t } from "../core/i18n.js";
import { errorMessage } from "./accident.js";

// action: "safety-answer" | "ack-emergency" | "guide" | "skip" | "goto" | ...   body: the JSON the server expects
export async function act({ state, update }, action, body, busyKey = "busy.working") {
  const current = state.get();
  if (current.busy || !current.data) return null;
  update({ busy: t(busyKey), error: null });
  try {
    const data = await post(sessionPath(current.data.session.id, action), body);
    const patch = { data, busy: null };
    if (data.session.stage !== current.data.session.stage) Object.assign(patch, { guideItem: 0, lastPhoto: null, overlay: null });
    update(patch);
    return data;
  } catch (error) {
    update({ busy: null, error: errorMessage(error) });
    return null;
  }
}
