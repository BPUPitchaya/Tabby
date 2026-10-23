import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

// Supabase's recovery email links append access_token/refresh_token as a
// URL fragment (#...), which detectSessionInUrl would normally pick up
// automatically -- but that's off in supabase.ts (there's no browser
// address bar on a device to detect it from), so this parses the
// fragment by hand, same spirit as join/[code]'s own manual deep-link
// handling.
function parseRecoveryTokens(url: string): { accessToken: string; refreshToken: string } | null {
  const fragment = url.split('#')[1];
  if (!fragment) return null;
  const params = new URLSearchParams(fragment);
  if (params.get('type') !== 'recovery') return null;
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

// Public screen, outside the (app) auth/onboarding gate -- reachable via
// tabby://reset-password#access_token=...&refresh_token=...&type=recovery,
// the link sendPasswordReset emails out. See _layout.tsx for why this
// sits as a sibling of (app) rather than inside it.
export default function ResetPasswordScreen() {
  const { updatePassword } = useAuth();
  const isDark = useColorScheme() === 'dark';

  const [status, setStatus] = useState<'loading' | 'ready' | 'invalid' | 'done'>('loading');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const establishSession = async (url: string | null) => {
      const tokens = url ? parseRecoveryTokens(url) : null;
      if (!tokens) {
        setStatus('invalid');
        return;
      }
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
      });
      setStatus(sessionError ? 'invalid' : 'ready');
    };

    Linking.getInitialURL().then(establishSession);
    // Covers the app already being open (warm start) when the link is
    // tapped -- getInitialURL above only fires for a cold start.
    const subscription = Linking.addEventListener('url', ({ url }) => establishSession(url));
    return () => subscription.remove();
  }, []);

  const handleSubmit = async () => {
    setError(null);
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    const result = await updatePassword(password);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setStatus('done');
  };

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
          Password reset links only work once and expire after a while. Request a new one from the sign-in screen.
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

  if (status === 'done') {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-tabby-900 px-6 justify-center gap-4">
        <Text className="font-fredoka-semibold text-xl text-center dark:text-white">Password updated</Text>
        <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-center text-sm">
          You&apos;re signed in with your new password.
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

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-tabby-900 px-6 justify-center gap-4">
      <Text className="font-fredoka-semibold text-2xl text-center dark:text-white">Set a new password</Text>

      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="New password"
        secureTextEntry
        className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-4 py-3 text-base dark:text-white"
      />
      <TextInput
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        placeholder="Confirm new password"
        secureTextEntry
        className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-4 py-3 text-base dark:text-white"
      />

      {error && <Text className="font-nunito text-red-500 dark:text-red-400 text-sm text-center">{error}</Text>}

      <Pressable
        onPress={handleSubmit}
        disabled={submitting}
        style={pressFeedback}
        className="bg-tabby-600 dark:bg-white rounded-lg py-3.5 items-center mt-2"
        accessibilityRole="button">
        {submitting ? (
          <ActivityIndicator color={isDark ? '#2B1810' : 'white'} />
        ) : (
          <Text className="font-nunito-semibold text-white dark:text-tabby-900 text-base">Update password</Text>
        )}
      </Pressable>
    </SafeAreaView>
  );
}
