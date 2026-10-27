// Recurring flat bills -- rent/power/internet, scheduled once instead of
// logged as a one-off shared expense every cycle. Same chrome as
// chores-modal.tsx (frequency segment + weekday/day-of-month picker
// sheets), minus the assignment/rotation section -- a bill has no
// "whose turn", any member can confirm it once they've paid it, which
// splits it equally among every current flat member (see
// 0046_add_flat_bills.sql). Create/edit/delete is admin-only, same
// posture as chores.
import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import {
  confirmFlatBill,
  createFlatBill,
  deleteFlatBill,
  fetchFlatBills,
  getFlatBillCycle,
  isFlatBillDoneThisCycle,
  updateFlatBill,
  type FlatBill,
} from '@/lib/flat-bills';
import type { IncomeFrequency } from '@/lib/profile';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

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
  frequency: IncomeFrequency | null;
  payWeekday: number | null;
  dayOfMonth: number | null;
};

const EMPTY_FORM: FormState = { id: null, name: '', amount: '', frequency: null, payWeekday: null, dayOfMonth: null };

// Sort done-last (same convention as chores-modal's sortedChores), then
// by whichever cycle is due soonest.
function sortBills(bills: FlatBill[]): FlatBill[] {
  return [...bills].sort((a, b) => {
    const aDone = isFlatBillDoneThisCycle(a);
    const bDone = isFlatBillDoneThisCycle(b);
    if (aDone !== bDone) return aDone ? 1 : -1;
    const aStart = getFlatBillCycle(a)?.startDate ?? '';
    const bStart = getFlatBillCycle(b)?.startDate ?? '';
    return aStart.localeCompare(bStart);
  });
}

export function FlatBillsModal({
  visible,
  onClose,
  flatId,
  isAdmin,
}: {
  visible: boolean;
  onClose: () => void;
  flatId: string;
  isAdmin: boolean;
}) {
  const isDark = useColorScheme() === 'dark';

  const [view, setView] = useState<'list' | 'form'>('list');
  const [bills, setBills] = useState<FlatBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showWeekdayPicker, setShowWeekdayPicker] = useState(false);
  const [showDayOfMonthPicker, setShowDayOfMonthPicker] = useState(false);

  const load = async () => {
    try {
      setBills(await fetchFlatBills(flatId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load flat bills.');
    }
  };

  useEffect(() => {
    if (!visible) return;
    setView('list');
    setError(null);
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [visible, flatId]);

  const beginAddForm = () => {
    setForm(EMPTY_FORM);
    setMessage(null);
    setView('form');
  };

  const openEditForm = (bill: FlatBill) => {
    setForm({
      id: bill.id,
      name: bill.name,
      amount: String(bill.amount),
      frequency: bill.frequency,
      payWeekday: bill.payWeekday,
      dayOfMonth: bill.dayOfMonth,
    });
    setMessage(null);
    setView('form');
  };

  const handleSaveForm = async () => {
    if (!form.name.trim()) {
      setMessage('Give this bill a name.');
      return;
    }
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) {
      setMessage('Enter an amount.');
      return;
    }
    if (!form.frequency) {
      setMessage('Choose how often it repeats.');
      return;
    }
    if ((form.frequency === 'weekly' || form.frequency === 'biweekly') && form.payWeekday === null) {
      setMessage('Choose which day it repeats on.');
      return;
    }
    if (form.frequency === 'monthly' && !form.dayOfMonth) {
      setMessage('Choose which day of the month it repeats on.');
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const params = {
        name: form.name.trim(),
        categoryId: null,
        amount,
        frequency: form.frequency,
        payWeekday: form.frequency === 'monthly' ? null : form.payWeekday,
        dayOfMonth: form.frequency === 'monthly' ? form.dayOfMonth : null,
      };
      if (form.id) {
        await updateFlatBill(form.id, params);
      } else {
        await createFlatBill(flatId, params);
      }
      await load();
      setView('list');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save flat bill.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (bill: FlatBill) => {
    setBusy(true);
    try {
      await deleteFlatBill(bill.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete flat bill.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async (bill: FlatBill) => {
    const cycle = getFlatBillCycle(bill);
    if (!cycle) return;
    setBusy(true);
    try {
      await confirmFlatBill(bill.id, cycle.startDate);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm this bill.');
    } finally {
      setBusy(false);
    }
  };

  const sortedBills = sortBills(bills);
  const scheduleLabel =
    form.frequency === 'monthly'
      ? form.dayOfMonth
        ? `Day ${form.dayOfMonth} of the month`
        : 'Which day of the month?'
      : form.payWeekday !== null
        ? WEEKDAYS[form.payWeekday]
        : 'Which day?';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-white dark:bg-tabby-900">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-tabby-700">
            {view === 'form' ? (
              <Pressable onPress={() => setView('list')} style={pressFeedback} accessibilityRole="button" accessibilityLabel="Back">
                <Feather name="chevron-left" size={20} color={isDark ? '#E8C39E' : '#374151'} />
              </Pressable>
            ) : (
              <Text className="font-fredoka-semibold text-xl dark:text-white">Flat Bills</Text>
            )}
            {view === 'form' && (
              <Text className="font-fredoka-semibold text-xl dark:text-white">{form.id ? 'Edit Bill' : 'Add Bill'}</Text>
            )}
            {view === 'list' ? (
              <View className="flex-row items-center gap-4">
                {isAdmin && (
                  <Pressable onPress={beginAddForm} style={pressFeedback} accessibilityRole="button" accessibilityLabel="Add flat bill">
                    <Feather name="plus" size={22} color={isDark ? '#E8C39E' : '#374151'} />
                  </Pressable>
                )}
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
              <Pressable onPress={onClose} style={pressFeedback} accessibilityRole="button" accessibilityLabel="Close">
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
                  No recurring bills yet.{isAdmin ? ' Add rent, power, or internet to stop re-entering them each cycle.' : ' Ask the flat admin to add one.'}
                </Text>
              ) : (
                sortedBills.map((bill) => {
                  const done = isFlatBillDoneThisCycle(bill);
                  const cycle = getFlatBillCycle(bill);
                  return (
                    <Pressable
                      key={bill.id}
                      onPress={() => isAdmin && openEditForm(bill)}
                      style={pressFeedback}
                      className={`flex-row items-center justify-between px-3.5 py-3 rounded-xl border ${
                        done
                          ? 'bg-sage-50 dark:bg-sage-900/30 border-sage-200 dark:border-sage-700'
                          : 'bg-gray-50 dark:bg-tabby-800 border-gray-100 dark:border-tabby-700'
                      }`}
                    >
                      <View className="flex-1 gap-0.5">
                        <Text className="font-nunito-semibold text-sm dark:text-white">{bill.name}</Text>
                        <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">
                          ${bill.amount.toFixed(2)} · split {cycle ? 'each cycle' : ''}
                        </Text>
                      </View>
                      {done ? (
                        <View className="flex-row items-center gap-1 bg-sage-500 rounded-full px-2.5 py-1">
                          <Feather name="check" size={11} color="#fff" />
                          <Text className="font-nunito-bold text-[11px] text-white">Logged</Text>
                        </View>
                      ) : (
                        <Pressable
                          onPress={() => handleConfirm(bill)}
                          disabled={busy}
                          style={pressFeedback}
                          accessibilityRole="button"
                          accessibilityLabel={`Confirm ${bill.name} paid`}
                          className="bg-tabby-600 dark:bg-white rounded-lg px-3 py-1.5"
                        >
                          <Text className="font-nunito-bold text-xs text-white dark:text-tabby-900">I paid this</Text>
                        </Pressable>
                      )}
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
                placeholder="Bill name (e.g. Rent, Power, Internet)"
                className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2.5 bg-white dark:bg-tabby-900 dark:text-white"
              />

              <TextInput
                value={form.amount}
                onChangeText={(amount) => setForm((f) => ({ ...f, amount }))}
                placeholder="Total amount (split equally among members)"
                keyboardType="decimal-pad"
                className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2.5 bg-white dark:bg-tabby-900 dark:text-white"
              />

              <View className="flex-row gap-2">
                {FREQUENCY_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.value}
                    onPress={() => setForm((f) => ({ ...f, frequency: opt.value, payWeekday: null, dayOfMonth: null }))}
                    style={pressFeedback}
                    className={`flex-1 rounded-lg py-2 items-center border ${
                      form.frequency === opt.value
                        ? 'bg-tabby-600 dark:bg-white border-tabby-600 dark:border-white'
                        : 'border-gray-300 dark:border-tabby-600'
                    }`}
                  >
                    <Text
                      className={`font-nunito-medium text-sm ${
                        form.frequency === opt.value ? 'text-white dark:text-tabby-900' : 'text-gray-700 dark:text-tabby-200'
                      }`}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {form.frequency && (
                <Pressable
                  onPress={() => (form.frequency === 'monthly' ? setShowDayOfMonthPicker(true) : setShowWeekdayPicker(true))}
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

              {message && <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-xs">{message}</Text>}

              <Pressable
                onPress={handleSaveForm}
                disabled={busy}
                style={pressFeedback}
                className="rounded-lg py-2.5 items-center bg-tabby-600 dark:bg-white mt-1"
              >
                {busy ? (
                  <ActivityIndicator color={isDark ? '#2B1810' : 'white'} />
                ) : (
                  <Text className="font-nunito-semibold text-white dark:text-tabby-900 text-sm">Save bill</Text>
                )}
              </Pressable>

              {form.id && (
                <Pressable
                  onPress={() =>
                    Alert.alert('Delete this bill?', `"${form.name}" will stop recurring. Already-split expenses stay.`, [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: async () => {
                          const bill = bills.find((b) => b.id === form.id);
                          if (bill) {
                            await handleDelete(bill);
                            setView('list');
                          }
                        },
                      },
                    ])
                  }
                  style={pressFeedback}
                  className="py-2 items-center"
                >
                  <Text className="font-nunito-semibold text-rust-600 text-sm">Delete bill</Text>
                </Pressable>
              )}
            </ScrollView>
          )}

          <Modal visible={showWeekdayPicker} animationType="slide" transparent>
            <View className="flex-1 bg-black/40 justify-end">
              <View className="bg-white dark:bg-tabby-900 rounded-t-2xl p-4 gap-1">
                <Text className="font-fredoka-semibold text-lg dark:text-white mb-2">Which day does it repeat?</Text>
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
                    {form.payWeekday === i && <Feather name="check" size={18} color={isDark ? '#E8C39E' : '#8B5A2B'} />}
                  </Pressable>
                ))}
                <Pressable onPress={() => setShowWeekdayPicker(false)} style={pressFeedback} className="py-3 items-center">
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
                          form.dayOfMonth === day ? 'text-white dark:text-tabby-900' : 'text-gray-800 dark:text-white'
                        }`}
                      >
                        {day}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable onPress={() => setShowDayOfMonthPicker(false)} style={pressFeedback} className="py-3 items-center">
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
