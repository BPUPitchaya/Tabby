import { ActivityIndicator, FlatList, Modal, Pressable, Text, useColorScheme, View } from 'react-native';

import type { ParsedCSVTransaction } from '@/lib/csv';
import type { Category } from '@/lib/transactions';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

// Review sheet for a picked CSV file -- shows every parsed row (with the
// batched AI category suggestion filling in as it arrives) before
// anything is actually imported. Visible whenever `preview` is non-null.
export function CsvImportPreviewModal({
  preview,
  categories,
  suggestingCategories,
  importing,
  onConfirm,
  onCancel,
}: {
  preview: ParsedCSVTransaction[] | null;
  categories: Category[];
  suggestingCategories: boolean;
  importing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isDark = useColorScheme() === 'dark';

  return (
    <Modal visible={preview !== null} animationType="slide" transparent>
      <View className="flex-1 bg-black/40 justify-end">
        <View className="bg-white dark:bg-tabby-900 rounded-t-2xl p-4 gap-3 h-[80%]">
          <Text className="font-fredoka-semibold text-xl dark:text-white">
            Import {preview?.length ?? 0} transaction{preview?.length === 1 ? '' : 's'}?
          </Text>
          <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
            Net: $
            {preview?.reduce((sum, t) => sum + (t.isIncome ? t.amount : -t.amount), 0).toFixed(2) ??
              '0.00'}
            .{' '}
            {suggestingCategories
              ? 'Suggesting categories...'
              : 'Categories suggested where possible. Edit any row afterwards to change one.'}
          </Text>

          <FlatList
            data={preview ?? []}
            keyExtractor={(_, i) => String(i)}
            style={{ flex: 1 }}
            renderItem={({ item }) => {
              const suggestedCategory = categories.find((c) => c.id === item.categoryId);
              return (
                <View className="flex-row justify-between py-2 border-b border-gray-100 dark:border-tabby-700">
                  <View className="flex-1">
                    <Text className="font-nunito text-sm dark:text-tabby-200">
                      {item.description || '(no description)'}
                    </Text>
                    <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">
                      {item.isIncome ? 'Income' : 'Expense'} · {item.occurredAt}
                      {suggestedCategory ? ` · ${suggestedCategory.name}` : ''}
                    </Text>
                  </View>
                  <Text
                    className={`font-nunito-semibold text-sm ${
                      item.isIncome ? 'text-green-700 dark:text-green-400' : 'dark:text-white'
                    }`}
                  >
                    {item.isIncome ? '+' : '-'}${item.amount.toFixed(2)}
                  </Text>
                </View>
              );
            }}
          />

          <View className="flex-row gap-2 pt-2">
            <Pressable
              onPress={onConfirm}
              disabled={importing}
              style={pressFeedback}
              className="flex-1 bg-tabby-600 dark:bg-white rounded-lg py-3 items-center"
              accessibilityRole="button"
              accessibilityLabel="Confirm import"
              accessibilityHint="adds all the previewed transactions to your account"
            >
              {importing ? (
                <ActivityIndicator color={isDark ? '#2B1810' : 'white'} />
              ) : (
                <Text className="font-nunito-semibold text-white dark:text-tabby-900">Import</Text>
              )}
            </Pressable>
            <Pressable
              onPress={onCancel}
              disabled={importing}
              style={pressFeedback}
              className="px-4 py-3 items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel="Cancel import"
            >
              <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300">Cancel</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
