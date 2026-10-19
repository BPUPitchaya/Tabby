// A thin aggregator over data that already exists elsewhere -- friend
// requests and split money-owing both already live in friends-modal.tsx.
// This reads the exact same lib functions rather than a separate table or
// fetch path, so the Home bell's badge count can never drift out of sync
// with what the Friends screen shows (see session design notes/premortem:
// "bill reminders" was deliberately cut from v1 since it has no data model
// yet -- only ship sources that already have one).
import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
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

import { parsePaidHours, parsePayslip } from '@/lib/ai';
import { type Bill } from '@/lib/bills';
import { type MyBillSplitShare, type OwedToMeShare } from '@/lib/bill-splits';
import { presentScanSheet } from '@/lib/document-scan';
import { type FriendRequest } from '@/lib/friendships';
import { computeGrossPay, type IncomeBreakdown, type IncomeSource } from '@/lib/income-sources';
import { computeNetPay, type NzTaxCode } from '@/lib/nz-tax';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

export function NotificationsModal({
  visible,
  onClose,
  loading,
  incoming,
  proposedShares,
  overdueShares,
  reminders,
  pendingBills,
  billBusyId,
  pendingIncomeSources,
  incomeSourceBusyId,
  onRespondRequest,
  onRespondShare,
  onRemindInApp,
  onRemindViaMessage,
  onOwerConfirmPaid,
  onPayeeConfirmPaid,
  onConfirmBill,
  onDeclineBill,
  onSkipBill,
  onConfirmIncomeSource,
  onDeclineIncomeSource,
  onSkipIncomeSource,
}: {
  visible: boolean;
  onClose: () => void;
  loading: boolean;
  incoming: FriendRequest[];
  proposedShares: MyBillSplitShare[];
  overdueShares: OwedToMeShare[];
  reminders: MyBillSplitShare[];
  pendingBills: (Bill & { dueDate: string })[];
  billBusyId: string | null;
  pendingIncomeSources: (IncomeSource & { paydayDate: string })[];
  incomeSourceBusyId: string | null;
  onRespondRequest: (id: string, accept: boolean) => void;
  onRespondShare: (id: string, accept: boolean) => void;
  onRemindInApp: (share: OwedToMeShare) => void;
  onRemindViaMessage: (share: OwedToMeShare) => void;
  onOwerConfirmPaid: (shareId: string) => void;
  onPayeeConfirmPaid: (shareId: string) => void;
  onConfirmBill: (bill: Bill & { dueDate: string }, amount: number) => void;
  onDeclineBill: (bill: Bill & { dueDate: string }) => void;
  onSkipBill: (bill: Bill & { dueDate: string }) => void;
  onConfirmIncomeSource: (
    source: IncomeSource & { paydayDate: string },
    amount: number,
    breakdown?: IncomeBreakdown,
  ) => void;
  onDeclineIncomeSource: (source: IncomeSource & { paydayDate: string }) => void;
  onSkipIncomeSource: (source: IncomeSource & { paydayDate: string }) => void;
}) {
  const isDark = useColorScheme() === 'dark';
  const [billAmountDrafts, setBillAmountDrafts] = useState<Record<string, string>>({});
  // Fixed-mode sources: an editable amount, same shape the old singleton
  // payday prompt had. Hourly-mode sources: paid hours instead, run through
  // computeGrossPay -- "paid" not "worked" since paid leave still counts
  // (see income-sources.ts).
  const [incomeAmountDrafts, setIncomeAmountDrafts] = useState<Record<string, string>>({});
  const [incomeHoursDrafts, setIncomeHoursDrafts] = useState<Record<string, string>>({});
  // Phase 6: which source is mid AI round-trip right now -- either reading
  // a scanned payslip, or parsing free-text hours. Separate from the
  // parent's own `busy`/`incomeSourceBusyId` (that one covers the actual
  // confirm/skip RPC), since this covers the AI step that happens before
  // the user even taps confirm.
  const [aiBusyId, setAiBusyId] = useState<string | null>(null);

  const isEmpty =
    incoming.length === 0 &&
    proposedShares.length === 0 &&
    overdueShares.length === 0 &&
    reminders.length === 0 &&
    pendingBills.length === 0 &&
    pendingIncomeSources.length === 0;

  // Two-step settle: a guest share (no account on the other side) still
  // settles on this one confirm, same as a real user's share once THEY'VE
  // already confirmed their half -- otherwise this is just the payee's
  // own half, and the share stays "waiting for them" until the ower
  // confirms too. Already confirmed your own half? Nothing left to do --
  // the row that reached here shouldn't even be tappable then (see the
  // OVERDUE section's own filter below).
  const presentOverdueActions = (share: OwedToMeShare) => {
    // Already confirmed your own half -- nothing left for you to do,
    // just remind them (or wait).
    if (share.payeeConfirmedAt) {
      const options = ['Remind in App', 'Remind via Text/Other Apps', 'Cancel'];
      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: 2 }, (index) => {
          if (index === 0) onRemindInApp(share);
          if (index === 1) onRemindViaMessage(share);
        });
      } else {
        Alert.alert(`${share.payerLabel} · ${share.billTitle}`, undefined, [
          { text: 'Remind in App', onPress: () => onRemindInApp(share) },
          { text: 'Remind via Text/Other Apps', onPress: () => onRemindViaMessage(share) },
          { text: 'Cancel', style: 'cancel' },
        ]);
      }
      return;
    }

    const markPaidLabel = share.isGuest || share.owerConfirmedAt ? 'Mark as Paid' : 'I received this';
    const options = ['Remind in App', 'Remind via Text/Other Apps', markPaidLabel, 'Cancel'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: 3 }, (index) => {
        if (index === 0) onRemindInApp(share);
        if (index === 1) onRemindViaMessage(share);
        if (index === 2) onPayeeConfirmPaid(share.id);
      });
    } else {
      Alert.alert(`${share.payerLabel} · ${share.billTitle}`, undefined, [
        { text: 'Remind in App', onPress: () => onRemindInApp(share) },
        { text: 'Remind via Text/Other Apps', onPress: () => onRemindViaMessage(share) },
        { text: markPaidLabel, onPress: () => onPayeeConfirmPaid(share.id) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  // Phase 6: scan a photographed payslip as ground truth, reusing the same
  // picker/AI infra as receipt scanning (document-scan.ts / lib/ai.ts).
  // Only ever prefills the input the user still reviews and taps confirm
  // on -- never auto-submits, and never touches tax code or rate (that AI
  // use was ruled out earlier in this project). For a net-tracked source,
  // only grossPay is used to prefill -- the field there means gross (tax
  // is computed from it), so filling it from a scanned netPay would get
  // taxed a second time.
  const handleScanPayslip = async (source: IncomeSource) => {
    try {
      const doc = await presentScanSheet();
      if (!doc) return;
      setAiBusyId(source.id);
      const parsed = await parsePayslip(doc.base64Data, doc.mimeType);
      if (!parsed) {
        Alert.alert("Couldn't read that payslip", 'Enter the figure manually instead.');
        return;
      }
      if (source.mode === 'hourly') {
        if (parsed.hoursPaid !== null) {
          setIncomeHoursDrafts((d) => ({ ...d, [source.id]: String(parsed.hoursPaid) }));
        } else {
          Alert.alert("Couldn't read hours from that payslip", 'Enter them manually instead.');
        }
        return;
      }
      if (source.trackingMode === 'net') {
        if (parsed.grossPay !== null) {
          setIncomeAmountDrafts((d) => ({ ...d, [source.id]: String(parsed.grossPay) }));
        } else {
          Alert.alert(
            "Couldn't read a gross figure from that payslip",
            'This source tracks net pay, which needs the gross amount to estimate tax from. Enter it manually instead.',
          );
        }
        return;
      }
      const amount = parsed.grossPay ?? parsed.netPay;
      if (amount !== null) {
        setIncomeAmountDrafts((d) => ({ ...d, [source.id]: String(amount) }));
      } else {
        Alert.alert("Couldn't read an amount from that payslip", 'Enter it manually instead.');
      }
    } catch (err) {
      Alert.alert('Scan failed', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setAiBusyId(null);
    }
  };

  // Plain numbers resolve for free, instantly -- only reaches for AI when
  // the typed text isn't one (see parsePaidHours in lib/ai.ts), so a
  // normal "40" never costs a round trip.
  const resolveHours = async (sourceId: string, draft: string): Promise<number | null> => {
    const plain = parseFloat(draft);
    if (!isNaN(plain)) return plain;
    setAiBusyId(sourceId);
    try {
      return await parsePaidHours(draft);
    } finally {
      setAiBusyId(null);
    }
  };

  // Your own debt, already pending -- nothing to accept/decline, just
  // settle it (or leave it, closing the sheet).
  const presentReminderActions = (shareId: string) => {
    const options = ['Mark as Paid', 'Cancel'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: 1 }, (index) => {
        if (index === 0) onOwerConfirmPaid(shareId);
      });
    } else {
      Alert.alert('Mark as paid?', undefined, [
        { text: 'Mark as Paid', onPress: () => onOwerConfirmPaid(shareId) },
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

              {pendingIncomeSources.length > 0 && (
                <View className="gap-2">
                  <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300 text-xs tracking-wide">
                    INCOME
                  </Text>
                  <View className="gap-1.5">
                    {pendingIncomeSources.map((source) => {
                      const busy = incomeSourceBusyId === source.id;
                      const aiBusy = aiBusyId === source.id;
                      const amountDraft = incomeAmountDrafts[source.id] ?? '';
                      const hoursDraft = incomeHoursDrafts[source.id] ?? '';
                      // The field above always holds GROSS pay (what the payslip
                      // itself shows) -- for net-tracked sources, what actually
                      // gets logged as Earned is the estimated take-home, computed
                      // from that gross figure via lib/nz-tax.ts. Only resolved
                      // here when the typed text is already a plain number --
                      // free-text hours ("32 plus 8 sick") only resolve on confirm,
                      // via resolveHours's AI fallback.
                      const plainGrossAmount =
                        source.mode === 'fixed'
                          ? parseFloat(amountDraft || String(source.amount ?? 0))
                          : (computeGrossPay(source, parseFloat(hoursDraft)) ?? NaN);
                      const canConfirm =
                        source.mode === 'fixed'
                          ? !isNaN(plainGrossAmount) && plainGrossAmount > 0
                          : hoursDraft.trim().length > 0;
                      const netBreakdown =
                        !isNaN(plainGrossAmount) &&
                        plainGrossAmount > 0 &&
                        source.trackingMode === 'net' &&
                        source.taxCode
                          ? computeNetPay({
                              grossPay: plainGrossAmount,
                              frequency: source.frequency,
                              taxCode: source.taxCode as NzTaxCode,
                              hasStudentLoan: source.hasStudentLoan,
                              kiwiSaverPct: source.kiwiSaverPct,
                            })
                          : null;

                      const handleConfirmPress = async () => {
                        let grossAmount = plainGrossAmount;
                        let hoursUsed: number | undefined;
                        if (source.mode === 'hourly') {
                          if (isNaN(grossAmount)) {
                            const hours = await resolveHours(source.id, hoursDraft);
                            if (hours === null || hours <= 0) {
                              Alert.alert(
                                "Couldn't understand those hours",
                                'Try rephrasing, or enter a plain number like "40".',
                              );
                              return;
                            }
                            hoursUsed = hours;
                            grossAmount = computeGrossPay(source, hours) ?? NaN;
                          } else {
                            hoursUsed = parseFloat(hoursDraft);
                          }
                        }
                        if (isNaN(grossAmount) || grossAmount <= 0) return;
                        const netBreakdownFinal =
                          source.trackingMode === 'net' && source.taxCode
                            ? computeNetPay({
                                grossPay: grossAmount,
                                frequency: source.frequency,
                                taxCode: source.taxCode as NzTaxCode,
                                hasStudentLoan: source.hasStudentLoan,
                                kiwiSaverPct: source.kiwiSaverPct,
                              })
                            : null;
                        const breakdown: IncomeBreakdown = {
                          grossAmount,
                          hoursPaid: hoursUsed,
                          incomeTax: netBreakdownFinal?.incomeTax,
                          accLevy: netBreakdownFinal?.accLevy,
                          studentLoan: netBreakdownFinal?.studentLoan,
                          kiwiSaver: netBreakdownFinal?.kiwiSaver,
                        };
                        onConfirmIncomeSource(
                          source,
                          netBreakdownFinal ? netBreakdownFinal.netPay : grossAmount,
                          breakdown,
                        );
                      };

                      return (
                        <View
                          key={source.id}
                          className="rounded-xl px-3 py-2.5 bg-gray-50 dark:bg-tabby-800 border border-tabby-400 dark:border-tabby-200 gap-2"
                        >
                          <View className="flex-row items-center justify-between gap-2">
                            <Text className="font-nunito-medium dark:text-white flex-1">
                              Did you get paid by {source.label} on {source.paydayDate}?
                            </Text>
                            <Pressable
                              onPress={() => handleScanPayslip(source)}
                              disabled={busy || aiBusy}
                              style={pressFeedback}
                              accessibilityRole="button"
                              accessibilityLabel="Scan payslip"
                              className="w-8 h-8 rounded-full bg-white dark:bg-tabby-900 border border-gray-300 dark:border-tabby-600 items-center justify-center"
                            >
                              <Feather name="camera" size={14} color={isDark ? '#E8C39E' : '#4b5563'} />
                            </Pressable>
                          </View>
                          {source.mode === 'fixed' ? (
                            <TextInput
                              value={amountDraft || (source.amount ?? 0).toFixed(2)}
                              onChangeText={(text) =>
                                setIncomeAmountDrafts((d) => ({ ...d, [source.id]: text }))
                              }
                              placeholder={source.trackingMode === 'net' ? 'Gross amount' : 'Amount'}
                              keyboardType="decimal-pad"
                              className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2 text-sm dark:text-white bg-white dark:bg-tabby-900"
                            />
                          ) : (
                            <TextInput
                              value={hoursDraft}
                              onChangeText={(text) =>
                                setIncomeHoursDrafts((d) => ({ ...d, [source.id]: text }))
                              }
                              placeholder='How many hours were you paid for? e.g. "40" or "32 plus 8 sick"'
                              className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2 text-sm dark:text-white bg-white dark:bg-tabby-900"
                            />
                          )}
                          {netBreakdown && (
                            <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">
                              Est. take-home ${netBreakdown.netPay.toFixed(2)} after tax (gross $
                              {plainGrossAmount.toFixed(2)}): this is what gets logged.
                            </Text>
                          )}
                          <View className="flex-row gap-2">
                            <Pressable
                              onPress={handleConfirmPress}
                              disabled={busy || aiBusy || !canConfirm}
                              style={pressFeedback}
                              className={`flex-1 items-center py-1.5 rounded-lg ${canConfirm ? 'bg-tabby-600 dark:bg-white' : 'bg-gray-300 dark:bg-tabby-700'}`}
                            >
                              {busy || aiBusy ? (
                                <ActivityIndicator size="small" color={isDark ? '#2B1810' : 'white'} />
                              ) : (
                                <Text className="font-nunito-semibold text-sm text-white dark:text-tabby-900">
                                  Yes, log it
                                </Text>
                              )}
                            </Pressable>
                            <Pressable
                              onPress={() => onDeclineIncomeSource(source)}
                              disabled={busy || aiBusy}
                              style={pressFeedback}
                              className="flex-1 items-center py-1.5 rounded-lg border border-gray-300 dark:border-tabby-600"
                            >
                              <Text className="font-nunito-semibold text-sm text-gray-600 dark:text-tabby-200">
                                Not yet
                              </Text>
                            </Pressable>
                            <Pressable
                              onPress={() => onSkipIncomeSource(source)}
                              disabled={busy || aiBusy}
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
                            {share.payeeConfirmedAt ? 'Waiting for them to confirm' : 'Tap to remind'}
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
                          {share.bill_splits?.title ?? 'A bill'}: you&apos;d owe $
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
