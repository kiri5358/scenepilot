import { displayState } from "../../core/display.js";
// What to do now. The first server step is a list of sentences, shown one at a time; the steps after it are notes
// (one card each, with their sources). All wording comes from the server.
import { h } from "../../ui/dom.js";
import { t } from "../../core/i18n.js";
import { guideNext, guidePrev, guideState, pictureFor } from "../../core/guide.js";
import { picture, pictureThumb } from "../../ui/icons.js";
import { act } from "../../flows/stage.js";
import { commandTable, matchCommand } from "../../services/voice.js";
import { repeat } from "../../services/narrator.js";
import { openExchangeSheet } from "./exchange-sheet.js";

const LAST_ITEM = Number.MAX_SAFE_INTEGER;   // "the end of the list"; the state clamps it

function noteCard(view) {
  return h("div", { class: "task" },
    h("h1", { class: "task-text" }, view.title),
    h("p", { class: "note-text" }, view.text),
    view.sources.length ? h("div", {},
      h("p", { class: "eyebrow" }, t("guide.sources")),
      h("ul", { class: "sources" }, view.sources.map((source) => h("li", {},
        h("a", { href: source.url, target: "_blank", rel: "noopener noreferrer" }, source.version ? `${source.title} (${source.version})` : source.title))))) : null,
    view.disclaimer ? h("p", { class: "muted" }, view.disclaimer) : null);
}

function itemCard(view) {
  const name = pictureFor(view.text);
  return h("div", { class: "task" },
    name ? picture(name, t(`illus.${name}`)) : null,
    h("div", { class: "task-row" },
      h("span", { class: "task-num" }, view.index + 1),
      h("p", { class: "task-text" }, view.text)));
}

export function guideScreen(ctx) {
  const { data, guideItem } = displayState(ctx);
  const prompt = data.prompt;
  const view = guideState(prompt, guideItem);

  const goNext = () => {
    const step = guideNext(prompt, guideItem);
    if (step.local !== undefined) ctx.update({ guideItem: step.local });
    else act(ctx, "guide", { action: "next" });
  };
  const goPrev = async () => {
    const step = guidePrev(prompt, guideItem);
    if (!step) return;
    if (step.local !== undefined) { ctx.update({ guideItem: step.local }); return; }
    const result = await act(ctx, "guide", { action: "back" });
    if (result && step.toLastItem) ctx.update({ guideItem: LAST_ITEM });
  };
  const skip = () => act(ctx, "guide", { action: "skip" });

  const kicker = view.kind === "item" ? prompt.text : t("guide.noteKick", { n: view.noteNo, total: view.noteTotal });
  const body = [
    h("p", { class: "eyebrow" }, kicker, view.kind === "item" ? ` ${t("guide.total", { pos: view.index + 1, total: view.total })}` : ""),
    view.kind === "item"
      ? h("div", { class: "dots", "aria-hidden": "true" }, view.items.map((_, i) => h("span", { class: i <= view.index ? "on" : "" })))
      : null,
    view.kind === "item" ? itemCard(view) : noteCard(view),
    // the step that says to exchange names, phone numbers, insurers and plates: type them in right here
    view.kind === "item" && pictureFor(view.text) === "exchange"
      ? h("button", { type: "button", class: "btn btn--secondary", onclick: () => openExchangeSheet(ctx) }, t("exchange.open")) : null,
  ];
  if (view.kind === "item") {
    body.push(h("details", { class: "card" },
      h("summary", {}, t("guide.all")),
      h("div", { class: "rows" }, view.items.map((text, i) => {
        const name = pictureFor(text);
        return h("button", {
          type: "button", class: "rowbtn", "aria-current": i === view.index ? "true" : null, onclick: () => ctx.update({ guideItem: i }),
        }, name ? h("span", { class: "thumb-sm" }, pictureThumb(name)) : h("span", { class: "task-num" }, i + 1), text);
      })),
      h("button", { type: "button", class: "btn btn--ghost", onclick: skip }, t("guide.skip"))));
  }

  const say = view.kind === "item"
    ? (view.index === 0 ? [prompt.text, view.text] : [view.text])
    : [view.title];
  const sayFull = view.kind === "item" ? say : [view.title, view.text];

  return {
    body,
    actionsRow: true,
    actions: [
      { label: view.isLast ? t("guide.toPhotos") : t("guide.next"), kind: "primary", onClick: goNext },
      { label: t("guide.prev"), kind: "secondary", disabled: view.kind === "item" && view.isFirst, onClick: goPrev },
    ],
    voice: {
      key: `guide:${prompt.step_index}:${view.kind === "item" ? view.index : "note"}`,
      say, sayFull,
      hint: t("listen.hint.guide"),
      parse: (text) => matchCommand(text, commandTable("guide")),
      run: (command) => {
        if (command === "next") goNext();
        else if (command === "back") goPrev();
        else if (command === "skip") skip();
        else if (command === "repeat") repeat();
        else if (command === "ask") ctx.update({ overlay: "ask" });
      },
    },
  };
}
