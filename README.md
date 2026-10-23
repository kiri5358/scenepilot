# ScenePilot: Accident Scene Guide

ScenePilot is a mobile web app for drivers right after a car accident. It guides the user one step at a time, checks that the evidence photos are good enough and asks for a retake when they are not, and builds a claim summary in which every item carries a source tag.

It does not decide who is at fault, what repairs cost, or anyone's legal responsibility. It uses NVIDIA open models in three places (see the table below): photo understanding and a free-question helper call NVIDIA Nemotron models on Nebius Token Factory at run time, and the spoken guidance is NVIDIA Magpie TTS audio.

> Status: hackathon work in progress. We do not claim performance we have not built and measured.
> The demo targets US drivers (English, 911).

## NVIDIA open models in ScenePilot

| Where | Model | How it is used | Status |
|---|---|---|---|
| Photo understanding | `nvidia/Nemotron-3.5-Super-VL` (Nebius Token Factory) | Looks at each photo and returns a strict JSON of observations. Rules decide pass or retake. | Built, runs at run time |
| Free questions ("Ask a question") | `nvidia/nemotron-3-super-120b-a12b` (Nebius Token Factory, `SCENEPILOT_ASSISTANT_MODEL`) | Answers in the user's own words through **tool calls** (reviewed state notes, the user's recorded facts, the app's steps and photo checklist, emergency numbers). | Built, runs at run time |
| Spoken guidance | NVIDIA Magpie TTS Multilingual (`nvidia/magpie_tts_multilingual_357m`, NVIDIA Open Model License) | The fixed sentences (about 60) are synthesized once with the hosted NVIDIA API and shipped as audio files. Anything else is read by the device voice. | Built: 60 clips made with the `Aria.Calm` voice (`tools/synthesize_prompts.py`, needs an NVIDIA API key to re-make them) and played by the app |
| Speech recognition | The browser's or Android's own recognizer | Not an NVIDIA model. NVIDIA Nemotron ASR / Parakeet are candidates, not built. | Not NVIDIA |

### Free questions: how it stays safe

The helper is a tool-using agent, but **rules wrap the model on both sides** (`src/scenepilot/assistant.py`):

1. **Before the model:** a question that mentions injury, fire, smoke or fuel never reaches the model. The answer is the fixed 911 text with a call button.
2. **The model's only source of law is our reviewed state notes** (Florida and New York, with source links). For any other state, or anything the notes do not cover, it must say it does not know and point to the police or the state's official site.
3. **After the model:** its text is checked sentence by sentence. A sentence that declines, or hands the decision to the police, an insurer or a professional, may mention the topic. Any other sentence may not judge fault, give legal or medical advice, give a cost, say something is "not required", or tell the user what to say or sign. A rejected answer gets one rewrite with the rule explained, then a fixed fallback. Dollar amounts are only allowed when they come word for word from the notes.
4. Limits: 500 characters per question, 30 questions per accident, at most 3 tool rounds.

## How it works

Decisions are made by code. The AI only describes what it sees.

| Part | Who decides | Notes |
|---|---|---|
| Safety questions, emergency level, 911 button | Rule code | Unclear or unsure answers are treated as the risky case. No AI involved. |
| Stage changes (consent, safety, photos, wrap-up, summary) | Rule code (state machine) | The model cannot change the stage. |
| Photo observations (scene type, sharpness, plate readable, visible damage) | AI (Nemotron VL on Token Factory) | Output is validated against a strict schema. |
| Does the photo pass its checklist step? | Rule code | Uses the AI observation as input. |
| Forbidden-output check (fault, legal advice, money, medical judgments) | Rule code | Removes such sentences from model output. |
| Free questions | Model with tools, wrapped by rules | Danger words never reach the model; its answer is checked before it is shown. |
| Summary text and source tags | Rule code | Model sentences are included only if they pass the check. |

Flow: consent, safety check, (emergency or serious notice with a 911 button), step-by-step "what to do now" guidance read aloud, 3 core photos (scene, other vehicle and plate, damage), a hub (create the summary now, take more photos, or add details), then the summary. After the summary the user can come back and add more.

The safety check sets a situation level by rules: **emergency** (injury or fire), **serious** (pedestrian, bicyclist or motorcyclist involved, airbag, someone left the scene), **caution** (vehicle cannot be moved or is somewhere dangerous), or **standard**. The level decides which notice and which guidance steps appear. The guidance wording is a draft that must be reviewed against official sources before real use.

Source tags in the summary: **Your statement**, **Photo**, **AI observation, unverified**, **Unconfirmed**, **Recorded automatically**.

The dialogue wording lives in [docs/dispatcher_script_en.md](docs/dispatcher_script_en.md). Lines marked `[PLANNED]` there are not built yet.

## State-specific guidance (Florida and New York)

After the general steps the app asks which state the accident happened in. (For a serious situation it is the last step. **In an emergency nobody is asked:** as soon as the safety check reports an emergency, the state is taken from the phone's location automatically, marked in the summary as "set automatically, not confirmed", and the user is never asked to confirm it. If there is no location yet, or the phone is near a state line, the summary says "Not sure" or "Not asked". Neither case shows state notes.) For Florida and New York it adds short notes taken from the official statutes: when to report, what to share with the other driver, what to do if nobody is there, and a note on leaving the scene. Each note shows its source link, the version shown on the official page, and the date we retrieved it. Any other state, or "Not sure", gets a general reminder to check that state's official guidance.

- Data: [src/scenepilot/data/state_notes.json](src/scenepilot/data/state_notes.json). Loaded by `src/scenepilot/states.py`.
- Sources: Fla. Stat. 316.061, 316.062, 316.065 (2026 Florida Statutes) and N.Y. Vehicle and Traffic Law 600 and 605 (nysenate.gov). We read the official pages on 2026-10-22.
- **Draft.** The notes are plain-language summaries. The team has not yet checked them line by line against the statute text, and they are not legal advice. `"reviewed": false` in the data file stays until someone does.
- Recording rules (Florida: all-party consent, New York: one-party) are kept in the data for a future feature. The app does not show them and does not record anything.
- We tried California and Texas first, but their official sites did not return readable text to our tools. We did not use secondary sources: for example, law-firm pages gave a $500 Florida reporting threshold while the statute text says $2,000.

### Voice answers

**Hands-free is the default.** The first time on a device, the user taps **Agree and start** (that tap is the consent and the user action browsers need before they allow the microphone), and the browser asks for the microphone and location once. The consent is **remembered on the device** (`scenepilot.consent` in local storage), so every later accident skips the notice and starts at the first question with the app already listening. The notice stays readable under **My info → About this app**, and **Show the start notice again** forgets the consent. The app then speaks a question, listens for the answer, and moves on, with no mic taps. The user can answer by voice or by tapping, whichever is easier, and can turn listening off with the microphone button in the header. If nobody speaks, the app keeps listening quietly for three rounds, then pauses with a **Try again** button. If the browser refuses the microphone, hands-free turns itself off and the buttons keep working. Each screen also has a **Speak your answer** button. The "What happened" box has a **Speak** button that types what you say so you can edit it.

- **What you can say.** Safety questions: plain answers such as "No one is hurt", "yes", "not sure", "I can't move it". They go through the same rules as typed answers, so unclear answers are asked again and then treated as "not sure". Other screens take short commands: next, repeat, back, skip (guidance); "got it" (emergency); Florida, New York, another state, not sure, "yes, that's right" (state question); create summary, more photos, add details (hub). The buttons always work too.
- **The browser's permission question is asked once per address.** A quick tunnel gets a new address every time it starts, so the question comes back each run; with a fixed HTTPS address it appears only the first time. Speaking the question aloud before the first touch can still be blocked by some browsers; listening works anyway.
- **Noise.** In a loud place the recognizer often mishears. The app asks it for five guesses and the server reads all of them: guesses it cannot understand are ignored, guesses that agree give the answer, and guesses that disagree (one "yes", one "no") count as "not sure", the cautious side. Sound-alikes for one-word answers ("know", "nope", "yeah") are mapped; "now" is not. After repeated silence the app pauses and suggests holding the phone close, using earphones with a microphone, or tapping. Other people's voices in the background are the hardest case and cannot be removed by software here.
- **Needs** HTTPS (or `localhost`), a browser with speech recognition (Chrome and Chrome-based browsers have it; other browsers may not, and we have not tested iPhone Safari), and the user's permission for the microphone. The mic button hides itself when voice is not available.
- **Privacy.** The browser may send what you say to its own speech service (Chrome uses an online service). The app stores no audio and the server only receives the recognized text, like typed text. The consent screen says so.
- **Testing without speaking.** Open the app with `?fakespeech=No|Yes|next` to replay those phrases one per listening turn (separate phrases with `|`). A yellow banner says speech is simulated. Combine it with `?fakeloc=fl` for a full hands-free run.
- Checked by `tests/speech_check.js` (run with node by `tests/test_speech_js.py`) and in the browser with the test mode. **We have not tested a real microphone yet.**

### Android app

[android-app/](android-app/README.md) wraps the same web UI in an Android app (Capacitor), so the microphone and location permissions belong to the app instead of a web address and no HTTPS is needed for them. The web code is not changed and can still be submitted on its own. Not yet run on a real phone.

### Korean reading aid for testers

Add `?ko` to the address (for example `/?ko&fakeloc=fl`) and every English line gets its Korean meaning in small grey type underneath. The English stays, because the product and the voice answers are English. It is for team members who test in Korean; it changes only how the page looks and sends or stores nothing. Lines that have no Korean entry (for example what the AI writes about a photo) are left as they are. [ko.js](src/scenepilot/static/ko.js) holds the dictionary, and `tests/test_ko_js.py` fails if a fixed server line has no Korean entry.

### Using the phone's location to suggest the state

The location lookup **starts as soon as the app opens** (and again for a new accident), so a suggestion is usually ready when the "Where did the accident happen?" question comes up. The browser asks for permission then; the consent screen says so. The question shows the suggestion, and **Use my location** tries again. This needs HTTPS (or `localhost`) and the user's permission.

- **It stays on the phone.** The lookup runs in [geo.js](src/scenepilot/static/geo.js). The coordinates are not sent to the server and are not stored. Only a label ("chosen from your phone's location, confirmed by you") reaches the server.
- **It is only a suggestion.** The user always confirms with a tap. If the phone is close to a state line (the GPS accuracy plus about 5 km of outline error), the app says it cannot be sure and asks the user to pick.
- **Coarse outlines.** Only Florida and New York have outlines, hand-made with a few dozen points each (errors of several kilometers). Everywhere else is reported as "outside", which maps to "Another state".
- **Without HTTPS, or if permission is denied,** the button explains why and the user picks the state by hand.
- **Testing outside the United States.** A real GPS fix in another country is correctly reported as "outside Florida and New York". To try the other results, open the app with a test parameter: `?fakeloc=fl` (Orlando), `?fakeloc=ny` (Albany), `?fakeloc=border` (near a state line), `?fakeloc=other` (Atlanta), or `?fakeloc=denied` (permission refused). A yellow banner says the location is simulated. The simulation only replaces what the browser would report; nothing is sent anywhere.
- Checked against well-known cities by `tests/geo_check.js` (run with node by `tests/test_geo_js.py`; skipped when node is not installed).

## What is not built yet

- A speech-to-text engine of our own. Voice answers use the browser's built-in recognizer today (see below). An NVIDIA speech model (for example Parakeet or Nemotron ASR, behind our own server) is a possible replacement, not built.
- Spoken playback uses the browser's text-to-speech; an NVIDIA text-to-speech model (Magpie) is not used yet.
- State notes exist only for Florida and New York (see below). Other states get the general guidance.
- Accounts. The optional "My info" card (vehicle, insurance, emergency contact, home state) is kept on the phone only; the server never sees it. The home state only pre-selects the state button when the accident happens in the same state.
- Recording the other driver. This needs legal review and is not planned for the demo.
- An in-app camera. Today the "Take photo" button opens the phone's camera app.
- Commercial and professional drivers are out of scope.

## Run

```bash
uv sync
cp .env.example .env      # then fill in NEBIUS_API_KEY (.env is never committed). On Windows PowerShell: Copy-Item .env.example .env
uv run scenepilot         # http://localhost:8000
uv run pytest -q          # tests
```

See [.env.example](.env.example) for the settings. Never put the key in code, chat, or the repository.

`eval/` has scripts that run the real model on the sample photos in `eval/photos/` (see the README there for photo sources and licenses):

```bash
uv run python eval/run_vision_eval.py     # structured result for each photo
uv run python eval/run_session_demo.py    # walks the session flow with the real model
```

## Open it on a phone

There are three ways. Pick the one that fits your goal.

| | Method | Use it for | Caveats |
|---|---|---|---|
| A | Same Wi-Fi: `http://<your PC's IP>:8000` | Quick checks while developing | The PC firewall must allow it. It is not HTTPS, so features such as the microphone and GPS do not work (the current app only needs photo picking and spoken playback). |
| B | Temporary public HTTPS address (tunnel) | Checking on mobile data, showing a teammate | The address changes every run. Your PC must stay on. |
| C | Cloud deployment | **The judging demo URL** | Must stay up until judging ends. See Deploy below. |

### A. Same Wi-Fi

1. Run `uv run scenepilot` on your PC. It prints a phone address such as `http://192.168.0.20:8000`.
2. Connect the phone to the **same Wi-Fi** and open that address.
3. If it does not open, it is usually the Windows firewall. If your Wi-Fi is classified as a Public network, inbound connections are blocked.
   - Allow Python in the "Windows Security Alert" the first time (Private networks, and Public if needed).
   - If you already refused, run this once in an administrator PowerShell: `New-NetFirewallRule -DisplayName "ScenePilot 8000" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow -Profile Private,Public`
   - When you are done, remove the rule: `Remove-NetFirewallRule -DisplayName "ScenePilot 8000"`
4. Public Wi-Fi (cafes, schools) sometimes blocks device-to-device traffic. Use B in that case.

> This server has no access control. While it is open in A or B, anyone who knows the address can call the model with your Nebius credits. Turn the server off when you finish.

### B. Temporary HTTPS tunnel (Cloudflare Quick Tunnel)

No account is needed (install first: `winget install Cloudflare.cloudflared`).

```bash
uv run scenepilot                                   # terminal 1
cloudflared tunnel --url http://localhost:8000      # terminal 2 prints https://<random-name>.trycloudflare.com
```

Open the printed `https://...trycloudflare.com` address on the phone. Because it is HTTPS, it also works for testing the microphone and GPS later.

## Deploy (the judging demo URL)

The rules require a **demo URL that stays free and unrestricted until judging ends** (we plan to keep it up until about 2026-12-15). The app server does not need to run on Nebius; what the rules look at is the runtime Token Factory call.

### Common points
- The app runs as **one container** ([Dockerfile](Dockerfile), not built yet). Sessions live in memory, so run **exactly one instance**. With several, users lose their sessions.
- Provide `NEBIUS_API_KEY` only as a **secret or environment variable** of the deployment. Never put it in the image or the repository.
- A public URL lets anyone call the model. Before going public, create a dedicated key, set a usage limit in Nebius, and add an access code or rate limit (not built yet).
- It must be an **HTTPS** address (phone browsers often require HTTPS for the camera, microphone, and location).

### Candidates
| Candidate | Features | To check |
|---|---|---|
| **AWS Lightsail container service** (simplest inside AWS) | Upload a container and HTTPS is enabled automatically on the default domain (`*.cs.amazonlightsail.com`). A fixed single instance fits this app. | Current pricing (we only confirmed a 2020 announcement of about $7 per month and up; check the official page), data transfer limits |
| AWS EC2 + Docker + Caddy | Full control | Needs a domain (for Caddy's automatic HTTPS), open ports 80 and 443 in the security group, more operations work |
| ~~AWS App Runner~~ | **Closed to new customers since 2026-04-30**, so it cannot be used for a new service | n/a |
| Container PaaS (Render, Fly.io, Railway, and similar) | Upload a Dockerfile and get an HTTPS address | Free limits, whether idle services sleep, whether it stays up through judging |

> Prices, free limits, and sleep policies change. **Check each provider's official page yourself** before deciding.

### Minimal steps (any PaaS)
1. Push the repository to GitHub (a public repository with a license is a submission requirement). Check with `git status` that `.env` is not included.
2. Create a new web service from this repository's Dockerfile.
3. Register `NEBIUS_API_KEY` as a secret. The app reads the `PORT` the service provides (default 8000).
4. Open the issued `https://...` address on a phone and run consent, safety check, photos, and summary end to end.
5. Check that `https://<address>/health` reports `api_key_configured: true`.

## Project layout

```text
src/scenepilot/
  session.py      state machine, prompts, summary
  emergency.py    safety questions, answer understanding, situation level and notices
  playbooks.py    step-by-step "what to do now" guidance (fixed wording)
  checklist.py    photo checklist and pass/fail rules
  guard.py        forbidden-output check
  vision.py       Token Factory vision call, structured output
  assistant.py    free-question helper: tools, rules before and after the model
  prompt_audio.py the fixed spoken sentences and how their audio files are made and found
  app.py          FastAPI routes
  static/         mobile web UI (HTML, CSS, JS; geo.js = location, speech.js = voice)
tools/            synthesize_prompts.py (NVIDIA Magpie TTS for the spoken guidance)
tests/            pytest suite
eval/             scripts and sample photos for the real model
docs/             dialogue script and project notes
```

## Privacy

- Photos go through our server to Nebius Token Factory for analysis. In the demo, use example photos, not real accident information.
- A question typed or spoken into **Ask a question** goes through our server to a Nemotron model on Nebius Token Factory. Along with it the model can read the reviewed state notes and a few non-personal facts about the session (situation level, accident state, photo statuses). It is not given statements, plates or contact details. The consent screen says so, and the consent version was raised so everyone sees it again.
- Sessions live only in server memory (up to 500) and disappear when the server restarts. There is no retention policy yet.
- The app asks for no account. On the phone it stores only the session id, a voice on/off choice, an optional insurer phone number, and the optional "My info" card. The "My info" card is never sent to the server (it is added to the summary on your screen and when you copy it).
