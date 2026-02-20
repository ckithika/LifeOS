/**
 * Help command — shows what LifeOS can do + main menu
 */

import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';

const HELP_TEXT = `<b>LifeOS</b> — Your personal AI assistant

<b>Menu</b> — Tap the <b>Menu</b> button below for quick access to:
  Briefing, Tasks, Schedule, Research
  Habit tracking, Goals, Expenses
  Quick notes, Projects, Weekly review

<b>AI Chat</b> — Just type naturally:
  <i>"What's on my plate today?"</i>
  <i>"Search my emails for the invoice from Acme"</i>
  <i>"Draft a follow-up to Kevin"</i>
  <i>"Schedule a meeting with Sarah next Tuesday"</i>

<b>Voice</b> — Send a voice message to transcribe &amp; save it.

<b>Receipts</b> — Send a photo of a receipt to auto-log the expense.`;

export async function helpCommand(ctx: Context): Promise<void> {
  await ctx.reply(HELP_TEXT, {
    parse_mode: 'HTML',
    reply_markup: new InlineKeyboard().text('← Menu', 'nav:main'),
  });
}
