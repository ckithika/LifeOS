/**
 * /expense command — manual expense entry
 *
 * Usage: /expense 500 lunch at Java House
 * Button flow: 2-step — amount → description
 */

import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { logExpense } from '../services/expenses.js';
import { setSession, clearSession } from '../state.js';
import type { Expense } from '@lifeos/shared';

export async function expenseCommand(ctx: Context): Promise<void> {
  const args = ctx.message?.text?.replace(/^\/expense\s*/, '').trim();

  if (!args) {
    await ctx.reply(
      '<b>Expense Tracker</b>\n\nUsage: <code>/expense amount description</code>\n\nExamples:\n<code>/expense 500 lunch at Java House</code>\n<code>/expense 1200 uber to airport</code>\n\nYou can also forward a receipt photo to log expenses.',
      { parse_mode: 'HTML' },
    );
    return;
  }

  const match = args.match(/^(\d+(?:\.\d+)?)\s*(.*)/);
  if (!match) {
    await ctx.reply('Usage: <code>/expense 500 lunch</code>\n\nFirst argument must be a number.', { parse_mode: 'HTML' });
    return;
  }

  const amount = parseFloat(match[1]);
  const description = match[2].trim() || 'Uncategorized';

  await saveExpense(ctx, amount, description);
}

/** Button-flow step 1: validate amount, advance to description */
export async function handleExpenseAmountInput(ctx: Context, text: string): Promise<void> {
  const amount = parseFloat(text.trim());
  const userId = ctx.from?.id;
  if (!userId) return;

  if (isNaN(amount) || amount <= 0) {
    await ctx.reply('Please enter a valid amount (number > 0):', {
      reply_markup: new InlineKeyboard().text('Cancel', 'nav:cancel'),
    });
    return;
  }

  setSession(userId, 'expense_desc', { amount });
  await ctx.reply('What was it for?', {
    reply_markup: new InlineKeyboard().text('Cancel', 'nav:cancel'),
  });
}

/** Button-flow step 2: process expense with amount from session data */
export async function handleExpenseDescInput(ctx: Context, text: string, data: Record<string, any>): Promise<void> {
  const userId = ctx.from?.id;
  if (userId) clearSession(userId);

  const amount = data.amount as number;
  const description = text.trim() || 'Uncategorized';

  await saveExpense(ctx, amount, description, true);
}

async function saveExpense(ctx: Context, amount: number, description: string, showNav = false): Promise<void> {
  const category = detectCategory(description);
  const currency = process.env.DEFAULT_CURRENCY || 'KES';

  const expense: Expense = {
    amount,
    currency,
    category,
    description,
    vendor: '',
  };

  try {
    await logExpense(expense);

    const opts: any = { parse_mode: 'HTML' };
    if (showNav) {
      opts.reply_markup = new InlineKeyboard()
        .text('← Track', 'nav:track')
        .text('← Menu', 'nav:main');
    }
    await ctx.reply(
      `Logged: <b>${currency} ${amount}</b> — ${description} [${category}]`,
      opts,
    );
  } catch (error: any) {
    console.error('[expense] Error:', error.message);
    await ctx.reply(`Could not log expense: ${error.message}`);
  }
}

function detectCategory(description: string): string {
  const desc = description.toLowerCase();
  const categories: Record<string, string[]> = {
    'Food & Dining': ['lunch', 'dinner', 'breakfast', 'coffee', 'restaurant', 'food', 'eat', 'meal', 'snack'],
    'Transport': ['uber', 'bolt', 'taxi', 'fuel', 'petrol', 'parking', 'bus', 'matatu', 'flight', 'airport'],
    'Shopping': ['buy', 'shop', 'store', 'amazon', 'online', 'purchase', 'clothes'],
    'Entertainment': ['movie', 'netflix', 'spotify', 'game', 'concert', 'show'],
    'Health': ['pharmacy', 'doctor', 'hospital', 'gym', 'medicine', 'health'],
    'Utilities': ['airtime', 'data', 'wifi', 'internet', 'electricity', 'water', 'rent'],
    'Subscriptions': ['subscription', 'plan', 'premium', 'pro'],
  };

  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(k => desc.includes(k))) return category;
  }

  return 'Other';
}
