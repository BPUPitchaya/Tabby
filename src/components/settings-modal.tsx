import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { Segmented } from '@/components/segmented-control';
import {
  loadDashboardPeriodPreference,
  setDashboardPeriodPreference,
  type DashboardPeriodPreference,
} from '@/lib/dashboard-period-preference';
import { FONT_PACK_LABELS, useFontPreference, type FontPack } from '@/lib/font-preference';
import { loadThemePreference, setThemePreference, type ThemePreference } from '@/lib/theme-preference';
import {
  loadTrendPeriodPreference,
  setTrendPeriodPreference,
  type TrendPeriodPreference,
} from '@/lib/trend-period-preference';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Match device' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const FONT_OPTIONS: FontPack[] = ['default', 'fraunces', 'quicksand'];

const PERIOD_OPTIONS: { value: DashboardPeriodPreference; label: string }[] = [
  { value: 'pay-cycle', label: 'Pay schedule' },
  { value: 'calendar-month', label: 'Calendar month' },
];

const TREND_OPTIONS: { value: TrendPeriodPreference; label: string }[] = [
  { value: 'auto', label: 'Automatic' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="font-nunito-semibold text-sm text-gray-600 dark:text-tabby-200">{label}</Text>
      {children}
    </View>
  );
}

export function SettingsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [preference, setPreference] = useState<ThemePreference | null>(null);
  const { pack: fontPack, setPack: setFontPack } = useFontPreference();
  const [periodPreference, setPeriodPreference] = useState<DashboardPeriodPreference | null>(null);
  const [trendPreference, setTrendPreferenceState] = useState<TrendPeriodPreference | null>(null);

  useEffect(() => {
    if (visible) {
      loadThemePreference().then(setPreference);
      loadDashboardPeriodPreference().then(setPeriodPreference);
      loadTrendPeriodPreference().then(setTrendPreferenceState);
    }
  }, [visible]);

  const handleSelect = async (value: ThemePreference) => {
    setPreference(value); // optimistic -- the toggle should feel instant
    await setThemePreference(value);
  };

  const handleSelectPeriod = async (value: DashboardPeriodPreference) => {
    setPeriodPreference(value); // optimistic -- same as the other toggles here
    await setDashboardPeriodPreference(value);
  };

  const handleSelectTrend = async (value: TrendPeriodPreference) => {
    setTrendPreferenceState(value); // optimistic -- same as the other toggles here
    await setTrendPeriodPreference(value);
  };

  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-white dark:bg-tabby-900">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-tabby-700">
            <Text className="font-fredoka-semibold text-xl dark:text-white">Settings</Text>
            <Pressable
              onPress={onClose}
              style={pressFeedback}
              accessibilityRole="button"
              accessibilityLabel="Close">
              <Text className="font-nunito-semibold text-tabby-600 dark:text-white">Done</Text>
            </Pressable>
          </View>

          <View className="p-4 gap-6">
            {/* Theme and font are both purely visual preferences -- one
                card, not two near-identical boxes. */}
            <View className="gap-2">
              <Text className="font-nunito-bold text-[11px] tracking-wide text-gray-400 dark:text-tabby-400 px-1">
                APPEARANCE
              </Text>
              <View className="bg-gray-50 dark:bg-tabby-800 rounded-2xl border border-gray-100 dark:border-tabby-700 p-4 gap-4">
                <Field label="Theme">
                  <Segmented options={THEME_OPTIONS} value={preference} onChange={handleSelect} />
                </Field>
                <View className="h-px bg-gray-100 dark:bg-tabby-700" />
                <Field label="Font">
                  <Segmented
                    options={FONT_OPTIONS.map((o) => ({ value: o, label: FONT_PACK_LABELS[o] }))}
                    value={fontPack}
                    onChange={setFontPack}
                  />
                </Field>
              </View>
            </View>

            {/* Dashboard period and history chart are both "what the data
                on Home means" preferences -- same reasoning, one card. */}
            <View className="gap-2">
              <Text className="font-nunito-bold text-[11px] tracking-wide text-gray-400 dark:text-tabby-400 px-1">
                DISPLAY
              </Text>
              <View className="bg-gray-50 dark:bg-tabby-800 rounded-2xl border border-gray-100 dark:border-tabby-700 p-4 gap-4">
                <Field label="Dashboard period">
                  <Segmented
                    options={PERIOD_OPTIONS}
                    value={periodPreference}
                    onChange={handleSelectPeriod}
                  />
                  <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-xs">
                    Controls what Earned, Spent, and the home screen total count as &ldquo;now&rdquo;: your
                    pay cycle (set in Income Sources) or always the calendar month. Budget follows your pay
                    cycle either way.
                  </Text>
                </Field>
                <View className="h-px bg-gray-100 dark:bg-tabby-700" />
                <Field label="History chart">
                  <Segmented
                    options={TREND_OPTIONS}
                    value={trendPreference}
                    onChange={handleSelectTrend}
                  />
                  <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-xs">
                    Automatic shows weekly bars until you have about two months of history, then switches
                    to the last 6 months.
                  </Text>
                </Field>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
