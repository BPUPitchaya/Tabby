// Static explanation sheet -- same chrome as budget-help-modal.tsx, for
// explaining what this screen actually shows (see flat.tsx's "?" button).
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

const SECTIONS = [
  {
    heading: 'Members',
    body: 'Everyone in your flat, with a badge for whoever is the admin: the flat’s creator by default. Only the admin can rename or delete the flat.',
  },
  {
    heading: 'Flat Health',
    body: 'One score for how settled up the flat is overall: how much of your total shared spend is still outstanding, not paid back yet.',
  },
  {
    heading: 'Balances',
    body: 'What you owe each flatmate, or what they owe you, net across every shared expense and settlement so far.',
  },
  {
    heading: 'Shared expenses',
    body: 'Anything logged here is split across whichever members you pick, equally by default. Add one, scan a receipt, or split a bill from the chat.',
  },
];

export function FlatHelpModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-white dark:bg-tabby-900">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-tabby-700">
            <Text className="font-fredoka-semibold text-xl dark:text-white">About this screen</Text>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text className="font-nunito-semibold text-tabby-600 dark:text-white">Done</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 18 }}>
            {SECTIONS.map((section) => (
              <View key={section.heading} className="gap-1.5">
                <Text className="font-fredoka-semibold text-base dark:text-white">{section.heading}</Text>
                <Text className="font-nunito text-gray-600 dark:text-tabby-200 text-sm leading-5">
                  {section.body}
                </Text>
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
