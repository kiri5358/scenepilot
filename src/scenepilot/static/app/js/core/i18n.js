// Display language is independent of the accident's country (always KR).
import serverEnglish from "./server-en.js";

const dictionaries = {};
let lang = "ko";

// Plain function, no globals: look the key up in the chosen language, then Korean, then show the key itself.
export function translate(dicts, language, key, vars) {
  const text = (dicts[language] && dicts[language][key]) ?? (dicts.ko && dicts.ko[key]) ?? key;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}

export const t = (key, vars) => translate(dictionaries, lang, key, vars);
export const getLang = () => lang;
export const serverText = (text, language = lang) => {
  if (language !== "en" || typeof text !== "string") return text;
  if (Object.hasOwn(serverEnglish, text)) return serverEnglish[text];
  const retry = "죄송해요, 잘 못 들었어요. ";
  if (text.startsWith(retry)) return `Sorry, I did not catch that. ${serverText(text.slice(retry.length), language)}`;
  // Only fixed, structured server compositions. Never run this over user-entered text.
  const photo = text.match(/^(.+): 아직 찍지 않았어요\.$/);
  if (photo) return `${serverText(photo[1], language)}: not taken yet.`;
  const more = text.match(/^사진 더 찍기 \((\d+)장 남음\)$/);
  if (more) return `Take more photos (${more[1]} left)`;
  for (const separator of [" - ", ": "]) {
    const at = text.indexOf(separator);
    if (at > 0) return `${serverText(text.slice(0, at), language)}${separator}${serverText(text.slice(at + separator.length), language)}`;
  }
  return text;
};

export function setDictionaries(next) { Object.assign(dictionaries, next); }

async function load(code) {
  if (dictionaries[code]) return;
  try {
    const res = await fetch(`/static/app/i18n/${code}.json`);
    dictionaries[code] = res.ok ? await res.json() : {};
  } catch {
    dictionaries[code] = {};
  }
}

export async function setLang(code) {
  const next = code === "en" ? "en" : "ko";
  await load("ko");          // always the fallback
  if (next !== "ko") await load(next);
  lang = next;
  if (typeof document !== "undefined") document.documentElement.lang = next;
}
