# MoodLens Frontend

Expo app that pairs with the FastAPI backend to deliver the MoodLens experience.

## Features

- **Smart Journaling:** Switch between text and voice entries, each analyzed by the backend emotion models.
- **Daily Mood Insights:** Home screen surfaces today’s dominant mood, rolling weekly trends, and emotion distribution.
- **Personalized Recommendations:** Every result highlights mood-aware actions—breathing prompts, playlists, check-ins, and more.
- **Predictive Alerts:** Lightweight heuristics flag repeating heavy moods so you can plan resets or reach out for support.
- **Privacy First:** Voice clips stay on-device; nothing syncs to the cloud unless you opt in.

## Getting Started

```bash
cd moodlens-frontend
npm install   # installs expo + react-native deps
npm run start # launches Expo (press i for iOS simulator)
```

Set `EXPO_PUBLIC_API_URL` in `.env` to point at the FastAPI server (see `.env.example`) — `src/config.ts` falls back to a per-platform localhost/emulator address if it's unset. `EXPO_PUBLIC_API_KEY` must match the backend's `API_KEY`.

## Running on your phone

No build needed: install **Expo Go** from the App Store, run `npm run start`,
and scan the QR code from the terminal/browser. Your phone and Mac need to
be on the same Wi-Fi, with `EXPO_PUBLIC_API_URL` set to your Mac's LAN IP.
This works because the app currently only uses modules Expo Go supports
(expo-av, async-storage, react-navigation) — no custom native code.

## Standalone builds (EAS)

For a build that doesn't need Expo Go — e.g. once you add a native module
Expo Go doesn't support, or want to share the app without an Expo account —
`eas.json` has the usual three profiles (`development`, `preview`,
`production`). To use them:

1. `npx eas-cli login` (free Expo account).
2. `npx eas-cli build:configure` — links this project to your account and
   writes an EAS project id into `app.json`.
3. `npx eas-cli build --platform ios --profile preview`

**Apple Developer Program enrollment ($99/yr) is required for anything that
installs on a physical iPhone** (ad-hoc distribution needs your device's
UDID registered to a provisioning profile) — an iOS Simulator build doesn't
need it. Android has no equivalent paid requirement; an APK from the
`preview` profile installs directly.

The `development` profile also needs the `expo-dev-client` package added
(`npx expo install expo-dev-client`) before it'll build — don't add it
until you actually need a dev client, since its presence changes how
`npm run start` launches the app (it stops defaulting to plain Expo Go).

## Testing

```bash
npm test
```

Runs the Jest suite (currently `src/analytics.test.ts`, covering the insights/recommendation engine).
