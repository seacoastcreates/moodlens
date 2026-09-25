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

// The API scales to zero when idle, and a cold start (booting + loading the
// models) can take ~70s - longer than iOS waits before failing a request.
// wakeServer() starts that boot early (on launch/foreground) while the user
// is still writing or recording; the response itself doesn't matter.
export function wakeServer() {
  fetch(`${API_URL}/`).catch(() => {});
}

// For the analyze calls: if the request fails at the network level (the
// server was still booting and the connection timed out), retry once and
// let the UI say it's waking up. HTTP errors (4xx/5xx) are not retried.
export async function fetchWithWake(
  url: string,
  init: RequestInit,
  onWaking?: () => void
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    onWaking?.();
    return await fetch(url, init);
  }
}

// A non-2xx API response. `detail` is the server's message, which is only
// ever shown to users for 400s and 429s (the backend keeps those user-safe).
export class ApiError extends Error {
  constructor(public status: number, public detail: string | null) {
    super(`API error ${status}`);
  }
}

export async function apiError(res: Response): Promise<ApiError> {
  let detail: string | null = null;
  try {
    const body = await res.json();
    if (typeof body?.detail === 'string') detail = body.detail;
  } catch {
    // non-JSON body; no detail to surface
  }
  return new ApiError(res.status, detail);
}

export function friendlyErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if ((e.status === 400 || e.status === 429) && e.detail) return e.detail;
    return 'Something went wrong on our end. Please try again in a moment.';
  }
  // fetch rejects (rather than returning a response) on network failures.
  return "Couldn't reach MoodLens. Check your connection and try again.";
}
