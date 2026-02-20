/**
 * Menu builders and text constants for Telegram inline keyboards
 */

import type { Context } from 'grammy';
import { InlineKeyboard, Keyboard } from 'grammy';
import { isVaultConfigured } from '@lifeos/shared';

// ─── Text Constants ─────────────────────────────────────

export const MAIN_MENU_TEXT = `<b>LifeOS</b> — What would you like to do?

<i>Or just type a message and I'll chat with you using AI.</i>`;

export const TRACK_MENU_TEXT = `<b>📊 Track</b> — habits, goals & expenses`;

export const LOG_CATEGORY_TEXT = `<b>📊 Log Habit</b> — pick a category`;

export const VAULT_MENU_TEXT = `<b>📂 Vault</b> — notes, projects & reviews`;

// ─── Menu Builders ──────────────────────────────────────

export function buildMainMenu(): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text('📋 Briefing', 'm:briefing')
    .text('✅ Tasks', 'm:tasks')
    .row()
    .text('📅 Schedule', 'm:schedule')
    .text('🔬 Research', 'in:research')
    .row()
    .text('📊 Track', 'nav:track');

  if (isVaultConfigured()) {
    kb.text('📂 Vault', 'nav:vault');
  }

  kb.row();

  return kb;
}

export function buildTrackMenu(): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text('📊 Log Habit', 'nav:log')
    .text('🎯 Goals', 'm:goals')
    .row()
    .text('💰 Expense', 'in:exp')
    .row()
    .text('← Menu', 'nav:main');
  return kb;
}

export function buildLogCategoryMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text('Mood', 'in:log_mood')
    .text('Energy', 'in:log_energy')
    .text('Sleep', 'in:log_sleep')
    .row()
    .text('Workout', 'in:log_workout')
    .text('Water', 'in:log_water')
    .text('Food', 'in:log_food')
    .row()
    .text('Weight', 'in:log_weight')
    .row()
    .text('← Track', 'nav:track');
}

export function buildVaultMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text('📝 Quick Note', 'in:note')
    .text('📂 Projects', 'm:projects')
    .row()
    .text('📰 Weekly', 'm:weekly')
    .row()
    .text('← Menu', 'nav:main');
}

// ─── Senders ────────────────────────────────────────────

/** Persistent reply keyboard with a "Menu" button at the bottom of the chat */
export const REPLY_KEYBOARD = new Keyboard().text('Menu').resized();

export async function sendMainMenu(ctx: Context): Promise<void> {
  // Send the inline menu buttons
  await ctx.reply(MAIN_MENU_TEXT, {
    parse_mode: 'HTML',
    reply_markup: buildMainMenu(),
  });
  // Set the persistent reply keyboard so "Menu" is always one tap away
  await ctx.reply('Tap <b>Menu</b> below anytime to come back here.', {
    parse_mode: 'HTML',
    reply_markup: REPLY_KEYBOARD,
  });
}
