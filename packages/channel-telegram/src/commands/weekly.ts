/**
 * /weekly command — trigger weekly review
 */

import type { Context } from 'grammy';
import { triggerWeeklyReview } from '@lifeos/channel-shared';

export async function weeklyCommand(ctx: Context): Promise<void> {
  await ctx.reply('Generating weekly review...');

  try {
    const result = await triggerWeeklyReview();

    if (result.error) {
      await ctx.reply(`Could not generate review: ${result.error}`);
      return;
    }

    await ctx.reply(`Weekly review generated. Check your vault for the full report.`);
  } catch (error: any) {
    console.error('[weekly] Error:', error.message);
    await ctx.reply(`Could not generate review: ${error.message}`);
  }
}
