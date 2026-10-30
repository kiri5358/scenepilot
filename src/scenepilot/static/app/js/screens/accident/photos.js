// Photos: one slot at a time. The AI describes the photo, the server's checklist rules pass it or ask for a retake.
// The wording of the instruction, the warning and the retake reason is the server's.
import { h } from "../../ui/dom.js";
import { icon, photoExample } from "../../ui/icons.js";
import { chip } from "../../ui/chip.js";
import { openSheet } from "../../ui/sheet.js";
import { t } from "../../core/i18n.js";
import { SKIP_REASONS, exampleFor, photoPosition, slotChip } from "../../core/photos.js";
import { act } from "../../flows/stage.js";
import { uploadPhoto } from "../../flows/photo.js";

function picker(ctx, id, capture) {
  return h("input", {
    type: "file", accept: "image/*", capture: capture ? "environment" : null, id, class: "hidden-input", tabindex: "-1",
    onchange: (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (file) uploadPhoto(ctx, file);
    },
  });
}

function resultCard(ctx, view) {
  const { busy, lastPhoto } = ctx.state.get();
  if (busy) return h("div", { class: "photo-result photo-result--busy", role: "status" }, busy);
  if (!lastPhoto || !lastPhoto.accepted) return null;
  const slot = view.checklist.find((s) => s.id === lastPhoto.itemId);
  return h("div", { class: "photo-result photo-result--ok", role: "status" },
    icon("check", "ico--sm"),
    h("div", {},
      h("strong", {}, slot ? `${slot.title} · ${t("photos.pass")}` : t("photos.pass")),
      lastPhoto.observations.length ? h("ul", {}, lastPhoto.observations.map((line) => h("li", {}, line))) : null,
      h("span", { class: "tag" }, t("photos.aiNote"))));
}

// The place to take the photo: a pale example of the shot (when there is one) with the camera button over it.
function shotBox({ example, isPlate, busy, camera, album }) {
  const takeButton = h("button", {
    type: "button", class: example ? "btn btn--amber btn--lg shot-take" : "btn btn--amber btn--lg", disabled: busy ? true : null, onclick: () => camera.click(),
  }, icon("camera"), t("photos.take"));
  const albumButton = h("button", { type: "button", class: "btn btn--secondary", disabled: busy ? true : null, onclick: () => album.click() }, icon("image"), t("photos.pick"));

  if (!example) {
    return h("div", { class: "shot" }, h("span", { class: "shot-icon" }, icon("camera")), takeButton, albumButton, camera, album);
  }
  return h("div", { class: "shot-wrap" },
    h("div", { class: "shot shot--example" },
      photoExample(example, { className: "shot-img", label: t(`illus.photo.${example}`) }),
      h("span", { class: "shot-tag" }, t("photos.example")),
      isPlate ? h("div", { class: "plate-frame", "aria-hidden": "true" }, h("span", { class: "plate-label" }, t("photos.plateFrame"))) : null,
      takeButton),
    albumButton, camera, album);
}

async function askSkipReason(ctx) {
  const reason = await openSheet((close) => [
    h("h2", { class: "title" }, t("photos.skip.title")),
    h("div", { class: "stack" },
      SKIP_REASONS.map((r) => h("button", { type: "button", class: "btn btn--secondary btn--lg", onclick: () => close(r.send) }, t(r.labelKey))),
      h("button", { type: "button", class: "btn btn--ghost", onclick: () => close(undefined) }, t("photos.skip.cancel"))),
  ], { label: t("photos.skip.title") });
  if (reason) act(ctx, "skip", { reason });
}

export function photosScreen(ctx) {
  const view = ctx.state.get().data;
  const { busy } = ctx.state.get();
  const prompt = view.prompt;
  const position = photoPosition(view.photo_progress);
  const camera = picker(ctx, "photo-camera", true);
  const album = picker(ctx, "photo-album", false);
  const example = exampleFor(prompt.item_id);

  const body = [
    h("p", { class: "eyebrow" }, t(position.key, { n: position.n, total: position.total })),
    prompt.retake_message
      ? h("div", { class: "photo-result photo-result--retake", role: "status" }, icon("alert", "ico--sm"),
        h("div", {}, h("strong", {}, t("photos.retakeTitle")), h("div", {}, prompt.retake_message)))
      : null,
    h("h1", { class: "photo-title" }, prompt.text),   // the server's warning (when there is one) is read aloud; the line above already says it
    shotBox({ example, isPlate: prompt.item_id === "other_vehicle", busy, camera, album }),
    resultCard(ctx, view),
    h("ul", { class: "grid", "aria-label": t("photos.grid") }, view.checklist.map((slot) => {
      const state = slotChip(slot, prompt.item_id);
      const thumbName = exampleFor(slot.id);
      return h("li", { class: slot.id === prompt.item_id ? "slot slot--now" : "slot" },
        thumbName ? h("span", { class: "thumb" }, photoExample(thumbName, { className: "thumb-img" })) : null,
        h("p", { class: "slot-name" }, slot.title),
        chip(state.kind, state.labelKey ? { label: t(state.labelKey) } : undefined));
    })),
  ];

  const items = [{ label: t("photos.skip"), kind: "secondary", disabled: Boolean(busy), onClick: () => askSkipReason(ctx) }];
  if (view.photo_progress.extra_mode && view.photo_progress.core_done >= view.photo_progress.core_total) {
    items.push({ label: t("photos.later"), kind: "secondary", disabled: Boolean(busy), onClick: () => act(ctx, "goto", { target: "hub" }) });
  }

  return {
    body,
    actions: items,
    actionsRow: true,
    voice: {
      key: `photos:${prompt.item_id}:${prompt.retake_message || ""}:${view.checklist.map((s) => s.status).join("")}`,
      say: [prompt.text, prompt.warning, prompt.retake_message].filter(Boolean),
      listen: false,
      hint: t("listen.hint.photos"),
      parse: () => null,
      run: () => {},
    },
  };
}
