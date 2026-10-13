import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthScreen } from '@/components/auth-screen';
import { useAuth } from '@/lib/auth-context';
import { sendFriendRequestByCode } from '@/lib/friendships';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

// Public screen, outside the (app) auth/onboarding gate on purpose --
// reachable via tabby://add-friend/<code> whether or not the recipient
// has an account yet. Same shape as join/[code].tsx (flats), but this
// never joins anything instantly: it only sends a request the other
// person still has to accept (see friendships.ts).
export default function AddFriendScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { session, loading: authLoading } = useAuth();
  const isDark = useColorScheme() === 'dark';

  const [status, setStatus] = useState<'ready' | 'sending' | 'sent' | 'error'>('ready');
  const [error, setError] = useState<string | null>(null);

  const userId = session?.user.id;

  const handleSend = async () => {
    if (!userId || !code) return;
    setStatus('sending');
    setError(null);
    try {
      await sendFriendRequestByCode(userId, code);
      setStatus('sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send that request.');
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

  if (status === 'sent') {
    return (
      <SafeAreaView className="flex-1 bg-tabby-50 dark:bg-tabby-900 px-6 justify-center gap-6">
        <Text className="font-fredoka-semibold text-2xl text-center dark:text-white">Request sent!</Text>
        <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-center text-sm">
          They&apos;ll show up as a friend once they accept.
        </Text>
        <Pressable
          onPress={() => router.replace('/')}
          style={pressFeedback}
          className="bg-tabby-600 dark:bg-white rounded-lg py-3.5 items-center"
          accessibilityRole="button">
          <Text className="font-nunito-semibold text-white dark:text-tabby-900 text-base">Done</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-tabby-50 dark:bg-tabby-900 px-6 justify-center gap-6">
      <View className="gap-2">
        <Text className="font-fredoka-semibold text-2xl text-center dark:text-white">Send a friend request?</Text>
        <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-center text-sm">
          Invite code: <Text className="font-mono font-semibold dark:text-white">{code}</Text>
        </Text>
      </View>

      {error && <Text className="font-nunito text-red-500 dark:text-red-400 text-sm text-center">{error}</Text>}

      <View className="gap-3">
        <Pressable
          onPress={handleSend}
          disabled={status === 'sending'}
          style={pressFeedback}
          className="bg-tabby-600 dark:bg-white rounded-lg py-3.5 items-center"
          accessibilityRole="button">
          {status === 'sending' ? (
            <ActivityIndicator color={isDark ? '#2B1810' : 'white'} />
          ) : (
            <Text className="font-nunito-semibold text-white dark:text-tabby-900 text-base">
              {error ? 'Try again' : 'Send request'}
            </Text>
          )}
        </Pressable>

        {/* This screen has no header/back button (see _layout.tsx), so
            without this, a wrong or expired code leaves no way out. */}
        <Pressable
          onPress={() => router.replace('/')}
          disabled={status === 'sending'}
          style={pressFeedback}
          className="py-2 items-center">
          <Text className="font-nunito-medium text-gray-500 dark:text-tabby-300 text-sm">Not now</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
