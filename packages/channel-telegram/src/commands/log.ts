/**
 * /log command — habit and mood tracking
 *
 * Appends structured data to the ## Tracking section of today's daily note.
 * Usage: /log mood 8, /log workout gym 45min, /log water 2L
 */

import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { getDailyNote, writeFile, formatTime } from '@lifeos/shared';
import { buildLogCategoryMenu, LOG_CATEGORY_TEXT } from '../menus.js';

const VALID_CATEGORIES = ['mood', 'energy', 'sleep', 'workout', 'water', 'food', 'weight', 'custom'] as const;

export async function logCommand(ctx: Context): Promise<void> {
  const args = ctx.message?.text?.replace(/^\/log\s*/, '').trim();

  if (!args) {
    await ctx.reply(LOG_CATEGORY_TEXT, {
      parse_mode: 'HTML',
      reply_markup: buildLogCategoryMenu(),
    });
    return;
  }

  const parts = args.split(/\s+/);
  const category = parts[0].toLowerCase();
  const value = parts.slice(1).join(' ') || '(no value)';

  if (!VALID_CATEGORIES.includes(category as any) && category !== 'custom') {
    await ctx.reply(
      `Unknown category "<b>${category}</b>".\n\nValid: ${VALID_CATEGORIES.join(', ')}`,
      { parse_mode: 'HTML' },
    );
    return;
  }

  await saveLog(ctx, category, value);
}

/** Button-flow handler — called from session interception */
export async function handleLogValueInput(ctx: Context, value: string, category: string): Promise<void> {
  await saveLog(ctx, category, value, true);
}

async function saveLog(ctx: Context, category: string, value: string, showNav = false): Promise<void> {
  try {
    const note = await getDailyNote();
    const time = formatTime(new Date());
    const entry = `- [${category}] ${value} (${time})`;

    const sectionHeader = '## Tracking';
    const sectionIndex = note.content.indexOf(sectionHeader);
    let newContent: string;

    if (sectionIndex !== -1) {
      const afterSection = note.content.indexOf('\n## ', sectionIndex + sectionHeader.length);
      const insertPoint = afterSection !== -1 ? afterSection : note.content.length;
      newContent =
        note.content.slice(0, insertPoint).trimEnd() +
        '\n' + entry + '\n' +
        (afterSection !== -1 ? '\n' + note.content.slice(insertPoint).trimStart() : '');
    } else {
      newContent = note.content.trimEnd() + '\n\n## Tracking\n' + entry + '\n';
    }

    await writeFile(note.path, newContent, `lifeos: log ${category} ${note.date}`);

    const opts: any = { parse_mode: 'HTML' };
    if (showNav) {
      opts.reply_markup = new InlineKeyboard()
        .text('← Track', 'nav:track')
        .text('← Menu', 'nav:main');
    }
    await ctx.reply(`Logged <b>${category}</b>: ${value}`, opts);
  } catch (error: any) {
    console.error('[log] Error:', error.message);
    await ctx.reply(`Could not log: ${error.message}`);
  }
}
