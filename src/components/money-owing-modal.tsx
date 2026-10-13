// Full owe/owed history for bill splits -- the two existing fetch
// functions (fetchMyPendingShares, markSharePaid) already existed in
// bill-splits.ts with nothing in the UI reading them; this is their home.
// Proposed (not-yet-accepted) shares deliberately aren't duplicated here
// -- those live in the Home bell and the Friends screen's Split Requests
// section, which already resolve them via accept/decline.
import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth-context';
import {
  fetchMyPendingShares,
  fetchOwedToMe,
  isOverdue,
  markReminded,
  markSharePaid,
  type MyBillSplitShare,
  type OwedToMeShare,
} from '@/lib/bill-splits';
import { fetchMyPaymentDetails } from '@/lib/profile';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

// Plain native style, not a conditional `shadow-sm` className -- see
// transactions.tsx's SEGMENT_SHADOW for why (a known NativeWind/CSS
// interop race that only a native style prop sidesteps).
const SEGMENT_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.08,
  shadowRadius: 2,
  elevation: 1,
};

const STATUS_LABEL: Record<OwedToMeShare['status'], string> = {
  proposed: 'Awaiting accept',
  pending: 'Owing',
  paid: 'Paid',
  declined: 'Declined',
};

export function MoneyOwingModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const isDark = useColorScheme() === 'dark';
  const { session } = useAuth();
  const userId = session?.user.id;

  const [tab, setTab] = useState<'active' | 'paid'>('active');
  const [youOwe, setYouOwe] = useState<MyBillSplitShare[]>([]);
  const [owedToYou, setOwedToYou] = useState<OwedToMeShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [myPaymentDetails, setMyPaymentDetails] = useState<string | null>(null);

  const load = async () => {
    if (!userId) return;
    try {
      const [mine, theirs, paymentDetails] = await Promise.all([
        fetchMyPendingShares(userId),
        fetchOwedToMe(userId),
        fetchMyPaymentDetails(userId),
      ]);
      setYouOwe(mine);
      setOwedToYou(theirs);
      setMyPaymentDetails(paymentDetails);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load.');
    }
  };

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setTab('active');
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [visible, userId]);

  const handleMarkPaid = async (shareId: string) => {
    setPayingId(shareId);
    try {
      await markSharePaid(shareId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark as paid.');
    } finally {
      setPayingId(null);
    }
  };

  // Two distinct choices rather than always bundling both -- the user
  // picks whether this nudge goes through Tabby's own bell/Money Owing
  // (silent, no share sheet) or out as a text/other-app message (nothing
  // written in-app). Harmless to stamp a guest share too, it's just never
  // read back since there's no account/app session on that side.
  const handleRemindInApp = async (share: OwedToMeShare) => {
    await markReminded(share.id);
    await load();
  };

  const handleRemindViaMessage = (share: OwedToMeShare) => {
    const paymentLine = myPaymentDetails ? ` You can pay me at ${myPaymentDetails}.` : '';
    Share.share({
      message: `Hey! Just a reminder you owe me $${share.amountOwed.toFixed(2)} for ${share.billTitle}.${paymentLine}`,
    }).catch(() => {});
  };

  // Mark-as-paid here is self-service for the other party too (RLS: they
  // own the share once accepted), but someone who paid you in cash or
  // another app shouldn't have to wait on them -- recording it yourself
  // just sets the same status they'd set.
  const presentYouOweActions = (share: MyBillSplitShare) => {
    const options = ['Mark as Paid', 'Cancel'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: 1 }, (index) => {
        if (index === 0) handleMarkPaid(share.id);
      });
    } else {
      Alert.alert(share.bill_splits?.title ?? 'A bill', undefined, [
        { text: 'Mark as Paid', onPress: () => handleMarkPaid(share.id) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const presentOwedToYouActions = (share: OwedToMeShare) => {
    if (share.status !== 'pending') return;
    const options = ['Remind in App', 'Remind via Text/Other Apps', 'Mark as Paid', 'Cancel'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: 3 }, (index) => {
        if (index === 0) handleRemindInApp(share);
        if (index === 1) handleRemindViaMessage(share);
        if (index === 2) handleMarkPaid(share.id);
      });
    } else {
      Alert.alert(`${share.payerLabel} · ${share.billTitle}`, undefined, [
        { text: 'Remind in App', onPress: () => handleRemindInApp(share) },
        { text: 'Remind via Text/Other Apps', onPress: () => handleRemindViaMessage(share) },
        { text: 'Mark as Paid', onPress: () => handleMarkPaid(share.id) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const visibleYouOwe = youOwe.filter((s) =>
    tab === 'active' ? s.status === 'pending' : s.status === 'paid',
  );
  const visibleOwedToYou = owedToYou.filter((s) =>
    tab === 'active' ? s.status === 'pending' : s.status === 'paid',
  );

  const totalYouOwe = visibleYouOwe.reduce((sum, s) => sum + s.amount_owed, 0);
  const totalOwedToYou = visibleOwedToYou.reduce((sum, s) => sum + s.amountOwed, 0);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-white dark:bg-tabby-900">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-tabby-700">
            <Text className="font-fredoka-semibold text-xl dark:text-white">Money Owing</Text>
            <Pressable
              onPress={onClose}
              style={pressFeedback}
              accessibilityRole="button"
              accessibilityLabel="Close"
              className="w-8 h-8 rounded-full bg-gray-100 dark:bg-tabby-700 items-center justify-center"
            >
              <Feather name="x" size={16} color={isDark ? '#E8C39E' : '#374151'} />
            </Pressable>
          </View>

          <View className="flex-row gap-1.5 mx-4 mt-3 mb-1 p-1 bg-gray-100 dark:bg-tabby-800 rounded-xl">
            <Pressable
              onPress={() => setTab('active')}
              style={(state) => [pressFeedback(state), tab === 'active' && SEGMENT_SHADOW]}
              className={`flex-1 rounded-lg py-2 items-center ${tab === 'active' ? 'bg-white dark:bg-tabby-900' : ''}`}
            >
              <Text
                className={`font-nunito-semibold text-sm ${
                  tab === 'active' ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-tabby-300'
                }`}
              >
                Active
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setTab('paid')}
              style={(state) => [pressFeedback(state), tab === 'paid' && SEGMENT_SHADOW]}
              className={`flex-1 rounded-lg py-2 items-center ${tab === 'paid' ? 'bg-white dark:bg-tabby-900' : ''}`}
            >
              <Text
                className={`font-nunito-semibold text-sm ${
                  tab === 'paid' ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-tabby-300'
                }`}
              >
                Paid
              </Text>
            </Pressable>
          </View>

          {loading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator />
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
              {error && (
                <View className="px-3 py-2 bg-red-50 dark:bg-red-950 rounded-lg">
                  <Text className="font-nunito text-red-600 dark:text-red-400 text-sm">{error}</Text>
                </View>
              )}

              <View className="gap-2">
                <View className="flex-row items-baseline justify-between">
                  <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300 text-xs tracking-wide">
                    YOU OWE
                  </Text>
                  <Text className="font-fredoka-semibold dark:text-white">${totalYouOwe.toFixed(2)}</Text>
                </View>
                {visibleYouOwe.length === 0 ? (
                  <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
                    {tab === 'active'
                      ? 'Nothing outstanding -- nice.'
                      : "You haven't paid anything back yet."}
                  </Text>
                ) : (
                  <View className="gap-1.5">
                    {visibleYouOwe.map((share) => (
                      <Pressable
                        key={share.id}
                        onPress={() => presentYouOweActions(share)}
                        disabled={payingId === share.id}
                        style={pressFeedback}
                        className={`flex-row items-center justify-between rounded-xl px-3 py-2.5 bg-gray-50 dark:bg-tabby-800 border ${
                          share.reminded_at
                            ? 'border-amber-400 dark:border-amber-500'
                            : 'border-gray-100 dark:border-tabby-700'
                        }`}
                      >
                        <View className="flex-1">
                          <Text className="font-nunito-medium dark:text-white">
                            {share.bill_splits?.title ?? 'A bill'}
                            {share.bill_splits?.merchant ? ` · ${share.bill_splits.merchant}` : ''}
                          </Text>
                          {share.reminded_at && (
                            <Text className="font-nunito text-xs text-amber-600 dark:text-amber-400">
                              Reminder sent
                            </Text>
                          )}
                        </View>
                        {payingId === share.id ? (
                          <ActivityIndicator size="small" color={isDark ? '#E8C39E' : '#8B5A2B'} />
                        ) : (
                          <Text className="font-nunito-bold dark:text-white">
                            ${share.amount_owed.toFixed(2)}
                          </Text>
                        )}
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>

              <View className="gap-2">
                <View className="flex-row items-baseline justify-between">
                  <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300 text-xs tracking-wide">
                    OWED TO YOU
                  </Text>
                  <Text className="font-fredoka-semibold dark:text-white">${totalOwedToYou.toFixed(2)}</Text>
                </View>
                {visibleOwedToYou.length === 0 ? (
                  <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
                    {tab === 'active' ? 'No one owes you anything right now.' : "No one's paid you back yet."}
                  </Text>
                ) : (
                  <View className="gap-1.5">
                    {visibleOwedToYou.map((share) => {
                      const overdue = isOverdue(share);
                      return (
                        <Pressable
                          key={share.id}
                          onPress={() => presentOwedToYouActions(share)}
                          disabled={share.status !== 'pending' || payingId === share.id}
                          style={pressFeedback}
                          className={`flex-row items-center justify-between rounded-xl px-3 py-2.5 bg-gray-50 dark:bg-tabby-800 border ${
                            overdue
                              ? 'border-amber-400 dark:border-amber-500'
                              : 'border-gray-100 dark:border-tabby-700'
                          }`}
                        >
                          <View className="flex-1">
                            <Text className="font-nunito-medium dark:text-white">
                              {share.payerLabel} · {share.billTitle}
                            </Text>
                            <Text
                              className={`font-nunito text-xs ${
                                share.status === 'paid'
                                  ? 'text-green-700 dark:text-green-400'
                                  : overdue
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-gray-500 dark:text-tabby-300'
                              }`}
                            >
                              {overdue ? 'Overdue -- tap to remind' : STATUS_LABEL[share.status]}
                            </Text>
                          </View>
                          {payingId === share.id ? (
                            <ActivityIndicator size="small" color={isDark ? '#E8C39E' : '#8B5A2B'} />
                          ) : (
                            <Text className="font-nunito-bold dark:text-white">
                              ${share.amountOwed.toFixed(2)}
                            </Text>
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            </ScrollView>
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
