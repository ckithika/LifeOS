/**
 * Inline keyboard button callback handler
 */

import type { Context } from 'grammy';

export async function handleCallback(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  await ctx.answerCallbackQuery();

  // Future: handle inline button actions (e.g., approve task, snooze reminder)
  await ctx.reply(`Action: ${data} (not yet implemented)`);
}
