// src/screens/HistoryScreen.tsx
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, Pressable, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import {
  CloudEntry,
  deleteCloudHistory,
  fetchHistory,
  LocalEntry,
  loadLocalHistory,
  mergeHistory,
} from '../sync';
import { colors, fonts, radii, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'History'>;

function ModeBadge({ mode }: { mode: 'text' | 'voice' }) {
  const label = mode === 'voice' ? 'Voice' : 'Text';
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeLabel}>{label}</Text>
    </View>
  );
}

export default function HistoryScreen({ navigation }: Props) {
  const [items, setItems] = useState<LocalEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const local = await loadLocalHistory();
    let cloud: CloudEntry[] = [];
    try {
      cloud = await fetchHistory(50);
    } catch (e) {
      // ignore cloud failures; show local only
      console.warn('cloud history fetch failed', e);
    }
    const merged = mergeHistory(local, cloud);
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

  const deleteAllData = async () => {
    Alert.alert(
      'Delete all your data',
      'This permanently deletes every entry from this device and from the MoodLens server. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: async () => {
            try {
              // Cloud first: if it fails, local stays intact so the user can
              // retry and nothing looks deleted that isn't.
              await deleteCloudHistory();
              await AsyncStorage.removeItem('history');
              await load();
              Alert.alert('Deleted', 'All your entries have been removed.');
            } catch (e) {
              console.warn('delete failed', e);
              Alert.alert(
                "Couldn't delete",
                'We could not reach the server, so nothing was deleted. Check your connection and try again.'
              );
            }
          },
        },
      ]
    );
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
            <Text numberOfLines={1} style={styles.rowPreview}>{item.fileUri.split('/').pop()}</Text>
          ) : null}
        </View>
      </Pressable>
    );
  };

  return (
    <LinearGradient
      colors={[colors.background, colors.backgroundGradientMid, colors.backgroundGradientEnd]}
      style={styles.flex}
    >
      <View style={styles.container}>
        <View style={styles.topBar}>
          <Text style={styles.subtitle}>Every reading you've asked for, kept safe.</Text>
          <Pressable onPress={deleteAllData} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>Delete All</Text>
          </Pressable>
        </View>

        {items.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyGlyph}>☽ ✦ ☾</Text>
            <Text style={styles.emptyText}>No readings yet.</Text>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(it) => (it.cloudId != null ? `c${it.cloudId}` : `l${it.ts}`)}
            renderItem={renderItem}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />
            }
          />
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, padding: spacing.lg },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md, gap: spacing.sm },
  subtitle: {
    flex: 1,
    fontFamily: fonts.bodyRegular,
    fontStyle: 'italic',
    color: colors.textSecondary,
    fontSize: 15,
  },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  emptyGlyph: { color: colors.goldDim, fontSize: 18, letterSpacing: 6 },
  emptyText: { fontFamily: fonts.bodyRegular, fontStyle: 'italic', color: colors.textMuted },
  row: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowTitle: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 16,
    color: colors.goldBright,
    textTransform: 'capitalize',
  },
  rowMeta: { fontFamily: fonts.bodyRegular, color: colors.textMuted, fontSize: 12, marginTop: 2 },
  rowPreview: { fontFamily: fonts.body, color: colors.textSecondary, fontSize: 15, marginTop: 6 },
  sep: { height: spacing.sm },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: 'transparent',
  },
  badgeLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: colors.goldBright,
  },
  clearBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    backgroundColor: 'transparent',
  },
  clearBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.textSecondary },
});
