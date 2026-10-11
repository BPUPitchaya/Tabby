import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthScreen } from '@/components/auth-screen';
import { useAuth } from '@/lib/auth-context';
import { fetchMyFlat, joinFlat, type Flat } from '@/lib/flats';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

// Public screen, outside the (app) auth/onboarding gate on purpose --
// reachable via tabby://join/<code> whether or not the recipient is
// signed in yet or has ever answered the "living with flatmates?"
// question. See _layout.tsx for how this sits alongside (app) in the
// root Stack.
export default function JoinScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { session, loading: authLoading } = useAuth();
  const isDark = useColorScheme() === 'dark';

  const [status, setStatus] = useState<'checking' | 'ready' | 'joining' | 'joined' | 'error'>('checking');
  const [existingFlat, setExistingFlat] = useState<Flat | null>(null);
  const [error, setError] = useState<string | null>(null);

  const userId = session?.user.id;

  // If they're already in a flat, joining a second one isn't supported
  // (the schema is one flat per user) -- surface that plainly instead of
  // letting the insert fail with a raw constraint error.
  const checkExisting = useCallback(async () => {
    if (!userId) return;
    const flat = await fetchMyFlat(userId);
    setExistingFlat(flat);
    setStatus('ready');
  }, [userId]);

  useEffect(() => {
    if (userId) checkExisting();
  }, [userId, checkExisting]);

  const handleJoin = async () => {
    if (!userId || !code) return;
    setStatus('joining');
    setError(null);
    try {
      await joinFlat(userId, code);
      setStatus('joined');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join this flat.');
      setStatus('error');
    }
  };

  if (authLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-tabby-50 dark:bg-tabby-900">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  // No account yet, or signed out -- sign in/up first, then this screen
  // re-renders with a session and picks up where it left off.
  if (!session) return <AuthScreen />;

  if (status === 'checking') {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-tabby-50 dark:bg-tabby-900">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  if (status === 'joined') {
    return (
      <SafeAreaView className="flex-1 bg-tabby-50 dark:bg-tabby-900 px-6 justify-center gap-6">
        <Text className="font-fredoka-semibold text-2xl text-center dark:text-white">You&apos;re in!</Text>
        <Pressable
          onPress={() => router.replace('/flat')}
          style={pressFeedback}
          className="bg-tabby-600 dark:bg-white rounded-lg py-3.5 items-center"
          accessibilityRole="button">
          <Text className="font-nunito-semibold text-white dark:text-tabby-900 text-base">Go to your flat</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (existingFlat) {
    return (
      <SafeAreaView className="flex-1 bg-tabby-50 dark:bg-tabby-900 px-6 justify-center gap-6">
        <Text className="font-fredoka-semibold text-xl text-center dark:text-white">
          You&apos;re already in a flat
        </Text>
        <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-center text-sm">
          Leave &ldquo;{existingFlat.name}&rdquo; from the Flat tab first if you want to join a different one.
        </Text>
        <Pressable
          onPress={() => router.replace('/flat')}
          style={pressFeedback}
          className="border border-tabby-200 dark:border-tabby-700 rounded-lg py-3.5 items-center">
          <Text className="font-nunito-semibold text-tabby-700 dark:text-white text-base">Go to your flat</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-tabby-50 dark:bg-tabby-900 px-6 justify-center gap-6">
      <View className="gap-2">
        <Text className="font-fredoka-semibold text-2xl text-center dark:text-white">Join this flat?</Text>
        <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-center text-sm">
          Invite code: <Text className="font-mono font-semibold dark:text-white">{code}</Text>
        </Text>
      </View>

      {error && <Text className="font-nunito text-red-500 dark:text-red-400 text-sm text-center">{error}</Text>}

      <View className="gap-3">
        <Pressable
          onPress={handleJoin}
          disabled={status === 'joining'}
          style={pressFeedback}
          className="bg-tabby-600 dark:bg-white rounded-lg py-3.5 items-center"
          accessibilityRole="button">
          {status === 'joining' ? (
            <ActivityIndicator color={isDark ? '#2B1810' : 'white'} />
          ) : (
            <Text className="font-nunito-semibold text-white dark:text-tabby-900 text-base">
              {error ? 'Try again' : 'Join flat'}
            </Text>
          )}
        </Pressable>

        {/* This screen has no header/back button (see _layout.tsx), so
            without this, a wrong or expired code leaves no way out at
            all -- not even if the join itself succeeds, since there'd
            still be no way to just change your mind and look around the
            app first. */}
        <Pressable
          onPress={() => router.replace('/')}
          disabled={status === 'joining'}
          style={pressFeedback}
          className="py-2 items-center">
          <Text className="font-nunito-medium text-gray-500 dark:text-tabby-300 text-sm">Not now</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
