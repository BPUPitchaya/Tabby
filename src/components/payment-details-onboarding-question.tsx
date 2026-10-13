import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { markPaymentDetailsPrompted, updatePaymentDetails } from '@/lib/profile';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

// Shown once, right after signup (or on next open for an existing account
// that's never seen it -- see FlatGate), only while payment_details_prompted
// is still false. Skipping is a real, permanent answer here, not "ask me
// later" -- same one-shot posture as FlatOnboardingQuestion, just with no
// null/undecided state to represent (see 0020_add_payment_details_prompted.sql).
export function PaymentDetailsOnboardingQuestion({ userId, onDone }: { userId: string; onDone: () => void }) {
  const isDark = useColorScheme() === 'dark';
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState<'save' | 'skip' | null>(null);

  const finish = async (save: boolean) => {
    setSubmitting(save ? 'save' : 'skip');
    try {
      if (save && details.trim()) {
        await updatePaymentDetails(userId, details);
      }
      await markPaymentDetailsPrompted(userId);
      onDone();
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-tabby-50 dark:bg-tabby-900 px-6 justify-center gap-8">
      <View className="gap-2">
        <Text className="font-fredoka-semibold text-2xl dark:text-white">Add your payment details?</Text>
        <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-base">
          When you split a bill and remind someone, Tabby can include how to pay you back: your bank account
          number and a reference, however you&apos;d normally give it out. You can add or change this later
          from Edit Profile.
        </Text>
      </View>

      <TextInput
        value={details}
        onChangeText={setDetails}
        placeholder="e.g. 12-3456-7890123-00, ref: your name"
        multiline
        className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2.5 bg-white dark:bg-tabby-800 dark:text-white min-h-[70px]"
      />

      <View className="gap-3">
        <Pressable
          onPress={() => finish(true)}
          disabled={submitting !== null || !details.trim()}
          style={pressFeedback}
          className={`rounded-lg py-3.5 items-center ${
            details.trim() ? 'bg-tabby-600 dark:bg-white' : 'bg-gray-300 dark:bg-tabby-700'
          }`}
          accessibilityRole="button"
        >
          {submitting === 'save' ? (
            <ActivityIndicator color={isDark ? '#2B1810' : 'white'} />
          ) : (
            <Text className="font-nunito-semibold text-white dark:text-tabby-900 text-base">Save</Text>
          )}
        </Pressable>
        <Pressable
          onPress={() => finish(false)}
          disabled={submitting !== null}
          style={pressFeedback}
          className="border border-tabby-200 dark:border-tabby-700 rounded-lg py-3.5 items-center"
        >
          {submitting === 'skip' ? (
            <ActivityIndicator color={isDark ? '#E8C39E' : '#8B5A2B'} />
          ) : (
            <Text className="font-nunito-semibold text-tabby-700 dark:text-white text-base">
              Skip for now
            </Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
