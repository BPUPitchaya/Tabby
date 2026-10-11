import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useFlatPreference } from '@/lib/flat-preference-context';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

// Shown once, right after signup, only while wants_flat is still null and
// the user has no flat (see FlatPreferenceProvider). Answering either way
// is permanent until changed from Settings -- there's no "ask me later."
export function FlatOnboardingQuestion() {
  const { setWantsFlat } = useFlatPreference();
  const isDark = useColorScheme() === 'dark';
  const [submitting, setSubmitting] = useState<'yes' | 'no' | null>(null);

  const handleYes = async () => {
    setSubmitting('yes');
    await setWantsFlat(true);
    // Straight into create/join -- answering "yes" should finish the
    // task, not just unlock a tab the user still has to go find.
    router.push('/flat');
  };

  const handleNo = async () => {
    setSubmitting('no');
    await setWantsFlat(false);
  };

  return (
    <SafeAreaView className="flex-1 bg-tabby-50 dark:bg-tabby-900 px-6 justify-center gap-8">
      <View className="gap-2">
        <Text className="font-fredoka-semibold text-2xl dark:text-white">Living with flatmates?</Text>
        <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-base">
          Tabby can split shared bills and track who owes who. You can turn this on later from Settings
          if you&apos;re not sure yet.
        </Text>
      </View>

      <View className="gap-3">
        <Pressable
          onPress={handleYes}
          disabled={submitting !== null}
          style={pressFeedback}
          className="bg-tabby-600 dark:bg-white rounded-lg py-3.5 items-center"
          accessibilityRole="button">
          {submitting === 'yes' ? (
            <ActivityIndicator color={isDark ? '#2B1810' : 'white'} />
          ) : (
            <Text className="font-nunito-semibold text-white dark:text-tabby-900 text-base">
              Yes, set up a flat
            </Text>
          )}
        </Pressable>
        <Pressable
          onPress={handleNo}
          disabled={submitting !== null}
          style={pressFeedback}
          className="border border-tabby-200 dark:border-tabby-700 rounded-lg py-3.5 items-center">
          {submitting === 'no' ? (
            <ActivityIndicator color={isDark ? '#E8C39E' : '#8B5A2B'} />
          ) : (
            <Text className="font-nunito-semibold text-tabby-700 dark:text-white text-base">
              No, just my own budget
            </Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
