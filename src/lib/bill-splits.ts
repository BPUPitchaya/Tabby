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

// Resolves an AI-detected participant name (from quick-add text or a
// scanned receipt) against the user's actual friends/flatmates, so "split
// dinner $200 with Sarah" links the real Sarah instead of always creating
// an untracked guest with the same name. Matches on full display name or
// first name, case-insensitive; an ambiguous match (two people named
// Sarah) falls back to null (treated as a guest) rather than guessing
// which account is meant.
export function matchKnownParticipant(
  name: string,
  knownPeople: { userId: string; label: string }[],
): { userId: string; label: string } | null {
  const needle = name.trim().toLowerCase();
  if (!needle) return null;

  const matches = knownPeople.filter((p) => {
    const label = p.label.trim().toLowerCase();
    const firstName = label.split(/\s+/)[0];
    return label === needle || firstName === needle;
  });

  return matches.length === 1 ? matches[0] : null;
}

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
  },
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
      })),
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
    })),
  );
  if (sharesError) throw sharesError;

  return billSplitId;
}

export type MyBillSplitShare = {
  id: string;
  amount_owed: number;
  status: 'proposed' | 'pending' | 'paid' | 'declined';
  reminded_at: string | null;
  bill_splits: { title: string; merchant: string | null; occurred_at: string; created_by: string } | null;
};

// Splits where I'm owed money (I created it) aren't fetched here -- the
// creation flow already shows the breakdown right after creating one.
// This is specifically "what do I owe other people," the thing worth
// surfacing again later. Includes 'paid' alongside 'pending' so the Money
// Owing screen can show a Paid history tab, not just the active debt.
export async function fetchMyPendingShares(userId: string): Promise<MyBillSplitShare[]> {
  const { data, error } = await supabase
    .from('bill_split_shares')
    .select('id, amount_owed, status, reminded_at, bill_splits(title, merchant, occurred_at, created_by)')
    .eq('owed_by_user_id', userId)
    .in('status', ['pending', 'paid']);

  if (error) throw error;
  return data as unknown as MyBillSplitShare[];
}

// Someone (the creator) sent a reminder about a share you owe -- shown in
// your own bell/Money Owing next time you open the app, not just as an
// outgoing text to you. See markReminded for the write side.
export async function fetchMyReminders(userId: string): Promise<MyBillSplitShare[]> {
  const shares = await fetchMyPendingShares(userId);
  return shares.filter((s) => s.status === 'pending' && s.reminded_at !== null);
}

export async function markReminded(shareId: string): Promise<void> {
  const { error } = await supabase
    .from('bill_split_shares')
    .update({ reminded_at: new Date().toISOString() })
    .eq('id', shareId);
  if (error) throw error;
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

export type OwedToMeShare = {
  id: string;
  amountOwed: number;
  status: 'proposed' | 'pending' | 'paid' | 'declined';
  payerLabel: string;
  billTitle: string;
  merchant: string | null;
  occurredAt: string;
};

// Shared by money-owing-modal.tsx and notifications-modal.tsx (via the
// Home bell) so "overdue" means the same thing in both places. A pending
// share past this age is flagged for a reminder -- never auto-sent, just
// a nudge toward tapping Send Reminder yourself.
export const OVERDUE_DAYS = 5;

export function isOverdue(share: OwedToMeShare): boolean {
  if (share.status !== 'pending') return false;
  const days = (Date.now() - new Date(`${share.occurredAt}T00:00:00`).getTime()) / 86_400_000;
  return days >= OVERDUE_DAYS;
}

// The other side of fetchMyPendingShares -- shares on bills I created,
// across every status, so "who still owes me" and "who's already paid"
// are both answerable from one screen. Read-only here: only the ower can
// mark their own share paid (RLS), same self-service pattern as a real
// debt being settled by the person who owes it, not the person owed.
export async function fetchOwedToMe(userId: string): Promise<OwedToMeShare[]> {
  const { data, error } = await supabase
    .from('bill_split_shares')
    .select(
      'id, amount_owed, status, guest_name, owed_by_user_id, bill_splits!inner(title, merchant, occurred_at, created_by)',
    )
    .eq('bill_splits.created_by', userId)
    .neq('status', 'declined');
  if (error) throw error;

  const rows = data as unknown as {
    id: string;
    amount_owed: number;
    status: 'proposed' | 'pending' | 'paid' | 'declined';
    guest_name: string | null;
    owed_by_user_id: string | null;
    bill_splits: { title: string; merchant: string | null; occurred_at: string } | null;
  }[];

  const userIds = rows.map((r) => r.owed_by_user_id).filter((id): id is string => !!id);
  const names = await fetchProfileNames(userIds);

  return rows.map((r) => ({
    id: r.id,
    amountOwed: r.amount_owed,
    status: r.status,
    payerLabel: r.guest_name ?? names[r.owed_by_user_id ?? ''] ?? 'Someone',
    billTitle: r.bill_splits?.title ?? 'A bill',
    merchant: r.bill_splits?.merchant ?? null,
    occurredAt: r.bill_splits?.occurred_at ?? '',
  }));
}
