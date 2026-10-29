import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth-context';
import { createFlat, joinFlat } from '@/lib/flats';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

// The Flat tab's empty state -- create a new flat or join one by invite
// code. `onFlatReady` re-fetches the flats list once either succeeds.
export function NoFlatView({ onFlatReady }: { onFlatReady: () => void }) {
  const { session } = useAuth();
  const userId = session?.user.id;

  const [flatName, setFlatName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!userId || !flatName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await createFlat(userId, flatName.trim());
      onFlatReady();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create flat.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoin = async () => {
    if (!userId || !inviteCode.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await joinFlat(inviteCode.trim());
      onFlatReady();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join flat.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-tabby-900 px-6 pt-10 gap-8">
      <View className="gap-3">
        <Text className="font-fredoka-semibold text-xl dark:text-white">Create a flat</Text>
        <TextInput
          value={flatName}
          onChangeText={setFlatName}
          placeholder="Flat name"
          className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-4 py-3 dark:text-white"
        />
        <Pressable
          onPress={handleCreate}
          disabled={submitting}
          style={pressFeedback}
          className="bg-tabby-600 dark:bg-white rounded-lg py-3 items-center"
          accessibilityRole="button"
        >
          <Text className="font-nunito-semibold text-white dark:text-tabby-900">Create Flat</Text>
        </Pressable>
      </View>

      <View className="gap-3">
        <Text className="font-fredoka-semibold text-xl dark:text-white">Join a flat</Text>
        <TextInput
          value={inviteCode}
          onChangeText={setInviteCode}
          placeholder="Invite code"
          autoCapitalize="none"
          className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-4 py-3 dark:text-white"
        />
        <Pressable
          onPress={handleJoin}
          disabled={submitting}
          style={pressFeedback}
          className="bg-gray-800 dark:bg-tabby-700 rounded-lg py-3 items-center"
          accessibilityRole="button"
        >
          <Text className="font-nunito-semibold text-white">Join Flat</Text>
        </Pressable>
      </View>

      {submitting && <ActivityIndicator />}
      {error && (
        <Text className="font-nunito text-red-500 dark:text-red-400 text-sm text-center">{error}</Text>
      )}
    </SafeAreaView>
  );
}
