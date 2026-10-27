import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, Text, TextInput, useColorScheme, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import type { PendingEdit } from '@/lib/quick-add-commands';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

// The chat-style composer pinned to the bottom of the Transactions screen
// -- type a sentence, AI extracts one or more expenses from it (or answers
// a question, or proposes an edit) -- plus the status/answer/confirm
// strips that sit directly above it. Purely presentational: all the
// AI routing lives in the screen's handleQuickAdd.
export function QuickAddComposer({
  text,
  onChangeText,
  onSend,
  onScan,
  aiBusy,
  thinking,
  answer,
  pendingEdit,
  applyingEdit,
  onCancelEdit,
  onConfirmEdit,
}: {
  text: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onScan: () => void;
  aiBusy: boolean;
  // Only true for the composer's own calls (quick-add text, receipt/
  // statement scan) -- see the screen's composerThinking state.
  thinking: boolean;
  answer: string | null;
  pendingEdit: PendingEdit | null;
  applyingEdit: boolean;
  onCancelEdit: () => void;
  onConfirmEdit: () => void;
}) {
  const isDark = useColorScheme() === 'dark';

  return (
    <>
      {thinking && (
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(150)}
          className="flex-row items-center gap-2 px-4 py-2 border-t border-gray-100 dark:border-tabby-700 bg-tabby-50 dark:bg-tabby-800"
        >
          <ActivityIndicator size="small" color={isDark ? '#E8C39E' : '#8B5A2B'} />
          <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">
            Reading that -- usually just a few seconds
          </Text>
        </Animated.View>
      )}

      {!thinking && answer && (
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(150)}
          className="flex-row items-start gap-2 px-4 py-2.5 border-t border-gray-100 dark:border-tabby-700 bg-sage-50 dark:bg-sage-900/40"
        >
          <Feather
            name="message-circle"
            size={14}
            color={isDark ? '#86BD63' : '#4C7535'}
            style={{ marginTop: 1 }}
          />
          <Text className="font-nunito text-xs text-sage-800 dark:text-sage-300 flex-1">{answer}</Text>
        </Animated.View>
      )}

      {pendingEdit && (
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(150)}
          className="px-4 py-3 border-t border-gray-100 dark:border-tabby-700 bg-tabby-50 dark:bg-tabby-800 gap-2.5"
        >
          <View className="flex-row items-center gap-2">
            <Feather name="edit-3" size={14} color={isDark ? '#E8C39E' : '#8B5A2B'} />
            <Text className="font-nunito-semibold text-sm text-tabby-700 dark:text-tabby-100">
              {pendingEdit.title}
            </Text>
          </View>
          <View className="flex-row items-center gap-2 px-1">
            <Text className="font-nunito text-sm text-gray-500 dark:text-tabby-300">
              {pendingEdit.oldLabel}
            </Text>
            <Feather name="arrow-right" size={14} color={isDark ? '#6B4420' : '#9ca3af'} />
            <Text className="font-nunito-bold text-sm text-tabby-700 dark:text-white">
              {pendingEdit.newLabel}
            </Text>
          </View>
          {pendingEdit.warning && (
            <View className="flex-row items-start gap-1.5 px-1">
              <Feather
                name="alert-triangle"
                size={12}
                color={isDark ? '#E1AC93' : '#8E3F2C'}
                style={{ marginTop: 1 }}
              />
              <Text className="font-nunito text-xs text-rust-700 dark:text-rust-300 flex-1">
                {pendingEdit.warning}
              </Text>
            </View>
          )}
          <View className="flex-row gap-2">
            <Pressable
              onPress={onCancelEdit}
              disabled={applyingEdit}
              style={pressFeedback}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              className="flex-1 py-2 items-center rounded-lg border border-gray-300 dark:border-tabby-600"
            >
              <Text className="font-nunito-semibold text-sm text-gray-600 dark:text-tabby-200">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onConfirmEdit}
              disabled={applyingEdit}
              style={pressFeedback}
              accessibilityRole="button"
              accessibilityLabel="Confirm"
              className="flex-1 py-2 items-center rounded-lg bg-tabby-600 dark:bg-white"
            >
              {applyingEdit ? (
                <ActivityIndicator size="small" color={isDark ? '#2B1810' : 'white'} />
              ) : (
                <Text className="font-nunito-semibold text-sm text-white dark:text-tabby-900">Confirm</Text>
              )}
            </Pressable>
          </View>
        </Animated.View>
      )}

      {/* Chat-style composer, pinned to the bottom of the screen. */}
      <View className="flex-row items-end gap-2 px-3 py-2.5 border-t border-gray-100 dark:border-tabby-700 bg-white dark:bg-tabby-900">
        <Pressable
          onPress={onScan}
          disabled={aiBusy}
          style={pressFeedback}
          accessibilityRole="button"
          accessibilityLabel="Scan a receipt or statement"
          accessibilityHint="reads transactions from a photo or PDF for you to review before adding"
          className="w-10 h-10 rounded-full items-center justify-center bg-gray-100 dark:bg-tabby-700"
        >
          <Feather name="camera" size={18} color={isDark ? '#E8C39E' : '#4b5563'} />
        </Pressable>
        <TextInput
          value={text}
          onChangeText={onChangeText}
          placeholder='Try "coffee $8.50" or "how much on coffee last month?"'
          multiline
          className="font-nunito flex-1 bg-gray-100 dark:bg-tabby-700 rounded-2xl px-4 py-2.5 max-h-28 text-base dark:text-white"
        />
        <Pressable
          onPress={onSend}
          disabled={aiBusy || !text.trim()}
          style={pressFeedback}
          accessibilityRole="button"
          accessibilityLabel="Send"
          accessibilityHint="turns your message into transactions to review, or answers your question"
          className={`w-10 h-10 rounded-full items-center justify-center ${
            text.trim() ? 'bg-tabby-600 dark:bg-white' : 'bg-gray-200 dark:bg-tabby-700'
          }`}
        >
          {aiBusy ? (
            <ActivityIndicator color={isDark ? '#2B1810' : 'white'} size="small" />
          ) : (
            <Feather
              name="arrow-up"
              size={18}
              color={text.trim() ? (isDark ? '#2B1810' : '#fff') : '#9ca3af'}
            />
          )}
        </Pressable>
      </View>
    </>
  );
}
