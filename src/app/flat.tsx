import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  Share,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { parseNaturalLanguageExpenses, type ParsedExpense } from '@/lib/ai';
import { useAuth } from '@/lib/auth-context';
import {
  addMemberByEmail,
  addSharedExpense,
  computeBalances,
  computeFlatHealth,
  createFlat,
  deleteFlat,
  fetchFlatMembers,
  fetchMyFlat,
  fetchSharedExpenses,
  joinFlat,
  leaveFlat,
  recordSettlement,
  renameFlat,
  type Balance,
  type Flat,
  type FlatHealth,
  type FlatMember,
  type SharedExpense,
} from '@/lib/flats';

// Shared press-feedback style: a quick opacity dip on tap, applied via the
// style prop (not className) since it needs the live `pressed` state.
const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

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
          style={pressFeedback}
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
          style={pressFeedback}
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

function FlatView({ flat, onLeftFlat }: { flat: Flat; onLeftFlat: () => void }) {
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
  const [aiPreview, setAiPreview] = useState<ParsedExpense[] | null>(null);
  const [aiImporting, setAiImporting] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [newName, setNewName] = useState(flat.name);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [addEmail, setAddEmail] = useState('');

  const isAdmin = members.find((m) => m.user_id === userId)?.role === 'admin';

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
      const parsed = await parseNaturalLanguageExpenses(quickAddText, []);
      if (!parsed) {
        setError('AI is briefly unavailable -- try again in a moment, or fill in the fields below.');
        return;
      }
      setAiPreview(parsed);
    } finally {
      setAiBusy(false);
    }
  };

  const handleConfirmAIAdd = async () => {
    if (!userId || !aiPreview) return;
    setAiImporting(true);
    setError(null);
    try {
      for (const item of aiPreview) {
        await addSharedExpense({
          flatId: flat.id,
          paidBy: userId,
          amount: item.amount,
          description: item.description,
          memberIds: members.map((m) => m.user_id),
        });
      }
      setAiPreview(null);
      setQuickAddText('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add shared expenses.');
    } finally {
      setAiImporting(false);
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

  const handleRename = async () => {
    if (!newName.trim() || newName.trim() === flat.name) return;
    setSettingsBusy(true);
    setError(null);
    try {
      await renameFlat(flat.id, newName.trim());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename flat.');
    } finally {
      setSettingsBusy(false);
    }
  };

  const handleAddByEmail = async () => {
    if (!addEmail.trim()) return;
    setSettingsBusy(true);
    setError(null);
    try {
      await addMemberByEmail(flat.id, addEmail.trim());
      setAddEmail('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add that person.');
    } finally {
      setSettingsBusy(false);
    }
  };

  const handleShareInvite = () => {
    Share.share({
      message: `Join my flat "${flat.name}" on Tabby! Use invite code: ${flat.invite_code}`,
    });
  };

  const handleLeave = () => {
    Alert.alert('Leave flat?', `You'll need an invite code to rejoin "${flat.name}" later.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          if (!userId) return;
          setSettingsBusy(true);
          try {
            await leaveFlat(flat.id, userId);
            onLeftFlat();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to leave flat.');
            setSettingsBusy(false);
          }
        },
      },
    ]);
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete flat?',
      `This permanently deletes "${flat.name}" and all its shared expenses and balances for everyone. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setSettingsBusy(true);
            try {
              await deleteFlat(flat.id);
              onLeftFlat();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Failed to delete flat.');
              setSettingsBusy(false);
            }
          },
        },
      ]
    );
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
            <View className="flex-row items-start justify-between">
              <View>
                <Text className="text-2xl font-bold">{flat.name}</Text>
                <Text className="text-gray-500 text-sm">
                  Invite code: <Text className="font-mono font-semibold">{flat.invite_code}</Text>{' '}
                  · {members.length} member{members.length === 1 ? '' : 's'}
                </Text>
              </View>
              <Pressable
                onPress={() => setShowSettings((v) => !v)}
                style={pressFeedback}
                accessibilityRole="button"
                accessibilityLabel="Flat settings">
                <Text className="text-blue-600 font-semibold text-sm">
                  {showSettings ? 'Close' : 'Settings'}
                </Text>
              </Pressable>
            </View>

            <Pressable
              onPress={handleShareInvite}
              style={pressFeedback}
              className="bg-gray-800 rounded-lg py-2.5 items-center"
              accessibilityRole="button"
              accessibilityLabel="Share invite">
              <Text className="text-white font-semibold">Share Invite</Text>
            </Pressable>

            {showSettings && (
              <View className="bg-gray-50 rounded-xl p-4 gap-3">
                <View className="gap-2">
                  <Text className="text-sm font-semibold">Add a member by email</Text>
                  <Text className="text-gray-400 text-xs">
                    They need an existing Tabby account.
                  </Text>
                  <View className="flex-row gap-2">
                    <TextInput
                      value={addEmail}
                      onChangeText={setAddEmail}
                      placeholder="their@email.com"
                      autoCapitalize="none"
                      keyboardType="email-address"
                      className="border border-gray-300 rounded-lg px-3 py-2 flex-1 bg-white"
                    />
                    <Pressable
                      onPress={handleAddByEmail}
                      disabled={settingsBusy}
                      style={pressFeedback}
                      className="bg-blue-600 rounded-lg px-4 items-center justify-center"
                      accessibilityRole="button"
                      accessibilityLabel="Add member by email">
                      <Text className="text-white font-semibold text-sm">Add</Text>
                    </Pressable>
                  </View>
                </View>

                {isAdmin && (
                  <View className="gap-2">
                    <Text className="text-sm font-semibold">Rename flat</Text>
                    <View className="flex-row gap-2">
                      <TextInput
                        value={newName}
                        onChangeText={setNewName}
                        className="border border-gray-300 rounded-lg px-3 py-2 flex-1 bg-white"
                      />
                      <Pressable
                        onPress={handleRename}
                        disabled={settingsBusy}
                        style={pressFeedback}
                        className="bg-blue-600 rounded-lg px-4 items-center justify-center"
                        accessibilityRole="button"
                        accessibilityLabel="Save flat name">
                        <Text className="text-white font-semibold text-sm">Save</Text>
                      </Pressable>
                    </View>
                  </View>
                )}

                <Pressable
                  onPress={handleLeave}
                  disabled={settingsBusy}
                  style={pressFeedback}
                  className="py-2"
                  accessibilityRole="button"
                  accessibilityLabel="Leave flat">
                  <Text className="text-red-500 font-semibold text-sm">Leave Flat</Text>
                </Pressable>

                {isAdmin && (
                  <Pressable
                    onPress={handleDelete}
                    disabled={settingsBusy}
                    style={pressFeedback}
                    className="py-2"
                    accessibilityRole="button"
                    accessibilityLabel="Delete flat">
                    <Text className="text-red-700 font-semibold text-sm">Delete Flat</Text>
                  </Pressable>
                )}

                {settingsBusy && <ActivityIndicator />}
              </View>
            )}

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
                  placeholder='Try "rent 500, power 120"'
                  className="border border-gray-300 rounded-lg px-3 py-2 flex-1"
                />
                <Pressable
                  onPress={handleQuickAdd}
                  disabled={aiBusy}
                  style={pressFeedback}
                  className="bg-gray-800 rounded-lg px-4 items-center justify-center"
                  accessibilityRole="button"
                  accessibilityLabel="Add with AI">
                  {aiBusy ? (
                    <ActivityIndicator color="white" size="small" />
                  ) : (
                    <Text className="text-white font-semibold text-sm">Add with AI</Text>
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
                style={pressFeedback}
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
                <Animated.View key={b.userId} entering={FadeIn.duration(200)}>
                  <View className="flex-row items-center justify-between bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3">
                    <View>
                      <Text className="font-semibold">{b.displayName}</Text>
                      <Text
                        className={`text-sm ${
                          b.netAmount === 0
                            ? 'text-gray-400'
                            : b.netAmount > 0
                              ? 'text-green-600'
                              : 'text-red-500'
                        }`}>
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
                        style={pressFeedback}
                        accessibilityRole="button"
                        className="px-3 py-1.5 bg-gray-800 rounded-full">
                        <Text className="text-white text-xs font-semibold">Mark Settled</Text>
                      </Pressable>
                    )}
                  </View>
                </Animated.View>
              ))}
            </View>

            <View className="gap-2">
              <Text className="text-lg font-bold">Recent shared expenses</Text>
              {expenses.length === 0 && (
                <Text className="text-gray-400">No shared expenses yet.</Text>
              )}
              {expenses.map((e) => (
                <Animated.View key={e.id} entering={FadeIn.duration(200)}>
                  <View className="flex-row items-center justify-between py-2">
                    <View className="flex-1">
                      <Text className="font-semibold">{e.description || 'Shared expense'}</Text>
                      <Text className="text-gray-500 text-sm">
                        Paid by {e.profiles?.display_name ?? 'Unknown'} · {e.occurred_at}
                      </Text>
                    </View>
                    <Text className="font-semibold">${e.amount.toFixed(2)}</Text>
                  </View>
                </Animated.View>
              ))}
            </View>
          </View>
        }
      />

      <Modal visible={aiPreview !== null} animationType="slide" transparent>
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-white rounded-t-2xl p-4 gap-3 max-h-[80%]">
            <Text className="text-xl font-bold">
              Add {aiPreview?.length ?? 0} shared expense{aiPreview?.length === 1 ? '' : 's'}?
            </Text>
            <Text className="text-gray-500 text-sm">
              Total: ${aiPreview?.reduce((sum, t) => sum + t.amount, 0).toFixed(2) ?? '0.00'}. Each
              one splits equally across all {members.length} member
              {members.length === 1 ? '' : 's'}.
            </Text>

            <FlatList
              data={aiPreview ?? []}
              keyExtractor={(_, i) => String(i)}
              style={{ maxHeight: 300 }}
              renderItem={({ item }) => (
                <View className="flex-row justify-between py-2 border-b border-gray-100">
                  <Text className="text-sm flex-1">{item.description}</Text>
                  <Text className="text-sm font-semibold">${item.amount.toFixed(2)}</Text>
                </View>
              )}
            />

            <View className="flex-row gap-2 pt-2">
              <Pressable
                onPress={handleConfirmAIAdd}
                disabled={aiImporting}
                style={pressFeedback}
                className="flex-1 bg-blue-600 rounded-lg py-3 items-center"
                accessibilityRole="button"
                accessibilityLabel="Confirm add">
                {aiImporting ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-semibold">Confirm</Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => setAiPreview(null)}
                disabled={aiImporting}
                style={pressFeedback}
                className="px-4 py-3 items-center justify-center"
                accessibilityRole="button"
                accessibilityLabel="Cancel">
                <Text className="text-gray-500 font-semibold">Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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

  return flat ? (
    <FlatView flat={flat} onLeftFlat={load} />
  ) : (
    <NoFlatView onFlatReady={load} />
  );
}
