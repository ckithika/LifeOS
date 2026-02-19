/**
 * Photo handler — receipt scanning via Gemini
 *
 * Receives a photo, sends to Gemini for data extraction,
 * logs the expense after user confirmation.
 */

import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { GoogleGenAI } from '@google/genai';
import { logExpense } from '../services/expenses.js';
import type { Expense } from '@lifeos/shared';

/** Temporary store for pending expense confirmations (keyed by message ID) */
const pendingExpenses = new Map<string, Expense>();

export async function handlePhoto(ctx: Context): Promise<void> {
  const photos = ctx.message?.photo;
  if (!photos || photos.length === 0) return;

  // Get the highest resolution photo
  const photo = photos[photos.length - 1];

  await ctx.reply('Scanning receipt...');

  try {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      await ctx.reply('GOOGLE_AI_API_KEY not configured.');
      return;
    }

    // Download photo from Telegram
    const file = await ctx.api.getFile(photo.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    const response = await fetch(fileUrl);
    const imageBuffer = Buffer.from(await response.arrayBuffer());

    // Send to Gemini for extraction
    const ai = new GoogleGenAI({ apiKey });
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    const result = await ai.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: imageBuffer.toString('base64'),
              },
            },
            {
              text: `Extract expense data from this receipt image. Return ONLY a JSON object with these fields:
{
  "amount": <number>,
  "currency": "<3-letter code, e.g. KES, USD>",
  "vendor": "<business name>",
  "category": "<Food & Dining|Transport|Shopping|Entertainment|Health|Utilities|Other>",
  "description": "<brief description>"
}

If this is not a receipt, return: {"error": "Not a receipt"}`,
            },
          ],
        },
      ],
    });

    const text = result.candidates?.[0]?.content?.parts
      ?.filter((p: any) => p.text)
      .map((p: any) => p.text)
      .join('') || '';

    // Parse JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      await ctx.reply('Could not extract expense data from this image.');
      return;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.error) {
      await ctx.reply(parsed.error);
      return;
    }

    const expense: Expense = {
      amount: parsed.amount || 0,
      currency: parsed.currency || process.env.DEFAULT_CURRENCY || 'KES',
      vendor: parsed.vendor || '',
      category: parsed.category || 'Other',
      description: parsed.description || '',
    };

    // Store for confirmation
    const confirmId = `exp_${Date.now()}`;
    pendingExpenses.set(confirmId, expense);

    // Auto-cleanup after 10 minutes
    setTimeout(() => pendingExpenses.delete(confirmId), 10 * 60 * 1000);

    const keyboard = new InlineKeyboard()
      .text('Confirm', `expok:${confirmId}`)
      .text('Cancel', `expcancel:${confirmId}`);

    await ctx.reply(
      `<b>Receipt Detected</b>\n\n` +
      `Amount: <b>${expense.currency} ${expense.amount}</b>\n` +
      `Vendor: ${expense.vendor}\n` +
      `Category: ${expense.category}\n` +
      `Description: ${expense.description}\n\n` +
      `Log this expense?`,
      { parse_mode: 'HTML', reply_markup: keyboard },
    );
  } catch (error: any) {
    console.error('[photo] Error:', error.message);
    await ctx.reply(`Could not process receipt: ${error.message}`);
  }
}

/**
 * Handle expense confirmation/cancellation callbacks.
 */
export async function handleExpenseCallback(ctx: Context, data: string): Promise<void> {
  if (data.startsWith('expok:')) {
    const id = data.slice(6);
    const expense = pendingExpenses.get(id);
    if (!expense) {
      await ctx.reply('Expense expired. Please try again.');
      return;
    }
    pendingExpenses.delete(id);

    try {
      await logExpense(expense);
      await ctx.reply(
        `Logged: <b>${expense.currency} ${expense.amount}</b> — ${expense.vendor} [${expense.category}]`,
        { parse_mode: 'HTML' },
      );
    } catch (error: any) {
      await ctx.reply(`Could not log expense: ${error.message}`);
    }
  } else if (data.startsWith('expcancel:')) {
    const id = data.slice(10);
    pendingExpenses.delete(id);
    await ctx.reply('Expense cancelled.');
  }
}
