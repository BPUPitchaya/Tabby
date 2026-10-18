// "Tap a transaction, see an overview, edit if you need to" -- same shape
// as income-transaction-detail-modal.tsx, for every ordinary transaction
// (manual entry, CSV import, receipt scan) that doesn't carry a payslip
// breakdown. "Edit" switches this same screen into an inline editor
// instead of opening a separate form -- editing doesn't need to feel like
// leaving the summary you just opened. Only lets you pick among existing
// categories (not create a new one) -- that flow's AI icon suggestion
// step belongs to the main Add/Edit form, not a quick correction here.
import { useEffect, useState } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { CategoryIcon } from '@/components/category-icon';
import { DetailRow } from '@/components/detail-row';
import { updateTransaction, type Category, type Transaction } from '@/lib/transactions';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

const SEGMENT_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.08,
  shadowRadius: 2,
  elevation: 1,
};

export function TransactionDetailModal({
  visible,
  onClose,
  transaction,
  categories,
  onSaved,
  onDelete,
}: {
  visible: boolean;
  onClose: () => void;
  transaction: Transaction | null;
  categories: Category[];
  onSaved: () => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isIncome, setIsIncome] = useState(false);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [merchant, setMerchant] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [occurredAt, setOccurredAt] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    if (!visible || !transaction) return;
    setEditing(false);
    setError(null);
    setIsIncome(transaction.is_income);
    setAmount(String(transaction.amount));
    setDescription(transaction.description ?? '');
    setMerchant(transaction.merchant ?? '');
    setCategoryId(transaction.category_id);
    setOccurredAt(transaction.occurred_at);
  }, [visible, transaction]);

  if (!transaction) return null;

  const parsedAmount = parseFloat(amount);
  const canSave = !isNaN(parsedAmount) && parsedAmount > 0;

  const handleSave = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      await updateTransaction(transaction.id, {
        amount: parsedAmount,
        description,
        merchant,
        categoryId,
        occurredAt,
        isIncome,
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
            <Text className="font-fredoka-semibold text-xl dark:text-white">
              {transaction.description || transaction.categories?.name || 'Transaction'}
            </Text>
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

          <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
            {!editing ? (
              <>
                <View
                  className={`rounded-3xl p-5 items-center gap-2 ${
                    transaction.is_income ? 'bg-tabby-100 dark:bg-tabby-800' : 'bg-gray-50 dark:bg-tabby-800'
                  }`}
                >
                  <View className="w-11 h-11 rounded-full bg-white dark:bg-tabby-900 items-center justify-center">
                    <CategoryIcon name={transaction.categories?.icon} size={20} />
                  </View>
                  <Text
                    className={`font-fredoka-semibold text-4xl ${
                      transaction.is_income
                        ? 'text-sage-700 dark:text-sage-400'
                        : 'text-gray-800 dark:text-white'
                    }`}
                  >
                    {transaction.is_income ? '+' : '-'}${transaction.amount.toFixed(2)}
                  </Text>
                  <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
                    {transaction.occurred_at}
                  </Text>
                </View>

                <View className="bg-gray-50 dark:bg-tabby-800 border border-gray-100 dark:border-tabby-700 rounded-2xl p-3.5">
                  <DetailRow label="Category" value={transaction.categories?.name ?? 'Uncategorized'} />
                  {transaction.merchant && <DetailRow label="Merchant" value={transaction.merchant} dim />}
                  {transaction.description && (
                    <DetailRow label="Description" value={transaction.description} dim />
                  )}
                </View>

                <View className="flex-row gap-2">
                  <Pressable
                    onPress={() => setEditing(true)}
                    style={pressFeedback}
                    className="flex-1 items-center py-3 rounded-xl border border-gray-300 dark:border-tabby-600"
                    accessibilityRole="button"
                    accessibilityLabel="Edit this transaction"
                  >
                    <Text className="font-nunito-semibold dark:text-white">Edit</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => onDelete(transaction.id)}
                    style={pressFeedback}
                    className="px-5 items-center justify-center rounded-xl bg-red-50 dark:bg-red-950"
                    accessibilityRole="button"
                    accessibilityLabel="Delete this transaction"
                  >
                    <Text className="font-nunito-semibold text-red-500">Delete</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <View className="flex-row gap-1.5 p-1 bg-gray-100 dark:bg-tabby-800 rounded-xl">
                  {(['expense', 'income'] as const).map((type) => (
                    <Pressable
                      key={type}
                      onPress={() => {
                        setIsIncome(type === 'income');
                        setCategoryId(null);
                      }}
                      style={(state) => [
                        pressFeedback(state),
                        (type === 'income') === isIncome && SEGMENT_SHADOW,
                      ]}
                      className={`flex-1 rounded-lg py-2 items-center ${
                        (type === 'income') === isIncome ? 'bg-white dark:bg-tabby-900' : ''
                      }`}
                    >
                      <Text
                        className={`font-nunito-semibold text-sm ${
                          (type === 'income') === isIncome
                            ? 'text-gray-900 dark:text-white'
                            : 'text-gray-500 dark:text-tabby-300'
                        }`}
                      >
                        {type === 'income' ? 'Income' : 'Expense'}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <View className="gap-1.5">
                  <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">Amount</Text>
                  <TextInput
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="decimal-pad"
                    className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2.5 bg-white dark:bg-tabby-900 dark:text-white"
                  />
                </View>

                <View className="gap-1.5">
                  <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">Description</Text>
                  <TextInput
                    value={description}
                    onChangeText={setDescription}
                    className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2.5 bg-white dark:bg-tabby-900 dark:text-white"
                  />
                </View>

                <View className="gap-1.5">
                  <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">
                    Merchant (optional)
                  </Text>
                  <TextInput
                    value={merchant}
                    onChangeText={setMerchant}
                    className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2.5 bg-white dark:bg-tabby-900 dark:text-white"
                  />
                </View>

                <View className="gap-1.5">
                  <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">Date</Text>
                  <Pressable
                    onPress={() => setShowDatePicker(true)}
                    style={pressFeedback}
                    className="border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2.5 bg-white dark:bg-tabby-900"
                  >
                    <Text className="font-nunito dark:text-white">{occurredAt}</Text>
                  </Pressable>
                  {showDatePicker && (
                    <DateTimePicker
                      value={new Date(`${occurredAt}T00:00:00`)}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'inline' : 'default'}
                      onChange={(_, selected) => {
                        setShowDatePicker(Platform.OS === 'ios');
                        if (selected) {
                          const y = selected.getFullYear();
                          const m = String(selected.getMonth() + 1).padStart(2, '0');
                          const d = String(selected.getDate()).padStart(2, '0');
                          setOccurredAt(`${y}-${m}-${d}`);
                        }
                      }}
                    />
                  )}
                </View>

                <View className="gap-1.5">
                  <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">Category</Text>
                  <View className="flex-row flex-wrap gap-2">
                    {categories
                      .filter((c) => c.type === (isIncome ? 'income' : 'expense'))
                      .map((cat) => (
                        <Pressable
                          key={cat.id}
                          onPress={() => setCategoryId(cat.id === categoryId ? null : cat.id)}
                          style={pressFeedback}
                          className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border ${
                            categoryId === cat.id
                              ? 'bg-tabby-600 dark:bg-white border-tabby-600 dark:border-white'
                              : 'border-gray-300 dark:border-tabby-600'
                          }`}
                        >
                          <CategoryIcon name={cat.icon} size={13} color={categoryId === cat.id ? '#fff' : undefined} />
                          <Text
                            className={`font-nunito-medium text-sm ${
                              categoryId === cat.id
                                ? 'text-white dark:text-tabby-900'
                                : 'text-gray-700 dark:text-tabby-200'
                            }`}
                          >
                            {cat.name}
                          </Text>
                        </Pressable>
                      ))}
                  </View>
                </View>

                {error && <Text className="font-nunito text-red-500 dark:text-red-400 text-sm">{error}</Text>}

                <View className="flex-row gap-2">
                  <Pressable
                    onPress={handleSave}
                    disabled={busy || !canSave}
                    style={pressFeedback}
                    className={`flex-1 items-center py-3 rounded-xl ${canSave ? 'bg-tabby-600 dark:bg-white' : 'bg-gray-300 dark:bg-tabby-700'}`}
                  >
                    {busy ? (
                      <ActivityIndicator color="white" />
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
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
