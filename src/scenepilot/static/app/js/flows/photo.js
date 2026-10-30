// Sending one photo to the server. The phone shrinks it first (phones take very large pictures), and the server decides
// whether it is good enough: the AI only describes what it sees, the checklist rules pass or reject.
import { api, sessionPath } from "../core/api.js";
import { t, getLang } from "../core/i18n.js";
import { errorMessage } from "./accident.js";

export async function shrink(file, max = 1280) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob || file;
  } catch {
    return file;   // if decoding fails, send the original (the server may reject the format)
  }
}

export async function uploadPhoto({ state, update }, file) {
  const current = state.get();
  if (current.busy || !current.data) return;
  const itemId = current.data.prompt.item_id;
  update({ busy: t("photos.checking"), error: null, lastPhoto: null });
  try {
    const blob = await shrink(file);
    const form = new FormData();
    form.append("file", blob, "photo.jpg");
    const data = await api(`${sessionPath(current.data.session.id, "photo")}?language=${getLang()}`, { method: "POST", body: form });
    update({
      data, busy: null,
      lastPhoto: { itemId, accepted: data.verdict.accepted, message: data.verdict.message, observations: (data.analysis && data.analysis.observations) || [] },
    });
  } catch (error) {
    update({ busy: null, error: errorMessage(error) });
  }
}
