/**
 * Log command — habit and mood tracking
 * Called from button flow (session interception in message handler)
 *
 * Appends structured data to the ## Tracking section of today's daily note.
 */

import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { getDailyNote, writeFile, formatTime } from '@lifeos/shared';

/** Button-flow handler — called from session interception */
export async function handleLogValueInput(ctx: Context, value: string, category: string): Promise<void> {
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

    await ctx.reply(`Logged <b>${category}</b>: ${value}`, {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard()
        .text('← Track', 'nav:track')
        .text('← Menu', 'nav:main'),
    });
  } catch (error: any) {
    console.error('[log] Error:', error.message);
    await ctx.reply(`Could not log: ${error.message}`);
  }
}
