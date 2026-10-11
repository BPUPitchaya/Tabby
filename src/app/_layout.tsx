// NativeWind's Tailwind directives -- this MUST be imported somewhere in
// every platform's root module graph, or every `className` in the app
// silently resolves to nothing (no error, just zero styles). It used to
// come in transitively through constants/theme.ts via app-tabs.tsx, but
// that import was removed when the tab icons were redone -- so it's
// imported directly here, at the actual root, where it can't get dropped
// again as a side effect of an unrelated change.
import '@/global.css';

import {
  Fredoka_400Regular,
  Fredoka_500Medium,
  Fredoka_600SemiBold,
  Fredoka_700Bold,
} from '@expo-google-fonts/fredoka';
import {
  Nunito_400Regular,
  Nunito_500Medium,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
} from '@expo-google-fonts/nunito';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider } from '@/lib/auth-context';
import { restoreThemePreference } from '@/lib/theme-preference';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded] = useFonts({
    Fredoka_400Regular,
    Fredoka_500Medium,
    Fredoka_600SemiBold,
    Fredoka_700Bold,
    Nunito_400Regular,
    Nunito_500Medium,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });
  const [themeRestored, setThemeRestored] = useState(false);

  useEffect(() => {
    restoreThemePreference().finally(() => setThemeRestored(true));
  }, []);

  // Nothing mounts (including AnimatedSplashOverlay) until the custom
  // typeface is ready AND any saved manual theme override has been
  // re-applied -- otherwise the app would briefly flash the OS's actual
  // appearance before snapping to the user's chosen one.
  if (!fontsLoaded || !themeRestored) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <AuthProvider>
        {/* join/[code] is a public, always-reachable screen (see
            app/join/[code].tsx) -- it's a sibling of (app) rather than
            living inside it, so an invite link works before the recipient
            has signed in, instead of depending on the tab bar already
            being on screen. (app) still does its own full auth/onboarding
            gate internally, unchanged from before this split. */}
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="join/[code]" />
          <Stack.Screen name="(app)" />
        </Stack>
      </AuthProvider>
    </ThemeProvider>
  );
}
