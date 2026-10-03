# Jarvis — your AI accountability partner

A mobile app (iOS + Android, built with Expo / React Native) that you can talk to like Jarvis, and that keeps you honest about your goals.

## What it does

- **Conversations.** Chat with Jarvis about anything. It's powered by Claude (`claude-opus-5-5`), with a composed, dry-witted Jarvis personality. Turn on **voice** in Settings and replies are read aloud in a British voice. Use your keyboard's mic button to talk instead of typing.
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

> **Development build:** the app uses native modules (notifications, secure store, speech). Most work in Expo Go, but scheduled notifications need a development build:
> `npx expo run:android` / `npx expo run:ios`, or `npx eas-cli@latest build --profile development`.

### Checks

```bash
npm run typecheck
npm run lint
```

## How it's put together

```
src/
  app/                  Expo Router screens
    _layout.tsx         Root: providers + stack
    (tabs)/index.tsx    Jarvis chat (quick actions, notification → check-in)
    (tabs)/goals.tsx    Habits, commitments, streaks
    (tabs)/settings.tsx API key, name, tone, voice, reminder times, memories
  lib/
    jarvis.ts           The brain: system prompt, tools, Claude tool-use loop
    store.tsx           App state (React context), persisted to AsyncStorage
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

- Hands-free voice input (e.g. `expo-speech-recognition`, which needs a dev build)
- Streaming replies (needs a fetch polyfill with streaming support on React Native)
- A backend proxy plus accounts, so you can sync across devices
- Weekly review summaries and charts
