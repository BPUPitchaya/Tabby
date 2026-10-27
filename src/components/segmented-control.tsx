// Shared segmented control -- originally lived only in settings-modal.tsx
// for the theme/dashboard-period/trend pickers there; extracted so the
// Flat screen's own trend-period picker can reuse the exact same look.
import { Pressable, Text, View } from 'react-native';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

// Plain native style, not a conditional `shadow-sm` className -- a known
// NativeWind/CSS interop race that only a native style prop sidesteps
// (same pattern as income-sources-modal.tsx's Fixed/Hourly toggle).
const SEGMENT_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.08,
  shadowRadius: 2,
  elevation: 1,
};

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <View className="flex-row gap-1.5 p-1 bg-gray-100 dark:bg-tabby-900 rounded-xl">
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={(state) => [pressFeedback(state), selected && SEGMENT_SHADOW]}
            accessibilityRole="button"
            accessibilityLabel={option.label}
            className={`flex-1 rounded-lg py-2 items-center ${selected ? 'bg-white dark:bg-tabby-700' : ''}`}
          >
            <Text
              className={`font-nunito-semibold text-xs text-center ${
                selected ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-tabby-300'
              }`}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
