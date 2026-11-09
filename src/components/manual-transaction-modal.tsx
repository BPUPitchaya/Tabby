import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { type Dispatch, type SetStateAction, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';

import { CategoryIcon, CUSTOM_CATEGORY_ICONS, guessCategoryIcon } from '@/components/category-icon';
import { categorizeTransaction, suggestCategoryIcon } from '@/lib/ai';
import { toLocalISODate } from '@/lib/transaction-query';
import {
  addTransaction,
  createCategory,
  updateTransaction,
  type Category,
  type CategoryType,
  type Transaction,
} from '@/lib/transactions';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

// The Expense/Income toggle's selected-pill shadow, as a plain native
// style instead of NativeWind's `shadow-sm` class. A conditionally-applied
// `shadow-*` className hits a known race in NativeWind's CSS interop layer
// that throws "Couldn't find a navigation context" the first time the
// class is added (nativewind/nativewind#1536). Native shadow props
// sidestep that code path entirely.
const SEGMENT_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.08,
  shadowRadius: 2,
  elevation: 1,
};

// All of the manual add/edit sheet's form state and handlers. Lives in a
// hook (called by the Transactions screen) rather than inside the modal
// itself, because the screen still needs to drive it from outside: open
// it fresh from the + button, prefill it from the detail modal's "edit"
// action, and close it if the transaction being edited gets deleted.
export function useManualTransactionForm({
  userId,
  todayISO,
  categories,
  setCategories,
  setError,
  setAiBusy,
  onSaved,
}: {
  userId: string | undefined;
  todayISO: string;
  categories: Category[];
  setCategories: Dispatch<SetStateAction<Category[]>>;
  setError: (error: string | null) => void;
  // Shared with the screen's composer: auto-categorizing on description
  // blur shows the same busy state.
  setAiBusy: (busy: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  // Manual add/edit now lives in its own bottom-sheet modal, triggered by
  // the "+" button or by tapping an existing transaction, rather than a
  // permanently-visible form taking up the top of the screen.
  const [manualOpen, setManualOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [merchant, setMerchant] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [transactionType, setTransactionType] = useState<CategoryType>('expense');
  const [occurredAt, setOccurredAt] = useState(todayISO);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [categorySource, setCategorySource] = useState<'manual' | 'ai' | null>(null);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState(CUSTOM_CATEGORY_ICONS[0]);
  // A ref, not state: handleSuggestCategoryIcon reads this after an
  // await, where a captured state value would be stale if the user tapped
  // an icon while the AI call was still in flight.
  const newCategoryIconTouchedRef = useRef(false);
  const [newCategoryBusy, setNewCategoryBusy] = useState(false);
  const [newCategoryError, setNewCategoryError] = useState<string | null>(null);

  const resetForm = () => {
    setAmount('');
    setDescription('');
    setMerchant('');
    setCategoryId(null);
    setCategorySource(null);
    setEditingId(null);
    setTransactionType('expense');
    setOccurredAt(todayISO);
    setShowNewCategory(false);
    setNewCategoryName('');
    setNewCategoryIcon(CUSTOM_CATEGORY_ICONS[0]);
    newCategoryIconTouchedRef.current = false;
    setNewCategoryError(null);
  };

  // Suggests an icon from the typed name: a local keyword guess first
  // (instant, covers most common names), AI only as a fallback when
  // nothing matches, so this isn't a network round trip every time. Only
  // while the user hasn't manually picked one themselves, so it never
  // overrides an explicit choice (checked both before and after the AI
  // call, since the user could tap an icon while it's in flight).
  const handleSuggestCategoryIcon = async () => {
    if (!newCategoryName.trim() || newCategoryIconTouchedRef.current) return;

    const guessed = guessCategoryIcon(newCategoryName);
    if (guessed) {
      setNewCategoryIcon(guessed);
      return;
    }

    const suggested = await suggestCategoryIcon(newCategoryName, CUSTOM_CATEGORY_ICONS);
    if (suggested && !newCategoryIconTouchedRef.current) {
      setNewCategoryIcon(suggested as (typeof CUSTOM_CATEGORY_ICONS)[number]);
    }
  };

  const handlePickNewCategoryIcon = (icon: (typeof CUSTOM_CATEGORY_ICONS)[number]) => {
    newCategoryIconTouchedRef.current = true;
    setNewCategoryIcon(icon);
  };

  const handleCreateCategory = async () => {
    if (!userId || !newCategoryName.trim()) return;
    setNewCategoryBusy(true);
    setNewCategoryError(null);
    try {
      const created = await createCategory(userId, newCategoryName, newCategoryIcon, transactionType);
      setCategories((prev) => [...prev, created]);
      setCategoryId(created.id);
      setCategorySource('manual');
      setShowNewCategory(false);
      setNewCategoryName('');
      setNewCategoryIcon(CUSTOM_CATEGORY_ICONS[0]);
      newCategoryIconTouchedRef.current = false;
    } catch (err) {
      setNewCategoryError(err instanceof Error ? err.message : 'Failed to create category.');
    } finally {
      setNewCategoryBusy(false);
    }
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

  const handleToggleCategory = (id: string) => {
    setCategoryId(id === categoryId ? null : id);
    setCategorySource(id === categoryId ? null : 'manual');
  };

  const handleDescriptionBlur = async () => {
    // Only auto-suggest if the user hasn't picked (or we haven't already
    // AI-suggested) a category. Never override a manual choice.
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
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save transaction.');
    } finally {
      setSubmitting(false);
    }
  };

  return {
    manualOpen,
    amount,
    setAmount,
    description,
    setDescription,
    merchant,
    setMerchant,
    categoryId,
    transactionType,
    occurredAt,
    setOccurredAt,
    showDatePicker,
    setShowDatePicker,
    submitting,
    editingId,
    categorySource,
    showNewCategory,
    setShowNewCategory,
    newCategoryName,
    setNewCategoryName,
    newCategoryIcon,
    newCategoryBusy,
    newCategoryError,
    openManualAdd,
    closeManualForm,
    handleSelectType,
    handleToggleCategory,
    handleDescriptionBlur,
    handleSuggestCategoryIcon,
    handlePickNewCategoryIcon,
    handleCreateCategory,
    handleStartEdit,
    handleSubmit,
  };
}

export type ManualTransactionForm = ReturnType<typeof useManualTransactionForm>;

// Manual add/edit, opened via the + button or by tapping a transaction.
export function ManualTransactionModal({
  form,
  todayISO,
  categories,
  recentMerchants,
  onDelete,
}: {
  form: ManualTransactionForm;
  todayISO: string;
  categories: Category[];
  recentMerchants: string[];
  onDelete: (id: string) => void;
}) {
  const isDark = useColorScheme() === 'dark';
  const {
    manualOpen,
    amount,
    setAmount,
    description,
    setDescription,
    merchant,
    setMerchant,
    categoryId,
    transactionType,
    occurredAt,
    setOccurredAt,
    showDatePicker,
    setShowDatePicker,
    submitting,
    editingId,
    categorySource,
    showNewCategory,
    setShowNewCategory,
    newCategoryName,
    setNewCategoryName,
    newCategoryIcon,
    newCategoryBusy,
    newCategoryError,
    closeManualForm,
    handleSelectType,
    handleToggleCategory,
    handleDescriptionBlur,
    handleSuggestCategoryIcon,
    handlePickNewCategoryIcon,
    handleCreateCategory,
    handleSubmit,
  } = form;

  return (
    <>
      <Modal visible={manualOpen} animationType="slide" transparent onRequestClose={closeManualForm}>
        <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
                  className="w-8 h-8 rounded-full bg-gray-100 dark:bg-tabby-700 items-center justify-center"
                >
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
                  }`}
                >
                  <Text
                    className={`font-nunito-semibold text-sm ${
                      transactionType === 'expense'
                        ? 'text-gray-900 dark:text-white'
                        : 'text-gray-500 dark:text-tabby-300'
                    }`}
                  >
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
                  }`}
                >
                  <Text
                    className={`font-nunito-semibold text-sm ${
                      transactionType === 'income'
                        ? 'text-green-700 dark:text-green-400'
                        : 'text-gray-500 dark:text-tabby-300'
                    }`}
                  >
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
                placeholder="Where? (optional, e.g. Pak'nSave)"
                className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2 dark:text-white"
              />

              <Pressable
                onPress={() => setShowDatePicker(true)}
                style={pressFeedback}
                accessibilityRole="button"
                accessibilityLabel="Date"
                className="flex-row items-center justify-between border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2.5"
              >
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
                    className="self-end px-3 py-1.5"
                  >
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
                        merchant === m
                          ? 'bg-gray-800 dark:bg-tabby-700 border-gray-800 dark:border-tabby-700'
                          : 'border-gray-300 dark:border-tabby-600'
                      }`}
                    >
                      <Text
                        className={`font-nunito ${merchant === m ? 'text-white text-xs' : 'text-gray-600 dark:text-tabby-200 text-xs'}`}
                      >
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
                      onPress={() => handleToggleCategory(cat.id)}
                      style={pressFeedback}
                      className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border ${
                        categoryId === cat.id
                          ? 'bg-tabby-600 dark:bg-white border-tabby-600 dark:border-white'
                          : 'border-gray-300 dark:border-tabby-600'
                      }`}
                    >
                      <CategoryIcon
                        name={cat.icon}
                        size={13}
                        color={
                          categoryId === cat.id
                            ? isDark
                              ? '#2B1810'
                              : '#fff'
                            : isDark
                              ? '#E8C39E'
                              : '#4b5563'
                        }
                      />
                      <Text
                        className={`font-nunito-medium ${
                          categoryId === cat.id
                            ? 'text-white dark:text-tabby-900 text-sm'
                            : 'text-gray-700 dark:text-tabby-200 text-sm'
                        }`}
                      >
                        {cat.name}
                      </Text>
                    </Pressable>
                  ))}
                <Pressable
                  onPress={() => setShowNewCategory((v) => !v)}
                  style={pressFeedback}
                  className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border border-dashed border-gray-300 dark:border-tabby-600"
                >
                  <Feather name="plus" size={13} color={isDark ? '#E8C39E' : '#4b5563'} />
                  <Text className="font-nunito-medium text-gray-700 dark:text-tabby-200 text-sm">New</Text>
                </Pressable>
                {categorySource === 'ai' && (
                  <Text className="font-nunito text-xs text-tabby-500 dark:text-tabby-200">AI suggested</Text>
                )}
              </View>

              {showNewCategory && (
                <View className="border border-gray-300 dark:border-tabby-600 rounded-lg p-3 gap-2.5">
                  <TextInput
                    value={newCategoryName}
                    onChangeText={setNewCategoryName}
                    onBlur={handleSuggestCategoryIcon}
                    placeholder="Category name"
                    autoFocus
                    className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2 text-sm dark:text-white"
                  />
                  <View className="flex-row flex-wrap gap-2">
                    {CUSTOM_CATEGORY_ICONS.map((icon) => (
                      <Pressable
                        key={icon}
                        onPress={() => handlePickNewCategoryIcon(icon)}
                        style={pressFeedback}
                        className={`w-9 h-9 rounded-full items-center justify-center border ${
                          newCategoryIcon === icon
                            ? 'bg-tabby-600 dark:bg-white border-tabby-600 dark:border-white'
                            : 'border-gray-300 dark:border-tabby-600'
                        }`}
                      >
                        <CategoryIcon
                          name={icon}
                          size={15}
                          color={
                            newCategoryIcon === icon
                              ? isDark
                                ? '#2B1810'
                                : '#fff'
                              : isDark
                                ? '#E8C39E'
                                : '#4b5563'
                          }
                        />
                      </Pressable>
                    ))}
                  </View>
                  {newCategoryError && (
                    <Text className="font-nunito text-xs text-red-500">{newCategoryError}</Text>
                  )}
                  <Pressable
                    onPress={handleCreateCategory}
                    disabled={newCategoryBusy || !newCategoryName.trim()}
                    style={pressFeedback}
                    className="self-start bg-tabby-600 dark:bg-white rounded-lg px-4 py-2"
                  >
                    {newCategoryBusy ? (
                      <ActivityIndicator size="small" color={isDark ? '#2B1810' : 'white'} />
                    ) : (
                      <Text className="font-nunito-semibold text-sm text-white dark:text-tabby-900">
                        Create category
                      </Text>
                    )}
                  </Pressable>
                </View>
              )}

              <View className="flex-row gap-2 pt-1">
                <Pressable
                  onPress={handleSubmit}
                  disabled={submitting}
                  style={pressFeedback}
                  className="flex-1 bg-tabby-600 dark:bg-white rounded-lg py-3 items-center"
                  accessibilityRole="button"
                  accessibilityLabel={editingId ? 'Save changes' : 'Add transaction'}
                >
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
                      onDelete(editingId);
                    }}
                    style={pressFeedback}
                    className="px-4 py-3 items-center justify-center rounded-lg bg-red-50 dark:bg-red-950"
                    accessibilityRole="button"
                    accessibilityLabel="Delete transaction"
                    accessibilityHint="asks to confirm, then permanently deletes this transaction"
                  >
                    <Feather name="trash-2" size={18} color="#ef4444" />
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Android shows its own native dialog with no wrapper needed:
          rendering the picker at all is what triggers it, and it unmounts
          itself via onValueChange/onDismiss below. iOS's picker renders
          inline inside the manual-add sheet above instead of a second
          Modal, since stacking two RN Modals on iOS silently fails to present
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
    </>
  );
}
