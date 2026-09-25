// src/screens/HomeScreen.tsx
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Pressable,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import { API_URL, apiError, apiHeaders, fetchWithWake, friendlyErrorMessage } from '../config';
import {
  AudioQuality,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { fetchHistory, loadLocalHistory, mergeHistory, saveEntry, syncPending } from '../sync';
import { computeInsights, InsightBundle, TimelineEntry } from '../analytics';
import { colors, fonts, radii, spacing } from '../theme';
import MysticButton from '../components/MysticButton';
import OrnamentDivider from '../components/OrnamentDivider';

type Mode = 'text' | 'voice';
type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

// 16kHz mono WAV matches what the backend's mood model expects.
const WAV_RECORDING_OPTIONS: RecordingOptions = {
  extension: '.wav',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 256000,
  android: {
    extension: '.wav',
    outputFormat: 'default',
    audioEncoder: 'default',
  },
  ios: {
    extension: '.wav',
    audioQuality: AudioQuality.HIGH,
    outputFormat: IOSOutputFormat.LINEARPCM,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {},
};

export default function HomeScreen({ navigation }: Props) {
  // --- Shared UI state ---
  const [mode, setMode] = useState<Mode>('text');

  // --- Text mode state ---
  const [text, setText] = useState('');
  const [loadingText, setLoadingText] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);

  // --- Voice mode state ---
  const audioRecorder = useAudioRecorder(WAV_RECORDING_OPTIONS);
  const [isRecording, setIsRecording] = useState(false);
  const [loadingVoice, setLoadingVoice] = useState(false);
  const [lastRecordingUri, setLastRecordingUri] = useState<string | null>(null);

  // Set when an analyze request is slow enough that the server is likely cold.
  const [waking, setWaking] = useState(false);

  // --- Insight state ---
  const [insights, setInsights] = useState<InsightBundle | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  const refreshInsights = useCallback(async () => {
    setLoadingInsights(true);
    setInsightsError(null);
    try {
      const local = await loadLocalHistory();

      let cloud: Awaited<ReturnType<typeof fetchHistory>> = [];
      try {
        await syncPending();
        cloud = await fetchHistory(75);
      } catch (err) {
        console.warn('History sync failed (non-blocking)', err);
      }

      const timeline: TimelineEntry[] = mergeHistory(local, cloud)
        .filter((e) => e.result?.top_label && !Number.isNaN(e.ts))
        .map((e) => ({
          timestamp: e.ts,
          topLabel: String(e.result.top_label),
          scores: (e.result.scores ?? [])
            .filter((sc) => sc && typeof sc.label === 'string' && sc.score != null)
            .map((sc) => ({ label: String(sc.label), score: Number(sc.score) })),
          mode: e.mode ?? 'text',
        }));

      const bundle = computeInsights(timeline);
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
    // A warm server answers in a few seconds; past that, assume a cold start.
    const wakeTimer = setTimeout(() => setWaking(true), 8000);
    try {
      const res = await fetchWithWake(
        `${API_URL}/analyze`,
        {
          method: 'POST',
          headers: apiHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ text }),
        },
        () => setWaking(true)
      );
      if (!res.ok) throw await apiError(res);
      const data = await res.json();

      await saveEntry({ ts: Date.now(), mode: 'text', text, fileUri: null, result: data });

      refreshInsights();

      navigation.navigate('Result', {
        text,
        top_label: data.top_label,
        scores: data.scores,
        mode: 'text',
        fileUri: null,
      });
    } catch (e: any) {
      Alert.alert("Couldn't read that entry", friendlyErrorMessage(e));
    } finally {
      clearTimeout(wakeTimer);
      setLoadingText(false);
      setWaking(false);
    }
  };

  // ========= VOICE MODE =========
  const startRecording = async () => {
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert(
        'Microphone access needed',
        'Turn on microphone access for MoodLens in Settings to record a voice entry.'
      );
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setIsRecording(true);
      setLastRecordingUri(null);
    } catch (e: any) {
      console.warn('start recording failed', e);
      Alert.alert("Couldn't start recording", 'Please try again.');
    }
  };

  const stopRecording = async () => {
    try {
      await audioRecorder.stop();
      setIsRecording(false);
      setLastRecordingUri(audioRecorder.uri ?? null);
    } catch (e: any) {
      setIsRecording(false);
      console.warn('stop recording failed', e);
      Alert.alert("Couldn't stop recording", 'Please try recording again.');
    }
  };

  const uploadRecording = async () => {
    if (!lastRecordingUri) {
      Alert.alert('No recording to upload', 'Record a clip first.');
      return;
    }
    setLoadingVoice(true);
    // A warm server answers in a few seconds; past that, assume a cold start.
    const wakeTimer = setTimeout(() => setWaking(true), 8000);
    try {
      const recordedFile = new File(lastRecordingUri);
      if (!recordedFile.exists) throw new Error('Recorded file not found');

      const form = new FormData();
      // @ts-ignore React Native FormData file shape
      form.append('file', {
        uri: lastRecordingUri,
        name: 'voice.wav',
        type: 'audio/wav',
      });

      const res = await fetchWithWake(
        `${API_URL}/analyze-audio`,
        {
          method: 'POST',
          headers: apiHeaders({ 'Content-Type': 'multipart/form-data' }),
          body: form,
        },
        () => setWaking(true)
      );
      if (!res.ok) throw await apiError(res);
      const data = await res.json();

      await saveEntry({
        ts: Date.now(),
        mode: 'voice',
        text: null,
        fileUri: lastRecordingUri,
        result: data,
      });

      refreshInsights();

      navigation.navigate('Result', {
        text: '[voice clip]',
        top_label: data.top_label,
        scores: data.scores,
        mode: 'voice',
        fileUri: lastRecordingUri,
        hint: data.hint ?? null,
      });
    } catch (e: any) {
      Alert.alert("Couldn't read that clip", friendlyErrorMessage(e));
    } finally {
      clearTimeout(wakeTimer);
      setLoadingVoice(false);
      setWaking(false);
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
      <Text style={styles.subtitle}>Speak your mind, and let the reading begin.</Text>
      <TextInput
        style={[styles.input, inputFocused && styles.inputFocused]}
        placeholder="How are you feeling today?"
        placeholderTextColor={colors.textMuted}
        multiline
        value={text}
        onChangeText={setText}
        onFocus={() => setInputFocused(true)}
        onBlur={() => setInputFocused(false)}
        textAlignVertical="top"
      />
      <MysticButton title="Reveal My Mood" onPress={analyzeText} loading={loadingText} />
      {loadingText && waking ? <WakingNote /> : null}
    </View>
  );

  const renderVoiceUI = () => (
    <View style={styles.card}>
      <Text style={styles.subtitle}>Record a short voice clip (2–6 seconds works best).</Text>
      {!isRecording ? (
        <MysticButton title="Start Recording" onPress={startRecording} />
      ) : (
        <MysticButton title="Stop Recording" onPress={stopRecording} variant="ghost" />
      )}
      {lastRecordingUri ? (
        <Text style={styles.muted} numberOfLines={1}>
          ✦ Captured: {lastRecordingUri.split('/').pop()}
        </Text>
      ) : null}
      <MysticButton
        title="Reveal My Mood"
        onPress={uploadRecording}
        loading={loadingVoice}
        disabled={!lastRecordingUri || isRecording}
      />
      {loadingVoice && waking ? <WakingNote /> : null}
    </View>
  );

  return (
    <LinearGradient
      colors={[colors.background, colors.backgroundGradientMid, colors.backgroundGradientEnd]}
      style={styles.flex}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <Text style={styles.eyebrow}>✦ ✧ ✦</Text>
          <Text style={styles.title}>MoodLens</Text>
          <Text style={styles.subtitleLead}>A quiet reading of what you carry today.</Text>

          <View style={styles.topRow}>
            {renderToggle()}
            <Pressable style={styles.historyBtn} onPress={() => navigation.navigate('History')}>
              <Text style={styles.historyBtnText}>☽ Readings</Text>
            </Pressable>
          </View>

          <InsightsPanel loading={loadingInsights} error={insightsError} insights={insights} />

          {mode === 'text' ? renderTextUI() : renderVoiceUI()}

          <View style={styles.privacyCard}>
            <Text style={styles.privacyTitle}>Kept in confidence</Text>
            <Text style={styles.privacyCopy}>
              Entries are sent to the MoodLens server to be read. Your written entries and their
              readings are saved to a private history tied to an anonymous ID on this device — no name, email, or account.
              Voice clips are analyzed and not stored on the server. You can delete everything at any
              time from Readings.
            </Text>
          </View>

          <View style={styles.privacyCard}>
            <Text style={styles.privacyTitle}>Not medical care</Text>
            <Text style={styles.privacyCopy}>
              MoodLens is a reflection tool, not a medical device or a substitute for professional
              help. Its readings can be wrong.
            </Text>
            <CrisisLinks />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

function WakingNote() {
  return (
    <Text style={styles.muted}>
      ☾ Waking up the oracle — the first reading after a quiet spell can take a minute or two.
    </Text>
  );
}

// US crisis line; shown with the disclaimer and on every heavy-mood alert.
function CrisisLinks() {
  return (
    <View style={styles.crisisRow}>
      <Text style={styles.privacyCopy}>In crisis or thinking about self-harm? In the US, </Text>
      <Pressable onPress={() => Linking.openURL('tel:988')} hitSlop={8}>
        <Text style={styles.crisisLink}>call 988</Text>
      </Pressable>
      <Text style={styles.privacyCopy}> or </Text>
      <Pressable onPress={() => Linking.openURL('sms:988')} hitSlop={8}>
        <Text style={styles.crisisLink}>text 988</Text>
      </Pressable>
      <Text style={styles.privacyCopy}>. Elsewhere, contact your local emergency number.</Text>
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
        <ActivityIndicator color={colors.gold} />
        <Text style={styles.insightsMuted}>Reading the signs…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.insightsCardError}>
        <Text style={styles.insightsErrorTitle}>The reading is unclear</Text>
        <Text style={styles.insightsErrorCopy}>{error}</Text>
      </View>
    );
  }

  if (!insights || insights.entriesAnalyzed === 0) {
    return (
      <View style={styles.insightsCard}>
        <Text style={styles.insightsTitle}>Daily Reading</Text>
        <Text style={styles.insightsMuted}>
          Capture a few entries to unlock personalized trends, recommendations, and gentle alerts.
        </Text>
      </View>
    );
  }

  const recommendation = insights.recommendation;

  return (
    <View style={styles.insightsCard}>
      <Text style={styles.insightsTitle}>Daily Reading</Text>
      {insights.todaySummary ? (
        <Text style={styles.insightsPrimary}>{insights.todaySummary}</Text>
      ) : null}
      {insights.trendMessage ? (
        <Text style={styles.insightsBody}>{insights.trendMessage}</Text>
      ) : null}
      {insights.monthMessage ? (
        <Text style={styles.insightsBody}>{insights.monthMessage}</Text>
      ) : null}
      {insights.lunarMessage ? (
        <Text style={styles.insightsMuted}>☾ {insights.lunarMessage}</Text>
      ) : null}
      {insights.headsUp ? (
        <View style={styles.headsUpBox}>
          <Text style={styles.headsUpTitle}>✦ Today's Outlook</Text>
          <Text style={styles.headsUpCopy}>{insights.headsUp}</Text>
        </View>
      ) : null}
      {insights.alert ? (
        <View style={styles.alertBox}>
          <Text style={styles.alertTitle}>✦ A Gentle Check-In</Text>
          <Text style={styles.alertCopy}>{insights.alert}</Text>
          <CrisisLinks />
        </View>
      ) : null}

      {recommendation ? (
        <View style={styles.recoBox}>
          <Text style={styles.recoTitle}>{recommendation.headline}</Text>
          {recommendation.actions.map((action) => (
            <Text style={styles.recoItem} key={action}>
              ✦ {action}
            </Text>
          ))}
        </View>
      ) : null}

      {insights.distribution.length ? (
        <>
          <OrnamentDivider />
          <View style={styles.distWrap}>
            {insights.distribution.map((item) => (
              <View key={item.label} style={styles.distRow}>
                <Text style={styles.distLabel}>{item.label}</Text>
                <Text style={styles.distValue}>{item.percent}%</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flexGrow: 1, padding: spacing.lg, gap: spacing.lg },

  eyebrow: {
    textAlign: 'center',
    color: colors.goldDim,
    fontSize: 14,
    letterSpacing: 4,
    marginTop: spacing.sm,
  },
  title: {
    textAlign: 'center',
    fontFamily: fonts.display,
    fontSize: 34,
    color: colors.goldBright,
    letterSpacing: 2,
  },
  subtitleLead: {
    textAlign: 'center',
    fontFamily: fonts.bodyRegular,
    fontStyle: 'italic',
    color: colors.textSecondary,
    fontSize: 16,
    marginBottom: spacing.sm,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.surface,
  },
  subtitle: {
    fontFamily: fonts.bodyRegular,
    fontStyle: 'italic',
    color: colors.textSecondary,
    fontSize: 16,
  },
  input: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    minHeight: 120,
    backgroundColor: colors.surfaceRaised,
    color: colors.textPrimary,
    fontFamily: fonts.body,
    fontSize: 16,
  },
  inputFocused: {
    borderColor: colors.gold,
  },

  toggleWrap: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 4,
    alignSelf: 'flex-start',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radii.sm,
  },
  toggleBtnActive: {
    backgroundColor: colors.gold,
  },
  toggleLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.textSecondary,
  },
  toggleLabelActive: { color: colors.textOnGold },

  muted: { color: colors.textMuted, fontSize: 13, fontFamily: fonts.bodyRegular },

  historyBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: 'transparent',
  },
  historyBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.goldBright },

  insightsCard: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.surface,
  },
  insightsCardError: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.danger,
    padding: spacing.lg,
    gap: spacing.xs,
    backgroundColor: colors.dangerBg,
  },
  insightsTitle: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 18,
    color: colors.goldBright,
    letterSpacing: 1,
  },
  insightsPrimary: { fontFamily: fonts.bodySemiBold, fontSize: 17, color: colors.textPrimary },
  insightsBody: { fontFamily: fonts.body, fontSize: 16, color: colors.textSecondary },
  insightsMuted: { fontFamily: fonts.bodyRegular, fontStyle: 'italic', fontSize: 14, color: colors.textMuted },
  insightsErrorTitle: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: colors.danger },
  insightsErrorCopy: { fontFamily: fonts.body, color: colors.textSecondary },

  alertBox: {
    backgroundColor: colors.amberGlowBg,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.amberGlowBorder,
  },
  alertTitle: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.amberGlowBorder },
  alertCopy: { fontFamily: fonts.body, fontSize: 15, color: colors.amberGlowText },

  headsUpBox: {
    backgroundColor: colors.violetGlowBg,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.violetGlowBorder,
  },
  headsUpTitle: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.violetGlowBorder },
  headsUpCopy: { fontFamily: fonts.body, fontSize: 15, color: colors.violetGlowText },

  recoBox: {
    borderRadius: radii.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceRaised,
    borderLeftWidth: 3,
    borderLeftColor: colors.gold,
    gap: 6,
  },
  recoTitle: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: colors.goldBright },
  recoItem: { fontFamily: fonts.body, fontSize: 15, color: colors.textSecondary },

  distWrap: { gap: spacing.xs },
  distRow: { flexDirection: 'row', justifyContent: 'space-between' },
  distLabel: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.textSecondary },
  distValue: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.goldBright },

  privacyCard: {
    borderRadius: radii.lg,
    padding: spacing.md,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.goldDim,
    gap: 4,
  },
  privacyTitle: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.goldDim },
  privacyCopy: { fontFamily: fonts.bodyRegular, color: colors.textMuted, fontSize: 13 },
  crisisRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: spacing.xs },
  crisisLink: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.goldBright,
    textDecorationLine: 'underline',
  },
});
