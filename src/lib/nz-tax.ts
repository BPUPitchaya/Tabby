// Phase 4: NZ PAYE estimate engine. Pure functions only -- this never
// calls anything, it just turns a gross pay + tax-code setup into an
// estimated take-home figure, same "estimate only, check your payslip"
// framing already shown in income-sources-modal.tsx.
//
// Deliberately NOT modeled (see session design notes / non-goals):
// - The ACC earner levy's annual income cap (combined across jobs, only
//   reconciled at tax-return time) -- always applies the flat rate.
// - Any AI involvement in picking a tax code or rate -- this is a plain
//   calculator the user's own tax-code choice drives.
// Rates below are the 2024/25 NZ figures as a reasonable estimate baseline;
// they're not re-fetched from IRD and will drift as rates change -- same
// caveat as the UI's own "estimate only" disclaimer.
import type { IncomeFrequency } from '@/lib/profile';

export type NzTaxCode = 'M' | 'ME' | 'S' | 'SB' | 'SH' | 'ST';

export type NetPayBreakdown = {
  grossPay: number;
  incomeTax: number;
  accLevy: number;
  studentLoan: number;
  kiwiSaver: number;
  netPay: number;
};

// Progressive brackets, applied to the annualized equivalent of one pay --
// this mirrors how IRD's own per-period PAYE tables work (annualize, tax
// the annual figure, divide back down), rather than taxing the single pay
// amount against full-year thresholds directly.
const PAYE_BRACKETS: { upTo: number; rate: number }[] = [
  { upTo: 15_600, rate: 0.105 },
  { upTo: 53_500, rate: 0.175 },
  { upTo: 78_100, rate: 0.3 },
  { upTo: 180_000, rate: 0.33 },
  { upTo: Infinity, rate: 0.39 },
];

// Secondary-income codes use a single flat rate instead of the progressive
// table -- the lower brackets are assumed already used up by the primary
// (M/ME) job, so IRD's own secondary tax tables apply one rate per code
// straight to the period amount, no annualizing needed.
const SECONDARY_FLAT_RATES: Record<'S' | 'SB' | 'SH' | 'ST', number> = {
  SB: 0.105,
  S: 0.175,
  SH: 0.3,
  ST: 0.33,
};

const ACC_EARNER_LEVY_RATE = 0.016;
const STUDENT_LOAN_RATE = 0.12;
const STUDENT_LOAN_ANNUAL_THRESHOLD = 24_128;

function periodsPerYear(frequency: IncomeFrequency): number {
  if (frequency === 'weekly') return 52;
  if (frequency === 'biweekly') return 26;
  return 12;
}

function payeOnAnnual(annualIncome: number): number {
  let tax = 0;
  let lower = 0;
  for (const bracket of PAYE_BRACKETS) {
    if (annualIncome <= lower) break;
    const taxableInBand = Math.min(annualIncome, bracket.upTo) - lower;
    tax += taxableInBand * bracket.rate;
    lower = bracket.upTo;
  }
  return tax;
}

function computeIncomeTax(grossPay: number, taxCode: NzTaxCode, frequency: IncomeFrequency): number {
  if (taxCode === 'M' || taxCode === 'ME') {
    const periods = periodsPerYear(frequency);
    const annualTax = payeOnAnnual(grossPay * periods);
    return annualTax / periods;
  }
  return grossPay * SECONDARY_FLAT_RATES[taxCode];
}

// ME is the only code exempt from the ACC earner levy (already covered
// another way) -- every other code pays it, M included.
function computeAccLevy(grossPay: number, taxCode: NzTaxCode): number {
  if (taxCode === 'ME') return 0;
  return grossPay * ACC_EARNER_LEVY_RATE;
}

// 12% of earnings over the period-equivalent repayment threshold, not 12%
// of the whole pay -- matches the real SL deduction rule.
function computeStudentLoan(grossPay: number, frequency: IncomeFrequency, hasStudentLoan: boolean): number {
  if (!hasStudentLoan) return 0;
  const periodThreshold = STUDENT_LOAN_ANNUAL_THRESHOLD / periodsPerYear(frequency);
  const excess = grossPay - periodThreshold;
  return excess > 0 ? excess * STUDENT_LOAN_RATE : 0;
}

// KiwiSaver employee contribution is a % of gross pay, deducted post-tax
// from take-home -- null/opted-out source means 0, not skipped entirely,
// so callers don't need their own null check.
function computeKiwiSaver(grossPay: number, kiwiSaverPct: number | null): number {
  if (!kiwiSaverPct) return 0;
  return grossPay * (kiwiSaverPct / 100);
}

export function computeNetPay(params: {
  grossPay: number;
  frequency: IncomeFrequency;
  taxCode: NzTaxCode;
  hasStudentLoan: boolean;
  kiwiSaverPct: number | null;
}): NetPayBreakdown {
  const incomeTax = computeIncomeTax(params.grossPay, params.taxCode, params.frequency);
  const accLevy = computeAccLevy(params.grossPay, params.taxCode);
  const studentLoan = computeStudentLoan(params.grossPay, params.frequency, params.hasStudentLoan);
  const kiwiSaver = computeKiwiSaver(params.grossPay, params.kiwiSaverPct);
  const netPay = params.grossPay - incomeTax - accLevy - studentLoan - kiwiSaver;
  return {
    grossPay: params.grossPay,
    incomeTax: Math.round(incomeTax * 100) / 100,
    accLevy: Math.round(accLevy * 100) / 100,
    studentLoan: Math.round(studentLoan * 100) / 100,
    kiwiSaver: Math.round(kiwiSaver * 100) / 100,
    netPay: Math.round(netPay * 100) / 100,
  };
}
