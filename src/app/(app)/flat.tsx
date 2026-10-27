import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  Share,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';

import { logFlatTabView } from '@/lib/analytics';
import { ChoresModal } from '@/components/chores-modal';
import { FlatBillsModal } from '@/components/flat-bills-modal';
import { FlatHelpModal } from '@/components/flat-help-modal';
import { FlatSwitcherModal } from '@/components/flat-switcher-modal';
import { parseNaturalLanguageExpenses, type ParsedExpense } from '@/lib/ai';
import { loadActiveFlatId, saveActiveFlatId } from '@/lib/active-flat-preference';
import { useAuth } from '@/lib/auth-context';
import { cancelChoreReminder, requestChoreNotificationPermission, scheduleChoreReminder } from '@/lib/chore-notifications';
import { currentAssigneeId, fetchChores, getChoreCycle, isChoreDoneThisCycle, type Chore } from '@/lib/chores';
import {
  cancelFlatBillReminder,
  requestFlatBillNotificationPermission,
  scheduleFlatBillReminder,
} from '@/lib/flat-bill-notifications';
import { fetchFlatBills, getFlatBillCycle, isFlatBillDoneThisCycle, type FlatBill } from '@/lib/flat-bills';
import {
  loadFlatTrendPeriodPreference,
  setFlatTrendPeriodPreference,
  type FlatTrendPeriodPreference,
} from '@/lib/flat-trend-preference';
import {
  addMemberByEmail,
  addSharedExpense,
  computeBalances,
  computeFlatHealth,
  createFlat,
  deleteFlat,
  deleteSharedExpense,
  fetchExpenseSplitUserIds,
  fetchFlatMembers,
  fetchFlatSpendTrend,
  fetchMyFlats,
  fetchSharedExpenses,
  joinFlat,
  leaveFlat,
  recordSettlement,
  removeMember,
  renameFlat,
  updateMemberRole,
  updateSharedExpense,
  type Balance,
  type Flat,
  type FlatHealth,
  type FlatMember,
  type FlatSpendTrend,
  type SharedExpense,
} from '@/lib/flats';
import { Segmented } from '@/components/segmented-control';
import { TrendChart } from '@/components/trend-chart';

// Shared press-feedback style: a quick opacity dip on tap, applied via the
// style prop (not className) since it needs the live `pressed` state.
const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

// Same 'auto' idea as the personal dashboard's own resolveTrendView, with
// an extra biweekly tier -- a flat's shared costs (rent/power/internet)
// get logged far less often than personal transactions, so jumping
// straight from weekly to monthly left a stretch (roughly 2-6 months in)
// where neither chart was very informative.
function resolveFlatTrendView(
  preference: FlatTrendPeriodPreference,
  earliestOccurredAt: string | null,
  now: Date,
): 'weekly' | 'biweekly' | 'monthly' {
  if (preference !== 'auto') return preference;
  if (!earliestOccurredAt) return 'weekly';
  const daysSinceEarliest = (now.getTime() - new Date(`${earliestOccurredAt}T00:00:00`).getTime()) / 86_400_000;
  if (daysSinceEarliest < 56) return 'weekly';
  if (daysSinceEarliest < 180) return 'biweekly';
  return 'monthly';
}

const FLAT_TREND_OPTIONS: { value: FlatTrendPeriodPreference; label: string }[] = [
  { value: 'auto', label: 'Automatic' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'monthly', label: 'Monthly' },
];

// Matches Profile's own small tracked-caps group label -- same visual
// language across reworked screens instead of each inventing its own.
function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="font-nunito-bold text-[11px] tracking-wide px-1 text-gray-400 dark:text-tabby-400">
      {children}
    </Text>
  );
}

// A small, consistent set of initial-badges so "who" reads at a glance in
// the Balances/Recent-expenses lists and the split-with picker, instead of
// bare names. Color is a stable hash of the person's id/name, not random,
// so the same person always gets the same badge across the screen.
const AVATAR_STYLES = [
  { bg: 'bg-sage-100 dark:bg-sage-900/40', text: 'text-sage-700 dark:text-sage-300' },
  { bg: 'bg-tabby-sky dark:bg-tabby-700', text: 'text-tabby-900 dark:text-tabby-100' },
  { bg: 'bg-tabby-100 dark:bg-tabby-700', text: 'text-tabby-700 dark:text-tabby-200' },
  { bg: 'bg-rust-50 dark:bg-rust-900/40', text: 'text-rust-600 dark:text-rust-300' },
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function Avatar({
  name,
  colorKey,
  unknown = false,
  size = 38,
}: {
  name: string;
  colorKey: string;
  unknown?: boolean;
  size?: number;
}) {
  const style = unknown
    ? { bg: 'bg-gray-200 dark:bg-white/10', text: 'text-gray-400 dark:text-tabby-400' }
    : AVATAR_STYLES[hashString(colorKey) % AVATAR_STYLES.length];
  const initial = unknown ? '?' : (name.trim().charAt(0).toUpperCase() || '?');
  return (
    <View
      className={`rounded-full items-center justify-center ${style.bg}`}
      style={{ width: size, height: size }}
    >
      <Text className={`font-nunito-extrabold ${style.text}`} style={{ fontSize: size * 0.37 }}>
        {initial}
      </Text>
    </View>
  );
}

// How many of the most recent shared expenses show inline before
// "Recent Activity" hands off to the full-history modal -- a flat with
// months of logged rent/bills otherwise dumps its entire history into
// the main scroll every time.
const RECENT_ACTIVITY_LIMIT = 5;

// Shared between the capped inline list and the full-history modal, so
// the two never drift out of visual sync with each other.
function ExpenseRow({
  expense,
  canEdit,
  isEditing,
  onPress,
  onDelete,
}: {
  expense: SharedExpense;
  canEdit: boolean;
  isEditing: boolean;
  onPress: () => void;
  onDelete: () => void;
}) {
  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <Pressable
        onPress={() => canEdit && onPress()}
        disabled={!canEdit}
        style={pressFeedback}
        accessibilityRole="button"
        accessibilityLabel={canEdit ? `Edit shared expense ${expense.description ?? ''}` : undefined}
        className={`flex-row items-center gap-3 rounded-2xl px-4 py-3 ${
          isEditing
            ? 'bg-tabby-50 dark:bg-tabby-800 border border-tabby-300 dark:border-tabby-600'
            : 'bg-gray-50 dark:bg-tabby-800 border border-gray-100 dark:border-tabby-700'
        }`}
      >
        <Avatar
          name={expense.profiles?.display_name ?? 'Deleted User'}
          colorKey={expense.paid_by ?? 'deleted'}
          unknown={!expense.profiles?.display_name}
        />
        <View className="flex-1">
          <Text className="font-nunito-semibold dark:text-white">{expense.description || 'Shared expense'}</Text>
          <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
            Paid by {expense.profiles?.display_name ?? 'Deleted User'} · {expense.occurred_at}
          </Text>
        </View>
        <Text className="font-nunito-bold mr-3 dark:text-white">${expense.amount.toFixed(2)}</Text>
        {canEdit && (
          <Pressable
            onPress={(ev) => {
              ev.stopPropagation();
              onDelete();
            }}
            style={pressFeedback}
            accessibilityRole="button"
            accessibilityLabel={`Delete shared expense ${expense.description ?? ''}`}
          >
            <Text className="font-nunito text-red-500 dark:text-red-400">Delete</Text>
          </Pressable>
        )}
      </Pressable>
    </Animated.View>
  );
}

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
    <SafeAreaView className="flex-1 bg-white dark:bg-tabby-900 px-6 pt-10 gap-8">
      <View className="gap-3">
        <Text className="font-fredoka-semibold text-xl dark:text-white">Create a flat</Text>
        <TextInput
          value={flatName}
          onChangeText={setFlatName}
          placeholder="Flat name"
          className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-4 py-3 dark:text-white"
        />
        <Pressable
          onPress={handleCreate}
          disabled={submitting}
          style={pressFeedback}
          className="bg-tabby-600 dark:bg-white rounded-lg py-3 items-center"
          accessibilityRole="button"
        >
          <Text className="font-nunito-semibold text-white dark:text-tabby-900">Create Flat</Text>
        </Pressable>
      </View>

      <View className="gap-3">
        <Text className="font-fredoka-semibold text-xl dark:text-white">Join a flat</Text>
        <TextInput
          value={inviteCode}
          onChangeText={setInviteCode}
          placeholder="Invite code"
          autoCapitalize="none"
          className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-4 py-3 dark:text-white"
        />
        <Pressable
          onPress={handleJoin}
          disabled={submitting}
          style={pressFeedback}
          className="bg-gray-800 dark:bg-tabby-700 rounded-lg py-3 items-center"
          accessibilityRole="button"
        >
          <Text className="font-nunito-semibold text-white">Join Flat</Text>
        </Pressable>
      </View>

      {submitting && <ActivityIndicator />}
      {error && (
        <Text className="font-nunito text-red-500 dark:text-red-400 text-sm text-center">{error}</Text>
      )}
    </SafeAreaView>
  );
}

function FlatView({
  flat,
  allFlats,
  onFlatsChanged,
  onSwitchFlat,
}: {
  flat: Flat;
  allFlats: Flat[];
  // Re-fetches the full flats list -- called after leaving, deleting,
  // creating, or joining a flat, any of which can change which flat
  // should be active.
  onFlatsChanged: () => void;
  onSwitchFlat: (flatId: string) => void;
}) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const isDark = useColorScheme() === 'dark';

  const [members, setMembers] = useState<FlatMember[]>([]);
  const [expenses, setExpenses] = useState<SharedExpense[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [health, setHealth] = useState<FlatHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [quickAddText, setQuickAddText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiPreview, setAiPreview] = useState<ParsedExpense[] | null>(null);
  const [aiImporting, setAiImporting] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showFlatSwitcher, setShowFlatSwitcher] = useState(false);
  const [showChores, setShowChores] = useState(false);
  const [showFlatBills, setShowFlatBills] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showExpenseHistory, setShowExpenseHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [chores, setChores] = useState<Chore[]>([]);
  const [flatBills, setFlatBills] = useState<FlatBill[]>([]);
  const [spendTrend, setSpendTrend] = useState<FlatSpendTrend | null>(null);
  const [trendPreference, setTrendPreference] = useState<FlatTrendPeriodPreference>('auto');
  const [newName, setNewName] = useState(flat.name);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [addEmail, setAddEmail] = useState('');

  const isAdmin = members.find((m) => m.user_id === userId)?.role === 'admin';
  const pendingChoreCount = chores.filter((c) => !isChoreDoneThisCycle(c)).length;
  const pendingFlatBillCount = flatBills.filter((b) => !isFlatBillDoneThisCycle(b)).length;
  const trendView = resolveFlatTrendView(trendPreference, spendTrend?.earliestOccurredAt ?? null, new Date());

  // Matches on the description or who paid -- the two things worth
  // scanning a long history by, same "search what's visible" scope as
  // every other plain-text filter in the app (no AI, no date parsing).
  const historyResults = historySearch.trim()
    ? expenses.filter((e) => {
        const needle = historySearch.trim().toLowerCase();
        return (
          (e.description ?? '').toLowerCase().includes(needle) ||
          (e.profiles?.display_name ?? '').toLowerCase().includes(needle)
        );
      })
    : expenses;

  useEffect(() => {
    loadFlatTrendPeriodPreference().then(setTrendPreference);
  }, []);

  const handleSelectTrendPreference = async (value: FlatTrendPeriodPreference) => {
    setTrendPreference(value); // optimistic -- same as every other toggle in Settings
    await setFlatTrendPeriodPreference(value);
  };

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setError(null);
      const [memberList, expenseList, balanceList, healthResult, choreList, flatBillList, spendTrendResult] =
        await Promise.all([
          fetchFlatMembers(flat.id),
          fetchSharedExpenses(flat.id),
          computeBalances(flat.id, userId),
          computeFlatHealth(flat.id),
          fetchChores(flat.id),
          fetchFlatBills(flat.id),
          fetchFlatSpendTrend(flat.id),
        ]);
      setMembers(memberList);
      setExpenses(expenseList);
      setBalances(balanceList);
      setChores(choreList);
      setFlatBills(flatBillList);
      setSpendTrend(spendTrendResult);
      setHealth(healthResult);

      // Keep each chore's on-device reminder in sync with whose turn it
      // actually is right now -- chores are flat-scoped, not user-scoped
      // like bills, so this device only ever schedules for chores
      // CURRENTLY assigned to this user, and cancels for every other one
      // (done, not due yet, or no longer this user's turn after a
      // rotation/edit). Best-effort: a denied permission or scheduling
      // hiccup shouldn't block loading the rest of the screen.
      try {
        const granted = await requestChoreNotificationPermission();
        await Promise.all(
          choreList.map((chore) => {
            const isMine = currentAssigneeId(chore) === userId;
            const done = isChoreDoneThisCycle(chore);
            const cycle = getChoreCycle(chore);
            if (granted && isMine && !done && cycle) {
              return scheduleChoreReminder(chore.id, chore.name, cycle.startDate).catch(() => {});
            }
            return cancelChoreReminder(chore.id).catch(() => {});
          }),
        );
      } catch {
        // reminders just won't fire -- not worth blocking the load over
      }

      // Same reminder-sync idea as chores above, but no "whose turn"
      // check -- a flat bill has no single assignee, any member can
      // confirm it, so every member's own device independently reminds
      // itself for a due, unconfirmed cycle.
      try {
        const billsGranted = await requestFlatBillNotificationPermission();
        await Promise.all(
          flatBillList.map((bill) => {
            const done = isFlatBillDoneThisCycle(bill);
            const cycle = getFlatBillCycle(bill);
            if (billsGranted && !done && cycle) {
              return scheduleFlatBillReminder(bill.id, bill.name, cycle.startDate).catch(() => {});
            }
            return cancelFlatBillReminder(bill.id).catch(() => {});
          }),
        );
      } catch {
        // reminders just won't fire -- not worth blocking the load over
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load flat data.');
    }
  }, [flat.id, userId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  // Tabs stay mounted when you switch away (standard tab behavior), so
  // without this, a change made outside this exact screen (another
  // device, the switcher's "create or join" flow, a direct DB edit)
  // would show stale data until a manual pull-to-refresh. Silent --
  // doesn't touch `loading`, only the mount-time effect above does, so
  // this doesn't flash the spinner on every tab switch. Same pattern as
  // Home's own useFocusEffect in index.tsx.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Default the expense-split picker to "everyone" whenever the member
  // list changes, but only when adding fresh -- while editing, the
  // selection reflects that specific expense's actual splits instead.
  useEffect(() => {
    if (!editingExpenseId) {
      setSelectedMemberIds(members.map((m) => m.user_id));
    }
  }, [members, editingExpenseId]);

  const toggleMember = (userIdToToggle: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(userIdToToggle) ? prev.filter((id) => id !== userIdToToggle) : [...prev, userIdToToggle],
    );
  };

  const handleQuickAdd = async () => {
    if (!quickAddText.trim()) return;
    setAiBusy(true);
    setError(null);
    try {
      const parsed = await parseNaturalLanguageExpenses(quickAddText, []);
      if (!parsed) {
        setError('AI is briefly unavailable. Try again in a moment, or fill in the fields below.');
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

  const resetExpenseForm = () => {
    setAmount('');
    setDescription('');
    setEditingExpenseId(null);
    setSelectedMemberIds(members.map((m) => m.user_id));
  };

  const handleOpenAddExpense = () => {
    resetExpenseForm();
    setShowAddExpense(true);
  };

  const handleCloseAddExpense = () => {
    resetExpenseForm();
    setShowAddExpense(false);
  };

  const handleStartEditExpense = async (e: SharedExpense) => {
    if (e.paid_by !== userId) return; // only the payer can edit/delete it
    setEditingExpenseId(e.id);
    setAmount(String(e.amount));
    setDescription(e.description ?? '');
    setError(null);
    setShowAddExpense(true);
    try {
      const splitUserIds = await fetchExpenseSplitUserIds(e.id);
      setSelectedMemberIds(splitUserIds);
    } catch {
      // if this fails for any reason, fall back to "everyone" rather than
      // leaving the picker empty and blocking the edit entirely
      setSelectedMemberIds(members.map((m) => m.user_id));
    }
  };

  const handleAddExpense = async () => {
    if (!userId) return;
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    if (selectedMemberIds.length === 0) {
      setError('Select at least one person to split with.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (editingExpenseId) {
        await updateSharedExpense({
          expenseId: editingExpenseId,
          amount: parsedAmount,
          description,
          memberIds: selectedMemberIds,
        });
      } else {
        await addSharedExpense({
          flatId: flat.id,
          paidBy: userId,
          amount: parsedAmount,
          description,
          memberIds: selectedMemberIds,
        });
      }
      resetExpenseForm();
      setShowAddExpense(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save shared expense.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteExpense = (e: SharedExpense) => {
    Alert.alert(
      'Delete this expense?',
      `"${e.description || 'Shared expense'}" will be removed and balances recalculated.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSharedExpense(e.id);
              if (editingExpenseId === e.id) {
                resetExpenseForm();
                setShowAddExpense(false);
              }
              await load();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Failed to delete shared expense.');
            }
          },
        },
      ],
    );
  };

  const handleSettle = async (balance: Balance) => {
    // The "Deleted User" synthetic bucket has no real account left to
    // record a settlement against -- the row's own Pressable is already
    // hidden for it, this is just a second guard.
    if (!userId || balance.userId === null) return;
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

  // Never targets the acting admin's own row (the member list this maps
  // over already excludes `userId` -- see the Manage Members section
  // below) -- see updateMemberRole/removeMember in flats.ts for why that
  // alone keeps a flat from ever ending up with zero admins here.
  const handleToggleMemberRole = async (member: FlatMember) => {
    setSettingsBusy(true);
    setError(null);
    try {
      await updateMemberRole(flat.id, member.user_id, member.role === 'admin' ? 'member' : 'admin');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update that member.');
    } finally {
      setSettingsBusy(false);
    }
  };

  const handleRemoveMember = (member: FlatMember) => {
    const name = member.profiles?.display_name ?? 'this person';
    Alert.alert('Remove from flat?', `${name} will need a new invite to rejoin "${flat.name}" later.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setSettingsBusy(true);
          setError(null);
          try {
            await removeMember(flat.id, member.user_id);
            await load();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to remove that member.');
          } finally {
            setSettingsBusy(false);
          }
        },
      },
    ]);
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
    // The link only opens anything for someone who already has Tabby
    // installed (it's a bare custom-scheme link, not a Universal Link --
    // no public distribution channel exists yet to redirect to if it
    // isn't). The code stays in the message as plain text too, so it still
    // works for anyone who has to install first and type it in manually.
    Share.share({
      message: `Join my flat "${flat.name}" on Tabby! tabby://join/${flat.invite_code}\n\nOr open Tabby and enter invite code: ${flat.invite_code}`,
    });
  };

  const handleLeave = () => {
    Alert.alert('Leave flat?', `You'll need an invite code to rejoin "${flat.name}" later.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          setSettingsBusy(true);
          try {
            await leaveFlat(flat.id);
            onFlatsChanged();
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
              onFlatsChanged();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Failed to delete flat.');
              setSettingsBusy(false);
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white dark:bg-tabby-900">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-tabby-900">
      <FlatList
        data={[]}
        keyExtractor={() => 'none'}
        renderItem={null}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View className="px-4 pt-4 gap-5">
            <View className="flex-row items-start justify-between">
              <Pressable
                onPress={() => setShowFlatSwitcher(true)}
                style={pressFeedback}
                accessibilityRole="button"
                accessibilityLabel="Switch flat"
              >
                <View className="flex-row items-center gap-1.5">
                  <Text className="font-nunito-bold text-2xl dark:text-white">{flat.name}</Text>
                  <Feather name="chevron-down" size={18} color={isDark ? '#E8C39E' : '#8B5A2B'} />
                </View>
                <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
                  Invite code:{' '}
                  <Text className="font-mono font-semibold dark:text-white">{flat.invite_code}</Text> ·{' '}
                  {members.length} member{members.length === 1 ? '' : 's'}
                </Text>
              </Pressable>
              <View className="flex-row items-center gap-2">
                <Pressable
                  onPress={() => setShowHelp(true)}
                  style={pressFeedback}
                  accessibilityRole="button"
                  accessibilityLabel="About this screen"
                  className="w-[34px] h-[34px] rounded-full bg-tabby-100 dark:bg-tabby-700 items-center justify-center"
                >
                  <Text className="font-nunito-bold text-base text-gray-600 dark:text-tabby-200">?</Text>
                </Pressable>
                <Pressable
                  onPress={() => setShowSettings((v) => !v)}
                  style={pressFeedback}
                  accessibilityRole="button"
                  accessibilityLabel={showSettings ? 'Close flat settings' : 'Flat settings'}
                  className="w-[34px] h-[34px] rounded-full bg-tabby-100 dark:bg-tabby-700 items-center justify-center"
                >
                  <Feather name={showSettings ? 'x' : 'settings'} size={16} color={isDark ? '#E8C39E' : '#6B4420'} />
                </Pressable>
              </View>
            </View>

            {showSettings && (
              <View className="bg-gray-50 dark:bg-tabby-800 rounded-xl p-4 gap-3">
                {/* A per-device display preference, not a flat-wide
                    setting -- everyone can pick their own view, same as
                    the personal dashboard's trend picker in Profile ->
                    Settings. */}
                <View className="gap-2">
                  <Text className="font-nunito-semibold text-sm dark:text-white">Spend trend chart</Text>
                  <Segmented options={FLAT_TREND_OPTIONS} value={trendPreference} onChange={handleSelectTrendPreference} />
                </View>

                <View className="h-px bg-gray-200 dark:bg-tabby-700" />

                <View className="gap-2">
                  <Text className="font-nunito-semibold text-sm dark:text-white">Add a member by email</Text>
                  <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-xs">
                    They need an existing Tabby account.
                  </Text>
                  <View className="flex-row gap-2">
                    <TextInput
                      value={addEmail}
                      onChangeText={setAddEmail}
                      placeholder="their@email.com"
                      autoCapitalize="none"
                      keyboardType="email-address"
                      className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2 flex-1 bg-white dark:bg-tabby-900 dark:text-white"
                    />
                    <Pressable
                      onPress={handleAddByEmail}
                      disabled={settingsBusy}
                      style={pressFeedback}
                      className="bg-tabby-600 dark:bg-white rounded-lg px-4 items-center justify-center"
                      accessibilityRole="button"
                      accessibilityLabel="Add member by email"
                    >
                      <Text className="font-nunito-semibold text-white dark:text-tabby-900 text-sm">Add</Text>
                    </Pressable>
                  </View>
                </View>

                {isAdmin && members.filter((m) => m.user_id !== userId).length > 0 && (
                  <View className="gap-2">
                    <Text className="font-nunito-semibold text-sm dark:text-white">Manage members</Text>
                    <View className="gap-1.5">
                      {members
                        .filter((m) => m.user_id !== userId)
                        .map((m) => (
                          <View
                            key={m.user_id}
                            className="flex-row items-center justify-between bg-white dark:bg-tabby-900 border border-gray-200 dark:border-tabby-700 rounded-lg px-3 py-2"
                          >
                            <Text className="font-nunito-medium text-sm dark:text-white flex-1">
                              {m.profiles?.display_name ?? 'Unknown'}
                            </Text>
                            <Pressable
                              onPress={() => handleToggleMemberRole(m)}
                              disabled={settingsBusy}
                              style={pressFeedback}
                              accessibilityRole="button"
                              accessibilityLabel={m.role === 'admin' ? `Demote ${m.profiles?.display_name ?? ''}` : `Promote ${m.profiles?.display_name ?? ''}`}
                              className="px-2.5 py-1"
                            >
                              <Text className="font-nunito-semibold text-xs text-tabby-700 dark:text-tabby-200">
                                {m.role === 'admin' ? 'Demote' : 'Promote'}
                              </Text>
                            </Pressable>
                            <Pressable
                              onPress={() => handleRemoveMember(m)}
                              disabled={settingsBusy}
                              style={pressFeedback}
                              accessibilityRole="button"
                              accessibilityLabel={`Remove ${m.profiles?.display_name ?? ''}`}
                              className="px-2.5 py-1"
                            >
                              <Text className="font-nunito-semibold text-xs text-rust-600">Remove</Text>
                            </Pressable>
                          </View>
                        ))}
                    </View>
                  </View>
                )}

                {isAdmin && (
                  <View className="gap-2">
                    <Text className="font-nunito-semibold text-sm dark:text-white">Rename flat</Text>
                    <View className="flex-row gap-2">
                      <TextInput
                        value={newName}
                        onChangeText={setNewName}
                        className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2 flex-1 bg-white dark:bg-tabby-900 dark:text-white"
                      />
                      <Pressable
                        onPress={handleRename}
                        disabled={settingsBusy}
                        style={pressFeedback}
                        className="bg-tabby-600 dark:bg-white rounded-lg px-4 items-center justify-center"
                        accessibilityRole="button"
                        accessibilityLabel="Save flat name"
                      >
                        <Text className="font-nunito-semibold text-white dark:text-tabby-900 text-sm">
                          Save
                        </Text>
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
                  accessibilityLabel="Leave flat"
                >
                  <Text className="font-nunito-semibold text-red-500 dark:text-red-400 text-sm">
                    Leave Flat
                  </Text>
                </Pressable>

                {isAdmin && (
                  <Pressable
                    onPress={handleDelete}
                    disabled={settingsBusy}
                    style={pressFeedback}
                    className="py-2"
                    accessibilityRole="button"
                    accessibilityLabel="Delete flat"
                  >
                    <Text className="font-nunito-semibold text-red-700 dark:text-red-400 text-sm">
                      Delete Flat
                    </Text>
                  </Pressable>
                )}

                {settingsBusy && <ActivityIndicator />}
              </View>
            )}

            {/* Flat Pulse: health score and members used to be two
                unrelated pieces (a members-chip row, then a separate
                health card further down) -- one hero now, since they're
                both "how is this flat doing" at a glance. Admin badges
                stay visible to everyone, same as before. */}
            {health && (
              <View
                className={`rounded-3xl p-[18px] gap-3.5 ${
                  health.score >= 90
                    ? 'bg-green-50 dark:bg-green-950'
                    : health.score >= 70
                      ? 'bg-tabby-50 dark:bg-tabby-800'
                      : health.score >= 50
                        ? 'bg-yellow-50 dark:bg-yellow-950'
                        : 'bg-red-50 dark:bg-red-950'
                }`}
              >
                <View className="flex-row items-center gap-3.5">
                  <View
                    className={`w-[68px] h-[68px] rounded-full items-center justify-center ${
                      health.score >= 90
                        ? 'bg-green-600'
                        : health.score >= 70
                          ? 'bg-tabby-600 dark:bg-white'
                          : health.score >= 50
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                    }`}
                  >
                    <Text
                      className={`font-fredoka-semibold text-2xl ${
                        health.score >= 70 && health.score < 90 ? 'text-white dark:text-tabby-900' : 'text-white'
                      }`}
                    >
                      {health.score}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-xs">Flat Health</Text>
                    <Text className="font-fredoka-semibold text-lg dark:text-white">{health.label}</Text>
                    <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-[11px] mt-0.5">
                      ${health.totalOutstanding.toFixed(2)} unsettled of ${health.totalSpend.toFixed(2)} total
                      shared spend
                    </Text>
                  </View>
                </View>

                <View className="h-px bg-black/5 dark:bg-white/10" />

                <View className="flex-row items-center justify-between gap-2">
                  <View className="flex-row flex-wrap flex-1 gap-1.5">
                    {members.map((m) => {
                      const name = m.profiles?.display_name ?? 'Unknown';
                      return (
                        <View
                          key={m.user_id}
                          className="flex-row items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full border border-gray-200 dark:border-tabby-600 bg-white dark:bg-tabby-900"
                        >
                          <Avatar name={name} colorKey={m.user_id} unknown={!m.profiles?.display_name} size={22} />
                          <Text className="font-nunito-medium text-sm text-gray-700 dark:text-tabby-200">
                            {name}
                            {m.user_id === userId ? ' (you)' : ''}
                          </Text>
                          {m.role === 'admin' && (
                            <View className="px-1.5 py-0.5 rounded-full bg-tabby-100 dark:bg-tabby-700">
                              <Text className="font-nunito-bold text-[10px] tracking-wide text-tabby-700 dark:text-tabby-100">
                                ADMIN
                              </Text>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                  <Pressable
                    onPress={handleShareInvite}
                    style={pressFeedback}
                    accessibilityRole="button"
                    accessibilityLabel="Share invite"
                    className="flex-row items-center gap-1.5 py-1"
                  >
                    <Feather name="share" size={13} color={isDark ? '#E8C39E' : '#8B5A2B'} />
                    <Text className="font-nunito-bold text-sm text-tabby-700 dark:text-tabby-100">Invite</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* The two pillars of flat living -- money fairness and chore
                fairness -- as parallel tiles instead of money being a
                giant always-open form and chores a visually unrelated
                card. Tapping either opens its own focused screen. */}
            <View className="flex-row gap-2.5">
              <Pressable
                onPress={handleOpenAddExpense}
                style={pressFeedback}
                accessibilityRole="button"
                accessibilityLabel="Split an expense"
                className="flex-1 gap-2 rounded-2xl bg-gray-50 dark:bg-tabby-800 border border-gray-100 dark:border-tabby-700 p-3.5"
              >
                <View className="flex-row items-center justify-between">
                  <View className="w-9 h-9 rounded-full bg-white dark:bg-tabby-700 items-center justify-center">
                    <Feather name="dollar-sign" size={16} color={isDark ? '#E8C39E' : '#6B4420'} />
                  </View>
                  <Feather name="chevron-right" size={14} color={isDark ? '#6B4420' : '#d1d5db'} />
                </View>
                <Text className="font-nunito-medium text-sm dark:text-white">Split an Expense</Text>
                <Text
                  className={`font-nunito-bold text-xs ${
                    health && health.totalOutstanding > 0
                      ? 'text-rust-600 dark:text-rust-400'
                      : 'text-sage-700 dark:text-sage-400'
                  }`}
                >
                  {health && health.totalOutstanding > 0 ? `$${health.totalOutstanding.toFixed(2)} unsettled` : 'All settled'}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setShowChores(true)}
                style={pressFeedback}
                accessibilityRole="button"
                accessibilityLabel="Chores"
                className="flex-1 gap-2 rounded-2xl bg-gray-50 dark:bg-tabby-800 border border-gray-100 dark:border-tabby-700 p-3.5"
              >
                <View className="flex-row items-center justify-between">
                  <View className="w-9 h-9 rounded-full bg-white dark:bg-tabby-700 items-center justify-center">
                    <Feather name="check-square" size={16} color={isDark ? '#E8C39E' : '#6B4420'} />
                  </View>
                  <Feather name="chevron-right" size={14} color={isDark ? '#6B4420' : '#d1d5db'} />
                </View>
                <Text className="font-nunito-medium text-sm dark:text-white">Chores</Text>
                <Text
                  className={`font-nunito-bold text-xs ${
                    pendingChoreCount > 0 ? 'text-rust-600 dark:text-rust-400' : 'text-sage-700 dark:text-sage-400'
                  }`}
                >
                  {chores.length === 0
                    ? 'Optional'
                    : pendingChoreCount > 0
                      ? `${pendingChoreCount} pending`
                      : 'All done'}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setShowFlatBills(true)}
                style={pressFeedback}
                accessibilityRole="button"
                accessibilityLabel="Flat Bills"
                className="flex-1 gap-2 rounded-2xl bg-gray-50 dark:bg-tabby-800 border border-gray-100 dark:border-tabby-700 p-3.5"
              >
                <View className="flex-row items-center justify-between">
                  <View className="w-9 h-9 rounded-full bg-white dark:bg-tabby-700 items-center justify-center">
                    <Feather name="repeat" size={16} color={isDark ? '#E8C39E' : '#6B4420'} />
                  </View>
                  <Feather name="chevron-right" size={14} color={isDark ? '#6B4420' : '#d1d5db'} />
                </View>
                <Text className="font-nunito-medium text-sm dark:text-white">Flat Bills</Text>
                <Text
                  className={`font-nunito-bold text-xs ${
                    pendingFlatBillCount > 0 ? 'text-rust-600 dark:text-rust-400' : 'text-sage-700 dark:text-sage-400'
                  }`}
                >
                  {flatBills.length === 0
                    ? 'Optional'
                    : pendingFlatBillCount > 0
                      ? `${pendingFlatBillCount} pending`
                      : 'All logged'}
                </Text>
              </Pressable>
            </View>

            <View className="gap-2">
              <SectionLabel>BALANCES</SectionLabel>
              {balances.length === 0 && (
                <Text className="font-nunito text-gray-500 dark:text-tabby-300">
                  Invite flatmates to start splitting bills.
                </Text>
              )}
              {balances.map((b) => (
                <Animated.View key={b.userId} entering={FadeIn.duration(200)}>
                  <View className="flex-row items-center gap-3 bg-gray-50 dark:bg-tabby-800 border border-gray-100 dark:border-tabby-700 rounded-2xl px-4 py-3">
                    <Avatar name={b.displayName} colorKey={b.userId ?? 'deleted'} unknown={b.userId === null} />
                    <View className="flex-1">
                      <Text className="font-nunito-semibold dark:text-white">{b.displayName}</Text>
                      <Text
                        className={`font-nunito text-sm ${
                          b.netAmount === 0
                            ? 'text-gray-500 dark:text-tabby-300'
                            : b.netAmount > 0
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-red-500 dark:text-red-400'
                        }`}
                      >
                        {b.netAmount === 0
                          ? 'Settled up'
                          : b.netAmount > 0
                            ? `Owes you $${b.netAmount.toFixed(2)}`
                            : `You owe $${Math.abs(b.netAmount).toFixed(2)}`}
                      </Text>
                    </View>
                    {b.netAmount !== 0 && b.userId !== null && (
                      <Pressable
                        onPress={() => handleSettle(b)}
                        style={pressFeedback}
                        accessibilityRole="button"
                        className="px-3 py-1.5 bg-gray-800 dark:bg-tabby-700 rounded-full"
                      >
                        <Text className="font-nunito-semibold text-white text-xs">Mark Settled</Text>
                      </Pressable>
                    )}
                  </View>
                </Animated.View>
              ))}
            </View>

            <View className="gap-2">
              <View className="flex-row items-center justify-between">
                <SectionLabel>RECENT ACTIVITY</SectionLabel>
                {expenses.length > RECENT_ACTIVITY_LIMIT && (
                  <Pressable
                    onPress={() => setShowExpenseHistory(true)}
                    style={pressFeedback}
                    accessibilityRole="button"
                    accessibilityLabel="View all shared expenses"
                  >
                    <Text className="font-nunito text-sm text-gray-500 dark:text-tabby-300">
                      View all ({expenses.length})
                    </Text>
                  </Pressable>
                )}
              </View>
              {expenses.length === 0 && (
                <Text className="font-nunito text-gray-500 dark:text-tabby-300">No shared expenses yet.</Text>
              )}
              {expenses.slice(0, RECENT_ACTIVITY_LIMIT).map((e) => (
                <ExpenseRow
                  key={e.id}
                  expense={e}
                  canEdit={e.paid_by === userId}
                  isEditing={editingExpenseId === e.id}
                  onPress={() => handleStartEditExpense(e)}
                  onDelete={() => handleDeleteExpense(e)}
                />
              ))}
            </View>

            {/* Same enclosed-border treatment as the personal dashboard's
                own trend card -- the flat health score above is a
                current-snapshot only, this is the history view. 'auto'
                (see resolveFlatTrendView) steps weekly -> biweekly ->
                monthly as the flat's own history grows, same idea as the
                personal chart's weekly/monthly auto mode plus a biweekly
                tier; overridable per-device in Flat Settings below. */}
            <View className="border border-tabby-100 dark:border-tabby-700 rounded-3xl p-4 gap-3">
              <Text className="font-nunito-bold text-lg dark:text-white">
                {trendView === 'weekly' ? 'Last 6 weeks' : trendView === 'biweekly' ? 'Last 12 weeks' : 'Last 6 months'}
              </Text>
              {spendTrend && (
                <TrendChart
                  data={
                    trendView === 'weekly'
                      ? spendTrend.weekly
                      : trendView === 'biweekly'
                        ? spendTrend.biweekly
                        : spendTrend.monthly.map((m) => ({ key: m.month, label: m.label, total: m.total }))
                  }
                />
              )}
            </View>
          </View>
        }
      />

      <Modal visible={aiPreview !== null} animationType="slide" transparent>
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-white dark:bg-tabby-900 rounded-t-2xl p-4 gap-3 max-h-[80%]">
            <Text className="font-fredoka-semibold text-xl dark:text-white">
              Add {aiPreview?.length ?? 0} shared expense{aiPreview?.length === 1 ? '' : 's'}?
            </Text>
            <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
              Total: ${aiPreview?.reduce((sum, t) => sum + t.amount, 0).toFixed(2) ?? '0.00'}. Each one splits
              equally across all {members.length} member
              {members.length === 1 ? '' : 's'}.
            </Text>

            <FlatList
              data={aiPreview ?? []}
              keyExtractor={(_, i) => String(i)}
              style={{ maxHeight: 300 }}
              renderItem={({ item }) => (
                <View className="flex-row justify-between py-2 border-b border-gray-100 dark:border-tabby-700">
                  <Text className="font-nunito text-sm flex-1 dark:text-tabby-200">{item.description}</Text>
                  <Text className="font-nunito-semibold text-sm dark:text-white">
                    ${item.amount.toFixed(2)}
                  </Text>
                </View>
              )}
            />

            <View className="flex-row gap-2 pt-2">
              <Pressable
                onPress={handleConfirmAIAdd}
                disabled={aiImporting}
                style={pressFeedback}
                className="flex-1 bg-tabby-600 dark:bg-white rounded-lg py-3 items-center"
                accessibilityRole="button"
                accessibilityLabel="Confirm add"
              >
                {aiImporting ? (
                  <ActivityIndicator color={isDark ? '#2B1810' : 'white'} />
                ) : (
                  <Text className="font-nunito-semibold text-white dark:text-tabby-900">Confirm</Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => setAiPreview(null)}
                disabled={aiImporting}
                style={pressFeedback}
                className="px-4 py-3 items-center justify-center"
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300">Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Full shared-expense history -- "Recent Activity" only ever shows
          the RECENT_ACTIVITY_LIMIT most recent inline; this is the
          unbounded list behind "View all". Tapping a row to edit closes
          this modal in the same state update that opens the edit one
          (never both visible={true} at once) -- two stacked RN Modals
          silently fail to present the top one on iOS (see
          transactions.tsx's own DateTimePicker comment for the same
          constraint). */}
      <Modal
        visible={showExpenseHistory}
        animationType="slide"
        onRequestClose={() => {
          setShowExpenseHistory(false);
          setHistorySearch('');
        }}
      >
        <SafeAreaProvider>
          <SafeAreaView className="flex-1 bg-white dark:bg-tabby-900">
            <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-tabby-700">
              <Pressable
                onPress={() => {
                  setShowExpenseHistory(false);
                  setHistorySearch('');
                }}
                style={pressFeedback}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Feather name="chevron-left" size={20} color={isDark ? '#E8C39E' : '#374151'} />
              </Pressable>
              <Text className="font-fredoka-semibold text-lg dark:text-white">All Activity</Text>
              <View style={{ width: 20 }} />
            </View>
            <View className="px-4 pt-3">
              <View className="flex-row items-center gap-2 border border-gray-200 dark:border-tabby-700 rounded-xl px-3 py-2 bg-gray-50 dark:bg-tabby-800">
                <Feather name="search" size={15} color={isDark ? '#8A7560' : '#9ca3af'} />
                <TextInput
                  value={historySearch}
                  onChangeText={setHistorySearch}
                  placeholder="Search by description or who paid"
                  placeholderTextColor={isDark ? '#8A7560' : '#9ca3af'}
                  className="flex-1 font-nunito text-sm dark:text-white"
                />
                {historySearch.length > 0 && (
                  <Pressable onPress={() => setHistorySearch('')} accessibilityRole="button" accessibilityLabel="Clear search">
                    <Feather name="x-circle" size={15} color={isDark ? '#8A7560' : '#9ca3af'} />
                  </Pressable>
                )}
              </View>
            </View>
            <FlatList
              data={historyResults}
              keyExtractor={(e) => e.id}
              contentContainerStyle={{ padding: 16, gap: 10 }}
              ListEmptyComponent={
                <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-center mt-4">
                  No matching expenses.
                </Text>
              }
              renderItem={({ item: e }) => (
                <ExpenseRow
                  expense={e}
                  canEdit={e.paid_by === userId}
                  isEditing={editingExpenseId === e.id}
                  onPress={() => {
                    setShowExpenseHistory(false);
                    setHistorySearch('');
                    handleStartEditExpense(e);
                  }}
                  onDelete={() => handleDeleteExpense(e)}
                />
              )}
            />
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>

      {/* Split an Expense -- the form that used to permanently occupy the
          Overview (quick-add AI, manual fields, split-with picker) now
          lives here, reached via the pillar tile, open on demand instead
          of always rendered. Same handlers/state as before, just moved
          into its own screen. */}
      <Modal visible={showAddExpense} animationType="slide" onRequestClose={handleCloseAddExpense}>
        <SafeAreaProvider>
          <SafeAreaView className="flex-1 bg-white dark:bg-tabby-900">
            <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-tabby-700">
              <Pressable
                onPress={handleCloseAddExpense}
                style={pressFeedback}
                accessibilityRole="button"
                accessibilityLabel="Back to flat overview"
              >
                <Feather name="chevron-left" size={20} color={isDark ? '#E8C39E' : '#374151'} />
              </Pressable>
              <Text className="font-fredoka-semibold text-lg dark:text-white">
                {editingExpenseId ? 'Edit Shared Expense' : 'Split an Expense'}
              </Text>
              <View style={{ width: 20 }} />
            </View>

            <View className="p-4 gap-3">
              <View className="gap-1">
                <Text className="font-nunito-semibold text-xs text-gray-500 dark:text-tabby-300 px-0.5">
                  Quick add
                </Text>
                <View className="flex-row gap-2">
                  <TextInput
                    value={quickAddText}
                    onChangeText={setQuickAddText}
                    placeholder='Try "rent 500, power 120"'
                    placeholderTextColor={isDark ? '#8A7560' : '#B0B8C1'}
                    className="font-nunito border border-gray-200 dark:border-tabby-600 bg-white dark:bg-tabby-900 rounded-xl px-3.5 py-3 flex-1 dark:text-white"
                  />
                  <Pressable
                    onPress={handleQuickAdd}
                    disabled={aiBusy}
                    style={pressFeedback}
                    className="bg-tabby-900 dark:bg-tabby-700 rounded-xl px-4 flex-row items-center justify-center gap-1.5"
                    accessibilityRole="button"
                    accessibilityLabel="Add with AI"
                  >
                    {aiBusy ? (
                      <ActivityIndicator color="white" size="small" />
                    ) : (
                      <>
                        <Feather name="zap" size={13} color="#F3E2CD" />
                        <Text className="font-nunito-bold text-tabby-100 text-sm">AI</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>

              <View className="h-px bg-gray-200 dark:bg-tabby-700" />

              <View className="flex-row gap-2">
                <View className="gap-1" style={{ width: 104 }}>
                  <Text className="font-nunito-semibold text-xs text-gray-500 dark:text-tabby-300 px-0.5">
                    Amount
                  </Text>
                  <TextInput
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="$0.00"
                    placeholderTextColor={isDark ? '#8A7560' : '#B0B8C1'}
                    keyboardType="decimal-pad"
                    className="font-nunito border border-gray-200 dark:border-tabby-600 bg-white dark:bg-tabby-900 rounded-xl px-3.5 py-3 dark:text-white"
                  />
                </View>
                <View className="gap-1 flex-1">
                  <Text className="font-nunito-semibold text-xs text-gray-500 dark:text-tabby-300 px-0.5">
                    Description
                  </Text>
                  <TextInput
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Groceries"
                    placeholderTextColor={isDark ? '#8A7560' : '#B0B8C1'}
                    className="font-nunito border border-gray-200 dark:border-tabby-600 bg-white dark:bg-tabby-900 rounded-xl px-3.5 py-3 dark:text-white"
                  />
                </View>
              </View>

              <View className="gap-1.5">
                <Text className="font-nunito-semibold text-xs text-gray-500 dark:text-tabby-300 px-0.5">
                  Split with
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {members.map((m) => {
                    const selected = selectedMemberIds.includes(m.user_id);
                    const name = m.profiles?.display_name ?? 'Unknown';
                    return (
                      <Pressable
                        key={m.user_id}
                        onPress={() => toggleMember(m.user_id)}
                        style={pressFeedback}
                        className={`flex-row items-center gap-1.5 pl-1 pr-3 py-1 rounded-full border ${
                          selected
                            ? 'bg-tabby-900 dark:bg-white border-tabby-900 dark:border-white'
                            : 'bg-white dark:bg-tabby-900 border-gray-200 dark:border-tabby-600'
                        }`}
                      >
                        <Avatar name={name} colorKey={m.user_id} unknown={!m.profiles?.display_name} size={26} />
                        <Text
                          className={`font-nunito-medium text-sm ${
                            selected ? 'text-white dark:text-tabby-900' : 'text-gray-700 dark:text-tabby-200'
                          }`}
                        >
                          {name}
                          {m.user_id === userId ? ' (you)' : ''}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text className="font-nunito text-gray-400 dark:text-tabby-400 text-[11px] px-0.5">
                  Splits equally across {selectedMemberIds.length} selected member
                  {selectedMemberIds.length === 1 ? '' : 's'}.
                </Text>
              </View>

              {error && <Text className="font-nunito text-red-500 dark:text-red-400 text-sm">{error}</Text>}

              <View className="flex-row gap-2">
                <Pressable
                  onPress={handleAddExpense}
                  disabled={submitting}
                  style={pressFeedback}
                  className="flex-1 bg-tabby-600 dark:bg-white rounded-xl py-3 items-center"
                  accessibilityRole="button"
                >
                  {submitting ? (
                    <ActivityIndicator color={isDark ? '#2B1810' : 'white'} />
                  ) : (
                    <Text className="font-nunito-bold text-white dark:text-tabby-900">
                      {editingExpenseId ? 'Save Changes' : 'Add Expense'}
                    </Text>
                  )}
                </Pressable>
                {editingExpenseId && (
                  <Pressable
                    onPress={resetExpenseForm}
                    style={pressFeedback}
                    className="px-4 py-3 items-center justify-center"
                    accessibilityRole="button"
                    accessibilityLabel="Cancel edit"
                  >
                    <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300">Cancel</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>

      <FlatHelpModal visible={showHelp} onClose={() => setShowHelp(false)} />

      {userId && (
        <FlatSwitcherModal
          visible={showFlatSwitcher}
          onClose={() => setShowFlatSwitcher(false)}
          flats={allFlats}
          activeFlatId={flat.id}
          userId={userId}
          onSwitch={onSwitchFlat}
          onFlatsChanged={(newActiveFlatId) => {
            onSwitchFlat(newActiveFlatId);
            onFlatsChanged();
            setShowFlatSwitcher(false);
          }}
        />
      )}

      <ChoresModal
        visible={showChores}
        onClose={() => {
          setShowChores(false);
          load();
        }}
        flatId={flat.id}
        members={members}
        isAdmin={isAdmin}
        currentUserId={userId ?? ''}
      />

      <FlatBillsModal
        visible={showFlatBills}
        onClose={() => {
          setShowFlatBills(false);
          load();
        }}
        flatId={flat.id}
        isAdmin={isAdmin}
      />
    </SafeAreaView>
  );
}

export default function FlatScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;

  const [flats, setFlats] = useState<Flat[]>([]);
  const [activeFlatId, setActiveFlatId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    const [myFlats, storedActiveId] = await Promise.all([fetchMyFlats(userId), loadActiveFlatId()]);
    setFlats(myFlats);
    // The stored choice only still applies if that flat is still one of
    // this user's -- otherwise (first run, or they left/lost it since)
    // fall back to the oldest one they belong to.
    const stillValid = storedActiveId !== null && myFlats.some((f) => f.id === storedActiveId);
    const nextActiveId = stillValid ? storedActiveId : myFlats[0]?.id ?? null;
    setActiveFlatId(nextActiveId);
    if (nextActiveId && nextActiveId !== storedActiveId) saveActiveFlatId(nextActiveId);
  }, [userId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  // Re-fetches the flats list on every focus, same "tabs stay mounted"
  // reasoning as FlatView's own useFocusEffect below -- otherwise being
  // added to a flat elsewhere (another device, a direct DB change)
  // wouldn't show up here until a full app reload. Also decides whether
  // the Flat tab is worth gating behind an onboarding question (see
  // flat_tab_views migration) -- deliberately counts every focus, not
  // just the first, since "opened it 3 times and left" is a different
  // signal from "opened it once by accident."
  useFocusEffect(
    useCallback(() => {
      load();
      if (!loading && userId) logFlatTabView(userId, flats.length > 0);
    }, [load, loading, userId, flats.length]),
  );

  const handleSwitchFlat = (flatId: string) => {
    setActiveFlatId(flatId);
    saveActiveFlatId(flatId);
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white dark:bg-tabby-900">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  const activeFlat = flats.find((f) => f.id === activeFlatId) ?? null;

  return activeFlat ? (
    <FlatView
      flat={activeFlat}
      allFlats={flats}
      onFlatsChanged={load}
      onSwitchFlat={handleSwitchFlat}
    />
  ) : (
    <NoFlatView onFlatReady={load} />
  );
}
