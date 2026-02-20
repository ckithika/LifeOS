/**
 * /research <topic> command — trigger research agent
 */

import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { triggerResearch } from '@lifeos/channel-shared';
import { toTelegramHTML, truncateForTelegram } from '../formatting.js';

export async function researchCommand(ctx: Context): Promise<void> {
  const text = ctx.message?.text ?? '';
  const topic = text.replace(/^\/research\s*/i, '').trim();

  if (!topic) {
    await ctx.reply('Usage: /research <topic>\n\nExample: /research "grammY vs telegraf comparison"');
    return;
  }

  await runResearch(ctx, topic);
}

/** Button-flow handler — called from session interception */
export async function handleResearchInput(ctx: Context, topic: string): Promise<void> {
  await runResearch(ctx, topic, true);
}

async function runResearch(ctx: Context, topic: string, showNav = false): Promise<void> {
  await ctx.reply(`Researching: <b>${topic}</b>...`, { parse_mode: 'HTML' });

  const result = await triggerResearch(topic);

  if (result.error) {
    await ctx.reply(`Research failed: ${result.error}`);
    return;
  }

  const navKb = showNav
    ? new InlineKeyboard().text('← Menu', 'nav:main')
    : undefined;

  try {
    const data = JSON.parse(result.text);
    const summary = data.summary || data.report?.summary || 'Research complete.';
    await ctx.reply(
      truncateForTelegram(toTelegramHTML(`<b>Research: ${topic}</b>\n\n${summary}`)),
      { parse_mode: 'HTML', reply_markup: navKb },
    );
  } catch {
    await ctx.reply('Research triggered. Check vault for the full report.', {
      reply_markup: navKb,
    });
  }
}
