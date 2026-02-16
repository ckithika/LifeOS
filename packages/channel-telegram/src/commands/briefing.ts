/**
 * /briefing command — trigger daily briefing
 */

import type { Context } from 'grammy';
import { triggerBriefing } from '../services/agent-client.js';
import { toTelegramHTML, truncateForTelegram } from '../formatting.js';

export async function briefingCommand(ctx: Context): Promise<void> {
  await ctx.reply('⏳ Generating briefing...');

  const result = await triggerBriefing();

  if (result.error) {
    await ctx.reply(`❌ Briefing failed: ${result.error}`);
    return;
  }

  try {
    const data = JSON.parse(result.text);
    const sections = [
      data.sections?.calendar && `<b>📅 Calendar</b>\n${data.sections.calendar}`,
      data.sections?.tasks && `<b>✅ Tasks</b>\n${data.sections.tasks}`,
      data.sections?.emails && `<b>📧 Emails</b>\n${data.sections.emails}`,
    ].filter(Boolean);

    const message = sections.length > 0
      ? sections.join('\n\n')
      : `✅ Briefing generated for ${data.date || 'today'}`;

    await ctx.reply(truncateForTelegram(toTelegramHTML(message)), { parse_mode: 'HTML' });
  } catch {
    await ctx.reply(`✅ Briefing generated.`);
  }
}
