import { Text, View } from 'react-native';

// A small, consistent set of initial-badges so "who" reads at a glance in
// the Balances/Recent-expenses lists and the split-with picker, instead of
// bare names. Color is a stable hash of the person's id/name, not random,
// so the same person always gets the same badge across the screen.
const AVATAR_STYLES = [
  { bg: 'bg-sage-100 dark:bg-sage-900/40', text: 'text-sage-700 dark:text-sage-300' },
  { bg: 'bg-tabby-sky dark:bg-tabby-700', text: 'text-tabby-900 dark:text-tabby-100' },
  { bg: 'bg-tabby-100 dark:bg-tabby-700', text: 'text-tabby-700 dark:text-tabby-200' },
  { bg: 'bg-rust-50 dark:bg-rust-900/40', text: 'text-rust-600 dark:text-rust-300' },
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function Avatar({
  name,
  colorKey,
  unknown = false,
  size = 38,
}: {
  name: string;
  colorKey: string;
  unknown?: boolean;
  size?: number;
}) {
  const style = unknown
    ? { bg: 'bg-gray-200 dark:bg-white/10', text: 'text-gray-400 dark:text-tabby-400' }
    : AVATAR_STYLES[hashString(colorKey) % AVATAR_STYLES.length];
  const initial = unknown ? '?' : (name.trim().charAt(0).toUpperCase() || '?');
  return (
    <View
      className={`rounded-full items-center justify-center ${style.bg}`}
      style={{ width: size, height: size }}
    >
      <Text className={`font-nunito-extrabold ${style.text}`} style={{ fontSize: size * 0.37 }}>
        {initial}
      </Text>
    </View>
  );
}
