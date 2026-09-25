// src/App.tsx
import React, { useCallback, useEffect } from 'react';
import { AppState, StatusBar } from 'react-native';
import { DarkTheme, NavigationContainer, Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import HomeScreen from './screens/HomeScreen';
import ResultScreen from './screens/ResultScreen';
import HistoryScreen from './screens/HistoryScreen';
import { colors, fontAssets, fonts } from './theme';
import { wakeServer } from './config';

export type RootStackParamList = {
  Home: undefined;
  Result: {
    text: string;
    top_label: string;
    scores: { label: string; score: number }[];
    mode?: 'text' | 'voice';
    fileUri?: string | null;
    hint?: string | null;
  };
  History: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.surface,
    border: colors.border,
    text: colors.textPrimary,
    primary: colors.gold,
  },
};

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [fontsLoaded] = useFonts(fontAssets);

  // Start the API's cold start as soon as the app opens or returns to the
  // foreground, so it's usually warm by the time an entry is submitted.
  useEffect(() => {
    wakeServer();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') wakeServer();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.goldBright,
          headerTitleStyle: { fontFamily: fonts.displaySemiBold, fontSize: 18 },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'MoodLens' }} />
        <Stack.Screen name="History" component={HistoryScreen} options={{ title: 'Your Readings' }} />
        <Stack.Screen name="Result" component={ResultScreen} options={{ title: 'The Reading' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
