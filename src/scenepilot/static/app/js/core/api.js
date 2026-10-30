// Calls to the server. The server decides stages, wording and verdicts; the screens only show what comes back.

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function api(path, options) {
  let res;
  try {
    res = await fetch(path, options);
  } catch {
    throw new ApiError("network", 0);
  }
  let body = null;
  try { body = await res.json(); } catch { /* the body may not be JSON */ }
  if (!res.ok) {
    const detail = body && body.detail;
    throw new ApiError(typeof detail === "string" ? detail : `request failed (${res.status})`, res.status);
  }
  return body;
}

export const post = (path, json) => api(path, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(json ?? {}),
});

// Which message goes with a failed call. 404 on a session means the server no longer knows it: it keeps sessions in memory,
// so a restart or a redeploy (or the free host going to sleep) removes them while the phone still remembers the id.
export function errorKey(error) {
  if (error instanceof ApiError) {
    if (error.status === 0) return "err.network";
    if (error.status === 429) return "err.busy";
    if (error.status === 404) return "err.sessionLost";
  }
  return "err.server";
}

export const sessionPath = (id, action = "") => `/api/sessions/${encodeURIComponent(id)}${action ? "/" + action : ""}`;

// The app is the Korea edition only: sessions are always country KR.
export const COUNTRY = "KR";

// Start an accident. The person has already agreed on this phone, so the consent step is passed on their behalf.
export async function startSession() {
  let data = await post("/api/sessions", { country: COUNTRY });
  if (data.session.stage === "consent") data = await post(sessionPath(data.session.id, "consent"));
  return data;
}

export const getSession = (id) => api(sessionPath(id));
