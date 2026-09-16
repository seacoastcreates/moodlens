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

Set `EXPO_PUBLIC_API_URL` in `.env` to point at the FastAPI server (see `.env.example`) — `src/config.ts` falls back to a per-platform localhost/emulator address if it's unset.

## Testing

```bash
npm test
```

Runs the Jest suite (currently `src/analytics.test.ts`, covering the insights/recommendation engine).
