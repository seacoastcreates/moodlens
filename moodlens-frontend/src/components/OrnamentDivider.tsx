// src/components/OrnamentDivider.tsx
// Recurring "tarot card" flourish used to separate sections within a card.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

export default function OrnamentDivider() {
  return (
    <View style={styles.row}>
      <View style={styles.line} />
      <Text style={styles.glyph}>✦</Text>
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.goldDim },
  glyph: { color: colors.gold, fontSize: 12 },
});
