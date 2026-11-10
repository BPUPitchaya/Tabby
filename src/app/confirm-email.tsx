import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getLatestDeepLink } from '@/lib/deep-link-cache';
import { supabase } from '@/lib/supabase';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

// Supabase's signup confirmation email links append access_token/refresh_token
// as a URL fragment (#...), same shape as the recovery link reset-password.tsx
// parses, just with type=signup instead of type=recovery.
function parseConfirmationTokens(url: string): { accessToken: string; refreshToken: string } | null {
  const fragment = url.split('#')[1];
  if (!fragment) return null;
  const params = new URLSearchParams(fragment);
  if (params.get('type') !== 'signup') return null;
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

// Public screen, outside the (app) auth/onboarding gate, reachable via
// tabby://confirm-email#access_token=...&refresh_token=...&type=signup,
// the link signUp's emailRedirectTo sends out. See _layout.tsx for why
// this sits as a sibling of (app) rather than inside it.
export default function ConfirmEmailScreen() {
  const [status, setStatus] = useState<'loading' | 'done' | 'invalid'>('loading');

  useEffect(() => {
    const establishSession = async (url: string | null) => {
      const tokens = url ? parseConfirmationTokens(url) : null;
      if (!tokens) {
        setStatus('invalid');
        return;
      }
      const { error } = await supabase.auth.setSession({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
      });
      setStatus(error ? 'invalid' : 'done');
    };

    // getLatestDeepLink covers a warm start (app already running when the
    // link is tapped): the root layout's listener caught it before this
    // screen even mounted. getInitialURL covers a cold start instead.
    const warmStartUrl = getLatestDeepLink();
    if (warmStartUrl) {
      establishSession(warmStartUrl);
    } else {
      Linking.getInitialURL().then(establishSession);
    }
    // Still listen directly too, in case the link arrives while this
    // screen is already mounted (e.g. the app was already sitting on
    // this exact screen).
    const subscription = Linking.addEventListener('url', ({ url }) => establishSession(url));
    return () => subscription.remove();
  }, []);

  if (status === 'loading') {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white dark:bg-tabby-900">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  if (status === 'invalid') {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-tabby-900 px-6 justify-center gap-4">
        <Text className="font-fredoka-semibold text-xl text-center dark:text-white">This link has expired</Text>
        <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-center text-sm">
          Confirmation links only work once and expire after a while. Try signing up again from the sign-in screen.
        </Text>
        <Pressable
          onPress={() => router.replace('/')}
          style={pressFeedback}
          className="bg-tabby-600 dark:bg-white rounded-lg py-3.5 items-center mt-2"
          accessibilityRole="button">
          <Text className="font-nunito-semibold text-white dark:text-tabby-900 text-base">Back to sign in</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-tabby-900 px-6 justify-center gap-4">
      <Text className="font-fredoka-semibold text-xl text-center dark:text-white">Email confirmed</Text>
      <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-center text-sm">
        Your account is ready to go.
      </Text>
      <Pressable
        onPress={() => router.replace('/')}
        style={pressFeedback}
        className="bg-tabby-600 dark:bg-white rounded-lg py-3.5 items-center mt-2"
        accessibilityRole="button">
        <Text className="font-nunito-semibold text-white dark:text-tabby-900 text-base">Continue</Text>
      </Pressable>
    </SafeAreaView>
  );
}
