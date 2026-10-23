// Checks the Korean reading aid (static/ko.js): every fixed English line the server can show has a Korean meaning.
// Usage: node ko_check.js <strings.json>   (the file is written by tests/test_ko_js.py)
"use strict";
const fs = require("fs");
const path = require("path");
const Ko = require(path.join(__dirname, "..", "src", "scenepilot", "static", "ko.js"));

const failures = [];
const lines = JSON.parse(fs.readFileSync(process.argv[2], "utf-8"));
for (const line of lines) if (!Ko.gloss(line)) failures.push("no Korean for: " + line);

// lines with numbers or names in them
const cases = {
  "SAFETY CHECK 3/7": "안전 점검 3/7",
  "WHAT TO DO NOW 2/8": "지금 할 일 2/8",
  "CORE PHOTO 1/3": "필수 사진 1/3",
  "Take more photos (2 left)": "사진 더 찍기 (2장 남음)",
  "Call 911": "911에 전화",
  "Call Geico": "Geico에 전화",
  "Yes, Florida": "예, 플로리다",
  "Taken": "촬영함",
  "Please retake it: The photo is blurry or too dark. Hold still, tap to focus, and try again.": null,
};
for (const [en, ko] of Object.entries(cases)) {
  const got = Ko.gloss(en);
  if (ko === null ? !got : got !== ko) failures.push(`${en}: got ${JSON.stringify(got)}, wanted ${JSON.stringify(ko)}`);
}
const near = Ko.gloss("You may be near a state line, so I can't be sure. (accurate to about 11 m) The closest of my states is New York. Please pick the state you are in.");
if (!near || !near.includes("뉴욕") || !near.includes("11")) failures.push("near-border message: " + near);
const inside = Ko.gloss("Your phone's location looks like Florida. (accurate to about 11 m) Is that right?");
if (!inside || !inside.includes("플로리다")) failures.push("inside message: " + inside);
if (Ko.gloss("Something the app never says")) failures.push("unknown line must stay unglossed");

if (failures.length) { console.error("FAILURES:\n" + failures.join("\n")); process.exit(1); }
console.log(`ko checks passed (${lines.length} lines)`);
