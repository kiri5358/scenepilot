import assert from "node:assert/strict";
import fs from "node:fs";
import { setDictionaries, setLang, serverText } from "../src/scenepilot/static/app/js/core/i18n.js";
import { displayView, displayPlan } from "../src/scenepilot/static/app/js/core/display.js";
import { pictureFor } from "../src/scenepilot/static/app/js/core/guide.js";
import { isQuickAnswer } from "../src/scenepilot/static/app/js/core/commands.js";
import { startSession } from "../src/scenepilot/static/app/js/core/api.js";

const fixture = JSON.parse(fs.readFileSync(0, "utf8"));
setDictionaries({ ko: {}, en: {} });
await setLang("en");
assert.equal(serverText("constructor"), "constructor");
assert.equal(serverText("__proto__"), "__proto__");
for (const text of fixture.fixed) {
  const translated = serverText(text);
  assert.ok(!/[가-힣]/.test(translated), `Untranslated fixed text: ${text}`);
  assert.ok(!/\b911\b/.test(translated), `Wrong jurisdiction: ${text}`);
}
for (const raw of fixture.views) {
  const before = JSON.stringify(raw);
  const english = displayView(raw);
  assert.equal(english.session.id, raw.session.id);
  assert.equal(english.session.country, "KR");
  assert.equal(english.session.stage, raw.session.stage);
  assert.equal(JSON.stringify(english.session.info), JSON.stringify(raw.session.info));
  assert.ok(!/[가-힣]/.test(english.prompt.text));
  for (const slot of english.checklist) assert.ok(!/[가-힣]/.test(slot.title));
  assert.equal(JSON.stringify(raw), before, "rendering never changes the server snapshot");
  if (raw.prompt.kind === "guide" && raw.prompt.step_kind === "list") {
    for (const [i, text] of raw.prompt.items.entries()) assert.equal(pictureFor(english.prompt.items[i]), pictureFor(text));
  }
  if (raw.summary) {
    assert.ok(!/[가-힣]/.test(JSON.stringify(english.summary.coverage_rows)));
    assert.equal(english.summary.followups[0].text, raw.summary.followups[0].text);
    assert.equal(english.summary.contact.number, raw.summary.contact.number);
    const statement = english.summary.sections.find((s) => s.title === "Your statement");
    assert.equal(statement.items[0].value, "사실만 말하세요.", "personal text identical to a fixed sentence stays verbatim");
  }
  await setLang("ko");
  assert.strictEqual(displayView(raw), raw);
  await setLang("en");
}
for (const hint of fixture.hints) {
  assert.ok(!/[가-힣]/.test(displayPlan(hint).text));
  assert.ok(!/[가-힣]/.test(displayPlan(hint).say || ""));
}
assert.ok(isQuickAnswer("Yes"));
assert.ok(isQuickAnswer("No"));
assert.ok(isQuickAnswer("Not sure"));
const original = globalThis.fetch;
try {
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ session: { id: "same", stage: "safety", country: "KR" } }) };
  };
  await startSession();
  assert.equal(requests[0].body.country, "KR", "English does not create a US accident");
} finally { globalThis.fetch = original; }
console.log("language projection checks passed");
