// Korean text for the Korea edition. The app's own screens are written in English in app.js; when the session is Korean,
// every line the app draws passes through Ko.t(), which returns the Korean wording from the table below (or the line
// itself when it already is Korean, as every sentence from the server is). Nothing is sent or stored here.
"use strict";

(() => {
  let on = false;
  try { on = new URLSearchParams(window.location.search).has("ko"); } catch { /* no address bar: stay off */ }

  const norm = (s) => String(s).replace(/\s+/g, " ").trim().toLowerCase().replace(/[’]/g, "'");
  const STATE_KO = { florida: "플로리다", "new york": "뉴욕" };
  const stateKo = (name) => STATE_KO[norm(name)] || name;

  // ---------- Exact lines (keys are compared in lower case) ----------
  const RAW = {
    // header and steps
    "accident guide": "사고 안내",
    "consent": "동의", "safety": "안전", "photos": "사진", "wrap-up": "마무리", "summary": "요약",

    // consent
    "before you start": "시작하기 전에",
    "scenepilot guides you through an accident one step at a time and organizes your photos and statements. it does not decide who is at fault, what repairs cost, or anyone's legal responsibility. ai observations can be wrong. continue?":
      "ScenePilot은 사고 상황을 한 단계씩 안내하고 사진과 진술을 정리해 줍니다. 누구의 과실인지, 수리비가 얼마인지, 누구에게 법적 책임이 있는지는 판단하지 않습니다. AI 관찰은 틀릴 수 있습니다. 계속할까요?",
    "photos are sent to a server for ai analysis.": "사진은 AI 분석을 위해 서버로 전송됩니다.",
    "if you use ask a question, your question is sent to a server and answered by an ai model. do not include names or other personal details.":
      "'질문하기'를 쓰면 질문이 서버로 전송되어 AI 모델이 답합니다. 이름 등 개인 정보는 적지 마세요.",
    "in the demo, use example photos, not real accident information.": "데모에서는 실제 사고 정보가 아니라 예시 사진을 쓰세요.",
    "your phone may ask to share its location, so the app can suggest your state. the location stays on this phone.":
      "앱이 주(state)를 추천하도록 폰이 위치 공유를 물을 수 있습니다. 위치는 이 폰 안에만 남습니다.",
    "after you agree, the app asks its questions out loud and listens for your answer. you can answer by voice or by tapping. use the microphone button at the top to turn listening off.":
      "동의하면 앱이 질문을 소리 내어 읽고 답을 자동으로 듣습니다. 말로 답해도 되고 화면을 눌러도 됩니다. 듣기를 끄려면 위쪽 마이크 버튼을 누르세요.",
    "i couldn't hear you clearly. in a loud place, hold the phone close to your mouth or use earphones with a microphone, or tap your answer. tap try again to listen again.":
      "잘 들리지 않았어요. 시끄러운 곳에서는 폰을 입 가까이 대거나 마이크 달린 이어폰을 쓰거나 화면을 눌러 답하세요. '다시 시도'를 누르면 다시 듣습니다.",
    "if you answer by voice, your browser may send what you say to its own speech service.":
      "음성으로 답하면 브라우저가 말한 내용을 자체 음성 서비스로 보낼 수 있습니다.",
    "if anyone is hurt or in danger, call 911 first.": "다친 사람이 있거나 위험하면 먼저 119나 112에 전화하세요.",
    "the first time, your browser asks to use the microphone and location. allow both once and it will not ask again on this device. after that the app opens straight to the questions.":
      "처음에는 브라우저가 마이크와 위치 사용을 물어봅니다. 한 번 허용하면 이 기기에서는 다시 묻지 않고, 그다음부터는 앱이 바로 질문으로 시작합니다.",
    "tip: add scenepilot to your home screen so it opens like an app, ready to listen.": "팁: ScenePilot을 홈 화면에 추가하면 앱처럼 열리고 바로 듣기를 시작할 수 있어요.",
    "about this app": "이 앱에 대해",
    "scenepilot guides you through an accident one step at a time and organizes your photos and statements. it does not decide who is at fault, what repairs cost, or anyone's legal responsibility. ai observations can be wrong.":
      "ScenePilot은 사고 상황을 한 단계씩 안내하고 사진과 진술을 정리해 줍니다. 누구의 과실인지, 수리비가 얼마인지, 누구에게 법적 책임이 있는지는 판단하지 않습니다. AI 관찰은 틀릴 수 있습니다.",
    "show the start notice again": "시작 안내 다시 보기",
    "show the start notice again? this starts a new accident.": "시작 안내를 다시 볼까요? 새 사고가 시작됩니다.",
    "ask a question": "질문하기",
    "ask in your own words. the answer comes from an ai model that can only use scenepilot's reviewed notes and steps. it will not decide who is at fault, give legal or medical advice, or estimate costs.":
      "자기 말로 물어보세요. 답은 ScenePilot의 검수된 노트와 단계만 쓸 수 있는 AI 모델이 만듭니다. 누구의 과실인지 판단하거나, 법률·의료 조언을 하거나, 비용을 추정하지 않습니다.",
    "please agree to start first.": "먼저 동의하고 시작해 주세요.",
    "for example: do i have to report this in florida?": "예: 사고가 나면 꼭 경찰에 신고해야 하나요?",
    "ask": "질문하기", "speak your question": "음성으로 질문하기", "back to the steps": "안내 단계로 돌아가기",
    "looking that up…": "찾아보는 중…", "read aloud": "소리 내어 읽기",
    "this is general information, not legal or medical advice.": "일반 정보이며 법률·의료 조언이 아닙니다.",
    "ask your question, or say done.": "질문을 말하세요. 끝내려면 '그만'이라고 말하세요.",
    "say next, repeat, back, skip, or ask a question.": "다음, 다시, 뒤로, 건너뛰기, 질문 중 하나로 말하세요.",
    "say create summary, more photos, add details, or ask a question.": "요약, 사진 더, 세부 정보, 질문 중 하나로 말하세요.",
    "that is the most questions for one accident. please ask the police or your insurance company.": "한 사고에서 할 수 있는 질문 수를 다 썼어요. 경찰이나 보험사에 문의하세요.",
    "if anyone may be hurt, or you see smoke, fire, or fuel, call 911 now. stay on the line and follow the dispatcher's instructions. if it is safe, move away from the vehicles and out of traffic.":
      "다친 사람이 있을 수 있거나 연기, 불, 연료가 보이면 지금 911에 전화하세요. 끊지 말고 상담원의 지시를 따르세요. 안전하다면 차에서 떨어져 차량 흐름 밖으로 가세요.",
    "i can't answer that one safely. for questions about fault, legal matters, costs, or injuries, please ask the police, your insurance company, or a qualified professional.":
      "그 질문은 안전하게 답할 수 없어요. 과실, 법률, 비용, 부상에 관한 질문은 경찰, 보험사 또는 자격 있는 전문가에게 문의하세요.",
    "i couldn't reach the assistant just now. you can keep using the steps and buttons in the app.": "지금은 도우미에 연결할 수 없어요. 앱의 단계와 버튼은 계속 쓸 수 있어요.",
    "my info (optional)": "내 정보 (선택)",
    "your details are saved on this device. they are never sent to the server.": "내 정보는 이 기기에 저장되어 있습니다. 서버로는 절대 보내지 않습니다.",
    "add your vehicle and insurance details now so they are ready in an emergency. they stay on this device and are never sent to the server.":
      "응급 상황에 쓸 수 있도록 차량과 보험 정보를 미리 넣어 두세요. 이 기기에만 남고 서버로는 보내지 않습니다.",
    "edit my info": "내 정보 수정", "set up my info": "내 정보 입력하기",
    "agree and start": "동의하고 시작",

    // my info
    "my info": "내 정보",
    "everything here stays on this device. it is never sent to the server. it appears in your summary so you can read it out or copy it.":
      "여기 적은 내용은 이 기기에만 남고 서버로 보내지 않습니다. 요약에 함께 나와서 읽어 주거나 복사할 수 있습니다.",
    "your name": "이름", "your phone number": "전화번호", "home state": "사는 주(state)",
    "your vehicle (year, make, model, color)": "내 차량 (연식, 제조사, 모델, 색)",
    "your license plate": "내 번호판", "insurance company": "보험사", "policy number": "보험 증권 번호",
    "insurer claims phone number": "보험사 사고접수 전화번호",
    "emergency contact name": "비상 연락처 이름", "emergency contact phone": "비상 연락처 전화번호",
    "select a state": "주를 선택하세요",
    "save": "저장", "back": "뒤로", "delete my saved info": "저장된 내 정보 삭제",
    "delete the details saved on this device?": "이 기기에 저장된 정보를 삭제할까요?",
    "other states get general guidance.": "다른 주는 일반 안내를 받습니다.",
    "start over? you will no longer be able to open what you recorded so far on this device.":
      "처음부터 다시 시작할까요? 지금까지 기록한 내용을 이 기기에서 더 이상 열 수 없게 됩니다.",

    // safety questions
    "is anyone hurt, or do you see smoke, fire, or fuel?": "다친 사람이 있거나 연기, 불, 연료가 보이나요?",
    "can your vehicle be moved to a safe spot out of traffic?": "내 차를 차량 흐름 밖 안전한 곳으로 옮길 수 있나요?",
    "yes": "예", "no": "아니요", "not sure": "모르겠어요",
    "or type it (for example: nobody is hurt)": "또는 직접 입력 (예: 다친 사람 없어요)",
    "or answer in your own words": "또는 자기 말로 대답하기",
    "send": "보내기",
    "speak your answer": "음성으로 답하기",

    // emergency
    "safety first.": "안전이 먼저입니다.",
    "if there is smoke, fire, or fuel, get away from the vehicle first.": "연기, 불, 연료가 있으면 먼저 차에서 떨어지세요.",
    "call 911 now. stay on the line and follow the dispatcher's instructions.": "지금 911에 전화하세요. 전화를 끊지 말고 상담원의 지시를 따르세요.",
    "turn on your hazard lights. if it is safe, get out and move away from traffic, behind a guardrail if there is one.":
      "비상등을 켜세요. 안전하다면 차에서 내려 차량 흐름에서 떨어지세요. 가드레일이 있으면 그 뒤로 가세요.",
    "got it": "알겠어요",
    "tap this after you have made the call or confirmed you are safe. then we can continue with photos and notes.":
      "전화를 했거나 안전을 확인한 뒤에 누르세요. 그다음 사진과 메모를 이어서 진행합니다.",
    "we noted where you are from your phone's location, for your report. it stays on your phone.":
      "신고서에 쓸 수 있도록 폰 위치로 현재 있는 곳(주)을 기록했습니다. 위치는 폰 안에만 남습니다.",
    "say \"got it\"": "\"알겠어요\"라고 말하기",

    // guide: the list screen
    "take a breath. here is what to do now.": "숨을 한 번 쉬세요. 지금 할 일입니다.",
    "if they drive off, note their plate and call the police.": "상대가 떠나면 번호판을 적고 경찰에 전화하세요.",
    "turn on your hazard lights and stay out of traffic.": "비상등을 켜고 차량 흐름에서 벗어나 계세요.",
    "turn on your hazard lights. if it is safe, move out of traffic.": "비상등을 켜세요. 안전하다면 차량 흐름 밖으로 옮기세요.",
    "stay until you have exchanged information.": "정보를 교환할 때까지 계세요.",
    "exchange name, phone, insurance, and license plate.": "이름, 전화번호, 보험, 번호판을 교환하세요.",
    "stick to the facts.": "사실만 말하세요.",
    "call your insurance company.": "보험사에 전화하세요.",
    "where did the accident happen? some rules depend on the state.": "사고가 어느 주에서 났나요? 주마다 규칙이 다릅니다.",
    "i don't have details for that state. some places require a police report or a report to the state. check that state's official guidance.":
      "그 주에 대한 자세한 정보는 없습니다. 경찰 신고나 주 정부 신고가 필요한 곳이 있습니다. 그 주의 공식 안내를 확인하세요.",
    "that's okay. some places require a police report or a report to the state. check the official guidance for the state you are in.":
      "괜찮습니다. 경찰 신고나 주 정부 신고가 필요한 곳이 있습니다. 지금 있는 주의 공식 안내를 확인하세요.",
    "all steps": "전체 단계",
    "repeat": "다시 듣기", "next": "다음", "skip to photos": "사진 촬영으로 건너뛰기", "continue to photos": "사진 촬영으로 계속",
    "use my location": "내 위치 사용", "finding your location…": "위치를 찾는 중…",
    "another state": "다른 주", "yes, another state": "예, 다른 주예요",
    "yes, florida": "예, 플로리다", "yes, new york": "예, 뉴욕", "florida": "플로리다", "new york": "뉴욕",
    "location needs a secure (https) connection and a browser that can share it. choose the state below.":
      "위치 기능은 보안 연결(HTTPS)과 위치를 공유할 수 있는 브라우저가 필요합니다. 아래에서 주를 직접 고르세요.",
    "your location stays on this phone. it is only used to suggest a state.": "위치는 이 폰 안에만 남고, 주를 추천하는 데만 쓰입니다.",
    "if that is not right, choose the state yourself below.": "맞지 않으면 아래에서 주를 직접 고르세요.",
    "source:": "출처:",

    // photo screen / checklist
    "wide shot of the scene": "현장 전체 사진",
    "take a photo of both vehicles and the road.": "양쪽 차량과 도로가 모두 나오게 찍으세요.",
    "other vehicle and license plate": "상대 차량과 번호판",
    "take a photo of the other vehicle and its license plate.": "상대 차량과 번호판이 나오게 찍으세요.",
    "damage": "손상 부위",
    "take a close, clear photo of the damaged area.": "손상된 부위를 가까이에서 또렷하게 찍으세요.",
    "your vehicle": "내 차량",
    "take a photo that shows your whole vehicle.": "내 차량 전체가 나오게 찍으세요.",
    "road conditions": "도로 상황",
    "take a photo of the road and any signs.": "도로와 표지판이 나오게 찍으세요.",
    "other driver's documents (optional)": "상대 운전자 서류 (선택)",
    "if they agree, photograph the other driver's insurance card.": "상대가 동의하면 상대 운전자의 보험 카드를 찍으세요.",
    "only take photos where you are safe.": "안전한 곳에서만 사진을 찍으세요.",
    "take photo": "사진 찍기", "choose from library": "앨범에서 선택", "skip": "건너뛰기",
    "stop here and go back": "여기서 멈추고 돌아가기",
    "pick a reason for skipping. it will be recorded in the summary.": "건너뛰는 이유를 고르세요. 요약에 기록됩니다.",
    "the other driver said no": "상대 운전자가 거절했어요", "not safe to take it": "찍기에 안전하지 않아요", "not applicable": "해당 없음",
    "evidence photos": "증거 사진", "core photos": "필수 사진", "extra (can wait)": "추가 (나중에 해도 됨)",
    "taken": "촬영함", "retake": "다시 찍기", "skipped": "건너뜀", "waiting": "대기 중",
    "photo accepted.": "사진이 접수되었어요.",
    "the photo is blurry or too dark. hold still, tap to focus, and try again.": "사진이 흐리거나 너무 어두워요. 가만히 들고 화면을 눌러 초점을 맞춘 뒤 다시 찍으세요.",
    "that is not the shot i need for this step. please follow the instruction and try again.": "이 단계에서 필요한 사진이 아니에요. 안내대로 다시 찍어 주세요.",
    "i can't see both vehicles. step back so the road and both vehicles fit in the photo, then try again.": "두 차량이 다 보이지 않아요. 뒤로 물러나 도로와 두 차량이 다 들어오게 다시 찍으세요.",
    "i can't read the license plate. move closer so the plate fills more of the photo, then try again.": "번호판이 읽히지 않아요. 번호판이 더 크게 나오도록 가까이에서 다시 찍으세요.",
    "i can't see the damage clearly. move closer to the damaged area and take the photo again.": "손상 부위가 또렷하게 보이지 않아요. 더 가까이에서 다시 찍으세요.",
    "the ai is looking at your photo. this takes 5 to 10 seconds…": "AI가 사진을 보고 있어요. 5~10초 걸립니다…",

    // hub / info
    "core photos are done": "필수 사진을 모두 찍었어요",
    "the essential photos are done. you can create the summary now, or finish the rest when it is safe.": "필수 사진을 다 찍었어요. 지금 요약을 만들거나, 안전할 때 나머지를 마저 찍어도 됩니다.",
    "create summary": "요약 만들기", "add details": "세부 정보 추가",
    "after you create the summary you can still come back with 'add more' to add photos and details. opening this same address on this device lets you continue.":
      "요약을 만든 뒤에도 '더 추가하기'로 돌아와 사진과 정보를 더할 수 있습니다. 이 기기에서 같은 주소를 열면 이어서 할 수 있어요.",
    "more details": "추가 정보",
    "add any other details you have, or go straight to the summary.": "다른 정보가 있으면 적고, 없으면 바로 요약으로 가세요.",
    "anything left blank is listed under 'not confirmed'.": "비워 둔 항목은 '확인되지 않은 항목'에 표시됩니다.",
    "add any other details you have, or go straight to the summary. anything left blank is listed under 'not confirmed'.":
      "다른 정보가 있으면 적고, 없으면 바로 요약으로 가세요. 비워 둔 항목은 '확인되지 않은 항목'에 표시됩니다.",
    "what happened": "무슨 일이 있었나요", "describe what happened, as you saw it.": "본 대로 무슨 일이 있었는지 적어 주세요.",
    "other vehicle license plate": "상대 차량 번호판", "other vehicle (make, model, color)": "상대 차량 (제조사, 모델, 색)",
    "other driver contact": "상대 운전자 연락처", "other driver insurance": "상대 운전자 보험", "witnesses": "목격자",
    "speak": "말하기", "unconfirmed": "미확인", "yes, confirm": "예, 맞아요",
    "view summary": "요약 보기", "save and go back": "저장하고 돌아가기",
    "creating your summary…": "요약을 만드는 중…", "saving…": "저장하는 중…", "working…": "처리 중…", "starting…": "시작하는 중…",

    // summary
    "claim summary": "사고 요약",
    "every item shows its source. 'ai observation' items are for reference only and are not verified.": "모든 항목에 출처가 표시됩니다. 'AI 관찰' 항목은 참고용이며 검증되지 않았습니다.",
    "basic info": "기본 정보", "injuries and emergency": "부상과 응급 상황", "your statement": "내 진술",
    "ai observations (unverified)": "AI 관찰 (검증되지 않음)", "other driver and witnesses": "상대 운전자와 목격자",
    "not confirmed": "확인되지 않은 항목", "(none)": "(없음)", "time": "시각",
    "state where the accident happened": "사고가 난 주", "situation level (rule-based)": "상황 단계 (규칙으로 판정)",
    "emergency": "응급", "caution": "주의", "standard": "일반",
    "not asked": "묻지 않음", "no answer": "답 없음", "not taken": "찍지 않음", "unclear, needs a retake": "불명확, 다시 찍어야 함",
    "no visible damage": "눈에 보이는 손상 없음", "looks minor": "경미해 보임", "looks significant": "상당해 보임", "can't tell": "판단 불가",
    "your account of what happened": "무슨 일이 있었는지에 대한 내 설명",
    "ai observation, unverified": "AI 관찰, 검증 안 됨", "recorded automatically": "자동 기록", "photo": "사진",
    "this summary does not decide who is at fault, what repairs cost, or anyone's legal responsibility. it is a record of facts; your insurance company and qualified professionals make the final decisions.":
      "이 요약은 누구의 과실인지, 수리비가 얼마인지, 누구에게 법적 책임이 있는지를 판단하지 않습니다. 사실을 기록한 것이며 최종 판단은 보험사와 자격을 갖춘 전문가가 합니다.",
    "your details": "내 정보",
    "entered by you and kept on this device. not part of the server summary above, but included when you copy it.":
      "직접 입력했고 이 기기에만 저장됩니다. 위 서버 요약에는 들어 있지 않지만 복사할 때는 함께 들어갑니다.",
    "copy summary": "요약 복사", "copied ✓": "복사됨 ✓", "could not copy": "복사하지 못했어요",
    "enter your insurer's claims phone number": "보험사 사고접수 전화번호를 입력하세요",
    "call your insurer": "보험사에 전화", "add more (photos or details)": "더 추가하기 (사진 또는 정보)",
    "start a new accident": "새 사고 시작하기",
    "your statement.": "내 진술",

    // voice
    "listening…": "듣는 중…", "voice": "음성", "stop": "중지", "try again": "다시 시도",
    "say yes, no, or not sure.": "예, 아니요, 모르겠어요 중 하나로 말하세요.",
    "say \"got it\" when you have made the call or you are safe.": "전화했거나 안전하면 \"알겠어요\"라고 말하세요.",
    "say florida, new york, another state, or not sure.": "Florida, New York, another state, not sure 중 하나로 말하세요.",
    "say next, repeat, back, or skip.": "다음, 다시, 뒤로, 건너뛰기 중 하나로 말하세요.",
    "say create summary, more photos, or add details.": "요약, 사진 더, 세부 정보 중 하나로 말하세요.",
    "i have no location suggestion to confirm. say the state.": "확인할 위치 추천이 없어요. 주 이름을 말하세요.",
    "there are no more photos to take.": "더 찍을 사진이 없어요.",
    "microphone permission was denied. you can allow it in your browser settings, or use the buttons.": "마이크 권한이 거부되었어요. 브라우저 설정에서 허용하거나 버튼을 쓰세요.",
    "i didn't hear anything.": "아무 소리도 듣지 못했어요.",
    "no microphone was found.": "마이크를 찾지 못했어요.",
    "voice recognition needs an internet connection.": "음성 인식에는 인터넷 연결이 필요해요.",
    "voice recognition failed. use the buttons instead.": "음성 인식에 실패했어요. 버튼을 쓰세요.",
    "could not start the microphone. use the buttons instead.": "마이크를 시작하지 못했어요. 버튼을 쓰세요.",
    "voice answers need a secure (https) page and a browser that supports speech recognition. use the buttons instead.":
      "음성 답변에는 보안(HTTPS) 페이지와 음성 인식을 지원하는 브라우저가 필요해요. 버튼을 쓰세요.",

    // server errors shown in a banner
    "choose a state first, or tap not sure.": "먼저 주를 고르거나 'Not sure'를 누르세요.",
    "please finish the core scene photos first.": "먼저 필수 사진을 찍어 주세요.",
    "there are no extra photos left.": "남은 추가 사진이 없어요.",
    "there are no photo steps left.": "남은 사진 단계가 없어요.",
    "session not found.": "세션을 찾을 수 없어요.",
    "the file is empty.": "파일이 비어 있어요.",
    "not allowed before the user has agreed to start.": "동의하기 전에는 할 수 없어요.",
    "the state is chosen automatically only in an emergency.": "주 자동 선택은 응급일 때만 가능해요.",

    // test-mode banners
    "test mode: spoken answers are simulated (?fakespeech). remove it from the address to use the real microphone.":
      "테스트 모드: 음성 답변을 가짜로 재생합니다 (?fakespeech). 실제 마이크를 쓰려면 주소에서 지우세요.",

    // state notes (draft summaries of statutes; the English wording is what the app shows)
    "state-specific guidance is available for florida and new york. other states get general guidance.":
      "Florida와 New York은 주별 안내가 있습니다. 다른 주는 일반 안내를 받습니다.",
    "plain-language summaries of state statutes, for general information only. not legal advice. the wording is a draft that the team has not yet checked line by line against the statute text.":
      "주 법령을 쉬운 말로 요약한 것으로 일반 정보일 뿐 법률 자문이 아닙니다. 문구는 아직 팀이 법령 원문과 한 줄씩 대조하지 않은 초안입니다.",
    "when to report": "신고해야 하는 경우",
    "stop and share information": "멈추고 정보 공유하기",
    "if no one is there": "아무도 없을 때",
    "vehicles blocking traffic": "차량이 교통을 막을 때",
    "leaving the scene": "현장을 떠나는 경우",
    "if the owner is not there": "소유자가 없을 때",
    "if you injure someone": "누군가를 다치게 했을 때",
    "in florida, report the crash right away if anyone is hurt or killed, or if damage to a vehicle or other property looks like $2,000 or more. report to the local police, the sheriff's office, or the nearest florida highway patrol office.":
      "플로리다: 다치거나 사망한 사람이 있거나, 차량 등 재산 피해가 2,000달러 이상으로 보이면 즉시 신고하세요. 현지 경찰, 보안관 사무소, 가까운 플로리다 고속도로 순찰대 사무소에 신고합니다.",
    "stop at the scene and stay until you have given your name, address, and vehicle registration number to the other driver or anyone injured. show your driver license if asked. give reasonable help to anyone who is hurt.":
      "현장에 멈추고, 상대 운전자나 다친 사람에게 이름, 주소, 차량 등록번호를 전달할 때까지 머무세요. 요구하면 운전면허증을 보여 주세요. 다친 사람에게는 합리적인 도움을 주세요.",
    "if no one is there to receive your information and no officer is present, report the crash to the nearest police office as soon as you can.":
      "정보를 받을 사람이 없고 경찰관도 없으면 가능한 한 빨리 가까운 경찰서에 사고를 신고하세요.",
    "if a damaged vehicle is blocking traffic, make reasonable efforts to move it or have it moved.":
      "파손된 차량이 교통을 막고 있으면 합리적인 범위에서 차를 옮기거나 옮기게 하세요.",
    "in florida, leaving the scene of a crash that caused only property damage is a second-degree misdemeanor.":
      "플로리다: 재산 피해만 낸 사고 현장을 떠나는 것은 2급 경범죄입니다.",
    "in new york, each driver must send a written report to the dmv within 10 days if anyone was hurt or killed, or if damage to any one person's property was more than $1,000.":
      "뉴욕: 다치거나 사망한 사람이 있거나 한 사람의 재산 피해가 1,000달러를 넘으면, 각 운전자가 10일 안에 DMV에 서면 보고서를 보내야 합니다.",
    "stop and show your license and insurance id card. give your name, address, insurer, policy details, and license number to the other driver or the property owner.":
      "멈추고 면허증과 보험 카드를 보여 주세요. 상대 운전자나 재산 소유자에게 이름, 주소, 보험사, 증권 정보, 면허 번호를 전달하세요.",
    "if the property owner is not there, report the crash to the nearest police station or a judicial officer as soon as you are physically able.":
      "재산 소유자가 없으면 몸을 움직일 수 있게 되는 즉시 가까운 경찰서나 사법 담당관에게 사고를 신고하세요.",
    "if you injure someone, give the same information to the injured person if practical, and to a police officer. if no officer is nearby, report to the nearest police station as soon as you can.":
      "누군가를 다치게 했다면 가능한 경우 그 사람에게, 그리고 경찰관에게 같은 정보를 전달하세요. 근처에 경찰관이 없으면 가능한 한 빨리 가까운 경찰서에 신고하세요.",
    "in new york, leaving the scene after damaging property is a traffic infraction. after injuring someone it can be a misdemeanor or a felony.":
      "뉴욕: 재산을 파손하고 현장을 떠나는 것은 교통 위반입니다. 사람을 다치게 하고 떠나면 경범죄 또는 중범죄가 될 수 있습니다.",

    // ---- Korea edition: redesigned screens, menu, conversation watch ----
    "spoken guidance": "소리 안내",
    "voice answers": "음성 답변",
    "conversation watch": "대화 감시",
    "start over": "처음부터 다시",
    "menu": "메뉴",
    "progress": "진행 단계",
    "turn spoken guidance on or off": "소리 안내 켜기/끄기",
    "voice answers on or off": "음성 답변 켜기/끄기",
    "switch the language? this starts a new accident.": "언어를 바꿀까요? 새 사고가 시작됩니다.",
    "go back to the first screen? this starts a new accident.": "첫 화면으로 돌아갈까요? 새 사고가 시작됩니다.",
    "your details (entered by you, kept on your device)": "내 정보 (직접 입력, 이 기기에만 저장)",
    "calm help, right at the scene.": "사고 현장에서, 차분하게 도와드립니다.",
    "answer two quick questions. we guide you through photos, details, and who to call.": "질문 두 개에 답해 주세요. 사진, 정보, 전화할 곳까지 안내해 드립니다.",
    "what happens to my data?": "내 데이터는 어떻게 되나요?",
    "scenepilot does not decide who is at fault, what repairs cost, or anyone's legal responsibility. ai observations can be wrong. if anyone is hurt or in danger, call 911 first.": "ScenePilot은 누구의 과실인지, 수리비가 얼마인지, 누구에게 법적 책임이 있는지 판단하지 않습니다. AI 관찰은 틀릴 수 있습니다. 다친 사람이 있거나 위험하면 먼저 119나 112에 전화하세요.",
    "or just say it": "또는 말로 답하세요",
    "type your answer instead": "대신 직접 입력하기",
    "in your own words": "자기 말로",
    "your question": "질문",
    "type your answer": "답 입력",
    "while you talk with the other driver, the app listens for a few phrases and quietly reminds you of one thing, such as sticking to the facts. it never decides who is at fault.": "상대 운전자와 이야기하는 동안 앱이 몇 가지 말을 듣고, 사실만 말하라는 식의 짧은 알림을 조용히 드립니다. 누구의 과실인지는 절대 판단하지 않습니다.",
    "use earphones, so the other driver does not hear the reminders and the phone does not hear itself.": "이어폰을 쓰세요. 상대 운전자가 알림을 듣지 않고, 폰이 자기 소리를 다시 듣지 않습니다.",
    "the app cannot tell who is speaking, so a reminder may be about what the other person said.": "앱은 누가 말하는지 구분하지 못해서, 알림이 상대방이 한 말에 대한 것일 수도 있어요.",
    "nothing heard is saved or sent by scenepilot. your browser may send the audio to its own speech service.": "ScenePilot은 들은 내용을 저장하지 않고, 'AI 코칭'을 켜지 않으면 서버로 보내지도 않습니다. 다만 브라우저가 소리를 자체 음성 서비스로 보낼 수 있어요.",
    "rules about recording conversations differ by state. tell the other driver you are using it if you are unsure.": "앱은 대화를 녹음하지 않습니다. 그래도 상대 운전자에게 앱을 쓰고 있다고 미리 알려 주는 것이 좋아요.",
    "keep this screen open while it listens. in a loud place it may miss words. this is a draft and not legal advice.": "듣는 동안 이 화면을 열어 두세요. 시끄러운 곳에서는 말을 놓칠 수 있습니다. 이 기능은 초안이며 법률 자문이 아닙니다.",
    "start listening": "듣기 시작",
    "stop listening": "듣기 중지",
    "playing a reminder": "알림 재생 중",
    "listening": "듣는 중",
    "reminders appear here when one is spoken.": "알림이 나오면 여기에 표시됩니다.",
    "listening needs a secure (https) page and a browser that supports speech recognition.": "듣기에는 보안(HTTPS) 페이지와 음성 인식을 지원하는 브라우저가 필요해요.",
    "speak your answer": "음성으로 답하기",
  };
  const DICT = new Map(Object.entries(RAW).map(([k, v]) => [norm(k), v]));

  // ---------- Lines with numbers or names in them ----------
  const acc = (m) => (m ? ` (정확도 약 ${m} m)` : "");
  const PATTERNS = [
    [/^safety check (\d+) of (\d+)$/, (m) => `안전 점검 ${m[1]}/${m[2]}`],
    [/^could not load the reminders\. (.+)$/, (m) => `알림을 불러오지 못했어요. ${m[1]}`],
    [/^safety check (\d+)\/(\d+)$/, (m) => `안전 점검 ${m[1]}/${m[2]}`],
    [/^what to do now (\d+)\/(\d+)$/, (m) => `지금 할 일 ${m[1]}/${m[2]}`],
    [/^core photo (\d+)\/(\d+)$/, (m) => `필수 사진 ${m[1]}/${m[2]}`],
    [/^extra photo (\d+)\/(\d+)$/, (m) => `추가 사진 ${m[1]}/${m[2]}`],
    [/^take more photos \((\d+) left\)$/, (m) => `사진 더 찍기 (${m[1]}장 남음)`],
    [/^(florida|new york) - (.+)$/, (m) => `${stateKo(m[1])} - ${gloss(m[2]) || m[2]}`],
    [/^your phone's location looks like (.+?)\.(?: \(accurate to about (\d+) m\))? is that right\?$/,
      (m) => `폰 위치로 보면 ${stateKo(m[1])}인 것 같아요.${acc(m[2])} 맞나요?`],
    [/^you seem to be outside (.+?)\.(?: \(accurate to about (\d+) m\))? i only have state notes for those two\.$/,
      (m) => `${m[1].replace(/Florida/, "Florida").replace(/ or /, " · ")} 밖에 계신 것 같아요.${acc(m[2])} 주별 안내는 그 두 곳만 있어요.`],
    [/^you may be near a state line, so i can't be sure\.(?: \(accurate to about (\d+) m\))?(?: the closest of my states is (.+?)\.)? please pick the state you are in\.$/,
      (m) => `주 경계 근처일 수 있어서 확신할 수 없어요.${acc(m[1])}${m[2] ? ` 가장 가까운 안내 주는 ${stateKo(m[2])}입니다.` : ""} 지금 있는 주를 골라 주세요.`],
    [/^call (.+)$/, (m) => `${m[1]}에 전화`],
    [/^please retake it: (.+)$/, (m) => `다시 찍어 주세요: ${gloss(m[1]) || m[1]}`],
    [/^sorry, i didn't catch that\. (.+)$/, (m) => `잘 못 들었어요. ${gloss(m[1]) || m[1]}`],
    [/^i heard "(.*)", but i didn't understand\. (.+)$/, (m) => `"${m[1]}"라고 들었지만 이해하지 못했어요. ${gloss(m[2]) || m[2]}`],
    [/^(.+) \(reason: (.+)\)$/, (m) => `${gloss(m[1]) || m[1]} (이유: ${gloss(m[2]) || m[2]})`],
    [/^(.+) \(not yet confirmed\)$/, (m) => `${m[1]} (아직 확인 안 됨)`],
    [/^(.+): needs your confirmation$/, (m) => `${gloss(m[1]) || m[1]}: 확인이 필요해요`],
    [/^(.+) - visible damage$/, (m) => `${gloss(m[1]) || m[1]} - 눈에 보이는 손상`],
    [/^(.+) - observation$/, (m) => `${gloss(m[1]) || m[1]} - 관찰`],
    [/^(.+): (taken|unclear, needs a retake|skipped|not taken)( \(reason: .+\))?$/,
      (m) => `${gloss(m[1]) || m[1]}: ${gloss(m[2]) || m[2]}${m[3] ? ` (이유: ${gloss(m[3].slice(9, -1)) || m[3].slice(9, -1)})` : ""}`],
    [/^(.+) \(suggested by your phone's location, confirmed by you\)$/, (m) => `${stateKo(m[1])} (폰 위치로 추천, 본인이 확인함)`],
    [/^(.+) \(set automatically from your phone's location during an emergency; not confirmed\)$/, (m) => `${stateKo(m[1])} (응급 상황에서 폰 위치로 자동 설정, 확인 안 됨)`],
    [/^(.+) \(guidance available\)$/, (m) => `${m[1]} (주별 안내 있음)`],
    [/^state-specific guidance is available for (.+?)\. other states get general guidance\.$/, () => "해당 주는 주별 안내가 있습니다. 다른 주는 일반 안내를 받습니다."],
    [/^test mode: the location is simulated \((.+)\)\. remove \?fakeloc from the address to use the real gps\.$/,
      (m) => `테스트 모드: 위치를 가짜로 설정했습니다 (${m[1]}). 실제 GPS를 쓰려면 주소에서 ?fakeloc을 지우세요.`],
    [/^the request failed \((\d+)\)\.$/, (m) => `요청에 실패했어요 (${m[1]}).`],
    [/^not allowed in the current stage \((.+?)\)\. required stage: (.+)$/, () => "지금 단계에서는 할 수 없는 동작이에요."],
    [/^unsupported file type \(.+\)\. only jpeg, png, and webp are allowed\.$/, () => "지원하지 않는 파일 형식이에요. jpeg, png, webp만 가능해요."],
    [/^the image is too large \(max (\d+) mb\)\.$/, (m) => `이미지가 너무 커요 (최대 ${m[1]} MB).`],
    [/^photos are not accepted in the current stage \((.+)\)\.$/, () => "지금 단계에서는 사진을 받을 수 없어요."],
  ];

  const PATTERNS_I = PATTERNS.map(([re, fn]) => [new RegExp(re.source, "i"), fn]);

  function gloss(text) {
    const key = norm(text);
    if (!key) return null;
    if (DICT.has(key)) return DICT.get(key);
    // patterns run on the original wording (names keep their capitals), with spaces tidied
    const tidy = String(text).replace(/\s+/g, " ").trim().replace(/[’]/g, "'");
    for (const [re, fn] of PATTERNS_I) {
      const m = re.exec(tidy);
      if (m) return fn(m);
    }
    return null;
  }

  const HAS_LATIN = /[A-Za-z]/;
  /** The Korean wording for a line, or the line itself when it has none (already Korean, or not a sentence). */
  function t(text) {
    if (text == null) return text;
    const ko = gloss(text);
    return ko == null ? text : ko;
  }

  /** Lines that still have Latin letters and no Korean wording (for the self-check in the tests). */
  function missing(text) {
    return HAS_LATIN.test(text) && gloss(text) == null;
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { gloss, t, missing, DICT, PATTERNS };
  else window.Ko = { gloss, t, missing };
})();
