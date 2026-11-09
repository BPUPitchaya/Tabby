import { Feather } from '@expo/vector-icons';
import { Pressable, Text, useColorScheme, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { CategoryIcon } from '@/components/category-icon';
import { categoryTint } from '@/components/category-tint';
import type { Transaction } from '@/lib/transactions';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

// Shared row, used by the Activity list, search results, and category
// drill-ins. One place to keep the colored icon + layout consistent.
// `showDate` is on for anything not already grouped under a day header
// (search results span multiple days with no header to carry that context).
export function TransactionRow({
  item,
  showDate,
  onPress,
  onDelete,
}: {
  item: Transaction;
  showDate: boolean;
  onPress: () => void;
  onDelete: () => void;
}) {
  const isDark = useColorScheme() === 'dark';
  const tint = categoryTint(item.category_id, isDark);

  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <Pressable
        onPress={onPress}
        style={pressFeedback}
        accessibilityRole="button"
        accessibilityLabel={`Edit transaction ${item.description ?? ''}`}
        className="flex-row items-center justify-between rounded-2xl px-4 py-3 bg-gray-50 dark:bg-tabby-800 border border-gray-100 dark:border-tabby-700 mb-2"
      >
        <View className="flex-row items-center flex-1 gap-3">
          <View
            className="w-9 h-9 rounded-full items-center justify-center"
            style={{ backgroundColor: item.is_income ? (isDark ? '#1F3B2A' : '#DCFCE7') : tint.bg }}
          >
            <CategoryIcon
              name={item.categories?.icon}
              size={16}
              color={item.is_income ? '#15803d' : tint.fg}
            />
          </View>
          <View className="flex-1">
            <Text className="font-nunito-semibold dark:text-white">
              {item.description || item.categories?.name || 'Transaction'}
            </Text>
            <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
              {item.categories?.name ?? 'Uncategorized'}
              {item.merchant ? ` · ${item.merchant}` : ''}
              {showDate ? ` · ${item.occurred_at}` : ''}
            </Text>
          </View>
        </View>
        <Text
          className={`font-nunito-bold mr-3 ${
            item.is_income ? 'text-green-700 dark:text-green-400' : 'dark:text-white'
          }`}
        >
          {item.is_income ? '+' : '-'}${item.amount.toFixed(2)}
        </Text>
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          style={pressFeedback}
          accessibilityRole="button"
          accessibilityLabel={`Delete transaction ${item.description ?? ''}`}
          accessibilityHint="asks to confirm, then permanently deletes this transaction"
        >
          <Feather name="trash-2" size={16} color="#ef4444" />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}
