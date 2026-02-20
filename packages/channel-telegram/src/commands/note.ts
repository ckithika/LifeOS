/**
 * Note command — quick capture to daily note
 * Called from button flow (session interception in message handler)
 *
 * Appends timestamped text to the ## Notes section of today's daily note.
 */

import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { getDailyNote, writeFile, formatTime } from '@lifeos/shared';

/** Button-flow handler — called from session interception */
export async function handleNoteInput(ctx: Context, text: string): Promise<void> {
  try {
    const note = await getDailyNote();
    const time = formatTime(new Date());
    const entry = `- ${time} — ${text}`;

    const sectionHeader = '## Notes';
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
      newContent = note.content.trimEnd() + '\n\n## Notes\n' + entry + '\n';
    }

    await writeFile(note.path, newContent, `lifeos: quick note ${note.date}`);

    await ctx.reply('Noted.', {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard()
        .text('← Vault', 'nav:vault')
        .text('← Menu', 'nav:main'),
    });
  } catch (error: any) {
    console.error('[note] Error:', error.message);
    await ctx.reply(`Could not save note: ${error.message}`);
  }
}
