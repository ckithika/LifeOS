/**
 * /help, /start, /menu command — main menu with inline buttons
 */

import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { isVaultConfigured } from '@lifeos/shared';

const MENU_TEXT = `<b>LifeOS</b> — What would you like to do?

<i>Or just type a message and I'll chat with you using AI.</i>`;

interface ButtonMeta {
  label: string;
  callback: string;
  requiresVault: boolean;
}

const ALL_BUTTONS: ButtonMeta[][] = [
  // Row 1
  [
    { label: '📋 Briefing', callback: 'menu:briefing', requiresVault: false },
    { label: '✅ Tasks', callback: 'menu:tasks', requiresVault: false },
  ],
  // Row 2
  [
    { label: '📅 Schedule', callback: 'menu:schedule', requiresVault: false },
    { label: '📂 Projects', callback: 'menu:projects', requiresVault: true },
  ],
  // Row 3
  [
    { label: '🔬 Research', callback: 'menu:research', requiresVault: false },
    { label: '🎯 Goals', callback: 'menu:goals', requiresVault: true },
  ],
  // Row 4
  [
    { label: '📝 Note', callback: 'menu:note', requiresVault: true },
    { label: '📊 Log', callback: 'menu:log', requiresVault: true },
    { label: '💰 Expense', callback: 'menu:expense', requiresVault: true },
  ],
];

export function buildMainMenu(): InlineKeyboard {
  const vaultOk = isVaultConfigured();
  const kb = new InlineKeyboard();

  for (const row of ALL_BUTTONS) {
    const activeButtons = row.filter(b => vaultOk || !b.requiresVault);
    if (activeButtons.length === 0) continue;
    for (const btn of activeButtons) {
      kb.text(btn.label, btn.callback);
    }
    kb.row();
  }

  return kb;
}

export async function helpCommand(ctx: Context): Promise<void> {
  await ctx.reply(MENU_TEXT, {
    parse_mode: 'HTML',
    reply_markup: buildMainMenu(),
  });
}
