/**
 * Free-text message handler — session interception + Claude AI conversation
 */

import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { chat } from '@lifeos/channel-shared';
import { formatUserError } from '@lifeos/shared';
import { toTelegramHTML, truncateForTelegram } from '../formatting.js';
import { getSession, clearSession, wasSessionExpired } from '../state.js';
import { sendMainMenu } from '../menus.js';
import { handleNoteInput } from '../commands/note.js';
import { handleResearchInput } from '../commands/research.js';
import { handleExpenseAmountInput, handleExpenseDescInput } from '../commands/expense.js';
import { handleLogValueInput } from '../commands/log.js';
import { handleGoalValueInput } from '../commands/goals.js';

export async function handleMessage(ctx: Context): Promise<void> {
  const text = ctx.message?.text;
  if (!text) return;

  const userId = ctx.from?.id;
  if (!userId) return;

  // "Menu" text triggers the main menu (from persistent reply keyboard)
  if (text.toLowerCase() === 'menu') {
    return sendMainMenu(ctx);
  }

  // Check for active conversational session
  const session = getSession(userId);
  if (session) {
    switch (session.action) {
      case 'note':
        clearSession(userId);
        return handleNoteInput(ctx, text);
      case 'research':
        clearSession(userId);
        return handleResearchInput(ctx, text);
      case 'expense_amount':
        return handleExpenseAmountInput(ctx, text);
      case 'expense_desc':
        return handleExpenseDescInput(ctx, text, session.data);
      case 'log_value':
        clearSession(userId);
        return handleLogValueInput(ctx, text, session.data.category);
      case 'goal_update':
        clearSession(userId);
        return handleGoalValueInput(ctx, text, session.data);
    }
  }

  // Check if a session just expired
  if (wasSessionExpired(userId)) {
    await ctx.reply('Your previous input session expired. Tap <b>Menu</b> to start again.', {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard().text('Menu', 'nav:main'),
    });
    return;
  }

  // Default: AI chat
  try {
    const chatId = ctx.chat?.id?.toString();
    const response = await chat(text, { chatId, channelName: 'Telegram' });
    const html = toTelegramHTML(response);
    await ctx.reply(truncateForTelegram(html), { parse_mode: 'HTML' });
  } catch (error: any) {
    console.error('[message] AI error:', error);
    await ctx.reply(formatUserError(error));
  }
}
