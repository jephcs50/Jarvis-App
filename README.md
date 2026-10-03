# Jarvis — your AI accountability partner

A mobile app (iOS + Android, built with Expo / React Native) that you can talk to like Jarvis, and that keeps you honest about your goals.

## What it does

- **Conversations.** Chat with Jarvis about anything. It's powered by Claude (`claude-opus-5-5`), with a composed, dry-witted Jarvis personality. Turn on **voice** in Settings and typed replies are read aloud in a British voice.
- **Hands-free voice.** Tap 🎙 in the chat (it shows when the text box is empty) and just talk. Jarvis listens, replies out loud, then listens again, so you can hold a whole conversation with the phone in your pocket. Say "that's all" or "goodbye" (or tap **End**) to finish. It switches itself off after a few silent listens, and whenever the app goes to the background. In voice mode Jarvis keeps its replies short and spoken-style.
- **"Hey Jarvis" wake word.** Turn it on in Settings, and while the app is open (e.g. on a desk or stand), say "Hey Jarvis". It answers "Yes?" and drops you straight into a hands-free conversation, then goes back to listening for its name once you're done. Detection uses [Picovoice Porcupine](https://picovoice.ai/platform/porcupine/) and runs entirely on the phone. No audio leaves the device until Jarvis wakes up. A small indicator in the chat shows when it's listening.
- **Accountability.** Jarvis sees your goals, streaks and overdue tasks on every message, and acts on them:
  - Say "I'm going to start running every morning" and it offers to track it, or just adds it.
  - Say "did my run" and it logs it and updates your streak.
  - Miss something and it asks what got in the way, and how much it pushes is up to you (gentle / balanced / tough love).
- **Daily check-ins.** A morning briefing and an evening review arrive as notifications (times set in Settings). Tapping one opens Jarvis straight into that check-in.
- **Goals screen.** Daily habits with a 7-day history and 🔥 streaks, plus one-off commitments with due dates. Tap to check off, long-press to archive.
- **Memory.** Jarvis remembers durable facts about you (your job, what motivates you, recurring obstacles). You can see and delete them in Settings.

## Running it

```bash
npm install
npx expo start
```

Then scan the QR code with a development build on your phone (see the note below), or press `a` / `i` for an emulator.

On first launch, open **Settings** and paste an Anthropic API key from [console.anthropic.com](https://console.anthropic.com). It's stored in the device's secure keychain (`expo-secure-store`).

For the wake word, also paste a free Picovoice AccessKey from [console.picovoice.ai](https://console.picovoice.ai), then switch on **Listen for "Hey Jarvis"**.

> **Development build:** the app uses native modules (notifications, secure store, speech). Hands-free voice (`expo-speech-recognition`), the wake word (Porcupine) and scheduled notifications need a development build. The rest of the app still runs in Expo Go, where these features explain that they're unavailable.
> Build one with `npx expo run:android` / `npx expo run:ios`, or `npx eas-cli@latest build --profile development`.

### Install on an Android phone or tablet (no Android Studio)

Expo's cloud build service (EAS) builds a standalone APK you can install directly. It needs a free account at [expo.dev](https://expo.dev). Run these on any computer with Node.js:

```bash
git clone -b ccr-7a25f5c9-g4bq92 https://github.com/jephcs50/Jarvis-App.git
cd Jarvis-App
npm install
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview
```

The first run asks to create the EAS project and an Android signing key. Say yes to both. The build takes about 10–20 minutes. When it finishes, the CLI prints a link and a QR code. Open it on the tablet, download the APK, and allow "Install unknown apps" for your browser when Android asks. The `preview` build runs on its own, with no computer or dev server needed.

### Checks

```bash
npm run typecheck
npm run lint
```

## How it's put together

```
src/
  components/
    VoicePanel.tsx      Pulsing orb + live transcript during hands-free mode
  app/                  Expo Router screens
    _layout.tsx         Root: providers + stack
    (tabs)/index.tsx    Jarvis chat (quick actions, notification → check-in)
    (tabs)/goals.tsx    Habits, commitments, streaks
    (tabs)/settings.tsx API key, name, tone, voice, reminder times, memories
  lib/
    jarvis.ts           The brain: system prompt, tools, Claude tool-use loop
    store.tsx           App state (React context), persisted to AsyncStorage
    voice.ts            Hands-free loop: listen → send → speak → listen again
    wakeWord.ts         On-device "Jarvis" detection; hands the mic to voice.ts
    notifications.ts    Daily morning/evening check-in scheduling
    dates.ts            Streaks and date helpers
    storage.ts          AsyncStorage + SecureStore
```

**The Claude integration** (`src/lib/jarvis.ts`):

- Jarvis has four tools: `add_goal`, `log_progress`, `archive_goal`, `remember`. These run locally against your goals, and the results are shown as small notes in the chat ("Now tracking: Run 3 km").
- The system prompt never changes. Each turn, the current time, goals and memories go into a `<context>` block at the front of your message. That keeps the prompt cache warm, and keeps the conversation history append-only, which thinking blocks require.
- **Server-side compaction** (`compact-2026-01-12`) summarizes old history, so a months-long conversation keeps working.
- **Refusal fallbacks** (`fallbacks: "default"`) are on. If a safety classifier declines a message, the API re-runs it on Anthropic's recommended fallback model instead of failing.
- Effort is set to `low` so replies come back quickly on a phone. Raise it in `jarvis.ts` if you want more deliberate answers.

## Important: API key security

This app calls the Anthropic API **directly from the phone using your own key**, which is fine for a personal app on your own device. **Don't ship it to other people this way:** anyone with the app could pull the key out. To distribute it, put a small backend between the app and the API that holds the key, and point the client at it (`new Anthropic({ baseURL, ... })`).

## Ideas for next steps

- Wake word in the background or with the screen locked (Android foreground service; iOS background-audio mode, which App Store review scrutinizes)
- A custom-trained "Hey Jarvis" model (`.ppn` from the Picovoice console plus a config plugin to bundle it). The built-in "Jarvis" keyword already triggers on "Hey Jarvis"
- A more natural voice using a neural text-to-speech API
- Streaming replies (needs a fetch polyfill with streaming support on React Native)
- A backend proxy plus accounts, so you can sync across devices
- Weekly review summaries and charts
