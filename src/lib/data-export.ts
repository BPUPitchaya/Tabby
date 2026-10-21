// "Download my data" -- writes the user's full transaction history to a
// CSV file in the app's cache dir, then hands it to the OS share sheet.
// Mail, Files, AirDrop, etc. all show up there for free; no email-sending
// infra of our own needed just so someone can forward their data to
// themselves or whoever does their taxes.
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { transactionsToCSV } from '@/lib/csv';
import { fetchTransactions } from '@/lib/transactions';

export async function exportTransactionsCSV(userId: string): Promise<void> {
  const transactions = await fetchTransactions(userId);
  if (transactions.length === 0) {
    throw new Error("You don't have any transactions to export yet.");
  }

  const csv = transactionsToCSV(transactions);
  const fileUri = `${FileSystemLegacy.cacheDirectory}tabby-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  await FileSystemLegacy.writeAsStringAsync(fileUri, csv, { encoding: 'utf8' });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Export your transactions' });
}
