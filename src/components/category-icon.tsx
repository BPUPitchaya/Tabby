import { Feather } from '@expo/vector-icons';

type FeatherIconName = keyof typeof Feather.glyphMap;

// Falls back to a generic tag icon for any unrecognized name, so a bad/typo'd
// icon value in the DB never crashes the icon lookup -- just looks slightly
// generic instead.
export function CategoryIcon({
  name,
  size = 16,
  color = '#4b5563',
}: {
  name: string | null | undefined;
  size?: number;
  color?: string;
}) {
  const iconName: FeatherIconName = name && name in Feather.glyphMap ? (name as FeatherIconName) : 'tag';
  return <Feather name={iconName} size={size} color={color} />;
}
