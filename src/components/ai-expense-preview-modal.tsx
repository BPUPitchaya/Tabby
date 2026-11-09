import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';

import { CategoryIcon } from '@/components/category-icon';
import { categoryTint } from '@/components/category-tint';
import type { ParsedExpense } from '@/lib/ai';
import type { Category } from '@/lib/transactions';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

// The AI preview list (from quick-add text or a receipt/statement scan)
// plus its inline-editing state. A hook so the Transactions screen can
// `show` a fresh list and read `preview` back on Confirm, while the
// per-row editing state stays next to the modal that uses it.
export function useAiExpensePreview() {
  const [preview, setPreview] = useState<ParsedExpense[] | null>(null);
  // Which preview row is expanded for editing, and whether that row's
  // category picker is open. Only one row/picker open at a time, closed
  // whenever the preview list itself is replaced or dismissed.
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');

  const closeCategoryPicker = () => {
    setCategoryPickerOpen(false);
    setCategorySearch('');
  };

  // Replaces whatever was showing with a fresh list, nothing expanded.
  const show = (parsed: ParsedExpense[]) => {
    setPreview(parsed);
    setExpandedIndex(null);
    closeCategoryPicker();
  };

  const dismiss = () => {
    setPreview(null);
    setExpandedIndex(null);
    closeCategoryPicker();
  };

  // AI's first guess isn't always right, so these let the user correct the
  // amount, description, or category right in the preview before anything
  // is actually saved, instead of an all-or-nothing Confirm/Cancel.
  const updateItem = (index: number, patch: Partial<ParsedExpense>) => {
    setPreview((prev) =>
      prev ? prev.map((item, i) => (i === index ? { ...item, ...patch } : item)) : prev,
    );
  };

  const removeItem = (index: number) => {
    setPreview((prev) => {
      if (!prev) return prev;
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : null;
    });
    setExpandedIndex((prev) => (prev === index ? null : prev && prev > index ? prev - 1 : prev));
    closeCategoryPicker();
  };

  return {
    preview,
    setPreview,
    expandedIndex,
    setExpandedIndex,
    categoryPickerOpen,
    setCategoryPickerOpen,
    categorySearch,
    setCategorySearch,
    closeCategoryPicker,
    show,
    dismiss,
    updateItem,
    removeItem,
  };
}

export type AiExpensePreviewState = ReturnType<typeof useAiExpensePreview>;

function AiPreviewRow({
  item,
  index,
  state,
  categories,
  todayISO,
}: {
  item: ParsedExpense;
  index: number;
  state: AiExpensePreviewState;
  categories: Category[];
  todayISO: string;
}) {
  const isDark = useColorScheme() === 'dark';
  const {
    expandedIndex,
    setExpandedIndex,
    categoryPickerOpen,
    setCategoryPickerOpen,
    categorySearch,
    setCategorySearch,
    closeCategoryPicker,
    updateItem,
    removeItem,
  } = state;

  const isExpanded = expandedIndex === index;
  const matchedCategory = categories.find(
    (c) => c.name === item.categoryName && c.type === (item.isIncome ? 'income' : 'expense'),
  );
  const tint = categoryTint(matchedCategory?.id ?? null, isDark);
  const filteredCategories = categories.filter(
    (c) =>
      c.type === (item.isIncome ? 'income' : 'expense') &&
      c.name.toLowerCase().includes(categorySearch.toLowerCase()),
  );

  return (
    <View className="gap-1.5">
      {/* Collapsed row, same look as the Activity list's
          TransactionRow, so the preview reads like the
          transactions it's about to become. Tap to edit
          instead of every field sitting open at once. */}
      <Pressable
        onPress={() => {
          setExpandedIndex(isExpanded ? null : index);
          closeCategoryPicker();
        }}
        style={pressFeedback}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${item.description || 'transaction'}`}
        className="flex-row items-center justify-between rounded-2xl px-4 py-3 bg-gray-50 dark:bg-tabby-800 border border-gray-100 dark:border-tabby-700"
      >
        <View className="flex-row items-center flex-1 gap-3">
          <View
            className="w-9 h-9 rounded-full items-center justify-center"
            style={{ backgroundColor: item.isIncome ? (isDark ? '#1F3B2A' : '#DCFCE7') : tint.bg }}
          >
            <CategoryIcon
              name={matchedCategory?.icon}
              size={16}
              color={item.isIncome ? '#15803d' : tint.fg}
            />
          </View>
          <View className="flex-1">
            <Text className="font-nunito-semibold dark:text-white" numberOfLines={1}>
              {item.description || 'Transaction'}
            </Text>
            <Text
              className="font-nunito text-gray-500 dark:text-tabby-300 text-sm"
              numberOfLines={1}
            >
              {item.categoryName ?? 'Uncategorized'}
              {item.merchant ? ` · ${item.merchant}` : ''}
              {item.occurredAt !== todayISO
                ? ` · ${new Date(`${item.occurredAt}T00:00:00`).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}`
                : ''}
            </Text>
          </View>
        </View>
        <Text
          className={`font-nunito-bold mr-2 ${
            item.isIncome ? 'text-green-700 dark:text-green-400' : 'dark:text-white'
          }`}
        >
          {item.isIncome ? '+' : '-'}${item.amount.toFixed(2)}
        </Text>
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            removeItem(index);
          }}
          style={pressFeedback}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${item.description}`}
          accessibilityHint="drops this item from the list to be added"
          className="mr-1"
        >
          <Feather name="x" size={16} color="#9ca3af" />
        </Pressable>
        <Feather
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={isDark ? '#E8C39E' : '#9ca3af'}
        />
      </Pressable>

      {isExpanded && (
        <View className="gap-2 px-4 py-3 rounded-2xl bg-gray-50 dark:bg-tabby-800 border border-gray-100 dark:border-tabby-700">
          <View className="flex-row items-center gap-2">
            <TextInput
              value={item.description}
              onChangeText={(text) => updateItem(index, { description: text })}
              placeholder="Description"
              className="font-nunito flex-1 border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2 text-sm dark:text-white"
            />
            <View className="flex-row items-center border border-gray-300 dark:border-tabby-600 rounded-lg px-2">
              <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">$</Text>
              <TextInput
                value={String(item.amount)}
                onChangeText={(text) =>
                  updateItem(index, { amount: parseFloat(text) || 0 })
                }
                keyboardType="decimal-pad"
                className="font-nunito w-16 py-2 text-sm text-right dark:text-white"
              />
            </View>
          </View>

          {/* The AI's expense/income guess, same as
              everything else in this preview: wrong often
              enough (any "got paid", "refund", "sold
              my...") that it needs to be correctable, not
              just displayed. */}
          <View className="flex-row bg-gray-100 dark:bg-tabby-700 rounded-lg p-1 self-start">
            <Pressable
              onPress={() => {
                updateItem(index, { isIncome: false, categoryName: null });
                closeCategoryPicker();
              }}
              style={pressFeedback}
              className={`rounded-md px-3 py-1 ${!item.isIncome ? 'bg-white dark:bg-tabby-900' : ''}`}
            >
              <Text
                className={`font-nunito-semibold text-xs ${
                  !item.isIncome
                    ? 'text-gray-900 dark:text-white'
                    : 'text-gray-500 dark:text-tabby-300'
                }`}
              >
                Expense
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                updateItem(index, { isIncome: true, categoryName: null });
                closeCategoryPicker();
              }}
              style={pressFeedback}
              className={`rounded-md px-3 py-1 ${item.isIncome ? 'bg-white dark:bg-tabby-900' : ''}`}
            >
              <Text
                className={`font-nunito-semibold text-xs ${
                  item.isIncome
                    ? 'text-green-700 dark:text-green-400'
                    : 'text-gray-500 dark:text-tabby-300'
                }`}
              >
                Income
              </Text>
            </Pressable>
          </View>

          <Pressable
            onPress={() => setCategoryPickerOpen((open) => !open)}
            style={pressFeedback}
            accessibilityRole="button"
            accessibilityLabel="Category"
            className="flex-row items-center justify-between border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2.5"
          >
            <View className="flex-row items-center gap-2">
              {matchedCategory && (
                <CategoryIcon
                  name={matchedCategory.icon}
                  size={14}
                  color={isDark ? '#E8C39E' : '#4b5563'}
                />
              )}
              <Text className="font-nunito text-gray-800 dark:text-white text-sm">
                {item.categoryName ?? 'Uncategorized'}
              </Text>
            </View>
            <Feather
              name="chevron-down"
              size={16}
              color={isDark ? '#E8C39E' : '#9ca3af'}
            />
          </Pressable>

          {categoryPickerOpen && (
            <View className="border border-gray-300 dark:border-tabby-600 rounded-lg p-2 gap-2">
              <TextInput
                value={categorySearch}
                onChangeText={setCategorySearch}
                placeholder="Search categories"
                autoFocus
                className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2 text-sm dark:text-white"
              />
              <View className="gap-0.5">
                {filteredCategories.length === 0 && (
                  <Text className="font-nunito text-sm text-gray-500 dark:text-tabby-300 px-1 py-2">
                    No categories match.
                  </Text>
                )}
                {filteredCategories.map((cat) => (
                  <Pressable
                    key={cat.id}
                    onPress={() => {
                      updateItem(index, {
                        categoryName: item.categoryName === cat.name ? null : cat.name,
                      });
                      closeCategoryPicker();
                    }}
                    style={pressFeedback}
                    className="flex-row items-center gap-2.5 px-2 py-2 rounded-lg"
                  >
                    <CategoryIcon
                      name={cat.icon}
                      size={15}
                      color={
                        cat.name === item.categoryName
                          ? isDark
                            ? '#E8C39E'
                            : '#8B5A2B'
                          : isDark
                            ? '#E8C39E'
                            : '#4b5563'
                      }
                    />
                    <Text
                      className={`font-nunito-medium text-sm flex-1 ${
                        cat.name === item.categoryName
                          ? 'text-tabby-600 dark:text-tabby-100'
                          : 'text-gray-700 dark:text-tabby-200'
                      }`}
                    >
                      {cat.name}
                    </Text>
                    {cat.name === item.categoryName && (
                      <Feather name="check" size={16} color={isDark ? '#E8C39E' : '#8B5A2B'} />
                    )}
                  </Pressable>
                ))}
              </View>
              <Pressable
                onPress={closeCategoryPicker}
                style={pressFeedback}
                accessibilityRole="button"
                accessibilityLabel="Done"
                className="self-end px-3 py-1.5"
              >
                <Text className="font-nunito-semibold text-tabby-600 dark:text-white">Done</Text>
              </Pressable>
            </View>
          )}

          <Pressable
            onPress={() => setExpandedIndex(null)}
            style={pressFeedback}
            accessibilityRole="button"
            accessibilityLabel="Done editing"
            className="self-end px-3 py-1.5"
          >
            <Text className="font-nunito-semibold text-tabby-600 dark:text-white">Done</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// Review sheet for AI-extracted transactions: each row collapsed by
// default, tap to correct it, then Confirm adds them all at once.
export function AiExpensePreviewModal({
  state,
  categories,
  todayISO,
  importing,
  onConfirm,
}: {
  state: AiExpensePreviewState;
  categories: Category[];
  todayISO: string;
  importing: boolean;
  onConfirm: () => void;
}) {
  const isDark = useColorScheme() === 'dark';
  const { preview, dismiss } = state;

  return (
    <Modal visible={preview !== null} animationType="slide" transparent>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-white dark:bg-tabby-900 rounded-t-2xl p-4 gap-3 h-[85%]">
            <View>
              <Text className="font-fredoka-semibold text-xl dark:text-white">
                Add {preview?.length ?? 0} transaction{preview?.length === 1 ? '' : 's'}?
              </Text>
              <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
                AI&apos;s first guess. Tap anything below to fix it before adding.
              </Text>
            </View>

            <FlatList
              data={preview ?? []}
              keyExtractor={(_, i) => String(i)}
              style={{ flex: 1 }}
              contentContainerStyle={{ gap: 10 }}
              renderItem={({ item, index }) => (
                <AiPreviewRow
                  item={item}
                  index={index}
                  state={state}
                  categories={categories}
                  todayISO={todayISO}
                />
              )}
            />

            <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
              Net:{' '}
              {(preview?.reduce((sum, t) => sum + (t.isIncome ? t.amount : -t.amount), 0) ?? 0) < 0
                ? '-'
                : '+'}
              $
              {Math.abs(
                preview?.reduce((sum, t) => sum + (t.isIncome ? t.amount : -t.amount), 0) ?? 0,
              ).toFixed(2)}
            </Text>

            <View className="flex-row gap-2 pt-1">
              <Pressable
                onPress={onConfirm}
                disabled={importing || !preview?.every((p) => p.amount > 0)}
                style={pressFeedback}
                className={`flex-1 rounded-lg py-3 items-center ${
                  preview?.every((p) => p.amount > 0)
                    ? 'bg-tabby-600 dark:bg-white'
                    : 'bg-gray-300 dark:bg-tabby-700'
                }`}
                accessibilityRole="button"
                accessibilityLabel="Confirm add"
              >
                {importing ? (
                  <ActivityIndicator color={isDark ? '#2B1810' : 'white'} />
                ) : (
                  <Text
                    className={`font-nunito-semibold text-white ${
                      preview?.every((p) => p.amount > 0) ? 'dark:text-tabby-900' : ''
                    }`}
                  >
                    Confirm
                  </Text>
                )}
              </Pressable>
              <Pressable
                onPress={dismiss}
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
      </KeyboardAvoidingView>
    </Modal>
  );
}
