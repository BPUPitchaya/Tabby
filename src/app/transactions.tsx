import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { categorizeTransaction, parseNaturalLanguageExpense } from '@/lib/ai';
import { useAuth } from '@/lib/auth-context';
import { parseTransactionsFromCSV, type ParsedCSVTransaction } from '@/lib/csv';
import {
  addTransaction,
  bulkAddTransactions,
  deleteTransaction,
  fetchCategories,
  fetchTransactions,
  updateTransaction,
  type Category,
  type Transaction,
} from '@/lib/transactions';

export default function TransactionsScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [quickAddText, setQuickAddText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [categorySource, setCategorySource] = useState<'manual' | 'ai' | null>(null);

  const [csvPreview, setCsvPreview] = useState<ParsedCSVTransaction[] | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setError(null);
      const [tx, cats] = await Promise.all([fetchTransactions(userId), fetchCategories()]);
      setTransactions(tx);
      setCategories(cats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transactions.');
    }
  }, [userId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const resetForm = () => {
    setAmount('');
    setDescription('');
    setCategoryId(null);
    setCategorySource(null);
    setEditingId(null);
  };

  const handleDescriptionBlur = async () => {
    // Only auto-suggest if the user hasn't picked (or we haven't already
    // AI-suggested) a category -- never override a manual choice.
    if (!description.trim() || categorySource === 'manual' || categories.length === 0) return;

    setAiBusy(true);
    try {
      const suggestedId = await categorizeTransaction(description, categories);
      if (suggestedId) {
        setCategoryId(suggestedId);
        setCategorySource('ai');
      }
    } finally {
      setAiBusy(false);
    }
  };

  const handleQuickAdd = async () => {
    if (!quickAddText.trim()) return;
    setAiBusy(true);
    setError(null);
    try {
      const parsed = await parseNaturalLanguageExpense(quickAddText, categories);
      if (!parsed) {
        setError("Couldn't understand that -- try the fields below instead.");
        return;
      }
      setAmount(String(parsed.amount));
      setDescription(parsed.description);
      const matched = categories.find((c) => c.name === parsed.categoryName);
      setCategoryId(matched?.id ?? null);
      setCategorySource(matched ? 'ai' : null);
      setQuickAddText('');
    } finally {
      setAiBusy(false);
    }
  };

  const handlePickCSV = async () => {
    setError(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', '.csv'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0]) return;

    try {
      const file = new File(result.assets[0].uri);
      const text = await file.text();
      const parsed = parseTransactionsFromCSV(text);
      if (parsed.length === 0) {
        setError(
          "Couldn't find any transactions in that file -- make sure it has a header row with a Date and Amount column."
        );
        return;
      }
      setCsvPreview(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read that file.');
    }
  };

  const handleConfirmCSVImport = async () => {
    if (!userId || !csvPreview) return;
    setCsvImporting(true);
    try {
      await bulkAddTransactions(userId, csvPreview);
      setCsvPreview(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import transactions.');
    } finally {
      setCsvImporting(false);
    }
  };

  const handleStartEdit = (item: Transaction) => {
    setEditingId(item.id);
    setAmount(String(item.amount));
    setDescription(item.description ?? '');
    setCategoryId(item.category_id);
    setCategorySource(item.category_id ? 'manual' : null);
    setError(null);
  };

  const handleSubmit = async () => {
    if (!userId) return;
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Enter a valid amount.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (editingId) {
        await updateTransaction(editingId, {
          amount: parsedAmount,
          description,
          categoryId,
          occurredAt: new Date().toISOString().slice(0, 10),
        });
      } else {
        await addTransaction({
          userId,
          amount: parsedAmount,
          description,
          categoryId,
          occurredAt: new Date().toISOString().slice(0, 10),
        });
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save transaction.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTransaction(id);
      setTransactions((prev) => prev.filter((t) => t.id !== id));
      if (editingId === id) resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete transaction.');
    }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="px-4 pt-4 gap-3 border-b border-gray-200 pb-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-2xl font-bold">Transactions</Text>
          <Pressable
            onPress={handlePickCSV}
            accessibilityRole="button"
            accessibilityLabel="Import CSV">
            <Text className="text-blue-600 font-semibold text-sm">Import CSV</Text>
          </Pressable>
        </View>

        <View className="flex-row gap-2">
          <TextInput
            value={quickAddText}
            onChangeText={setQuickAddText}
            placeholder='Try "coffee $8.50 yesterday"'
            className="border border-gray-300 rounded-lg px-3 py-2 flex-1"
          />
          <Pressable
            onPress={handleQuickAdd}
            disabled={aiBusy}
            className="bg-gray-800 rounded-lg px-4 items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Fill form with AI">
            {aiBusy ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Text className="text-white font-semibold text-sm">✨ AI Fill</Text>
            )}
          </Pressable>
        </View>

        <View className="flex-row gap-2">
          <TextInput
            value={amount}
            onChangeText={setAmount}
            placeholder="Amount"
            keyboardType="decimal-pad"
            className="border border-gray-300 rounded-lg px-3 py-2 flex-1"
          />
          <TextInput
            value={description}
            onChangeText={setDescription}
            onBlur={handleDescriptionBlur}
            placeholder="Description"
            className="border border-gray-300 rounded-lg px-3 py-2 flex-[2]"
          />
        </View>

        <View className="flex-row flex-wrap gap-2 items-center">
          {categories.map((cat) => (
            <Pressable
              key={cat.id}
              onPress={() => {
                setCategoryId(cat.id === categoryId ? null : cat.id);
                setCategorySource(cat.id === categoryId ? null : 'manual');
              }}
              className={`px-3 py-1.5 rounded-full border ${
                categoryId === cat.id ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
              }`}>
              <Text className={categoryId === cat.id ? 'text-white text-sm' : 'text-gray-700 text-sm'}>
                {cat.name}
              </Text>
            </Pressable>
          ))}
          {categorySource === 'ai' && (
            <Text className="text-xs text-blue-500">✨ AI suggested</Text>
          )}
        </View>

        {error && <Text className="text-red-500 text-sm">{error}</Text>}

        <View className="flex-row gap-2">
          <Pressable
            onPress={handleSubmit}
            disabled={submitting}
            className="flex-1 bg-blue-600 rounded-lg py-2.5 items-center"
            accessibilityRole="button"
            accessibilityLabel={editingId ? 'Save changes' : 'Add transaction'}>
            {submitting ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-semibold">
                {editingId ? 'Save Changes' : 'Add Transaction'}
              </Text>
            )}
          </Pressable>

          {editingId && (
            <Pressable
              onPress={resetForm}
              className="px-4 py-2.5 items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel="Cancel edit">
              <Text className="text-gray-500 font-semibold">Cancel</Text>
            </Pressable>
          )}
        </View>
      </View>

      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        ListEmptyComponent={
          <Text className="text-center text-gray-400 mt-8">
            No transactions yet. Add your first one above.
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => handleStartEdit(item)}
            accessibilityRole="button"
            accessibilityLabel={`Edit transaction ${item.description ?? ''}`}
            className={`flex-row items-center justify-between rounded-lg px-4 py-3 ${
              editingId === item.id ? 'bg-blue-50 border border-blue-300' : 'bg-gray-50'
            }`}>
            <View className="flex-1">
              <Text className="font-semibold">
                {item.description || item.categories?.name || 'Transaction'}
              </Text>
              <Text className="text-gray-500 text-sm">
                {item.categories?.name ?? 'Uncategorized'} · {item.occurred_at}
              </Text>
            </View>
            <Text className="font-semibold mr-3">${item.amount.toFixed(2)}</Text>
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                handleDelete(item.id);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Delete transaction ${item.description ?? ''}`}>
              <Text className="text-red-500">Delete</Text>
            </Pressable>
          </Pressable>
        )}
      />

      <Modal visible={csvPreview !== null} animationType="slide" transparent>
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-white rounded-t-2xl p-4 gap-3 max-h-[80%]">
            <Text className="text-xl font-bold">
              Import {csvPreview?.length ?? 0} transaction{csvPreview?.length === 1 ? '' : 's'}?
            </Text>
            <Text className="text-gray-500 text-sm">
              Total: $
              {csvPreview?.reduce((sum, t) => sum + t.amount, 0).toFixed(2) ?? '0.00'}. All imported
              as Uncategorized -- edit them afterwards to assign categories.
            </Text>

            <FlatList
              data={csvPreview ?? []}
              keyExtractor={(_, i) => String(i)}
              style={{ maxHeight: 300 }}
              renderItem={({ item }) => (
                <View className="flex-row justify-between py-2 border-b border-gray-100">
                  <View className="flex-1">
                    <Text className="text-sm">{item.description || '(no description)'}</Text>
                    <Text className="text-xs text-gray-400">{item.occurredAt}</Text>
                  </View>
                  <Text className="text-sm font-semibold">${item.amount.toFixed(2)}</Text>
                </View>
              )}
            />

            <View className="flex-row gap-2 pt-2">
              <Pressable
                onPress={handleConfirmCSVImport}
                disabled={csvImporting}
                className="flex-1 bg-blue-600 rounded-lg py-3 items-center"
                accessibilityRole="button"
                accessibilityLabel="Confirm import">
                {csvImporting ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-semibold">Import</Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => setCsvPreview(null)}
                disabled={csvImporting}
                className="px-4 py-3 items-center justify-center"
                accessibilityRole="button"
                accessibilityLabel="Cancel import">
                <Text className="text-gray-500 font-semibold">Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
