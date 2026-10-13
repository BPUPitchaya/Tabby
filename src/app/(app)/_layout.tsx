import { useEffect, useState } from 'react';
import { ActivityIndicator, useColorScheme, View } from 'react-native';

import AppTabs from '@/components/app-tabs';
import { AuthScreen } from '@/components/auth-screen';
import { FlatOnboardingQuestion } from '@/components/flat-onboarding-question';
import { PaymentDetailsOnboardingQuestion } from '@/components/payment-details-onboarding-question';
import { useAuth } from '@/lib/auth-context';
import { FlatPreferenceProvider, useFlatPreference } from '@/lib/flat-preference-context';
import { fetchPaymentDetailsPrompted } from '@/lib/profile';

// wants_flat is null exactly until the user answers the onboarding
// question once -- after that (or once they have a flat from an invite,
// including one joined via the public join/[code] screen), this always
// resolves straight to the payment-details question, then AppTabs.
function FlatGate({ userId }: { userId: string }) {
  const { loading, wantsFlat, hasFlat, tabVisible } = useFlatPreference();
  // null = still loading; a plain boolean once fetched. Not worth a
  // context provider for one flag checked once per session -- unlike
  // wants_flat, nothing else in the app needs to react to this changing.
  const [paymentPrompted, setPaymentPrompted] = useState<boolean | null>(null);

  useEffect(() => {
    if (loading || (wantsFlat === null && !hasFlat)) return;
    fetchPaymentDetailsPrompted(userId)
      .then(setPaymentPrompted)
      .catch(() => setPaymentPrompted(true)); // fail open -- never block entry over this
  }, [loading, wantsFlat, hasFlat, userId]);

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

  if (paymentPrompted === null) {
    return (
      <View className="flex-1 items-center justify-center bg-tabby-50 dark:bg-tabby-900">
        <ActivityIndicator />
      </View>
    );
  }

  if (!paymentPrompted) {
    return <PaymentDetailsOnboardingQuestion userId={userId} onDone={() => setPaymentPrompted(true)} />;
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
      <View
        className={`flex-1 items-center justify-center ${scheme === 'dark' ? 'bg-tabby-900' : 'bg-white'}`}
      >
        <ActivityIndicator />
      </View>
    );
  }

  if (!session) return <AuthScreen />;

  return (
    <FlatPreferenceProvider userId={session.user.id}>
      <FlatGate userId={session.user.id} />
    </FlatPreferenceProvider>
  );
}
