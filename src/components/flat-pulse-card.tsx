import { Feather } from '@expo/vector-icons';
import { Pressable, Text, useColorScheme, View } from 'react-native';

import { Avatar } from '@/components/flat-member-avatar';
import type { FlatHealth, FlatMember } from '@/lib/flats';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

// Flat Pulse: health score and members used to be two
// unrelated pieces (a members-chip row, then a separate
// health card further down). It's one hero now, since they're
// both "how is this flat doing" at a glance. Admin badges
// stay visible to everyone, same as before.
export function FlatPulseCard({
  health,
  members,
  userId,
  onShareInvite,
}: {
  health: FlatHealth;
  members: FlatMember[];
  userId: string | undefined;
  onShareInvite: () => void;
}) {
  const isDark = useColorScheme() === 'dark';

  return (
    <View
      className={`rounded-3xl p-[18px] gap-3.5 ${
        health.score >= 90
          ? 'bg-green-50 dark:bg-green-950'
          : health.score >= 70
            ? 'bg-tabby-50 dark:bg-tabby-800'
            : health.score >= 50
              ? 'bg-yellow-50 dark:bg-yellow-950'
              : 'bg-red-50 dark:bg-red-950'
      }`}
    >
      <View className="flex-row items-center gap-3.5">
        <View
          className={`w-[68px] h-[68px] rounded-full items-center justify-center ${
            health.score >= 90
              ? 'bg-green-600'
              : health.score >= 70
                ? 'bg-tabby-600 dark:bg-white'
                : health.score >= 50
                  ? 'bg-yellow-500'
                  : 'bg-red-500'
          }`}
        >
          <Text
            className={`font-fredoka-semibold text-2xl ${
              health.score >= 70 && health.score < 90 ? 'text-white dark:text-tabby-900' : 'text-white'
            }`}
          >
            {health.score}
          </Text>
        </View>
        <View className="flex-1">
          <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-xs">Flat Health</Text>
          <Text className="font-fredoka-semibold text-lg dark:text-white">{health.label}</Text>
          <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-[11px] mt-0.5">
            ${health.totalOutstanding.toFixed(2)} unsettled of ${health.totalSpend.toFixed(2)} total
            shared spend
          </Text>
        </View>
      </View>

      <View className="h-px bg-black/5 dark:bg-white/10" />

      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-row flex-wrap flex-1 gap-1.5">
          {members.map((m) => {
            const name = m.profiles?.display_name ?? 'Unknown';
            return (
              <View
                key={m.user_id}
                className="flex-row items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full border border-gray-200 dark:border-tabby-600 bg-white dark:bg-tabby-900"
              >
                <Avatar name={name} colorKey={m.user_id} unknown={!m.profiles?.display_name} size={22} />
                <Text className="font-nunito-medium text-sm text-gray-700 dark:text-tabby-200">
                  {name}
                  {m.user_id === userId ? ' (you)' : ''}
                </Text>
                {m.role === 'admin' && (
                  <View className="px-1.5 py-0.5 rounded-full bg-tabby-100 dark:bg-tabby-700">
                    <Text className="font-nunito-bold text-[10px] tracking-wide text-tabby-700 dark:text-tabby-100">
                      ADMIN
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
        <Pressable
          onPress={onShareInvite}
          style={pressFeedback}
          accessibilityRole="button"
          accessibilityLabel="Share invite"
          accessibilityHint="opens the share sheet with this flat's invite link"
          className="flex-row items-center gap-1.5 py-1"
        >
          <Feather name="share" size={13} color={isDark ? '#E8C39E' : '#8B5A2B'} />
          <Text className="font-nunito-bold text-sm text-tabby-700 dark:text-tabby-100">Invite</Text>
        </Pressable>
      </View>
    </View>
  );
}
