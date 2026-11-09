import { Feather } from '@expo/vector-icons';
import { Pressable, useColorScheme } from 'react-native';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

// Small round icon button used in the header. Feather icon only, no label,
// consistent 40x40 tap target.
export function HeaderIconButton({
  icon,
  onPress,
  label,
  tone = 'default',
}: {
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  label: string;
  tone?: 'default' | 'primary';
}) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  // The primary button's background flips brown<->white between light and
  // dark mode (see tailwind.config.js's `tabby` scale), so its icon has to
  // flip the opposite way or it disappears against its own background.
  const iconColor = tone === 'primary' ? (isDark ? '#2B1810' : '#fff') : isDark ? '#E8C39E' : '#374151';

  return (
    <Pressable
      onPress={onPress}
      style={pressFeedback}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`w-10 h-10 rounded-full items-center justify-center ${
        tone === 'primary' ? 'bg-tabby-600 dark:bg-white' : 'bg-gray-100 dark:bg-tabby-700'
      }`}
    >
      <Feather name={icon} size={18} color={iconColor} />
    </Pressable>
  );
}
