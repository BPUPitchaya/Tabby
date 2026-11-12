// Multi-job income management: list + form, same shape as bills-modal.tsx.
// Phase 2's replacement for Pay Schedule's own entry points (Home's Earned
// cell, Budget's redirect). Pay Schedule itself is deleted, no remaining
// callers. Phase 5 cut Earned/Budget over to read the primary income
// source's cycle + budget_amount directly (see getIncomeSourceProgress in
// income-sources.ts), so the "won't change Earned" disclaimer below refers
// to the Earned total specifically staying a record of logged
// transactions; it's not a stale leftover from before the cutover.
// See income-sources.ts / 0028_add_income_sources.sql / 0030_add_budget_amount_to_income_sources.sql.
//
// The form fields themselves live in income-source-form.tsx, shared with
// the income onboarding question (income-onboarding-question.tsx). This
// file owns the list view, the modal chrome, and create/edit/delete.
import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { IncomeSourceForm } from '@/components/income-source-form';
import { useAuth } from '@/lib/auth-context';
import {
  buildIncomeSourceParams,
  createIncomeSource,
  deleteIncomeSource,
  fetchIncomeSources,
  setPrimaryIncomeSource,
  updateIncomeSource,
  EMPTY_INCOME_FORM,
  type IncomeFormState,
  type IncomeSource,
} from '@/lib/income-sources';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

const SEGMENT_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.08,
  shadowRadius: 2,
  elevation: 1,
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function IncomeSourcesModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const isDark = useColorScheme() === 'dark';
  const { session } = useAuth();
  const userId = session?.user.id;

  const [view, setView] = useState<'list' | 'form'>('list');
  const [sources, setSources] = useState<IncomeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<IncomeFormState>(EMPTY_INCOME_FORM);

  const load = async () => {
    if (!userId) return;
    try {
      setSources(await fetchIncomeSources(userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load income sources.');
    }
  };

  useEffect(() => {
    if (!visible) return;
    setView('list');
    setError(null);
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [visible, userId]);

  const beginAddForm = () => {
    setForm({ ...EMPTY_INCOME_FORM, isPrimary: sources.length === 0 });
    setMessage(null);
    setView('form');
  };

  const openEditForm = (source: IncomeSource) => {
    setForm({
      id: source.id,
      label: source.label,
      isPrimary: source.isPrimary,
      mode: source.mode,
      amount: source.amount !== null ? String(source.amount) : '',
      hourlyRate: source.hourlyRate !== null ? String(source.hourlyRate) : '',
      frequency: source.frequency,
      payWeekday: source.payWeekday,
      dayOfMonth: source.dayOfMonth,
      trackingMode: source.trackingMode,
      taxCode: source.taxCode,
      hasStudentLoan: source.hasStudentLoan,
      kiwiSaverPct: source.kiwiSaverPct,
    });
    setMessage(null);
    setView('form');
  };

  const handleSaveForm = async () => {
    if (!userId) return;
    const result = buildIncomeSourceParams(form, sources);
    if ('error' in result) {
      setMessage(result.error);
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      if (form.id) {
        await updateIncomeSource(form.id, userId, result.params);
        // setPrimaryIncomeSource handles clearing any other primary first --
        // only call it when this source is actually meant to become
        // primary, never to un-set it to false by itself (there must
        // always be exactly one primary once any source exists).
        if (form.isPrimary) await setPrimaryIncomeSource(userId, form.id);
      } else {
        const id = await createIncomeSource(userId, result.params);
        if (form.isPrimary) await setPrimaryIncomeSource(userId, id);
      }

      await load();
      setView('list');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save income source.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (source: IncomeSource) => {
    setBusy(true);
    try {
      await deleteIncomeSource(source.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete income source.');
    } finally {
      setBusy(false);
    }
  };

  const presentSourceActions = (source: IncomeSource) => {
    const options = ['Edit', 'Delete', 'Cancel'];
    const handle = (index: number | undefined) => {
      if (index === 0) openEditForm(source);
      if (index === 1) {
        Alert.alert('Delete this income source?', source.label, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => handleDelete(source) },
        ]);
      }
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, destructiveButtonIndex: 1, cancelButtonIndex: 2 },
        handle,
      );
    } else {
      Alert.alert(source.label, undefined, [
        { text: 'Edit', onPress: () => handle(0) },
        { text: 'Delete', style: 'destructive', onPress: () => handle(1) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-white dark:bg-tabby-900">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-tabby-700">
            {view === 'form' ? (
              <Pressable
                onPress={() => setView('list')}
                style={pressFeedback}
                accessibilityRole="button"
                accessibilityLabel="Back"
              >
                <Feather name="chevron-left" size={20} color={isDark ? '#E8C39E' : '#374151'} />
              </Pressable>
            ) : (
              <Text className="font-fredoka-semibold text-xl dark:text-white">Income Sources</Text>
            )}
            {view === 'form' && (
              <Text className="font-fredoka-semibold text-xl dark:text-white">
                {form.id ? 'Edit Income' : 'Add Income'}
              </Text>
            )}
            {view === 'list' ? (
              <View className="flex-row items-center gap-4">
                <Pressable
                  onPress={beginAddForm}
                  style={pressFeedback}
                  accessibilityRole="button"
                  accessibilityLabel="Add income source"
                >
                  <Feather name="plus" size={22} color={isDark ? '#E8C39E' : '#374151'} />
                </Pressable>
                <Pressable
                  onPress={onClose}
                  style={pressFeedback}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  className="w-8 h-8 rounded-full bg-gray-100 dark:bg-tabby-700 items-center justify-center"
                >
                  <Feather name="x" size={16} color={isDark ? '#E8C39E' : '#374151'} />
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={onClose}
                style={pressFeedback}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Feather name="x" size={16} color={isDark ? '#E8C39E' : '#374151'} />
              </Pressable>
            )}
          </View>

          {loading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator />
            </View>
          ) : view === 'list' ? (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
              <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
                Add each job you&apos;re paid by, how much and how often. This sets the pay cycle Budget
                measures against; it won&apos;t change the Earned total, which only counts income
                transactions you log yourself (confirmed from the bell, or added by hand).
              </Text>
              {error && (
                <View className="px-3 py-2 bg-red-50 dark:bg-red-950 rounded-lg">
                  <Text className="font-nunito text-red-600 dark:text-red-400 text-sm">{error}</Text>
                </View>
              )}
              {sources.length === 0 ? (
                <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
                  No income sources yet. Add your first one below.
                </Text>
              ) : (
                sources.map((source) => (
                  <Pressable
                    key={source.id}
                    onPress={() => presentSourceActions(source)}
                    accessibilityHint="shows options to edit or delete this income source"
                    disabled={busy}
                    style={pressFeedback}
                    className="rounded-xl px-3 py-2.5 bg-gray-50 dark:bg-tabby-800 border border-gray-100 dark:border-tabby-700 gap-1.5"
                  >
                    <View className="flex-row items-center gap-2">
                      <Text className="font-nunito-medium dark:text-white flex-1">{source.label}</Text>
                      {source.isPrimary && (
                        <View className="bg-tabby-100 dark:bg-tabby-700 rounded-md px-1.5 py-0.5">
                          <Text className="font-nunito-bold text-[10px] text-tabby-700 dark:text-tabby-200">
                            Primary
                          </Text>
                        </View>
                      )}
                      <View className="bg-sage-100 dark:bg-sage-800 rounded-md px-1.5 py-0.5">
                        <Text className="font-nunito-bold text-[10px] text-sage-700 dark:text-sage-200">
                          {source.trackingMode === 'net' ? 'Net' : 'Gross'}
                        </Text>
                      </View>
                    </View>
                    <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">
                      {source.mode === 'fixed'
                        ? `$${(source.amount ?? 0).toFixed(2)}`
                        : `$${(source.hourlyRate ?? 0).toFixed(2)}/hr`}{' '}
                      ·{' '}
                      {source.frequency === 'monthly'
                        ? `Monthly, day ${source.dayOfMonth}`
                        : `${source.frequency === 'weekly' ? 'Weekly' : 'Fortnightly'}, ${WEEKDAYS[source.payWeekday ?? 0]}`}
                    </Text>
                  </Pressable>
                ))
              )}
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
              <IncomeSourceForm form={form} setForm={setForm} sources={sources} />

              {message && (
                <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">{message}</Text>
              )}

              <Pressable
                onPress={handleSaveForm}
                disabled={busy}
                style={(state) => [pressFeedback(state), SEGMENT_SHADOW]}
                className="rounded-lg py-2.5 items-center bg-tabby-600 dark:bg-white mt-1"
              >
                {busy ? (
                  <ActivityIndicator color={isDark ? '#2B1810' : 'white'} />
                ) : (
                  <Text className="font-nunito-semibold text-white dark:text-tabby-900 text-sm">Save</Text>
                )}
              </Pressable>
            </ScrollView>
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
