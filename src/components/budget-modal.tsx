import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { BudgetHelpModal } from '@/components/budget-help-modal';
import { CategoryBudgetsModal } from '@/components/category-budgets-modal';
import { CategorySpendModal } from '@/components/category-spend-modal';
import { useAuth } from '@/lib/auth-context';
import {
  clearAllCategoryBudgets,
  fetchCategoryBudgets,
  mergeCategoryBudgetProgress,
  type CategoryBudgetProgress,
} from '@/lib/category-budgets';
import { fetchDashboardData } from '@/lib/dashboard';
import {
  clearBudgetAmount,
  computeIncomeCycle,
  fetchIncomeProgress,
  fetchIncomeSettings,
  getOverspendPrediction,
  updateBudgetAmount,
  type IncomeProgress,
} from '@/lib/profile';
import { fetchCategories } from '@/lib/transactions';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

// Gated on income already being set: a budget rides the same pay cycle
// income defines (frequency + payday), so there's nothing to attach it to
// otherwise. Rather than let the user set a budget with no cycle (which
// would mean introducing a second, independent time window alongside the
// pay cycle already used everywhere else), this just redirects to Income
// Sources (formerly Pay Schedule -- see income-sources-modal.tsx).
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
  const [viewingCategory, setViewingCategory] = useState<CategoryBudgetProgress | null>(null);
  const [hasIncome, setHasIncome] = useState(false);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showCategoryBudgets, setShowCategoryBudgets] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [progress, setProgress] = useState<IncomeProgress | null>(null);
  const [categoryProgress, setCategoryProgress] = useState<CategoryBudgetProgress[]>([]);

  const load = async () => {
    if (!userId) return;
    const [income, incomeProgress, categoryBudgets] = await Promise.all([
      fetchIncomeSettings(userId),
      fetchIncomeProgress(userId),
      fetchCategoryBudgets(userId),
    ]);
    setHasIncome(income !== null);
    setAmount(income?.budgetAmount ? String(income.budgetAmount) : '');
    setProgress(incomeProgress);

    if (categoryBudgets.length > 0) {
      const cycle = income ? computeIncomeCycle(income) : null;
      const [cats, dashboard] = await Promise.all([
        fetchCategories('expense'),
        fetchDashboardData(userId, cycle),
      ]);
      setCategoryProgress(mergeCategoryBudgetProgress(categoryBudgets, cats, dashboard.categoryTotals));
    } else {
      setCategoryProgress([]);
    }
  };

  useEffect(() => {
    if (!visible || !userId) return;
    setLoading(true);
    setMessage(null);
    load().finally(() => setLoading(false));
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

  const handleUseOverallInstead = async () => {
    if (!userId) return;
    setBusy(true);
    setMessage(null);
    try {
      await clearAllCategoryBudgets(userId);
      await load();
      onSaved?.();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to switch back.');
    } finally {
      setBusy(false);
    }
  };

  const pct =
    progress && progress.budgetAmount > 0 ? Math.round((progress.spent / progress.budgetAmount) * 100) : null;
  const over = pct !== null && pct >= 100;
  const overspendPrediction = progress ? getOverspendPrediction(progress) : null;

  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-white dark:bg-tabby-900">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-tabby-700">
            <Text className="font-fredoka-semibold text-xl dark:text-white">Edit Budget</Text>
            <View className="flex-row items-center gap-4">
              <Pressable
                onPress={() => setShowHelp(true)}
                style={pressFeedback}
                accessibilityRole="button"
                accessibilityLabel="How budgeting works"
                className="w-7 h-7 rounded-full bg-gray-100 dark:bg-tabby-700 items-center justify-center"
              >
                <Text className="font-nunito-bold text-xs text-gray-600 dark:text-tabby-200">?</Text>
              </Pressable>
              <Pressable
                onPress={onClose}
                style={pressFeedback}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Text className="font-nunito-semibold text-tabby-600 dark:text-white">Done</Text>
              </Pressable>
            </View>
          </View>

          {loading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator />
            </View>
          ) : !hasIncome ? (
            <View className="flex-1 items-center justify-center px-8 gap-4">
              <Text className="font-fredoka-semibold text-lg text-center dark:text-white">
                Add an income source first
              </Text>
              <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm text-center">
                A budget needs a pay cycle to attach to. Add how much you earn and how often before budgeting
                part of it.
              </Text>
              <Pressable
                onPress={onNeedsPaySchedule}
                style={pressFeedback}
                className="bg-tabby-600 dark:bg-white rounded-lg py-3 px-6 items-center"
                accessibilityRole="button"
              >
                <Text className="font-nunito-semibold text-white dark:text-tabby-900 text-sm">
                  Add income source
                </Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
              {/* Same hero shape Home's own net-total card uses, so Budget
                  reads as a continuation of Home rather than a bare form --
                  only shown once there's something to show progress for. */}
              {pct !== null && progress && (
                <View className="bg-tabby-100 dark:bg-tabby-800 rounded-3xl p-5 items-center gap-1">
                  <Text className="font-nunito-medium text-tabby-700 dark:text-tabby-100 text-sm">
                    This cycle&apos;s budget
                  </Text>
                  <Text
                    className={`font-fredoka-semibold text-4xl ${
                      over ? 'text-rust-600 dark:text-rust-400' : 'text-sage-700 dark:text-sage-400'
                    }`}
                  >
                    {pct}%
                  </Text>
                  <View className="w-full h-1.5 bg-tabby-50 dark:bg-tabby-700 rounded-full overflow-hidden mt-2">
                    <View
                      className={`h-full rounded-full ${over ? 'bg-rust-500 dark:bg-rust-400' : 'bg-sage-500 dark:bg-sage-400'}`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </View>
                  <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-xs mt-2">
                    ${progress.spent.toFixed(2)} of ${progress.budgetAmount.toFixed(2)} spent
                  </Text>
                  {overspendPrediction && (
                    <Text className="font-nunito-semibold text-amber-600 dark:text-amber-400 text-xs mt-1">
                      On pace to go ${overspendPrediction.overBy.toFixed(2)} over by cycle end
                    </Text>
                  )}
                </View>
              )}

              <View className="gap-2">
                <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300 text-xs tracking-wide px-1">
                  OVERALL BUDGET
                </Text>
                <View className="bg-gray-50 dark:bg-tabby-800 border border-gray-100 dark:border-tabby-700 rounded-2xl p-3.5 gap-3">
                  {progress?.isDerivedFromCategories && (
                    <View className="flex-row items-start gap-2">
                      <Feather
                        name="check-circle"
                        size={15}
                        color={isDark ? '#86BD63' : '#4C7535'}
                        style={{ marginTop: 1 }}
                      />
                      <View className="flex-1 gap-2">
                        <View className="gap-0.5">
                          <Text className="font-nunito-bold text-sm text-sage-700 dark:text-sage-400">
                            Using category budgets: ${progress.budgetAmount.toFixed(2)}
                          </Text>
                          <Text className="font-nunito text-xs text-sage-700 dark:text-sage-400">
                            Home shows this total. The field below is saved but unused while any category has
                            a cap.
                          </Text>
                        </View>
                        <Pressable
                          onPress={handleUseOverallInstead}
                          disabled={busy}
                          style={pressFeedback}
                          className="self-start bg-white/60 dark:bg-white/10 rounded-lg px-3 py-1.5"
                          accessibilityRole="button"
                        >
                          <Text className="font-nunito-bold text-xs dark:text-white">
                            Use overall budget instead
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  )}

                  <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
                    How much of your income you intend to spend each pay cycle. Can be less than what you earn
                    &mdash; the rest is just never counted as &ldquo;spent so far.&rdquo;
                  </Text>

                  <TextInput
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="Budget per pay"
                    keyboardType="decimal-pad"
                    className={`font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2.5 bg-white dark:bg-tabby-900 dark:text-white ${
                      progress?.isDerivedFromCategories ? 'opacity-50' : ''
                    }`}
                  />

                  {message && (
                    <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-xs">{message}</Text>
                  )}

                  <View className="flex-row gap-2">
                    <View className="flex-1">
                      <Pressable
                        onPress={handleSave}
                        disabled={busy}
                        style={pressFeedback}
                        className="bg-tabby-600 dark:bg-white rounded-lg py-2.5 items-center"
                        accessibilityRole="button"
                      >
                        {busy ? (
                          <ActivityIndicator color={isDark ? '#2B1810' : 'white'} />
                        ) : (
                          <Text className="font-nunito-semibold text-white dark:text-tabby-900 text-sm">
                            Save budget
                          </Text>
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
                        accessibilityLabel="Remove budget"
                      >
                        <Text className="font-nunito-semibold text-red-500 text-sm">Clear</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              </View>

              <View className="gap-2">
                <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300 text-xs tracking-wide px-1">
                  BUDGET BY CATEGORY
                </Text>
                <Pressable
                  onPress={() => setShowCategoryBudgets(true)}
                  style={pressFeedback}
                  className="flex-row items-center gap-3 rounded-2xl bg-gray-50 dark:bg-tabby-800 border border-gray-100 dark:border-tabby-700 p-3.5"
                  accessibilityRole="button"
                  accessibilityLabel="Category budgets"
                >
                  <View className="w-10 h-10 rounded-full bg-white dark:bg-tabby-700 items-center justify-center">
                    <Feather name="pie-chart" size={17} color={isDark ? '#E8C39E' : '#4b5563'} />
                  </View>
                  <View className="flex-1">
                    <Text className="font-nunito-medium dark:text-white">Budget by category</Text>
                    <Text
                      className={`text-xs ${
                        categoryProgress.length > 0
                          ? 'font-nunito-medium text-sage-700 dark:text-sage-400'
                          : 'font-nunito text-gray-500 dark:text-tabby-300'
                      }`}
                    >
                      {categoryProgress.length > 0
                        ? `$${categoryProgress.reduce((s, c) => s + c.budgetAmount, 0).toFixed(2)} across ${categoryProgress.length} categor${categoryProgress.length === 1 ? 'y' : 'ies'}`
                        : 'Optional'}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={isDark ? '#6B4420' : '#d1d5db'} />
                </Pressable>

                {categoryProgress.length > 0 && (
                  <View className="gap-1 px-1">
                    {categoryProgress.map((c) => {
                      const catPct = c.budgetAmount > 0 ? Math.min(100, (c.spent / c.budgetAmount) * 100) : 0;
                      const catOver = c.spent >= c.budgetAmount;
                      return (
                        <Pressable
                          key={c.categoryId}
                          onPress={() => setViewingCategory(c)}
                          style={pressFeedback}
                          accessibilityRole="button"
                          accessibilityLabel={`See transactions for ${c.name}`}
                          className="flex-row items-center justify-between py-1.5"
                        >
                          <Text className="font-nunito text-sm text-gray-600 dark:text-tabby-200">
                            {c.name}
                          </Text>
                          <View className="flex-row items-center gap-2">
                            <View className="w-20 h-1 bg-gray-100 dark:bg-tabby-700 rounded-full overflow-hidden">
                              <View
                                className={`h-full rounded-full ${catOver ? 'bg-rust-500 dark:bg-rust-400' : 'bg-sage-500 dark:bg-sage-400'}`}
                                style={{ width: `${catPct}%` }}
                              />
                            </View>
                            <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300 w-20 text-right">
                              ${c.spent.toFixed(0)} / ${c.budgetAmount.toFixed(0)}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            </ScrollView>
          )}
        </SafeAreaView>
      </SafeAreaProvider>

      <CategoryBudgetsModal
        visible={showCategoryBudgets}
        onClose={() => {
          setShowCategoryBudgets(false);
          load();
        }}
        onSaved={onSaved}
      />
      <BudgetHelpModal visible={showHelp} onClose={() => setShowHelp(false)} />
      <CategorySpendModal
        visible={viewingCategory !== null}
        onClose={() => setViewingCategory(null)}
        categoryId={viewingCategory?.categoryId ?? null}
        categoryName={viewingCategory?.name ?? ''}
        categoryIcon={viewingCategory?.icon ?? null}
        cycle={progress?.cycle ?? null}
      />
    </Modal>
  );
}
