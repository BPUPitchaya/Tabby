// A thin aggregator over data that already exists elsewhere -- friend
// requests and split money-owing both already live in friends-modal.tsx.
// This reads the exact same lib functions rather than a separate table or
// fetch path, so the Home bell's badge count can never drift out of sync
// with what the Friends screen shows (see session design notes/premortem:
// "bill reminders" was deliberately cut from v1 since it has no data model
// yet -- only ship sources that already have one).
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
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { type Bill } from '@/lib/bills';
import { type MyBillSplitShare, type OwedToMeShare } from '@/lib/bill-splits';
import { type FriendRequest } from '@/lib/friendships';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

export function NotificationsModal({
  visible,
  onClose,
  loading,
  incoming,
  proposedShares,
  overdueShares,
  reminders,
  pendingPayday,
  paydayAmount,
  paydayBusy,
  pendingBills,
  billBusyId,
  onRespondRequest,
  onRespondShare,
  onRemindInApp,
  onRemindViaMessage,
  onMarkPaid,
  onConfirmPayday,
  onDeclinePayday,
  onConfirmBill,
  onDeclineBill,
  onSkipBill,
}: {
  visible: boolean;
  onClose: () => void;
  loading: boolean;
  incoming: FriendRequest[];
  proposedShares: MyBillSplitShare[];
  overdueShares: OwedToMeShare[];
  reminders: MyBillSplitShare[];
  pendingPayday: string | null;
  paydayAmount: number;
  paydayBusy: boolean;
  pendingBills: (Bill & { dueDate: string })[];
  billBusyId: string | null;
  onRespondRequest: (id: string, accept: boolean) => void;
  onRespondShare: (id: string, accept: boolean) => void;
  onRemindInApp: (share: OwedToMeShare) => void;
  onRemindViaMessage: (share: OwedToMeShare) => void;
  onMarkPaid: (shareId: string) => void;
  onConfirmPayday: (amount: number) => void;
  onDeclinePayday: () => void;
  onConfirmBill: (bill: Bill & { dueDate: string }, amount: number) => void;
  onDeclineBill: (bill: Bill & { dueDate: string }) => void;
  onSkipBill: (bill: Bill & { dueDate: string }) => void;
}) {
  const isDark = useColorScheme() === 'dark';
  const [billAmountDrafts, setBillAmountDrafts] = useState<Record<string, string>>({});
  // Prefilled from the expected amount, but editable -- an hourly/variable
  // payday is rarely exactly what was configured, and the old flow had no
  // way to log anything else (see Phase 0 of the income-sources plan).
  const [paydayAmountDraft, setPaydayAmountDraft] = useState<string | null>(null);

  // Re-seed the draft from the newly expected amount whenever the pending
  // payday itself changes (a new cycle, or the prompt clearing) -- without
  // this, editing one payday's amount would leak into the next one.
  useEffect(() => {
    setPaydayAmountDraft(null);
  }, [pendingPayday]);
  const isEmpty =
    incoming.length === 0 &&
    proposedShares.length === 0 &&
    overdueShares.length === 0 &&
    reminders.length === 0 &&
    pendingBills.length === 0 &&
    !pendingPayday;

  const presentOverdueActions = (share: OwedToMeShare) => {
    const options = ['Remind in App', 'Remind via Text/Other Apps', 'Mark as Paid', 'Cancel'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: 3 }, (index) => {
        if (index === 0) onRemindInApp(share);
        if (index === 1) onRemindViaMessage(share);
        if (index === 2) onMarkPaid(share.id);
      });
    } else {
      Alert.alert(`${share.payerLabel} · ${share.billTitle}`, undefined, [
        { text: 'Remind in App', onPress: () => onRemindInApp(share) },
        { text: 'Remind via Text/Other Apps', onPress: () => onRemindViaMessage(share) },
        { text: 'Mark as Paid', onPress: () => onMarkPaid(share.id) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  // Your own debt, already pending -- nothing to accept/decline, just
  // settle it (or leave it, closing the sheet).
  const presentReminderActions = (shareId: string) => {
    const options = ['Mark as Paid', 'Cancel'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: 1 }, (index) => {
        if (index === 0) onMarkPaid(shareId);
      });
    } else {
      Alert.alert('Mark as paid?', undefined, [
        { text: 'Mark as Paid', onPress: () => onMarkPaid(shareId) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-white dark:bg-tabby-900">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-tabby-700">
            <Text className="font-fredoka-semibold text-xl dark:text-white">Notifications</Text>
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

          {loading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator />
            </View>
          ) : isEmpty ? (
            <View className="flex-1 items-center justify-center gap-3 px-8">
              <View className="w-14 h-14 rounded-full bg-gray-100 dark:bg-tabby-700 items-center justify-center">
                <Feather name="bell" size={22} color="#9ca3af" />
              </View>
              <Text className="font-nunito text-center text-gray-500 dark:text-tabby-300">
                Nothing waiting on you right now.
              </Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
              {pendingPayday && (
                <View className="gap-2">
                  <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300 text-xs tracking-wide">
                    PAYDAY
                  </Text>
                  <View className="rounded-xl px-3 py-2.5 bg-gray-50 dark:bg-tabby-800 border border-tabby-400 dark:border-tabby-200 gap-2">
                    <Text className="font-nunito-medium dark:text-white">
                      Did you get paid on {pendingPayday}?
                    </Text>
                    <TextInput
                      value={paydayAmountDraft ?? paydayAmount.toFixed(2)}
                      onChangeText={setPaydayAmountDraft}
                      placeholder="Amount"
                      keyboardType="decimal-pad"
                      className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2 text-sm dark:text-white bg-white dark:bg-tabby-900"
                    />
                    <View className="flex-row gap-2">
                      <Pressable
                        onPress={() => {
                          const parsed = parseFloat(paydayAmountDraft ?? String(paydayAmount));
                          onConfirmPayday(isNaN(parsed) || parsed <= 0 ? paydayAmount : parsed);
                        }}
                        disabled={paydayBusy}
                        style={pressFeedback}
                        className="flex-1 items-center py-1.5 rounded-lg bg-tabby-600 dark:bg-white"
                      >
                        {paydayBusy ? (
                          <ActivityIndicator size="small" color={isDark ? '#2B1810' : 'white'} />
                        ) : (
                          <Text className="font-nunito-semibold text-sm text-white dark:text-tabby-900">
                            Yes, log it
                          </Text>
                        )}
                      </Pressable>
                      <Pressable
                        onPress={onDeclinePayday}
                        disabled={paydayBusy}
                        style={pressFeedback}
                        className="flex-1 items-center py-1.5 rounded-lg border border-gray-300 dark:border-tabby-600"
                      >
                        <Text className="font-nunito-semibold text-sm text-gray-600 dark:text-tabby-200">
                          Not yet
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              )}

              {pendingBills.length > 0 && (
                <View className="gap-2">
                  <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300 text-xs tracking-wide">
                    BILLS
                  </Text>
                  <View className="gap-1.5">
                    {pendingBills.map((bill) => {
                      const busy = billBusyId === bill.id;
                      const draft = billAmountDrafts[bill.id] ?? '';
                      const confirmAmount = bill.isVariable ? parseFloat(draft) : (bill.amount ?? 0);
                      const canConfirm = !isNaN(confirmAmount) && confirmAmount > 0;
                      return (
                        <View
                          key={bill.id}
                          className="rounded-xl px-3 py-2.5 bg-gray-50 dark:bg-tabby-800 border border-tabby-400 dark:border-tabby-200 gap-2"
                        >
                          <Text className="font-nunito-medium dark:text-white">
                            {bill.name} is due {bill.dueDate}
                            {!bill.isVariable && ` · $${(bill.amount ?? 0).toFixed(2)}`}
                          </Text>
                          {bill.isVariable && (
                            <TextInput
                              value={draft}
                              onChangeText={(text) => setBillAmountDrafts((d) => ({ ...d, [bill.id]: text }))}
                              placeholder="How much was it?"
                              keyboardType="decimal-pad"
                              className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2 text-sm dark:text-white"
                            />
                          )}
                          <View className="flex-row gap-2">
                            <Pressable
                              onPress={() => onConfirmBill(bill, confirmAmount)}
                              disabled={busy || !canConfirm}
                              style={pressFeedback}
                              className={`flex-1 items-center py-1.5 rounded-lg ${canConfirm ? 'bg-tabby-600 dark:bg-white' : 'bg-gray-300 dark:bg-tabby-700'}`}
                            >
                              {busy ? (
                                <ActivityIndicator size="small" color={isDark ? '#2B1810' : 'white'} />
                              ) : (
                                <Text className="font-nunito-semibold text-sm text-white dark:text-tabby-900">
                                  Yes, log it
                                </Text>
                              )}
                            </Pressable>
                            <Pressable
                              onPress={() => onDeclineBill(bill)}
                              disabled={busy}
                              style={pressFeedback}
                              className="flex-1 items-center py-1.5 rounded-lg border border-gray-300 dark:border-tabby-600"
                            >
                              <Text className="font-nunito-semibold text-sm text-gray-600 dark:text-tabby-200">
                                Not yet
                              </Text>
                            </Pressable>
                            <Pressable
                              onPress={() => onSkipBill(bill)}
                              disabled={busy}
                              style={pressFeedback}
                              className="px-3 items-center justify-center py-1.5 rounded-lg border border-gray-300 dark:border-tabby-600"
                            >
                              <Text className="font-nunito-semibold text-sm text-gray-500 dark:text-tabby-300">
                                Skip
                              </Text>
                            </Pressable>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              {reminders.length > 0 && (
                <View className="gap-2">
                  <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300 text-xs tracking-wide">
                    REMINDERS
                  </Text>
                  <View className="gap-1.5">
                    {reminders.map((share) => (
                      <Pressable
                        key={share.id}
                        onPress={() => presentReminderActions(share.id)}
                        style={pressFeedback}
                        className="flex-row items-center justify-between rounded-xl px-3 py-2.5 bg-gray-50 dark:bg-tabby-800 border border-amber-400 dark:border-amber-500"
                      >
                        <View className="flex-1">
                          <Text className="font-nunito-medium dark:text-white">
                            {share.bill_splits?.title ?? 'A bill'}
                          </Text>
                          <Text className="font-nunito text-xs text-amber-600 dark:text-amber-400">
                            You were reminded about this
                          </Text>
                        </View>
                        <Text className="font-nunito-bold dark:text-white">
                          ${share.amount_owed.toFixed(2)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              {overdueShares.length > 0 && (
                <View className="gap-2">
                  <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300 text-xs tracking-wide">
                    OVERDUE
                  </Text>
                  <View className="gap-1.5">
                    {overdueShares.map((share) => (
                      <Pressable
                        key={share.id}
                        onPress={() => presentOverdueActions(share)}
                        style={pressFeedback}
                        className="flex-row items-center justify-between rounded-xl px-3 py-2.5 bg-gray-50 dark:bg-tabby-800 border border-amber-400 dark:border-amber-500"
                      >
                        <View className="flex-1">
                          <Text className="font-nunito-medium dark:text-white">
                            {share.payerLabel} · {share.billTitle}
                          </Text>
                          <Text className="font-nunito text-xs text-amber-600 dark:text-amber-400">
                            Tap to remind
                          </Text>
                        </View>
                        <Text className="font-nunito-bold dark:text-white">
                          ${share.amountOwed.toFixed(2)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              {proposedShares.length > 0 && (
                <View className="gap-2">
                  <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300 text-xs tracking-wide">
                    MONEY OWING
                  </Text>
                  <View className="gap-1.5">
                    {proposedShares.map((share) => (
                      <View
                        key={share.id}
                        className="rounded-xl px-3 py-2.5 bg-gray-50 dark:bg-tabby-800 border border-gray-100 dark:border-tabby-700 gap-2"
                      >
                        <Text className="font-nunito-medium dark:text-white">
                          {share.bill_splits?.title ?? 'A bill'} -- you&apos;d owe $
                          {share.amount_owed.toFixed(2)}
                        </Text>
                        <View className="flex-row gap-2">
                          <Pressable
                            onPress={() => onRespondShare(share.id, true)}
                            style={pressFeedback}
                            className="flex-1 items-center py-1.5 rounded-lg bg-tabby-600 dark:bg-white"
                          >
                            <Text className="font-nunito-semibold text-sm text-white dark:text-tabby-900">
                              Accept
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() => onRespondShare(share.id, false)}
                            style={pressFeedback}
                            className="flex-1 items-center py-1.5 rounded-lg border border-gray-300 dark:border-tabby-600"
                          >
                            <Text className="font-nunito-semibold text-sm text-gray-600 dark:text-tabby-200">
                              Decline
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {incoming.length > 0 && (
                <View className="gap-2">
                  <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300 text-xs tracking-wide">
                    FRIEND REQUESTS
                  </Text>
                  <View className="gap-1.5">
                    {incoming.map((req) => (
                      <View
                        key={req.id}
                        className="flex-row items-center justify-between rounded-xl px-3 py-2.5 bg-gray-50 dark:bg-tabby-800 border border-gray-100 dark:border-tabby-700"
                      >
                        <Text className="font-nunito-medium dark:text-white flex-1">
                          {req.otherDisplayName}
                        </Text>
                        <View className="flex-row gap-2">
                          <Pressable
                            onPress={() => onRespondRequest(req.id, true)}
                            style={pressFeedback}
                            accessibilityRole="button"
                            accessibilityLabel={`Accept ${req.otherDisplayName}`}
                            className="w-8 h-8 rounded-full bg-tabby-600 dark:bg-white items-center justify-center"
                          >
                            <Feather name="check" size={15} color={isDark ? '#2B1810' : '#fff'} />
                          </Pressable>
                          <Pressable
                            onPress={() => onRespondRequest(req.id, false)}
                            style={pressFeedback}
                            accessibilityRole="button"
                            accessibilityLabel={`Decline ${req.otherDisplayName}`}
                            className="w-8 h-8 rounded-full border border-gray-300 dark:border-tabby-600 items-center justify-center"
                          >
                            <Feather name="x" size={15} color={isDark ? '#E8C39E' : '#4b5563'} />
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </ScrollView>
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
