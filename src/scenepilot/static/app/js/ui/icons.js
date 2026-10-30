// Line icons and illustrations. Only fixed strings from this file and assets/illustrations.js are ever put into an SVG
// (the one place innerHTML is allowed).
import { GUIDE_PICTURES, GUIDE_THUMBS, PHOTO_EXAMPLES, PHOTO_SPRITE } from "../../assets/illustrations.js";

const PATHS = {
  alert: '<path d="M12 3l9 17H3z"/><path d="M12 10v4"/><path d="M12 17.2v.1"/>',
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  folder: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
  gear: '<path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z"/><circle cx="12" cy="12" r="3"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  half: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 010 16z" fill="currentColor"/>',
  question: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 015 .5c0 1.7-2.5 2-2.5 3.7"/><path d="M12 17v.1"/>',
  minus: '<path d="M6 12h12"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a1 1 0 01-1 1A16 16 0 014 5a1 1 0 011-1z"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0"/><path d="M12 18v3"/>',
  volume: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 010 7"/><path d="M19.5 5.5a9 9 0 010 13"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l5 6M22 9l-5 6"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 9"/>',
  ear: '<path d="M7 9a5 5 0 0110 0c0 3-3 3.5-3 6.5a2.5 2.5 0 01-5 0"/><path d="M10 9a2 2 0 014 0"/>',
  list: '<path d="M4 7h16M4 12h16M4 17h16"/>',
};

// ---------- Illustrations (fixed markup from assets/illustrations.js) ----------
const SVG_NS = "http://www.w3.org/2000/svg";

function drawing(viewBox, markup, className, label) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("class", className);
  if (label) { svg.setAttribute("role", "img"); svg.setAttribute("aria-label", label); } else svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = markup;
  return svg;
}

// The picture for a "what to do now" task, or null when there is none for that name.
export const picture = (name, label) => (GUIDE_PICTURES[name] ? drawing("0 0 300 140", GUIDE_PICTURES[name], "pic", label) : null);
export const pictureThumb = (name) => (GUIDE_THUMBS[name] ? drawing(GUIDE_THUMBS[name].viewBox, GUIDE_THUMBS[name].markup, "thumb-pic", null) : null);

// An example photo (a pale, blurred picture that shows how to frame the shot). The sprite is added to the page once.
function ensurePhotoSprite() {
  if (document.getElementById("photo-sprite")) return;
  const sprite = document.createElementNS(SVG_NS, "svg");
  sprite.setAttribute("id", "photo-sprite");
  sprite.setAttribute("width", "0");
  sprite.setAttribute("height", "0");
  sprite.setAttribute("style", "position:absolute");
  sprite.setAttribute("aria-hidden", "true");
  sprite.setAttribute("focusable", "false");
  sprite.innerHTML = `<defs>${PHOTO_SPRITE}</defs>`;
  document.body.append(sprite);
}

export function photoExample(name, { label = null, className = "example-img" } = {}) {
  if (!PHOTO_EXAMPLES[name]) return null;
  ensurePhotoSprite();
  const svg = drawing("0 0 320 200", `<use href="#${PHOTO_EXAMPLES[name]}"></use>`, className, label);
  svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
  return svg;
}

export function icon(name, className = "") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", ("ico " + className).trim());
  svg.innerHTML = PATHS[name] || "";
  return svg;
}
