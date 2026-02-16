/**
 * /help command — command reference
 */

import type { Context } from 'grammy';

const HELP_TEXT = `<b>LifeOS Bot Commands</b>

/briefing — Today's daily briefing
/tasks — Active tasks across accounts
/schedule — Today's calendar
/research &lt;topic&gt; — Quick research on a topic
/projects — Active projects list
/help — This message

<i>Or just type a message and I'll chat with you using Claude AI.</i>`;

export async function helpCommand(ctx: Context): Promise<void> {
  await ctx.reply(HELP_TEXT, { parse_mode: 'HTML' });
}
