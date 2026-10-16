// Optional per-category budget caps -- reached from Budget, since a
// category budget rides the same pay cycle the overall one does. No
// category starts with a cap; add one to whichever categories you want to
// track, clear it to stop. See category-budgets.ts and
// 0026_add_category_budgets.sql for why this is its own table.
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

import { CategoryIcon } from '@/components/category-icon';
import { useAuth } from '@/lib/auth-context';
import {
  clearCategoryBudget,
  fetchCategoryBudgets,
  mergeCategoryBudgetProgress,
  setCategoryBudget,
  type CategoryBudgetProgress,
} from '@/lib/category-budgets';
import { fetchDashboardData } from '@/lib/dashboard';
import { fetchIncomeSources, getIncomeSourceCycle, getPrimaryIncomeSource } from '@/lib/income-sources';
import { fetchCategories, type Category } from '@/lib/transactions';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

export function CategoryBudgetsModal({
  visible,
  onClose,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const isDark = useColorScheme() === 'dark';
  const { session } = useAuth();
  const userId = session?.user.id;

  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [progress, setProgress] = useState<CategoryBudgetProgress[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!userId) return;
    try {
      const sources = await fetchIncomeSources(userId);
      const primary = getPrimaryIncomeSource(sources);
      const cycle = primary ? getIncomeSourceCycle(primary) : null;

      const [cats, budgets, dashboard] = await Promise.all([
        fetchCategories('expense'),
        fetchCategoryBudgets(userId),
        fetchDashboardData(userId, cycle),
      ]);

      setCategories(cats);
      const merged = mergeCategoryBudgetProgress(budgets, cats, dashboard.categoryTotals);
      setProgress(merged);
      setDrafts(Object.fromEntries(merged.map((m) => [m.categoryId, String(m.budgetAmount)])));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load category budgets.');
    }
  };

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [visible, userId]);

  const handleSave = async (categoryId: string) => {
    if (!userId) return;
    const draft = drafts[categoryId] ?? '';
    const parsed = parseFloat(draft);
    setSavingId(categoryId);
    setError(null);
    try {
      if (draft.trim() === '' || isNaN(parsed) || parsed <= 0) {
        await clearCategoryBudget(userId, categoryId);
      } else {
        await setCategoryBudget(userId, categoryId, parsed);
      }
      await load();
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSavingId(null);
    }
  };

  const spentFor = (categoryId: string) => progress.find((p) => p.categoryId === categoryId)?.spent ?? 0;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-white dark:bg-tabby-900">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-tabby-700">
            <Text className="font-fredoka-semibold text-xl dark:text-white">Category Budgets</Text>
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
            <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
              <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
                Set a cap on any category you want to track. Leave the rest blank &mdash; those just show
                spend, no cap. Once any category has a cap, Budget on Home reflects these instead of a single
                overall figure.
              </Text>

              {error && (
                <View className="px-3 py-2 bg-red-50 dark:bg-red-950 rounded-lg">
                  <Text className="font-nunito text-red-600 dark:text-red-400 text-sm">{error}</Text>
                </View>
              )}

              {categories.map((cat) => {
                const draft = drafts[cat.id] ?? '';
                const spent = spentFor(cat.id);
                const savedAmount = progress.find((p) => p.categoryId === cat.id)?.budgetAmount;
                const savedDraft = savedAmount !== undefined ? String(savedAmount) : '';
                const isDirty = draft !== savedDraft;
                const saving = savingId === cat.id;
                return (
                  <View
                    key={cat.id}
                    className="flex-row items-center gap-3 rounded-xl px-3 py-2.5 bg-gray-50 dark:bg-tabby-800 border border-gray-100 dark:border-tabby-700"
                  >
                    <View className="w-9 h-9 rounded-full bg-white dark:bg-tabby-700 items-center justify-center">
                      <CategoryIcon name={cat.icon} size={15} color={isDark ? '#E8C39E' : '#4b5563'} />
                    </View>
                    <View className="flex-1">
                      <Text className="font-nunito-medium dark:text-white">{cat.name}</Text>
                      {savedAmount !== undefined && (
                        <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">
                          ${spent.toFixed(2)} spent this cycle
                        </Text>
                      )}
                    </View>
                    <TextInput
                      value={draft}
                      onChangeText={(text) => setDrafts((d) => ({ ...d, [cat.id]: text }))}
                      placeholder="No cap"
                      keyboardType="decimal-pad"
                      className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-2.5 py-1.5 w-20 text-right bg-white dark:bg-tabby-900 dark:text-white"
                    />
                    <View className="w-16 items-center">
                      {saving ? (
                        <ActivityIndicator size="small" />
                      ) : isDirty ? (
                        <Pressable
                          onPress={() => handleSave(cat.id)}
                          style={pressFeedback}
                          className="bg-tabby-600 dark:bg-white rounded-lg px-3 py-1.5"
                          accessibilityRole="button"
                          accessibilityLabel={`Save budget for ${cat.name}`}
                        >
                          <Text className="font-nunito-semibold text-xs text-white dark:text-tabby-900">
                            Save
                          </Text>
                        </Pressable>
                      ) : savedAmount !== undefined ? (
                        <View
                          className="flex-row items-center gap-1"
                          accessibilityLabel={`Budget saved for ${cat.name}`}
                        >
                          <Feather name="check-circle" size={14} color={isDark ? '#86BD63' : '#4C7535'} />
                          <Text className="font-nunito text-xs text-sage-700 dark:text-sage-400">Saved</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
