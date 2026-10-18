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

// A plain string for text-only prompts, or an array of content parts for
// multimodal input (receipt/statement scanning) -- see ai-proxy/index.ts.
type GeminiInput = string | Record<string, unknown>[];

async function callGemini(input: GeminiInput, schema: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke('ai-proxy', {
    body: { input, schema },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data.result;
}

export async function categorizeTransaction(
  description: string,
  categories: { id: string; name: string }[],
): Promise<string | null> {
  if (!description.trim() || categories.length === 0) return null;

  try {
    const result = (await callGemini(
      `Categorize this expense: "${description}". Choose the single best-fitting category name from this exact list: ${categories.map((c) => c.name).join(', ')}.`,
      {
        type: 'object',
        properties: { category: { type: 'string', enum: categories.map((c) => c.name) } },
        required: ['category'],
      },
    )) as { category: string };

    return categories.find((c) => c.name === result.category)?.id ?? null;
  } catch {
    return null; // fall back to manual category selection, never block the user
  }
}

// Picks a starting icon for a new custom category from its name, so
// creating one isn't always the same generic tag icon until the user
// manually taps through the grid -- they can still override it before
// saving. `icons` is CUSTOM_CATEGORY_ICONS from category-icon.tsx, kept
// as a plain string[] param here so lib/ai.ts doesn't import a component.
export async function suggestCategoryIcon(name: string, icons: string[]): Promise<string | null> {
  if (!name.trim() || icons.length === 0) return null;

  try {
    const result = (await callGemini(
      `Pick the single best-fitting icon for a personal finance category named "${name}". Choose from this exact list: ${icons.join(', ')}.`,
      {
        type: 'object',
        properties: { icon: { type: 'string', enum: icons } },
        required: ['icon'],
      },
    )) as { icon: string };

    return icons.includes(result.icon) ? result.icon : null;
  } catch {
    return null; // fall back to whatever icon is already selected, never block the user
  }
}

// Past this many rows, a CSV import stops requesting AI categories --
// one prompt already holding a few hundred descriptions is plenty of
// tokens; the rest just come back uncategorized, same as before this
// feature existed (never a hard failure, just no suggestion).
const CSV_CATEGORIZE_CAP = 150;

// One batched call for a whole CSV import, not one call per row -- an
// import can be a few hundred transactions, and categorizeTransaction's
// one-call-per-description shape would mean a few hundred round trips.
// Same enum-constrained schema shape as categorizeTransaction, just an
// array in and an array out, same order as `descriptions`.
export async function categorizeTransactionsBatch(
  descriptions: string[],
  categories: { id: string; name: string }[],
): Promise<(string | null)[]> {
  if (descriptions.length === 0 || categories.length === 0) return descriptions.map(() => null);

  const capped = descriptions.slice(0, CSV_CATEGORIZE_CAP);

  try {
    const result = (await callGemini(
      `For each of these transaction descriptions, pick the single best-fitting category name from this exact list, in the same order as given: ${categories.map((c) => c.name).join(', ')}. If nothing fits well for one, use "None" for that one.\n\n${capped.map((d, i) => `${i + 1}. ${d.trim() || '(no description)'}`).join('\n')}`,
      {
        type: 'object',
        properties: {
          categories: {
            type: 'array',
            items: { type: 'string', enum: [...categories.map((c) => c.name), 'None'] },
          },
        },
        required: ['categories'],
      },
    )) as { categories: string[] };

    const resolved = capped.map((_, i) => {
      const name = result.categories?.[i];
      return name && name !== 'None' ? (categories.find((c) => c.name === name)?.id ?? null) : null;
    });
    // Rows past the cap, if any, just get no suggestion.
    return [...resolved, ...descriptions.slice(CSV_CATEGORIZE_CAP).map(() => null)];
  } catch {
    return descriptions.map(() => null);
  }
}

export type ParsedExpense = {
  amount: number;
  description: string;
  merchant: string | null;
  categoryName: string | null;
  isIncome: boolean;
  occurredAt: string; // 'YYYY-MM-DD'
};

type RawParsedExpense = {
  amount: number;
  description: string;
  merchant: string;
  categoryName: string;
  isIncome: boolean;
  occurredAt: string;
};

// Shared by parseNaturalLanguageExpenses and parseFinancialDocument -- both
// extract the same shape, one from text, one from an image/PDF.
function expensesSchema(categories: { id: string; name: string }[]) {
  return {
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
            isIncome: { type: 'boolean' },
            occurredAt: { type: 'string', description: 'YYYY-MM-DD' },
          },
          required: ['amount', 'description', 'merchant', 'categoryName', 'isIncome', 'occurredAt'],
        },
      },
    },
    required: ['expenses'],
  };
}

function mapRawExpenses(expenses: RawParsedExpense[] | undefined): ParsedExpense[] | null {
  if (!expenses?.length) return null;
  return expenses.map((e) => ({
    amount: e.amount,
    isIncome: e.isIncome,
    occurredAt: e.occurredAt,
    description: e.description,
    merchant: e.merchant === 'None' || !e.merchant.trim() ? null : e.merchant,
    categoryName: e.categoryName === 'None' ? null : e.categoryName,
  }));
}

// Handles both a single expense ("coffee $8.50") and a bulk list in one
// sentence ("coffee $8.50, breakfast $12.50, lunch $22.20") -- always
// returns an array so callers don't need two separate code paths. Despite
// the function's name (kept for now to avoid a wider rename), this also
// picks up income lines ("got $500 for my birthday") -- isIncome is model-
// judged per item, same as the manual form's Expense/Income toggle, so a
// mixed quick-add like "got $500 for my bday, spent $20 on lunch" comes
// back correctly split.
export async function parseNaturalLanguageExpenses(
  text: string,
  categories: { id: string; name: string }[],
): Promise<ParsedExpense[] | null> {
  if (!text.trim()) return null;

  try {
    const today = new Date().toISOString().slice(0, 10);
    const result = (await callGemini(
      `Today's date is ${today}. Extract one or more transactions from this text -- it may describe a single purchase or payment, or a list of several, separated by commas or "and": "${text}". For each one, decide isIncome: true if money came IN (a gift, salary, refund, being paid back, selling something), false if money went OUT (a purchase, bill, payment). The description should be just what the money was for (e.g. "Coffee", "Birthday gift"), excluding any date words, dollar amounts, merchant names, or filler. If a specific shop/business/brand/person name is mentioned (e.g. "at Starbucks", "from Pak'nSave"), extract it separately as the merchant -- otherwise merchant is "None". Pick the best-fitting category from this exact list if one fits: ${categories.map((c) => c.name).join(', ')}. For the date: if a specific day is mentioned ("on the 9th of September", "yesterday", "last Tuesday", "July 10th"), resolve it to YYYY-MM-DD relative to today's date above -- for a month/day with no year, assume this year unless that would be in the future, in which case assume last year (these are things that already happened). If no date is mentioned at all, use today's date.`,
      expensesSchema(categories),
    )) as { expenses: RawParsedExpense[] };

    return mapRawExpenses(result.expenses);
  } catch {
    return null;
  }
}

// Scans a photographed/uploaded receipt or a bank/card statement (image or
// PDF) and extracts every line as its own transaction -- a receipt's line
// items individually (not just the total), or a statement's rows. Shares
// the quick-add preview flow in transactions.tsx: same ParsedExpense[]
// shape as parseNaturalLanguageExpenses, just sourced from a document
// instead of typed text.
export async function parseFinancialDocument(
  base64Data: string,
  mimeType: string,
  categories: { id: string; name: string }[],
): Promise<ParsedExpense[] | null> {
  if (!base64Data) return null;

  try {
    const today = new Date().toISOString().slice(0, 10);
    const partType = mimeType === 'application/pdf' ? 'document' : 'image';
    const result = (await callGemini(
      [
        {
          type: 'text',
          text: `Today's date is ${today}. This is either a single receipt or a bank/card statement listing several transactions. If it's a receipt, extract EACH purchased line item as its own transaction with its own amount and description -- not just the total -- but skip subtotal, tax, tip, and total/change lines unless they're each itemized as their own entry on the receipt (if tax or tip appears as a separate line, include it as its own transaction described "Tax" or "Tip"). If it's a bank/card statement, extract each transaction row. For each transaction, decide isIncome: true if money came IN (a deposit, refund, transfer in, salary), false if money went OUT (a purchase, bill, payment, transfer out). The description should be just what the money was for, excluding dollar amounts or filler. If a merchant/shop/business name is identifiable for a line, extract it as merchant -- otherwise merchant is "None" (for a receipt, the merchant at the top usually applies to every line item). Pick the best-fitting category from this exact list if one fits: ${categories.map((c) => c.name).join(', ')}. For the date: use the date printed on the document if there is one, resolved to YYYY-MM-DD (assume this year unless that would be in the future, in which case assume last year); if no date is legible at all, use today's date. If the image is unreadable or has no transactions, return an empty list.`,
        },
        { type: partType, data: base64Data, mime_type: mimeType },
      ],
      expensesSchema(categories),
    )) as { expenses: RawParsedExpense[] };

    return mapRawExpenses(result.expenses);
  } catch {
    return null;
  }
}

export type ParsedBillSplit = {
  title: string;
  merchant: string | null;
  totalAmount: number;
  occurredAt: string; // 'YYYY-MM-DD'
  categoryName: string | null;
  // amount null = this person's share isn't specified, split what's left
  // of the total evenly among everyone with a null amount (handled by the
  // split screen itself, not here -- this just reports what was said).
  participants: { name: string; amount: number | null }[];
};

// Only called when a cheap local keyword check (transactions.tsx) thinks a
// quick-add message might describe a group split rather than a personal
// expense -- avoids a second AI round trip on every ordinary "coffee
// $8.50". Returns null (not an error) when the text turns out not to
// actually name a total and people to split it with, so the caller can
// fall back to the regular parseNaturalLanguageExpenses path.
export async function parseBillSplit(
  text: string,
  categories: { id: string; name: string }[],
): Promise<ParsedBillSplit | null> {
  if (!text.trim()) return null;

  try {
    const today = new Date().toISOString().slice(0, 10);
    const result = (await callGemini(
      `Today's date is ${today}. Decide whether this text describes splitting a bill or expense among a group of people: "${text}". It does if it names a total amount AND one or more other people to split it with (e.g. "split dinner $200 with Sarah and Tom", "drinks $80, me and Alex and Jo each pay a third", "Sarah owes me $50 and Tom owes $70 for the cabin"). It does NOT if it's just a personal purchase, even one mentioning a company/person as a merchant (e.g. "coffee with Sarah $8.50" is one person's own expense, not a split -- only extract participants if money is actually being divided or owed back). If it's not a split, return isSplit: false and leave the other fields empty. If it is a split: title is a short label for what it was (e.g. "Dinner", "Cabin"); merchant is a shop/venue name if mentioned, else null; totalAmount is the whole bill, not any one person's share; for each OTHER person mentioned (never include the message's author/"me"), give their name and, if a specific amount or fraction for them was stated, their amount in dollars -- otherwise null (meaning split evenly). Pick the best-fitting category from this exact list: ${categories.map((c) => c.name).join(', ')} -- pick "Other" if nothing fits well, never leave it blank. Resolve any date mentioned to YYYY-MM-DD relative to today, else use today.`,
      {
        type: 'object',
        properties: {
          isSplit: { type: 'boolean' },
          title: { type: 'string' },
          merchant: { type: 'string' },
          totalAmount: { type: 'number' },
          occurredAt: { type: 'string', description: 'YYYY-MM-DD' },
          categoryName: { type: 'string', enum: categories.map((c) => c.name) },
          participants: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                amount: { type: 'number' },
              },
              required: ['name', 'amount'],
            },
          },
        },
        required: [
          'isSplit',
          'title',
          'merchant',
          'totalAmount',
          'occurredAt',
          'categoryName',
          'participants',
        ],
      },
    )) as {
      isSplit: boolean;
      title: string;
      merchant: string;
      totalAmount: number;
      occurredAt: string;
      categoryName: string;
      participants: { name: string; amount: number }[];
    };

    if (!result.isSplit || !result.participants?.length || result.totalAmount <= 0) return null;

    return {
      title: result.title || 'Bill',
      merchant: result.merchant === 'None' || !result.merchant?.trim() ? null : result.merchant,
      totalAmount: result.totalAmount,
      occurredAt: result.occurredAt,
      categoryName: result.categoryName || null,
      participants: result.participants.map((p) => ({
        name: p.name,
        amount: p.amount > 0 ? p.amount : null,
      })),
    };
  } catch {
    return null;
  }
}

// Phase 6 of the income-sources plan: natural-language PAID hours entry
// for an hourly income source's bell confirm -- "40" still parses locally
// for free (see notifications-modal.tsx, which tries plain parseFloat
// first and only calls this when that fails). This exists for phrasing a
// plain number can't express: "32 plus 8 sick", "4 full days", "worked
// Mon-Thu, 8 hours each". "Paid" hours, not "worked" -- paid leave (sick,
// annual, public holiday) still counts, same distinction as the bell's
// own copy. Never guesses a number that isn't actually stated -- returns
// null rather than invent one, so the user re-types instead of silently
// logging a wrong figure (same risk class as the tax-code/wage-rate AI
// uses this project explicitly ruled out).
export async function parsePaidHours(text: string): Promise<number | null> {
  if (!text.trim()) return null;

  try {
    const result = (await callGemini(
      `Extract the total number of PAID hours from this description of a pay period: "${text}". This includes hours actually worked AND any paid leave (sick, annual/holiday, public holiday) mentioned -- it should be the total hours this person was paid for, not just hours physically worked. If a number of days is given instead of hours (e.g. "4 full days"), assume an 8-hour day unless stated otherwise. If no usable number of hours can be determined at all, return -1 -- never guess a number that isn't actually stated.`,
      {
        type: 'object',
        properties: { hours: { type: 'number' } },
        required: ['hours'],
      },
    )) as { hours: number };

    return result.hours === -1 ? null : result.hours;
  } catch {
    return null;
  }
}

export type ParsedPayslip = {
  grossPay: number | null;
  netPay: number | null;
  // Hours this pay period covered, for an hourly job -- null for a salaried
  // payslip with no hourly breakdown, or if it's just not legible.
  hoursPaid: number | null;
};

// Phase 6: reads a photographed/uploaded payslip as ground truth -- same
// infra as parseFinancialDocument (document-scan.ts's presentScanSheet),
// just a different extraction target and schema. This is read-only
// evidence the user still reviews and can edit before confirming a
// payday; it never decides a tax code or a wage rate itself (that AI use
// was explicitly ruled out earlier in this project's design -- too risky
// with real money, same reasoning as never guessing hours above).
export async function parsePayslip(base64Data: string, mimeType: string): Promise<ParsedPayslip | null> {
  if (!base64Data) return null;

  try {
    const partType = mimeType === 'application/pdf' ? 'document' : 'image';
    const result = (await callGemini(
      [
        {
          type: 'text',
          text: `This is a photographed or scanned payslip/payslip summary. Extract: grossPay (gross/before-tax pay for this pay period), netPay (net/take-home pay for this pay period), and hoursPaid (total hours this pay period covers, if the payslip states an hourly breakdown, including any paid leave hours listed). For any of these three not legible or not present on the payslip, return -1 for that field -- never guess a figure that isn't actually printed on it.`,
        },
        { type: partType, data: base64Data, mime_type: mimeType },
      ],
      {
        type: 'object',
        properties: {
          grossPay: { type: 'number' },
          netPay: { type: 'number' },
          hoursPaid: { type: 'number' },
        },
        required: ['grossPay', 'netPay', 'hoursPaid'],
      },
    )) as { grossPay: number; netPay: number; hoursPaid: number };

    const grossPay = result.grossPay === -1 ? null : result.grossPay;
    const netPay = result.netPay === -1 ? null : result.netPay;
    const hoursPaid = result.hoursPaid === -1 ? null : result.hoursPaid;
    if (grossPay === null && netPay === null && hoursPaid === null) return null;
    return { grossPay, netPay, hoursPaid };
  } catch {
    return null;
  }
}

export async function generateMonthlySummary(params: {
  thisMonthTotal: number;
  lastMonthTotal: number;
  topCategories: { name: string; total: number }[];
  // The single biggest category swing from last month, if one clears the
  // noise threshold (see findNotableCategorySwing in dashboard.ts) -- null
  // when nothing moved enough to be worth calling out specifically.
  notableSwing?: { name: string; thisMonthTotal: number; lastMonthTotal: number } | null;
}): Promise<string | null> {
  try {
    const swingLine = params.notableSwing
      ? ` Notably, ${params.notableSwing.name} went from $${params.notableSwing.lastMonthTotal.toFixed(2)} to $${params.notableSwing.thisMonthTotal.toFixed(2)} -- mention this specific swing if it fits naturally, otherwise just compare the overall totals.`
      : '';
    const result = (await callGemini(
      `Write a single short, friendly sentence (max 25 words) summarizing this person's spending this month compared to last month. Do not use a dash or hyphen anywhere in the sentence; use separate sentences or "and"/"but" instead. This month: $${params.thisMonthTotal.toFixed(2)}. Last month: $${params.lastMonthTotal.toFixed(2)}. Top categories this month: ${params.topCategories.map((c) => `${c.name} $${c.total.toFixed(2)}`).join(', ') || 'none yet'}.${swingLine}`,
      {
        type: 'object',
        properties: { summary: { type: 'string' } },
        required: ['summary'],
      },
    )) as { summary: string };

    return result.summary;
  } catch {
    return null;
  }
}
