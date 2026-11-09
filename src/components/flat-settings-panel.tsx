import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { Segmented } from '@/components/segmented-control';
import type { FlatTrendPeriodPreference } from '@/lib/flat-trend-preference';
import type { FlatMember } from '@/lib/flats';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

const FLAT_TREND_OPTIONS: { value: FlatTrendPeriodPreference; label: string }[] = [
  { value: 'auto', label: 'Automatic' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'monthly', label: 'Monthly' },
];

// The Flat screen's inline settings panel (toggled by the gear icon) --
// trend-chart preference, add-by-email, admin member management, rename,
// leave, delete. Purely presentational: the text inputs' values and every
// handler stay in FlatView, so typed-but-unsaved text survives the panel
// being closed and reopened, same as before this was its own component.
export function FlatSettingsPanel({
  userId,
  members,
  isAdmin,
  busy,
  trendPreference,
  onSelectTrendPreference,
  addEmail,
  onChangeAddEmail,
  onAddByEmail,
  onToggleMemberRole,
  onRemoveMember,
  newName,
  onChangeNewName,
  onRename,
  onLeave,
  onDelete,
}: {
  userId: string | undefined;
  members: FlatMember[];
  isAdmin: boolean;
  busy: boolean;
  trendPreference: FlatTrendPeriodPreference;
  onSelectTrendPreference: (value: FlatTrendPeriodPreference) => void;
  addEmail: string;
  onChangeAddEmail: (text: string) => void;
  onAddByEmail: () => void;
  onToggleMemberRole: (member: FlatMember) => void;
  onRemoveMember: (member: FlatMember) => void;
  newName: string;
  onChangeNewName: (text: string) => void;
  onRename: () => void;
  onLeave: () => void;
  onDelete: () => void;
}) {
  return (
    <View className="bg-gray-50 dark:bg-tabby-800 rounded-xl p-4 gap-3">
      {/* A per-device display preference, not a flat-wide
          setting: everyone can pick their own view, same as
          the personal dashboard's trend picker in Profile ->
          Settings. */}
      <View className="gap-2">
        <Text className="font-nunito-semibold text-sm dark:text-white">Spend trend chart</Text>
        <Segmented options={FLAT_TREND_OPTIONS} value={trendPreference} onChange={onSelectTrendPreference} />
      </View>

      <View className="h-px bg-gray-200 dark:bg-tabby-700" />

      <View className="gap-2">
        <Text className="font-nunito-semibold text-sm dark:text-white">Add a member by email</Text>
        <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-xs">
          They need an existing Tabby account.
        </Text>
        <View className="flex-row gap-2">
          <TextInput
            value={addEmail}
            onChangeText={onChangeAddEmail}
            placeholder="their@email.com"
            autoCapitalize="none"
            keyboardType="email-address"
            className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2 flex-1 bg-white dark:bg-tabby-900 dark:text-white"
          />
          <Pressable
            onPress={onAddByEmail}
            disabled={busy}
            style={pressFeedback}
            className="bg-tabby-600 dark:bg-white rounded-lg px-4 items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Add member by email"
          >
            <Text className="font-nunito-semibold text-white dark:text-tabby-900 text-sm">Add</Text>
          </Pressable>
        </View>
      </View>

      {isAdmin && members.filter((m) => m.user_id !== userId).length > 0 && (
        <View className="gap-2">
          <Text className="font-nunito-semibold text-sm dark:text-white">Manage members</Text>
          <View className="gap-1.5">
            {members
              .filter((m) => m.user_id !== userId)
              .map((m) => (
                <View
                  key={m.user_id}
                  className="flex-row items-center justify-between bg-white dark:bg-tabby-900 border border-gray-200 dark:border-tabby-700 rounded-lg px-3 py-2"
                >
                  <Text className="font-nunito-medium text-sm dark:text-white flex-1">
                    {m.profiles?.display_name ?? 'Unknown'}
                  </Text>
                  <Pressable
                    onPress={() => onToggleMemberRole(m)}
                    disabled={busy}
                    style={pressFeedback}
                    accessibilityRole="button"
                    accessibilityLabel={m.role === 'admin' ? `Demote ${m.profiles?.display_name ?? ''}` : `Promote ${m.profiles?.display_name ?? ''}`}
                    accessibilityHint={m.role === 'admin' ? 'removes their admin rights for this flat' : 'makes them an admin of this flat'}
                    className="px-2.5 py-1"
                  >
                    <Text className="font-nunito-semibold text-xs text-tabby-700 dark:text-tabby-200">
                      {m.role === 'admin' ? 'Demote' : 'Promote'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => onRemoveMember(m)}
                    disabled={busy}
                    style={pressFeedback}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${m.profiles?.display_name ?? ''}`}
                    accessibilityHint="asks to confirm, then removes them from the flat; they will need a new invite to rejoin"
                    className="px-2.5 py-1"
                  >
                    <Text className="font-nunito-semibold text-xs text-rust-600">Remove</Text>
                  </Pressable>
                </View>
              ))}
          </View>
        </View>
      )}

      {isAdmin && (
        <View className="gap-2">
          <Text className="font-nunito-semibold text-sm dark:text-white">Rename flat</Text>
          <View className="flex-row gap-2">
            <TextInput
              value={newName}
              onChangeText={onChangeNewName}
              className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2 flex-1 bg-white dark:bg-tabby-900 dark:text-white"
            />
            <Pressable
              onPress={onRename}
              disabled={busy}
              style={pressFeedback}
              className="bg-tabby-600 dark:bg-white rounded-lg px-4 items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel="Save flat name"
            >
              <Text className="font-nunito-semibold text-white dark:text-tabby-900 text-sm">
                Save
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      <Pressable
        onPress={onLeave}
        disabled={busy}
        style={pressFeedback}
        className="py-2"
        accessibilityRole="button"
        accessibilityLabel="Leave flat"
        accessibilityHint="asks to confirm; you will need an invite code to rejoin"
      >
        <Text className="font-nunito-semibold text-red-500 dark:text-red-400 text-sm">
          Leave Flat
        </Text>
      </Pressable>

      {isAdmin && (
        <Pressable
          onPress={onDelete}
          disabled={busy}
          style={pressFeedback}
          className="py-2"
          accessibilityRole="button"
          accessibilityLabel="Delete flat"
          accessibilityHint="asks to confirm, then permanently deletes the flat and its expenses for everyone"
        >
          <Text className="font-nunito-semibold text-red-700 dark:text-red-400 text-sm">
            Delete Flat
          </Text>
        </Pressable>
      )}

      {busy && <ActivityIndicator />}
    </View>
  );
}
