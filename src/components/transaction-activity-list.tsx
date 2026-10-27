import { Feather } from '@expo/vector-icons';
import { useMemo } from 'react';
import { RefreshControl, SectionList, Text, View } from 'react-native';

import { TransactionRow } from '@/components/transaction-row';
import { groupByDay } from '@/lib/transaction-query';
import type { Transaction } from '@/lib/transactions';

// The Activity tab: every transaction grouped under a sticky day header
// carrying that day's net, with pull-to-refresh.
export function TransactionActivityList({
  transactions,
  todayISO,
  refreshing,
  onRefresh,
  onItemPress,
  onDelete,
}: {
  transactions: Transaction[];
  todayISO: string;
  refreshing: boolean;
  onRefresh: () => void;
  onItemPress: (item: Transaction) => void;
  onDelete: (id: string) => void;
}) {
  const daySections = useMemo(() => groupByDay(transactions, todayISO), [transactions, todayISO]);

  return (
    <SectionList
      sections={daySections}
      keyExtractor={(item) => item.id}
      stickySectionHeadersEnabled
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      contentContainerStyle={{ padding: 16, paddingTop: 0, flexGrow: 1 }}
      ListEmptyComponent={
        <View className="flex-1 items-center justify-center gap-3 py-16">
          <View className="w-14 h-14 rounded-full bg-gray-100 dark:bg-tabby-700 items-center justify-center">
            <Feather name="file-text" size={22} color="#9ca3af" />
          </View>
          <Text className="font-nunito text-center text-gray-500 dark:text-tabby-300">
            No transactions yet.{'\n'}Type one below, or tap + to add one manually.
          </Text>
        </View>
      }
      renderSectionHeader={({ section }) => (
        <View className="flex-row items-baseline justify-between bg-white dark:bg-tabby-900 pt-3 pb-2">
          <Text className="font-fredoka-semibold text-sm dark:text-white">{section.title}</Text>
          <Text
            className={`font-nunito-semibold text-xs ${
              section.net >= 0
                ? 'text-green-700 dark:text-green-400'
                : 'text-gray-500 dark:text-tabby-300'
            }`}
          >
            {section.net >= 0 ? '+' : '-'}${Math.abs(section.net).toFixed(2)}
          </Text>
        </View>
      )}
      renderItem={({ item }) => (
        <TransactionRow
          item={item}
          showDate={false}
          onPress={() => onItemPress(item)}
          onDelete={() => onDelete(item.id)}
        />
      )}
    />
  );
}
