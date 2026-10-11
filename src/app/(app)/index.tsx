import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { generateMonthlySummary } from '@/lib/ai';
import { CategoryIcon } from '@/components/category-icon';
import { useAuth } from '@/lib/auth-context';
import { fetchDashboardData, type DashboardData } from '@/lib/dashboard';
import { fetchIncomeProgress, type IncomeProgress } from '@/lib/profile';

const FREQUENCY_LABELS: Record<IncomeProgress['frequency'], string> = {
  weekly: 'week',
  biweekly: 'fortnight',
  monthly: 'month',
};

// Separate from the Earned/Spent twins above -- those are actual recorded
// money, this is spend-against-a-budget-figure the user set once in Edit
// Profile. Blending them into one number would make "recorded fact" and
// "forecast" indistinguishable.
//
// Quiet-bordered rather than filled -- the hero above is the only card on
// this screen that earns a solid fill; everything else stays a hairline so
// the hero doesn't have to compete for weight.
function IncomeProgressCard({ progress }: { progress: IncomeProgress }) {
  const pct = progress.amount > 0 ? Math.round((progress.spent / progress.amount) * 100) : 0;
  const over = progress.spent > progress.amount;
  const barColor = over ? 'bg-rust-500 dark:bg-rust-400' : pct >= 80 ? 'bg-tabby-400' : 'bg-tabby-600 dark:bg-white';

  return (
    <View className="border border-tabby-100 dark:border-tabby-700 rounded-2xl p-4 gap-2">
      <View className="flex-row justify-between items-baseline">
        <Text className="font-nunito-semibold text-sm dark:text-white">
          Spent ${progress.spent.toFixed(2)} of ${progress.amount.toFixed(2)}
        </Text>
        <Text
          className={`font-nunito-bold text-sm ${over ? 'text-rust-600 dark:text-rust-400' : 'text-tabby-600 dark:text-tabby-300'}`}>
          {pct}%
        </Text>
      </View>
      <View className="h-1.5 bg-tabby-50 dark:bg-tabby-700 rounded-full overflow-hidden">
        <View
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </View>
      <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-xs">
        This {FREQUENCY_LABELS[progress.frequency]}&apos;s income
      </Text>
    </View>
  );
}

// The #1 category (by spend) renders noticeably bigger than the rest --
// real asymmetry driven by real data, instead of a uniform list of
// identical-height rows.
function CategoryBar({
  name,
  icon,
  total,
  max,
  highlight = false,
}: {
  name: string;
  icon: string | null;
  total: number;
  max: number;
  highlight?: boolean;
}) {
  const widthPct = max > 0 ? Math.max(4, (total / max) * 100) : 0;
  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <View className="gap-1.5">
        <View className="flex-row justify-between items-center">
          <View className="flex-row items-center gap-2">
            <View
              className={`items-center justify-center rounded-full ${
                highlight ? 'w-8 h-8 bg-tabby-100 dark:bg-tabby-700' : 'w-5 h-5'
              }`}>
              <CategoryIcon name={icon} size={highlight ? 16 : 13} />
            </View>
            <Text
              className={
                highlight
                  ? 'font-nunito-bold text-base dark:text-white'
                  : 'font-nunito-medium text-sm dark:text-tabby-200'
              }>
              {name}
            </Text>
          </View>
          <Text
            className={
              highlight
                ? 'font-nunito-bold text-base dark:text-white'
                : 'font-nunito text-sm text-gray-500 dark:text-tabby-300'
            }>
            ${total.toFixed(2)}
          </Text>
        </View>
        <View className={`bg-tabby-50 dark:bg-tabby-700 rounded-full overflow-hidden ${highlight ? 'h-2.5' : 'h-1.5'}`}>
          <View className="h-full bg-tabby-600 dark:bg-white rounded-full" style={{ width: `${widthPct}%` }} />
        </View>
      </View>
    </Animated.View>
  );
}

function MonthlyChart({ data }: { data: DashboardData['monthlyTotals'] }) {
  const max = Math.max(1, ...data.map((d) => d.total));
  return (
    <View className="flex-row items-end justify-between h-36 gap-2">
      {data.map((d) => {
        const heightPct = Math.max(2, (d.total / max) * 100);
        const isCurrentMonth = d.month === data[data.length - 1]?.month;
        return (
          <View key={d.month} className="flex-1 items-center gap-1.5">
            <View className="w-full flex-1 justify-end">
              <View
                className={`w-full rounded-full ${isCurrentMonth ? 'bg-tabby-600 dark:bg-white' : 'bg-tabby-200 dark:bg-tabby-700'}`}
                style={{ height: `${heightPct}%` }}
              />
            </View>
            <Text
              className={
                isCurrentMonth ? 'font-nunito-bold text-xs text-tabby-700 dark:text-tabby-100' : 'font-nunito text-xs text-gray-500 dark:text-tabby-300'
              }>
              {d.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export default function HomeScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;

  const [data, setData] = useState<DashboardData | null>(null);
  const [incomeProgress, setIncomeProgress] = useState<IncomeProgress | null>(null);
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setError(null);
      setInsight(null);
      const [result, progress] = await Promise.all([
        fetchDashboardData(userId),
        fetchIncomeProgress(userId),
      ]);
      setData(result);
      setIncomeProgress(progress);

      const lastMonthTotal = result.monthlyTotals[result.monthlyTotals.length - 2]?.total ?? 0;
      generateMonthlySummary({
        thisMonthTotal: result.thisMonthTotal,
        lastMonthTotal,
        topCategories: result.categoryTotals.slice(0, 3),
      }).then(setInsight);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard.');
    }
  }, [userId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-tabby-50 dark:bg-tabby-900">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  const maxCategory = Math.max(1, ...(data?.categoryTotals.map((c) => c.total) ?? [0]));
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  // The hero is the only card that gets a fill, so it's the one place a
  // time-of-day shift reads as "this app feels like now" rather than noise:
  // a touch deeper/dustier once evening hits, same as the sky outside.
  const heroBg = hour < 18 ? 'bg-tabby-100 dark:bg-tabby-800' : 'bg-tabby-200 dark:bg-tabby-700';

  return (
    <SafeAreaView className="flex-1 bg-tabby-50 dark:bg-tabby-900">
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {/* The full illustrated bear (eyes, nose, eyebrows) only reads clean
            at splash/auth size -- at 46px it turns to noise, so the header
            badge uses the flat monochrome silhouette instead, tinted brown. */}
        <View className="flex-row items-center gap-3">
          <View
            className="w-12 h-12 rounded-full items-center justify-center"
            style={{ backgroundColor: '#BEE3F8' }}>
            <Image
              source={require('@/assets/images/android-icon-monochrome.png')}
              tintColor="#8B5A2B"
              style={{ width: 26, height: 26 }}
            />
          </View>
          <View>
            <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">{greeting}</Text>
            <Text className="font-fredoka-semibold text-2xl dark:text-white">{session?.user.email?.split('@')[0]}</Text>
          </View>
        </View>

        {error && <Text className="font-nunito text-red-500 dark:text-red-400 text-sm">{error}</Text>}

        {/* Hero: the one number that matters most this month, given real
            visual weight instead of sitting in a same-size box as everything
            else below it. */}
        <View className={`${heroBg} rounded-3xl p-5 gap-1`}>
          <Text className="font-nunito-medium text-tabby-700 dark:text-tabby-100 text-sm">This month, net</Text>
          <Text
            className={`font-nunito-extrabold text-4xl ${
              (data?.thisMonthNet ?? 0) < 0 ? 'text-rust-600 dark:text-rust-400' : 'text-sage-700 dark:text-sage-400'
            }`}>
            {(data?.thisMonthNet ?? 0) < 0 ? '-' : '+'}$
            {Math.abs(data?.thisMonthNet ?? 0).toFixed(2)}
          </Text>
          <Text className="font-nunito text-tabby-700 dark:text-tabby-100 text-xs">
            {data?.transactionCount ?? 0} transaction{data?.transactionCount === 1 ? '' : 's'} this
            month
          </Text>
        </View>

        {/* Two smaller twins underneath the hero -- the classic
            one-big/two-small asymmetric pairing. Earned keeps a green fill
            (money-in reads universally as green); Spent is a quiet border
            instead of a gray fill so it doesn't compete with Earned or
            repeat the hero's own fill treatment. */}
        <View className="flex-row gap-3">
          <View className="flex-1 bg-sage-50 dark:bg-sage-900 rounded-2xl p-3.5 gap-1">
            <Text className="font-nunito-semibold text-sage-700 dark:text-sage-400 text-xs">Earned</Text>
            <Text className="font-nunito-bold text-sage-800 dark:text-sage-400 text-xl">
              ${data?.thisMonthIncome.toFixed(2) ?? '0.00'}
            </Text>
          </View>
          <View className="flex-1 border border-tabby-100 dark:border-tabby-700 rounded-2xl p-3.5 gap-1">
            <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300 text-xs">Spent</Text>
            <Text className="font-nunito-bold text-gray-800 dark:text-white text-xl">
              ${data?.thisMonthTotal.toFixed(2) ?? '0.00'}
            </Text>
          </View>
        </View>

        {incomeProgress && <IncomeProgressCard progress={incomeProgress} />}

        {insight && (
          <View className="flex-row gap-2.5 items-start border-l-4 border-tabby-400 dark:border-tabby-500 pl-3 py-1">
            {/* Second, quiet appearance of the bear -- a small monochrome
                mark rather than another full badge, so the mascot feels
                like it's actually around the app instead of only stamped
                once in the header. */}
            <Image
              source={require('@/assets/images/android-icon-monochrome.png')}
              tintColor="#C98A52"
              style={{ width: 14, height: 14, marginTop: 3, opacity: 0.6 }}
            />
            <Text className="font-nunito text-gray-600 dark:text-tabby-200 text-sm flex-1">{insight}</Text>
          </View>
        )}

        <View className="gap-3">
          <Text className="font-nunito-bold text-lg dark:text-white">Spending by category</Text>
          {data && data.categoryTotals.length > 0 ? (
            data.categoryTotals.map((c, i) => (
              <CategoryBar
                key={c.categoryId ?? 'uncategorized'}
                name={c.name}
                icon={c.icon}
                total={c.total}
                max={maxCategory}
                highlight={i === 0}
              />
            ))
          ) : (
            <Text className="font-nunito text-gray-500 dark:text-tabby-300">
              No transactions this month yet. Add one in the Transactions tab.
            </Text>
          )}
        </View>

        {/* The 6-month trend gets its own enclosed block -- a quiet border
            rather than a gray fill, so the hero stays the only solid-filled
            card on the screen and this doesn't read as "another gray box." */}
        <View className="border border-tabby-100 dark:border-tabby-700 rounded-3xl p-4 gap-3">
          <Text className="font-nunito-bold text-lg dark:text-white">Last 6 months</Text>
          {data && <MonthlyChart data={data.monthlyTotals} />}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
