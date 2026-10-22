// Savings goals -- save toward something specific ("$500 for a trip by
// March"), tracked via real logged contributions rather than a single
// mutable "amount saved" field, so a correction never silently overwrites
// history. See 0043_add_savings_goals.sql for the two-table shape and
// why contribution ownership runs through the parent goal.
import { supabase } from '@/lib/supabase';

export type SavingsGoal = {
  id: string;
  name: string;
  targetAmount: number;
  targetDate: string | null; // YYYY-MM-DD
};

export type GoalWithProgress = SavingsGoal & { saved: number };

export type GoalContribution = {
  id: string;
  goalId: string;
  amount: number;
  occurredAt: string;
};

function goalFromRow(row: {
  id: string;
  name: string;
  target_amount: number;
  target_date: string | null;
}): SavingsGoal {
  return { id: row.id, name: row.name, targetAmount: row.target_amount, targetDate: row.target_date };
}

function contributionFromRow(row: {
  id: string;
  goal_id: string;
  amount: number;
  occurred_at: string;
}): GoalContribution {
  return { id: row.id, goalId: row.goal_id, amount: row.amount, occurredAt: row.occurred_at };
}

export async function fetchGoals(userId: string): Promise<SavingsGoal[]> {
  const { data, error } = await supabase
    .from('savings_goals')
    .select('id, name, target_amount, target_date')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(goalFromRow);
}

// One extra query (all this user's contributions, filtered by goal id),
// not N -- same reasoning as every other list screen in this app that
// needs a per-row aggregate.
export async function fetchGoalsWithProgress(userId: string): Promise<GoalWithProgress[]> {
  const goals = await fetchGoals(userId);
  if (goals.length === 0) return [];

  const { data, error } = await supabase
    .from('savings_goal_contributions')
    .select('goal_id, amount')
    .in(
      'goal_id',
      goals.map((g) => g.id),
    );
  if (error) throw error;

  const savedByGoal = new Map<string, number>();
  for (const row of data ?? []) {
    savedByGoal.set(row.goal_id, (savedByGoal.get(row.goal_id) ?? 0) + row.amount);
  }

  return goals.map((g) => ({
    ...g,
    saved: Math.round((savedByGoal.get(g.id) ?? 0) * 100) / 100,
  }));
}

export async function createGoal(
  userId: string,
  params: { name: string; targetAmount: number; targetDate: string | null },
): Promise<string> {
  const { data, error } = await supabase
    .from('savings_goals')
    .insert({ user_id: userId, name: params.name, target_amount: params.targetAmount, target_date: params.targetDate })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function updateGoal(
  goalId: string,
  params: { name: string; targetAmount: number; targetDate: string | null },
): Promise<void> {
  const { error } = await supabase
    .from('savings_goals')
    .update({ name: params.name, target_amount: params.targetAmount, target_date: params.targetDate })
    .eq('id', goalId);
  if (error) throw error;
}

export async function deleteGoal(goalId: string): Promise<void> {
  const { error } = await supabase.from('savings_goals').delete().eq('id', goalId);
  if (error) throw error;
}

export async function fetchContributions(goalId: string): Promise<GoalContribution[]> {
  const { data, error } = await supabase
    .from('savings_goal_contributions')
    .select('id, goal_id, amount, occurred_at')
    .eq('goal_id', goalId)
    .order('occurred_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(contributionFromRow);
}

export async function addContribution(goalId: string, amount: number): Promise<void> {
  const { error } = await supabase.from('savings_goal_contributions').insert({ goal_id: goalId, amount });
  if (error) throw error;
}

export async function deleteContribution(contributionId: string): Promise<void> {
  const { error } = await supabase.from('savings_goal_contributions').delete().eq('id', contributionId);
  if (error) throw error;
}

// Pure, over an already-fetched list -- same split-for-testability
// pattern as computeDashboardFromRows, so the sum is never a stored
// running total that could drift from the real contribution rows.
export function totalSaved(contributions: GoalContribution[]): number {
  return Math.round(contributions.reduce((sum, c) => sum + c.amount, 0) * 100) / 100;
}

export function daysUntilTarget(targetDate: string | null, now: Date = new Date()): number | null {
  if (!targetDate) return null;
  const target = new Date(`${targetDate}T00:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}
