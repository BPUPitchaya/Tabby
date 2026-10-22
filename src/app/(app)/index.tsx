import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { generateMonthlySummary } from '@/lib/ai';
import {
  fetchMyProposedShares,
  fetchMyReminders,
  markReminded,
  fetchOwedToMe,
  isOverdue,
  confirmSharePaidByOwer,
  confirmSharePaidByPayee,
  respondToShare,
  type MyBillSplitShare,
  type OwedToMeShare,
} from '@/lib/bill-splits';
import { BudgetModal } from '@/components/budget-modal';
import { CategoryIcon } from '@/components/category-icon';
import { IncomeSourcesModal } from '@/components/income-sources-modal';
import { NotificationsModal } from '@/components/notifications-modal';
import { moodFromPct, TabbyMascot } from '@/components/tabby-mascot';
import { useAuth } from '@/lib/auth-context';
import {
  cancelBillFollowUp,
  requestBillNotificationPermission,
  scheduleBillFollowUp,
  scheduleBillReminder,
} from '@/lib/bill-notifications';
import {
  confirmBillPayment,
  fetchBills,
  formatDueLabel,
  getNextBillDueDate,
  getPendingBillDue,
  getRelevantBillDate,
  skipBillPayment,
  type Bill,
} from '@/lib/bills';
import { BillsModal } from '@/components/bills-modal';
import { loadDashboardPeriodPreference } from '@/lib/dashboard-period-preference';
import {
  fetchDashboardData,
  findNotableCategorySwing,
  type DashboardData,
  type DashboardPeriod,
} from '@/lib/dashboard';
import { fetchIncomingRequests, respondToFriendRequest, type FriendRequest } from '@/lib/friendships';
import {
  cancelIncomeSourceFollowUp,
  requestIncomeSourceNotificationPermission,
  scheduleIncomeSourceFollowUp,
  scheduleIncomeSourceReminder,
} from '@/lib/income-source-notifications';
import {
  confirmIncomeSourcePayment,
  fetchIncomeSources,
  getIncomeSourceCycle,
  getIncomeSourceProgress,
  getNextIncomeSourcePaydayDate,
  getPendingIncomeSourcePayday,
  getPrimaryIncomeSource,
  skipIncomeSourcePayment,
  type IncomeBreakdown,
  type IncomeSource,
  type IncomeSourceProgress,
} from '@/lib/income-sources';
import { loadTrendPeriodPreference, type TrendPeriodPreference } from '@/lib/trend-period-preference';
import {
  fetchMyPaymentDetails,
  fetchProfile,
  getOverspendPrediction,
  type AnimalKey,
  type IncomeFrequency,
} from '@/lib/profile';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.6 } : undefined);

// Earned, Spent, and Budget used to be three separate cards (two filled
// twins plus a bordered progress card below them) -- one row with dividers
// instead of edges reads as one glance instead of three things to scan.
// Budget stays its own cell rather than folding into Spent: Spent is
// recorded fact, Budget is a figure the user sets separately from what
// they earn, and blending them would make "what happened" and "what you
// intend" indistinguishable. Earned is tappable too, into Income Sources
// (not literally "edit Earned" -- Earned stays a record of actual income
// transactions either way) -- the modal's own copy says plainly that it
// won't change this figure, since a first pass without that line read as
// a bug ("I set my earnings and Earned still shows $0.00"). Phase 2 of the
// income-sources plan retired the old single-job Pay Schedule screen from
// this call site in favor of the new multi-job one -- see
// income-sources-modal.tsx.
const FREQUENCY_LABELS: Record<IncomeFrequency, string> = {
  weekly: 'Weekly',
  biweekly: 'Fortnightly',
  monthly: 'Monthly',
};

// Lowercase noun form for "This ___" phrasing (hero label, Earned/Spent
// captions) -- distinct from FREQUENCY_LABELS, which is for Budget's own
// standalone caption.
const PERIOD_NOUNS: Record<IncomeFrequency, string> = {
  weekly: 'week',
  biweekly: 'fortnight',
  monthly: 'month',
};

function MoneyFlowRow({
  earned,
  spent,
  progress,
  periodLabel,
  onPressEarned,
  onPressBudget,
}: {
  earned: number;
  spent: number;
  progress: IncomeSourceProgress | null;
  periodLabel: string;
  onPressEarned: () => void;
  onPressBudget: () => void;
}) {
  const pct =
    progress && progress.budgetAmount > 0 ? Math.round((progress.spent / progress.budgetAmount) * 100) : null;
  const over = pct !== null && pct >= 100;
  // Pacing to clear budget by cycle end, even though not over yet -- a
  // quieter amber cue here, not new text in this already-tight cell. The
  // actual "on pace to go $X over" line lives on the Budget screen itself,
  // where there's room to say it (see budget-modal.tsx).
  const pacingOver = !over && progress ? getOverspendPrediction(progress) !== null : false;
  const barColor = over
    ? 'bg-rust-500 dark:bg-rust-400'
    : pacingOver
      ? 'bg-amber-500 dark:bg-amber-400'
      : pct !== null && pct >= 80
        ? 'bg-tabby-400'
        : 'bg-tabby-600 dark:bg-white';

  return (
    <View className="flex-row border border-tabby-100 dark:border-tabby-700 rounded-2xl overflow-hidden">
      <Pressable
        onPress={onPressEarned}
        style={pressFeedback}
        accessibilityRole="button"
        accessibilityLabel="Manage income sources"
        className="flex-1 p-3.5 gap-1"
      >
        <Text className="font-nunito-semibold text-sage-700 dark:text-sage-400 text-xs">Earned</Text>
        <Text className="font-nunito-bold text-sage-700 dark:text-sage-400 text-base">
          ${earned.toFixed(2)}
        </Text>
        <Text className="font-nunito text-gray-400 dark:text-tabby-500 text-[10px]">This {periodLabel}</Text>
      </Pressable>
      <View className="flex-1 p-3.5 gap-1 border-l border-tabby-100 dark:border-tabby-700">
        <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300 text-xs">Spent</Text>
        <Text className="font-nunito-bold text-gray-800 dark:text-white text-base">${spent.toFixed(2)}</Text>
        <Text className="font-nunito text-gray-400 dark:text-tabby-500 text-[10px]">This {periodLabel}</Text>
      </View>
      <Pressable
        onPress={onPressBudget}
        style={pressFeedback}
        accessibilityRole="button"
        accessibilityLabel="Edit budget"
        className="flex-1 p-3.5 gap-1 border-l border-tabby-100 dark:border-tabby-700"
      >
        <Text className="font-nunito-semibold text-gray-500 dark:text-tabby-300 text-xs">Budget</Text>
        {pct !== null && progress ? (
          <>
            <Text
              className={`font-nunito-bold text-base ${
                over
                  ? 'text-rust-600 dark:text-rust-400'
                  : pacingOver
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-tabby-600 dark:text-tabby-300'
              }`}
            >
              {pct}%
            </Text>
            <View className="h-1 bg-tabby-50 dark:bg-tabby-700 rounded-full overflow-hidden mt-0.5">
              <View
                className={`h-full rounded-full ${barColor}`}
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </View>
            {/* Budget always resets on the pay cycle from Pay Schedule,
                regardless of the dashboard period setting -- Earned/Spent
                only follow it when that setting is "Follow pay schedule."
                Set to "Always this month" instead, Budget's window can
                genuinely differ from theirs, so its own label stays even
                when it'd otherwise be redundant. */}
            <Text className="font-nunito text-gray-400 dark:text-tabby-500 text-[10px]">
              {progress.isDerivedFromCategories
                ? `$${progress.budgetAmount.toFixed(2)} across categories`
                : `$${progress.budgetAmount.toFixed(2)} ${FREQUENCY_LABELS[progress.frequency].toLowerCase()}`}
            </Text>
          </>
        ) : (
          <Text className="font-nunito text-gray-400 dark:text-tabby-500 text-base">Set it</Text>
        )}
      </Pressable>
    </View>
  );
}

// The #1 category (by spend) renders noticeably bigger than the rest --
// real asymmetry driven by real data, instead of a uniform list of
// identical-height rows.
function CategoryBar({
  name,
  icon,
  total,
  max,
  highlight = false,
}: {
  name: string;
  icon: string | null;
  total: number;
  max: number;
  highlight?: boolean;
}) {
  const widthPct = max > 0 ? Math.max(4, (total / max) * 100) : 0;
  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <View className="gap-1.5">
        <View className="flex-row justify-between items-center">
          <View className="flex-row items-center gap-2">
            <View
              className={`items-center justify-center rounded-full ${
                highlight ? 'w-8 h-8 bg-tabby-100 dark:bg-tabby-700' : 'w-5 h-5'
              }`}
            >
              <CategoryIcon name={icon} size={highlight ? 16 : 13} />
            </View>
            <Text
              className={
                highlight
                  ? 'font-nunito-bold text-base dark:text-white'
                  : 'font-nunito-medium text-sm dark:text-tabby-200'
              }
            >
              {name}
            </Text>
          </View>
          <Text
            className={
              highlight
                ? 'font-nunito-bold text-base dark:text-white'
                : 'font-nunito text-sm text-gray-500 dark:text-tabby-300'
            }
          >
            ${total.toFixed(2)}
          </Text>
        </View>
        <View
          className={`bg-tabby-50 dark:bg-tabby-700 rounded-full overflow-hidden ${highlight ? 'h-2.5' : 'h-1.5'}`}
        >
          <View
            className="h-full bg-tabby-600 dark:bg-white rounded-full"
            style={{ width: `${widthPct}%` }}
          />
        </View>
      </View>
    </Animated.View>
  );
}

type TrendPoint = { key: string; label: string; total: number };

function TrendChart({ data }: { data: TrendPoint[] }) {
  const max = Math.max(1, ...data.map((d) => d.total));
  return (
    <View className="flex-row items-end justify-between h-36 gap-2">
      {data.map((d) => {
        const heightPct = Math.max(2, (d.total / max) * 100);
        const isCurrent = d.key === data[data.length - 1]?.key;
        return (
          <View key={d.key} className="flex-1 items-center gap-1.5">
            <View className="w-full flex-1 justify-end">
              <View
                className={`w-full rounded-full ${isCurrent ? 'bg-tabby-600 dark:bg-white' : 'bg-tabby-200 dark:bg-tabby-700'}`}
                style={{ height: `${heightPct}%` }}
              />
            </View>
            <Text
              className={
                isCurrent
                  ? 'font-nunito-bold text-xs text-tabby-700 dark:text-tabby-100'
                  : 'font-nunito text-xs text-gray-500 dark:text-tabby-300'
              }
            >
              {d.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// Thin history (< ~8 weeks of data) makes a 6-month chart mostly empty
// bars, so 'auto' mode shows weekly instead until there's enough history
// for monthly to be the more useful view.
function resolveTrendView(
  preference: TrendPeriodPreference,
  earliestOccurredAt: string | null,
  now: Date,
): 'weekly' | 'monthly' {
  if (preference !== 'auto') return preference;
  if (!earliestOccurredAt) return 'weekly';
  const daysSinceEarliest =
    (now.getTime() - new Date(`${earliestOccurredAt}T00:00:00`).getTime()) / 86_400_000;
  return daysSinceEarliest < 56 ? 'weekly' : 'monthly';
}

export default function HomeScreen() {
  const { session } = useAuth();
  const isDark = useColorScheme() === 'dark';
  const userId = session?.user.id;

  const [data, setData] = useState<DashboardData | null>(null);
  const [incomeProgress, setIncomeProgress] = useState<IncomeSourceProgress | null>(null);
  // null = dashboard period is the calendar month (no primary income source
  // set, or the user picked "Always this month" in Settings). Non-null =
  // Earned/Spent/category breakdown follow this pay cycle instead.
  const [periodFrequency, setPeriodFrequency] = useState<IncomeFrequency | null>(null);
  const [trendPreference, setTrendPreference] = useState<TrendPeriodPreference>('auto');
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showIncomeSourcesModal, setShowIncomeSourcesModal] = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [proposedShares, setProposedShares] = useState<MyBillSplitShare[]>([]);
  const [overdueShares, setOverdueShares] = useState<OwedToMeShare[]>([]);
  const [reminders, setReminders] = useState<MyBillSplitShare[]>([]);
  const [myPaymentDetails, setMyPaymentDetails] = useState<string | null>(null);
  const [pendingBills, setPendingBills] = useState<(Bill & { dueDate: string })[]>([]);
  const [billBusyId, setBillBusyId] = useState<string | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [showBills, setShowBills] = useState(false);
  const [pendingIncomeSources, setPendingIncomeSources] = useState<(IncomeSource & { paydayDate: string })[]>(
    [],
  );
  const [incomeSourceBusyId, setIncomeSourceBusyId] = useState<string | null>(null);
  const [avatarAnimal, setAvatarAnimal] = useState<AnimalKey>('bear');

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setError(null);
      setInsight(null);

      const [periodPreference, trendPref, incomeSources, profile] = await Promise.all([
        loadDashboardPeriodPreference(),
        loadTrendPeriodPreference(),
        fetchIncomeSources(userId),
        fetchProfile(userId),
      ]);
      setAvatarAnimal(profile.avatar_animal);
      setTrendPreference(trendPref);
      const primary = getPrimaryIncomeSource(incomeSources);
      // getIncomeSourceCycle only needs frequency/payday, which the primary
      // source always has once set -- unlike IncomeSourceProgress, this
      // isn't gated on a budget amount existing too, since Earned/Spent
      // following pay schedule shouldn't require a budget to be set.
      const cycle = primary ? getIncomeSourceCycle(primary) : null;
      const period: DashboardPeriod | null = periodPreference === 'pay-cycle' ? cycle : null;
      setPeriodFrequency(period ? primary!.frequency : null);

      const [result, progress] = await Promise.all([
        fetchDashboardData(userId, period),
        getIncomeSourceProgress(userId),
      ]);
      setData(result);
      setIncomeProgress(progress);

      const lastMonthTotal = result.monthlyTotals[result.monthlyTotals.length - 2]?.total ?? 0;
      generateMonthlySummary({
        thisMonthTotal: result.periodTotal,
        lastMonthTotal,
        topCategories: result.categoryTotals.slice(0, 3),
        notableSwing: findNotableCategorySwing(result.categoryTotals, result.previousMonthCategoryTotals),
      }).then(setInsight);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard.');
    }
  }, [userId]);

  // Thin aggregator, same lib functions notifications-modal.tsx and
  // friends-modal.tsx both read -- no separate fetch/cache path, so the
  // bell badge can't drift out of sync with what those screens show.
  const loadNotifications = useCallback(async () => {
    if (!userId) return;
    try {
      const [incoming, shares, owedToMe, myReminders, paymentDetails, bills, incomeSources] = await Promise.all([
        fetchIncomingRequests(userId),
        fetchMyProposedShares(userId),
        fetchOwedToMe(userId),
        fetchMyReminders(userId),
        fetchMyPaymentDetails(userId),
        fetchBills(userId),
        fetchIncomeSources(userId),
      ]);
      setIncomingRequests(incoming);
      setProposedShares(shares);
      setOverdueShares(owedToMe.filter(isOverdue));
      setReminders(myReminders);
      setMyPaymentDetails(paymentDetails);
      setBills(bills);
      setPendingBills(
        bills.flatMap((bill) => {
          const dueDate = getPendingBillDue(bill);
          return dueDate ? [{ ...bill, dueDate }] : [];
        }),
      );
      setPendingIncomeSources(
        incomeSources.flatMap((source) => {
          const paydayDate = getPendingIncomeSourcePayday(source);
          return paydayDate ? [{ ...source, paydayDate }] : [];
        }),
      );
    } catch {
      // the badge just stays at its last known count -- not worth surfacing
      // a dashboard-wide error banner for a secondary, non-blocking feature
    }
  }, [userId]);

  useEffect(() => {
    Promise.all([load(), loadNotifications()]).finally(() => {
      setLoading(false);
      setNotificationsLoading(false);
    });
  }, [load, loadNotifications]);

  // Tabs stay mounted when you switch away (standard tab behavior), so
  // without this, adding a transaction on another tab and coming back to
  // Home would show stale numbers until a manual pull-to-refresh. Silent
  // -- doesn't touch `loading`, only the mount-time effect above does, so
  // this doesn't flash the spinner on every tab switch.
  useFocusEffect(
    useCallback(() => {
      load();
      loadNotifications();
    }, [load, loadNotifications]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), loadNotifications()]);
    setRefreshing(false);
  };

  const handleRespondRequest = async (id: string, accept: boolean) => {
    await respondToFriendRequest(id, accept);
    await loadNotifications();
  };

  const handleRespondShare = async (id: string, accept: boolean) => {
    await respondToShare(id, accept);
    await loadNotifications();
  };

  const handleRemindInApp = async (share: OwedToMeShare) => {
    await markReminded(share.id);
    await loadNotifications();
  };

  const handleRemindViaMessage = (share: OwedToMeShare) => {
    const paymentLine = myPaymentDetails ? ` You can pay me at ${myPaymentDetails}.` : '';
    Share.share({
      message: `Hey! Just a reminder you owe me $${share.amountOwed.toFixed(2)} for ${share.billTitle}.${paymentLine}`,
    }).catch(() => {});
  };

  // Two-step settle: this is just my own half confirming -- the share only
  // reaches 'paid' once the other side has confirmed too. See
  // confirmSharePaidByOwer/confirmSharePaidByPayee for the guest-share
  // exception (no account on the other side, so the payee's confirm alone
  // settles it).
  const handleOwerConfirmPaid = async (shareId: string) => {
    await confirmSharePaidByOwer(shareId);
    await loadNotifications();
  };

  const handlePayeeConfirmPaid = async (shareId: string) => {
    await confirmSharePaidByPayee(shareId);
    await loadNotifications();
  };

  // The old singleton payday confirm/decline (income_settings-based) is
  // retired here -- every income source, primary included, now goes
  // through handleConfirmIncomeSource/handleDeclineIncomeSource below,
  // which already covers this same job via the INCOME bell section.

  const rescheduleBillReminder = async (bill: Bill) => {
    const nextDue = getNextBillDueDate(bill);
    if (!nextDue) return;
    const granted = await requestBillNotificationPermission();
    if (granted) await scheduleBillReminder(bill.id, bill.name, nextDue);
  };

  // amount is required for a variable bill (entered inline in the bell),
  // ignored for a fixed one (the bill's own stored amount is used instead).
  const handleConfirmBill = async (bill: Bill & { dueDate: string }, amount: number) => {
    setBillBusyId(bill.id);
    try {
      await confirmBillPayment(bill.id, amount, bill.dueDate);
      await cancelBillFollowUp(bill.id).catch(() => {});
      await rescheduleBillReminder(bill).catch(() => {});
      await Promise.all([load(), loadNotifications()]);
    } finally {
      setBillBusyId(null);
    }
  };

  // Same as payday's decline -- stays pending, re-asked after the follow-up.
  const handleDeclineBill = async (bill: Bill & { dueDate: string }) => {
    await scheduleBillFollowUp(bill.id, bill.name).catch(() => {});
  };

  const handleSkipBill = async (bill: Bill & { dueDate: string }) => {
    setBillBusyId(bill.id);
    try {
      await skipBillPayment(bill.id, bill.dueDate);
      await cancelBillFollowUp(bill.id).catch(() => {});
      await rescheduleBillReminder(bill).catch(() => {});
      await Promise.all([load(), loadNotifications()]);
    } finally {
      setBillBusyId(null);
    }
  };

  const rescheduleIncomeSourceReminder = async (source: IncomeSource) => {
    const nextPayday = getNextIncomeSourcePaydayDate(source);
    if (!nextPayday) return;
    const granted = await requestIncomeSourceNotificationPermission();
    if (granted) await scheduleIncomeSourceReminder(source.id, source.label, nextPayday);
  };

  // `amount` is the bell's own editable field for fixed-mode sources, or
  // rate x paid hours for hourly-mode (computed in the bell before this is
  // called, via computeGrossPay) -- "paid" not "worked" hours, since paid
  // leave still counts (see income-sources.ts).
  const handleConfirmIncomeSource = async (
    source: IncomeSource & { paydayDate: string },
    amount: number,
    breakdown?: IncomeBreakdown,
  ) => {
    setIncomeSourceBusyId(source.id);
    try {
      await confirmIncomeSourcePayment(source.id, amount, source.paydayDate, breakdown);
      await cancelIncomeSourceFollowUp(source.id).catch(() => {});
      await rescheduleIncomeSourceReminder(source).catch(() => {});
      await Promise.all([load(), loadNotifications()]);
    } finally {
      setIncomeSourceBusyId(null);
    }
  };

  // Same as bills' decline -- stays pending, re-asked after the follow-up.
  const handleDeclineIncomeSource = async (source: IncomeSource & { paydayDate: string }) => {
    await scheduleIncomeSourceFollowUp(source.id, source.label).catch(() => {});
  };

  const handleSkipIncomeSource = async (source: IncomeSource & { paydayDate: string }) => {
    setIncomeSourceBusyId(source.id);
    try {
      await skipIncomeSourcePayment(source.id, source.paydayDate);
      await cancelIncomeSourceFollowUp(source.id).catch(() => {});
      await rescheduleIncomeSourceReminder(source).catch(() => {});
      await Promise.all([load(), loadNotifications()]);
    } finally {
      setIncomeSourceBusyId(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-tabby-50 dark:bg-tabby-900">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  // Single soonest bill, by the more urgent of "still unresolved" vs "next
  // scheduled" -- just a glance, not a list (that's the Bills screen
  // itself, reached via "View all"); showing more than one here crowds
  // Home for a feature that's meant to stay out of the way most days.
  const billsPreview = bills
    .map((bill) => ({ bill, dueDate: getRelevantBillDate(bill) }))
    .filter((b): b is { bill: Bill; dueDate: string } => b.dueDate !== null)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 1);

  const maxCategory = Math.max(1, ...(data?.categoryTotals.map((c) => c.total) ?? [0]));
  const trendView = resolveTrendView(trendPreference, data?.earliestOccurredAt ?? null, new Date());
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  // The hero is the only card that gets a fill, so it's the one place a
  // time-of-day shift reads as "this app feels like now" rather than noise:
  // a touch deeper/dustier once evening hits, same as the sky outside.
  const heroBg = hour < 18 ? 'bg-tabby-100 dark:bg-tabby-800' : 'bg-tabby-200 dark:bg-tabby-700';
  // Same formula as MoneyFlowRow's own bar -- lifted here too since the
  // bear's mood needs it before that row even renders.
  const pct =
    incomeProgress && incomeProgress.budgetAmount > 0
      ? Math.round((incomeProgress.spent / incomeProgress.budgetAmount) * 100)
      : null;
  const periodLabel = periodFrequency ? PERIOD_NOUNS[periodFrequency] : 'month';

  return (
    <SafeAreaView className="flex-1 bg-tabby-50 dark:bg-tabby-900">
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* The full illustrated bear (eyes, nose, eyebrows) only reads clean
            at splash/auth size -- at 46px it turns to noise, so the header
            badge uses the flat monochrome silhouette instead, tinted brown. */}
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <View
              className="w-12 h-12 rounded-full items-center justify-center"
              style={{ backgroundColor: '#BEE3F8' }}
            >
              <Image
                source={require('@/assets/images/android-icon-monochrome.png')}
                tintColor="#8B5A2B"
                style={{ width: 26, height: 26 }}
              />
            </View>
            <View>
              <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">{greeting}</Text>
              <Text className="font-fredoka-semibold text-2xl dark:text-white">
                {session?.user.email?.split('@')[0]}
              </Text>
            </View>
          </View>

          <Pressable
            onPress={() => setShowNotifications(true)}
            style={pressFeedback}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            className="w-10 h-10 rounded-full bg-gray-100 dark:bg-tabby-700 items-center justify-center"
          >
            <Feather name="bell" size={18} color={isDark ? '#E8C39E' : '#374151'} />
            {incomingRequests.length +
              proposedShares.length +
              overdueShares.length +
              reminders.length +
              pendingBills.length +
              pendingIncomeSources.length >
              0 && (
              <View className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 items-center justify-center">
                <Text className="font-nunito-bold text-white text-[10px]">
                  {incomingRequests.length +
                    proposedShares.length +
                    overdueShares.length +
                    reminders.length +
                    pendingBills.length +
                    pendingIncomeSources.length}
                </Text>
              </View>
            )}
          </Pressable>
        </View>

        {error && <Text className="font-nunito text-red-500 dark:text-red-400 text-sm">{error}</Text>}

        {/* Hero: the one number that matters most this month, given real
            visual weight instead of sitting in a same-size box as everything
            else below it. Tabby sits inside it now, not as a separate zone
            above -- mood reflects the same budget % as the progress card
            below, and tapping reveals the AI insight instead of it sitting
            always-visible underneath (see git history for that old block). */}
        <View className={`${heroBg} rounded-3xl p-5 gap-1 items-center`}>
          <Text className="font-nunito-medium text-tabby-700 dark:text-tabby-100 text-sm">
            This {periodLabel}, net
          </Text>
          <Text
            className={`font-nunito-extrabold text-4xl ${
              (data?.periodNet ?? 0) < 0
                ? 'text-rust-600 dark:text-rust-400'
                : 'text-sage-700 dark:text-sage-400'
            }`}
          >
            {(data?.periodNet ?? 0) < 0 ? '-' : '+'}${Math.abs(data?.periodNet ?? 0).toFixed(2)}
          </Text>
          <View className="mt-2">
            <TabbyMascot animal={avatarAnimal} mood={moodFromPct(pct)} insight={insight} />
          </View>
        </View>

        {/* Bills used to be reachable only one tap deep in Profile -- a
            quick preview here (soonest 1-2) surfaces them without taking
            as much room as a full section, since most days there's nothing
            urgent to show. Hidden entirely once there are no bills at all,
            same reasoning as the bell's empty state. */}
        {billsPreview.length > 0 && (
          <View className="border border-tabby-100 dark:border-tabby-700 rounded-2xl p-3.5 gap-2.5">
            <View className="flex-row items-center justify-between">
              <Text className="font-nunito-bold dark:text-white">Bills</Text>
              <Pressable
                onPress={() => setShowBills(true)}
                style={pressFeedback}
                accessibilityRole="button"
                accessibilityLabel="View all bills"
              >
                <Text className="font-nunito text-sm text-gray-500 dark:text-tabby-300">
                  View all{bills.length > 1 ? ` (${bills.length})` : ''}
                </Text>
              </Pressable>
            </View>
            {billsPreview.map(({ bill, dueDate }) => {
              const label = formatDueLabel(dueDate);
              const overdue = label === 'Overdue';
              const awaitingAmount = bill.isVariable && getPendingBillDue(bill) !== null;
              return (
                <Pressable
                  key={bill.id}
                  onPress={() => setShowBills(true)}
                  style={pressFeedback}
                  className={`flex-row items-center justify-between rounded-lg px-2.5 py-2 ${
                    overdue
                      ? 'bg-amber-50 dark:bg-amber-950 border border-amber-400 dark:border-amber-500'
                      : ''
                  }`}
                >
                  <View className="flex-row items-center gap-2">
                    {overdue && <View className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                    <View>
                      <Text className="font-nunito-medium text-sm dark:text-white">{bill.name}</Text>
                      <Text
                        className={`text-xs ${
                          overdue
                            ? 'font-nunito-bold text-amber-700 dark:text-amber-400'
                            : 'font-nunito text-gray-500 dark:text-tabby-300'
                        }`}
                      >
                        {label}
                      </Text>
                    </View>
                  </View>
                  <Text
                    className={`font-nunito-semibold text-sm ${
                      awaitingAmount ? 'text-amber-600 dark:text-amber-400' : 'dark:text-white'
                    }`}
                  >
                    {awaitingAmount
                      ? 'Enter amount'
                      : bill.isVariable
                        ? 'Variable'
                        : `$${(bill.amount ?? 0).toFixed(2)}`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <MoneyFlowRow
          earned={data?.periodIncome ?? 0}
          spent={data?.periodTotal ?? 0}
          progress={incomeProgress}
          periodLabel={periodLabel}
          onPressEarned={() => setShowIncomeSourcesModal(true)}
          onPressBudget={() => setShowBudgetModal(true)}
        />

        <View className="gap-3">
          <Text className="font-nunito-bold text-lg dark:text-white">Spending by category</Text>
          {data && data.categoryTotals.length > 0 ? (
            data.categoryTotals.map((c, i) => (
              <CategoryBar
                key={c.categoryId ?? 'uncategorized'}
                name={c.name}
                icon={c.icon}
                total={c.total}
                max={maxCategory}
                highlight={i === 0}
              />
            ))
          ) : (
            <Text className="font-nunito text-gray-500 dark:text-tabby-300">
              No transactions this {periodLabel} yet. Add one in the Transactions tab.
            </Text>
          )}
        </View>

        {/* The 6-month trend gets its own enclosed block -- a quiet border
            rather than a gray fill, so the hero stays the only solid-filled
            card on the screen and this doesn't read as "another gray box." */}
        <View className="border border-tabby-100 dark:border-tabby-700 rounded-3xl p-4 gap-3">
          <Text className="font-nunito-bold text-lg dark:text-white">
            {trendView === 'weekly' ? 'Last 6 weeks' : 'Last 6 months'}
          </Text>
          {data && (
            <TrendChart
              data={
                trendView === 'weekly'
                  ? data.weeklyTotals.map((w) => ({ key: w.weekStart, label: w.label, total: w.total }))
                  : data.monthlyTotals.map((m) => ({ key: m.month, label: m.label, total: m.total }))
              }
            />
          )}
        </View>
      </ScrollView>

      <IncomeSourcesModal
        visible={showIncomeSourcesModal}
        onClose={() => {
          setShowIncomeSourcesModal(false);
          loadNotifications();
        }}
      />
      <BudgetModal
        visible={showBudgetModal}
        onClose={() => setShowBudgetModal(false)}
        onSaved={load}
        onNeedsPaySchedule={() => {
          setShowBudgetModal(false);
          setShowIncomeSourcesModal(true);
        }}
      />
      <NotificationsModal
        visible={showNotifications}
        onClose={() => setShowNotifications(false)}
        loading={notificationsLoading}
        incoming={incomingRequests}
        proposedShares={proposedShares}
        overdueShares={overdueShares}
        reminders={reminders}
        pendingBills={pendingBills}
        billBusyId={billBusyId}
        pendingIncomeSources={pendingIncomeSources}
        incomeSourceBusyId={incomeSourceBusyId}
        onRespondRequest={handleRespondRequest}
        onRespondShare={handleRespondShare}
        onRemindInApp={handleRemindInApp}
        onRemindViaMessage={handleRemindViaMessage}
        onOwerConfirmPaid={handleOwerConfirmPaid}
        onPayeeConfirmPaid={handlePayeeConfirmPaid}
        onConfirmBill={handleConfirmBill}
        onDeclineBill={handleDeclineBill}
        onSkipBill={handleSkipBill}
        onConfirmIncomeSource={handleConfirmIncomeSource}
        onDeclineIncomeSource={handleDeclineIncomeSource}
        onSkipIncomeSource={handleSkipIncomeSource}
      />
      <BillsModal
        visible={showBills}
        onClose={() => {
          setShowBills(false);
          loadNotifications();
        }}
      />
    </SafeAreaView>
  );
}
