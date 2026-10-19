import { Image } from 'expo-image';
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
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth-context';
import {
  fetchMyPaymentDetails,
  fetchProfile,
  updateDisplayName,
  updateEmail,
  updatePassword,
  updatePaymentDetails,
} from '@/lib/profile';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

// A field's own save/update button -- small and off to the side instead
// of a full-width bar, and only lit up once there's actually something to
// save. Four identical solid buttons sitting there with nothing to do was
// the real problem with the old screen, not the saving-independently part
// (each field keeps its own flow -- email needs a confirm click, password
// needs its own validation -- that behavior is unchanged).
function MiniButton({
  label,
  active,
  busy,
  onPress,
}: {
  label: string;
  active: boolean;
  busy?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!active || busy}
      style={pressFeedback}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`rounded-xl px-3.5 py-2.5 items-center justify-center ${
        active ? 'bg-tabby-600 dark:bg-white' : 'border border-gray-200 dark:border-tabby-700'
      }`}
    >
      {busy ? (
        <ActivityIndicator size="small" color={active ? 'white' : '#9CA3AF'} />
      ) : (
        <Text
          className={`font-nunito-bold text-xs ${
            active ? 'text-white dark:text-tabby-900' : 'text-gray-300 dark:text-tabby-600'
          }`}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="font-nunito-bold text-[11px] tracking-wide text-gray-400 dark:text-tabby-400 px-1">
      {children}
    </Text>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <View className="bg-gray-50 dark:bg-tabby-800 rounded-2xl border border-gray-100 dark:border-tabby-700 p-4 gap-3.5">
      {children}
    </View>
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
  const [savedName, setSavedName] = useState('');
  const [nameBusy, setNameBusy] = useState(false);
  const [nameMessage, setNameMessage] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);

  const [paymentDetails, setPaymentDetails] = useState('');
  const [savedPaymentDetails, setSavedPaymentDetails] = useState('');
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !userId) return;
    setLoading(true);
    Promise.all([fetchProfile(userId), fetchMyPaymentDetails(userId)])
      .then(([profile, payment]) => {
        setName(profile.display_name);
        setSavedName(profile.display_name);
        setPaymentDetails(payment ?? '');
        setSavedPaymentDetails(payment ?? '');
      })
      .finally(() => setLoading(false));
  }, [visible, userId]);

  const handleClose = () => {
    setNewEmail('');
    setNewPassword('');
    setNameMessage(null);
    setEmailMessage(null);
    setPasswordMessage(null);
    setPaymentMessage(null);
    onClose();
  };

  const handleSaveName = async () => {
    if (!userId || !name.trim()) return;
    setNameBusy(true);
    setNameMessage(null);
    try {
      await updateDisplayName(userId, name.trim());
      setSavedName(name.trim());
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
      setEmailMessage(
        `Check ${newEmail.trim()} for a confirmation link. Your email won't change until you click it.`,
      );
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

  const handleSavePaymentDetails = async () => {
    if (!userId) return;
    setPaymentBusy(true);
    setPaymentMessage(null);
    try {
      await updatePaymentDetails(userId, paymentDetails);
      setSavedPaymentDetails(paymentDetails);
      setPaymentMessage('Saved.');
    } catch (err) {
      setPaymentMessage(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setPaymentBusy(false);
    }
  };

  const nameDirty = name.trim().length > 0 && name.trim() !== savedName;
  const paymentDirty = paymentDetails !== savedPaymentDetails;

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
              accessibilityLabel="Close"
            >
              <Text className="font-nunito-semibold text-tabby-600 dark:text-white">Done</Text>
            </Pressable>
          </View>

          {loading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator />
            </View>
          ) : (
            <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <ScrollView contentContainerStyle={{ padding: 16, gap: 22 }}>
                {/* Same header chrome as the Profile screen itself, so this
                    reads as a continuation of your identity, not a cold
                    form dropped on top of it. */}
                <View className="flex-row items-center gap-3.5 px-1">
                  <View
                    className="w-14 h-14 rounded-full items-center justify-center"
                    style={{ backgroundColor: '#BEE3F8' }}
                  >
                    <Image source={require('@/assets/images/splash-icon.png')} style={{ width: 38, height: 38 }} />
                  </View>
                  <View className="flex-1">
                    <Text className="font-fredoka-semibold text-lg dark:text-white">{savedName}</Text>
                    <Text className="font-nunito text-gray-400 dark:text-tabby-400 text-xs">
                      {session?.user.email}
                    </Text>
                  </View>
                </View>

                {/* NAME: lightweight, no box -- changes often, shouldn't
                    carry the same weight as Security below. */}
                <View className="gap-2">
                  <SectionLabel>NAME</SectionLabel>
                  <View className="flex-row items-center gap-2 px-1">
                    <TextInput
                      value={name}
                      onChangeText={setName}
                      placeholder="Display name"
                      autoCapitalize="words"
                      className="flex-1 font-nunito border border-gray-200 dark:border-tabby-600 rounded-xl px-3.5 py-2.5 bg-white dark:bg-tabby-900 dark:text-white"
                    />
                    <MiniButton label="Save" active={nameDirty} busy={nameBusy} onPress={handleSaveName} />
                  </View>
                  {nameMessage && (
                    <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-xs px-1">
                      {nameMessage}
                    </Text>
                  )}
                </View>

                {/* SECURITY: email + password, both account-sensitive, both
                    keep their own confirm flow -- one card instead of two
                    identical boxes. */}
                <View className="gap-2">
                  <SectionLabel>SECURITY</SectionLabel>
                  <Card>
                    <View className="gap-1.5">
                      <Text className="font-nunito text-gray-400 dark:text-tabby-400 text-xs px-1">
                        Current email: {session?.user.email}
                      </Text>
                      <View className="flex-row items-center gap-2">
                        <TextInput
                          value={newEmail}
                          onChangeText={setNewEmail}
                          placeholder="New email address"
                          autoCapitalize="none"
                          keyboardType="email-address"
                          className="flex-1 font-nunito border border-gray-200 dark:border-tabby-600 rounded-xl px-3.5 py-2.5 bg-white dark:bg-tabby-900 dark:text-white"
                        />
                        <MiniButton
                          label="Update"
                          active={newEmail.trim().length > 0}
                          busy={emailBusy}
                          onPress={handleUpdateEmail}
                        />
                      </View>
                      {emailMessage && (
                        <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-xs px-1">
                          {emailMessage}
                        </Text>
                      )}
                    </View>

                    <View className="h-px bg-gray-100 dark:bg-tabby-700" />

                    <View className="gap-1.5">
                      <View className="flex-row items-center gap-2">
                        <TextInput
                          value={newPassword}
                          onChangeText={setNewPassword}
                          placeholder="New password"
                          secureTextEntry
                          className="flex-1 font-nunito border border-gray-200 dark:border-tabby-600 rounded-xl px-3.5 py-2.5 bg-white dark:bg-tabby-900 dark:text-white"
                        />
                        <MiniButton
                          label="Update"
                          active={newPassword.length > 0}
                          busy={passwordBusy}
                          onPress={handleUpdatePassword}
                        />
                      </View>
                      {passwordMessage && (
                        <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-xs px-1">
                          {passwordMessage}
                        </Text>
                      )}
                    </View>
                  </Card>
                </View>

                {/* PAYMENT DETAILS: optional, lower-stakes -- its own
                    quieter card. */}
                <View className="gap-2">
                  <View className="flex-row items-baseline justify-between px-1">
                    <SectionLabel>PAYMENT DETAILS</SectionLabel>
                    <Text className="font-nunito-medium text-gray-300 dark:text-tabby-500 text-xs">
                      Optional
                    </Text>
                  </View>
                  <Card>
                    <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
                      Included in a reminder so people know how to pay you back: bank account number,
                      reference, whatever you&apos;d normally give someone.
                    </Text>
                    <TextInput
                      value={paymentDetails}
                      onChangeText={setPaymentDetails}
                      placeholder="e.g. 12-3456-7890123-00, ref: your name"
                      multiline
                      className="font-nunito border border-gray-200 dark:border-tabby-600 rounded-xl px-3.5 py-2.5 bg-white dark:bg-tabby-900 dark:text-white min-h-[60px]"
                    />
                    <View className="flex-row justify-end">
                      <MiniButton
                        label="Save"
                        active={paymentDirty}
                        busy={paymentBusy}
                        onPress={handleSavePaymentDetails}
                      />
                    </View>
                    {paymentMessage && (
                      <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-xs px-1">
                        {paymentMessage}
                      </Text>
                    )}
                  </Card>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
