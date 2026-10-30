// After the required photos: talk with the other driver, take more photos, or wrap up.
import { h } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { chip } from "../../ui/chip.js";
import { t } from "../../core/i18n.js";
import { extraLeft, finishedCore } from "../../core/photos.js";
import { HUB_COMMANDS } from "../../core/commands.js";
import { act } from "../../flows/stage.js";
import { matchCommand } from "../../services/voice.js";
import { openSteps } from "./steps-sheet.js";

function option({ icon: iconName, title, sub, main = false, disabled = false, onClick }) {
  return h("button", { type: "button", class: main ? "option option--main" : "option", disabled: disabled ? true : null, onclick: onClick },
    h("span", { class: "option-icon" }, icon(iconName)),
    h("span", {}, h("p", { class: "option-title" }, title), h("p", { class: "option-sub" }, sub)));
}

export function hubScreen(ctx) {
  const { data, busy } = ctx.state.get();
  const prompt = data.prompt;
  const left = extraLeft(data.photo_progress);

  const startTalk = () => ctx.update({ overlay: "coach-setup" });
  const morePhotos = () => { if (left > 0) act(ctx, "goto", { target: "photos" }); };
  const finish = () => act(ctx, "goto", { target: "summary" });
  const ask = () => ctx.update({ overlay: "ask" });

  return {
    body: [
      h("div", { class: "chips" }, finishedCore(data.checklist).map((slot) => chip(slot.status === "skipped" ? "skipped" : "ok", { label: slot.title }))),
      h("h1", { class: "hub-title" }, t("hub.title")),
      h("p", { class: "sub" }, prompt.text),
      option({ icon: "ear", title: t("hub.coach"), sub: t("hub.coachSub"), main: true, disabled: Boolean(busy), onClick: startTalk }),
      option({ icon: "camera", title: t("hub.more"), sub: left > 0 ? t("hub.moreSub", { n: left }) : t("hub.moreNone"), disabled: Boolean(busy) || left === 0, onClick: morePhotos }),
      option({ icon: "check", title: t("hub.finish"), sub: t("hub.finishSub"), disabled: Boolean(busy), onClick: finish }),
    ],
    actionsEqual: true,
    actions: [
      { label: t("hub.ask"), icon: "question", kind: "secondary", disabled: Boolean(busy), onClick: ask },
      { label: t("stepsheet.button"), icon: "list", kind: "secondary", disabled: Boolean(busy), onClick: () => openSteps(ctx) },
    ],
    voice: {
      key: `hub:${left}`,
      say: [prompt.text],
      hint: t("listen.hint.hub"),
      parse: (text) => matchCommand(text, HUB_COMMANDS),
      run: (command) => {
        if (command === "coach") startTalk();
        else if (command === "photos") morePhotos();
        else if (command === "finish") finish();
        else if (command === "ask") ask();
      },
    },
  };
}
