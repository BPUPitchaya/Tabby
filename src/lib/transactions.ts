import { supabase } from '@/lib/supabase';

export type CategoryType = 'expense' | 'income';

export type Category = {
  id: string;
  name: string;
  icon: string | null;
  type: CategoryType;
};

export type Transaction = {
  id: string;
  amount: number;
  description: string | null;
  merchant: string | null;
  occurred_at: string;
  category_id: string | null;
  is_income: boolean;
  categories: Category | null;
};

export async function fetchCategories(type: CategoryType) {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, icon, type')
    .eq('type', type)
    .order('name', { ascending: true });

  if (error) throw error;
  return data as Category[];
}

// Case-insensitive duplicate check against this user's OWN categories only
// -- a custom "Groceries" still collides with another custom "groceries"
// the user made earlier, but never with the fixed global default of the
// same name (that's a different row, user_id null, not something this
// check should block re-adding a personal variant of).
export async function createCategory(
  userId: string,
  name: string,
  icon: string,
  type: CategoryType,
): Promise<Category> {
  const trimmed = name.trim();
  const { data: existing, error: fetchError } = await supabase
    .from('categories')
    .select('id')
    .eq('user_id', userId)
    .eq('type', type)
    .ilike('name', trimmed);
  if (fetchError) throw fetchError;
  if (existing && existing.length > 0) {
    throw new Error(`You already have a category named "${trimmed}".`);
  }

  const { data, error } = await supabase
    .from('categories')
    .insert({ user_id: userId, name: trimmed, icon, type })
    .select('id, name, icon, type')
    .single();
  if (error) throw error;
  return data as Category;
}

export async function fetchTransactions(userId: string) {
  const { data, error } = await supabase
    .from('transactions')
    .select(
      'id, amount, description, merchant, occurred_at, category_id, is_income, categories(id, name, icon, type)',
    )
    .eq('user_id', userId)
    .order('occurred_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as unknown as Transaction[];
}

// Exactly one category, within exactly one date range -- used by Budget's
// "what did I spend this on" drill-down (budget-modal.tsx), which needs
// the real pay-cycle window, not an approximation like a calendar month.
export async function fetchTransactionsForCategoryInRange(
  userId: string,
  categoryId: string,
  startDate: string,
  endDate: string,
): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select(
      'id, amount, description, merchant, occurred_at, category_id, is_income, categories(id, name, icon, type)',
    )
    .eq('user_id', userId)
    .eq('category_id', categoryId)
    .gte('occurred_at', startDate)
    .lt('occurred_at', endDate)
    .order('occurred_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as unknown as Transaction[];
}

// Powers merchant autocomplete: your own past merchant names, most
// recently used first, deduped. No external lookup -- just your own data.
export async function fetchRecentMerchants(userId: string, limit = 8): Promise<string[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('merchant, created_at')
    .eq('user_id', userId)
    .not('merchant', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50); // pull a bit extra so dedup still leaves `limit` distinct names

  if (error) throw error;

  const seen = new Set<string>();
  const result: string[] = [];
  for (const row of data ?? []) {
    const merchant = row.merchant as string;
    if (!seen.has(merchant)) {
      seen.add(merchant);
      result.push(merchant);
    }
    if (result.length >= limit) break;
  }
  return result;
}

export async function addTransaction(params: {
  userId: string;
  amount: number;
  description: string;
  merchant?: string | null;
  categoryId: string | null;
  occurredAt: string;
  isIncome?: boolean;
}) {
  const { error } = await supabase.from('transactions').insert({
    user_id: params.userId,
    amount: params.amount,
    description: params.description || null,
    merchant: params.merchant?.trim() || null,
    category_id: params.categoryId,
    occurred_at: params.occurredAt,
    is_income: params.isIncome ?? false,
  });

  if (error) throw error;
}

export async function updateTransaction(
  id: string,
  params: {
    amount: number;
    description: string;
    merchant?: string | null;
    categoryId: string | null;
    occurredAt: string;
    isIncome?: boolean;
  },
) {
  const { error } = await supabase
    .from('transactions')
    .update({
      amount: params.amount,
      description: params.description || null,
      merchant: params.merchant?.trim() || null,
      category_id: params.categoryId,
      occurred_at: params.occurredAt,
      is_income: params.isIncome ?? false,
    })
    .eq('id', id);

  if (error) throw error;
}

export async function deleteTransaction(id: string) {
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) throw error;
}

export async function bulkAddTransactions(
  userId: string,
  rows: {
    amount: number;
    description: string;
    merchant?: string | null;
    occurredAt: string;
    categoryId?: string | null;
    isIncome?: boolean;
  }[],
) {
  const { error } = await supabase.from('transactions').insert(
    rows.map((r) => ({
      user_id: userId,
      amount: r.amount,
      description: r.description || null,
      merchant: r.merchant?.trim() || null,
      category_id: r.categoryId ?? null,
      occurred_at: r.occurredAt,
      is_income: r.isIncome ?? false,
    })),
  );
  if (error) throw error;
}
