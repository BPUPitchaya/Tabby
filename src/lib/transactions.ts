import { supabase } from '@/lib/supabase';

export type Category = {
  id: string;
  name: string;
  icon: string | null;
};

export type Transaction = {
  id: string;
  amount: number;
  description: string | null;
  occurred_at: string;
  category_id: string | null;
  categories: Category | null;
};

export async function fetchCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, icon')
    .order('name', { ascending: true });

  if (error) throw error;
  return data as Category[];
}

export async function fetchTransactions(userId: string) {
  const { data, error } = await supabase
    .from('transactions')
    .select('id, amount, description, occurred_at, category_id, categories(id, name, icon)')
    .eq('user_id', userId)
    .order('occurred_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as unknown as Transaction[];
}

export async function addTransaction(params: {
  userId: string;
  amount: number;
  description: string;
  categoryId: string | null;
  occurredAt: string;
}) {
  const { error } = await supabase.from('transactions').insert({
    user_id: params.userId,
    amount: params.amount,
    description: params.description || null,
    category_id: params.categoryId,
    occurred_at: params.occurredAt,
  });

  if (error) throw error;
}

export async function updateTransaction(
  id: string,
  params: {
    amount: number;
    description: string;
    categoryId: string | null;
    occurredAt: string;
  }
) {
  const { error } = await supabase
    .from('transactions')
    .update({
      amount: params.amount,
      description: params.description || null,
      category_id: params.categoryId,
      occurred_at: params.occurredAt,
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
  rows: { amount: number; description: string; occurredAt: string; categoryId?: string | null }[]
) {
  const { error } = await supabase.from('transactions').insert(
    rows.map((r) => ({
      user_id: userId,
      amount: r.amount,
      description: r.description || null,
      category_id: r.categoryId ?? null,
      occurred_at: r.occurredAt,
    }))
  );
  if (error) throw error;
}
