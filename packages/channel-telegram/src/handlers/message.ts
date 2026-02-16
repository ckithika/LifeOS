/**
 * Free-text message handler → Claude AI conversation
 */

import type { Context } from 'grammy';
import { chat } from '../services/ai.js';
import { toTelegramHTML, truncateForTelegram } from '../formatting.js';

export async function handleMessage(ctx: Context): Promise<void> {
  const text = ctx.message?.text;
  if (!text) return;

  try {
    const chatId = ctx.chat?.id?.toString();
    const response = await chat(text, chatId);
    const html = toTelegramHTML(response);
    await ctx.reply(truncateForTelegram(html), { parse_mode: 'HTML' });
  } catch (error: any) {
    console.error('[message] AI error:', error);
    await ctx.reply(`❌ AI error: ${error.message}`);
  }
}
