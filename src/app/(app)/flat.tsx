import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, Share, Text, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';

import { logFlatTabView } from '@/lib/analytics';
import { ChoresModal } from '@/components/chores-modal';
import { FlatAiPreviewModal } from '@/components/flat-ai-preview-modal';
import { FlatBillsModal } from '@/components/flat-bills-modal';
import { FlatExpenseFormModal } from '@/components/flat-expense-form-modal';
import { FlatExpenseHistoryModal } from '@/components/flat-expense-history-modal';
import { FlatHelpModal } from '@/components/flat-help-modal';
import {
  FlatBalancesSection,
  FlatRecentActivitySection,
  FlatSpendTrendCard,
} from '@/components/flat-overview-sections';
import { FlatPillarTiles } from '@/components/flat-pillar-tiles';
import { FlatPulseCard } from '@/components/flat-pulse-card';
import { FlatSettingsPanel } from '@/components/flat-settings-panel';
import { FlatSwitcherModal } from '@/components/flat-switcher-modal';
import { NoFlatView } from '@/components/no-flat-view';
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
  deleteFlat,
  deleteSharedExpense,
  fetchExpenseSplitUserIds,
  fetchFlatMembers,
  fetchFlatSpendTrend,
  fetchMyFlats,
  fetchSharedExpenses,
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

// Shared press-feedback style: a quick opacity dip on tap, applied via the
// style prop (not className) since it needs the live `pressed` state.
const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

function FlatView({
  flat,
  allFlats,
  onFlatsChanged,
  onSwitchFlat,
}: {
  flat: Flat;
  allFlats: Flat[];
  // Re-fetches the full flats list. Called after leaving, deleting,
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

  useEffect(() => {
    loadFlatTrendPeriodPreference().then(setTrendPreference);
  }, []);

  const handleSelectTrendPreference = async (value: FlatTrendPeriodPreference) => {
    setTrendPreference(value); // optimistic, same as every other toggle in Settings
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
      // actually is right now. Chores are flat-scoped, not user-scoped
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
        // reminders just won't fire, which isn't worth blocking the load over
      }

      // Same reminder-sync idea as chores above, but no "whose turn"
      // check: a flat bill has no single assignee, any member can
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
        // reminders just won't fire, which isn't worth blocking the load over
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
  // list changes, but only when adding fresh. While editing, the
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
    // record a settlement against. The row's own Pressable is already
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
  // over already excludes `userId`; see the Manage Members section
  // below). See updateMemberRole/removeMember in flats.ts for why that
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
                accessibilityHint="shows your other flats to switch to"
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
              <FlatSettingsPanel
                userId={userId}
                members={members}
                isAdmin={isAdmin}
                busy={settingsBusy}
                trendPreference={trendPreference}
                onSelectTrendPreference={handleSelectTrendPreference}
                addEmail={addEmail}
                onChangeAddEmail={setAddEmail}
                onAddByEmail={handleAddByEmail}
                onToggleMemberRole={handleToggleMemberRole}
                onRemoveMember={handleRemoveMember}
                newName={newName}
                onChangeNewName={setNewName}
                onRename={handleRename}
                onLeave={handleLeave}
                onDelete={handleDelete}
              />
            )}

            {health && (
              <FlatPulseCard health={health} members={members} userId={userId} onShareInvite={handleShareInvite} />
            )}

            <FlatPillarTiles
              health={health}
              choreCount={chores.length}
              pendingChoreCount={pendingChoreCount}
              flatBillCount={flatBills.length}
              pendingFlatBillCount={pendingFlatBillCount}
              onOpenAddExpense={handleOpenAddExpense}
              onOpenChores={() => setShowChores(true)}
              onOpenFlatBills={() => setShowFlatBills(true)}
            />

            <FlatBalancesSection balances={balances} onSettle={handleSettle} />

            <FlatRecentActivitySection
              expenses={expenses}
              userId={userId}
              editingExpenseId={editingExpenseId}
              onViewAll={() => setShowExpenseHistory(true)}
              onEditExpense={handleStartEditExpense}
              onDeleteExpense={handleDeleteExpense}
            />

            <FlatSpendTrendCard spendTrend={spendTrend} trendPreference={trendPreference} />
          </View>
        }
      />

      <FlatAiPreviewModal
        preview={aiPreview}
        memberCount={members.length}
        importing={aiImporting}
        onConfirm={handleConfirmAIAdd}
        onCancel={() => setAiPreview(null)}
      />

      <FlatExpenseHistoryModal
        visible={showExpenseHistory}
        onClose={() => setShowExpenseHistory(false)}
        expenses={expenses}
        userId={userId}
        editingExpenseId={editingExpenseId}
        onEditExpense={handleStartEditExpense}
        onDeleteExpense={handleDeleteExpense}
      />

      <FlatExpenseFormModal
        visible={showAddExpense}
        onClose={handleCloseAddExpense}
        isEditing={editingExpenseId !== null}
        quickAdd={{
          text: quickAddText,
          onChangeText: setQuickAddText,
          onSubmit: handleQuickAdd,
          busy: aiBusy,
        }}
        amount={amount}
        onChangeAmount={setAmount}
        description={description}
        onChangeDescription={setDescription}
        members={members}
        userId={userId}
        selectedMemberIds={selectedMemberIds}
        onToggleMember={toggleMember}
        error={error}
        submitting={submitting}
        onSubmit={handleAddExpense}
        onCancelEdit={resetExpenseForm}
      />

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
    // this user's. Otherwise (first run, or they left/lost it since),
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
  // reasoning as FlatView's own useFocusEffect below. Otherwise being
  // added to a flat elsewhere (another device, a direct DB change)
  // wouldn't show up here until a full app reload. Also decides whether
  // the Flat tab is worth gating behind an onboarding question (see
  // flat_tab_views migration), deliberately counting every focus, not
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
