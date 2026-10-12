import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { categorizeTransaction, parseNaturalLanguageExpenses, type ParsedExpense } from '@/lib/ai';
import { CategoryIcon } from '@/components/category-icon';
import { useAuth } from '@/lib/auth-context';
import { parseTransactionsFromCSV, type ParsedCSVTransaction } from '@/lib/csv';
import {
  addTransaction,
  bulkAddTransactions,
  deleteTransaction,
  fetchCategories,
  fetchRecentMerchants,
  fetchTransactions,
  updateTransaction,
  type Category,
  type CategoryType,
  type Transaction,
} from '@/lib/transactions';

// Shared press-feedback style: a quick opacity dip on tap, applied via the
// style prop (not className) since it needs the live `pressed` state.
const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

// The Expense/Income toggle's selected-pill shadow, as a plain native
// style instead of NativeWind's `shadow-sm` class. A conditionally-applied
// `shadow-*` className hits a known race in NativeWind's CSS interop layer
// that throws "Couldn't find a navigation context" the first time the
// class is added (nativewind/nativewind#1536) -- native shadow props
// sidestep that code path entirely.
const SEGMENT_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.08,
  shadowRadius: 2,
  elevation: 1,
};

// Local calendar date, not UTC -- Date#toISOString() converts to UTC first,
// which can shift the date by a day in timezones behind/ahead of it (same
// footgun the toISODate helper in lib/profile.ts exists to avoid).
function toLocalISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Small round icon button used in the header -- Feather icon only, no label,
// consistent 40x40 tap target.
function HeaderIconButton({
  icon,
  onPress,
  label,
  tone = 'default',
}: {
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  label: string;
  tone?: 'default' | 'primary';
}) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  // The primary button's background flips brown<->white between light and
  // dark mode (see tailwind.config.js's `tabby` scale), so its icon has to
  // flip the opposite way or it disappears against its own background.
  const iconColor =
    tone === 'primary' ? (isDark ? '#2B1810' : '#fff') : isDark ? '#E8C39E' : '#374151';

  return (
    <Pressable
      onPress={onPress}
      style={pressFeedback}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`w-10 h-10 rounded-full items-center justify-center ${
        tone === 'primary' ? 'bg-tabby-600 dark:bg-white' : 'bg-gray-100 dark:bg-tabby-700'
      }`}>
      <Feather name={icon} size={18} color={iconColor} />
    </Pressable>
  );
}

export default function TransactionsScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const isDark = useColorScheme() === 'dark';
  // Only used to decide whether the AI preview's date caption is worth
  // showing -- "Jul 10" matters, today's own date repeated on every row
  // doesn't.
  const todayISO = new Date().toISOString().slice(0, 10);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Manual add/edit now lives in its own bottom-sheet modal, triggered by
  // the "+" button or by tapping an existing transaction -- rather than a
  // permanently-visible form taking up the top of the screen.
  const [manualOpen, setManualOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [merchant, setMerchant] = useState('');
  const [recentMerchants, setRecentMerchants] = useState<string[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [transactionType, setTransactionType] = useState<CategoryType>('expense');
  const [occurredAt, setOccurredAt] = useState(todayISO);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [categorySource, setCategorySource] = useState<'manual' | 'ai' | null>(null);

  // The chat-style composer pinned to the bottom of the screen -- type a
  // sentence, AI extracts one or more expenses from it.
  const [quickAddText, setQuickAddText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  const [csvPreview, setCsvPreview] = useState<ParsedCSVTransaction[] | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);

  const [aiPreview, setAiPreview] = useState<ParsedExpense[] | null>(null);
  const [aiImporting, setAiImporting] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setError(null);
      const [tx, expenseCats, incomeCats, merchants] = await Promise.all([
        fetchTransactions(userId),
        fetchCategories('expense'),
        fetchCategories('income'),
        fetchRecentMerchants(userId),
      ]);
      const cats = [...expenseCats, ...incomeCats];
      setTransactions(tx);
      setCategories(cats);
      setRecentMerchants(merchants);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transactions.');
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

  const resetForm = () => {
    setAmount('');
    setDescription('');
    setMerchant('');
    setCategoryId(null);
    setCategorySource(null);
    setEditingId(null);
    setTransactionType('expense');
    setOccurredAt(todayISO);
  };

  const openManualAdd = () => {
    resetForm();
    setError(null);
    setManualOpen(true);
  };

  const closeManualForm = () => {
    setManualOpen(false);
    resetForm();
  };

  const handleSelectType = (type: CategoryType) => {
    setTransactionType(type);
    // a category chosen under the old type won't be valid for the new one
    setCategoryId(null);
    setCategorySource(null);
  };

  const handleDescriptionBlur = async () => {
    // Only auto-suggest if the user hasn't picked (or we haven't already
    // AI-suggested) a category -- never override a manual choice.
    if (!description.trim() || categorySource === 'manual' || categories.length === 0) return;

    setAiBusy(true);
    try {
      const suggestedId = await categorizeTransaction(description, categories);
      if (suggestedId) {
        setCategoryId(suggestedId);
        setCategorySource('ai');
      }
    } finally {
      setAiBusy(false);
    }
  };

  const handleQuickAdd = async () => {
    if (!quickAddText.trim()) return;
    setAiBusy(true);
    setError(null);
    try {
      const parsed = await parseNaturalLanguageExpenses(quickAddText, categories);
      if (!parsed) {
        setError('AI is briefly unavailable -- try again in a moment, or use the + button below.');
        return;
      }
      setAiPreview(parsed);
    } finally {
      setAiBusy(false);
    }
  };

  const handleConfirmAIAdd = async () => {
    if (!userId || !aiPreview) return;
    setAiImporting(true);
    try {
      await bulkAddTransactions(
        userId,
        aiPreview.map((p) => ({
          amount: p.amount,
          description: p.description,
          merchant: p.merchant,
          occurredAt: p.occurredAt,
          isIncome: p.isIncome,
          // Matched by type too, not just name -- an expense and income
          // category could share a name, and only one of them is valid
          // for this row (same rule the manual Expense/Income toggle uses).
          categoryId:
            categories.find((c) => c.name === p.categoryName && c.type === (p.isIncome ? 'income' : 'expense'))
              ?.id ?? null,
        }))
      );
      setAiPreview(null);
      setQuickAddText('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add transactions.');
    } finally {
      setAiImporting(false);
    }
  };

  // AI's first guess isn't always right -- these let the user correct the
  // amount, description, or category right in the preview before anything
  // is actually saved, instead of an all-or-nothing Confirm/Cancel.
  const updateAiPreviewItem = (index: number, patch: Partial<ParsedExpense>) => {
    setAiPreview((prev) => (prev ? prev.map((item, i) => (i === index ? { ...item, ...patch } : item)) : prev));
  };

  const removeAiPreviewItem = (index: number) => {
    setAiPreview((prev) => {
      if (!prev) return prev;
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : null;
    });
  };

  const handlePickCSV = async () => {
    setError(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', '.csv'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0]) return;

    try {
      const file = new File(result.assets[0].uri);
      const text = await file.text();
      const parsed = parseTransactionsFromCSV(text);
      if (parsed.length === 0) {
        setError(
          "Couldn't find any transactions in that file -- make sure it has a header row with a Date and Amount column."
        );
        return;
      }
      setCsvPreview(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read that file.');
    }
  };

  const handleConfirmCSVImport = async () => {
    if (!userId || !csvPreview) return;
    setCsvImporting(true);
    try {
      await bulkAddTransactions(userId, csvPreview);
      setCsvPreview(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import transactions.');
    } finally {
      setCsvImporting(false);
    }
  };

  const handleStartEdit = (item: Transaction) => {
    setEditingId(item.id);
    setAmount(String(item.amount));
    setDescription(item.description ?? '');
    setMerchant(item.merchant ?? '');
    setCategoryId(item.category_id);
    setCategorySource(item.category_id ? 'manual' : null);
    setTransactionType(item.is_income ? 'income' : 'expense');
    setOccurredAt(item.occurred_at);
    setError(null);
    setManualOpen(true);
  };

  const handleSubmit = async () => {
    if (!userId) return;
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Enter a valid amount.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const isIncome = transactionType === 'income';
      if (editingId) {
        await updateTransaction(editingId, {
          amount: parsedAmount,
          description,
          merchant,
          categoryId,
          occurredAt,
          isIncome,
        });
      } else {
        await addTransaction({
          userId,
          amount: parsedAmount,
          description,
          merchant,
          categoryId,
          occurredAt,
          isIncome,
        });
      }
      setManualOpen(false);
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save transaction.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTransaction(id);
      setTransactions((prev) => prev.filter((t) => t.id !== id));
      if (editingId === id) closeManualForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete transaction.');
    }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white dark:bg-tabby-900">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-tabby-900">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
        <View className="flex-row items-center justify-between px-4 pt-3 pb-3 border-b border-gray-100 dark:border-tabby-700">
          <Text className="font-fredoka-semibold text-2xl dark:text-white">Transactions</Text>
          <View className="flex-row gap-2">
            <HeaderIconButton icon="upload" onPress={handlePickCSV} label="Import CSV" />
            <HeaderIconButton icon="plus" onPress={openManualAdd} label="Add transaction" tone="primary" />
          </View>
        </View>

        {error && (
          <View className="px-4 py-2 bg-red-50 dark:bg-red-950 border-b border-red-100 dark:border-red-800">
            <Text className="font-nunito text-red-600 dark:text-red-400 text-sm">{error}</Text>
          </View>
        )}

        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ padding: 16, gap: 8, flexGrow: 1 }}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center gap-3 py-16">
              <View className="w-14 h-14 rounded-full bg-gray-100 dark:bg-tabby-700 items-center justify-center">
                <Feather name="file-text" size={22} color="#9ca3af" />
              </View>
              <Text className="font-nunito text-center text-gray-500 dark:text-tabby-300">
                No transactions yet.{'\n'}Type one below, or tap + to add one manually.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Animated.View entering={FadeIn.duration(200)}>
              <Pressable
                onPress={() => handleStartEdit(item)}
                style={pressFeedback}
                accessibilityRole="button"
                accessibilityLabel={`Edit transaction ${item.description ?? ''}`}
                className="flex-row items-center justify-between rounded-2xl px-4 py-3 bg-gray-50 dark:bg-tabby-800 border border-gray-100 dark:border-tabby-700">
                <View className="flex-row items-center flex-1 gap-3">
                  <View
                    className={`w-9 h-9 rounded-full border items-center justify-center ${
                      item.is_income ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800' : 'bg-white dark:bg-tabby-900 border-gray-200 dark:border-tabby-700'
                    }`}>
                    <CategoryIcon
                      name={item.categories?.icon}
                      size={16}
                      color={item.is_income ? '#15803d' : undefined}
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="font-nunito-semibold dark:text-white">
                      {item.description || item.categories?.name || 'Transaction'}
                    </Text>
                    <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
                      {item.categories?.name ?? 'Uncategorized'}
                      {item.merchant ? ` · ${item.merchant}` : ''} · {item.occurred_at}
                    </Text>
                  </View>
                </View>
                <Text
                  className={`font-nunito-bold mr-3 ${
                    item.is_income ? 'text-green-700 dark:text-green-400' : 'dark:text-white'
                  }`}>
                  {item.is_income ? '+' : '-'}${item.amount.toFixed(2)}
                </Text>
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    handleDelete(item.id);
                  }}
                  style={pressFeedback}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete transaction ${item.description ?? ''}`}>
                  <Feather name="trash-2" size={16} color="#ef4444" />
                </Pressable>
              </Pressable>
            </Animated.View>
          )}
        />

        {/* Chat-style composer, pinned to the bottom of the screen. */}
        <View className="flex-row items-end gap-2 px-3 py-2.5 border-t border-gray-100 dark:border-tabby-700 bg-white dark:bg-tabby-900">
          <TextInput
            value={quickAddText}
            onChangeText={setQuickAddText}
            placeholder='Try "coffee $8.50, lunch $12.50"'
            multiline
            className="font-nunito flex-1 bg-gray-100 dark:bg-tabby-700 rounded-2xl px-4 py-2.5 max-h-28 text-base dark:text-white"
          />
          <Pressable
            onPress={handleQuickAdd}
            disabled={aiBusy || !quickAddText.trim()}
            style={pressFeedback}
            accessibilityRole="button"
            accessibilityLabel="Send"
            className={`w-10 h-10 rounded-full items-center justify-center ${
              quickAddText.trim() ? 'bg-tabby-600 dark:bg-white' : 'bg-gray-200 dark:bg-tabby-700'
            }`}>
            {aiBusy ? (
              <ActivityIndicator color={isDark ? '#2B1810' : 'white'} size="small" />
            ) : (
              <Feather
                name="arrow-up"
                size={18}
                color={quickAddText.trim() ? (isDark ? '#2B1810' : '#fff') : '#9ca3af'}
              />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Manual add/edit -- opened via the + button or by tapping a transaction. */}
      <Modal visible={manualOpen} animationType="slide" transparent onRequestClose={closeManualForm}>
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View className="flex-1 bg-black/40 justify-end">
            <View className="bg-white dark:bg-tabby-900 rounded-t-2xl p-4 gap-3">
              <View className="flex-row items-center justify-between">
                <Text className="font-fredoka-semibold text-xl dark:text-white">
                  {editingId ? 'Edit Transaction' : 'Add Transaction'}
                </Text>
                <Pressable
                  onPress={closeManualForm}
                  style={pressFeedback}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  className="w-8 h-8 rounded-full bg-gray-100 dark:bg-tabby-700 items-center justify-center">
                  <Feather name="x" size={16} color={isDark ? '#E8C39E' : '#374151'} />
                </Pressable>
              </View>

              <View className="flex-row bg-gray-100 dark:bg-tabby-700 rounded-lg p-1">
                <Pressable
                  onPress={() => handleSelectType('expense')}
                  style={(state) => [pressFeedback(state), transactionType === 'expense' && SEGMENT_SHADOW]}
                  accessibilityRole="button"
                  accessibilityLabel="Expense"
                  className={`flex-1 rounded-md py-1.5 items-center ${
                    transactionType === 'expense' ? 'bg-white dark:bg-tabby-900' : ''
                  }`}>
                  <Text
                    className={`font-nunito-semibold text-sm ${
                      transactionType === 'expense' ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-tabby-300'
                    }`}>
                    Expense
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => handleSelectType('income')}
                  style={(state) => [pressFeedback(state), transactionType === 'income' && SEGMENT_SHADOW]}
                  accessibilityRole="button"
                  accessibilityLabel="Income"
                  className={`flex-1 rounded-md py-1.5 items-center ${
                    transactionType === 'income' ? 'bg-white dark:bg-tabby-900' : ''
                  }`}>
                  <Text
                    className={`font-nunito-semibold text-sm ${
                      transactionType === 'income' ? 'text-green-700 dark:text-green-400' : 'text-gray-500 dark:text-tabby-300'
                    }`}>
                    Income
                  </Text>
                </Pressable>
              </View>

              <View className="flex-row gap-2">
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="Amount"
                  keyboardType="decimal-pad"
                  className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2 flex-1 dark:text-white"
                />
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  onBlur={handleDescriptionBlur}
                  placeholder="Description"
                  className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2 flex-[2] dark:text-white"
                />
              </View>

              <TextInput
                value={merchant}
                onChangeText={setMerchant}
                placeholder="Where? (e.g. Pak'nSave) -- optional"
                className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2 dark:text-white"
              />

              <Pressable
                onPress={() => setShowDatePicker(true)}
                style={pressFeedback}
                accessibilityRole="button"
                accessibilityLabel="Date"
                className="flex-row items-center justify-between border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2.5">
                <Text className="font-nunito text-gray-800 dark:text-white text-sm">
                  {occurredAt === todayISO
                    ? 'Today'
                    : new Date(`${occurredAt}T00:00:00`).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                </Text>
                <Feather name="calendar" size={16} color={isDark ? '#E8C39E' : '#9ca3af'} />
              </Pressable>

              {Platform.OS === 'ios' && showDatePicker && (
                <View className="border border-gray-300 dark:border-tabby-600 rounded-lg p-2 gap-2">
                  <DateTimePicker
                    value={new Date(`${occurredAt}T00:00:00`)}
                    mode="date"
                    display="inline"
                    maximumDate={new Date()}
                    themeVariant={isDark ? 'dark' : 'light'}
                    onValueChange={(_, date) => setOccurredAt(toLocalISODate(date))}
                  />
                  <Pressable
                    onPress={() => setShowDatePicker(false)}
                    style={pressFeedback}
                    accessibilityRole="button"
                    accessibilityLabel="Done"
                    className="self-end px-3 py-1.5">
                    <Text className="font-nunito-semibold text-tabby-600 dark:text-white">Done</Text>
                  </Pressable>
                </View>
              )}

              {recentMerchants.length > 0 && (
                <View className="flex-row flex-wrap gap-2">
                  {recentMerchants.map((m) => (
                    <Pressable
                      key={m}
                      onPress={() => setMerchant(m === merchant ? '' : m)}
                      style={pressFeedback}
                      className={`px-3 py-1 rounded-full border ${
                        merchant === m ? 'bg-gray-800 dark:bg-tabby-700 border-gray-800 dark:border-tabby-700' : 'border-gray-300 dark:border-tabby-600'
                      }`}>
                      <Text
                        className={`font-nunito ${merchant === m ? 'text-white text-xs' : 'text-gray-600 dark:text-tabby-200 text-xs'}`}>
                        {m}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <View className="flex-row flex-wrap gap-2 items-center">
                {categories
                  .filter((cat) => cat.type === transactionType)
                  .map((cat) => (
                    <Pressable
                      key={cat.id}
                      onPress={() => {
                        setCategoryId(cat.id === categoryId ? null : cat.id);
                        setCategorySource(cat.id === categoryId ? null : 'manual');
                      }}
                      style={pressFeedback}
                      className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border ${
                        categoryId === cat.id ? 'bg-tabby-600 dark:bg-white border-tabby-600 dark:border-white' : 'border-gray-300 dark:border-tabby-600'
                      }`}>
                      <CategoryIcon
                        name={cat.icon}
                        size={13}
                        color={
                          categoryId === cat.id ? (isDark ? '#2B1810' : '#fff') : isDark ? '#E8C39E' : '#4b5563'
                        }
                      />
                      <Text
                        className={`font-nunito-medium ${
                          categoryId === cat.id
                            ? 'text-white dark:text-tabby-900 text-sm'
                            : 'text-gray-700 dark:text-tabby-200 text-sm'
                        }`}>
                        {cat.name}
                      </Text>
                    </Pressable>
                  ))}
                {categorySource === 'ai' && (
                  <Text className="font-nunito text-xs text-tabby-500 dark:text-tabby-200">AI suggested</Text>
                )}
              </View>

              <View className="flex-row gap-2 pt-1">
                <Pressable
                  onPress={handleSubmit}
                  disabled={submitting}
                  style={pressFeedback}
                  className="flex-1 bg-tabby-600 dark:bg-white rounded-lg py-3 items-center"
                  accessibilityRole="button"
                  accessibilityLabel={editingId ? 'Save changes' : 'Add transaction'}>
                  {submitting ? (
                    <ActivityIndicator color={isDark ? '#2B1810' : 'white'} />
                  ) : (
                    <Text className="font-nunito-semibold text-white dark:text-tabby-900">
                      {editingId ? 'Save Changes' : 'Add Transaction'}
                    </Text>
                  )}
                </Pressable>

                {editingId && (
                  <Pressable
                    onPress={() => {
                      handleDelete(editingId);
                    }}
                    style={pressFeedback}
                    className="px-4 py-3 items-center justify-center rounded-lg bg-red-50 dark:bg-red-950"
                    accessibilityRole="button"
                    accessibilityLabel="Delete transaction">
                    <Feather name="trash-2" size={18} color="#ef4444" />
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Android shows its own native dialog with no wrapper needed --
          rendering the picker at all is what triggers it, and it unmounts
          itself via onValueChange/onDismiss below. iOS's picker renders
          inline inside the manual-add sheet above instead of a second
          Modal -- stacking two RN Modals on iOS silently fails to present
          the top one. */}
      {showDatePicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={new Date(`${occurredAt}T00:00:00`)}
          mode="date"
          display="default"
          maximumDate={new Date()}
          onValueChange={(_, date) => {
            setShowDatePicker(false);
            setOccurredAt(toLocalISODate(date));
          }}
          onDismiss={() => setShowDatePicker(false)}
        />
      )}

      <Modal visible={csvPreview !== null} animationType="slide" transparent>
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-white dark:bg-tabby-900 rounded-t-2xl p-4 gap-3 max-h-[80%]">
            <Text className="font-fredoka-semibold text-xl dark:text-white">
              Import {csvPreview?.length ?? 0} transaction{csvPreview?.length === 1 ? '' : 's'}?
            </Text>
            <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
              Net: $
              {csvPreview
                ?.reduce((sum, t) => sum + (t.isIncome ? t.amount : -t.amount), 0)
                .toFixed(2) ?? '0.00'}
              . All imported as Uncategorized -- edit them afterwards to assign categories.
            </Text>

            <FlatList
              data={csvPreview ?? []}
              keyExtractor={(_, i) => String(i)}
              style={{ maxHeight: 300 }}
              renderItem={({ item }) => (
                <View className="flex-row justify-between py-2 border-b border-gray-100 dark:border-tabby-700">
                  <View className="flex-1">
                    <Text className="font-nunito text-sm dark:text-tabby-200">{item.description || '(no description)'}</Text>
                    <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">
                      {item.isIncome ? 'Income' : 'Expense'} · {item.occurredAt}
                    </Text>
                  </View>
                  <Text
                    className={`font-nunito-semibold text-sm ${
                      item.isIncome ? 'text-green-700 dark:text-green-400' : 'dark:text-white'
                    }`}>
                    {item.isIncome ? '+' : '-'}${item.amount.toFixed(2)}
                  </Text>
                </View>
              )}
            />

            <View className="flex-row gap-2 pt-2">
              <Pressable
                onPress={handleConfirmCSVImport}
                disabled={csvImporting}
                style={pressFeedback}
                className="flex-1 bg-tabby-600 dark:bg-white rounded-lg py-3 items-center"
                accessibilityRole="button"
                accessibilityLabel="Confirm import">
                {csvImporting ? (
                  <ActivityIndicator color={isDark ? '#2B1810' : 'white'} />
                ) : (
                  <Text className="font-nunito-semibold text-white dark:text-tabby-900">Import</Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => setCsvPreview(null)}
                disabled={csvImporting}
                style={pressFeedback}
                className="px-4 py-3 items-center justify-center"
                accessibilityRole="button"
                accessibilityLabel="Cancel import">
                <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300">Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={aiPreview !== null} animationType="slide" transparent>
        <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View className="flex-1 bg-black/40 justify-end">
            <View className="bg-white dark:bg-tabby-900 rounded-t-2xl p-4 gap-3 max-h-[85%]">
              <View>
                <Text className="font-fredoka-semibold text-xl dark:text-white">
                  Add {aiPreview?.length ?? 0} transaction{aiPreview?.length === 1 ? '' : 's'}?
                </Text>
                <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
                  AI&apos;s first guess -- tap anything below to fix it before adding.
                </Text>
              </View>

              <FlatList
                data={aiPreview ?? []}
                keyExtractor={(_, i) => String(i)}
                style={{ maxHeight: 420 }}
                contentContainerStyle={{ gap: 10 }}
                renderItem={({ item, index }) => (
                  <View className="gap-2 py-3 border-b border-gray-100 dark:border-tabby-700">
                    <View className="flex-row items-center gap-2">
                      <TextInput
                        value={item.description}
                        onChangeText={(text) => updateAiPreviewItem(index, { description: text })}
                        placeholder="Description"
                        className="font-nunito flex-1 border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2 text-sm dark:text-white"
                      />
                      <View className="flex-row items-center border border-gray-300 dark:border-tabby-600 rounded-lg px-2">
                        <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">$</Text>
                        <TextInput
                          value={String(item.amount)}
                          onChangeText={(text) =>
                            updateAiPreviewItem(index, { amount: parseFloat(text) || 0 })
                          }
                          keyboardType="decimal-pad"
                          className="font-nunito w-16 py-2 text-sm text-right dark:text-white"
                        />
                      </View>
                      <Pressable
                        onPress={() => removeAiPreviewItem(index)}
                        style={pressFeedback}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${item.description}`}>
                        <Feather name="x" size={16} color="#9ca3af" />
                      </Pressable>
                    </View>

                    {/* The AI's expense/income guess, same as everything
                        else in this preview -- wrong often enough (any
                        "got paid", "refund", "sold my...") that it needs
                        to be correctable, not just displayed. */}
                    <View className="flex-row bg-gray-100 dark:bg-tabby-700 rounded-lg p-1 self-start">
                      <Pressable
                        onPress={() => updateAiPreviewItem(index, { isIncome: false, categoryName: null })}
                        style={pressFeedback}
                        className={`rounded-md px-3 py-1 ${!item.isIncome ? 'bg-white dark:bg-tabby-900' : ''}`}>
                        <Text
                          className={`font-nunito-semibold text-xs ${
                            !item.isIncome ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-tabby-300'
                          }`}>
                          Expense
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => updateAiPreviewItem(index, { isIncome: true, categoryName: null })}
                        style={pressFeedback}
                        className={`rounded-md px-3 py-1 ${item.isIncome ? 'bg-white dark:bg-tabby-900' : ''}`}>
                        <Text
                          className={`font-nunito-semibold text-xs ${
                            item.isIncome ? 'text-green-700 dark:text-green-400' : 'text-gray-500 dark:text-tabby-300'
                          }`}>
                          Income
                        </Text>
                      </Pressable>
                    </View>

                    <View className="flex-row flex-wrap gap-1.5">
                      {categories
                        .filter((c) => c.type === (item.isIncome ? 'income' : 'expense'))
                        .map((cat) => (
                          <Pressable
                            key={cat.id}
                            onPress={() =>
                              updateAiPreviewItem(index, {
                                categoryName: item.categoryName === cat.name ? null : cat.name,
                              })
                            }
                            style={pressFeedback}
                            className={`px-2.5 py-1 rounded-full border ${
                              item.categoryName === cat.name
                                ? 'bg-tabby-600 dark:bg-white border-tabby-600 dark:border-white'
                                : 'border-gray-300 dark:border-tabby-600'
                            }`}>
                            <Text
                              className={`font-nunito-medium text-xs ${
                                item.categoryName === cat.name
                                  ? 'text-white dark:text-tabby-900'
                                  : 'text-gray-600 dark:text-tabby-200'
                              }`}>
                              {cat.name}
                            </Text>
                          </Pressable>
                        ))}
                    </View>
                    {(item.merchant || item.occurredAt !== todayISO) && (
                      <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">
                        {item.merchant ? `at ${item.merchant}` : ''}
                        {item.merchant && item.occurredAt !== todayISO ? ' · ' : ''}
                        {item.occurredAt !== todayISO
                          ? new Date(`${item.occurredAt}T00:00:00`).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })
                          : ''}
                      </Text>
                    )}
                  </View>
                )}
              />

              <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
                Net: {(aiPreview?.reduce((sum, t) => sum + (t.isIncome ? t.amount : -t.amount), 0) ?? 0) < 0 ? '-' : '+'}$
                {Math.abs(aiPreview?.reduce((sum, t) => sum + (t.isIncome ? t.amount : -t.amount), 0) ?? 0).toFixed(2)}
              </Text>

              <View className="flex-row gap-2 pt-1">
                <Pressable
                  onPress={handleConfirmAIAdd}
                  disabled={aiImporting || !aiPreview?.every((p) => p.amount > 0)}
                  style={pressFeedback}
                  className={`flex-1 rounded-lg py-3 items-center ${
                    aiPreview?.every((p) => p.amount > 0) ? 'bg-tabby-600 dark:bg-white' : 'bg-gray-300 dark:bg-tabby-700'
                  }`}
                  accessibilityRole="button"
                  accessibilityLabel="Confirm add">
                  {aiImporting ? (
                    <ActivityIndicator color={isDark ? '#2B1810' : 'white'} />
                  ) : (
                    <Text
                      className={`font-nunito-semibold text-white ${
                        aiPreview?.every((p) => p.amount > 0) ? 'dark:text-tabby-900' : ''
                      }`}>
                      Confirm
                    </Text>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => setAiPreview(null)}
                  disabled={aiImporting}
                  style={pressFeedback}
                  className="px-4 py-3 items-center justify-center"
                  accessibilityRole="button"
                  accessibilityLabel="Cancel">
                  <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300">Cancel</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
