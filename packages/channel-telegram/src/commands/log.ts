/**
 * /log command — habit and mood tracking
 *
 * Appends structured data to the ## Tracking section of today's daily note.
 * Usage: /log mood 8, /log workout gym 45min, /log water 2L
 */

import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { getDailyNote, writeFile } from '@lifeos/shared';

const VALID_CATEGORIES = ['mood', 'energy', 'sleep', 'workout', 'water', 'food', 'weight', 'custom'] as const;

export async function logCommand(ctx: Context): Promise<void> {
  const args = ctx.message?.text?.replace(/^\/log\s*/, '').trim();

  if (!args) {
    // Show category picker
    const keyboard = new InlineKeyboard()
      .text('Mood', 'log:mood')
      .text('Energy', 'log:energy')
      .row()
      .text('Sleep', 'log:sleep')
      .text('Workout', 'log:workout')
      .row()
      .text('Water', 'log:water')
      .text('Food', 'log:food')
      .row()
      .text('Weight', 'log:weight');

    await ctx.reply(
      '<b>Habit Tracker</b>\n\nUsage: <code>/log category value [details]</code>\n\nExamples:\n<code>/log mood 8</code>\n<code>/log workout gym 45min</code>\n<code>/log water 2L</code>\n\nOr tap a category below:',
      { parse_mode: 'HTML', reply_markup: keyboard },
    );
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

  try {
    const note = await getDailyNote();
    const now = new Date();
    const time = now.toLocaleTimeString('en-KE', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Africa/Nairobi',
    });
    const entry = `- [${category}] ${value} (${time})`;

    // Insert under ## Tracking section
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
    await ctx.reply(`Logged <b>${category}</b>: ${value}`, { parse_mode: 'HTML' });
  } catch (error: any) {
    console.error('[log] Error:', error.message);
    await ctx.reply(`Could not log: ${error.message}`);
  }
}
