// Consent-based friends list: a persistent record of who you've connected
// with, separate from flat membership, so bill splits can remember people
// instead of re-adding a guest by name every time. Adding someone never
// links the accounts instantly: it always goes through a request the
// other person has to accept, same posture as a flat invite code.
import { supabase } from '@/lib/supabase';

export type FriendshipStatus = 'pending' | 'accepted' | 'declined';

export type Friend = {
  friendshipId: string;
  userId: string;
  displayName: string;
};

export type FriendRequest = {
  id: string;
  otherUserId: string;
  otherDisplayName: string;
  createdAt: string;
};

export async function findUserIdByEmail(email: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('find_user_id_by_email', { target_email: email.trim() });
  if (error) throw error;
  return (data as string | null) ?? null;
}

// profiles' select policy is open to any authenticated user (0001_init.sql),
// so a friend_code lookup is an ordinary select, no RPC needed, same
// openness level display_name already has.
export async function findUserIdByFriendCode(code: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('friend_code', code.trim())
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

export async function fetchMyFriendCode(userId: string): Promise<string> {
  const { data, error } = await supabase.from('profiles').select('friend_code').eq('id', userId).single();
  if (error) throw error;
  return data.friend_code as string;
}

// Sends a request, or revives an existing declined one back to pending:
// the unique index on the pair means there's ever only one row between
// two people, so a prior decline doesn't permanently block re-requesting.
// A second input path (invite code, see findUserIdByFriendCode) resolves
// to the same addresseeId and calls through this same function. It's not a
// parallel flow; same consent requirement either way.
//
// Goes through a security-definer RPC (see
// 0052_fix_friendship_consent_gap.sql) rather than a direct insert/update.
// It always sets requester_id to the caller and status to 'pending',
// closing a gap where a direct update could fabricate an already-accepted
// friendship with an arbitrary other user, and a real bug where reviving a
// declined request only ever worked for whichever side happened to be the
// row's current addressee.
async function sendFriendRequestTo(addresseeId: string | null): Promise<void> {
  if (!addresseeId) throw new Error('No Tabby account found.');

  const { error } = await supabase.rpc('request_friendship', { p_addressee_id: addresseeId });
  if (error) throw error;
}

export async function sendFriendRequest(email: string): Promise<void> {
  const addresseeId = await findUserIdByEmail(email);
  if (!addresseeId) throw new Error('No Tabby account found with that email.');
  await sendFriendRequestTo(addresseeId);
}

export async function sendFriendRequestByCode(code: string): Promise<void> {
  const addresseeId = await findUserIdByFriendCode(code);
  if (!addresseeId) throw new Error('No Tabby account found with that invite code.');
  await sendFriendRequestTo(addresseeId);
}

export async function respondToFriendRequest(friendshipId: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc('respond_to_friend_request', {
    p_friendship_id: friendshipId,
    p_accept: accept,
  });
  if (error) throw error;
}

export async function removeFriendship(friendshipId: string): Promise<void> {
  const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
  if (error) throw error;
}

type FriendshipRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
  requester: { display_name: string } | null;
  addressee: { display_name: string } | null;
};

export async function fetchFriends(userId: string): Promise<Friend[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select('id, requester_id, addressee_id, status, created_at, requester:requester_id(display_name), addressee:addressee_id(display_name)')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
  if (error) throw error;

  return (data as unknown as FriendshipRow[]).map((row) => {
    const isRequester = row.requester_id === userId;
    return {
      friendshipId: row.id,
      userId: isRequester ? row.addressee_id : row.requester_id,
      displayName: (isRequester ? row.addressee : row.requester)?.display_name ?? 'Friend',
    };
  });
}

// Requests sent TO this user, still awaiting their response.
export async function fetchIncomingRequests(userId: string): Promise<FriendRequest[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select('id, requester_id, created_at, requester:requester_id(display_name)')
    .eq('addressee_id', userId)
    .eq('status', 'pending');
  if (error) throw error;

  return (data as unknown as { id: string; requester_id: string; created_at: string; requester: { display_name: string } | null }[]).map(
    (row) => ({
      id: row.id,
      otherUserId: row.requester_id,
      otherDisplayName: row.requester?.display_name ?? 'Someone',
      createdAt: row.created_at,
    })
  );
}

// Requests this user sent, still awaiting the other side. Shown so a
// pending request doesn't silently vanish from view while waiting.
export async function fetchOutgoingRequests(userId: string): Promise<FriendRequest[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select('id, addressee_id, created_at, addressee:addressee_id(display_name)')
    .eq('requester_id', userId)
    .eq('status', 'pending');
  if (error) throw error;

  return (data as unknown as { id: string; addressee_id: string; created_at: string; addressee: { display_name: string } | null }[]).map(
    (row) => ({
      id: row.id,
      otherUserId: row.addressee_id,
      otherDisplayName: row.addressee?.display_name ?? 'Someone',
      createdAt: row.created_at,
    })
  );
}
