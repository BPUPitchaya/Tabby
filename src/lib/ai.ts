// Gemini API client for Tabby's AI features: auto-categorization,
// natural-language expense entry, and monthly insight summaries.
//
// NOTE on architecture: this calls the Gemini API directly from the app,
// which means the API key ships inside the app bundle. That's an accepted
// tradeoff for this MVP (free tier, no billing risk -- worst case someone
// else burns the rate limit) rather than standard practice for production
// (where this key should sit behind a server-side proxy, e.g. a Supabase
// Edge Function). Documented here and in the R&D report as a known
// limitation / future work item.

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';

async function callGemini(input: string, schema: Record<string, unknown>): Promise<unknown> {
  if (!GEMINI_API_KEY) {
    throw new Error('Missing EXPO_PUBLIC_GEMINI_API_KEY.');
  }

  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: {
      'x-goog-api-key': GEMINI_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gemini-3.8-flash',
      input,
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const outputStep = data.steps?.find((s: { type: string }) => s.type === 'model_output');
  const text = outputStep?.content?.[0]?.text;
  if (!text) throw new Error('Gemini returned no output.');

  return JSON.parse(text);
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
  categoryName: string | null;
};

export async function parseNaturalLanguageExpense(
  text: string,
  categories: { id: string; name: string }[]
): Promise<ParsedExpense | null> {
  if (!text.trim()) return null;

  try {
    const result = (await callGemini(
      `Extract an expense from this sentence: "${text}". Pick the best-fitting category from this exact list if one fits: ${categories.map((c) => c.name).join(', ')}. If no date is mentioned, assume today.`,
      {
        type: 'object',
        properties: {
          amount: { type: 'number' },
          description: { type: 'string' },
          categoryName: { type: 'string', enum: [...categories.map((c) => c.name), 'None'] },
        },
        required: ['amount', 'description', 'categoryName'],
      }
    )) as { amount: number; description: string; categoryName: string };

    return {
      amount: result.amount,
      description: result.description,
      categoryName: result.categoryName === 'None' ? null : result.categoryName,
    };
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
