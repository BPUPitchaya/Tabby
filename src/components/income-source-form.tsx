// The actual income-source fields (name, pay type, amount, schedule,
// primary toggle, gross/net tracking + tax code), shared by
// income-sources-modal.tsx's Add/Edit screen and the income onboarding
// question (income-onboarding-question.tsx), so the two don't drift
// apart. Callers own the surrounding chrome (header, Save button, Skip)
// and the actual save/skip logic; this component only owns the fields.
import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { Alert, Modal, Pressable, Switch, Text, TextInput, useColorScheme, View } from 'react-native';

import {
  canUseTaxCode,
  getPrimaryIncomeSource,
  IRD_TAX_CODE_URL,
  KIWISAVER_OPTIONS,
  TAX_CODE_OPTIONS,
  type IncomeFormState,
  type IncomeSource,
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

export function IncomeSourceForm({
  form,
  setForm,
  sources,
  showPrimaryToggle = true,
}: {
  form: IncomeFormState;
  setForm: (updater: (f: IncomeFormState) => IncomeFormState) => void;
  sources: IncomeSource[];
  // The onboarding question creates the user's first source, which is
  // always primary: no other source exists yet to make the toggle a
  // real choice, so callers with an empty sources list can hide it.
  showPrimaryToggle?: boolean;
}) {
  const isDark = useColorScheme() === 'dark';
  const [showWeekdayPicker, setShowWeekdayPicker] = useState(false);
  const [showDayOfMonthPicker, setShowDayOfMonthPicker] = useState(false);

  const scheduleLabel =
    form.frequency === 'monthly'
      ? form.dayOfMonth
        ? `Day ${form.dayOfMonth} of the month`
        : 'Pick a day of the month'
      : form.payWeekday !== null
        ? WEEKDAYS[form.payWeekday]
        : 'Pick a day of the week';

  return (
    <>
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
                  form.mode === mode ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-tabby-300'
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

      {showPrimaryToggle && (
        <>
          <View className="flex-row items-center justify-between rounded-lg border border-gray-300 dark:border-tabby-600 px-3 py-2.5">
            <Text className="font-nunito-medium dark:text-white">Primary income</Text>
            <Switch
              value={form.isPrimary}
              onValueChange={(isPrimary) => {
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
            Budget and the overall pay cycle follow your primary source. Only one can be primary at a time.
          </Text>
        </>
      )}

      <View className="gap-1.5">
        <Text className="font-nunito-semibold text-xs text-gray-500 dark:text-tabby-300 tracking-wide">
          TRACKING
        </Text>
        <View className="flex-row gap-1.5 p-1 bg-gray-100 dark:bg-tabby-800 rounded-xl">
          {(['gross', 'net'] as const).map((trackingMode) => (
            <Pressable
              key={trackingMode}
              onPress={() => setForm((f) => ({ ...f, trackingMode }))}
              style={(state) => [pressFeedback(state), form.trackingMode === trackingMode && SEGMENT_SHADOW]}
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
                  onPress={() => setForm((f) => ({ ...f, taxCode: code === f.taxCode ? null : code }))}
                  style={pressFeedback}
                  className={`px-3 py-1.5 rounded-full border ${
                    form.taxCode === code
                      ? 'bg-tabby-600 dark:bg-white border-tabby-600 dark:border-white'
                      : 'border-gray-300 dark:border-tabby-600'
                  }`}
                >
                  <Text
                    className={`font-nunito-medium text-sm ${
                      form.taxCode === code ? 'text-white dark:text-tabby-900' : 'text-gray-700 dark:text-tabby-200'
                    }`}
                  >
                    {code}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              onPress={() => WebBrowser.openBrowserAsync(IRD_TAX_CODE_URL).catch(() => {})}
              style={pressFeedback}
              className="flex-row items-center gap-1.5 self-start mt-0.5"
              accessibilityRole="link"
              accessibilityLabel="Not sure which tax code to use? Check with IRD"
              accessibilityHint="opens the IRD website in your browser"
            >
              <Feather name="external-link" size={12} color="#8B5A2B" />
              <Text className="font-nunito text-xs text-tabby-700 dark:text-tabby-300 underline">
                Not sure which code? Check with IRD
              </Text>
            </Pressable>
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
                  onPress={() => setForm((f) => ({ ...f, kiwiSaverPct: pct === f.kiwiSaverPct ? null : pct }))}
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
                    <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">Income tax</Text>
                    <Text className="font-nunito text-xs dark:text-white">-${breakdown.incomeTax.toFixed(2)}</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">ACC earner levy</Text>
                    <Text className="font-nunito text-xs dark:text-white">-${breakdown.accLevy.toFixed(2)}</Text>
                  </View>
                  {form.hasStudentLoan && (
                    <View className="flex-row justify-between">
                      <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">Student loan</Text>
                      <Text className="font-nunito text-xs dark:text-white">-${breakdown.studentLoan.toFixed(2)}</Text>
                    </View>
                  )}
                  {form.kiwiSaverPct && (
                    <View className="flex-row justify-between">
                      <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">
                        KiwiSaver ({form.kiwiSaverPct}%)
                      </Text>
                      <Text className="font-nunito text-xs dark:text-white">-${breakdown.kiwiSaver.toFixed(2)}</Text>
                    </View>
                  )}
                  <View className="flex-row justify-between pt-1 mt-1 border-t border-gray-200 dark:border-tabby-700">
                    <Text className="font-nunito-semibold text-xs dark:text-white">Estimated take-home</Text>
                    <Text className="font-nunito-bold text-xs dark:text-white">${breakdown.netPay.toFixed(2)}</Text>
                  </View>
                </View>
              );
            })()
          ) : (
            <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">
              Pick a tax code and enter an amount to see an estimated take-home figure. Hourly jobs show their
              estimate per payday instead, once hours are entered.
            </Text>
          )}
          <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">
            Estimate only, check your actual payslip.
          </Text>
        </View>
      )}

      <Modal visible={showWeekdayPicker} animationType="slide" transparent>
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-white dark:bg-tabby-900 rounded-t-2xl p-4 gap-1">
            <Text className="font-fredoka-semibold text-lg dark:text-white mb-2">Which day is it due?</Text>
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
            <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-xs">
              Due on the 31st in a shorter month? We&apos;ll use the last day of that month instead.
            </Text>
            <Pressable onPress={() => setShowDayOfMonthPicker(false)} style={pressFeedback} className="py-3 items-center">
              <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300">Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}
