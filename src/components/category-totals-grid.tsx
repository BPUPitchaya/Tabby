import { useMemo } from 'react';
import { FlatList, Pressable, Text, useColorScheme, View } from 'react-native';

import { CategoryIcon } from '@/components/category-icon';
import { categoryTint } from '@/components/category-tint';
import type { Category, Transaction } from '@/lib/transactions';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

// The By Category tab: a two-column grid of per-category expense totals.
// Tapping a tile opens search pre-filtered to that category.
export function CategoryTotalsGrid({
  transactions,
  categories,
  onSelectCategory,
}: {
  transactions: Transaction[];
  categories: Category[];
  onSelectCategory: (categoryId: string) => void;
}) {
  const isDark = useColorScheme() === 'dark';

  // Expense-only, same convention as the dashboard's "Spending by category":
  // every expense category shows up even with zero activity (dashed,
  // dimmed), rather than only the ones with transactions, so the grid
  // doesn't reshuffle as spending starts/stops in a category.
  const categoryTiles = useMemo(() => {
    const totals = new Map<string, { total: number; count: number }>();
    for (const tx of transactions) {
      if (tx.is_income || !tx.category_id) continue;
      const entry = totals.get(tx.category_id) ?? { total: 0, count: 0 };
      entry.total += tx.amount;
      entry.count += 1;
      totals.set(tx.category_id, entry);
    }
    return categories
      .filter((c) => c.type === 'expense')
      .map((c) => ({ category: c, total: totals.get(c.id)?.total ?? 0, count: totals.get(c.id)?.count ?? 0 }))
      .sort((a, b) => b.total - a.total);
  }, [transactions, categories]);

  return (
    <FlatList
      data={categoryTiles}
      keyExtractor={({ category }) => category.id}
      numColumns={2}
      columnWrapperStyle={{ gap: 12 }}
      contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 12, flexGrow: 1 }}
      ListEmptyComponent={
        <View className="flex-1 items-center justify-center py-16">
          <Text className="font-nunito text-center text-gray-500 dark:text-tabby-300">
            No expense categories yet.
          </Text>
        </View>
      }
      renderItem={({ item }) => {
        const tint = categoryTint(item.category.id, isDark);
        const hasActivity = item.count > 0;
        return (
          <Pressable
            onPress={() => onSelectCategory(item.category.id)}
            style={pressFeedback}
            className={`flex-1 rounded-2xl p-4 bg-gray-50 dark:bg-tabby-800 border ${
              hasActivity
                ? 'border-gray-100 dark:border-tabby-700'
                : 'border-dashed border-gray-200 dark:border-tabby-700 opacity-60'
            }`}
          >
            <View
              className="w-8 h-8 rounded-full items-center justify-center mb-2.5"
              style={{ backgroundColor: tint.bg }}
            >
              <CategoryIcon name={item.category.icon} size={14} color={tint.fg} />
            </View>
            <Text className="font-nunito-semibold text-sm dark:text-tabby-200">
              {item.category.name}
            </Text>
            <Text className="font-fredoka-semibold text-lg dark:text-white pt-0.5">
              ${item.total.toFixed(2)}
            </Text>
            <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">
              {hasActivity
                ? `${item.count} transaction${item.count === 1 ? '' : 's'}`
                : 'No activity'}
            </Text>
          </Pressable>
        );
      }}
    />
  );
}
