// "Went out with a group, split the bill" -- separate from the Flat tab's
// ongoing shared-expense tracking (flats.ts), this is a one-off split that
// can include anyone: a flatmate, any other Tabby user by email, or a
// guest with no account (settled outside the app for now -- see
// bill-splits.ts for why there's no guest share link yet).
import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { parseFinancialDocument } from '@/lib/ai';
import { useAuth } from '@/lib/auth-context';
import { createBillSplit, findUserIdByEmail, type BillSplitItem, type DraftShare } from '@/lib/bill-splits';
import { addTransaction, fetchCategories, type Category } from '@/lib/transactions';
import { CategoryIcon } from '@/components/category-icon';
import { presentScanSheet } from '@/lib/document-scan';
import { fetchFlatMembers, fetchMyFlat, type FlatMember } from '@/lib/flats';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

type SplitMode = 'equal' | 'custom' | 'itemize';

type Participant = {
  key: string;
  userId: string | null;
  label: string;
};

function toLocalISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Splits `total` across `count` people to the cent, with any leftover cent
// (from rounding) going to the first person rather than silently dropped
// -- otherwise a $10 split 3 ways is $3.33 x3 = $9.99, a cent short.
function splitEvenly(total: number, count: number): number[] {
  if (count <= 0) return [];
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / count);
  const remainder = cents - base * count;
  return Array.from({ length: count }, (_, i) => (base + (i < remainder ? 1 : 0)) / 100);
}

// Never leave a bill uncategorized -- an exact name match if the AI
// suggested one that exists, else "Other" rather than nothing at all.
function pickCategoryId(categories: Category[], name: string | null): string | null {
  const match = name ? categories.find((c) => c.name === name) : null;
  if (match) return match.id;
  return categories.find((c) => c.name === 'Other')?.id ?? null;
}

export function SplitBillModal({
  visible,
  onClose,
  onCreated,
  draft,
}: {
  visible: boolean;
  onClose: () => void;
  // Fires right after the bill's transaction is saved, so the caller can
  // refresh its own transaction list -- this modal has no list of its own
  // to update.
  onCreated?: () => void;
  // Pre-fills the form from a chat quick-add parse (ParsedBillSplit in
  // ai.ts) instead of opening blank. Participants always come in as
  // guests-by-name here -- matching a name to a real flatmate account is
  // left to the user (tap the x, add them properly via the flatmate/email
  // pickers) rather than guessed, since a wrong auto-match would silently
  // put a debt on the wrong person.
  draft?: {
    title: string;
    merchant: string | null;
    totalAmount: number;
    occurredAt: string;
    categoryName: string | null;
    participants: { name: string; amount: number | null }[];
  } | null;
}) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { session } = useAuth();
  const userId = session?.user.id;

  const todayISO = toLocalISODate(new Date());

  const [title, setTitle] = useState('');
  const [merchant, setMerchant] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [occurredAt, setOccurredAt] = useState(todayISO);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [items, setItems] = useState<BillSplitItem[]>([]);
  const [scanning, setScanning] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');

  const [flatMembers, setFlatMembers] = useState<FlatMember[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [guestName, setGuestName] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [addingByEmail, setAddingByEmail] = useState(false);

  const [splitMode, setSplitMode] = useState<SplitMode>('equal');
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  // itemIndex -> set of participant keys sharing that item
  const [itemAssignments, setItemAssignments] = useState<Record<number, Set<string>>>({});

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ participant: Participant; amount: number }[] | null>(null);

  useEffect(() => {
    if (!visible || !userId) return;
    // Reset every time the sheet opens -- same pattern as transactions.tsx's
    // resetForm, so a half-filled split doesn't linger from last time. A
    // draft (from a chat quick-add parse) prefills instead of blanking.
    setTitle(draft?.title ?? '');
    setMerchant(draft?.merchant ?? '');
    setTotalAmount(draft ? String(draft.totalAmount) : '');
    setOccurredAt(draft?.occurredAt ?? todayISO);
    setItems([]);
    setGuestName('');
    setEmailInput('');
    setCategoryId(null);
    setShowCategoryPicker(false);
    setCategorySearch('');
    setError(null);
    setResult(null);

    if (draft && draft.participants.length > 0) {
      const draftParticipants = draft.participants.map((p) => ({
        key: `guest:${p.name}:${Date.now()}:${Math.random()}`,
        userId: null,
        label: p.name,
      }));
      setParticipants(draftParticipants);
      const hasNamedAmounts = draft.participants.some((p) => p.amount !== null);
      setSplitMode(hasNamedAmounts ? 'custom' : 'equal');
      setCustomAmounts(
        hasNamedAmounts
          ? Object.fromEntries(
              draftParticipants.map((p, i) => [p.key, draft.participants[i].amount?.toFixed(2) ?? ''])
            )
          : {}
      );
    } else {
      setParticipants([]);
      setSplitMode('equal');
      setCustomAmounts({});
    }
    setItemAssignments({});

    fetchMyFlat(userId)
      .then((flat) => (flat ? fetchFlatMembers(flat.id) : []))
      .then((members) => setFlatMembers(members.filter((m) => m.user_id !== userId)))
      .catch(() => setFlatMembers([]));

    fetchCategories('expense')
      .then((cats) => {
        setCategories(cats);
        setCategoryId(pickCategoryId(cats, draft?.categoryName ?? null));
      })
      .catch(() => setCategories([]));
  }, [visible, userId]);

  const total = parseFloat(totalAmount) || 0;
  const selectedCategory = categories.find((c) => c.id === categoryId) ?? null;
  const filteredCategories = categories.filter((c) =>
    c.name.toLowerCase().includes(categorySearch.toLowerCase()),
  );

  const addParticipant = (p: Participant) => {
    if (participants.some((existing) => existing.key === p.key)) return;
    setParticipants((prev) => [...prev, p]);
  };

  const removeParticipant = (key: string) => {
    setParticipants((prev) => prev.filter((p) => p.key !== key));
    setCustomAmounts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setItemAssignments((prev) => {
      const next: Record<number, Set<string>> = {};
      for (const [i, keys] of Object.entries(prev)) {
        const copy = new Set(keys);
        copy.delete(key);
        next[Number(i)] = copy;
      }
      return next;
    });
  };

  const handleAddByEmail = async () => {
    if (!emailInput.trim()) return;
    setAddingByEmail(true);
    setError(null);
    try {
      const foundUserId = await findUserIdByEmail(emailInput.trim());
      if (!foundUserId) {
        setError('No Tabby account found with that email.');
        return;
      }
      if (foundUserId === userId) {
        setError("That's you.");
        return;
      }
      addParticipant({
        key: `user:${foundUserId}`,
        userId: foundUserId,
        label: emailInput.trim(),
      });
      setEmailInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to look up that email.');
    } finally {
      setAddingByEmail(false);
    }
  };

  const handleAddGuest = () => {
    if (!guestName.trim()) return;
    addParticipant({
      key: `guest:${guestName.trim()}:${Date.now()}`,
      userId: null,
      label: guestName.trim(),
    });
    setGuestName('');
  };

  const handleScan = async () => {
    setError(null);
    try {
      const scanned = await presentScanSheet();
      if (!scanned) return;

      setScanning(true);
      const parsed = await parseFinancialDocument(
        scanned.base64Data,
        scanned.mimeType,
        categories.map((c) => ({ id: c.id, name: c.name })),
      );
      if (!parsed || parsed.length === 0) {
        setError("Couldn't find any line items in that -- try a clearer photo, or enter the total manually.");
        return;
      }
      const scannedItems = parsed
        .filter((p) => !p.isIncome)
        .map((p) => ({ description: p.description, amount: p.amount }));
      setItems(scannedItems);
      setTotalAmount(scannedItems.reduce((sum, i) => sum + i.amount, 0).toFixed(2));
      if (!title.trim() && parsed[0]?.merchant) setMerchant(parsed[0].merchant);
      const suggestedCategory = parsed.find((p) => p.categoryName)?.categoryName ?? null;
      setCategoryId(pickCategoryId(categories, suggestedCategory));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read that file.');
    } finally {
      setScanning(false);
    }
  };

  const toggleItemAssignment = (itemIndex: number, participantKey: string) => {
    setItemAssignments((prev) => {
      const current = new Set(prev[itemIndex] ?? []);
      if (current.has(participantKey)) current.delete(participantKey);
      else current.add(participantKey);
      return { ...prev, [itemIndex]: current };
    });
  };

  // Each participant's computed share, by mode. Always derived, never
  // stored separately, so switching modes never leaves stale amounts.
  const shareAmounts: Record<string, number> = (() => {
    if (splitMode === 'equal') {
      // +1 for you -- the bill is split N+1 ways (you + everyone here),
      // but only the others' slices are owed back to you; your own slice
      // just stays with you.
      const amounts = splitEvenly(total, participants.length + 1);
      return Object.fromEntries(participants.map((p, i) => [p.key, amounts[i] ?? 0]));
    }
    if (splitMode === 'custom') {
      return Object.fromEntries(participants.map((p) => [p.key, parseFloat(customAmounts[p.key]) || 0]));
    }
    // itemize
    const totals: Record<string, number> = Object.fromEntries(participants.map((p) => [p.key, 0]));
    items.forEach((item, i) => {
      const assigned = Array.from(itemAssignments[i] ?? []);
      if (assigned.length === 0) return;
      const perPerson = splitEvenly(item.amount, assigned.length);
      assigned.forEach((key, idx) => {
        totals[key] = (totals[key] ?? 0) + perPerson[idx];
      });
    });
    return totals;
  })();

  const shareTotal = Object.values(shareAmounts).reduce((sum, a) => sum + a, 0);
  const unassignedItems = splitMode === 'itemize' ? items.filter((_, i) => !itemAssignments[i]?.size) : [];

  const handleCreate = async () => {
    if (!userId) return;
    const effectiveTitle = title.trim() || merchant.trim() || 'Bill';
    if (total <= 0) {
      setError('Enter a total amount, or scan a receipt.');
      return;
    }
    if (participants.length === 0) {
      setError('Add at least one person to split with.');
      return;
    }
    if (splitMode === 'itemize' && unassignedItems.length > 0) {
      setError(
        `${unassignedItems.length} item${unassignedItems.length === 1 ? '' : 's'} not assigned to anyone yet.`,
      );
      return;
    }

    const shares: DraftShare[] = participants
      .map((p) => ({
        userId: p.userId,
        guestName: p.userId ? null : p.label,
        label: p.label,
        amount: shareAmounts[p.key] ?? 0,
      }))
      .filter((s) => s.amount > 0);

    if (shares.length === 0) {
      setError('Nobody has an amount greater than $0 yet.');
      return;
    }

    setCreating(true);
    setError(null);
    try {
      await createBillSplit(userId, {
        title: effectiveTitle,
        merchant: merchant.trim() || null,
        totalAmount: total,
        occurredAt,
        items,
        shares,
      });
      // You fronted the full bill, but only YOUR slice is actually your
      // expense -- the rest is money you'll get back, not spending. What
      // people owe you is tracked separately via bill_split_shares.
      const yourShare = Math.max(0, total - shareTotal);
      if (yourShare > 0) {
        await addTransaction({
          userId,
          amount: yourShare,
          description: effectiveTitle,
          merchant: merchant.trim() || null,
          categoryId,
          occurredAt,
        });
      }
      setResult(
        participants
          .map((p) => ({ participant: p, amount: shareAmounts[p.key] ?? 0 }))
          .filter((r) => r.amount > 0),
      );
      onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create the split.');
    } finally {
      setCreating(false);
    }
  };

  const handleShareWithGuest = (participant: Participant, amount: number) => {
    Share.share({
      message: `You owe $${amount.toFixed(2)} for ${title.trim() || merchant.trim() || 'the bill'}${merchant.trim() ? ` at ${merchant.trim()}` : ''}. Let me know when you've paid me back!`,
    }).catch(() => {});
  };

  const handleClose = () => {
    setResult(null);
    onClose();
  };

  if (result) {
    return (
      <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
        <SafeAreaProvider>
          <View className="flex-1 bg-black/40 justify-end">
            <SafeAreaView className="bg-white dark:bg-tabby-900 rounded-t-2xl" edges={['bottom']}>
              <View className="p-4 gap-3">
                <Text className="font-fredoka-semibold text-xl dark:text-white">Split created</Text>
                <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
                  Each person below owes you their share. Guests have no Tabby account yet -- share the amount
                  with them directly.
                </Text>

                <View className="gap-2">
                  {result.map(({ participant, amount }) => (
                    <View
                      key={participant.key}
                      className="flex-row items-center justify-between rounded-xl px-3 py-2.5 bg-gray-50 dark:bg-tabby-800 border border-gray-100 dark:border-tabby-700"
                    >
                      <View className="flex-1">
                        <Text className="font-nunito-semibold dark:text-white">{participant.label}</Text>
                        {!participant.userId && (
                          <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">Guest</Text>
                        )}
                      </View>
                      <Text className="font-nunito-bold dark:text-white mr-2">${amount.toFixed(2)}</Text>
                      {!participant.userId && (
                        <Pressable
                          onPress={() => handleShareWithGuest(participant, amount)}
                          style={pressFeedback}
                          accessibilityRole="button"
                          accessibilityLabel={`Share with ${participant.label}`}
                          className="w-8 h-8 rounded-full bg-tabby-100 dark:bg-tabby-700 items-center justify-center"
                        >
                          <Feather name="share" size={14} color={isDark ? '#E8C39E' : '#8B5A2B'} />
                        </Pressable>
                      )}
                    </View>
                  ))}
                </View>

                <Pressable
                  onPress={handleClose}
                  style={pressFeedback}
                  className="bg-tabby-600 dark:bg-white rounded-lg py-3 items-center mt-1"
                  accessibilityRole="button"
                  accessibilityLabel="Done"
                >
                  <Text className="font-nunito-semibold text-white dark:text-tabby-900">Done</Text>
                </Pressable>
              </View>
            </SafeAreaView>
          </View>
        </SafeAreaProvider>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-white dark:bg-tabby-900">
          <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View className="flex-row items-center justify-between px-4 pt-3 pb-3 border-b border-gray-100 dark:border-tabby-700">
              <Text className="font-fredoka-semibold text-2xl dark:text-white">Split a Bill</Text>
              <Pressable
                onPress={handleClose}
                style={pressFeedback}
                accessibilityRole="button"
                accessibilityLabel="Close"
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-tabby-700 items-center justify-center"
              >
                <Feather name="x" size={16} color={isDark ? '#E8C39E' : '#374151'} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
              {error && (
                <View className="px-3 py-2 bg-red-50 dark:bg-red-950 rounded-lg">
                  <Text className="font-nunito text-red-600 dark:text-red-400 text-sm">{error}</Text>
                </View>
              )}

              {/* ---- Bill info ---- */}
              <View className="gap-2">
                <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300 text-xs tracking-wide">
                  THE BILL
                </Text>
                <Pressable
                  onPress={handleScan}
                  disabled={scanning}
                  style={pressFeedback}
                  accessibilityRole="button"
                  accessibilityLabel="Scan a receipt"
                  className="flex-row items-center justify-center gap-2 border border-dashed border-tabby-300 dark:border-tabby-600 rounded-xl py-3"
                >
                  {scanning ? (
                    <ActivityIndicator color={isDark ? '#E8C39E' : '#8B5A2B'} />
                  ) : (
                    <>
                      <Feather name="camera" size={16} color={isDark ? '#E8C39E' : '#8B5A2B'} />
                      <Text className="font-nunito-semibold text-tabby-600 dark:text-tabby-200">
                        Scan a receipt
                      </Text>
                    </>
                  )}
                </Pressable>

                <View className="flex-row gap-2">
                  <TextInput
                    value={title}
                    onChangeText={setTitle}
                    placeholder="Title (e.g. Dinner)"
                    className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2 flex-1 dark:text-white"
                  />
                  <TextInput
                    value={merchant}
                    onChangeText={setMerchant}
                    placeholder="Where? -- optional"
                    className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2 flex-1 dark:text-white"
                  />
                </View>

                <View className="flex-row items-center border border-gray-300 dark:border-tabby-600 rounded-lg px-3">
                  <Text className="font-nunito text-gray-500 dark:text-tabby-300">Total $</Text>
                  <TextInput
                    value={totalAmount}
                    onChangeText={(text) => {
                      setTotalAmount(text);
                      setItems([]); // manual total overrides any scanned items
                    }}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    className="font-nunito flex-1 py-2.5 px-2 dark:text-white"
                  />
                </View>

                {items.length > 0 && (
                  <View className="gap-1 pl-1">
                    {items.map((item, i) => (
                      <Text key={i} className="font-nunito text-xs text-gray-500 dark:text-tabby-300">
                        {item.description} -- ${item.amount.toFixed(2)}
                      </Text>
                    ))}
                  </View>
                )}

                <Pressable
                  onPress={() => setShowDatePicker(true)}
                  style={pressFeedback}
                  accessibilityRole="button"
                  accessibilityLabel="Date"
                  className="flex-row items-center justify-between border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2.5"
                >
                  <Text className="font-nunito text-gray-800 dark:text-white text-sm">
                    {occurredAt === todayISO
                      ? 'Today'
                      : new Date(`${occurredAt}T00:00:00`).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                  </Text>
                  <Feather name="calendar" size={16} color={isDark ? '#E8C39E' : '#9ca3af'} />
                </Pressable>

                {Platform.OS === 'ios' && showDatePicker && (
                  <View className="border border-gray-300 dark:border-tabby-600 rounded-lg p-2 gap-2">
                    <DateTimePicker
                      value={new Date(`${occurredAt}T00:00:00`)}
                      mode="date"
                      display="inline"
                      maximumDate={new Date()}
                      themeVariant={isDark ? 'dark' : 'light'}
                      onValueChange={(_, date) => date && setOccurredAt(toLocalISODate(date))}
                    />
                    <Pressable
                      onPress={() => setShowDatePicker(false)}
                      style={pressFeedback}
                      accessibilityRole="button"
                      accessibilityLabel="Done"
                      className="self-end px-3 py-1.5"
                    >
                      <Text className="font-nunito-semibold text-tabby-600 dark:text-white">Done</Text>
                    </Pressable>
                  </View>
                )}

                {showDatePicker && Platform.OS === 'android' && (
                  <DateTimePicker
                    value={new Date(`${occurredAt}T00:00:00`)}
                    mode="date"
                    display="default"
                    maximumDate={new Date()}
                    onValueChange={(_, date) => {
                      setShowDatePicker(false);
                      if (date) setOccurredAt(toLocalISODate(date));
                    }}
                    onDismiss={() => setShowDatePicker(false)}
                  />
                )}

                <Pressable
                  onPress={() => setShowCategoryPicker(true)}
                  style={pressFeedback}
                  accessibilityRole="button"
                  accessibilityLabel="Category"
                  className="flex-row items-center justify-between border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2.5"
                >
                  <View className="flex-row items-center gap-2">
                    {selectedCategory && (
                      <CategoryIcon
                        name={selectedCategory.icon}
                        size={14}
                        color={isDark ? '#E8C39E' : '#4b5563'}
                      />
                    )}
                    <Text className="font-nunito text-gray-800 dark:text-white text-sm">
                      {selectedCategory?.name ?? 'Category -- optional'}
                    </Text>
                  </View>
                  <Feather name="chevron-down" size={16} color={isDark ? '#E8C39E' : '#9ca3af'} />
                </Pressable>

                {showCategoryPicker && (
                  <View className="border border-gray-300 dark:border-tabby-600 rounded-lg p-2 gap-2">
                    <TextInput
                      value={categorySearch}
                      onChangeText={setCategorySearch}
                      placeholder="Search categories"
                      autoFocus
                      className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2 text-sm dark:text-white"
                    />
                    <View className="gap-0.5">
                      {filteredCategories.length === 0 && (
                        <Text className="font-nunito text-sm text-gray-500 dark:text-tabby-300 px-1 py-2">
                          No categories match.
                        </Text>
                      )}
                      {filteredCategories.map((cat) => (
                        <Pressable
                          key={cat.id}
                          onPress={() => {
                            setCategoryId(cat.id === categoryId ? null : cat.id);
                            setShowCategoryPicker(false);
                            setCategorySearch('');
                          }}
                          style={pressFeedback}
                          className="flex-row items-center gap-2.5 px-2 py-2 rounded-lg"
                        >
                          <CategoryIcon
                            name={cat.icon}
                            size={15}
                            color={
                              cat.id === categoryId
                                ? isDark
                                  ? '#E8C39E'
                                  : '#8B5A2B'
                                : isDark
                                  ? '#E8C39E'
                                  : '#4b5563'
                            }
                          />
                          <Text
                            className={`font-nunito-medium text-sm flex-1 ${
                              cat.id === categoryId
                                ? 'text-tabby-600 dark:text-tabby-100'
                                : 'text-gray-700 dark:text-tabby-200'
                            }`}
                          >
                            {cat.name}
                          </Text>
                          {cat.id === categoryId && (
                            <Feather name="check" size={16} color={isDark ? '#E8C39E' : '#8B5A2B'} />
                          )}
                        </Pressable>
                      ))}
                    </View>
                    <Pressable
                      onPress={() => {
                        setShowCategoryPicker(false);
                        setCategorySearch('');
                      }}
                      style={pressFeedback}
                      accessibilityRole="button"
                      accessibilityLabel="Done"
                      className="self-end px-3 py-1.5"
                    >
                      <Text className="font-nunito-semibold text-tabby-600 dark:text-white">Done</Text>
                    </Pressable>
                  </View>
                )}
              </View>

              {/* ---- People ---- */}
              <View className="gap-2">
                <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300 text-xs tracking-wide">
                  SPLIT WITH
                </Text>

                {participants.length > 0 && (
                  <View className="gap-1.5">
                    {participants.map((p) => (
                      <View
                        key={p.key}
                        className="flex-row items-center justify-between rounded-lg px-3 py-2 bg-gray-50 dark:bg-tabby-800"
                      >
                        <Text className="font-nunito-medium dark:text-white">
                          {p.label}{' '}
                          {!p.userId && (
                            <Text className="text-xs text-gray-500 dark:text-tabby-300">(guest)</Text>
                          )}
                        </Text>
                        <Pressable
                          onPress={() => removeParticipant(p.key)}
                          style={pressFeedback}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${p.label}`}
                        >
                          <Feather name="x" size={16} color="#9ca3af" />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}

                {flatMembers.length > 0 && (
                  <View className="flex-row flex-wrap gap-2">
                    {flatMembers
                      .filter((m) => !participants.some((p) => p.key === `user:${m.user_id}`))
                      .map((m) => (
                        <Pressable
                          key={m.user_id}
                          onPress={() =>
                            addParticipant({
                              key: `user:${m.user_id}`,
                              userId: m.user_id,
                              label: m.profiles?.display_name ?? 'Flatmate',
                            })
                          }
                          style={pressFeedback}
                          className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-300 dark:border-tabby-600"
                        >
                          <Feather name="plus" size={12} color={isDark ? '#E8C39E' : '#4b5563'} />
                          <Text className="font-nunito-medium text-sm text-gray-700 dark:text-tabby-200">
                            {m.profiles?.display_name ?? 'Flatmate'}
                          </Text>
                        </Pressable>
                      ))}
                  </View>
                )}

                <View className="flex-row gap-2">
                  <TextInput
                    value={emailInput}
                    onChangeText={setEmailInput}
                    placeholder="Add by email"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2 flex-1 text-sm dark:text-white"
                  />
                  <Pressable
                    onPress={handleAddByEmail}
                    disabled={addingByEmail || !emailInput.trim()}
                    style={pressFeedback}
                    accessibilityRole="button"
                    accessibilityLabel="Add by email"
                    className="px-3 items-center justify-center rounded-lg bg-gray-100 dark:bg-tabby-700"
                  >
                    {addingByEmail ? (
                      <ActivityIndicator size="small" color={isDark ? '#E8C39E' : '#374151'} />
                    ) : (
                      <Feather name="user-plus" size={16} color={isDark ? '#E8C39E' : '#374151'} />
                    )}
                  </Pressable>
                </View>

                <View className="flex-row gap-2">
                  <TextInput
                    value={guestName}
                    onChangeText={setGuestName}
                    placeholder="Add a guest by name"
                    className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2 flex-1 text-sm dark:text-white"
                  />
                  <Pressable
                    onPress={handleAddGuest}
                    disabled={!guestName.trim()}
                    style={pressFeedback}
                    accessibilityRole="button"
                    accessibilityLabel="Add guest"
                    className="px-3 items-center justify-center rounded-lg bg-gray-100 dark:bg-tabby-700"
                  >
                    <Feather name="plus" size={16} color={isDark ? '#E8C39E' : '#374151'} />
                  </Pressable>
                </View>
              </View>

              {/* ---- Split method ---- */}
              {participants.length > 0 && (
                <View className="gap-2">
                  <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300 text-xs tracking-wide">
                    SPLIT METHOD
                  </Text>
                  <View className="flex-row bg-gray-100 dark:bg-tabby-700 rounded-lg p-1">
                    {(['equal', 'custom', 'itemize'] as SplitMode[]).map((mode) => {
                      const disabled = mode === 'itemize' && items.length === 0;
                      return (
                        <Pressable
                          key={mode}
                          onPress={() => !disabled && setSplitMode(mode)}
                          disabled={disabled}
                          style={pressFeedback}
                          className={`flex-1 rounded-md py-1.5 items-center ${
                            splitMode === mode ? 'bg-white dark:bg-tabby-900' : ''
                          } ${disabled ? 'opacity-40' : ''}`}
                        >
                          <Text
                            className={`font-nunito-semibold text-sm capitalize ${
                              splitMode === mode
                                ? 'text-gray-900 dark:text-white'
                                : 'text-gray-500 dark:text-tabby-300'
                            }`}
                          >
                            {mode}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {splitMode === 'equal' && (
                    <View className="gap-1">
                      {participants.map((p) => (
                        <View key={p.key} className="flex-row justify-between py-1">
                          <Text className="font-nunito dark:text-tabby-200">{p.label}</Text>
                          <Text className="font-nunito-semibold dark:text-white">
                            ${(shareAmounts[p.key] ?? 0).toFixed(2)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {splitMode === 'custom' && (
                    <View className="gap-1.5">
                      {participants.map((p) => (
                        <View key={p.key} className="flex-row items-center justify-between gap-2">
                          <Text className="font-nunito dark:text-tabby-200 flex-1">{p.label}</Text>
                          <View className="flex-row items-center border border-gray-300 dark:border-tabby-600 rounded-lg px-2">
                            <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">$</Text>
                            <TextInput
                              value={customAmounts[p.key] ?? ''}
                              onChangeText={(text) =>
                                setCustomAmounts((prev) => ({
                                  ...prev,
                                  [p.key]: text,
                                }))
                              }
                              placeholder="0.00"
                              keyboardType="decimal-pad"
                              className="font-nunito w-16 py-1.5 text-sm text-right dark:text-white"
                            />
                          </View>
                        </View>
                      ))}
                      <Text
                        className={`font-nunito text-xs ${
                          Math.abs(shareTotal - total) < 0.01
                            ? 'text-gray-500 dark:text-tabby-300'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        ${shareTotal.toFixed(2)} of ${total.toFixed(2)} assigned
                      </Text>
                    </View>
                  )}

                  {splitMode === 'itemize' && (
                    <View className="gap-3">
                      {items.map((item, i) => (
                        <View key={i} className="gap-1.5">
                          <Text className="font-nunito-semibold text-sm dark:text-white">
                            {item.description} -- ${item.amount.toFixed(2)}
                          </Text>
                          <View className="flex-row flex-wrap gap-1.5">
                            {participants.map((p) => {
                              const selected = itemAssignments[i]?.has(p.key) ?? false;
                              return (
                                <Pressable
                                  key={p.key}
                                  onPress={() => toggleItemAssignment(i, p.key)}
                                  style={pressFeedback}
                                  className={`px-2.5 py-1 rounded-full border ${
                                    selected
                                      ? 'bg-tabby-600 dark:bg-white border-tabby-600 dark:border-white'
                                      : 'border-gray-300 dark:border-tabby-600'
                                  }`}
                                >
                                  <Text
                                    className={`font-nunito-medium text-xs ${
                                      selected
                                        ? 'text-white dark:text-tabby-900'
                                        : 'text-gray-600 dark:text-tabby-200'
                                    }`}
                                  >
                                    {p.label}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </ScrollView>

            <View className="p-4 border-t border-gray-100 dark:border-tabby-700">
              <Pressable
                onPress={handleCreate}
                disabled={creating}
                style={pressFeedback}
                className="bg-tabby-600 dark:bg-white rounded-lg py-3 items-center"
                accessibilityRole="button"
                accessibilityLabel="Create split"
              >
                {creating ? (
                  <ActivityIndicator color={isDark ? '#2B1810' : 'white'} />
                ) : (
                  <Text className="font-nunito-semibold text-white dark:text-tabby-900">Create Split</Text>
                )}
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
