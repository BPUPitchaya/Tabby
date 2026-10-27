// Shared bar chart for a short history series -- originally lived only
// in index.tsx for the personal 6-week/6-month spend trend; extracted so
// the Flat screen's spend trend can reuse the exact same look instead of
// a second hand-rolled chart.
import { Text, View } from 'react-native';

export type TrendPoint = { key: string; label: string; total: number };

export function TrendChart({ data }: { data: TrendPoint[] }) {
  const max = Math.max(1, ...data.map((d) => d.total));
  return (
    <View className="flex-row items-end justify-between h-36 gap-2">
      {data.map((d) => {
        const heightPct = Math.max(2, (d.total / max) * 100);
        const isCurrent = d.key === data[data.length - 1]?.key;
        return (
          <View key={d.key} className="flex-1 items-center gap-1.5">
            <View className="w-full flex-1 justify-end">
              <View
                className={`w-full rounded-full ${isCurrent ? 'bg-tabby-600 dark:bg-white' : 'bg-tabby-200 dark:bg-tabby-700'}`}
                style={{ height: `${heightPct}%` }}
              />
            </View>
            <Text
              className={
                isCurrent
                  ? 'font-nunito-bold text-xs text-tabby-700 dark:text-tabby-100'
                  : 'font-nunito text-xs text-gray-500 dark:text-tabby-300'
              }
            >
              {d.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
