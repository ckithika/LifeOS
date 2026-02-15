/**
 * LifeOS — Add Account Flow
 *
 * Interactive CLI flow to add a new Google (or future provider) account.
 * Collects configuration, runs OAuth, writes token + config to .env.
 */

import { select, input, confirm, checkbox } from '@inquirer/prompts';
import { getProviders } from './providers/index.js';
import { addAccount, setEnvVar, loadAccountsConfig } from './env-manager.js';
import type { AccountConfig } from '../../packages/shared/src/types.js';

export async function runAddAccount(): Promise<void> {
  console.log('\n  LifeOS — Add Account\n');

  // 1. Select provider
  const providers = getProviders();
  const providerId = await select({
    message: 'Select provider:',
    choices: providers.map(p => ({
      name: p.displayName,
      value: p.id,
    })),
  });

  const provider = providers.find(p => p.id === providerId)!;

  // 2. Account alias
  const existingAliases = loadAccountsConfig().map(a => a.alias);
  const alias = await input({
    message: 'Account alias (e.g., personal, work):',
    validate: (value) => {
      if (!value.trim()) return 'Alias is required';
      if (!/^[a-z0-9-]+$/.test(value)) return 'Use lowercase letters, numbers, and hyphens only';
      if (existingAliases.includes(value)) return `Alias "${value}" already exists. Use remove-account first.`;
      return true;
    },
  });

  // 3. Email address
  const email = await input({
    message: 'Email address:',
    validate: (value) => {
      if (!value.includes('@')) return 'Enter a valid email address';
      return true;
    },
  });

  // 4. Account type
  const accountType = await select({
    message: 'Account type:',
    choices: provider.supportedAccountTypes.map(t => ({
      name: t.charAt(0).toUpperCase() + t.slice(1),
      value: t,
    })),
  }) as 'personal' | 'workspace';

  // 5. Projects
  const projectsInput = await input({
    message: 'Projects (comma-separated slugs, * for all):',
    default: '*',
  });
  const projects = projectsInput.split(',').map(p => p.trim()).filter(Boolean);

  // 6. Default flags
  const defaults = await checkbox({
    message: 'Set as default for:',
    choices: [
      { name: 'Email drafts', value: 'draft' },
      { name: 'Tasks', value: 'tasks' },
    ],
  });

  const isDefaultDraft = defaults.includes('draft');
  const isDefaultTasks = defaults.includes('tasks');

  // 7. Summary
  console.log('\n  Summary:');
  console.log(`    Provider:  ${provider.displayName}`);
  console.log(`    Alias:     ${alias}`);
  console.log(`    Email:     ${email}`);
  console.log(`    Type:      ${accountType}`);
  console.log(`    Projects:  ${projects.join(', ')}`);
  console.log(`    Defaults:  ${[isDefaultDraft && 'drafts', isDefaultTasks && 'tasks'].filter(Boolean).join(', ') || 'none'}`);
  console.log('');

  const proceed = await confirm({
    message: 'Proceed with OAuth authorization?',
    default: true,
  });

  if (!proceed) {
    console.log('  Cancelled.');
    return;
  }

  // 8. Run OAuth
  console.log(`\n  Starting ${provider.displayName} authorization...`);
  const authResult = await provider.authenticate(alias, email);

  // 9. Write token to .env
  setEnvVar(authResult.envKey, authResult.envValue);
  console.log(`\n  Token written to .env (${authResult.envKey})`);

  // 10. Write account config to .env
  const accountConfig: AccountConfig = {
    alias,
    email,
    type: accountType,
    projects,
    provider: providerId,
    ...(isDefaultDraft && { isDefaultDraft: true }),
    ...(isDefaultTasks && { isDefaultTasks: true }),
  };

  addAccount(accountConfig);
  console.log('  Account config updated in ACCOUNTS_CONFIG');

  console.log(`\n  Done! Run: npm run deploy -- mcp-google\n`);
}
