// Builds android-app/www from the web UI in ../src/scenepilot/static WITHOUT changing the web code.
// App-only changes: asset paths become relative, and three small files from native/ are added.
// Usage: SCENEPILOT_API_BASE=http://192.168.0.20:8000 node build-www.mjs     (default http://10.0.2.2:8000, the emulator's view of this PC)
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webSource = join(here, "..", "src", "scenepilot", "static");
const out = join(here, "www");
const apiBase = (process.env.SCENEPILOT_API_BASE || "http://10.0.2.2:8000").replace(/\/+$/, "");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const file of ["style.css", "geo.js", "speech.js", "ko.js", "app.js"]) cpSync(join(webSource, file), join(out, file));
if (existsSync(join(webSource, "audio"))) cpSync(join(webSource, "audio"), join(out, "static", "audio"), { recursive: true });
for (const file of ["api-shim.js", "native-speech.js", "native-tts.js"]) cpSync(join(here, "native", file), join(out, file));
writeFileSync(join(out, "app-config.js"), `window.SCENEPILOT_API_BASE = ${JSON.stringify(apiBase)};\n`);

function insert(html, anchor, extra, where) {
  if (!html.includes(anchor)) throw new Error(`index.html changed: could not find ${anchor}`);
  return html.replace(anchor, where === "before" ? extra + anchor : anchor + extra);
}
let html = readFileSync(join(webSource, "index.html"), "utf-8").replaceAll('"/static/', '"./');
html = insert(html, '<script src="./geo.js"></script>', '<script src="./app-config.js"></script>\n  <script src="./api-shim.js"></script>\n  ', "before");
html = insert(html, '<script src="./speech.js"></script>', '\n  <script src="./native-speech.js"></script>\n  <script src="./native-tts.js"></script>', "after");
writeFileSync(join(out, "index.html"), html);
console.log(`www built. The app will talk to ${apiBase}`);
