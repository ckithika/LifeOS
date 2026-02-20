/**
 * Research command — trigger research agent
 * Called from button flow (session interception in message handler)
 */

import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { triggerResearch } from '@lifeos/channel-shared';
import { toTelegramHTML, truncateForTelegram } from '../formatting.js';

/** Button-flow handler — called from session interception */
export async function handleResearchInput(ctx: Context, topic: string): Promise<void> {
  await ctx.reply(`Researching: <b>${topic}</b>...`, { parse_mode: 'HTML' });

  const result = await triggerResearch(topic);

  if (result.error) {
    await ctx.reply(`Research failed: ${result.error}`, {
      reply_markup: new InlineKeyboard().text('← Menu', 'nav:main'),
    });
    return;
  }

  try {
    const data = JSON.parse(result.text);
    const summary = data.summary || data.report?.summary || 'Research complete.';
    await ctx.reply(
      truncateForTelegram(toTelegramHTML(`<b>Research: ${topic}</b>\n\n${summary}`)),
      { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('← Menu', 'nav:main') },
    );
  } catch {
    await ctx.reply('Research triggered. Check vault for the full report.', {
      reply_markup: new InlineKeyboard().text('← Menu', 'nav:main'),
    });
  }
}
