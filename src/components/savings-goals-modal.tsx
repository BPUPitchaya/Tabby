// Savings goals -- create a goal, log manual contributions toward it,
// watch progress. Single-user (no admin/member split, unlike chores/bills),
// so the chrome is simpler: list / form / detail, no picker sheets.
import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, Text, TextInput, useColorScheme, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import {
  addContribution,
  createGoal,
  daysUntilTarget,
  deleteContribution,
  deleteGoal,
  fetchContributions,
  fetchGoalsWithProgress,
  updateGoal,
  type GoalContribution,
  type GoalWithProgress,
} from '@/lib/savings-goals';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

function toLocalISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatMoney(amount: number): string {
  return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

type FormState = {
  id: string | null;
  name: string;
  targetAmount: string;
  targetDate: string | null;
};

const EMPTY_FORM: FormState = { id: null, name: '', targetAmount: '', targetDate: null };

export function SavingsGoalsModal({
  visible,
  onClose,
  userId,
}: {
  visible: boolean;
  onClose: () => void;
  userId: string;
}) {
  const isDark = useColorScheme() === 'dark';

  const [view, setView] = useState<'list' | 'form' | 'detail'>('list');
  const [goals, setGoals] = useState<GoalWithProgress[]>([]);
  const [selectedGoal, setSelectedGoal] = useState<GoalWithProgress | null>(null);
  const [contributions, setContributions] = useState<GoalContribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [addAmount, setAddAmount] = useState('');

  const loadGoals = async () => {
    try {
      setGoals(await fetchGoalsWithProgress(userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load savings goals.');
    }
  };

  useEffect(() => {
    if (!visible) return;
    setView('list');
    setError(null);
    setLoading(true);
    loadGoals().finally(() => setLoading(false));
  }, [visible, userId]);

  const openDetail = async (goal: GoalWithProgress) => {
    setSelectedGoal(goal);
    setAddAmount('');
    setMessage(null);
    setView('detail');
    setBusy(true);
    try {
      setContributions(await fetchContributions(goal.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load contribution history.');
    } finally {
      setBusy(false);
    }
  };

  const beginAddForm = () => {
    setForm(EMPTY_FORM);
    setMessage(null);
    setView('form');
  };

  const openEditForm = (goal: GoalWithProgress) => {
    setForm({ id: goal.id, name: goal.name, targetAmount: String(goal.targetAmount), targetDate: goal.targetDate });
    setMessage(null);
    setView('form');
  };

  const handleSaveForm = async () => {
    if (!form.name.trim()) {
      setMessage('Give this goal a name.');
      return;
    }
    const targetAmount = parseFloat(form.targetAmount);
    if (!targetAmount || targetAmount <= 0) {
      setMessage('Enter a target amount.');
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const params = { name: form.name.trim(), targetAmount, targetDate: form.targetDate };
      if (form.id) {
        await updateGoal(form.id, params);
      } else {
        await createGoal(userId, params);
      }
      await loadGoals();
      setView('list');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save goal.');
    } finally {
      setBusy(false);
    }
  };

  const handleAddMoney = async () => {
    if (!selectedGoal) return;
    const amount = parseFloat(addAmount);
    if (!amount || amount <= 0) {
      setMessage('Enter an amount to add.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await addContribution(selectedGoal.id, amount);
      const [freshContributions, freshGoals] = await Promise.all([fetchContributions(selectedGoal.id), fetchGoalsWithProgress(userId)]);
      setContributions(freshContributions);
      setGoals(freshGoals);
      setSelectedGoal(freshGoals.find((g) => g.id === selectedGoal.id) ?? selectedGoal);
      setAddAmount('');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to add money.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteContribution = async (contribution: GoalContribution) => {
    if (!selectedGoal) return;
    setBusy(true);
    try {
      await deleteContribution(contribution.id);
      const [freshContributions, freshGoals] = await Promise.all([fetchContributions(selectedGoal.id), fetchGoalsWithProgress(userId)]);
      setContributions(freshContributions);
      setGoals(freshGoals);
      setSelectedGoal(freshGoals.find((g) => g.id === selectedGoal.id) ?? selectedGoal);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove contribution.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteGoal = (goal: GoalWithProgress) => {
    Alert.alert('Delete this goal?', `"${goal.name}" and its contribution history will be gone for good.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await deleteGoal(goal.id);
            await loadGoals();
            setView('list');
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete goal.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const detailDaysLeft = selectedGoal ? daysUntilTarget(selectedGoal.targetDate) : null;
  const detailProgress = selectedGoal ? Math.min(1, selectedGoal.saved / selectedGoal.targetAmount) : 0;
  const detailReached = selectedGoal ? selectedGoal.saved >= selectedGoal.targetAmount : false;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-white dark:bg-tabby-900">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-tabby-700">
            {view === 'list' ? (
              <Text className="font-fredoka-semibold text-xl dark:text-white">Savings Goals</Text>
            ) : (
              <Pressable
                onPress={() => setView('list')}
                style={pressFeedback}
                accessibilityRole="button"
                accessibilityLabel="Back to Savings Goals"
              >
                <Feather name="chevron-left" size={20} color={isDark ? '#E8C39E' : '#374151'} />
              </Pressable>
            )}
            {view === 'form' && (
              <Text className="font-fredoka-semibold text-xl dark:text-white">{form.id ? 'Edit Goal' : 'Add Goal'}</Text>
            )}
            {view === 'detail' && selectedGoal && (
              <Text className="font-fredoka-semibold text-xl dark:text-white">{selectedGoal.name}</Text>
            )}
            {view === 'list' ? (
              <View className="flex-row items-center gap-4">
                <Pressable onPress={beginAddForm} style={pressFeedback} accessibilityRole="button" accessibilityLabel="Add a goal">
                  <Feather name="plus" size={22} color={isDark ? '#E8C39E' : '#374151'} />
                </Pressable>
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
            ) : view === 'detail' && selectedGoal ? (
              <Pressable
                onPress={() => openEditForm(selectedGoal)}
                style={pressFeedback}
                accessibilityRole="button"
                accessibilityLabel="Edit goal"
              >
                <Feather name="edit-2" size={18} color={isDark ? '#E8C39E' : '#6b7280'} />
              </Pressable>
            ) : (
              <Pressable onPress={onClose} style={pressFeedback} accessibilityRole="button" accessibilityLabel="Close">
                <Feather name="x" size={16} color={isDark ? '#E8C39E' : '#374151'} />
              </Pressable>
            )}
          </View>

          {loading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator />
            </View>
          ) : view === 'list' ? (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
              {error && (
                <View className="px-3 py-2 bg-red-50 dark:bg-red-950 rounded-lg">
                  <Text className="font-nunito text-red-600 dark:text-red-400 text-sm">{error}</Text>
                </View>
              )}
              {goals.length === 0 ? (
                <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
                  No savings goals yet. Add one for something you&apos;re saving up for.
                </Text>
              ) : (
                goals.map((goal) => {
                  const reached = goal.saved >= goal.targetAmount;
                  const progress = Math.min(1, goal.saved / goal.targetAmount);
                  const days = daysUntilTarget(goal.targetDate);
                  return (
                    <Pressable
                      key={goal.id}
                      onPress={() => openDetail(goal)}
                      style={pressFeedback}
                      className={`rounded-xl p-4 gap-2.5 ${reached ? 'bg-sage-50 dark:bg-sage-900/30 border border-sage-200 dark:border-sage-700' : 'bg-gray-50 dark:bg-tabby-800 border border-gray-100 dark:border-tabby-700'}`}
                    >
                      <View className="flex-row items-center justify-between">
                        <Text className="font-fredoka-semibold text-base dark:text-white">{goal.name}</Text>
                        {reached ? (
                          <View className="flex-row items-center gap-1 bg-sage-500 rounded-full px-2.5 py-1">
                            <Feather name="check" size={11} color="#fff" />
                            <Text className="font-nunito-bold text-[11px] text-white">Reached</Text>
                          </View>
                        ) : (
                          days !== null && (
                            <View className="bg-tabby-100 dark:bg-tabby-700 rounded-full px-2.5 py-1">
                              <Text className="font-nunito-bold text-[11px] text-tabby-700 dark:text-tabby-100">
                                {days < 0 ? 'Past target' : days === 0 ? 'Due today' : `${days} day${days === 1 ? '' : 's'} left`}
                              </Text>
                            </View>
                          )
                        )}
                      </View>
                      <View className={`w-full h-2.5 rounded-full overflow-hidden ${reached ? 'bg-white dark:bg-tabby-800' : 'bg-gray-200 dark:bg-tabby-700'}`}>
                        <View className="h-full rounded-full bg-sage-500" style={{ width: `${progress * 100}%` }} />
                      </View>
                      <View className="flex-row items-baseline justify-between">
                        <Text className="font-nunito-extrabold text-sm text-sage-700 dark:text-sage-400">
                          {formatMoney(goal.saved)} saved
                        </Text>
                        <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">
                          {reached ? 'Fully funded' : `${formatMoney(goal.targetAmount - goal.saved)} to go`}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          ) : view === 'form' ? (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
              <TextInput
                value={form.name}
                onChangeText={(name) => setForm((f) => ({ ...f, name }))}
                placeholder="Goal name (e.g. New Laptop)"
                className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2.5 bg-white dark:bg-tabby-900 dark:text-white"
              />
              <TextInput
                value={form.targetAmount}
                onChangeText={(targetAmount) => setForm((f) => ({ ...f, targetAmount }))}
                placeholder="Target amount"
                keyboardType="decimal-pad"
                className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2.5 bg-white dark:bg-tabby-900 dark:text-white"
              />

              <Pressable
                onPress={() => setShowDatePicker(true)}
                style={pressFeedback}
                accessibilityRole="button"
                accessibilityLabel="Target date"
                className="flex-row items-center justify-between border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2.5"
              >
                <Text className="font-nunito text-gray-800 dark:text-white text-sm">
                  {form.targetDate ? formatDate(form.targetDate) : 'No target date'}
                </Text>
                <View className="flex-row items-center gap-3">
                  {form.targetDate && (
                    <Pressable
                      onPress={() => setForm((f) => ({ ...f, targetDate: null }))}
                      style={pressFeedback}
                      accessibilityRole="button"
                      accessibilityLabel="Clear target date"
                    >
                      <Feather name="x-circle" size={16} color={isDark ? '#E8C39E' : '#9ca3af'} />
                    </Pressable>
                  )}
                  <Feather name="calendar" size={16} color={isDark ? '#E8C39E' : '#9ca3af'} />
                </View>
              </Pressable>

              {Platform.OS === 'ios' && showDatePicker && (
                <View className="border border-gray-300 dark:border-tabby-600 rounded-lg p-2 gap-2">
                  <DateTimePicker
                    value={new Date(`${form.targetDate ?? toLocalISODate(new Date())}T00:00:00`)}
                    mode="date"
                    display="inline"
                    minimumDate={new Date()}
                    themeVariant={isDark ? 'dark' : 'light'}
                    onValueChange={(_, date) => date && setForm((f) => ({ ...f, targetDate: toLocalISODate(date) }))}
                  />
                  <Pressable
                    onPress={() => setShowDatePicker(false)}
                    style={pressFeedback}
                    accessibilityRole="button"
                    accessibilityLabel="Done"
                    className="self-end px-3 py-1.5"
                  >
                    <Text className="font-nunito-semibold text-tabby-600 dark:text-white">Done</Text>
                  </Pressable>
                </View>
              )}

              {showDatePicker && Platform.OS === 'android' && (
                <DateTimePicker
                  value={new Date(`${form.targetDate ?? toLocalISODate(new Date())}T00:00:00`)}
                  mode="date"
                  display="default"
                  minimumDate={new Date()}
                  onValueChange={(_, date) => {
                    setShowDatePicker(false);
                    if (date) setForm((f) => ({ ...f, targetDate: toLocalISODate(date) }));
                  }}
                  onDismiss={() => setShowDatePicker(false)}
                />
              )}

              {message && <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-xs">{message}</Text>}

              <Pressable
                onPress={handleSaveForm}
                disabled={busy}
                style={pressFeedback}
                className="rounded-lg py-2.5 items-center bg-tabby-600 dark:bg-white mt-1"
              >
                {busy ? (
                  <ActivityIndicator color={isDark ? '#2B1810' : 'white'} />
                ) : (
                  <Text className="font-nunito-semibold text-white dark:text-tabby-900 text-sm">Save goal</Text>
                )}
              </Pressable>

              {form.id && (
                <Pressable
                  onPress={() => {
                    const goal = goals.find((g) => g.id === form.id);
                    if (goal) handleDeleteGoal(goal);
                  }}
                  style={pressFeedback}
                  className="py-2 items-center"
                >
                  <Text className="font-nunito-semibold text-rust-600 text-sm">Delete goal</Text>
                </Pressable>
              )}
            </ScrollView>
          ) : (
            selectedGoal && (
              <ScrollView contentContainerStyle={{ padding: 16, gap: 18 }}>
                <View className="bg-tabby-50 dark:bg-tabby-800 rounded-3xl p-5 items-center gap-2.5">
                  <View className="flex-row items-baseline gap-1.5">
                    <Text className="font-fredoka-bold text-3xl dark:text-white">{formatMoney(selectedGoal.saved)}</Text>
                    <Text className="font-nunito text-sm text-tabby-600 dark:text-tabby-300">
                      of {formatMoney(selectedGoal.targetAmount)}
                    </Text>
                  </View>
                  <View className="w-full h-3 bg-tabby-200 dark:bg-tabby-700 rounded-full overflow-hidden">
                    <View className="h-full rounded-full bg-sage-500" style={{ width: `${detailProgress * 100}%` }} />
                  </View>
                  <View className="flex-row items-center justify-between w-full">
                    <Text className="font-nunito-bold text-xs text-sage-700 dark:text-sage-400">
                      {detailReached ? 'Reached' : `${Math.round(detailProgress * 100)}% there`}
                    </Text>
                    {selectedGoal.targetDate && (
                      <Text className="font-nunito text-xs text-tabby-600 dark:text-tabby-300">
                        Target: {formatDate(selectedGoal.targetDate)}
                        {detailDaysLeft !== null &&
                          ` · ${detailDaysLeft < 0 ? 'past target' : detailDaysLeft === 0 ? 'due today' : `${detailDaysLeft} day${detailDaysLeft === 1 ? '' : 's'} left`}`}
                      </Text>
                    )}
                  </View>
                </View>

                <View className="gap-1.5">
                  <Text className="font-nunito-bold text-xs text-gray-500 dark:text-tabby-300 px-0.5">Add money</Text>
                  <View className="flex-row gap-2">
                    <TextInput
                      value={addAmount}
                      onChangeText={setAddAmount}
                      placeholder="$0.00"
                      keyboardType="decimal-pad"
                      className="flex-1 font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2.5 bg-white dark:bg-tabby-900 dark:text-white"
                    />
                    <Pressable
                      onPress={handleAddMoney}
                      disabled={busy}
                      style={pressFeedback}
                      className="rounded-lg px-5 items-center justify-center bg-tabby-600 dark:bg-white"
                    >
                      {busy ? (
                        <ActivityIndicator color={isDark ? '#2B1810' : 'white'} />
                      ) : (
                        <Text className="font-nunito-bold text-sm text-white dark:text-tabby-900">Add</Text>
                      )}
                    </Pressable>
                  </View>
                  {message && <Text className="font-nunito text-rust-600 text-xs">{message}</Text>}
                </View>

                <View className="gap-2">
                  <Text className="font-nunito-bold text-[11px] tracking-wide text-gray-400 dark:text-tabby-400 px-1">HISTORY</Text>
                  {contributions.length === 0 ? (
                    <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm px-1">No contributions logged yet.</Text>
                  ) : (
                    contributions.map((c) => (
                      <Pressable
                        key={c.id}
                        onLongPress={() =>
                          Alert.alert('Remove this contribution?', `${formatMoney(c.amount)} on ${formatDate(c.occurredAt)}`, [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Remove', style: 'destructive', onPress: () => handleDeleteContribution(c) },
                          ])
                        }
                        style={pressFeedback}
                        className="flex-row items-center justify-between bg-gray-50 dark:bg-tabby-800 border border-gray-100 dark:border-tabby-700 rounded-xl px-3.5 py-3"
                      >
                        <Text className="font-nunito text-sm text-gray-500 dark:text-tabby-300">{formatDate(c.occurredAt)}</Text>
                        <Text className="font-nunito-bold text-sm text-sage-700 dark:text-sage-400">+{formatMoney(c.amount)}</Text>
                      </Pressable>
                    ))
                  )}
                </View>

                <Pressable onPress={() => handleDeleteGoal(selectedGoal)} style={pressFeedback} className="self-center py-2 px-2">
                  <Text className="font-nunito-bold text-sm text-rust-600">Delete goal</Text>
                </Pressable>
              </ScrollView>
            )
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
