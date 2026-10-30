// "Steps": jump to something else from the choice screen. The server only allows photos / details / summary from the
// choice screen, so this sheet is offered there; talking and asking are screens of this app and work anywhere.
import { h } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { openSheet } from "../../ui/sheet.js";
import { t } from "../../core/i18n.js";
import { extraLeft } from "../../core/photos.js";
import { act } from "../../flows/stage.js";

export async function openSteps(ctx) {
  const { data } = ctx.state.get();
  const left = extraLeft(data.photo_progress);
  const choice = await openSheet((close) => [
    h("h2", { class: "title" }, t("stepsheet.title")),
    h("div", { class: "stack" },
      left > 0 ? row("camera", t("stepsheet.photos"), () => close("photos")) : null,
      row("ear", t("stepsheet.talk"), () => close("talk")),
      row("question", t("stepsheet.ask"), () => close("ask")),
      row("check", t("stepsheet.finish"), () => close("finish")),
      h("button", { type: "button", class: "btn btn--ghost", onclick: () => close(undefined) }, t("settings.close"))),
  ], { label: t("stepsheet.title") });

  if (choice === "photos") act(ctx, "goto", { target: "photos" });
  else if (choice === "talk") ctx.update({ overlay: "coach-setup" });
  else if (choice === "ask") ctx.update({ overlay: "ask" });
  else if (choice === "finish") act(ctx, "goto", { target: "summary" });
}

function row(iconName, label, onClick) {
  return h("button", { type: "button", class: "btn btn--secondary btn--lg", onclick: onClick }, icon(iconName), label);
}
