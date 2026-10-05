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
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleAdd = async () => {
    if (!userId) return;
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Enter a valid amount.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await addTransaction({
        userId,
        amount: parsedAmount,
        description,
        categoryId,
        occurredAt: new Date().toISOString().slice(0, 10),
      });
      setAmount('');
      setDescription('');
      setCategoryId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add transaction.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTransaction(id);
      setTransactions((prev) => prev.filter((t) => t.id !== id));
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

        <Pressable
          onPress={handleAdd}
          disabled={submitting}
          className="bg-blue-600 rounded-lg py-2.5 items-center"
          accessibilityRole="button"
          accessibilityLabel="Add transaction">
          {submitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-semibold">Add Transaction</Text>
          )}
        </Pressable>
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
          <View className="flex-row items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
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
              onPress={() => handleDelete(item.id)}
              accessibilityRole="button"
              accessibilityLabel={`Delete transaction ${item.description ?? ''}`}>
              <Text className="text-red-500">Delete</Text>
            </Pressable>
          </View>
        )}
      />
    </SafeAreaView>
  );
}
