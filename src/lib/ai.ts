// Client for Tabby's AI features: auto-categorization, natural-language
// expense entry, and monthly insight summaries.
//
// This calls the `ai-proxy` Supabase Edge Function rather than Gemini
// directly. Earlier versions called Gemini straight from the app, which
// meant the API key shipped inside the app bundle -- fine for early dev
// but a real problem for anything actually distributed, since a published
// app binary can be decompiled and the key extracted. The proxy
// (supabase/functions/ai-proxy) holds the real Gemini key as a server
// secret; this file only ever sends the user's own Supabase session,
// which `supabase.functions.invoke` attaches automatically. All retry-on-
// transient-error logic now lives server-side in the proxy itself.

import { supabase } from '@/lib/supabase';

async function callGemini(input: string, schema: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke('ai-proxy', {
    body: { input, schema },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data.result;
}

export async function categorizeTransaction(
  description: string,
  categories: { id: string; name: string }[]
): Promise<string | null> {
  if (!description.trim() || categories.length === 0) return null;

  try {
    const result = (await callGemini(
      `Categorize this expense: "${description}". Choose the single best-fitting category name from this exact list: ${categories.map((c) => c.name).join(', ')}.`,
      {
        type: 'object',
        properties: { category: { type: 'string', enum: categories.map((c) => c.name) } },
        required: ['category'],
      }
    )) as { category: string };

    return categories.find((c) => c.name === result.category)?.id ?? null;
  } catch {
    return null; // fall back to manual category selection, never block the user
  }
}

export type ParsedExpense = {
  amount: number;
  description: string;
  merchant: string | null;
  categoryName: string | null;
};

// Handles both a single expense ("coffee $8.50") and a bulk list in one
// sentence ("coffee $8.50, breakfast $12.50, lunch $22.20") -- always
// returns an array so callers don't need two separate code paths.
export async function parseNaturalLanguageExpenses(
  text: string,
  categories: { id: string; name: string }[]
): Promise<ParsedExpense[] | null> {
  if (!text.trim()) return null;

  try {
    const result = (await callGemini(
      `Extract one or more expenses from this text -- it may describe a single purchase or a list of several, separated by commas or "and": "${text}". For each one: the description should be just what was purchased (e.g. "Coffee"), excluding any date words, dollar amounts, merchant names, or filler. If a specific shop/business/brand name is mentioned (e.g. "at Starbucks", "from Pak'nSave"), extract it separately as the merchant -- otherwise merchant is "None". Pick the best-fitting category from this exact list if one fits: ${categories.map((c) => c.name).join(', ')}.`,
      {
        type: 'object',
        properties: {
          expenses: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                amount: { type: 'number' },
                description: { type: 'string' },
                merchant: { type: 'string' },
                categoryName: { type: 'string', enum: [...categories.map((c) => c.name), 'None'] },
              },
              required: ['amount', 'description', 'merchant', 'categoryName'],
            },
          },
        },
        required: ['expenses'],
      }
    )) as {
      expenses: { amount: number; description: string; merchant: string; categoryName: string }[];
    };

    if (!result.expenses?.length) return null;

    return result.expenses.map((e) => ({
      amount: e.amount,
      description: e.description,
      merchant: e.merchant === 'None' || !e.merchant.trim() ? null : e.merchant,
      categoryName: e.categoryName === 'None' ? null : e.categoryName,
    }));
  } catch {
    return null;
  }
}

export async function generateMonthlySummary(params: {
  thisMonthTotal: number;
  lastMonthTotal: number;
  topCategories: { name: string; total: number }[];
}): Promise<string | null> {
  try {
    const result = (await callGemini(
      `Write a single short, friendly sentence (max 25 words) summarizing this person's spending this month compared to last month. This month: $${params.thisMonthTotal.toFixed(2)}. Last month: $${params.lastMonthTotal.toFixed(2)}. Top categories this month: ${params.topCategories.map((c) => `${c.name} $${c.total.toFixed(2)}`).join(', ') || 'none yet'}.`,
      {
        type: 'object',
        properties: { summary: { type: 'string' } },
        required: ['summary'],
      }
    )) as { summary: string };

    return result.summary;
  } catch {
    return null;
  }
}
