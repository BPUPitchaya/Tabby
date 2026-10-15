// Friends list + requests, and split proposals waiting on a response --
// grouped together since both are "things another person is waiting on
// you for." See friendships.ts for why adding a friend always requires
// the other side to accept rather than linking instantly.
import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Share,
  ScrollView,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { fetchMyProposedShares, respondToShare, type MyBillSplitShare } from '@/lib/bill-splits';
import { useAuth } from '@/lib/auth-context';
import { fetchFlatMembers, fetchMyFlat, type FlatMember } from '@/lib/flats';
import {
  fetchFriends,
  fetchIncomingRequests,
  fetchMyFriendCode,
  fetchOutgoingRequests,
  removeFriendship,
  respondToFriendRequest,
  sendFriendRequest,
  sendFriendRequestByCode,
  type Friend,
  type FriendRequest,
} from '@/lib/friendships';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

// First-initial bubble, sky-blue like every other avatar placeholder in
// the app (Home header, splash/Profile icon) -- gives each person row an
// identity instead of a bare line of text.
function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <View
      style={{ width: size, height: size, backgroundColor: '#BEE3F8' }}
      className="rounded-full items-center justify-center"
    >
      <Text className="font-fredoka-semibold text-tabby-600" style={{ fontSize: size * 0.4 }}>
        {name.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

export function FriendsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const isDark = useColorScheme() === 'dark';
  const { session } = useAuth();
  const userId = session?.user.id;

  const [view, setView] = useState<'list' | 'add'>('list');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [proposedShares, setProposedShares] = useState<MyBillSplitShare[]>([]);
  const [flatMembers, setFlatMembers] = useState<FlatMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [emailInput, setEmailInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [myCode, setMyCode] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addingByCode, setAddingByCode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!userId) return;
    try {
      const [f, inc, out, shares, code, flat] = await Promise.all([
        fetchFriends(userId),
        fetchIncomingRequests(userId),
        fetchOutgoingRequests(userId),
        fetchMyProposedShares(userId),
        fetchMyFriendCode(userId),
        fetchMyFlat(userId),
      ]);
      setFriends(f);
      setIncoming(inc);
      setOutgoing(out);
      setProposedShares(shares);
      setMyCode(code);
      setFlatMembers(flat ? await fetchFlatMembers(flat.id) : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load friends.');
    }
  };

  useEffect(() => {
    if (!visible) return;
    setView('list');
    setError(null);
    setEmailInput('');
    setCodeInput('');
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [visible, userId]);

  const handleAdd = async () => {
    if (!userId || !emailInput.trim()) return;
    setAdding(true);
    setError(null);
    try {
      await sendFriendRequest(userId, emailInput.trim());
      setEmailInput('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send request.');
    } finally {
      setAdding(false);
    }
  };

  const handleAddByCode = async () => {
    if (!userId || !codeInput.trim()) return;
    setAddingByCode(true);
    setError(null);
    try {
      await sendFriendRequestByCode(userId, codeInput.trim());
      setCodeInput('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send request.');
    } finally {
      setAddingByCode(false);
    }
  };

  const handleShareCode = () => {
    if (!myCode) return;
    Share.share({
      message: `Add me as a friend on Tabby! tabby://add-friend/${myCode}`,
    }).catch(() => {});
  };

  const handleRespondRequest = async (id: string, accept: boolean) => {
    try {
      await respondToFriendRequest(id, accept);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to respond.');
    }
  };

  const handleRemove = async (friendshipId: string) => {
    try {
      await removeFriendship(friendshipId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove.');
    }
  };

  const handleRespondShare = async (id: string, accept: boolean) => {
    try {
      await respondToShare(id, accept);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to respond.');
    }
  };

  const needsResponseCount = incoming.length + proposedShares.length;
  const isFlatmate = (userId: string) => flatMembers.some((m) => m.user_id === userId);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-white dark:bg-tabby-900">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-tabby-700">
            {view === 'add' ? (
              <Pressable
                onPress={() => setView('list')}
                style={pressFeedback}
                accessibilityRole="button"
                accessibilityLabel="Back"
              >
                <Feather name="chevron-left" size={20} color={isDark ? '#E8C39E' : '#374151'} />
              </Pressable>
            ) : (
              <Text className="font-fredoka-semibold text-xl dark:text-white">Friends</Text>
            )}
            {view === 'add' && (
              <Text className="font-fredoka-semibold text-xl dark:text-white">Add a Friend</Text>
            )}
            {view === 'list' ? (
              <View className="flex-row items-center gap-2.5">
                <Pressable
                  onPress={() => setView('add')}
                  style={pressFeedback}
                  accessibilityRole="button"
                  accessibilityLabel="Add a friend"
                  className="w-9 h-9 rounded-full bg-tabby-600 dark:bg-white items-center justify-center"
                >
                  <Feather name="plus" size={16} color={isDark ? '#2B1810' : '#fff'} />
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
            ) : (
              <View style={{ width: 20 }} />
            )}
          </View>

          {loading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator />
            </View>
          ) : view === 'add' ? (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
              {error && (
                <View className="px-3 py-2 bg-red-50 dark:bg-red-950 rounded-lg">
                  <Text className="font-nunito text-red-600 dark:text-red-400 text-sm">{error}</Text>
                </View>
              )}

              <View className="gap-2">
                <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">By email</Text>
                <View className="flex-row gap-2">
                  <TextInput
                    value={emailInput}
                    onChangeText={setEmailInput}
                    placeholder="Their email"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2 flex-1 text-sm dark:text-white"
                  />
                  <Pressable
                    onPress={handleAdd}
                    disabled={adding || !emailInput.trim()}
                    style={pressFeedback}
                    accessibilityRole="button"
                    accessibilityLabel="Send friend request"
                    className="px-4 items-center justify-center rounded-lg bg-tabby-600 dark:bg-white"
                  >
                    {adding ? (
                      <ActivityIndicator size="small" color={isDark ? '#2B1810' : 'white'} />
                    ) : (
                      <Text className="font-nunito-semibold text-white dark:text-tabby-900 text-sm">Add</Text>
                    )}
                  </Pressable>
                </View>
                <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-xs">
                  They&apos;ll need to accept before you show up as friends to each other.
                </Text>
              </View>

              <View className="gap-2">
                <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">By invite code</Text>
                <View className="flex-row gap-2">
                  <TextInput
                    value={codeInput}
                    onChangeText={setCodeInput}
                    placeholder="Their invite code"
                    autoCapitalize="none"
                    className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2 flex-1 text-sm dark:text-white"
                  />
                  <Pressable
                    onPress={handleAddByCode}
                    disabled={addingByCode || !codeInput.trim()}
                    style={pressFeedback}
                    accessibilityRole="button"
                    accessibilityLabel="Send request by code"
                    className="px-4 items-center justify-center rounded-lg border border-tabby-600 dark:border-white"
                  >
                    {addingByCode ? (
                      <ActivityIndicator size="small" color={isDark ? '#E8C39E' : '#8B5A2B'} />
                    ) : (
                      <Text className="font-nunito-semibold text-tabby-600 dark:text-white text-sm">Add</Text>
                    )}
                  </Pressable>
                </View>
              </View>

              <View className="h-px bg-gray-100 dark:bg-tabby-700" />

              <View className="gap-2">
                <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
                  Or share your own link
                </Text>
                <Pressable
                  onPress={handleShareCode}
                  disabled={!myCode}
                  style={pressFeedback}
                  accessibilityRole="button"
                  accessibilityLabel="Share your invite link"
                  className="flex-row items-center justify-between rounded-xl px-3 py-2.5 bg-gray-50 dark:bg-tabby-800 border border-gray-100 dark:border-tabby-700"
                >
                  <Text className="font-mono text-sm dark:text-white">{myCode ?? '...'}</Text>
                  <View className="flex-row items-center gap-1.5">
                    <Feather name="share" size={14} color={isDark ? '#E8C39E' : '#8B5A2B'} />
                    <Text className="font-nunito-semibold text-sm text-tabby-600 dark:text-tabby-200">
                      Share
                    </Text>
                  </View>
                </Pressable>
                <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-xs">
                  Anyone who opens it still has to accept. Sharing it doesn&apos;t add them automatically.
                </Text>
              </View>
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
              {error && (
                <View className="px-3 py-2 bg-red-50 dark:bg-red-950 rounded-lg">
                  <Text className="font-nunito text-red-600 dark:text-red-400 text-sm">{error}</Text>
                </View>
              )}

              <Text className="font-nunito text-sm text-gray-500 dark:text-tabby-300">
                {friends.length} friend{friends.length === 1 ? '' : 's'}
                {needsResponseCount > 0 ? ` · ${needsResponseCount} waiting on you` : ''}
              </Text>

              {needsResponseCount > 0 && (
                <View className="gap-2">
                  <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300 text-xs tracking-wide">
                    NEEDS YOUR RESPONSE
                  </Text>
                  <View className="gap-1.5">
                    {incoming.map((req) => (
                      <View
                        key={`req-${req.id}`}
                        className="flex-row items-center gap-3 rounded-2xl px-3 py-3 bg-gray-50 dark:bg-tabby-800 border border-gray-100 dark:border-tabby-700"
                      >
                        <Avatar name={req.otherDisplayName} size={38} />
                        <View className="flex-1">
                          <Text className="font-nunito-medium dark:text-white">{req.otherDisplayName}</Text>
                          <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">
                            Wants to be friends
                          </Text>
                        </View>
                        <View className="flex-row gap-2">
                          <Pressable
                            onPress={() => handleRespondRequest(req.id, true)}
                            style={pressFeedback}
                            accessibilityRole="button"
                            accessibilityLabel={`Accept ${req.otherDisplayName}`}
                            className="w-8 h-8 rounded-full bg-tabby-600 dark:bg-white items-center justify-center"
                          >
                            <Feather name="check" size={15} color={isDark ? '#2B1810' : '#fff'} />
                          </Pressable>
                          <Pressable
                            onPress={() => handleRespondRequest(req.id, false)}
                            style={pressFeedback}
                            accessibilityRole="button"
                            accessibilityLabel={`Decline ${req.otherDisplayName}`}
                            className="w-8 h-8 rounded-full border border-gray-300 dark:border-tabby-600 items-center justify-center"
                          >
                            <Feather name="x" size={15} color={isDark ? '#E8C39E' : '#4b5563'} />
                          </Pressable>
                        </View>
                      </View>
                    ))}

                    {proposedShares.map((share) => (
                      <View
                        key={`share-${share.id}`}
                        className="rounded-2xl px-3 py-3 bg-gray-50 dark:bg-tabby-800 border border-gray-100 dark:border-tabby-700 gap-2.5"
                      >
                        <View className="flex-row items-center gap-3">
                          <Avatar name={share.bill_splits?.title ?? '?'} size={38} />
                          <View className="flex-1">
                            <Text className="font-nunito-medium dark:text-white">
                              {share.bill_splits?.title ?? 'A bill'}
                            </Text>
                            <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">
                              Split request &mdash; you&apos;d owe ${share.amount_owed.toFixed(2)}
                            </Text>
                          </View>
                        </View>
                        <View className="flex-row gap-2">
                          <Pressable
                            onPress={() => handleRespondShare(share.id, true)}
                            style={pressFeedback}
                            className="flex-1 items-center py-1.5 rounded-lg bg-tabby-600 dark:bg-white"
                          >
                            <Text className="font-nunito-semibold text-sm text-white dark:text-tabby-900">
                              Accept
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() => handleRespondShare(share.id, false)}
                            style={pressFeedback}
                            className="flex-1 items-center py-1.5 rounded-lg border border-gray-300 dark:border-tabby-600"
                          >
                            <Text className="font-nunito-semibold text-sm text-gray-600 dark:text-tabby-200">
                              Decline
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              <View className="gap-2">
                <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300 text-xs tracking-wide">
                  FRIENDS
                </Text>
                {friends.length === 0 ? (
                  <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
                    No friends yet. Tap + to add one.
                  </Text>
                ) : (
                  <View className="gap-1">
                    {friends.map((friend) => (
                      <View
                        key={friend.friendshipId}
                        className="flex-row items-center gap-3 rounded-xl px-1 py-2"
                      >
                        <Avatar name={friend.displayName} />
                        <View className="flex-1 flex-row items-center gap-2">
                          <Text className="font-nunito-medium dark:text-white">{friend.displayName}</Text>
                          {isFlatmate(friend.userId) && (
                            <View className="bg-tabby-100 dark:bg-tabby-700 rounded-md px-1.5 py-0.5">
                              <Text className="font-nunito-bold text-[10px] text-tabby-700 dark:text-tabby-200">
                                Flatmate
                              </Text>
                            </View>
                          )}
                        </View>
                        <Pressable
                          onPress={() => handleRemove(friend.friendshipId)}
                          style={pressFeedback}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${friend.displayName}`}
                        >
                          <Feather name="x" size={16} color={isDark ? '#6B4420' : '#9ca3af'} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}

                {outgoing.length > 0 && (
                  <Text className="font-nunito text-xs text-gray-400 dark:text-tabby-500 px-1 pt-1">
                    Waiting on {outgoing.map((r) => r.otherDisplayName).join(', ')} to accept your request.
                  </Text>
                )}
              </View>
            </ScrollView>
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
