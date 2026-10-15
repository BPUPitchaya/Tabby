// Recurring bills -- schedule a weekly/biweekly/monthly expense (fixed or
// variable amount), get a local notification + in-app bell prompt on the
// due date. Standalone Profile row, same reasoning as Money Owing: owing a
// bill has nothing to do with Friends, and a bill has nothing to do with
// Money Owing either -- its own place.
import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { CategoryIcon, CUSTOM_CATEGORY_ICONS } from '@/components/category-icon';
import { categorizeTransaction } from '@/lib/ai';
import { useAuth } from '@/lib/auth-context';
import {
  BILL_COUNT_SOFT_CAP,
  createBill,
  deleteBill,
  fetchBills,
  getPendingBillDue,
  getNextBillDueDate,
  updateBill,
  type Bill,
} from '@/lib/bills';
import {
  cancelAllBillReminders,
  requestBillNotificationPermission,
  scheduleBillReminder,
} from '@/lib/bill-notifications';
import { createCategory, fetchCategories, type Category } from '@/lib/transactions';
import type { IncomeFrequency } from '@/lib/profile';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

// Plain native style, not a conditional `shadow-sm` className -- see
// transactions.tsx's SEGMENT_SHADOW for why.
const SEGMENT_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.08,
  shadowRadius: 2,
  elevation: 1,
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const FREQUENCY_OPTIONS: { value: IncomeFrequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
];

type FormState = {
  id: string | null;
  name: string;
  amount: string;
  isVariable: boolean;
  categoryId: string | null;
  frequency: IncomeFrequency | null;
  payWeekday: number | null;
  dayOfMonth: number | null;
};

const EMPTY_FORM: FormState = {
  id: null,
  name: '',
  amount: '',
  isVariable: false,
  categoryId: null,
  frequency: null,
  payWeekday: null,
  dayOfMonth: null,
};

export function BillsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const isDark = useColorScheme() === 'dark';
  const { session } = useAuth();
  const userId = session?.user.id;

  const [view, setView] = useState<'list' | 'form'>('list');
  const [bills, setBills] = useState<Bill[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [categorySearch, setCategorySearch] = useState('');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showWeekdayPicker, setShowWeekdayPicker] = useState(false);
  const [showDayOfMonthPicker, setShowDayOfMonthPicker] = useState(false);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [suggestingCategory, setSuggestingCategory] = useState(false);
  const [newCategoryIcon, setNewCategoryIcon] = useState(CUSTOM_CATEGORY_ICONS[0]);
  const [newCategoryBusy, setNewCategoryBusy] = useState(false);
  const [newCategoryError, setNewCategoryError] = useState<string | null>(null);

  const load = async () => {
    if (!userId) return;
    try {
      const [b, c] = await Promise.all([fetchBills(userId), fetchCategories('expense')]);
      setBills(b);
      setCategories(c);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bills.');
    }
  };

  useEffect(() => {
    if (!visible) return;
    setView('list');
    setError(null);
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [visible, userId]);

  const openAddForm = () => {
    if (bills.length >= BILL_COUNT_SOFT_CAP) {
      Alert.alert(
        'That’s a lot of bills',
        `You have ${bills.length} bills scheduled. Reminders may become unreliable past a certain number on this device. Consider removing any you no longer need.`,
        [
          { text: 'Add anyway', onPress: () => beginAddForm() },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
      return;
    }
    beginAddForm();
  };

  const beginAddForm = () => {
    setForm(EMPTY_FORM);
    setMessage(null);
    setView('form');
  };

  const openEditForm = (bill: Bill) => {
    setForm({
      id: bill.id,
      name: bill.name,
      amount: bill.amount !== null ? String(bill.amount) : '',
      isVariable: bill.isVariable,
      categoryId: bill.categoryId,
      frequency: bill.frequency,
      payWeekday: bill.payWeekday,
      dayOfMonth: bill.dayOfMonth,
    });
    setMessage(null);
    setView('form');
  };

  const handleSaveForm = async () => {
    if (!userId) return;
    if (!form.name.trim()) {
      setMessage('Give this bill a name.');
      return;
    }
    if (!form.frequency) {
      setMessage('Choose how often it’s due.');
      return;
    }
    if ((form.frequency === 'weekly' || form.frequency === 'biweekly') && form.payWeekday === null) {
      setMessage('Choose which day it’s due.');
      return;
    }
    if (form.frequency === 'monthly' && !form.dayOfMonth) {
      setMessage('Choose which day of the month it’s due.');
      return;
    }
    let parsedAmount: number | null = null;
    if (!form.isVariable) {
      parsedAmount = parseFloat(form.amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        setMessage('Enter a valid amount, or mark this bill as variable.');
        return;
      }
    }

    setBusy(true);
    setMessage(null);
    try {
      const params = {
        name: form.name.trim(),
        categoryId: form.categoryId,
        isVariable: form.isVariable,
        amount: parsedAmount,
        frequency: form.frequency,
        payWeekday: form.frequency === 'monthly' ? null : form.payWeekday,
        dayOfMonth: form.frequency === 'monthly' ? form.dayOfMonth : null,
      };

      const billId = form.id ?? (await createBill(userId, params));
      if (form.id) await updateBill(form.id, params);

      // Best-effort -- a denied permission or scheduling hiccup shouldn't
      // block saving the bill itself; the in-app bell check still works.
      try {
        const granted = await requestBillNotificationPermission();
        const nextDue = getNextBillDueDate({
          frequency: params.frequency,
          payWeekday: params.payWeekday,
          dayOfMonth: params.dayOfMonth,
        });
        if (granted && nextDue) await scheduleBillReminder(billId, params.name, nextDue);
      } catch {
        // reminder just won't fire -- not worth blocking the save over
      }

      await load();
      setView('list');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save bill.');
    } finally {
      setBusy(false);
    }
  };

  // Suggests a category from the bill name, same categorizeTransaction
  // call the manual transaction form already uses -- only when nothing's
  // been picked yet, so it never overrides an explicit choice (including
  // one already set when editing an existing bill).
  const handleSuggestCategory = async () => {
    if (!form.name.trim() || form.categoryId !== null) return;
    setSuggestingCategory(true);
    try {
      const suggestedId = await categorizeTransaction(form.name, categories);
      if (suggestedId) setForm((f) => (f.categoryId === null ? { ...f, categoryId: suggestedId } : f));
    } finally {
      setSuggestingCategory(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!userId || !categorySearch.trim()) return;
    setNewCategoryBusy(true);
    setNewCategoryError(null);
    try {
      const created = await createCategory(userId, categorySearch, newCategoryIcon, 'expense');
      setCategories((prev) => [...prev, created]);
      setForm((f) => ({ ...f, categoryId: created.id }));
      setShowCategoryPicker(false);
      setShowNewCategory(false);
      setCategorySearch('');
      setNewCategoryIcon(CUSTOM_CATEGORY_ICONS[0]);
    } catch (err) {
      setNewCategoryError(err instanceof Error ? err.message : 'Failed to create category.');
    } finally {
      setNewCategoryBusy(false);
    }
  };

  const handleDelete = async (bill: Bill) => {
    setBusy(true);
    try {
      await deleteBill(bill.id);
      await cancelAllBillReminders(bill.id).catch(() => {});
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete bill.');
    } finally {
      setBusy(false);
    }
  };

  const presentBillActions = (bill: Bill) => {
    const options = ['Edit', 'Delete', 'Cancel'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, destructiveButtonIndex: 1, cancelButtonIndex: 2 },
        (index) => {
          if (index === 0) openEditForm(bill);
          if (index === 1) {
            Alert.alert('Delete this bill?', bill.name, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => handleDelete(bill) },
            ]);
          }
        },
      );
    } else {
      Alert.alert(bill.name, undefined, [
        { text: 'Edit', onPress: () => openEditForm(bill) },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            Alert.alert('Delete this bill?', bill.name, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => handleDelete(bill) },
            ]),
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const selectedCategory = categories.find((c) => c.id === form.categoryId) ?? null;
  const filteredCategories = categorySearch.trim()
    ? categories.filter((c) => c.name.toLowerCase().includes(categorySearch.trim().toLowerCase()))
    : categories;

  const dueLabel = (bill: Bill) =>
    bill.frequency === 'monthly'
      ? `Monthly · day ${bill.dayOfMonth}`
      : `${bill.frequency === 'weekly' ? 'Weekly' : 'Fortnightly'} · ${WEEKDAYS[bill.payWeekday ?? 0]}`;

  const scheduleLabel =
    form.frequency === 'monthly'
      ? form.dayOfMonth
        ? `Day ${form.dayOfMonth} of the month`
        : 'Pick a day of the month'
      : form.payWeekday !== null
        ? WEEKDAYS[form.payWeekday]
        : 'Pick a day of the week';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-white dark:bg-tabby-900">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-tabby-700">
            {view === 'form' ? (
              <Pressable
                onPress={() => setView('list')}
                style={pressFeedback}
                accessibilityRole="button"
                accessibilityLabel="Back"
              >
                <Feather name="chevron-left" size={20} color={isDark ? '#E8C39E' : '#374151'} />
              </Pressable>
            ) : (
              <Text className="font-fredoka-semibold text-xl dark:text-white">Bills</Text>
            )}
            {view === 'form' && (
              <Text className="font-fredoka-semibold text-xl dark:text-white">
                {form.id ? 'Edit Bill' : 'Add Bill'}
              </Text>
            )}
            {view === 'list' ? (
              <View className="flex-row items-center gap-4">
                <Pressable
                  onPress={openAddForm}
                  style={pressFeedback}
                  accessibilityRole="button"
                  accessibilityLabel="Add bill"
                >
                  <Feather name="plus" size={22} color={isDark ? '#E8C39E' : '#374151'} />
                </Pressable>
                <Pressable
                  onPress={onClose}
                  style={pressFeedback}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  className="w-8 h-8 rounded-full bg-gray-100 dark:bg-tabby-700 items-center justify-center"
                >
                  <Feather name="x" size={16} color={isDark ? '#E8C39E' : '#374151'} />
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={onClose}
                style={pressFeedback}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Feather name="x" size={16} color={isDark ? '#E8C39E' : '#374151'} />
              </Pressable>
            )}
          </View>

          {loading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator />
            </View>
          ) : view === 'list' ? (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
              {error && (
                <View className="px-3 py-2 bg-red-50 dark:bg-red-950 rounded-lg">
                  <Text className="font-nunito text-red-600 dark:text-red-400 text-sm">{error}</Text>
                </View>
              )}
              {bills.length === 0 ? (
                <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
                  No bills yet. Add one to get reminded when it&apos;s due.
                </Text>
              ) : (
                bills.map((bill) => {
                  const pending = getPendingBillDue(bill);
                  const awaitingAmount = pending !== null && bill.isVariable;
                  const category = categories.find((c) => c.id === bill.categoryId);
                  return (
                    <Pressable
                      key={bill.id}
                      onPress={() => presentBillActions(bill)}
                      disabled={busy}
                      style={pressFeedback}
                      className={`flex-row items-center justify-between rounded-xl px-3 py-2.5 bg-gray-50 dark:bg-tabby-800 border ${
                        awaitingAmount
                          ? 'border-amber-400 dark:border-amber-500'
                          : 'border-gray-100 dark:border-tabby-700'
                      }`}
                    >
                      <View className="flex-row items-center gap-2.5 flex-1">
                        <View className="w-9 h-9 rounded-full bg-white dark:bg-tabby-700 items-center justify-center">
                          <CategoryIcon
                            name={category?.icon ?? null}
                            size={15}
                            color={isDark ? '#E8C39E' : '#4b5563'}
                          />
                        </View>
                        <View className="flex-1">
                          <Text className="font-nunito-medium dark:text-white">{bill.name}</Text>
                          <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">
                            {dueLabel(bill)}
                          </Text>
                          {awaitingAmount && (
                            <Text className="font-nunito text-xs text-amber-600 dark:text-amber-400">
                              Awaiting amount
                            </Text>
                          )}
                        </View>
                      </View>
                      <Text className="font-nunito-bold dark:text-white">
                        {bill.isVariable ? 'Variable' : `$${(bill.amount ?? 0).toFixed(2)}`}
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
              <TextInput
                value={form.name}
                onChangeText={(name) => setForm((f) => ({ ...f, name }))}
                onBlur={handleSuggestCategory}
                placeholder="Bill name (e.g. Rent, Power)"
                className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2.5 bg-white dark:bg-tabby-900 dark:text-white"
              />
              {suggestingCategory && (
                <View className="flex-row items-center gap-2 -mt-1">
                  <ActivityIndicator size="small" />
                  <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">
                    Suggesting a category...
                  </Text>
                </View>
              )}

              <View className="flex-row items-center justify-between rounded-lg border border-gray-300 dark:border-tabby-600 px-3 py-2.5">
                <View>
                  <Text className="font-nunito-medium dark:text-white">Variable amount</Text>
                  <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">
                    Different each time. You&apos;ll be asked to enter it on the due date.
                  </Text>
                </View>
                <Switch
                  value={form.isVariable}
                  onValueChange={(isVariable) => setForm((f) => ({ ...f, isVariable }))}
                />
              </View>

              {!form.isVariable && (
                <TextInput
                  value={form.amount}
                  onChangeText={(amount) => setForm((f) => ({ ...f, amount }))}
                  placeholder="Amount"
                  keyboardType="decimal-pad"
                  className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2.5 bg-white dark:bg-tabby-900 dark:text-white"
                />
              )}

              <View className="flex-row gap-2">
                {FREQUENCY_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.value}
                    onPress={() =>
                      setForm((f) => ({ ...f, frequency: opt.value, payWeekday: null, dayOfMonth: null }))
                    }
                    style={pressFeedback}
                    className={`flex-1 rounded-lg py-2 items-center border ${
                      form.frequency === opt.value
                        ? 'bg-tabby-600 dark:bg-white border-tabby-600 dark:border-white'
                        : 'border-gray-300 dark:border-tabby-600'
                    }`}
                  >
                    <Text
                      className={`font-nunito-medium text-sm ${
                        form.frequency === opt.value
                          ? 'text-white dark:text-tabby-900'
                          : 'text-gray-700 dark:text-tabby-200'
                      }`}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {form.frequency && (
                <Pressable
                  onPress={() =>
                    form.frequency === 'monthly' ? setShowDayOfMonthPicker(true) : setShowWeekdayPicker(true)
                  }
                  style={pressFeedback}
                  className="flex-row items-center justify-between border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2.5"
                >
                  <Text className="font-nunito text-gray-800 dark:text-white text-sm">{scheduleLabel}</Text>
                  <Feather
                    name={form.frequency === 'monthly' ? 'calendar' : 'chevron-right'}
                    size={16}
                    color={isDark ? '#E8C39E' : '#9ca3af'}
                  />
                </Pressable>
              )}

              <Pressable
                onPress={() => setShowCategoryPicker(true)}
                style={pressFeedback}
                accessibilityRole="button"
                accessibilityLabel="Category"
                className="flex-row items-center justify-between border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2.5"
              >
                <View className="flex-row items-center gap-2">
                  {selectedCategory && (
                    <CategoryIcon
                      name={selectedCategory.icon}
                      size={14}
                      color={isDark ? '#E8C39E' : '#4b5563'}
                    />
                  )}
                  <Text className="font-nunito text-gray-800 dark:text-white text-sm">
                    {selectedCategory?.name ?? 'Category (optional)'}
                  </Text>
                </View>
                <Feather name="chevron-down" size={16} color={isDark ? '#E8C39E' : '#9ca3af'} />
              </Pressable>

              {showCategoryPicker && (
                <View className="border border-gray-300 dark:border-tabby-600 rounded-lg p-2 gap-2">
                  <TextInput
                    value={categorySearch}
                    onChangeText={setCategorySearch}
                    placeholder="Search categories"
                    autoFocus
                    className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2 text-sm dark:text-white"
                  />
                  <View className="gap-0.5">
                    {filteredCategories.map((cat) => (
                      <Pressable
                        key={cat.id}
                        onPress={() => {
                          setForm((f) => ({ ...f, categoryId: cat.id === f.categoryId ? null : cat.id }));
                          setShowCategoryPicker(false);
                          setCategorySearch('');
                        }}
                        style={pressFeedback}
                        className="flex-row items-center gap-2.5 px-2 py-2 rounded-lg"
                      >
                        <CategoryIcon
                          name={cat.icon}
                          size={15}
                          color={
                            cat.id === form.categoryId
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
                            cat.id === form.categoryId
                              ? 'text-tabby-600 dark:text-tabby-100'
                              : 'text-gray-700 dark:text-tabby-200'
                          }`}
                        >
                          {cat.name}
                        </Text>
                        {cat.id === form.categoryId && (
                          <Feather name="check" size={16} color={isDark ? '#E8C39E' : '#8B5A2B'} />
                        )}
                      </Pressable>
                    ))}
                  </View>

                  <Pressable
                    onPress={() => setShowNewCategory((v) => !v)}
                    style={pressFeedback}
                    className="flex-row items-center gap-2 px-2 py-2"
                  >
                    <Feather name="plus" size={14} color={isDark ? '#E8C39E' : '#4b5563'} />
                    <Text className="font-nunito-medium text-sm text-gray-700 dark:text-tabby-200">
                      New category{categorySearch.trim() ? `: "${categorySearch.trim()}"` : ''}
                    </Text>
                  </Pressable>

                  {showNewCategory && (
                    <View className="gap-2 px-2 pb-1">
                      <View className="flex-row flex-wrap gap-2">
                        {CUSTOM_CATEGORY_ICONS.map((icon) => (
                          <Pressable
                            key={icon}
                            onPress={() => setNewCategoryIcon(icon)}
                            style={pressFeedback}
                            className={`w-8 h-8 rounded-full items-center justify-center border ${
                              newCategoryIcon === icon
                                ? 'bg-tabby-600 dark:bg-white border-tabby-600 dark:border-white'
                                : 'border-gray-300 dark:border-tabby-600'
                            }`}
                          >
                            <CategoryIcon
                              name={icon}
                              size={14}
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
                        disabled={newCategoryBusy || !categorySearch.trim()}
                        style={pressFeedback}
                        className="self-start bg-tabby-600 dark:bg-white rounded-lg px-3 py-1.5"
                      >
                        {newCategoryBusy ? (
                          <ActivityIndicator size="small" color={isDark ? '#2B1810' : 'white'} />
                        ) : (
                          <Text className="font-nunito-semibold text-xs text-white dark:text-tabby-900">
                            Create
                          </Text>
                        )}
                      </Pressable>
                    </View>
                  )}

                  <Pressable
                    onPress={() => {
                      setShowCategoryPicker(false);
                      setCategorySearch('');
                      setShowNewCategory(false);
                    }}
                    style={pressFeedback}
                    className="self-end px-3 py-1.5"
                  >
                    <Text className="font-nunito-semibold text-tabby-600 dark:text-white">Done</Text>
                  </Pressable>
                </View>
              )}

              {message && (
                <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-xs">{message}</Text>
              )}

              <Pressable
                onPress={handleSaveForm}
                disabled={busy}
                style={(state) => [pressFeedback(state), SEGMENT_SHADOW]}
                className="rounded-lg py-2.5 items-center bg-tabby-600 dark:bg-white mt-1"
              >
                {busy ? (
                  <ActivityIndicator color={isDark ? '#2B1810' : 'white'} />
                ) : (
                  <Text className="font-nunito-semibold text-white dark:text-tabby-900 text-sm">
                    Save bill
                  </Text>
                )}
              </Pressable>
            </ScrollView>
          )}

          <Modal visible={showWeekdayPicker} animationType="slide" transparent>
            <View className="flex-1 bg-black/40 justify-end">
              <View className="bg-white dark:bg-tabby-900 rounded-t-2xl p-4 gap-1">
                <Text className="font-fredoka-semibold text-lg dark:text-white mb-2">
                  Which day is it due?
                </Text>
                {WEEKDAYS.map((day, i) => (
                  <Pressable
                    key={day}
                    onPress={() => {
                      setForm((f) => ({ ...f, payWeekday: i }));
                      setShowWeekdayPicker(false);
                    }}
                    style={pressFeedback}
                    className="flex-row items-center justify-between py-3 px-2 border-b border-gray-100 dark:border-tabby-700"
                  >
                    <Text className="font-nunito text-gray-800 dark:text-white">{day}</Text>
                    {form.payWeekday === i && (
                      <Feather name="check" size={18} color={isDark ? '#E8C39E' : '#8B5A2B'} />
                    )}
                  </Pressable>
                ))}
                <Pressable
                  onPress={() => setShowWeekdayPicker(false)}
                  style={pressFeedback}
                  className="py-3 items-center"
                >
                  <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300">Cancel</Text>
                </Pressable>
              </View>
            </View>
          </Modal>

          <Modal visible={showDayOfMonthPicker} animationType="slide" transparent>
            <View className="flex-1 bg-black/40 justify-end">
              <View className="bg-white dark:bg-tabby-900 rounded-t-2xl p-4 gap-3">
                <Text className="font-fredoka-semibold text-lg dark:text-white">Which day of the month?</Text>
                <View className="flex-row flex-wrap gap-2">
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                    <Pressable
                      key={day}
                      onPress={() => {
                        setForm((f) => ({ ...f, dayOfMonth: day }));
                        setShowDayOfMonthPicker(false);
                      }}
                      style={pressFeedback}
                      className={`w-[12.5%] aspect-square items-center justify-center rounded-full ${
                        form.dayOfMonth === day ? 'bg-tabby-600 dark:bg-white' : ''
                      }`}
                    >
                      <Text
                        className={`font-nunito-medium text-sm ${
                          form.dayOfMonth === day
                            ? 'text-white dark:text-tabby-900'
                            : 'text-gray-800 dark:text-white'
                        }`}
                      >
                        {day}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-xs">
                  Due on the 31st in a shorter month? We&apos;ll use the last day of that month instead.
                </Text>
                <Pressable
                  onPress={() => setShowDayOfMonthPicker(false)}
                  style={pressFeedback}
                  className="py-3 items-center"
                >
                  <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300">Cancel</Text>
                </Pressable>
              </View>
            </View>
          </Modal>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
