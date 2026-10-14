import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth-context';
import {
  cancelAllPaydayReminders,
  requestPaydayNotificationPermission,
  schedulePaydayReminder,
} from '@/lib/payday-notifications';
import {
  clearIncomeSettings,
  fetchIncomeSettings,
  getNextPaydayDate,
  updateIncomeSettings,
  type IncomeFrequency,
} from '@/lib/profile';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const FREQUENCY_OPTIONS: { value: IncomeFrequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
];

function FieldButton({
  label,
  disabled,
  busy,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  busy?: boolean;
  onPress: () => void;
}) {
  const isDark = useColorScheme() === 'dark';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={pressFeedback}
      className={`rounded-lg py-2.5 items-center ${disabled ? 'bg-gray-300 dark:bg-tabby-700' : 'bg-tabby-600 dark:bg-white'}`}
      accessibilityRole="button"
    >
      {busy ? (
        <ActivityIndicator color={isDark ? '#2B1810' : 'white'} />
      ) : (
        <Text className="font-nunito-semibold text-white dark:text-tabby-900 text-sm">{label}</Text>
      )}
    </Pressable>
  );
}

// Deliberately NOT reachable by tapping the Earned cell -- Earned shows
// actual recorded income transactions, and this edits a forecast figure
// (expected pay + payday) used only to compute the pay cycle Budget rides
// on. Naming this "Earnings" and making Earned open it was tried and
// caused real confusion (why does Earned still say $0.00 after I set my
// earnings?) -- only reachable via Budget's "set your pay schedule first"
// redirect now. Clearing this also clears any budget (see
// clearIncomeSettings), since a budget can't exist without a pay cycle --
// BudgetModal's own gating on `settings !== null` relies on that.
export function PayScheduleModal({
  visible,
  onClose,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const isDark = useColorScheme() === 'dark';

  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<IncomeFrequency | null>(null);
  const [payWeekday, setPayWeekday] = useState<number | null>(null);
  const [payDayOfMonth, setPayDayOfMonth] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showWeekdayPicker, setShowWeekdayPicker] = useState(false);
  const [showDayOfMonthPicker, setShowDayOfMonthPicker] = useState(false);

  useEffect(() => {
    if (!visible || !userId) return;
    setLoading(true);
    setMessage(null);
    fetchIncomeSettings(userId)
      .then((income) => {
        setAmount(income ? String(income.amount) : '');
        setFrequency(income?.frequency ?? null);
        setPayWeekday(income?.payWeekday ?? null);
        setPayDayOfMonth(income?.payDayOfMonth ?? null);
      })
      .finally(() => setLoading(false));
  }, [visible, userId]);

  const handleSave = async () => {
    if (!userId) return;
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setMessage('Enter a valid amount.');
      return;
    }
    if (!frequency) {
      setMessage('Choose how often you get paid.');
      return;
    }
    if ((frequency === 'weekly' || frequency === 'biweekly') && payWeekday === null) {
      setMessage('Choose which day you get paid.');
      return;
    }
    if (frequency === 'monthly' && !payDayOfMonth) {
      setMessage('Choose which day of the month you get paid.');
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const savedSettings = {
        amount: parsedAmount,
        frequency,
        payWeekday: frequency === 'monthly' ? null : payWeekday,
        payDayOfMonth: frequency === 'monthly' ? payDayOfMonth : null,
      };
      await updateIncomeSettings(userId, savedSettings);

      // Best-effort -- a denied permission or a scheduling hiccup
      // shouldn't block saving the pay schedule itself.
      try {
        const granted = await requestPaydayNotificationPermission();
        const nextPayday = getNextPaydayDate(savedSettings);
        if (granted && nextPayday) await schedulePaydayReminder(nextPayday);
      } catch {
        // payday reminder just won't fire -- the in-app bell check still works
      }

      onSaved?.();
      onClose();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save income.');
    } finally {
      setBusy(false);
    }
  };

  const handleClear = async () => {
    if (!userId) return;
    setBusy(true);
    try {
      await clearIncomeSettings(userId);
      await cancelAllPaydayReminders().catch(() => {});
      setAmount('');
      setFrequency(null);
      setPayWeekday(null);
      setPayDayOfMonth(null);
      onSaved?.();
      onClose();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to remove income.');
    } finally {
      setBusy(false);
    }
  };

  const payScheduleLabel =
    frequency === 'monthly'
      ? payDayOfMonth
        ? `Day ${payDayOfMonth} of the month`
        : 'Pick a day of the month'
      : payWeekday !== null
        ? WEEKDAYS[payWeekday]
        : 'Pick a day of the week';

  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-white dark:bg-tabby-900">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-tabby-700">
            <Text className="font-fredoka-semibold text-xl dark:text-white">Pay Schedule</Text>
            <Pressable
              onPress={onClose}
              style={pressFeedback}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text className="font-nunito-semibold text-tabby-600 dark:text-white">Done</Text>
            </Pressable>
          </View>

          {loading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator />
            </View>
          ) : (
            <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
                <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
                  How much you expect to be paid, and how often. This sets the pay cycle Budget measures
                  against -- it won&apos;t change the Earned total, which only counts income transactions you
                  log yourself.
                </Text>

                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="Amount per pay"
                  keyboardType="decimal-pad"
                  className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2.5 bg-white dark:bg-tabby-900 dark:text-white"
                />

                <View className="flex-row gap-2">
                  {FREQUENCY_OPTIONS.map((opt) => (
                    <Pressable
                      key={opt.value}
                      onPress={() => {
                        setFrequency(opt.value);
                        setPayWeekday(null);
                        setPayDayOfMonth(null);
                      }}
                      style={pressFeedback}
                      className={`flex-1 rounded-lg py-2 items-center border ${
                        frequency === opt.value
                          ? 'bg-tabby-600 dark:bg-white border-tabby-600 dark:border-white'
                          : 'border-gray-300 dark:border-tabby-600'
                      }`}
                    >
                      <Text
                        className={`font-nunito-medium text-sm ${
                          frequency === opt.value
                            ? 'text-white dark:text-tabby-900'
                            : 'text-gray-700 dark:text-tabby-200'
                        }`}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {frequency && (
                  <Pressable
                    onPress={() =>
                      frequency === 'monthly' ? setShowDayOfMonthPicker(true) : setShowWeekdayPicker(true)
                    }
                    style={pressFeedback}
                    className="flex-row items-center justify-between border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2.5"
                  >
                    <Text className="font-nunito text-gray-800 dark:text-white text-sm">
                      {payScheduleLabel}
                    </Text>
                    <Feather
                      name={frequency === 'monthly' ? 'calendar' : 'chevron-right'}
                      size={16}
                      color={isDark ? '#E8C39E' : '#9ca3af'}
                    />
                  </Pressable>
                )}

                {message && (
                  <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-xs">{message}</Text>
                )}

                <View className="flex-row gap-2 mt-1">
                  <View className="flex-1">
                    <FieldButton label="Save pay schedule" busy={busy} onPress={handleSave} />
                  </View>
                  {frequency && (
                    <Pressable
                      onPress={handleClear}
                      disabled={busy}
                      style={pressFeedback}
                      className="px-4 py-2.5 items-center justify-center rounded-lg bg-red-50 dark:bg-red-950"
                      accessibilityRole="button"
                      accessibilityLabel="Remove pay schedule"
                    >
                      <Feather name="trash-2" size={16} color="#ef4444" />
                    </Pressable>
                  )}
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          )}
        </SafeAreaView>
      </SafeAreaProvider>

      <Modal visible={showWeekdayPicker} animationType="slide" transparent>
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-white dark:bg-tabby-900 rounded-t-2xl p-4 gap-1">
            <Text className="font-fredoka-semibold text-lg dark:text-white mb-2">
              Which day do you get paid?
            </Text>
            {WEEKDAYS.map((day, i) => (
              <Pressable
                key={day}
                onPress={() => {
                  setPayWeekday(i);
                  setShowWeekdayPicker(false);
                }}
                style={pressFeedback}
                className="flex-row items-center justify-between py-3 px-2 border-b border-gray-100 dark:border-tabby-700"
              >
                <Text className="font-nunito text-gray-800 dark:text-white">{day}</Text>
                {payWeekday === i && (
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
            <Text className="font-fredoka-semibold text-lg dark:text-white">
              Which day of the month do you get paid?
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                <Pressable
                  key={day}
                  onPress={() => {
                    setPayDayOfMonth(day);
                    setShowDayOfMonthPicker(false);
                  }}
                  style={pressFeedback}
                  className={`w-[12.5%] aspect-square items-center justify-center rounded-full ${
                    payDayOfMonth === day ? 'bg-tabby-600 dark:bg-white' : ''
                  }`}
                >
                  <Text
                    className={`font-nunito-medium text-sm ${
                      payDayOfMonth === day
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
              Paid on the 31st in a shorter month? We&apos;ll use the last day of that month instead.
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
    </Modal>
  );
}
