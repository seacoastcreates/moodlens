// src/screens/ResultScreen.tsx
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Button, Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import { Audio } from 'expo-av';
import { getRecommendationsForEmotion } from '../analytics';

type Props = NativeStackScreenProps<RootStackParamList, 'Result'>;

function ModeBadge({ mode }: { mode?: 'text' | 'voice' }) {
  const label = mode === 'voice' ? 'Voice' : 'Text';
  return (
    <View style={[styles.badge, styles.badgeNeutral]}>
      <Text style={styles.badgeLabel}>{label}</Text>
    </View>
  );
}

export default function ResultScreen({ route }: Props) {
  const { text, top_label, scores, mode, fileUri } = route.params;
  const topPct =
  // prefer server-provided value when present
  (route.params as any).top_confidence ??
  (scores?.[0]?.score != null ? Math.round(scores[0].score * 100) : undefined);
  const hint = (route.params as any).hint;
  const recommendations = getRecommendationsForEmotion(top_label);
  
  // --- audio playback state ---
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    return () => {
      // unload on unmount
      (async () => {
        try {
          if (soundRef.current) {
            await soundRef.current.stopAsync().catch(() => {});
            await soundRef.current.unloadAsync().catch(() => {});
          }
        } catch {}
      })();
    };
  }, []);

  const loadIfNeeded = async () => {
    if (!fileUri) return;
    if (isLoaded && soundRef.current) return;
    try {
      const { sound } = await Audio.Sound.createAsync({ uri: fileUri });
      soundRef.current = sound;
      setIsLoaded(true);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        setIsPlaying(status.isPlaying);
      });
    } catch (e: any) {
      Alert.alert('Audio error', e?.message ?? String(e));
    }
  };

  const onPlayPause = async () => {
    if (!fileUri) return;
    await loadIfNeeded();
    const sound = soundRef.current;
    if (!sound) return;
    const status = await sound.getStatusAsync();
    if (!status.isLoaded) return;
    if (status.isPlaying) {
      await sound.pauseAsync();
    } else {
      await sound.playFromPositionAsync(0);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Predicted Emotion</Text>
        <ModeBadge mode={mode} />
      </View>

      <Text style={styles.top}>{top_label}</Text>

      {mode === 'voice' && !!fileUri ? (
        <View style={styles.voiceBar}>
          <Text style={styles.muted} numberOfLines={1}>Source: {fileUri}</Text>
          <Button title={isPlaying ? 'Pause' : 'Play'} onPress={onPlayPause} />
        </View>
      ) : null}

      <Text style={styles.subheading}>Breakdown</Text>
      <Text style={styles.top}>
        {top_label}
        {typeof topPct === 'number' ? ` (${topPct}%)` : ''}
      </Text>

      <FlatList
        data={scores}
        keyExtractor={(item) => item.label}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.label}>{item.label}</Text>
            <Text>{(item.score * 100).toFixed(1)}%</Text>
          </View>
        )}
      />

      {hint ? <Text style={{ color: '#666', fontStyle: 'italic', marginTop: 8 }}>{hint}</Text> : null}

      {recommendations ? (
        <View style={styles.recoBox}>
          <Text style={styles.recoTitle}>{recommendations.headline}</Text>
          {recommendations.actions.map((action) => (
            <Text key={action} style={styles.recoItem}>
              • {action}
            </Text>
          ))}
        </View>
      ) : null}


      <Text style={styles.subheading}>Input</Text>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: 'white' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heading: { fontSize: 20, fontWeight: '700' },
  subheading: { fontSize: 16, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  top: { fontSize: 28, fontWeight: '800', marginTop: 6, marginBottom: 6 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomColor: '#eee',
    borderBottomWidth: 1,
  },
  label: { fontWeight: '600' },
  text: { marginTop: 8, color: '#333' },
  muted: { color: '#6a6a6a', fontSize: 12, marginBottom: 8 },

  voiceBar: { gap: 8, marginBottom: 8 },

  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  badgeNeutral: { backgroundColor: '#fff', borderColor: '#ddd' },
  badgeLabel: { fontWeight: '700', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6 },
  recoBox: {
    marginTop: 16,
    borderRadius: 14,
    backgroundColor: '#f6f8ff',
    borderWidth: 1,
    borderColor: '#e2e7ff',
    padding: 14,
    gap: 6,
  },
  recoTitle: { fontWeight: '700', color: '#1b2653' },
  recoItem: { color: '#394150' },
});
