// The "what to do now" step, shown one thing at a time. Pure functions: no DOM, so node can test them.
//
// The server's guide has a first step that is a list of sentences, followed by note steps (one card each).
// The screen walks through the list one sentence at a time on its own (a local index), and only asks the server to move
// when the list is finished or a note is left.

const clamp = (n, low, high) => Math.min(Math.max(n, low), high);

// prompt: the server's prompt for the guide stage. item: the local index into the list.
export function guideState(prompt, item = 0) {
  const items = prompt.items || [];
  const steps = prompt.steps || [];
  const stepsAfter = Math.max(0, steps.length - 1 - (prompt.step_index || 0));

  if (prompt.step_kind === "list" && items.length) {
    const index = clamp(item, 0, items.length - 1);
    return {
      kind: "item", heading: prompt.text, text: items[index], items,
      index, total: items.length,
      isFirst: index === 0,
      isLast: index === items.length - 1 && stepsAfter === 0,
    };
  }
  const noteNo = prompt.step_index || 0;
  return {
    kind: "note", title: prompt.step_title || "", text: prompt.text || "",
    sources: prompt.sources || [], disclaimer: prompt.state_disclaimer || null,
    noteNo, noteTotal: Math.max(1, steps.length - 1),
    isFirst: false,
    isLast: noteNo >= steps.length - 1,
  };
}

// Which picture goes with a sentence of the list. The words stay the server's; this only chooses a drawing by the topic
// of the sentence (the order of the tests matters: the first step may also say "계세요"). null: no picture for it.
const PICTURE_TOPICS = [
  ["hazard", /비상등|갓길/],
  ["blackbox", /블랙박스/],
  ["stay", /현장에\s*(계세요|머)/],
  ["exchange", /이름|전화번호|연락처/],
  ["insurer", /보험사에\s*(사고|접수)/],
];
export function pictureFor(text) {
  const hit = PICTURE_TOPICS.find(([, pattern]) => pattern.test(String(text)));
  return hit ? hit[0] : null;
}

// What "next" does: move inside the list, or ask the server to move on (to the next note, or to the photos).
export function guideNext(prompt, item = 0) {
  const state = guideState(prompt, item);
  if (state.kind === "item" && state.index < state.total - 1) return { local: state.index + 1 };
  return { server: "next" };
}

// What "previous" does. null means there is nothing before this.
export function guidePrev(prompt, item = 0) {
  const state = guideState(prompt, item);
  if (state.kind === "item") return state.index > 0 ? { local: state.index - 1 } : null;
  // leaving the first note goes back to the end of the list
  return { server: "back", toLastItem: (prompt.step_index || 0) <= 1 };
}
