// Full owe/owed history for bill splits -- the two existing fetch
// functions (fetchMyPendingShares, fetchOwedToMe) already existed in
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
  RefreshControl,
  ScrollView,
  Share,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth-context';
import {
  confirmSharePaidByOwer,
  confirmSharePaidByPayee,
  fetchMyPendingShares,
  fetchOwedToMe,
  isOverdue,
  markReminded,
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
  const [refreshing, setRefreshing] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [myPaymentDetails, setMyPaymentDetails] = useState<string | null>(null);
  // Which "You Owe" row is expanded into its own confirm-with-note form --
  // only one at a time, same reasoning as any other inline-edit-in-place
  // pattern in this app (never two forms open at once).
  const [expandedOweId, setExpandedOweId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

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

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Two-step settle -- a share only reaches 'paid' once BOTH sides have
  // confirmed. "You Owe" is your own half (the ower); "Owed To You" is
  // the other half (the payee). A guest share (no account on the other
  // side) still settles on the payee's confirm alone -- see
  // confirmSharePaidByPayee for that exception.
  const handleOwerConfirm = async (shareId: string) => {
    setPayingId(shareId);
    try {
      await confirmSharePaidByOwer(shareId, noteDrafts[shareId]);
      setExpandedOweId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark as paid.');
    } finally {
      setPayingId(null);
    }
  };

  const handlePayeeConfirm = async (shareId: string) => {
    setPayingId(shareId);
    try {
      await confirmSharePaidByPayee(shareId);
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

  // Your own half of the settle -- the share only reaches 'paid' once the
  // other party (the payee) confirms too. Expands in place to an optional
  // note field (a bank ref, "paid via cash") rather than an ActionSheet --
  // the payee's own cross-check, see confirmSharePaidByOwer.
  const toggleYouOweExpanded = (share: MyBillSplitShare) => {
    if (share.ower_confirmed_at) return; // already confirmed your half
    setExpandedOweId((id) => (id === share.id ? null : share.id));
  };

  const presentOwedToYouActions = (share: OwedToMeShare) => {
    if (share.status !== 'pending') return;
    // Already confirmed your own half -- nothing left to do but remind
    // (or wait) until they confirm theirs.
    if (share.payeeConfirmedAt) {
      const options = ['Remind in App', 'Remind via Text/Other Apps', 'Cancel'];
      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: 2 }, (index) => {
          if (index === 0) handleRemindInApp(share);
          if (index === 1) handleRemindViaMessage(share);
        });
      } else {
        Alert.alert(`${share.payerLabel} · ${share.billTitle}`, undefined, [
          { text: 'Remind in App', onPress: () => handleRemindInApp(share) },
          { text: 'Remind via Text/Other Apps', onPress: () => handleRemindViaMessage(share) },
          { text: 'Cancel', style: 'cancel' },
        ]);
      }
      return;
    }

    const markPaidLabel = share.isGuest || share.owerConfirmedAt ? 'Mark as Paid' : 'I received this';
    const options = ['Remind in App', 'Remind via Text/Other Apps', markPaidLabel, 'Cancel'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: 3 }, (index) => {
        if (index === 0) handleRemindInApp(share);
        if (index === 1) handleRemindViaMessage(share);
        if (index === 2) handlePayeeConfirm(share.id);
      });
    } else {
      Alert.alert(`${share.payerLabel} · ${share.billTitle}`, undefined, [
        { text: 'Remind in App', onPress: () => handleRemindInApp(share) },
        { text: 'Remind via Text/Other Apps', onPress: () => handleRemindViaMessage(share) },
        { text: markPaidLabel, onPress: () => handlePayeeConfirm(share.id) },
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
            <ScrollView
              contentContainerStyle={{ padding: 16, gap: 20 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
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
                      ? 'Nothing outstanding, nice.'
                      : "You haven't paid anything back yet."}
                  </Text>
                ) : (
                  <View className="gap-1.5">
                    {visibleYouOwe.map((share) => {
                      const expanded = expandedOweId === share.id;
                      return (
                        <View
                          key={share.id}
                          className={`rounded-xl bg-gray-50 dark:bg-tabby-800 border ${
                            share.reminded_at || share.ower_confirmed_at
                              ? 'border-amber-400 dark:border-amber-500'
                              : 'border-gray-100 dark:border-tabby-700'
                          }`}
                        >
                          <Pressable
                            onPress={() => toggleYouOweExpanded(share)}
                            disabled={payingId === share.id || !!share.ower_confirmed_at}
                            style={pressFeedback}
                            className="flex-row items-center justify-between px-3 py-2.5"
                          >
                            <View className="flex-1">
                              <Text className="font-nunito-medium dark:text-white">
                                {share.bill_splits?.title ?? 'A bill'}
                                {share.bill_splits?.merchant ? ` · ${share.bill_splits.merchant}` : ''}
                              </Text>
                              {share.status === 'pending' && (share.ower_confirmed_at || share.reminded_at) && (
                                <Text className="font-nunito text-xs text-amber-600 dark:text-amber-400">
                                  {share.ower_confirmed_at ? 'Waiting for them to confirm' : 'Reminder sent'}
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
                          {expanded && (
                            <View className="px-3 pb-3 gap-2">
                              <TextInput
                                value={noteDrafts[share.id] ?? ''}
                                onChangeText={(text) => setNoteDrafts((d) => ({ ...d, [share.id]: text }))}
                                placeholder='Add a reference (optional): bank ref, "paid via cash", etc.'
                                className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2 text-sm dark:text-white bg-white dark:bg-tabby-900"
                              />
                              <View className="flex-row gap-2">
                                <Pressable
                                  onPress={() => handleOwerConfirm(share.id)}
                                  disabled={payingId === share.id}
                                  style={pressFeedback}
                                  className="flex-1 items-center py-2 rounded-lg bg-tabby-600 dark:bg-white"
                                >
                                  <Text className="font-nunito-semibold text-sm text-white dark:text-tabby-900">
                                    Mark as Paid
                                  </Text>
                                </Pressable>
                                <Pressable
                                  onPress={() => setExpandedOweId(null)}
                                  disabled={payingId === share.id}
                                  style={pressFeedback}
                                  className="px-4 items-center justify-center rounded-lg border border-gray-300 dark:border-tabby-600"
                                >
                                  <Text className="font-nunito-semibold text-sm dark:text-white">Cancel</Text>
                                </Pressable>
                              </View>
                            </View>
                          )}
                        </View>
                      );
                    })}
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
                                  : overdue || share.payeeConfirmedAt
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-gray-500 dark:text-tabby-300'
                              }`}
                            >
                              {share.payeeConfirmedAt
                                ? 'Waiting for them to confirm'
                                : overdue
                                  ? 'Overdue, tap to remind'
                                  : STATUS_LABEL[share.status]}
                            </Text>
                            {share.note && (
                              <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300 mt-0.5">
                                Their note: {share.note}
                              </Text>
                            )}
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
