import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  categorizeTransactionsBatch,
  classifyFinancialQuestion,
  parseBillSplit,
  parseFinancialDocument,
  parseNaturalLanguageExpenses,
  type ParsedBillSplit,
} from '@/lib/ai';
import { AiExpensePreviewModal, useAiExpensePreview } from '@/components/ai-expense-preview-modal';
import { CategoryTotalsGrid } from '@/components/category-totals-grid';
import { CsvImportPreviewModal } from '@/components/csv-import-preview-modal';
import { HeaderIconButton } from '@/components/header-icon-button';
import { IncomeTransactionDetailModal } from '@/components/income-transaction-detail-modal';
import { ManualTransactionModal, useManualTransactionForm } from '@/components/manual-transaction-modal';
import { QuickAddComposer } from '@/components/quick-add-composer';
import { TransactionActivityList } from '@/components/transaction-activity-list';
import { TransactionDetailModal } from '@/components/transaction-detail-modal';
import { TransactionSearchView } from '@/components/transaction-search-view';
import { TransactionTabBar, type TransactionTab } from '@/components/transaction-tab-bar';
import { useAuth } from '@/lib/auth-context';
import { parseTransactionsFromCSV, type ParsedCSVTransaction } from '@/lib/csv';
import { toLocalISODate } from '@/lib/dates';
import { presentScanSheet } from '@/lib/document-scan';
import {
  buildFinancialAnswer,
  EDIT_COMMAND_HINT,
  FINANCIAL_QUESTION_HINT,
  resolveEditCommand,
  SPLIT_HINT,
  type PendingEdit,
} from '@/lib/quick-add-commands';
import { hashBase64, recordScan, wasRecentlyScanned } from '@/lib/receipt-dedup';
import { SplitBillModal } from '@/components/split-bill-modal';
import {
  bulkAddTransactions,
  deleteTransaction,
  fetchCategories,
  fetchRecentMerchants,
  fetchTransactions,
  type Category,
  type Transaction,
} from '@/lib/transactions';

export default function TransactionsScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  // Only used to decide whether the AI preview's date caption is worth
  // showing: "Jul 10" matters, today's own date repeated on every row
  // doesn't.
  const todayISO = toLocalISODate();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentMerchants, setRecentMerchants] = useState<string[]>([]);

  // The chat-style composer pinned to the bottom of the screen: type a
  // sentence, AI extracts one or more expenses from it.
  const [quickAddText, setQuickAddText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  // Separate from aiBusy (shared with the manual-form auto-categorize and
  // CSV flows elsewhere) so this status line only ever shows for the
  // composer's own calls (quick-add text, receipt/statement scan). The
  // Gemini round trip here runs 3-10s+ with real variance, and a bare
  // spinner reads as "stuck" past a couple seconds without a reason why.
  const [composerThinking, setComposerThinking] = useState(false);
  // A plain-language answer to a spending question typed into the
  // composer ("how much did I spend on coffee last month"), shown in
  // the same slot composerThinking occupies while busy, cleared the next
  // time the composer is used for anything else.
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  // An edit command parsed but not yet applied. See PendingEdit in
  // lib/quick-add-commands.ts.
  const [pendingEdit, setPendingEdit] = useState<PendingEdit | null>(null);
  const [applyingEdit, setApplyingEdit] = useState(false);

  const [csvPreview, setCsvPreview] = useState<ParsedCSVTransaction[] | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);

  const aiPreview = useAiExpensePreview();
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitDraft, setSplitDraft] = useState<ParsedBillSplit | null>(null);
  const [aiImporting, setAiImporting] = useState(false);

  // Activity (date-grouped) vs By Category (totals grid): search overlays
  // either tab rather than being a third tab, since it's a transient
  // "narrow what I'm looking at" mode, not a destination of its own.
  const [activeTab, setActiveTab] = useState<TransactionTab>('activity');
  const [searchActive, setSearchActive] = useState(false);
  // Which category the search view opens pre-filtered to (null = All);
  // the search filters themselves live inside TransactionSearchView.
  const [searchInitialCategoryId, setSearchInitialCategoryId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setError(null);
      const [tx, expenseCats, incomeCats, merchants] = await Promise.all([
        fetchTransactions(userId),
        fetchCategories('expense'),
        fetchCategories('income'),
        fetchRecentMerchants(userId),
      ]);
      const cats = [...expenseCats, ...incomeCats];
      setTransactions(tx);
      setCategories(cats);
      setRecentMerchants(merchants);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transactions.');
    }
  }, [userId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const manualForm = useManualTransactionForm({
    userId,
    todayISO,
    categories,
    setCategories,
    setError,
    setAiBusy,
    onSaved: load,
  });

  const handleQuickAdd = async () => {
    if (!quickAddText.trim()) return;
    setAiBusy(true);
    setComposerThinking(true);
    setError(null);
    setAiAnswer(null);
    setPendingEdit(null);
    try {
      // An EDIT command ("change my budget to $500", "I paid Jo $20", ...)
      // is never applied directly. resolveEditCommand classifies which
      // action and its parameters and returns an old -> new confirmation;
      // nothing is written until the user taps Confirm.
      if (EDIT_COMMAND_HINT.test(quickAddText.trim())) {
        if (!userId) return;
        const result = await resolveEditCommand(quickAddText, userId, categories);
        if (result?.kind === 'error') {
          setError(result.message);
          return;
        }
        if (result?.kind === 'edit') {
          setPendingEdit(result.edit);
          setQuickAddText('');
          return;
        }
        // Classified as 'none' (or the classify call failed), so fall
        // through below and try parsing it as an ordinary expense
        // instead, in case the hint just caught an oddly-phrased
        // statement.
      }

      // A question about personal finances ("how much did I spend on
      // coffee last month", "am I over budget", "when is rent due", "who
      // owes me money", "when do I get paid next") isn't a transaction to
      // log. Answer it directly instead of running it through the
      // expense extractor, which would correctly find nothing to add and
      // show a misleading "AI unavailable" message for what's actually a
      // successful AI call.
      if (FINANCIAL_QUESTION_HINT.test(quickAddText.trim())) {
        const classified = await classifyFinancialQuestion(quickAddText, categories);
        if (!classified) {
          setError("Couldn't understand that question. Try rephrasing, or use the search icon above.");
          return;
        }
        if (classified.topic !== 'none') {
          if (!userId) return;
          const answer = await buildFinancialAnswer(classified, userId, transactions, categories);
          setAiAnswer(answer);
          setQuickAddText('');
          return;
        }
        // Classified as not actually one of the known topics, so fall
        // through below and try parsing it as an ordinary expense instead,
        // in case the hint just caught an oddly-phrased statement.
      }

      // Cheap local pre-filter before spending a second AI call: only
      // texts that plausibly describe a group split (keyword hit + any
      // number, not necessarily a "$") go through parseBillSplit at all,
      // so an ordinary "coffee $8.50" never pays for the extra round trip.
      if (SPLIT_HINT.test(quickAddText) && /\d/.test(quickAddText)) {
        const split = await parseBillSplit(
          quickAddText,
          categories.filter((c) => c.type === 'expense'),
        );
        if (split) {
          setSplitDraft(split);
          setShowSplitModal(true);
          setQuickAddText('');
          return;
        }
      }

      const parsed = await parseNaturalLanguageExpenses(quickAddText, categories);
      if (!parsed) {
        setError('AI is briefly unavailable. Try again in a moment, or use the + button below.');
        return;
      }
      aiPreview.show(parsed);
    } finally {
      setAiBusy(false);
      setComposerThinking(false);
    }
  };

  const handleConfirmEdit = async () => {
    if (!pendingEdit) return;
    setApplyingEdit(true);
    setError(null);
    try {
      await pendingEdit.apply();
      setAiAnswer(pendingEdit.successMessage);
      setPendingEdit(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply that change.');
    } finally {
      setApplyingEdit(false);
    }
  };

  const handleConfirmAIAdd = async () => {
    if (!userId || !aiPreview.preview) return;
    setAiImporting(true);
    try {
      await bulkAddTransactions(
        userId,
        aiPreview.preview.map((p) => ({
          amount: p.amount,
          description: p.description,
          merchant: p.merchant,
          occurredAt: p.occurredAt,
          isIncome: p.isIncome,
          // Matched by type too, not just name: an expense and income
          // category could share a name, and only one of them is valid
          // for this row (same rule the manual Expense/Income toggle uses).
          categoryId:
            categories.find(
              (c) => c.name === p.categoryName && c.type === (p.isIncome ? 'income' : 'expense'),
            )?.id ?? null,
        })),
      );
      aiPreview.setPreview(null);
      setQuickAddText('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add transactions.');
    } finally {
      setAiImporting(false);
    }
  };

  const handlePickCSV = async () => {
    setError(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', '.csv'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0]) return;

    try {
      const file = new File(result.assets[0].uri);
      const text = await file.text();
      const parsed = parseTransactionsFromCSV(text);
      if (parsed.length === 0) {
        setError(
          "Couldn't find any transactions in that file. Make sure it has a header row with a Date and Amount column.",
        );
        return;
      }

      setCsvPreview(parsed);

      // One batched call per type (expense/income), not one per row, since an
      // import can be a few hundred transactions. Best-effort: the preview
      // is already showing with no categories, and fills in as soon as this
      // resolves rather than blocking on it.
      setAiBusy(true);
      try {
        const expenseCategories = categories.filter((c) => c.type === 'expense');
        const incomeCategories = categories.filter((c) => c.type === 'income');
        const expenseRows = parsed.flatMap((t, i) => (t.isIncome ? [] : [i]));
        const incomeRows = parsed.flatMap((t, i) => (t.isIncome ? [i] : []));

        const [expenseIds, incomeIds] = await Promise.all([
          categorizeTransactionsBatch(
            expenseRows.map((i) => parsed[i].description),
            expenseCategories,
          ),
          categorizeTransactionsBatch(
            incomeRows.map((i) => parsed[i].description),
            incomeCategories,
          ),
        ]);

        const withCategories = [...parsed];
        expenseRows.forEach((origIndex, j) => {
          withCategories[origIndex] = { ...withCategories[origIndex], categoryId: expenseIds[j] };
        });
        incomeRows.forEach((origIndex, j) => {
          withCategories[origIndex] = { ...withCategories[origIndex], categoryId: incomeIds[j] };
        });
        setCsvPreview(withCategories);
      } finally {
        setAiBusy(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read that file.');
    }
  };

  const runScan = async (scanned: { base64Data: string; mimeType: string }) => {
    setAiBusy(true);
    setComposerThinking(true);
    try {
      const parsed = await parseFinancialDocument(scanned.base64Data, scanned.mimeType, categories);
      if (!parsed) {
        setError("Couldn't find any transactions in that. Try a clearer photo, or add it manually.");
        return;
      }
      await recordScan(hashBase64(scanned.base64Data));
      aiPreview.show(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read that file.');
    } finally {
      setAiBusy(false);
      setComposerThinking(false);
    }
  };

  const handleScanReceipt = async () => {
    setError(null);
    try {
      const scanned = await presentScanSheet();
      if (!scanned) return;

      // Catches re-scanning the same photo by accident, not a duplicate
      // *purchase* check (see lib/receipt-dedup.ts for why that's a
      // different, harder problem this deliberately doesn't try to solve).
      const hash = hashBase64(scanned.base64Data);
      if (await wasRecentlyScanned(hash)) {
        Alert.alert(
          'Scanned recently',
          'This looks like a receipt you already scanned in the last couple of days. Import it again anyway?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Import Anyway', onPress: () => runScan(scanned) },
          ],
        );
        return;
      }

      await runScan(scanned);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read that file.');
    }
  };

  const handleConfirmCSVImport = async () => {
    if (!userId || !csvPreview) return;
    setCsvImporting(true);
    try {
      await bulkAddTransactions(userId, csvPreview);
      setCsvPreview(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import transactions.');
    } finally {
      setCsvImporting(false);
    }
  };

  // Every transaction now opens an overview first, edit form second: a
  // tap is usually "what was this again", not "I need to change it". A
  // transaction logged via an income source's bell confirm carries a
  // payslip-style breakdown (income_source_id set) and gets the dedicated
  // income detail screen instead of the plain overview, since it has
  // gross/tax/ACC/KiwiSaver to show that an ordinary transaction doesn't.
  const [viewingIncomeDetail, setViewingIncomeDetail] = useState<Transaction | null>(null);
  const [viewingDetail, setViewingDetail] = useState<Transaction | null>(null);
  const handleItemPress = (item: Transaction) => {
    if (item.income_source_id !== null) {
      setViewingIncomeDetail(item);
      return;
    }
    setViewingDetail(item);
  };

  // Confirmed first: deleting used to fire straight from the row's trash
  // icon (or the edit form's own delete button) with no way back if it was
  // a mis-tap. Both call sites go through this one function, so the
  // confirm only needs adding here.
  const handleDelete = (id: string) => {
    Alert.alert('Delete this transaction?', "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTransaction(id);
            setTransactions((prev) => prev.filter((t) => t.id !== id));
            if (manualForm.editingId === id) manualForm.closeManualForm();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete transaction.');
          }
        },
      },
    ]);
  };

  const openSearch = (categoryId: string | null) => {
    setSearchInitialCategoryId(categoryId);
    setSearchActive(true);
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white dark:bg-tabby-900">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-tabby-900">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <View className="flex-row items-center justify-between px-4 pt-3 pb-3 border-b border-gray-100 dark:border-tabby-700">
          <Text className="font-fredoka-semibold text-2xl dark:text-white">Transactions</Text>
          <View className="flex-row gap-2">
            <HeaderIconButton
              icon="users"
              onPress={() => {
                setSplitDraft(null);
                setShowSplitModal(true);
              }}
              label="Split a bill"
            />
            <HeaderIconButton icon="upload" onPress={handlePickCSV} label="Import CSV" />
            <HeaderIconButton
              icon="plus"
              onPress={manualForm.openManualAdd}
              label="Add transaction"
              tone="primary"
            />
          </View>
        </View>

        {error && (
          <View className="px-4 py-2 bg-red-50 dark:bg-red-950 border-b border-red-100 dark:border-red-800">
            <Text className="font-nunito text-red-600 dark:text-red-400 text-sm">{error}</Text>
          </View>
        )}

        {searchActive ? (
          <TransactionSearchView
            transactions={transactions}
            categories={categories}
            todayISO={todayISO}
            initialCategoryId={searchInitialCategoryId}
            onCancel={() => setSearchActive(false)}
            onItemPress={handleItemPress}
            onDelete={handleDelete}
          />
        ) : (
          <>
            <TransactionTabBar
              activeTab={activeTab}
              onChangeTab={setActiveTab}
              onOpenSearch={() => openSearch(null)}
            />

            {activeTab === 'activity' ? (
              <TransactionActivityList
                transactions={transactions}
                todayISO={todayISO}
                refreshing={refreshing}
                onRefresh={onRefresh}
                onItemPress={handleItemPress}
                onDelete={handleDelete}
              />
            ) : (
              <CategoryTotalsGrid
                transactions={transactions}
                categories={categories}
                onSelectCategory={(categoryId) => openSearch(categoryId)}
              />
            )}

            <QuickAddComposer
              text={quickAddText}
              onChangeText={(text) => {
                setQuickAddText(text);
                if (aiAnswer) setAiAnswer(null);
                if (pendingEdit) setPendingEdit(null);
              }}
              onSend={handleQuickAdd}
              onScan={handleScanReceipt}
              aiBusy={aiBusy}
              thinking={composerThinking}
              answer={aiAnswer}
              pendingEdit={pendingEdit}
              applyingEdit={applyingEdit}
              onCancelEdit={() => setPendingEdit(null)}
              onConfirmEdit={handleConfirmEdit}
            />
          </>
        )}
      </KeyboardAvoidingView>

      <ManualTransactionModal
        form={manualForm}
        todayISO={todayISO}
        categories={categories}
        recentMerchants={recentMerchants}
        onDelete={handleDelete}
      />

      <CsvImportPreviewModal
        preview={csvPreview}
        categories={categories}
        suggestingCategories={aiBusy}
        importing={csvImporting}
        onConfirm={handleConfirmCSVImport}
        onCancel={() => setCsvPreview(null)}
      />

      <AiExpensePreviewModal
        state={aiPreview}
        categories={categories}
        todayISO={todayISO}
        importing={aiImporting}
        onConfirm={handleConfirmAIAdd}
      />

      <SplitBillModal
        visible={showSplitModal}
        onClose={() => {
          setShowSplitModal(false);
          setSplitDraft(null);
        }}
        onCreated={load}
        draft={splitDraft}
      />

      <IncomeTransactionDetailModal
        visible={viewingIncomeDetail !== null}
        onClose={() => setViewingIncomeDetail(null)}
        transaction={viewingIncomeDetail}
        onSaved={load}
        onEditOtherFields={(item) => {
          setViewingIncomeDetail(null);
          manualForm.handleStartEdit(item);
        }}
      />

      <TransactionDetailModal
        visible={viewingDetail !== null}
        onClose={() => setViewingDetail(null)}
        transaction={viewingDetail}
        categories={categories}
        onSaved={load}
        onDelete={(id) => {
          setViewingDetail(null);
          handleDelete(id);
        }}
      />
    </SafeAreaView>
  );
}
