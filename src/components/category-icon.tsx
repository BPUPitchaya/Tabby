import { Feather } from '@expo/vector-icons';
import { useColorScheme } from 'react-native';

type FeatherIconName = keyof typeof Feather.glyphMap;

// Falls back to a generic tag icon for any unrecognized name, so a bad/typo'd
// icon value in the DB never crashes the icon lookup -- just looks slightly
// generic instead.
//
// `color` is a native prop, not a className -- it won't respond to a dark:
// variant the way the rest of the app's colors do, so when no explicit color
// is passed, the default itself has to be scheme-aware or it'd stay
// gray-600 (too dark to read) against the brown dark-mode background.
export function CategoryIcon({
  name,
  size = 16,
  color,
}: {
  name: string | null | undefined;
  size?: number;
  color?: string;
}) {
  const scheme = useColorScheme();
  const resolvedColor = color ?? (scheme === 'dark' ? '#E8C39E' : '#4b5563');
  const iconName: FeatherIconName = name && name in Feather.glyphMap ? (name as FeatherIconName) : 'tag';
  return <Feather name={iconName} size={size} color={resolvedColor} />;
}
