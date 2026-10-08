import { supabase } from '@/lib/supabase';

export type FlatMember = {
  user_id: string;
  role: 'admin' | 'member';
  profiles: { display_name: string } | null;
};

export type Flat = {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
};

export type SharedExpense = {
  id: string;
  amount: number;
  description: string | null;
  occurred_at: string;
  paid_by: string;
  profiles: { display_name: string } | null;
};

export type Balance = {
  userId: string;
  displayName: string;
  // positive = they owe you, negative = you owe them, 0 = settled
  netAmount: number;
};

export async function fetchMyFlat(userId: string): Promise<Flat | null> {
  const { data: membership, error: membershipError } = await supabase
    .from('flat_members')
    .select('flat_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (!membership) return null;

  const { data: flat, error: flatError } = await supabase
    .from('flats')
    .select('id, name, invite_code, created_by')
    .eq('id', membership.flat_id)
    .single();

  if (flatError) throw flatError;
  return flat as Flat;
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

export async function joinFlat(userId: string, inviteCode: string): Promise<Flat> {
  const { data, error: rpcError } = await supabase.rpc('find_flat_by_invite_code', {
    code: inviteCode.trim(),
  });

  if (rpcError) throw rpcError;
  const flat = data?.[0];
  if (!flat) throw new Error('No flat found with that invite code.');

  const { error: memberError } = await supabase
    .from('flat_members')
    .insert({ flat_id: flat.id, user_id: userId, role: 'member' });

  if (memberError) throw memberError;
  return flat as Flat;
}

export async function renameFlat(flatId: string, name: string) {
  const { error } = await supabase.from('flats').update({ name }).eq('id', flatId);
  if (error) throw error;
}

export async function deleteFlat(flatId: string) {
  const { error } = await supabase.from('flats').delete().eq('id', flatId);
  if (error) throw error;
}

export async function leaveFlat(flatId: string, userId: string) {
  const { error } = await supabase
    .from('flat_members')
    .delete()
    .eq('flat_id', flatId)
    .eq('user_id', userId);
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
  user_id: string;
  share_amount: number;
  shared_expenses: { paid_by: string; flat_id: string } | null;
};

export type SettlementRow = { from_user: string; to_user: string; amount: number };

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

  for (const split of splits) {
    const expense = split.shared_expenses;
    if (!expense || expense.flat_id !== flatId) continue;

    if (split.user_id === currentUserId && expense.paid_by !== currentUserId) {
      // current user owes the payer their share
      net.set(expense.paid_by, (net.get(expense.paid_by) ?? 0) - split.share_amount);
    } else if (split.user_id !== currentUserId && expense.paid_by === currentUserId) {
      // the other member owes the current user their share
      net.set(split.user_id, (net.get(split.user_id) ?? 0) + split.share_amount);
    }
  }

  for (const settlement of settlements) {
    if (settlement.from_user === currentUserId) {
      net.set(settlement.to_user, (net.get(settlement.to_user) ?? 0) + settlement.amount);
    } else if (settlement.to_user === currentUserId) {
      net.set(settlement.from_user, (net.get(settlement.from_user) ?? 0) - settlement.amount);
    }
  }

  return members
    .filter((m) => m.user_id !== currentUserId)
    .map((m) => ({
      userId: m.user_id,
      displayName: m.profiles?.display_name ?? 'Unknown',
      netAmount: Math.round((net.get(m.user_id) ?? 0) * 100) / 100,
    }));
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
  user_id: string;
  share_amount: number;
  shared_expenses: { paid_by: string; flat_id: string; amount: number } | null;
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
  const pairKey = (a: string, b: string) => `${a}|${b}`;

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
