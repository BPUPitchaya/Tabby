import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, Text, useColorScheme, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

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

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { value: 'system', label: 'Match device', icon: 'smartphone' },
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
];

const FONT_OPTIONS: FontPack[] = ['default', 'fraunces', 'quicksand'];

const PERIOD_OPTIONS: { value: DashboardPeriodPreference; label: string }[] = [
  { value: 'pay-cycle', label: 'Follow pay schedule' },
  { value: 'calendar-month', label: 'Always this month' },
];

const TREND_OPTIONS: { value: TrendPeriodPreference; label: string }[] = [
  { value: 'auto', label: 'Automatic' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

export function SettingsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const isDark = useColorScheme() === 'dark';
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

          <View className="p-4 gap-2">
            <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300 text-xs tracking-wide px-1">
              APPEARANCE
            </Text>
            <View className="bg-gray-50 dark:bg-tabby-800 rounded-2xl border border-gray-100 dark:border-tabby-700">
              {THEME_OPTIONS.map((option, i) => (
                <Pressable
                  key={option.value}
                  onPress={() => handleSelect(option.value)}
                  style={pressFeedback}
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  className={`flex-row items-center gap-3 py-3.5 px-4 ${
                    i < THEME_OPTIONS.length - 1 ? 'border-b border-gray-100 dark:border-tabby-700' : ''
                  }`}>
                  <Feather
                    name={option.icon}
                    size={18}
                    color={isDark ? '#E8C39E' : '#374151'}
                    style={{ opacity: 0.7 }}
                  />
                  <Text className="flex-1 font-nunito-medium text-gray-800 dark:text-white">
                    {option.label}
                  </Text>
                  {preference === option.value && (
                    <Feather name="check" size={18} color={isDark ? '#E8C39E' : '#8B5A2B'} />
                  )}
                </Pressable>
              ))}
            </View>
          </View>

          <View className="p-4 gap-2">
            <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300 text-xs tracking-wide px-1">
              FONT
            </Text>
            <View className="bg-gray-50 dark:bg-tabby-800 rounded-2xl border border-gray-100 dark:border-tabby-700">
              {FONT_OPTIONS.map((option, i) => (
                <Pressable
                  key={option}
                  onPress={() => setFontPack(option)}
                  style={pressFeedback}
                  accessibilityRole="button"
                  accessibilityLabel={FONT_PACK_LABELS[option]}
                  className={`flex-row items-center gap-3 py-3.5 px-4 ${
                    i < FONT_OPTIONS.length - 1 ? 'border-b border-gray-100 dark:border-tabby-700' : ''
                  }`}>
                  <Feather name="type" size={18} color={isDark ? '#E8C39E' : '#374151'} style={{ opacity: 0.7 }} />
                  <Text className="flex-1 font-nunito-medium text-gray-800 dark:text-white">
                    {FONT_PACK_LABELS[option]}
                  </Text>
                  {fontPack === option && <Feather name="check" size={18} color={isDark ? '#E8C39E' : '#8B5A2B'} />}
                </Pressable>
              ))}
            </View>
          </View>

          <View className="p-4 gap-2">
            <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300 text-xs tracking-wide px-1">
              DASHBOARD PERIOD
            </Text>
            <View className="bg-gray-50 dark:bg-tabby-800 rounded-2xl border border-gray-100 dark:border-tabby-700">
              {PERIOD_OPTIONS.map((option, i) => (
                <Pressable
                  key={option.value}
                  onPress={() => handleSelectPeriod(option.value)}
                  style={pressFeedback}
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  className={`flex-row items-center gap-3 py-3.5 px-4 ${
                    i < PERIOD_OPTIONS.length - 1 ? 'border-b border-gray-100 dark:border-tabby-700' : ''
                  }`}>
                  <Feather name="calendar" size={18} color={isDark ? '#E8C39E' : '#374151'} style={{ opacity: 0.7 }} />
                  <Text className="flex-1 font-nunito-medium text-gray-800 dark:text-white">{option.label}</Text>
                  {periodPreference === option.value && (
                    <Feather name="check" size={18} color={isDark ? '#E8C39E' : '#8B5A2B'} />
                  )}
                </Pressable>
              ))}
            </View>
            <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-xs px-1">
              Controls what Earned, Spent, and the home screen total count as &ldquo;now&rdquo; -- your
              pay cycle (set in Pay Schedule) or always the calendar month. Budget follows your pay
              cycle either way.
            </Text>
          </View>

          <View className="p-4 gap-2">
            <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300 text-xs tracking-wide px-1">
              HISTORY CHART
            </Text>
            <View className="bg-gray-50 dark:bg-tabby-800 rounded-2xl border border-gray-100 dark:border-tabby-700">
              {TREND_OPTIONS.map((option, i) => (
                <Pressable
                  key={option.value}
                  onPress={() => handleSelectTrend(option.value)}
                  style={pressFeedback}
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  className={`flex-row items-center gap-3 py-3.5 px-4 ${
                    i < TREND_OPTIONS.length - 1 ? 'border-b border-gray-100 dark:border-tabby-700' : ''
                  }`}>
                  <Feather name="bar-chart-2" size={18} color={isDark ? '#E8C39E' : '#374151'} style={{ opacity: 0.7 }} />
                  <Text className="flex-1 font-nunito-medium text-gray-800 dark:text-white">{option.label}</Text>
                  {trendPreference === option.value && (
                    <Feather name="check" size={18} color={isDark ? '#E8C39E' : '#8B5A2B'} />
                  )}
                </Pressable>
              ))}
            </View>
            <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-xs px-1">
              Automatic shows weekly bars until you have about two months of history, then switches
              to the last 6 months.
            </Text>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
