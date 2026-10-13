// Friends list + requests, and split proposals waiting on a response --
// grouped together since both are "things another person is waiting on
// you for." See friendships.ts for why adding a friend always requires
// the other side to accept rather than linking instantly.
import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Share, ScrollView, Text, TextInput, useColorScheme, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { fetchMyProposedShares, respondToShare, type MyBillSplitShare } from '@/lib/bill-splits';
import { useAuth } from '@/lib/auth-context';
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

export function FriendsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const isDark = useColorScheme() === 'dark';
  const { session } = useAuth();
  const userId = session?.user.id;

  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [proposedShares, setProposedShares] = useState<MyBillSplitShare[]>([]);
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
      const [f, inc, out, shares, code] = await Promise.all([
        fetchFriends(userId),
        fetchIncomingRequests(userId),
        fetchOutgoingRequests(userId),
        fetchMyProposedShares(userId),
        fetchMyFriendCode(userId),
      ]);
      setFriends(f);
      setIncoming(inc);
      setOutgoing(out);
      setProposedShares(shares);
      setMyCode(code);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load friends.');
    }
  };

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setEmailInput('');
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

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-white dark:bg-tabby-900">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-tabby-700">
            <Text className="font-fredoka-semibold text-xl dark:text-white">Friends</Text>
            <Pressable
              onPress={onClose}
              style={pressFeedback}
              accessibilityRole="button"
              accessibilityLabel="Close"
              className="w-8 h-8 rounded-full bg-gray-100 dark:bg-tabby-700 items-center justify-center">
              <Feather name="x" size={16} color={isDark ? '#E8C39E' : '#374151'} />
            </Pressable>
          </View>

          {loading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator />
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
              {error && (
                <View className="px-3 py-2 bg-red-50 dark:bg-red-950 rounded-lg">
                  <Text className="font-nunito text-red-600 dark:text-red-400 text-sm">{error}</Text>
                </View>
              )}

              <View className="gap-2">
                <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300 text-xs tracking-wide">
                  ADD A FRIEND
                </Text>
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
                    className="px-4 items-center justify-center rounded-lg bg-tabby-600 dark:bg-white">
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

                <View className="flex-row gap-2 pt-1">
                  <TextInput
                    value={codeInput}
                    onChangeText={setCodeInput}
                    placeholder="Or their invite code"
                    autoCapitalize="none"
                    className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2 flex-1 text-sm dark:text-white"
                  />
                  <Pressable
                    onPress={handleAddByCode}
                    disabled={addingByCode || !codeInput.trim()}
                    style={pressFeedback}
                    accessibilityRole="button"
                    accessibilityLabel="Send request by code"
                    className="px-4 items-center justify-center rounded-lg border border-tabby-600 dark:border-white">
                    {addingByCode ? (
                      <ActivityIndicator size="small" color={isDark ? '#E8C39E' : '#8B5A2B'} />
                    ) : (
                      <Text className="font-nunito-semibold text-tabby-600 dark:text-white text-sm">Add</Text>
                    )}
                  </Pressable>
                </View>
              </View>

              <View className="gap-2">
                <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300 text-xs tracking-wide">
                  YOUR INVITE LINK
                </Text>
                <Pressable
                  onPress={handleShareCode}
                  disabled={!myCode}
                  style={pressFeedback}
                  accessibilityRole="button"
                  accessibilityLabel="Share your invite link"
                  className="flex-row items-center justify-between rounded-xl px-3 py-2.5 bg-gray-50 dark:bg-tabby-800 border border-gray-100 dark:border-tabby-700">
                  <Text className="font-mono text-sm dark:text-white">{myCode ?? '...'}</Text>
                  <View className="flex-row items-center gap-1.5">
                    <Feather name="share" size={14} color={isDark ? '#E8C39E' : '#8B5A2B'} />
                    <Text className="font-nunito-semibold text-sm text-tabby-600 dark:text-tabby-200">Share</Text>
                  </View>
                </Pressable>
                <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-xs">
                  Anyone who opens it still has to accept -- sharing it doesn&apos;t add them automatically.
                </Text>
              </View>

              {proposedShares.length > 0 && (
                <View className="gap-2">
                  <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300 text-xs tracking-wide">
                    SPLIT REQUESTS
                  </Text>
                  <View className="gap-1.5">
                    {proposedShares.map((share) => (
                      <View
                        key={share.id}
                        className="rounded-xl px-3 py-2.5 bg-gray-50 dark:bg-tabby-800 border border-gray-100 dark:border-tabby-700 gap-2">
                        <Text className="font-nunito-medium dark:text-white">
                          {share.bill_splits?.title ?? 'A bill'} -- you&apos;d owe ${share.amount_owed.toFixed(2)}
                        </Text>
                        <View className="flex-row gap-2">
                          <Pressable
                            onPress={() => handleRespondShare(share.id, true)}
                            style={pressFeedback}
                            className="flex-1 items-center py-1.5 rounded-lg bg-tabby-600 dark:bg-white">
                            <Text className="font-nunito-semibold text-sm text-white dark:text-tabby-900">Accept</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => handleRespondShare(share.id, false)}
                            style={pressFeedback}
                            className="flex-1 items-center py-1.5 rounded-lg border border-gray-300 dark:border-tabby-600">
                            <Text className="font-nunito-semibold text-sm text-gray-600 dark:text-tabby-200">Decline</Text>
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {incoming.length > 0 && (
                <View className="gap-2">
                  <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300 text-xs tracking-wide">
                    FRIEND REQUESTS
                  </Text>
                  <View className="gap-1.5">
                    {incoming.map((req) => (
                      <View
                        key={req.id}
                        className="flex-row items-center justify-between rounded-xl px-3 py-2.5 bg-gray-50 dark:bg-tabby-800 border border-gray-100 dark:border-tabby-700">
                        <Text className="font-nunito-medium dark:text-white flex-1">{req.otherDisplayName}</Text>
                        <View className="flex-row gap-2">
                          <Pressable
                            onPress={() => handleRespondRequest(req.id, true)}
                            style={pressFeedback}
                            accessibilityRole="button"
                            accessibilityLabel={`Accept ${req.otherDisplayName}`}
                            className="w-8 h-8 rounded-full bg-tabby-600 dark:bg-white items-center justify-center">
                            <Feather name="check" size={15} color={isDark ? '#2B1810' : '#fff'} />
                          </Pressable>
                          <Pressable
                            onPress={() => handleRespondRequest(req.id, false)}
                            style={pressFeedback}
                            accessibilityRole="button"
                            accessibilityLabel={`Decline ${req.otherDisplayName}`}
                            className="w-8 h-8 rounded-full border border-gray-300 dark:border-tabby-600 items-center justify-center">
                            <Feather name="x" size={15} color={isDark ? '#E8C39E' : '#4b5563'} />
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {outgoing.length > 0 && (
                <View className="gap-2">
                  <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300 text-xs tracking-wide">
                    SENT REQUESTS
                  </Text>
                  <View className="gap-1.5">
                    {outgoing.map((req) => (
                      <View
                        key={req.id}
                        className="flex-row items-center justify-between rounded-xl px-3 py-2.5 bg-gray-50 dark:bg-tabby-800 border border-gray-100 dark:border-tabby-700">
                        <Text className="font-nunito-medium dark:text-white flex-1">{req.otherDisplayName}</Text>
                        <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">Waiting</Text>
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
                    No friends yet -- add one above.
                  </Text>
                ) : (
                  <View className="gap-1.5">
                    {friends.map((friend) => (
                      <View
                        key={friend.friendshipId}
                        className="flex-row items-center justify-between rounded-xl px-3 py-2.5 bg-gray-50 dark:bg-tabby-800 border border-gray-100 dark:border-tabby-700">
                        <Text className="font-nunito-medium dark:text-white flex-1">{friend.displayName}</Text>
                        <Pressable
                          onPress={() => handleRemove(friend.friendshipId)}
                          style={pressFeedback}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${friend.displayName}`}>
                          <Feather name="x" size={16} color="#9ca3af" />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </ScrollView>
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
