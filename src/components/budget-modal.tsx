import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, TextInput, useColorScheme, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth-context';
import { clearBudgetAmount, fetchIncomeSettings, updateBudgetAmount } from '@/lib/profile';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

// Gated on income already being set: a budget rides the same pay cycle
// income defines (frequency + payday), so there's nothing to attach it to
// otherwise. Rather than let the user set a budget with no cycle (which
// would mean introducing a second, independent time window alongside the
// pay cycle already used everywhere else), this just redirects to Pay Schedule.
export function BudgetModal({
  visible,
  onClose,
  onSaved,
  onNeedsPaySchedule,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved?: () => void;
  onNeedsPaySchedule: () => void;
}) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const isDark = useColorScheme() === 'dark';

  const [loading, setLoading] = useState(true);
  const [hasIncome, setHasIncome] = useState(false);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !userId) return;
    setLoading(true);
    setMessage(null);
    fetchIncomeSettings(userId)
      .then((income) => {
        setHasIncome(income !== null);
        setAmount(income?.budgetAmount ? String(income.budgetAmount) : '');
      })
      .finally(() => setLoading(false));
  }, [visible, userId]);

  const handleSave = async () => {
    if (!userId) return;
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setMessage('Enter a valid amount.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await updateBudgetAmount(userId, parsedAmount);
      onSaved?.();
      onClose();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save budget.');
    } finally {
      setBusy(false);
    }
  };

  const handleClear = async () => {
    if (!userId) return;
    setBusy(true);
    try {
      await clearBudgetAmount(userId);
      setAmount('');
      onSaved?.();
      onClose();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to remove budget.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-white dark:bg-tabby-900">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-tabby-700">
            <Text className="font-fredoka-semibold text-xl dark:text-white">Edit Budget</Text>
            <Pressable onPress={onClose} style={pressFeedback} accessibilityRole="button" accessibilityLabel="Close">
              <Text className="font-nunito-semibold text-tabby-600 dark:text-white">Done</Text>
            </Pressable>
          </View>

          {loading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator />
            </View>
          ) : !hasIncome ? (
            <View className="flex-1 items-center justify-center px-8 gap-4">
              <Text className="font-fredoka-semibold text-lg text-center dark:text-white">
                Set your pay schedule first
              </Text>
              <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm text-center">
                A budget needs a pay cycle to attach to -- set how much you earn and how often before
                budgeting part of it.
              </Text>
              <Pressable
                onPress={onNeedsPaySchedule}
                style={pressFeedback}
                className="bg-tabby-600 dark:bg-white rounded-lg py-3 px-6 items-center"
                accessibilityRole="button">
                <Text className="font-nunito-semibold text-white dark:text-tabby-900 text-sm">Set pay schedule</Text>
              </Pressable>
            </View>
          ) : (
            <View className="p-4 gap-3">
              <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
                How much of your income you intend to spend each pay cycle. Can be less than what you
                earn &mdash; the rest is just never counted as &ldquo;spent so far.&rdquo;
              </Text>

              <TextInput
                value={amount}
                onChangeText={setAmount}
                placeholder="Budget per pay"
                keyboardType="decimal-pad"
                className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2.5 bg-white dark:bg-tabby-900 dark:text-white"
              />

              {message && <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-xs">{message}</Text>}

              <View className="flex-row gap-2 mt-1">
                <View className="flex-1">
                  <Pressable
                    onPress={handleSave}
                    disabled={busy}
                    style={pressFeedback}
                    className="bg-tabby-600 dark:bg-white rounded-lg py-2.5 items-center"
                    accessibilityRole="button">
                    {busy ? (
                      <ActivityIndicator color={isDark ? '#2B1810' : 'white'} />
                    ) : (
                      <Text className="font-nunito-semibold text-white dark:text-tabby-900 text-sm">Save budget</Text>
                    )}
                  </Pressable>
                </View>
                {amount !== '' && (
                  <Pressable
                    onPress={handleClear}
                    disabled={busy}
                    style={pressFeedback}
                    className="px-4 py-2.5 items-center justify-center rounded-lg bg-red-50 dark:bg-red-950"
                    accessibilityRole="button"
                    accessibilityLabel="Remove budget">
                    <Text className="font-nunito-semibold text-red-500 text-sm">Clear</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
