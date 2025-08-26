// src/screens/HistoryScreen.tsx
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, Pressable, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import { fetchHistory, getUserId } from '../sync';
import { API_URL } from '../config';

type Props = NativeStackScreenProps<RootStackParamList, 'History'>;

type LocalEntry = {
  ts: number;
  mode: 'text' | 'voice';
  text?: string | null;
  fileUri?: string | null;
  result: { top_label: string; scores: { label: string; score: number }[] };
};

type CloudEntry = {
  id: number;
  user_id: string;
  mode: 'text' | 'voice';
  text?: string | null;
  file_url?: string | null;
  top_label: string;
  scores: { label: string; score: number }[];
  created_at: string;
};

function ModeBadge({ mode }: { mode: 'text' | 'voice' }) {
  const label = mode === 'voice' ? 'Voice' : 'Text';
  return (
    <View style={[styles.badge]}>
      <Text style={styles.badgeLabel}>{label}</Text>
    </View>
  );
}

export default function HistoryScreen({ navigation }: Props) {
  const [items, setItems] = useState<LocalEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    // 1) local entries (backwards compatible)
    const raw = await AsyncStorage.getItem('history');
    const local: LocalEntry[] = raw ? JSON.parse(raw) : [];

    // 2) cloud entries (mapped into local shape)
    let cloudMapped: LocalEntry[] = [];
    try {
      const cloud: CloudEntry[] = await fetchHistory(50);
      cloudMapped = cloud.map((c) => ({
        ts: c.created_at ? Date.parse(c.created_at) : Date.now(),
        mode: c.mode,
        text: c.mode === 'text' ? (c.text ?? '') : null,
        // if you later add /upload-audio and store file_url, we can stream it:
        fileUri: c.file_url ? `${API_URL}${c.file_url}` : null,
        result: { top_label: c.top_label, scores: c.scores },
      }));
    } catch (e) {
      // ignore cloud failures; show local only
      console.warn('cloud history fetch failed', e);
    }

    // 3) merge + de-dupe (prefer newest by timestamp)
    const merged = [...cloudMapped, ...local].sort((a, b) => (b.ts || 0) - (a.ts || 0));
    setItems(merged);
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    load();
    return unsub;
  }, [navigation, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const clearHistory = async () => {
    Alert.alert('Clear local history', 'This removes only local entries (cloud stays). Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem('history');
          await load();
        },
      },
    ]);
  };

  const openEntry = (e: LocalEntry) => {
    navigation.navigate('Result', {
      text: e.mode === 'voice' ? '[voice clip]' : e.text ?? '',
      top_label: e.result.top_label,
      scores: e.result.scores,
      mode: e.mode,
      fileUri: e.fileUri ?? null,
    });
  };

  const renderItem = ({ item }: { item: LocalEntry }) => {
    const dt = new Date(item.ts);
    const dateLabel = isNaN(dt.getTime()) ? '' : dt.toLocaleString();
    return (
      <Pressable onPress={() => openEntry(item)} style={styles.row}>
        <View style={{ flex: 1 }}>
          <View style={styles.rowHeader}>
            <Text style={styles.rowTitle}>{item.result.top_label}</Text>
            <ModeBadge mode={item.mode} />
          </View>
          {dateLabel ? <Text style={styles.rowMeta}>{dateLabel}</Text> : null}
          {item.mode === 'text' && item.text ? (
            <Text numberOfLines={2} style={styles.rowPreview}>{item.text}</Text>
          ) : item.fileUri ? (
            <Text numberOfLines={1} style={styles.rowPreview}>{item.fileUri}</Text>
          ) : null}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.title}>History</Text>
        <Pressable onPress={clearHistory} style={styles.clearBtn}>
          <Text style={styles.clearBtnText}>Clear Local</Text>
        </Pressable>
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyWrap}><Text style={styles.emptyText}>No entries yet.</Text></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => String(it.ts)}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: 'white' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 24, fontWeight: '800' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#666' },
  row: { paddingVertical: 12, paddingHorizontal: 8, borderRadius: 10, backgroundColor: '#fafafa' },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowTitle: { fontWeight: '800', fontSize: 16 },
  rowMeta: { color: '#6a6a6a', fontSize: 12, marginTop: 2 },
  rowPreview: { color: '#333', marginTop: 6 },
  sep: { height: 10 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: '#ddd', backgroundColor: 'white' },
  badgeLabel: { fontWeight: '700', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 },
  clearBtn: { paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, backgroundColor: 'white' },
  clearBtnText: { fontWeight: '700' },
});
