// Same scenario manually verified earlier during the CSV import feature
// build -- see commit "Add CSV import for personal transactions".

import { parseCSVRows, parseTransactionsFromCSV } from './csv';

describe('parseCSVRows', () => {
  it('splits plain comma-separated rows', () => {
    expect(parseCSVRows('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('keeps commas inside quoted fields intact', () => {
    const rows = parseCSVRows('Date,Description\n05/10/2026,"Pak n Save, Wellington"');
    expect(rows[1]).toEqual(['05/10/2026', 'Pak n Save, Wellington']);
  });

  it('un-escapes doubled quotes inside quoted fields', () => {
    const rows = parseCSVRows('Description\n"Coffee ""The Good One"""');
    expect(rows[1]).toEqual(['Coffee "The Good One"']);
  });

  it('skips blank lines', () => {
    expect(parseCSVRows('a,b\n\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('parseTransactionsFromCSV', () => {
  const sampleCSV = `Date,Description,Amount
05/10/2026,"Pak n Save, Wellington",-84.20
04/10/2026,"Spark NZ",-65.00
2026-10-03,"Salary, October",2500.00
03/10/2026,"Coffee ""The Good One""",-5.50`;

  it('parses all four rows with correct amounts and descriptions', () => {
    const result = parseTransactionsFromCSV(sampleCSV);
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({
      amount: 84.2,
      description: 'Pak n Save, Wellington',
      occurredAt: '2026-10-05',
    });
    expect(result[3].description).toBe('Coffee "The Good One"');
  });

  it('normalizes negative (debit) amounts to positive', () => {
    const result = parseTransactionsFromCSV(sampleCSV);
    expect(result.every((t) => t.amount > 0)).toBe(true);
  });

  it('parses both DD/MM/YYYY and ISO dates correctly', () => {
    const result = parseTransactionsFromCSV(sampleCSV);
    expect(result[0].occurredAt).toBe('2026-10-05'); // from 05/10/2026
    expect(result[2].occurredAt).toBe('2026-10-03'); // from 2026-10-03 (ISO)
  });

  it('returns an empty array when there is no Amount column', () => {
    const result = parseTransactionsFromCSV('Date,Description\n05/10/2026,Coffee');
    expect(result).toEqual([]);
  });

  it('returns an empty array for a header-only file', () => {
    const result = parseTransactionsFromCSV('Date,Description,Amount');
    expect(result).toEqual([]);
  });

  it('skips rows with an unparseable amount', () => {
    const result = parseTransactionsFromCSV('Date,Amount\n05/10/2026,not-a-number');
    expect(result).toEqual([]);
  });
});
