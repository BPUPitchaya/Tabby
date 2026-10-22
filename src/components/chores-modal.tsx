// Flat chores -- recurring (weekly/biweekly/monthly), assigned to one
// fixed person or rotating through an ordered list of flat members.
// Same chrome/form shape as bills-modal.tsx (frequency segment + weekday/
// day-of-month picker sheets), reached from flat.tsx. Create/edit/delete
// is admin-only (gated here AND at the DB layer, see 0040_add_chores.sql);
// marking a chore done is open to any flat member.
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

import {
  confirmChore,
  undoChoreConfirmation,
  createChore,
  currentAssigneeId,
  deleteChore,
  fetchChores,
  getChoreCycle,
  isChoreDoneThisCycle,
  updateChore,
  type AssignmentMode,
  type Chore,
} from '@/lib/chores';
import type { FlatMember } from '@/lib/flats';
import type { IncomeFrequency } from '@/lib/profile';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const FREQUENCY_OPTIONS: { value: IncomeFrequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
];

type FormState = {
  id: string | null;
  name: string;
  frequency: IncomeFrequency | null;
  payWeekday: number | null;
  dayOfMonth: number | null;
  assignmentMode: AssignmentMode;
  assigneeOrder: string[];
};

const EMPTY_FORM: FormState = {
  id: null,
  name: '',
  frequency: null,
  payWeekday: null,
  dayOfMonth: null,
  assignmentMode: 'fixed',
  assigneeOrder: [],
};

function memberName(members: FlatMember[], userId: string): string {
  return members.find((m) => m.user_id === userId)?.profiles?.display_name ?? 'Unknown';
}

export function ChoresModal({
  visible,
  onClose,
  flatId,
  members,
  isAdmin,
  currentUserId,
}: {
  visible: boolean;
  onClose: () => void;
  flatId: string;
  members: FlatMember[];
  isAdmin: boolean;
  currentUserId: string;
}) {
  const isDark = useColorScheme() === 'dark';

  const [view, setView] = useState<'list' | 'form'>('list');
  const [chores, setChores] = useState<Chore[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showWeekdayPicker, setShowWeekdayPicker] = useState(false);
  const [showDayOfMonthPicker, setShowDayOfMonthPicker] = useState(false);

  const load = async () => {
    try {
      setChores(await fetchChores(flatId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load chores.');
    }
  };

  useEffect(() => {
    if (!visible) return;
    setView('list');
    setError(null);
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [visible, flatId]);

  const beginAddForm = () => {
    setForm(EMPTY_FORM);
    setMessage(null);
    setView('form');
  };

  const openEditForm = (chore: Chore) => {
    setForm({
      id: chore.id,
      name: chore.name,
      frequency: chore.frequency,
      payWeekday: chore.payWeekday,
      dayOfMonth: chore.dayOfMonth,
      assignmentMode: chore.assignmentMode,
      assigneeOrder: chore.assigneeOrder,
    });
    setMessage(null);
    setView('form');
  };

  const handleSaveForm = async () => {
    if (!form.name.trim()) {
      setMessage('Give this chore a name.');
      return;
    }
    if (!form.frequency) {
      setMessage('Choose how often it repeats.');
      return;
    }
    if ((form.frequency === 'weekly' || form.frequency === 'biweekly') && form.payWeekday === null) {
      setMessage('Choose which day it repeats on.');
      return;
    }
    if (form.frequency === 'monthly' && !form.dayOfMonth) {
      setMessage('Choose which day of the month it repeats on.');
      return;
    }
    if (form.assigneeOrder.length === 0) {
      setMessage(form.assignmentMode === 'fixed' ? 'Pick who this chore belongs to.' : 'Pick who it rotates between.');
      return;
    }
    if (form.assignmentMode === 'rotating' && form.assigneeOrder.length < 2) {
      setMessage('Rotating needs at least two people -- pick one more, or switch to Fixed.');
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const params = {
        name: form.name.trim(),
        frequency: form.frequency,
        payWeekday: form.frequency === 'monthly' ? null : form.payWeekday,
        dayOfMonth: form.frequency === 'monthly' ? form.dayOfMonth : null,
        assignmentMode: form.assignmentMode,
        assigneeOrder: form.assigneeOrder,
      };
      if (form.id) {
        await updateChore(form.id, params);
      } else {
        await createChore(flatId, params);
      }
      await load();
      setView('list');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save chore.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (chore: Chore) => {
    setBusy(true);
    try {
      await deleteChore(chore.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete chore.');
    } finally {
      setBusy(false);
    }
  };

  const handleMarkDone = (chore: Chore) => {
    const cycle = getChoreCycle(chore);
    if (!cycle) return;
    // Confirm first -- a tap in a scrollable list is easy to fire by
    // accident, and unlike most of this app's actions, there's no undo
    // for "mark done" once the rotation advances.
    Alert.alert(`Mark "${chore.name}" done?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Done',
        onPress: async () => {
          setBusy(true);
          try {
            await confirmChore(chore.id, cycle.startDate);
            await load();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to mark that done.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const handleUndo = async (chore: Chore) => {
    setBusy(true);
    try {
      await undoChoreConfirmation(chore);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to undo that.');
    } finally {
      setBusy(false);
    }
  };

  const presentChoreActions = (chore: Chore) => {
    if (!isAdmin) return;
    // Undo only makes sense (and is only offered) while the chore is
    // actually marked done -- otherwise there's nothing to reverse.
    const canUndo = isChoreDoneThisCycle(chore);
    const options = [...(canUndo ? ['Undo done'] : []), 'Edit', 'Delete', 'Cancel'];
    const destructiveIndex = options.indexOf('Delete');
    const cancelIndex = options.indexOf('Cancel');
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, destructiveButtonIndex: destructiveIndex, cancelButtonIndex: cancelIndex },
        (index) => {
          const choice = options[index];
          if (choice === 'Undo done') handleUndo(chore);
          if (choice === 'Edit') openEditForm(chore);
          if (choice === 'Delete') {
            Alert.alert('Delete this chore?', chore.name, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => handleDelete(chore) },
            ]);
          }
        },
      );
    } else {
      Alert.alert(chore.name, undefined, [
        ...(canUndo ? [{ text: 'Undo done', onPress: () => handleUndo(chore) }] : []),
        { text: 'Edit', onPress: () => openEditForm(chore) },
        {
          text: 'Delete',
          style: 'destructive' as const,
          onPress: () =>
            Alert.alert('Delete this chore?', chore.name, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => handleDelete(chore) },
            ]),
        },
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    }
  };

  const toggleAssignee = (userId: string) => {
    setForm((f) => {
      if (f.assignmentMode === 'fixed') {
        return { ...f, assigneeOrder: f.assigneeOrder[0] === userId ? [] : [userId] };
      }
      const already = f.assigneeOrder.includes(userId);
      return {
        ...f,
        assigneeOrder: already ? f.assigneeOrder.filter((id) => id !== userId) : [...f.assigneeOrder, userId],
      };
    });
  };

  const cadenceLabel = (chore: Pick<Chore, 'frequency' | 'payWeekday' | 'dayOfMonth'>) =>
    chore.frequency === 'monthly'
      ? `Monthly · day ${chore.dayOfMonth}`
      : `${chore.frequency === 'weekly' ? 'Weekly' : 'Fortnightly'} · ${WEEKDAYS[chore.payWeekday ?? 0]}`;

  const scheduleLabel =
    form.frequency === 'monthly'
      ? form.dayOfMonth
        ? `Day ${form.dayOfMonth} of the month`
        : 'Pick a day of the month'
      : form.payWeekday !== null
        ? WEEKDAYS[form.payWeekday]
        : 'Pick a day of the week';

  // Done chores sink to the bottom; everything still pending sorts by
  // cycle start date, soonest/most-overdue first -- fetchChores itself
  // just orders by created_at, which puts a chore due today wherever it
  // happened to be added instead of at the top.
  const sortedChores = [...chores].sort((a, b) => {
    const aDone = isChoreDoneThisCycle(a);
    const bDone = isChoreDoneThisCycle(b);
    if (aDone !== bDone) return aDone ? 1 : -1;
    const aStart = getChoreCycle(a)?.startDate ?? '';
    const bStart = getChoreCycle(b)?.startDate ?? '';
    return aStart.localeCompare(bStart);
  });

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-white dark:bg-tabby-900">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-tabby-700">
            {view === 'form' ? (
              <Pressable onPress={() => setView('list')} style={pressFeedback} accessibilityRole="button" accessibilityLabel="Back">
                <Feather name="chevron-left" size={20} color={isDark ? '#E8C39E' : '#374151'} />
              </Pressable>
            ) : (
              <Text className="font-fredoka-semibold text-xl dark:text-white">Chores</Text>
            )}
            {view === 'form' && (
              <Text className="font-fredoka-semibold text-xl dark:text-white">{form.id ? 'Edit Chore' : 'Add Chore'}</Text>
            )}
            {view === 'list' ? (
              <View className="flex-row items-center gap-4">
                {isAdmin && (
                  <Pressable onPress={beginAddForm} style={pressFeedback} accessibilityRole="button" accessibilityLabel="Add chore">
                    <Feather name="plus" size={22} color={isDark ? '#E8C39E' : '#374151'} />
                  </Pressable>
                )}
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
              {chores.length === 0 ? (
                <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
                  No chores yet.{isAdmin ? ' Add one to split up the housework.' : ' Ask the flat admin to add one.'}
                </Text>
              ) : (
                sortedChores.map((chore) => {
                  const assigneeId = currentAssigneeId(chore);
                  const done = isChoreDoneThisCycle(chore);
                  // Only the person it's currently assigned to -- or the
                  // admin, as a fix-a-mistake override -- can mark it
                  // done; same rule the confirm_chore RPC enforces
                  // server-side, mirrored here so the button doesn't
                  // promise something the backend will reject.
                  const canMark = assigneeId === currentUserId || isAdmin;
                  return (
                    <Pressable
                      key={chore.id}
                      onPress={() => presentChoreActions(chore)}
                      disabled={busy || !isAdmin}
                      style={pressFeedback}
                      className="flex-row items-center justify-between rounded-xl px-3 py-2.5 bg-gray-50 dark:bg-tabby-800 border border-gray-100 dark:border-tabby-700"
                    >
                      <View className="flex-1 gap-0.5">
                        <Text className="font-nunito-medium dark:text-white">{chore.name}</Text>
                        <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">
                          {cadenceLabel(chore)} · {assigneeId ? memberName(members, assigneeId) : 'Unassigned'}
                          {chore.assignmentMode === 'rotating' ? ' (rotating)' : ''}
                        </Text>
                      </View>
                      {done ? (
                        <View className="flex-row items-center gap-1">
                          <Feather name="check-circle" size={14} color={isDark ? '#86BD63' : '#4C7535'} />
                          <Text className="font-nunito text-xs text-sage-700 dark:text-sage-400">Done</Text>
                        </View>
                      ) : canMark ? (
                        <Pressable
                          onPress={(e) => {
                            e.stopPropagation();
                            handleMarkDone(chore);
                          }}
                          disabled={busy}
                          style={pressFeedback}
                          accessibilityRole="button"
                          accessibilityLabel={`Mark ${chore.name} done`}
                          className="px-3 py-1.5 rounded-lg bg-tabby-600 dark:bg-white"
                        >
                          <Text className="font-nunito-semibold text-xs text-white dark:text-tabby-900">Mark done</Text>
                        </Pressable>
                      ) : (
                        <Text className="font-nunito text-xs text-gray-400 dark:text-tabby-500">
                          Waiting on {assigneeId ? memberName(members, assigneeId) : 'someone'}
                        </Text>
                      )}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
              <TextInput
                value={form.name}
                onChangeText={(name) => setForm((f) => ({ ...f, name }))}
                placeholder="Chore name (e.g. Trash, Dishes)"
                className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2.5 bg-white dark:bg-tabby-900 dark:text-white"
              />

              <View className="flex-row gap-2">
                {FREQUENCY_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.value}
                    onPress={() => setForm((f) => ({ ...f, frequency: opt.value, payWeekday: null, dayOfMonth: null }))}
                    style={pressFeedback}
                    className={`flex-1 rounded-lg py-2 items-center border ${
                      form.frequency === opt.value
                        ? 'bg-tabby-600 dark:bg-white border-tabby-600 dark:border-white'
                        : 'border-gray-300 dark:border-tabby-600'
                    }`}
                  >
                    <Text
                      className={`font-nunito-medium text-sm ${
                        form.frequency === opt.value ? 'text-white dark:text-tabby-900' : 'text-gray-700 dark:text-tabby-200'
                      }`}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {form.frequency && (
                <Pressable
                  onPress={() => (form.frequency === 'monthly' ? setShowDayOfMonthPicker(true) : setShowWeekdayPicker(true))}
                  style={pressFeedback}
                  className="flex-row items-center justify-between border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2.5"
                >
                  <Text className="font-nunito text-gray-800 dark:text-white text-sm">{scheduleLabel}</Text>
                  <Feather
                    name={form.frequency === 'monthly' ? 'calendar' : 'chevron-right'}
                    size={16}
                    color={isDark ? '#E8C39E' : '#9ca3af'}
                  />
                </Pressable>
              )}

              <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300 text-xs tracking-wide px-1">
                ASSIGNMENT
              </Text>
              <View className="flex-row gap-2">
                {(['fixed', 'rotating'] as const).map((mode) => (
                  <Pressable
                    key={mode}
                    onPress={() => setForm((f) => ({ ...f, assignmentMode: mode, assigneeOrder: [] }))}
                    style={pressFeedback}
                    className={`flex-1 rounded-lg py-2 items-center border ${
                      form.assignmentMode === mode
                        ? 'bg-tabby-600 dark:bg-white border-tabby-600 dark:border-white'
                        : 'border-gray-300 dark:border-tabby-600'
                    }`}
                  >
                    <Text
                      className={`font-nunito-medium text-sm ${
                        form.assignmentMode === mode ? 'text-white dark:text-tabby-900' : 'text-gray-700 dark:text-tabby-200'
                      }`}
                    >
                      {mode === 'fixed' ? 'Fixed' : 'Rotating'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-xs px-1">
                {form.assignmentMode === 'fixed'
                  ? 'Pick who this chore always belongs to.'
                  : 'Pick who it rotates between, in the order you tap them.'}
              </Text>

              <View className="gap-1.5">
                {members.map((m) => {
                  const name = m.profiles?.display_name ?? 'Unknown';
                  const position = form.assigneeOrder.indexOf(m.user_id);
                  const selected = position !== -1;
                  return (
                    <Pressable
                      key={m.user_id}
                      onPress={() => toggleAssignee(m.user_id)}
                      style={pressFeedback}
                      className={`flex-row items-center justify-between px-3 py-2.5 rounded-lg border ${
                        selected ? 'border-tabby-600 dark:border-white bg-tabby-50 dark:bg-tabby-800' : 'border-gray-200 dark:border-tabby-600'
                      }`}
                    >
                      <Text className="font-nunito-medium text-sm dark:text-white">{name}</Text>
                      {selected && (
                        <View className="w-5 h-5 rounded-full bg-tabby-600 dark:bg-white items-center justify-center">
                          {form.assignmentMode === 'rotating' ? (
                            <Text className="font-nunito-bold text-[10px] text-white dark:text-tabby-900">
                              {position + 1}
                            </Text>
                          ) : (
                            <Feather name="check" size={12} color={isDark ? '#2B1810' : '#fff'} />
                          )}
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>

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
                  <Text className="font-nunito-semibold text-white dark:text-tabby-900 text-sm">Save chore</Text>
                )}
              </Pressable>
            </ScrollView>
          )}

          <Modal visible={showWeekdayPicker} animationType="slide" transparent>
            <View className="flex-1 bg-black/40 justify-end">
              <View className="bg-white dark:bg-tabby-900 rounded-t-2xl p-4 gap-1">
                <Text className="font-fredoka-semibold text-lg dark:text-white mb-2">Which day does it repeat?</Text>
                {WEEKDAYS.map((day, i) => (
                  <Pressable
                    key={day}
                    onPress={() => {
                      setForm((f) => ({ ...f, payWeekday: i }));
                      setShowWeekdayPicker(false);
                    }}
                    style={pressFeedback}
                    className="flex-row items-center justify-between py-3 px-2 border-b border-gray-100 dark:border-tabby-700"
                  >
                    <Text className="font-nunito text-gray-800 dark:text-white">{day}</Text>
                    {form.payWeekday === i && <Feather name="check" size={18} color={isDark ? '#E8C39E' : '#8B5A2B'} />}
                  </Pressable>
                ))}
                <Pressable onPress={() => setShowWeekdayPicker(false)} style={pressFeedback} className="py-3 items-center">
                  <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300">Cancel</Text>
                </Pressable>
              </View>
            </View>
          </Modal>

          <Modal visible={showDayOfMonthPicker} animationType="slide" transparent>
            <View className="flex-1 bg-black/40 justify-end">
              <View className="bg-white dark:bg-tabby-900 rounded-t-2xl p-4 gap-3">
                <Text className="font-fredoka-semibold text-lg dark:text-white">Which day of the month?</Text>
                <View className="flex-row flex-wrap gap-2">
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                    <Pressable
                      key={day}
                      onPress={() => {
                        setForm((f) => ({ ...f, dayOfMonth: day }));
                        setShowDayOfMonthPicker(false);
                      }}
                      style={pressFeedback}
                      className={`w-[12.5%] aspect-square items-center justify-center rounded-full ${
                        form.dayOfMonth === day ? 'bg-tabby-600 dark:bg-white' : ''
                      }`}
                    >
                      <Text
                        className={`font-nunito-medium text-sm ${
                          form.dayOfMonth === day ? 'text-white dark:text-tabby-900' : 'text-gray-800 dark:text-white'
                        }`}
                      >
                        {day}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable onPress={() => setShowDayOfMonthPicker(false)} style={pressFeedback} className="py-3 items-center">
                  <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300">Cancel</Text>
                </Pressable>
              </View>
            </View>
          </Modal>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
