# ScenePilot 인계 문서 (2026-10-24)

새 컴퓨터, 새 Claude 세션에서 **이전 대화 없이** 이어서 작업하기 위한 문서입니다. 코드로 확인되는 사실만 적었고, 확인하지 못한 것은 "미확인"으로 표시했습니다. 먼저 이 문서를 읽고, 그다음 `README.md`와 `android-app/README.md`를 읽으세요.

## 0. 새 세션에 붙여 넣을 첫 메시지

```text
ScenePilot 프로젝트를 이어서 작업합니다. 이전 대화 기록은 없습니다.
먼저 docs/HANDOFF.md, README.md, android-app/README.md를 읽고 현재 상태를 3줄로 요약해 주세요.
규칙: 한국어로 답하세요. 커밋과 푸시는 제가 요청할 때만 하세요. API 키는 절대 출력하거나 채팅에 쓰지 마세요.
큰 변경(규칙, 데이터, 구조)은 먼저 제안하고 제 확인을 받으세요. 이번에 할 일은 HANDOFF.md의 "남은 일" 중 제가 고른 것입니다.
```

## 1. 한 줄 요약과 일정

- **ScenePilot**: 교통사고 직후 운전자에게 한 단계씩 안내하고, 증거 사진이 충분한지 확인하며, 출처 태그가 붙은 사고 요약을 만들어 주는 앱(웹 + 안드로이드). 대상은 **미국 운전자(영어, 911)**.
- **Nebius x NVIDIA Global AI Hackathon**, 트랙 **Best Apps and Agents**.
- **제출 마감 2026-10-30 10:00 PT(한국 10/31 02:00). 팀 내부 마감 10/29.** 오늘(10/24) 기준 5일 남았습니다.
- 제출물: 작동하는 데모 URL, 영어 설명, **공개 저장소 + 오픈소스 라이선스(About에 표시)**, README(NVIDIA 모델과 Token Factory 사용 위치 강조), **3분 미만 공개 YouTube 영상**, 트랙 선택, Nebius/NVIDIA 도구 피드백. 데모는 **심사 종료까지 무료로 제한 없이** 쓸 수 있어야 합니다. 규정 원문은 `ScenePilot_인계/Nebius_인계문서_20261020.md` 2장과 https://nebiusglobalaihackathon.devpost.com/rules 를 제출 전에 다시 읽으세요.
- 저장소: https://github.com/kiri5358/scenepilot (브랜치 `main`, 커밋 `bc4a0d5` 이후 이어서). **LICENSE 파일이 아직 없습니다.**

## 2. 바꾸면 안 되는 원칙

1. **규칙이 결정하고, AI는 관찰하고 돕기만 합니다.** 응급 여부, 사진 통과 여부, 단계 이동, 안내 문구는 코드가 정합니다. 모델은 이를 바꿀 수 없습니다.
2. **과실, 수리비, 법적 책임, 의료 판단, "무엇을 말하거나 서명하라"는 조언은 하지 않습니다.** 모델 문장은 금지 출력 검사를 통과해야 보입니다.
3. **애매하거나 못 알아들은 답은 위험한 쪽으로 처리합니다.** 두 번 못 알아들으면 "모르겠어요"로 기록됩니다.
4. **법령 안내는 공식 출처가 있는 것만**, 출처 링크와 판본 정보를 붙여서 보여줍니다. 현재 플로리다와 뉴욕만 있고 **검수 전 초안**(`reviewed: false`)입니다.
5. 사용자 개인 정보("내 정보" 카드)는 **기기 안에만** 저장하고 서버로 보내지 않습니다. 위치 좌표도 기기 안에서만 주 판별에 씁니다.

## 3. 현재 구현 상태 (테스트 219개 통과)

| 영역 | 상태 | 핵심 파일 |
|---|---|---|
| 상태기계(동의→안전→응급 안내→안내→사진→허브→정보→요약) | 완료 | `session.py` |
| 안전 질문 7개와 응급 규칙(emergency/serious/caution/none) | 완료 | `emergency.py` |
| 단계별 안내(심각용 6단계 + 표준 8단계 + 주 질문 + 주별 노트) | 완료 | `playbooks.py`, `states.py`, `data/state_notes.json` |
| 사진 분석(Nemotron VL)과 체크리스트 통과 규칙 | 완료 | `vision.py`, `checklist.py`, `guard.py` |
| **자유 질문 도우미**(말이나 글로 질문, Nemotron + 도구 호출) | 완료 | `assistant.py`, 화면 `app.js`(askScreen) |
| **음성 안내**(고정 문장 60개는 NVIDIA Magpie TTS로 미리 합성, 나머지는 기기 음성) | 완료 | `prompt_audio.py`, `tools/synthesize_prompts.py`, `static/audio/` |
| 음성 입력(기본 hands-free: 질문 읽기 → 듣기 → 다음) | 완료, 실제 폰 소음 시험 필요 | `speech.js`, `app.js` |
| 소음 대응(인식 후보 5개를 서버가 모두 읽음, 엇갈리면 "모르겠어요") | 완료 | `emergency.py`(`parse_alternatives`), `speech.js`, `native-speech.js` |
| 위치로 주 추천, 응급이면 질문 없이 자동 기록 | 완료 | `geo.js`, `app.js` |
| 동의를 기기에 기억(두 번째부터 바로 첫 질문) | 완료 | `app.js`(CONSENT_VERSION = "2") |
| 한국어 보조(`?ko`) | 완료 | `ko.js` |
| **안드로이드 앱**(Capacitor, 웹 코드는 그대로 감쌈) | 틀 완료, 폰에서 설치까지 확인, 세부 시험 남음 | `android-app/` |
| 배포(HTTPS, 심사용 URL) | **미착수** (Dockerfile만 있고 빌드 안 해 봄) | `Dockerfile`, README Deploy |

시험 모드: `?fakeloc=fl|ny|border|other|denied`(위치 흉내), `?fakespeech=No|Yes|next`(음성 흉내), `?ko`(한국어 뜻풀이).

## 4. NVIDIA 오픈소스 모델 사용 (제출 설명에 정확히 쓸 것)

| 어디에 | 모델 | 상태 |
|---|---|---|
| 사진 이해 | `nvidia/Nemotron-3.5-Super-VL` (Nebius Token Factory) | 런타임 호출 |
| 자유 질문(도구 호출 에이전트) | `nvidia/nemotron-3-super-120b-a12b` (Nebius, `SCENEPILOT_ASSISTANT_MODEL`) | 런타임 호출 |
| 음성 안내 | NVIDIA Magpie TTS Multilingual (`Aria.Calm` 목소리), 미리 합성한 mp3 60개 | 파일로 포함 |
| 음성 인식 | **NVIDIA 모델 아님**(브라우저/안드로이드 기본 인식기) | 후보: Nemotron ASR, Parakeet (미구현) |

- Nebius Token Factory 모델 목록(30개)에 **음성 모델은 없습니다.** NVIDIA 음성 모델은 build.nvidia.com 체험 호스팅 또는 별도 GPU 서버가 필요합니다. 체험 호스팅은 호출 제한이 있어 "심사 기간 무제한 무료" 요건에 위험합니다.
- 코드에서 `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` 설정은 쓰지 않아서 지웠습니다.
- 자유 질문의 안전 장치(`assistant.py`): ① 부상, 화재 등 위험 단어는 모델을 거치지 않고 고정 911 문구 ② 모델은 도구(검수된 주 노트 등)로만 사실을 얻음 ③ 모델 답을 문장 단위로 검사(거절 문장은 허용, 판단 문장은 차단, 한 번 재시도 후 고정 문구) ④ 질문 500자, 사고당 30개, 도구 3회 제한.

## 5. 새 컴퓨터 준비

```bash
git clone https://github.com/kiri5358/scenepilot.git
cd scenepilot
uv sync                      # Python 3.13 (.python-version)
cd android-app && npm install && cd ..
uv run pytest -q             # 219개 통과해야 함
```

필요한 것: **uv**, **Node.js 22+**, (앱을 만들 때) **Android Studio Rabbit 1(2026.2.1)**, (선택) cloudflared.

`.env`(저장소에 없음, **USB로 옮기거나 새로 만들기**, 채팅과 이메일로 보내지 말 것):

```text
NEBIUS_API_KEY=...                        # 사진 분석과 자유 질문에 필수 (Nebius Token Factory 프로젝트 키)
NVIDIA_API_KEY=nvapi-...                  # 음성 합성 도구에만 필요 (앱 실행에는 불필요)
SCENEPILOT_CORS_ORIGINS=https://localhost # 안드로이드 앱이 서버를 호출하려면 필요. 이 줄이 빠지면 앱이 연결하지 못함
```

선택 변수: `SCENEPILOT_VISION_MODEL`, `SCENEPILOT_ASSISTANT_MODEL`, `NEBIUS_BASE_URL`, `HOST`, `PORT`, `SCENEPILOT_MAX_IMAGE_BYTES`, `SCENEPILOT_TIMEOUT`, `SCENEPILOT_VISION_MAX_TOKENS`(3000 이상 필요: 이 모델은 답 앞에 추론 문장을 길게 씀).

## 6. 실행과 점검

```bash
uv run scenepilot                    # http://localhost:8000 (0.0.0.0:8000)
curl localhost:8000/health           # api_key_configured: true 확인
uv run python eval/run_vision_eval.py   # eval/photos의 사진 4장으로 실제 모델 호출
```

- **서버는 코드를 바꿔도 자동으로 다시 시작되지 않습니다.** Python 코드를 바꾸면 서버를 껐다 켜세요. `static/` 파일은 캐시하지 않아서 새로고침만 하면 됩니다.
- 음성 합성(이미 60개 만들어 `static/audio/`에 있음. 문장을 바꿀 때만 다시): `uv run --with nvidia-riva-client --with lameenc python tools/synthesize_prompts.py` (`--dry-run`으로 문장 목록, `--list-voices`로 목소리 확인). 바뀐 문장만 새로 합성합니다.
- 주 안내 데이터: `src/scenepilot/data/state_notes.json` (플로리다 316.061/.062/.065, 뉴욕 VTL 600/605, 2026-10-22에 공식 사이트에서 가져옴).

## 7. 안드로이드 앱 (Galaxy S25 `SM-S936N`로 확인)

자세한 설명은 `android-app/README.md`. 순서:

1. 폰: 설정 → 휴대전화 정보 → 소프트웨어 정보 → **빌드번호 7번** → 개발자 옵션 → **USB 디버깅**. 삼성 **자동 차단(Auto Blocker)**의 "USB 케이블을 통한 명령 차단"이 켜져 있으면 PC에서 안 보입니다.
2. `cd android-app && SCENEPILOT_API_BASE=http://<PC 주소>:8000 npm run sync` (PowerShell: `$env:SCENEPILOT_API_BASE="http://<PC 주소>:8000"; npm run sync`). **서버 주소는 빌드할 때 앱 안에 박힙니다.** 기본값은 `10.0.2.2`(에뮬레이터용). 주소가 바뀌면 다시 sync하고 다시 설치.
3. Android Studio에서 **`android-app/android`** 폴더(그 안의 `android`)를 열고 Gradle 동기화 → 폰 선택 → Run(▶).
4. 폰과 PC는 **같은 Wi-Fi**여야 하고, 서버(`uv run scenepilot`)가 켜져 있어야 합니다. Wi-Fi 없이 USB만으로 하려면: `adb reverse tcp:8000 tcp:8000` 후 `SCENEPILOT_API_BASE=http://localhost:8000`로 sync(미시험).
5. adb 위치: `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`.

함정(이전에 실제로 겪음):
- **Gradle JDK 오류** "Incompatible Gradle JVM version ... 25": Studio 설정 → Build Tools → Gradle → Gradle JDK를 **21**로. (Gradle 8.14.3은 JDK 25를 지원하지 않음)
- SDK는 **Platform 36**이 필요합니다. 안내가 뜨면 설치.
- 터미널에서 `gradlew`는 AI 작업 환경의 보안 격리 때문에 막혔습니다. 사람이 쓰는 터미널이나 Studio에서는 됩니다.
- 앱 전용 파일은 `android-app/native/`(서버 주소 shim, 안드로이드 음성 인식, 안드로이드 TTS)뿐이고 웹 코드(`src/scenepilot/static`)는 그대로 복사됩니다. `www/`는 빌드가 만드는 파일이라 저장소에 없습니다.
- **AndroidManifest에 `usesCleartextTraffic="true"`와 `allowMixedContent`가 켜져 있습니다**(시험용, 같은 Wi-Fi의 http 서버에 연결하려고). 제출용에서는 `https://` 서버를 쓰고 이 두 설정을 빼야 합니다.
- TTS 엔진을 보게 하는 `<queries>`(`TTS_SERVICE`)를 빼면 안드로이드 11+에서 **소리가 조용히 안 납니다.**
- 안드로이드 음성 인식 플러그인은 "듣기 종료" 신호를 **최종 결과보다 먼저** 보냅니다(`native-speech.js` 주석 참고).

## 8. 사용자와 정한 결정(결정 로그)

- 대상은 **미국, 영어 UI, 911**. 응급일 때는 사용자에게 질문하지 않고 **위치로 주를 자동 기록**(요약에는 "확인 안 됨"으로 표시).
- 주별 안내는 **플로리다와 뉴욕 2개**(공식 사이트 본문을 확실히 읽을 수 있던 곳). 캘리포니아, 텍사스는 사이트가 읽히지 않아 제외, 로펌 글 같은 2차 자료는 쓰지 않음.
- 응급이면 세부 질문 3개(취약 도로 이용자, 에어백, 현장 이탈)와 안내 단계를 건너뜀.
- **hands-free가 기본값**: 동의를 한 번 하고(기기에 기억) 마이크 허용을 한 번 하면, 이후 질문 읽기 → 듣기 → 다음이 자동. 화면을 눌러 답해도 됨. 소음이 심하면 후보 5개 + 버튼.
- 사진 통과 규칙은 모델이 같은 사진을 `wide_scene`/`vehicle_full`로 다르게 부르는 문제 때문에 넓힘: 현장 전체 단계가 `vehicle_full`도 받고, 상대 차량 단계가 `damage_closeup`도, 손상 단계가 `wide_scene`도 받음(차량 2대, 번호판 읽힘, 손상 보임 조건은 그대로).
- 자유 질문은 **Nemotron 텍스트 모델 + 도구 호출**, TTS는 **미리 합성**(NVIDIA 오픈소스 활용을 보여주기 위함). 음성 인식을 NVIDIA 모델로 바꾸는 것은 **선택 사항**으로 미룸(앱이 직접 녹음, 끝 판단, 업로드를 해야 해서 약 1일 작업이고 체험 호스팅 제한이 위험).
- 직업 운전자는 대상에서 제외. 상대 대화 청취와 녹음은 법적 검토 전이라 **만들지 않음**(데이터에는 주별 녹음법이 숨김 항목으로 있음).
- LICENSE는 아직 정하지 않음(MIT 또는 Apache-2.0 후보). 팀과 상의 필요.

## 9. 아직 확인하지 못한 것 (폰이 필요함)

1. **Magpie 음성 재생이 앱(웹뷰)에서 자동으로 되는지.** 막히면 기기 음성으로 대신 나옵니다(코드에 대체 경로 있음).
2. **자유 질문 화면을 폰에서 말로 하는 흐름**과 답변 읽기(답은 기기 음성).
3. **사무실 같은 소음에서 인식률**이 후보 5개 방식으로 나아졌는지.
4. **마이크, 위치 권한**이 앱에서 처음 한 번만 묻는지.
5. 이전 시험에서 이 사무실 Wi-Fi의 인터넷이 불안정(핑 손실 50%)해서 구글 음성 인식이 느렸음. 오프라인 영어 음성 인식 팩 설치를 권했으나 효과는 미확인.
6. **배포(HTTPS)와 Dockerfile 빌드**: 한 번도 안 해 봄. 한 컨테이너, **인스턴스는 정확히 1개**(세션이 메모리에 있음). 후보: AWS Lightsail 컨테이너(가격은 공식 페이지로 확인 필요), Render/Fly.io/Railway.
7. 법령 문구는 **팀이 원문과 한 줄씩 대조하지 않음**(`reviewed: false`). 화면에도 그 경고가 나옴.

## 10. 남은 일 (제안 순서)

| 시기 | 할 일 |
|---|---|
| 10/24~25 | 집에서 폰 연결: 위 9번 1~4 확인, 막힌 곳 수정. `.env`에 CORS 줄 추가 |
| 10/25~26 | **HTTPS 배포**(심사용 데모 URL). 배포 후 안드로이드 앱의 서버 주소를 https로 바꾸고 cleartext 설정 제거 |
| 10/26~27 | 주 안내 검수표(문장, 출처 링크, 확인란)를 만들어 팀이 대조. 평가용 사진 정리(출처와 라이선스 기록, 미국 번호판 사진 포함) |
| 10/27~28 | LICENSE 결정과 추가, README 영어 다듬기(NVIDIA 모델과 Token Factory 사용 위치 강조, 한계 정직하게), 3분 미만 영상(배우 시연, 실제 번호판 가리기) |
| 10/29 | 저장소 공개 전환(내부 문서 `ScenePilot_인계/`, `docs/진행현황_*.md`, 목업 정리 여부 결정), 피드백 제출, **제출** |

선택 과제: 푸시 투 토크(누르는 동안만 듣기), NVIDIA 음성 인식 연동, 무응답 타이머(10/20/30초 후 확인), 앱 안 카메라, Tavily 연동(보너스 조건 확인 필요, 법률 정확성 위험).

## 11. 이전 작업에서 배운 작업 요령

- 응답과 설명은 **한국어**, 코드와 UI와 문서는 영어(이 문서만 한국어).
- **커밋과 푸시는 사용자가 요청할 때만.** 키는 출력하지 않고, `.env`와 키 값은 저장소에 넣지 않음. 올리기 전에 키 값으로 전체 검색해 확인했음(`.env`는 `.gitignore`).
- 시험할 때 브라우저 창(AI 작업 환경의 브라우저)은 **마이크가 막혀** 있습니다. `?fakespeech=`로 흉내 내세요. 마이크 거부는 `localStorage`의 `scenepilot.handsfree=off`로 남아서, 이후 시험이 이상하면 `localStorage.clear()`.
- 앱 저장소 키: `scenepilot.sid`, `voice`, `handsfree`, `profile`, `insurer`, `consent`(버전 "2").
- Windows에서 셸 인라인 파이썬에 정규식이나 `\n`을 넣으면 이스케이프가 깨집니다. 파일로 쓰고 실행하거나 편집 도구를 쓰세요.
- `pytest`의 `tmp_path`는 이 PC에서 권한 오류가 나서 `tempfile`을 씁니다(다른 PC에서는 괜찮을 수 있음).
- 모델 호출 시험은 `uv run python` 한 줄 스크립트로 Nebius 모델 목록과 지연 시간을 먼저 확인(`models.list()`).
- build.nvidia.com 페이지는 자바스크립트로 그려져서 웹 가져오기 도구로 본문이 안 보입니다. 모델 카드(Hugging Face의 README raw)에 호출 예시가 있습니다.

## 12. 관련 문서

- `README.md`: 동작 방식, NVIDIA 모델 표, 안전 장치, 음성, 위치, 배포 후보, 개인정보
- `android-app/README.md`: 앱 빌드와 실행
- `docs/dispatcher_script_en.md`: 영어 대화 스크립트(구현 안 된 줄은 `[PLANNED]`)
- `ScenePilot_인계/`: 처음 인계 문서(대회 규정 요약, 기획서, Nebius 시험 스크립트). 10/20 기준이라 일부는 지나갔음
- `docs/진행현황_20261021.md`: 옛 진행 현황(한국어, 지금과 다름), `docs/ScenePilot_목업.html`: 팀 공유용 목업
