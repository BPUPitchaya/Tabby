// Three bundled font packs, picked from Settings. Each pack supplies every
// weight the app's font-* classNames actually use (see tailwind.config.js's
// fontFamily block, where each of these var names is referenced) -- no
// fallback needed since all three families cover the same weight set.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useState, type ReactNode } from 'react';

export type FontPack = 'default' | 'fraunces' | 'quicksand';

const STORAGE_KEY = 'tabby.font-preference';

export const FONT_PACK_LABELS: Record<FontPack, string> = {
  default: 'Fredoka & Nunito',
  fraunces: 'Fraunces & Karla',
  quicksand: 'Quicksand & Mada',
};

export const FONT_VARS: Record<FontPack, Record<string, string>> = {
  default: {
    '--font-fredoka-semibold': 'Fredoka_600SemiBold',
    '--font-fredoka-bold': 'Fredoka_700Bold',
    '--font-nunito': 'Nunito_400Regular',
    '--font-nunito-medium': 'Nunito_500Medium',
    '--font-nunito-semibold': 'Nunito_600SemiBold',
    '--font-nunito-bold': 'Nunito_700Bold',
    '--font-nunito-extrabold': 'Nunito_800ExtraBold',
  },
  fraunces: {
    '--font-fredoka-semibold': 'Fraunces_600SemiBold',
    '--font-fredoka-bold': 'Fraunces_700Bold',
    '--font-nunito': 'Karla_400Regular',
    '--font-nunito-medium': 'Karla_500Medium',
    '--font-nunito-semibold': 'Karla_600SemiBold',
    '--font-nunito-bold': 'Karla_700Bold',
    '--font-nunito-extrabold': 'Karla_800ExtraBold',
  },
  quicksand: {
    '--font-fredoka-semibold': 'Quicksand_600SemiBold',
    '--font-fredoka-bold': 'Quicksand_700Bold',
    '--font-nunito': 'Mada_400Regular',
    '--font-nunito-medium': 'Mada_500Medium',
    '--font-nunito-semibold': 'Mada_600SemiBold',
    '--font-nunito-bold': 'Mada_700Bold',
    '--font-nunito-extrabold': 'Mada_800ExtraBold',
  },
};

export async function loadFontPreference(): Promise<FontPack> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored === 'default' || stored === 'fraunces' || stored === 'quicksand') {
      return stored;
    }
  } catch {
    // fall through to the default below -- a storage read failure
    // shouldn't block the app from rendering
  }
  return 'default';
}

export async function setFontPreference(pack: FontPack): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, pack);
  } catch {
    // the caller already updated in-memory state -- losing the persisted
    // value just means it won't survive an app restart
  }
}

// Unlike theme-preference.ts's colorScheme.set(), there's no NativeWind
// global for fonts -- the vars() style lives on a View in _layout.tsx, so
// changing it needs a real re-render. This context is how Settings reaches
// that state.
type FontPreferenceContextValue = {
  pack: FontPack;
  setPack: (pack: FontPack) => void;
};

const FontPreferenceContext = createContext<FontPreferenceContextValue | undefined>(undefined);

export function FontPreferenceProvider({
  initialPack,
  children,
}: {
  initialPack: FontPack;
  children: ReactNode;
}) {
  const [pack, setPackState] = useState(initialPack);

  const setPack = (next: FontPack) => {
    setPackState(next); // optimistic -- the switch should feel instant
    setFontPreference(next);
  };

  return (
    <FontPreferenceContext.Provider value={{ pack, setPack }}>{children}</FontPreferenceContext.Provider>
  );
}

export function useFontPreference() {
  const context = useContext(FontPreferenceContext);
  if (!context) {
    throw new Error('useFontPreference must be used within a FontPreferenceProvider');
  }
  return context;
}
