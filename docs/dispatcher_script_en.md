# ScenePilot: Dispatcher-Style Dialogue Script (English, draft v0.1)

> 한국어 요약: 911 응대원처럼 한 번에 한 가지씩, 짧고 차분하게 안내하는 영어 대화 스크립트 초안입니다. 코드에 이미 들어간 문구는 **[IN CODE]**, 아직 구현하지 않은 문구는 **[PLANNED]**로 표시했습니다. 법적·의료적 내용은 팀이 공식 자료로 검토해야 하는 초안이며, 여기 적힌 문구는 법률 조언이 아닙니다.

Status: draft for team review. Date: 2026-10-22.
Audience: US drivers. Demo language: English. Emergency number: 911.

**What this script is not.** ScenePilot is not a 911 dispatcher. It never sends help, never dials for the user, and never gives medical instructions. In an emergency its first job is to get the user to call 911. Everything below is guidance for the minutes around that call, and for accidents where nobody is hurt.

---

## 1. Voice and style rules

| Rule | Why |
|---|---|
| One thing per turn. One question or one instruction, never both. | A stressed person can hold one thing at a time. |
| 15 words or fewer per sentence. Plain words, no jargon. | Easier to hear and to read as a caption. |
| Closed questions first (yes / no / not sure). Open questions only after safety is settled. | Short answers are far easier to recognize by speech-to-text. |
| Calm, slightly slow, steady. No exclamation marks, no alarm words except for real danger. | Dispatchers keep the caller calm by staying calm. |
| Every spoken line is also shown as a caption, with big buttons for the same answers. | Voice can fail in noise. The screen must always work on its own. |
| Read numbers digit by digit ("nine one one"). | Avoids mishearing. |
| Never blame, never judge, never promise. | See "Lines we never say" in section 7. |
| Unclear or missing answer is treated as the risky answer. | Matches the emergency rules in code. |

Turn-taking is half-duplex: the app speaks, plays a short tone, then listens. It does not listen while it speaks.

## 1b. Voice answers (browser speech recognition) **[IN CODE]**

At any point the user can open **Ask a question** (the question-mark button, or say "ask a question") and speak or type a question in their own words. Danger words get the fixed 911 text; everything else is answered from the reviewed notes, or the helper says it does not know.

Hands-free mode is on by default. The first time on a device the user taps **Agree and start** and allows the microphone once; after that the consent is remembered and the app opens straight to the first question, already listening (the header microphone button turns it off): the app speaks a line, plays no tone yet, then listens for one phrase, then acts on it and speaks the next line. A bar at the bottom shows "Listening…", what was heard, and **Stop**. If the phrase is not understood the app says: "Sorry, I didn't catch that." followed by what can be said, and listens again (up to two retries). If nobody speaks, it keeps listening quietly for three rounds, then pauses with a **Try again** button. Buttons work at all times, so the user can answer by voice or by tapping.

| Screen | What can be said |
|---|---|
| Safety questions | Plain answers: "No one is hurt", "yes", "no", "not sure", "I smell gas", "I can't move it". Sent to the same rules as typed text. |
| Emergency notice | "Got it", "okay", "done", "I called", "I'm safe" |
| Guidance | "Next", "repeat" / "say that again", "back", "skip" / "skip to photos" |
| State question | "Florida", "New York", "another state", "not sure", "yes, that's right" (confirms the location suggestion), plus back / skip / repeat |
| Hub | "Create summary", "more photos", "add details" |
| Consent and photos | Not voice-controlled (consent is a deliberate tap; photos need the camera) |

Listening happens only on screens that take a spoken answer, and stops when the user turns the microphone off or the browser refuses it. A person on the phone with 911 may not be able to use the microphone at the same time; the buttons remain.

## 2. Global behaviors

| Behavior | Spoken line | Status |
|---|---|---|
| Didn't understand once | "Sorry, I didn't catch that." then repeat the question | **[IN CODE]** |
| Didn't understand twice | Treated as "Not sure". No extra line. | **[IN CODE]** |
| User asks to repeat (tap "Repeat" or says "repeat") | Read the last line again | **[PLANNED]** |
| Skip a step | "Okay, skipping that." | **[PLANNED]** |
| Voice off | Captions and buttons only | **[IN CODE]** (speaker toggle) |

### No-response check-in (first safety question only) **[PLANNED]**

Applies only while we are waiting for the first answers, before the user has shown they are responsive. After that, reminders are gentle and never escalate to the emergency screen. The timer pauses when the page is in the background (for example while the camera app is open).

| After | App says | Screen |
|---|---|---|
| 10 seconds | Repeats the question. | Tone, question unchanged |
| 20 seconds | "Are you okay? Say yes, or tap the button." | Big **Yes, I'm okay** button |
| 30 seconds | "I can't hear you. If you need help, call nine one one." | Emergency screen, big **Call 911** button, repeat every 10 seconds |
| User taps "I'm okay" or answers | "Okay, thank you." Continue. | Timers reset with a grace period |

The app cannot call 911 by itself and cannot alert anyone. It only shows the emergency screen and the call button. The session is marked "no response detected".

---

## 3. Script flow

### S0. Welcome and consent **[IN CODE: consent]**

Spoken (short form):
> "Hi, I'm ScenePilot. I'll guide you one step at a time. Tap Agree and start when you're ready."

On screen (full form, in code):
> "ScenePilot guides you through an accident one step at a time and organizes your photos and statements. It does not decide who is at fault, what repairs cost, or anyone's legal responsibility. AI observations can be wrong. Continue?"

Button: **Agree and start**

Also shown: "Photos are sent to a server for AI analysis." / "If anyone is hurt or in danger, call 911 first."

The first tap also unlocks audio on iPhone and Android browsers.

### S1. Safety check **[IN CODE: safety questions]**

Buttons for every question: **Yes** / **No** / **Not sure**. The user may also speak or type a free answer.

| ID | Spoken line |
|---|---|
| Q1 injury | "Is anyone hurt? That includes you, your passengers, and the other driver." |
| Q2 fire | "Do you see or smell smoke, fire, fuel, or leaking fluid from any vehicle?" |
| Q3 vulnerable | "Was a pedestrian, bicyclist, or motorcyclist involved?" |
| Q4 airbag | "Did any airbags go off?" |
| Q5 left scene | "Did anyone drive away from the scene?" |
| Q6 movable | "Can your vehicle be moved to a safe spot out of traffic?" |
| Q7 road hazard | "Is a vehicle blocking a lane or stopped somewhere dangerous, like a highway or a blind curve?" |

Q3 to Q5 are skipped when Q1 or Q2 already raised an emergency: 911 handles those details and they cannot lower the level.

Confirmation read-back for dangerous answers **[PLANNED]**. Only for Q1 and Q2, and never delays the emergency screen:
> "I heard that someone may be hurt. Is that right?" (the emergency screen appears first; this only corrects mistakes)

### E. Emergency and caution branches **[IN CODE]**

Screen title is always "Safety first."

| Branch | Trigger | Spoken lines (in this order) |
|---|---|---|
| E1 injury | Q1 is Yes or Not sure | "Call nine one one now and tell them someone may be hurt." <pause> "Stay on the line and follow the dispatcher's instructions." |
| E2 fire | Q2 is Yes or Not sure | "Get away from the vehicle to a safe place first." <pause> "Once you are safe, call nine one one." |
| E3 both | Q1 and Q2 | E2 first, then E1. One **Call 911** button. |
| E4 caution | Q7 is Yes or Not sure, or Q6 is No | "Turn on your hazard lights. If it is safe, get out and move away from traffic, behind a guardrail if there is one." (shown inside the guidance below, or on the notice when a higher level applies) |
| E5 serious (no injury or fire reported) | Q3, Q4, or Q5 is Yes or Not sure | Screen title "This may be serious." Then: "Call nine one one now and tell them what happened." <pause> then one line per answer: "Tell them a pedestrian, bicyclist, or motorcyclist may be involved." / "Tell them an airbag went off." / "Tell them someone left the scene. If you can, note their license plate, vehicle, and direction. Do not chase them." One **Call 911** button. |

Warning shown on later screens while a notice is active: "Only take photos where you are safe."

Situation level (decided by rules): **emergency** (injury or fire, including Not sure), **serious** (vulnerable road user, airbag, someone left), **caution** (vehicle cannot be moved or is in a dangerous spot), **standard** (none of these). It is shown in the summary as "Situation level (rule-based)".

After the user taps **Got it**, the app continues with the remaining safety questions. For **emergency** it then goes straight to photos, because the 911 call is the guidance. For every other level it shows the guidance below first.

**Emergency: no state question.** A person in an emergency cannot be asked to read another screen. The moment the safety check reports an emergency, the app sets the state from the phone's location by itself (inside Florida or New York gives that state, outside gives "Another state", near a state line gives "Not sure"). A quiet line on the screen says: "We noted where you are from your phone's location, for your report. It stays on your phone." The summary shows it as "set automatically from your phone's location during an emergency; not confirmed". It never replaces a state the user chose. With no location available, the summary shows "Not asked".

### S1b. What to do now (guidance) **[IN CODE: guide]**

One step per screen, read aloud, with **Next**, **Repeat**, **Back**, and **Skip to photos**. Fixed wording, never written by the model. DRAFT: the team must review every step against official sources before real use.

Standard and caution (no injury, no fire, nothing flagged serious):

| Step | Spoken line |
|---|---|
| 1 | "Take a breath. We will go one step at a time." |
| 2 (vehicle can be moved) | "Turn on your hazard lights. If it is safe, move the vehicles out of traffic." |
| 2 (vehicle cannot be moved) | "Turn on your hazard lights. If you cannot move your vehicle, leave it and stay out of traffic." |
| 3 | "Stay at the scene until you have exchanged information." |
| 4 | "Take photos while it is safe: both vehicles, the license plates, the damage, and the road." |
| 5 | "Exchange details with the other driver: name, phone number, insurance company, policy number, and license plate." |
| 6 | "Stick to the facts when you describe what happened." |
| 7 | "Call your insurance company to report the accident." |
| 8 | "Some places require a police report or a report to the state. Check your state's official guidance." |

Serious:

| Step | Spoken line |
|---|---|
| 1 | "Stay out of traffic and away from damaged vehicles." |
| 2 | "Follow the 911 dispatcher's instructions, including what to do with the vehicles." |
| 3 | "Stay calm and avoid arguing with the other driver." |
| 4 | "Take photos only if it is completely safe." |
| 5 | "Write down what you remember now: the time, the place, and what you saw." |
| 6 | "When the police arrive, tell them what you saw. Ask how to get a copy of the report." |

Standard and caution guidance ends with a state question and, for Florida and New York, the state notes below. Serious guidance ends with the state question only.

| Step | Spoken line |
|---|---|
| 8 (ask) | "Where did the accident happen? Some rules depend on the state." Buttons: **Yes, {home state}** (only if it is a supported state) / **Florida** / **New York** / **Another state** / **Not sure** |
| Another state | "I don't have details for that state. Some places require a police report or a report to the state. Check that state's official guidance." |
| Not sure | "That's okay. Some places require a police report or a report to the state. Check the official guidance for the state you are in." |

Florida notes (read one per step; each screen shows its source link, the version, and a "not legal advice" banner):
- "In Florida, report the crash right away if anyone is hurt or killed, or if damage to a vehicle or other property looks like $2,000 or more. Report to the local police, the sheriff's office, or the nearest Florida Highway Patrol office."
- "Stop at the scene and stay until you have given your name, address, and vehicle registration number to the other driver or anyone injured. Show your driver license if asked. Give reasonable help to anyone who is hurt."
- "If no one is there to receive your information and no officer is present, report the crash to the nearest police office as soon as you can."
- "If a damaged vehicle is blocking traffic, make reasonable efforts to move it or have it moved."
- "In Florida, leaving the scene of a crash that caused only property damage is a second-degree misdemeanor."

New York notes:
- "In New York, each driver must send a written report to the DMV within 10 days if anyone was hurt or killed, or if damage to any one person's property was more than $1,000."
- "Stop and show your license and insurance ID card. Give your name, address, insurer, policy details, and license number to the other driver or the property owner."
- "If the property owner is not there, report the crash to the nearest police station or a judicial officer as soon as you are physically able."
- "If you injure someone, give the same information to the injured person if practical, and to a police officer. If no officer is nearby, report to the nearest police station as soon as you can."
- "In New York, leaving the scene after damaging property is a traffic infraction. After injuring someone it can be a misdemeanor or a felony."

These notes come from `src/scenepilot/data/state_notes.json` and are drafts until the team reviews them against the statute text.

Emergency has no guidance steps: the 911 call is the guidance, and the state is set automatically (see above). Serious guidance ends with the state question and shows no state notes.

The last step's button reads **Continue to photos**.

Return line after a 911 call **[PLANNED]**:
> "Take your time. When you are safe, tap Got it and we'll keep going."

The app does not talk during the 911 call. Phones usually give the call control of the microphone and speaker, so voice may not work then. Check on real devices.

### S2. Where are you? **[IN CODE: location suggestion on the state step]**

Optional. Needs HTTPS and the user's permission. The lookup starts when the app opens, so the suggestion is ready by the time this question comes up. Coordinates stay on the phone and are never sent to the server. The result is only a suggestion; the user always confirms. The consent screen tells the user the phone may ask to share its location.

| Step | Spoken line |
|---|---|
| Offer | The suggestion already on screen if the lookup finished; otherwise "Finding your location…". Button **Use my location** tries again, with the line "Your location stays on this phone. It is only used to suggest a state." |
| Clearly inside a supported state | "Your phone's location looks like {STATE}. (accurate to about {N} m) Is that right?" Buttons: **Yes, {STATE}** / the other choices below |
| Clearly outside the supported states | "You seem to be outside Florida or New York. I only have state notes for those two." Button **Yes, another state** |
| Near a state line | "You may be near a state line, so I can't be sure. The closest of my states is {STATE}. Please pick the state you are in." (no suggestion is highlighted) |
| Different state | The choices on the state step: the supported states, **Another state**, **Not sure** |
| Help for a call | "If you call nine one one, tell them: the road name, the direction you were going, and the nearest exit or mile marker." |
| No permission, no HTTPS, or a timeout | "Location permission was denied. You can allow it in your browser settings, or choose the state yourself." (or the matching line for the other cases) |

Home state (from the profile) is only the first guess for {STATE}. The accident location decides which state notes are shown.

State notes (how and when to report, anything state-specific) are written by the team from official sources for the demo states only. For other states: "I don't have details for {STATE}. Check that state's official guidance."

### S3. Photos **[IN CODE: checklist]**

Lead-in after the safety check, when nobody is hurt **[PLANNED]**:
> "Good. Now let's document the scene. Only if it is safe."

Core photos (3), then extras (3). Each line below is spoken when the step starts.

| Step | Spoken line |
|---|---|
| Core 1: scene | "Take a photo that shows both vehicles and the road. If it is safe, step back until everything fits." |
| Core 2: other vehicle | "Take a photo of the other vehicle, close enough that the license plate is readable." |
| Core 3: damage | "Take a close, clear photo of the damaged area." |
| Extra: your vehicle | "Take a photo that shows your whole vehicle." |
| Extra: road | "Take a photo of the road surface, the lane markings, and any signs or signals." |
| Extra: documents | "If the other driver agrees, photograph their insurance card so the text is readable. You can skip this if they say no." |

Retake lines **[IN CODE]**, spoken right after the photo is judged:

| Reason | Spoken line |
|---|---|
| Blurry or dark | "The photo is blurry or too dark. Hold still, tap to focus, and try again." |
| Wrong shot | "That is not the shot I need for this step. Please follow the instruction and try again." |
| Fewer than two vehicles | "I can't see both vehicles. Step back so the road and both vehicles fit in the photo, then try again." |
| Plate not readable | "I can't read the license plate. Move closer so the plate fills more of the photo, then try again." |
| Damage not clear | "I can't see the damage clearly. Move closer to the damaged area and take the photo again." |

Accept line **[PLANNED]**: "Got it." Keep it to two words so the next instruction comes quickly.

After three failed tries on one step **[PLANNED]**: "No problem. You can skip this one." (button **Skip** is always visible)

Skip reasons shown as buttons **[IN CODE]**: "The other driver said no" / "Not safe to take it" / "Not applicable".

### S4. Hub: wrap up or keep going **[IN CODE: hub]**

> "The essential photos are done. You can create the summary now, or finish the rest when it is safe."

Buttons: **Create summary** / **Take more photos (3 left)** / **Add details**

### S5. The other driver's details **[PLANNED: voice-driven]**

Today this is a form (S5 fields in code: license plate, vehicle, contact, insurance, witnesses). Voice version, one field per turn, with read-back:

| Field | Spoken line |
|---|---|
| Intro | "If the other driver is willing, let's write down their details." |
| Name | "What is their name?" |
| Phone | "What is their phone number?" |
| Insurance company | "Which insurance company are they with?" |
| Policy number | "What is their policy number? You can photograph their insurance card instead." |
| Plate | "What is their license plate?" |
| Vehicle | "What are the make, model, and color of their vehicle?" |
| Read-back | "I have {value}. Is that right?" Buttons **Yes** / **Change** |
| Witnesses | "Did anyone else see what happened? If so, ask for their name and number." |
| Their refusal | "That's okay. We'll note that they preferred not to share." |

Rules: share only what the other driver offers. Values read by AI stay "Unconfirmed" until the user says yes.

### S6. Your account of what happened **[PLANNED: voice]**

> "When you're ready, tell me what happened, in your own words. Stick to what you saw and did."

Read-back, built from the user's words only, with no judgments and no cause words the user did not say:
> "Here's what I wrote: {summary}. Is that right?" Buttons **Yes** / **Change**

### S7. Recording the other driver (opt-in) **[PLANNED, behind legal review]**

Off by default. Starts only when the user taps **Record this conversation**. Uses the strictest rule everywhere: the other person must agree out loud first. Audio is not stored; only a text transcript the user reviews.

| Step | Spoken line (played out loud to both people) |
|---|---|
| Announce | "This conversation will be recorded by ScenePilot to help document the accident. Is that okay with you? Please say yes or no." |
| Other person says yes | "Thank you. Recording has started." (visible recording indicator) |
| Other person says no, or says nothing | "Okay. Recording is off." Stop and discard everything. |
| Stop | "Recording has stopped." |

Demo rule: use staged actors who agree. Do not record real people.

### S8. Summary and next step **[IN CODE: summary]**

> "Your summary is ready."

Then **[PLANNED]**:
> "Would you like to call your insurance company now?" Buttons **Call {insurer}** / **Not now**

Closing reminders, neutral and not legal advice:
> "Keep your photos and this summary. Your insurance company will tell you the next steps."

Disclaimer, always on screen with the summary **[IN CODE]**:
> "This summary does not decide who is at fault, what repairs cost, or anyone's legal responsibility. It is a record of facts; your insurance company and qualified professionals make the final decisions."

---

## 4. Sample dialogue A: minor accident, nobody hurt (demo storyboard)

| # | Who | Line | Screen |
|---|---|---|---|
| 1 | App | "Hi, I'm ScenePilot. I'll guide you one step at a time. Tap Agree and start when you're ready." | Consent |
| 2 | User | taps **Agree and start** | |
| 3 | App | "Is anyone hurt? That includes you, your passengers, and the other driver." | Q1 |
| 4 | User | "No, nobody is hurt." | |
| 5 | App | "Do you see or smell smoke, fire, fuel, or leaking fluid from any vehicle?" | Q2 |
| 6 | User | "No." | |
| 7 | App | "Was a pedestrian, bicyclist, or motorcyclist involved?" then "Did any airbags go off?" then "Did anyone drive away from the scene?" (user says "No" to each) | Q3 to Q5 |
| 8 | App | "Can your vehicle be moved to a safe spot out of traffic?" | Q6 |
| 9 | User | "Yes." | |
| 10 | App | "Is a vehicle blocking a lane or stopped somewhere dangerous, like a highway or a blind curve?" | Q7 |
| 10b | User | "No." | |
| 10c | App | The guidance steps, one at a time: "Take a breath. We will go one step at a time." <pause> "Turn on your hazard lights. If it is safe, move the vehicles out of traffic." and so on. The user taps **Next** after each. | Guidance |
| 11 | App | "Take a photo that shows both vehicles and the road. If it is safe, step back until everything fits." | Camera, core 1 |
| 12 | User | takes a blurry photo | |
| 13 | App | "The photo is blurry or too dark. Hold still, tap to focus, and try again." | Retake banner |
| 14 | User | retakes it | |
| 15 | App | "Got it." <pause> "Take a photo of the other vehicle, close enough that the license plate is readable." | Core 2 |
| 16 | ... | the same pattern for the damage photo | Core 3 |
| 17 | App | "The essential photos are done. You can create the summary now, or finish the rest when it is safe." | Hub |
| 18 | User | taps **Create summary** | |
| 19 | App | "Your summary is ready." <pause> "Would you like to call your insurance company now?" | Summary |

## 5. Sample dialogue B: someone is hurt

| # | Who | Line | Screen |
|---|---|---|---|
| 1 | App | "Is anyone hurt? That includes you, your passengers, and the other driver." | Q1 |
| 2 | User | "Yes, my passenger is bleeding." | |
| 3 | App | "Safety first." <pause> "Call nine one one now and tell them someone may be hurt." <pause> "Stay on the line and follow the dispatcher's instructions." | Emergency screen, **Call 911** |
| 4 | User | taps **Call 911** and talks to the dispatcher | The app is silent during the call |
| 5 | User | afterward taps **Got it** | |
| 6 | App | "Take your time. When you are safe, tap Got it and we'll keep going." then Q2 | Back to the safety questions |

In this scenario the app does not ask for photos until the user chooses to continue. Medical help comes from the 911 dispatcher, never from the app.

---

## 6. Hearing the user: how answers are understood

For the safety questions the app understands plain speech and maps it to Yes / No / Not sure. Examples already covered by tests:

| User says | Understood as |
|---|---|
| "yes", "yeah", "someone is hurt", "my passenger is bleeding", "I hit my head" | Yes |
| "no", "nope", "nobody is hurt", "no injuries", "everyone is okay", "we're all fine" | No |
| "Nobody is hurt but I feel dizzy" | Yes (a danger signal wins) |
| "I'm not sure", "I don't know", "maybe" | Not sure |
| "I'm fine", "whatever", "yes and no" | Unclear. The app asks again. |

Things speech recognition may get wrong under stress: fast speech, shouting, road noise, crying. That is why every question also has big buttons, and why unclear answers count as the risky answer.

## 7. Lines we never say

| Never say | Because |
|---|---|
| "Help is on the way." / "I've called for help." | The app cannot send help. |
| "It's not your fault." / "That driver is at fault." | The app does not judge fault. |
| "You'll be okay." / any medical instruction (moving someone, first aid steps) | The app is not a medical service. Dispatchers do that. |
| "Don't admit anything." / "Don't sign anything." / "You should sue." | Legal advice, and the effect differs by state. |
| Any dollar amount for repairs, claims, or settlements | Not our decision. |
| "You don't have to call the police." / "You must call the police." | Reporting rules differ by state. Say what to check instead (section 3, S2). |

These match the forbidden-output rules in `src/scenepilot/guard.py`. That check applies to AI-written text. Our own fixed lines above must also follow it.

## 8. Open items for team review

1. **State notes** for the demo states: written from official sources, with source links and a last-checked date. Not drafted here.
2. **Police reporting line.** Whether and how to mention it at all. Current draft avoids stating any rule.
3. **Recording (S7).** Needs legal review before any real use. The demo uses actors only.
4. **Voice during a 911 call.** Test on real iPhone and Android devices.
5. **Voice quality.** Browser voices vs. NVIDIA Magpie TTS. Check pace and clarity for the 15-word lines.
6. **Speech-to-text under stress.** Test with noisy, fast, shaky audio. Measure how often the app falls back to buttons.
7. **Check-in timers (section 2).** Confirm the 10 / 20 / 30 second schedule with a few testers, and whether it annoys people in minor accidents.

## 9. Where these lines live in code

| Lines | File |
|---|---|
| Consent, hub, details, summary prompts, retry line, labels, disclaimer | `src/scenepilot/session.py` |
| Safety questions, emergency actions, 911 button | `src/scenepilot/emergency.py` |
| Photo instructions and retake lines | `src/scenepilot/checklist.py` |
| "What to do now" guidance steps | `src/scenepilot/playbooks.py` |
| State notes (Florida, New York) | `src/scenepilot/data/state_notes.json`, `src/scenepilot/states.py` |
| Forbidden-output rules | `src/scenepilot/guard.py` |
| Spoken playback (browser text-to-speech) | `src/scenepilot/static/app.js` |
