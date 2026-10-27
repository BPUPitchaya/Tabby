// Pure date/filter/grouping helpers for the Transactions screen -- moved
// out of transactions.tsx so the screen file only holds UI and wiring.
import type { Transaction } from '@/lib/transactions';

// Local calendar date, not UTC -- Date#toISOString() converts to UTC first,
// which can shift the date by a day in timezones behind/ahead of it (same
// footgun the toISODate helper in lib/profile.ts exists to avoid).
export function toLocalISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Shared by the search screen's filters and the quick-add composer's
// spending-question answers -- both narrow the same transaction list by
// the same {category, keyword, date range} shape (lib/ai.ts's
// ParsedSpendingQuery), so the matching logic lives in one place.
export function filterTransactionsByQuery(
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

export type DaySection = { title: string; net: number; data: Transaction[] };

// Groups already-sorted (occurred_at desc) transactions into day sections,
// each carrying its own net (income minus expense) for the section header.
export function groupByDay(transactions: Transaction[], todayISO: string): DaySection[] {
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
