import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth-context';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

export function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError(null);

    if (!email || !password || (mode === 'signUp' && !displayName)) {
      setError('Please fill in all fields.');
      return;
    }

    setSubmitting(true);
    const result =
      mode === 'signIn' ? await signIn(email, password) : await signUp(email, password, displayName);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 justify-center px-6 gap-4">
        <Text className="text-3xl font-bold text-center mb-2">Tabby</Text>
        <Text className="text-base text-center text-gray-500 mb-6">
          {mode === 'signIn' ? 'Welcome back' : 'Create your account'}
        </Text>

        {mode === 'signUp' && (
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Display name"
            autoCapitalize="words"
            className="border border-gray-300 rounded-lg px-4 py-3 text-base"
          />
        )}

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          className="border border-gray-300 rounded-lg px-4 py-3 text-base"
        />

        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          secureTextEntry
          className="border border-gray-300 rounded-lg px-4 py-3 text-base"
        />

        {error && <Text className="text-red-500 text-sm text-center">{error}</Text>}

        <Pressable
          onPress={handleSubmit}
          disabled={submitting}
          style={pressFeedback}
          className="bg-blue-600 rounded-lg py-3 items-center mt-2"
          accessibilityRole="button"
          accessibilityLabel={mode === 'signIn' ? 'Log in' : 'Sign up'}>
          {submitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white text-base font-semibold">
              {mode === 'signIn' ? 'Log In' : 'Sign Up'}
            </Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => {
            setError(null);
            setMode(mode === 'signIn' ? 'signUp' : 'signIn');
          }}
          style={pressFeedback}
          accessibilityRole="button">
          <Text className="text-blue-600 text-center text-sm mt-2">
            {mode === 'signIn' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
