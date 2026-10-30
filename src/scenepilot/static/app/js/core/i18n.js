// The app's own words, Korean first with English as an option. The server's fixed sentences are not translated here:
// they arrive in Korean for a Korea session and are shown as they are.

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
