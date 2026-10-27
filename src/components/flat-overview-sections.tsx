import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Avatar } from '@/components/flat-member-avatar';
import { SharedExpenseRow } from '@/components/shared-expense-row';
import { TrendChart } from '@/components/trend-chart';
import type { FlatTrendPeriodPreference } from '@/lib/flat-trend-preference';
import type { Balance, FlatSpendTrend, SharedExpense } from '@/lib/flats';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

// How many of the most recent shared expenses show inline before
// "Recent Activity" hands off to the full-history modal -- a flat with
// months of logged rent/bills otherwise dumps its entire history into
// the main scroll every time.
export const RECENT_ACTIVITY_LIMIT = 5;

// Matches Profile's own small tracked-caps group label -- same visual
// language across reworked screens instead of each inventing its own.
function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="font-nunito-bold text-[11px] tracking-wide px-1 text-gray-400 dark:text-tabby-400">
      {children}
    </Text>
  );
}

// Per-flatmate net balance, with a Mark Settled action on anything owed.
export function FlatBalancesSection({
  balances,
  onSettle,
}: {
  balances: Balance[];
  onSettle: (balance: Balance) => void;
}) {
  return (
    <View className="gap-2">
      <SectionLabel>BALANCES</SectionLabel>
      {balances.length === 0 && (
        <Text className="font-nunito text-gray-500 dark:text-tabby-300">
          Invite flatmates to start splitting bills.
        </Text>
      )}
      {balances.map((b) => (
        <Animated.View key={b.userId} entering={FadeIn.duration(200)}>
          <View className="flex-row items-center gap-3 bg-gray-50 dark:bg-tabby-800 border border-gray-100 dark:border-tabby-700 rounded-2xl px-4 py-3">
            <Avatar name={b.displayName} colorKey={b.userId ?? 'deleted'} unknown={b.userId === null} />
            <View className="flex-1">
              <Text className="font-nunito-semibold dark:text-white">{b.displayName}</Text>
              <Text
                className={`font-nunito text-sm ${
                  b.netAmount === 0
                    ? 'text-gray-500 dark:text-tabby-300'
                    : b.netAmount > 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-500 dark:text-red-400'
                }`}
              >
                {b.netAmount === 0
                  ? 'Settled up'
                  : b.netAmount > 0
                    ? `Owes you $${b.netAmount.toFixed(2)}`
                    : `You owe $${Math.abs(b.netAmount).toFixed(2)}`}
              </Text>
            </View>
            {b.netAmount !== 0 && b.userId !== null && (
              <Pressable
                onPress={() => onSettle(b)}
                style={pressFeedback}
                accessibilityRole="button"
                className="px-3 py-1.5 bg-gray-800 dark:bg-tabby-700 rounded-full"
              >
                <Text className="font-nunito-semibold text-white text-xs">Mark Settled</Text>
              </Pressable>
            )}
          </View>
        </Animated.View>
      ))}
    </View>
  );
}

// The RECENT_ACTIVITY_LIMIT most recent shared expenses, with "View all"
// opening the full-history modal once there are more than that.
export function FlatRecentActivitySection({
  expenses,
  userId,
  editingExpenseId,
  onViewAll,
  onEditExpense,
  onDeleteExpense,
}: {
  expenses: SharedExpense[];
  userId: string | undefined;
  editingExpenseId: string | null;
  onViewAll: () => void;
  onEditExpense: (expense: SharedExpense) => void;
  onDeleteExpense: (expense: SharedExpense) => void;
}) {
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <SectionLabel>RECENT ACTIVITY</SectionLabel>
        {expenses.length > RECENT_ACTIVITY_LIMIT && (
          <Pressable
            onPress={onViewAll}
            style={pressFeedback}
            accessibilityRole="button"
            accessibilityLabel="View all shared expenses"
          >
            <Text className="font-nunito text-sm text-gray-500 dark:text-tabby-300">
              View all ({expenses.length})
            </Text>
          </Pressable>
        )}
      </View>
      {expenses.length === 0 && (
        <Text className="font-nunito text-gray-500 dark:text-tabby-300">No shared expenses yet.</Text>
      )}
      {expenses.slice(0, RECENT_ACTIVITY_LIMIT).map((e) => (
        <SharedExpenseRow
          key={e.id}
          expense={e}
          canEdit={e.paid_by === userId}
          isEditing={editingExpenseId === e.id}
          onPress={() => onEditExpense(e)}
          onDelete={() => onDeleteExpense(e)}
        />
      ))}
    </View>
  );
}

// Same 'auto' idea as the personal dashboard's own resolveTrendView, with
// an extra biweekly tier -- a flat's shared costs (rent/power/internet)
// get logged far less often than personal transactions, so jumping
// straight from weekly to monthly left a stretch (roughly 2-6 months in)
// where neither chart was very informative.
function resolveFlatTrendView(
  preference: FlatTrendPeriodPreference,
  earliestOccurredAt: string | null,
  now: Date,
): 'weekly' | 'biweekly' | 'monthly' {
  if (preference !== 'auto') return preference;
  if (!earliestOccurredAt) return 'weekly';
  const daysSinceEarliest = (now.getTime() - new Date(`${earliestOccurredAt}T00:00:00`).getTime()) / 86_400_000;
  if (daysSinceEarliest < 56) return 'weekly';
  if (daysSinceEarliest < 180) return 'biweekly';
  return 'monthly';
}

// Same enclosed-border treatment as the personal dashboard's
// own trend card -- the flat health score above is a
// current-snapshot only, this is the history view. 'auto'
// (see resolveFlatTrendView) steps weekly -> biweekly ->
// monthly as the flat's own history grows, same idea as the
// personal chart's weekly/monthly auto mode plus a biweekly
// tier; overridable per-device in Flat Settings below.
export function FlatSpendTrendCard({
  spendTrend,
  trendPreference,
}: {
  spendTrend: FlatSpendTrend | null;
  trendPreference: FlatTrendPeriodPreference;
}) {
  const trendView = resolveFlatTrendView(trendPreference, spendTrend?.earliestOccurredAt ?? null, new Date());

  return (
    <View className="border border-tabby-100 dark:border-tabby-700 rounded-3xl p-4 gap-3">
      <Text className="font-nunito-bold text-lg dark:text-white">
        {trendView === 'weekly' ? 'Last 6 weeks' : trendView === 'biweekly' ? 'Last 12 weeks' : 'Last 6 months'}
      </Text>
      {spendTrend && (
        <TrendChart
          data={
            trendView === 'weekly'
              ? spendTrend.weekly
              : trendView === 'biweekly'
                ? spendTrend.biweekly
                : spendTrend.monthly.map((m) => ({ key: m.month, label: m.label, total: m.total }))
          }
        />
      )}
    </View>
  );
}
