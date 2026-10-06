import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { parseNaturalLanguageExpense } from '@/lib/ai';
import { useAuth } from '@/lib/auth-context';
import {
  addSharedExpense,
  computeBalances,
  computeFlatHealth,
  createFlat,
  fetchFlatMembers,
  fetchMyFlat,
  fetchSharedExpenses,
  joinFlat,
  recordSettlement,
  type Balance,
  type Flat,
  type FlatHealth,
  type FlatMember,
  type SharedExpense,
} from '@/lib/flats';

function NoFlatView({ onFlatReady }: { onFlatReady: () => void }) {
  const { session } = useAuth();
  const userId = session?.user.id;

  const [flatName, setFlatName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!userId || !flatName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await createFlat(userId, flatName.trim());
      onFlatReady();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create flat.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoin = async () => {
    if (!userId || !inviteCode.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await joinFlat(userId, inviteCode.trim());
      onFlatReady();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join flat.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white px-6 pt-10 gap-8">
      <View className="gap-3">
        <Text className="text-xl font-bold">Create a flat</Text>
        <TextInput
          value={flatName}
          onChangeText={setFlatName}
          placeholder="Flat name"
          className="border border-gray-300 rounded-lg px-4 py-3"
        />
        <Pressable
          onPress={handleCreate}
          disabled={submitting}
          className="bg-blue-600 rounded-lg py-3 items-center"
          accessibilityRole="button">
          <Text className="text-white font-semibold">Create Flat</Text>
        </Pressable>
      </View>

      <View className="gap-3">
        <Text className="text-xl font-bold">Join a flat</Text>
        <TextInput
          value={inviteCode}
          onChangeText={setInviteCode}
          placeholder="Invite code"
          autoCapitalize="none"
          className="border border-gray-300 rounded-lg px-4 py-3"
        />
        <Pressable
          onPress={handleJoin}
          disabled={submitting}
          className="bg-gray-800 rounded-lg py-3 items-center"
          accessibilityRole="button">
          <Text className="text-white font-semibold">Join Flat</Text>
        </Pressable>
      </View>

      {submitting && <ActivityIndicator />}
      {error && <Text className="text-red-500 text-sm text-center">{error}</Text>}
    </SafeAreaView>
  );
}

function FlatView({ flat }: { flat: Flat }) {
  const { session } = useAuth();
  const userId = session?.user.id;

  const [members, setMembers] = useState<FlatMember[]>([]);
  const [expenses, setExpenses] = useState<SharedExpense[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [health, setHealth] = useState<FlatHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [quickAddText, setQuickAddText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setError(null);
      const [memberList, expenseList, balanceList, healthResult] = await Promise.all([
        fetchFlatMembers(flat.id),
        fetchSharedExpenses(flat.id),
        computeBalances(flat.id, userId),
        computeFlatHealth(flat.id),
      ]);
      setMembers(memberList);
      setExpenses(expenseList);
      setBalances(balanceList);
      setHealth(healthResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load flat data.');
    }
  }, [flat.id, userId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const handleQuickAdd = async () => {
    if (!quickAddText.trim()) return;
    setAiBusy(true);
    setError(null);
    try {
      const parsed = await parseNaturalLanguageExpense(quickAddText, []);
      if (!parsed) {
        setError('AI is briefly unavailable -- try again in a moment, or fill in the fields below.');
        return;
      }
      setAmount(String(parsed.amount));
      setDescription(parsed.description);
      setQuickAddText('');
    } finally {
      setAiBusy(false);
    }
  };

  const handleAddExpense = async () => {
    if (!userId) return;
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Enter a valid amount.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await addSharedExpense({
        flatId: flat.id,
        paidBy: userId,
        amount: parsedAmount,
        description,
        memberIds: members.map((m) => m.user_id),
      });
      setAmount('');
      setDescription('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add shared expense.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSettle = async (balance: Balance) => {
    if (!userId) return;
    try {
      if (balance.netAmount > 0) {
        // they owe you -> they are "settling" by paying you
        await recordSettlement({
          flatId: flat.id,
          fromUser: balance.userId,
          toUser: userId,
          amount: balance.netAmount,
        });
      } else if (balance.netAmount < 0) {
        // you owe them -> you are settling by paying them
        await recordSettlement({
          flatId: flat.id,
          fromUser: userId,
          toUser: balance.userId,
          amount: Math.abs(balance.netAmount),
        });
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record settlement.');
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
      <FlatList
        data={[]}
        keyExtractor={() => 'none'}
        renderItem={null}
        ListHeaderComponent={
          <View className="px-4 pt-4 gap-5">
            <View>
              <Text className="text-2xl font-bold">{flat.name}</Text>
              <Text className="text-gray-500 text-sm">
                Invite code: <Text className="font-mono font-semibold">{flat.invite_code}</Text> ·{' '}
                {members.length} member{members.length === 1 ? '' : 's'}
              </Text>
            </View>

            {health && (
              <View
                className={`rounded-xl p-4 flex-row items-center justify-between ${
                  health.score >= 90
                    ? 'bg-green-50'
                    : health.score >= 70
                      ? 'bg-blue-50'
                      : health.score >= 50
                        ? 'bg-yellow-50'
                        : 'bg-red-50'
                }`}>
                <View>
                  <Text className="text-gray-500 text-sm">Flat Health</Text>
                  <Text className="text-2xl font-bold">
                    {health.score} · {health.label}
                  </Text>
                  <Text className="text-gray-400 text-xs mt-1">
                    ${health.totalOutstanding.toFixed(2)} unsettled of $
                    {health.totalSpend.toFixed(2)} total shared spend
                  </Text>
                </View>
              </View>
            )}

            <View className="gap-2">
              <Text className="text-lg font-bold">Add shared expense</Text>

              <View className="flex-row gap-2">
                <TextInput
                  value={quickAddText}
                  onChangeText={setQuickAddText}
                  placeholder='Try "rent 500"'
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
                  placeholder="Description"
                  className="border border-gray-300 rounded-lg px-3 py-2 flex-[2]"
                />
              </View>
              <Text className="text-gray-400 text-xs">
                Splits equally across all {members.length} member
                {members.length === 1 ? '' : 's'}.
              </Text>
              <Pressable
                onPress={handleAddExpense}
                disabled={submitting}
                className="bg-blue-600 rounded-lg py-2.5 items-center"
                accessibilityRole="button">
                {submitting ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-semibold">Add Expense</Text>
                )}
              </Pressable>
              {error && <Text className="text-red-500 text-sm">{error}</Text>}
            </View>

            <View className="gap-2">
              <Text className="text-lg font-bold">Balances</Text>
              {balances.length === 0 && (
                <Text className="text-gray-400">Invite flatmates to start splitting bills.</Text>
              )}
              {balances.map((b) => (
                <View
                  key={b.userId}
                  className="flex-row items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
                  <View>
                    <Text className="font-semibold">{b.displayName}</Text>
                    <Text className={`text-sm ${b.netAmount === 0 ? 'text-gray-400' : b.netAmount > 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {b.netAmount === 0
                        ? 'Settled up'
                        : b.netAmount > 0
                          ? `Owes you $${b.netAmount.toFixed(2)}`
                          : `You owe $${Math.abs(b.netAmount).toFixed(2)}`}
                    </Text>
                  </View>
                  {b.netAmount !== 0 && (
                    <Pressable
                      onPress={() => handleSettle(b)}
                      accessibilityRole="button"
                      className="px-3 py-1.5 bg-gray-800 rounded-full">
                      <Text className="text-white text-xs font-semibold">Mark Settled</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>

            <View className="gap-2">
              <Text className="text-lg font-bold">Recent shared expenses</Text>
              {expenses.length === 0 && (
                <Text className="text-gray-400">No shared expenses yet.</Text>
              )}
              {expenses.map((e) => (
                <View key={e.id} className="flex-row items-center justify-between py-2">
                  <View className="flex-1">
                    <Text className="font-semibold">{e.description || 'Shared expense'}</Text>
                    <Text className="text-gray-500 text-sm">
                      Paid by {e.profiles?.display_name ?? 'Unknown'} · {e.occurred_at}
                    </Text>
                  </View>
                  <Text className="font-semibold">${e.amount.toFixed(2)}</Text>
                </View>
              ))}
            </View>
          </View>
        }
      />
    </SafeAreaView>
  );
}

export default function FlatScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;

  const [flat, setFlat] = useState<Flat | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    const myFlat = await fetchMyFlat(userId);
    setFlat(myFlat);
  }, [userId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return flat ? <FlatView flat={flat} /> : <NoFlatView onFlatReady={load} />;
}
