# App Idea: MoodLens – AI-Powered Emotional Journal

A mobile app that uses machine learning to analyze your emotions from text, voice, and even selfies, helping you track your mental health over time.

## Core Features

1. Smart Journal Entries

- Users can type, talk, or snap a quick selfie.

- An NLP model (like BERT or GPT fine-tuned on emotion classification) detects mood from text/voice.

- A vision model (like AffectNet-trained CNN or CLIP) infers emotions from facial expressions.

2. Daily Mood Insights

- The app summarizes the user’s emotional state across modalities.

- Provides trends (e.g., “You’ve been more stressed on Mondays” or “Happier after workouts”).

3. Personalized Recommendations

- Recommends activities (meditation, walks, journaling prompts) based on mood.

- Can integrate with Spotify/Apple Music to suggest uplifting playlists.

4. Predictive Alerts

- ML models detect patterns (e.g., early signs of burnout or depressive cycles).

- Sends gentle nudges like: “Last time you felt this way for 3+ days, you benefitted from reaching out to a friend.”

5. Privacy First

- On-device inference for sensitive data.

- Users control what’s stored in the cloud.

## Run it (iOS Simulator friendly)

1. Start the backend (one time model download)
   `cd moodlens-backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in API_KEY (see moodlens-backend/README.md)
uvicorn main:app --reload --host 0.0.0.0 --port 8000`

   `--host 0.0.0.0` is required for a physical phone on the same Wi-Fi to
   reach it — the default (`127.0.0.1`) only accepts connections from the
   Mac itself, which is why the Simulator works without it but a real
   device silently can't connect.

2. Start the app (Expo)
   `cd ../moodlens-frontend
npm install
cp .env.example .env   # EXPO_PUBLIC_API_KEY must match the backend's API_KEY
npm run start`
