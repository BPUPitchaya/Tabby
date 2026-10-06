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
// 'latest' alias rather than a pinned version -- Google points this at
// whichever current lite model is healthy/well-provisioned. Switched from
// the pinned 'gemini-3.8-flash', which was hitting sustained 503s (not a
// brief spike -- confirmed failing consistently across a full day of
// testing), while this alias (currently resolving to gemini-3.5-flash-lite)
// succeeded reliably across repeated tests. Lite is also a better fit for
// our tasks anyway: simple categorization/extraction, not complex reasoning.
const GEMINI_MODEL = 'gemini-flash-lite-latest';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function callGeminiOnce(input: string, schema: Record<string, unknown>): Promise<unknown> {
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
      model: GEMINI_MODEL,
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

// Gemini's flash model occasionally returns a transient 503 under demand
// spikes (observed directly during dev/testing, not a one-off). One quick
// retry clears most of these without the user ever noticing, rather than
// immediately falling back to manual entry on what's usually a non-issue.
async function callGemini(input: string, schema: Record<string, unknown>): Promise<unknown> {
  try {
    return await callGeminiOnce(input, schema);
  } catch (err) {
    const isServerError = err instanceof Error && /Gemini API error: 5\d\d/.test(err.message);
    if (!isServerError) throw err;
    await sleep(800);
    return await callGeminiOnce(input, schema);
  }
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
      `Extract one or more expenses from this text -- it may describe a single purchase or a list of several, separated by commas or "and": "${text}". For each one, the description should be just what was purchased (e.g. "Coffee"), excluding any date words, dollar amounts, or filler. Pick the best-fitting category from this exact list if one fits: ${categories.map((c) => c.name).join(', ')}.`,
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
                categoryName: { type: 'string', enum: [...categories.map((c) => c.name), 'None'] },
              },
              required: ['amount', 'description', 'categoryName'],
            },
          },
        },
        required: ['expenses'],
      }
    )) as { expenses: { amount: number; description: string; categoryName: string }[] };

    if (!result.expenses?.length) return null;

    return result.expenses.map((e) => ({
      amount: e.amount,
      description: e.description,
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
