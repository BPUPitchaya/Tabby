// Same native-module problem as profile.test.ts -- income-sources.ts
// imports the real Supabase client for its network functions, so it's
// stubbed out here; these tests only touch the pure helpers.
import {
  canUseTaxCode,
  computeGrossPay,
  getNextIncomeSourcePaydayDate,
  getPendingIncomeSourcePayday,
  getPrimaryIncomeSource,
  type IncomeSource,
} from './income-sources';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

function source(partial: Partial<IncomeSource>): IncomeSource {
  return {
    id: 'src-1',
    label: 'Job',
    isPrimary: false,
    mode: 'fixed',
    amount: 500,
    hourlyRate: null,
    frequency: 'weekly',
    payWeekday: 1,
    dayOfMonth: null,
    trackingMode: 'gross',
    taxCode: null,
    hasStudentLoan: false,
    kiwiSaverPct: null,
    lastConfirmedPayday: null,
    budgetAmount: null,
    ...partial,
  };
}

describe('getPendingIncomeSourcePayday', () => {
  const now = new Date(2026, 9, 15); // Thu Oct 15, 2026

  it('returns the latest due date when never confirmed', () => {
    const result = getPendingIncomeSourcePayday(source({ lastConfirmedPayday: null }), now);
    expect(result).toBe('2026-10-12');
  });

  it('returns null once that cycle has been resolved', () => {
    const result = getPendingIncomeSourcePayday(source({ lastConfirmedPayday: '2026-10-12' }), now);
    expect(result).toBeNull();
  });
});

describe('getNextIncomeSourcePaydayDate', () => {
  it('returns the next occurrence after now', () => {
    const now = new Date(2026, 9, 15);
    const result = getNextIncomeSourcePaydayDate(source({}), now);
    expect(result).toBe('2026-10-19');
  });
});

describe('getPrimaryIncomeSource', () => {
  it('finds the one marked primary among several', () => {
    const sources = [
      source({ id: 'a', isPrimary: false }),
      source({ id: 'b', isPrimary: true }),
      source({ id: 'c', isPrimary: false }),
    ];
    expect(getPrimaryIncomeSource(sources)?.id).toBe('b');
  });

  it('returns null when nothing is marked primary', () => {
    expect(getPrimaryIncomeSource([source({ isPrimary: false })])).toBeNull();
  });
});

describe('canUseTaxCode', () => {
  it('always allows a non-main code (S, SB, SH, ST etc.)', () => {
    const sources = [source({ trackingMode: 'net', taxCode: 'M' })];
    expect(canUseTaxCode(sources, 'S', null)).toBe(true);
  });

  it('allows M when no other net source already has it', () => {
    const sources = [source({ trackingMode: 'gross', taxCode: null })];
    expect(canUseTaxCode(sources, 'M', null)).toBe(true);
  });

  it('blocks a second source from also claiming M', () => {
    const sources = [source({ id: 'a', trackingMode: 'net', taxCode: 'M' })];
    expect(canUseTaxCode(sources, 'M', null)).toBe(false);
  });

  it('allows a source to keep its own existing M code when excluded (editing itself)', () => {
    const sources = [source({ id: 'a', trackingMode: 'net', taxCode: 'M' })];
    expect(canUseTaxCode(sources, 'M', 'a')).toBe(true);
  });

  it('ignores a gross-tracked source even if it has a stray tax_code value', () => {
    const sources = [source({ id: 'a', trackingMode: 'gross', taxCode: 'M' })];
    expect(canUseTaxCode(sources, 'M', null)).toBe(true);
  });
});

describe('computeGrossPay', () => {
  it('returns the fixed amount for fixed mode, ignoring hours', () => {
    const result = computeGrossPay(source({ mode: 'fixed', amount: 500 }), 10);
    expect(result).toBe(500);
  });

  it('computes rate times paid hours for hourly mode', () => {
    const result = computeGrossPay(source({ mode: 'hourly', amount: null, hourlyRate: 23.5 }), 40);
    expect(result).toBe(940);
  });

  it('returns null for hourly mode with no hours given', () => {
    const result = computeGrossPay(source({ mode: 'hourly', amount: null, hourlyRate: 23.5 }));
    expect(result).toBeNull();
  });

  it('returns null for hourly mode with zero or negative hours', () => {
    const result = computeGrossPay(source({ mode: 'hourly', amount: null, hourlyRate: 23.5 }), 0);
    expect(result).toBeNull();
  });
});
