import { supabase } from '@/lib/supabase';
import { mondayOf, MONTH_LABELS, toDateKey } from '@/lib/dashboard';

export type FlatMember = {
  user_id: string;
  role: 'admin' | 'member';
  profiles: { display_name: string } | null;
};

export type Flat = {
  id: string;
  name: string;
  invite_code: string;
  // Nullable since 0036_nullable_profile_refs_for_account_deletion.sql --
  // the creator may have since deleted their account. Not displayed as a
  // name anywhere (admin status is tracked separately via flat_members.role),
  // so no UI fallback needed for this one.
  created_by: string | null;
};

export type SharedExpense = {
  id: string;
  amount: number;
  description: string | null;
  occurred_at: string;
  // Nullable -- the payer may have since deleted their account. The row
  // itself survives (ON DELETE SET NULL) so this expense still counts
  // correctly in flat-wide totals/health; only "who" is gone.
  paid_by: string | null;
  profiles: { display_name: string } | null;
};

export type Balance = {
  // null is a synthetic bucket for one or more deleted flatmates, merged
  // together -- once a profile is gone there's no id left to distinguish
  // *which* deleted person a given split/settlement belonged to (see
  // computeBalancesFromData). Never settle-able: there's no real account
  // left to record a settlement against.
  userId: string | null;
  displayName: string;
  // positive = they owe you, negative = you owe them, 0 = settled
  netAmount: number;
};

// Every flat this user belongs to, oldest membership first -- a user can
// belong to more than one (flat_members only has a unique (flat_id,
// user_id), never a unique user_id), so this is the real source of
// truth; fetchMyFlat below is just its first result, for call sites that
// only ever need "a" flat (knownPeople matching, the has-a-flat check).
export async function fetchMyFlats(userId: string): Promise<Flat[]> {
  const { data, error } = await supabase
    .from('flat_members')
    .select('joined_at, flats(id, name, invite_code, created_by)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: true });

  if (error) throw error;
  return (data ?? [])
    .map((row) => row.flats as unknown as Flat | null)
    .filter((f): f is Flat => f !== null);
}

export async function fetchMyFlat(userId: string): Promise<Flat | null> {
  const flats = await fetchMyFlats(userId);
  return flats[0] ?? null;
}

export async function createFlat(userId: string, name: string): Promise<Flat> {
  const { data: flat, error: flatError } = await supabase
    .from('flats')
    .insert({ name, created_by: userId })
    .select('id, name, invite_code, created_by')
    .single();

  if (flatError) throw flatError;

  const { error: memberError } = await supabase
    .from('flat_members')
    .insert({ flat_id: flat.id, user_id: userId, role: 'admin' });

  if (memberError) throw memberError;
  return flat as Flat;
}

// Looks a flat up by invite code without joining it -- lets a caller
// (the join screen) show which flat a code points to, or check whether
// the current user is already in it, before committing to the insert.
export async function fetchFlatByInviteCode(inviteCode: string): Promise<Flat | null> {
  const { data, error } = await supabase.rpc('find_flat_by_invite_code', { code: inviteCode.trim() });
  if (error) throw error;
  return (data?.[0] as Flat | undefined) ?? null;
}

export async function joinFlat(userId: string, inviteCode: string): Promise<Flat> {
  const flat = await fetchFlatByInviteCode(inviteCode);
  if (!flat) throw new Error('No flat found with that invite code.');

  const { error: memberError } = await supabase
    .from('flat_members')
    .insert({ flat_id: flat.id, user_id: userId, role: 'member' });

  if (memberError) {
    if (memberError.code === '23505') throw new Error("You're already in this flat.");
    throw memberError;
  }
  return flat;
}

export async function renameFlat(flatId: string, name: string) {
  const { error } = await supabase.from('flats').update({ name }).eq('id', flatId);
  if (error) throw error;
}

export async function deleteFlat(flatId: string) {
  const { error } = await supabase.from('flats').delete().eq('id', flatId);
  if (error) throw error;
}

// RPC rather than a plain delete -- if the leaving user is the flat's
// only admin, this atomically promotes the longest-standing other member
// to admin first, so the flat is never left with zero admins (nothing
// could rename/delete it or manage chores otherwise). See
// 0045_safe_leave_flat.sql.
export async function leaveFlat(flatId: string) {
  const { error } = await supabase.rpc('leave_flat', { p_flat_id: flatId });
  if (error) throw error;
}

// Admin-only (see 0047_admin_member_management.sql); the caller (flat.tsx)
// never targets the acting admin's own row, so this can never leave a
// flat with zero admins -- no RPC-level safety needed the way leaveFlat's
// does, since a plain update/delete under that migration's policies is
// already safe by construction.
export async function updateMemberRole(flatId: string, userId: string, role: 'admin' | 'member'): Promise<void> {
  const { error } = await supabase
    .from('flat_members')
    .update({ role })
    .eq('flat_id', flatId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function removeMember(flatId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('flat_members').delete().eq('flat_id', flatId).eq('user_id', userId);
  if (error) throw error;
}

export async function addMemberByEmail(flatId: string, email: string) {
  const { data: foundUserId, error: rpcError } = await supabase.rpc('find_user_id_by_email', {
    target_email: email.trim(),
  });
  if (rpcError) throw rpcError;
  if (!foundUserId) throw new Error('No Tabby account found with that email.');

  const { error } = await supabase
    .from('flat_members')
    .insert({ flat_id: flatId, user_id: foundUserId, role: 'member' });

  if (error) {
    if (error.code === '23505') throw new Error("That person's already in this flat.");
    throw error;
  }
}

export async function fetchFlatMembers(flatId: string): Promise<FlatMember[]> {
  const { data, error } = await supabase
    .from('flat_members')
    .select('user_id, role, profiles(display_name)')
    .eq('flat_id', flatId);

  if (error) throw error;
  return data as unknown as FlatMember[];
}

export async function fetchSharedExpenses(flatId: string): Promise<SharedExpense[]> {
  const { data, error } = await supabase
    .from('shared_expenses')
    .select('id, amount, description, occurred_at, paid_by, profiles(display_name)')
    .eq('flat_id', flatId)
    .order('occurred_at', { ascending: false });

  if (error) throw error;
  return data as unknown as SharedExpense[];
}

export async function fetchExpenseSplitUserIds(expenseId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('shared_expense_splits')
    .select('user_id')
    .eq('shared_expense_id', expenseId);

  if (error) throw error;
  return (data ?? []).map((row) => row.user_id);
}

export async function addSharedExpense(params: {
  flatId: string;
  paidBy: string;
  amount: number;
  description: string;
  memberIds: string[];
}) {
  const { data: expense, error: expenseError } = await supabase
    .from('shared_expenses')
    .insert({
      flat_id: params.flatId,
      paid_by: params.paidBy,
      amount: params.amount,
      description: params.description || null,
    })
    .select('id')
    .single();

  if (expenseError) throw expenseError;

  const share = Math.round((params.amount / params.memberIds.length) * 100) / 100;
  const splits = params.memberIds.map((userId) => ({
    shared_expense_id: expense.id,
    user_id: userId,
    share_amount: share,
  }));

  const { error: splitsError } = await supabase.from('shared_expense_splits').insert(splits);
  if (splitsError) throw splitsError;
}

export async function updateSharedExpense(params: {
  expenseId: string;
  amount: number;
  description: string;
  memberIds: string[];
}) {
  const { error: expenseError } = await supabase
    .from('shared_expenses')
    .update({ amount: params.amount, description: params.description || null })
    .eq('id', params.expenseId);
  if (expenseError) throw expenseError;

  // Recompute splits from scratch rather than trying to patch existing
  // rows -- simpler and correct even if the member list changed since
  // this expense was first logged.
  const { error: deleteError } = await supabase
    .from('shared_expense_splits')
    .delete()
    .eq('shared_expense_id', params.expenseId);
  if (deleteError) throw deleteError;

  const share = Math.round((params.amount / params.memberIds.length) * 100) / 100;
  const splits = params.memberIds.map((userId) => ({
    shared_expense_id: params.expenseId,
    user_id: userId,
    share_amount: share,
  }));
  const { error: insertError } = await supabase.from('shared_expense_splits').insert(splits);
  if (insertError) throw insertError;
}

export async function deleteSharedExpense(expenseId: string) {
  const { error } = await supabase.from('shared_expenses').delete().eq('id', expenseId);
  if (error) throw error;
}

export async function recordSettlement(params: {
  flatId: string;
  fromUser: string;
  toUser: string;
  amount: number;
}) {
  const { error } = await supabase.from('settlements').insert({
    flat_id: params.flatId,
    from_user: params.fromUser,
    to_user: params.toUser,
    amount: params.amount,
  });
  if (error) throw error;
}

export type SplitRow = {
  // Nullable -- the person who owed this share may have since deleted
  // their account.
  user_id: string | null;
  share_amount: number;
  shared_expenses: { paid_by: string | null; flat_id: string } | null;
};

export type SettlementRow = { from_user: string | null; to_user: string | null; amount: number };

/**
 * Pure calculation, no network calls -- extracted so it can be unit
 * tested directly with fixture data instead of only ever being verified
 * by hand against a live database. See flats.test.ts.
 *
 * Computes, for the current user, their net balance with every other flat
 * member: positive = they owe you, negative = you owe them.
 */
export function computeBalancesFromData(
  flatId: string,
  currentUserId: string,
  splits: SplitRow[],
  settlements: SettlementRow[],
  members: FlatMember[]
): Balance[] {
  const net = new Map<string, number>();
  // Everything involving a now-deleted flatmate merges into one bucket --
  // once their profile is gone, a null paid_by/user_id/from_user/to_user
  // could originally have been any of them, so there's no way to keep
  // them separate. See the Balance type's own comment.
  let deletedUserNet = 0;

  for (const split of splits) {
    const expense = split.shared_expenses;
    if (!expense || expense.flat_id !== flatId) continue;

    if (split.user_id === currentUserId && expense.paid_by !== currentUserId) {
      // current user owes the payer their share
      if (expense.paid_by === null) {
        deletedUserNet -= split.share_amount;
      } else {
        net.set(expense.paid_by, (net.get(expense.paid_by) ?? 0) - split.share_amount);
      }
    } else if (split.user_id !== currentUserId && expense.paid_by === currentUserId) {
      // the other member owes the current user their share
      if (split.user_id === null) {
        deletedUserNet += split.share_amount;
      } else {
        net.set(split.user_id, (net.get(split.user_id) ?? 0) + split.share_amount);
      }
    }
  }

  for (const settlement of settlements) {
    if (settlement.from_user === currentUserId) {
      if (settlement.to_user === null) {
        deletedUserNet += settlement.amount;
      } else {
        net.set(settlement.to_user, (net.get(settlement.to_user) ?? 0) + settlement.amount);
      }
    } else if (settlement.to_user === currentUserId) {
      if (settlement.from_user === null) {
        deletedUserNet -= settlement.amount;
      } else {
        net.set(settlement.from_user, (net.get(settlement.from_user) ?? 0) - settlement.amount);
      }
    }
  }

  const balances: Balance[] = members
    .filter((m) => m.user_id !== currentUserId)
    .map((m) => ({
      userId: m.user_id,
      displayName: m.profiles?.display_name ?? 'Unknown',
      netAmount: Math.round((net.get(m.user_id) ?? 0) * 100) / 100,
    }));

  // Only shown when nonzero -- a deleted flatmate who was already fully
  // settled with leaves nothing to explain, same as any other member.
  const roundedDeletedNet = Math.round(deletedUserNet * 100) / 100;
  if (roundedDeletedNet !== 0) {
    balances.push({ userId: null, displayName: 'Deleted User', netAmount: roundedDeletedNet });
  }

  return balances;
}

/**
 * Computes, for the current user, their net balance with every other flat
 * member: positive = they owe you, negative = you owe them.
 */
export async function computeBalances(flatId: string, currentUserId: string): Promise<Balance[]> {
  const [{ data: splits, error: splitsError }, { data: settlements, error: settlementsError }] =
    await Promise.all([
      supabase
        .from('shared_expense_splits')
        .select('user_id, share_amount, shared_expenses(paid_by, flat_id)'),
      supabase.from('settlements').select('from_user, to_user, amount').eq('flat_id', flatId),
    ]);

  if (splitsError) throw splitsError;
  if (settlementsError) throw settlementsError;

  const members = await fetchFlatMembers(flatId);
  return computeBalancesFromData(
    flatId,
    currentUserId,
    (splits ?? []) as unknown as SplitRow[],
    settlements ?? [],
    members
  );
}

export type FlatHealth = {
  score: number; // 0-100
  label: 'Excellent' | 'Good' | 'Fair' | 'Needs attention';
  totalOutstanding: number;
  totalSpend: number;
};

export type HealthSplitRow = {
  // Nullable, same reasoning as SplitRow above -- a deleted flatmate's
  // old split row survives, just with this unset. pairKey() below just
  // stringifies it ("null"), which is still a distinct, consistent key --
  // the magnitude-only health score doesn't need a real identity here.
  user_id: string | null;
  share_amount: number;
  shared_expenses: { paid_by: string | null; flat_id: string; amount: number } | null;
};

/**
 * Pure calculation, no network calls -- see computeBalancesFromData's
 * comment above for why this is split out. See flats.test.ts.
 *
 * Flat-wide health score: what fraction of all shared spending in this flat
 * is still unsettled between members, across every pair of members (not
 * just relative to one person). 100 = everyone is fully settled up.
 * Formula is deliberately simple and explainable:
 *   score = 100 - (total outstanding between all pairs / total shared spend) * 100
 */
export function computeFlatHealthFromData(
  flatId: string,
  splits: HealthSplitRow[],
  settlements: SettlementRow[],
  totalSpend: number
): FlatHealth {
  // directed[ower][owed] = how much "ower" owes "owed", before settlements
  const directed = new Map<string, number>();
  const pairKey = (a: string | null, b: string | null) => `${a}|${b}`;

  for (const split of splits) {
    const expense = split.shared_expenses;
    if (!expense || expense.flat_id !== flatId) continue;

    if (split.user_id !== expense.paid_by) {
      const key = pairKey(split.user_id, expense.paid_by);
      directed.set(key, (directed.get(key) ?? 0) + split.share_amount);
    }
  }

  for (const s of settlements) {
    const key = pairKey(s.from_user, s.to_user);
    directed.set(key, (directed.get(key) ?? 0) - s.amount);
  }

  // consolidate directed pairs into net-per-unordered-pair, summing magnitude
  const seen = new Set<string>();
  let totalOutstanding = 0;
  for (const key of directed.keys()) {
    const [a, b] = key.split('|');
    const canonicalKey = [a, b].sort().join('|');
    if (seen.has(canonicalKey)) continue;
    seen.add(canonicalKey);

    const forward = directed.get(pairKey(a, b)) ?? 0;
    const backward = directed.get(pairKey(b, a)) ?? 0;
    totalOutstanding += Math.abs(forward - backward);
  }

  const score =
    totalSpend > 0 ? Math.max(0, Math.round(100 - (totalOutstanding / totalSpend) * 100)) : 100;

  const label: FlatHealth['label'] =
    score >= 90 ? 'Excellent' : score >= 70 ? 'Good' : score >= 50 ? 'Fair' : 'Needs attention';

  return {
    score,
    label,
    totalOutstanding: Math.round(totalOutstanding * 100) / 100,
    totalSpend: Math.round(totalSpend * 100) / 100,
  };
}

export async function computeFlatHealth(flatId: string): Promise<FlatHealth> {
  const [{ data: splits, error: splitsError }, { data: settlements, error: settlementsError }] =
    await Promise.all([
      supabase
        .from('shared_expense_splits')
        .select('user_id, share_amount, shared_expenses(paid_by, flat_id, amount)'),
      supabase.from('settlements').select('from_user, to_user, amount').eq('flat_id', flatId),
    ]);

  if (splitsError) throw splitsError;
  if (settlementsError) throw settlementsError;

  // each row from this table is already a distinct expense, no dedup needed
  const { data: expenses, error: expensesError } = await supabase
    .from('shared_expenses')
    .select('amount')
    .eq('flat_id', flatId);
  if (expensesError) throw expensesError;
  const totalSpend = (expenses ?? []).reduce((sum, e) => sum + e.amount, 0);

  return computeFlatHealthFromData(
    flatId,
    (splits ?? []) as unknown as HealthSplitRow[],
    settlements ?? [],
    totalSpend
  );
}

export type FlatMonthlyTotal = { month: string; label: string; total: number };

/**
 * Pure calculation, no network calls -- same split-for-testability
 * pattern as computeDashboardFromRows/computeBalancesFromData. Always
 * the full last 6 calendar months, including months with zero spend,
 * same shape as the personal dashboard's trend chart -- this is a
 * flat-wide history view, not scoped to a pay cycle the way the
 * dashboard's "current period" figures are.
 */
export function computeFlatMonthlyTotalsFromRows(
  rows: { amount: number; occurred_at: string }[],
  now: Date = new Date(),
): FlatMonthlyTotal[] {
  const monthlyMap = new Map<string, number>();
  for (const row of rows) {
    const key = row.occurred_at.slice(0, 7); // 'YYYY-MM'
    monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + row.amount);
  }

  const monthlyTotals: FlatMonthlyTotal[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthlyTotals.push({
      month: key,
      label: MONTH_LABELS[d.getMonth()],
      total: Math.round((monthlyMap.get(key) ?? 0) * 100) / 100,
    });
  }
  return monthlyTotals;
}

export type FlatTrendPoint = { key: string; label: string; total: number };

export type FlatSpendTrend = {
  weekly: FlatTrendPoint[];
  biweekly: FlatTrendPoint[];
  monthly: FlatMonthlyTotal[];
  // Earliest shared_expense ever logged for this flat, regardless of the
  // 6-month fetch window below -- used to resolve 'auto' (see
  // resolveFlatTrendView in flat.tsx): a brand-new flat should default
  // to weekly, not a near-empty 6-month chart.
  earliestOccurredAt: string | null;
};

// Groups rows into `count` fixed-length windows of `weekSpan` calendar
// weeks each, anchored to the Monday of the CURRENT week (not a rolling
// "last N days ending today") -- same calendar-week definition
// mondayOf/toDateKey already give the personal dashboard's own weekly
// chart, just stepping 2 weeks at a time for the biweekly tier instead
// of 1. Shared by both weekly (weekSpan=1) and biweekly (weekSpan=2)
// below rather than two near-identical copies.
function bucketByWeeks(
  rows: { amount: number; occurred_at: string }[],
  currentWeekMonday: Date,
  weekSpan: number,
  count: number,
): FlatTrendPoint[] {
  const stepDays = weekSpan * 7;
  const totalsByBucketStart = new Map<string, number>();
  for (const row of rows) {
    const rowMonday = mondayOf(row.occurred_at);
    const diffDays = Math.round((currentWeekMonday.getTime() - rowMonday.getTime()) / 86_400_000);
    if (diffDays < 0) continue;
    const bucketsBack = Math.floor(diffDays / stepDays);
    if (bucketsBack >= count) continue;
    const bucketStart = new Date(currentWeekMonday);
    bucketStart.setDate(bucketStart.getDate() - bucketsBack * stepDays);
    const key = toDateKey(bucketStart);
    totalsByBucketStart.set(key, (totalsByBucketStart.get(key) ?? 0) + row.amount);
  }

  const points: FlatTrendPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(currentWeekMonday);
    d.setDate(d.getDate() - i * stepDays);
    const key = toDateKey(d);
    points.push({
      key,
      label: `${MONTH_LABELS[d.getMonth()]} ${d.getDate()}`,
      total: Math.round((totalsByBucketStart.get(key) ?? 0) * 100) / 100,
    });
  }
  return points;
}

/**
 * Pure calculation, no network calls -- same split-for-testability
 * pattern as computeFlatMonthlyTotalsFromRows above. Weekly and
 * biweekly cover the last 6/12 calendar weeks; monthly reuses the
 * existing calendar-month function unchanged.
 */
export function computeFlatSpendTrendFromRows(
  rows: { amount: number; occurred_at: string }[],
  now: Date = new Date(),
): Omit<FlatSpendTrend, 'earliestOccurredAt'> {
  const currentWeekMonday = mondayOf(toDateKey(now));
  return {
    weekly: bucketByWeeks(rows, currentWeekMonday, 1, 6),
    biweekly: bucketByWeeks(rows, currentWeekMonday, 2, 6),
    monthly: computeFlatMonthlyTotalsFromRows(rows, now),
  };
}

export async function fetchFlatSpendTrend(flatId: string): Promise<FlatSpendTrend> {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);

  const [{ data, error }, { data: earliestRow, error: earliestError }] = await Promise.all([
    supabase
      .from('shared_expenses')
      .select('amount, occurred_at')
      .eq('flat_id', flatId)
      .gte('occurred_at', sixMonthsAgo.toISOString().slice(0, 10)),
    supabase
      .from('shared_expenses')
      .select('occurred_at')
      .eq('flat_id', flatId)
      .order('occurred_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  if (error) throw error;
  if (earliestError) throw earliestError;

  return {
    ...computeFlatSpendTrendFromRows(data ?? []),
    earliestOccurredAt: earliestRow?.occurred_at ?? null,
  };
}
