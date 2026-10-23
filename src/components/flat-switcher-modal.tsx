// Lets a user who belongs to more than one flat see all of them and
// switch which one the Flat tab shows, plus create or join another --
// same bottom-sheet chrome chores-modal's weekday/day-of-month picker
// sheets already use, so this doesn't introduce a new UI pattern.
import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, useColorScheme, View } from 'react-native';

import { computeFlatHealth, createFlat, fetchFlatMembers, joinFlat, type Flat } from '@/lib/flats';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

type FlatSummary = { flat: Flat; memberCount: number; totalOutstanding: number };

export function FlatSwitcherModal({
  visible,
  onClose,
  flats,
  activeFlatId,
  userId,
  onSwitch,
  onFlatsChanged,
}: {
  visible: boolean;
  onClose: () => void;
  flats: Flat[];
  activeFlatId: string | null;
  userId: string;
  onSwitch: (flatId: string) => void;
  // Fires after creating or joining a new flat, so the caller refetches
  // its own flats list and can decide to make the new one active.
  onFlatsChanged: (newActiveFlatId: string) => void;
}) {
  const isDark = useColorScheme() === 'dark';

  const [summaries, setSummaries] = useState<FlatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [flatName, setFlatName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setShowAddForm(false);
    setFlatName('');
    setInviteCode('');
    setError(null);
    setLoading(true);
    Promise.all(
      flats.map(async (flat) => {
        const [members, health] = await Promise.all([fetchFlatMembers(flat.id), computeFlatHealth(flat.id)]);
        return { flat, memberCount: members.length, totalOutstanding: health.totalOutstanding };
      }),
    )
      .then(setSummaries)
      .catch(() => setSummaries(flats.map((flat) => ({ flat, memberCount: 0, totalOutstanding: 0 }))))
      .finally(() => setLoading(false));
  }, [visible, flats]);

  const handleCreate = async () => {
    if (!flatName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const flat = await createFlat(userId, flatName.trim());
      onFlatsChanged(flat.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create flat.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoin = async () => {
    if (!inviteCode.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const flat = await joinFlat(userId, inviteCode.trim());
      onFlatsChanged(flat.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join flat.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 bg-black/40 justify-end">
        <View
          className="bg-white dark:bg-tabby-900 rounded-t-3xl p-4 gap-3.5"
          style={{ maxHeight: '75%', paddingBottom: 20 }}
        >
          <View className="flex-row items-center justify-between">
            <Text className="font-fredoka-semibold text-lg dark:text-white">
              {showAddForm ? 'Add a Flat' : 'Your Flats'}
            </Text>
            <Pressable
              onPress={showAddForm ? () => setShowAddForm(false) : onClose}
              style={pressFeedback}
              accessibilityRole="button"
              accessibilityLabel="Close"
              className="w-7 h-7 rounded-full bg-gray-100 dark:bg-tabby-700 items-center justify-center"
            >
              <Feather name="x" size={14} color={isDark ? '#E8C39E' : '#6b7280'} />
            </Pressable>
          </View>

          {showAddForm ? (
            <ScrollView contentContainerStyle={{ gap: 14 }}>
              <View className="gap-2">
                <Text className="font-fredoka-semibold text-base dark:text-white">Create a flat</Text>
                <TextInput
                  value={flatName}
                  onChangeText={setFlatName}
                  placeholder="Flat name"
                  className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3.5 py-2.5 dark:text-white"
                />
                <Pressable
                  onPress={handleCreate}
                  disabled={submitting || !flatName.trim()}
                  style={pressFeedback}
                  className="bg-tabby-600 dark:bg-white rounded-lg py-2.5 items-center"
                  accessibilityRole="button"
                  accessibilityLabel="Create flat"
                >
                  <Text className="font-nunito-semibold text-white dark:text-tabby-900 text-sm">Create Flat</Text>
                </Pressable>
              </View>

              <View className="gap-2">
                <Text className="font-fredoka-semibold text-base dark:text-white">Join a flat</Text>
                <TextInput
                  value={inviteCode}
                  onChangeText={setInviteCode}
                  placeholder="Invite code"
                  autoCapitalize="none"
                  className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3.5 py-2.5 dark:text-white"
                />
                <Pressable
                  onPress={handleJoin}
                  disabled={submitting || !inviteCode.trim()}
                  style={pressFeedback}
                  className="bg-gray-800 dark:bg-tabby-700 rounded-lg py-2.5 items-center"
                  accessibilityRole="button"
                  accessibilityLabel="Join flat"
                >
                  <Text className="font-nunito-semibold text-white text-sm">Join Flat</Text>
                </Pressable>
              </View>

              {submitting && <ActivityIndicator />}
              {error && <Text className="font-nunito text-rust-600 text-sm text-center">{error}</Text>}
            </ScrollView>
          ) : loading ? (
            <View className="py-6 items-center">
              <ActivityIndicator />
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ gap: 8 }}>
              {summaries.map(({ flat, memberCount, totalOutstanding }) => {
                const active = flat.id === activeFlatId;
                return (
                  <Pressable
                    key={flat.id}
                    onPress={() => {
                      onSwitch(flat.id);
                      onClose();
                    }}
                    style={pressFeedback}
                    accessibilityRole="button"
                    accessibilityLabel={active ? `${flat.name}, currently active` : `Switch to ${flat.name}`}
                    className={`flex-row items-center gap-3 rounded-2xl px-3.5 py-3 ${
                      active
                        ? 'bg-tabby-50 dark:bg-tabby-800 border-[1.5px] border-tabby-600 dark:border-white'
                        : 'bg-white dark:bg-tabby-900 border border-gray-100 dark:border-tabby-700'
                    }`}
                  >
                    <View className="w-[38px] h-[38px] rounded-xl bg-tabby-600 dark:bg-tabby-700 items-center justify-center">
                      <Text className="font-fredoka-semibold text-base text-white">
                        {flat.name.trim().charAt(0).toUpperCase() || '?'}
                      </Text>
                    </View>
                    <View className="flex-1 gap-0.5">
                      <Text className="font-nunito-bold text-[15px] dark:text-white">{flat.name}</Text>
                      <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">
                        {memberCount} member{memberCount === 1 ? '' : 's'} ·{' '}
                        {totalOutstanding > 0 ? `$${totalOutstanding.toFixed(2)} unsettled` : 'All settled up'}
                      </Text>
                    </View>
                    {active && <Feather name="check" size={20} color={isDark ? '#E8C39E' : '#8B5A2B'} />}
                  </Pressable>
                );
              })}

              <View className="h-px bg-gray-100 dark:bg-tabby-700 my-1" />

              <Pressable
                onPress={() => setShowAddForm(true)}
                style={pressFeedback}
                accessibilityRole="button"
                accessibilityLabel="Create or join another flat"
                className="flex-row items-center gap-2.5 px-1.5 py-1.5"
              >
                <View className="w-[38px] h-[38px] rounded-xl border-[1.5px] border-dashed border-gray-300 dark:border-tabby-600 items-center justify-center">
                  <Feather name="plus" size={16} color={isDark ? '#E8C39E' : '#6b7280'} />
                </View>
                <Text className="font-nunito-bold text-sm text-gray-700 dark:text-tabby-200">
                  Create or join another flat
                </Text>
              </Pressable>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
