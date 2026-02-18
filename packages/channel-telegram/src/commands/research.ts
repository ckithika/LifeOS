/**
 * /research <topic> command — trigger research agent
 */

import type { Context } from 'grammy';
import { triggerResearch } from '@lifeos/channel-shared';
import { toTelegramHTML, truncateForTelegram } from '../formatting.js';

export async function researchCommand(ctx: Context): Promise<void> {
  const text = ctx.message?.text ?? '';
  const topic = text.replace(/^\/research\s*/i, '').trim();

  if (!topic) {
    await ctx.reply('Usage: /research <topic>\n\nExample: /research "grammY vs telegraf comparison"');
    return;
  }

  await ctx.reply(`🔬 Researching: <b>${topic}</b>...`, { parse_mode: 'HTML' });

  const result = await triggerResearch(topic);

  if (result.error) {
    await ctx.reply(`❌ Research failed: ${result.error}`);
    return;
  }

  try {
    const data = JSON.parse(result.text);
    const summary = data.summary || data.report?.summary || 'Research complete.';
    await ctx.reply(
      truncateForTelegram(toTelegramHTML(`<b>🔬 Research: ${topic}</b>\n\n${summary}`)),
      { parse_mode: 'HTML' }
    );
  } catch {
    await ctx.reply('✅ Research triggered. Check vault for the full report.');
  }
}
