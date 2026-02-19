/**
 * /help, /start, /menu command — main menu with inline buttons
 */

import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';

const MENU_TEXT = `<b>LifeOS</b> — What would you like to do?

<i>Or just type a message and I'll chat with you using AI.</i>`;

export function buildMainMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text('📋 Briefing', 'menu:briefing')
    .text('✅ Tasks', 'menu:tasks')
    .row()
    .text('📅 Schedule', 'menu:schedule')
    .text('📂 Projects', 'menu:projects')
    .row()
    .text('🔬 Research', 'menu:research');
}

export async function helpCommand(ctx: Context): Promise<void> {
  await ctx.reply(MENU_TEXT, {
    parse_mode: 'HTML',
    reply_markup: buildMainMenu(),
  });
}
