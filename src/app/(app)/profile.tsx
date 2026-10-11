import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Alert, Pressable, Text, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EditProfileModal } from '@/components/edit-profile-modal';
import { FlatSettingsModal } from '@/components/flat-settings-modal';
import { LegalModal } from '@/components/legal-modal';
import { SettingsModal } from '@/components/settings-modal';
import { PRIVACY_POLICY, TERMS_OF_SERVICE, type LegalDoc } from '@/constants/legal';
import { useAuth } from '@/lib/auth-context';

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
      className={`flex-row items-center gap-3 py-3.5 px-4 ${!isLast ? 'border-b border-gray-100 dark:border-tabby-700' : ''}`}>
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
  const isDark = useColorScheme() === 'dark';

  const handleSignOut = () => {
    Alert.alert('Sign out?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
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
            style={{ backgroundColor: '#BEE3F8' }}>
            <Image
              source={require('@/assets/images/splash-icon.png')}
              style={{ width: 44, height: 44 }}
            />
          </View>
          <View className="flex-1">
            <Text className="font-nunito-bold text-xl dark:text-white">{session?.user.email?.split('@')[0]}</Text>
            <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">{session?.user.email}</Text>
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
            <ListRow icon="settings" label="Settings" onPress={() => setShowSettings(true)} isLast isDark={isDark} />
          </View>
        </View>

        <View className="gap-2">
          <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300 text-xs tracking-wide px-4">
            LEGAL
          </Text>
          <View className="bg-gray-50 dark:bg-tabby-800 rounded-2xl border border-gray-100 dark:border-tabby-700">
            <ListRow icon="shield" label="Privacy Policy" onPress={() => setLegalDoc(PRIVACY_POLICY)} isDark={isDark} />
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
        <Pressable
          onPress={handleSignOut}
          style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          accessibilityRole="button"
          accessibilityLabel="Sign Out"
          className="flex-row items-center gap-3 px-4">
          <Feather name="log-out" size={18} color="#ef4444" />
          <Text className="font-nunito-medium text-red-500 dark:text-red-400">Sign Out</Text>
        </Pressable>

        <Text className="font-nunito text-center text-gray-500 dark:text-tabby-300 text-xs mt-auto">Tabby v1.0.0</Text>
      </View>

      <LegalModal doc={legalDoc} onClose={() => setLegalDoc(null)} />
      <SettingsModal visible={showSettings} onClose={() => setShowSettings(false)} />
      <EditProfileModal visible={showEditProfile} onClose={() => setShowEditProfile(false)} />
      <FlatSettingsModal visible={showFlatSettings} onClose={() => setShowFlatSettings(false)} />
    </SafeAreaView>
  );
}
