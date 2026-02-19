/**
 * Expense logging service — writes to vault markdown and Google Sheets
 */

import { readFile, writeFile, getGoogleClients, getAccounts, isVaultConfigured } from '@lifeos/shared';
import type { Expense } from '@lifeos/shared';

/**
 * Log an expense to both vault markdown and Google Sheets.
 * Vault logging is skipped when vault is not configured.
 */
export async function logExpense(expense: Expense): Promise<void> {
  const tasks: Promise<void>[] = [logToSheets(expense)];
  if (isVaultConfigured()) {
    tasks.push(logToVault(expense));
  }
  await Promise.all(tasks);
}

async function logToVault(expense: Expense): Promise<void> {
  const date = new Date();
  const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const path = `Files/Reports/expenses-${month}.md`;

  const existing = await readFile(path);
  const dateStr = date.toISOString().split('T')[0];
  const row = `| ${dateStr} | ${expense.amount} | ${expense.currency} | ${expense.category} | ${expense.vendor || ''} | ${expense.description || ''} |`;

  if (existing) {
    const newContent = existing.content.trimEnd() + '\n' + row + '\n';
    await writeFile(path, newContent, `lifeos: expense ${dateStr}`);
  } else {
    const content = `---
type: expenses
month: ${month}
---

# Expenses — ${month}

| Date | Amount | Currency | Category | Vendor | Description |
|------|--------|----------|----------|--------|-------------|
${row}
`;
    await writeFile(path, content, `lifeos: create expenses ${month}`);
  }
}

async function logToSheets(expense: Expense): Promise<void> {
  const sheetId = process.env.EXPENSE_SHEET_ID;
  if (!sheetId) return; // Google Sheets logging is optional

  try {
    // Use first account that has sheets access
    const accounts = getAccounts();
    if (accounts.length === 0) return;

    const clients = getGoogleClients(accounts[0].alias);
    const sheets = clients.sheets;
    if (!sheets) return;

    const date = new Date().toISOString().split('T')[0];
    const values = [[
      date,
      expense.amount,
      expense.currency,
      expense.category,
      expense.vendor || '',
      expense.description || '',
    ]];

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'Sheet1!A:F',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });
  } catch (error: any) {
    console.warn('[expenses] Sheets error:', error.message);
    // Non-critical — vault is the primary store
  }
}
