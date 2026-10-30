// Bottom sheet. openSheet() returns a promise that resolves with the value of the button the person pressed
// (or undefined when it was dismissed with Escape or a tap on the dim area).
import { h } from "./dom.js";

let current = null;

// build(close) -> an array of nodes for the inside of the sheet. Call close(value) to finish.
export function openSheet(build, { label } = {}) {
  closeSheet();
  const root = document.getElementById("sheet-root");
  const previousFocus = document.activeElement;

  return new Promise((resolve) => {
    let done = false;
    const close = (value) => {
      if (done) return;
      done = true;
      document.removeEventListener("keydown", onKey, true);
      backdrop.remove();
      current = null;
      if (previousFocus && previousFocus.focus) previousFocus.focus();
      resolve(value);
    };
    const onKey = (event) => { if (event.key === "Escape") { event.stopPropagation(); close(undefined); } };

    const sheet = h("div", { class: "sheet", role: "dialog", "aria-modal": "true", "aria-label": label || null, tabindex: "-1" }, build(close));
    const backdrop = h("div", { class: "sheet-backdrop", onclick: (event) => { if (event.target === backdrop) close(undefined); } }, sheet);
    document.addEventListener("keydown", onKey, true);
    root.append(backdrop);
    sheet.focus();
    current = close;
  });
}

export function closeSheet() { if (current) current(undefined); }
