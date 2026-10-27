import { Feather } from '@expo/vector-icons';
import { Pressable, Text, useColorScheme, View } from 'react-native';

import type { FlatHealth } from '@/lib/flats';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

// One tile in the row below: icon, title, and a one-line status that turns
// rust when something needs attention and sage when it doesn't.
function PillarTile({
  icon,
  title,
  accessibilityLabel,
  status,
  needsAttention,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  accessibilityLabel: string;
  status: string;
  needsAttention: boolean;
  onPress: () => void;
}) {
  const isDark = useColorScheme() === 'dark';

  return (
    <Pressable
      onPress={onPress}
      style={pressFeedback}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className="flex-1 gap-2 rounded-2xl bg-gray-50 dark:bg-tabby-800 border border-gray-100 dark:border-tabby-700 p-3.5"
    >
      <View className="flex-row items-center justify-between">
        <View className="w-9 h-9 rounded-full bg-white dark:bg-tabby-700 items-center justify-center">
          <Feather name={icon} size={16} color={isDark ? '#E8C39E' : '#6B4420'} />
        </View>
        <Feather name="chevron-right" size={14} color={isDark ? '#6B4420' : '#d1d5db'} />
      </View>
      <Text className="font-nunito-medium text-sm dark:text-white">{title}</Text>
      <Text
        className={`font-nunito-bold text-xs ${
          needsAttention ? 'text-rust-600 dark:text-rust-400' : 'text-sage-700 dark:text-sage-400'
        }`}
      >
        {status}
      </Text>
    </Pressable>
  );
}

// The two pillars of flat living -- money fairness and chore
// fairness -- as parallel tiles instead of money being a
// giant always-open form and chores a visually unrelated
// card. Tapping either opens its own focused screen.
export function FlatPillarTiles({
  health,
  choreCount,
  pendingChoreCount,
  flatBillCount,
  pendingFlatBillCount,
  onOpenAddExpense,
  onOpenChores,
  onOpenFlatBills,
}: {
  health: FlatHealth | null;
  choreCount: number;
  pendingChoreCount: number;
  flatBillCount: number;
  pendingFlatBillCount: number;
  onOpenAddExpense: () => void;
  onOpenChores: () => void;
  onOpenFlatBills: () => void;
}) {
  return (
    <View className="flex-row gap-2.5">
      <PillarTile
        icon="dollar-sign"
        title="Split an Expense"
        accessibilityLabel="Split an expense"
        needsAttention={!!health && health.totalOutstanding > 0}
        status={health && health.totalOutstanding > 0 ? `$${health.totalOutstanding.toFixed(2)} unsettled` : 'All settled'}
        onPress={onOpenAddExpense}
      />

      <PillarTile
        icon="check-square"
        title="Chores"
        accessibilityLabel="Chores"
        needsAttention={pendingChoreCount > 0}
        status={
          choreCount === 0
            ? 'Optional'
            : pendingChoreCount > 0
              ? `${pendingChoreCount} pending`
              : 'All done'
        }
        onPress={onOpenChores}
      />

      <PillarTile
        icon="repeat"
        title="Flat Bills"
        accessibilityLabel="Flat Bills"
        needsAttention={pendingFlatBillCount > 0}
        status={
          flatBillCount === 0
            ? 'Optional'
            : pendingFlatBillCount > 0
              ? `${pendingFlatBillCount} pending`
              : 'All logged'
        }
        onPress={onOpenFlatBills}
      />
    </View>
  );
}
