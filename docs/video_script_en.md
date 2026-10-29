# ScenePilot demo video script (target 2:40, limit 3:00)

Record on a phone-sized screen with the live demo URL. Use staged example photos
that the team took itself (no real accident data, no third-party images, no music).
Say it live; do not edit a pre-recorded run to look real-time.

| Time | On screen | Narration |
|---|---|---|
| 0:00-0:20 | Team member standing by two parked cars, then the app's start screen | "Minutes after a minor car accident, you are shaken and trying to remember what to do. Move the car? Who to call? What not to say? ScenePilot is a calm voice for exactly that moment." |
| 0:20-0:45 | Header with the red 911 button, then safety question 1. Answer by voice: "No." Question 2: tap "No" (car cannot move) | "The 911 button is on screen at every step. Two safety questions, answered by voice or tap. Anything unsure counts as a yes. These decisions come from plain, tested rules, not from a language model." |
| 0:45-1:00 | The numbered action list; voice reads it | "Then one short list, read aloud: hazard lights, stay out of traffic, exchange information, stick to the facts." |
| 1:00-1:50 | Photo step: take a photo that misses the plate, app asks for a retake with a reason, retake, it passes | "Next, photo coaching. NVIDIA Nemotron vision, running on Nebius Token Factory, checks each photo against what the step needs. Here the plate is not readable, so it asks again, and says why." |
| 1:50-2:15 | Conversation watch screen. Say: "I guess it was my fault." A reminder plays. | "While you talk to the other driver, Conversation watch listens in the browser and reminds you, for example, not to admit fault. It stores nothing." |
| 2:15-2:30 | Summary screen with source labels | "At the end, a plain summary. Every item says where it came from: your statement, the AI's observation, or unconfirmed." |
| 2:30-2:40 | Slide: model table | "Nemotron vision for photos, Nemotron 3 Super for questions, Magpie TTS for the voice, all through Nebius Token Factory. ScenePilot. Calm help at the scene." |

## Notes
- Say once, clearly: "ScenePilot is not legal or medical advice."
- Do not state accuracy numbers unless they come from the scripts in `eval/`.
- Upload to YouTube as Public (not Unlisted) and paste the link into Devpost.
