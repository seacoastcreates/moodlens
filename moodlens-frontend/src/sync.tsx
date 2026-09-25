// src/sync.ts
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL, apiHeaders } from './config';

const TOKEN_KEY = 'moodlens_auth_token';

// Registering mints a fresh, unguessable user_id on the server and returns a
// token that cryptographically proves this device owns it (see /register and
// require_user in moodlens-backend/main.py). Stored in SecureStore - the
// Keychain/Keystore - since it's a real credential now, not just a label.
async function registerDevice(): Promise<string> {
  const res = await fetch(`${API_URL}/register`, {
    method: 'POST',
    headers: apiHeaders(),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Registration failed (${res.status}): ${t}`);
  }
  const data = await res.json();
  await SecureStore.setItemAsync(TOKEN_KEY, data.token);
  return data.token;
}

// Guards against two concurrent callers (e.g. a history fetch and a history
// push firing at nearly the same moment on first launch) both finding no
// stored token and each registering a separate, orphaned device identity.
let inFlightRegistration: Promise<string> | null = null;

async function getAuthToken(): Promise<string> {
  const existing = await SecureStore.getItemAsync(TOKEN_KEY);
  if (existing) return existing;

  if (!inFlightRegistration) {
    inFlightRegistration = registerDevice();
  }
  const pending = inFlightRegistration;
  try {
    return await pending;
  } finally {
    if (inFlightRegistration === pending) {
      inFlightRegistration = null;
    }
  }
}

type Score = { label: string; score: number };

// Sends a request as this device, re-registering once if the server rejects
// the stored token (e.g. the server's TOKEN_SECRET was rotated, or the token
// came from a dev server). The old identity is unusable at that point anyway.
async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const send = (token: string) =>
    fetch(`${API_URL}${path}`, {
      ...init,
      headers: apiHeaders({ ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` }),
    });

  const res = await send(await getAuthToken());
  if (res.status !== 401) return res;
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  return send(await getAuthToken());
}

export type CloudEntry = {
  id: number;
  mode: 'text' | 'voice';
  text?: string | null;
  file_url?: string | null;
  top_label: string;
  scores: Score[];
  created_at: string;
};

// On-device record of an entry. cloudId is the server's id once synced, null
// while a sync is pending, and absent on entries saved before sync tracking
// existed (those are never retried, to avoid re-uploading duplicates).
export type LocalEntry = {
  ts: number;
  mode: 'text' | 'voice';
  text?: string | null;
  fileUri?: string | null;
  result: { top_label: string; scores: Score[] };
  cloudId?: number | null;
};

const HISTORY_KEY = 'history';

export async function loadLocalHistory(): Promise<LocalEntry[]> {
  const raw = await AsyncStorage.getItem(HISTORY_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function updateLocalEntry(ts: number, patch: Partial<LocalEntry>) {
  // Re-read rather than reuse a snapshot, so a concurrent save isn't lost.
  const history = await loadLocalHistory();
  const next = history.map((e) => (e.ts === ts ? { ...e, ...patch } : e));
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
}

async function pushHistory(entry: LocalEntry): Promise<CloudEntry> {
  const res = await authedFetch('/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: entry.mode,
      text: entry.mode === 'text' ? entry.text ?? null : null,
      file_url: null,
      top_label: entry.result.top_label,
      scores: entry.result.scores,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`History sync failed (${res.status}): ${t}`);
  }
  return res.json();
}

// Entries with an upload in progress, so saveEntry's background sync and a
// syncPending() retry can't both upload the same entry.
const syncing = new Set<number>();

async function syncOne(entry: LocalEntry) {
  if (syncing.has(entry.ts)) return;
  syncing.add(entry.ts);
  try {
    const cloud = await pushHistory(entry);
    await updateLocalEntry(entry.ts, { cloudId: cloud.id });
  } finally {
    syncing.delete(entry.ts);
  }
}

// Saves on-device first, then syncs in the background. A failed sync never
// blocks showing the result; syncPending() retries it later.
export async function saveEntry(entry: Omit<LocalEntry, 'cloudId'>) {
  const local: LocalEntry = { ...entry, cloudId: null };
  const history = await loadLocalHistory();
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify([local, ...history]));
  syncOne(local).catch((err) => console.warn('History sync failed; will retry', err));
}

let inFlightSync: Promise<void> | null = null;

// Retries entries whose earlier sync failed. Single-flight so overlapping
// screen focuses can't upload the same entry twice.
export function syncPending(): Promise<void> {
  if (inFlightSync) return inFlightSync;
  const run = (async () => {
    const pending = (await loadLocalHistory()).filter((e) => e.cloudId === null);
    for (const entry of pending.reverse()) {
      await syncOne(entry);
    }
  })().finally(() => {
    inFlightSync = null;
  });
  inFlightSync = run;
  return run;
}

export async function fetchHistory(limit = 50): Promise<CloudEntry[]> {
  const res = await authedFetch(`/history?limit=${limit}`);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Fetch history failed (${res.status}): ${t}`);
  }
  return res.json();
}

// One list with each entry once: every local entry, plus cloud entries this
// device doesn't hold a copy of (e.g. after reinstalling, since the Keychain
// token survives but local storage doesn't). Newest first.
export function mergeHistory(local: LocalEntry[], cloud: CloudEntry[]): LocalEntry[] {
  const localIds = new Set(local.map((e) => e.cloudId).filter((id) => id != null));
  const cloudOnly: LocalEntry[] = cloud
    .filter((c) => !localIds.has(c.id))
    .map((c) => ({
      ts: c.created_at ? Date.parse(c.created_at) : Date.now(),
      mode: c.mode,
      text: c.mode === 'text' ? c.text ?? '' : null,
      fileUri: null,
      result: { top_label: c.top_label, scores: c.scores },
      cloudId: c.id,
    }));
  return [...local, ...cloudOnly].sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

// "Delete my data": wipes this device's entries on the server, then forgets
// the device identity so any future entries start under a fresh, unlinked
// user_id. A device that never registered has nothing in the cloud to delete.
export async function deleteCloudHistory() {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!token) return;

  const res = await fetch(`${API_URL}/history`, {
    method: 'DELETE',
    headers: apiHeaders({ Authorization: `Bearer ${token}` }),
  });
  // 401: the server no longer recognizes this token, so nothing it can
  // reach is tied to it - there's nothing left to delete.
  if (!res.ok && res.status !== 401) {
    const t = await res.text();
    throw new Error(`Delete failed (${res.status}): ${t}`);
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
