// Checks for the logic of the new UI (static/app/js/core). Plain node, no DOM. Run by tests/test_app_ui.py.
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const core = (name) => import(pathToFileURL(join(here, "..", "src", "scenepilot", "static", "app", "js", "core", name)).href);

const router = await core("router.js");
const i18n = await core("i18n.js");
const store = await core("store.js");
const stateModule = await core("state.js");
const api = await core("api.js");
const guide = await core("guide.js");
const safety = await core("safety.js");
const photos = await core("photos.js");
const commands = await core("commands.js");

// ---------- router ----------
{
  const home = router.resolve({ mode: "home", tab: "home", overlay: null, data: null });
  assert.equal(home.screen, "home.home");
  assert.deepEqual(home.chrome, { appbar: "home", tabbar: true, step: null });
  assert.equal(router.resolve({ mode: "home", tab: "records" }).screen, "home.records");
  assert.equal(router.resolve({ mode: "home", tab: "nope" }).screen, "home.home", "an unknown tab falls back to home");
  assert.equal(router.resolve({ mode: "home", tab: "home", onboardingOpen: true }).screen, "home.onboarding");
  assert.equal(router.resolve({ mode: "accident", onboardingOpen: true, data: { session: { stage: "safety" } } }).screen, "accident.safety", "the introduction never replaces an accident screen");
  // accident mode without a server view cannot draw a stage: stay on home
  assert.equal(router.resolve({ mode: "accident", data: null }).screen, "home.home");

  const at = (stage, overlay = null) => router.resolve({ mode: "accident", overlay, data: { session: { stage } } });
  assert.equal(at("safety").screen, "accident.safety");
  assert.deepEqual(at("safety").chrome, { appbar: "accident", tabbar: false, step: 0 });
  assert.equal(at("emergency").chrome.step, 0);
  assert.equal(at("guide").chrome.step, 1);
  assert.equal(at("photos").chrome.step, 2);
  assert.equal(at("hub").chrome.step, 3, "the choice after the required photos is the talk step, as in the mockup");
  assert.equal(at("info").chrome.step, 4);
  assert.equal(at("summary").chrome.step, 4);
  assert.equal(at("hub", "coach").screen, "coach.coach", "an overlay sits on top of the stage's screen");
  assert.equal(at("guide", "ask").screen, "accident.ask", "the question screen is not part of the talk coaching");
  assert.equal(at("guide", "ask").chrome.step, 1, "and it keeps the step of the stage under it");
  assert.equal(at("hub", "coach").chrome.step, 3);
  assert.equal(at("summary", "leave").chrome.step, 4);
  assert.equal(at("summary", "leave").screen, "accident.summary");
  assert.equal(at("summary", "call-prep").screen, "accident.call-prep");
  assert.equal(at("summary", "call-prep").chrome.step, 4);
  assert.equal(at("not-a-stage").chrome.step, 0, "an unknown stage counts as the first step");

  assert.deepEqual(router.stepStates(2).map((s) => s.state), ["done", "done", "current", "todo", "todo"]);
  assert.equal(router.stepStates(0).length, router.STEPS.length);

  assert.equal(router.showSos("always", "home"), true);
  assert.equal(router.showSos("always", "accident"), true);
  assert.equal(router.showSos("accident", "home"), false);
  assert.equal(router.showSos("accident", "accident"), true);
  assert.equal(router.showSos("hidden", "accident"), false);
}

// ---------- i18n ----------
{
  const dicts = { ko: { a: "가", b: "안녕 {name}" }, en: { a: "A" } };
  assert.equal(i18n.translate(dicts, "en", "a"), "A");
  assert.equal(i18n.translate(dicts, "en", "b", { name: "Kim" }), "안녕 Kim", "a key missing in English falls back to Korean");
  assert.equal(i18n.translate(dicts, "en", "zzz"), "zzz", "a key missing everywhere shows the key");
  assert.equal(i18n.translate(dicts, "ko", "b", {}), "안녕 {name}", "a missing variable is left as written");
}

// ---------- store ----------
{
  const memory = new Map();
  store.useBackend({
    getItem: (k) => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => memory.set(k, v),
    removeItem: (k) => memory.delete(k),
  });
  assert.equal(store.hasConsent(), false);
  store.saveConsent();
  assert.equal(memory.get("scenepilot.consent"), store.CONSENT_VERSION);
  assert.equal(store.hasConsent(), true);

  store.saveSessionId("abc");
  assert.equal(store.getSessionId(), "abc");
  store.saveSessionId(null);
  assert.equal(store.getSessionId(), null);

  memory.set("scenepilot.profile", "{not json");
  assert.deepEqual(store.getProfile(), {}, "a broken profile reads as empty");
  memory.set("scenepilot.profile", JSON.stringify({ insurer: "삼성화재", plate: "12가 3456" }));
  assert.equal(store.getProfile().insurer, "삼성화재");
  memory.set("scenepilot.profile", "[1,2]");
  assert.deepEqual(store.getProfile(), {}, "a profile that is not an object reads as empty");

  assert.deepEqual(Object.values(store.getCoverage()), store.COVERAGES.map(() => "unknown"), "nothing entered means unknown, not 'not covered'");
  memory.set("scenepilot.coverage", JSON.stringify({ liability2: "yes", own: "no", property: "maybe" }));
  const coverage = store.getCoverage();
  assert.equal(coverage.liability2, "yes");
  assert.equal(coverage.own, "no");
  assert.equal(coverage.property, "unknown", "an unknown value reads as unknown");

  assert.deepEqual(store.getSettings(), store.DEFAULT_SETTINGS);
  store.saveSettings({ lang: "en" });
  assert.equal(store.getSettings().lang, "en");
  assert.equal(store.getSettings().sos, "always", "saving one setting keeps the others");
  memory.set("scenepilot.settings", JSON.stringify({ lang: "fr", sos: "never" }));
  assert.deepEqual(store.getSettings(), store.DEFAULT_SETTINGS, "invalid values fall back to the defaults");

  assert.deepEqual(store.getRecords(), []);
  memory.set("scenepilot.records", "{}");
  assert.deepEqual(store.getRecords(), [], "records that are not a list read as empty");

  // storage that throws must never break the app
  store.useBackend({
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
    removeItem() { throw new Error("blocked"); },
  });
  assert.equal(store.get("x"), null);
  assert.equal(store.set("x", "1"), false);
  assert.equal(store.hasConsent(), false);
  assert.deepEqual(store.getSettings(), store.DEFAULT_SETTINGS);
  store.useBackend(null);
  assert.equal(store.set("x", "1"), false, "no storage at all: writes report failure");
}

// ---------- insurance: migration, saving, and reload without touching the old UI's keys ----------
{
  const insurance = await core("insurance.js");
  const memory = new Map([
    ["scenepilot.profile", JSON.stringify({ insurer: "기존 보험사", plate: "12가 3456", vehicle: "흰색 SUV", home_state: "FL" })],
    ["scenepilot.coverage", JSON.stringify({ own: "yes", property: "no" })],
    ["scenepilot.sid", "active-accident"],
  ]);
  const oldKeys = new Map(memory);
  const backend = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v), removeItem: (k) => memory.delete(k) };
  store.useBackend(backend);
  assert.equal(store.getProfile().insurer, "기존 보험사");
  assert.equal(store.getCoverage().own, "yes");
  assert.equal(store.getCoverage().uninsured, "unknown");

  const profile = { ...store.getProfile(), name: " 홍길동 ", phone: "010-0000-0000", insurer: "새 보험사", claims_phone: "1588-0000",
    policy_start: "2026-01-01", policy_end: "2027-01-01" };
  assert.equal(store.saveInsurance(profile), true);
  assert.equal(store.getProfile().name, "홍길동");
  assert.equal(store.getProfile().vehicle, "흰색 SUV");
  assert.equal(store.saveCoverage({ own: "unknown", roadside: "yes" }), true);
  store.useBackend(backend); // the next screen/tab reads the persisted snapshot
  assert.equal(store.getProfile().claims_phone, "1588-0000");
  assert.equal(store.getCoverage().own, "unknown");
  assert.equal(store.getCoverage().property, "no");
  assert.equal(store.getCoverage().roadside, "yes");
  for (const [key, value] of oldKeys) assert.equal(memory.get(key), value, `${key} is read-only`);
  memory.set("scenepilot.profile", JSON.stringify({ insurer: "changed in old UI" }));
  assert.equal(store.getProfile().name, "홍길동", "old UI changes cannot erase newly saved personal details");
  assert.equal(store.getProfile().insurer, "새 보험사");
  assert.equal(store.saveInsurance({ ...store.getProfile(), name: "", insurer: "" }), true);
  assert.equal(store.getProfile().name, "", "a deliberate blank is saved, rather than falling back to an old value");
  assert.equal(store.getProfile().insurer, "");

  const saved = memory.get("scenepilot.data");
  store.useBackend({ ...backend, setItem() { throw new Error("quota exceeded"); } });
  assert.equal(store.saveInsurance({ name: "not saved" }), false);
  assert.equal(store.saveCoverage({ property: "yes" }), false);
  assert.equal(memory.get("scenepilot.data"), saved, "a failed save leaves the previous snapshot intact");
  store.useBackend(backend);
  memory.delete("scenepilot.data");
  for (const broken of ["invalid JSON", "[]", "null", '{"profile":[],"coverage":5}']) {
    memory.set("scenepilot.insurance", broken);
    assert.equal(store.getProfile().insurer, "changed in old UI");
    assert.equal(store.getCoverage().own, "yes", "an invalid snapshot falls back to the old coverage entry");
  }

  assert.equal(insurance.pickedClaimsPhone("010-1234-0000", null, "1588-0000"), "010-1234-0000", "manual phone wins");
  assert.equal(insurance.pickedClaimsPhone("", null, "1588-0000"), "1588-0000");
  assert.equal(insurance.pickedClaimsPhone("1588-0000", "1588-0000", "1544-0000"), "1544-0000", "picker-filled numbers can follow a new selection");
  assert.equal(insurance.phoneHref("1588-0000"), "tel:15880000");
  assert.equal(insurance.phoneHref("+82 (10) 0000-0000"), "tel:+821000000000");
  for (const text of ["", "12", "javascript:alert(1)", "1588-0000#123", "<script>"]) assert.equal(insurance.phoneHref(text), null);
  assert.equal(insurance.validPolicyDates({ policy_start: "", policy_end: "" }), true);
  assert.equal(insurance.validPolicyDates({ policy_start: "2026-01-01", policy_end: "2026-01-01" }), true);
  assert.equal(insurance.validPolicyDates({ policy_start: "2026-12-01", policy_end: "2026-01-01" }), false);
  assert.equal(insurance.validPolicyDates({ policy_start: "2026-02-30", policy_end: "" }), false);
  assert.equal(insurance.normalizeProfile({ name: 42 }).name, "");
  assert.deepEqual(Object.values(insurance.normalizeCoverage({ own: false })), insurance.COVERAGES.map(() => "unknown"));
  store.useBackend(null);
}

// ---------- state ----------
{
  const state = stateModule.createState({ a: 1, b: 1 });
  let calls = 0;
  let last = null;
  const off = state.subscribe((s) => { calls += 1; last = s; });
  state.update({ a: 2 });
  state.update({ b: 3 });
  assert.equal(state.get().a, 2, "reads see the change at once");
  assert.equal(calls, 0, "subscribers are told later, not in the middle of a burst");
  await Promise.resolve();
  assert.equal(calls, 1, "one notification for a burst of changes");
  assert.deepEqual(last, { a: 2, b: 3 });
  off();
  state.update({ a: 9 });
  await Promise.resolve();
  assert.equal(calls, 1, "an unsubscribed listener hears nothing");
}

// ---------- api ----------
{
  assert.equal(api.sessionPath("abc"), "/api/sessions/abc");
  assert.equal(api.sessionPath("abc", "guide"), "/api/sessions/abc/guide");
  assert.equal(api.sessionPath("a/b"), "/api/sessions/a%2Fb", "an id is encoded");
  assert.equal(api.COUNTRY, "KR");

  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError("offline"); };
  await assert.rejects(api.api("/x"), (e) => e instanceof api.ApiError && e.status === 0);
  globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({ detail: "Session not found." }) });
  await assert.rejects(api.api("/x"), (e) => e.status === 404 && e.message === "Session not found.");
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => { throw new Error("not json"); } });
  await assert.rejects(api.api("/x"), (e) => e.status === 500 && e.message.includes("500"));
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: 1 }) });
  assert.deepEqual(await api.api("/x"), { ok: 1 });

  // starting a session: the consent step is passed when the server still waits for it
  const calls = [];
  globalThis.fetch = async (path, options) => {
    calls.push([path, options && options.body]);
    const stage = path.endsWith("/consent") ? "safety" : "consent";
    return { ok: true, status: 200, json: async () => ({ session: { id: "s1", stage } }) };
  };
  const data = await api.startSession();
  assert.equal(data.session.stage, "safety");
  assert.deepEqual(calls.map((c) => c[0]), ["/api/sessions", "/api/sessions/s1/consent"]);
  assert.equal(calls[0][1], JSON.stringify({ country: "KR" }));
  globalThis.fetch = realFetch;
}

// ---------- guide: one sentence at a time, then the server's notes ----------
{
  const list = { step_kind: "list", step_index: 0, text: "숨을 한 번 쉬세요.", items: ["a", "b", "c"], steps: ["list", "n1", "n2"] };
  const first = guide.guideState(list, 0);
  assert.equal(first.kind, "item");
  assert.deepEqual([first.index, first.total, first.text, first.isFirst, first.isLast], [0, 3, "a", true, false]);
  assert.equal(guide.guideState(list, 99).index, 2, "an index past the end is clamped (used for 'the end of the list')");
  assert.equal(guide.guideState(list, -4).index, 0);
  assert.equal(guide.guideState(list, 2).isLast, false, "the last sentence is not the last step while notes follow");

  assert.deepEqual(guide.guideNext(list, 0), { local: 1 });
  assert.deepEqual(guide.guideNext(list, 2), { server: "next" }, "after the last sentence the server moves on");
  assert.equal(guide.guidePrev(list, 0), null, "nothing before the first sentence");
  assert.deepEqual(guide.guidePrev(list, 2), { local: 1 });

  const note = { step_kind: "state_note", step_index: 1, step_title: "멈추고 알리기", text: "본문", sources: [{ title: "법", url: "https://x", version: "v" }], state_disclaimer: "알림", steps: list.steps };
  const view = guide.guideState(note, 0);
  assert.deepEqual([view.kind, view.title, view.noteNo, view.noteTotal, view.isLast], ["note", "멈추고 알리기", 1, 2, false]);
  assert.equal(view.sources.length, 1);
  assert.deepEqual(guide.guidePrev(note, 0), { server: "back", toLastItem: true }, "back from the first note lands on the list's last sentence");
  assert.deepEqual(guide.guidePrev({ ...note, step_index: 2 }, 0), { server: "back", toLastItem: false });
  assert.equal(guide.guideState({ ...note, step_index: 2 }, 0).isLast, true);
  assert.deepEqual(guide.guideNext(note, 0), { server: "next" });

  const only = { step_kind: "list", step_index: 0, text: "h", items: ["a", "b"], steps: ["list"] };
  assert.equal(guide.guideState(only, 1).isLast, true, "the last sentence of a guide with no notes ends the guide");
  assert.equal(guide.guideState(only, 0).isLast, false);
}

// ---------- pictures chosen by the topic of a sentence ----------
{
  const sentences = {
    "비상등을 켜세요. 안전하다면 차를 갓길 같은 안전한 곳으로 옮기세요.": "hazard",
    "비상등을 켜고 차가 다니는 곳에서 벗어나 계세요.": "hazard",
    "정보를 주고받을 때까지 현장에 계세요.": "stay",
    "이름, 전화번호, 보험사, 차량번호를 서로 알려 주세요.": "exchange",
    "블랙박스가 있으면 영상이 덮어씌워지기 전에 따로 저장해 두세요.": "blackbox",
    "보험사에 사고를 접수하세요.": "insurer",
    "상대가 말없이 떠나면 차량번호를 적고 112에 신고하세요.": null,
    "사실만 말하세요.": null,
  };
  for (const [text, name] of Object.entries(sentences)) assert.equal(guide.pictureFor(text), name, text);
  assert.equal(guide.pictureFor(""), null);

  const illus = await import(pathToFileURL(join(here, "..", "src", "scenepilot", "static", "app", "assets", "illustrations.js")).href);
  const names = ["hazard", "blackbox", "stay", "exchange", "insurer"];
  assert.deepEqual(Object.keys(illus.GUIDE_PICTURES), names);
  assert.deepEqual(Object.keys(illus.GUIDE_THUMBS), names);
  for (const name of names) {
    assert.match(illus.GUIDE_PICTURES[name], /<rect/, name);
    assert.match(illus.GUIDE_THUMBS[name].viewBox, /^\d+ \d+ \d+ \d+$/, name);
  }
  assert.equal(guide.pictureFor("보험사에 사고를 접수하세요."), "insurer");

  // every example a slot can point to exists in the sprite
  for (const slotId of ["other_vehicle", "damage", "scene_wide", "own_vehicle"]) {
    const example = photos.exampleFor(slotId);
    assert.ok(illus.PHOTO_EXAMPLES[example], slotId);
    assert.ok(illus.PHOTO_SPRITE.includes(`id="${illus.PHOTO_EXAMPLES[example]}"`), slotId);
  }
  assert.equal(photos.exampleFor("road"), null);
  assert.equal(photos.exampleFor("documents"), null);
}

// ---------- safety answers ----------
{
  const danger = safety.answerChoices("danger", ["예", "아니요", "모르겠어요"]);
  assert.deepEqual(danger.map((c) => c.send), ["예", "아니요", "모르겠어요"], "what is sent is the server's own option text");
  assert.deepEqual(danger.map((c) => c.tone), ["risk", "ok", "unsure"]);
  const movable = safety.answerChoices("movable", ["예", "아니요", "모르겠어요"]);
  assert.deepEqual(movable.map((c) => c.tone), ["ok", "risk", "unsure"], "'yes' is the good answer to 'can you move the car'");
  assert.equal(movable[0].labelKey, "safety.movable.yes");
  assert.deepEqual(safety.answerChoices("danger", null).map((c) => c.send), ["예", "아니요", "모르겠어요"], "without options the Korean defaults are sent");
  assert.equal(safety.answerChoices("other", null)[0].labelKey, "safety.generic.yes");

  assert.deepEqual(safety.safetyPosition({ answered: 0, total: 2 }), { n: 1, total: 2 });
  assert.deepEqual(safety.safetyPosition({ answered: 2, total: 2 }), { n: 2, total: 2 }, "never past the total");
  assert.deepEqual(safety.safetyPosition(undefined), { n: 1, total: 1 });

  assert.deepEqual(safety.splitRetry("죄송해요, 잘 못 들었어요. 다친 사람이 있나요?"), ["죄송해요, 잘 못 들었어요.", "다친 사람이 있나요?"]);
  assert.deepEqual(safety.splitRetry("다친 사람이 있나요?"), ["다친 사람이 있나요?"]);
}

// ---------- photos ----------
{
  const slot = (id, status, core = true) => ({ id, title: id, status, core });
  assert.deepEqual(photos.slotChip(slot("a", "captured"), "x"), { kind: "ok", labelKey: null });
  assert.deepEqual(photos.slotChip(slot("a", "skipped"), "x"), { kind: "skipped", labelKey: "photos.slot.skipped" });
  assert.equal(photos.slotChip(slot("a", "needs_retake"), "a").labelKey, "photos.slot.retake");
  assert.equal(photos.slotChip(slot("a", "pending"), "a").labelKey, "photos.slot.now");
  assert.equal(photos.slotChip(slot("b", "pending"), "a").labelKey, "photos.slot.wait");
  assert.equal(photos.slotChip(slot("c", "pending", false), "a").labelKey, "photos.slot.optional");

  assert.deepEqual(photos.photoPosition({ extra_mode: false, core_done: 1, core_total: 3, extra_done: 0, extra_total: 3 }), { key: "photos.kick.core", n: 2, total: 3 });
  assert.deepEqual(photos.photoPosition({ extra_mode: false, core_done: 3, core_total: 3, extra_done: 0, extra_total: 3 }), { key: "photos.kick.core", n: 3, total: 3 }, "never past the total");
  assert.deepEqual(photos.photoPosition({ extra_mode: true, core_done: 3, core_total: 3, extra_done: 1, extra_total: 3 }), { key: "photos.kick.extra", n: 2, total: 3 });
  assert.equal(photos.extraLeft({ extra_done: 1, extra_total: 3 }), 2);
  assert.equal(photos.extraLeft({ extra_done: 3, extra_total: 3 }), 0);
  const done = photos.finishedCore([slot("a", "captured"), slot("b", "skipped"), slot("c", "pending"), slot("d", "captured", false)]);
  assert.deepEqual(done.map((s) => s.id), ["a", "b"], "only the required photos that are finished");
  assert.ok(photos.SKIP_REASONS.length === 3 && photos.SKIP_REASONS.every((r) => r.send && r.labelKey));
}

// ---------- answering while the app is still reading ----------
{
  const question = "다친 사람이 있거나, 연기나 불, 기름이 보이나요?";
  for (const answer of ["네", "네, 있어요", "예", "아니요", "아니요 없어요", "없어요", "잘 모르겠어요", "모르겠어요", "응"]) {
    assert.equal(commands.isQuickAnswer(answer), true, answer);
  }
  assert.equal(commands.isQuickAnswer(question), false, "the app's own question is never mistaken for an answer");
  assert.equal(commands.isQuickAnswer("차를 옮기세요 안전하다면 가드레일 뒤로"), false);
  assert.equal(commands.isQuickAnswer(""), false);
  assert.equal(commands.isQuickAnswer("네 있어요 그런데 지금 정말 연기가 많이 나고 있어서 무서워요"), false, "a long sentence is not a quick answer");

  const parse = (text) => (text.includes("다음") ? "next" : null);
  assert.equal(commands.isShortCommand("다음", parse), true);
  assert.equal(commands.isShortCommand("다음으로 가요", parse), true);
  assert.equal(commands.isShortCommand("정보를 주고받은 다음 보험사에 전화하세요", parse), false, "a long sentence that contains 'next' is the app's voice");
  assert.equal(commands.isShortCommand("안녕하세요", parse), false);
}

// ---------- talk coaching ----------
{
  const coach = await core("coach.js");
  // every reminder the server and its rules can send has a kind
  const kinds = { hostile: "danger", drunk: "danger", pain: "danger", deal: "stop", sign: "stop", leaving: "stop", police: "stop",
    fault: "stop", ask_contact: "info", ask_insurance: "info", ask_plate: "info", tone: "tone", ai: "tip", unknown_id: "tip" };
  for (const [id, kind] of Object.entries(kinds)) assert.equal(coach.categoryOf(id), kind, id);
  for (const kind of ["danger", "stop", "info", "tone", "tip"]) assert.ok(coach.VIBRATION[kind].length >= 1, kind);
  assert.ok(coach.VIBRATION.danger.length > coach.VIBRATION.stop.length && coach.VIBRATION.stop.length > coach.VIBRATION.info.length,
    "the more urgent, the more vibration");

  const plan = coach.planHint({ id: "deal", hint: " 현장에서 합의하지 않아도 돼요. " });
  assert.deepEqual([plan.id, plan.category, plan.text], ["deal", "stop", "현장에서 합의하지 않아도 돼요."]);
  assert.equal(plan.say, coach.SAY.deal);
  assert.equal(coach.planHint({ id: "ai", hint: "차분히 이야기해 보세요.", free: true }).say, null, "a sentence the model wrote has no 'you could say' line");
  assert.equal(coach.planHint({ id: "ask_plate", hint: "번호판을 찍어 두세요." }).say, null);
  assert.equal(coach.planHint({ id: "hostile", hint: "112에 신고하세요." }).say, null, "a threat has nothing to say back");
  assert.ok(coach.planHint({ id: "pain", hint: "병원 진료를 고려하세요." }).say, "pain keeps a question to ask");
  assert.equal(coach.planHint({ id: "deal", hint: "  " }), null);
  assert.equal(coach.planHint(null), null);
  assert.equal(coach.planHint({ hint: "x" }).id, "ai", "a hint without an id is the model's own");

  // nothing the person may say contains a judgment of fault, an amount, or medical advice
  for (const [id, sentence] of Object.entries(coach.SAY)) {
    assert.ok(!/[0-9]/.test(sentence) || /119|112/.test(sentence), `${id}: no numbers except 112 and 119`);
    assert.ok(!/(과실|잘못|원|만원|합의금|진단|치료|병원)/.test(sentence), `${id}: no fault, money or medical words`);
  }

  assert.equal(coach.dangerVariant("pain").firstCall, "119", "with pain the ambulance comes first");
  assert.equal(coach.dangerVariant("hostile").firstCall, "112");
  assert.equal(coach.dangerVariant("drunk").reasonKey, "danger.reason.drunk");

  // the checklist
  const none = coach.infoRows({}, []);
  assert.deepEqual(none.map((r) => r.field), ["other_contact", "other_plate", "other_insurance", "other_vehicle"]);
  assert.ok(none.every((r) => r.kind === "unknown" && r.value === null));
  const info = {
    other_contact: { value: "010-1234-5678", source: "ai_observation", confirmed: false },
    other_insurance: { value: "OO손해보험", source: "user_statement", confirmed: true },
  };
  const rows = coach.infoRows(info, []);
  assert.deepEqual([rows[0].kind, rows[0].value], ["heard", "010-1234-5678"], "heard but not confirmed");
  assert.deepEqual([rows[2].kind, rows[2].value], ["ok", "OO손해보험"], "confirmed");
  const withPhoto = coach.infoRows({}, [{ id: "other_vehicle", status: "captured" }]);
  assert.equal(withPhoto[1].kind, "ok", "a photo of the other car counts for its plate");
  assert.equal(withPhoto[1].valueKey, "coach.row.photo");
  assert.equal(coach.infoRows({}, [{ id: "other_vehicle", status: "skipped" }])[1].kind, "unknown");
  assert.deepEqual(coach.DEFAULT_COACH_PREFS, { mode: "screen", ai: true });
}

// ---------- commands ----------
{
  for (const [name, phrases] of Object.entries(commands.HUB_COMMANDS)) {
    assert.ok(phrases.length > 0, name);
    for (const p of phrases) assert.ok(/[가-힣]/.test(p), `${name}: Korean phrases only`);
  }
}

await import("./app_coach_check.mjs");
await import("./app_wrap_check.mjs");
await import("./app_settings_check.mjs");
console.log("app core checks passed");
