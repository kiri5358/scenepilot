// Korea edition: home, my insurance, records, settings and the first-run screens (the mockup's last step).
// Everything here lives on the phone only: the profile, the saved records and the settings are in local storage and
// never sent to the server. It uses the helpers of app.js (h, store, icon, state, render, ...), so it loads after it.

const KR_VIEWS = ["home", "records", "record", "settings", "onboarding"];
const KR_TAB_VIEWS = ["home", "profile", "records", "record"];   // "profile" is the my-insurance tab
const STAGE_LABEL = { safety: "안전 단계", emergency: "긴급", guide: "할 일 단계", photos: "사진 단계", hub: "대화·마무리 선택", info: "세부 정보", summary: "마무리" };
const RECORD_STATUS = { active: "보험 처리 중", done: "처리 완료" };
const pad2 = (n) => String(n).padStart(2, "0");
const fmtTime = (iso) => { const t = new Date(iso); return `${t.getFullYear()}.${pad2(t.getMonth() + 1)}.${pad2(t.getDate())} ${pad2(t.getHours())}:${pad2(t.getMinutes())}`; };

// ---------- Saved records (this phone only) ----------
function loadRecords() { try { const r = JSON.parse(store("records") || "[]"); return Array.isArray(r) ? r : []; } catch { return []; } }
function saveRecords(list) { store("records", JSON.stringify(list.slice(0, 50))); }

// Called whenever the summary screen is drawn: the record of this accident is kept up to date on the phone.
function saveCurrentRecord() {
  const d = state.data;
  if (!isKr() || !d || d.session.stage !== "summary" || !d.summary) return;
  const list = loadRecords();
  const i = list.findIndex((r) => r.id === d.session.id);
  const photos = (d.checklist || []).filter((c) => c.status === "captured").length;
  const rec = {
    id: d.session.id, at: d.session.created_at, title: fmtTime(d.session.created_at),
    sub: `사진 ${photos}장`, missing: d.summary.missing.length, status: i >= 0 ? list[i].status : "active", text: d.summary_text,
  };
  if (i >= 0) list[i] = rec; else list.unshift(rec);
  saveRecords(list);
}

// ---------- Small parts ----------
const ongoing = () => !!state.data && state.data.session.stage !== "consent";
const goView = (v) => () => { stopWatch(); stopListening(); stopSpeaking(); state.view = v; state.error = null; render(); };

function tabsBar() {
  const on = (v) => (v === "home" ? state.view === "home" : v === "profile" ? state.view === "profile" : ["records", "record"].includes(state.view));
  const tab = (v, label, ico) => h("button", { class: "tab" + (on(v) ? " on" : ""), "aria-current": on(v) ? "page" : false, onclick: goView(v) }, icon(ico), label);
  return h("nav", { class: "tabs", "aria-label": "메뉴" }, tab("home", "홈", "home"), tab("profile", "내 보험", "shield"), tab("records", "기록", "list"));
}

function coverChips(p) {
  return h("div", { class: "chips" }, COVER_ITEMS.map(([k, label]) => {
    const v = p.cover && p.cover[k];
    return h("span", { class: "chip " + (v === "yes" ? "ok" : "unk") }, v === "yes" ? `✓ ${label}` : v === "no" ? `– ${label} 미가입` : `? ${label}`);
  }));
}

// ---------- Home ----------
function startAccident() {
  const d = state.data, stage = d && d.session.stage;
  stopWatch(); stopListening(); stopSpeaking();
  if (!d || stage === "consent") {   // nothing is in progress: use the session that is already waiting
    state.view = null; state.error = null;
    if (d && hasConsent()) run("Starting…", () => post(`/api/sessions/${d.session.id}/consent`)); else render();
    return;
  }
  if (!confirm("진행 중인 사고가 있어요. 새로 시작하면 이 사고는 이어서 할 수 없어요. 새로 시작할까요?")) return;
  store("sid", null); state.view = null; state.lastPhoto = null; state.skipOpen = false; state.qa = []; state.spokenKey = null;
  state.geo = { status: "idle" }; startLocationLookup();
  run("Starting…", startSession);
}

function homeScreen() {
  const d = state.data, p = loadProfile();
  const resume = () => { state.view = null; state.spokenKey = null; render(); };
  const line = [p.insurer, p.plate].filter(Boolean).join(" · ");
  const sub = [p.period ? `보험기간 ${p.period}` : "", store("insurer") || p.claims_phone ? `사고접수 ${store("insurer") || p.claims_phone}` : ""].filter(Boolean).join(" · ");
  return [
    ongoing() ? h("div", { class: "card ongoing" },
      h("div", { class: "row spread" }, h("p", { class: "k" }, "진행 중인 사고"),
        d.summary ? h("span", { class: "chip hd" }, `남은 일 ${d.summary.missing.length}개`) : null),
      h("p", { class: "h2" }, `${fmtTime(d.session.created_at)} · ${STAGE_LABEL[d.session.stage] || ""}`),
      h("div", { class: "two" },
        h("button", { class: "btn primary", onclick: resume }, "이어서 하기"),
        h("button", { class: "btn", onclick: goView("records") }, "기록 보기"))) : null,
    h("button", { class: "start", onclick: startAccident },
      h("span", { class: "disc" }, icon("alert")),
      h("span", { class: "st" }, h("span", { class: "sl" }, "사고 대응 시작"), h("span", { class: "ss" }, "등록 없이 바로 시작해요"))),
    h("div", { class: "card stack" },
      h("div", { class: "row spread" }, h("p", { class: "k" }, "내 보험 카드"), h("button", { class: "linkbtn inline", onclick: goView("profile") }, "편집")),
      line ? h("div", {}, h("p", { class: "h2" }, line), sub ? h("p", { class: "muted" }, sub) : null)
           : h("p", { class: "muted" }, "아직 등록하지 않았어요. 등록하지 않아도 사고 대응은 바로 시작할 수 있어요."),
      coverChips(p),
      h("p", { class: "muted lockline" }, icon("lock", "sm"), "이 폰에만 저장돼요. 서버로 보내지 않아요.")),
    h("details", { class: "card more" }, h("summary", {}, "사고 나면 이렇게 도와드려요"),
      h("ol", { class: "plain" },
        h("li", {}, "안전 먼저: 다친 사람·불·연기를 확인하고 119·112로 연결"),
        h("li", {}, "지금 할 일: 비상등, 대피, 차 이동을 하나씩"),
        h("li", {}, "사진: AI가 흐린 사진을 알려 주고 다시 찍게 도와요"),
        h("li", {}, "대화 코칭: 상대방과 이야기할 때 할 말을 한 줄씩"),
        h("li", {}, "마무리: 보험사에 말할 내용과 남은 일 정리"))),
  ];
}

// ---------- Records ----------
function recordItem(title, sub, chips, onclick, strong) {
  return h("button", { class: "item" + (strong ? " strong" : ""), onclick },
    h("span", { class: "ii" }, icon("list")),
    h("span", { class: "it" }, h("span", { class: "itt" }, title), h("span", { class: "its" }, sub), h("span", { class: "chips" }, chips)),
    icon("chevron"));
}

function recordsScreen() {
  const d = state.data, cur = ongoing() ? d.session.id : null;
  const saved = loadRecords().filter((r) => r.id !== cur);
  const chip = (r) => [h("span", { class: "chip " + (r.status === "done" ? "ok" : "hd") }, r.status === "done" ? "✓ 처리 완료" : "보험 처리 중"),
    r.status !== "done" && r.missing ? h("span", { class: "chip unk" }, `남은 일 ${r.missing}개`) : null];
  return [
    h("p", { class: "k" }, "진행 중"),
    ongoing()
      ? recordItem(fmtTime(d.session.created_at), STAGE_LABEL[d.session.stage] || "", [h("span", { class: "chip live" }, "현장 진행 중"),
        d.summary ? h("span", { class: "chip hd" }, `남은 일 ${d.summary.missing.length}개`) : null], () => { state.view = null; state.spokenKey = null; render(); }, true)
      : h("p", { class: "muted" }, "진행 중인 사고가 없어요."),
    h("p", { class: "k" }, "저장한 사고 기록"),
    saved.length ? saved.map((r) => recordItem(r.title, `${r.sub} · 남은 일 ${r.missing}개`, chip(r), () => { state.recId = r.id; state.view = "record"; render(); }))
      : h("p", { class: "muted" }, "저장한 기록이 없어요. 마무리 화면까지 가면 이 폰에 자동으로 저장돼요."),
    h("div", { class: "note" }, icon("lock"), h("p", {}, "기록은 이 폰에만 있어요. 보험 처리가 끝나면 상대방 연락처와 사진은 필요한 곳에 보낸 뒤 지울 수 있어요.")),
  ];
}

function recordScreen() {
  const list = loadRecords(), r = list.find((x) => x.id === state.recId);
  if (!r) { state.view = "records"; return recordsScreen(); }
  const copy = h("button", { class: "btn" }, icon("copy"), "내용 복사");
  copy.addEventListener("click", async () => { try { await navigator.clipboard.writeText(r.text); copy.textContent = "복사했어요 ✓"; } catch { copy.textContent = "복사하지 못했어요"; } });
  const toggle = () => { r.status = r.status === "done" ? "active" : "done"; saveRecords(list); render(); };
  const remove = () => { if (!confirm("이 기록을 이 폰에서 지울까요? 되돌릴 수 없어요.")) return; saveRecords(list.filter((x) => x.id !== r.id)); state.view = "records"; render(); };
  return [
    h("div", { class: "card stack" },
      h("h2", {}, r.title), h("p", { class: "muted" }, `${r.sub} · 남은 일 ${r.missing}개`),
      h("div", { class: "chips" }, h("span", { class: "chip " + (r.status === "done" ? "ok" : "hd") }, RECORD_STATUS[r.status]))),
    h("div", { class: "card" }, h("pre", { class: "rec-text" }, r.text)),
    copy,
    h("button", { class: "btn", onclick: toggle }, r.status === "done" ? "다시 '보험 처리 중'으로" : "처리 완료로 표시"),
    h("button", { class: "btn ghost", onclick: remove }, icon("trash"), "이 기록 지우기"),
    h("button", { class: "btn ghost", onclick: goView("records") }, "목록으로"),
  ];
}

// ---------- Settings ----------
function seg(options, current, pick) {
  return h("div", { class: "seg", role: "group" }, options.map(([value, label]) =>
    h("button", { type: "button", class: "opt", "aria-pressed": String(current === value), onclick: () => pick(value) }, label)));
}
function toggleRow(name, sub, on, flip) {
  return h("div", { class: "row spread" }, h("div", {}, h("p", { class: "rn" }, name), sub ? h("p", { class: "rs" }, sub) : null),
    h("button", { type: "button", class: "sw" + (on ? " on" : ""), role: "switch", "aria-checked": String(on), "aria-label": name, onclick: flip }, h("span", {})));
}

function exportBackup() {
  const data = { app: "ScenePilot", version: 1, profile: loadProfile(), insurer: store("insurer") || "", records: loadRecords() };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
  const a = h("a", { href: url, download: `scenepilot-backup-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function importBackup() {
  const input = h("input", { type: "file", accept: "application/json,.json", style: "display:none" });
  input.addEventListener("change", async () => {
    try {
      const data = JSON.parse(await input.files[0].text());
      if (data.app !== "ScenePilot" || typeof data.profile !== "object" || !Array.isArray(data.records)) throw new Error("not a backup");
      if (!confirm("이 폰의 내 보험과 기록을 백업 파일의 내용으로 바꿀까요?")) return;
      store("profile", JSON.stringify(data.profile)); store("insurer", data.insurer || null);
      saveRecords(data.records.filter((r) => r && typeof r.id === "string" && typeof r.text === "string"));
      state.error = null; render();
    } catch { state.error = "백업 파일을 읽지 못했어요. ScenePilot에서 만든 파일인지 확인하세요."; render(); }
    input.remove();
  });
  document.body.append(input); input.click();
}

function wipeAll() {
  if (!confirm("이 폰에 저장한 내 보험, 기록, 설정을 모두 지울까요? 되돌릴 수 없어요.")) return;
  ["profile", "insurer", "records", "calls", "coachmode", "aicoach", "onboarded"].forEach((k) => store(k, null));
  state.view = "home"; render();
}

function settingsScreen() {
  const link = (label, onclick, cls = "") => h("button", { class: "link " + cls, onclick }, label, icon("chevron", "sm"));
  const handsFree = voice.handsFree;
  const flipHands = () => { voice.handsFree = !voice.handsFree; store("handsfree", voice.handsFree ? "on" : "off"); if (!voice.handsFree) stopListening(); render(); };
  return [
    h("p", { class: "k" }, "언어"),
    h("div", { class: "card" }, h("div", { class: "row spread" },
      h("div", {}, h("p", { class: "rn" }, "화면과 음성 언어"), h("p", { class: "rs" }, "안내, 음성 인식, 코칭에 모두 적용돼요")),
      seg([["ko", "한국어"], ["en", "English"]], "ko", (v) => { if (v === "en") switchCountry(); }))),
    h("p", { class: "k" }, "긴급 전화 버튼 (화면 위 119·112)"),
    h("div", { class: "card stack" },
      seg(Object.entries(CALL_MODES), callMode(), (v) => { store("calls", v); applyCallButtons(); render(); }),
      h("p", { class: "rs" }, "긴급 화면과 위험 감지 화면의 큰 119·112 버튼은 이 설정과 상관없이 항상 보여요. 버튼을 눌러도 바로 걸리지 않고 전화 앱이 먼저 열려요.")),
    h("p", { class: "k" }, "음성"),
    h("div", { class: "card stack" },
      toggleRow("음성 안내", "질문과 할 일을 소리로 읽어 줘요", state.voiceOn, () => { $voice.click(); render(); }),
      toggleRow("말로 답하기", "버튼 대신 \"네\", \"다음\"처럼 말해도 돼요", handsFree, flipHands)),
    h("p", { class: "k" }, "대화 코칭"),
    h("div", { class: "card stack" },
      h("div", { class: "row spread" }, h("p", { class: "rn" }, "코칭 받는 방법"),
        seg([["screen", "화면+진동"], ["ear", "이어폰"]], watchState.mode, (v) => { watchState.mode = v; store("coachmode", v); render(); })),
      toggleRow("AI 코칭 (NVIDIA Nemotron)", "켜면 최근 몇 문장의 글자만 서버로 보내요. 끄면 기본 알림만 나와요", store("aicoach") === "on",
        () => { store("aicoach", store("aicoach") === "on" ? "off" : "on"); render(); })),
    h("p", { class: "k" }, "내 데이터 · 이 폰에만 저장"),
    h("div", { class: "card stack" },
      link("내 보험·기록 파일로 백업", exportBackup), link("백업 불러오기", importBackup), link("이 폰의 모든 기록 지우기", wipeAll, "danger")),
    h("p", { class: "k" }, "앱"),
    h("div", { class: "card stack" },
      link("질문하기", () => { openAsk(); }),
      link("시작 안내 다시 보기", () => { state.onb = 0; state.view = "onboarding"; render(); }),
      link("처음부터 다시 (진행 중인 사고 버리기)", restart),
      h("details", { class: "more" }, h("summary", {}, "앱 정보와 개인정보 안내"),
        h("ul", { class: "plain muted" }, consentPoints().map((point) => h("li", {}, point))))),
  ];
}

// ---------- First run ----------
const ONBOARD = [
  { h: ["사고 순간,", "할 일을 하나씩", "알려 드려요"], sub: "당황해도 괜찮아요. 말로 답하면 돼요.", feats: [
    ["안전이 먼저", "다친 사람과 불·연기를 먼저 확인하고 119·112로 연결해요."],
    ["상대방과 대화할 때 코칭", "무엇을 물어보고 무엇을 확인할지 한 줄씩 알려 드려요."],
    ["보험사에 말할 내용 준비", "사진과 정보를 모아 통화 전에 카드로 정리해요."]] },
  { h: ["세 가지를", "약속해요"], sub: "사고 순간에 믿고 쓸 수 있도록요.", feats: [
    ["위험하면 119·112가 먼저", "어떤 화면에서든 위쪽 버튼으로 바로 전화할 수 있어요."],
    ["판단하지 않아요", "과실, 보상액, 진료는 정하지 않아요. 보험사와 경찰, 의료진에게 확인하도록 도와요."],
    ["내 정보는 이 폰에만", "로그인 없이 써요. 보험 카드와 사고 기록은 서버에 저장하지 않아요."]] },
  { h: ["마이크와 위치를", "써도 될까요?"], sub: "처음 사고를 시작할 때 한 번만 물어봐요.", feats: [
    ["마이크", "질문에 말로 답하고, 상대방과 대화할 때 코칭을 받기 위해 써요. 소리는 저장하지 않아요."],
    ["위치", "119에 위치를 말할 때 써요."]], box: "허용하지 않아도 버튼으로 모두 쓸 수 있어요." },
  { h: ["보험 정보를", "미리 넣어 둘까요?"], sub: "현장에서 바로 보험사에 전화하고, 말할 내용을 준비해 드려요.", feats: [
    ["1분이면 돼요", "보험사, 사고접수 번호, 차량번호, 가입한 보장을 골라요."]], box: "모르는 보장은 '모름'으로 두면 돼요. 등록하지 않아도 사고 대응은 바로 시작할 수 있어요." },
];
function onboardingScreen() {
  const i = Math.min(state.onb || 0, ONBOARD.length - 1), s = ONBOARD[i], last = i === ONBOARD.length - 1;
  const finish = (to) => { store("onboarded", "1"); state.onb = 0; state.view = to; render(); };
  return [
    h("div", { class: "onb" },
      h("span", { class: "mark" }, icon("alert")),
      h("h1", { class: "q" }, s.h.flatMap((line, n) => [n ? h("br") : null, line])),
      h("p", { class: "sub" }, s.sub),
      s.feats.map(([t, x]) => h("div", { class: "feat" }, h("span", { class: "fi" }, icon("check")), h("div", {}, h("p", { class: "ft" }, t), h("p", { class: "fs" }, x)))),
      s.box ? h("p", { class: "boxnote" }, s.box) : null),
    h("div", { class: "dots" }, ONBOARD.map((_, n) => h("button", { class: "dotb", "aria-label": `${n + 1}번째 안내`, onclick: () => { state.onb = n; render(); } },
      h("span", { class: n === i ? "on" : "" })))),
    last ? h("button", { class: "btn answer big", onclick: () => finish("profile") }, "지금 등록하기")
         : h("button", { class: "btn answer big", onclick: () => { state.onb = i + 1; render(); } }, i === 0 ? "시작하기" : "다음"),
    h("button", { class: "btn ghost", onclick: () => finish("home") }, last ? "나중에 할게요" : "건너뛰고 홈으로"),
  ];
}

const KR_SCREENS = { home: homeScreen, records: recordsScreen, record: recordScreen, settings: settingsScreen, onboarding: onboardingScreen };
