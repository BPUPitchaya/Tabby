import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, useColorScheme, View } from 'react-native';
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
import { exportTransactionsCSV } from '@/lib/data-export';
import { deleteAccount } from '@/lib/profile';

// A row inside a joined list -- no border/radius of its own, a divider
// between rows instead, so the group reads as one list rather than a
// stack of identical floating pills. `muted` dials the whole row down
// (used for Legal, which is plumbing, not a feature worth the same visual
// weight as Money/Flat/Account).
//
// Icon colors are native props, not classNames, so they need to be told the
// scheme explicitly rather than picking it up via a dark: variant.
function ListRow({
  icon,
  label,
  onPress,
  isLast = false,
  isDark,
  muted = false,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  isLast?: boolean;
  isDark: boolean;
  muted?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`flex-row items-center gap-3 px-3.5 ${muted ? 'py-3' : 'py-3.5'} ${!isLast ? 'border-b border-gray-100 dark:border-tabby-700' : ''}`}
    >
      {muted ? (
        <Text className="flex-1 font-nunito-medium text-sm text-gray-400 dark:text-tabby-400">{label}</Text>
      ) : (
        <>
          <View className="w-[34px] h-[34px] rounded-[10px] bg-tabby-100 dark:bg-tabby-700 items-center justify-center">
            <Feather name={icon} size={16} color={isDark ? '#E8C39E' : '#6B4420'} />
          </View>
          <Text className="flex-1 font-nunito-semibold text-gray-800 dark:text-white">{label}</Text>
        </>
      )}
      <Feather
        name="chevron-right"
        size={muted ? 13 : 16}
        color={isDark ? '#6B4420' : muted ? '#E5E7EB' : '#D1D5DB'}
      />
    </Pressable>
  );
}

function SectionLabel({ children, muted = false }: { children: string; muted?: boolean }) {
  return (
    <Text
      className={`font-nunito-bold text-[11px] tracking-wide px-1 ${
        muted ? 'text-gray-300 dark:text-tabby-600' : 'text-gray-400 dark:text-tabby-400'
      }`}
    >
      {children}
    </Text>
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
  const [exportingData, setExportingData] = useState(false);
  const isDark = useColorScheme() === 'dark';

  const handleExportData = async () => {
    if (!session?.user.id || exportingData) return;
    setExportingData(true);
    try {
      await exportTransactionsCSV(session.user.id);
    } catch (err) {
      Alert.alert("Couldn't export", err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setExportingData(false);
    }
  };

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
      'This permanently deletes your account and everything you logged: transactions, bills, income sources, flat and split history. This cannot be undone.',
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
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 24, gap: 22 }}>
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
            <Text className="font-fredoka-semibold text-xl dark:text-white">
              {session?.user.email?.split('@')[0]}
            </Text>
            <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
              {session?.user.email}
            </Text>
          </View>
        </View>

        {/* The app's actual job -- surfaced first, not buried alongside
            Flat/Friends/Settings in one undifferentiated list. */}
        <View className="gap-2">
          <SectionLabel>MONEY</SectionLabel>
          <View className="bg-gray-50 dark:bg-tabby-800 rounded-2xl border border-gray-100 dark:border-tabby-700">
            <ListRow
              icon="briefcase"
              label="Income Sources"
              onPress={() => setShowIncomeSources(true)}
              isDark={isDark}
            />
            <ListRow icon="pie-chart" label="Budget" onPress={() => setShowBudget(true)} isDark={isDark} />
            <ListRow icon="calendar" label="Bills" onPress={() => setShowBills(true)} isDark={isDark} />
            <ListRow
              icon="dollar-sign"
              label="Money Owing"
              onPress={() => setShowMoneyOwing(true)}
              isDark={isDark}
              isLast
            />
          </View>
        </View>

        <View className="gap-2">
          <SectionLabel>FLAT &amp; FRIENDS</SectionLabel>
          <View className="bg-gray-50 dark:bg-tabby-800 rounded-2xl border border-gray-100 dark:border-tabby-700">
            <ListRow icon="home" label="Flat" onPress={() => setShowFlatSettings(true)} isDark={isDark} />
            <ListRow
              icon="user-plus"
              label="Friends"
              onPress={() => setShowFriends(true)}
              isDark={isDark}
              isLast
            />
          </View>
        </View>

        <View className="gap-2">
          <SectionLabel>ACCOUNT</SectionLabel>
          <View className="bg-gray-50 dark:bg-tabby-800 rounded-2xl border border-gray-100 dark:border-tabby-700">
            <ListRow
              icon="user"
              label="Edit Profile"
              onPress={() => setShowEditProfile(true)}
              isDark={isDark}
            />
            <ListRow
              icon="download"
              label={exportingData ? 'Exporting...' : 'Export Data'}
              onPress={handleExportData}
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

        {/* Deliberately quieter than the groups above -- plumbing, not a
            feature, so it shouldn't compete for the same attention. */}
        <View className="gap-1.5">
          <SectionLabel muted>LEGAL</SectionLabel>
          <View className="rounded-2xl border border-gray-100 dark:border-tabby-800">
            <ListRow
              icon="shield"
              label="Privacy Policy"
              onPress={() => setLegalDoc(PRIVACY_POLICY)}
              isDark={isDark}
              muted
            />
            <ListRow
              icon="file-text"
              label="Terms of Service"
              onPress={() => setLegalDoc(TERMS_OF_SERVICE)}
              isLast
              isDark={isDark}
              muted
            />
          </View>
        </View>

        {/* Sign Out is routine, not destructive -- it no longer shares red
            with Delete Account below, which is the one action on this
            screen that actually warrants it. */}
        <Pressable
          onPress={handleSignOut}
          disabled={deletingAccount}
          style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          accessibilityRole="button"
          accessibilityLabel="Sign Out"
          className="flex-row items-center gap-2.5 px-1"
        >
          <Feather name="log-out" size={17} color={isDark ? '#C9BBAA' : '#6B7280'} />
          <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300">Sign Out</Text>
        </Pressable>

        {/* The one place this screen raises its voice -- genuinely
            irreversible, so it looks different from every other row here. */}
        <View className="border-[1.5px] border-rust-200 dark:border-rust-700 bg-rust-50 dark:bg-rust-900/40 rounded-2xl p-4 gap-2.5">
          <View className="flex-row items-center gap-2">
            <Feather name="alert-triangle" size={15} color={isDark ? '#E1AC93' : '#8E3F2C'} />
            <Text className="font-nunito-extrabold text-[11px] tracking-wide text-rust-700 dark:text-rust-300">
              DANGER ZONE
            </Text>
          </View>
          <Pressable
            onPress={handleDeleteAccount}
            disabled={deletingAccount}
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
            accessibilityRole="button"
            accessibilityLabel="Delete Account"
            className="flex-row items-center gap-3"
          >
            <View className="flex-1 gap-0.5">
              <Text className="font-nunito-bold text-rust-800 dark:text-rust-200">
                {deletingAccount ? 'Deleting account...' : 'Delete Account'}
              </Text>
              {!deletingAccount && (
                <Text className="font-nunito text-xs text-rust-600 dark:text-rust-400 leading-4">
                  Permanently deletes everything you logged. Can&apos;t be undone.
                </Text>
              )}
            </View>
            {deletingAccount ? (
              <ActivityIndicator size="small" color={isDark ? '#E1AC93' : '#8E3F2C'} />
            ) : (
              <Feather name="chevron-right" size={16} color={isDark ? '#E1AC93' : '#8E3F2C'} />
            )}
          </Pressable>
        </View>

        <Text className="font-nunito text-center text-gray-300 dark:text-tabby-600 text-xs">
          Tabby v1.0.0
        </Text>
      </ScrollView>

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
