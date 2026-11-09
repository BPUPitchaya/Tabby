import { Feather } from '@expo/vector-icons';
import { Pressable, Text, useColorScheme, View } from 'react-native';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

// The Expense/Income toggle's selected-pill shadow, as a plain native
// style instead of NativeWind's `shadow-sm` class. A conditionally-applied
// `shadow-*` className hits a known race in NativeWind's CSS interop layer
// that throws "Couldn't find a navigation context" the first time the
// class is added (nativewind/nativewind#1536), so native shadow props
// sidestep that code path entirely.
const SEGMENT_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.08,
  shadowRadius: 2,
  elevation: 1,
};

export type TransactionTab = 'activity' | 'category';

// Activity (date-grouped) vs By Category (totals grid) tabs, plus the
// tap-to-open search bar beneath them.
export function TransactionTabBar({
  activeTab,
  onChangeTab,
  onOpenSearch,
}: {
  activeTab: TransactionTab;
  onChangeTab: (tab: TransactionTab) => void;
  onOpenSearch: () => void;
}) {
  const isDark = useColorScheme() === 'dark';

  return (
    <>
      {/* Tabs */}
      <View className="flex-row gap-1.5 mx-4 mt-3 mb-2 p-1 bg-gray-100 dark:bg-tabby-800 rounded-xl">
        <Pressable
          onPress={() => onChangeTab('activity')}
          style={(state) => [pressFeedback(state), activeTab === 'activity' && SEGMENT_SHADOW]}
          className={`flex-1 rounded-lg py-2 items-center ${activeTab === 'activity' ? 'bg-white dark:bg-tabby-900' : ''}`}
        >
          <Text
            className={`font-nunito-semibold text-sm ${
              activeTab === 'activity'
                ? 'text-gray-900 dark:text-white'
                : 'text-gray-500 dark:text-tabby-300'
            }`}
          >
            Activity
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onChangeTab('category')}
          style={(state) => [pressFeedback(state), activeTab === 'category' && SEGMENT_SHADOW]}
          className={`flex-1 rounded-lg py-2 items-center ${activeTab === 'category' ? 'bg-white dark:bg-tabby-900' : ''}`}
        >
          <Text
            className={`font-nunito-semibold text-sm ${
              activeTab === 'category'
                ? 'text-gray-900 dark:text-white'
                : 'text-gray-500 dark:text-tabby-300'
            }`}
          >
            By Category
          </Text>
        </Pressable>
      </View>

      {/* Search bar: tap to open filters */}
      <Pressable
        onPress={onOpenSearch}
        style={pressFeedback}
        accessibilityRole="button"
        accessibilityLabel="Search transactions"
        className="flex-row items-center gap-2 mx-4 mb-2 h-11 rounded-xl bg-gray-100 dark:bg-tabby-800 border border-gray-200 dark:border-tabby-700 px-3"
      >
        <Feather name="search" size={15} color={isDark ? '#C98A52' : '#9ca3af'} />
        <Text className="font-nunito text-sm text-gray-400 dark:text-tabby-400">
          Search transactions
        </Text>
      </Pressable>
    </>
  );
}
