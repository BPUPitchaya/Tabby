import { useFocusEffect } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { fetchMyFlat } from '@/lib/flats';
import { fetchWantsFlat, updateWantsFlat } from '@/lib/profile';

// Single source of truth for "should the Flat tab be visible," shared by
// the root layout (decides whether to show the onboarding question),
// AppTabs (decides the `hidden` prop), and Settings (decides whether to
// show the unlock row) -- so the three can't disagree with each other.
type FlatPreferenceContextValue = {
  loading: boolean;
  wantsFlat: boolean | null;
  hasFlat: boolean;
  // true once either wantsFlat or hasFlat is truthy -- the actual
  // Flat-tab-visibility answer every consumer actually wants.
  tabVisible: boolean;
  setWantsFlat: (value: boolean) => Promise<void>;
};

const FlatPreferenceContext = createContext<FlatPreferenceContextValue | undefined>(undefined);

export function FlatPreferenceProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [wantsFlat, setWantsFlatState] = useState<boolean | null>(null);
  const [hasFlat, setHasFlat] = useState(false);

  const load = useCallback(async () => {
    const [wants, flat] = await Promise.all([fetchWantsFlat(userId), fetchMyFlat(userId)]);
    setWantsFlatState(wants);
    setHasFlat(flat !== null);
  }, [userId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  // Silent re-fetch every time the (app) group regains focus -- covers
  // joining a flat via the public join/[code] screen while this provider
  // (mounted inside (app)) was already sitting here from before, which
  // the mount-only effect above would otherwise never see.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const setWantsFlat = async (value: boolean) => {
    setWantsFlatState(value); // optimistic -- the question/unlock should feel instant
    await updateWantsFlat(userId, value);
  };

  return (
    <FlatPreferenceContext.Provider
      value={{ loading, wantsFlat, hasFlat, tabVisible: Boolean(wantsFlat || hasFlat), setWantsFlat }}>
      {children}
    </FlatPreferenceContext.Provider>
  );
}

export function useFlatPreference() {
  const context = useContext(FlatPreferenceContext);
  if (!context) {
    throw new Error('useFlatPreference must be used within a FlatPreferenceProvider');
  }
  return context;
}
