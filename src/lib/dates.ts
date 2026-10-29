// `Date#toISOString()` is always UTC. Formatting "today" with it is wrong
// for any NZ user before roughly midday UTC (NZ is UTC+12/+13) -- the date
// hasn't rolled over to NZ's actual "today" yet, so expenses logged first
// thing in the morning, AI date resolution ("today", "yesterday"), and
// month-boundary Q&A ("this month") would all land on the wrong day. This
// reads the device's own local year/month/day instead, same as
// split-bill-modal.tsx's previously-private helper of the same name.
export function toLocalISODate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
