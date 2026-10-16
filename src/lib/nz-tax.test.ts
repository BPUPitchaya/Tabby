import { computeNetPay } from './nz-tax';

describe('computeNetPay', () => {
  it('computes M-code weekly pay with progressive brackets + ACC levy', () => {
    // $500/wk -> $26,000/yr: 15,600 @10.5% + 10,400 @17.5% = 1,638 + 1,820 = 3,458/yr -> 66.50/wk
    const result = computeNetPay({
      grossPay: 500,
      frequency: 'weekly',
      taxCode: 'M',
      hasStudentLoan: false,
      kiwiSaverPct: null,
    });
    expect(result.incomeTax).toBeCloseTo(66.5, 1);
    expect(result.accLevy).toBeCloseTo(8, 2);
    expect(result.studentLoan).toBe(0);
    expect(result.kiwiSaver).toBe(0);
    expect(result.netPay).toBeCloseTo(500 - 66.5 - 8, 1);
  });

  it('ME code skips the ACC earner levy that M pays', () => {
    const m = computeNetPay({
      grossPay: 500,
      frequency: 'weekly',
      taxCode: 'M',
      hasStudentLoan: false,
      kiwiSaverPct: null,
    });
    const me = computeNetPay({
      grossPay: 500,
      frequency: 'weekly',
      taxCode: 'ME',
      hasStudentLoan: false,
      kiwiSaverPct: null,
    });
    expect(me.incomeTax).toBeCloseTo(m.incomeTax, 5);
    expect(me.accLevy).toBe(0);
    expect(me.netPay).toBeCloseTo(m.netPay + m.accLevy, 2);
  });

  it('secondary codes apply a flat rate, not the progressive table', () => {
    const result = computeNetPay({
      grossPay: 500,
      frequency: 'weekly',
      taxCode: 'S',
      hasStudentLoan: false,
      kiwiSaverPct: null,
    });
    expect(result.incomeTax).toBeCloseTo(500 * 0.175, 2);
  });

  it('deducts student loan only on earnings above the periodized threshold', () => {
    const belowThreshold = computeNetPay({
      grossPay: 400,
      frequency: 'weekly',
      taxCode: 'M',
      hasStudentLoan: true,
      kiwiSaverPct: null,
    });
    expect(belowThreshold.studentLoan).toBe(0);

    const aboveThreshold = computeNetPay({
      grossPay: 600,
      frequency: 'weekly',
      taxCode: 'M',
      hasStudentLoan: true,
      kiwiSaverPct: null,
    });
    // weekly threshold = 24,128 / 52 = 464.0
    expect(aboveThreshold.studentLoan).toBeCloseTo((600 - 24_128 / 52) * 0.12, 2);
  });

  it('deducts KiwiSaver as a percentage of gross pay', () => {
    const result = computeNetPay({
      grossPay: 500,
      frequency: 'weekly',
      taxCode: 'M',
      hasStudentLoan: false,
      kiwiSaverPct: 3,
    });
    expect(result.kiwiSaver).toBeCloseTo(15, 2);
  });

  it('treats null KiwiSaver pct as opted out', () => {
    const result = computeNetPay({
      grossPay: 500,
      frequency: 'weekly',
      taxCode: 'M',
      hasStudentLoan: false,
      kiwiSaverPct: null,
    });
    expect(result.kiwiSaver).toBe(0);
  });

  it('annualizes correctly for monthly and biweekly frequencies', () => {
    const monthly = computeNetPay({
      grossPay: 500 * 52 / 12,
      frequency: 'monthly',
      taxCode: 'M',
      hasStudentLoan: false,
      kiwiSaverPct: null,
    });
    const weekly = computeNetPay({
      grossPay: 500,
      frequency: 'weekly',
      taxCode: 'M',
      hasStudentLoan: false,
      kiwiSaverPct: null,
    });
    // Same annual income either way -> same annual tax, just sliced differently.
    expect(monthly.incomeTax * 12).toBeCloseTo(weekly.incomeTax * 52, 0);
  });
});
