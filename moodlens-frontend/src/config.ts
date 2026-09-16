// src/config.ts
import { Platform } from 'react-native';

// heuristics used when EXPO_PUBLIC_API_URL isn't set in .env:
// - iOS Simulator can use 127.0.0.1
// - Android emulator needs 10.0.2.2
// - Physical devices need your Mac's LAN IP or an HTTPS tunnel
const LOCAL_BASE =
  Platform.OS === 'ios'
    ? 'http://127.0.0.1:8000'
    : Platform.OS === 'android'
    ? 'http://10.0.2.2:8000'
    : 'http://127.0.0.1:8000';

// Set EXPO_PUBLIC_API_URL in .env (physical device LAN IP, ngrok tunnel, etc).
export const API_URL = process.env.EXPO_PUBLIC_API_URL || LOCAL_BASE;

// Shared secret expected by the backend's require_api_key dependency (see
// moodlens-backend/main.py). Note this only keeps out casual/anonymous
// requests, not someone who inspects the built app - EXPO_PUBLIC_ values are
// bundled into the JS in plain text, not truly secret.
export const API_KEY = process.env.EXPO_PUBLIC_API_KEY ?? '';

export function apiHeaders(extra?: Record<string, string>): Record<string, string> {
  return { 'X-API-Key': API_KEY, ...extra };
}
