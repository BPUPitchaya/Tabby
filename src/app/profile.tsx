import { Feather } from '@expo/vector-icons';
import { Alert, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth-context';

function Row({
  icon,
  label,
  onPress,
  destructive,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-row items-center gap-3 py-3.5 px-4 bg-gray-50 rounded-xl border border-gray-100">
      <Feather name={icon} size={18} color={destructive ? '#ef4444' : '#374151'} />
      <Text className={`flex-1 font-medium ${destructive ? 'text-red-500' : 'text-gray-800'}`}>
        {label}
      </Text>
      <Feather name="chevron-right" size={18} color="#d1d5db" />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const { session, signOut } = useAuth();

  const handleSignOut = () => {
    Alert.alert('Sign out?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="px-4 pt-6 gap-6">
        <View className="items-center gap-2 pb-2">
          <View className="w-16 h-16 rounded-full bg-blue-100 items-center justify-center">
            <Feather name="user" size={28} color="#2563eb" />
          </View>
          <Text className="text-lg font-bold">{session?.user.email?.split('@')[0]}</Text>
          <Text className="text-gray-400 text-sm">{session?.user.email}</Text>
        </View>

        <View className="gap-2">
          <Row icon="log-out" label="Sign Out" onPress={handleSignOut} destructive />
        </View>

        <Text className="text-center text-gray-300 text-xs mt-auto">Tabby v1.0.0</Text>
      </View>
    </SafeAreaView>
  );
}
