// src/components/MysticButton.tsx
// Shared pill button used across screens instead of the default RN <Button>,
// which can't be restyled to fit the "Midnight Tarot" theme.
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors, fonts, radii, spacing } from '../theme';

type Variant = 'gold' | 'ghost';

type Props = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: Variant;
};

export default function MysticButton({ title, onPress, disabled, loading, variant = 'gold' }: Props) {
  const isDisabled = !!disabled || !!loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variant === 'gold' ? styles.gold : styles.ghost,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'gold' ? colors.textOnGold : colors.goldBright} />
      ) : (
        <Text style={[styles.label, variant === 'gold' ? styles.labelGold : styles.labelGhost]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  gold: {
    backgroundColor: colors.gold,
    borderColor: colors.gold,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: colors.gold,
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.8,
  },
  label: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 14,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  labelGold: { color: colors.textOnGold },
  labelGhost: { color: colors.goldBright },
});
