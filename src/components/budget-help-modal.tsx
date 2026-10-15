// Static explanation sheet -- same chrome as legal-modal.tsx, but for
// explaining the overall-vs-category-budget relationship, which isn't
// obvious from the Budget screen alone (see budget-modal.tsx).
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

const SECTIONS = [
  {
    heading: 'Only one number is ever active',
    body: "Home shows either your overall budget or the sum of your category budgets, never both at once, so there's nothing to reconcile.",
  },
  {
    heading: 'Overall budget',
    body: 'One figure for everything you spend this pay cycle. Simple, and the default until you set a category budget.',
  },
  {
    heading: 'Category budgets',
    body: 'Optional. Cap specific categories instead, like Groceries or Eating Out, whatever you want to watch closely. The moment you set even one cap, your overall figure switches to the sum of your capped categories.',
  },
  {
    heading: 'Switching back',
    body: '"Use overall budget instead" clears every category cap at once and returns to a single number. Or clear categories one at a time if you only want to drop a few.',
  },
];

export function BudgetHelpModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-white dark:bg-tabby-900">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-tabby-700">
            <Text className="font-fredoka-semibold text-xl dark:text-white">How budgeting works</Text>
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
