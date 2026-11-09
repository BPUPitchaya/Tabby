import { Feather } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, useColorScheme, View } from 'react-native';

import { TransactionRow } from '@/components/transaction-row';
import { parseSpendingQuery } from '@/lib/ai';
import { filterTransactionsByQuery, toLocalISODate } from '@/lib/transaction-query';
import type { Category, Transaction } from '@/lib/transactions';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

// The Transactions screen's search mode. Overlays either tab rather than
// being a third tab, since it's a transient "narrow what I'm looking at"
// mode, not a destination of its own. Only mounted while search is open,
// so every open starts from a fresh filter state (All time, no keyword,
// `initialCategoryId` preselected when opened from a category tile).
export function TransactionSearchView({
  transactions,
  categories,
  todayISO,
  initialCategoryId,
  onCancel,
  onItemPress,
  onDelete,
}: {
  transactions: Transaction[];
  categories: Category[];
  todayISO: string;
  initialCategoryId: string | null;
  onCancel: () => void;
  onItemPress: (item: Transaction) => void;
  onDelete: (id: string) => void;
}) {
  const isDark = useColorScheme() === 'dark';

  const [searchText, setSearchText] = useState('');
  const [searchCategoryId, setSearchCategoryId] = useState<string | null>(initialCategoryId);
  const [searchRange, setSearchRange] = useState<'today' | 'week' | 'month' | 'all'>('all');
  // Set only by a submitted AI question whose answer implies a specific
  // window ("last month", "in September"). Overrides the preset pills
  // above, which only ever express an open-ended "since X" range. Cleared
  // by picking a preset manually, so the two controls never fight.
  const [aiDateRange, setAiDateRange] = useState<{ start: string; end: string } | null>(null);
  const [askingAI, setAskingAI] = useState(false);

  const searchResults = useMemo(() => {
    // Date.now() below is intentional, not a memoization hazard: this
    // recomputes on its own explicit deps, never relies on the
    // compiler's auto-memoization, and a relative range ("last 7 days")
    // has to read the actual current time somewhere.
    const rangeStart = aiDateRange
      ? aiDateRange.start
      : searchRange === 'today'
        ? todayISO
        : searchRange === 'week'
          ? toLocalISODate(new Date(Date.now() - 6 * 86_400_000)) // eslint-disable-line react-hooks/purity
          : searchRange === 'month'
            ? toLocalISODate(new Date(Date.now() - 29 * 86_400_000)) // eslint-disable-line react-hooks/purity
            : null;
    const rangeEnd = aiDateRange ? aiDateRange.end : null;

    return filterTransactionsByQuery(transactions, {
      categoryId: searchCategoryId,
      keyword: searchText.trim() || null,
      startDate: rangeStart,
      endDate: rangeEnd,
    });
  }, [transactions, searchText, searchCategoryId, searchRange, aiDateRange]);

  // Expense/income totals for whatever's currently filtered. Answers
  // "how much did I spend on X" directly instead of making the user add
  // up a results list by hand. Plain sums over already-filtered rows,
  // never an AI-generated figure.
  const searchExpenseTotal = useMemo(
    () => searchResults.filter((tx) => !tx.is_income).reduce((sum, tx) => sum + tx.amount, 0),
    [searchResults],
  );
  const searchIncomeTotal = useMemo(
    () => searchResults.filter((tx) => tx.is_income).reduce((sum, tx) => sum + tx.amount, 0),
    [searchResults],
  );

  const handleAskAI = async () => {
    const query = searchText.trim();
    if (!query || askingAI) return;
    setAskingAI(true);
    try {
      const parsed = await parseSpendingQuery(query, categories);
      if (!parsed) return; // fall back to the plain substring search already running
      setSearchCategoryId(parsed.categoryId);
      setSearchText(parsed.keyword ?? '');
      if (parsed.startDate && parsed.endDate) {
        setAiDateRange({ start: parsed.startDate, end: parsed.endDate });
      } else {
        setAiDateRange(null);
      }
    } finally {
      setAskingAI(false);
    }
  };

  return (
    <>
      {/* Search header, replaces the tabs/search-bar row while active. */}
      <View className="flex-row items-center gap-2 px-4 pt-3 pb-3">
        <View className="flex-1 h-11 rounded-xl bg-gray-100 dark:bg-tabby-800 border border-tabby-600 dark:border-tabby-200 flex-row items-center px-3 gap-2">
          <Feather name="search" size={15} color={isDark ? '#E8C39E' : '#8B5A2B'} />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            onSubmitEditing={handleAskAI}
            returnKeyType="search"
            placeholder="Search, or ask a question"
            autoFocus
            className="font-nunito flex-1 text-sm dark:text-white"
          />
          {askingAI && <ActivityIndicator size="small" color={isDark ? '#E8C39E' : '#8B5A2B'} />}
        </View>
        <Pressable
          onPress={onCancel}
          style={pressFeedback}
          accessibilityRole="button"
          accessibilityLabel="Cancel search"
        >
          <Text className="font-nunito-semibold text-tabby-600 dark:text-tabby-200">Cancel</Text>
        </Pressable>
      </View>

      <View className="px-4 pb-2 gap-2">
        <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300 text-xs tracking-wide">
          Category
        </Text>
        <View className="flex-row flex-wrap gap-2">
          <Pressable
            onPress={() => setSearchCategoryId(null)}
            style={pressFeedback}
            className={`px-3 py-1.5 rounded-full border ${
              searchCategoryId === null
                ? 'bg-tabby-600 dark:bg-white border-tabby-600 dark:border-white'
                : 'border-gray-300 dark:border-tabby-600'
            }`}
          >
            <Text
              className={`font-nunito-medium text-sm ${
                searchCategoryId === null
                  ? 'text-white dark:text-tabby-900'
                  : 'text-gray-600 dark:text-tabby-200'
              }`}
            >
              All
            </Text>
          </Pressable>
          {categories.map((cat) => (
            <Pressable
              key={cat.id}
              onPress={() => setSearchCategoryId(cat.id === searchCategoryId ? null : cat.id)}
              style={pressFeedback}
              className={`px-3 py-1.5 rounded-full border ${
                searchCategoryId === cat.id
                  ? 'bg-tabby-600 dark:bg-white border-tabby-600 dark:border-white'
                  : 'border-gray-300 dark:border-tabby-600'
              }`}
            >
              <Text
                className={`font-nunito-medium text-sm ${
                  searchCategoryId === cat.id
                    ? 'text-white dark:text-tabby-900'
                    : 'text-gray-600 dark:text-tabby-200'
                }`}
              >
                {cat.name}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300 text-xs tracking-wide pt-1">
          Date
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {(
            [
              ['today', 'Today'],
              ['week', 'This week'],
              ['month', 'This month'],
              ['all', 'All time'],
            ] as const
          ).map(([value, label]) => (
            <Pressable
              key={value}
              onPress={() => {
                setSearchRange(value);
                setAiDateRange(null);
              }}
              style={pressFeedback}
              className={`px-3 py-1.5 rounded-full border ${
                !aiDateRange && searchRange === value
                  ? 'bg-tabby-600 dark:bg-white border-tabby-600 dark:border-white'
                  : 'border-gray-300 dark:border-tabby-600'
              }`}
            >
              <Text
                className={`font-nunito-medium text-sm ${
                  !aiDateRange && searchRange === value
                    ? 'text-white dark:text-tabby-900'
                    : 'text-gray-600 dark:text-tabby-200'
                }`}
              >
                {label}
              </Text>
            </Pressable>
          ))}
          {aiDateRange && (
            <View className="px-3 py-1.5 rounded-full bg-tabby-600 dark:bg-white flex-row items-center gap-1.5">
              <Feather name="zap" size={11} color={isDark ? '#2B1810' : 'white'} />
              <Text className="font-nunito-medium text-sm text-white dark:text-tabby-900">
                {aiDateRange.start} to {aiDateRange.end}
              </Text>
            </View>
          )}
        </View>
      </View>

      <View className="px-4 pb-2 gap-0.5">
        <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-xs">
          {searchResults.length} result{searchResults.length === 1 ? '' : 's'}
        </Text>
        {(searchExpenseTotal > 0 || searchIncomeTotal > 0) && (
          <Text className="font-nunito-semibold text-sm text-gray-700 dark:text-tabby-100">
            {searchExpenseTotal > 0 && `Spent $${searchExpenseTotal.toFixed(2)}`}
            {searchExpenseTotal > 0 && searchIncomeTotal > 0 && ' · '}
            {searchIncomeTotal > 0 && `Earned $${searchIncomeTotal.toFixed(2)}`}
          </Text>
        )}
      </View>

      <FlatList
        data={searchResults}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingTop: 0, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-16">
            <Text className="font-nunito text-center text-gray-500 dark:text-tabby-300">
              No matching transactions.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TransactionRow
            item={item}
            showDate
            onPress={() => onItemPress(item)}
            onDelete={() => onDelete(item.id)}
          />
        )}
      />
    </>
  );
}
