// Optional per-category budget caps -- reached from Budget, since a
// category budget rides the same pay cycle the overall one does. No
// category starts with a cap; add one to whichever categories you want to
// track, clear it to stop. See category-budgets.ts and
// 0026_add_category_budgets.sql for why this is its own table.
import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, G } from 'react-native-svg';

import { CategoryIcon } from '@/components/category-icon';
import { useAuth } from '@/lib/auth-context';
import { suggestBudgetRationales } from '@/lib/ai';
import {
  clearCategoryBudget,
  fetchAverageMonthlyIncome,
  fetchCategoryBudgets,
  fetchCategorySpendAverages,
  mergeCategoryBudgetProgress,
  setCategoryBudget,
  type CategoryBudgetProgress,
} from '@/lib/category-budgets';
import { fetchDashboardData } from '@/lib/dashboard';
import { fetchIncomeSources, getIncomeSourceCycle, getPrimaryIncomeSource } from '@/lib/income-sources';
import { fetchCategories, type Category } from '@/lib/transactions';

// Suggested amounts round to the nearest $5 -- a budget cap of "$83.47"
// reads as spurious precision for what's an estimate, not a bill.
function roundToNearest5(amount: number): number {
  return Math.max(5, Math.round(amount / 5) * 5);
}

// No single category's suggestion exceeds this share of average monthly
// income -- pure spending history can suggest something that's already
// unsustainable (or was a one-off), so this is a sanity backstop, not a
// full budgeting framework. Picked by the user, not invented here.
const BUDGET_SUGGESTION_INCOME_CAP_PCT = 0.15;

// Flat starter suggested for a category with zero spend in the averaging
// window -- deliberately small and explicitly labeled a guess, since there's
// no real pattern behind it (unlike the history-based suggestions above).
const BUDGET_SUGGESTION_FALLBACK_AMOUNT = 20;

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

// Same deterministic per-category tint as TransactionRow's categoryTint in
// transactions.tsx (private there, so duplicated rather than exported just
// for this) -- keeps a category's color consistent with how it looks in
// the Activity list, without a color column in the DB.
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
function categoryTintIndex(categoryId: string, paletteLength: number): number {
  let hash = 0;
  for (let i = 0; i < categoryId.length; i++) hash = (hash * 31 + categoryId.charCodeAt(i)) >>> 0;
  return hash % paletteLength;
}

type PieSlice = { categoryId: string; name: string; amount: number };

// The hash above can put two different categories at the same palette slot
// (e.g. "Dining Out" and "Health" both landing on index 2) -- fine for a
// single row elsewhere, but two adjacent pie slices in the same color are
// unreadable. Only resolve collisions among the slices actually on screen
// right now, bumping a later colliding slice to the next free slot (wrapping)
// so this still shows the same color as everywhere else whenever possible.
// Once every slot is taken (more slices than palette colors), stop looking
// and just reuse one -- scanning forever for a free slot that doesn't exist
// froze the app once a budget covered more than `palette.length` categories.
function resolveSliceColors(
  slices: PieSlice[],
  isDark: boolean,
): { categoryId: string; bg: string }[] {
  const palette = isDark ? CATEGORY_PALETTE_DARK : CATEGORY_PALETTE_LIGHT;
  const used = new Set<number>();
  return slices.map((s) => {
    let index = categoryTintIndex(s.categoryId, palette.length);
    for (let attempts = 0; used.has(index) && attempts < palette.length; attempts++) {
      index = (index + 1) % palette.length;
    }
    used.add(index);
    return { categoryId: s.categoryId, bg: palette[index].bg };
  });
}

// Read-only -- shows how the budgets you've set (or are drafting) divide
// up, it never takes a drag/tap itself. A pie/donut is a bad INPUT for an
// exact dollar figure (a couple pixels of drag swings the number
// unpredictably); the list below stays the only way to actually set one.
// Updates live from `drafts`, including unsaved edits, so changing a
// number immediately redraws its slice.
function CategoryBudgetPie({ slices }: { slices: PieSlice[] }) {
  const isDark = useColorScheme() === 'dark';
  const size = 160;
  const strokeWidth = 26;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = slices.reduce((sum, s) => sum + s.amount, 0);

  if (total <= 0) {
    return (
      <View
        style={{ width: size, height: size }}
        className="self-center items-center justify-center rounded-full border-2 border-dashed border-gray-200 dark:border-tabby-700"
      >
        <Text className="font-nunito text-xs text-gray-400 dark:text-tabby-400 text-center px-6">
          Set a budget to see it here
        </Text>
      </View>
    );
  }

  const colorByCategoryId = new Map(resolveSliceColors(slices, isDark).map((c) => [c.categoryId, c.bg]));

  // Precompute each segment's length/offset before rendering, rather than
  // mutating a running total inside the map callback itself.
  const segments = slices.reduce<{ slice: PieSlice; length: number; dashoffset: number }[]>((acc, s) => {
    const length = (s.amount / total) * circumference;
    const priorLength = acc.reduce((sum, seg) => sum + seg.length, 0);
    acc.push({ slice: s, length, dashoffset: -priorLength });
    return acc;
  }, []);

  return (
    <View className="items-center gap-3">
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
            {segments.map(({ slice: s, length, dashoffset }) => (
              <Circle
                key={s.categoryId}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={colorByCategoryId.get(s.categoryId)}
                strokeWidth={strokeWidth}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={dashoffset}
                fill="none"
              />
            ))}
          </G>
        </Svg>
        <View className="absolute inset-0 items-center justify-center">
          <Text className="font-fredoka-semibold text-xl dark:text-white">${total.toFixed(0)}</Text>
          <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">budgeted</Text>
        </View>
      </View>

      <View className="flex-row flex-wrap justify-center gap-x-3 gap-y-1.5 px-2">
        {slices.map((s) => (
          <View key={s.categoryId} className="flex-row items-center gap-1.5">
            <View
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: colorByCategoryId.get(s.categoryId) }}
            />
            <Text className="font-nunito text-xs text-gray-600 dark:text-tabby-200">
              {s.name} · {Math.round((s.amount / total) * 100)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function CategoryBudgetsModal({
  visible,
  onClose,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const isDark = useColorScheme() === 'dark';
  const { session } = useAuth();
  const userId = session?.user.id;

  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [progress, setProgress] = useState<CategoryBudgetProgress[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [applyingAll, setApplyingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Suggested budget for any category that doesn't have one saved yet --
  // amount is plain arithmetic and appears immediately; rationale is
  // filled in afterward once the (much slower) AI call resolves, so the
  // number is never waiting on a network round trip to show up. A capped
  // suggestion skips the AI call entirely -- "capped to 15% of your
  // income" is a plain fact, not something worth asking a model to
  // rephrase, and mixing it with an AI-written pattern-rationale would
  // just be two explanations competing for the same line.
  const [suggestions, setSuggestions] = useState<
    Record<string, { amount: number; rationale: string | null; capped: boolean; isGuess: boolean }>
  >({});

  const load = async () => {
    if (!userId) return;
    try {
      const sources = await fetchIncomeSources(userId);
      const primary = getPrimaryIncomeSource(sources);
      const cycle = primary ? getIncomeSourceCycle(primary) : null;

      const [cats, budgets, dashboard, spendAverages, averageMonthlyIncome] = await Promise.all([
        fetchCategories('expense'),
        fetchCategoryBudgets(userId),
        fetchDashboardData(userId, cycle),
        fetchCategorySpendAverages(userId),
        fetchAverageMonthlyIncome(userId),
      ]);

      setCategories(cats);
      const merged = mergeCategoryBudgetProgress(budgets, cats, dashboard.categoryTotals);
      setProgress(merged);
      setDrafts(Object.fromEntries(merged.map((m) => [m.categoryId, String(m.budgetAmount)])));

      const budgetedIds = new Set(budgets.map((b) => b.categoryId));
      const historyIds = new Set(spendAverages.map((a) => a.categoryId));
      const candidates = spendAverages
        .filter((a): a is typeof a & { categoryId: string } => a.categoryId !== null)
        .filter((a) => !budgetedIds.has(a.categoryId) && a.monthsWithSpend > 0);

      const incomeCap =
        averageMonthlyIncome > 0 ? roundToNearest5(averageMonthlyIncome * BUDGET_SUGGESTION_INCOME_CAP_PCT) : null;

      const historySuggestions = Object.fromEntries(
        candidates.map((a) => {
          const raw = roundToNearest5(a.monthlyAverage);
          const capped = incomeCap !== null && raw > incomeCap;
          return [
            a.categoryId,
            {
              amount: capped ? incomeCap! : raw,
              rationale: capped
                ? `capped to ${Math.round(BUDGET_SUGGESTION_INCOME_CAP_PCT * 100)}% of your average income`
                : null,
              capped,
              isGuess: false,
            },
          ];
        }),
      );

      // Categories with no spend in the window at all have nothing to base
      // a real suggestion on -- give them a small flat starter instead of
      // skipping them, so "apply all" actually covers every category, not
      // just the ones with history. Explicitly marked as a guess rather
      // than disguised as a computed pattern.
      const fallbackAmount =
        incomeCap !== null ? Math.min(BUDGET_SUGGESTION_FALLBACK_AMOUNT, incomeCap) : BUDGET_SUGGESTION_FALLBACK_AMOUNT;
      const fallbackSuggestions = Object.fromEntries(
        cats
          .filter((c) => !budgetedIds.has(c.id) && !historyIds.has(c.id))
          .map((c) => [
            c.id,
            {
              amount: fallbackAmount,
              rationale: 'no spending here yet, just a starter guess',
              capped: false,
              isGuess: true,
            },
          ]),
      );

      setSuggestions({ ...historySuggestions, ...fallbackSuggestions });

      const uncappedCandidates = candidates.filter((a) => {
        const raw = roundToNearest5(a.monthlyAverage);
        return !(incomeCap !== null && raw > incomeCap);
      });

      if (uncappedCandidates.length > 0) {
        const catById = new Map(cats.map((c) => [c.id, c]));
        suggestBudgetRationales(
          uncappedCandidates
            .map((a) => ({ ...a, name: catById.get(a.categoryId)?.name }))
            .filter((a): a is typeof a & { name: string } => a.name !== undefined),
        ).then((rationales) => {
          if (!rationales) return;
          setSuggestions((prev) => {
            const next = { ...prev };
            for (const [categoryId, rationale] of Object.entries(rationales)) {
              if (next[categoryId] && !next[categoryId].capped) next[categoryId] = { ...next[categoryId], rationale };
            }
            return next;
          });
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load category budgets.');
    }
  };

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [visible, userId]);

  const handleSave = async (categoryId: string) => {
    if (!userId) return;
    const draft = drafts[categoryId] ?? '';
    const parsed = parseFloat(draft);
    setSavingId(categoryId);
    setError(null);
    try {
      if (draft.trim() === '' || isNaN(parsed) || parsed <= 0) {
        await clearCategoryBudget(userId, categoryId);
      } else {
        await setCategoryBudget(userId, categoryId, parsed);
      }
      await load();
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSavingId(null);
    }
  };

  const spentFor = (categoryId: string) => progress.find((p) => p.categoryId === categoryId)?.spent ?? 0;

  // Every suggestion that's still unapplied -- a category with a suggestion
  // whose draft hasn't been touched (filled by a single pill tap, or by this
  // same bulk action) yet. Saving one at a time (not Promise.all) so one bad
  // row surfaces a clear error instead of an opaque partial-batch failure.
  const pendingSuggestionIds = Object.keys(suggestions).filter((id) => (drafts[id] ?? '').trim() === '');

  const handleApplyAllSuggestions = async () => {
    if (!userId || pendingSuggestionIds.length === 0) return;
    setApplyingAll(true);
    setError(null);
    try {
      for (const categoryId of pendingSuggestionIds) {
        await setCategoryBudget(userId, categoryId, suggestions[categoryId].amount);
      }
      await load();
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply suggested budgets.');
    } finally {
      setApplyingAll(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-white dark:bg-tabby-900">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-tabby-700">
            <Text className="font-fredoka-semibold text-xl dark:text-white">Category Budgets</Text>
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

          {loading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator />
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
              <Text className="font-nunito text-gray-500 dark:text-tabby-300 text-sm">
                Set a cap on any category you want to track. Leave the rest blank &mdash; those just show
                spend, no cap. Once any category has a cap, Budget on Home reflects these instead of a single
                overall figure.
              </Text>

              {error && (
                <View className="px-3 py-2 bg-red-50 dark:bg-red-950 rounded-lg">
                  <Text className="font-nunito text-red-600 dark:text-red-400 text-sm">{error}</Text>
                </View>
              )}

              {pendingSuggestionIds.length > 0 && (
                <Pressable
                  onPress={handleApplyAllSuggestions}
                  disabled={applyingAll}
                  style={pressFeedback}
                  accessibilityRole="button"
                  accessibilityLabel={`Apply AI-suggested budgets to ${pendingSuggestionIds.length} categories`}
                  className="flex-row items-center justify-center gap-2 py-2.5 rounded-xl bg-tabby-100 dark:bg-tabby-700"
                >
                  {applyingAll ? (
                    <ActivityIndicator size="small" color={isDark ? '#E8C39E' : '#8B5A2B'} />
                  ) : (
                    <Feather name="zap" size={14} color={isDark ? '#E8C39E' : '#8B5A2B'} />
                  )}
                  <Text className="font-nunito-medium text-sm text-tabby-700 dark:text-tabby-100">
                    {applyingAll
                      ? 'Applying suggested budgets...'
                      : `Use AI's ${pendingSuggestionIds.length} suggested budget${pendingSuggestionIds.length > 1 ? 's' : ''}`}
                  </Text>
                </Pressable>
              )}

              <CategoryBudgetPie
                slices={categories
                  .map((cat) => ({ categoryId: cat.id, name: cat.name, amount: parseFloat(drafts[cat.id] ?? '') }))
                  .filter((s): s is PieSlice => !isNaN(s.amount) && s.amount > 0)}
              />

              {categories.map((cat) => {
                const draft = drafts[cat.id] ?? '';
                const spent = spentFor(cat.id);
                const savedAmount = progress.find((p) => p.categoryId === cat.id)?.budgetAmount;
                const savedDraft = savedAmount !== undefined ? String(savedAmount) : '';
                const isDirty = draft !== savedDraft;
                const saving = savingId === cat.id;
                const suggestion = savedAmount === undefined ? suggestions[cat.id] : undefined;
                return (
                  <View key={cat.id} className="gap-1.5">
                    <View className="flex-row items-center gap-3 rounded-xl px-3 py-2.5 bg-gray-50 dark:bg-tabby-800 border border-gray-100 dark:border-tabby-700">
                      <View className="w-9 h-9 rounded-full bg-white dark:bg-tabby-700 items-center justify-center">
                        <CategoryIcon name={cat.icon} size={15} color={isDark ? '#E8C39E' : '#4b5563'} />
                      </View>
                      <View className="flex-1">
                        <Text className="font-nunito-medium dark:text-white">{cat.name}</Text>
                        {savedAmount !== undefined && (
                          <Text className="font-nunito text-xs text-gray-500 dark:text-tabby-300">
                            ${spent.toFixed(2)} spent this cycle
                          </Text>
                        )}
                      </View>
                      <TextInput
                        value={draft}
                        onChangeText={(text) => setDrafts((d) => ({ ...d, [cat.id]: text }))}
                        placeholder="No cap"
                        keyboardType="decimal-pad"
                        className="font-nunito border border-gray-300 dark:border-tabby-600 rounded-lg px-2.5 py-1.5 w-20 text-right bg-white dark:bg-tabby-900 dark:text-white"
                      />
                      <View className="w-16 items-center">
                        {saving ? (
                          <ActivityIndicator size="small" />
                        ) : isDirty ? (
                          <Pressable
                            onPress={() => handleSave(cat.id)}
                            style={pressFeedback}
                            className="bg-tabby-600 dark:bg-white rounded-lg px-3 py-1.5"
                            accessibilityRole="button"
                            accessibilityLabel={`Save budget for ${cat.name}`}
                          >
                            <Text className="font-nunito-semibold text-xs text-white dark:text-tabby-900">
                              Save
                            </Text>
                          </Pressable>
                        ) : savedAmount !== undefined ? (
                          <View
                            className="flex-row items-center gap-1"
                            accessibilityLabel={`Budget saved for ${cat.name}`}
                          >
                            <Feather name="check-circle" size={14} color={isDark ? '#86BD63' : '#4C7535'} />
                            <Text className="font-nunito text-xs text-sage-700 dark:text-sage-400">Saved</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>

                    {suggestion && draft.trim() === '' && (
                      <Pressable
                        onPress={() => setDrafts((d) => ({ ...d, [cat.id]: String(suggestion.amount) }))}
                        style={pressFeedback}
                        accessibilityRole="button"
                        accessibilityLabel={`${suggestion.isGuess ? 'Use starter guess' : 'Use AI-suggested'} budget of $${suggestion.amount} for ${cat.name}`}
                        className={`flex-row items-center gap-1.5 self-start ml-3 px-2.5 py-1 rounded-full ${
                          suggestion.isGuess
                            ? 'border border-dashed border-tabby-300 dark:border-tabby-500'
                            : 'bg-tabby-100 dark:bg-tabby-700'
                        }`}
                      >
                        <Feather
                          name={suggestion.isGuess ? 'star' : 'zap'}
                          size={11}
                          color={suggestion.isGuess ? (isDark ? '#DCA873' : '#A86F3D') : isDark ? '#E8C39E' : '#8B5A2B'}
                        />
                        <Text
                          className={`font-nunito-medium text-xs ${
                            suggestion.isGuess
                              ? 'text-tabby-500 dark:text-tabby-300'
                              : 'text-tabby-700 dark:text-tabby-100'
                          }`}
                        >
                          Suggested: ${suggestion.amount}
                          {suggestion.rationale ? ` · ${suggestion.rationale}` : ''}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
