// Spoken commands for the screens the server's own tables do not cover. Used with Speech.match(): a phrase counts when it
// appears in the sentence with spaces ignored, and a one-syllable phrase must be a word of its own.
// The server-side tables (speech.js) cover emergency, guide and hub; these add what the new hub offers.
export const HUB_COMMANDS = {
  coach: ["대화", "상대방", "코칭", "이야기"],
  photos: ["사진더", "더찍", "사진"],
  finish: ["마무리", "요약", "끝"],
  ask: ["질문", "물어볼", "궁금"],
};

// ---------- Answering while the app is still reading ----------
// The app listens while it reads, so a person in a hurry can answer at once. But the microphone also hears the app's own
// voice, so reading is cut short only for something that is surely an answer: a short sentence that starts with an answer
// word (the long question itself never does) or a short spoken command.
const compact = (text) => String(text).toLowerCase().replace(/[^가-힣a-z0-9]/g, "");
const ANSWER_WORDS = ["네", "넵", "예", "응", "아니", "아뇨", "없어", "없습니다", "있어", "있습니다", "모르겠", "몰라", "잘모", "글쎄", "괜찮", "맞아", "그래"];
export const QUICK_MAX_CHARS = 12;

export function isQuickAnswer(text) {
  const c = compact(text);
  return c.length > 0 && c.length <= QUICK_MAX_CHARS && ANSWER_WORDS.some((word) => c.startsWith(word));
}

// parse: the screen's own command test (returns a command or null).
export function isShortCommand(text, parse, max = QUICK_MAX_CHARS) {
  const c = compact(text);
  return c.length > 0 && c.length <= max && Boolean(parse(text));
}
