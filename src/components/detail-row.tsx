// A single label/value line -- shared by income-transaction-detail-modal.tsx
// and transaction-detail-modal.tsx so both "tap a transaction, see an
// overview" screens render identically, not two near-copies that drift.
import { Text, View } from 'react-native';

export function DetailRow({ label, value, dim = false }: { label: string; value: string; dim?: boolean }) {
  return (
    <View className="flex-row items-center justify-between py-1.5">
      <Text
        className={`font-nunito ${dim ? 'text-gray-500 dark:text-tabby-300' : 'text-gray-700 dark:text-tabby-200'} text-sm`}
      >
        {label}
      </Text>
      <Text className={`font-nunito-semibold text-sm dark:text-white ${dim ? 'text-gray-500 dark:text-tabby-300' : ''}`}>
        {value}
      </Text>
    </View>
  );
}
