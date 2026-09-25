jest.mock('expo-secure-store', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () => ({}));

import { CloudEntry, LocalEntry, mergeHistory } from './sync';

const local = (ts: number, cloudId?: number | null): LocalEntry => ({
  ts,
  mode: 'text',
  text: `local ${ts}`,
  result: { top_label: 'joy', scores: [{ label: 'joy', score: 1 }] },
  ...(cloudId === undefined ? {} : { cloudId }),
});

const cloud = (id: number, iso: string): CloudEntry => ({
  id,
  mode: 'text',
  text: `cloud ${id}`,
  top_label: 'joy',
  scores: [{ label: 'joy', score: 1 }],
  created_at: iso,
});

describe('mergeHistory', () => {
  it('shows a synced entry once, as the local copy', () => {
    const merged = mergeHistory([local(1000, 7)], [cloud(7, '2026-01-01T00:00:00Z')]);
    expect(merged).toHaveLength(1);
    expect(merged[0].text).toBe('local 1000');
  });

  it('includes cloud entries this device has no copy of', () => {
    const merged = mergeHistory([], [cloud(3, '2026-01-01T00:00:00Z')]);
    expect(merged).toHaveLength(1);
    expect(merged[0].cloudId).toBe(3);
  });

  it('keeps unsynced and legacy local entries', () => {
    const merged = mergeHistory([local(2000, null), local(1000)], []);
    expect(merged.map((e) => e.ts)).toEqual([2000, 1000]);
  });

  it('sorts newest first across sources', () => {
    const merged = mergeHistory(
      [local(Date.parse('2026-01-02T00:00:00Z'), 1)],
      [cloud(1, '2026-01-02T00:00:00Z'), cloud(2, '2026-01-03T00:00:00Z')]
    );
    expect(merged.map((e) => e.cloudId)).toEqual([2, 1]);
  });
});
