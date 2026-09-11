// src/screens/HomeScreen.tsx
import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import { API_URL } from '../config';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { fetchHistory, pushHistory } from '../sync';
import { computeInsights, InsightBundle, TimelineEntry } from '../analytics';

type Mode = 'text' | 'voice';
type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  // --- Shared UI state ---
  const [mode, setMode] = useState<Mode>('text');

  // --- Text mode state ---
  const [text, setText] = useState('');
  const [loadingText, setLoadingText] = useState(false);

  // --- Voice mode state ---
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [loadingVoice, setLoadingVoice] = useState(false);
  const [lastRecordingUri, setLastRecordingUri] = useState<string | null>(null);

  // --- Insight state ---
  const [insights, setInsights] = useState<InsightBundle | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  const refreshInsights = useCallback(async () => {
    setLoadingInsights(true);
    setInsightsError(null);
    try {
      const raw = await AsyncStorage.getItem('history');
      const local: any[] = raw ? JSON.parse(raw) : [];

      let cloud: any[] = [];
      try {
        cloud = await fetchHistory(75);
      } catch (err) {
        console.warn('History sync failed (non-blocking)', err);
      }

      const timeline: TimelineEntry[] = [];

      const normalizeScores = (scores: any): { label: string; score: number }[] =>
        Array.isArray(scores)
          ? scores
              .filter((s: any) => s && typeof s.label === 'string' && s.score != null)
              .map((s: any) => ({ label: String(s.label), score: Number(s.score) }))
          : [];

      const addEntry = (entry: any, isCloud = false) => {
        const tsSource = isCloud ? entry.created_at : entry.ts;
        const timestamp = typeof tsSource === 'number' ? tsSource : Date.parse(tsSource ?? '');
        const topLabel = isCloud ? entry.top_label : entry.result?.top_label;
        const scores = isCloud ? entry.scores : entry.result?.scores;
        if (!topLabel || Number.isNaN(timestamp)) return;

        timeline.push({
          timestamp,
          topLabel: String(topLabel),
          scores: normalizeScores(scores),
          mode: (isCloud ? entry.mode : entry.mode) ?? 'text',
        });
      };

      local.forEach((entry) => addEntry(entry));
      cloud.forEach((entry) => addEntry(entry, true));

      const deduped = Array.from(
        new Map(
          timeline.map((entry) => [
            `${Math.round(entry.timestamp)}-${entry.topLabel}-${entry.mode}`,
            entry,
          ])
        ).values()
      );

      const bundle = computeInsights(deduped);
      setInsights(bundle);
    } catch (err: any) {
      setInsightsError(err?.message ?? 'Unable to load insights');
    } finally {
      setLoadingInsights(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshInsights();
    }, [refreshInsights])
  );

  // ========= TEXT MODE =========
  const analyzeText = async () => {
    if (!text.trim()) {
      Alert.alert('Please enter some text');
      return;
    }
    setLoadingText(true);
    try {
      const res = await fetch(`${API_URL}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Analyze failed (${res.status}): ${t}`);
      }
      const data = await res.json();

      const entry = { ts: Date.now(), mode: 'text' as const, text, fileUri: null, result: data };
      const existing = await AsyncStorage.getItem('history');
      const history = existing ? JSON.parse(existing) : [];
      history.unshift(entry);
      await AsyncStorage.setItem('history', JSON.stringify(history));

      await pushHistory({
        mode: 'text',
        text,
        top_label: data.top_label,
        scores: data.scores,
      });

      refreshInsights();

      navigation.navigate('Result', {
        text,
        top_label: data.top_label,
        scores: data.scores,
        mode: 'text',
        fileUri: null,
      });
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to analyze text');
    } finally {
      setLoadingText(false);
    }
  };

  // ========= VOICE MODE =========
  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Microphone permission required');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        android: {
          extension: '.wav',
          outputFormat: Audio.AndroidOutputFormat.DEFAULT,
          audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 256000,
        },
        ios: {
          extension: '.wav',
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 256000,
          outputFormat: Audio.IOSOutputFormat.LINEARPCM,
        },
        web: {},
      } as any);

      await recording.startAsync();
      recordingRef.current = recording;
      setIsRecording(true);
      setLastRecordingUri(null);
    } catch (e: any) {
      Alert.alert('Error starting recording', e?.message ?? String(e));
    }
  };

  const stopRecording = async () => {
    try {
      const rec = recordingRef.current;
      if (!rec) return;
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      setIsRecording(false);
      setLastRecordingUri(uri ?? null);
    } catch (e: any) {
      setIsRecording(false);
      Alert.alert('Error stopping recording', e?.message ?? String(e));
    } finally {
      recordingRef.current = null;
    }
  };

  const uploadRecording = async () => {
    if (!lastRecordingUri) {
      Alert.alert('No recording to upload', 'Record a clip first.');
      return;
    }
    setLoadingVoice(true);
    try {
      const info = await FileSystem.getInfoAsync(lastRecordingUri);
      if (!info.exists) throw new Error('Recorded file not found');

      const form = new FormData();
      // @ts-ignore React Native FormData file shape
      form.append('file', {
        uri: lastRecordingUri,
        name: 'voice.wav',
        type: 'audio/wav',
      });

      const res = await fetch(`${API_URL}/analyze-audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'multipart/form-data' },
        body: form,
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Analyze failed (${res.status}): ${t}`);
      }
      const data = await res.json();

      const entry = {
        ts: Date.now(),
        mode: 'voice' as const,
        text: null,
        fileUri: lastRecordingUri,
        result: data,
      };
      const existing = await AsyncStorage.getItem('history');
      const history = existing ? JSON.parse(existing) : [];
      history.unshift(entry);
      await AsyncStorage.setItem('history', JSON.stringify(history));

      await pushHistory({
        mode: 'voice',
        text: null,
        top_label: data.top_label,
        scores: data.scores,
      });

      refreshInsights();

      navigation.navigate('Result', {
        text: '[voice clip]',
        top_label: data.top_label,
        scores: data.scores,
        mode: 'voice',
        fileUri: lastRecordingUri,
      });
    } catch (e: any) {
      Alert.alert('Upload error', e?.message ?? String(e));
    } finally {
      setLoadingVoice(false);
    }
  };

  // ========= RENDER =========
  const renderToggle = () => (
    <View style={styles.toggleWrap}>
      <Pressable
        onPress={() => setMode('text')}
        style={[styles.toggleBtn, mode === 'text' && styles.toggleBtnActive]}
      >
        <Text style={[styles.toggleLabel, mode === 'text' && styles.toggleLabelActive]}>Text</Text>
      </Pressable>
      <Pressable
        onPress={() => setMode('voice')}
        style={[styles.toggleBtn, mode === 'voice' && styles.toggleBtnActive]}
      >
        <Text style={[styles.toggleLabel, mode === 'voice' && styles.toggleLabelActive]}>Voice</Text>
      </Pressable>
    </View>
  );

  const renderTextUI = () => (
    <View style={styles.card}>
      <Text style={styles.subtitle}>Type a quick journal note and get an emotion read.</Text>
      <TextInput
        style={styles.input}
        placeholder="How are you feeling today?"
        multiline
        value={text}
        onChangeText={setText}
        textAlignVertical="top"
      />
      {loadingText ? <ActivityIndicator /> : <Button title="Analyze Text" onPress={analyzeText} />}
    </View>
  );

  const renderVoiceUI = () => (
    <View style={styles.card}>
      <Text style={styles.subtitle}>Record a short voice clip (2–6 seconds works best).</Text>
      {!isRecording ? (
        <Button title="Start Recording" onPress={startRecording} />
      ) : (
        <Button title="Stop Recording" onPress={stopRecording} />
      )}
      <View style={{ height: 12 }} />
      {lastRecordingUri ? <Text style={styles.muted}>Recorded: {lastRecordingUri}</Text> : null}
      {loadingVoice ? (
        <ActivityIndicator />
      ) : (
        <Button
          title="Analyze Voice"
          onPress={uploadRecording}
          disabled={!lastRecordingUri || isRecording}
        />
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>MoodLens</Text>
      <Text style={styles.subtitleLead}>Track how you feel across text, voice, and more.</Text>

      <View style={styles.topRow}>
        {renderToggle()}
        <Pressable style={styles.historyBtn} onPress={() => navigation.navigate('History')}>
          <Text style={styles.historyBtnText}>History</Text>
        </Pressable>
      </View>

      <InsightsPanel loading={loadingInsights} error={insightsError} insights={insights} />

      {mode === 'text' ? renderTextUI() : renderVoiceUI()}

      <View style={styles.privacyCard}>
        <Text style={styles.privacyTitle}>Privacy first</Text>
        <Text style={styles.privacyCopy}>
          Text entries stay local until you sync. Voice clips remain on device unless you choose to
          upload. You’re in control of what reaches the cloud.
        </Text>
      </View>
    </View>
  );
}

type InsightsProps = {
  loading: boolean;
  error: string | null;
  insights: InsightBundle | null;
};

function InsightsPanel({ loading, error, insights }: InsightsProps) {
  if (loading) {
    return (
      <View style={styles.insightsCard}>
        <ActivityIndicator />
        <Text style={styles.insightsMuted}>Crunching your mood trends…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.insightsCardError}>
        <Text style={styles.insightsErrorTitle}>Insights unavailable</Text>
        <Text style={styles.insightsErrorCopy}>{error}</Text>
      </View>
    );
  }

  if (!insights || insights.entriesAnalyzed === 0) {
    return (
      <View style={styles.insightsCard}>
        <Text style={styles.insightsTitle}>Daily mood insights</Text>
        <Text style={styles.insightsMuted}>
          Capture a few entries to unlock personalized trends, recommendations, and gentle alerts.
        </Text>
      </View>
    );
  }

  const recommendation = insights.recommendation;

  return (
    <View style={styles.insightsCard}>
      <Text style={styles.insightsTitle}>Daily mood insights</Text>
      {insights.todaySummary ? (
        <Text style={styles.insightsPrimary}>{insights.todaySummary}</Text>
      ) : null}
      {insights.trendMessage ? (
        <Text style={styles.insightsBody}>{insights.trendMessage}</Text>
      ) : null}
      {insights.alert ? (
        <View style={styles.alertBox}>
          <Text style={styles.alertTitle}>Predictive alert</Text>
          <Text style={styles.alertCopy}>{insights.alert}</Text>
        </View>
      ) : null}

      {recommendation ? (
        <View style={styles.recoBox}>
          <Text style={styles.recoTitle}>{recommendation.headline}</Text>
          {recommendation.actions.map((action) => (
            <Text style={styles.recoItem} key={action}>
              • {action}
            </Text>
          ))}
        </View>
      ) : null}

      {insights.distribution.length ? (
        <View style={styles.distWrap}>
          {insights.distribution.map((item) => (
            <View key={item.label} style={styles.distRow}>
              <Text style={styles.distLabel}>{item.label}</Text>
              <Text style={styles.distValue}>{item.percent}%</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 16, backgroundColor: 'white' },
  title: { fontSize: 32, fontWeight: '800' },
  subtitleLead: { color: '#4d4d4d', marginBottom: 8 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  card: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    backgroundColor: '#fafafa',
  },
  subtitle: { color: '#333' },
  input: {
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    minHeight: 120,
    backgroundColor: 'white',
  },

  toggleWrap: {
    flexDirection: 'row',
    backgroundColor: '#f1f1f1',
    borderRadius: 10,
    padding: 4,
    alignSelf: 'flex-start',
    gap: 6,
  },
  toggleBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  toggleBtnActive: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  toggleLabel: { fontWeight: '600', color: '#666' },
  toggleLabelActive: { color: '#111' },

  muted: { color: '#666', fontSize: 12 },

  historyBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: 'white',
  },
  historyBtnText: { fontWeight: '700' },

  insightsCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e3e3e7',
    padding: 18,
    gap: 10,
    backgroundColor: '#f8f9ff',
  },
  insightsCardError: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#f5c4c4',
    padding: 18,
    gap: 8,
    backgroundColor: '#fff6f6',
  },
  insightsTitle: { fontWeight: '700', fontSize: 18 },
  insightsPrimary: { fontWeight: '600', color: '#1f2933' },
  insightsBody: { color: '#394150' },
  insightsMuted: { color: '#6a738b' },
  insightsErrorTitle: { fontWeight: '700', color: '#a11a1a' },
  insightsErrorCopy: { color: '#8a2121' },
  alertBox: {
    backgroundColor: '#fff3cd',
    borderRadius: 12,
    padding: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: '#ffe9a7',
  },
  alertTitle: { fontWeight: '700', color: '#835200' },
  alertCopy: { color: '#7a5c00' },
  recoBox: {
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e8e8f0',
    gap: 6,
  },
  recoTitle: { fontWeight: '700', color: '#1b2653' },
  recoItem: { color: '#394150' },
  distWrap: { marginTop: 6, gap: 6 },
  distRow: { flexDirection: 'row', justifyContent: 'space-between' },
  distLabel: { fontWeight: '600', color: '#394150' },
  distValue: { color: '#394150' },

  privacyCard: {
    marginTop: 16,
    borderRadius: 16,
    padding: 14,
    backgroundColor: '#f1f5fb',
    borderWidth: 1,
    borderColor: '#d8deeb',
    gap: 4,
  },
  privacyTitle: { fontWeight: '700', color: '#1b2653' },
  privacyCopy: { color: '#4a5779', fontSize: 12 },
});
