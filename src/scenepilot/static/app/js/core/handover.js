// Server hand-over fields describe reporting progress, separately from the six policy coverages saved on the phone.
export const HIT_STATES = ["unknown", "yes", "no"];
export const COVERAGE_STATES = ["unknown", "asked", "confirmed"];
export const CONTACT_STATES = { not_connected: "before", trying: "trying", connected: "connected", reported: "told", number_received: "told" };
export const CONTACT_CHARS = 40;
export const FOLLOWUP_CHARS = 300;
export const FOLLOWUP_MAX = 20;

export function contactBody(draft) {
  if (draft.claimNumber.length > CONTACT_CHARS || draft.agent.length > CONTACT_CHARS) throw new Error("handover.contactTooLong");
  return { state: CONTACT_STATES[draft.claimStatus] || "before", number: draft.claimNumber, agent: draft.agent };
}
export function contactPatch(draft, contact) {
  if (!contact || draft.contactDirty || draft.claimNumber || draft.agent || draft.claimStatus !== "not_connected") return {};
  const state = { before: "not_connected", trying: "trying", connected: "connected", told: "reported" }[contact.state] || "not_connected";
  return state !== "not_connected" || contact.number || contact.agent ? { claimStatus: state, claimNumber: contact.number || "", agent: contact.agent || "" } : {};
}
export function followupRows(record) {
  const rows = [...(Array.isArray(record.view?.summary?.followups) ? record.view.summary.followups : []), ...(Array.isArray(record.followups) ? record.followups : [])];
  const seen = new Set();
  return rows.filter((row) => {
    if (!row || typeof row.time !== "string" || typeof row.text !== "string") return false;
    const key = `${row.time}\n${row.text}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
