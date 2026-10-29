// Voice input helper: speech-to-text from the browser's built-in recognizer, plus spoken-command matching.
// It needs a secure page (HTTPS or localhost) and the user's permission for the microphone.
//
// The app talks only to this small interface, so a different speech-to-text engine (for example an NVIDIA model
// behind our own server) could replace the browser one later without touching the screens.
//
// Privacy: the browser may send what the user says to its own speech service (Chrome uses an online service).
// This file stores nothing and sends nothing itself.
"use strict";

const Speech = (() => {
  const SR = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : undefined;

  // Letters, digits, apostrophes and Korean syllables; everything else becomes a space.
  const normalize = (text) =>
    String(text).toLowerCase().replace(/[’]/g, "'").replace(/[^a-z0-9'ㄱ-ㆎ가-힣 ]+/g, " ").replace(/\s+/g, " ").trim();

  // The language the recognizer listens for. The Korea edition switches it to ko-KR.
  let currentLang = "en-US";
  const setLang = (lang) => { currentLang = lang; };
  const getLang = () => currentLang;

  // ---- Test mode: ?fakespeech=No|Yes|next  replays those phrases, one per listening turn ----
  let fakeItems = null;
  function fakeActive() {
    try {
      if (fakeItems === null) {
        const raw = new URLSearchParams(window.location.search).get("fakespeech");
        fakeItems = raw ? raw.split("|").map((s) => s.trim()).filter(Boolean) : [];
        fakeItems.active = !!raw;
      }
      return !!fakeItems.active;
    } catch {
      return false;
    }
  }

  function supported() {
    return fakeActive() || (!!SR && typeof window !== "undefined" && window.isSecureContext === true);
  }

  const MESSAGES = {
    "not-allowed": "Microphone permission was denied. You can allow it in your browser settings, or use the buttons.",
    "service-not-allowed": "Microphone permission was denied. You can allow it in your browser settings, or use the buttons.",
    "no-speech": "I didn't hear anything.",
    "audio-capture": "No microphone was found.",
    network: "Voice recognition needs an internet connection.",
  };
  const PERMISSION_CODES = new Set(["not-allowed", "service-not-allowed"]);

  /**
   * Listen for one phrase.
   * Callbacks: onInterim(text) while the user is speaking, onFinal(text, guesses) once (guesses: the recognizer's
   * candidate transcripts, best first, when it gives them), onError(message, code), onEnd() always last.
   * Returns { stop() }.
   */
  function listen({ lang = currentLang, onInterim, onFinal, onError, onEnd } = {}) {
    const ctrl = { stopped: false, stop() { ctrl.stopped = true; if (ctrl.rec) { try { ctrl.rec.abort(); } catch { /* already stopped */ } } } };

    if (fakeActive()) {
      setTimeout(() => {
        if (ctrl.stopped) return;
        const next = fakeItems.shift();
        if (next === undefined) {
          onError && onError(MESSAGES["no-speech"], "no-speech");
        } else {
          onInterim && onInterim(next);
          onFinal && onFinal(next);
        }
        onEnd && onEnd();
      }, 600);
      return ctrl;
    }

    if (!supported()) {
      setTimeout(() => {
        onError && onError("Voice answers need a secure (HTTPS) page and a browser that supports speech recognition. Use the buttons instead.", "unsupported");
        onEnd && onEnd();
      }, 0);
      return ctrl;
    }

    const rec = new SR();
    ctrl.rec = rec;
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 5;   // the other guesses help in noise: the right word is often second or third
    let finalText = "";
    let guesses = [];
    let errored = false;
    const watchdog = setTimeout(() => { try { rec.abort(); } catch { /* ignore */ } }, 15000);

    rec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const piece = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += piece;
          guesses = Array.from(event.results[i]).map((alt) => alt.transcript);
        } else interim += piece;
      }
      onInterim && onInterim((finalText + " " + interim).trim());
    };
    rec.onerror = (event) => {
      if (event.error === "aborted") return;
      errored = true;
      onError && onError(MESSAGES[event.error] || "Voice recognition failed. Use the buttons instead.", event.error);
    };
    rec.onend = () => {
      clearTimeout(watchdog);
      if (!errored && !ctrl.stopped) {
        if (finalText.trim()) onFinal && onFinal(finalText.trim(), guesses);
        else onError && onError(MESSAGES["no-speech"], "no-speech");
      }
      onEnd && onEnd();
    };
    try {
      rec.start();
    } catch {
      errored = true;
      onError && onError("Could not start the microphone. Use the buttons instead.", "start-failed");
      onEnd && onEnd();
    }
    return ctrl;
  }

  // ---- Spoken commands. The longest matching phrase wins ("not sure" beats "sure"). ----
  const COMMANDS = {
    emergency: {
      ack: ["got it", "okay", "ok", "done", "called", "i called", "continue", "yes", "safe", "i am safe", "i'm safe"],
    },
    guide: {
      next: ["next", "continue", "go on", "keep going", "okay", "ok", "got it", "done"],
      repeat: ["repeat", "again", "say that again", "say it again", "pardon", "what"],
      back: ["back", "go back", "previous"],
      skip: ["skip", "skip it", "skip to photos", "photos"],
      ask: ["ask a question", "i have a question", "question", "ask"],
    },
    state: {
      confirm: ["yes", "yeah", "yep", "that's right", "that is right", "correct", "right"],
      FL: ["florida"],
      NY: ["new york"],
      OTHER: ["another state", "other state", "different state", "other"],
      UNSURE: ["not sure", "unsure", "don't know", "do not know", "no idea", "i don't know"],
      back: ["back", "go back", "previous"],
      repeat: ["repeat", "again", "say that again", "say it again"],
      skip: ["skip", "skip to photos"],
    },
    hub: {
      summary: ["summary", "create summary", "make summary", "finish"],
      photos: ["more photos", "take more photos", "photos"],
      details: ["details", "add details", "more details", "information"],
      ask: ["ask a question", "i have a question", "question", "ask"],
    },
    ask: {
      done: ["done", "that's all", "that is all", "go back", "back", "stop", "close", "no more questions"],
    },
  };

  // Korean commands. Korean words carry endings ("다음으로", "건너뛰어요"), so a phrase counts when it appears anywhere in the
  // sentence with spaces ignored. A one-syllable phrase must be a word of its own ("네" would otherwise hide in "네비").
  const COMMANDS_KO = {
    emergency: {
      ack: ["알겠어요", "알겠습니다", "네", "예", "응", "확인", "전화했어요", "신고했어요", "했어요", "안전해요", "안전합니다", "괜찮아요", "계속"],
    },
    guide: {
      next: ["다음", "계속", "네", "예", "응", "알겠어요", "알겠습니다", "확인", "넘어가"],
      repeat: ["다시", "반복", "뭐라고", "한번더"],
      back: ["뒤로", "이전", "돌아가"],
      skip: ["건너뛰", "사진촬영", "사진으로"],
      ask: ["질문", "물어볼", "궁금"],
    },
    state: {
      confirm: ["네", "예", "응", "맞아요", "맞습니다"],
      back: ["뒤로", "이전"],
      repeat: ["다시", "반복"],
      skip: ["건너뛰"],
    },
    hub: {
      summary: ["요약", "마무리", "끝"],
      photos: ["사진더", "더찍", "사진"],
      details: ["세부", "정보추가", "추가정보"],
      ask: ["질문", "물어볼", "궁금"],
    },
    ask: {
      done: ["그만", "끝", "끝났어요", "됐어요", "뒤로", "돌아가", "닫아", "질문없어요"],
    },
  };

  const HANGUL = /[가-힣]/;

  /** Which command in `table` does the spoken text contain? Returns the command id or null. */
  function match(text, table) {
    const norm = normalize(text);
    const t = ` ${norm} `;
    const compact = norm.replace(/ /g, "");
    const tokens = norm.split(" ");
    let best = null;
    let bestLen = 0;
    for (const [id, phrases] of Object.entries(table)) {
      for (const phrase of phrases) {
        const p = normalize(phrase);
        if (HANGUL.test(p)) {
          const pc = p.replace(/ /g, "");
          const hit = pc.length <= 1 ? tokens.includes(pc) : compact.includes(pc);
          if (hit && pc.length > bestLen) { best = id; bestLen = pc.length; }
        } else if (p.length > bestLen && t.includes(` ${p} `)) {
          best = id;
          bestLen = p.length;
        }
      }
    }
    return best;
  }

  return {
    supported, listen, match, fakeActive, PERMISSION_CODES, normalize, setLang, getLang,
    // the command table for the language in use
    get COMMANDS() { return currentLang === "ko-KR" ? COMMANDS_KO : COMMANDS; },
    COMMANDS_EN: COMMANDS, COMMANDS_KO,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Speech;
