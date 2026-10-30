// Build elements from code, never from markup strings. Text always goes in as a text node, so nothing from the server can become markup.
// h("button", { class: "btn", onclick: fn, disabled: true }, "Label", otherNode)
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs || {})) {
    if (value === false || value == null) continue;
    if (name === "class") el.className = value;
    else if (name.startsWith("on") && typeof value === "function") el.addEventListener(name.slice(2), value);
    else el.setAttribute(name, value === true ? "" : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function mount(container, ...nodes) {
  container.replaceChildren(...nodes.flat(Infinity).filter(Boolean));
}
