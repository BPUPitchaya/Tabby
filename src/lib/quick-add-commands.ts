// The non-UI half of the Transactions screen's quick-add composer: the
// cheap local pre-filters that decide which AI call a message is worth,
// the financial-question answer builder, and the edit-command resolver.
// Moved out of transactions.tsx so the screen only decides what to do
// with each result (show it, set an error, fall through).
import {
  classifyEditCommand,
  type ClassifiedFinancialQuestion,
} from '@/lib/ai';
import { fetchBills, formatDueLabel, getRelevantBillDate, updateBill } from '@/lib/bills';
import { fetchAverageMonthlyIncome, fetchCategoryBudgets, setCategoryBudget } from '@/lib/category-budgets';
import { computeBalances, fetchFlatMembers, fetchMyFlat, recordSettlement, renameFlat } from '@/lib/flats';
import {
  fetchIncomeSources,
  getIncomeSourceProgress,
  getNextIncomeSourcePaydayDate,
  getPrimaryIncomeSource,
  updateSourceBudgetAmount,
} from '@/lib/income-sources';
import { fetchProfile, updateDisplayName } from '@/lib/profile';
import { filterTransactionsByQuery } from '@/lib/transaction-query';
import type { Category, Transaction } from '@/lib/transactions';

// Cheap local pre-filter for whether a quick-add message might describe
// splitting a bill. See handleQuickAdd for why this gates a second AI
// call instead of asking Gemini to classify every message up front.
export const SPLIT_HINT = /\bsplit\b|\beach\b|\bowes?\b|\bbetween\b|\bdivide/i;

// Same cheap-local-pre-filter idea, for whether a quick-add message is
// actually a QUESTION about personal finances (spending, budget, bills,
// flat balances, or income) rather than a transaction to log. Checked
// first, before the split-hint, since a question should never get mistaken
// for either a split or a plain expense statement.
export const FINANCIAL_QUESTION_HINT =
  /^(how (much|many)|what did|did (i|we)|when (did|do|is)|am i|is my|are we|who owes|do i owe|does .* owe)\b|\?\s*$/i;

// Cheap local pre-filter for an EDIT command ("change my budget to
// $500", "I paid Jo $20", "rename my flat to The Hideout"). Checked
// before the question hint, since this isn't asking anything, it's
// asking the app to change or record a value. See classifyEditCommand
// for which actions this actually covers.
export const EDIT_COMMAND_HINT =
  /\b(change|set|update|rename)\b.*\b(budget|name|bill|rent|flat)\b|\bi\s+paid\b|\bpaid\s+me\b|\bpaid\b.*\bback\b/i;

// One answer builder per financial topic classifyFinancialQuestion can
// return. Each pulls whatever real data that topic needs and computes
// a single plain-language fact from it. Never an AI-invented figure: the
// AI's only job was picking the topic (and, for spending, the filter);
// every number here comes straight from the database.
export async function buildFinancialAnswer(
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

// An edit command ("change my budget to $500", "I paid Jo $20") parsed
// but not yet applied. Nothing is written until the user taps
// Confirm. `apply` is a closure holding whatever that specific action
// needs (an id, a flat id, two user ids, ...) so this one piece of
// state and its one render block cover every edit action, not just
// budget.
export type PendingEdit = {
  title: string;
  oldLabel: string;
  newLabel: string;
  warning: string | null;
  successMessage: string;
  apply: () => Promise<void>;
};

// What resolveEditCommand found: a confirmable edit, a user-facing error
// explaining why it couldn't build one, or null to fall through and try
// the message as something else.
export type EditCommandResult = { kind: 'edit'; edit: PendingEdit } | { kind: 'error'; message: string } | null;

// An EDIT command ("change my budget to $500", "set my groceries
// budget to $300", "change my name to Alex", "change my rent to
// $480", "rename my flat to The Hideout", "I paid Jo $20"). It's never
// applied directly. Classifies which action and its parameters,
// then returns an old -> new confirmation; nothing is written until
// the user taps Confirm.
export async function resolveEditCommand(
  text: string,
  userId: string,
  categories: Category[],
): Promise<EditCommandResult> {
  const flat = await fetchMyFlat(userId);
  const members = flat ? await fetchFlatMembers(flat.id) : [];
  const otherMembers = members.filter((m) => m.user_id !== userId);
  const memberNames = otherMembers.map((m) => m.profiles?.display_name ?? 'Unknown');

  const classified = await classifyEditCommand(text, categories, memberNames);
  if (classified && classified.action !== 'none') {
    switch (classified.action) {
      case 'budget': {
        if (classified.amount === null) {
          return { kind: 'error', message: "Couldn't tell the new amount. Try rephrasing, e.g. \"change my budget to $500\"." };
        }
        const newAmount = classified.amount;
        const [sources, averageIncome] = await Promise.all([
          fetchIncomeSources(userId),
          fetchAverageMonthlyIncome(userId),
        ]);
        const primary = getPrimaryIncomeSource(sources);
        if (!primary) {
          return { kind: 'error', message: 'Add an income source first. A budget rides its pay cycle.' };
        }
        return {
          kind: 'edit',
          edit: {
            title: 'Change your budget?',
            oldLabel: primary.budgetAmount !== null ? `$${primary.budgetAmount.toFixed(2)}` : 'No budget set',
            newLabel: `$${newAmount.toFixed(2)}`,
            warning:
              averageIncome > 0 && newAmount > averageIncome
                ? `That's more than your average income ($${averageIncome.toFixed(2)}/mo). You can still confirm it.`
                : null,
            successMessage: `Budget updated to $${newAmount.toFixed(2)}.`,
            apply: () => updateSourceBudgetAmount(primary.id, newAmount),
          },
        };
      }
      case 'categoryBudget': {
        if (classified.amount === null || !classified.categoryId) {
          return {
            kind: 'error',
            message: 'Couldn\'t tell which category or amount. Try rephrasing, e.g. "set my groceries budget to $300".',
          };
        }
        const categoryId = classified.categoryId;
        const newAmount = classified.amount;
        const categoryName = categories.find((c) => c.id === categoryId)?.name ?? 'that category';
        const existingBudgets = await fetchCategoryBudgets(userId);
        const existing = existingBudgets.find((b) => b.categoryId === categoryId);
        return {
          kind: 'edit',
          edit: {
            title: `Change your ${categoryName} budget?`,
            oldLabel: existing ? `$${existing.amount.toFixed(2)}` : 'No cap set',
            newLabel: `$${newAmount.toFixed(2)}`,
            warning: null,
            successMessage: `${categoryName} budget updated to $${newAmount.toFixed(2)}.`,
            apply: () => setCategoryBudget(userId, categoryId, newAmount),
          },
        };
      }
      case 'displayName': {
        if (!classified.name) {
          return { kind: 'error', message: "Couldn't tell what name to use. Try rephrasing, e.g. \"change my name to Alex\"." };
        }
        const newName = classified.name;
        const profile = await fetchProfile(userId);
        return {
          kind: 'edit',
          edit: {
            title: 'Change your display name?',
            oldLabel: profile.display_name,
            newLabel: newName,
            warning: null,
            successMessage: `Name updated to ${newName}.`,
            apply: () => updateDisplayName(userId, newName),
          },
        };
      }
      case 'billAmount': {
        if (classified.amount === null || !classified.name) {
          return {
            kind: 'error',
            message: 'Couldn\'t tell which bill or amount. Try rephrasing, e.g. "change my rent to $480".',
          };
        }
        const newAmount = classified.amount;
        const needle = classified.name.toLowerCase();
        const bills = await fetchBills(userId);
        const match = bills.find((b) => b.name.toLowerCase().includes(needle));
        if (!match) {
          return { kind: 'error', message: `Couldn't find a bill named "${classified.name}".` };
        }
        return {
          kind: 'edit',
          edit: {
            title: `Change your ${match.name} bill?`,
            oldLabel: match.amount !== null ? `$${match.amount.toFixed(2)}` : 'Variable amount',
            newLabel: `$${newAmount.toFixed(2)}`,
            warning: null,
            successMessage: `${match.name} updated to $${newAmount.toFixed(2)}.`,
            apply: () =>
              updateBill(match.id, {
                name: match.name,
                categoryId: match.categoryId,
                isVariable: false,
                amount: newAmount,
                frequency: match.frequency,
                payWeekday: match.payWeekday,
                dayOfMonth: match.dayOfMonth,
              }),
          },
        };
      }
      case 'flatRename': {
        if (!classified.name) {
          return {
            kind: 'error',
            message: "Couldn't tell the new flat name. Try rephrasing, e.g. \"rename my flat to The Hideout\".",
          };
        }
        if (!flat) {
          return { kind: 'error', message: "You're not part of a flat yet." };
        }
        // Renaming is admin-only at the RLS level (same gate
        // flat.tsx's own rename control uses). The policy
        // silently updates 0 rows rather than erroring for a
        // non-admin, so this has to be checked up front or the
        // confirm would report a false success.
        if (members.find((m) => m.user_id === userId)?.role !== 'admin') {
          return { kind: 'error', message: 'Only the flat admin can rename it.' };
        }
        const newName = classified.name;
        return {
          kind: 'edit',
          edit: {
            title: 'Rename your flat?',
            oldLabel: flat.name,
            newLabel: newName,
            warning: null,
            successMessage: `Flat renamed to ${newName}.`,
            apply: () => renameFlat(flat.id, newName),
          },
        };
      }
      case 'settlement': {
        if (classified.amount === null || !classified.name || !classified.settlementDirection) {
          return {
            kind: 'error',
            message: 'Couldn\'t tell who paid whom or how much. Try rephrasing, e.g. "I paid Jo $20".',
          };
        }
        if (!flat) {
          return { kind: 'error', message: "You're not part of a flat yet." };
        }
        const otherMember = otherMembers.find(
          (m) => (m.profiles?.display_name ?? '').toLowerCase() === classified.name!.toLowerCase(),
        );
        if (!otherMember) {
          return { kind: 'error', message: `Couldn't find a flatmate named "${classified.name}".` };
        }
        const newAmount = classified.amount;
        const otherName = otherMember.profiles?.display_name ?? classified.name;
        const fromUser = classified.settlementDirection === 'i_paid' ? userId : otherMember.user_id;
        const toUser = classified.settlementDirection === 'i_paid' ? otherMember.user_id : userId;
        return {
          kind: 'edit',
          edit: {
            title:
              classified.settlementDirection === 'i_paid'
                ? `Record that you paid ${otherName}?`
                : `Record that ${otherName} paid you?`,
            oldLabel: 'Not recorded',
            newLabel: `$${newAmount.toFixed(2)}`,
            warning: null,
            successMessage: 'Recorded.',
            apply: () => recordSettlement({ flatId: flat.id, fromUser, toUser, amount: newAmount }),
          },
        };
      }
    }
  }
  // Classified as 'none' (or the classify call failed). Fall
  // through and let the caller try parsing it as an ordinary expense
  // instead, in case the hint just caught an oddly-phrased statement.
  return null;
}
