// "Detail of the pay" -- opened instead of the generic edit form when a
// tapped income transaction carries a breakdown (logged via an income
// source's bell confirm, see income-sources.ts's IncomeBreakdown /
// 0031_add_income_breakdown_to_transactions.sql). A plain manual income
// entry has none of these fields and never reaches this modal -- see the
// tap-handler branch in transactions.tsx.
//
// "Edit this transaction" switches this same screen into an inline editor
// for the pay figures themselves -- hours/gross, tax code, student loan,
// KiwiSaver -- the same inputs income-sources-modal.tsx's form uses to set
// the job up, not the generic amount/description/merchant/date form (that
// one doesn't know what a tax code or KiwiSaver % even is). A small link
// still reaches the generic form for merchant/description/date typos.
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { DetailRow as Row } from '@/components/detail-row';
import {
  computeGrossPay,
  fetchIncomeSourceById,
  KIWISAVER_OPTIONS,
  TAX_CODE_OPTIONS,
  type IncomeSource,
  type KiwiSaverPct,
} from '@/lib/income-sources';
import { computeNetPay, type NzTaxCode } from '@/lib/nz-tax';
import { updateTransaction, type Transaction } from '@/lib/transactions';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

export function IncomeTransactionDetailModal({
  visible,
  onClose,
  transaction,
  onSaved,
  onEditOtherFields,
}: {
  visible: boolean;
  onClose: () => void;
  transaction: Transaction | null;
  onSaved: () => void;
  onEditOtherFields: (transaction: Transaction) => void;
}) {
  const isDark = useColorScheme() === 'dark';
  const [source, setSource] = useState<IncomeSource | null>(null);
  const [loadingSource, setLoadingSource] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [amountDraft, setAmountDraft] = useState('');
  const [hoursDraft, setHoursDraft] = useState('');
  const [trackingNet, setTrackingNet] = useState(false);
  const [taxCode, setTaxCode] = useState<string | null>(null);
  const [hasStudentLoan, setHasStudentLoan] = useState(false);
  const [kiwiSaverPct, setKiwiSaverPct] = useState<KiwiSaverPct | null>(null);

  useEffect(() => {
    if (!visible || !transaction) return;
    setEditing(false);
    setError(null);
    if (!transaction.income_source_id) {
      setSource(null);
      return;
    }
    setLoadingSource(true);
    fetchIncomeSourceById(transaction.income_source_id)
      .then((s) => {
        setSource(s);
        // Seed the editor from the source's current settings -- the same
        // starting point as setting the job up, which the user can still
        // override for this one payday (e.g. hours differ from usual).
        setAmountDraft(String(transaction.gross_amount ?? transaction.amount));
        setHoursDraft(transaction.hours_paid !== null ? String(transaction.hours_paid) : '');
        setTrackingNet(s?.trackingMode === 'net');
        setTaxCode(s?.taxCode ?? null);
        setHasStudentLoan(s?.hasStudentLoan ?? false);
        setKiwiSaverPct(s?.kiwiSaverPct ?? null);
      })
      .finally(() => setLoadingSource(false));
  }, [visible, transaction]);

  if (!transaction) return null;

  const hasTaxBreakdown =
    transaction.income_tax !== null ||
    transaction.acc_levy !== null ||
    transaction.student_loan !== null ||
    transaction.kiwisaver_amount !== null;

  const isHourly = source?.mode === 'hourly';
  const grossAmount = isHourly
    ? (computeGrossPay({ mode: 'hourly', amount: null, hourlyRate: source?.hourlyRate ?? null }, parseFloat(hoursDraft)) ??
      NaN)
    : parseFloat(amountDraft);
  const canSave = !isNaN(grossAmount) && grossAmount > 0;
  const preview =
    canSave && trackingNet && taxCode && source
      ? computeNetPay({
          grossPay: grossAmount,
          frequency: source.frequency,
          taxCode: taxCode as NzTaxCode,
          hasStudentLoan,
          kiwiSaverPct,
        })
      : null;

  const handleSave = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      const finalAmount = preview ? preview.netPay : grossAmount;
      await updateTransaction(transaction.id, {
        amount: finalAmount,
        description: transaction.description ?? '',
        merchant: transaction.merchant,
        categoryId: transaction.category_id,
        occurredAt: transaction.occurred_at,
        isIncome: true,
        incomeBreakdown: {
          grossAmount,
          incomeTax: preview?.incomeTax ?? null,
          accLevy: preview?.accLevy ?? null,
          studentLoan: preview?.studentLoan ?? null,
          kiwiSaverAmount: preview?.kiwiSaver ?? null,
          hoursPaid: isHourly ? parseFloat(hoursDraft) : null,
        },
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-white dark:bg-tabby-900">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-tabby-700">
            <Text className="font-fredoka-semibold text-xl dark:text-white">{transaction.description}</Text>
            <Pressable
              onPress={onClose}
              style={pressFeedback}
              accessibilityRole="button"
              accessibilityLabel="Close"
              className="w-8 h-8 rounded-full bg-gray-100 dark:bg-tabby-700 items-center justify-center"
            >
              <Text className="font-nunito-bold text-gray-600 dark:text-tabby-200">✕</Text>
            </Pressable>
          </View>

          {loadingSource ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator />
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
              {!editing ? (
                <>
                  <View className="bg-tabby-100 dark:bg-tabby-800 rounded-3xl p-5 items-center gap-1">
                    <Text className="font-nunito-medium text-tabby-700 dark:text-tabby-100 text-sm">
                      Logged on {transaction.occurred_at}
                    </Text>
                    <Text className="font-fredoka-semibold text-4xl text-sage-700 dark:text-sage-400">
                      +${transaction.amount.toFixed(2)}
                    </Text>
                    {transaction.gross_amount !== null && hasTaxBreakdown && (
                      <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-xs mt-1">
                        take-home
                      </Text>
                    )}
                  </View>

                  {(transaction.gross_amount !== null || transaction.hours_paid !== null) && (
                    <View className="gap-1">
                      <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300 text-xs tracking-wide px-1">
                        PAY DETAIL
                      </Text>
                      <View className="bg-gray-50 dark:bg-tabby-800 border border-gray-100 dark:border-tabby-700 rounded-2xl p-3.5">
                        {transaction.hours_paid !== null && (
                          <Row label="Hours paid" value={transaction.hours_paid.toFixed(2)} dim />
                        )}
                        {transaction.gross_amount !== null && (
                          <Row label="Gross pay" value={`$${transaction.gross_amount.toFixed(2)}`} />
                        )}
                        {transaction.income_tax !== null && (
                          <Row label="Income tax" value={`-$${transaction.income_tax.toFixed(2)}`} dim />
                        )}
                        {transaction.acc_levy !== null && (
                          <Row label="ACC earner levy" value={`-$${transaction.acc_levy.toFixed(2)}`} dim />
                        )}
                        {transaction.student_loan !== null && (
                          <Row label="Student loan" value={`-$${transaction.student_loan.toFixed(2)}`} dim />
                        )}
                        {transaction.kiwisaver_amount !== null && (
                          <Row label="KiwiSaver" value={`-$${transaction.kiwisaver_amount.toFixed(2)}`} dim />
                        )}
                        {hasTaxBreakdown && (
                          <View className="flex-row items-center justify-between pt-2 mt-1 border-t border-gray-200 dark:border-tabby-700">
                            <Text className="font-nunito-semibold text-sm dark:text-white">Take-home</Text>
                            <Text className="font-nunito-bold text-sm dark:text-white">
                              ${transaction.amount.toFixed(2)}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-xs px-1">
                        Estimate from when this payday was confirmed -- not re-checked against your actual
                        payslip.
                      </Text>
                    </View>
                  )}

                  <Pressable
                    onPress={() => setEditing(true)}
                    style={pressFeedback}
                    className="items-center py-3 rounded-xl border border-gray-300 dark:border-tabby-600"
                    accessibilityRole="button"
                    accessibilityLabel="Edit this transaction"
                  >
                    <Text className="font-nunito-semibold dark:text-white">Edit this transaction</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => onEditOtherFields(transaction)}
                    style={pressFeedback}
                    className="items-center py-2"
                    accessibilityRole="button"
                    accessibilityLabel="Edit description, merchant, or date"
                  >
                    <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
                      Edit description, merchant, or date instead
                    </Text>
                  </Pressable>
                </>
              ) : (
                <>
                  {isHourly ? (
                    <View className="gap-1.5">
                      <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">
                        Hours paid for
                      </Text>
                      <TextInput
                        value={hoursDraft}
                        onChangeText={setHoursDraft}
                        keyboardType="decimal-pad"
                        className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2.5 bg-white dark:bg-tabby-900 dark:text-white"
                      />
                    </View>
                  ) : (
                    <View className="gap-1.5">
                      <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">
                        {trackingNet ? 'Gross amount' : 'Amount'}
                      </Text>
                      <TextInput
                        value={amountDraft}
                        onChangeText={setAmountDraft}
                        keyboardType="decimal-pad"
                        className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2.5 bg-white dark:bg-tabby-900 dark:text-white"
                      />
                    </View>
                  )}

                  {source && (
                    <View className="flex-row items-center justify-between rounded-lg border border-gray-300 dark:border-tabby-600 px-3 py-2.5">
                      <Text className="font-nunito-medium dark:text-white">Track as net (take-home)</Text>
                      <Switch value={trackingNet} onValueChange={setTrackingNet} />
                    </View>
                  )}

                  {trackingNet && (
                    <View className="gap-3 border border-gray-200 dark:border-tabby-700 rounded-xl p-3">
                      <View className="gap-1.5">
                        <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">Tax code</Text>
                        <View className="flex-row flex-wrap gap-2">
                          {TAX_CODE_OPTIONS.map((code) => (
                            <Pressable
                              key={code}
                              onPress={() => setTaxCode(code === taxCode ? null : code)}
                              style={pressFeedback}
                              className={`px-3 py-1.5 rounded-full border ${
                                taxCode === code
                                  ? 'bg-tabby-600 dark:bg-white border-tabby-600 dark:border-white'
                                  : 'border-gray-300 dark:border-tabby-600'
                              }`}
                            >
                              <Text
                                className={`font-nunito-medium text-sm ${
                                  taxCode === code
                                    ? 'text-white dark:text-tabby-900'
                                    : 'text-gray-700 dark:text-tabby-200'
                                }`}
                              >
                                {code}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>

                      <View className="flex-row items-center justify-between">
                        <Text className="font-nunito-medium text-sm dark:text-white">Student loan</Text>
                        <Switch value={hasStudentLoan} onValueChange={setHasStudentLoan} />
                      </View>

                      <View className="gap-1.5">
                        <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">
                          KiwiSaver (leave unselected if not enrolled)
                        </Text>
                        <View className="flex-row flex-wrap gap-2">
                          {KIWISAVER_OPTIONS.map((pct) => (
                            <Pressable
                              key={pct}
                              onPress={() => setKiwiSaverPct(pct === kiwiSaverPct ? null : pct)}
                              style={pressFeedback}
                              className={`px-3 py-1.5 rounded-full border ${
                                kiwiSaverPct === pct
                                  ? 'bg-tabby-600 dark:bg-white border-tabby-600 dark:border-white'
                                  : 'border-gray-300 dark:border-tabby-600'
                              }`}
                            >
                              <Text
                                className={`font-nunito-medium text-sm ${
                                  kiwiSaverPct === pct
                                    ? 'text-white dark:text-tabby-900'
                                    : 'text-gray-700 dark:text-tabby-200'
                                }`}
                              >
                                {pct}%
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>

                      {preview && (
                        <View className="gap-1 bg-gray-50 dark:bg-tabby-900 rounded-lg p-2.5">
                          <Row label="Gross" value={`$${grossAmount.toFixed(2)}`} dim />
                          <Row label="Income tax" value={`-$${preview.incomeTax.toFixed(2)}`} dim />
                          <Row label="ACC earner levy" value={`-$${preview.accLevy.toFixed(2)}`} dim />
                          {hasStudentLoan && (
                            <Row label="Student loan" value={`-$${preview.studentLoan.toFixed(2)}`} dim />
                          )}
                          {kiwiSaverPct && (
                            <Row label={`KiwiSaver (${kiwiSaverPct}%)`} value={`-$${preview.kiwiSaver.toFixed(2)}`} dim />
                          )}
                          <View className="flex-row items-center justify-between pt-1 mt-1 border-t border-gray-200 dark:border-tabby-700">
                            <Text className="font-nunito-semibold text-xs dark:text-white">Take-home</Text>
                            <Text className="font-nunito-bold text-xs dark:text-white">
                              ${preview.netPay.toFixed(2)}
                            </Text>
                          </View>
                        </View>
                      )}
                    </View>
                  )}

                  {error && <Text className="font-nunito text-red-500 dark:text-red-400 text-sm">{error}</Text>}

                  <View className="flex-row gap-2">
                    <Pressable
                      onPress={handleSave}
                      disabled={busy || !canSave}
                      style={pressFeedback}
                      className={`flex-1 items-center py-3 rounded-xl ${canSave ? 'bg-tabby-600 dark:bg-white' : 'bg-gray-300 dark:bg-tabby-700'}`}
                    >
                      {busy ? (
                        <ActivityIndicator color={isDark ? '#2B1810' : 'white'} />
                      ) : (
                        <Text className="font-nunito-semibold text-white dark:text-tabby-900">
                          Save changes
                        </Text>
                      )}
                    </Pressable>
                    <Pressable
                      onPress={() => setEditing(false)}
                      disabled={busy}
                      style={pressFeedback}
                      className="px-4 items-center justify-center rounded-xl border border-gray-300 dark:border-tabby-600"
                    >
                      <Text className="font-nunito-semibold dark:text-white">Cancel</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </ScrollView>
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
