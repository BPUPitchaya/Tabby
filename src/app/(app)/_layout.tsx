import { ActivityIndicator, useColorScheme, View } from 'react-native';

import AppTabs from '@/components/app-tabs';
import { AuthScreen } from '@/components/auth-screen';
import { FlatOnboardingQuestion } from '@/components/flat-onboarding-question';
import { useAuth } from '@/lib/auth-context';
import { FlatPreferenceProvider, useFlatPreference } from '@/lib/flat-preference-context';

// wants_flat is null exactly until the user answers the onboarding
// question once -- after that (or once they have a flat from an invite,
// including one joined via the public join/[code] screen), this always
// resolves straight to AppTabs.
function FlatGate() {
  const { loading, wantsFlat, hasFlat, tabVisible } = useFlatPreference();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-tabby-50 dark:bg-tabby-900">
        <ActivityIndicator />
      </View>
    );
  }

  if (wantsFlat === null && !hasFlat) {
    return <FlatOnboardingQuestion />;
  }

  return <AppTabs hideFlatTab={!tabVisible} />;
}

// This is the app's "normal" experience (auth-gated tabs) -- a sibling of
// the public join/[code] screen at the Stack root (see app/_layout.tsx),
// not the app's actual root layout anymore. useColorScheme here (not in
// the root) because it only affects this branch's own loading spinner.
export default function AppGateLayout() {
  const { session, loading } = useAuth();
  const scheme = useColorScheme();

  if (loading) {
    return (
      <View className={`flex-1 items-center justify-center ${scheme === 'dark' ? 'bg-tabby-900' : 'bg-white'}`}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!session) return <AuthScreen />;

  return (
    <FlatPreferenceProvider userId={session.user.id}>
      <FlatGate />
    </FlatPreferenceProvider>
  );
}
