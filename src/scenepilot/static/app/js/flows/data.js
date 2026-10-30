import { h } from "../ui/dom.js";
import { openSheet } from "../ui/sheet.js";
import { t } from "../core/i18n.js";
import { getProfile, getCoverage, getRecords, replacePersonalData, clearPersonalData } from "../core/store.js";
import { createBackup, parseBackup, mergeBackup, MAX_BACKUP_BYTES } from "../core/backup.js";
import * as coachSession from "../services/coach-session.js";

export function canManageData(ctx) {
  const { mode, busy, ongoing } = ctx.state.get();
  return mode === "home" && !busy && (!ongoing || ongoing === "expired");
}
const currentData = () => ({ insurance: { profile: getProfile(), coverage: getCoverage() }, records: getRecords() });

export function downloadBackup(ctx) {
  try {
    const raw = createBackup(getProfile(), getCoverage(), getRecords());
    const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
    const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
    const link = h("a", { href: url, download: `scenepilot-backup-${day}.json` });
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { ctx.update({ error: t(error.message === "backup.tooLarge" ? "backup.tooLarge" : "backup.exportError") }); }
}

export async function restoreBackup(ctx) {
  if (!canManageData(ctx)) return;
  let backup = null, generation = 0;
  const preview = h("div", { class: "stack" });
  const message = h("p", { class: "insurance-feedback", role: "alert" });
  const replaceInsurance = h("input", { type: "checkbox" });
  const apply = h("button", { type: "button", class: "btn btn--primary btn--lg", disabled: true }, t("backup.apply"));
  const picker = h("input", { id: "backup-file", type: "file", accept: ".json,application/json", onchange: async (event) => {
    const file = event.target.files?.[0], mine = ++generation;
    backup = null; apply.disabled = true; preview.replaceChildren(); message.textContent = "";
    if (!file) return;
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error("backup.tooLarge");
      const value = parseBackup(await file.text());
      if (generation !== mine || !picker.isConnected) return;
      backup = value;
      const merged = mergeBackup(value, currentData());
      preview.replaceChildren(h("p", { class: "h2" }, t("backup.preview")), h("p", {}, file.name),
        h("p", {}, t("backup.counts", { n: value.records.length, added: merged.added, skipped: merged.skipped })),
        h("p", { class: "muted" }, [value.insurance.profile.insurer, value.insurance.profile.plate].filter(Boolean).join(" · ") || t("backup.noInsurance")),
        h("label", { class: "settings-toggle" }, h("span", {}, t("backup.replaceInsurance")), replaceInsurance),
        h("p", { class: "muted" }, t("backup.mergeNote")));
      replaceInsurance.checked = false;
      apply.disabled = false;
    } catch (error) {
      if (generation === mine && picker.isConnected) message.textContent = t(error.message === "backup.tooLarge" ? "backup.tooLarge" : "backup.invalid");
    }
  } });
  await openSheet((close) => {
    apply.addEventListener("click", () => {
      if (!backup || !canManageData(ctx)) { message.textContent = t("settings.dataBusy"); return; }
      let merged;
      try { merged = mergeBackup(backup, currentData(), replaceInsurance.checked); }
      catch { message.textContent = t("backup.tooLarge"); return; }
      if (!replacePersonalData(merged.insurance, merged.records)) { message.textContent = t("wrap.saveError"); return; }
      ctx.update({ tab: merged.records.length ? "records" : "insurance", selectedRecordId: null, recordEditing: false,
        error: null, notice: t("backup.restored", { n: merged.added }) });
      close(true);
    });
    return [h("h2", { class: "title" }, t("backup.restore")), h("p", { class: "muted" }, t("backup.fileNote")),
      h("label", { class: "insurance-field", for: "backup-file" }, h("span", {}, t("backup.file")), picker), preview, message, apply,
      h("button", { type: "button", class: "btn btn--ghost", onclick: () => close(false) }, t("insurance.cancel"))];
  }, { label: t("backup.restore") });
  generation++;
}

export async function clearDeviceData(ctx) {
  if (!canManageData(ctx)) return;
  const confirmed = await openSheet((close) => [
    h("h2", { class: "title" }, t("settings.clearTitle")), h("p", {}, t("settings.clearNote")),
    h("p", { class: "muted" }, t("settings.clearLimit")),
    h("button", { type: "button", class: "btn btn--primary btn--lg", onclick: () => close(false) }, t("insurance.cancel")),
    h("button", { type: "button", class: "btn btn--secondary", onclick: () => close(true) }, t("settings.clearConfirm")),
  ], { label: t("settings.clearTitle") });
  if (confirmed !== true || !canManageData(ctx)) return;
  coachSession.forget();
  const ok = clearPersonalData();
  ctx.update({ data: null, ongoing: null, overlay: null, tab: "home", selectedRecordId: null, recordEditing: false,
    insuranceNotice: false, recordNotice: false, error: ok ? null : t("settings.clearError"), notice: ok ? t("settings.cleared") : null });
}
