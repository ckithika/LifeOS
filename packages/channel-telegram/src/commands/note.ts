/**
 * /note command — quick capture to daily note
 *
 * Appends timestamped text to the ## Notes section of today's daily note.
 */

import type { Context } from 'grammy';
import { getDailyNote, writeFile } from '@lifeos/shared';

export async function noteCommand(ctx: Context): Promise<void> {
  const text = ctx.message?.text?.replace(/^\/note\s*/, '').trim();

  if (!text) {
    await ctx.reply(
      '<b>Quick Capture</b>\n\nUsage: <code>/note your text here</code>\n\nAppends a timestamped note to today\'s daily note.',
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
    const entry = `- ${time} — ${text}`;

    // Insert under ## Notes section
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
    await ctx.reply(`Noted.`, { parse_mode: 'HTML' });
  } catch (error: any) {
    console.error('[note] Error:', error.message);
    await ctx.reply(`Could not save note: ${error.message}`);
  }
}
