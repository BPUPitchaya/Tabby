import { Feather } from '@expo/vector-icons';
import { useEffect, useState, type ReactNode } from 'react';
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
  clearIncomeSettings,
  fetchIncomeSettings,
  fetchProfile,
  updateDisplayName,
  updateEmail,
  updateIncomeSettings,
  updatePassword,
  type IncomeFrequency,
} from '@/lib/profile';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const FREQUENCY_OPTIONS: { value: IncomeFrequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
];

// A labeled field with its own Save button -- each section of this screen
// saves independently (name / email / password / income), rather than one
// giant form-wide submit, since they're unrelated pieces of data with very
// different failure modes (email needs a confirmation click, password
// needs its own validation, etc).
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300 text-xs tracking-wide px-1">
        {title}
      </Text>
      <View className="bg-gray-50 dark:bg-tabby-800 rounded-2xl border border-gray-100 dark:border-tabby-700 p-4 gap-3">
        {children}
      </View>
    </View>
  );
}

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
      accessibilityRole="button">
      {busy ? (
        <ActivityIndicator color={isDark ? '#2B1810' : 'white'} />
      ) : (
        <Text className="font-nunito-semibold text-white dark:text-tabby-900 text-sm">{label}</Text>
      )}
    </Pressable>
  );
}

export function EditProfileModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const isDark = useColorScheme() === 'dark';

  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [nameBusy, setNameBusy] = useState(false);
  const [nameMessage, setNameMessage] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);

  const [incomeAmount, setIncomeAmount] = useState('');
  const [incomeFrequency, setIncomeFrequency] = useState<IncomeFrequency | null>(null);
  const [incomePayWeekday, setIncomePayWeekday] = useState<number | null>(null);
  const [incomePayDayOfMonth, setIncomePayDayOfMonth] = useState<number | null>(null);
  const [incomeBusy, setIncomeBusy] = useState(false);
  const [incomeMessage, setIncomeMessage] = useState<string | null>(null);
  const [showWeekdayPicker, setShowWeekdayPicker] = useState(false);
  const [showDayOfMonthPicker, setShowDayOfMonthPicker] = useState(false);

  useEffect(() => {
    if (!visible || !userId) return;
    setLoading(true);
    Promise.all([fetchProfile(userId), fetchIncomeSettings(userId)])
      .then(([profile, income]) => {
        setName(profile.display_name);
        setIncomeAmount(income ? String(income.amount) : '');
        setIncomeFrequency(income?.frequency ?? null);
        setIncomePayWeekday(income?.payWeekday ?? null);
        setIncomePayDayOfMonth(income?.payDayOfMonth ?? null);
      })
      .finally(() => setLoading(false));
  }, [visible, userId]);

  const handleClose = () => {
    setNewEmail('');
    setNewPassword('');
    setNameMessage(null);
    setEmailMessage(null);
    setPasswordMessage(null);
    setIncomeMessage(null);
    onClose();
  };

  const handleSaveName = async () => {
    if (!userId || !name.trim()) return;
    setNameBusy(true);
    setNameMessage(null);
    try {
      await updateDisplayName(userId, name.trim());
      setNameMessage('Saved.');
    } catch (err) {
      setNameMessage(err instanceof Error ? err.message : 'Failed to save name.');
    } finally {
      setNameBusy(false);
    }
  };

  const handleUpdateEmail = async () => {
    if (!newEmail.trim() || !newEmail.includes('@')) {
      setEmailMessage('Enter a valid email address.');
      return;
    }
    setEmailBusy(true);
    setEmailMessage(null);
    try {
      await updateEmail(newEmail.trim());
      setEmailMessage(`Check ${newEmail.trim()} for a confirmation link -- your email won't change until you click it.`);
      setNewEmail('');
    } catch (err) {
      setEmailMessage(err instanceof Error ? err.message : 'Failed to update email.');
    } finally {
      setEmailBusy(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (newPassword.length < 6) {
      setPasswordMessage('Password must be at least 6 characters.');
      return;
    }
    setPasswordBusy(true);
    setPasswordMessage(null);
    try {
      await updatePassword(newPassword);
      setPasswordMessage('Password updated.');
      setNewPassword('');
    } catch (err) {
      setPasswordMessage(err instanceof Error ? err.message : 'Failed to update password.');
    } finally {
      setPasswordBusy(false);
    }
  };

  const handleSaveIncome = async () => {
    if (!userId) return;
    const amount = parseFloat(incomeAmount);
    if (isNaN(amount) || amount <= 0) {
      setIncomeMessage('Enter a valid amount.');
      return;
    }
    if (!incomeFrequency) {
      setIncomeMessage('Choose how often you get paid.');
      return;
    }
    if ((incomeFrequency === 'weekly' || incomeFrequency === 'biweekly') && incomePayWeekday === null) {
      setIncomeMessage('Choose which day you get paid.');
      return;
    }
    if (incomeFrequency === 'monthly' && !incomePayDayOfMonth) {
      setIncomeMessage('Choose which day of the month you get paid.');
      return;
    }

    setIncomeBusy(true);
    setIncomeMessage(null);
    try {
      await updateIncomeSettings(userId, {
        amount,
        frequency: incomeFrequency,
        payWeekday: incomeFrequency === 'monthly' ? null : incomePayWeekday,
        payDayOfMonth: incomeFrequency === 'monthly' ? incomePayDayOfMonth : null,
      });
      setIncomeMessage('Saved.');
    } catch (err) {
      setIncomeMessage(err instanceof Error ? err.message : 'Failed to save income.');
    } finally {
      setIncomeBusy(false);
    }
  };

  const handleClearIncome = async () => {
    if (!userId) return;
    setIncomeBusy(true);
    try {
      await clearIncomeSettings(userId);
      setIncomeAmount('');
      setIncomeFrequency(null);
      setIncomePayWeekday(null);
      setIncomePayDayOfMonth(null);
      setIncomeMessage('Removed.');
    } catch (err) {
      setIncomeMessage(err instanceof Error ? err.message : 'Failed to remove income.');
    } finally {
      setIncomeBusy(false);
    }
  };

  const payScheduleLabel =
    incomeFrequency === 'monthly'
      ? incomePayDayOfMonth
        ? `Day ${incomePayDayOfMonth} of the month`
        : 'Pick a day of the month'
      : incomePayWeekday !== null
        ? WEEKDAYS[incomePayWeekday]
        : 'Pick a day of the week';

  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-white dark:bg-tabby-900">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-tabby-700">
            <Text className="font-fredoka-semibold text-xl dark:text-white">Edit Profile</Text>
            <Pressable
              onPress={handleClose}
              style={pressFeedback}
              accessibilityRole="button"
              accessibilityLabel="Close">
              <Text className="font-nunito-semibold text-tabby-600 dark:text-white">Done</Text>
            </Pressable>
          </View>

          {loading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator />
            </View>
          ) : (
            <KeyboardAvoidingView
              className="flex-1"
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
                <Section title="NAME">
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="Display name"
                    autoCapitalize="words"
                    className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2 bg-white dark:bg-tabby-900"
                  />
                  {nameMessage && (
                    <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-xs">
                      {nameMessage}
                    </Text>
                  )}
                  <FieldButton label="Save name" busy={nameBusy} onPress={handleSaveName} />
                </Section>

                <Section title="EMAIL">
                  <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
                    Current: {session?.user.email}
                  </Text>
                  <TextInput
                    value={newEmail}
                    onChangeText={setNewEmail}
                    placeholder="New email address"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2 bg-white dark:bg-tabby-900"
                  />
                  {emailMessage && (
                    <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-xs">
                      {emailMessage}
                    </Text>
                  )}
                  <FieldButton label="Update email" busy={emailBusy} onPress={handleUpdateEmail} />
                </Section>

                <Section title="PASSWORD">
                  <TextInput
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="New password"
                    secureTextEntry
                    className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2 bg-white dark:bg-tabby-900"
                  />
                  {passwordMessage && (
                    <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-xs">
                      {passwordMessage}
                    </Text>
                  )}
                  <FieldButton
                    label="Update password"
                    busy={passwordBusy}
                    onPress={handleUpdatePassword}
                  />
                </Section>

                <Section title="INCOME">
                  <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-xs">
                    Used on the dashboard to show how much of your income you&apos;ve spent so far
                    this pay cycle. Separate from the income transactions you log yourself.
                  </Text>

                  <TextInput
                    value={incomeAmount}
                    onChangeText={setIncomeAmount}
                    placeholder="Amount per pay"
                    keyboardType="decimal-pad"
                    className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2 bg-white dark:bg-tabby-900"
                  />

                  <View className="flex-row gap-2">
                    {FREQUENCY_OPTIONS.map((opt) => (
                      <Pressable
                        key={opt.value}
                        onPress={() => {
                          setIncomeFrequency(opt.value);
                          setIncomePayWeekday(null);
                          setIncomePayDayOfMonth(null);
                        }}
                        style={pressFeedback}
                        className={`flex-1 rounded-lg py-2 items-center border ${
                          incomeFrequency === opt.value
                            ? 'bg-tabby-600 dark:bg-white border-tabby-600 dark:border-white'
                            : 'border-gray-300 dark:border-tabby-600'
                        }`}>
                        <Text
                          className={`font-nunito-medium text-sm ${
                            incomeFrequency === opt.value
                              ? 'text-white dark:text-tabby-900'
                              : 'text-gray-700 dark:text-tabby-200'
                          }`}>
                          {opt.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {incomeFrequency && (
                    <Pressable
                      onPress={() =>
                        incomeFrequency === 'monthly'
                          ? setShowDayOfMonthPicker(true)
                          : setShowWeekdayPicker(true)
                      }
                      style={pressFeedback}
                      className="flex-row items-center justify-between border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2.5">
                      <Text className="font-nunito text-gray-800 dark:text-white text-sm">
                        {payScheduleLabel}
                      </Text>
                      <Feather
                        name={incomeFrequency === 'monthly' ? 'calendar' : 'chevron-right'}
                        size={16}
                        color={isDark ? '#E8C39E' : '#9ca3af'}
                      />
                    </Pressable>
                  )}

                  {incomeMessage && (
                    <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-xs">
                      {incomeMessage}
                    </Text>
                  )}

                  <View className="flex-row gap-2">
                    <View className="flex-1">
                      <FieldButton label="Save income" busy={incomeBusy} onPress={handleSaveIncome} />
                    </View>
                    {incomeFrequency && (
                      <Pressable
                        onPress={handleClearIncome}
                        disabled={incomeBusy}
                        style={pressFeedback}
                        className="px-4 py-2.5 items-center justify-center rounded-lg bg-red-50 dark:bg-red-950"
                        accessibilityRole="button"
                        accessibilityLabel="Remove income">
                        <Feather name="trash-2" size={16} color="#ef4444" />
                      </Pressable>
                    )}
                  </View>
                </Section>
              </ScrollView>
            </KeyboardAvoidingView>
          )}
        </SafeAreaView>
      </SafeAreaProvider>

      {/* Weekly/fortnightly -- which day of the week. */}
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
                  setIncomePayWeekday(i);
                  setShowWeekdayPicker(false);
                }}
                style={pressFeedback}
                className="flex-row items-center justify-between py-3 px-2 border-b border-gray-100 dark:border-tabby-700">
                <Text className="font-nunito text-gray-800 dark:text-white">{day}</Text>
                {incomePayWeekday === i && (
                  <Feather name="check" size={18} color={isDark ? '#E8C39E' : '#8B5A2B'} />
                )}
              </Pressable>
            ))}
            <Pressable
              onPress={() => setShowWeekdayPicker(false)}
              style={pressFeedback}
              className="py-3 items-center">
              <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300">Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Monthly -- which day of the month, calendar-grid style. */}
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
                    setIncomePayDayOfMonth(day);
                    setShowDayOfMonthPicker(false);
                  }}
                  style={pressFeedback}
                  className={`w-[12.5%] aspect-square items-center justify-center rounded-full ${
                    incomePayDayOfMonth === day ? 'bg-tabby-600 dark:bg-white' : ''
                  }`}>
                  <Text
                    className={`font-nunito-medium text-sm ${
                      incomePayDayOfMonth === day
                        ? 'text-white dark:text-tabby-900'
                        : 'text-gray-800 dark:text-white'
                    }`}>
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
              className="py-3 items-center">
              <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300">Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}
