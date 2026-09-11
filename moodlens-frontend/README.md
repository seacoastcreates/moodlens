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

Point `API_URL` in `src/config.ts` at the FastAPI server (`http://localhost:8000` when running locally).
