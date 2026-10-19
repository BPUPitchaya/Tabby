import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BillsModal } from '@/components/bills-modal';
import { BudgetModal } from '@/components/budget-modal';
import { EditProfileModal } from '@/components/edit-profile-modal';
import { FlatSettingsModal } from '@/components/flat-settings-modal';
import { FriendsModal } from '@/components/friends-modal';
import { IncomeSourcesModal } from '@/components/income-sources-modal';
import { LegalModal } from '@/components/legal-modal';
import { MoneyOwingModal } from '@/components/money-owing-modal';
import { SettingsModal } from '@/components/settings-modal';
import { PRIVACY_POLICY, TERMS_OF_SERVICE, type LegalDoc } from '@/constants/legal';
import { useAuth } from '@/lib/auth-context';
import { deleteAccount } from '@/lib/profile';

// A row inside the joined "Legal" list -- no border/radius of its own, a
// divider between rows instead, so the group reads as one list rather than
// a stack of identical floating pills.
//
// Icon colors are native props, not classNames, so they need to be told the
// scheme explicitly rather than picking it up via a dark: variant.
function ListRow({
  icon,
  label,
  onPress,
  isLast = false,
  isDark,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  isLast?: boolean;
  isDark: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`flex-row items-center gap-3 py-3.5 px-4 ${!isLast ? 'border-b border-gray-100 dark:border-tabby-700' : ''}`}
    >
      <Feather name={icon} size={18} color={isDark ? '#E8C39E' : '#374151'} />
      <Text className="flex-1 font-nunito-medium text-gray-800 dark:text-white">{label}</Text>
      <Feather name="chevron-right" size={18} color={isDark ? '#6B4420' : '#d1d5db'} />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showFlatSettings, setShowFlatSettings] = useState(false);
  const [showFriends, setShowFriends] = useState(false);
  const [showMoneyOwing, setShowMoneyOwing] = useState(false);
  const [showBills, setShowBills] = useState(false);
  const [showBudget, setShowBudget] = useState(false);
  const [showIncomeSources, setShowIncomeSources] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const isDark = useColorScheme() === 'dark';

  const handleSignOut = () => {
    Alert.alert('Sign out?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  // Two confirms, not one -- every other delete in this app (a
  // transaction, a bill) is undoable in the sense that you could just
  // re-add it; this one genuinely isn't. Same reasoning as why this
  // needed its own Edge Function rather than a plain client-side delete
  // (see lib/profile.ts's deleteAccount).
  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete your account?',
      'This permanently deletes your account and everything you logged -- transactions, bills, income sources, flat and split history. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you sure?',
              'There is no way to recover your account or data after this.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete Everything',
                  style: 'destructive',
                  onPress: async () => {
                    setDeletingAccount(true);
                    try {
                      await deleteAccount();
                      await signOut();
                    } catch (err) {
                      setDeletingAccount(false);
                      Alert.alert(
                        'Failed to delete account',
                        err instanceof Error ? err.message : 'Something went wrong. Try again.',
                      );
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-tabby-900">
      <View className="px-4 pt-6 gap-8 flex-1">
        {/* Left-aligned header, paired with the avatar, instead of the
            centered stack every other screen's header uses -- enough to
            make Profile feel like its own place rather than a repeat of
            the auth screen. */}
        <View className="flex-row items-center gap-4">
          <View
            className="w-16 h-16 rounded-full items-center justify-center"
            style={{ backgroundColor: '#BEE3F8' }}
          >
            <Image source={require('@/assets/images/splash-icon.png')} style={{ width: 44, height: 44 }} />
          </View>
          <View className="flex-1">
            <Text className="font-nunito-bold text-xl dark:text-white">
              {session?.user.email?.split('@')[0]}
            </Text>
            <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
              {session?.user.email}
            </Text>
          </View>
        </View>

        <View className="gap-2">
          <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300 text-xs tracking-wide px-4">
            ACCOUNT
          </Text>
          <View className="bg-gray-50 dark:bg-tabby-800 rounded-2xl border border-gray-100 dark:border-tabby-700">
            <ListRow
              icon="user"
              label="Edit Profile"
              onPress={() => setShowEditProfile(true)}
              isDark={isDark}
            />
            <ListRow icon="users" label="Flat" onPress={() => setShowFlatSettings(true)} isDark={isDark} />
            <ListRow icon="user-plus" label="Friends" onPress={() => setShowFriends(true)} isDark={isDark} />
            <ListRow
              icon="dollar-sign"
              label="Money Owing"
              onPress={() => setShowMoneyOwing(true)}
              isDark={isDark}
            />
            <ListRow icon="calendar" label="Bills" onPress={() => setShowBills(true)} isDark={isDark} />
            <ListRow icon="pie-chart" label="Budget" onPress={() => setShowBudget(true)} isDark={isDark} />
            <ListRow
              icon="briefcase"
              label="Income Sources"
              onPress={() => setShowIncomeSources(true)}
              isDark={isDark}
            />
            <ListRow
              icon="settings"
              label="Settings"
              onPress={() => setShowSettings(true)}
              isLast
              isDark={isDark}
            />
          </View>
        </View>

        <View className="gap-2">
          <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300 text-xs tracking-wide px-4">
            LEGAL
          </Text>
          <View className="bg-gray-50 dark:bg-tabby-800 rounded-2xl border border-gray-100 dark:border-tabby-700">
            <ListRow
              icon="shield"
              label="Privacy Policy"
              onPress={() => setLegalDoc(PRIVACY_POLICY)}
              isDark={isDark}
            />
            <ListRow
              icon="file-text"
              label="Terms of Service"
              onPress={() => setLegalDoc(TERMS_OF_SERVICE)}
              isLast
              isDark={isDark}
            />
          </View>
        </View>

        {/* Deliberately not boxed like the group above -- a plain row,
            set apart by space rather than by color alone. */}
        <View className="gap-4">
          <Pressable
            onPress={handleSignOut}
            disabled={deletingAccount}
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
            accessibilityRole="button"
            accessibilityLabel="Sign Out"
            className="flex-row items-center gap-3 px-4"
          >
            <Feather name="log-out" size={18} color="#ef4444" />
            <Text className="font-nunito-medium text-red-500 dark:text-red-400">Sign Out</Text>
          </Pressable>

          <Pressable
            onPress={handleDeleteAccount}
            disabled={deletingAccount}
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
            accessibilityRole="button"
            accessibilityLabel="Delete Account"
            className="flex-row items-center gap-3 px-4"
          >
            {deletingAccount ? (
              <ActivityIndicator size="small" color="#ef4444" />
            ) : (
              <Feather name="trash-2" size={18} color="#ef4444" />
            )}
            <Text className="font-nunito-medium text-red-500 dark:text-red-400">
              {deletingAccount ? 'Deleting account...' : 'Delete Account'}
            </Text>
          </Pressable>
        </View>

        <Text className="font-nunito text-center text-gray-500 dark:text-tabby-300 text-xs mt-auto">
          Tabby v1.0.0
        </Text>
      </View>

      <LegalModal doc={legalDoc} onClose={() => setLegalDoc(null)} />
      <SettingsModal visible={showSettings} onClose={() => setShowSettings(false)} />
      <EditProfileModal visible={showEditProfile} onClose={() => setShowEditProfile(false)} />
      <FlatSettingsModal visible={showFlatSettings} onClose={() => setShowFlatSettings(false)} />
      <FriendsModal visible={showFriends} onClose={() => setShowFriends(false)} />
      <MoneyOwingModal visible={showMoneyOwing} onClose={() => setShowMoneyOwing(false)} />
      <BillsModal visible={showBills} onClose={() => setShowBills(false)} />
      <BudgetModal
        visible={showBudget}
        onClose={() => setShowBudget(false)}
        onNeedsPaySchedule={() => {
          setShowBudget(false);
          setShowIncomeSources(true);
        }}
      />
      <IncomeSourcesModal visible={showIncomeSources} onClose={() => setShowIncomeSources(false)} />
    </SafeAreaView>
  );
}
