import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, Modal, Pressable, Text, TextInput, useColorScheme, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/flat-member-avatar';
import type { FlatMember } from '@/lib/flats';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

// Split an Expense -- the form that used to permanently occupy the
// Overview (quick-add AI, manual fields, split-with picker) now
// lives here, reached via the pillar tile, open on demand instead
// of always rendered. Same handlers/state as before, just moved
// into its own screen -- all of it still owned by FlatView, since
// editing can be started from the Recent Activity list or the history
// modal too.
export function FlatExpenseFormModal({
  visible,
  onClose,
  isEditing,
  quickAdd,
  amount,
  onChangeAmount,
  description,
  onChangeDescription,
  members,
  userId,
  selectedMemberIds,
  onToggleMember,
  error,
  submitting,
  onSubmit,
  onCancelEdit,
}: {
  visible: boolean;
  onClose: () => void;
  isEditing: boolean;
  quickAdd: {
    text: string;
    onChangeText: (text: string) => void;
    onSubmit: () => void;
    busy: boolean;
  };
  amount: string;
  onChangeAmount: (text: string) => void;
  description: string;
  onChangeDescription: (text: string) => void;
  members: FlatMember[];
  userId: string | undefined;
  selectedMemberIds: string[];
  onToggleMember: (userId: string) => void;
  error: string | null;
  submitting: boolean;
  onSubmit: () => void;
  onCancelEdit: () => void;
}) {
  const isDark = useColorScheme() === 'dark';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-white dark:bg-tabby-900">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-tabby-700">
            <Pressable
              onPress={onClose}
              style={pressFeedback}
              accessibilityRole="button"
              accessibilityLabel="Back to flat overview"
            >
              <Feather name="chevron-left" size={20} color={isDark ? '#E8C39E' : '#374151'} />
            </Pressable>
            <Text className="font-fredoka-semibold text-lg dark:text-white">
              {isEditing ? 'Edit Shared Expense' : 'Split an Expense'}
            </Text>
            <View style={{ width: 20 }} />
          </View>

          <View className="p-4 gap-3">
            <View className="gap-1">
              <Text className="font-nunito-semibold text-xs text-gray-500 dark:text-tabby-300 px-0.5">
                Quick add
              </Text>
              <View className="flex-row gap-2">
                <TextInput
                  value={quickAdd.text}
                  onChangeText={quickAdd.onChangeText}
                  placeholder='Try "rent 500, power 120"'
                  placeholderTextColor={isDark ? '#8A7560' : '#B0B8C1'}
                  className="font-nunito border border-gray-200 dark:border-tabby-600 bg-white dark:bg-tabby-900 rounded-xl px-3.5 py-3 flex-1 dark:text-white"
                />
                <Pressable
                  onPress={quickAdd.onSubmit}
                  disabled={quickAdd.busy}
                  style={pressFeedback}
                  className="bg-tabby-900 dark:bg-tabby-700 rounded-xl px-4 flex-row items-center justify-center gap-1.5"
                  accessibilityRole="button"
                  accessibilityLabel="Add with AI"
                  accessibilityHint="turns your description into expenses to review before adding"
                >
                  {quickAdd.busy ? (
                    <ActivityIndicator color="white" size="small" />
                  ) : (
                    <>
                      <Feather name="zap" size={13} color="#F3E2CD" />
                      <Text className="font-nunito-bold text-tabby-100 text-sm">AI</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>

            <View className="h-px bg-gray-200 dark:bg-tabby-700" />

            <View className="flex-row gap-2">
              <View className="gap-1" style={{ width: 104 }}>
                <Text className="font-nunito-semibold text-xs text-gray-500 dark:text-tabby-300 px-0.5">
                  Amount
                </Text>
                <TextInput
                  value={amount}
                  onChangeText={onChangeAmount}
                  placeholder="$0.00"
                  placeholderTextColor={isDark ? '#8A7560' : '#B0B8C1'}
                  keyboardType="decimal-pad"
                  className="font-nunito border border-gray-200 dark:border-tabby-600 bg-white dark:bg-tabby-900 rounded-xl px-3.5 py-3 dark:text-white"
                />
              </View>
              <View className="gap-1 flex-1">
                <Text className="font-nunito-semibold text-xs text-gray-500 dark:text-tabby-300 px-0.5">
                  Description
                </Text>
                <TextInput
                  value={description}
                  onChangeText={onChangeDescription}
                  placeholder="Groceries"
                  placeholderTextColor={isDark ? '#8A7560' : '#B0B8C1'}
                  className="font-nunito border border-gray-200 dark:border-tabby-600 bg-white dark:bg-tabby-900 rounded-xl px-3.5 py-3 dark:text-white"
                />
              </View>
            </View>

            <View className="gap-1.5">
              <Text className="font-nunito-semibold text-xs text-gray-500 dark:text-tabby-300 px-0.5">
                Split with
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {members.map((m) => {
                  const selected = selectedMemberIds.includes(m.user_id);
                  const name = m.profiles?.display_name ?? 'Unknown';
                  return (
                    <Pressable
                      key={m.user_id}
                      onPress={() => onToggleMember(m.user_id)}
                      style={pressFeedback}
                      className={`flex-row items-center gap-1.5 pl-1 pr-3 py-1 rounded-full border ${
                        selected
                          ? 'bg-tabby-900 dark:bg-white border-tabby-900 dark:border-white'
                          : 'bg-white dark:bg-tabby-900 border-gray-200 dark:border-tabby-600'
                      }`}
                    >
                      <Avatar name={name} colorKey={m.user_id} unknown={!m.profiles?.display_name} size={26} />
                      <Text
                        className={`font-nunito-medium text-sm ${
                          selected ? 'text-white dark:text-tabby-900' : 'text-gray-700 dark:text-tabby-200'
                        }`}
                      >
                        {name}
                        {m.user_id === userId ? ' (you)' : ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text className="font-nunito text-gray-400 dark:text-tabby-400 text-[11px] px-0.5">
                Splits equally across {selectedMemberIds.length} selected member
                {selectedMemberIds.length === 1 ? '' : 's'}.
              </Text>
            </View>

            {error && <Text className="font-nunito text-red-500 dark:text-red-400 text-sm">{error}</Text>}

            <View className="flex-row gap-2">
              <Pressable
                onPress={onSubmit}
                disabled={submitting}
                style={pressFeedback}
                className="flex-1 bg-tabby-600 dark:bg-white rounded-xl py-3 items-center"
                accessibilityRole="button"
              >
                {submitting ? (
                  <ActivityIndicator color={isDark ? '#2B1810' : 'white'} />
                ) : (
                  <Text className="font-nunito-bold text-white dark:text-tabby-900">
                    {isEditing ? 'Save Changes' : 'Add Expense'}
                  </Text>
                )}
              </Pressable>
              {isEditing && (
                <Pressable
                  onPress={onCancelEdit}
                  style={pressFeedback}
                  className="px-4 py-3 items-center justify-center"
                  accessibilityRole="button"
                  accessibilityLabel="Cancel edit"
                >
                  <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300">Cancel</Text>
                </Pressable>
              )}
            </View>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
