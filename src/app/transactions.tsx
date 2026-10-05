import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth-context';
import {
  addTransaction,
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
    setEditingId(null);
  };

  const handleStartEdit = (item: Transaction) => {
    setEditingId(item.id);
    setAmount(String(item.amount));
    setDescription(item.description ?? '');
    setCategoryId(item.category_id);
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
        <Text className="text-2xl font-bold">Transactions</Text>

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
            placeholder="Description"
            className="border border-gray-300 rounded-lg px-3 py-2 flex-[2]"
          />
        </View>

        <View className="flex-row flex-wrap gap-2">
          {categories.map((cat) => (
            <Pressable
              key={cat.id}
              onPress={() => setCategoryId(cat.id === categoryId ? null : cat.id)}
              className={`px-3 py-1.5 rounded-full border ${
                categoryId === cat.id ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
              }`}>
              <Text className={categoryId === cat.id ? 'text-white text-sm' : 'text-gray-700 text-sm'}>
                {cat.name}
              </Text>
            </Pressable>
          ))}
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
    </SafeAreaView>
  );
}
