import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { FlatList, Modal, Pressable, Text, TextInput, useColorScheme, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { SharedExpenseRow } from '@/components/shared-expense-row';
import type { SharedExpense } from '@/lib/flats';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

// Full shared-expense history -- "Recent Activity" only ever shows
// the RECENT_ACTIVITY_LIMIT most recent inline; this is the
// unbounded list behind "View all". Tapping a row to edit closes
// this modal in the same state update that opens the edit one
// (never both visible={true} at once) -- two stacked RN Modals
// silently fail to present the top one on iOS (see
// manual-transaction-modal.tsx's own DateTimePicker comment for the
// same constraint).
export function FlatExpenseHistoryModal({
  visible,
  onClose,
  expenses,
  userId,
  editingExpenseId,
  onEditExpense,
  onDeleteExpense,
}: {
  visible: boolean;
  onClose: () => void;
  expenses: SharedExpense[];
  userId: string | undefined;
  editingExpenseId: string | null;
  // Called after this modal has already asked to close (see above).
  onEditExpense: (expense: SharedExpense) => void;
  onDeleteExpense: (expense: SharedExpense) => void;
}) {
  const isDark = useColorScheme() === 'dark';
  const [historySearch, setHistorySearch] = useState('');

  // Matches on the description or who paid -- the two things worth
  // scanning a long history by, same "search what's visible" scope as
  // every other plain-text filter in the app (no AI, no date parsing).
  const historyResults = historySearch.trim()
    ? expenses.filter((e) => {
        const needle = historySearch.trim().toLowerCase();
        return (
          (e.description ?? '').toLowerCase().includes(needle) ||
          (e.profiles?.display_name ?? '').toLowerCase().includes(needle)
        );
      })
    : expenses;

  const handleClose = () => {
    onClose();
    setHistorySearch('');
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-white dark:bg-tabby-900">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-tabby-700">
            <Pressable
              onPress={handleClose}
              style={pressFeedback}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Feather name="chevron-left" size={20} color={isDark ? '#E8C39E' : '#374151'} />
            </Pressable>
            <Text className="font-fredoka-semibold text-lg dark:text-white">All Activity</Text>
            <View style={{ width: 20 }} />
          </View>
          <View className="px-4 pt-3">
            <View className="flex-row items-center gap-2 border border-gray-200 dark:border-tabby-700 rounded-xl px-3 py-2 bg-gray-50 dark:bg-tabby-800">
              <Feather name="search" size={15} color={isDark ? '#8A7560' : '#9ca3af'} />
              <TextInput
                value={historySearch}
                onChangeText={setHistorySearch}
                placeholder="Search by description or who paid"
                placeholderTextColor={isDark ? '#8A7560' : '#9ca3af'}
                className="flex-1 font-nunito text-sm dark:text-white"
              />
              {historySearch.length > 0 && (
                <Pressable onPress={() => setHistorySearch('')} accessibilityRole="button" accessibilityLabel="Clear search">
                  <Feather name="x-circle" size={15} color={isDark ? '#8A7560' : '#9ca3af'} />
                </Pressable>
              )}
            </View>
          </View>
          <FlatList
            data={historyResults}
            keyExtractor={(e) => e.id}
            contentContainerStyle={{ padding: 16, gap: 10 }}
            ListEmptyComponent={
              <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-center mt-4">
                No matching expenses.
              </Text>
            }
            renderItem={({ item: e }) => (
              <SharedExpenseRow
                expense={e}
                canEdit={e.paid_by === userId}
                isEditing={editingExpenseId === e.id}
                onPress={() => {
                  handleClose();
                  onEditExpense(e);
                }}
                onDelete={() => onDeleteExpense(e)}
              />
            )}
          />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
