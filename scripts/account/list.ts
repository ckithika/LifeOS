/**
 * LifeOS — List Accounts
 *
 * Displays all configured accounts in a readable table format.
 */

import { loadAccountsConfig } from './env-manager.js';

export function runListAccounts(): void {
  console.log('\n  LifeOS — Configured Accounts\n');

  const accounts = loadAccountsConfig();

  if (accounts.length === 0) {
    console.log('  No accounts configured. Run: npm run add-account\n');
    return;
  }

  // Calculate column widths
  const aliasWidth = Math.max(5, ...accounts.map(a => a.alias.length));
  const emailWidth = Math.max(5, ...accounts.map(a => a.email.length));
  const typeWidth = Math.max(4, ...accounts.map(a => a.type.length));
  const providerWidth = Math.max(8, ...accounts.map(a => (a.provider || 'google').length));

  // Header
  const header = [
    'Alias'.padEnd(aliasWidth),
    'Email'.padEnd(emailWidth),
    'Type'.padEnd(typeWidth),
    'Provider'.padEnd(providerWidth),
    'Projects',
    'Defaults',
  ].join('  ');

  const separator = '-'.repeat(header.length + 10);

  console.log(`  ${header}`);
  console.log(`  ${separator}`);

  for (const account of accounts) {
    const defaults: string[] = [];
    if (account.isDefaultDraft) defaults.push('drafts');
    if (account.isDefaultTasks) defaults.push('tasks');

    const row = [
      account.alias.padEnd(aliasWidth),
      account.email.padEnd(emailWidth),
      account.type.padEnd(typeWidth),
      (account.provider || 'google').padEnd(providerWidth),
      account.projects.join(', '),
      defaults.length > 0 ? defaults.join(', ') : '',
    ].join('  ');

    console.log(`  ${row}`);
  }

  console.log('');
}
