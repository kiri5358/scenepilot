// A display-only projection. Actions and persistence always receive the original ctx/state.
// User statements, names, plates, contact fields, transcripts and later notes are never translated.
import { getLang, serverText as tr } from "./i18n.js";

const strings = (value) => Array.isArray(value) ? value.map((text) => tr(text)) : value;
const source = (s) => ({ ...s, title: tr(s.title), version: tr(s.version) });
export function displayPlan(plan) {
  return plan ? { ...plan, text: tr(plan.text), say: tr(plan.say) } : plan;
}
export function displayCallLine(line, data) {
  if (getLang() !== "en") return line;
  let match = line.match(/^현장 사진은 (\d+)장 찍었고, 사진 분석은 참고용입니다\.$/);
  if (match) return `I took ${match[1]} scene photos. Photo analysis is for reference only.`;
  match = line.match(/^부딪힌 대상은 (.+)입니다\.$/);
  if (match) return `What was hit: ${match[1].split(", ").map((s) => tr(s)).join(", ")}.`;
  if (/^(상대 차량번호|상대 보험사)는 /.test(line)) {
    const info = data.session.info || {};
    return [["other_plate", "Other vehicle’s plate"], ["other_insurance", "Other driver’s insurer"]]
      .filter(([id]) => info[id]?.confirmed).map(([id, label]) => `${label}: ${info[id].value}`).join(". ");
  }
  return tr(line);
}
export function displaySummary(summary) {
  if (!summary || getLang() !== "en") return summary;
  const fixedSections = ["기본 정보", "부상과 응급 상황", "사진"];
  return { ...summary,
    sections: (summary.sections || []).map((section) => ({ ...section, title: tr(section.title),
      items: (section.items || []).map((item) => ({ ...item, label: tr(item.label),
        // Only rule-produced values are translated. Free AI observations and personal values stay verbatim.
        value: fixedSections.includes(section.title) || / - 눈에 보이는 손상$/.test(item.label) ? fixedValue(item.value) : item.value,
      })) })),
    disclaimer: tr(summary.disclaimer), leave_check: strings(summary.leave_check), next_steps: strings(summary.next_steps), cleanup: tr(summary.cleanup),
    hit_rows: summary.hit_rows?.map((row) => ({ ...row, label: tr(row.label), state_label: tr(row.state_label) })),
    coverage_rows: summary.coverage_rows?.map((row) => ({ ...row, label: tr(row.label), state_label: tr(row.state_label) })),
    contact: summary.contact ? { ...summary.contact, title: tr(summary.contact.title), note: tr(summary.contact.note),
      state_label: tr(summary.contact.state_label), warning: tr(summary.contact.warning),
      states: Object.fromEntries(Object.entries(summary.contact.states || {}).map(([key, value]) => [key, tr(value)])) } : summary.contact,
    uninsured: summary.uninsured ? { ...summary.uninsured, title: tr(summary.uninsured.title), lines: strings(summary.uninsured.lines), source: source(summary.uninsured.source) } : summary.uninsured,
    titles: Object.fromEntries(Object.entries(summary.titles || {}).map(([key, value]) => [key, tr(value)])),
  };
}
function fixedValue(value) {
  if (typeof value !== "string") return value;
  const skipped = value.match(/^건너뜀 \(이유: (.*)\)$/);
  return skipped ? `Skipped (reason: ${tr(skipped[1])})` : tr(value);
}
export function displayView(data) {
  if (!data || getLang() !== "en") return data;
  const p = data.prompt;
  return { ...data,
    prompt: p ? { ...p, text: tr(p.text), options: strings(p.options), items: strings(p.items), steps: strings(p.steps), actions: strings(p.actions),
      warning: tr(p.warning), retake_message: tr(p.retake_message), step_title: tr(p.step_title), state_disclaimer: tr(p.state_disclaimer),
      call_buttons: p.call_buttons?.map((b) => ({ ...b, label: tr(b.label) })), sources: p.sources?.map(source) } : p,
    checklist: data.checklist?.map((slot) => ({ ...slot, title: tr(slot.title) })),
    summary: displaySummary(data.summary),
  };
}
export function displayState(ctx) {
  const state = ctx.state.get();
  return { ...state, data: displayView(state.data),
    coach: state.coach ? { ...state.coach, hint: displayPlan(state.coach.hint), danger: displayPlan(state.coach.danger) } : state.coach,
    coachProtocol: state.coachProtocol ? { ...state.coachProtocol, tell_first: tr(state.coachProtocol.tell_first) } : state.coachProtocol,
    qa: state.qa?.map((item) => ({ ...item, answer: tr(item.answer), note: tr(item.note), sources: item.sources?.map(source),
      call_buttons: item.call_buttons?.map((b) => ({ ...b, label: tr(b.label) })) })),
  };
}
