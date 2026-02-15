/**
 * LifeOS — Remove Account Flow
 *
 * Interactive CLI to remove a configured account.
 * Removes both the token env var and the ACCOUNTS_CONFIG entry.
 */

import { select, confirm } from '@inquirer/prompts';
import { loadAccountsConfig, removeAccount } from './env-manager.js';
import { getProvider } from './providers/index.js';

export async function runRemoveAccount(): Promise<void> {
  console.log('\n  LifeOS — Remove Account\n');

  const accounts = loadAccountsConfig();

  if (accounts.length === 0) {
    console.log('  No accounts configured.');
    return;
  }

  const alias = await select({
    message: 'Select account to remove:',
    choices: accounts.map(a => ({
      name: `${a.alias} (${a.email}) — ${a.type}`,
      value: a.alias,
    })),
  });

  const account = accounts.find(a => a.alias === alias)!;
  const provider = getProvider(account.provider || 'google');
  const tokenEnvKey = provider?.getTokenEnvKey(alias)
    || `GOOGLE_TOKEN_${alias.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;

  console.log(`\n  This will remove:`);
  console.log(`    - Account config for "${alias}" from ACCOUNTS_CONFIG`);
  console.log(`    - Token ${tokenEnvKey} from .env\n`);

  const proceed = await confirm({
    message: 'Are you sure?',
    default: false,
  });

  if (!proceed) {
    console.log('  Cancelled.');
    return;
  }

  removeAccount(alias, tokenEnvKey);
  console.log(`\n  Account "${alias}" removed.`);
  console.log(`  Run: npm run deploy -- mcp-google\n`);
}
