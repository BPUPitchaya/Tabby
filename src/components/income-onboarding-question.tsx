import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IncomeSourceForm } from '@/components/income-source-form';
import {
  buildIncomeSourceParams,
  createIncomeSource,
  setPrimaryIncomeSource,
  EMPTY_INCOME_FORM,
  type IncomeFormState,
} from '@/lib/income-sources';
import { markIncomePrompted } from '@/lib/profile';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

// Shown once, right after the flat question (or on next open for an
// existing account that's never seen it (see FlatGate), only while
// income_prompted is still false. Skipping is a real, permanent answer
// here, not "ask me later", same one-shot posture as
// FlatOnboardingQuestion and PaymentDetailsOnboardingQuestion. The form
// itself is income-source-form.tsx, the same fields as the real Add
// Income screen, since this creates a real first income_sources row
// (not a lighter-weight duplicate concept); see 0057_add_income_prompted.sql.
export function IncomeOnboardingQuestion({ userId, onDone }: { userId: string; onDone: () => void }) {
  const isDark = useColorScheme() === 'dark';
  const [form, setForm] = useState<IncomeFormState>({ ...EMPTY_INCOME_FORM, isPrimary: true });
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<'save' | 'skip' | null>(null);
  // Remembers the source created by a prior attempt that failed partway
  // through (e.g. setPrimaryIncomeSource or markIncomePrompted dropped),
  // so retrying Save resumes from there instead of creating a second
  // income_sources row.
  const [createdId, setCreatedId] = useState<string | null>(null);

  const skip = async () => {
    setSubmitting('skip');
    try {
      await markIncomePrompted(userId);
      onDone();
    } finally {
      setSubmitting(null);
    }
  };

  const save = async () => {
    // Nothing at all chosen yet (not even a pay frequency) is the same as
    // skipping -- don't make "Save" with a completely blank form throw a
    // validation error at someone who just wants to move on. Once they've
    // picked anything, fall through to real validation instead of
    // silently discarding a partial selection.
    if (!form.label.trim() && !form.amount.trim() && !form.hourlyRate.trim() && !form.frequency) {
      await skip();
      return;
    }

    const result = buildIncomeSourceParams(form, []);
    if ('error' in result) {
      setMessage(result.error);
      return;
    }

    setSubmitting('save');
    setMessage(null);
    try {
      const id = createdId ?? (await createIncomeSource(userId, result.params));
      if (!createdId) setCreatedId(id);
      await setPrimaryIncomeSource(userId, id);
      await markIncomePrompted(userId);
      onDone();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save your income.');
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-tabby-50 dark:bg-tabby-900">
      <ScrollView contentContainerStyle={{ padding: 24, gap: 14, flexGrow: 1, justifyContent: 'center' }}>
        <Text className="font-fredoka-semibold text-2xl dark:text-white">What&apos;s your income?</Text>
        <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-base mb-4">
          Tabby can track how much you earn and when, so Budget and your spending summaries make sense
          against your actual pay cycle. You can add or change this later from Income Sources.
        </Text>

        <IncomeSourceForm form={form} setForm={setForm} sources={[]} showPrimaryToggle={false} />

        {message && <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">{message}</Text>}

        <Pressable
          onPress={save}
          disabled={submitting !== null}
          style={pressFeedback}
          className="bg-tabby-600 dark:bg-white rounded-lg py-3.5 items-center mt-2"
          accessibilityRole="button"
        >
          {submitting === 'save' ? (
            <ActivityIndicator color={isDark ? '#2B1810' : 'white'} />
          ) : (
            <Text className="font-nunito-semibold text-white dark:text-tabby-900 text-base">Save</Text>
          )}
        </Pressable>
        <Pressable
          onPress={skip}
          disabled={submitting !== null}
          style={pressFeedback}
          className="border border-tabby-200 dark:border-tabby-700 rounded-lg py-3.5 items-center"
          accessibilityRole="button"
        >
          {submitting === 'skip' ? (
            <ActivityIndicator color={isDark ? '#E8C39E' : '#8B5A2B'} />
          ) : (
            <Text className="font-nunito-semibold text-tabby-700 dark:text-white text-base">Skip for now</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
