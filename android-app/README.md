# ScenePilot Android app

An Android wrapper (Capacitor) around the same web UI that `src/scenepilot/static` serves. The web code is **not changed**: `build-www.mjs` copies it into `www/` and adds three app-only files from `native/`. The web version can still be submitted on its own.

## Why an app

A browser asks for the microphone and location per web address, and only on HTTPS. In the app the permissions belong to the app: the phone asks **once at first use** and remembers, whatever the server's address is.

What the app changes (all in `native/`, none in the web code):

| File | What it does |
|---|---|
| `api-shim.js` | Adds the server's address in front of `/api/...` calls (set with `SCENEPILOT_API_BASE` when building). |
| `native-speech.js` | Replaces the browser's speech recognition (Android web views do not have it) with Android's own recognizer. Command matching and `?fakespeech` are untouched. |
| `build-www.mjs` | Copies the web files, makes paths relative, and wires the two files above in. |

Everything else (location, microphone permission, camera through the file picker, spoken guidance) is handled by Android's web view.

## Build and run (Galaxy S25 over USB)

One time:

1. Install [Android Studio](https://developer.android.com/studio) with its default SDK.
2. On the phone: Settings → About phone → Software information → tap **Build number** 7 times, then Settings → Developer options → turn on **USB debugging**. Connect the cable and allow the computer.
3. On the PC, in `.env` add `SCENEPILOT_CORS_ORIGINS=https://localhost` (lets the app call the server) and restart the server. The server must be reachable from the phone (same Wi-Fi; allow port 8000 in the Windows firewall), or deployed.

Every time the web code or the server address changes:

```bash
cd android-app
SCENEPILOT_API_BASE=http://<PC address>:8000 npm run sync     # PowerShell: $env:SCENEPILOT_API_BASE="http://<PC address>:8000"; npm run sync
npx cap open android                                           # opens Android Studio: choose the phone, press Run
```

`npm run run:phone` does build, sync and run in one go once `ANDROID_HOME` points at the SDK.

## Notes

- **Cleartext HTTP is allowed** (`usesCleartextTraffic` in the manifest and `allowMixedContent`) so the app can reach a server on the local network. Remove both and use an `https://` server address before releasing.
- The app asks for microphone, location and camera at first use. Consent is remembered inside the app like in the browser.
- **Checked:** the build script, the manifest permissions, the CORS switch and the speech adapter against a fake plugin, and installing and opening the app on a Galaxy S25. **Not yet checked on the phone:** Magpie audio playback in the web view, spoken free questions, speech recognition in noise, and whether the microphone and location permissions are asked only once.
