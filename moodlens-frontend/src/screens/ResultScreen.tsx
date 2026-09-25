// src/screens/ResultScreen.tsx
import React from 'react';
import { View, Text, StyleSheet, FlatList, Alert, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { getRecommendationsForEmotion } from '../analytics';
import { colors, fonts, radii, spacing } from '../theme';
import MysticButton from '../components/MysticButton';
import OrnamentDivider from '../components/OrnamentDivider';

type Props = NativeStackScreenProps<RootStackParamList, 'Result'>;

function ModeBadge({ mode }: { mode?: 'text' | 'voice' }) {
  const label = mode === 'voice' ? 'Voice' : 'Text';
  return (
    <View style={styles.badge}>
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
  const hint = route.params.hint;
  const recommendations = getRecommendationsForEmotion(top_label);

  // --- audio playback state ---
  const player = useAudioPlayer(fileUri || undefined);
  const playerStatus = useAudioPlayerStatus(player);

  const onPlayPause = async () => {
    if (!fileUri) return;
    try {
      if (playerStatus.playing) {
        player.pause();
      } else {
        await player.seekTo(0);
        player.play();
      }
    } catch (e: any) {
      console.warn('playback failed', e);
      Alert.alert("Couldn't play the clip", 'The recording may no longer be on this device.');
    }
  };

  return (
    <LinearGradient
      colors={[colors.background, colors.backgroundGradientMid, colors.backgroundGradientEnd]}
      style={styles.flex}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.eyebrow}>The Reading</Text>
          <ModeBadge mode={mode} />
        </View>

        <View style={styles.revealCard}>
          <Text style={styles.revealLabel}>{top_label}</Text>
          {typeof topPct === 'number' ? (
            <Text style={styles.revealPct}>{topPct}% certainty</Text>
          ) : null}
          {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        </View>

        {mode === 'voice' && !!fileUri ? (
          <View style={styles.voiceBar}>
            <Text style={styles.muted} numberOfLines={1}>
              ✦ Source: {fileUri.split('/').pop()}
            </Text>
            <MysticButton
              title={playerStatus.playing ? 'Pause' : 'Play Clip'}
              onPress={onPlayPause}
              variant="ghost"
            />
          </View>
        ) : null}

        <OrnamentDivider />

        <Text style={styles.subheading}>The Full Reading</Text>
        <FlatList
          data={scores}
          keyExtractor={(item) => item.label}
          scrollEnabled={false}
          renderItem={({ item }) => {
            const pct = Math.max(0, Math.min(100, item.score * 100));
            return (
              <View style={styles.row}>
                <View style={styles.rowHeader}>
                  <Text style={styles.label}>{item.label}</Text>
                  <Text style={styles.scoreText}>{pct.toFixed(1)}%</Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${pct}%` }]} />
                </View>
              </View>
            );
          }}
        />

        {recommendations ? (
          <View style={styles.recoBox}>
            <Text style={styles.recoTitle}>{recommendations.headline}</Text>
            {recommendations.actions.map((action) => (
              <Text key={action} style={styles.recoItem}>
                ✦ {action}
              </Text>
            ))}
          </View>
        ) : null}

        <OrnamentDivider />

        <Text style={styles.subheading}>What You Shared</Text>
        <Text style={styles.text}>{text}</Text>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: spacing.lg, gap: spacing.md },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 15,
    letterSpacing: 2,
    color: colors.goldDim,
    textTransform: 'uppercase',
  },

  revealCard: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: colors.surface,
  },
  revealLabel: {
    fontFamily: fonts.display,
    fontSize: 34,
    color: colors.goldBright,
    letterSpacing: 1,
    textTransform: 'capitalize',
    textAlign: 'center',
  },
  revealPct: {
    fontFamily: fonts.bodyRegular,
    fontStyle: 'italic',
    fontSize: 15,
    color: colors.textSecondary,
  },
  hint: {
    fontFamily: fonts.bodyRegular,
    fontStyle: 'italic',
    color: colors.textMuted,
    fontSize: 13,
    marginTop: spacing.xs,
    textAlign: 'center',
  },

  subheading: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 16,
    color: colors.goldBright,
    letterSpacing: 1,
  },

  row: { paddingVertical: spacing.xs, gap: 6 },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: colors.textPrimary, textTransform: 'capitalize' },
  scoreText: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textSecondary },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.gold,
  },

  text: { fontFamily: fonts.body, fontSize: 16, color: colors.textSecondary },
  muted: { fontFamily: fonts.bodyRegular, color: colors.textMuted, fontSize: 13 },

  voiceBar: { gap: spacing.sm },

  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: 'transparent',
  },
  badgeLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: colors.goldBright,
  },
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
});
