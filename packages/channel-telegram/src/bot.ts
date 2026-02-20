/**
 * grammY Bot configuration — middleware, handlers, security
 *
 * No slash commands — all features accessed via inline button menus.
 * /start is kept as Telegram requires it for first interaction.
 */

import { Bot } from 'grammy';
import type { Context } from 'grammy';
import { isAuthorizedUser } from './security.js';
import { sendMainMenu } from './menus.js';
import { handleMessage } from './handlers/message.js';
import { handleCallback } from './handlers/callback.js';
import { handleVoice } from './handlers/voice.js';
import { handlePhoto } from './handlers/photo.js';

export function createBot(): Bot {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required');

  const bot = new Bot(token);

  // Clear any previously registered slash commands
  bot.api.deleteMyCommands()
    .catch(err => console.warn('[bot] deleteMyCommands failed:', err.message));

  // Security middleware — reject unauthorized users
  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId || !isAuthorizedUser(userId)) {
      console.warn(`[bot] Unauthorized access attempt from user ${userId}`);
      await ctx.reply('Unauthorized. This is a private bot.');
      return;
    }
    await next();
  });

  // /start — required by Telegram for first interaction
  bot.command('start', async (ctx: Context) => sendMainMenu(ctx));

  // Callback queries (inline buttons)
  bot.on('callback_query:data', handleCallback);

  // Voice messages → transcription
  bot.on('message:voice', handleVoice);

  // Photo messages → receipt scanning
  bot.on('message:photo', handlePhoto);

  // Free-text messages → menu trigger or AI chat
  bot.on('message:text', handleMessage);

  // Error handler
  bot.catch((err) => {
    console.error('[bot] Error:', err.message);
  });

  return bot;
}
