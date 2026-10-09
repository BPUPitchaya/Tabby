import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LegalModal } from '@/components/legal-modal';
import { PRIVACY_POLICY, TERMS_OF_SERVICE, type LegalDoc } from '@/constants/legal';
import { useAuth } from '@/lib/auth-context';

// A row inside the joined "Legal" list -- no border/radius of its own, a
// divider between rows instead, so the group reads as one list rather than
// a stack of identical floating pills.
function ListRow({
  icon,
  label,
  onPress,
  isLast = false,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  isLast?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`flex-row items-center gap-3 py-3.5 px-4 ${!isLast ? 'border-b border-gray-100' : ''}`}>
      <Feather name={icon} size={18} color="#374151" />
      <Text className="flex-1 font-nunito-medium text-gray-800">{label}</Text>
      <Feather name="chevron-right" size={18} color="#d1d5db" />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null);

  const handleSignOut = () => {
    Alert.alert('Sign out?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
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
            <Text className="font-nunito-bold text-xl">{session?.user.email?.split('@')[0]}</Text>
            <Text className="font-nunito text-gray-500 text-sm">{session?.user.email}</Text>
          </View>
        </View>

        <View className="gap-2">
          <Text className="font-nunito-semibold text-gray-400 text-xs tracking-wide px-4">
            LEGAL
          </Text>
          <View className="bg-gray-50 rounded-2xl border border-gray-100">
            <ListRow icon="shield" label="Privacy Policy" onPress={() => setLegalDoc(PRIVACY_POLICY)} />
            <ListRow
              icon="file-text"
              label="Terms of Service"
              onPress={() => setLegalDoc(TERMS_OF_SERVICE)}
              isLast
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
          <Text className="font-nunito-medium text-red-500">Sign Out</Text>
        </Pressable>

        <Text className="font-nunito text-center text-gray-500 text-xs mt-auto">Tabby v1.0.0</Text>
      </View>

      <LegalModal doc={legalDoc} onClose={() => setLegalDoc(null)} />
    </SafeAreaView>
  );
}
