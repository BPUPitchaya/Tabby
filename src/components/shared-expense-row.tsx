import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Avatar } from '@/components/flat-member-avatar';
import type { SharedExpense } from '@/lib/flats';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

// Shared between the capped inline list and the full-history modal, so
// the two never drift out of visual sync with each other.
export function SharedExpenseRow({
  expense,
  canEdit,
  isEditing,
  onPress,
  onDelete,
}: {
  expense: SharedExpense;
  canEdit: boolean;
  isEditing: boolean;
  onPress: () => void;
  onDelete: () => void;
}) {
  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <Pressable
        onPress={() => canEdit && onPress()}
        disabled={!canEdit}
        style={pressFeedback}
        accessibilityRole="button"
        accessibilityLabel={canEdit ? `Edit shared expense ${expense.description ?? ''}` : undefined}
        className={`flex-row items-center gap-3 rounded-2xl px-4 py-3 ${
          isEditing
            ? 'bg-tabby-50 dark:bg-tabby-800 border border-tabby-300 dark:border-tabby-600'
            : 'bg-gray-50 dark:bg-tabby-800 border border-gray-100 dark:border-tabby-700'
        }`}
      >
        <Avatar
          name={expense.profiles?.display_name ?? 'Deleted User'}
          colorKey={expense.paid_by ?? 'deleted'}
          unknown={!expense.profiles?.display_name}
        />
        <View className="flex-1">
          <Text className="font-nunito-semibold dark:text-white">{expense.description || 'Shared expense'}</Text>
          <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
            Paid by {expense.profiles?.display_name ?? 'Deleted User'} · {expense.occurred_at}
          </Text>
        </View>
        <Text className="font-nunito-bold mr-3 dark:text-white">${expense.amount.toFixed(2)}</Text>
        {canEdit && (
          <Pressable
            onPress={(ev) => {
              ev.stopPropagation();
              onDelete();
            }}
            style={pressFeedback}
            accessibilityRole="button"
            accessibilityLabel={`Delete shared expense ${expense.description ?? ''}`}
            accessibilityHint="asks to confirm, then removes it and recalculates balances for everyone"
          >
            <Text className="font-nunito text-red-500 dark:text-red-400">Delete</Text>
          </Pressable>
        )}
      </Pressable>
    </Animated.View>
  );
}
