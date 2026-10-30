// What the photo screen shows for each checklist slot. Pure functions: no DOM.
// slot: { id, title, status: "pending" | "captured" | "needs_retake" | "skipped", core: boolean } from the server.

// The chip under a slot. labelKey null means "use the chip's own words".
export function slotChip(slot, currentId) {
  if (slot.status === "captured") return { kind: "ok", labelKey: null };
  if (slot.status === "skipped") return { kind: "skipped", labelKey: "photos.slot.skipped" };
  if (slot.status === "needs_retake") return { kind: "heard", labelKey: "photos.slot.retake" };
  if (slot.id === currentId) return { kind: "heard", labelKey: "photos.slot.now" };
  return { kind: "unknown", labelKey: slot.core ? "photos.slot.wait" : "photos.slot.optional" };
}

// "Required photo 2 of 3" or, after the required ones, "Extra photo 1 of 3". progress comes from the server.
export function photoPosition(progress) {
  if (progress.extra_mode) {
    const total = Math.max(1, progress.extra_total);
    return { key: "photos.kick.extra", n: Math.min(progress.extra_done + 1, total), total };
  }
  const total = Math.max(1, progress.core_total);
  return { key: "photos.kick.core", n: Math.min(progress.core_done + 1, total), total };
}

// The example picture for a photo slot (the names are in assets/illustrations.js). Slots with none show no example.
const EXAMPLES = { other_vehicle: "plate", damage: "damage", scene_wide: "scene", own_vehicle: "side" };
export const exampleFor = (itemId) => EXAMPLES[itemId] || null;

// Why a photo is skipped. What the server stores is always Korean (its summary is Korean); labelKey is what the person reads.
export const SKIP_REASONS = [
  { labelKey: "photos.skip.safety", send: "안전하지 않아서 찍지 않았어요" },
  { labelKey: "photos.skip.refused", send: "상대가 거절했어요" },
  { labelKey: "photos.skip.na", send: "해당 없어요" },
];

// Extra photos still to take (the server's own count of unresolved extras).
export const extraLeft = (progress) => Math.max(0, progress.extra_total - progress.extra_done);

// The required photos that are done, for the summary chips on the hub screen.
export const finishedCore = (checklist) => checklist.filter((slot) => slot.core && (slot.status === "captured" || slot.status === "skipped"));
