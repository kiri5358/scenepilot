// Bottom sheet. openSheet() returns a promise that resolves with the value of the button the person pressed
// (or undefined when it was dismissed with Escape or a tap on the dim area).
import { h } from "./dom.js";

let current = null;

// build(close) -> an array of nodes for the inside of the sheet. Call close(value) to finish.
export function openSheet(build, { label } = {}) {
  closeSheet();
  const root = document.getElementById("sheet-root");
  const previousFocus = document.activeElement;
  const shell = document.getElementById("shell");
  const wasInert = shell?.inert;
  const previousOverflow = document.body.style.overflow;

  return new Promise((resolve) => {
    let done = false;
    const close = (value) => {
      if (done) return;
      done = true;
      document.removeEventListener("keydown", onKey, true);
      backdrop.remove();
      current = null;
      if (shell) shell.inert = Boolean(wasInert);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
      else document.getElementById("screen")?.focus({ preventScroll: true });
      resolve(value);
    };
    const onKey = (event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(undefined); }
      if (event.key === "Tab") {
        const targets = [...sheet.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')]
          .filter((element) => element.getClientRects().length);
        const first = targets[0], last = targets.at(-1);
        if (!first) { event.preventDefault(); sheet.focus(); }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === sheet)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === sheet)) { event.preventDefault(); first.focus(); }
      }
    };

    const sheet = h("div", { class: "sheet", role: "dialog", "aria-modal": "true", "aria-label": label || null, tabindex: "-1" }, build(close));
    const backdrop = h("div", { class: "sheet-backdrop", onclick: (event) => { if (event.target === backdrop) close(undefined); } }, sheet);
    document.addEventListener("keydown", onKey, true);
    root.append(backdrop);
    if (shell) shell.inert = true;
    document.body.style.overflow = "hidden";
    sheet.focus();
    current = close;
  });
}

export function closeSheet() { if (current) current(undefined); }
