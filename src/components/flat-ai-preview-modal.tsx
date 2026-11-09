import { ActivityIndicator, FlatList, Modal, Pressable, Text, useColorScheme, View } from 'react-native';

import type { ParsedExpense } from '@/lib/ai';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

// Review sheet for shared expenses the AI pulled out of the Split an
// Expense quick-add text; each one splits equally across every member.
// Visible whenever `preview` is non-null.
export function FlatAiPreviewModal({
  preview,
  memberCount,
  importing,
  onConfirm,
  onCancel,
}: {
  preview: ParsedExpense[] | null;
  memberCount: number;
  importing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isDark = useColorScheme() === 'dark';

  return (
    <Modal visible={preview !== null} animationType="slide" transparent>
      <View className="flex-1 bg-black/40 justify-end">
        <View className="bg-white dark:bg-tabby-900 rounded-t-2xl p-4 gap-3 max-h-[80%]">
          <Text className="font-fredoka-semibold text-xl dark:text-white">
            Add {preview?.length ?? 0} shared expense{preview?.length === 1 ? '' : 's'}?
          </Text>
          <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
            Total: ${preview?.reduce((sum, t) => sum + t.amount, 0).toFixed(2) ?? '0.00'}. Each one splits
            equally across all {memberCount} member
            {memberCount === 1 ? '' : 's'}.
          </Text>

          <FlatList
            data={preview ?? []}
            keyExtractor={(_, i) => String(i)}
            style={{ maxHeight: 300 }}
            renderItem={({ item }) => (
              <View className="flex-row justify-between py-2 border-b border-gray-100 dark:border-tabby-700">
                <Text className="font-nunito text-sm flex-1 dark:text-tabby-200">{item.description}</Text>
                <Text className="font-nunito-semibold text-sm dark:text-white">
                  ${item.amount.toFixed(2)}
                </Text>
              </View>
            )}
          />

          <View className="flex-row gap-2 pt-2">
            <Pressable
              onPress={onConfirm}
              disabled={importing}
              style={pressFeedback}
              className="flex-1 bg-tabby-600 dark:bg-white rounded-lg py-3 items-center"
              accessibilityRole="button"
              accessibilityLabel="Confirm add"
            >
              {importing ? (
                <ActivityIndicator color={isDark ? '#2B1810' : 'white'} />
              ) : (
                <Text className="font-nunito-semibold text-white dark:text-tabby-900">Confirm</Text>
              )}
            </Pressable>
            <Pressable
              onPress={onCancel}
              disabled={importing}
              style={pressFeedback}
              className="px-4 py-3 items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300">Cancel</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
