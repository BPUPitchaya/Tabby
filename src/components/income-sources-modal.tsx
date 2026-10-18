// Multi-job income management -- list + form, same shape as bills-modal.tsx.
// Phase 2's replacement for Pay Schedule's own entry points (Home's Earned
// cell, Budget's redirect) -- Pay Schedule itself is deleted, no remaining
// callers. Phase 5 cut Earned/Budget over to read the primary income
// source's cycle + budget_amount directly (see getIncomeSourceProgress in
// income-sources.ts), so the "won't change Earned" disclaimer below refers
// to the Earned total specifically staying a record of logged
// transactions -- it's not a stale leftover from before the cutover.
// See income-sources.ts / 0028_add_income_sources.sql / 0030_add_budget_amount_to_income_sources.sql.
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

import { useAuth } from '@/lib/auth-context';
import {
  canUseTaxCode,
  createIncomeSource,
  getPrimaryIncomeSource,
  deleteIncomeSource,
  fetchIncomeSources,
  KIWISAVER_OPTIONS,
  setPrimaryIncomeSource,
  TAX_CODE_OPTIONS,
  updateIncomeSource,
  type IncomeMode,
  type IncomeSource,
  type KiwiSaverPct,
  type TrackingMode,
} from '@/lib/income-sources';
import { computeNetPay, type NzTaxCode } from '@/lib/nz-tax';
import type { IncomeFrequency } from '@/lib/profile';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

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
  label: string;
  isPrimary: boolean;
  mode: IncomeMode;
  amount: string;
  hourlyRate: string;
  frequency: IncomeFrequency | null;
  payWeekday: number | null;
  dayOfMonth: number | null;
  trackingMode: TrackingMode;
  taxCode: string | null;
  hasStudentLoan: boolean;
  kiwiSaverPct: KiwiSaverPct | null;
};

const EMPTY_FORM: FormState = {
  id: null,
  label: '',
  isPrimary: false,
  mode: 'fixed',
  amount: '',
  hourlyRate: '',
  frequency: null,
  payWeekday: null,
  dayOfMonth: null,
  trackingMode: 'gross',
  taxCode: null,
  hasStudentLoan: false,
  kiwiSaverPct: null,
};

export function IncomeSourcesModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const isDark = useColorScheme() === 'dark';
  const { session } = useAuth();
  const userId = session?.user.id;

  const [view, setView] = useState<'list' | 'form'>('list');
  const [sources, setSources] = useState<IncomeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showWeekdayPicker, setShowWeekdayPicker] = useState(false);
  const [showDayOfMonthPicker, setShowDayOfMonthPicker] = useState(false);

  const load = async () => {
    if (!userId) return;
    try {
      setSources(await fetchIncomeSources(userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load income sources.');
    }
  };

  useEffect(() => {
    if (!visible) return;
    setView('list');
    setError(null);
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [visible, userId]);

  const beginAddForm = () => {
    setForm({ ...EMPTY_FORM, isPrimary: sources.length === 0 });
    setMessage(null);
    setView('form');
  };

  const openEditForm = (source: IncomeSource) => {
    setForm({
      id: source.id,
      label: source.label,
      isPrimary: source.isPrimary,
      mode: source.mode,
      amount: source.amount !== null ? String(source.amount) : '',
      hourlyRate: source.hourlyRate !== null ? String(source.hourlyRate) : '',
      frequency: source.frequency,
      payWeekday: source.payWeekday,
      dayOfMonth: source.dayOfMonth,
      trackingMode: source.trackingMode,
      taxCode: source.taxCode,
      hasStudentLoan: source.hasStudentLoan,
      kiwiSaverPct: source.kiwiSaverPct,
    });
    setMessage(null);
    setView('form');
  };

  const handleSaveForm = async () => {
    if (!userId) return;
    if (!form.label.trim()) {
      setMessage('Give this income source a name (e.g. a job title or employer).');
      return;
    }
    if (!form.frequency) {
      setMessage('Choose how often you get paid.');
      return;
    }
    if ((form.frequency === 'weekly' || form.frequency === 'biweekly') && form.payWeekday === null) {
      setMessage('Choose which day you get paid.');
      return;
    }
    if (form.frequency === 'monthly' && !form.dayOfMonth) {
      setMessage('Choose which day of the month you get paid.');
      return;
    }

    let amount: number | null = null;
    let hourlyRate: number | null = null;
    if (form.mode === 'fixed') {
      amount = parseFloat(form.amount);
      if (isNaN(amount) || amount <= 0) {
        setMessage('Enter a valid amount, or switch to hourly.');
        return;
      }
    } else {
      hourlyRate = parseFloat(form.hourlyRate);
      if (isNaN(hourlyRate) || hourlyRate <= 0) {
        setMessage('Enter a valid hourly rate.');
        return;
      }
    }

    if (form.trackingMode === 'net' && form.taxCode) {
      if (!canUseTaxCode(sources, form.taxCode, form.id)) {
        setMessage(
          `${form.taxCode} is already used by another income source. Only one concurrent job can use the main tax code -- this one probably needs a secondary code (S, SB, SH, or ST) instead.`,
        );
        return;
      }
    }

    setBusy(true);
    setMessage(null);
    try {
      const params = {
        label: form.label,
        isPrimary: form.isPrimary,
        mode: form.mode,
        amount,
        hourlyRate,
        frequency: form.frequency,
        payWeekday: form.frequency === 'monthly' ? null : form.payWeekday,
        dayOfMonth: form.frequency === 'monthly' ? form.dayOfMonth : null,
        trackingMode: form.trackingMode,
        taxCode: form.trackingMode === 'net' ? form.taxCode : null,
        hasStudentLoan: form.trackingMode === 'net' ? form.hasStudentLoan : false,
        kiwiSaverPct: form.trackingMode === 'net' ? form.kiwiSaverPct : null,
      };

      if (form.id) {
        await updateIncomeSource(form.id, userId, params);
        // setPrimaryIncomeSource handles clearing any other primary first --
        // only call it when this source is actually meant to become
        // primary, never to un-set it to false by itself (there must
        // always be exactly one primary once any source exists).
        if (form.isPrimary) await setPrimaryIncomeSource(userId, form.id);
      } else {
        const id = await createIncomeSource(userId, params);
        if (form.isPrimary) await setPrimaryIncomeSource(userId, id);
      }

      await load();
      setView('list');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save income source.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (source: IncomeSource) => {
    setBusy(true);
    try {
      await deleteIncomeSource(source.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete income source.');
    } finally {
      setBusy(false);
    }
  };

  const presentSourceActions = (source: IncomeSource) => {
    const options = ['Edit', 'Delete', 'Cancel'];
    const handle = (index: number | undefined) => {
      if (index === 0) openEditForm(source);
      if (index === 1) {
        Alert.alert('Delete this income source?', source.label, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => handleDelete(source) },
        ]);
      }
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, destructiveButtonIndex: 1, cancelButtonIndex: 2 },
        handle,
      );
    } else {
      Alert.alert(source.label, undefined, [
        { text: 'Edit', onPress: () => handle(0) },
        { text: 'Delete', style: 'destructive', onPress: () => handle(1) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

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
              <Text className="font-fredoka-semibold text-xl dark:text-white">Income Sources</Text>
            )}
            {view === 'form' && (
              <Text className="font-fredoka-semibold text-xl dark:text-white">
                {form.id ? 'Edit Income' : 'Add Income'}
              </Text>
            )}
            {view === 'list' ? (
              <View className="flex-row items-center gap-4">
                <Pressable
                  onPress={beginAddForm}
                  style={pressFeedback}
                  accessibilityRole="button"
                  accessibilityLabel="Add income source"
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
              <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
                Add each job you&apos;re paid by, how much and how often. This sets the pay cycle Budget
                measures against -- it won&apos;t change the Earned total, which only counts income
                transactions you log yourself (confirmed from the bell, or added by hand).
              </Text>
              {error && (
                <View className="px-3 py-2 bg-red-50 dark:bg-red-950 rounded-lg">
                  <Text className="font-nunito text-red-600 dark:text-red-400 text-sm">{error}</Text>
                </View>
              )}
              {sources.length === 0 ? (
                <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
                  No income sources yet. Add your first one below.
                </Text>
              ) : (
                sources.map((source) => (
                  <Pressable
                    key={source.id}
                    onPress={() => presentSourceActions(source)}
                    disabled={busy}
                    style={pressFeedback}
                    className="rounded-xl px-3 py-2.5 bg-gray-50 dark:bg-tabby-800 border border-gray-100 dark:border-tabby-700 gap-1.5"
                  >
                    <View className="flex-row items-center gap-2">
                      <Text className="font-nunito-medium dark:text-white flex-1">{source.label}</Text>
                      {source.isPrimary && (
                        <View className="bg-tabby-100 dark:bg-tabby-700 rounded-md px-1.5 py-0.5">
                          <Text className="font-nunito-bold text-[10px] text-tabby-700 dark:text-tabby-200">
                            Primary
                          </Text>
                        </View>
                      )}
                      <View className="bg-sage-100 dark:bg-sage-800 rounded-md px-1.5 py-0.5">
                        <Text className="font-nunito-bold text-[10px] text-sage-700 dark:text-sage-200">
                          {source.trackingMode === 'net' ? 'Net' : 'Gross'}
                        </Text>
                      </View>
                    </View>
                    <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">
                      {source.mode === 'fixed'
                        ? `$${(source.amount ?? 0).toFixed(2)}`
                        : `$${(source.hourlyRate ?? 0).toFixed(2)}/hr`}{' '}
                      ·{' '}
                      {source.frequency === 'monthly'
                        ? `Monthly, day ${source.dayOfMonth}`
                        : `${source.frequency === 'weekly' ? 'Weekly' : 'Fortnightly'}, ${WEEKDAYS[source.payWeekday ?? 0]}`}
                    </Text>
                  </Pressable>
                ))
              )}
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
              <TextInput
                value={form.label}
                onChangeText={(label) => setForm((f) => ({ ...f, label }))}
                placeholder="e.g. Countdown, Main job"
                className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2.5 bg-white dark:bg-tabby-900 dark:text-white"
              />

              <View className="gap-1.5">
                <Text className="font-nunito-semibold text-xs text-gray-500 dark:text-tabby-300 tracking-wide">
                  PAY TYPE
                </Text>
                <View className="flex-row gap-1.5 p-1 bg-gray-100 dark:bg-tabby-800 rounded-xl">
                  {(['fixed', 'hourly'] as const).map((mode) => (
                    <Pressable
                      key={mode}
                      onPress={() => setForm((f) => ({ ...f, mode }))}
                      style={(state) => [pressFeedback(state), form.mode === mode && SEGMENT_SHADOW]}
                      className={`flex-1 rounded-lg py-2 items-center ${form.mode === mode ? 'bg-white dark:bg-tabby-900' : ''}`}
                    >
                      <Text
                        className={`font-nunito-semibold text-sm ${
                          form.mode === mode
                            ? 'text-gray-900 dark:text-white'
                            : 'text-gray-500 dark:text-tabby-300'
                        }`}
                      >
                        {mode === 'fixed' ? 'Fixed amount' : 'Hourly'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {form.mode === 'fixed' ? (
                <TextInput
                  value={form.amount}
                  onChangeText={(amount) => setForm((f) => ({ ...f, amount }))}
                  placeholder="Amount per pay"
                  keyboardType="decimal-pad"
                  className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2.5 bg-white dark:bg-tabby-900 dark:text-white"
                />
              ) : (
                <TextInput
                  value={form.hourlyRate}
                  onChangeText={(hourlyRate) => setForm((f) => ({ ...f, hourlyRate }))}
                  placeholder="Hourly rate"
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

              <View className="flex-row items-center justify-between rounded-lg border border-gray-300 dark:border-tabby-600 px-3 py-2.5">
                <Text className="font-nunito-medium dark:text-white">Primary income</Text>
                <Switch
                  value={form.isPrimary}
                  onValueChange={(isPrimary) => {
                    // Turning it off is non-destructive -- only this row
                    // changes. Turning it on replaces whichever other
                    // source currently holds it, so confirm that swap
                    // before it's saved, same as any other irreversible-
                    // feeling settings change.
                    const currentPrimary = getPrimaryIncomeSource(sources);
                    if (isPrimary && currentPrimary && currentPrimary.id !== form.id) {
                      Alert.alert(
                        'Make this your primary income?',
                        `Budget and your overall pay cycle will switch to follow this source instead of "${currentPrimary.label}".`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Make primary', onPress: () => setForm((f) => ({ ...f, isPrimary: true })) },
                        ],
                      );
                      return;
                    }
                    setForm((f) => ({ ...f, isPrimary }));
                  }}
                />
              </View>
              <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300 -mt-2">
                Budget and the overall pay cycle follow your primary source. Only one can be primary at a
                time.
              </Text>

              <View className="gap-1.5">
                <Text className="font-nunito-semibold text-xs text-gray-500 dark:text-tabby-300 tracking-wide">
                  TRACKING
                </Text>
                <View className="flex-row gap-1.5 p-1 bg-gray-100 dark:bg-tabby-800 rounded-xl">
                  {(['gross', 'net'] as const).map((trackingMode) => (
                    <Pressable
                      key={trackingMode}
                      onPress={() => setForm((f) => ({ ...f, trackingMode }))}
                      style={(state) => [
                        pressFeedback(state),
                        form.trackingMode === trackingMode && SEGMENT_SHADOW,
                      ]}
                      className={`flex-1 rounded-lg py-2 items-center ${form.trackingMode === trackingMode ? 'bg-white dark:bg-tabby-900' : ''}`}
                    >
                      <Text
                        className={`font-nunito-semibold text-sm ${
                          form.trackingMode === trackingMode
                            ? 'text-gray-900 dark:text-white'
                            : 'text-gray-500 dark:text-tabby-300'
                        }`}
                      >
                        {trackingMode === 'gross' ? 'Gross' : 'Take-home (net)'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {form.trackingMode === 'net' && (
                <View className="gap-3 border border-gray-200 dark:border-tabby-700 rounded-xl p-3">
                  <View className="gap-1.5">
                    <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">Tax code</Text>
                    <View className="flex-row flex-wrap gap-2">
                      {TAX_CODE_OPTIONS.map((code) => (
                        <Pressable
                          key={code}
                          onPress={() =>
                            setForm((f) => ({ ...f, taxCode: code === f.taxCode ? null : code }))
                          }
                          style={pressFeedback}
                          className={`px-3 py-1.5 rounded-full border ${
                            form.taxCode === code
                              ? 'bg-tabby-600 dark:bg-white border-tabby-600 dark:border-white'
                              : 'border-gray-300 dark:border-tabby-600'
                          }`}
                        >
                          <Text
                            className={`font-nunito-medium text-sm ${
                              form.taxCode === code
                                ? 'text-white dark:text-tabby-900'
                                : 'text-gray-700 dark:text-tabby-200'
                            }`}
                          >
                            {code}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  <View className="flex-row items-center justify-between">
                    <Text className="font-nunito-medium text-sm dark:text-white">Student loan</Text>
                    <Switch
                      value={form.hasStudentLoan}
                      onValueChange={(hasStudentLoan) => setForm((f) => ({ ...f, hasStudentLoan }))}
                    />
                  </View>

                  <View className="gap-1.5">
                    <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">
                      KiwiSaver (leave unselected if not enrolled)
                    </Text>
                    <View className="flex-row flex-wrap gap-2">
                      {KIWISAVER_OPTIONS.map((pct) => (
                        <Pressable
                          key={pct}
                          onPress={() =>
                            setForm((f) => ({ ...f, kiwiSaverPct: pct === f.kiwiSaverPct ? null : pct }))
                          }
                          style={pressFeedback}
                          className={`px-3 py-1.5 rounded-full border ${
                            form.kiwiSaverPct === pct
                              ? 'bg-tabby-600 dark:bg-white border-tabby-600 dark:border-white'
                              : 'border-gray-300 dark:border-tabby-600'
                          }`}
                        >
                          <Text
                            className={`font-nunito-medium text-sm ${
                              form.kiwiSaverPct === pct
                                ? 'text-white dark:text-tabby-900'
                                : 'text-gray-700 dark:text-tabby-200'
                            }`}
                          >
                            {pct}%
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  {form.mode === 'fixed' && form.taxCode && form.frequency && parseFloat(form.amount) > 0 ? (
                    (() => {
                      const breakdown = computeNetPay({
                        grossPay: parseFloat(form.amount),
                        frequency: form.frequency!,
                        taxCode: form.taxCode as NzTaxCode,
                        hasStudentLoan: form.hasStudentLoan,
                        kiwiSaverPct: form.kiwiSaverPct,
                      });
                      return (
                        <View className="gap-1 bg-gray-50 dark:bg-tabby-800 rounded-lg p-2.5">
                          <View className="flex-row justify-between">
                            <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">
                              Income tax
                            </Text>
                            <Text className="font-nunito text-xs dark:text-white">
                              -${breakdown.incomeTax.toFixed(2)}
                            </Text>
                          </View>
                          <View className="flex-row justify-between">
                            <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">
                              ACC earner levy
                            </Text>
                            <Text className="font-nunito text-xs dark:text-white">
                              -${breakdown.accLevy.toFixed(2)}
                            </Text>
                          </View>
                          {form.hasStudentLoan && (
                            <View className="flex-row justify-between">
                              <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">
                                Student loan
                              </Text>
                              <Text className="font-nunito text-xs dark:text-white">
                                -${breakdown.studentLoan.toFixed(2)}
                              </Text>
                            </View>
                          )}
                          {form.kiwiSaverPct && (
                            <View className="flex-row justify-between">
                              <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">
                                KiwiSaver ({form.kiwiSaverPct}%)
                              </Text>
                              <Text className="font-nunito text-xs dark:text-white">
                                -${breakdown.kiwiSaver.toFixed(2)}
                              </Text>
                            </View>
                          )}
                          <View className="flex-row justify-between pt-1 mt-1 border-t border-gray-200 dark:border-tabby-700">
                            <Text className="font-nunito-semibold text-xs dark:text-white">
                              Estimated take-home
                            </Text>
                            <Text className="font-nunito-bold text-xs dark:text-white">
                              ${breakdown.netPay.toFixed(2)}
                            </Text>
                          </View>
                        </View>
                      );
                    })()
                  ) : (
                    <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">
                      Pick a tax code and enter an amount to see an estimated take-home figure. Hourly jobs
                      show their estimate per payday instead, once hours are entered.
                    </Text>
                  )}
                  <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">
                    Estimate only -- check your actual payslip.
                  </Text>
                </View>
              )}

              {message && (
                <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">{message}</Text>
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
                  <Text className="font-nunito-semibold text-white dark:text-tabby-900 text-sm">Save</Text>
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
