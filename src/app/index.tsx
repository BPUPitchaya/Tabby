import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { generateMonthlySummary } from '@/lib/ai';
import { CategoryIcon } from '@/components/category-icon';
import { useAuth } from '@/lib/auth-context';
import { fetchDashboardData, type DashboardData } from '@/lib/dashboard';

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
                highlight ? 'w-8 h-8 bg-tabby-100' : 'w-5 h-5'
              }`}>
              <CategoryIcon name={icon} size={highlight ? 16 : 13} />
            </View>
            <Text className={highlight ? 'font-nunito-bold text-base' : 'font-nunito-medium text-sm'}>
              {name}
            </Text>
          </View>
          <Text className={highlight ? 'font-nunito-bold text-base' : 'font-nunito text-sm text-gray-500'}>
            ${total.toFixed(2)}
          </Text>
        </View>
        <View className={`bg-gray-100 rounded-full overflow-hidden ${highlight ? 'h-2.5' : 'h-1.5'}`}>
          <View className="h-full bg-tabby-600 rounded-full" style={{ width: `${widthPct}%` }} />
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
                className={`w-full rounded-t ${isCurrentMonth ? 'bg-tabby-600' : 'bg-tabby-200'}`}
                style={{ height: `${heightPct}%` }}
              />
            </View>
            <Text
              className={
                isCurrentMonth ? 'font-nunito-bold text-xs text-tabby-700' : 'font-nunito text-xs text-gray-500'
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
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setError(null);
      setInsight(null);
      const result = await fetchDashboardData(userId);
      setData(result);

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
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  const maxCategory = Math.max(1, ...(data?.categoryTotals.map((c) => c.total) ?? [0]));
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View className="flex-row items-center gap-3">
          <View
            className="w-12 h-12 rounded-full items-center justify-center"
            style={{ backgroundColor: '#BEE3F8' }}>
            <Image
              source={require('@/assets/images/splash-icon.png')}
              style={{ width: 34, height: 34 }}
            />
          </View>
          <View>
            <Text className="font-nunito text-gray-500 text-sm">{greeting}</Text>
            <Text className="font-nunito-bold text-2xl">{session?.user.email?.split('@')[0]}</Text>
          </View>
        </View>

        {error && <Text className="font-nunito text-red-500 text-sm">{error}</Text>}

        {/* Hero: the one number that matters most this month, given real
            visual weight instead of sitting in a same-size box as everything
            else below it. */}
        <View className="bg-tabby-50 rounded-3xl p-5 gap-1">
          <Text className="font-nunito-medium text-tabby-700 text-sm">This month, net</Text>
          <Text
            className={`font-nunito-extrabold text-4xl ${
              (data?.thisMonthNet ?? 0) < 0 ? 'text-red-600' : 'text-green-700'
            }`}>
            {(data?.thisMonthNet ?? 0) < 0 ? '-' : '+'}$
            {Math.abs(data?.thisMonthNet ?? 0).toFixed(2)}
          </Text>
          <Text className="font-nunito text-tabby-700 text-xs">
            {data?.transactionCount ?? 0} transaction{data?.transactionCount === 1 ? '' : 's'} this
            month
          </Text>
        </View>

        {/* Two smaller twins underneath the hero -- the classic
            one-big/two-small asymmetric pairing. */}
        <View className="flex-row gap-3">
          <View className="flex-1 bg-green-50 rounded-2xl p-3.5 gap-1">
            <Text className="font-nunito-semibold text-green-700 text-xs">Earned</Text>
            <Text className="font-nunito-bold text-green-800 text-xl">
              ${data?.thisMonthIncome.toFixed(2) ?? '0.00'}
            </Text>
          </View>
          <View className="flex-1 bg-gray-50 rounded-2xl p-3.5 gap-1">
            <Text className="font-nunito-semibold text-gray-500 text-xs">Spent</Text>
            <Text className="font-nunito-bold text-gray-800 text-xl">
              ${data?.thisMonthTotal.toFixed(2) ?? '0.00'}
            </Text>
          </View>
        </View>

        {insight && (
          <View className="flex-row gap-3 border-l-4 border-tabby-400 pl-3 py-1">
            <Text className="font-nunito text-gray-600 text-sm flex-1">{insight}</Text>
          </View>
        )}

        <View className="gap-3">
          <Text className="font-fredoka-semibold text-lg">Spending by category</Text>
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
            <Text className="font-nunito text-gray-500">
              No transactions this month yet. Add one in the Transactions tab.
            </Text>
          )}
        </View>

        {/* The 6-month trend gets its own enclosed, immersive block --
            deliberately a different container treatment than the plain
            list above it, so the rhythm isn't "every section is a card." */}
        <View className="bg-gray-50 rounded-3xl p-4 gap-3">
          <Text className="font-fredoka-semibold text-lg">Last 6 months</Text>
          {data && <MonthlyChart data={data.monthlyTotals} />}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
