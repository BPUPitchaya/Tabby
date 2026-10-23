import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth-context';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

export function AuthScreen() {
  const { signIn, signUp, sendPasswordReset } = useAuth();
  const isDark = useColorScheme() === 'dark';
  const [mode, setMode] = useState<'signIn' | 'signUp' | 'forgotPassword'>('signIn');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError(null);

    if (mode === 'forgotPassword') {
      if (!email) {
        setError('Enter your email first.');
        return;
      }
      setSubmitting(true);
      const result = await sendPasswordReset(email);
      setSubmitting(false);
      if (result.error) {
        setError(result.error);
      } else {
        setResetSent(true);
      }
      return;
    }

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

  const switchMode = (next: typeof mode) => {
    setError(null);
    setResetSent(false);
    setMode(next);
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-tabby-900">
      <View className="flex-1 justify-center px-6 gap-4">
        <View className="items-center mb-2">
          <View
            className="w-20 h-20 rounded-full items-center justify-center mb-3"
            style={{ backgroundColor: '#BEE3F8' }}>
            <Image
              source={require('@/assets/images/splash-icon.png')}
              style={{ width: 56, height: 56 }}
            />
          </View>
          <Text className="font-fredoka-bold text-3xl text-center dark:text-white">Tabby</Text>
        </View>
        <Text className="font-nunito text-base text-center text-gray-500 dark:text-tabby-300 mb-6">
          {mode === 'signIn' ? 'Welcome back' : mode === 'signUp' ? 'Create your account' : 'Reset your password'}
        </Text>

        {mode === 'signUp' && (
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Display name"
            autoCapitalize="words"
            className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-4 py-3 text-base dark:text-white"
          />
        )}

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-4 py-3 text-base dark:text-white"
        />

        {mode !== 'forgotPassword' && (
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry
            className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-4 py-3 text-base dark:text-white"
          />
        )}

        {mode === 'signIn' && (
          <Pressable onPress={() => switchMode('forgotPassword')} style={pressFeedback} accessibilityRole="button">
            <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm text-right">
              Forgot password?
            </Text>
          </Pressable>
        )}

        {resetSent ? (
          <Text className="font-nunito text-sage-700 dark:text-sage-400 text-sm text-center">
            Check your email for a link to reset your password.
          </Text>
        ) : (
          error && <Text className="font-nunito text-red-500 dark:text-red-400 text-sm text-center">{error}</Text>
        )}

        {!resetSent && (
          <Pressable
            onPress={handleSubmit}
            disabled={submitting}
            style={pressFeedback}
            className="bg-tabby-600 dark:bg-white rounded-lg py-3 items-center mt-2"
            accessibilityRole="button"
            accessibilityLabel={mode === 'signIn' ? 'Log in' : mode === 'signUp' ? 'Sign up' : 'Send reset link'}>
            {submitting ? (
              <ActivityIndicator color={isDark ? '#2B1810' : 'white'} />
            ) : (
              <Text className="font-nunito-semibold text-white dark:text-tabby-900 text-base">
                {mode === 'signIn' ? 'Log In' : mode === 'signUp' ? 'Sign Up' : 'Send Reset Link'}
              </Text>
            )}
          </Pressable>
        )}

        {mode === 'forgotPassword' ? (
          <Pressable onPress={() => switchMode('signIn')} style={pressFeedback} accessibilityRole="button">
            <Text className="font-nunito text-tabby-600 dark:text-white text-center text-sm mt-2">
              Back to log in
            </Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => switchMode(mode === 'signIn' ? 'signUp' : 'signIn')} style={pressFeedback} accessibilityRole="button">
            <Text className="font-nunito text-tabby-600 dark:text-white text-center text-sm mt-2">
              {mode === 'signIn' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
            </Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}
