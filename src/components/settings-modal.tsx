import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, Text, useColorScheme, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { loadThemePreference, setThemePreference, type ThemePreference } from '@/lib/theme-preference';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { value: 'system', label: 'Match device', icon: 'smartphone' },
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
];

export function SettingsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const isDark = useColorScheme() === 'dark';
  const [preference, setPreference] = useState<ThemePreference | null>(null);

  useEffect(() => {
    if (visible) {
      loadThemePreference().then(setPreference);
    }
  }, [visible]);

  const handleSelect = async (value: ThemePreference) => {
    setPreference(value); // optimistic -- the toggle should feel instant
    await setThemePreference(value);
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
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
