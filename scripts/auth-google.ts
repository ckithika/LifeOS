/**
 * Google OAuth Authorization Flow (backwards-compatible wrapper)
 *
 * Delegates to the account management CLI's Google provider.
 * Run with: npm run auth -- --alias=personal
 *
 * For the full interactive flow, use: npm run add-account
 */

import 'dotenv/config';
import { googleProvider } from './account/providers/google.js';
import { setEnvVar } from './account/env-manager.js';

async function main() {
  const aliasArg = process.argv.find((a) => a.startsWith('--alias='));
  const alias = aliasArg?.split('=')[1] ?? 'personal';

  console.log(`\n  LifeOS Google OAuth Setup`);
  console.log(`  Authorizing account: ${alias}\n`);

  const result = await googleProvider.authenticate(alias, '');
  setEnvVar(result.envKey, result.envValue);

  console.log(`\n  Token written to .env (${result.envKey})`);
  console.log(`  Next: npm run deploy -- mcp-google\n`);
}

main().catch((error) => {
  console.error('Fatal error:', error.message || error);
  process.exit(1);
});
