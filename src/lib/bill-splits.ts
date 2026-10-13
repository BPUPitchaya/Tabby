// Ad-hoc "went out with a group, split the bill" -- distinct from
// flats.ts's shared_expenses, which is ongoing flat/household costs among
// known flat members. A bill split can include anyone: a flatmate, any
// other Tabby user (added by email, same pattern as addMemberByEmail), or
// a guest with no account at all.
import { supabase } from '@/lib/supabase';

export type BillSplitItem = {
  description: string;
  amount: number;
};

// What one person owes, before it's saved -- the creator is never a share
// (they paid the bill; a share is someone else's debt back to them).
export type DraftShare = {
  // Exactly one of these is set.
  userId: string | null;
  guestName: string | null;
  // Display label regardless of which of the above is set, so the UI
  // doesn't need to re-derive it.
  label: string;
  amount: number;
};

export async function findUserIdByEmail(email: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('find_user_id_by_email', { target_email: email.trim() });
  if (error) throw error;
  return (data as string | null) ?? null;
}

export async function fetchProfileNames(userIds: string[]): Promise<Record<string, string>> {
  if (userIds.length === 0) return {};
  const { data, error } = await supabase.from('profiles').select('id, display_name').in('id', userIds);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((p) => [p.id, p.display_name]));
}

export async function createBillSplit(
  createdBy: string,
  params: {
    title: string;
    merchant: string | null;
    totalAmount: number;
    occurredAt: string;
    items: BillSplitItem[];
    shares: DraftShare[];
  }
): Promise<string> {
  const { data: split, error: splitError } = await supabase
    .from('bill_splits')
    .insert({
      created_by: createdBy,
      title: params.title,
      merchant: params.merchant,
      total_amount: params.totalAmount,
      occurred_at: params.occurredAt,
    })
    .select('id')
    .single();

  if (splitError) throw splitError;
  const billSplitId = split.id as string;

  if (params.items.length > 0) {
    const { error: itemsError } = await supabase.from('bill_split_items').insert(
      params.items.map((item) => ({
        bill_split_id: billSplitId,
        description: item.description,
        amount: item.amount,
      }))
    );
    if (itemsError) throw itemsError;
  }

  const { error: sharesError } = await supabase.from('bill_split_shares').insert(
    params.shares.map((share) => ({
      bill_split_id: billSplitId,
      owed_by_user_id: share.userId,
      guest_name: share.userId ? null : share.label,
      amount_owed: share.amount,
      // A share aimed at a real account is a proposal, not an instant
      // claim -- it only becomes a real pending debt once that person
      // accepts it (respondToShare). A guest has no account to ask, so
      // their share is pending straight away, same as before.
      status: share.userId ? 'proposed' : 'pending',
    }))
  );
  if (sharesError) throw sharesError;

  return billSplitId;
}

export type MyBillSplitShare = {
  id: string;
  amount_owed: number;
  status: 'proposed' | 'pending' | 'paid' | 'declined';
  bill_splits: { title: string; merchant: string | null; occurred_at: string; created_by: string } | null;
};

// Splits where I'm owed money (I created it) aren't fetched here -- the
// creation flow already shows the breakdown right after creating one.
// This is specifically "what do I owe other people," the thing worth
// surfacing again later.
export async function fetchMyPendingShares(userId: string): Promise<MyBillSplitShare[]> {
  const { data, error } = await supabase
    .from('bill_split_shares')
    .select('id, amount_owed, status, bill_splits(title, merchant, occurred_at, created_by)')
    .eq('owed_by_user_id', userId)
    .eq('status', 'pending');

  if (error) throw error;
  return data as unknown as MyBillSplitShare[];
}

// Shares proposed to me, awaiting my accept/decline -- see createBillSplit
// for why a real-account share starts here instead of straight at pending.
export async function fetchMyProposedShares(userId: string): Promise<MyBillSplitShare[]> {
  const { data, error } = await supabase
    .from('bill_split_shares')
    .select('id, amount_owed, status, bill_splits(title, merchant, occurred_at, created_by)')
    .eq('owed_by_user_id', userId)
    .eq('status', 'proposed');

  if (error) throw error;
  return data as unknown as MyBillSplitShare[];
}

export async function respondToShare(shareId: string, accept: boolean): Promise<void> {
  const { error } = await supabase
    .from('bill_split_shares')
    .update({ status: accept ? 'pending' : 'declined' })
    .eq('id', shareId);
  if (error) throw error;
}

export async function markSharePaid(shareId: string) {
  const { error } = await supabase
    .from('bill_split_shares')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', shareId);
  if (error) throw error;
}
