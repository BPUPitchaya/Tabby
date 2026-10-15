import { Feather } from '@expo/vector-icons';
import { useColorScheme } from 'react-native';

type FeatherIconName = keyof typeof Feather.glyphMap;

// A small, deliberate set offered when creating a custom category --
// not the full Feather set (most names mean nothing as a spending
// category), just enough variety that custom categories don't all end up
// looking like the same generic fallback tag icon.
export const CUSTOM_CATEGORY_ICONS: FeatherIconName[] = [
  'tag',
  'coffee',
  'shopping-bag',
  'home',
  'truck',
  'zap',
  'film',
  'heart',
  'gift',
  'briefcase',
  'book',
  'music',
];

// Keyword map for guessCategoryIcon -- checked before reaching for an AI
// call, since picking 1 of 12 icons from a name is cheap enough to do
// locally most of the time. Order matters: first keyword match wins, so
// more specific terms are listed ahead of broader ones where they could
// otherwise collide (none currently do, but keep that in mind extending
// this list).
const ICON_KEYWORDS: { icon: FeatherIconName; keywords: string[] }[] = [
  { icon: 'coffee', keywords: ['coffee', 'cafe', 'café', 'bar', 'drinks'] },
  { icon: 'shopping-bag', keywords: ['shop', 'shopping', 'store', 'clothes', 'clothing', 'retail'] },
  { icon: 'home', keywords: ['home', 'house', 'rent', 'mortgage', 'furniture'] },
  {
    icon: 'truck',
    keywords: ['car', 'transport', 'fuel', 'gas', 'uber', 'taxi', 'bus', 'train', 'parking'],
  },
  { icon: 'zap', keywords: ['electric', 'power', 'utility', 'utilities', 'internet', 'phone', 'water'] },
  { icon: 'film', keywords: ['movie', 'cinema', 'film', 'netflix', 'streaming', 'show'] },
  { icon: 'heart', keywords: ['health', 'gym', 'doctor', 'medical', 'fitness', 'wellness'] },
  { icon: 'gift', keywords: ['gift', 'present', 'birthday', 'christmas'] },
  { icon: 'briefcase', keywords: ['work', 'business', 'office', 'job'] },
  { icon: 'book', keywords: ['book', 'education', 'school', 'course', 'study', 'tuition'] },
  { icon: 'music', keywords: ['music', 'concert', 'spotify', 'song', 'band'] },
];

// Instant, local-only guess from a handful of common keywords -- null means
// nothing matched, in which case the caller falls back to the (slower)
// AI suggestion instead of making every category wait on a network call.
export function guessCategoryIcon(name: string): FeatherIconName | null {
  const lower = name.toLowerCase();
  return ICON_KEYWORDS.find((entry) => entry.keywords.some((kw) => lower.includes(kw)))?.icon ?? null;
}

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
