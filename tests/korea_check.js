// Browser-side checks for the Korea edition: Korean voice commands (speech.js), the Korean watch matcher (watch.js) and
// the Korean wording table (ko.js). Run by tests/test_korea.py with node.
"use strict";
const assert = require("assert");
const Speech = require("../src/scenepilot/static/speech.js");
const Watch = require("../src/scenepilot/static/watch.js");
const Ko = require("../src/scenepilot/static/ko.js");

// ---- the command table follows the language ----
assert.strictEqual(Speech.getLang(), "en-US");
assert.strictEqual(Speech.match("next please", Speech.COMMANDS.guide), "next");
Speech.setLang("ko-KR");
assert.strictEqual(Speech.getLang(), "ko-KR");

const guide = Speech.COMMANDS.guide;
assert.strictEqual(Speech.match("다음으로 넘어갈게요", guide), "next");
assert.strictEqual(Speech.match("다시 읽어 주세요", guide), "repeat");
assert.strictEqual(Speech.match("뒤로 갈래요", guide), "back");
assert.strictEqual(Speech.match("사진 촬영으로 건너뛰어요", guide), "skip");
assert.strictEqual(Speech.match("질문 하나 할게요", guide), "ask");
assert.strictEqual(Speech.match("네", guide), "next");
assert.strictEqual(Speech.match("네비게이션이 안 켜져요", guide), null);   // a one-syllable word counts only as a word of its own
assert.strictEqual(Speech.match("날씨가 좋네요", guide), null);

assert.strictEqual(Speech.match("알겠어요", Speech.COMMANDS.emergency), "ack");
assert.strictEqual(Speech.match("119에 전화했어요", Speech.COMMANDS.emergency), "ack");
assert.strictEqual(Speech.match("요약 만들어 주세요", Speech.COMMANDS.hub), "summary");
assert.strictEqual(Speech.match("사진 더 찍을게요", Speech.COMMANDS.hub), "photos");
assert.strictEqual(Speech.match("세부 정보 추가할래요", Speech.COMMANDS.hub), "details");
assert.strictEqual(Speech.match("그만할게요", Speech.COMMANDS.ask), "done");

// Korean letters survive normalization (the English recognizer text rules are unchanged)
assert.strictEqual(Speech.normalize("다친 사람 없어요!"), "다친 사람 없어요");
assert.strictEqual(Speech.normalize("It’s OK, yes"), "it's ok yes");
Speech.setLang("en-US");
assert.strictEqual(Speech.COMMANDS.guide.next[0], "next");

// ---- the Korean watch matcher: stems, spaces ignored ----
const rules = [
  { id: "fault", phrases: ["제잘못", "제가못봤"], hint: "a" },
  { id: "deal", phrases: ["현금으로"], hint: "b" },
];
assert.deepStrictEqual(Watch.matchRules("제 잘못이에요", rules, true).map((r) => r.id), ["fault"]);
assert.deepStrictEqual(Watch.matchRules("제가 못 봤어요, 그냥 현금으로 하죠", rules, true).map((r) => r.id), ["fault", "deal"]);
assert.deepStrictEqual(Watch.matchRules("안녕하세요", rules, true), []);
// English matching is still whole words
assert.deepStrictEqual(Watch.matchRules("my faulty light", [{ id: "x", phrases: ["my fault"] }]).map((r) => r.id), []);
assert.deepStrictEqual(Watch.matchRules("it is my fault", [{ id: "x", phrases: ["my fault"] }]).map((r) => r.id), ["x"]);

// ---- the wording table ----
assert.strictEqual(Ko.t("Core photos are done"), "필수 사진을 모두 찍었어요");
assert.strictEqual(Ko.t("Safety check 1 of 2"), "안전 점검 1/2");
assert.strictEqual(Ko.t("Say yes, no, or not sure."), "예, 아니요, 모르겠어요 중 하나로 말하세요.");
assert.strictEqual(Ko.t("If anyone is hurt or in danger, call 911 first."), "다친 사람이 있거나 위험하면 먼저 119나 112에 전화하세요.");
assert.strictEqual(Ko.t("이미 한국어인 문장"), "이미 한국어인 문장");           // what the server sends is left alone
assert.strictEqual(Ko.t("2026-10-29 13:15 KST"), "2026-10-29 13:15 KST");   // a time is never replaced by a description
for (const line of ["Spoken guidance", "Voice answers", "Conversation watch", "Start over", "Start listening", "Stop listening", "Or just say it"]) {
  assert.ok(!Ko.missing(line), line);
}

console.log("korea checks passed");
