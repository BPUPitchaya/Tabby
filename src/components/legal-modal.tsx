import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import type { LegalDoc } from '@/constants/legal';

export function LegalModal({ doc, onClose }: { doc: LegalDoc | null; onClose: () => void }) {
  return (
    // RN's <Modal> renders its content in a separate native view
    // hierarchy (a second UIWindow on iOS), which does NOT automatically
    // inherit the SafeAreaProvider from the app root -- insets silently
    // come back as 0 inside it. Confirmed via Expo's own
    // safe-area-context docs: "You may need to add it in other places
    // too, including at the root of any modals." Without this, the
    // header (and its Done button) renders flush at y=0 and ends up
    // physically under the Dynamic Island / notch on affected devices.
    <Modal visible={doc !== null} animationType="slide">
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-white">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100">
            <Text className="text-xl font-bold">{doc?.title}</Text>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
              accessibilityRole="button"
              accessibilityLabel="Close">
              <Text className="text-blue-600 font-semibold">Done</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
            <Text className="text-gray-400 text-xs">Last updated: {doc?.lastUpdated}</Text>
            {doc?.sections.map((section) => (
              <View key={section.heading} className="gap-1.5">
                <Text className="font-bold text-base">{section.heading}</Text>
                <Text className="text-gray-600 text-sm leading-5">{section.body}</Text>
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
