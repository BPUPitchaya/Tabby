// Lightweight CSV parsing for bank-statement import. Hand-rolled rather than
// a library since the need is modest: split rows/fields, respect quoted
// fields containing commas, done. Not a full RFC4180 implementation (e.g.
// doesn't handle embedded newlines inside quoted fields), which is an
// accepted limitation for typical bank CSV exports.

export function parseCSVRows(text: string): string[][] {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim().length > 0);
  return lines.map((line) => {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (inQuotes) {
        if (char === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          current += char;
        }
      } else if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        fields.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    fields.push(current.trim());
    return fields;
  });
}

function findColumn(header: string[], patterns: RegExp[]): number {
  for (const pattern of patterns) {
    const idx = header.findIndex((h) => pattern.test(h));
    if (idx !== -1) return idx;
  }
  return -1;
}

// Tries ISO (YYYY-MM-DD) first, then assumes DD/MM/YYYY (NZ/AU bank export
// convention) for slash- or dash-separated dates. Ambiguous for US-style
// MM/DD/YYYY exports -- a known limitation, documented for the R&D report.
function parseDate(raw: string): string {
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  }

  const parts = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (parts) {
    let [, day, month, year] = parts;
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  return new Date().toISOString().slice(0, 10);
}

export type ParsedCSVTransaction = {
  amount: number;
  description: string;
  occurredAt: string;
};

export function parseTransactionsFromCSV(text: string): ParsedCSVTransaction[] {
  const rows = parseCSVRows(text);
  if (rows.length < 2) return [];

  const header = rows[0].map((h) => h.toLowerCase());
  const dateIdx = findColumn(header, [/date/]);
  const amountIdx = findColumn(header, [/amount/, /value/, /debit/]);
  const descIdx = findColumn(header, [/description/, /details/, /narrative/, /particulars/, /memo/]);

  if (amountIdx === -1) return []; // can't import without at least an amount column

  return rows
    .slice(1)
    .map((row) => {
      const rawAmount = (row[amountIdx] ?? '').replace(/[^0-9.-]/g, '');
      const amount = Math.abs(parseFloat(rawAmount));
      const description = descIdx !== -1 ? row[descIdx] : '';
      const occurredAt = dateIdx !== -1 ? parseDate(row[dateIdx]) : new Date().toISOString().slice(0, 10);
      return { amount, description, occurredAt };
    })
    .filter((t) => !isNaN(t.amount) && t.amount > 0);
}
