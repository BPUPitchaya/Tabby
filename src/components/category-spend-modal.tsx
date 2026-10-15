// "What did I actually spend this on" -- opened by tapping a category row
// in Budget's breakdown (budget-modal.tsx). Scoped to the exact pay-cycle
// window, not an approximation like a calendar month -- a dedicated small
// screen instead of routing into Transactions' own search, since that
// screen's "month"/"week" ranges don't necessarily line up with a pay
// cycle (weekly/biweekly cycles almost never match a calendar month).
import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, useColorScheme, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { CategoryIcon } from '@/components/category-icon';
import { useAuth } from '@/lib/auth-context';
import { fetchTransactionsForCategoryInRange, type Transaction } from '@/lib/transactions';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

export function CategorySpendModal({
  visible,
  onClose,
  categoryId,
  categoryName,
  categoryIcon,
  cycle,
}: {
  visible: boolean;
  onClose: () => void;
  categoryId: string | null;
  categoryName: string;
  categoryIcon: string | null;
  cycle: { startDate: string; endDate: string } | null;
}) {
  const isDark = useColorScheme() === 'dark';
  const { session } = useAuth();
  const userId = session?.user.id;

  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !userId || !categoryId || !cycle) return;
    setLoading(true);
    setError(null);
    fetchTransactionsForCategoryInRange(userId, categoryId, cycle.startDate, cycle.endDate)
      .then(setTransactions)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load transactions.'))
      .finally(() => setLoading(false));
  }, [visible, userId, categoryId, cycle?.startDate, cycle?.endDate]);

  const total = transactions.reduce((sum, t) => sum + t.amount, 0);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-white dark:bg-tabby-900">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-tabby-700">
            <Text className="font-fredoka-semibold text-xl dark:text-white">{categoryName}</Text>
            <Pressable
              onPress={onClose}
              style={pressFeedback}
              accessibilityRole="button"
              accessibilityLabel="Close"
              className="w-8 h-8 rounded-full bg-gray-100 dark:bg-tabby-700 items-center justify-center"
            >
              <Feather name="x" size={16} color={isDark ? '#E8C39E' : '#374151'} />
            </Pressable>
          </View>

          {loading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator />
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
              <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
                ${total.toFixed(2)} across {transactions.length} transaction
                {transactions.length === 1 ? '' : 's'} this cycle.
              </Text>

              {error && (
                <View className="px-3 py-2 bg-red-50 dark:bg-red-950 rounded-lg">
                  <Text className="font-nunito text-red-600 dark:text-red-400 text-sm">{error}</Text>
                </View>
              )}

              {transactions.length === 0 ? (
                <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
                  Nothing logged in this category yet this cycle.
                </Text>
              ) : (
                <View className="gap-1.5">
                  {transactions.map((t) => (
                    <View
                      key={t.id}
                      className="flex-row items-center gap-3 rounded-xl px-3 py-2.5 bg-gray-50 dark:bg-tabby-800 border border-gray-100 dark:border-tabby-700"
                    >
                      <View className="w-9 h-9 rounded-full bg-white dark:bg-tabby-700 items-center justify-center">
                        <CategoryIcon name={categoryIcon} size={15} color={isDark ? '#E8C39E' : '#4b5563'} />
                      </View>
                      <View className="flex-1">
                        <Text className="font-nunito-medium dark:text-white">
                          {t.description || '(no description)'}
                        </Text>
                        <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">
                          {t.occurred_at}
                          {t.merchant ? ` · ${t.merchant}` : ''}
                        </Text>
                      </View>
                      <Text className="font-nunito-bold dark:text-white">${t.amount.toFixed(2)}</Text>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
