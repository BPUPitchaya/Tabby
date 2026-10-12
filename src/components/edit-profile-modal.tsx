import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth-context';
import { fetchProfile, updateDisplayName, updateEmail, updatePassword } from '@/lib/profile';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

// A labeled field with its own Save button -- each section of this screen
// saves independently (name / email / password), rather than one giant
// form-wide submit, since they're unrelated pieces of data with very
// different failure modes (email needs a confirmation click, password
// needs its own validation, etc).
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300 text-xs tracking-wide px-1">
        {title}
      </Text>
      <View className="bg-gray-50 dark:bg-tabby-800 rounded-2xl border border-gray-100 dark:border-tabby-700 p-4 gap-3">
        {children}
      </View>
    </View>
  );
}

function FieldButton({
  label,
  disabled,
  busy,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  busy?: boolean;
  onPress: () => void;
}) {
  const isDark = useColorScheme() === 'dark';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={pressFeedback}
      className={`rounded-lg py-2.5 items-center ${disabled ? 'bg-gray-300 dark:bg-tabby-700' : 'bg-tabby-600 dark:bg-white'}`}
      accessibilityRole="button">
      {busy ? (
        <ActivityIndicator color={isDark ? '#2B1810' : 'white'} />
      ) : (
        <Text className="font-nunito-semibold text-white dark:text-tabby-900 text-sm">{label}</Text>
      )}
    </Pressable>
  );
}

// Income/budget moved out to their own dashboard-tap entry points (see
// EarnedModal and BudgetModal, reachable from the Earned/Budget cells on
// Home) -- keeping a second editor for the same fields here would just
// invite the two to drift out of sync.
export function EditProfileModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { session } = useAuth();
  const userId = session?.user.id;

  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [nameBusy, setNameBusy] = useState(false);
  const [nameMessage, setNameMessage] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !userId) return;
    setLoading(true);
    fetchProfile(userId)
      .then((profile) => setName(profile.display_name))
      .finally(() => setLoading(false));
  }, [visible, userId]);

  const handleClose = () => {
    setNewEmail('');
    setNewPassword('');
    setNameMessage(null);
    setEmailMessage(null);
    setPasswordMessage(null);
    onClose();
  };

  const handleSaveName = async () => {
    if (!userId || !name.trim()) return;
    setNameBusy(true);
    setNameMessage(null);
    try {
      await updateDisplayName(userId, name.trim());
      setNameMessage('Saved.');
    } catch (err) {
      setNameMessage(err instanceof Error ? err.message : 'Failed to save name.');
    } finally {
      setNameBusy(false);
    }
  };

  const handleUpdateEmail = async () => {
    if (!newEmail.trim() || !newEmail.includes('@')) {
      setEmailMessage('Enter a valid email address.');
      return;
    }
    setEmailBusy(true);
    setEmailMessage(null);
    try {
      await updateEmail(newEmail.trim());
      setEmailMessage(`Check ${newEmail.trim()} for a confirmation link -- your email won't change until you click it.`);
      setNewEmail('');
    } catch (err) {
      setEmailMessage(err instanceof Error ? err.message : 'Failed to update email.');
    } finally {
      setEmailBusy(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (newPassword.length < 6) {
      setPasswordMessage('Password must be at least 6 characters.');
      return;
    }
    setPasswordBusy(true);
    setPasswordMessage(null);
    try {
      await updatePassword(newPassword);
      setPasswordMessage('Password updated.');
      setNewPassword('');
    } catch (err) {
      setPasswordMessage(err instanceof Error ? err.message : 'Failed to update password.');
    } finally {
      setPasswordBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-white dark:bg-tabby-900">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-tabby-700">
            <Text className="font-fredoka-semibold text-xl dark:text-white">Edit Profile</Text>
            <Pressable
              onPress={handleClose}
              style={pressFeedback}
              accessibilityRole="button"
              accessibilityLabel="Close">
              <Text className="font-nunito-semibold text-tabby-600 dark:text-white">Done</Text>
            </Pressable>
          </View>

          {loading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator />
            </View>
          ) : (
          <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
              <Section title="NAME">
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Display name"
                  autoCapitalize="words"
                  className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2 bg-white dark:bg-tabby-900 dark:text-white"
                />
                {nameMessage && (
                  <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-xs">{nameMessage}</Text>
                )}
                <FieldButton label="Save name" busy={nameBusy} onPress={handleSaveName} />
              </Section>

              <Section title="EMAIL">
                <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
                  Current: {session?.user.email}
                </Text>
                <TextInput
                  value={newEmail}
                  onChangeText={setNewEmail}
                  placeholder="New email address"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2 bg-white dark:bg-tabby-900 dark:text-white"
                />
                {emailMessage && (
                  <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-xs">{emailMessage}</Text>
                )}
                <FieldButton label="Update email" busy={emailBusy} onPress={handleUpdateEmail} />
              </Section>

              <Section title="PASSWORD">
                <TextInput
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="New password"
                  secureTextEntry
                  className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2 bg-white dark:bg-tabby-900 dark:text-white"
                />
                {passwordMessage && (
                  <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-xs">{passwordMessage}</Text>
                )}
                <FieldButton label="Update password" busy={passwordBusy} onPress={handleUpdatePassword} />
              </Section>
            </ScrollView>
          </KeyboardAvoidingView>
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
