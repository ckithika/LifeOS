/**
 * Navigation helpers for Telegram inline keyboards
 */

import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';

/**
 * Edit the current callback message's text. Falls back to reply if the
 * message can't be edited (e.g. it was already deleted or is too old).
 */
export async function safeEdit(
  ctx: Context,
  text: string,
  opts: { parse_mode?: 'HTML'; reply_markup?: InlineKeyboard },
): Promise<void> {
  try {
    await ctx.editMessageText(text, opts);
  } catch {
    await ctx.reply(text, opts);
  }
}

/**
 * Append a ← Back row to an InlineKeyboard.
 */
export function addBackButton(kb: InlineKeyboard, label: string, data: string): InlineKeyboard {
  return kb.row().text(label, data);
}
