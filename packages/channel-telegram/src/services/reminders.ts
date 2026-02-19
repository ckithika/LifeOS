/**
 * Meeting reminder service
 *
 * Checks upcoming calendar events and sends Telegram alerts
 * for meetings starting in the next 15 minutes.
 */

import { getAllAccountClients } from '@lifeos/shared';
import { sendTelegramMessage } from '@lifeos/shared';
import type { ReminderCheck, UpcomingEvent } from '../types.js';
import { prepUpcomingMeetings } from './meeting-prep.js';

const REMINDER_WINDOW_MINUTES = 15;

/**
 * Check upcoming events and send reminders for those starting soon.
 */
export async function checkAndNotify(): Promise<ReminderCheck> {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) return { events: [], notified: 0 };

  const upcoming = await getUpcomingEvents();
  let notified = 0;

  for (const event of upcoming) {
    const text = formatReminder(event);
    const sent = await sendTelegramMessage(chatId, text, { parse_mode: 'HTML' });
    if (sent) notified++;
  }

  // Also check for upcoming meetings that need prep (30 min window)
  try {
    await prepUpcomingMeetings();
  } catch (error: any) {
    console.warn('[reminders] Meeting prep error:', error.message);
  }

  return { events: upcoming, notified };
}

async function getUpcomingEvents(): Promise<UpcomingEvent[]> {
  const events: UpcomingEvent[] = [];
  const now = new Date();
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_MINUTES * 60 * 1000);

  let allClients: Map<string, any>;
  try {
    allClients = getAllAccountClients();
  } catch {
    return events;
  }

  for (const [alias, clients] of allClients) {
    try {
      const response = await clients.calendar.events.list({
        calendarId: 'primary',
        timeMin: now.toISOString(),
        timeMax: windowEnd.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      });

      for (const event of response.data.items ?? []) {
        const start = event.start?.dateTime;
        if (!start) continue; // Skip all-day events

        const startTime = new Date(start);
        const minutesUntil = Math.round((startTime.getTime() - now.getTime()) / 60000);

        events.push({
          summary: event.summary ?? '(No title)',
          start,
          minutesUntil,
          account: alias,
        });
      }
    } catch (error: any) {
      console.warn(`[reminders] Calendar error for ${alias}:`, error.message);
    }
  }

  return events;
}

function formatReminder(event: UpcomingEvent): string {
  const time = new Date(event.start).toLocaleTimeString('en-KE', {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (event.minutesUntil <= 1) {
    return `🔔 <b>Starting now:</b> ${event.summary} (${time})`;
  }
  return `⏰ <b>In ${event.minutesUntil} min:</b> ${event.summary} (${time})`;
}
