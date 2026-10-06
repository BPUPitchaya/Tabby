import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { generateMonthlySummary } from '@/lib/ai';
import { CategoryIcon } from '@/components/category-icon';
import { useAuth } from '@/lib/auth-context';
import { fetchDashboardData, type DashboardData } from '@/lib/dashboard';

function CategoryBar({
  name,
  icon,
  total,
  max,
}: {
  name: string;
  icon: string | null;
  total: number;
  max: number;
}) {
  const widthPct = max > 0 ? Math.max(4, (total / max) * 100) : 0;
  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <View className="gap-1.5">
        <View className="flex-row justify-between items-center">
          <View className="flex-row items-center gap-2">
            <CategoryIcon name={icon} size={14} />
            <Text className="text-sm font-medium">{name}</Text>
          </View>
          <Text className="text-sm text-gray-500">${total.toFixed(2)}</Text>
        </View>
        <View className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <View className="h-2 bg-blue-600 rounded-full" style={{ width: `${widthPct}%` }} />
        </View>
      </View>
    </Animated.View>
  );
}

function MonthlyChart({ data }: { data: DashboardData['monthlyTotals'] }) {
  const max = Math.max(1, ...data.map((d) => d.total));
  return (
    <View className="flex-row items-end justify-between h-32 gap-2">
      {data.map((d) => {
        const heightPct = Math.max(2, (d.total / max) * 100);
        return (
          <View key={d.month} className="flex-1 items-center gap-1">
            <View className="w-full flex-1 justify-end">
              <View
                className="w-full bg-blue-500 rounded-t"
                style={{ height: `${heightPct}%` }}
              />
            </View>
            <Text className="text-xs text-gray-500">{d.label}</Text>
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
        <View>
          <Text className="text-gray-400 text-sm">{greeting}</Text>
          <Text className="text-2xl font-bold">{session?.user.email?.split('@')[0]}</Text>
        </View>

        {error && <Text className="text-red-500 text-sm">{error}</Text>}

        <View className="bg-gray-50 rounded-xl p-4 gap-1">
          <Text className="text-gray-500 text-sm">This month</Text>
          <Text className="text-3xl font-bold">${data?.thisMonthTotal.toFixed(2) ?? '0.00'}</Text>
          <Text className="text-gray-400 text-xs">
            {data?.transactionCount ?? 0} transaction{data?.transactionCount === 1 ? '' : 's'}
          </Text>
        </View>

        {insight && (
          <View className="bg-blue-50 rounded-xl p-4">
            <Text className="text-blue-900 text-sm">{insight}</Text>
          </View>
        )}

        <View className="gap-3">
          <Text className="text-lg font-bold">Spending by category</Text>
          {data && data.categoryTotals.length > 0 ? (
            data.categoryTotals.map((c) => (
              <CategoryBar
                key={c.categoryId ?? 'uncategorized'}
                name={c.name}
                icon={c.icon}
                total={c.total}
                max={maxCategory}
              />
            ))
          ) : (
            <Text className="text-gray-400">
              No transactions this month yet. Add one in the Transactions tab.
            </Text>
          )}
        </View>

        <View className="gap-3">
          <Text className="text-lg font-bold">Last 6 months</Text>
          {data && <MonthlyChart data={data.monthlyTotals} />}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
