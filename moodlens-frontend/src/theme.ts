// src/theme.ts
// "Midnight Tarot" theme: near-black indigo, deep violet, antique gold,
// star/moon motifs. Shared by every screen so the app reads as one system
// instead of each screen inventing its own palette.

export const colors = {
  // Backdrop
  background: '#120e28',
  backgroundGradientEnd: '#1d1642',
  backgroundGradientMid: '#171233',

  // Cards / surfaces
  surface: '#1e1840',
  surfaceRaised: '#251d4d',
  border: '#40356e',

  // Gold - the theme's primary accent, used for borders, dividers, icons
  gold: '#c9a227',
  goldBright: '#e8c766',
  goldDim: '#8a7434',

  // Text
  textPrimary: '#efe9fb',
  textSecondary: '#bcb0dd',
  textMuted: '#8579ab',
  textOnGold: '#1c1533',

  // Violet accent (used for the forward-looking "heads up" reading)
  violetGlowBg: '#241a4d',
  violetGlowBorder: '#7a5ce0',
  violetGlowText: '#c9bcf5',

  // Amber/copper accent (used for the reactive "predictive alert")
  amberGlowBg: '#33210f',
  amberGlowBorder: '#c98a3f',
  amberGlowText: '#e8c99a',

  // Status
  danger: '#e0806a',
  dangerBg: '#3a1f22',
} as const;

export const fonts = {
  display: 'Cinzel_700Bold',
  displaySemiBold: 'Cinzel_600SemiBold',
  displayRegular: 'Cinzel_400Regular',
  body: 'CormorantGaramond_500Medium',
  bodySemiBold: 'CormorantGaramond_600SemiBold',
  bodyBold: 'CormorantGaramond_700Bold',
  bodyRegular: 'CormorantGaramond_400Regular',
} as const;

export const fontAssets = {
  Cinzel_400Regular: require('@expo-google-fonts/cinzel/400Regular/Cinzel_400Regular.ttf'),
  Cinzel_600SemiBold: require('@expo-google-fonts/cinzel/600SemiBold/Cinzel_600SemiBold.ttf'),
  Cinzel_700Bold: require('@expo-google-fonts/cinzel/700Bold/Cinzel_700Bold.ttf'),
  CormorantGaramond_400Regular: require('@expo-google-fonts/cormorant-garamond/400Regular/CormorantGaramond_400Regular.ttf'),
  CormorantGaramond_500Medium: require('@expo-google-fonts/cormorant-garamond/500Medium/CormorantGaramond_500Medium.ttf'),
  CormorantGaramond_600SemiBold: require('@expo-google-fonts/cormorant-garamond/600SemiBold/CormorantGaramond_600SemiBold.ttf'),
  CormorantGaramond_700Bold: require('@expo-google-fonts/cormorant-garamond/700Bold/CormorantGaramond_700Bold.ttf'),
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radii = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;

// A thin gold hairline, the recurring "tarot card border" motif.
export const goldBorder = {
  borderWidth: 1,
  borderColor: colors.gold,
} as const;
