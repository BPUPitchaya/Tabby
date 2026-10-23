// NativeWind's Tailwind directives -- this MUST be imported somewhere in
// every platform's root module graph, or every `className` in the app
// silently resolves to nothing (no error, just zero styles). It used to
// come in transitively through constants/theme.ts via app-tabs.tsx, but
// that import was removed when the tab icons were redone -- so it's
// imported directly here, at the actual root, where it can't get dropped
// again as a side effect of an unrelated change.
import '@/global.css';

import { isRunningInExpoGo } from 'expo';
import { Fraunces_600SemiBold, Fraunces_700Bold } from '@expo-google-fonts/fraunces';
import {
  Fredoka_400Regular,
  Fredoka_500Medium,
  Fredoka_600SemiBold,
  Fredoka_700Bold,
} from '@expo-google-fonts/fredoka';
import {
  Karla_400Regular,
  Karla_500Medium,
  Karla_600SemiBold,
  Karla_700Bold,
  Karla_800ExtraBold,
} from '@expo-google-fonts/karla';
import {
  Mada_400Regular,
  Mada_500Medium,
  Mada_600SemiBold,
  Mada_700Bold,
  Mada_800ExtraBold,
} from '@expo-google-fonts/mada';
import {
  Nunito_400Regular,
  Nunito_500Medium,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
} from '@expo-google-fonts/nunito';
import { Quicksand_600SemiBold, Quicksand_700Bold } from '@expo-google-fonts/quicksand';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { vars } from 'nativewind';
import { useEffect, useState, type ReactNode } from 'react';
import { useColorScheme, View } from 'react-native';
import * as Sentry from '@sentry/react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { ErrorBoundary } from '@/components/error-boundary';
import { AuthProvider } from '@/lib/auth-context';
import {
  FONT_VARS,
  FontPreferenceProvider,
  loadFontPreference,
  useFontPreference,
  type FontPack,
} from '@/lib/font-preference';
import { restoreThemePreference } from '@/lib/theme-preference';

SplashScreen.preventAutoHideAsync();

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  sendDefaultPii: true,
  tracesSampleRate: __DEV__ ? 1.0 : 0.2,
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: __DEV__ ? 1.0 : 0.05,
  integrations: [Sentry.mobileReplayIntegration()],
  enableNativeFramesTracking: !isRunningInExpoGo(),
  environment: __DEV__ ? 'development' : 'production',
});

// Governs how a payday reminder (or any future local notification)
// presents while the app is already open in the foreground -- without
// this, a foreground-delivered notification shows nothing at all on iOS.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function TabLayout() {
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
    // Alternate font packs (see src/lib/font-preference.ts) -- all three
    // weight sets are bundled upfront so switching in Settings is instant,
    // not a re-download.
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    Karla_400Regular,
    Karla_500Medium,
    Karla_600SemiBold,
    Karla_700Bold,
    Karla_800ExtraBold,
    Quicksand_600SemiBold,
    Quicksand_700Bold,
    Mada_400Regular,
    Mada_500Medium,
    Mada_600SemiBold,
    Mada_700Bold,
    Mada_800ExtraBold,
  });
  const [themeRestored, setThemeRestored] = useState(false);
  const [fontPack, setFontPack] = useState<FontPack | null>(null);

  useEffect(() => {
    restoreThemePreference().finally(() => setThemeRestored(true));
    loadFontPreference().then(setFontPack);
  }, []);

  // Nothing mounts (including AnimatedSplashOverlay) until the custom
  // typeface is ready AND any saved manual theme/font override has been
  // re-applied -- otherwise the app would briefly flash the default look
  // before snapping to the user's chosen one.
  if (!fontsLoaded || !themeRestored || fontPack === null) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <FontPreferenceProvider initialPack={fontPack}>
        <FontVarsView>
          {/* Wraps every screen/provider below it -- a render crash
              anywhere in the app shows the recovery screen instead of a
              white screen with no way back. See error-boundary.tsx. */}
          <ErrorBoundary>
            <AuthProvider>
              {/* join/[code] is a public, always-reachable screen (see
                  app/join/[code].tsx) -- it's a sibling of (app) rather than
                  living inside it, so an invite link works before the
                  recipient has signed in, instead of depending on the tab bar
                  already being on screen. (app) still does its own full
                  auth/onboarding gate internally, unchanged from before this
                  split. */}
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="join/[code]" />
                <Stack.Screen name="add-friend/[code]" />
                <Stack.Screen name="reset-password" />
                <Stack.Screen name="(app)" />
              </Stack>
            </AuthProvider>
          </ErrorBoundary>
        </FontVarsView>
      </FontPreferenceProvider>
    </ThemeProvider>
  );
}

export default Sentry.wrap(TabLayout);

// The actual font-switching mechanism: NativeWind's CSS vars resolved at
// runtime, same way `dark:` variants resolve colorScheme -- not touching
// every font-* classname site. Must wrap everything that renders text, so
// it sits here rather than deeper in the tree.
function FontVarsView({ children }: { children: ReactNode }) {
  const { pack } = useFontPreference();
  return (
    <View style={vars(FONT_VARS[pack])} className="flex-1">
      {children}
    </View>
  );
}
