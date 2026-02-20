/**
 * /schedule command — today's calendar with Join/View buttons
 */

import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { getAllAccountClients, formatTime, getUtcOffset } from '@lifeos/shared';
import type { CalendarEvent } from '@lifeos/shared';

export async function scheduleCommand(ctx: Context): Promise<void> {
  await ctx.reply('Fetching schedule...');

  const today = new Date().toISOString().split('T')[0];
  const events: CalendarEvent[] = [];

  let allClients: Map<string, any>;
  try {
    allClients = getAllAccountClients();
  } catch (error: any) {
    await ctx.reply(`Could not load accounts: ${error.message}`);
    return;
  }

  for (const [alias, clients] of allClients) {
    try {
      const response = await clients.calendar.events.list({
        calendarId: 'primary',
        timeMin: `${today}T00:00:00${getUtcOffset()}`,
        timeMax: `${today}T23:59:59${getUtcOffset()}`,
        singleEvents: true,
        orderBy: 'startTime',
      });

      for (const event of response.data.items ?? []) {
        events.push({
          id: event.id ?? '',
          summary: event.summary ?? '(No title)',
          start: event.start?.dateTime ?? event.start?.date ?? '',
          end: event.end?.dateTime ?? event.end?.date ?? '',
          location: event.location ?? undefined,
          status: event.status ?? 'confirmed',
          account: alias,
          calendarId: 'primary',
          htmlLink: event.htmlLink ?? undefined,
        });
      }
    } catch (error: any) {
      console.warn(`[schedule] Calendar error for ${alias}:`, error.message);
    }
  }

  if (events.length === 0) {
    await ctx.reply('No events scheduled for today!', {
      reply_markup: new InlineKeyboard()
        .text('🔄 Refresh', 'ref:schedule')
        .text('← Menu', 'nav:main'),
    });
    return;
  }

  events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const lines = events.map((e, i) => {
    const start = new Date(e.start);
    const time = e.start.includes('T')
      ? formatTime(start)
      : 'All day';
    const location = e.location ? `\n   ${e.location}` : '';
    return `${i + 1}. ${time} — <b>${e.summary}</b> <i>[${e.account}]</i>${location}`;
  });

  const keyboard = new InlineKeyboard();
  for (const [i, event] of events.entries()) {
    const meetUrl = extractMeetUrl(event.location);
    if (meetUrl) {
      keyboard.url(`Join ${i + 1}`, meetUrl);
    } else if (event.htmlLink) {
      keyboard.url(`View ${i + 1}`, event.htmlLink);
    }
    if ((i + 1) % 2 === 0) keyboard.row();
  }
  keyboard.row().text('🔄 Refresh', 'ref:schedule').text('← Menu', 'nav:main');

  const header = `<b>Today's Schedule (${events.length} events)</b>\n\n`;
  await ctx.reply(header + lines.join('\n\n'), {
    parse_mode: 'HTML',
    reply_markup: keyboard,
  });
}

function extractMeetUrl(location?: string): string | undefined {
  if (!location) return undefined;
  const match = location.match(/https:\/\/meet\.google\.com\/[a-z\-]+/i);
  return match?.[0];
}
