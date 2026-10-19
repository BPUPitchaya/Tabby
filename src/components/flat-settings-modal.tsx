import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, Pressable, Switch, Text, useColorScheme, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { useFlatPreference } from '@/lib/flat-preference-context';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

// Home for flat-related settings specifically -- starts with just the
// show/hide toggle, but it's its own screen (not a row buried in general
// Settings) so more can land here later (default split method, notification
// prefs, etc.) without fighting for space with APPEARANCE.
export function FlatSettingsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const isDark = useColorScheme() === 'dark';
  const { tabVisible, hasFlat, setWantsFlat } = useFlatPreference();
  const [busy, setBusy] = useState(false);

  // Once you're actually in a flat, hiding the tab isn't a real option --
  // leaving the flat (from the Flat tab itself) is the only way back to
  // "no flat," so the toggle is locked on and explains why instead of
  // silently doing nothing.
  const locked = hasFlat;

  const handleToggle = async (next: boolean) => {
    if (locked) return;
    setBusy(true);
    await setWantsFlat(next);
    setBusy(false);
    if (next) {
      onClose();
      router.push('/flat');
    }
  };

  const handleShowHelp = () => {
    Alert.alert(
      locked ? "Why can't I turn this off?" : 'About the Flat tab',
      locked
        ? "You're currently a member of a flat (owner or not, it doesn't matter which), so the tab stays on. Turning it off while you're still in a flat would hide your own shared-expense history and balances from yourself. Leave the flat from the Flat tab first, and this toggle unlocks."
        : "Turning this on adds a Flat tab for splitting household expenses with flatmates. It switches on automatically the moment you join or create a flat, even without touching this toggle.",
      [{ text: 'Got it' }],
    );
  };

  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-white dark:bg-tabby-900">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-tabby-700">
            <Text className="font-fredoka-semibold text-xl dark:text-white">Flat</Text>
            <View className="flex-row items-center gap-4">
              <Pressable
                onPress={handleShowHelp}
                style={pressFeedback}
                accessibilityRole="button"
                accessibilityLabel="Why is this locked?"
                className="w-7 h-7 rounded-full bg-gray-100 dark:bg-tabby-700 items-center justify-center"
              >
                <Text className="font-nunito-bold text-xs text-gray-600 dark:text-tabby-200">?</Text>
              </Pressable>
              <Pressable
                onPress={onClose}
                style={pressFeedback}
                accessibilityRole="button"
                accessibilityLabel="Close">
                <Text className="font-nunito-semibold text-tabby-600 dark:text-white">Done</Text>
              </Pressable>
            </View>
          </View>

          <View className="p-4 gap-2">
            <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300 text-xs tracking-wide px-1">
              FLAT TAB
            </Text>
            <View className="bg-gray-50 dark:bg-tabby-800 rounded-2xl border border-gray-100 dark:border-tabby-700 px-4 py-3.5 flex-row items-center gap-3">
              <Feather name="users" size={18} color={isDark ? '#E8C39E' : '#374151'} style={{ opacity: 0.7 }} />
              <View className="flex-1">
                <Text className="font-nunito-medium text-gray-800 dark:text-white">Show Flat tab</Text>
                {locked && (
                  <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-xs mt-0.5">
                    Leave your flat from the Flat tab to turn this off.
                  </Text>
                )}
              </View>
              <Switch
                value={tabVisible}
                onValueChange={handleToggle}
                disabled={locked || busy}
                trackColor={{ false: isDark ? '#6B4420' : '#E8C39E', true: '#8B5A2B' }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
