// src/screens/HomeScreen.tsx
import React, { useRef, useState } from 'react';
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
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import { API_URL } from '../config';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { pushHistory } from '../sync';

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

      // Save simple history entry
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

      // Configure linear PCM WAV (16 kHz mono)
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
      form.append('file', {
        // @ts-ignore React Native FormData file
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

      // Save history entry (keep the actual fileUri)
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
        // file_url: remoteUrlFromUpload, // optional if you implement upload
        top_label: data.top_label,
        scores: data.scores,
      });

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
      <View style={styles.topRow}>
        {renderToggle()}
        <Pressable style={styles.historyBtn} onPress={() => navigation.navigate('History')}>
          <Text style={styles.historyBtnText}>History</Text>
        </Pressable>
      </View>

      {mode === 'text' ? renderTextUI() : renderVoiceUI()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 16, backgroundColor: 'white' },
  title: { fontSize: 28, fontWeight: '800' },
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
});
