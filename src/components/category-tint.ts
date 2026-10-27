// Deterministic per-category icon tint, hashed from the category id so the
// same category always lands on the same color across sessions without a
// color column in the DB -- categories include user-created ones, not just
// the fixed defaults, so this can't be a hardcoded name lookup.
const CATEGORY_PALETTE_LIGHT = [
  { bg: '#D7E4CE', fg: '#3F5A35' },
  { bg: '#F3D9C2', fg: '#8A4A1E' },
  { bg: '#D6DFF2', fg: '#33467A' },
  { bg: '#E9D9EC', fg: '#5B3D63' },
  { bg: '#CFEAE9', fg: '#1F5B5A' },
  { bg: '#F0E3C2', fg: '#6B4F1C' },
];
const CATEGORY_PALETTE_DARK = [
  { bg: '#5B6B4F', fg: '#DCE8D4' },
  { bg: '#B8794A', fg: '#FCEBDB' },
  { bg: '#5E6E8C', fg: '#DCE3F2' },
  { bg: '#8A6E93', fg: '#EFE4F2' },
  { bg: '#4F8A8B', fg: '#D9F0EF' },
  { bg: '#A68A4F', fg: '#F2E7CF' },
];
export function categoryTint(categoryId: string | null, isDark: boolean): { bg: string; fg: string } {
  if (!categoryId) return isDark ? { bg: '#4A3A2C', fg: '#C9BBAA' } : { bg: '#E5E0D8', fg: '#6B6256' };
  const palette = isDark ? CATEGORY_PALETTE_DARK : CATEGORY_PALETTE_LIGHT;
  let hash = 0;
  for (let i = 0; i < categoryId.length; i++) hash = (hash * 31 + categoryId.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}
