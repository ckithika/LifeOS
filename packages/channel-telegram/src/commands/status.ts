/**
 * /status command — system health, agent status, config check
 */

import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import {
  isVaultConfigured,
  getAccounts,
  getTimezone,
} from '@lifeos/shared';

export async function statusCommand(ctx: Context): Promise<void> {
  const lines: string[] = [];

  lines.push('<b>LifeOS Status</b>\n');

  // Timezone
  lines.push(`Timezone: <code>${getTimezone()}</code>`);
  lines.push(`Time: ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: getTimezone() })}`);

  // Vault
  const vaultOk = isVaultConfigured();
  lines.push(`\nVault: ${vaultOk ? 'Connected' : 'Not configured'}`);
  if (vaultOk) {
    const owner = process.env.GITHUB_REPO_OWNER || '?';
    const repo = process.env.GITHUB_REPO_NAME || '?';
    lines.push(`  <code>${owner}/${repo}</code>`);
  }

  // Google accounts
  try {
    const accounts = getAccounts();
    lines.push(`\nGoogle Accounts: ${accounts.length}`);
    for (const acct of accounts) {
      lines.push(`  - <b>${acct.alias}</b> (${acct.email})`);
    }
  } catch {
    lines.push('\nGoogle Accounts: Not configured');
  }

  // AI providers
  lines.push(`\nAI Providers:`);
  lines.push(`  Gemini: ${process.env.GOOGLE_AI_API_KEY ? 'Configured' : 'Not set'}`);
  lines.push(`  Claude: ${process.env.ANTHROPIC_API_KEY ? 'Configured' : 'Not set'}`);

  // Agent URLs
  const agents = [
    { name: 'Briefing', env: 'AGENT_BRIEFING_URL' },
    { name: 'Research', env: 'AGENT_RESEARCH_URL' },
  ];
  const configuredAgents = agents.filter(a => process.env[a.env]);
  if (configuredAgents.length > 0) {
    lines.push(`\nAgents: ${configuredAgents.map(a => a.name).join(', ')}`);
  }

  // Check agent health (best-effort, with timeout)
  const healthChecks = [
    { name: 'Sync', env: 'AGENT_SYNC_URL' },
    { name: 'Briefing', env: 'AGENT_BRIEFING_URL' },
    { name: 'Drive Org', env: 'AGENT_DRIVE_ORG_URL' },
  ];

  const healthLines: string[] = [];
  for (const check of healthChecks) {
    const url = process.env[check.env];
    if (!url) continue;
    try {
      const resp = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) });
      healthLines.push(`  ${check.name}: ${resp.ok ? 'Healthy' : 'Unhealthy'}`);
    } catch {
      healthLines.push(`  ${check.name}: Unreachable`);
    }
  }
  if (healthLines.length > 0) {
    lines.push(`\nService Health:`);
    lines.push(...healthLines);
  }

  const keyboard = new InlineKeyboard().text('← Menu', 'nav:main');

  await ctx.reply(lines.join('\n'), {
    parse_mode: 'HTML',
    reply_markup: keyboard,
  });
}
