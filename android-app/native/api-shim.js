// App only. The web UI calls the server with paths like "/api/sessions". Inside the app those would point at the phone
// itself, so this adds the server's address in front (set by SCENEPILOT_API_BASE when the app is built).
"use strict";
(() => {
  const base = String(window.SCENEPILOT_API_BASE || "").replace(/\/+$/, "");
  if (!base) return;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => (typeof input === "string" && input.startsWith("/") ? nativeFetch(base + input, init) : nativeFetch(input, init));
})();
