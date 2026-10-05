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

  const net = new Map<string, number>();

  for (const split of (splits ?? []) as unknown as {
    user_id: string;
    share_amount: number;
    shared_expenses: { paid_by: string; flat_id: string } | null;
  }[]) {
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

  for (const settlement of settlements ?? []) {
    if (settlement.from_user === currentUserId) {
      net.set(settlement.to_user, (net.get(settlement.to_user) ?? 0) + settlement.amount);
    } else if (settlement.to_user === currentUserId) {
      net.set(settlement.from_user, (net.get(settlement.from_user) ?? 0) - settlement.amount);
    }
  }

  const members = await fetchFlatMembers(flatId);
  return members
    .filter((m) => m.user_id !== currentUserId)
    .map((m) => ({
      userId: m.user_id,
      displayName: m.profiles?.display_name ?? 'Unknown',
      netAmount: Math.round((net.get(m.user_id) ?? 0) * 100) / 100,
    }));
}
