/**
 * LifeOS — Account Management CLI
 *
 * Entry point that routes to add, remove, or list subcommands.
 *
 * Usage:
 *   npm run add-account       # Interactive add flow
 *   npm run remove-account    # Interactive remove flow
 *   npm run list-accounts     # Display configured accounts
 */

import 'dotenv/config';

const subcommand = process.argv[2] || 'add';

async function main() {
  switch (subcommand) {
    case 'add': {
      const { runAddAccount } = await import('./add.js');
      await runAddAccount();
      break;
    }
    case 'remove': {
      const { runRemoveAccount } = await import('./remove.js');
      await runRemoveAccount();
      break;
    }
    case 'list': {
      const { runListAccounts } = await import('./list.js');
      runListAccounts();
      break;
    }
    default:
      console.error(`Unknown subcommand: ${subcommand}`);
      console.error('Usage: npm run add-account | npm run remove-account | npm run list-accounts');
      process.exit(1);
  }
}

main().catch((error) => {
  if (error.name === 'ExitPromptError') {
    // User pressed Ctrl+C during prompts
    console.log('\n  Cancelled.');
    process.exit(0);
  }
  console.error('Error:', error.message || error);
  process.exit(1);
});
