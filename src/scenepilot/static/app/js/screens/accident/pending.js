// Stand-in for an accident step whose new screen is not built yet (the info and summary steps). It shows exactly what the
// server sent (server text goes in as text only) and lets the person go back to the choices.
import { h } from "../../ui/dom.js";
import { t } from "../../core/i18n.js";
import { act } from "../../flows/stage.js";

export function pendingScreen(ctx) {
  const { data } = ctx.state.get();
  const stage = data.session.stage;
  const prompt = data.prompt || {};
  const canGoBack = stage === "info" || stage === "summary";
  return {
    body: [
      h("p", { class: "eyebrow" }, t(`stage.${stage}`)),
      prompt.text ? h("h1", { class: "title" }, prompt.text) : null,
      prompt.items && prompt.items.length ? h("ol", { class: "stack" }, prompt.items.map((item) => h("li", {}, item))) : null,
      h("div", { class: "card todo-card" }, h("p", { class: "muted" }, t("pending.note", { stage }))),
    ],
    actions: canGoBack ? [{ label: t("pending.toHub"), kind: "secondary", onClick: () => act(ctx, "goto", { target: "hub" }) }] : [],
  };
}
