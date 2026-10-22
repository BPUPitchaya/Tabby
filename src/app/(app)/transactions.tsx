import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SectionList,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  categorizeTransaction,
  categorizeTransactionsBatch,
  classifyFinancialQuestion,
  parseBillSplit,
  parseFinancialDocument,
  parseNaturalLanguageExpenses,
  parseSpendingQuery,
  suggestCategoryIcon,
  type ClassifiedFinancialQuestion,
  type ParsedBillSplit,
  type ParsedExpense,
} from '@/lib/ai';
import { CategoryIcon, CUSTOM_CATEGORY_ICONS, guessCategoryIcon } from '@/components/category-icon';
import { IncomeTransactionDetailModal } from '@/components/income-transaction-detail-modal';
import { TransactionDetailModal } from '@/components/transaction-detail-modal';
import { useAuth } from '@/lib/auth-context';
import { fetchBills, formatDueLabel, getRelevantBillDate } from '@/lib/bills';
import { parseTransactionsFromCSV, type ParsedCSVTransaction } from '@/lib/csv';
import { presentScanSheet } from '@/lib/document-scan';
import { computeBalances, fetchMyFlat } from '@/lib/flats';
import {
  fetchIncomeSources,
  getIncomeSourceProgress,
  getNextIncomeSourcePaydayDate,
  getPrimaryIncomeSource,
} from '@/lib/income-sources';
import { hashBase64, recordScan, wasRecentlyScanned } from '@/lib/receipt-dedup';
import { SplitBillModal } from '@/components/split-bill-modal';
import {
  addTransaction,
  bulkAddTransactions,
  createCategory,
  deleteTransaction,
  fetchCategories,
  fetchRecentMerchants,
  fetchTransactions,
  updateTransaction,
  type Category,
  type CategoryType,
  type Transaction,
} from '@/lib/transactions';

// Shared press-feedback style: a quick opacity dip on tap, applied via the
// style prop (not className) since it needs the live `pressed` state.
const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

// The Expense/Income toggle's selected-pill shadow, as a plain native
// style instead of NativeWind's `shadow-sm` class. A conditionally-applied
// `shadow-*` className hits a known race in NativeWind's CSS interop layer
// that throws "Couldn't find a navigation context" the first time the
// class is added (nativewind/nativewind#1536) -- native shadow props
// sidestep that code path entirely.
const SEGMENT_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.08,
  shadowRadius: 2,
  elevation: 1,
};

// Cheap local pre-filter for whether a quick-add message might describe
// splitting a bill -- see handleQuickAdd for why this gates a second AI
// call instead of asking Gemini to classify every message up front.
const SPLIT_HINT = /\bsplit\b|\beach\b|\bowes?\b|\bbetween\b|\bdivide/i;

// Same cheap-local-pre-filter idea, for whether a quick-add message is
// actually a QUESTION about personal finances -- spending, budget, bills,
// flat balances, or income -- rather than a transaction to log. Checked
// first, before the split-hint -- a question should never get mistaken
// for either a split or a plain expense statement.
const FINANCIAL_QUESTION_HINT =
  /^(how (much|many)|what did|did (i|we)|when (did|do|is)|am i|is my|are we|who owes|do i owe|does .* owe)\b|\?\s*$/i;

// Local calendar date, not UTC -- Date#toISOString() converts to UTC first,
// which can shift the date by a day in timezones behind/ahead of it (same
// footgun the toISODate helper in lib/profile.ts exists to avoid).
function toLocalISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Shared by the search screen's filters and the quick-add composer's
// spending-question answers -- both narrow the same transaction list by
// the same {category, keyword, date range} shape (lib/ai.ts's
// ParsedSpendingQuery), so the matching logic lives in one place.
function filterTransactionsByQuery(
  txs: Transaction[],
  query: { categoryId: string | null; keyword: string | null; startDate: string | null; endDate: string | null },
): Transaction[] {
  const needle = query.keyword?.trim().toLowerCase() ?? '';
  return txs.filter((tx) => {
    if (query.categoryId && tx.category_id !== query.categoryId) return false;
    if (query.startDate && tx.occurred_at < query.startDate) return false;
    if (query.endDate && tx.occurred_at > query.endDate) return false;
    if (!needle) return true;
    const haystack = `${tx.description ?? ''} ${tx.merchant ?? ''} ${tx.categories?.name ?? ''}`.toLowerCase();
    return haystack.includes(needle);
  });
}

// One answer builder per financial topic classifyFinancialQuestion can
// return -- each pulls whatever real data that topic needs and computes
// a single plain-language fact from it. Never an AI-invented figure: the
// AI's only job was picking the topic (and, for spending, the filter);
// every number here comes straight from the database.
async function buildFinancialAnswer(
  classified: ClassifiedFinancialQuestion,
  userId: string,
  txs: Transaction[],
  categories: Category[],
): Promise<string> {
  switch (classified.topic) {
    case 'spending': {
      const matches = filterTransactionsByQuery(txs, classified);
      const expenseTotal = matches.filter((tx) => !tx.is_income).reduce((sum, tx) => sum + tx.amount, 0);
      const incomeTotal = matches.filter((tx) => tx.is_income).reduce((sum, tx) => sum + tx.amount, 0);
      const parts: string[] = [];
      if (expenseTotal > 0) parts.push(`spent $${expenseTotal.toFixed(2)}`);
      if (incomeTotal > 0) parts.push(`earned $${incomeTotal.toFixed(2)}`);
      const scope = [
        classified.categoryId ? categories.find((c) => c.id === classified.categoryId)?.name : null,
        classified.keyword ? `"${classified.keyword}"` : null,
        classified.startDate && classified.endDate ? `${classified.startDate} to ${classified.endDate}` : null,
      ]
        .filter(Boolean)
        .join(' \u00b7 ');
      return parts.length === 0
        ? `No matching transactions found${scope ? ` (${scope})` : ''}.`
        : `You ${parts.join(' and ')}, across ${matches.length} transaction${matches.length === 1 ? '' : 's'}${scope ? ` (${scope})` : ''}.`;
    }

    case 'budget': {
      const progress = await getIncomeSourceProgress(userId);
      if (!progress) return "You haven't set a budget yet \u00b7 add one from Profile > Budget.";
      const pct = progress.budgetAmount > 0 ? Math.round((progress.spent / progress.budgetAmount) * 100) : 0;
      const over = progress.spent > progress.budgetAmount;
      return over
        ? `You're $${(progress.spent - progress.budgetAmount).toFixed(2)} over your $${progress.budgetAmount.toFixed(2)} budget this cycle (spent $${progress.spent.toFixed(2)}).`
        : `You've spent $${progress.spent.toFixed(2)} of your $${progress.budgetAmount.toFixed(2)} budget this cycle (${pct}% used, $${(progress.budgetAmount - progress.spent).toFixed(2)} left).`;
    }

    case 'bills': {
      const bills = await fetchBills(userId);
      if (bills.length === 0) return "You don't have any bills set up yet \u00b7 add one from Profile > Bills.";
      const needle = classified.keyword?.trim().toLowerCase() ?? '';
      const relevant = bills
        .filter((b) => !needle || b.name.toLowerCase().includes(needle))
        .map((b) => ({ bill: b, date: getRelevantBillDate(b) }))
        .filter((r): r is { bill: (typeof bills)[number]; date: string } => r.date !== null)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 3);
      if (relevant.length === 0) {
        return needle ? `No bill matching "${classified.keyword}" found.` : 'No upcoming bills.';
      }
      return (
        relevant
          .map(({ bill, date }) => `${bill.name}: ${formatDueLabel(date)}${bill.amount ? ` ($${bill.amount.toFixed(2)})` : ''}`)
          .join('; ') + '.'
      );
    }

    case 'flat': {
      const flat = await fetchMyFlat(userId);
      if (!flat) return "You're not part of a flat yet.";
      const balances = await computeBalances(flat.id, userId);
      const owedToYou = balances.filter((b) => b.netAmount > 0);
      const youOwe = balances.filter((b) => b.netAmount < 0);
      if (owedToYou.length === 0 && youOwe.length === 0) return "You're all settled up with your flat.";
      const parts: string[] = [];
      parts.push(
        owedToYou.length > 0
          ? owedToYou.map((b) => `${b.displayName} owes you $${b.netAmount.toFixed(2)}`).join(', ')
          : 'Nobody owes you anything',
      );
      parts.push(
        youOwe.length > 0
          ? youOwe.map((b) => `you owe ${b.displayName} $${Math.abs(b.netAmount).toFixed(2)}`).join(', ')
          : "you don't owe anyone",
      );
      return `${parts.join('; but ')}.`;
    }

    case 'income': {
      const sources = await fetchIncomeSources(userId);
      const primary = getPrimaryIncomeSource(sources);
      if (!primary) return "You haven't set up an income source yet \u00b7 add one from Profile > Income Sources.";
      const nextPayday = getNextIncomeSourcePaydayDate(primary);
      const rate =
        primary.mode === 'fixed'
          ? primary.amount !== null
            ? `$${primary.amount.toFixed(2)} per pay`
            : null
          : primary.hourlyRate !== null
            ? `$${primary.hourlyRate.toFixed(2)}/hr`
            : null;
      return `Your next payday is ${nextPayday ?? 'not set'}${rate ? ` (${rate})` : ''}.`;
    }

    case 'none':
    default:
      return "Couldn't match that to spending, budget, bills, flat, or income \u00b7 try rephrasing.";
  }
}

// Deterministic per-category icon tint, hashed from the category id so the
// same category always lands on the same color across sessions without a
// color column in the DB -- categories include user-created ones, not just
// the fixed defaults, so this can't be a hardcoded name lookup.
const CATEGORY_PALETTE_LIGHT = [
  { bg: '#D7E4CE', fg: '#3F5A35' },
  { bg: '#F3D9C2', fg: '#8A4A1E' },
  { bg: '#D6DFF2', fg: '#33467A' },
  { bg: '#E9D9EC', fg: '#5B3D63' },
  { bg: '#CFEAE9', fg: '#1F5B5A' },
  { bg: '#F0E3C2', fg: '#6B4F1C' },
];
const CATEGORY_PALETTE_DARK = [
  { bg: '#5B6B4F', fg: '#DCE8D4' },
  { bg: '#B8794A', fg: '#FCEBDB' },
  { bg: '#5E6E8C', fg: '#DCE3F2' },
  { bg: '#8A6E93', fg: '#EFE4F2' },
  { bg: '#4F8A8B', fg: '#D9F0EF' },
  { bg: '#A68A4F', fg: '#F2E7CF' },
];
function categoryTint(categoryId: string | null, isDark: boolean): { bg: string; fg: string } {
  if (!categoryId) return isDark ? { bg: '#4A3A2C', fg: '#C9BBAA' } : { bg: '#E5E0D8', fg: '#6B6256' };
  const palette = isDark ? CATEGORY_PALETTE_DARK : CATEGORY_PALETTE_LIGHT;
  let hash = 0;
  for (let i = 0; i < categoryId.length; i++) hash = (hash * 31 + categoryId.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

// "Today" / "Yesterday" / "Mon, Oct 5" -- same day-label convention as the
// dashboard's trend chart labels, just at day instead of week/month grain.
function dayLabel(dateStr: string, todayISO: string, yesterdayISO: string): string {
  if (dateStr === todayISO) return 'Today';
  if (dateStr === yesterdayISO) return 'Yesterday';
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

type DaySection = { title: string; net: number; data: Transaction[] };

// Groups already-sorted (occurred_at desc) transactions into day sections,
// each carrying its own net (income minus expense) for the section header.
function groupByDay(transactions: Transaction[], todayISO: string): DaySection[] {
  const yesterdayISO = toLocalISODate(new Date(Date.now() - 86_400_000));
  const sections: DaySection[] = [];
  const indexByDate = new Map<string, number>();

  for (const tx of transactions) {
    let index = indexByDate.get(tx.occurred_at);
    if (index === undefined) {
      index = sections.length;
      indexByDate.set(tx.occurred_at, index);
      sections.push({ title: dayLabel(tx.occurred_at, todayISO, yesterdayISO), net: 0, data: [] });
    }
    sections[index].data.push(tx);
    sections[index].net += tx.is_income ? tx.amount : -tx.amount;
  }

  return sections;
}

// Small round icon button used in the header -- Feather icon only, no label,
// consistent 40x40 tap target.
function HeaderIconButton({
  icon,
  onPress,
  label,
  tone = 'default',
}: {
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  label: string;
  tone?: 'default' | 'primary';
}) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  // The primary button's background flips brown<->white between light and
  // dark mode (see tailwind.config.js's `tabby` scale), so its icon has to
  // flip the opposite way or it disappears against its own background.
  const iconColor = tone === 'primary' ? (isDark ? '#2B1810' : '#fff') : isDark ? '#E8C39E' : '#374151';

  return (
    <Pressable
      onPress={onPress}
      style={pressFeedback}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`w-10 h-10 rounded-full items-center justify-center ${
        tone === 'primary' ? 'bg-tabby-600 dark:bg-white' : 'bg-gray-100 dark:bg-tabby-700'
      }`}
    >
      <Feather name={icon} size={18} color={iconColor} />
    </Pressable>
  );
}

// Shared row, used by the Activity list, search results, and category
// drill-ins -- one place to keep the colored icon + layout consistent.
// `showDate` is on for anything not already grouped under a day header
// (search results span multiple days with no header to carry that context).
function TransactionRow({
  item,
  showDate,
  onPress,
  onDelete,
}: {
  item: Transaction;
  showDate: boolean;
  onPress: () => void;
  onDelete: () => void;
}) {
  const isDark = useColorScheme() === 'dark';
  const tint = categoryTint(item.category_id, isDark);

  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <Pressable
        onPress={onPress}
        style={pressFeedback}
        accessibilityRole="button"
        accessibilityLabel={`Edit transaction ${item.description ?? ''}`}
        className="flex-row items-center justify-between rounded-2xl px-4 py-3 bg-gray-50 dark:bg-tabby-800 border border-gray-100 dark:border-tabby-700 mb-2"
      >
        <View className="flex-row items-center flex-1 gap-3">
          <View
            className="w-9 h-9 rounded-full items-center justify-center"
            style={{ backgroundColor: item.is_income ? (isDark ? '#1F3B2A' : '#DCFCE7') : tint.bg }}
          >
            <CategoryIcon
              name={item.categories?.icon}
              size={16}
              color={item.is_income ? '#15803d' : tint.fg}
            />
          </View>
          <View className="flex-1">
            <Text className="font-nunito-semibold dark:text-white">
              {item.description || item.categories?.name || 'Transaction'}
            </Text>
            <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
              {item.categories?.name ?? 'Uncategorized'}
              {item.merchant ? ` · ${item.merchant}` : ''}
              {showDate ? ` · ${item.occurred_at}` : ''}
            </Text>
          </View>
        </View>
        <Text
          className={`font-nunito-bold mr-3 ${
            item.is_income ? 'text-green-700 dark:text-green-400' : 'dark:text-white'
          }`}
        >
          {item.is_income ? '+' : '-'}${item.amount.toFixed(2)}
        </Text>
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          style={pressFeedback}
          accessibilityRole="button"
          accessibilityLabel={`Delete transaction ${item.description ?? ''}`}
        >
          <Feather name="trash-2" size={16} color="#ef4444" />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

export default function TransactionsScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const isDark = useColorScheme() === 'dark';
  // Only used to decide whether the AI preview's date caption is worth
  // showing -- "Jul 10" matters, today's own date repeated on every row
  // doesn't.
  const todayISO = new Date().toISOString().slice(0, 10);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Manual add/edit now lives in its own bottom-sheet modal, triggered by
  // the "+" button or by tapping an existing transaction -- rather than a
  // permanently-visible form taking up the top of the screen.
  const [manualOpen, setManualOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [merchant, setMerchant] = useState('');
  const [recentMerchants, setRecentMerchants] = useState<string[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [transactionType, setTransactionType] = useState<CategoryType>('expense');
  const [occurredAt, setOccurredAt] = useState(todayISO);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [categorySource, setCategorySource] = useState<'manual' | 'ai' | null>(null);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState(CUSTOM_CATEGORY_ICONS[0]);
  // A ref, not state -- handleSuggestCategoryIcon reads this after an
  // await, where a captured state value would be stale if the user tapped
  // an icon while the AI call was still in flight.
  const newCategoryIconTouchedRef = useRef(false);
  const [newCategoryBusy, setNewCategoryBusy] = useState(false);
  const [newCategoryError, setNewCategoryError] = useState<string | null>(null);

  // The chat-style composer pinned to the bottom of the screen -- type a
  // sentence, AI extracts one or more expenses from it.
  const [quickAddText, setQuickAddText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  // Separate from aiBusy (shared with the manual-form auto-categorize and
  // CSV flows elsewhere) so this status line only ever shows for the
  // composer's own calls (quick-add text, receipt/statement scan) -- the
  // Gemini round trip here runs 3-10s+ with real variance, and a bare
  // spinner reads as "stuck" past a couple seconds without a reason why.
  const [composerThinking, setComposerThinking] = useState(false);
  // A plain-language answer to a spending question typed into the
  // composer ("how much did I spend on coffee last month") -- shown in
  // the same slot composerThinking occupies while busy, cleared the next
  // time the composer is used for anything else.
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);

  const [csvPreview, setCsvPreview] = useState<ParsedCSVTransaction[] | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);

  const [aiPreview, setAiPreview] = useState<ParsedExpense[] | null>(null);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitDraft, setSplitDraft] = useState<ParsedBillSplit | null>(null);
  const [aiImporting, setAiImporting] = useState(false);
  // Which preview row is expanded for editing, and whether that row's
  // category picker is open -- only one row/picker open at a time, closed
  // whenever the preview list itself is replaced or dismissed.
  const [expandedAiIndex, setExpandedAiIndex] = useState<number | null>(null);
  const [aiCategoryPickerOpen, setAiCategoryPickerOpen] = useState(false);
  const [aiCategorySearch, setAiCategorySearch] = useState('');

  // Activity (date-grouped) vs By Category (totals grid) -- search overlays
  // either tab rather than being a third tab, since it's a transient
  // "narrow what I'm looking at" mode, not a destination of its own.
  const [activeTab, setActiveTab] = useState<'activity' | 'category'>('activity');
  const [searchActive, setSearchActive] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchCategoryId, setSearchCategoryId] = useState<string | null>(null);
  const [searchRange, setSearchRange] = useState<'today' | 'week' | 'month' | 'all'>('all');
  // Set only by a submitted AI question whose answer implies a specific
  // window ("last month", "in September") -- overrides the preset pills
  // above, which only ever express an open-ended "since X" range. Cleared
  // by picking a preset manually, so the two controls never fight.
  const [aiDateRange, setAiDateRange] = useState<{ start: string; end: string } | null>(null);
  const [askingAI, setAskingAI] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setError(null);
      const [tx, expenseCats, incomeCats, merchants] = await Promise.all([
        fetchTransactions(userId),
        fetchCategories('expense'),
        fetchCategories('income'),
        fetchRecentMerchants(userId),
      ]);
      const cats = [...expenseCats, ...incomeCats];
      setTransactions(tx);
      setCategories(cats);
      setRecentMerchants(merchants);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transactions.');
    }
  }, [userId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const resetForm = () => {
    setAmount('');
    setDescription('');
    setMerchant('');
    setCategoryId(null);
    setCategorySource(null);
    setEditingId(null);
    setTransactionType('expense');
    setOccurredAt(todayISO);
    setShowNewCategory(false);
    setNewCategoryName('');
    setNewCategoryIcon(CUSTOM_CATEGORY_ICONS[0]);
    newCategoryIconTouchedRef.current = false;
    setNewCategoryError(null);
  };

  // Suggests an icon from the typed name -- a local keyword guess first
  // (instant, covers most common names), AI only as a fallback when
  // nothing matches, so this isn't a network round trip every time. Only
  // while the user hasn't manually picked one themselves, so it never
  // overrides an explicit choice (checked both before and after the AI
  // call, since the user could tap an icon while it's in flight).
  const handleSuggestCategoryIcon = async () => {
    if (!newCategoryName.trim() || newCategoryIconTouchedRef.current) return;

    const guessed = guessCategoryIcon(newCategoryName);
    if (guessed) {
      setNewCategoryIcon(guessed);
      return;
    }

    const suggested = await suggestCategoryIcon(newCategoryName, CUSTOM_CATEGORY_ICONS);
    if (suggested && !newCategoryIconTouchedRef.current) {
      setNewCategoryIcon(suggested as (typeof CUSTOM_CATEGORY_ICONS)[number]);
    }
  };

  const handleCreateCategory = async () => {
    if (!userId || !newCategoryName.trim()) return;
    setNewCategoryBusy(true);
    setNewCategoryError(null);
    try {
      const created = await createCategory(userId, newCategoryName, newCategoryIcon, transactionType);
      setCategories((prev) => [...prev, created]);
      setCategoryId(created.id);
      setCategorySource('manual');
      setShowNewCategory(false);
      setNewCategoryName('');
      setNewCategoryIcon(CUSTOM_CATEGORY_ICONS[0]);
      newCategoryIconTouchedRef.current = false;
    } catch (err) {
      setNewCategoryError(err instanceof Error ? err.message : 'Failed to create category.');
    } finally {
      setNewCategoryBusy(false);
    }
  };

  const openManualAdd = () => {
    resetForm();
    setError(null);
    setManualOpen(true);
  };

  const closeManualForm = () => {
    setManualOpen(false);
    resetForm();
  };

  const handleSelectType = (type: CategoryType) => {
    setTransactionType(type);
    // a category chosen under the old type won't be valid for the new one
    setCategoryId(null);
    setCategorySource(null);
  };

  const handleDescriptionBlur = async () => {
    // Only auto-suggest if the user hasn't picked (or we haven't already
    // AI-suggested) a category -- never override a manual choice.
    if (!description.trim() || categorySource === 'manual' || categories.length === 0) return;

    setAiBusy(true);
    try {
      const suggestedId = await categorizeTransaction(description, categories);
      if (suggestedId) {
        setCategoryId(suggestedId);
        setCategorySource('ai');
      }
    } finally {
      setAiBusy(false);
    }
  };

  const handleQuickAdd = async () => {
    if (!quickAddText.trim()) return;
    setAiBusy(true);
    setComposerThinking(true);
    setError(null);
    setAiAnswer(null);
    try {
      // A question about personal finances ("how much did I spend on
      // coffee last month", "am I over budget", "when is rent due", "who
      // owes me money", "when do I get paid next") isn't a transaction to
      // log -- answer it directly instead of running it through the
      // expense extractor, which would correctly find nothing to add and
      // show a misleading "AI unavailable" message for what's actually a
      // successful AI call.
      if (FINANCIAL_QUESTION_HINT.test(quickAddText.trim())) {
        const classified = await classifyFinancialQuestion(quickAddText, categories);
        if (!classified) {
          setError("Couldn't understand that question. Try rephrasing, or use the search icon above.");
          return;
        }
        if (classified.topic !== 'none') {
          if (!userId) return;
          const answer = await buildFinancialAnswer(classified, userId, transactions, categories);
          setAiAnswer(answer);
          setQuickAddText('');
          return;
        }
        // Classified as not actually one of the known topics -- fall
        // through below and try parsing it as an ordinary expense instead,
        // in case the hint just caught an oddly-phrased statement.
      }

      // Cheap local pre-filter before spending a second AI call -- only
      // texts that plausibly describe a group split (keyword hit + any
      // number, not necessarily a "$") go through parseBillSplit at all,
      // so an ordinary "coffee $8.50" never pays for the extra round trip.
      if (SPLIT_HINT.test(quickAddText) && /\d/.test(quickAddText)) {
        const split = await parseBillSplit(
          quickAddText,
          categories.filter((c) => c.type === 'expense'),
        );
        if (split) {
          setSplitDraft(split);
          setShowSplitModal(true);
          setQuickAddText('');
          return;
        }
      }

      const parsed = await parseNaturalLanguageExpenses(quickAddText, categories);
      if (!parsed) {
        setError('AI is briefly unavailable. Try again in a moment, or use the + button below.');
        return;
      }
      setAiPreview(parsed);
      setExpandedAiIndex(null);
      setAiCategoryPickerOpen(false);
      setAiCategorySearch('');
    } finally {
      setAiBusy(false);
      setComposerThinking(false);
    }
  };

  const handleConfirmAIAdd = async () => {
    if (!userId || !aiPreview) return;
    setAiImporting(true);
    try {
      await bulkAddTransactions(
        userId,
        aiPreview.map((p) => ({
          amount: p.amount,
          description: p.description,
          merchant: p.merchant,
          occurredAt: p.occurredAt,
          isIncome: p.isIncome,
          // Matched by type too, not just name -- an expense and income
          // category could share a name, and only one of them is valid
          // for this row (same rule the manual Expense/Income toggle uses).
          categoryId:
            categories.find(
              (c) => c.name === p.categoryName && c.type === (p.isIncome ? 'income' : 'expense'),
            )?.id ?? null,
        })),
      );
      setAiPreview(null);
      setQuickAddText('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add transactions.');
    } finally {
      setAiImporting(false);
    }
  };

  // AI's first guess isn't always right -- these let the user correct the
  // amount, description, or category right in the preview before anything
  // is actually saved, instead of an all-or-nothing Confirm/Cancel.
  const updateAiPreviewItem = (index: number, patch: Partial<ParsedExpense>) => {
    setAiPreview((prev) =>
      prev ? prev.map((item, i) => (i === index ? { ...item, ...patch } : item)) : prev,
    );
  };

  const removeAiPreviewItem = (index: number) => {
    setAiPreview((prev) => {
      if (!prev) return prev;
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : null;
    });
    setExpandedAiIndex((prev) => (prev === index ? null : prev && prev > index ? prev - 1 : prev));
    setAiCategoryPickerOpen(false);
    setAiCategorySearch('');
  };

  const handlePickCSV = async () => {
    setError(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', '.csv'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0]) return;

    try {
      const file = new File(result.assets[0].uri);
      const text = await file.text();
      const parsed = parseTransactionsFromCSV(text);
      if (parsed.length === 0) {
        setError(
          "Couldn't find any transactions in that file. Make sure it has a header row with a Date and Amount column.",
        );
        return;
      }

      setCsvPreview(parsed);

      // One batched call per type (expense/income), not one per row -- an
      // import can be a few hundred transactions. Best-effort: the preview
      // is already showing with no categories, and fills in as soon as this
      // resolves rather than blocking on it.
      setAiBusy(true);
      try {
        const expenseCategories = categories.filter((c) => c.type === 'expense');
        const incomeCategories = categories.filter((c) => c.type === 'income');
        const expenseRows = parsed.flatMap((t, i) => (t.isIncome ? [] : [i]));
        const incomeRows = parsed.flatMap((t, i) => (t.isIncome ? [i] : []));

        const [expenseIds, incomeIds] = await Promise.all([
          categorizeTransactionsBatch(
            expenseRows.map((i) => parsed[i].description),
            expenseCategories,
          ),
          categorizeTransactionsBatch(
            incomeRows.map((i) => parsed[i].description),
            incomeCategories,
          ),
        ]);

        const withCategories = [...parsed];
        expenseRows.forEach((origIndex, j) => {
          withCategories[origIndex] = { ...withCategories[origIndex], categoryId: expenseIds[j] };
        });
        incomeRows.forEach((origIndex, j) => {
          withCategories[origIndex] = { ...withCategories[origIndex], categoryId: incomeIds[j] };
        });
        setCsvPreview(withCategories);
      } finally {
        setAiBusy(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read that file.');
    }
  };

  const runScan = async (scanned: { base64Data: string; mimeType: string }) => {
    setAiBusy(true);
    setComposerThinking(true);
    try {
      const parsed = await parseFinancialDocument(scanned.base64Data, scanned.mimeType, categories);
      if (!parsed) {
        setError("Couldn't find any transactions in that. Try a clearer photo, or add it manually.");
        return;
      }
      await recordScan(hashBase64(scanned.base64Data));
      setAiPreview(parsed);
      setExpandedAiIndex(null);
      setAiCategoryPickerOpen(false);
      setAiCategorySearch('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read that file.');
    } finally {
      setAiBusy(false);
      setComposerThinking(false);
    }
  };

  const handleScanReceipt = async () => {
    setError(null);
    try {
      const scanned = await presentScanSheet();
      if (!scanned) return;

      // Catches re-scanning the same photo by accident -- not a duplicate
      // *purchase* check (see lib/receipt-dedup.ts for why that's a
      // different, harder problem this deliberately doesn't try to solve).
      const hash = hashBase64(scanned.base64Data);
      if (await wasRecentlyScanned(hash)) {
        Alert.alert(
          'Scanned recently',
          'This looks like a receipt you already scanned in the last couple of days. Import it again anyway?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Import Anyway', onPress: () => runScan(scanned) },
          ],
        );
        return;
      }

      await runScan(scanned);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read that file.');
    }
  };

  const handleConfirmCSVImport = async () => {
    if (!userId || !csvPreview) return;
    setCsvImporting(true);
    try {
      await bulkAddTransactions(userId, csvPreview);
      setCsvPreview(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import transactions.');
    } finally {
      setCsvImporting(false);
    }
  };

  const handleStartEdit = (item: Transaction) => {
    setEditingId(item.id);
    setAmount(String(item.amount));
    setDescription(item.description ?? '');
    setMerchant(item.merchant ?? '');
    setCategoryId(item.category_id);
    setCategorySource(item.category_id ? 'manual' : null);
    setTransactionType(item.is_income ? 'income' : 'expense');
    setOccurredAt(item.occurred_at);
    setError(null);
    setManualOpen(true);
  };

  // Every transaction now opens an overview first, edit form second -- a
  // tap is usually "what was this again", not "I need to change it". A
  // transaction logged via an income source's bell confirm carries a
  // payslip-style breakdown (income_source_id set) and gets the dedicated
  // income detail screen instead of the plain overview, since it has
  // gross/tax/ACC/KiwiSaver to show that an ordinary transaction doesn't.
  const [viewingIncomeDetail, setViewingIncomeDetail] = useState<Transaction | null>(null);
  const [viewingDetail, setViewingDetail] = useState<Transaction | null>(null);
  const handleItemPress = (item: Transaction) => {
    if (item.income_source_id !== null) {
      setViewingIncomeDetail(item);
      return;
    }
    setViewingDetail(item);
  };

  const handleSubmit = async () => {
    if (!userId) return;
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Enter a valid amount.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const isIncome = transactionType === 'income';
      if (editingId) {
        await updateTransaction(editingId, {
          amount: parsedAmount,
          description,
          merchant,
          categoryId,
          occurredAt,
          isIncome,
        });
      } else {
        await addTransaction({
          userId,
          amount: parsedAmount,
          description,
          merchant,
          categoryId,
          occurredAt,
          isIncome,
        });
      }
      setManualOpen(false);
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save transaction.');
    } finally {
      setSubmitting(false);
    }
  };

  // Confirmed first -- deleting used to fire straight from the row's trash
  // icon (or the edit form's own delete button) with no way back if it was
  // a mis-tap. Both call sites go through this one function, so the
  // confirm only needs adding here.
  const handleDelete = (id: string) => {
    Alert.alert('Delete this transaction?', "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTransaction(id);
            setTransactions((prev) => prev.filter((t) => t.id !== id));
            if (editingId === id) closeManualForm();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete transaction.');
          }
        },
      },
    ]);
  };

  const daySections = useMemo(() => groupByDay(transactions, todayISO), [transactions, todayISO]);

  // Expense-only, same convention as the dashboard's "Spending by category"
  // -- every expense category shows up even with zero activity (dashed,
  // dimmed), rather than only the ones with transactions, so the grid
  // doesn't reshuffle as spending starts/stops in a category.
  const categoryTiles = useMemo(() => {
    const totals = new Map<string, { total: number; count: number }>();
    for (const tx of transactions) {
      if (tx.is_income || !tx.category_id) continue;
      const entry = totals.get(tx.category_id) ?? { total: 0, count: 0 };
      entry.total += tx.amount;
      entry.count += 1;
      totals.set(tx.category_id, entry);
    }
    return categories
      .filter((c) => c.type === 'expense')
      .map((c) => ({ category: c, total: totals.get(c.id)?.total ?? 0, count: totals.get(c.id)?.count ?? 0 }))
      .sort((a, b) => b.total - a.total);
  }, [transactions, categories]);

  const searchResults = useMemo(() => {
    if (!searchActive) return [];
    const rangeStart = aiDateRange
      ? aiDateRange.start
      : searchRange === 'today'
        ? todayISO
        : searchRange === 'week'
          ? toLocalISODate(new Date(Date.now() - 6 * 86_400_000))
          : searchRange === 'month'
            ? toLocalISODate(new Date(Date.now() - 29 * 86_400_000))
            : null;
    const rangeEnd = aiDateRange ? aiDateRange.end : null;

    return filterTransactionsByQuery(transactions, {
      categoryId: searchCategoryId,
      keyword: searchText.trim() || null,
      startDate: rangeStart,
      endDate: rangeEnd,
    });
  }, [transactions, searchActive, searchText, searchCategoryId, searchRange, aiDateRange]);

  // Expense/income totals for whatever's currently filtered -- answers
  // "how much did I spend on X" directly instead of making the user add
  // up a results list by hand. Plain sums over already-filtered rows,
  // never an AI-generated figure.
  const searchExpenseTotal = useMemo(
    () => searchResults.filter((tx) => !tx.is_income).reduce((sum, tx) => sum + tx.amount, 0),
    [searchResults],
  );
  const searchIncomeTotal = useMemo(
    () => searchResults.filter((tx) => tx.is_income).reduce((sum, tx) => sum + tx.amount, 0),
    [searchResults],
  );

  const handleAskAI = async () => {
    const query = searchText.trim();
    if (!query || askingAI) return;
    setAskingAI(true);
    try {
      const parsed = await parseSpendingQuery(query, categories);
      if (!parsed) return; // fall back to the plain substring search already running
      setSearchCategoryId(parsed.categoryId);
      setSearchText(parsed.keyword ?? '');
      if (parsed.startDate && parsed.endDate) {
        setAiDateRange({ start: parsed.startDate, end: parsed.endDate });
      } else {
        setAiDateRange(null);
      }
    } finally {
      setAskingAI(false);
    }
  };

  const openSearch = (categoryId: string | null) => {
    setSearchCategoryId(categoryId);
    setSearchText('');
    setAiDateRange(null);
    setSearchRange('all');
    setSearchActive(true);
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white dark:bg-tabby-900">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-tabby-900">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <View className="flex-row items-center justify-between px-4 pt-3 pb-3 border-b border-gray-100 dark:border-tabby-700">
          <Text className="font-fredoka-semibold text-2xl dark:text-white">Transactions</Text>
          <View className="flex-row gap-2">
            <HeaderIconButton
              icon="users"
              onPress={() => {
                setSplitDraft(null);
                setShowSplitModal(true);
              }}
              label="Split a bill"
            />
            <HeaderIconButton icon="upload" onPress={handlePickCSV} label="Import CSV" />
            <HeaderIconButton icon="plus" onPress={openManualAdd} label="Add transaction" tone="primary" />
          </View>
        </View>

        {error && (
          <View className="px-4 py-2 bg-red-50 dark:bg-red-950 border-b border-red-100 dark:border-red-800">
            <Text className="font-nunito text-red-600 dark:text-red-400 text-sm">{error}</Text>
          </View>
        )}

        {searchActive ? (
          <>
            {/* Search header -- replaces the tabs/search-bar row while active. */}
            <View className="flex-row items-center gap-2 px-4 pt-3 pb-3">
              <View className="flex-1 h-11 rounded-xl bg-gray-100 dark:bg-tabby-800 border border-tabby-600 dark:border-tabby-200 flex-row items-center px-3 gap-2">
                <Feather name="search" size={15} color={isDark ? '#E8C39E' : '#8B5A2B'} />
                <TextInput
                  value={searchText}
                  onChangeText={setSearchText}
                  onSubmitEditing={handleAskAI}
                  returnKeyType="search"
                  placeholder="Search, or ask a question"
                  autoFocus
                  className="font-nunito flex-1 text-sm dark:text-white"
                />
                {askingAI && <ActivityIndicator size="small" color={isDark ? '#E8C39E' : '#8B5A2B'} />}
              </View>
              <Pressable
                onPress={() => setSearchActive(false)}
                style={pressFeedback}
                accessibilityRole="button"
                accessibilityLabel="Cancel search"
              >
                <Text className="font-nunito-semibold text-tabby-600 dark:text-tabby-200">Cancel</Text>
              </Pressable>
            </View>

            <View className="px-4 pb-2 gap-2">
              <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300 text-xs tracking-wide">
                Category
              </Text>
              <View className="flex-row flex-wrap gap-2">
                <Pressable
                  onPress={() => setSearchCategoryId(null)}
                  style={pressFeedback}
                  className={`px-3 py-1.5 rounded-full border ${
                    searchCategoryId === null
                      ? 'bg-tabby-600 dark:bg-white border-tabby-600 dark:border-white'
                      : 'border-gray-300 dark:border-tabby-600'
                  }`}
                >
                  <Text
                    className={`font-nunito-medium text-sm ${
                      searchCategoryId === null
                        ? 'text-white dark:text-tabby-900'
                        : 'text-gray-600 dark:text-tabby-200'
                    }`}
                  >
                    All
                  </Text>
                </Pressable>
                {categories.map((cat) => (
                  <Pressable
                    key={cat.id}
                    onPress={() => setSearchCategoryId(cat.id === searchCategoryId ? null : cat.id)}
                    style={pressFeedback}
                    className={`px-3 py-1.5 rounded-full border ${
                      searchCategoryId === cat.id
                        ? 'bg-tabby-600 dark:bg-white border-tabby-600 dark:border-white'
                        : 'border-gray-300 dark:border-tabby-600'
                    }`}
                  >
                    <Text
                      className={`font-nunito-medium text-sm ${
                        searchCategoryId === cat.id
                          ? 'text-white dark:text-tabby-900'
                          : 'text-gray-600 dark:text-tabby-200'
                      }`}
                    >
                      {cat.name}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300 text-xs tracking-wide pt-1">
                Date
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {(
                  [
                    ['today', 'Today'],
                    ['week', 'This week'],
                    ['month', 'This month'],
                    ['all', 'All time'],
                  ] as const
                ).map(([value, label]) => (
                  <Pressable
                    key={value}
                    onPress={() => {
                      setSearchRange(value);
                      setAiDateRange(null);
                    }}
                    style={pressFeedback}
                    className={`px-3 py-1.5 rounded-full border ${
                      !aiDateRange && searchRange === value
                        ? 'bg-tabby-600 dark:bg-white border-tabby-600 dark:border-white'
                        : 'border-gray-300 dark:border-tabby-600'
                    }`}
                  >
                    <Text
                      className={`font-nunito-medium text-sm ${
                        !aiDateRange && searchRange === value
                          ? 'text-white dark:text-tabby-900'
                          : 'text-gray-600 dark:text-tabby-200'
                      }`}
                    >
                      {label}
                    </Text>
                  </Pressable>
                ))}
                {aiDateRange && (
                  <View className="px-3 py-1.5 rounded-full bg-tabby-600 dark:bg-white flex-row items-center gap-1.5">
                    <Feather name="zap" size={11} color={isDark ? '#2B1810' : 'white'} />
                    <Text className="font-nunito-medium text-sm text-white dark:text-tabby-900">
                      {aiDateRange.start} to {aiDateRange.end}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            <View className="px-4 pb-2 gap-0.5">
              <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-xs">
                {searchResults.length} result{searchResults.length === 1 ? '' : 's'}
              </Text>
              {(searchExpenseTotal > 0 || searchIncomeTotal > 0) && (
                <Text className="font-nunito-semibold text-sm text-gray-700 dark:text-tabby-100">
                  {searchExpenseTotal > 0 && `Spent $${searchExpenseTotal.toFixed(2)}`}
                  {searchExpenseTotal > 0 && searchIncomeTotal > 0 && ' · '}
                  {searchIncomeTotal > 0 && `Earned $${searchIncomeTotal.toFixed(2)}`}
                </Text>
              )}
            </View>

            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 16, paddingTop: 0, flexGrow: 1 }}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View className="flex-1 items-center justify-center py-16">
                  <Text className="font-nunito text-center text-gray-500 dark:text-tabby-300">
                    No matching transactions.
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <TransactionRow
                  item={item}
                  showDate
                  onPress={() => handleItemPress(item)}
                  onDelete={() => handleDelete(item.id)}
                />
              )}
            />
          </>
        ) : (
          <>
            {/* Tabs */}
            <View className="flex-row gap-1.5 mx-4 mt-3 mb-2 p-1 bg-gray-100 dark:bg-tabby-800 rounded-xl">
              <Pressable
                onPress={() => setActiveTab('activity')}
                style={(state) => [pressFeedback(state), activeTab === 'activity' && SEGMENT_SHADOW]}
                className={`flex-1 rounded-lg py-2 items-center ${activeTab === 'activity' ? 'bg-white dark:bg-tabby-900' : ''}`}
              >
                <Text
                  className={`font-nunito-semibold text-sm ${
                    activeTab === 'activity'
                      ? 'text-gray-900 dark:text-white'
                      : 'text-gray-500 dark:text-tabby-300'
                  }`}
                >
                  Activity
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setActiveTab('category')}
                style={(state) => [pressFeedback(state), activeTab === 'category' && SEGMENT_SHADOW]}
                className={`flex-1 rounded-lg py-2 items-center ${activeTab === 'category' ? 'bg-white dark:bg-tabby-900' : ''}`}
              >
                <Text
                  className={`font-nunito-semibold text-sm ${
                    activeTab === 'category'
                      ? 'text-gray-900 dark:text-white'
                      : 'text-gray-500 dark:text-tabby-300'
                  }`}
                >
                  By Category
                </Text>
              </Pressable>
            </View>

            {/* Search bar -- tap to open filters */}
            <Pressable
              onPress={() => openSearch(null)}
              style={pressFeedback}
              accessibilityRole="button"
              accessibilityLabel="Search transactions"
              className="flex-row items-center gap-2 mx-4 mb-2 h-11 rounded-xl bg-gray-100 dark:bg-tabby-800 border border-gray-200 dark:border-tabby-700 px-3"
            >
              <Feather name="search" size={15} color={isDark ? '#C98A52' : '#9ca3af'} />
              <Text className="font-nunito text-sm text-gray-400 dark:text-tabby-400">
                Search transactions
              </Text>
            </Pressable>

            {activeTab === 'activity' ? (
              <SectionList
                sections={daySections}
                keyExtractor={(item) => item.id}
                stickySectionHeadersEnabled
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                contentContainerStyle={{ padding: 16, paddingTop: 0, flexGrow: 1 }}
                ListEmptyComponent={
                  <View className="flex-1 items-center justify-center gap-3 py-16">
                    <View className="w-14 h-14 rounded-full bg-gray-100 dark:bg-tabby-700 items-center justify-center">
                      <Feather name="file-text" size={22} color="#9ca3af" />
                    </View>
                    <Text className="font-nunito text-center text-gray-500 dark:text-tabby-300">
                      No transactions yet.{'\n'}Type one below, or tap + to add one manually.
                    </Text>
                  </View>
                }
                renderSectionHeader={({ section }) => (
                  <View className="flex-row items-baseline justify-between bg-white dark:bg-tabby-900 pt-3 pb-2">
                    <Text className="font-fredoka-semibold text-sm dark:text-white">{section.title}</Text>
                    <Text
                      className={`font-nunito-semibold text-xs ${
                        section.net >= 0
                          ? 'text-green-700 dark:text-green-400'
                          : 'text-gray-500 dark:text-tabby-300'
                      }`}
                    >
                      {section.net >= 0 ? '+' : '-'}${Math.abs(section.net).toFixed(2)}
                    </Text>
                  </View>
                )}
                renderItem={({ item }) => (
                  <TransactionRow
                    item={item}
                    showDate={false}
                    onPress={() => handleItemPress(item)}
                    onDelete={() => handleDelete(item.id)}
                  />
                )}
              />
            ) : (
              <FlatList
                data={categoryTiles}
                keyExtractor={({ category }) => category.id}
                numColumns={2}
                columnWrapperStyle={{ gap: 12 }}
                contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 12, flexGrow: 1 }}
                ListEmptyComponent={
                  <View className="flex-1 items-center justify-center py-16">
                    <Text className="font-nunito text-center text-gray-500 dark:text-tabby-300">
                      No expense categories yet.
                    </Text>
                  </View>
                }
                renderItem={({ item }) => {
                  const tint = categoryTint(item.category.id, isDark);
                  const hasActivity = item.count > 0;
                  return (
                    <Pressable
                      onPress={() => openSearch(item.category.id)}
                      style={pressFeedback}
                      className={`flex-1 rounded-2xl p-4 bg-gray-50 dark:bg-tabby-800 border ${
                        hasActivity
                          ? 'border-gray-100 dark:border-tabby-700'
                          : 'border-dashed border-gray-200 dark:border-tabby-700 opacity-60'
                      }`}
                    >
                      <View
                        className="w-8 h-8 rounded-full items-center justify-center mb-2.5"
                        style={{ backgroundColor: tint.bg }}
                      >
                        <CategoryIcon name={item.category.icon} size={14} color={tint.fg} />
                      </View>
                      <Text className="font-nunito-semibold text-sm dark:text-tabby-200">
                        {item.category.name}
                      </Text>
                      <Text className="font-fredoka-semibold text-lg dark:text-white pt-0.5">
                        ${item.total.toFixed(2)}
                      </Text>
                      <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">
                        {hasActivity
                          ? `${item.count} transaction${item.count === 1 ? '' : 's'}`
                          : 'No activity'}
                      </Text>
                    </Pressable>
                  );
                }}
              />
            )}

            {composerThinking && (
              <Animated.View
                entering={FadeIn.duration(150)}
                exiting={FadeOut.duration(150)}
                className="flex-row items-center gap-2 px-4 py-2 border-t border-gray-100 dark:border-tabby-700 bg-tabby-50 dark:bg-tabby-800"
              >
                <ActivityIndicator size="small" color={isDark ? '#E8C39E' : '#8B5A2B'} />
                <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">
                  Reading that -- usually just a few seconds
                </Text>
              </Animated.View>
            )}

            {!composerThinking && aiAnswer && (
              <Animated.View
                entering={FadeIn.duration(150)}
                exiting={FadeOut.duration(150)}
                className="flex-row items-start gap-2 px-4 py-2.5 border-t border-gray-100 dark:border-tabby-700 bg-sage-50 dark:bg-sage-900/40"
              >
                <Feather
                  name="message-circle"
                  size={14}
                  color={isDark ? '#86BD63' : '#4C7535'}
                  style={{ marginTop: 1 }}
                />
                <Text className="font-nunito text-xs text-sage-800 dark:text-sage-300 flex-1">{aiAnswer}</Text>
              </Animated.View>
            )}

            {/* Chat-style composer, pinned to the bottom of the screen. */}
            <View className="flex-row items-end gap-2 px-3 py-2.5 border-t border-gray-100 dark:border-tabby-700 bg-white dark:bg-tabby-900">
              <Pressable
                onPress={handleScanReceipt}
                disabled={aiBusy}
                style={pressFeedback}
                accessibilityRole="button"
                accessibilityLabel="Scan a receipt or statement"
                className="w-10 h-10 rounded-full items-center justify-center bg-gray-100 dark:bg-tabby-700"
              >
                <Feather name="camera" size={18} color={isDark ? '#E8C39E' : '#4b5563'} />
              </Pressable>
              <TextInput
                value={quickAddText}
                onChangeText={(text) => {
                  setQuickAddText(text);
                  if (aiAnswer) setAiAnswer(null);
                }}
                placeholder='Try "coffee $8.50" or "how much on coffee last month?"'
                multiline
                className="font-nunito flex-1 bg-gray-100 dark:bg-tabby-700 rounded-2xl px-4 py-2.5 max-h-28 text-base dark:text-white"
              />
              <Pressable
                onPress={handleQuickAdd}
                disabled={aiBusy || !quickAddText.trim()}
                style={pressFeedback}
                accessibilityRole="button"
                accessibilityLabel="Send"
                className={`w-10 h-10 rounded-full items-center justify-center ${
                  quickAddText.trim() ? 'bg-tabby-600 dark:bg-white' : 'bg-gray-200 dark:bg-tabby-700'
                }`}
              >
                {aiBusy ? (
                  <ActivityIndicator color={isDark ? '#2B1810' : 'white'} size="small" />
                ) : (
                  <Feather
                    name="arrow-up"
                    size={18}
                    color={quickAddText.trim() ? (isDark ? '#2B1810' : '#fff') : '#9ca3af'}
                  />
                )}
              </Pressable>
            </View>
          </>
        )}
      </KeyboardAvoidingView>

      {/* Manual add/edit -- opened via the + button or by tapping a transaction. */}
      <Modal visible={manualOpen} animationType="slide" transparent onRequestClose={closeManualForm}>
        <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View className="flex-1 bg-black/40 justify-end">
            <View className="bg-white dark:bg-tabby-900 rounded-t-2xl p-4 gap-3">
              <View className="flex-row items-center justify-between">
                <Text className="font-fredoka-semibold text-xl dark:text-white">
                  {editingId ? 'Edit Transaction' : 'Add Transaction'}
                </Text>
                <Pressable
                  onPress={closeManualForm}
                  style={pressFeedback}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  className="w-8 h-8 rounded-full bg-gray-100 dark:bg-tabby-700 items-center justify-center"
                >
                  <Feather name="x" size={16} color={isDark ? '#E8C39E' : '#374151'} />
                </Pressable>
              </View>

              <View className="flex-row bg-gray-100 dark:bg-tabby-700 rounded-lg p-1">
                <Pressable
                  onPress={() => handleSelectType('expense')}
                  style={(state) => [pressFeedback(state), transactionType === 'expense' && SEGMENT_SHADOW]}
                  accessibilityRole="button"
                  accessibilityLabel="Expense"
                  className={`flex-1 rounded-md py-1.5 items-center ${
                    transactionType === 'expense' ? 'bg-white dark:bg-tabby-900' : ''
                  }`}
                >
                  <Text
                    className={`font-nunito-semibold text-sm ${
                      transactionType === 'expense'
                        ? 'text-gray-900 dark:text-white'
                        : 'text-gray-500 dark:text-tabby-300'
                    }`}
                  >
                    Expense
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => handleSelectType('income')}
                  style={(state) => [pressFeedback(state), transactionType === 'income' && SEGMENT_SHADOW]}
                  accessibilityRole="button"
                  accessibilityLabel="Income"
                  className={`flex-1 rounded-md py-1.5 items-center ${
                    transactionType === 'income' ? 'bg-white dark:bg-tabby-900' : ''
                  }`}
                >
                  <Text
                    className={`font-nunito-semibold text-sm ${
                      transactionType === 'income'
                        ? 'text-green-700 dark:text-green-400'
                        : 'text-gray-500 dark:text-tabby-300'
                    }`}
                  >
                    Income
                  </Text>
                </Pressable>
              </View>

              <View className="flex-row gap-2">
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="Amount"
                  keyboardType="decimal-pad"
                  className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2 flex-1 dark:text-white"
                />
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  onBlur={handleDescriptionBlur}
                  placeholder="Description"
                  className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2 flex-[2] dark:text-white"
                />
              </View>

              <TextInput
                value={merchant}
                onChangeText={setMerchant}
                placeholder="Where? (optional, e.g. Pak'nSave)"
                className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2 dark:text-white"
              />

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
                    onValueChange={(_, date) => setOccurredAt(toLocalISODate(date))}
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

              {recentMerchants.length > 0 && (
                <View className="flex-row flex-wrap gap-2">
                  {recentMerchants.map((m) => (
                    <Pressable
                      key={m}
                      onPress={() => setMerchant(m === merchant ? '' : m)}
                      style={pressFeedback}
                      className={`px-3 py-1 rounded-full border ${
                        merchant === m
                          ? 'bg-gray-800 dark:bg-tabby-700 border-gray-800 dark:border-tabby-700'
                          : 'border-gray-300 dark:border-tabby-600'
                      }`}
                    >
                      <Text
                        className={`font-nunito ${merchant === m ? 'text-white text-xs' : 'text-gray-600 dark:text-tabby-200 text-xs'}`}
                      >
                        {m}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <View className="flex-row flex-wrap gap-2 items-center">
                {categories
                  .filter((cat) => cat.type === transactionType)
                  .map((cat) => (
                    <Pressable
                      key={cat.id}
                      onPress={() => {
                        setCategoryId(cat.id === categoryId ? null : cat.id);
                        setCategorySource(cat.id === categoryId ? null : 'manual');
                      }}
                      style={pressFeedback}
                      className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border ${
                        categoryId === cat.id
                          ? 'bg-tabby-600 dark:bg-white border-tabby-600 dark:border-white'
                          : 'border-gray-300 dark:border-tabby-600'
                      }`}
                    >
                      <CategoryIcon
                        name={cat.icon}
                        size={13}
                        color={
                          categoryId === cat.id
                            ? isDark
                              ? '#2B1810'
                              : '#fff'
                            : isDark
                              ? '#E8C39E'
                              : '#4b5563'
                        }
                      />
                      <Text
                        className={`font-nunito-medium ${
                          categoryId === cat.id
                            ? 'text-white dark:text-tabby-900 text-sm'
                            : 'text-gray-700 dark:text-tabby-200 text-sm'
                        }`}
                      >
                        {cat.name}
                      </Text>
                    </Pressable>
                  ))}
                <Pressable
                  onPress={() => setShowNewCategory((v) => !v)}
                  style={pressFeedback}
                  className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border border-dashed border-gray-300 dark:border-tabby-600"
                >
                  <Feather name="plus" size={13} color={isDark ? '#E8C39E' : '#4b5563'} />
                  <Text className="font-nunito-medium text-gray-700 dark:text-tabby-200 text-sm">New</Text>
                </Pressable>
                {categorySource === 'ai' && (
                  <Text className="font-nunito text-xs text-tabby-500 dark:text-tabby-200">AI suggested</Text>
                )}
              </View>

              {showNewCategory && (
                <View className="border border-gray-300 dark:border-tabby-600 rounded-lg p-3 gap-2.5">
                  <TextInput
                    value={newCategoryName}
                    onChangeText={setNewCategoryName}
                    onBlur={handleSuggestCategoryIcon}
                    placeholder="Category name"
                    autoFocus
                    className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2 text-sm dark:text-white"
                  />
                  <View className="flex-row flex-wrap gap-2">
                    {CUSTOM_CATEGORY_ICONS.map((icon) => (
                      <Pressable
                        key={icon}
                        onPress={() => {
                          newCategoryIconTouchedRef.current = true;
                          setNewCategoryIcon(icon);
                        }}
                        style={pressFeedback}
                        className={`w-9 h-9 rounded-full items-center justify-center border ${
                          newCategoryIcon === icon
                            ? 'bg-tabby-600 dark:bg-white border-tabby-600 dark:border-white'
                            : 'border-gray-300 dark:border-tabby-600'
                        }`}
                      >
                        <CategoryIcon
                          name={icon}
                          size={15}
                          color={
                            newCategoryIcon === icon
                              ? isDark
                                ? '#2B1810'
                                : '#fff'
                              : isDark
                                ? '#E8C39E'
                                : '#4b5563'
                          }
                        />
                      </Pressable>
                    ))}
                  </View>
                  {newCategoryError && (
                    <Text className="font-nunito text-xs text-red-500">{newCategoryError}</Text>
                  )}
                  <Pressable
                    onPress={handleCreateCategory}
                    disabled={newCategoryBusy || !newCategoryName.trim()}
                    style={pressFeedback}
                    className="self-start bg-tabby-600 dark:bg-white rounded-lg px-4 py-2"
                  >
                    {newCategoryBusy ? (
                      <ActivityIndicator size="small" color={isDark ? '#2B1810' : 'white'} />
                    ) : (
                      <Text className="font-nunito-semibold text-sm text-white dark:text-tabby-900">
                        Create category
                      </Text>
                    )}
                  </Pressable>
                </View>
              )}

              <View className="flex-row gap-2 pt-1">
                <Pressable
                  onPress={handleSubmit}
                  disabled={submitting}
                  style={pressFeedback}
                  className="flex-1 bg-tabby-600 dark:bg-white rounded-lg py-3 items-center"
                  accessibilityRole="button"
                  accessibilityLabel={editingId ? 'Save changes' : 'Add transaction'}
                >
                  {submitting ? (
                    <ActivityIndicator color={isDark ? '#2B1810' : 'white'} />
                  ) : (
                    <Text className="font-nunito-semibold text-white dark:text-tabby-900">
                      {editingId ? 'Save Changes' : 'Add Transaction'}
                    </Text>
                  )}
                </Pressable>

                {editingId && (
                  <Pressable
                    onPress={() => {
                      handleDelete(editingId);
                    }}
                    style={pressFeedback}
                    className="px-4 py-3 items-center justify-center rounded-lg bg-red-50 dark:bg-red-950"
                    accessibilityRole="button"
                    accessibilityLabel="Delete transaction"
                  >
                    <Feather name="trash-2" size={18} color="#ef4444" />
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Android shows its own native dialog with no wrapper needed --
          rendering the picker at all is what triggers it, and it unmounts
          itself via onValueChange/onDismiss below. iOS's picker renders
          inline inside the manual-add sheet above instead of a second
          Modal -- stacking two RN Modals on iOS silently fails to present
          the top one. */}
      {showDatePicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={new Date(`${occurredAt}T00:00:00`)}
          mode="date"
          display="default"
          maximumDate={new Date()}
          onValueChange={(_, date) => {
            setShowDatePicker(false);
            setOccurredAt(toLocalISODate(date));
          }}
          onDismiss={() => setShowDatePicker(false)}
        />
      )}

      <Modal visible={csvPreview !== null} animationType="slide" transparent>
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-white dark:bg-tabby-900 rounded-t-2xl p-4 gap-3 h-[80%]">
            <Text className="font-fredoka-semibold text-xl dark:text-white">
              Import {csvPreview?.length ?? 0} transaction{csvPreview?.length === 1 ? '' : 's'}?
            </Text>
            <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
              Net: $
              {csvPreview?.reduce((sum, t) => sum + (t.isIncome ? t.amount : -t.amount), 0).toFixed(2) ??
                '0.00'}
              .{' '}
              {aiBusy
                ? 'Suggesting categories...'
                : 'Categories suggested where possible. Edit any row afterwards to change one.'}
            </Text>

            <FlatList
              data={csvPreview ?? []}
              keyExtractor={(_, i) => String(i)}
              style={{ flex: 1 }}
              renderItem={({ item }) => {
                const suggestedCategory = categories.find((c) => c.id === item.categoryId);
                return (
                  <View className="flex-row justify-between py-2 border-b border-gray-100 dark:border-tabby-700">
                    <View className="flex-1">
                      <Text className="font-nunito text-sm dark:text-tabby-200">
                        {item.description || '(no description)'}
                      </Text>
                      <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">
                        {item.isIncome ? 'Income' : 'Expense'} · {item.occurredAt}
                        {suggestedCategory ? ` · ${suggestedCategory.name}` : ''}
                      </Text>
                    </View>
                    <Text
                      className={`font-nunito-semibold text-sm ${
                        item.isIncome ? 'text-green-700 dark:text-green-400' : 'dark:text-white'
                      }`}
                    >
                      {item.isIncome ? '+' : '-'}${item.amount.toFixed(2)}
                    </Text>
                  </View>
                );
              }}
            />

            <View className="flex-row gap-2 pt-2">
              <Pressable
                onPress={handleConfirmCSVImport}
                disabled={csvImporting}
                style={pressFeedback}
                className="flex-1 bg-tabby-600 dark:bg-white rounded-lg py-3 items-center"
                accessibilityRole="button"
                accessibilityLabel="Confirm import"
              >
                {csvImporting ? (
                  <ActivityIndicator color={isDark ? '#2B1810' : 'white'} />
                ) : (
                  <Text className="font-nunito-semibold text-white dark:text-tabby-900">Import</Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => setCsvPreview(null)}
                disabled={csvImporting}
                style={pressFeedback}
                className="px-4 py-3 items-center justify-center"
                accessibilityRole="button"
                accessibilityLabel="Cancel import"
              >
                <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300">Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={aiPreview !== null} animationType="slide" transparent>
        <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View className="flex-1 bg-black/40 justify-end">
            <View className="bg-white dark:bg-tabby-900 rounded-t-2xl p-4 gap-3 h-[85%]">
              <View>
                <Text className="font-fredoka-semibold text-xl dark:text-white">
                  Add {aiPreview?.length ?? 0} transaction{aiPreview?.length === 1 ? '' : 's'}?
                </Text>
                <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
                  AI&apos;s first guess. Tap anything below to fix it before adding.
                </Text>
              </View>

              <FlatList
                data={aiPreview ?? []}
                keyExtractor={(_, i) => String(i)}
                style={{ flex: 1 }}
                contentContainerStyle={{ gap: 10 }}
                renderItem={({ item, index }) => {
                  const isExpanded = expandedAiIndex === index;
                  const matchedCategory = categories.find(
                    (c) => c.name === item.categoryName && c.type === (item.isIncome ? 'income' : 'expense'),
                  );
                  const tint = categoryTint(matchedCategory?.id ?? null, isDark);
                  const filteredCategories = categories.filter(
                    (c) =>
                      c.type === (item.isIncome ? 'income' : 'expense') &&
                      c.name.toLowerCase().includes(aiCategorySearch.toLowerCase()),
                  );

                  return (
                    <View className="gap-1.5">
                      {/* Collapsed row -- same look as the Activity list's
                          TransactionRow, so the preview reads like the
                          transactions it's about to become. Tap to edit
                          instead of every field sitting open at once. */}
                      <Pressable
                        onPress={() => {
                          setExpandedAiIndex(isExpanded ? null : index);
                          setAiCategoryPickerOpen(false);
                          setAiCategorySearch('');
                        }}
                        style={pressFeedback}
                        accessibilityRole="button"
                        accessibilityLabel={`Edit ${item.description || 'transaction'}`}
                        className="flex-row items-center justify-between rounded-2xl px-4 py-3 bg-gray-50 dark:bg-tabby-800 border border-gray-100 dark:border-tabby-700"
                      >
                        <View className="flex-row items-center flex-1 gap-3">
                          <View
                            className="w-9 h-9 rounded-full items-center justify-center"
                            style={{ backgroundColor: item.isIncome ? (isDark ? '#1F3B2A' : '#DCFCE7') : tint.bg }}
                          >
                            <CategoryIcon
                              name={matchedCategory?.icon}
                              size={16}
                              color={item.isIncome ? '#15803d' : tint.fg}
                            />
                          </View>
                          <View className="flex-1">
                            <Text className="font-nunito-semibold dark:text-white" numberOfLines={1}>
                              {item.description || 'Transaction'}
                            </Text>
                            <Text
                              className="font-nunito text-gray-500 dark:text-tabby-300 text-sm"
                              numberOfLines={1}
                            >
                              {item.categoryName ?? 'Uncategorized'}
                              {item.merchant ? ` · ${item.merchant}` : ''}
                              {item.occurredAt !== todayISO
                                ? ` · ${new Date(`${item.occurredAt}T00:00:00`).toLocaleDateString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                  })}`
                                : ''}
                            </Text>
                          </View>
                        </View>
                        <Text
                          className={`font-nunito-bold mr-2 ${
                            item.isIncome ? 'text-green-700 dark:text-green-400' : 'dark:text-white'
                          }`}
                        >
                          {item.isIncome ? '+' : '-'}${item.amount.toFixed(2)}
                        </Text>
                        <Pressable
                          onPress={(e) => {
                            e.stopPropagation();
                            removeAiPreviewItem(index);
                          }}
                          style={pressFeedback}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${item.description}`}
                          className="mr-1"
                        >
                          <Feather name="x" size={16} color="#9ca3af" />
                        </Pressable>
                        <Feather
                          name={isExpanded ? 'chevron-up' : 'chevron-down'}
                          size={16}
                          color={isDark ? '#E8C39E' : '#9ca3af'}
                        />
                      </Pressable>

                      {isExpanded && (
                        <View className="gap-2 px-4 py-3 rounded-2xl bg-gray-50 dark:bg-tabby-800 border border-gray-100 dark:border-tabby-700">
                          <View className="flex-row items-center gap-2">
                            <TextInput
                              value={item.description}
                              onChangeText={(text) => updateAiPreviewItem(index, { description: text })}
                              placeholder="Description"
                              className="font-nunito flex-1 border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2 text-sm dark:text-white"
                            />
                            <View className="flex-row items-center border border-gray-300 dark:border-tabby-600 rounded-lg px-2">
                              <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">$</Text>
                              <TextInput
                                value={String(item.amount)}
                                onChangeText={(text) =>
                                  updateAiPreviewItem(index, { amount: parseFloat(text) || 0 })
                                }
                                keyboardType="decimal-pad"
                                className="font-nunito w-16 py-2 text-sm text-right dark:text-white"
                              />
                            </View>
                          </View>

                          {/* The AI's expense/income guess, same as
                              everything else in this preview -- wrong often
                              enough (any "got paid", "refund", "sold
                              my...") that it needs to be correctable, not
                              just displayed. */}
                          <View className="flex-row bg-gray-100 dark:bg-tabby-700 rounded-lg p-1 self-start">
                            <Pressable
                              onPress={() => {
                                updateAiPreviewItem(index, { isIncome: false, categoryName: null });
                                setAiCategoryPickerOpen(false);
                                setAiCategorySearch('');
                              }}
                              style={pressFeedback}
                              className={`rounded-md px-3 py-1 ${!item.isIncome ? 'bg-white dark:bg-tabby-900' : ''}`}
                            >
                              <Text
                                className={`font-nunito-semibold text-xs ${
                                  !item.isIncome
                                    ? 'text-gray-900 dark:text-white'
                                    : 'text-gray-500 dark:text-tabby-300'
                                }`}
                              >
                                Expense
                              </Text>
                            </Pressable>
                            <Pressable
                              onPress={() => {
                                updateAiPreviewItem(index, { isIncome: true, categoryName: null });
                                setAiCategoryPickerOpen(false);
                                setAiCategorySearch('');
                              }}
                              style={pressFeedback}
                              className={`rounded-md px-3 py-1 ${item.isIncome ? 'bg-white dark:bg-tabby-900' : ''}`}
                            >
                              <Text
                                className={`font-nunito-semibold text-xs ${
                                  item.isIncome
                                    ? 'text-green-700 dark:text-green-400'
                                    : 'text-gray-500 dark:text-tabby-300'
                                }`}
                              >
                                Income
                              </Text>
                            </Pressable>
                          </View>

                          <Pressable
                            onPress={() => setAiCategoryPickerOpen((open) => !open)}
                            style={pressFeedback}
                            accessibilityRole="button"
                            accessibilityLabel="Category"
                            className="flex-row items-center justify-between border border-gray-300 dark:border-tabby-600 rounded-lg px-3 py-2.5"
                          >
                            <View className="flex-row items-center gap-2">
                              {matchedCategory && (
                                <CategoryIcon
                                  name={matchedCategory.icon}
                                  size={14}
                                  color={isDark ? '#E8C39E' : '#4b5563'}
                                />
                              )}
                              <Text className="font-nunito text-gray-800 dark:text-white text-sm">
                                {item.categoryName ?? 'Uncategorized'}
                              </Text>
                            </View>
                            <Feather
                              name="chevron-down"
                              size={16}
                              color={isDark ? '#E8C39E' : '#9ca3af'}
                            />
                          </Pressable>

                          {aiCategoryPickerOpen && (
                            <View className="border border-gray-300 dark:border-tabby-600 rounded-lg p-2 gap-2">
                              <TextInput
                                value={aiCategorySearch}
                                onChangeText={setAiCategorySearch}
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
                                      updateAiPreviewItem(index, {
                                        categoryName: item.categoryName === cat.name ? null : cat.name,
                                      });
                                      setAiCategoryPickerOpen(false);
                                      setAiCategorySearch('');
                                    }}
                                    style={pressFeedback}
                                    className="flex-row items-center gap-2.5 px-2 py-2 rounded-lg"
                                  >
                                    <CategoryIcon
                                      name={cat.icon}
                                      size={15}
                                      color={
                                        cat.name === item.categoryName
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
                                        cat.name === item.categoryName
                                          ? 'text-tabby-600 dark:text-tabby-100'
                                          : 'text-gray-700 dark:text-tabby-200'
                                      }`}
                                    >
                                      {cat.name}
                                    </Text>
                                    {cat.name === item.categoryName && (
                                      <Feather name="check" size={16} color={isDark ? '#E8C39E' : '#8B5A2B'} />
                                    )}
                                  </Pressable>
                                ))}
                              </View>
                              <Pressable
                                onPress={() => {
                                  setAiCategoryPickerOpen(false);
                                  setAiCategorySearch('');
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

                          <Pressable
                            onPress={() => setExpandedAiIndex(null)}
                            style={pressFeedback}
                            accessibilityRole="button"
                            accessibilityLabel="Done editing"
                            className="self-end px-3 py-1.5"
                          >
                            <Text className="font-nunito-semibold text-tabby-600 dark:text-white">Done</Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  );
                }}
              />

              <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
                Net:{' '}
                {(aiPreview?.reduce((sum, t) => sum + (t.isIncome ? t.amount : -t.amount), 0) ?? 0) < 0
                  ? '-'
                  : '+'}
                $
                {Math.abs(
                  aiPreview?.reduce((sum, t) => sum + (t.isIncome ? t.amount : -t.amount), 0) ?? 0,
                ).toFixed(2)}
              </Text>

              <View className="flex-row gap-2 pt-1">
                <Pressable
                  onPress={handleConfirmAIAdd}
                  disabled={aiImporting || !aiPreview?.every((p) => p.amount > 0)}
                  style={pressFeedback}
                  className={`flex-1 rounded-lg py-3 items-center ${
                    aiPreview?.every((p) => p.amount > 0)
                      ? 'bg-tabby-600 dark:bg-white'
                      : 'bg-gray-300 dark:bg-tabby-700'
                  }`}
                  accessibilityRole="button"
                  accessibilityLabel="Confirm add"
                >
                  {aiImporting ? (
                    <ActivityIndicator color={isDark ? '#2B1810' : 'white'} />
                  ) : (
                    <Text
                      className={`font-nunito-semibold text-white ${
                        aiPreview?.every((p) => p.amount > 0) ? 'dark:text-tabby-900' : ''
                      }`}
                    >
                      Confirm
                    </Text>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => {
                    setAiPreview(null);
                    setExpandedAiIndex(null);
                    setAiCategoryPickerOpen(false);
                    setAiCategorySearch('');
                  }}
                  disabled={aiImporting}
                  style={pressFeedback}
                  className="px-4 py-3 items-center justify-center"
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                >
                  <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300">Cancel</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <SplitBillModal
        visible={showSplitModal}
        onClose={() => {
          setShowSplitModal(false);
          setSplitDraft(null);
        }}
        onCreated={load}
        draft={splitDraft}
      />

      <IncomeTransactionDetailModal
        visible={viewingIncomeDetail !== null}
        onClose={() => setViewingIncomeDetail(null)}
        transaction={viewingIncomeDetail}
        onSaved={load}
        onEditOtherFields={(item) => {
          setViewingIncomeDetail(null);
          handleStartEdit(item);
        }}
      />

      <TransactionDetailModal
        visible={viewingDetail !== null}
        onClose={() => setViewingDetail(null)}
        transaction={viewingDetail}
        categories={categories}
        onSaved={load}
        onDelete={(id) => {
          setViewingDetail(null);
          handleDelete(id);
        }}
      />
    </SafeAreaView>
  );
}
