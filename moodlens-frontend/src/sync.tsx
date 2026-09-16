// src/sync.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL, apiHeaders } from './config';

// Get or create a stable user_id (persist in AsyncStorage)
export async function getUserId(): Promise<string> {
  let id = await AsyncStorage.getItem('user_id');
  if (!id) {
    id = `device-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    await AsyncStorage.setItem('user_id', id);
  }
  return id;
}

type Score = { label: string; score: number };

export async function pushHistory(entry: {
  mode: 'text' | 'voice';
  text?: string | null;
  file_url?: string | null;  // if you later upload audio to server
  top_label: string;
  scores: Score[];
}) {
  const user_id = await getUserId();
  const payload = {
    user_id,
    mode: entry.mode,
    text: entry.text ?? null,
    file_url: entry.file_url ?? null,
    top_label: entry.top_label,
    scores: entry.scores,
  };

  const res = await fetch(`${API_URL}/history`, {
    method: 'POST',
    headers: apiHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`History sync failed (${res.status}): ${t}`);
  }
  return res.json();
}

export async function fetchHistory(limit = 50) {
  const user_id = await getUserId();
  const url = `${API_URL}/history?user_id=${encodeURIComponent(user_id)}&limit=${limit}`;
  const res = await fetch(url, { headers: apiHeaders() });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Fetch history failed (${res.status}): ${t}`);
  }
  return res.json();
}
